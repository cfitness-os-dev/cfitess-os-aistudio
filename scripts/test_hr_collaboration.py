"""Isolated HTTP recipe. No provider credentials inherited; no real external calls."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

def main():
    binary = str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    checks = []
    with tempfile.TemporaryDirectory(prefix='rh-collaboration-', dir=os.environ['TMPDIR']) as folder:
        env = {**os.environ, 'TMPDIR':os.environ['TMPDIR'],
               'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1',
               'CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':folder,
               'CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0',
               'CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0',
               'HEITZ_WS_URL':'http://127.0.0.1:9','OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
        def call(method, path, token=None, body=None):
            headers={'Content-Type':'application/json'}
            if token: headers['Authorization']='Bearer '+token
            request=urllib.request.Request(base+path, method=method, headers=headers, data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(request,timeout=5) as reply:
                    raw=reply.read(); return reply.status, (raw.decode() if 'text/calendar' in reply.headers.get('Content-Type','') else json.loads(raw)), reply.headers
            except urllib.error.HTTPError as error:
                return error.code, None, error.headers
        def start():
            proc=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return proc
                except OSError: pass
                time.sleep(.05)
            proc.terminate();proc.wait(timeout=5);raise RuntimeError('Local server unavailable')
        def login(actor,secret):
            code,value,_=call('POST','/api/auth/login',body={'emailOrId':actor,'pinOrPassword':secret})
            assert code==200, ('fictional login',code);return value['sessionToken']
        proc=start()
        try:
            admin=login('emp-mario','1010');employee=login('emp-chloe','5320')
            path='/api/hr/communications/beynost'; own='/api/me/workspace/beynost'
            assert call('GET',path)[0]==401
            assert call('GET',path,employee)[0]==403
            assert call('GET','/api/hr/communications/unknown',admin)[0]==400
            checks.append('session and club-specific manager permissions')
            audience=call('GET',path,admin)[1]['recipients']
            assert audience and all(isinstance(r.get('fileStatus'),str) and isinstance(r.get('teams'),list) and all(set(t)=={'id','name'} for t in r['teams']) for r in audience)
            checks.append('authorized recipient team and file-status metadata available for audience filters')
            command={'operationId':secrets.token_hex(16),'subject':'Recette HTTP fictive','body':'Message interne persistant','recipientIds':['emp-chloe']}
            code,published,_=call('POST',path,admin,command);assert code==200
            message_id=published['publishedMessageId']
            assert call('POST',path,admin,command)[1]['publishedMessageId']==message_id
            assert len(call('GET',path,admin)[1]['messages'])==1
            checks.append('publication and retry without duplicates')
            assert call('POST',path,admin,{**command,'body':'changed'})[0]==409
            assert call('POST',path,admin,{**command,'operationId':secrets.token_hex(16),'recipientIds':['emp-chloe','unknown']})[0]==403
            checks.append('conflicting retry and unauthorized recipient rejected')
            notifications=call('GET',own,employee)[1]['notifications']
            assert any(n.get('rhMessageId')==message_id for n in notifications)
            assert not any(n.get('rhMessageId')==message_id for n in call('GET',own,admin)[1]['notifications'])
            assert call('POST',own,admin,{'action':'read_notification','id':message_id})[0]==404
            assert call('POST',own,employee,{'action':'read_notification','id':message_id})[0]==200
            receipt=call('GET',path,admin)[1]['messages'][0]['receipts'][0]
            assert receipt['read'] and receipt['readAt']
            checks.append('recipient isolation and persistent first read receipt')
            assert call('POST','/api/me/calendar-link',employee,{'clubIds':['carre-de-soie']})[0]==403
            code,link,_=call('POST','/api/me/calendar-link',employee,{'clubIds':['beynost']});assert code==200
            old=link['relativeUrl']
            code,ics,headers=call('GET',old);assert code==200 and ics.startswith('BEGIN:VCALENDAR\r\n')
            assert headers['Cache-Control']=='private, no-store'
            assert headers['Referrer-Policy']=='no-referrer'
            assert all(len(line.encode())<=75 for line in ics.split('\r\n'))
            assert call('GET','/api/calendar/cal-emp-chloe.ics')[0]==404
            assert old.rsplit('/',1)[1][:-4] not in Path(folder,'cfitness_state.json').read_text()
            checks.append('private calendar, valid content lines, hashed token, unauthorized club rejected')
            proc.terminate();proc.wait(timeout=5);proc=start()
            admin=login('emp-mario','1010');employee=login('emp-chloe','5320')
            assert call('GET',path,admin)[1]['messages'][0]['receipts'][0]==receipt
            assert call('GET',old)[0]==200
            checks.append('messages, read receipt and calendar survive server restart')
            new=call('POST','/api/me/calendar-link',employee,{'clubIds':['beynost']})[1]['relativeUrl']
            assert call('GET',old)[0]==404 and call('GET',new)[0]==200
            checks.append('renewal immediately invalidates old calendar')
            assert call('POST','/api/me/calendar-token/revoke',employee,{})[0]==200
            assert call('GET',new)[0]==404
            assert call('GET','/api/me/calendar-link',employee)[1]['issued'] is False
            checks.append('explicit revocation disables active link')
            newer=call('POST','/api/me/calendar-link',employee,{'clubIds':['beynost']})[1]['relativeUrl']
            assert call('PUT','/api/me/preferences',employee,{'calendarFeedEnabled':False})[0]==200
            assert call('GET',newer)[0]==404
            assert call('POST','/api/me/calendar-link',employee,{'clubIds':['beynost']})[0]==403
            assert call('PUT','/api/me/preferences',employee,{'calendarFeedEnabled':True})[0]==200
            assert call('GET',newer)[0]==404
            checks.append('disable/re-enable never resurrects old token')
            blocker=Path(folder,'cfitness_state.json.tmp');blocker.mkdir()
            before=Path(folder,'cfitness_state.json').read_bytes()
            failed={**command,'operationId':secrets.token_hex(16)}
            assert call('POST',path,admin,failed)[0]==500
            assert len(call('GET',path,admin)[1]['messages'])==1
            assert Path(folder,'cfitness_state.json').read_bytes()==before
            blocker.rmdir()
            assert call('POST',path,admin,failed)[0]==200
            checks.append('disk failure rolls back and exact retry succeeds')
        finally:
            proc.terminate();proc.wait(timeout=5)
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
