"""Loopback-only, disposable policy recipe. Test credentials are supplied via env."""
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
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    Path('.tools/tmp').mkdir(parents=True, exist_ok=True)
    checks = []
    with tempfile.TemporaryDirectory(prefix='clock-policies-', dir='.tools/tmp') as directory:
        folder = Path(directory).resolve()
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}', 'CFITNESS_DATA_DIR': str(folder),
               'CFITNESS_DEMO_MODE': '1', 'CFITNESS_STRICT_SESSION': '1',
               'CFITNESS_AUTOMATION_SCHEDULER': '0', 'CFITNESS_ALLOWED_ORIGINS': base}
        binary = str(Path('target/debug/cfitness-os').resolve())
        def call(method, path, token=None, body=None):
            headers = {'Content-Type': 'application/json'}
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
            proc.terminate()
            proc.wait(timeout=5)
            raise RuntimeError('Local server not ready')
        def stop(proc):
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        def login(actor, key):
            status, reply = call('POST','/api/auth/login',body={'emailOrId': actor, 'pinOrPassword': os.environ[key]})
            assert status == 200
            return reply['sessionToken']
        endpoint = '/api/hr/clock-policies/beynost'
        own = '/api/me/workspace/beynost'
        proc = start()
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            initial = call('GET',own,employee)[1]
            assert initial['clockingPolicy'] == dict(personalAllowed=False, terminalAllowed=False,terminalReady=False)
            assert call('POST',own,employee,dict(action='punch',punchType='arrivee'))[0] == 403
            assert call('POST',own,admin,dict(action='punch',punchType='arrivee'))[0] == 403
            assert call('GET',own,employee)[1]['timeEntries'] == []
            checks.append('default denial applies to employees and admins; consultation remains available')
            assert call('GET',endpoint)[0] == 401
            assert call('GET',endpoint,employee)[0] == 403
            grant = dict(personalAllowed=True,terminalAllowed=False,expectedRevision=None,reason='Mission fictive')
            assert call('PUT',endpoint+'/emp-mario',admin,grant)[0] == 403
            assert call('PUT','/api/hr/clock-policies/carre-de-soie/emp-chloe',admin,grant)[0] == 403
            checks.append('session, self-grant and employee club boundaries enforced')
            status, result = call('PUT',endpoint+'/emp-chloe',admin,grant)
            assert status == 200
            revision = next(r for r in result['rows'] if r['employeeId']=='emp-chloe')['policy']['revision']
            assert call('GET',own,employee)[1]['punchAvailability']['allowedTypes'] == ['arrivee']
            assert call('POST',own,employee,dict(action='punch',punchType='arrivee'))[0] == 200
            assert call('PUT',endpoint+'/emp-chloe',admin,grant)[0] == 409
            checks.append('grant enables server punch and old revision is refused')
            revoke = dict(personalAllowed=False,terminalAllowed=True,expectedRevision=revision,reason='Retrait fictif')
            disk = (folder/'cfitness_state.json').read_bytes()
            (folder/'cfitness_state.json.tmp').mkdir()
            assert call('PUT',endpoint+'/emp-chloe',admin,revoke)[0] == 500
            assert (folder/'cfitness_state.json').read_bytes() == disk
            assert call('GET',own,employee)[1]['clockingPolicy']['personalAllowed'] is True
            (folder/'cfitness_state.json.tmp').rmdir()
            checks.append('disk failure preserves previous authorization and persisted audit')
            assert call('PUT',endpoint+'/emp-chloe',admin,revoke)[0] == 200
            assert call('POST',own,employee,dict(action='punch',punchType='depart'))[0] == 403
            after = call('GET',own,employee)[1]
            assert len(after['timeEntries']) == 1 and after['punchAvailability']['allowedTypes'] == []
            assert after['clockingPolicy'] == dict(personalAllowed=False,terminalAllowed=True,terminalReady=False)
            checks.append('revocation immediate; historical punch retained; terminal permission alone cannot punch personally')
            stop(proc)
            proc = start()
            employee = login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            after_restart = call('GET',own,employee)[1]
            assert after_restart['clockingPolicy'] == after['clockingPolicy']
            assert after_restart['timeEntries'] == after['timeEntries']
            checks.append('restart and new session preserve authorization and original time entry')
        finally:
            stop(proc)
    print(json.dumps(dict(result='passed',count=len(checks),checks=checks,external_sends=False)))

if __name__ == '__main__':
    main()
