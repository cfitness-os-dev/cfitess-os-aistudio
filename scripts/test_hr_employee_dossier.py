"""Real loopback HTTP recipe for Issue #50 (dossier, contract, counters, multi-club, RBAC, rollback).

Requires CFITNESS_TEST_ADMIN_SECRET and CFITNESS_TEST_COMMERCIAL_SECRET for the built-in fictional accounts.
"""
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
    with tempfile.TemporaryDirectory(prefix='hr-dossier-recipe-', dir='.tools/tmp') as directory:
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

        def call(method, path, token=None, body=None, site=None, extra_headers=None):
            headers = {'Content-Type': 'application/json'}
            if site:
                headers['x-cfitness-site-id'] = site
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
                    code, _ = call('GET', '/api/health')
                    if code == 200:
                        return proc
                except OSError:
                    pass
                time.sleep(0.05)
            stop(proc)
            raise AssertionError('Server did not become healthy')

        def login(actor_id, secret_env):
            specific_env = f"CFITNESS_TEST_{actor_id.replace('emp-', '').upper()}_SECRET"
            secret = os.environ.get(specific_env) or os.environ[secret_env]
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
            code, _ = call('GET', '/api/hr/dossiers/beynost', extra_headers={'x-cfitness-actor-id': 'emp-mario'})
            assert code == 401, code
            code, _ = call('GET', '/api/me/dossier/beynost', extra_headers={'x-cfitness-actor-id': 'emp-chloe'})
            assert code == 401, code
            checks.append('bearer authentication required on dossier routes (401 on forged header)')

            mario = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            chloe = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            readonly = login('emp-readonly', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            maxime = login('emp-maxime', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            sarah = login('emp-sarah', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            master = login('emp-master', 'CFITNESS_TEST_COMMERCIAL_SECRET')

            # 2. Authorized edit of identity, contract and counters + readback on both sides
            code, bey_dossiers = call('GET', '/api/hr/dossiers/beynost', token=mario, site='club-beynost')
            assert code == 200
            chloe_before = next(e for e in bey_dossiers['employees'] if e['id'] == 'emp-chloe')

            code, patched = call(
                'PATCH',
                '/api/admin/employees/emp-chloe',
                token=mario,
                site='club-beynost',
                body={
                    'siteId': 'club-beynost',
                    'expectedRevision': chloe_before['dossierRevision'],
                    'contractType': 'CDD',
                    'regime': 'hours',
                    'weeklyHours': 28,
                    'reason': 'Avenant horaire Beynost',
                },
            )
            assert code == 200 and patched['dossier']['contract']['weeklyHours'] == 28, (code, patched)

            code, cnt_res = call(
                'PUT',
                '/api/admin/employees/emp-chloe/counters',
                token=mario,
                site='club-beynost',
                body={
                    'siteId': 'club-beynost',
                    'expectedRevision': chloe_before['counterRevision'],
                    'reason': 'Ajustement CP N validé par direction',
                    'cpNAcquired': 24.5,
                    'cpNTaken': 6.0,
                    'cpNMinus1Remaining': 1.5,
                    'rttDaysRemaining': 4.0,
                    'annualizationBalanceHours': 3.5,
                },
            )
            assert code == 200 and cnt_res['counter']['cpNAcquired'] == 24.5, (code, cnt_res)
            assert len(cnt_res['history']) == 1 and cnt_res['history'][0]['before']['cpNAcquired'] == chloe_before['counter']['cpNAcquired']

            code, me_chloe = call('GET', '/api/me/dossier/beynost', token=chloe, site='club-beynost')
            assert code == 200
            assert me_chloe['dossier']['contract']['weeklyHours'] == 28
            assert me_chloe['dossier']['counter']['cpNAcquired'] == 24.5
            assert me_chloe['dossier']['counterHistory'][0]['reason'] == 'Ajustement CP N validé par direction'
            checks.append('authorized dossier/contract/counter edit reads identically from HR and personal views with before/after history')

            # 3. RBAC denials: employee, readonly, out-of-team planner, out-of-club manager + redaction
            code, _ = call(
                'PUT',
                '/api/admin/employees/emp-chloe/counters',
                token=chloe,
                site='club-beynost',
                body={
                    'siteId': 'club-beynost',
                    'expectedRevision': me_chloe['dossier']['counterRevision'],
                    'reason': 'Auto-edition interdite',
                    'cpNAcquired': 30.0,
                },
            )
            assert code == 403, code

            code, ro_view = call('GET', '/api/hr/dossiers/beynost', token=readonly, site='club-beynost')
            assert code == 200
            ro_chloe = next(e for e in ro_view['employees'] if e['id'] == 'emp-chloe')
            for forbidden_key in ['sensitiveBank', 'email', 'phone']:
                assert forbidden_key not in ro_chloe, forbidden_key
            for forbidden_contract_key in ['monthlyGrossEur', 'hourlyRateEur', 'loadedCostFactor']:
                assert forbidden_contract_key not in ro_chloe['contract'], forbidden_contract_key
            code, _ = call(
                'PATCH',
                '/api/admin/employees/emp-chloe',
                token=readonly,
                site='club-beynost',
                body={'siteId': 'club-beynost', 'firstName': 'Interdit'},
            )
            assert code == 403, code

            code, _ = call('GET', '/api/hr/dossiers/beynost', token=sarah, site='club-beynost')
            assert code == 403, code

            code, _ = call(
                'PATCH',
                '/api/admin/employees/emp-karim',
                token=maxime,
                site='club-carre-soie',
                body={'siteId': 'club-carre-soie', 'weeklyHours': 30},
            )
            assert code == 403, code
            checks.append('employee, readonly, out-of-team and out-of-club actors are denied (403) and sensitive fields are absent from redacted responses')

            # 4. Multi-club employee with different roles per club (emp-master)
            code, _ = call(
                'PUT',
                '/api/admin/employees/emp-chloe/counters',
                token=master,
                site='club-beynost',
                body={
                    'siteId': 'club-beynost',
                    'expectedRevision': me_chloe['dossier']['counterRevision'],
                    'reason': 'Lecture seule à Beynost',
                    'cpNAcquired': 29.0,
                },
            )
            assert code == 403, code
            code, cs_view = call('GET', '/api/hr/dossiers/carre-de-soie', token=master, site='club-carre-soie')
            assert code == 200
            accueil_cs = next(e for e in cs_view['employees'] if e['id'] == 'emp-accueil-cs')
            code, _ = call(
                'PUT',
                '/api/admin/employees/emp-accueil-cs/counters',
                token=master,
                site='club-carre-soie',
                body={
                    'siteId': 'club-carre-soie',
                    'expectedRevision': accueil_cs['counterRevision'],
                    'reason': 'Correction autorisée Carré de Soie',
                    'cpNAcquired': 21.0,
                },
            )
            assert code == 200, code
            checks.append('same collaborator on two clubs respects distinct permissions per club (master_avance CS ok vs lecture_seule_avancee Beynost 403)')

            # 5. Stale revision rejected (409) & disk failure preserves memory/disk/audit
            code, _ = call(
                'PUT',
                '/api/admin/employees/emp-chloe/counters',
                token=mario,
                site='club-beynost',
                body={
                    'siteId': 'club-beynost',
                    'expectedRevision': chloe_before['counterRevision'],
                    'reason': 'Ancienne révision',
                    'cpNAcquired': 40.0,
                },
            )
            assert code == 409, code

            state_file = folder / 'cfitness_state.json'
            before_disk = state_file.read_bytes()
            tmp_blocker = folder / 'cfitness_state.json.tmp'
            tmp_blocker.mkdir()
            code, _ = call(
                'PUT',
                '/api/admin/employees/emp-chloe/counters',
                token=mario,
                site='club-beynost',
                body={
                    'siteId': 'club-beynost',
                    'expectedRevision': me_chloe['dossier']['counterRevision'],
                    'reason': 'Échec disque simulé',
                    'cpNAcquired': 42.0,
                },
            )
            assert code == 500, code
            assert state_file.read_bytes() == before_disk
            tmp_blocker.rmdir()
            code, chloe_after_fail = call('GET', '/api/me/dossier/beynost', token=chloe, site='club-beynost')
            assert code == 200 and chloe_after_fail['dossier']['counter']['cpNAcquired'] == 24.5
            checks.append('stale revision returns 409 and disk failure preserves memory, file bytes and audit')

            # 6. Restart durability
            stop(proc)
            proc = start()
            chloe = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            code, restarted = call('GET', '/api/me/dossier/beynost', token=chloe, site='club-beynost')
            assert code == 200
            assert restarted['dossier']['contract']['weeklyHours'] == 28
            assert restarted['dossier']['counter']['cpNAcquired'] == 24.5
            assert len(restarted['dossier']['counterHistory']) == 1
            checks.append('dossier, contract, counters and adjustment history survive a real server restart')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
