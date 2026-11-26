"""Actual server + signed archive + new offline destination + restarted server. Synthetic data only."""
import base64,json,os,secrets,socket,subprocess,sys,tempfile,time,urllib.error,urllib.request
from pathlib import Path
def main():
    binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve());checks=[]
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}';pdf=b'%PDF-1.4\nArchive fictive\n%%EOF\n'
    with tempfile.TemporaryDirectory(prefix='rh-archive-http-',dir=os.environ['TMPDIR']) as folder:
        root=Path(folder);source=root/'source';source.mkdir()
        env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'TMPDIR':os.environ['TMPDIR'],
            'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1',
            'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0',
            'CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0','CFITNESS_RH_SCHEDULER':'0',
            'HEITZ_WS_URL':'http://127.0.0.1:9','OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
        def call(method,path,token=None,body=None,raw=False):
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            req=urllib.request.Request(base+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req,timeout=5) as r:
                    data=r.read();return r.status,data if raw else json.loads(data)
            except urllib.error.HTTPError as e:return e.code,None
        def start(data):
            p=subprocess.Popen([binary],env={**env,'CFITNESS_DATA_DIR':str(data)},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return p
                except OSError:pass
                time.sleep(.05)
            p.terminate();p.wait(timeout=5);raise RuntimeError('Local server unavailable')
        def login(who,key):
            code,v=call('POST','/api/auth/login',body={'emailOrId':who,'pinOrPassword':os.environ[key]});assert code==200;return v['sessionToken']
        key=secrets.token_hex(32)
        cli_env={'PATH':env['PATH'],'TMPDIR':env['TMPDIR'],'RH_ARCHIVE_TEST_KEY':key}
        def cli(*args,expected=0):
            p=subprocess.run([sys.executable,str(Path(__file__).with_name('rh_documents_archive.py')),*args],env=cli_env,text=True,capture_output=True,timeout=15)
            assert p.returncode==expected,('archive command',p.returncode,p.stderr)
            return json.loads(p.stdout) if p.stdout else None
        proc=start(source)
        try:
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET');owner=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            code,old=call('GET','/api/admin/backup',admin);assert code==200
            payload={'employeeId':'emp-chloe','operationId':secrets.token_hex(16),'title':'Archive fictive','category':'Autre',
                'fileName':'archive.pdf','mediaType':'application/pdf','base64':base64.b64encode(pdf).decode()}
            code,v=call('POST','/api/hr/documents/beynost',admin,payload);assert code==200;doc_id=v['documentId']
            assert call('POST','/api/me/documents/beynost/'+doc_id+'/ack',owner,{'consent':True})[0]==200
            before=(source/'cfitness_state.json').read_bytes()
            code,status=call('GET','/api/backup/snapshot',admin)
            assert code==200 and status['isSimulation'] is True and status['failoverReady'] is False
            code,simulation=call('POST','/api/backup/snapshot',admin,{'originDevice':'recette locale fictive','checksum':'not-verified'})
            assert code==200 and simulation['simulated'] is True and simulation['checksumVerified'] is False
            assert (source/'cfitness_state.json').read_bytes()==before
            checks.append('Antigravity replica preview reports simulation, no verified checksum or ready failover, and performs no state merge')
            assert call('GET','/api/admin/backup')[0]==401 and call('GET','/api/admin/backup',owner)[0]==403
            assert call('GET','/api/admin/backup',admin)[0]==409
            assert call('POST','/api/admin/restore',admin,{'backupJson':old['backupJson']})[0]==409
            assert (source/'cfitness_state.json').read_bytes()==before
            checks.append('legacy JSON backup/restore refuse incomplete private-document coverage without mutation; auth still enforced')
            archive=root/'backup.cfos-rh.zip'
            assert cli('create','--source',str(source),'--archive',str(archive),'--key-env','RH_ARCHIVE_TEST_KEY')['signed']
            assert cli('verify','--archive',str(archive),'--key-env','RH_ARCHIVE_TEST_KEY')['verified']
            assert (source/'cfitness_state.json').read_bytes()==before
            checks.append('signed archive captures live consistent state and immutable document bytes without changing source')
            cli('verify','--archive',str(archive),expected=1)
            destination=root/'restored'
            result=cli('restore','--archive',str(archive),'--destination',str(destination),'--key-env','RH_ARCHIVE_TEST_KEY')
            assert result['restored'] and result['newDirectoryOnly']
            assert (destination/'cfitness_state.json').read_bytes()==before
            assert (destination/'rh-documents'/doc_id).read_bytes()==pdf
            cli('restore','--archive',str(archive),'--destination',str(destination),'--key-env','RH_ARCHIVE_TEST_KEY',expected=1)
            checks.append('signature required; exact bytes restored to exclusive new directory; existing destination protected')
            proc.terminate();proc.wait(timeout=5);proc=start(destination)
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET');owner=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            docs=call('GET','/api/me/documents/beynost',owner)[1]['documents']
            assert len(docs)==1 and docs[0]['id']==doc_id and docs[0]['acknowledgedAt']
            assert call('GET','/api/hr/documents/beynost/'+doc_id+'/file',owner,raw=True)[1]==pdf
            checks.append('actual backend starts on restored data; identity, private file and consultation timestamp are readable')
            (destination/'rh-documents'/'orphan-fictif').write_bytes(b'owned test orphan')
            result=cli('inspect','--source',str(destination))
            assert result['verified'] and result['unreferencedEntries']==1
            assert (destination/'rh-documents'/'orphan-fictif').read_bytes()==b'owned test orphan'
            checks.append('source inspection detects an unreferenced file without deleting it')
        finally:proc.terminate();proc.wait(timeout=5)
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
