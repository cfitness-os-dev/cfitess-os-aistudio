"""Real loopback HTTP recipe for MC10 (site rules, counters, absence motives, staffing needs, owner-only badge settings).

Requires CFITNESS_TEST_ADMIN_SECRET and CFITNESS_TEST_COMMERCIAL_SECRET for the built-in fictional accounts.
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
    with tempfile.TemporaryDirectory(prefix='hr-site-rules-recipe-', dir='.tools/tmp') as directory:
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
            assert call('GET', '/api/hr/site-rules/beynost', extra_headers={'x-cfitness-actor-id': 'emp-mario'})[0] == 401
            checks.append('bearer token mandatory on /api/hr/site-rules/:club_id (401 on forged header)')

            mario = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            chloe = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly = login('emp-readonly', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            maxime = login('emp-maxime', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            master = login('emp-master', 'CFITNESS_TEST_COMMERCIAL_SECRET')

            # 2. Employee, readonly and planner are denied (403)
            for tok in (chloe, readonly, maxime):
                assert call('GET', '/api/hr/site-rules/beynost', token=tok)[0] == 403
            checks.append('employee, readonly and planner denied (403)')

            # 3. emp-master can edit CS rules/motives/needs, CANNOT edit CS badge settings (owner-only), and CANNOT read Beynost
            assert call('GET', '/api/hr/site-rules/beynost', token=master)[0] == 403
            code, cs = call('GET', '/api/hr/site-rules/carre-de-soie', token=master)
            assert code == 200 and cs['capabilities']['canEditRules'] and not cs['capabilities']['canEditBadgeSettings']
            assert call(
                'POST',
                '/api/hr/site-rules/carre-de-soie',
                token=master,
                body={
                    'expectedRevision': cs['revision'],
                    'command': {
                        'action': 'save_badge_settings',
                        'badgeFrequency': 'consecutive_shift_series',
                        'tabletBreakBadging': False,
                    },
                },
            )[0] == 403
            checks.append('emp-master scoped to Carré de Soie only and blocked (403) from owner-only badge settings')

            # 4. Full CRUD on Beynost by Mario (base rules, counter rules, badge settings, absence motive, staffing need)
            code, bey = call('GET', '/api/hr/site-rules/beynost', token=mario)
            assert code == 200
            code, bey = call(
                'POST',
                '/api/hr/site-rules/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'save_base_rules',
                        'dayStartHour': '07:00',
                        'breakAlertEnabled': True,
                        'breakAlertHours': 5,
                        'consecutiveDaysBlocking': True,
                        'complementaryMaxHours': 14,
                        'smartPlannerBreakMaxHours': 3,
                        'alertsLayout': 'split_13_6',
                        'missionsModuleActive': False,
                        'reportRulesVisible': True,
                    },
                },
            )
            assert code == 200 and bey['settings']['dayStartHour'] == '07:00' and bey['settings']['alertsLayout'] == 'split_13_6'

            code, bey = call(
                'POST',
                '/api/hr/site-rules/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'save_counter_rules',
                        'acquisitionMode': '2,5 jours ouvrables/mois',
                        'annualizationPeriod': '2026-2027',
                        'sundayHoursInAnnualization': True,
                        'rttHoursCounterActive': True,
                    },
                },
            )
            assert code == 200 and bey['settings']['rttHoursCounterActive'] is True

            code, bey = call(
                'POST',
                '/api/hr/site-rules/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'save_badge_settings',
                        'badgeFrequency': 'consecutive_shift_series',
                        'tabletBreakBadging': False,
                    },
                },
            )
            assert code == 200 and bey['settings']['badgeFrequency'] == 'consecutive_shift_series'

            code, bey = call(
                'POST',
                '/api/hr/site-rules/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'save_absence_motive',
                        'label': 'Congé paternité',
                        'category': 'evenement_familial',
                        'active': True,
                        'employeeRequestable': True,
                        'includedInAnnualization': True,
                        'requiresDocument': True,
                    },
                },
            )
            assert code == 200 and any(m['label'] == 'Congé paternité' for m in bey['motives'])

            pos_id = bey['positions'][0]['id']
            code, bey = call(
                'POST',
                '/api/hr/site-rules/beynost',
                token=mario,
                body={
                    'expectedRevision': bey['revision'],
                    'command': {
                        'action': 'save_staffing_need',
                        'positionId': pos_id,
                        'dayOfWeek': 'weekdays',
                        'kind': 'fixed',
                        'startTime': '09:00',
                        'endTime': '18:00',
                        'minHeadcount': 2,
                        'active': True,
                        'note': 'Permanence journée',
                    },
                },
            )
            assert code == 200 and len(bey['staffingNeeds']) == 1
            checks.append('full CRUD rules, counters, owner badge settings, motives and staffing needs succeed for Beynost')

            # 5. Concurrent edits with same revision -> exactly one 200 and one 409
            rev_race = bey['revision']
            pos2 = bey['positions'][min(1, len(bey['positions']) - 1)]['id']
            cmds = [
                {
                    'expectedRevision': rev_race,
                    'command': {
                        'action': 'save_staffing_need',
                        'positionId': pos_id,
                        'dayOfWeek': 'saturday',
                        'kind': 'variable',
                        'startTime': '10:00',
                        'endTime': '14:00',
                        'minHeadcount': 1,
                        'active': True,
                        'note': 'Course A',
                    },
                },
                {
                    'expectedRevision': rev_race,
                    'command': {
                        'action': 'save_staffing_need',
                        'positionId': pos2,
                        'dayOfWeek': 'sunday',
                        'kind': 'variable',
                        'startTime': '10:00',
                        'endTime': '13:00',
                        'minHeadcount': 1,
                        'active': True,
                        'note': 'Course B',
                    },
                },
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                codes = sorted(
                    f.result()[0]
                    for f in [
                        pool.submit(call, 'POST', '/api/hr/site-rules/beynost', mario, body)
                        for body in cmds
                    ]
                )
            assert codes == [200, 409], codes

            # 6. Disk failure rollback & restart durability
            code, latest_bey = call('GET', '/api/hr/site-rules/beynost', token=mario)
            assert code == 200
            state_file = folder / 'cfitness_state.json'
            before_disk = state_file.read_bytes()
            blocker = folder / 'cfitness_state.json.tmp'
            blocker.mkdir()
            assert call(
                'POST',
                '/api/hr/site-rules/beynost',
                token=mario,
                body={
                    'expectedRevision': latest_bey['revision'],
                    'command': {
                        'action': 'save_staffing_need',
                        'positionId': pos_id,
                        'dayOfWeek': 'friday',
                        'kind': 'fixed',
                        'startTime': '08:00',
                        'endTime': '12:00',
                        'minHeadcount': 3,
                        'active': True,
                        'note': 'Doit rollback',
                    },
                },
            )[0] == 500
            assert state_file.read_bytes() == before_disk
            blocker.rmdir()

            stop(proc)
            proc = start()
            mario = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            code, restarted = call('GET', '/api/hr/site-rules/beynost', token=mario)
            assert code == 200
            assert restarted['settings']['dayStartHour'] == '07:00'
            assert restarted['settings']['badgeFrequency'] == 'consecutive_shift_series'
            assert any(m['label'] == 'Congé paternité' for m in restarted['motives'])
            assert len(restarted['staffingNeeds']) == 2
            code, cs_check = call('GET', '/api/hr/site-rules/carre-de-soie', token=mario)
            assert code == 200 and cs_check['staffingNeeds'] == []
            checks.append('concurrent race (200/409), disk rollback, restart durability and club isolation verified')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
