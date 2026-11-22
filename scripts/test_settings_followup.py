"""Local-only HTTP recipe: starts its own demo server and disposable data directory.

Requires CFITNESS_TEST_ADMIN_SECRET and CFITNESS_TEST_COMMERCIAL_SECRET for the
reference demo accounts. Never run against a deployed server or real data.
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
    secrets = [os.environ[name] for name in (
        'CFITNESS_TEST_ADMIN_SECRET', 'CFITNESS_TEST_COMMERCIAL_SECRET')]
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    server = str(Path(args.server).resolve())
    Path('.tools/tmp').mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='settings-recipe-', dir='.tools/tmp') as directory:
        data_dir = Path(directory).resolve()
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}',
               'CFITNESS_DATA_DIR': str(data_dir), 'CFITNESS_DEMO_MODE': '1',
               'CFITNESS_STRICT_SESSION': '1', 'CFITNESS_AUTOMATION_SCHEDULER': '0'}

        def request(method, path, token=None, body=None):
            headers = {'Content-Type': 'application/json', 'x-cfitness-site-id': 'club-carre-soie'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            req = urllib.request.Request(base + path, method=method, headers=headers,
                data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(req, timeout=5) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                try:
                    return error.code, json.load(error)
                except ValueError:
                    return error.code, None

        def start():
            process = subprocess.Popen([server], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError('Local server stopped during startup')
                    try:
                        if request('GET', '/api/health')[0] == 200:
                            return process
                    except (OSError, urllib.error.URLError):
                        pass
                    time.sleep(.05)
                raise RuntimeError('Local server did not become ready')
            except BaseException:
                process.terminate()
                process.wait(timeout=5)
                raise

        def stop(process):
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

        def login(actor, secret):
            status, value = request('POST', '/api/auth/login', body={
                'emailOrId': actor, 'pinOrPassword': secret})
            assert status == 200, ('login', status)
            return value['sessionToken']

        process = start()
        try:
            admin = login('emp-mario', secrets[0])
            commercial = login('emp-maxime', secrets[1])
            originals = request('GET', '/api/admin/sites', admin)[1]
            expected = {}
            for club, frequency, pause in [('carre-de-soie', 'consecutive_shift_series', True),
                                           ('beynost', 'each_shift', False)]:
                path = f'/api/admin/sites/{club}/timeclock-settings'
                payload = {'badgeFrequency': frequency, 'tabletBreakBadging': pause}
                assert request('PUT', path, body=payload)[0] == 401
                assert request('PUT', path, commercial, payload)[0] == 403
                for invalid in [{**payload, 'badgeFrequency': 'unknown'},
                                {**payload, 'tabletBreakBadging': 'true'},
                                {**payload, 'name': 'unexpected'}]:
                    assert request('PUT', path, admin, invalid)[0] == 422
                status, saved = request('PUT', path, admin, payload)
                assert status == 200
                assert saved['settings']['badgeFrequency'] == frequency
                assert saved['settings']['tabletBreakBadging'] == pause
                expected[club] = payload
            assert request('PUT', '/api/admin/sites/unknown/timeclock-settings', admin,
                expected['beynost'])[0] == 404

            lead_expected = {}
            for club in expected:
                path = f'/api/lead/settings/{club}'
                status, loaded = request('GET', path, admin)
                assert status == 200
                value = loaded['settings']
                value['notifEmail'] = f'{club}@example.test'
                value['enabledAlertIds'] = ['LEAD-0546', 'LEAD-0550']
                assert request('PUT', path, admin, value)[0] == 200
                assert request('PUT', path, commercial, value)[0] == 403
                assert request('PUT', path, admin, {**value, 'archiveThresholdDays': 0})[0] == 400
                lead_expected[club] = value

            target = data_dir / 'cfitness_state.json'
            before = target.read_bytes()
            sites_before = request('GET', '/api/admin/sites', admin)[1]
            (data_dir / 'cfitness_state.json.tmp').mkdir()
            try:
                assert request('PUT', '/api/admin/sites/beynost/timeclock-settings', admin,
                    {'badgeFrequency': 'consecutive_shift_series', 'tabletBreakBadging': True})[0] == 500
                assert request('GET', '/api/admin/sites', admin)[1] == sites_before
                assert request('PUT', '/api/lead/settings/beynost', admin,
                    {**lead_expected['beynost'], 'notifEmail': 'rejected@example.test'})[0] == 500
                assert request('GET', '/api/lead/settings/beynost', admin)[1]['settings'] == lead_expected['beynost']
                assert target.read_bytes() == before
            finally:
                (data_dir / 'cfitness_state.json.tmp').rmdir()

            stop(process)
            process = start()
            admin = login('emp-mario', secrets[0])
            sites = request('GET', '/api/admin/sites', admin)[1]
            for club, payload in expected.items():
                site_id = 'club-beynost' if club == 'beynost' else 'club-carre-soie'
                settings = next(site['settings'] for site in sites if site['id'] == site_id)
                assert all(settings[key] == value for key, value in payload.items())
                assert request('GET', f'/api/lead/settings/{club}', admin)[1]['settings'] == lead_expected[club]
            assert [site['id'] for site in originals] == [site['id'] for site in sites]
            print(json.dumps({'result': 'passed', 'storage': 'disposable local directory',
                'checks': ['RH/Lead clubs independent', '401/403/404/422/400',
                           '500 leaves memory/file unchanged', 'restart preserves both clubs and service activations'],
                'external_sends': False}, ensure_ascii=False))
        finally:
            stop(process)


if __name__ == '__main__':
    main()
