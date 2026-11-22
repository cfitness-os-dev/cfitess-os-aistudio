"""Start an isolated Rust demo; verify CRM snapshots, permissions and restart.

Requires CFITNESS_TEST_ADMIN_SECRET / CFITNESS_TEST_COMMERCIAL_SECRET for the
reference demo accounts. No supplied remote URL, provider call or actuator test.
"""
import argparse
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', default='target/debug/cfitness-os')
    args = parser.parse_args()
    secrets = [os.environ[key] for key in ('CFITNESS_TEST_ADMIN_SECRET', 'CFITNESS_TEST_COMMERCIAL_SECRET')]
    binary = str(Path(args.server).resolve())
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    Path('.tools/tmp').mkdir(parents=True, exist_ok=True)
    checks = []
    with tempfile.TemporaryDirectory(prefix='crm-heitz-recipe-', dir='.tools/tmp') as directory:
        data = Path(directory).resolve()
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}', 'CFITNESS_DATA_DIR': str(data),
               'CFITNESS_DEMO_MODE': '1', 'CFITNESS_STRICT_SESSION': '1', 'CFITNESS_AUTOMATION_SCHEDULER': '0',
               'CFITNESS_HEITZ_WEB_URL_CDS': 'https://heitz.example.test/login',
               'CFITNESS_HEITZ_WEB_URL_BEY': 'https://heitz.example.test/login'}

        def call(method, path, token=None, body=None):
            headers = {'Content-Type': 'application/json', 'x-cfitness-site-id': 'club-carre-soie'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            request = urllib.request.Request(base + path, method=method, headers=headers,
                data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                try:
                    return error.code, json.load(error)
                except ValueError:
                    return error.code, None

        def start():
            proc = subprocess.Popen([binary], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                for _ in range(100):
                    if proc.poll() is not None:
                        raise RuntimeError('Local server stopped')
                    try:
                        if call('GET', '/api/health')[0] == 200:
                            return proc
                    except (OSError, urllib.error.URLError):
                        pass
                    time.sleep(.05)
                raise RuntimeError('Local server not ready')
            except BaseException:
                stop(proc)
                raise

        def stop(proc):
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)

        def login(actor, secret):
            status, reply = call('POST', '/api/auth/login', body={'emailOrId': actor, 'pinOrPassword': secret})
            assert status == 200, ('login', actor, status)
            return reply['sessionToken']

        def payload(rows):
            return {'source': 'HEITZ_CSV', 'members': rows}

        proc = start()
        try:
            admin = login('emp-mario', secrets[0])
            commercial = login('emp-chloe', secrets[1])
            fixture = [dict(id='audit-cds', firstName='RecetteCDS', lastName='Synthétique', badgeCode='AUDIT-CDS',
                            homeClubId='carre-de-soie', activeSubscription=True, finBalanceEur=-40),
                       dict(id='audit-bey', firstName='RecetteBEY', lastName='Synthétique', badgeCode='AUDIT-BEY',
                            homeClubId='beynost', activeSubscription=True, finBalanceEur=-60)]
            assert call('GET', '/api/heitz/members')[0] == 401
            checks.append('unauthenticated GET 401')
            status, reply = call('POST', '/api/heitz/members/import', admin, payload(fixture))
            assert status == 201 and reply['added'] == 2
            checks.append('admin imports two club snapshots')
            visible = call('GET', '/api/heitz/members', commercial)[1]
            assert all(row['homeClubId'] == 'beynost' for row in visible)
            checks.append('commercial GET scoped to assigned club')
            statefile = data / 'cfitness_state.json'
            before = statefile.read_bytes()
            current = call('GET', '/api/heitz/members', admin)[1]
            assert call('PATCH', '/api/heitz/members/audit-cds', commercial, {'finBalanceEur': 0})[0] == 403
            assert call('PATCH', '/api/heitz/members/audit-bey', commercial, {'finBalanceEur': 0})[0] == 403
            checks.append('cross-club and unprivileged balance PATCH 403')
            for body in [{'finBalanceEur': 0}, {'activeSubscription': False}]:
                assert call('PATCH', '/api/heitz/members/audit-cds', admin, body)[0] == 409
            checks.append('admin cannot mistake local PATCH for verified provider operation')
            attack = {**fixture[0], 'homeClubId': 'beynost', 'finBalanceEur': -901}
            assert call('POST', '/api/heitz/members/import', commercial, payload([attack]))[0] == 403
            assert call('POST', '/api/heitz/members/import', admin, payload([attack]))[0] == 409
            checks.append('import identity collision blocked for commercial and admin')
            invalid = {**fixture[0], 'id': 'new', 'badgeCode': 'NEW', 'homeClubId': 'unknown'}
            assert call('POST', '/api/heitz/members/import', admin, payload([invalid]))[0] == 400
            checks.append('unknown club 400')
            new = {**fixture[0], 'id': 'new', 'badgeCode': 'NEW'}
            assert call('POST', '/api/heitz/members/import', admin, payload([new, invalid]))[0] == 400
            assert statefile.read_bytes() == before
            assert call('GET', '/api/heitz/members', admin)[1] == current
            checks.append('invalid batch is atomic across memory, disk and audit')
            assert call('POST', '/api/heitz/members/import', admin, {'source': 'HEITZ_MANUAL', 'members': [new]})[0] == 400
            checks.append('unverified manual creation rejected')
            (data / 'cfitness_state.json.tmp').mkdir()
            try:
                assert call('POST', '/api/heitz/members/import', admin, payload([new]))[0] == 500
                assert statefile.read_bytes() == before
                assert call('GET', '/api/heitz/members', admin)[1] == current
            finally:
                (data / 'cfitness_state.json.tmp').rmdir()
            checks.append('failed persistence 500 preserves memory, disk and audit')
            status, capabilities = call('GET', '/api/heitz/integration', commercial)
            assert status == 200 and capabilities['apiWritesAvailable'] is False
            assert capabilities['canImportSnapshot'] is False
            assert set(capabilities['webUrls']) == {'beynost'}
            checks.append('web capability does not grant API writes or another club')
            stop(proc)
            proc = start()
            admin = login('emp-mario', secrets[0])
            assert call('GET', '/api/heitz/members', admin)[1] == current
            checks.append('restart plus new session preserves confirmed snapshots')
            print(json.dumps({'result': 'passed', 'checks': checks, 'count': len(checks),
                              'provider_operations': False, 'external_sends': False}, ensure_ascii=False))
        finally:
            stop(proc)


if __name__ == '__main__':
    main()
