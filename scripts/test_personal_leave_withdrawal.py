"""Manager/employee HTTP recipe against a disposable loopback-only Rust server.

Requires CFITNESS_TEST_ADMIN_SECRET and CFITNESS_TEST_COMMERCIAL_SECRET for
the built-in fictional accounts. Never accepts a remote base URL.
"""
import concurrent.futures
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


        personal = '/api/me/workspace/beynost'
        manager = '/api/hr/workspace/beynost'
        proc = start()
        try:
            admin = login('emp-mario', 'CFITNESS_TEST_ADMIN_SECRET')
            employee = login('emp-chloe', 'CFITNESS_TEST_COMMERCIAL_SECRET')
            statefile = folder/'cfitness_state.json'
            def own():
                code, result = call('GET', personal, employee)
                assert code == 200
                return result
            def board_row(id):
                return next(r for r in call('GET',manager,admin)[1]['requests'] if r['id'] == id)
            def create(day):
                code,result=call('POST',personal,employee,dict(action='request_leave',motive='CP',
                    startDate=f'2027-09-{day:02}',endDate=f'2027-09-{day:02}',comment='Commentaire initial'))
                assert code == 200, (code,result)
                return next(r for r in result['leaves'] if r['startDate'] == f'2027-09-{day:02}' and r['status']=='pending')['id']
            def withdraw(id, **extra):
                return dict(action='cancel_leave',id=id,comment='Retrait fictif demandé par le salarié',**extra)
            def decision(row, status='approved'):
                return dict(status=status,expectedStatus=row['status'],expectedRevision=row['revision'],note='Décision fictive')
            id=create(1)
            assert call('POST',personal,None,withdraw(id))[0] == 401
            assert call('POST',personal,admin,withdraw(id))[0] == 404
            assert call('POST','/api/me/workspace/carre-de-soie',employee,withdraw(id))[0] == 403
            assert call('POST','/api/me/workspace/carre-de-soie',admin,withdraw(id))[0] == 404
            assert call('POST',personal,employee,withdraw(id,employeeId='emp-mario'))[0] == 422
            checks.append('session, own employee and club isolation enforced; forged actor field refused')
            for reason in ['', '   ', 'x'*1001]:
                assert call('POST',personal,employee,dict(action='cancel_leave',id=id,comment=reason))[0] == 400
            assert next(r for r in own()['leaves'] if r['id']==id)['status']=='pending'
            checks.append('withdrawal reason required and bounded without changing the pending request')
            before=statefile.read_bytes()
            before_personal=own()
            blocker=folder/'cfitness_state.json.tmp'
            blocker.mkdir()
            try:
                assert call('POST',personal,employee,withdraw(id))[0] == 500
                assert statefile.read_bytes()==before
                assert own()==before_personal
                assert board_row(id)['status']=='pending'
            finally:
                blocker.rmdir()
            checks.append('failed persistence preserves personal/manager memory, file and audit')
            old=board_row(id)
            assert call('POST',personal,employee,withdraw(id))[0] == 200
            row=board_row(id)
            assert row['status']=='cancelled' and not row['canDecide']
            assert 'Commentaire initial' in row['comment'] and 'Retrait fictif' in row['comment']
            snapshot=json.loads(statefile.read_text())
            assert any(r['actionType']=='HR_LEAVE_WITHDRAWAL' for r in snapshot['auditLog'])
            assert call('POST',manager+'/requests/'+id,admin,decision(old))[0] == 409
            assert call('POST',manager+'/requests/'+id,admin,decision(row))[0] == 409
            assert call('PATCH','/api/leave-requests/'+id+'/decision',admin,dict(status='approved'))[0] == 409
            assert call('POST',personal,employee,withdraw(id))[0] == 409
            checks.append('withdrawal visible in both views, audited and terminal on both manager decision routes')
            saved=json.loads(before)
            after=json.loads(statefile.read_text())
            assert [e['counter'] for e in saved['employees']]==[e['counter'] for e in after['employees']]
            id2=create(1)
            assert id2!=id
            checks.append('withdrawn request does not debit counters or block a new request for the same period')
            for day,status in [(2,'approved'),(3,'rejected')]:
                target=create(day)
                assert call('POST',manager+'/requests/'+target,admin,decision(board_row(target),status))[0] == 200
                assert call('POST',personal,employee,withdraw(target))[0] == 409
                assert board_row(target)['status']==status
            checks.append('employee cannot withdraw an approved or rejected request')
            results=[]
            for day in range(4,12):
                target=create(day)
                command=decision(board_row(target))
                with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                    jobs=[executor.submit(call,'POST',personal,employee,withdraw(target)),
                          executor.submit(call,'POST',manager+'/requests/'+target,admin,command)]
                    codes=[job.result()[0] for job in jobs]
                assert sorted(codes)==[200,409], codes
                final=board_row(target)
                assert final['status'] in ['approved','cancelled']
                assert next(r for r in own()['leaves'] if r['id']==target)['status']==final['status']
                results.append((target,final['status']))
            checks.append('eight concurrent withdrawal/manager-decision races have exactly one winner and coherent views')
            stop(proc)
            proc=start()
            admin=login('emp-mario','CFITNESS_TEST_ADMIN_SECRET')
            employee=login('emp-chloe','CFITNESS_TEST_COMMERCIAL_SECRET')
            assert board_row(id)['status']=='cancelled'
            assert next(r for r in own()['leaves'] if r['id']==id)['status']=='cancelled'
            for target,status in results:
                assert board_row(target)['status']==status
            checks.append('withdrawals and race results persist across a real server restart')
        finally:
            stop(proc)
    print(json.dumps({'passed':len(checks),'checks':checks,'externalSends':0},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
