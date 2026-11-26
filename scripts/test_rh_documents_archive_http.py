"""Actual server + signed archive + new offline destination + restarted server. Synthetic data only."""
import base64,hashlib,json,os,secrets,socket,struct,subprocess,sys,tempfile,time,urllib.error,urllib.request,zlib
from pathlib import Path
def main():
    binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve());checks=[]
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}';pdf=b'%PDF-1.4\nArchive fictive\n%%EOF\n'
    with tempfile.TemporaryDirectory(prefix='rh-archive-http-',dir=os.environ['TMPDIR']) as folder:
        root=Path(folder);source=root/'source';source.mkdir()
        env={**os.environ,'TMPDIR':os.environ['TMPDIR'],
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
        cli_env={**os.environ,'TMPDIR':env['TMPDIR'],'RH_ARCHIVE_TEST_KEY':key}
        def cli(*args,expected=0):
            p=subprocess.run([sys.executable,str(Path(__file__).with_name('rh_documents_archive.py')),*args],env=cli_env,text=True,capture_output=True,timeout=15)
            assert p.returncode==expected,('archive command',p.returncode,p.stderr)
            return json.loads(p.stdout) if p.stdout else None
        proc=start(source)
        try:
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET');owner=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            code,old=call('GET','/api/admin/backup',admin);assert code==200
            # Offline fixture injection into this newly created synthetic state only.
            proc.terminate();proc.wait(timeout=5)
            def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
            png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\x00\x00\x00'))+chunk(b'IEND',b'')
            synthetic=[]
            for number,site,employee in [(901,'club-beynost','emp-chloe'),(902,'club-carre-soie','emp-maxime')]:
                row={'id':f'photo-{number}','siteId':site,'terminalId':'fixture-terminal','employeeId':employee,
                    'contentType':'image/png','fileName':f'photo-{number}.png','byteSize':len(png),'sha256Hex':hashlib.sha256(png).hexdigest(),
                    'capturedAt':'2026-11-26T10:00:00Z','expiresAt':'2099-01-01T00:00:00Z',
                    'consumedAt':'2026-11-26T10:01:00Z' if number==902 else None,
                    'consumedByEntryId':'fixture-entry' if number==902 else None}
                folder=source/'punch_photos'/site;folder.mkdir(parents=True,exist_ok=True);(folder/row['fileName']).write_bytes(png);synthetic.append(row)
            state_path=source/'cfitness_state.json';state=json.loads(state_path.read_text());state['punchPhotos']=synthetic;state_path.write_text(json.dumps(state))
            photo_state=state_path.read_bytes();proc=start(source)
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET');owner=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            manager=login('emp-sarah','CFITNESS_TEST_MANAGER_SECRET')
            assert call('GET','/api/admin/backup',admin)[0]==409
            assert call('POST','/api/admin/restore',admin,{'backupJson':old['backupJson']})[0]==409
            assert state_path.read_bytes()==photo_state
            for row in synthetic:
                route='/api/hr/punch-photos/'+row['siteId']+'/'+row['id']
                assert call('GET',route,admin,raw=True)==(200,png)
                assert call('GET',route,owner)[0]==403 and call('GET',route,manager)[0]==403
            assert call('GET','/api/hr/punch-photos/club-beynost/photo-902',admin)[0]==404
            checks.append('photo-only state refuses legacy JSON backup/restore; owner reads both clubs, employee/manager forbidden, wrong club 404')
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
            verification=cli('verify','--archive',str(archive),'--key-env','RH_ARCHIVE_TEST_KEY');assert verification['verified'] and verification['photos']==2
            assert (source/'cfitness_state.json').read_bytes()==before
            checks.append('signed archive captures live consistent state and immutable document bytes without changing source')
            cli('verify','--archive',str(archive),expected=1)
            destination=root/'restored'
            result=cli('restore','--archive',str(archive),'--destination',str(destination),'--key-env','RH_ARCHIVE_TEST_KEY')
            assert result['restored'] and result['newDirectoryOnly']
            assert (destination/'cfitness_state.json').read_bytes()==before
            assert (destination/'rh-documents'/doc_id).read_bytes()==pdf
            for row in synthetic:assert (destination/'punch_photos'/row['siteId']/row['fileName']).read_bytes()==png
            assert json.loads((destination/'cfitness_state.json').read_text())['punchPhotos']==synthetic
            cli('restore','--archive',str(archive),'--destination',str(destination),'--key-env','RH_ARCHIVE_TEST_KEY',expected=1)
            checks.append('signature required; exact bytes restored to exclusive new directory; existing destination protected')
            proc.terminate();proc.wait(timeout=5);proc=start(destination)
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET');owner=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            docs=call('GET','/api/me/documents/beynost',owner)[1]['documents']
            assert len(docs)==1 and docs[0]['id']==doc_id and docs[0]['acknowledgedAt']
            assert call('GET','/api/hr/documents/beynost/'+doc_id+'/file',owner,raw=True)[1]==pdf
            checks.append('actual backend starts on restored data; identity, private file and consultation timestamp are readable')
            for row in synthetic:
                route='/api/hr/punch-photos/'+row['siteId']+'/'+row['id']
                assert call('GET',route,admin,raw=True)==(200,png)
                assert call('GET',route,owner)[0]==403
            photo_file=destination/'punch_photos'/synthetic[0]['siteId']/synthetic[0]['fileName']
            photo_file.write_bytes(png[:-1]+bytes([png[-1]^1]))
            assert call('GET','/api/hr/punch-photos/club-beynost/photo-901',admin)[0]==409
            photo_file.write_bytes(png+b'extra')
            assert call('GET','/api/hr/punch-photos/club-beynost/photo-901',admin)[0]==409
            photo_file.write_bytes(png)
            checks.append('restored private photos retain exact metadata; same-size SHA tamper and size mismatch refused at read, no camera used')
            (destination/'rh-documents'/'orphan-fictif').write_bytes(b'owned test orphan')
            result=cli('inspect','--source',str(destination))
            assert result['verified'] and result['unreferencedEntries']==1 and result['photos']==2
            assert (destination/'rh-documents'/'orphan-fictif').read_bytes()==b'owned test orphan'
            checks.append('source inspection detects an unreferenced file without deleting it')
        finally:proc.terminate();proc.wait(timeout=5)
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
