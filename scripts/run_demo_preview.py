"""Start a separate local demo with a fresh fictitious dataset and no inherited provider secrets."""
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
    frontend = str(Path(os.environ['CFITNESS_FRONTEND_DIR']).resolve())
    data = tempfile.mkdtemp(prefix='cfitness-demo-review-', dir=os.environ['TMPDIR'])
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    env = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'TZ': 'Europe/Paris',
        'TMPDIR': os.environ['TMPDIR'], 'CFITNESS_ENV': 'demo',
        'CFITNESS_DEMO_MODE': '1', 'CFITNESS_STRICT_SESSION': '1',
        'CFITNESS_BIND_ADDR': f'127.0.0.1:{port}',
        'CFITNESS_DATA_DIR': data, 'CFITNESS_FRONTEND_DIR': frontend,
        'CFITNESS_HEITZ_LIVE_READS_ENABLED': '0', 'CFITNESS_HEITZ_LOOPBACK_TESTS': '0',
        'CFITNESS_HEITZ_WORKER': '0', 'CFITNESS_AUTOMATION_SCHEDULER': '0',
        'CFITNESS_SCENARIOS_WORKER': '0', 'CFITNESS_CAMPAIGNS_WORKER': '0',
        'HEITZ_WS_URL': 'http://127.0.0.1:9', 'HEITZ_DEV_ID': '', 'HEITZ_DEV_KEY': '',
        'HEITZ_WS_TOKEN': '', 'OLLAMA_BASE_URL': 'http://127.0.0.1:9',
        'BACKUP_SECONDARY_NODES': '', 'RUST_LOG': 'error',
    }
    proc = subprocess.Popen([binary], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f'http://127.0.0.1:{port}'
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen(base + '/api/health', timeout=1) as r:
                    if r.status == 200:
                        break
            except OSError:
                time.sleep(.05)
        else:
            raise RuntimeError('La démonstration locale ne démarre pas.')
        print(json.dumps({'preview': base, 'data': data, 'heitz': 'disabled', 'external_provider_secrets': 'not inherited'}), flush=True)
        input()  # Keep the preview running until its owner ends this session.
    finally:
        proc.terminate()
        proc.wait(timeout=5)
        # Preserve this demo dataset; never delete an existing directory or club data.


if __name__ == '__main__':
    main()
