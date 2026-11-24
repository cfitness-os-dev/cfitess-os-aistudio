"""Real loopback HTTP security P0 verification recipe.

Verifies security headers (CSP, nosniff, SAMEORIGIN), minimal /api/health,
mandatory auth on previously open endpoints, admin-only backup/snapshot,
and production fail-closed clubEntry behavior.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def start_server(binary: str, folder: Path, env_overrides: dict[str, str]):
    port = free_port()
    base = f'http://127.0.0.1:{port}'
    env = {
        **os.environ,
        'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}',
        'CFITNESS_DATA_DIR': str(folder),
        'CFITNESS_AUTOMATION_SCHEDULER': '0',
        'CFITNESS_SCENARIOS_WORKER': '0',
        'CFITNESS_CAMPAIGNS_WORKER': '0',
        'CFITNESS_ALLOWED_ORIGINS': base,
        **env_overrides,
    }

    def call(method, path, token=None, body=None, extra_headers=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if extra_headers:
            headers.update(extra_headers)
        req = urllib.request.Request(
            base + path,
            method=method,
            headers=headers,
            data=None if body is None else json.dumps(body).encode(),
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as reply:
                return reply.status, dict(reply.headers), json.load(reply)
        except urllib.error.HTTPError as error:
            try:
                return error.code, dict(error.headers), json.load(error)
            except ValueError:
                return error.code, dict(error.headers), None

    def stop(proc):
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    proc = subprocess.Popen([binary], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        if proc.poll() is not None:
            raise AssertionError('Server stopped prematurely')
        try:
            if call('GET', '/api/health')[0] == 200:
                return proc, base, call, stop
        except OSError:
            pass
        time.sleep(0.05)
    stop(proc)
    raise AssertionError('Server did not become healthy')


def main():
    binary = str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    checks = []
    Path('.tools/tmp').mkdir(parents=True, exist_ok=True)

    # 1. Strict session demo server checks
    with tempfile.TemporaryDirectory(prefix='sec-p0-demo-', dir='.tools/tmp') as directory:
        proc, _, call, stop = start_server(
            binary,
            Path(directory).resolve(),
            {'CFITNESS_DEMO_MODE': '1', 'CFITNESS_STRICT_SESSION': '1'},
        )
        try:
            code, hdrs, health = call('GET', '/api/health')
            assert code == 200
            hdrs_lc = {k.lower(): v for k, v in hdrs.items()}
            assert hdrs_lc.get('x-content-type-options') == 'nosniff', hdrs_lc
            assert hdrs_lc.get('x-frame-options') == 'SAMEORIGIN', hdrs_lc
            assert "default-src 'self'" in hdrs_lc.get('content-security-policy', ''), hdrs_lc
            assert '10.10.0.20' not in json.dumps(health) and '10.10.0.14' not in json.dumps(health)
            checks.append('security headers (CSP, nosniff, SAMEORIGIN) & minimal /api/health verified')

            # Unauthenticated sensitive endpoints must return 401
            for method, path, payload in [
                ('GET', '/api/ollama/status', None),
                ('POST', '/api/ollama/chat', {'messages': [{'role': 'user', 'content': 'ping'}]}),
                ('POST', '/api/heitz/gate-check', {'clubId': 'carre-de-soie', 'badgeCode': '123', 'memberId': 'm1'}),
                ('GET', '/api/backup/snapshot', None),
                ('POST', '/api/backup/snapshot', {'originDevice': 'pc', 'checksum': 'abc'}),
                ('POST', '/api/ats/ingest-email', {'senderLine': 'a@b.fr', 'subjectLine': 'CV', 'bodyText': '06'}),
                ('GET', '/api/registry', None),
                ('GET', '/api/ambiguities', None),
                ('GET', '/api/lead/registry', None),
                ('GET', '/api/admin/backup', None),
            ]:
                st, _, _ = call(method, path, body=payload)
                assert st == 401, (method, path, st)
            checks.append('all 10 previously unauthenticated endpoints reject missing Bearer (401)')

            mario_secret = os.environ['CFITNESS_TEST_ADMIN_SECRET']
            chloe_secret = os.environ['CFITNESS_TEST_CHLOE_SECRET']
            _, _, m_login = call('POST', '/api/auth/login', body={'emailOrId': 'emp-mario', 'pinOrPassword': mario_secret})
            _, _, c_login = call('POST', '/api/auth/login', body={'emailOrId': 'emp-chloe', 'pinOrPassword': chloe_secret})
            mario = m_login['sessionToken']
            chloe = c_login['sessionToken']

            # Chloe (non-admin) denied 403 on backup & snapshot
            assert call('GET', '/api/admin/backup', token=chloe)[0] == 403
            assert call('GET', '/api/backup/snapshot', token=chloe)[0] == 403

            # Admin with Bearer succeeds on backup, snapshot, registry, gate-check
            assert call('GET', '/api/admin/backup', token=mario)[0] == 200
            assert call('GET', '/api/backup/snapshot', token=mario)[0] == 200
            assert call('GET', '/api/registry', token=mario)[0] == 200
            assert call('POST', '/api/heitz/gate-check', token=mario, body={
                'clubId': 'carre-de-soie', 'badgeCode': '0600', 'memberId': 'none', 'homeClubId': 'carre-de-soie'
            })[0] == 200
            checks.append('RBAC admin-only backup/snapshot and authenticated gate-check verified')
        finally:
            stop(proc)

    # 2. Production fail-closed checks (CFITNESS_DEMO_MODE=0 without CFITNESS_LEAD_API_KEY)
    with tempfile.TemporaryDirectory(prefix='sec-p0-prod-', dir='.tools/tmp') as directory:
        prod_env = {
            'CFITNESS_DEMO_MODE': '0',
            'CFITNESS_STRICT_SESSION': '1',
            'CFITNESS_INITIAL_ADMIN_PASSWORD': 'ProdAdmin#Security2026!',
        }
        prod_env.pop('CFITNESS_LEAD_API_KEY', None)
        proc, _, call, stop = start_server(binary, Path(directory).resolve(), prod_env)
        try:
            st, _, _ = call('POST', '/api/lead/webhooks/clubEntry', body={
                'apiKey': 'arbitrary-key',
                'club': 'carre-de-soie',
                'email': 'test@exemple.fr',
                'lastname': 'Test',
                'firstname': 'User',
            })
            assert st == 401, st
            checks.append('production fail-closed rejects clubEntry without CFITNESS_LEAD_API_KEY (401)')
        finally:
            stop(proc)

    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
