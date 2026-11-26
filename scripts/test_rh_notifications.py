"""Disposable Rust HTTP recipe for own notifications and RH event delivery; no external secrets."""
import json, os, socket, subprocess, tempfile, time, urllib.request, urllib.error
from pathlib import Path
def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}';checks=[]
    with tempfile.TemporaryDirectory(prefix='rh-notifications-',dir=os.environ['TMPDIR']) as folder:
        env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'TMPDIR':os.environ['TMPDIR'],'CFITNESS_ENV':'demo','CFITNESS_DEMO_MODE':'1','CFITNESS_STRICT_SESSION':'1','CFITNESS_BIND_ADDR':f'127.0.0.1:{port}','CFITNESS_DATA_DIR':folder,'CFITNESS_HEITZ_LIVE_READS_ENABLED':'0','CFITNESS_HEITZ_WORKER':'0','CFITNESS_AUTOMATION_SCHEDULER':'0','CFITNESS_SCENARIOS_WORKER':'0','CFITNESS_CAMPAIGNS_WORKER':'0','HEITZ_WS_URL':'http://127.0.0.1:9','OLLAMA_BASE_URL':'http://127.0.0.1:9','RUST_LOG':'error'}
        binary=str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
        def call(method,path,token=None,body=None):
            h={'Content-Type':'application/json'}
            if token:h['Authorization']='Bearer '+token
            try:
                with urllib.request.urlopen(urllib.request.Request(base+path,method=method,headers=h,data=None if body is None else json.dumps(body).encode()),timeout=5) as r:return r.status,json.load(r)
            except urllib.error.HTTPError as e:return e.code,None
        def ok(result):
            assert result[0]==200,('unexpected status',result[0]);return result[1]
        def start():
            p=subprocess.Popen([binary],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            for _ in range(100):
                try:
                    if call('GET','/api/health')[0]==200:return p
                except OSError:pass
                time.sleep(.05)
            p.terminate();p.wait(timeout=5);raise RuntimeError('local server unavailable')
        def login(actor,pin):return ok(call('POST','/api/auth/login',body={'emailOrId':actor,'pinOrPassword':pin}))['sessionToken']
        inbox='/api/me/notifications/beynost';personal='/api/me/workspace/beynost';manager='/api/hr/workspace/beynost';rules='/api/hr/leave-rules/beynost'
        p=start()
        try:
            admin=login('emp-mario','1010');employee=login('emp-chloe','5320');sarah=login('emp-sarah','3141')
            assert call('GET',inbox)[0]==401
            assert call('GET','/api/me/notifications/carre-de-soie',employee)[0]==403
            assert call('GET',inbox,sarah)[0]==403
            checks.append('own authenticated club inbox; other club refused')
            initial=ok(call('GET',inbox,employee));before_count=initial['unreadCount']
            sent=ok(call('POST','/api/hr/communications/beynost',admin,dict(operationId='recipe-notification-001',subject='Information fictive',body='Message de test',recipientIds=['emp-chloe'])))
            mid=sent['publishedMessageId']
            loaded=ok(call('GET',inbox,employee));assert loaded['unreadCount']==before_count+1
            assert not any(n['id']==mid for n in ok(call('GET',inbox,admin))['notifications'])
            assert call('POST',inbox,admin,{'ids':[mid]})[0]==404
            assert call('POST',inbox,employee,{'ids':[mid,'unknown']})[0]==404
            assert ok(call('GET',inbox,employee))['unreadCount']==before_count+1
            checks.append('actual unread count, recipient isolation, atomic mixed-batch refusal')
            ok(call('POST',personal,employee,dict(action='read_notification',id=mid)))
            assert ok(call('GET',inbox,employee))['unreadCount']==before_count
            checks.append('legacy personal read updates canonical inbox and message receipt')
            def create(day,extra=None):
                body=dict(action='request_leave',motive='CP',startDate=day,endDate=day,comment='PRIVATE-COMMENT')
                if extra:body.update(extra)
                return next(r for r in ok(call('POST',personal,employee,body))['leaves'] if r['startDate']==day)
            def row(id):return next(r for r in ok(call('GET',manager,admin))['requests'] if r['id']==id)
            request=create('2027-06-11')
            assert any(n['title']=='Nouvelle demande d’absence' for n in ok(call('GET',inbox,admin))['notifications'])
            request_row=row(request['id'])
            ok(call('POST',manager+'/requests/'+request['id'],admin,dict(status='approved',expectedStatus=request_row['status'],expectedRevision=request_row['revision'],note='PRIVATE-NOTE')))
            assert any(n['title']=='Demande d’absence validée' for n in ok(call('GET',inbox,employee))['notifications'])
            assert 'PRIVATE-' not in json.dumps(ok(call('GET',inbox,employee)))
            checks.append('new leave alerts authorized managers; manager decision alerts employee without private notes')
            second=create('2027-06-12')
            ok(call('PATCH','/api/leave-requests/'+second['id']+'/decision',admin,dict(status='rejected',expectedStatus='pending',expectedRevision=row(second['id'])['revision'],note='PRIVATE-NOTE')))
            assert any(n['title']=='Demande d’absence refusée' for n in ok(call('GET',inbox,employee))['notifications'])
            checks.append('other legacy decision path also notifies employee')
            third=create('2027-06-13');ok(call('POST',personal,employee,dict(action='cancel_leave',id=third['id'],comment='PRIVATE-WITHDRAWAL')))
            assert any(n['title']=='Demande d’absence retirée' for n in ok(call('GET',inbox,admin))['notifications'])
            checks.append('employee withdrawal notifies authorized managers')
            config=ok(call('GET',rules,admin));cp=next(m['id'] for m in config['motives'] if m['label']=='Congé payé')
            ok(call('PUT',rules,admin,dict(expectedRevision=config['revision'],motiveId=cp,family='cp')))
            fourth=create('2027-06-14',{'motiveId':cp,'motive':'Congé payé'})
            def settle(action):
                r=row(fourth['id']);policy=r['policy']
                return call('POST',rules+'/requests/'+fourth['id']+'/settle',admin,dict(action=action,expectedRequestRevision=r['revision'],expectedCounterRevision=policy['counter']['revision'],expectedPolicyRevision=policy['policyRevision'],allocations=dict(cpN=0 if action=='reverse' else 1,cpNMinus1=0,rtt=0),reason='PRIVATE-COUNTER',nextStatus='pending' if action=='reverse' else None))
            old_total=ok(call('GET',inbox,employee))['total'];ok(settle('approve'))
            assert ok(call('GET',inbox,employee))['total']==old_total+1
            ok(settle('reverse'));assert any(n['title']=='Demande d’absence remise en attente' for n in ok(call('GET',inbox,employee))['notifications'])
            checks.append('counter approval and reversal emit notifications within the same persisted operation')
            ok(call('PUT','/api/hr/clock-policies/beynost/emp-chloe',admin,dict(personalAllowed=True,terminalAllowed=False,expectedRevision=None,reason='Recette fictive')))
            entry=ok(call('POST',personal,employee,dict(action='punch',punchType='arrivee')))['timeEntries'][0]
            ok(call('POST',manager+'/time-entries/'+entry['id'],admin,dict(employeeId='emp-chloe',note='PRIVATE-REVIEW',expectedVersion=None)))
            assert any(n['type']=='rh_time_review' for n in ok(call('GET',inbox,employee))['notifications'])
            assert 'PRIVATE-' not in json.dumps(ok(call('GET',inbox,employee)))
            checks.append('pointage annotation notifies employee without copying private annotation')
            unread=ok(call('GET',inbox+'?unreadOnly=true',employee));ids=[n['id'] for n in unread['notifications']]
            snapshot=Path(folder,'cfitness_state.json').read_bytes();blocker=Path(folder,'cfitness_state.json.tmp');blocker.mkdir()
            assert call('POST',inbox,employee,{'ids':ids})[0]==500
            assert ok(call('GET',inbox,employee))['unreadCount']==unread['unreadCount']
            assert Path(folder,'cfitness_state.json').read_bytes()==snapshot
            blocker.rmdir();ok(call('POST',inbox,employee,{'ids':ids}))
            assert ok(call('GET',inbox,employee))['unreadCount']==0
            checks.append('failed batch read rolls back; retry marks actual rows read')
            p.terminate();p.wait(timeout=5);p=start();employee=login('emp-chloe','5320')
            persisted=ok(call('GET',inbox,employee));assert persisted['unreadCount']==0 and persisted['total']>0
            assert ok(call('GET',inbox+'?unreadOnly=true',employee))['notifications']==[]
            checks.append('notifications and read state survive server restart')
        finally:p.terminate();p.wait(timeout=5)
    print(json.dumps({'passed':len(checks),'checks':checks,'external_calls':'disabled'},ensure_ascii=False))
if __name__=='__main__':main()
