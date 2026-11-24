"""Independent executable-level #49 checks, disposable loopback state only."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request


def main():
    binary = str(Path(os.environ['CFITNESS_TEST_BINARY']).resolve())
    checks = []
    with tempfile.TemporaryDirectory(prefix='state-startup-') as temporary:
        root = Path(temporary)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        env = {**os.environ, 'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}', 'CFITNESS_DEMO_MODE': '1',
               'CFITNESS_AUTOMATION_SCHEDULER': '0', 'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_CAMPAIGNS_WORKER': '0',
               'CFITNESS_ALLOWED_ORIGINS': base}

        def valid_start(folder):
            proc = subprocess.Popen([binary], env={**env, 'CFITNESS_DATA_DIR': str(folder)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                for _ in range(100):
                    if proc.poll() is not None:
                        raise AssertionError('Valid local instance stopped')
                    try:
                        with urllib.request.urlopen(base+'/api/health', timeout=1) as response:
                            if response.status == 200:
                                return
                    except OSError:
                        pass
                    time.sleep(.05)
                raise AssertionError('Valid instance did not start')
            finally:
                proc.terminate()
                proc.wait(timeout=5)

        valid_folder = root/'valid'
        valid_start(valid_folder)
        raw = (valid_folder/'cfitness_state.json').read_bytes()
        valid_start(valid_folder)
        assert (valid_folder/'cfitness_state.json').read_bytes() == raw
        checks.append('absent state initializes and valid state reloads without changing bytes')
        incompatible = json.loads(raw)
        definition = dict(schemaVersion=1, clubId='carre-de-soie', name='Compatibility test', mode='manual', active=False,
                          enrollmentLocked=False, conditions=None, steps=[], futureUnknownField=True)
        incompatible['leadScenarios']['scenarios'] = [dict(id='compat-test', clubId='carre-de-soie', revision=1, draft=definition,
                                                          versions=[], active=False, enrollmentLocked=False, archived=False, updatedAt='2026-11-24T00:00:00Z')]
        cases = [('truncated', b'{"organization":'), ('non_utf8', b'\xff\xfe\x80'),
                 ('unknown_definition_field', json.dumps(incompatible).encode())]
        for mode in ['0', '1']:
            for name, payload in cases:
                folder = root/f'{name}-{mode}'
                folder.mkdir()
                target = folder/'cfitness_state.json'
                target.write_bytes(payload)
                before = hashlib.sha256(payload).hexdigest()
                result = subprocess.run([binary], env={**env, 'CFITNESS_DATA_DIR': str(folder), 'CFITNESS_DEMO_MODE': mode},
                                        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=10)
                assert result.returncode == 1, (name, mode, result.returncode)
                assert hashlib.sha256(target.read_bytes()).hexdigest() == before and target.read_bytes() == payload
                assert not (folder/'cfitness_state.json.tmp').exists()
                if name == 'unknown_definition_field':
                    assert b'futureUnknownField' in result.stderr
                checks.append(f'{name}, demo={mode}: exit 1, original bytes and hash preserved, no temporary state')
            for name in ['directory', 'dangling_symlink']:
                folder = root/f'{name}-{mode}'
                folder.mkdir()
                target = folder/'cfitness_state.json'
                if name == 'directory':
                    target.mkdir()
                else:
                    target.symlink_to(folder/'missing-target.json')
                result = subprocess.run([binary], env={**env, 'CFITNESS_DATA_DIR': str(folder), 'CFITNESS_DEMO_MODE': mode},
                                        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=10)
                assert result.returncode == 1 and not (folder/'cfitness_state.json.tmp').exists()
                assert target.is_dir() if name == 'directory' else target.is_symlink() and not (folder/'missing-target.json').exists()
                checks.append(f'{name}, demo={mode}: exit 1 and existing path preserved')
    print(json.dumps({'passed': len(checks), 'checks': checks, 'externalSends': 0}, indent=2))


if __name__ == '__main__':
    main()
