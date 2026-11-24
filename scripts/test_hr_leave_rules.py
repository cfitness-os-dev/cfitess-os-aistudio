"""Leave policy/counters HTTP recipe against a disposable loopback-only Rust server.

Requires CFITNESS_TEST_ADMIN_SECRET, CFITNESS_TEST_COMMERCIAL_SECRET,
CFITNESS_TEST_READONLY_SECRET and CFITNESS_TEST_MAXIME_SECRET for
the built-in fictional accounts. Never accepts a remote base URL.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def main():
    binary = str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    checks = []
    Path('.tools/tmp').mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='personal-recipe-', dir='.tools/tmp') as directory:
        folder = Path(directory).resolve()
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}',
               'CFITNESS_DATA_DIR': str(folder), 'CFITNESS_DEMO_MODE': '1',
               'CFITNESS_STRICT_SESSION': '1', 'CFITNESS_AUTOMATION_SCHEDULER': '0',
               'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_CAMPAIGNS_WORKER': '0',
               'CFITNESS_ALLOWED_ORIGINS': base}

        def call(method, path, token=None, body=None, site=None):
            headers = {'Content-Type': 'application/json'}
            if site:
                headers['x-cfitness-site-id'] = site
            if token:
                headers['Authorization'] = 'Bearer ' + token
            req = urllib.request.Request(base+path, method=method, headers=headers,
                    data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req, timeout=5) as reply:
                    return reply.status, json.load(reply)
            except urllib.error.HTTPError as error:
                try:
                    return error.code, json.load(error)
                except ValueError:
                    return error.code, None

        def stop(proc):
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)

        def start():
            proc = subprocess.Popen([binary], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError('Local server stopped')
                try:
                    if call('GET', '/api/health')[0] == 200:
                        return proc
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(.05)
            stop(proc)
            raise RuntimeError('Local server not ready')

        def login(actor, key):
            code, reply = call('POST', '/api/auth/login', body={
                'emailOrId': actor, 'pinOrPassword': os.environ[key]})
            assert code == 200, ('login', actor, code)
            return reply['sessionToken']


        proc=start()
        rules='/api/hr/leave-rules/'
        club='beynost'
        site='club-beynost'
        statefile=folder/'cfitness_state.json'
        try:
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly=login('emp-readonly','CFITNESS_TEST_READONLY_SECRET')
            maxime=login('emp-maxime','CFITNESS_TEST_MAXIME_SECRET')
            def ok(result):
                code,value=result
                assert code==200,(code,value)
                return value
            def settings(c=club,t=None):
                return ok(call('GET',rules+c,t or admin))
            def personal(t=None,c=club):
                return ok(call('GET','/api/me/workspace/'+c,t or employee))
            def managed(id,c=club,t=None):
                rows=ok(call('GET','/api/hr/workspace/'+c,t or admin))['requests']
                return next(r for r in rows if r['id']==id)
            def request(date,motive='CP',motive_id=None,t=None,c=club,end=None,docs=None,start_period='am',end_period='pm'):
                body=dict(action='request_leave',motive=motive,startDate=date,endDate=end or date,comment='Recette fictive')
                if motive_id is not None:body['motiveId']=motive_id
                if docs is not None:body['documentIds']=docs
                body.update(startPeriod=start_period,endPeriod=end_period)
                return call('POST','/api/me/workspace/'+c,t or employee,body)
            def create(date,**kw):
                before={r['id'] for r in personal(kw.get('t'),kw.get('c',club))['leaves']}
                value=ok(request(date,**kw))
                return next(r for r in value['leaves'] if r['id'] not in before)
            def configure(mid,family,c=club):
                return ok(call('PUT',rules+c,admin,dict(expectedRevision=settings(c)['revision'],motiveId=mid,family=family)))
            def command(cmd):
                revision=ok(call('GET','/api/hr/site-rules/'+club,admin))['revision']
                return call('POST','/api/hr/site-rules/'+club,admin,dict(expectedRevision=revision,command=cmd))
            def decision(id,status='approved',row=None,t=None):
                row=row or managed(id)
                return call('POST','/api/hr/workspace/'+club+'/requests/'+id,t or admin,dict(status=status,expectedStatus=row['status'],expectedRevision=row['revision'],note='Décision fictive'))
            def payload(id,action='approve',alloc=None):
                row=managed(id); p=row['policy']
                return dict(action=action,expectedRequestRevision=row['revision'],expectedCounterRevision=p['counter']['revision'],expectedPolicyRevision=p['policyRevision'],allocations=alloc or dict(cpN=1,cpNMinus1=0,rtt=0),reason='Décompte de recette',nextStatus='pending' if action=='reverse' else None)
            def settle(id,body=None,t=None,c=club):
                return call('POST',rules+c+'/requests/'+id+'/settle',t or admin,body or payload(id))
            def attach(id,ids,revision=None,t=None):
                revision=revision or next(r for r in personal(t)['leaves'] if r['id']==id)['policy']['requestRevision']
                return call('POST','/api/me/workspace/'+club,t or employee,dict(action='attach_leave_documents',id=id,documentIds=ids,expectedRevision=revision))
            def adjust(id,**changes):
                row=ok(call('GET','/api/hr/dossiers/'+club,admin))['employees']
                row=next(r for r in row if r['id']==id)
                return call('PUT','/api/admin/employees/'+id+'/counters',admin,dict(siteId=site,expectedRevision=row['counterRevision'],reason='Ajustement fictif',**changes),site=site)
            def unchanged(body):
                before=statefile.read_bytes()
                result=body()
                assert result[0]>=400,result
                assert statefile.read_bytes()==before
                return result
            assert call('GET',rules+club)[0]==401
            assert call('GET',rules+'unknown',admin)[0]==400
            assert call('GET',rules+club,employee)[0]==403
            config=settings()
            cp=next(m for m in config['motives'] if m['label']=='Congé payé')['id']
            rtt=next(m for m in config['motives'] if m['label']=='RTT')['id']
            assert all(m['counterFamily']=='none' for m in config['motives'])
            assert call('GET',rules+club,readonly)[0]==403
            unchanged(lambda:call('PUT',rules+club,readonly,dict(expectedRevision=config['revision'],motiveId=cp,family='cp')))
            saved=configure(cp,'cp')
            assert unchanged(lambda:call('PUT',rules+club,admin,dict(expectedRevision=config['revision'],motiveId=cp,family='rtt')))[0]==409
            assert all(m['counterFamily']=='none' for m in settings('carre-de-soie')['motives'])
            assert unchanged(lambda:call('PUT',rules+'carre-de-soie',admin,dict(expectedRevision=settings('carre-de-soie')['revision'],motiveId=cp,family='cp')))[0]==400
            unchanged(lambda:call('PUT',rules+club,admin,dict(expectedRevision=saved['revision'],motiveId=cp,family='payroll')))
            checks.append('authenticated scoped settings, read-only refusals, safe defaults, stale and cross-club rules refused')
            catalogue=personal()['requestMotives']
            assert 'Formation' not in [m['label'] for m in catalogue]
            assert request('2027-07-01',motive='Formation CFA')[0]==403
            assert request('2027-07-01',motive_id='mot-club-carre-soie-cp')[0]==400
            custom=ok(command(dict(action='save_absence_motive',label='Congé recette',category='conges',active=True,employeeRequestable=True,includedInAnnualization=False,requiresDocument=False)))
            cm=next(m for m in custom['motives'] if m['label']=='Congé recette')
            leave_custom=create('2027-07-01',motive_id=cm['id'])
            assert leave_custom['motive']=='Congé recette'
            assert request('2027-07-01',end='2027-07-02')[0]==409
            ok(call('POST','/api/me/workspace/'+club,employee,dict(action='cancel_leave',id=leave_custom['id'],comment='Retrait fictif')))
            reopened=create('2027-07-01',motive_id=cm['id'])
            ok(decision(reopened['id'],'rejected'))
            assert create('2027-07-01',motive_id=cm['id'])['status']=='pending'
            command_body={k:cm[k] for k in ['id','label','category','active','employeeRequestable','includedInAnnualization','requiresDocument']}
            ok(command(dict(action='save_absence_motive',**dict(command_body,active=False))))
            assert request('2027-07-03',motive_id=cm['id'])[0]==403
            checks.append('configured catalogue replaces hard-coded motives; inactive, manager-only and overlapping requests refused; cancellation/rejection releases dates')
            morning=create('2027-07-20',start_period='am',end_period='am')
            afternoon=create('2027-07-20',start_period='pm',end_period='pm')
            assert morning['policy']['endPeriod']=='am' and afternoon['policy']['startPeriod']=='pm'
            assert request('2027-07-20')[0]==409
            assert request('2027-07-21',start_period='pm',end_period='am')[0]==400
            assert request('2027-07-21',start_period='night')[0]==400
            checks.append('half-day boundaries persist, adjacent morning/afternoon requests coexist, full-day overlap and inverted boundaries refused')
            ok(adjust('emp-chloe',cpNAcquired=25,cpNTaken=5,cpNMinus1Remaining=3,rttDaysRemaining=4))
            leave=create('2027-08-01',end='2027-08-03')
            id=leave['id']
            assert decision(id)[0]==409
            assert call('PATCH','/api/leave-requests/'+id+'/decision',admin,dict(status='approved'))[0]==409
            alloc=dict(cpN=1.25,cpNMinus1=2.5,rtt=0)
            first=payload(id,alloc=alloc)
            assert not any(r['id']==id for r in ok(call('GET','/api/hr/workspace/'+club,readonly))['requests'])
            obsolete=payload(id,alloc=alloc)
            configure(rtt,'rtt')
            assert unchanged(lambda:settle(id,obsolete))[0]==409
            first=payload(id,alloc=alloc)
            assert settle(id,first,t=employee)[0]==403
            assert settle(id,first,t=readonly)[0]==403
            assert settle(id,first,c='carre-de-soie')[0]==404
            assert unchanged(lambda:settle(id,dict(first,allocations=dict(cpN=99,cpNMinus1=0,rtt=0))))[0]==409
            assert unchanged(lambda:settle(id,dict(first,allocations=dict(cpN=.001,cpNMinus1=0,rtt=0))))[0]==400
            assert unchanged(lambda:settle(id,dict(first,reason=' ')))[0]==400
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda _:settle(id,first)[0],range(2)))
            assert sorted(results)==[200,409],results
            after=managed(id)
            assert after['status']=='approved' and after['policy']['counter']['values']['cpNTaken']==6.25
            assert after['policy']['counter']['values']['cpNMinus1Remaining']==.5
            assert len(after['policy']['settlementHistory'])==1
            assert after['policy']['hasActiveSettlement']
            assert not any(r['id']==id for r in ok(call('GET','/api/hr/workspace/'+club,readonly))['requests'])
            assert decision(id,'pending')[0]==409
            checks.append('CP split atomically updates request/counter/ledger; precision, balances, self-approval and legacy bypass refused; double approval has one winner')
            # A correction after validation must be preserved by compensation.
            reversal=payload(id,'reverse',dict(cpN=0,cpNMinus1=0,rtt=0))
            ok(adjust('emp-chloe',cpNAcquired=26,cpNTaken=6.75,cpNMinus1Remaining=1.5))
            assert unchanged(lambda:settle(id,reversal))[0]==409
            reversal=payload(id,'reverse',dict(cpN=0,cpNMinus1=0,rtt=0))
            ok(settle(id,reversal))
            after=managed(id)['policy']
            assert after['counter']['values']['cpNAcquired']==26
            assert after['counter']['values']['cpNTaken']==5.5
            assert after['counter']['values']['cpNMinus1Remaining']==4
            assert not after['hasActiveSettlement'] and after['settlementHistory'][0]['reversedAt']
            assert unchanged(lambda:settle(id,reversal))[0]==409
            ok(settle(id,payload(id,alloc=alloc)))
            assert len(managed(id)['policy']['settlementHistory'])==2
            checks.append('reversal applies compensating deltas, preserves later adjustments, detects stale counters and keeps history on reapproval')
            # RTT uses the same canonical employee counter, without changing annualization.
            configure(rtt,'rtt')
            rr=create('2027-08-10',motive='RTT')
            ok(settle(rr['id'],payload(rr['id'],alloc=dict(cpN=0,cpNMinus1=0,rtt=1.5))))
            assert managed(rr['id'])['policy']['counter']['values']['rttDaysRemaining']==2.5
            assert unchanged(lambda:settle(rr['id'],payload(rr['id'])))[0]==409
            # Active ledger remains compensable if motive rule is changed afterward.
            configure(rtt,'none')
            ok(settle(rr['id'],payload(rr['id'],'reverse',dict(cpN=0,cpNMinus1=0,rtt=0))))
            assert managed(rr['id'])['policy']['counter']['values']['rttDaysRemaining']==4
            checks.append('RTT debit and compensation preserve CP/annualization; recorded allocations survive subsequent policy changes')
            # Missing proof does not prevent filing, but blocks both approval routes.
            medical=create('2027-09-01',motive='Maladie')
            mid=medical['id']
            assert medical['policy']['missingDocument']
            assert decision(mid)[0]==409
            assert call('PATCH','/api/leave-requests/'+mid+'/decision',admin,dict(status='approved',expectedRevision=managed(mid)['revision']))[0]==409
            assert attach(mid,['missing-document'])[0]==400
            assert attach(mid,['same','same'])[0]==400
            assert attach(mid,['fake']*11)[0]==400
            assert call('POST','/api/me/workspace/'+club,maxime,dict(action='attach_leave_documents',id=mid,documentIds=[],expectedRevision=medical['policy']['requestRevision']))[0]==404
            checks.append('document-required motives can be filed pending; missing proof, foreign ownership, nonexistent and duplicate proofs block approval')
            # Add an Attestation only to this stopped disposable server fixture.
            ok(call('POST','/api/me/workspace/'+club,employee,dict(action='add_task',title='Fixture justificatif')))
            stop(proc)
            fixture=json.loads(statefile.read_text())
            fixture['personalWorkspace']['people']['emp-chloe']['documents'].append(dict(id='proof-recipe',employeeId='emp-chloe',title='Attestation fictive',category='Attestation',uploadedAt='2026-11-24',signedStatus='Non requis',contractBodyText='Document fictif de recette'))
            statefile.write_text(json.dumps(fixture))
            proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly=login('emp-readonly','CFITNESS_TEST_READONLY_SECRET')
            oldrow=managed(mid)
            ok(attach(mid,['proof-recipe']))
            assert decision(mid,row=oldrow)[0]==409
            assert not managed(mid)['policy']['missingDocument']
            ok(decision(mid))
            assert attach(mid,[])[0]==409
            checks.append('owned attestation reads on both sides; changed proof invalidates stale approval; approved proof cannot be replaced')
            # Custom proof requirement without a counter also remains enforced.
            legacy=create('2027-09-10',motive='Maladie')
            ok(attach(legacy['id'],['proof-recipe']))
            assert call('PATCH','/api/leave-requests/'+legacy['id']+'/decision',admin,dict(status='approved'))[0]==409
            ok(call('PATCH','/api/leave-requests/'+legacy['id']+'/decision',admin,dict(status='approved',expectedRevision=managed(legacy['id'])['revision'])))
            checks.append('legacy approval requires a current proof-aware revision; no bypass by omitting it')
            # Failure before persistence must preserve disk, memory and audit.
            fail=create('2027-10-01')
            before_policy=managed(fail['id'])
            before_disk=statefile.read_bytes()
            blocker=folder/'cfitness_state.json.tmp'
            blocker.mkdir()
            try:
                assert settle(fail['id'])[0]==500
                assert managed(fail['id'])==before_policy
                assert statefile.read_bytes()==before_disk
                latest=settings()
                assert call('PUT',rules+club,admin,dict(expectedRevision=latest['revision'],motiveId=cp,family='none'))[0]==500
                assert settings()==latest
            finally:blocker.rmdir()
            checks.append('failed decision or rule write preserves memory/disk/audit and never confirms success')
            snapshot=managed(id)
            stop(proc);proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            assert managed(id)==snapshot
            assert personal()['leaves'] and managed(id)['policy']['counter']['values']['cpNTaken']==6.75
            assert len([m for m in settings()['motives'] if m['id']==cp and m['counterFamily']=='cp'])==1
            dossier=ok(call('GET','/api/me/dossier/'+club,employee,site=site))
            reasons=[h['reason'] for h in dossier['dossier']['counterHistory']]
            assert sum('décompte confirmé' in r for r in reasons)==3
            assert sum('reprise compensée' in r for r in reasons)==2
            checks.append('rules, active/reversed ledger, canonical counters and audit history survive a real restart without duplicate debit')
        finally:
            if proc.poll() is None:stop(proc)
    print(json.dumps(dict(passed=len(checks),checks=checks,externalSends=0),ensure_ascii=False,indent=2))


if __name__=='__main__':main()
