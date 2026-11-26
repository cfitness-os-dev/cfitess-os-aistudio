"""Local-only scheduled RH recipe; clean environment, fictitious accounts, internal notifications only."""
import json, os, secrets, socket, subprocess, tempfile, time, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

def main():
    binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    checks=[]
    with tempfile.TemporaryDirectory(prefix='rh-schedules-',dir=os.environ['TMPDIR']) as folder:
        env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'TMPDIR':os.environ['TMPDIR'],
            'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1',
            'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':folder,
            'CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0',
            'CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0',
            'CFITNESS_RH_SCHEDULER':'1','HEITZ_WS_URL':'http://127.0.0.1:9',
            'OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
        def call(method,path,token=None,body=None):
            headers={'Content-Type':'application/json'}
            if token:headers['Authorization']='Bearer '+token
            req=urllib.request.Request(base+path,method=method,headers=headers,
                data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
            except urllib.error.HTTPError as e:return e.code,None
        def start():
            proc=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return proc
                except OSError:pass
                time.sleep(.05)
            proc.terminate();proc.wait(timeout=5);raise RuntimeError('Local server unavailable')
        def login(who,pin):
            code,v=call('POST','/api/auth/login',body={'emailOrId':who,'pinOrPassword':pin})
            assert code==200;return v['sessionToken']
        def command(**patch):
            return {'operationId':secrets.token_hex(16),'subject':'Consigne fictive différée',
                'body':'Vérifier les procédures avant cours','recipientIds':['emp-chloe'],
                'scheduledAt':(datetime.now(timezone.utc)+timedelta(minutes=3)).isoformat(),**patch}
        path='/api/hr/communications/beynost/scheduled'
        proc=start()
        try:
            admin=login('emp-mario','1010');employee=login('emp-chloe','5320');other=login('emp-daniel','2020')
            assert call('GET',path)[0]==401 and call('GET',path,employee)[0]==403
            assert call('POST',path,employee,command())[0]==403
            assert call('POST',path,admin,command(recipientIds=['emp-sarah']))[0]==403
            checks.append('session, profile and club recipient isolation')
            for patch in [{'scheduledAt':'invalid'},{'scheduledAt':datetime.now(timezone.utc).isoformat()},
                          {'scheduledAt':(datetime.now(timezone.utc)+timedelta(days=367)).isoformat()},
                          {'subject':''},{'unknown':'rejected'}]:
                assert call('POST',path,admin,command(**patch))[0] in (400,422)
            checks.append('strict body, date and publication validation')
            payload=command()
            status,result=call('POST',path,admin,payload);assert status==200
            cancel_id=result['scheduledMessageId']
            assert call('POST',path,admin,payload)[1]['scheduledMessageId']==cancel_id
            assert call('POST',path,admin,{**payload,'subject':'Changed'})[0]==409
            assert call('POST','/api/hr/communications/beynost',admin,{k:v for k,v in payload.items() if k!='scheduledAt'})[0]==409
            assert not call('GET','/api/hr/communications/beynost',admin)[1]['messages']
            checks.append('idempotent scheduling without early delivery or immediate-publication reuse')
            assert call('POST',path+'/'+cancel_id+'/cancel',other,{})[0]==404
            assert call('POST','/api/hr/communications/carre-de-soie/scheduled/'+cancel_id+'/cancel',admin,{})[0]==404
            blocker=Path(folder,'cfitness_state.json.tmp');blocker.mkdir()
            before=Path(folder,'cfitness_state.json').read_bytes()
            assert call('POST',path+'/'+cancel_id+'/cancel',admin,{})[0]==500
            assert call('POST',path,admin,command())[0]==500
            assert Path(folder,'cfitness_state.json').read_bytes()==before
            assert call('GET',path,admin)[1]['scheduledMessages'][0]['status']=='scheduled'
            blocker.rmdir()
            assert call('POST',path+'/'+cancel_id+'/cancel',admin,{})[0]==200
            assert call('POST',path+'/'+cancel_id+'/cancel',admin,{})[0]==200
            checks.append('owned cancellation and write failure without false confirmation or partial state')
            due=datetime.now(timezone.utc)+timedelta(seconds=63)
            payload=command(scheduledAt=due.isoformat())
            status,result=call('POST',path,admin,payload);assert status==200
            due_id=result['scheduledMessageId']
            proc.terminate();proc.wait(timeout=5);proc=start()
            admin=login('emp-mario','1010');employee=login('emp-chloe','5320')
            assert any(r['id']==due_id and r['status']=='scheduled' for r in call('GET',path,admin)[1]['scheduledMessages'])
            # Let a real server clock and the real 15 s worker deliver. No private trigger endpoint.
            deadline=time.monotonic()+85
            while time.monotonic()<deadline:
                rows=call('GET',path,admin)[1]['scheduledMessages']
                row=next(r for r in rows if r['id']==due_id)
                if row['status']=='published':break
                time.sleep(1)
            else:raise AssertionError('Scheduled worker did not publish')
            assert datetime.now(timezone.utc)>=due
            message_id=row['publishedMessageId']
            assert row['finishedAt'] and message_id
            own=call('GET','/api/me/notifications/beynost',employee)[1]
            assert sum(n.get('rhMessageId')==message_id for n in own['notifications'])==1
            assert not any(n.get('rhMessageId')==message_id for n in call('GET','/api/me/notifications/beynost',admin)[1]['notifications'])
            assert call('POST',path+'/'+due_id+'/cancel',admin,{})[0]==409
            checks.append('real server worker publishes once after deadline and restart to the correct recipient')
            proc.terminate();proc.wait(timeout=5);proc=start()
            admin=login('emp-mario','1010')
            rows=call('GET',path,admin)[1]['scheduledMessages']
            assert next(r for r in rows if r['id']==cancel_id)['status']=='cancelled'
            assert next(r for r in rows if r['id']==due_id)['publishedMessageId']==message_id
            assert len(call('GET','/api/hr/communications/beynost',admin)[1]['messages'])==1
            checks.append('published and cancelled history persisted after second restart without duplicate')
        finally:
            proc.terminate();proc.wait(timeout=5)
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
