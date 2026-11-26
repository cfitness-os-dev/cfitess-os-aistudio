"""Isolated private RH-file recipe. No real people, provider calls or inherited provider secrets."""
import base64,json,os,secrets,socket,subprocess,tempfile,time,urllib.error,urllib.request
from pathlib import Path
def main():
    binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve());checks=[]
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}';pdf=b'%PDF-1.4\nFichier de recette fictif\n%%EOF\n'
    with tempfile.TemporaryDirectory(prefix='rh-documents-http-',dir=os.environ['TMPDIR']) as folder:
        env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'TMPDIR':os.environ['TMPDIR'],
            'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1',
            'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':folder,
            'CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0','CFITNESS_AUTOMATION_SCHEDULER':'0',
            'CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0','CFITNESS_RH_SCHEDULER':'0',
            'HEITZ_WS_URL':'http://127.0.0.1:9','OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
        def call(method,path,token=None,body=None,raw=False):
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            req=urllib.request.Request(base+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req,timeout=5) as r:
                    data=r.read();return r.status,(data if raw else json.loads(data)),r.headers
            except urllib.error.HTTPError as e:return e.code,None,e.headers
        def start():
            p=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return p
                except OSError:pass
                time.sleep(.05)
            p.terminate();p.wait(timeout=5);raise RuntimeError('Local server unavailable')
        def login(who,key):
            code,v,_=call('POST','/api/auth/login',body={'emailOrId':who,'pinOrPassword':os.environ[key]});assert code==200;return v['sessionToken']
        def command(who,**patch):return {'employeeId':who,'operationId':secrets.token_hex(16),'title':'Notice fictive',
            'category':'Autre','fileName':'notice.pdf','mediaType':'application/pdf','base64':base64.b64encode(pdf).decode(),**patch}
        proc=start();documents={}
        try:
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            owners={'beynost':('emp-chloe',login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')),
                'carre-de-soie':('emp-maxime',login('emp-maxime','CFITNESS_TEST_MAXIME_SECRET'))}
            for club,(who,token) in owners.items():
                path='/api/hr/documents/'+club;own='/api/me/documents/'+club
                assert call('GET',own)[0]==401 and call('GET',path,token)[0]==403
                assert call('POST',path,token,command('emp-mario'))[0]==403
                payload=command(who);code,v,_=call('POST',path,admin,payload);assert code==200
                doc_id=v['documentId'];documents[club]=doc_id
                assert call('POST',path,admin,payload)[1]['documentId']==doc_id
                assert call('POST',path,admin,{**payload,'title':'Changed'})[0]==409
                own_files=call('GET',own,token)[1]['documents']
                assert len(own_files)==1 and own_files[0]['id']==doc_id and own_files[0]['employeeId']==who
                code,data,h=call('GET',path+'/'+doc_id+'/file',token,raw=True)
                assert code==200 and data==pdf and h['Cache-Control']=='private, no-store' and h['X-Content-Type-Options']=='nosniff'
                assert call('GET',path+'/'+doc_id+'/file')[0]==401
                assert call('POST',path+'/'+doc_id+'/archive',token,{'archived':True})[0]==404
                assert call('POST',own+'/'+doc_id+'/ack',admin,{'consent':True})[0]==404
                assert call('POST',own+'/'+doc_id+'/ack',token,{'consent':False})[0]==400
                assert call('POST',own+'/'+doc_id+'/ack',token,{'consent':True})[0]==200
                acknowledged=call('GET',own,token)[1]['documents'][0]['acknowledgedAt'];assert acknowledged
                assert call('POST',own+'/'+doc_id+'/ack',token,{'consent':True})[1]['documents'][0]['acknowledgedAt']==acknowledged
                assert call('POST',path+'/'+doc_id+'/archive',admin,{'archived':True})[0]==200
                assert call('GET',own,token)[1]['documents']==[] and call('GET',path+'/'+doc_id+'/file',token)[0]==404
                assert call('GET',path+'?includeArchived=true',admin)[1]['documents'][0]['archivedAt']
                assert call('POST',path+'/'+doc_id+'/archive',admin,{'archived':False})[0]==200
                assert call('GET',path+'/'+doc_id+'/file',token,raw=True)[1]==pdf
                checks.append(club+': manager deposit, own receipt/download, explicit acknowledgement, reversible manager archive')
            assert call('GET','/api/hr/documents/beynost/'+documents['carre-de-soie']+'/file',admin)[0]==404
            assert call('GET','/api/me/documents/carre-de-soie',owners['beynost'][1])[0]==403
            checks.append('cross-club file and personal listing are refused')
            path='/api/hr/documents/beynost'
            for patch in [{'mediaType':'text/html'},{'fileName':'../notice.pdf'},{'category':'Unknown'},
                    {'base64':'invalid'},{'base64':base64.b64encode(b'x'*(4*1024*1024+1)).decode()}]:
                assert call('POST',path,admin,command('emp-chloe',**patch))[0]==400
            assert call('POST',path,admin,command('emp-chloe',base64='x'*(6*1024*1024)))[0]==413
            checks.append('file type, path, content size and HTTP body size are bounded')
            state_path=Path(folder,'cfitness_state.json');before=state_path.read_bytes()
            blob_count=len(list(Path(folder,'rh-documents').iterdir()));blocker=Path(folder,'cfitness_state.json.tmp');blocker.mkdir()
            assert call('POST',path,admin,command('emp-chloe'))[0]==500
            assert state_path.read_bytes()==before and len(list(Path(folder,'rh-documents').iterdir()))==blob_count
            blocker.rmdir();checks.append('failed metadata persistence removes only new file and keeps state unchanged')
            proc.terminate();proc.wait(timeout=5);proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            chloe=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET');doc_id=documents['beynost']
            assert call('GET',path+'/'+doc_id+'/file',chloe,raw=True)[1]==pdf
            assert call('GET','/api/me/documents/beynost',chloe)[1]['documents'][0]['acknowledgedAt']
            notifications=call('GET','/api/me/notifications/beynost',chloe)[1]['notifications']
            assert any(n.get('type')=='rh_document' and n.get('targetPage')=='documents' for n in notifications)
            checks.append('metadata, private bytes, acknowledgement and internal notification survive restart')
            private_file=Path(folder,'rh-documents',doc_id);original=private_file.read_bytes();private_file.write_bytes(b'changed')
            assert call('GET',path+'/'+doc_id+'/file',chloe)[0]==503
            private_file.write_bytes(original)
            checks.append('tampered bytes are refused instead of returning false content')
        finally:proc.terminate();proc.wait(timeout=5)
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
