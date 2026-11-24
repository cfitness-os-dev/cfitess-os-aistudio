import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAccrualPolicy, validateAccrualPreview, validateAccrualSnapshot, type AccrualPolicy } from './hrLeaveAccrual';
const policy: AccrualPolicy = { enabled: false, unit: 'unconfigured', monthlyDays: null, rounding: 'nearest', periodStartMonth: null, carryMode: 'keep_all', carryLimit: null, priorCarryMode: 'keep', reference: '' };
const ready: AccrualPolicy = { ...policy, enabled: true, unit: 'ouvrables', monthlyDays: 2.0833, periodStartMonth: 6, reference: 'Règles fictives vérifiées' };
test('leave acquisition is opt-in and requires an explicitly verified rate, unit, period and reference', () => {
    assert.equal(validateAccrualPolicy(policy), null);
    assert.equal(validateAccrualPolicy(ready), null);
    for (const p of [{ ...policy, enabled: true }, { ...ready, monthlyDays: 2.08333 }, { ...ready, monthlyDays: NaN }, { ...ready, periodStartMonth: 0 }, { ...ready, carryMode: 'limit' as const, carryLimit: null }, { ...ready, carryLimit: -1 }, { ...ready, reference: '' }])
        assert.ok(validateAccrualPolicy(p));
});
test('accrual snapshots reject wrong club/account, incomplete policy or missing capabilities', () => {
    const value = { actorId: 'admin', siteId: 'club-beynost', revision: 'a'.repeat(64), canEdit: true, policy, motives: [], employees: [], history: [] };
    assert.deepEqual(validateAccrualSnapshot(value, 'admin', 'beynost'), value);
    for (const patch of [{ actorId: 'other' }, { siteId: 'club-carre-soie' }, { canEdit: undefined }, { policy: { ...policy, reference: undefined } }, { history: undefined }])
        assert.throws(() => validateAccrualSnapshot({ ...value, ...patch }, 'admin', 'beynost'));
});
test('preview contract rejects another employee, month, club or invalid counter instead of enabling confirmation', () => {
    const request = { employeeId: 'employee', kind: 'accrue' as const, month: '2026-10' };
    const counter = { cpNAcquired: 10, cpNTaken: 0, cpNMinus1Remaining: 0, rttDaysRemaining: null, annualizationBalanceHours: null };
    const plan = { ...request, siteId: 'club-beynost', before: counter, after: { ...counter, cpNAcquired: 12.5 }, amount: 2.5, carried: 0, expired: 0, baselineRequired: true, absenceReviewRequired: false, absenceCount: 0, unverifiedAbsenceCount: 0 };
    const preview = { revision: 'b'.repeat(64), plan };
    assert.deepEqual(validateAccrualPreview(preview, request, 'beynost'), preview);
    for (const patch of [{ employeeId: 'other' }, { month: '2026-09' }, { siteId: 'club-carre-soie' }, { after: { ...counter, cpNAcquired: NaN } }, { baselineRequired: undefined }, { expired: -1 }])
        assert.throws(() => validateAccrualPreview({ ...preview, plan: { ...plan, ...patch } }, request, 'beynost'));
});
test('absence eligibility is explicit, scoped and never inferred from annualization', () => {
    assert.equal(validateAccrualPolicy({ ...ready, absenceAcquisition: { formation: true, unpaid: false, unknown: null } }), null);
    assert.ok(validateAccrualPolicy({ ...ready, absenceAcquisition: { formation: 'yes' } } as unknown as AccrualPolicy));
    const snapshot = { actorId: 'admin', siteId: 'club-beynost', revision: 'a'.repeat(64), canEdit: true, policy: { ...policy, absenceAcquisition: { foreign: true } }, motives: [{ id: 'local', label: 'Formation', active: true }], employees: [], history: [] };
    assert.throws(() => validateAccrualSnapshot(snapshot, 'admin', 'beynost'));
    const request = { employeeId: 'employee', kind: 'accrue' as const, month: '2026-10' };
    const counter = { cpNAcquired: 10, cpNTaken: 0, cpNMinus1Remaining: 0 };
    const plan = { ...request, siteId: 'club-beynost', before: counter, after: counter, amount: 2.5, carried: 0, expired: 0, baselineRequired: true, absenceReviewRequired: true, absenceCount: 1, unverifiedAbsenceCount: 1 };
    const preview = { revision: 'b'.repeat(64), plan };
    assert.deepEqual(validateAccrualPreview(preview, request, 'beynost'), preview);
    for (const patch of [{ unverifiedAbsenceCount: 2 }, { absenceCount: -1 }, { absenceCount: 1.5 }, { absenceReviewRequired: false }])
        assert.throws(() => validateAccrualPreview({ ...preview, plan: { ...plan, ...patch } }, request, 'beynost'));
});
