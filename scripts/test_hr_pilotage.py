"""Real loopback HTTP recipe for MC08 (club KPIs, financial redaction, missions CRUD, concurrency & rollback).

Requires CFITNESS_TEST_BINARY and test credentials for local built-in demo accounts.
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
    with tempfile.TemporaryDirectory(prefix='hr-pilotage-recipe-', dir='.tools/tmp') as directory:
        folder = Path(directory).resolve()
        env = {
            **os.environ,
            'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}',
            'CFITNESS_DATA_DIR': str(folder),
            'CFITNESS_DEMO_MODE': '1',
            'CFITNESS_STRICT_SESSION': '1',
            'CFITNESS_AUTOMATION_SCHEDULER': '0',
            'CFITNESS_SCENARIOS_WORKER': '0',
            'CFITNESS_CAMPAIGNS_WORKER': '0',
            'CFITNESS_ALLOWED_ORIGINS': base,
        }

        def call(method, path, token=None, body=None, extra_headers=None):
            headers = {'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            if extra_headers:
                headers.update(extra_headers)
            req = urllib.request.Request(
                base + path,
                method=method,
                headers=headers,
                data=None if body is None else json.dumps(body).encode(),
            )
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
            proc = subprocess.Popen(
                [binary],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            for _ in range(100):
                if proc.poll() is not None:
                    raise AssertionError('Server stopped prematurely')
                try:
                    if call('GET', '/api/health')[0] == 200:
                        return proc
                except OSError:
                    pass
                time.sleep(0.05)
            stop(proc)
            raise AssertionError('Server did not become healthy')

        def login(actor_id, secret_env):
            specific = f"CFITNESS_TEST_{actor_id.replace('emp-', '').upper()}_SECRET"
            secret = os.environ.get(specific) or os.environ[secret_env]
            code, body = call(
                'POST',
                '/api/auth/login',
                body={'emailOrId': actor_id, 'pinOrPassword': secret},
            )
            assert code == 200, (actor_id, code, body)
            return body['sessionToken']

        proc = start()
        try:
            # 1. Forged header without Bearer must fail with 401
            assert call('GET', '/api/hr/pilotage/beynost', extra_headers={'x-cfitness-actor-id': 'emp-mario'})[0] == 401
            checks.append('bearer token mandatory on /api/hr/pilotage/:club_id (401 on forged header)')

            mario = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            sarah = login('emp-sarah', 'CFITNESS_TEST_SARAH_SECRET')
            chloe = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly = login('emp-readonly', 'CFITNESS_TEST_READONLY_SECRET')
            maxime = login('emp-maxime', 'CFITNESS_TEST_MAXIME_SECRET')

            # 2. Standard employee and out-of-club commercial denied (403); readonly stays strictly read-only without finances
            for tok in (chloe, maxime):
                assert call('GET', '/api/hr/pilotage/beynost', token=tok)[0] == 403
            code, ro = call('GET', '/api/hr/pilotage/beynost', token=readonly)
            assert code == 200 and not ro['capabilities']['canViewFinances']
            assert not ro['capabilities']['canEditOperationalKpis'] and not ro['capabilities']['canManageMissions']
            assert ro['kpis']['revenueEur'] is None
            assert call(
                'POST',
                '/api/hr/pilotage/beynost',
                token=readonly,
                body={
                    'expectedRevision': ro['revision'],
                    'command': {'action': 'create_mission', 'title': 'Interdit', 'budgetHours': 5.0},
                },
            )[0] == 403
            checks.append('employee/out-of-club denied (403) and readonly stays strictly redacted & read-only')

            # 3. Sarah (Carre de Soie manager without finances): financial values redacted and blocked (403), cross-club denied (403)
            assert call('GET', '/api/hr/pilotage/beynost', token=sarah)[0] == 403
            code, cs_sarah = call('GET', '/api/hr/pilotage/carre-de-soie', token=sarah)
            assert code == 200 and cs_sarah['capabilities']['canViewFinances'] is False
            assert cs_sarah['kpis']['revenueEur'] is None and cs_sarah['kpis']['payrollMassEur'] is None
            assert all(m['hourlyBudgetEur'] is None for m in cs_sarah['missions'])
            assert call(
                'POST',
                '/api/hr/pilotage/carre-de-soie',
                token=sarah,
                body={
                    'expectedRevision': cs_sarah['revision'],
                    'command': {
                        'action': 'save_site_kpis',
                        'periodLabel': 'Novembre 2026',
                        'workedHours': 435.0,
                        'retentionRatePct': 92.0,
                        'revenueEur': 99999.0,
                        'payrollMassEur': None,
                        'productivityPerHour': None,
                        'monthlyTargetEur': None,
                    },
                },
            )[0] == 403
            code, cs_sarah_after = call(
                'POST',
                '/api/hr/pilotage/carre-de-soie',
                token=sarah,
                body={
                    'expectedRevision': cs_sarah['revision'],
                    'command': {
                        'action': 'save_site_kpis',
                        'periodLabel': 'Novembre 2026',
                        'workedHours': 435.0,
                        'retentionRatePct': 92.0,
                        'revenueEur': None,
                        'payrollMassEur': None,
                        'productivityPerHour': None,
                        'monthlyTargetEur': None,
                    },
                },
            )
            assert code == 200 and cs_sarah_after['kpis']['workedHours'] == 435.0 and cs_sarah_after['kpis']['revenueEur'] is None
            checks.append('financial redaction, operational-only save and cross-club scope enforced for emp-sarah')

            # 4. Missions disabled on Carre de Soie (400); full KPI + Mission CRUD on Beynost
            code, cs_mario = call('GET', '/api/hr/pilotage/carre-de-soie', token=mario)
            assert code == 200 and cs_mario['kpis']['revenueEur'] == 48200.0 and cs_mario['site']['missionsModuleActive'] is False
            assert call(
                'POST',
                '/api/hr/pilotage/carre-de-soie',
                token=mario,
                body={
                    'expectedRevision': cs_mario['revision'],
                    'command': {
                        'action': 'create_mission',
                        'title': 'Doit echouer',
                        'budgetHours': 8.0,
                    },
                },
            )[0] == 400

            code, bey = call('GET', '/api/hr/pilotage/beynost', token=mario)
            assert code == 200 and bey['site']['missionsModuleActive'] is True
            code, bey = call(
                'POST',
                '/api/hr/pilotage/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'save_site_kpis',
                        'periodLabel': 'Décembre 2026',
                        'workedHours': 325.0,
                        'retentionRatePct': 91.2,
                        'revenueEur': 47200.0,
                        'payrollMassEur': 11400.0,
                        'productivityPerHour': 145.23,
                        'monthlyTargetEur': 48000.0,
                    },
                },
            )
            assert code == 200 and bey['kpis']['revenueEur'] == 47200.0

            code, bey = call(
                'POST',
                '/api/hr/pilotage/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'create_mission',
                        'title': 'Signalétique Hiver',
                        'budgetHours': 12.0,
                        'loggedHours': 2.0,
                        'hourlyBudgetEur': 30.0,
                    },
                },
            )
            assert code == 200 and bey['missions'][0]['estimatedBudgetEur'] == 360.0
            mission_id = bey['missions'][0]['id']

            # Cross-club delete refused (404)
            assert call(
                'POST',
                '/api/hr/pilotage/beynost',
                token=mario,
                body={'expectedRevision': bey['revision'], 'command': {'action': 'delete_mission', 'id': 'mis-03'}},
            )[0] == 404

            code, bey = call(
                'POST',
                '/api/hr/pilotage/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {'action': 'update_mission', 'id': mission_id, 'addHours': 3.5, 'status': 'done'},
                },
            )
            assert code == 200 and bey['missions'][0]['loggedHours'] == 5.5 and bey['missions'][0]['status'] == 'done'
            checks.append('disabled-club gate (400) and Beynost KPI + mission CRUD verified')

            # 5. Concurrency (200/409), disk rollback (500), restart durability
            rev_race = bey['revision']
            cmds = [
                {
                    'expectedRevision': rev_race,
                    'command': {'action': 'create_mission', 'title': 'Mission A', 'budgetHours': 6.0},
                },
                {
                    'expectedRevision': rev_race,
                    'command': {'action': 'create_mission', 'title': 'Mission B', 'budgetHours': 8.0},
                },
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                codes = sorted(
                    f.result()[0]
                    for f in [
                        pool.submit(call, 'POST', '/api/hr/pilotage/beynost', mario, body)
                        for body in cmds
                    ]
                )
            assert codes == [200, 409], codes

            code, latest_bey = call('GET', '/api/hr/pilotage/beynost', token=mario)
            assert code == 200
            state_file = folder / 'cfitness_state.json'
            before_disk = state_file.read_bytes()
            blocker = folder / 'cfitness_state.json.tmp'
            blocker.mkdir()
            assert call(
                'POST',
                '/api/hr/pilotage/beynost',
                token=mario,
                body={'expectedRevision': latest_bey['revision'], 'command': {'action': 'delete_mission', 'id': mission_id}},
            )[0] == 500
            assert state_file.read_bytes() == before_disk
            blocker.rmdir()

            stop(proc)
            proc = start()
            mario = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            code, restarted = call('GET', '/api/hr/pilotage/beynost', token=mario)
            assert code == 200 and restarted['kpis']['revenueEur'] == 47200.0
            assert any(m['id'] == mission_id and m['status'] == 'done' for m in restarted['missions'])
            checks.append('concurrent race (200/409), disk rollback and restart durability verified')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
