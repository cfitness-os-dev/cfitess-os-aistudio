import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCarryInput, validateCarrySnapshot, type CarryInput } from './hrLeaveCarry';
const record = { id: 'carry-fictif', employeeId: 'employee', siteId: 'club-beynost', sourceStart: '2025-06-01', sourceEnd: '2026-05-31', initialDays: 2, remainingDays: 2, availableUntil: '2027-05-31', reference: 'Relevé fictif vérifié', status: 'open', notice: null, createdAt: '2026-11-25T12:00:00Z', updatedAt: '2026-11-25T12:00:00Z' };
const employee = { id: 'employee', name: 'Collaborateur fictif', primary: true, revision: 'a'.repeat(64), priorBalance: 5, protectedDays: 2, cases: [{ record, balanceChanged: false, deadlinePassed: false }], history: [] };
const snapshot = { actorId: 'admin', siteId: 'club-beynost', asOf: '2026-11-25', employees: [employee] };
const input: CarryInput = { employeeId: 'employee', expectedRevision: 'a'.repeat(64), reviewConfirmed: true, reason: 'Rapprochement fictif vérifié', command: { action: 'create', sourceStart: record.sourceStart, sourceEnd: record.sourceEnd, availableUntil: record.availableUntil, days: 2, reference: record.reference } };
test('carryover responses reject another account or club, injected employee records and incorrect protected totals', () => {
    assert.equal(validateCarrySnapshot(snapshot, 'admin', 'beynost'), snapshot);
    for (const patch of [{ actorId: 'other' }, { siteId: 'club-carre-soie' }, { asOf: '2026-02-30' }, { employees: [{ ...employee, protectedDays: 3 }] }, { employees: [{ ...employee, cases: [{ ...employee.cases[0], record: { ...record, employeeId: 'other' } }] }] }])
        assert.throws(() => validateCarrySnapshot({ ...snapshot, ...patch }, 'admin', 'beynost'));
});
test('changed N1 can be below the old annotations: display requires reconciliation rather than concealing the dossier', () => {
    const changed = { ...snapshot, employees: [{ ...employee, priorBalance: 0, cases: [{ ...employee.cases[0], balanceChanged: true }] }] };
    assert.equal(validateCarrySnapshot(changed, 'admin', 'beynost'), changed);
});
test('duplicate dossiers and malformed history cannot crash or duplicate the visible follow-up', () => {
    assert.throws(() => validateCarrySnapshot({ ...snapshot, employees: [employee, employee] }, 'admin', 'beynost'));
    const duplicate = { ...employee, protectedDays: 4, cases: [...employee.cases, ...employee.cases] };
    assert.throws(() => validateCarrySnapshot({ ...snapshot, employees: [duplicate] }, 'admin', 'beynost'));
    const history = [{ id: 'h', employeeId: employee.id, action: 'create', reason: 'Fictif', timestamp: 'invalid', before: null, after: record }];
    assert.throws(() => validateCarrySnapshot({ ...snapshot, employees: [{ ...employee, history }] }, 'admin', 'beynost'));
});
test('carryover input requires human verification, a real period, bounded precision and a calculation reference', () => {
    assert.equal(validateCarryInput(input), null);
    for (const patch of [{ reviewConfirmed: false }, { expectedRevision: '' }, { reason: ' ' }])
        assert.ok(validateCarryInput({ ...input, ...patch }));
    for (const patch of [{ days: -1 }, { days: 0 }, { days: 2.001 }, { days: NaN }, { sourceEnd: '2026-02-30' }, { sourceStart: '2027-01-01' }, { availableUntil: '2025-01-01' }, { reference: '' }])
        assert.ok(validateCarryInput({ ...input, command: { ...input.command, ...patch } } as CarryInput));
});
test('recording a notice requires evidence of an already remitted notice; zero reconciliation is allowed', () => {
    assert.equal(validateCarryInput({ ...input, command: { action: 'reconcile', id: 'carry-fictif', remainingDays: 0 } }), null);
    assert.equal(validateCarryInput({ ...input, command: { action: 'notice', id: 'carry-fictif', notifiedOn: '2026-11-25', medium: 'remise', evidence: 'Référence fictive de remise' } }), null);
    for (const patch of [{ id: '' }, { notifiedOn: '2026-02-30' }, { medium: 'sms' }, { evidence: '' }])
        assert.ok(validateCarryInput({ ...input, command: { action: 'notice', id: 'carry-fictif', notifiedOn: '2026-11-25', medium: 'remise', evidence: 'Référence', ...patch } } as CarryInput));
});
