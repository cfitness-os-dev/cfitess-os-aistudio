"""Loopback-only, disposable policy recipe. Test credentials are supplied via env."""
import json
from datetime import datetime, timedelta, timezone
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
        def call(method, path, token=None, body=None, terminal=None):
            headers = {'Content-Type': 'application/json'}
            if terminal:
                headers['x-cfitness-terminal-token'] = terminal
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
        proc = start()
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            own = '/api/me/workspace/beynost'
            first = call('GET',own,employee)[1]
            policies = dict(personalAllowed=False,terminalAllowed=True,expectedRevision=None,reason='Terminal fictif de recette')
            assert call('PUT','/api/hr/clock-policies/beynost/emp-chloe',admin,policies)[0] == 200
            assert call('POST','/api/terminals/beynost',body=dict(roomId='test-room',roomLabel='Salle fictive',label='Tablette fictive'))[0] == 401
            status, created = call('POST','/api/terminals/beynost',admin,dict(roomId='test-room',roomLabel='Salle fictive',label='Tablette fictive'))
            assert status == 200
            terminal_id = created['terminalId']
            status, paired = call('POST','/api/terminals/pair',body=dict(terminalId=terminal_id,pairingCode=created['pairingCode']))
            assert status == 200
            device = paired['deviceToken']
            identity = call('GET','/api/terminals/whoami',terminal=device)[1]
            assert identity['siteId'] == 'club-beynost' and identity['roomId'] == 'test-room'
            assert identity['photoCaptureAvailable'] is False
            for row in call('GET','/api/terminals/beynost',admin)[1]['terminals']:
                assert 'deviceSecretHash' not in row and 'pairingCode' not in row
            checks.append('authorized creation/pairing, device identity and management responses without reusable pairing codes')
            entry = dict(employeeId='emp-chloe',punchType='arrivee')
            assert call('POST','/api/terminals/punch',body=entry,terminal=device)[0] == 401
            assert call('POST','/api/terminals/punch',admin,entry,device)[0] == 403
            assert call('POST','/api/terminals/punch',employee,entry)[0] == 401
            assert call('POST','/api/terminals/punch',employee,entry,'unregistered-test-device')[0] == 401
            checks.append('both device and employee authentication required; another employee cannot be impersonated')
            for photo in ['', 'text-only-placeholder', 'data:image/jpeg;base64,synthetic-not-a-photo']:
                assert call('POST','/api/terminals/punch',employee,{**entry,'photoProof':photo},device)[0] == 409
            assert call('GET',own,employee)[1]['timeEntries'] == first['timeEntries']
            checks.append('empty or unpersisted photo claims refused without creating an event')
            status, result = call('POST','/api/terminals/punch',employee,entry,device)
            assert status == 200 and result['entry']['photoProofPresent'] is False
            assert result['photoCaptureAvailable'] is False
            original = result['entry']
            current = call('GET',own,employee)[1]
            for key in ['tasks','notifications','documents','progress']:
                assert current[key] == first[key]
            assert call('POST',own,employee,dict(action='add_task',title='Tâche après pointage terminal'))[0] == 200
            assert call('POST','/api/terminals/punch',employee,entry,device)[0] == 409
            checks.append('server punch preserves personal catalog, supports followup task and rejects duplicate arrival')
            disk = (folder/'cfitness_state.json').read_bytes()
            (folder/'cfitness_state.json.tmp').mkdir()
            leave = dict(employeeId='emp-chloe',punchType='depart')
            assert call('POST','/api/terminals/punch',employee,leave,device)[0] == 500
            assert (folder/'cfitness_state.json').read_bytes() == disk
            assert call('GET',own,employee)[1]['timeEntries'] == [original]
            (folder/'cfitness_state.json.tmp').rmdir()
            assert call('POST','/api/terminals/punch',employee,leave,device)[0] == 200
            checks.append('failed persistence keeps disk and original timestamp unchanged; retry succeeds')
            stop(proc)
            proc = start()
            employee = login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            admin = login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            restored = call('GET',own,employee)[1]
            assert len(restored['timeEntries']) == 2 and restored['timeEntries'][0] == original
            assert call('GET','/api/terminals/whoami',terminal=device)[0] == 200
            assert call('POST',f'/api/terminals/beynost/{terminal_id}/revoke',admin,dict(reason='Retrait fictif'))[0] == 200
            assert call('POST','/api/terminals/punch',employee,entry,device)[0] == 403
            assert call('GET',own,employee)[1]['timeEntries'] == restored['timeEntries']
            checks.append('restart retains personal history and terminal identity; revoked device immediately refused')
            status, pending = call('POST','/api/terminals/beynost',admin,dict(roomId='pairing-room',roomLabel='Salle appairage fictive',label='Appareil à bloquer'))
            assert status == 200
            expiry = datetime.fromisoformat(pending['pairingExpiresAt'].replace('Z','+00:00'))
            created_at = datetime.fromisoformat(pending['createdAt'].replace('Z','+00:00'))
            assert (expiry-created_at).total_seconds() == 600
            pair_body = dict(terminalId=pending['terminalId'],pairingCode='000000')
            for _ in range(2):
                assert call('POST','/api/terminals/pair',body=pair_body)[0] == 401
            stop(proc)
            proc = start()
            for attempt in range(3,6):
                assert call('POST','/api/terminals/pair',body=pair_body)[0] == (429 if attempt==5 else 401)
            assert call('POST','/api/terminals/pair',body=dict(terminalId=pending['terminalId'],pairingCode=pending['pairingCode']))[0] == 429
            snapshot = json.loads((folder/'cfitness_state.json').read_text())
            blocked = next(t for t in snapshot['clockTerminals'] if t['id']==pending['terminalId'])
            assert blocked['failedPairingAttempts'] == 5 and blocked['status'] == 'pairing_locked'
            assert not blocked.get('deviceSecretHash') and not blocked.get('pairingCode')
            checks.append('ten-minute deadline advertised; five-attempt lock survives server restart and invalidates correct code')
            admin = login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            pending = call('POST','/api/terminals/beynost',admin,dict(roomId='expiry-room',roomLabel='Salle fictive',label='Appareil à expiration'))[1]
            stop(proc)
            snapshot = json.loads((folder/'cfitness_state.json').read_text())
            row = next(t for t in snapshot['clockTerminals'] if t['id']==pending['terminalId'])
            # Time fixture only, while the disposable server is stopped; never a remote dataset.
            row['createdAt'] = (datetime.now(timezone.utc)-timedelta(seconds=601)).isoformat()
            (folder/'cfitness_state.json').write_text(json.dumps(snapshot))
            proc = start()
            assert call('POST','/api/terminals/pair',body=dict(terminalId=pending['terminalId'],pairingCode=pending['pairingCode']))[0] == 401
            snapshot = json.loads((folder/'cfitness_state.json').read_text())
            expired = next(t for t in snapshot['clockTerminals'] if t['id']==pending['terminalId'])
            assert expired['status'] == 'pairing_expired' and not expired.get('pairingCode') and not expired.get('deviceSecretHash')
            checks.append('expired pending code cannot activate a device or return a secret')
        finally:
            stop(proc)
    print(json.dumps(dict(result='passed',count=len(checks),checks=checks,external_sends=False,real_camera=False,photo_capture_available=False)))

if __name__ == '__main__':
    main()
