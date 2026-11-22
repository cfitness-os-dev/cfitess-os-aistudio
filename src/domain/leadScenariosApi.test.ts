import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenarioRequest } from './leadScenariosApi';

test('scenario client refuses missing or mismatched employee session before any request', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected network'); };
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: () => null } });
    await assert.rejects(scenarioRequest('employee', 'beynost'), /Reconnectez/);
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => key.endsWith('actor_id') ? 'other' : 'test-token' } });
    await assert.rejects(scenarioRequest('employee', 'beynost'), /Reconnectez/); assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage); else Reflect.deleteProperty(globalThis, 'sessionStorage'); }
});
test('scenario writes carry stable operation id; failures and foreign-club replies never succeed', async () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'); const original = globalThis.fetch;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: (key: string) => key.endsWith('actor_id') ? 'employee' : 'test-token' } });
  try {
    let headers: HeadersInit | undefined;
    globalThis.fetch = async (_url, init) => { headers = init?.headers; return new Response(JSON.stringify({ error: 'Échec disque' }), { status: 500 }); };
    await assert.rejects(scenarioRequest('employee', 'beynost', { action: 'run' }, 'stable-operation'), /Échec disque/);
    assert.equal(new Headers(headers).get('x-cfitness-operation-id'), 'stable-operation');
    globalThis.fetch = async () => new Response(JSON.stringify({ actorId: 'employee', clubId: 'carre-de-soie', scenarios: [], enrollments: [] }));
    await assert.rejects(scenarioRequest('employee', 'beynost'), /ne correspond pas/);
    globalThis.fetch = async () => new Response(JSON.stringify({ actorId: 'other', clubId: 'beynost', scenarios: [], enrollments: [] }));
    await assert.rejects(scenarioRequest('employee', 'beynost'), /ne correspond pas/);
  } finally { globalThis.fetch = original; if (storage) Object.defineProperty(globalThis, 'sessionStorage', storage); else Reflect.deleteProperty(globalThis, 'sessionStorage'); }
});
