"""Loopback-only scenario recipe. Fictitious credentials supplied through env; no external sends."""
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
import uuid


def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    checks = []
    binary = str(Path(os.environ.get('CFITNESS_TEST_BINARY', 'target/debug/cfitness-os')).resolve())
    with tempfile.TemporaryDirectory(prefix='lead-scenarios-') as directory:
        folder = Path(directory)
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}', 'CFITNESS_DATA_DIR': directory,
               'CFITNESS_DEMO_MODE': '1', 'CFITNESS_STRICT_SESSION': '1', 'CFITNESS_AUTOMATION_SCHEDULER': '0',
               'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_ALLOWED_ORIGINS': base}

        def call(method, path, token=None, body=None, op=None):
            headers = {'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            if body is not None:
                headers['x-cfitness-operation-id'] = op or uuid.uuid4().hex
            request = urllib.request.Request(base + path, method=method, headers=headers,
                                            data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(request, timeout=5) as reply:
                    return reply.status, json.load(reply)
            except urllib.error.HTTPError as error:
                return error.code, json.load(error)

        def start():
            proc = subprocess.Popen([binary], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError('Local recipe server stopped')
                try:
                    if call('GET', '/api/health')[0] == 200:
                        return proc
                except OSError:
                    pass
                time.sleep(.05)
            proc.terminate()
            proc.wait(timeout=5)
            raise RuntimeError('Local recipe server not ready')

        def stop(proc):
            proc.terminate()
            proc.wait(timeout=5)

        def login(actor, secret_env):
            status, result = call('POST', '/api/auth/login', body={'emailOrId': actor, 'pinOrPassword': os.environ[secret_env]})
            assert status == 200, ('login failed', status)
            return result['sessionToken']

        endpoint = '/api/lead/scenarios/carre-de-soie'
        definition = dict(schemaVersion=1, clubId='carre-de-soie', name='Parcours de recette', mode='manual', active=False,
                          enrollmentLocked=False, conditions=None, steps=[
                              dict(id='welcome', type='email', enabled=True, delay=dict(amount=0, unit='minutes'), templateId=None, content='Bienvenue au club', comment=''),
                              dict(id='call', type='call_task', enabled=True, delay=dict(amount=0, unit='minutes'), templateId=None, content=None, comment='Rappel fictif de préparation')])
        proc = start()
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('GET', endpoint)[0] == 401
            assert call('GET', endpoint, employee)[0] == 403
            assert call('GET', '/api/lead/scenarios/inconnu', admin)[0] == 400
            checks.append('Bearer, role and club checks run through the real HTTP router')
            create = dict(action='save', scenarioId=None, expectedRevision=None, definition=definition)
            operation = uuid.uuid4().hex
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                responses = list(pool.map(lambda _: call('POST', endpoint, admin, create, operation), range(2)))
            assert all(status == 200 for status, _ in responses)
            ws = call('GET', endpoint, admin)[1]
            assert len(ws['scenarios']) == 1
            scenario = ws['scenarios'][0]
            changed = {**create, 'definition': {**definition, 'name': 'Autre contenu'}}
            assert call('POST', endpoint, admin, changed, operation)[0] == 409
            checks.append('concurrent create retries deduplicated; operation id rejects different payload')
            assert call('POST', endpoint, admin, dict(action='publish', scenarioId=scenario['id'], expectedRevision=99))[0] == 409
            ws = call('POST', endpoint, admin, dict(action='publish', scenarioId=scenario['id'], expectedRevision=1))[1]
            ws = call('POST', endpoint, admin, dict(action='status', scenarioId=scenario['id'], expectedRevision=2, active=True, enrollmentLocked=False))[1]
            prospect = next(p for p in ws['prospects'] if p['id'])
            cmd = dict(action='enroll', scenarioId=scenario['id'], prospectId=prospect['id'])
            assert call('POST', endpoint, admin, cmd)[0] == 200
            assert call('POST', endpoint, admin, cmd)[0] == 200
            assert len(call('GET', endpoint, admin)[1]['enrollments']) == 1
            checks.append('publication revisions and one enrollment per contact/scenario')
            # Find a contact with a real, active fixture commercial for the canonical task.
            state = json.loads((folder / 'cfitness_state.json').read_text())
            enrolled = next(p for p in state['leadProspects'] if p['id'] == prospect['id'])
            # Fixtures can be unassigned; explicitly adjust only the disposable fixture between process runs.
            stop(proc)
            enrolled['assignedToId'] = 'emp-maxime'
            enrolled['rgpdConsent'] = True
            enrolled['email'] = 'scenario@example.test'
            (folder / 'cfitness_state.json').write_text(json.dumps(state))
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            _, ws = call('POST', endpoint, admin, dict(action='run'))
            assert ws['enrollments'][0]['history'][0]['status'] == 'simulated'
            # Stop/restart between steps: the second execution must keep its snapshot and continue exactly once.
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            _, ws = call('POST', endpoint, admin, dict(action='run'))
            assert ws['enrollments'][0]['status'] == 'completed'
            assert ws['enrollments'][0]['history'][1]['status'] == 'task_created'
            task_id = ws['enrollments'][0]['history'][1]['activityId']
            call('POST', endpoint, admin, dict(action='run'))
            activities = call('GET', '/api/lead/workspace', admin)[1]['activities']
            assert sum(a['id'] == task_id for a in activities) == 1
            checks.append('email simulation then canonical activity after real server restart; no duplicate on next run')
            # A second club cannot mutate or enroll into a first-club scenario.
            assert call('POST', '/api/lead/scenarios/beynost', admin, dict(action='publish', scenarioId=scenario['id'], expectedRevision=3))[0] == 404
            bad = {**create, 'definition': {**definition, 'clubId': 'beynost'}}
            assert call('POST', endpoint, admin, bad)[0] == 422
            checks.append('cross-club identifiers and payloads rejected')
            disk = (folder / 'cfitness_state.json').read_bytes()
            (folder / 'cfitness_state.json.tmp').mkdir()
            assert call('POST', endpoint, admin, create)[0] == 500
            assert (folder / 'cfitness_state.json').read_bytes() == disk
            assert len(call('GET', endpoint, admin)[1]['scenarios']) == 1
            (folder / 'cfitness_state.json.tmp').rmdir()
            checks.append('disk failure returns 500 without false success, in-memory scenario or file mutation')
            # New login has a separate Bearer, still sees exactly the persisted scenario/history.
            second = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            final = call('GET', endpoint, second)[1]
            assert len(final['enrollments'][0]['history']) == 2
            assert final['enrollments'][0]['version'] == 1
            checks.append('independent session reads persisted version, progression and history')
            message = dict(name='Accueil personnalisé', channel='email', subject='Bonjour %prenom%', body='Bienvenue %prenom% au %club%')
            template_cmd = dict(action='save_template', templateId=None, expectedRevision=None, message=message)
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('POST', endpoint, employee, template_cmd)[0] == 403
            operation = uuid.uuid4().hex
            assert call('POST', endpoint, admin, template_cmd, operation)[0] == 200
            assert call('POST', endpoint, admin, template_cmd, operation)[0] == 200
            ws = call('GET', endpoint, admin)[1]
            assert len(ws['templates']) == 1
            template = ws['templates'][0]
            assert call('GET', '/api/lead/scenarios/beynost', admin)[1]['templates'] == []
            templated = json.loads(json.dumps(definition))
            templated['name'] = 'Parcours avec modèle'
            templated['steps'] = [{**templated['steps'][0], 'templateId': template['id'], 'content': None}]
            ws = call('POST', endpoint, admin, dict(action='save', scenarioId=None, expectedRevision=None, definition=templated))[1]
            second_scenario = ws['scenarios'][-1]
            assert call('POST', endpoint, admin, dict(action='publish', scenarioId=second_scenario['id'], expectedRevision=1))[0] == 200
            edit_template = dict(action='save_template', templateId=template['id'], expectedRevision=1, message={**message, 'body': 'Modèle modifié après publication'})
            assert call('POST', endpoint, admin, edit_template)[0] == 200
            assert call('POST', endpoint, admin, edit_template)[0] == 409
            assert call('POST', endpoint, admin, dict(action='archive_template', templateId=template['id'], expectedRevision=2))[0] == 200
            ws = call('POST', endpoint, admin, dict(action='status', scenarioId=second_scenario['id'], expectedRevision=2, active=True, enrollmentLocked=False))[1]
            assert call('POST', endpoint, admin, dict(action='enroll', scenarioId=second_scenario['id'], prospectId=prospect['id']))[0] == 200
            ws = call('POST', endpoint, admin, dict(action='run'))[1]
            execution = next(e for e in ws['enrollments'] if e['scenarioId'] == second_scenario['id'])['history'][0]
            assert execution['status'] == 'simulated'
            assert execution['renderedContent'].startswith('Bienvenue ')
            assert '%prenom%' not in execution['renderedContent']
            assert execution['renderedSubject'].startswith('Bonjour ')
            assert call('POST', endpoint, admin, dict(action='publish', scenarioId=second_scenario['id'], expectedRevision=3))[0] == 422
            checks.append('template role/club isolation, retries, stale edits, frozen publication and variable rendering survive template archive')
            assert call('POST', endpoint, admin, dict(action='copy_template', templateId=template['id'], destinationClubId='beynost'))[0] == 200
            copied = call('GET', '/api/lead/scenarios/beynost', admin)[1]['templates'][0]
            assert copied['clubId'] == 'beynost' and not copied['archived'] and copied['id'] != template['id']
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            restored = call('GET', endpoint, admin)[1]
            assert restored['templates'][0]['archived']
            assert restored['templates'][0]['message']['body'] == 'Modèle modifié après publication'
            restored_execution = next(e for e in restored['enrollments'] if e['scenarioId'] == second_scenario['id'])['history'][0]
            assert restored_execution['renderedContent'] == execution['renderedContent']
            assert len(call('GET', '/api/lead/scenarios/beynost', admin)[1]['templates']) == 1
            checks.append('template copy and immutable rendered execution persist after real process restart')
            def concurrent_template(label):
                cmd = dict(action='save_template', templateId=None, expectedRevision=None, message={**message, 'name': 'Même nom', 'body': label})
                operation = uuid.uuid4().hex
                status, response = call('POST', endpoint, admin, cmd, operation)
                assert status == 200
                created_id = response['commandResult']['templateId']
                assert next(t for t in response['templates'] if t['id'] == created_id)['message']['body'] == label
                replay = call('POST', endpoint, admin, cmd, operation)[1]
                assert replay['commandResult']['templateId'] == created_id
                return created_id
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                ids = list(pool.map(concurrent_template, ['Variation A', 'Variation B']))
            assert len(set(ids)) == 2
            checks.append('concurrent distinct creates return their own stable entity id, including replay after other creates')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
