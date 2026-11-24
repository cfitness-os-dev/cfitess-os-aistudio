"""Manager/employee HTTP recipe against a disposable loopback-only Rust server.

Requires CFITNESS_TEST_ADMIN_SECRET and CFITNESS_TEST_COMMERCIAL_SECRET for
the built-in fictional accounts. Never accepts a remote base URL.
"""
import concurrent.futures
import copy
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
    binary = str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
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
               'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_CAMPAIGNS_WORKER': '0',
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


        proc=start()
        root='/api/hr/organisation/'
        cds='club-carre-soie'
        bey='club-beynost'
        statefile=folder/'cfitness_state.json'
        try:
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            def read(site=cds,token=None):
                code,value=call('GET',root+site,token or admin)
                assert code==200,(code,value)
                return value
            def mutate(command,site=cds,token=None,revision=None):
                return call('POST',root+site,token or admin,dict(expectedRevision=revision or read(site,token)['revision'],command=command))
            def success(command,site=cds):
                code,value=mutate(command,site)
                assert code==200,(code,value,command)
                return value
            assert call('GET',root+cds)[0]==401
            assert call('GET',root+'unknown',admin)[0]==404
            assert call('GET',root+cds,employee)[0]==403
            checks.append('session, unknown club and unauthorized club refused')
            initial=read()
            assert initial['actorId']=='emp-mario' and initial['siteId']==cds
            assert all(t['siteId']==cds for t in initial['teams'])
            assert 'employees' not in initial and 'iban' not in json.dumps(initial).lower()
            checks.append('canonical snapshot is scoped and excludes employee/payroll/session data')
            old=initial['revision']
            team_command=dict(action='save_team',id=None,name='  Équipe recette  ')
            saved=success(team_command)
            team=next(t for t in saved['teams'] if t['name']=='Équipe recette')
            assert mutate(team_command,revision=old)[0]==409
            assert mutate(dict(team_command,name='équipe recette'))[0]==409
            assert sum(t['id']==team['id'] for t in read()['teams'])==1
            assert not any(t['id']==team['id'] for t in read(bey)['teams'])
            checks.append('team creation trims names, rejects duplicates/stale replay and remains isolated by club')
            renamed=success(dict(action='save_team',id=team['id'],name='Accueil recette'))
            assert next(t for t in renamed['teams'] if t['id']==team['id'])['name']=='Accueil recette'
            assert mutate(dict(action='save_team',id=team['id'],name='Intrusion'),bey)[0]==404
            assert mutate(dict(action='save_team',id=None,name=' '*3))[0]==400
            assert mutate(dict(action='save_team',id=None,name='x'*101))[0]==400
            checks.append('rename uses stable team id; invalid names and cross-club ids refused')
            position_command=dict(action='save_position',id=None,label='Poste recette',color='#8b5cf6',defaultBreakMinutes=20,active=True)
            saved=success(position_command)
            position=next(p for p in saved['positions'] if p['label']=='Poste recette')
            for bad in [dict(position_command,color='red'),dict(position_command,defaultBreakMinutes=181)]:
                assert mutate(bad)[0]==400
            saved=success(dict(position_command,id=position['id'],active=False,defaultBreakMinutes=25))
            assert not next(p for p in saved['positions'] if p['id']==position['id'])['active']
            assert mutate(dict(position_command,id=position['id']),bey)[0]==404
            checks.append('positions retain stable references, validate colour/break, deactivate and reject cross-club edits')
            fixture=json.loads(statefile.read_text())
            target=next(e for e in fixture['employees'] if e['id']=='emp-maxime')
            access=copy.deepcopy(target['siteAccesses'])
            a=next(a for a in access if a['siteId']==cds)
            a['teamIds']=list(dict.fromkeys(a['teamIds']+[team['id']]))
            assert call('PUT','/api/admin/employees/emp-maxime/site-accesses',admin,dict(siteAccesses=access))[0]==200
            assert mutate(dict(action='remove_team',id=team['id']))[0]==409
            assert next(e for e in json.loads(statefile.read_text())['employees'] if e['id']=='emp-maxime')['siteAccesses']==access
            duplicate=copy.deepcopy(access)
            next(a for a in duplicate if a['siteId']==cds)['teamIds'].append(team['id'])
            assert call('PUT','/api/admin/employees/emp-maxime/site-accesses',admin,dict(siteAccesses=duplicate))[0]==400
            checks.append('new teams are usable by canonical employee assignments; in-use deletion and duplicate memberships refused')
            removable=success(dict(action='save_team',id=None,name='Équipe inutilisée'))
            remove=next(t for t in removable['teams'] if t['name']=='Équipe inutilisée')
            success(dict(action='remove_team',id=remove['id']))
            assert not any(t['id']==remove['id'] for t in read()['teams'])
            checks.append('unused team deletion succeeds without touching other teams')
            managed=success(dict(action='save_team',id=None,name='Équipe encadrée seulement'))
            managed_team=next(t for t in managed['teams'] if t['name']=='Équipe encadrée seulement')
            own_accesses=copy.deepcopy(next(e for e in json.loads(statefile.read_text())['employees'] if e['id']=='emp-mario')['siteAccesses'])
            own_site=next(a for a in own_accesses if a['siteId']==cds)
            own_site['managedTeamIds']=list(dict.fromkeys(own_site.get('managedTeamIds',[])+[managed_team['id']]))
            assert call('PUT','/api/admin/employees/emp-mario/site-accesses',admin,dict(siteAccesses=own_accesses))[0]==200
            assert mutate(dict(action='remove_team',id=managed_team['id']))[0]==409
            own_site['managedTeamIds'].remove(managed_team['id'])
            assert call('PUT','/api/admin/employees/emp-mario/site-accesses',admin,dict(siteAccesses=own_accesses))[0]==200
            success(dict(action='remove_team',id=managed_team['id']))
            checks.append('managed-team references alone block deletion until explicitly removed, separately from employee membership')
            before=read()
            original_settings=copy.deepcopy(before['site']['settings'])
            club=dict(action='save_club',name='Carré de Soie recette',address='Adresse fictive',city='Lyon',siret='12345678900011')
            saved=success(club)
            assert saved['site']['name']==club['name'] and saved['site']['settings']==original_settings
            assert mutate(dict(club,siret='invalid'))[0]==400
            assert mutate(dict(club,name=''))[0]==400
            assert call('POST',root+cds,admin,dict(expectedRevision=read()['revision'],command=dict(club,timezone='UTC')))[0]==422
            checks.append('club identity persists with strict fields; unrelated timeclock/planning settings unchanged')
            org=read()['organization']
            body={k:v for k,v in org.items() if k!='id'}
            body.update(action='save_organization',name='Société recette',contactEmail='test@example.invalid')
            success(body)
            assert read(bey)['organization']['name']=='Société recette'
            for bad in [dict(body,name=''),dict(body,contactEmail='not-an-email'),dict(body,siren='123'),dict(body,mealAllowanceEur=-1)]:
                assert mutate(bad)[0]==400
            before=statefile.read_bytes()
            assert call('PUT','/api/admin/organization',admin,dict(name=''))[0]==400
            assert statefile.read_bytes()==before
            checks.append('organization is canonical across clubs and invalid legacy/new writes preserve persisted state')
            profiles=read()['profiles']
            profile=next(p for p in profiles if p['id']=='planificateur_standard')
            row=next(r for r in profile['rows'] if r['exposed'] and r['editableControl'] and r['checked'])
            profile_command=dict(action='save_profile',profileId=profile['id'],scopeSelected=profile['scopeSelected'],checkedMap={row['actionId']:False})
            saved=success(profile_command)
            assert next(r for p in saved['profiles'] if p['id']==profile['id'] for r in p['rows'] if r['actionId']==row['actionId'])['checked'] is False
            assert next(r for p in read(bey)['profiles'] if p['id']==profile['id'] for r in p['rows'] if r['actionId']==row['actionId'])['checked'] is False
            locked=next(r for p in profiles if p['id']=='admin_systeme' for r in p['rows'] if not r['editableControl'])
            assert mutate(dict(profile_command,profileId='admin_systeme',scopeSelected='sites',checkedMap={locked['actionId']:False}))[0]==403
            assert mutate(dict(profile_command,checkedMap={'invented-action':True}))[0]==403
            assert mutate(dict(profile_command,scopeSelected='planet'))[0]==403
            checks.append('profile changes are shared explicitly and use existing non-elevation/locked-row/scope validation')
            before=statefile.read_bytes()
            memory=read()
            blocker=folder/'cfitness_state.json.tmp'
            blocker.mkdir()
            try:
                assert mutate(dict(action='save_team',id=None,name='Ne doit pas exister'))[0]==500
                assert read()==memory and statefile.read_bytes()==before
            finally:blocker.rmdir()
            checks.append('disk failure rolls back configuration, memory and audit; no false confirmed save')
            revision=read()['revision']
            commands=[dict(action='save_team',id=None,name='Course A'),dict(action='save_team',id=None,name='Course B')]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                jobs=[pool.submit(mutate,c,revision=revision) for c in commands]
                codes=[job.result()[0] for job in jobs]
            assert sorted(codes)==[200,409],codes
            checks.append('concurrent edits with one revision have one winner, preventing lost updates')
            stop(proc);proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            assert read()['site']['name']==club['name']
            assert any(t['id']==team['id'] for t in read()['teams'])
            assert not next(p for p in read()['positions'] if p['id']==position['id'])['active']
            assert read()['organization']['name']=='Société recette'
            fixture=json.loads(statefile.read_text())
            assert any(e['actionType']=='HR_TEAM_SAVE' for e in fixture['auditLog'])
            checks.append('real restart preserves club/organization/teams/positions/rights and audit')
            # Controlled privilege variants in the disposable file, only while stopped.
            stop(proc)
            fixture=json.loads(statefile.read_text())
            original=copy.deepcopy(fixture)
            mario=next(e for e in fixture['employees'] if e['id']=='emp-mario')
            next(a for a in mario['siteAccesses'] if a['siteId']==cds)['profileId']='master_avance'
            next(a for a in mario['siteAccesses'] if a['siteId']==bey)['profileId']='lecture_seule_avancee'
            statefile.write_text(json.dumps(fixture))
            proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            limited=read()
            assert limited['capabilities']['manageTeams'] and not limited['capabilities']['editOrganization'] and not limited['capabilities']['editProfiles']
            assert limited['organization'] is None
            assert mutate(dict(action='save_team',id=None,name='Équipe Master'))[0]==200
            assert mutate(body)[0]==403
            assert mutate(profile_command)[0]==403
            assert call('PUT','/api/admin/organization',admin,dict(name='Interdit'))[0]==403
            assert call('PUT','/api/admin/profiles/'+profile['id'],admin,dict(scopeSelected=profile['scopeSelected'],checkedMap={}))[0]==403
            assert call('PUT','/api/admin/delegations',admin,dict(delegations=[]))[0]==403
            checks.append('Master club delegation may manage teams but cannot edit global organization/profiles/delegations through legacy or new APIs')
            # Owner on CDS only cannot use global admin status on Beynost.
            stop(proc)
            fixture=json.loads(statefile.read_text())
            mario=next(e for e in fixture['employees'] if e['id']=='emp-mario')
            next(a for a in mario['siteAccesses'] if a['siteId']==cds)['profileId']='admin_systeme'
            statefile.write_text(json.dumps(fixture))
            proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            assert call('PUT','/api/admin/sites/'+bey,admin,dict(name='Interdit'))[0]==403
            assert call('PUT','/api/admin/delegations',admin,dict(delegations=[]))[0]==403
            accesses=copy.deepcopy(next(e for e in fixture['employees'] if e['id']=='emp-chloe')['siteAccesses'])
            accesses[0]['teamIds']=[]
            assert call('PUT','/api/admin/employees/emp-chloe/site-accesses',admin,dict(siteAccesses=accesses))[0]==403
            accesses[0]['profileId']='admin_systeme'
            assert call('PUT','/api/admin/employees/emp-chloe/site-accesses',admin,dict(siteAccesses=accesses))[0]==403
            checks.append('single-club owner cannot edit another club identity, assignments or elevated profiles')
            stop(proc)
            fixture=original
            for e in fixture['employees']:
                if e['id']!='emp-mario':
                    for a in e['siteAccesses']:
                        if a['siteId']==cds and a['profileId']=='admin_systeme':a['profileId']='employe_standard'
            statefile.write_text(json.dumps(fixture))
            proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            accesses=copy.deepcopy(next(e for e in fixture['employees'] if e['id']=='emp-mario')['siteAccesses'])
            next(a for a in accesses if a['siteId']==cds)['profileId']='master_avance'
            before=statefile.read_bytes()
            assert call('PUT','/api/admin/employees/emp-mario/site-accesses',admin,dict(siteAccesses=accesses))[0]==409
            assert statefile.read_bytes()==before
            checks.append('last active owner of a club cannot be removed through employee access edits')
            stop(proc)
            fixture=json.loads(statefile.read_text())
            target=next(p for p in fixture['profiles'] if p['id']=='planificateur_standard')
            locked_row=next(r for r in target['rows'] if r['exposed'] and r['editableControl'] and r['checked'])
            locked_row['disabled']=True
            statefile.write_text(json.dumps(fixture))
            proc=start();admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            blocked=dict(action='save_profile',profileId=target['id'],scopeSelected=target['scopeSelected'],checkedMap={locked_row['actionId']:False})
            assert mutate(blocked)[0]==403
            assert call('PUT','/api/admin/profiles/'+target['id'],admin,dict(scopeSelected=target['scopeSelected'],checkedMap=blocked['checkedMap']))[0]==403
            checks.append('disabled controls remain locked on new and legacy profile APIs even if a restored editability flag is inconsistent')
        finally:
            stop(proc)
    print(json.dumps({'passed':len(checks),'checks':checks,'externalSends':0},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
