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
        cds='/api/admin/sites/club-carre-soie/timeclock-settings'
        bey='/api/admin/sites/club-beynost/timeclock-settings'
        payload=dict(badgeFrequency='each_shift',tabletBreakBadging=True)
        statefile=folder/'cfitness_state.json'
        try:
            assert call('PUT',cds,body=payload)[0] == 401
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            before=statefile.read_bytes()
            assert call('PUT',bey,employee,payload)[0] == 403
            assert statefile.read_bytes()==before
            checks.append('real HTTP route requires session and refuses ordinary employee without disk/audit change')
            assert call('PUT',cds,admin,payload)[0] == 200
            stop(proc)
            fixture=json.loads(statefile.read_text())
            master=next(e for e in fixture['employees'] if e['id']=='emp-master')
            master_id=next(a['profileId'] for a in master['siteAccesses'] if a['siteId']=='club-carre-soie')
            readonly_id=next(a['profileId'] for a in master['siteAccesses'] if a['siteId']=='club-beynost')
            mario=next(e for e in fixture['employees'] if e['id']=='emp-mario')
            next(a for a in mario['siteAccesses'] if a['siteId']=='club-carre-soie')['profileId']=master_id
            statefile.write_text(json.dumps(fixture))
            proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            before=statefile.read_bytes()
            assert call('PUT',cds,admin,payload)[0] == 403
            assert statefile.read_bytes()==before
            assert call('PUT',bey,admin,payload)[0] == 200
            checks.append('owner on Beynost cannot edit CDS badgeuses through generic organisation/master rights')
            stop(proc)
            fixture=json.loads(statefile.read_text())
            mario=next(e for e in fixture['employees'] if e['id']=='emp-mario')
            next(a for a in mario['siteAccesses'] if a['siteId']=='club-beynost')['profileId']=readonly_id
            statefile.write_text(json.dumps(fixture))
            proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            before=statefile.read_bytes()
            assert call('PUT',cds,admin,payload)[0] == 403
            assert call('PUT',bey,admin,payload)[0] == 403
            assert statefile.read_bytes()==before
            checks.append('Master-only and read-only profiles cannot edit badgeuses even with organisation permissions')
            stop(proc)
            fixture=json.loads(statefile.read_text())
            mario=next(e for e in fixture['employees'] if e['id']=='emp-mario')
            next(a for a in mario['siteAccesses'] if a['siteId']=='club-carre-soie')['profileId']='admin_systeme'
            statefile.write_text(json.dumps(fixture))
            proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            before_bey=next(s for s in fixture['sites'] if s['id']=='club-beynost')
            code,result=call('PUT',cds,admin,payload)
            assert code==200 and result['settings']['tabletBreakBadging']
            assert call('PUT',bey,admin,payload)[0] == 403
            assert next(s for s in json.loads(statefile.read_text())['sites'] if s['id']=='club-beynost')==before_bey
            checks.append('owner on CDS may edit CDS alone; active-club headers do not grant rights elsewhere')
            for bad in [dict(payload,badgeFrequency='unknown'),dict(payload,tabletBreakBadging='yes'),dict(payload,profileId='admin_systeme')]:
                assert call('PUT',cds,admin,bad)[0] == 422
            stop(proc)
            proc=start()
            saved=json.loads(statefile.read_text())
            assert next(s for s in saved['sites'] if s['id']=='club-carre-soie')['settings']['tabletBreakBadging']
            checks.append('strict payload contract and persisted settings survive restart')
        finally:
            stop(proc)
    print(json.dumps({'passed':len(checks),'checks':checks,'externalSends':0},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
