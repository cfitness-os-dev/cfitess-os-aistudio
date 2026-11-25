"""Exceptional carryover recipe: disposable fictional data, loopback Rust, no providers.

Uses the same fictional login environment variables as test_hr_leave_accrual.py.
Never accepts a remote URL and never mutates an existing data directory.
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
    with tempfile.TemporaryDirectory(prefix='carry-recipe-', dir='.tools/tmp') as directory:
        folder = Path(directory).resolve()
        statefile = folder/'cfitness_state.json'
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}',
               'CFITNESS_DATA_DIR': str(folder), 'CFITNESS_DEMO_MODE': '1',
               'CFITNESS_STRICT_SESSION': '1', 'CFITNESS_AUTOMATION_SCHEDULER': '0',
               'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_CAMPAIGNS_WORKER': '0',
               'HEITZ_DEV_ID': '', 'HEITZ_DEV_KEY': '', 'HEITZ_WS_URL': 'http://127.0.0.1:9',
               'CFITNESS_ALLOWED_ORIGINS': base}

        def call(method, path, token=None, body=None, site=None):
            headers = {'Content-Type': 'application/json'}
            if site:
                headers['x-cfitness-site-id'] = site
            if token:
                headers['Authorization'] = 'Bearer '+token
            request = urllib.request.Request(base+path, method=method, headers=headers,
                      data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(request, timeout=5) as reply:
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
                    raise RuntimeError('Disposable local server stopped')
                try:
                    if call('GET', '/api/health')[0] == 200:
                        return proc
                except (OSError, urllib.error.URLError):
                    pass
                time.sleep(.05)
            stop(proc)
            raise RuntimeError('Local server not ready')

        def ok(result):
            code, value = result
            assert code == 200, (code, value)
            return value

        def login(actor, key):
            return ok(call('POST', '/api/auth/login', body={
                'emailOrId': actor, 'pinOrPassword': os.environ[key]}))['sessionToken']

        proc = start()
        route = '/api/hr/carryovers/'
        club = 'beynost'
        site = 'club-beynost'
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly = login('emp-readonly', 'CFITNESS_TEST_READONLY_SECRET')

            def read(c=club):
                return ok(call('GET', route+c, admin))

            def row(c=club, target='emp-chloe'):
                return next(e for e in read(c)['employees'] if e['id'] == target)

            def body(command, c=club, target='emp-chloe'):
                return dict(employeeId=target, expectedRevision=row(c, target)['revision'],
                            reviewConfirmed=True, reason='Contrôle fictif vérifié', command=command)

            def send(command, c=club, target='emp-chloe'):
                return call('POST', route+c, admin, body(command, c, target))

            def unchanged(action, expected):
                before = statefile.read_bytes()
                result = action()
                assert result[0] == expected, result
                assert statefile.read_bytes() == before
                return result

            def adjust(n):
                employee_row = next(e for e in ok(call('GET', '/api/hr/dossiers/'+club, admin))['employees'] if e['id'] == 'emp-chloe')
                return call('PUT', '/api/admin/employees/emp-chloe/counters', admin,
                            dict(siteId=site, expectedRevision=employee_row['counterRevision'],
                                 reason='Ajustement fictif du reliquat', cpNMinus1Remaining=n), site=site)

            create = dict(action='create', sourceStart='2025-06-01', sourceEnd='2026-05-31',
                          days=2, availableUntil='2027-05-31', reference='Échéance fictive vérifiée')
            assert call('GET', route+club)[0] == 401
            assert call('GET', route+club, employee)[0] == 403
            assert call('GET', route+club, readonly)[0] == 403
            assert call('GET', route+'unknown', admin)[0] == 400
            initial = read()
            assert all(e['id'] != 'emp-mario' for e in initial['employees'])
            own = dict(employeeId='emp-mario', expectedRevision='a'*64, reviewConfirmed=True, reason='Test fictif', command=create)
            unchanged(lambda: call('POST', route+club, admin, own), 403)
            unchanged(lambda: send(create, target='emp-maxime'), 409)  # Secondary club, no duplicate account.
            unchanged(lambda: call('POST', route+club, employee, dict(own, employeeId='emp-chloe')), 403)
            assert not any(k in json.dumps(initial) for k in ['salaryGross', 'iban', 'sessionToken'])
            checks.append('bearer required, employee/read-only/self refused, primary club enforced, sensitive fields absent')

            ok(adjust(7))
            before = json.loads(statefile.read_text())
            for patch in [dict(days=-1), dict(days=0), dict(days=2.001), dict(sourceEnd='2026-02-30'), dict(availableUntil='2024-01-01'), dict(reference='')]:
                unchanged(lambda patch=patch: send(dict(create, **patch)), 400)
            missing = dict(body(create), reviewConfirmed=False)
            unchanged(lambda: call('POST', route+club, admin, missing), 400)
            stale = body(create)
            ok(call('POST', route+club, admin, stale))
            unchanged(lambda: call('POST', route+club, admin, stale), 409)
            unchanged(lambda: send(create), 409)
            second = dict(create, sourceStart='2024-06-01', sourceEnd='2025-05-31', days=6)
            unchanged(lambda: send(second), 409)
            after = json.loads(statefile.read_text())
            assert before['employees'] == after['employees'] and before['leaveRequests'] == after['leaveRequests']
            case_id = row()['cases'][0]['record']['id']
            checks.append('period and amount validation, overlap prevention, total bounded by N1, stale version rejected, no counter or absence mutation')

            notice = dict(action='notice', id=case_id, notifiedOn='2026-11-24', medium='remise', evidence='Référence de remise fictive')
            unchanged(lambda: send(dict(notice, notifiedOn='2200-01-01')), 400)
            unchanged(lambda: send(dict(notice, evidence='')), 400)
            ok(send(notice))
            assert row()['cases'][0]['record']['notice']['evidence'] == notice['evidence']
            unchanged(lambda: send(dict(action='extend', id=case_id, availableUntil='2027-04-01')), 400)
            blocker = folder/'cfitness_state.json.tmp'
            blocker.mkdir()
            memory = read()
            try:
                unchanged(lambda: send(dict(action='extend', id=case_id, availableUntil='2027-06-30')), 500)
                assert read() == memory
            finally:
                blocker.rmdir()
            concurrent_body = body(dict(action='extend', id=case_id, availableUntil='2027-06-30'))
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                statuses = list(pool.map(lambda _: call('POST', route+club, admin, concurrent_body)[0], range(2)))
            assert sorted(statuses) == [200, 409]
            assert row()['cases'][0]['record']['notice'] is None
            assert any(h['before'] and h['before']['notice'] for h in row()['history'])
            checks.append('notice evidence, future notice refused, forward-only extension, renewed information, immutable history, disk rollback, concurrent submit')

            ok(send(dict(second, days=4)))
            second_id = next(c['record']['id'] for c in row()['cases'] if c['record']['id'] != case_id)
            ok(adjust(1))
            assert all(c['balanceChanged'] for c in row()['cases'])
            unchanged(lambda: send(dict(action='extend', id=case_id, availableUntil='2027-07-31')), 409)
            unchanged(lambda: send(notice), 409)
            unchanged(lambda: send(dict(action='reconcile', id=case_id, remainingDays=3)), 400)
            # Several annotations may exceed the new N1: permit strictly reducing
            # reconciliation one dossier at a time, without adding CP or hiding others.
            ok(send(dict(action='reconcile', id=second_id, remainingDays=0)))
            ok(send(dict(action='close', id=second_id)))
            ok(send(dict(action='reconcile', id=case_id, remainingDays=1)))
            unchanged(lambda: send(dict(action='close', id=case_id)), 409)
            assert row()['protectedDays'] == 1
            checks.append('changed balance blocks extensions/notices, multi-case over-allocation can be reconciled down safely, positive case cannot close')

            accrual = '/api/hr/leave-accrual/'+club
            acc = ok(call('GET', accrual, admin))
            policy = dict(acc['policy'], enabled=True, unit='ouvrables', monthlyDays=2.5,
                          periodStartMonth=11, reference='Politique fictive vérifiée', priorCarryMode='expire')
            ok(call('PUT', accrual, admin, dict(expectedRevision=acc['revision'], policy=policy)))
            q = dict(employeeId='emp-chloe', kind='rollover', month='2026-10')
            unchanged(lambda: call('POST', accrual+'/preview', admin, q), 409)
            acc = ok(call('GET', accrual, admin))
            policy['priorCarryMode'] = 'keep'
            ok(call('PUT', accrual, admin, dict(expectedRevision=acc['revision'], policy=policy)))
            keep_preview = ok(call('POST', accrual+'/preview', admin, q))
            ok(send(dict(action='reconcile', id=case_id, remainingDays=0)))
            obsolete = dict(request=q, expectedPreview=keep_preview['revision'], baselineConfirmed=True,
                            absenceReviewed=True, periodReviewed=True, confirmLoss=True, reason='Ancien aperçu fictif')
            unchanged(lambda: call('POST', accrual+'/apply', admin, obsolete), 409)
            ok(send(dict(action='close', id=case_id)))
            unchanged(lambda: send(notice), 409)
            unchanged(lambda: send(create), 409)  # Closed source periods cannot be silently duplicated.
            checks.append('open exceptional days block expiry rollover; preserving N1 remains available; reviewed zero closes without deleting rights')

            saved = read()
            disk = json.loads(statefile.read_text())
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            assert read() == saved
            reloaded = json.loads(statefile.read_text())
            assert disk['employees'] == reloaded['employees']
            assert row()['priorBalance'] == 1
            checks.append('real restart preserves dossiers, notice/extension/reconciliation history and canonical N1')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps(dict(passed=len(checks), checks=checks, externalSends=0), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
