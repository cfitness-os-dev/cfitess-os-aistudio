import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePersonalCarry } from './hrPersonalCarry';
const item = { id: 'carry', sourceStart: '2025-06-01', sourceEnd: '2026-05-31', initialDays: 2, reviewedRemainingDays: 1.5, availableUntil: '2027-05-31', status: 'open', reviewedAt: '2026-11-25T09:00:00Z', balanceChanged: false, deadlinePassed: false };
const value = { actorId: 'employee', siteId: 'club-beynost', asOf: '2026-11-25', priorBalance: 3, items: [item] };
test('personal carryover rejects another session, club and duplicated dossiers', () => {
  assert.equal(validatePersonalCarry(value, 'employee', 'beynost'), value);
  for (const patch of [{ actorId: 'other' }, { siteId: 'club-carre-soie' }, { items: [item, item] }, { priorBalance: -1 }]) assert.throws(() => validatePersonalCarry({ ...value, ...patch }, 'employee', 'beynost'));
});
test('internal references and malformed carryovers cannot enter the personal projection', () => {
  for (const patch of [{ reference: 'Internal evidence' }, { reason: 'Internal notes' }, { sourceStart: '2026-02-30' }, { reviewedRemainingDays: 3 }, { reviewedRemainingDays: -1 }, { status: 'closed' }, { reviewedAt: 'invalid' }, { deadlinePassed: undefined }]) assert.throws(() => validatePersonalCarry({ ...value, items: [{ ...item, ...patch }] }, 'employee', 'beynost'));
});
test('a stale annotation remains visible when its last reviewed days exceed the corrected balance', () => {
  const stale = { ...value, priorBalance: 0, items: [{ ...item, balanceChanged: true }] };
  assert.equal(validatePersonalCarry(stale, 'employee', 'beynost'), stale);
  assert.equal(validatePersonalCarry({ ...value, items: [{ ...item, status: 'closed', reviewedRemainingDays: 0 }] }, 'employee', 'beynost').items[0].status, 'closed');
});
