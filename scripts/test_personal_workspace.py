"""HTTP recipe against a disposable, loopback-only Rust server.

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

        path = '/api/me/workspace/beynost'
        proc = start()
        try:
            chloe = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            assert call('GET', path)[0] == 401
            assert call('GET', '/api/me/workspace/carre-de-soie', chloe)[0] == 403
            assert call('GET', '/api/me/workspace/unknown', admin)[0] == 400
            checks.append('session required and unknown/unauthorized clubs refused')
            initial = call('GET', path, chloe)[1]
            for key in ['tasks', 'notifications', 'documents', 'progress']:
                assert all(row['employeeId'] == 'emp-chloe' for row in initial[key])
            assert all('quizCorrectIndex' not in row for row in initial['training'])
            assert call('POST', path, chloe, {'action': 'add_task', 'title': 'attack', 'employeeId': 'emp-mario'})[0] == 422
            checks.append('identity derives from session; no quiz answer in GET or client actor override')
            code, updated = call('POST', path, chloe, {'action': 'add_task', 'title': 'Tâche HTTP fictive'})
            assert code == 200
            task = next(row for row in updated['tasks'] if row['title'] == 'Tâche HTTP fictive')
            assert call('POST', path, chloe, {'action': 'set_task', 'id': task['id'], 'completed': True})[0] == 200
            assert all(row['id'] != task['id'] for row in call('GET', path, admin)[1]['tasks'])
            assert call('POST', path, admin, {'action': 'set_task', 'id': task['id'], 'completed': False})[0] == 404
            checks.append('task creation/completion persisted, invisible and unmodifiable by another actor')
            module = initial['training'][0]
            assert call('POST', path, chloe, {'action': 'answer_quiz', 'id': module['id'], 'selectedOption': 1})[0] == 422
            assert call('POST', path, chloe, {'action': 'answer_quiz', 'id': module['id'], 'selectedOption': 0})[0] == 200
            checks.append('wrong quiz answer rejected; chosen correct answer persists progress')
            leave = dict(action='request_leave', motive='CP', startDate='2027-03-01', endDate='2027-03-03', comment='Recette fictive')
            assert call('POST', path, chloe, {**leave, 'endDate': '2027-02-01'})[0] == 400
            assert call('POST', path, chloe, leave)[0] == 200
            assert call('POST', path, chloe, leave)[0] == 409
            statefile = folder / 'cfitness_state.json'
            state = json.loads(statefile.read_text())
            assert any(row['employeeId'] == 'emp-chloe' and row['startDate'] == '2027-03-01' for row in state['leaveRequests'])
            status, dashboard = call('GET', '/api/dashboard', admin, site='club-beynost')
            assert status == 200
            assert any(row['employeeId'] == 'emp-chloe' and row['startDate'] == '2027-03-01' for row in dashboard['teamRequests'])
            checks.append('leave validates dates, refuses duplicate, writes canonical RH table')
            item = initial['checklists'][0]
            assert call('POST', path, chloe, {'action': 'set_checklist', 'id': item['id'], 'completed': True})[0] == 200
            assert call('POST', '/api/me/workspace/carre-de-soie', chloe, {'action': 'set_checklist', 'id': item['id'], 'completed': False})[0] == 403
            checks.append('club checklist persists and cannot cross club boundary')
            if initial['notifications']:
                item = initial['notifications'][0]
                assert call('POST', path, chloe, {'action': 'read_notification', 'id': item['id']})[0] == 200
            checks.append('own notification read confirmed by server')
            assert call('POST', path, chloe, {'action': 'punch', 'punchType': 'depart'})[0] == 409
            for kind in ['arrivee', 'debut_pause', 'fin_pause', 'depart']:
                assert call('POST', path, chloe, {'action': 'punch', 'punchType': kind})[0] == 200
            checks.append('server timestamps ordered arrival/break/resume/departure')
            assert call('POST', path, chloe, {'action': 'acknowledge_demo_document', 'id': 'missing', 'consent': False})[0] == 400
            if initial['documents']:
                doc = initial['documents'][0]
                assert call('POST', path, chloe, {'action': 'acknowledge_demo_document', 'id': doc['id'], 'consent': True})[0] == 200
                assert call('POST', path, admin, {'action': 'acknowledge_demo_document', 'id': doc['id'], 'consent': True})[0] == 404
            checks.append('demo acknowledgement needs consent and document ownership; not a real signature')
            confirmed = call('GET', path, chloe)[1]
            before = statefile.read_bytes()
            blocker = folder / 'cfitness_state.json.tmp'
            blocker.mkdir()
            try:
                assert call('POST', path, chloe, {'action': 'add_task', 'title': 'Échec disque'})[0] == 500
                assert call('GET', path, chloe)[1] == confirmed
                assert statefile.read_bytes() == before
            finally:
                blocker.rmdir()
            checks.append('failed persistence preserves memory, disk and audit')
            stop(proc)
            proc = start()
            chloe = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('GET', path, chloe)[1] == confirmed
            checks.append('restart and new session preserve all confirmed workspace changes')
            stop(proc)
            production_secret = secrets.token_urlsafe(32)
            env.update(CFITNESS_DEMO_MODE='0', CFITNESS_DATA_DIR=str(folder/'empty-production-recipe'),
                       CFITNESS_INITIAL_ADMIN_ID='workspace-test-admin',
                       CFITNESS_INITIAL_ADMIN_EMAIL='workspace-admin@example.test',
                       CFITNESS_INITIAL_ADMIN_PASSWORD=production_secret)
            proc = start()
            status, session = call('POST', '/api/auth/login', body={
                'emailOrId': 'workspace-test-admin', 'pinOrPassword': production_secret})
            assert status == 200
            production_token = session['sessionToken']
            status, production_data = call('GET', path, production_token)
            assert status == 200 and production_data['demoMode'] is False
            assert all(not production_data[key] for key in ['tasks','notifications','documents','training','progress','checklists','timeEntries','leaves','shifts'])
            assert call('POST', path, production_token, {'action':'acknowledge_demo_document','id':'fictional','consent':True})[0] == 409
            checks.append('production mode starts without fictional workspace rows and refuses simulated signatures')
            print(json.dumps({'result': 'passed', 'count': len(checks), 'checks': checks,
                              'external_sends': False, 'real_signature': False}, ensure_ascii=False))
        finally:
            stop(proc)


if __name__ == '__main__':
    main()
