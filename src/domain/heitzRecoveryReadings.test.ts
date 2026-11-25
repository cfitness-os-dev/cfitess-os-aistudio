import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHeitzRecoveryReadings } from './heitzRecoveryReadings';
const loaded = { status: 'loaded', items: [], completeHistoryVerified: false };
const fixture = { actorId: 'a', caseId: 'c', clubId: 'beynost', revision: 'r', collectedAtUtc: '2026-11-25T12:00:00Z', partial: false, provisional: loaded, display: loaded, subscriptions: loaded, paymentsCollected: false, contractOriginalsCollected: false, termsOriginalsCollected: false, signatureStatus: 'not_checked', documents: { status: 'targeting_to_qualify', message: 'À qualifier' }, notice: 'Lecture seule' };
test('source readings stay bound to actor, dossier, club and revision without promoting signatures', () => {
    assert.equal(validateHeitzRecoveryReadings(fixture, 'a', 'c', 'beynost', 'r'), fixture);
    for (const patch of [{ actorId: 'b' }, { caseId: 'x' }, { clubId: 'carre-de-soie' }, { revision: 'stale' }, { paymentsCollected: true }, { termsOriginalsCollected: true }, { signatureStatus: 'signed' }, { collectedAtUtc: 'invalid' }, { partial: true }])
        assert.throws(() => validateHeitzRecoveryReadings({ ...fixture, ...patch }, 'a', 'c', 'beynost', 'r'));
});
test('unavailable source is not a confirmed empty list and forecast zero is not a receipt', () => {
    const v = { ...fixture, partial: true, provisional: { ...loaded, items: [{ date: '2026-12-01T00:00:00Z', valuePayment: 0, valueSale: -12, valuePoints: 0 }] }, display: { status: 'unavailable', items: null, completeHistoryVerified: false, message: 'Indisponible' } };
    assert.equal(validateHeitzRecoveryReadings(v, 'a', 'c', 'beynost', 'r').paymentsCollected, false);
    for (const patch of [{ display: { ...v.display, items: [] } }, { provisional: { ...loaded, items: [{ date: 'bad', valuePayment: '0', valueSale: 0, valuePoints: 0 }] } }, { subscriptions: { ...loaded, items: [{ id: 1, accessLabel: null }, { id: 1, accessLabel: null }] } }])
        assert.throws(() => validateHeitzRecoveryReadings({ ...v, ...patch }, 'a', 'c', 'beynost', 'r'));
});
