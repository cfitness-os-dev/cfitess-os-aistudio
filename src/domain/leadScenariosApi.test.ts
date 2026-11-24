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
    const base = { actorId: 'employee', clubId: 'beynost', scenarios: [], enrollments: [], templates: [], sources: [], statusIds: [], prospects: [] };
    globalThis.fetch = async () => new Response(JSON.stringify({ ...base, templates: [{ id: 'foreign', clubId: 'carre-de-soie' }] }));
    await assert.rejects(scenarioRequest('employee', 'beynost'), /autre club/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...base, emailOutbox: [{ id: 'foreign', clubId: 'carre-de-soie' }] }));
    await assert.rejects(scenarioRequest('employee', 'beynost'), /informations de communication/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...base, emailSuppressions: [null] }));
    await assert.rejects(scenarioRequest('employee', 'beynost'), /informations de communication/);
    for (const key of ["smsPreferences", "smsOutbox"]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ ...base, [key]: [{ clubId: "carre-de-soie" }] }));
      await assert.rejects(scenarioRequest("employee", "beynost"), /communication ne correspondent pas/);
    }
    const command = { action: 'save_template' as const, templateId: null, expectedRevision: null, message: { name: 'Test', channel: 'sms' as const, subject: '', body: 'Bonjour' } };
    globalThis.fetch = async () => new Response(JSON.stringify({ ...base, templates: [{ id: 'last-other-create', clubId: 'beynost' }] }));
    await assert.rejects(scenarioRequest('employee', 'beynost', command, 'create-op'), /identifier le modèle/);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...base, templates: [{ id: 'mine', clubId: 'beynost' }, { id: 'last-other-create', clubId: 'beynost' }], commandResult: { templateId: 'mine' } }));
    assert.equal((await scenarioRequest('employee', 'beynost', command, 'create-op')).commandResult?.templateId, 'mine');
    globalThis.fetch = async () => new Response(JSON.stringify({ actorId: 'other', clubId: 'beynost', scenarios: [], enrollments: [] }));
    await assert.rejects(scenarioRequest('employee', 'beynost'), /ne correspond pas/);
  } finally { globalThis.fetch = original; if (storage) Object.defineProperty(globalThis, 'sessionStorage', storage); else Reflect.deleteProperty(globalThis, 'sessionStorage'); }
});
