"""Real loopback HTTP recipe; fictitious data, local email/SMS preparation only."""
import concurrent.futures
import datetime as dt
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
from zoneinfo import ZoneInfo


def main():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    binary = str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    checks = []
    with tempfile.TemporaryDirectory(prefix='sms-schedules-') as directory:
        folder = Path(directory)
        state_file = folder / 'cfitness_state.json'
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}', 'CFITNESS_DATA_DIR': directory,
               'CFITNESS_DEMO_MODE': '1', 'CFITNESS_STRICT_SESSION': '1', 'CFITNESS_AUTOMATION_SCHEDULER': '0',
               'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_CAMPAIGNS_WORKER': '0', 'CFITNESS_ALLOWED_ORIGINS': base}

        def call(method, path, token=None, body=None, operation=None):
            headers = {'Content-Type': 'application/json'}
            if token:
                headers['Authorization'] = 'Bearer ' + token
            if body is not None:
                headers['x-cfitness-operation-id'] = operation or uuid.uuid4().hex
            request = urllib.request.Request(base + path, method=method, headers=headers,
                                            data=None if body is None else json.dumps(body).encode())
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status, json.load(response)
            except urllib.error.HTTPError as error:
                raw = error.read().decode()
                try:
                    payload = json.loads(raw)
                except json.JSONDecodeError:
                    payload = {'message': raw}
                return error.code, payload

        def start(worker=False):
            proc = subprocess.Popen([binary], env={**env, 'CFITNESS_CAMPAIGNS_WORKER': '1' if worker else '0'},
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError('Local recipe process stopped')
                try:
                    if call('GET', '/api/health')[0] == 200:
                        return proc
                except OSError:
                    pass
                time.sleep(.05)
            proc.terminate()
            proc.wait(timeout=5)
            raise RuntimeError('Local server unavailable')

        def stop(proc):
            proc.terminate()
            proc.wait(timeout=5)

        def login(actor, key):
            status, result = call('POST', '/api/auth/login', body={'emailOrId': actor, 'pinOrPassword': os.environ[key]})
            assert status == 200, status
            return result['sessionToken']

        endpoint = '/api/lead/scenarios/carre-de-soie'
        proc = start()
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')

            def post(body, operation=None):
                status, result = call('POST', endpoint, admin, body, operation)
                assert status == 200, (status, result)
                return result

            def workspace():
                status, result = call('GET', endpoint, admin)
                assert status == 200
                return result

            contact = workspace()['prospects'][0]['id']
            post(dict(action='set_sms_consent', prospectId=contact, granted=True, expectedRevision=None, reason='Accord fictif recette programmation'))
            message = dict(name='SMS programmation', channel='sms', subject='', body='Message figé pour %prenom%')
            response = post(dict(action='save_template', templateId=None, expectedRevision=None, message=message))
            template_id = response['commandResult']['templateId']

            def create(name):
                return post(dict(action='save_campaign', campaignId=None, expectedRevision=None, name=name,
                                 templateId=template_id, statusIds=[], sourceIds=[], segmentIds=[]))['commandResult']['campaignId']

            def row(campaign_id):
                return next(r['campaign'] for r in workspace()['campaigns'] if r['campaign']['id'] == campaign_id)

            future = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=2)).astimezone(ZoneInfo('Europe/Paris')).strftime('%Y-%m-%dT%H:%M')

            def plan(campaign_id, revision=1):
                return dict(action='schedule_campaign', campaignId=campaign_id, expectedRevision=revision,
                            localDateTime=future, timezone='Europe/Paris')

            def due(campaign_id):
                # The fixture clock is advanced by changing only this disposable persisted schedule.
                fixture = json.loads(state_file.read_text())
                c = next(c for c in fixture['leadScenarios']['campaigns'] if c['id'] == campaign_id)
                for s in c['schedules']:
                    if s['status'] == 'scheduled':
                        s['scheduledAt'] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)).isoformat()
                state_file.write_text(json.dumps(fixture))

            cid = create('Programmation à annuler')
            command = plan(cid)
            assert call('POST', endpoint, employee, command)[0] == 403
            assert call('POST', '/api/lead/scenarios/beynost', admin, command)[0] == 404
            for invalid in [{**command, 'localDateTime': '2000-01-01T12:00'}, {**command, 'timezone': 'UTC'},
                            {**command, 'localDateTime': '2027-02-31T12:00'}]:
                assert call('POST', endpoint, admin, invalid)[0] == 422
            operation = uuid.uuid4().hex
            (folder/'cfitness_state.json.tmp').mkdir()
            assert call('POST', endpoint, admin, command)[0] == 500
            assert row(cid)['schedules'] == []
            (folder/'cfitness_state.json.tmp').rmdir()
            post(command, operation)
            post(command, operation)
            schedule = row(cid)['schedules'][0]
            assert len(row(cid)['schedules']) == 1 and schedule['status'] == 'scheduled'
            assert dt.datetime.fromisoformat(schedule['scheduledAt']) == dt.datetime.fromisoformat(future).replace(tzinfo=ZoneInfo('Europe/Paris'))
            assert call('POST', endpoint, admin, command)[0] == 409
            assert call('POST', endpoint, admin, dict(action='simulate_campaign', campaignId=cid, expectedRevision=1))[0] == 409
            assert call('POST', endpoint, admin, dict(action='archive_campaign', campaignId=cid, expectedRevision=1))[0] == 409
            assert call('POST', endpoint, admin, dict(action='save_campaign', campaignId=cid, expectedRevision=1, name='Édition interdite', templateId=template_id, statusIds=[], sourceIds=[], segmentIds=[]))[0] == 409
            post(dict(action='run_campaigns'))
            assert workspace()['smsOutbox'] == []
            checks.append('schedule validates role, club, future Paris time, replay, duplicate scheduling and prevents immediate execution/edit/archive while pending')

            cancel = dict(action='cancel_campaign_schedule', campaignId=cid, expectedRevision=1, scheduleId=schedule['id'], reason='Annulation fictive')
            assert call('POST', endpoint, employee, cancel)[0] == 403
            assert call('POST', '/api/lead/scenarios/beynost', admin, cancel)[0] == 404
            assert call('POST', endpoint, admin, {**cancel, 'reason': ''})[0] == 422
            assert call('POST', endpoint, admin, {**cancel, 'scheduleId': 'unknown'})[0] == 404
            (folder/'cfitness_state.json.tmp').mkdir()
            assert call('POST', endpoint, admin, cancel)[0] == 500
            assert row(cid)['schedules'][0]['status'] == 'scheduled'
            (folder/'cfitness_state.json.tmp').rmdir()
            operation = uuid.uuid4().hex
            post(cancel, operation)
            post(cancel, operation)
            assert call('POST', endpoint, admin, cancel)[0] == 409
            assert row(cid)['schedules'][0]['cancelledBy'] == 'emp-mario'
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            assert row(cid)['schedules'][0]['status'] == 'cancelled'
            # The same campaign version can be rescheduled after cancellation, preserving the trace.
            post(plan(cid))
            assert len(row(cid)['schedules']) == 2
            post({**cancel, 'scheduleId': row(cid)['schedules'][1]['id']})
            checks.append('cancellation is role/club scoped, reasoned, atomic on disk failure, replay-safe and durable; rescheduling preserves cancelled history')

            executed = create('Message figé')
            post(plan(executed))
            post(dict(action='save_template', templateId=template_id, expectedRevision=1, message={**message, 'body': 'Nouveau texte non programmé'}))
            stop(proc)
            due(executed)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            before = workspace()
            (folder/'cfitness_state.json.tmp').mkdir()
            assert call('POST', endpoint, admin, dict(action='run_campaigns'))[0] == 500
            assert workspace()['smsOutbox'] == before['smsOutbox'] and row(executed)['schedules'][0]['status'] == 'scheduled'
            (folder/'cfitness_state.json.tmp').rmdir()
            post(dict(action='run_campaigns'))
            outbox = workspace()['smsOutbox']
            assert len(outbox) == 1 and 'Message figé pour' in outbox[0]['content'] and '%prenom%' not in outbox[0]['content']
            assert row(executed)['schedules'][0]['status'] == 'simulated'
            assert call('POST', endpoint, admin, dict(action='cancel_campaign_schedule', campaignId=executed, expectedRevision=1, scheduleId=row(executed)['schedules'][0]['id'], reason='Trop tard'))[0] == 409
            stop(proc)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert len(workspace()['smsOutbox']) == 1
            checks.append('due simulation freezes the template, personalizes at execution, rolls back on disk failure and persists exactly once across real restart')

            stopped = create('STOP avant échéance')
            post(plan(stopped))
            post(dict(action='stop_sms', prospectId=contact, reason='STOP fictif avant échéance'))
            stop(proc)
            due(stopped)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert len(workspace()['smsOutbox']) == 1
            assert row(stopped)['runs'][-1]['audience']['eligibleIds'] == []
            assert row(stopped)['schedules'][0]['status'] == 'simulated'
            checks.append('STOP received after scheduling excludes the contact at execution without rewriting earlier preparations')

            revoked = create('Droits retirés avant échéance')
            post(plan(revoked))
            stop(proc)
            due(revoked)
            fixture = json.loads(state_file.read_text())
            actor = next(e for e in fixture['employees'] if e['id'] == 'emp-mario')
            original_access = actor['siteAccesses']
            actor['siteAccesses'] = []
            state_file.write_text(json.dumps(fixture))
            # Actual background worker runs while scenarios worker remains disabled.
            proc = start(worker=True)
            for _ in range(120):
                saved = json.loads(state_file.read_text())
                c = next(c for c in saved['leadScenarios']['campaigns'] if c['id'] == revoked)
                if c['schedules'][0]['status'] == 'failed':
                    break
                time.sleep(.1)
            assert c['schedules'][0]['status'] == 'failed'
            assert len(saved['leadScenarios']['smsOutbox']) == 1
            stop(proc)
            fixture = json.loads(state_file.read_text())
            next(e for e in fixture['employees'] if e['id'] == 'emp-mario')['siteAccesses'] = original_access
            # Return consent only inside the disposable fixture to exercise execution/cancel race.
            for pref in fixture['leadScenarios']['smsPreferences']:
                pref['stopped'] = False
                pref['granted'] = True
            state_file.write_text(json.dumps(fixture))
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            checks.append('real background worker operates independently of scenarios and refuses execution when the scheduling actor lost club rights')

            raced = create('Annulation concurrente')
            post(plan(raced))
            race_id = row(raced)['schedules'][0]['id']
            stop(proc)
            due(raced)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                cancel_future = pool.submit(call, 'POST', endpoint, admin, dict(action='cancel_campaign_schedule', campaignId=raced, expectedRevision=1, scheduleId=race_id, reason='Course fictive'))
                run_future = pool.submit(call, 'POST', endpoint, admin, dict(action='run_campaigns'))
                cancel_status = cancel_future.result()[0]
                assert run_future.result()[0] == 200 and cancel_status in (200, 409)
            final = row(raced)['schedules'][0]['status']
            assert final in ('cancelled', 'simulated')
            assert len(workspace()['smsOutbox']) == (1 if final == 'cancelled' else 2)
            post(dict(action='run_campaigns'))
            assert len(workspace()['smsOutbox']) <= 2
            checks.append('concurrent cancellation/execution has one atomic winner and cannot prepare duplicate SMS')

            automatic = create('Exécution automatique réelle locale')
            post(plan(automatic))
            stop(proc)
            due(automatic)
            proc = start(worker=True)
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            for _ in range(120):
                if row(automatic)['schedules'][0]['status'] == 'simulated':
                    break
                time.sleep(.1)
            assert row(automatic)['schedules'][0]['status'] == 'simulated'
            expected_count = 2 if final == 'cancelled' else 3
            assert len(workspace()['smsOutbox']) == expected_count
            stop(proc)
            proc = start(worker=True)
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert len(workspace()['smsOutbox']) == expected_count
            checks.append('real background worker resumes a due persisted campaign at startup and does not duplicate it after another restart')

            # Email uses the same scheduler with the same atomic/offline guarantees.
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            email_message = dict(name='Email programmé', channel='email', subject='Découverte %prenom%', body='Email figé pour %prenom%')
            email_template = post(dict(action='save_template', templateId=None, expectedRevision=None, message=email_message))['commandResult']['templateId']

            def create_email(name):
                return post(dict(action='save_campaign', campaignId=None, expectedRevision=None, name=name, templateId=email_template, statusIds=[], sourceIds=[], segmentIds=[]))['commandResult']['campaignId']

            email_id = create_email('Email à échéance')
            assert call('POST', endpoint, employee, plan(email_id))[0] == 403
            assert call('POST', '/api/lead/scenarios/beynost', admin, plan(email_id))[0] == 404
            post(plan(email_id))
            assert row(email_id)['channel'] == 'email'
            post(dict(action='save_template', templateId=email_template, expectedRevision=1, message={**email_message, 'subject':'Objet changé', 'body':'Texte changé après programmation'}))
            stop(proc)
            due(email_id)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            before = workspace()
            (folder/'cfitness_state.json.tmp').mkdir()
            assert call('POST', endpoint, admin, dict(action='run_campaigns'))[0] == 500
            assert row(email_id)['schedules'][0]['status'] == 'scheduled' and workspace()['emailOutbox'] == before['emailOutbox']
            (folder/'cfitness_state.json.tmp').rmdir()
            post(dict(action='run_campaigns'))
            after = workspace()
            assert len(after['emailOutbox']) == len(before['emailOutbox'])+1
            email = after['emailOutbox'][-1]
            assert email['payload']['subject'].startswith('Découverte ') and 'Email figé pour' in email['payload']['textContent']
            assert '%prenom%' not in email['payload']['textContent'] and email['payload']['headers']['X-Sib-Sandbox'] == 'drop'
            assert after['smsOutbox'] == before['smsOutbox']
            stop(proc)
            proc = start(worker=True)
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert len(workspace()['emailOutbox']) == len(after['emailOutbox']) and row(email_id)['schedules'][0]['status'] == 'simulated'
            checks.append('scheduled email freezes subject/body, enforces role/club, rolls back on disk failure and survives restart without duplicate offline Brevo preparation')

            excluded_email = create_email('Email exclu avant échéance')
            post(plan(excluded_email))
            post(dict(action='suppress_email', prospectId=contact, reason='Retrait fictif avant échéance email'))
            stop(proc)
            due(excluded_email)
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert len(workspace()['emailOutbox']) == len(after['emailOutbox'])
            assert row(excluded_email)['runs'][-1]['audience']['eligibleIds'] == []
            assert any('exclue' in r['reason'] for r in row(excluded_email)['runs'][-1]['audience']['excluded'])
            checks.append('email exclusion added after scheduling is rechecked at the due time without changing earlier history or SMS preferences')

            cancelled_email = create_email('Email annulé')
            post(plan(cancelled_email))
            email_schedule_id = row(cancelled_email)['schedules'][0]['id']
            post(dict(action='cancel_campaign_schedule', campaignId=cancelled_email, expectedRevision=1, scheduleId=email_schedule_id, reason='Campagne fictive annulée'))
            stop(proc)
            due(cancelled_email)
            proc = start(worker=True)
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert row(cancelled_email)['schedules'][0]['status'] == 'cancelled' and row(cancelled_email)['runs'] == []
            assert len(workspace()['emailOutbox']) == len(after['emailOutbox'])
            checks.append('email cancellation remains durable across restart and cannot create a later preparation')

            inconsistent_email = create_email('Canal restauré incohérent')
            post(plan(inconsistent_email))
            stop(proc)
            due(inconsistent_email)
            fixture = json.loads(state_file.read_text())
            next(c for c in fixture['leadScenarios']['campaigns'] if c['id'] == inconsistent_email)['schedules'][0]['message']['channel'] = 'sms'
            state_file.write_text(json.dumps(fixture))
            proc = start()
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            post(dict(action='run_campaigns'))
            assert row(inconsistent_email)['schedules'][0]['status'] == 'failed'
            assert len(workspace()['emailOutbox']) == len(after['emailOutbox']) and workspace()['smsOutbox'] == after['smsOutbox']
            checks.append('restored mismatched email/SMS channels fail without adding any message preparation')
        finally:
            if proc.poll() is None:
                stop(proc)
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
