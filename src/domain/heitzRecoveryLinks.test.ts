import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHeitzRecoveryLinks } from './heitzRecoveryLinks';

test('Heitz links remain bound to actor, club, revision and exact member screens', () => {
  const root = 'https://heitz.example.test/app/heitz/3845/crm/';
  const value = { actorId: 'test-admin', caseId: 'rec-hz-hz-501', clubId: 'carre-de-soie', revision: 'r1', configured: true,
    urls: { financial: root + '#/app/client/501/financial', documents: root + '#/app/client/501/document', subscriptions: root + '#/app/client/501/subscriptions' }, notice: 'Navigation only' };
  const check = (v: unknown) => validateHeitzRecoveryLinks(v, 'test-admin', 'rec-hz-hz-501', 'carre-de-soie', 'r1');
  assert.equal(check(value).urls?.financial, value.urls.financial);
  assert.equal(check({ ...value, configured: false, urls: null }).urls, null);
  assert.equal(check({ ...value, configured: false, urls: null, demoOffline: true }).urls, null);
  assert.throws(() => check({ ...value, demoOffline: true }));
  for (const delta of [{ actorId: 'other' }, { clubId: 'beynost' }, { revision: 'old' }, { caseId: 'rec-hz-hz-502' }, { configured: false }]) assert.throws(() => check({ ...value, ...delta }));
  for (const url of ['javascript:alert(1)', root + '#/app/client/502/document', root + '?token=secret#/app/client/501/document', root.replace('https://', 'https://user:secret@') + '#/app/client/501/document', root.replace('3845', '4967') + '#/app/client/501/document', root + '#/app/newSale']) assert.throws(() => check({ ...value, urls: { ...value.urls, documents: url } }));
});
