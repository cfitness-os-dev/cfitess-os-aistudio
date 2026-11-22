"""Manager/employee HTTP recipe against a disposable loopback-only Rust server.

Requires CFITNESS_TEST_ADMIN_SECRET and CFITNESS_TEST_COMMERCIAL_SECRET for
the built-in fictional accounts. Never accepts a remote base URL.
"""
import json
import os
from pathlib import Path
import socket
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def main():
    binary = str(Path('target/debug/cfitness-os').resolve())
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


        personal = '/api/me/workspace/beynost'
        manager = '/api/hr/workspace/beynost'
        proc = start()
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('PUT', '/api/hr/clock-policies/beynost/emp-chloe', admin, dict(personalAllowed=True,terminalAllowed=False,expectedRevision=None,reason='Autorisation fictive de recette'))[0] == 200
            assert call('GET', manager)[0] == 401
            assert call('GET', '/api/hr/workspace/unknown', admin)[0] == 400
            assert call('GET', '/api/hr/workspace/carre-de-soie', employee)[0] == 403
            checks.append('session and club boundaries enforced')
            status, own = call('POST', personal, employee, dict(action='request_leave',motive='CP',startDate='2027-06-11',endDate='2027-06-12',comment='Recette de liaison responsable'))
            assert status == 200
            leave = next(row for row in own['leaves'] if row['startDate'] == '2027-06-11')
            request_id = leave['id']
            board = call('GET', manager, admin)[1]
            request_row = next(row for row in board['requests'] if row['id'] == request_id)
            assert request_row['canDecide'] is True
            assert all(row['employeeId'] == 'emp-chloe' for row in call('GET', manager, employee)[1]['requests'])
            checks.append('personal request appears in manager view; employee sees only own requests')
            path = manager+'/requests/'+request_id
            initial = dict(status='approved',expectedStatus=request_row['status'],expectedRevision=request_row['revision'],note='Validation de recette')
            assert call('POST', path, employee, initial)[0] == 403
            assert call('POST', '/api/hr/workspace/carre-de-soie/requests/'+request_id, admin, initial)[0] == 404
            updated = call('POST', path, admin, initial)
            assert updated[0] == 200
            assert any(row['id'] == request_id and row['status'] == 'approved' for row in call('GET', personal, employee)[1]['leaves'])
            assert call('POST', path, admin, initial)[0] == 409
            checks.append('manager decision is visible to employee; self/cross-club/stale decisions refused')
            row = next(row for row in updated[1]['requests'] if row['id'] == request_id)
            assert call('POST', path, admin,dict(status='rejected',expectedStatus=row['status'],expectedRevision=row['revision'],note=''))[0] == 400
            code, updated = call('POST', path, admin,dict(status='pending',expectedStatus=row['status'],expectedRevision=row['revision'],note='Période à revoir'))
            assert code == 200
            assert call('POST', path, admin, initial)[0] == 409
            checks.append('reason required; old revision refused even after status cycles back to pending')
            own = call('POST', personal, employee, dict(action='punch',punchType='arrivee'))[1]
            entry = own['timeEntries'][0]
            board = call('GET', manager, admin)[1]
            visible = next(row for row in board['timeEntries'] if row['id'] == entry['id'])
            assert visible['canReview'] is True
            time_path = manager+'/time-entries/'+entry['id']
            note = dict(employeeId='emp-chloe',note='Horaire contrôlé par le responsable',expectedVersion=None)
            assert call('POST', time_path, employee, note)[0] == 403
            assert call('POST', time_path, admin,dict(**note,timestamp='fake'))[0] == 422
            code, reviewed = call('POST', time_path, admin, note)
            assert code == 200
            checked = next(row for row in reviewed['timeEntries'] if row['id'] == entry['id'])
            assert checked['timestamp'] == entry['timestamp'] and checked['type'] == entry['type']
            assert call('POST', time_path, admin, note)[0] == 409
            own = call('GET', personal, employee)[1]
            assert own['timeEntries'][0]['review']['note'] == note['note']
            checks.append('manager annotation reaches employee without modifying original timestamp/type')
            statefile = folder/'cfitness_state.json'
            before = statefile.read_bytes()
            confirmed = call('GET', manager, admin)[1]
            current = next(row for row in confirmed['requests'] if row['id'] == request_id)
            blocker = folder/'cfitness_state.json.tmp'
            blocker.mkdir()
            try:
                command = dict(status='rejected',expectedStatus=current['status'],expectedRevision=current['revision'],note='Ne doit pas être enregistré')
                assert call('POST', path, admin, command)[0] == 500
                revised_note = dict(employeeId='emp-chloe',note='Échec fictif',expectedVersion=checked['review']['version'])
                assert call('POST', time_path, admin, revised_note)[0] == 500
                assert call('GET', manager, admin)[1] == confirmed
                assert statefile.read_bytes() == before
            finally:
                blocker.rmdir()
            checks.append('failed manager saves preserve memory, disk and audit')
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('GET', manager, admin)[1] == confirmed
            assert call('GET', personal, employee)[1]['timeEntries'][0]['review']['note'] == note['note']
            checks.append('restart and independent logins preserve decisions and review visible on both sides')
            print(json.dumps(dict(result='passed',count=len(checks),checks=checks,external_sends=False,original_timestamps_unchanged=True),ensure_ascii=False))
        finally:
            stop(proc)


if __name__ == '__main__':
    main()
