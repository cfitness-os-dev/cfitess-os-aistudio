"""Leave accrual/carryover HTTP recipe against a disposable loopback-only Rust server.

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


        # Remove provider credentials from this disposable server even if the parent shell has them.
        env.update(HEITZ_DEV_ID='',HEITZ_DEV_KEY='',HEITZ_WS_URL='http://127.0.0.1:9',CFITNESS_AUTOMATION_SCHEDULER='0',CFITNESS_SCENARIOS_WORKER='0',CFITNESS_CAMPAIGNS_WORKER='0')
        proc=start()
        route='/api/hr/leave-accrual/'
        club='beynost';site='club-beynost';statefile=folder/'cfitness_state.json'
        try:
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly=login('emp-readonly','CFITNESS_TEST_READONLY_SECRET')
            def ok(result):
                code,value=result
                assert code==200,(code,value)
                return value
            def read(c=club):return ok(call('GET',route+c,admin))
            def rules(p,c=club,revision=None):return call('PUT',route+c,admin,dict(expectedRevision=revision or read(c)['revision'],policy=p))
            def query(kind='accrue',month='2026-10',employee_id='emp-chloe'):return dict(employeeId=employee_id,kind=kind,month=month)
            def preview(q=None,c=club,t=None):return call('POST',route+c+'/preview',t or admin,q or query())
            def mutation(p,q=None):return dict(request=q or query(),expectedPreview=p['revision'],baselineConfirmed=True,absenceReviewed=True,periodReviewed=True,confirmLoss=True,reason='Recette fictive vérifiée')
            def apply(p,q=None,c=club,t=None):return call('POST',route+c+'/apply',t or admin,mutation(p,q))
            def unchanged(action):
                before=statefile.read_bytes()
                result=action()
                assert result[0]>=400,result
                assert statefile.read_bytes()==before
                return result
            def adjustment(**values):
                row=next(r for r in ok(call('GET','/api/hr/dossiers/'+club,admin))['employees'] if r['id']=='emp-chloe')
                return call('PUT','/api/admin/employees/emp-chloe/counters',admin,dict(siteId=site,expectedRevision=row['counterRevision'],reason='Reprise fictive',**values),site=site)
            assert call('GET',route+club)[0]==401
            assert call('GET',route+club,employee)[0]==403
            assert call('GET',route+club,readonly)[0]==403
            initial=read()
            assert not initial['policy']['enabled'] and initial['policy']['monthlyDays'] is None
            assert initial['history']==[]
            assert preview()[0]==409
            assert preview(query(employee_id='emp-mario'))[0]==403
            assert preview(t=employee)[0]==403
            assert preview(query(employee_id='emp-maxime'))[0]==409
            ready=dict(initial['policy'],enabled=True,unit='ouvrables',monthlyDays=2.0833,periodStartMonth=11,reference='Paramètres fictifs de recette, à vérifier dans Skello')
            assert unchanged(lambda:rules(dict(ready,monthlyDays=2.08333)))[0]==400
            assert unchanged(lambda:rules(dict(ready,reference='')))[0]==400
            before_disk=statefile.read_bytes()
            blocker=folder/'cfitness_state.json.tmp';blocker.mkdir()
            try:
                assert rules(ready)[0]==500
                assert read()==initial and statefile.read_bytes()==before_disk
            finally:blocker.rmdir()
            saved=ok(rules(ready))
            assert unchanged(lambda:rules(dict(ready,monthlyDays=2.5),revision=initial['revision']))[0]==409
            assert not read('carre-de-soie')['policy']['enabled']
            checks.append('opt-in policy, authentication, scoped rights, primary-club restriction, validation, stale edits and failed-write rollback')
            # The seed starts Chloé on October 18: reject the incomplete month first,
            # then explicitly prepare a full-month fictional contract through the real dossier API.
            assert preview()[0]==409
            dossier=next(r for r in ok(call('GET','/api/hr/dossiers/'+club,admin))['employees'] if r['id']=='emp-chloe')
            ok(call('PATCH','/api/admin/employees/emp-chloe',admin,dict(siteId=site,expectedRevision=dossier['dossierRevision'],reason='Contrat fictif de mois complet pour la recette',effectiveFrom='2026-10-01'),site=site))
            ok(adjustment(cpNAcquired=0,cpNTaken=0,cpNMinus1Remaining=1,rttDaysRemaining=3,annualizationBalanceHours=5))
            assert preview(query(month='2026-09'))[0]==409
            assert preview(query(month='2099-01'))[0]==409
            assert preview(query(kind='rollover',month='2026-09'))[0]==400
            # Acquisition eligibility is independent from the counter-debit family and annualization.
            cp_motive=next(m['id'] for m in read()['motives'] if m['label']=='Congé payé')
            assert unchanged(lambda:rules(dict(ready,absenceAcquisition={'mot-club-carre-soie-cp':True})))[0]==400
            personal_route='/api/me/workspace/'+club
            ids={r['id'] for r in ok(call('GET',personal_route,employee))['leaves']}
            created=ok(call('POST',personal_route,employee,dict(action='request_leave',motive='CP',startDate='2026-10-05',endDate='2026-10-05',comment='Recette fictive acquisition')))
            absence_id=next(r['id'] for r in created['leaves'] if r['id'] not in ids)
            row=next(r for r in ok(call('GET','/api/hr/workspace/'+club,admin))['requests'] if r['id']==absence_id)
            ok(call('POST','/api/hr/workspace/'+club+'/requests/'+absence_id,admin,dict(status='approved',expectedStatus=row['status'],expectedRevision=row['revision'],note='Absence fictive sans compteur configuré')))
            before_rule=ok(preview())
            assert before_rule['plan']['absenceCount']==1 and before_rule['plan']['unverifiedAbsenceCount']==1
            ok(rules(dict(ready,absenceAcquisition={cp_motive:False})))
            assert unchanged(lambda:preview())[0]==409
            ok(rules(dict(ready,absenceAcquisition={cp_motive:True})))
            eligible=ok(preview())
            assert eligible['plan']['absenceReviewRequired'] and eligible['plan']['unverifiedAbsenceCount']==0
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(mutation(eligible),absenceReviewed=False)))[0]==400
            ok(rules(ready))
            assert unchanged(lambda:apply(eligible))[0]==409
            checks.append('explicit per-motive eligibility, foreign-club IDs refused, full-credit block on non-acquiring absence, retained review for rates and stale preview rejection')
            p=ok(preview())
            assert p['plan']['amount']==2.08 and p['plan']['before']['cpNAcquired']==0
            assert p['plan']['after']['cpNAcquired']==2.08 and p['plan']['baselineRequired']
            assert next(e for e in read()['employees'] if e['id']=='emp-chloe')['counter']['cpNAcquired']==0
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(mutation(p),baselineConfirmed=False)))[0]==400
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(mutation(p),expectedPreview='0'*64)))[0]==409
            blocker.mkdir();before_disk=statefile.read_bytes()
            try:
                assert apply(p)[0]==500
                assert statefile.read_bytes()==before_disk and read()['history']==[]
            finally:blocker.rmdir()
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results=list(pool.map(lambda _:apply(p)[0],range(2)))
            assert sorted(results)==[200,409],results
            after=next(e for e in read()['employees'] if e['id']=='emp-chloe')['counter']
            assert after['cpNAcquired']==2.08 and after['rttDaysRemaining']==3 and after['annualizationBalanceHours']==5
            assert len(read()['history'])==1
            checks.append('side-effect-free preview, full-month eligibility, explicit baseline, stale hash, failed credit write and concurrent anti-double-credit')
            close=query(kind='rollover')
            obsolete=ok(preview(close))
            ok(adjustment(cpNAcquired=2.58))
            assert unchanged(lambda:apply(obsolete,close))[0]==409
            newer=dict(ready,carryMode='limit',carryLimit=1,priorCarryMode='expire')
            ok(rules(newer))
            assert unchanged(lambda:apply(ok(preview(close)),close,t=employee))[0]==403
            # A real linked CP decision must not be refunded into the next financial period.
            policy=ok(call('GET','/api/hr/leave-rules/'+club,admin))
            cp=next(m['id'] for m in policy['motives'] if m['label']=='Congé payé')
            ok(call('PUT','/api/hr/leave-rules/'+club,admin,dict(expectedRevision=policy['revision'],motiveId=cp,family='cp')))
            personal='/api/me/workspace/'+club
            before={r['id'] for r in ok(call('GET',personal,employee))['leaves']}
            value=ok(call('POST',personal,employee,dict(action='request_leave',motive='CP',startDate='2026-10-15',endDate='2026-10-15',startPeriod='am',endPeriod='am',comment='Absence fictive de période')))
            id=next(r['id'] for r in value['leaves'] if r['id'] not in before)
            assert preview(close)[0]==409
            row=next(r for r in ok(call('GET','/api/hr/workspace/'+club,admin))['requests'] if r['id']==id)
            decision=dict(action='approve',expectedRequestRevision=row['revision'],expectedCounterRevision=row['policy']['counter']['revision'],expectedPolicyRevision=row['policy']['policyRevision'],allocations=dict(cpN=.5,cpNMinus1=0,rtt=0),reason='Demi-journée fictive confirmée')
            ok(call('POST','/api/hr/leave-rules/'+club+'/requests/'+id+'/settle',admin,decision))
            p=ok(preview(close))
            assert p['plan']['carried']==1 and p['plan']['expired']==2.08
            assert p['plan']['after']['cpNAcquired']==0 and p['plan']['after']['cpNTaken']==0 and p['plan']['after']['cpNMinus1Remaining']==1
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(mutation(p,close),confirmLoss=False)))[0]==400
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(mutation(p,close),periodReviewed=False)))[0]==400
            # Also invalidate a prepared preview when the verified policy changes.
            ok(rules(dict(newer,reference='Référence fictive mise à jour')))
            assert unchanged(lambda:apply(p,close))[0]==409
            p=ok(preview(close))
            blocker.mkdir();before_disk=statefile.read_bytes()
            try:
                assert apply(p,close)[0]==500 and statefile.read_bytes()==before_disk
                row=next(r for r in ok(call('GET','/api/hr/workspace/'+club,admin))['requests'] if r['id']==id)
                assert not row['policy']['closedCounterPeriod']
            finally:blocker.rmdir()
            ok(apply(p,close))
            assert preview(close)[0]==409
            assert len(read()['history'])==2
            row=next(r for r in ok(call('GET','/api/hr/workspace/'+club,admin))['requests'] if r['id']==id)
            assert row['policy']['closedCounterPeriod'] and not row['policy']['canSettle']
            reversal=dict(action='reverse',expectedRequestRevision=row['revision'],expectedCounterRevision=row['policy']['counter']['revision'],expectedPolicyRevision=row['policy']['policyRevision'],allocations=dict(cpN=0,cpNMinus1=0,rtt=0),nextStatus='pending',reason='Ne doit pas modifier le nouvel exercice')
            assert unchanged(lambda:call('POST','/api/hr/leave-rules/'+club+'/requests/'+id+'/settle',admin,reversal))[0]==409
            assert unchanged(lambda:call('POST','/api/hr/workspace/'+club+'/requests/'+id,admin,dict(status='pending',expectedStatus='approved',expectedRevision=row['revision'],note='Reprise interdite')))[0]==409
            assert unchanged(lambda:call('POST',personal,employee,dict(action='request_leave',motive='CP',startDate='2026-10-20',endDate='2026-10-20')))[0]==409
            checks.append('capped rollover, explicit expiry confirmation, pending requests, stale policy/balance, disk rollback and old-period compensation protection')
            # Credit a multi-club employee once in their primary club.
            ok(rules(ready,c='carre-de-soie'))
            multi=query(employee_id='emp-maxime')
            pm=ok(preview(multi,c='carre-de-soie'))
            ok(apply(pm,multi,c='carre-de-soie'))
            snapshot=read();stop(proc)
            fixture=json.loads(statefile.read_text())
            target=next(e for e in fixture['employees'] if e['id']=='emp-maxime')
            for access in target['siteAccesses']:access['isPrimary']=access['siteId']=='club-beynost'
            statefile.write_text(json.dumps(fixture))
            proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            assert preview(multi,c='beynost')[0]==409
            assert preview()[0]==409
            latest=read()
            old=next(e for e in snapshot['employees'] if e['id']=='emp-chloe')
            current=next(e for e in latest['employees'] if e['id']=='emp-chloe')
            assert old==current and latest['history']==snapshot['history']
            own=ok(call('GET','/api/me/dossier/'+club,employee,site=site))['dossier']
            assert own['counter']['cpNMinus1Remaining']==1 and own['counter']['cpNAcquired']==0
            assert any('Clôture et report' in h['reason'] for h in own['counterHistory'])
            checks.append('real restart preserves credits/rollovers/history; changing a synthetic primary-club fixture cannot credit the same employee/month twice')
            # A second fresh data directory keeps partial-month fixtures independent.
            stop(proc)
            folder=folder/'verified-prorata';folder.mkdir()
            statefile=folder/'cfitness_state.json'
            env['CFITNESS_DATA_DIR']=str(folder)
            proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            ready=dict(read()['policy'],enabled=True,unit='ouvrables',monthlyDays=2.5,periodStartMonth=11,reference='Règles fictives du calcul vérifié')
            ok(rules(ready));ok(adjustment(cpNAcquired=0,cpNTaken=0,cpNMinus1Remaining=0))
            assert preview()[0]==409 # October 18 start: no guessed full-month credit.
            q=dict(query(),verifiedCredit=dict(days=2.18,reference='Calcul fictif déjà contrôlé, entrée en cours de mois'))
            p=ok(preview(q));assert p['plan']['amount']==2.18 and p['plan']['verifiedCredit']==q['verifiedCredit']
            for invalid in [dict(days=-1,reference='x'),dict(days=2.51,reference='x'),dict(days=2.181,reference='x'),dict(days=2.18,reference='')]:
                assert unchanged(lambda:preview(dict(q,verifiedCredit=invalid)))[0]==400
            assert unchanged(lambda:preview(dict(q,month='2026-09')))[0]==409
            assert unchanged(lambda:preview(dict(q,kind='rollover')))[0]==400
            body=dict(mutation(p,q),calculationConfirmed=True)
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(body,calculationConfirmed=False)))[0]==400
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(body,baselineConfirmed=False)))[0]==400
            changed=dict(q,verifiedCredit=dict(days=2.18,reference='Autre justificatif'))
            assert unchanged(lambda:call('POST',route+club+'/apply',admin,dict(body,request=changed)))[0]==409
            blocker=folder/'cfitness_state.json.tmp';blocker.mkdir();before_disk=statefile.read_bytes()
            try:
                assert call('POST',route+club+'/apply',admin,body)[0]==500
                assert statefile.read_bytes()==before_disk and read()['history']==[]
            finally:blocker.rmdir()
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                statuses=list(pool.map(lambda _:call('POST',route+club+'/apply',admin,body)[0],range(2)))
            assert sorted(statuses)==[200,409]
            assert preview()[0]==409 # No full-month addition after a verified partial credit.
            history=read()['history'];assert history[0]['verifiedCredit']==q['verifiedCredit']
            own_token=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            dossier=ok(call('GET','/api/me/dossier/'+club,own_token,site=site))['dossier']
            assert dossier['counter']['cpNAcquired']==2.18
            assert any(q['verifiedCredit']['reference'] in h['reason'] for h in dossier['counterHistory'])
            ok(rules(ready,c='carre-de-soie'))
            zero=dict(query(employee_id='emp-maxime'),verifiedCredit=dict(days=0,reference='Mois à zéro confirmé sur données fictives'))
            zp=ok(preview(zero,c='carre-de-soie'))
            ok(call('POST',route+'carre-de-soie/apply',admin,dict(mutation(zp,zero),calculationConfirmed=True)))
            assert preview(query(employee_id='emp-maxime'),c='carre-de-soie')[0]==409
            stop(proc);proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            assert read()['history']==history and preview(q)[0]==409
            checks.append('verified partial/zero credit with mandatory calculation reference and acknowledgement; amount bounds, contract overlap, stale reference, disk rollback, concurrency, own history and restart')
        finally:
            if proc.poll() is None:stop(proc)
    print(json.dumps(dict(passed=len(checks),checks=checks,externalSends=0),ensure_ascii=False,indent=2))


if __name__=='__main__':main()
