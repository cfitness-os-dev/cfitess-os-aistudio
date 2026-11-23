"""Loopback-only scenario recipe. Fictitious credentials supplied through env; no external sends."""
import concurrent.futures
import base64
import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
import zlib


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
                raw = error.read().decode('utf-8', errors='replace')
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    payload = {'message': raw}
                return error.code, payload

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
                              dict(id='welcome', type='email', enabled=True, delay=dict(amount=0, unit='minutes'), templateId=None, content='Bienvenue au club', subject='Bienvenue', comment=''),
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
            assert ws['emailDelivery']['realSendingEnabled'] is False
            assert ws['emailDelivery']['heitzCoordination'] == 'unverified'
            assert len(ws['emailOutbox']) == 1
            prepared_id = ws['emailOutbox'][0]['id']
            assert ws['emailOutbox'][0]['payload']['headers']['X-Sib-Sandbox'] == 'drop'
            # Stop/restart between steps: the second execution must keep its snapshot and continue exactly once.
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            _, ws = call('POST', endpoint, admin, dict(action='run'))
            assert ws['enrollments'][0]['status'] == 'completed'
            assert [m['id'] for m in ws['emailOutbox']] == [prepared_id]
            assert call('GET', '/api/lead/scenarios/beynost', admin)[1]['emailOutbox'] == []
            checks.append('Brevo offline payload persists across restart, sandbox enforced and club isolated')
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
            kinds = ['texte','bouton','entete','reseaux','pied','html','image','image_texte','fond_image','navbar','separateur','espace']
            def email_block(kind, index):
                return dict(id=f'block-{index}', kind=kind, text='Bonjour %prenom%', label='Réserver', url='https://example.test/rdv', image='https://example.test/image.png', alt='Illustration', html='<p>Bonjour %prenom%</p><script>alert(1)</script>', links=[dict(label='Club',url='https://example.test')], style=dict(font='Arial',fontSize=16,align='left',textColor='#123456',backgroundColor='#ffffff',radius=8,padding=[10,10,10,10],imageWidth=400,height=50,imagePosition='left',thickness=2))
            document = dict(version=1, blocks=[email_block(kind,i) for i,kind in enumerate(kinds)])
            def png_chunk(tag, data):
                return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
            png=b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+png_chunk(b'IDAT',zlib.compress(b'\x00\x7c\x3a\xed'))+png_chunk(b'IEND',b'')
            document['blocks'][6]['image']='data:image/png;base64,'+base64.b64encode(png).decode()
            block_message = dict(name='Douze blocs',channel='email',subject='Bonjour %prenom%',body='Version texte',emailDocument=document)
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('POST', endpoint+'/email-preview', body=block_message)[0] == 401
            assert call('POST', endpoint+'/email-preview', employee, block_message)[0] == 403
            disk_before_preview = (folder/'cfitness_state.json').read_bytes()
            code, preview = call('POST', endpoint+'/email-preview', admin, block_message)
            assert code == 200, preview
            assert "default-src 'none'" in preview['html'] and '<script>' not in preview['html']
            assert ' href=' not in preview['html']
            assert 'Se désabonner' in preview['html'] and 'src="https://example.test/image.png' not in preview['html']
            assert 'src="data:image/png;base64,' in preview['html']
            assert (folder/'cfitness_state.json').read_bytes() == disk_before_preview
            bad_doc=json.loads(json.dumps(block_message));bad_doc['emailDocument']['blocks'][0]['image']='data:image/svg+xml;base64,PHN2Zz4='
            assert call('POST',endpoint+'/email-preview',admin,bad_doc)[0] == 422
            saved=call('POST',endpoint,admin,dict(action='save_template',templateId=None,expectedRevision=None,message=block_message))[1]
            block_id=saved['commandResult']['templateId']
            assert len(next(t for t in saved['templates'] if t['id']==block_id)['message']['emailDocument']['blocks'])==12
            # Use a document without an unsubscribe block for a successful simulation: no real unsubscribe service is invented.
            block_message['emailDocument']['blocks']=[b for b in document['blocks'] if b['kind']!='pied']
            call('POST',endpoint,admin,dict(action='save_template',templateId=block_id,expectedRevision=1,message=block_message))
            block_definition=json.loads(json.dumps(definition));block_definition['name']='Email composé';block_definition['steps']=[dict(id='composed',type='email',enabled=True,delay=dict(amount=0,unit='minutes'),templateId=block_id,content=None,comment='',next=dict(stepId=None))]
            created=call('POST',endpoint,admin,dict(action='save',scenarioId=None,expectedRevision=None,definition=block_definition))[1]
            block_scenario=created['commandResult']['scenarioId']
            assert call('POST',endpoint,admin,dict(action='publish',scenarioId=block_scenario,expectedRevision=1))[0]==200
            block_message['emailDocument']['blocks'][0]['text']='MODIFIÉ APRÈS PUBLICATION'
            assert call('POST',endpoint,admin,dict(action='save_template',templateId=block_id,expectedRevision=2,message=block_message))[0]==200
            call('POST',endpoint,admin,dict(action='status',scenarioId=block_scenario,expectedRevision=2,active=True,enrollmentLocked=False))
            call('POST',endpoint,admin,dict(action='enroll',scenarioId=block_scenario,prospectId=prospect['id']))
            result=call('POST',endpoint,admin,dict(action='run'))[1]
            rendered=next(e for e in result['enrollments'] if e['scenarioId']==block_scenario)['history'][0]
            assert rendered['status']=='simulated' and rendered['renderedHtml']
            assert '<script>' not in rendered['renderedHtml'] and 'MODIFIÉ APRÈS PUBLICATION' not in rendered['renderedHtml']
            checks.append('twelve-block preview enforces roles, safe HTML/media, no state mutation and immutable published document')
            for expected in ['yes','no']:
                graph=json.loads(json.dumps(definition));graph['name']='Branche '+expected
                common=dict(enabled=True,delay=dict(amount=0,unit='minutes'),templateId=None,content=None,comment='')
                graph['steps']=[dict(**common,id='if',type='condition',branch=dict(predicate='consent' if expected=='yes' else 'status',values=[] if expected=='yes' else ['Client'],yesStepId='yes',noStepId='no')),
                                {**common,'id':'yes','type':'call_task','comment':'Chemin oui','next':dict(stepId=None)},
                                {**common,'id':'no','type':'call_task','comment':'Chemin non','next':dict(stepId=None)}]
                invalid=json.loads(json.dumps(graph));invalid['steps'][1]['next']['stepId']='if'
                assert call('POST',endpoint,admin,dict(action='save',scenarioId=None,expectedRevision=None,definition=invalid))[0]==422
                missing_destination=json.loads(json.dumps(graph));del missing_destination['steps'][0]['branch']['yesStepId']
                assert call('POST',endpoint,admin,dict(action='save',scenarioId=None,expectedRevision=None,definition=missing_destination))[0]==422
                response=call('POST',endpoint,admin,dict(action='save',scenarioId=None,expectedRevision=None,definition=graph))[1]
                graph_id=response['commandResult']['scenarioId']
                call('POST',endpoint,admin,dict(action='publish',scenarioId=graph_id,expectedRevision=1))
                call('POST',endpoint,admin,dict(action='status',scenarioId=graph_id,expectedRevision=2,active=True,enrollmentLocked=False))
                call('POST',endpoint,admin,dict(action='enroll',scenarioId=graph_id,prospectId=prospect['id']))
                response=call('POST',endpoint,admin,dict(action='run'))[1]
                enrollment=next(e for e in response['enrollments'] if e['scenarioId']==graph_id)
                assert enrollment['history'][0]['status']=='branched'
                stop(proc);proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
                response=call('POST',endpoint,admin,dict(action='run'))[1]
                enrollment=next(e for e in response['enrollments'] if e['scenarioId']==graph_id)
                assert enrollment['status']=='completed' and len(enrollment['history'])==2
                assert enrollment['history'][1]['stepId']==expected and enrollment['history'][1]['status']=='task_created'
                call('POST',endpoint,admin,dict(action='run'))
                actions=call('GET','/api/lead/workspace',admin)[1]['activities']
                assert sum(a['id']==enrollment['history'][1]['activityId'] for a in actions)==1
            checks.append('both conditional paths survive real restart, reject backward edges and execute only the selected task exactly once')
            # Exclusion and progress use the same atomic store; neither crosses clubs.
            pending=json.loads(json.dumps(definition)); pending['name']='Exclusion de recette'; pending['steps']=pending['steps'][:1]
            status,response=call('POST',endpoint,admin,dict(action='save',scenarioId=None,expectedRevision=None,definition=pending))
            assert status==200
            pending_id=response['commandResult']['scenarioId']
            call('POST',endpoint,admin,dict(action='publish',scenarioId=pending_id,expectedRevision=1))
            call('POST',endpoint,admin,dict(action='status',scenarioId=pending_id,expectedRevision=2,active=True,enrollmentLocked=False))
            call('POST',endpoint,admin,dict(action='enroll',scenarioId=pending_id,prospectId=prospect['id']))
            exclusion=dict(action='suppress_email',prospectId=prospect['id'],reason='Exclusion fictive demandée')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            assert call('POST',endpoint,employee,exclusion)[0]==403
            assert call('POST','/api/lead/scenarios/beynost',admin,exclusion)[0]==404
            before=call('GET',endpoint,admin)[1]
            (folder/'cfitness_state.json.tmp').mkdir()
            assert call('POST',endpoint,admin,exclusion)[0]==500
            assert call('GET',endpoint,admin)[1]['emailSuppressions']==before['emailSuppressions']
            (folder/'cfitness_state.json.tmp').rmdir()
            operation=uuid.uuid4().hex
            assert call('POST',endpoint,admin,exclusion,operation)[0]==200
            assert call('POST',endpoint,admin,exclusion,operation)[0]==200
            stop(proc);proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            response=call('POST',endpoint,admin,dict(action='run'))[1]
            enrollment=next(e for e in response['enrollments'] if e['scenarioId']==pending_id)
            assert enrollment['history'][0]['status']=='skipped'
            assert len(response['emailOutbox'])==len(before['emailOutbox'])
            assert len(response['emailSuppressions'])==1
            assert call('GET','/api/lead/scenarios/beynost',admin)[1]['emailSuppressions']==[]
            checks.append('email exclusion enforces role/club, rollback on disk failure, replay and restart before pending step')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
