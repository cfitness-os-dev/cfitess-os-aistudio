import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validAllocations, validateLeaveCounterRules } from './hrLeaveRules';
import { validatePersonalResponse } from './personalWorkspace';
test('leave allocations distinguish CP periods and RTT and reject fractional precision or mixed families', () => {
    assert.equal(validAllocations({ cpN: 1.25, cpNMinus1: 2.5, rtt: 0 }, 'cp'), true);
    assert.equal(validAllocations({ cpN: 0, cpNMinus1: 0, rtt: 0.5 }, 'rtt'), true);
    for (const a of [{ cpN: 0, cpNMinus1: 0, rtt: 0 }, { cpN: 1, cpNMinus1: 0, rtt: 1 }, { cpN: 0.001, cpNMinus1: 0, rtt: 0 }, { cpN: NaN, cpNMinus1: 0, rtt: 0 }, { cpN: Infinity, cpNMinus1: 0, rtt: 0 }, { cpN: -1, cpNMinus1: 0, rtt: 0 }])
        assert.equal(validAllocations(a, 'cp'), false);
});
test('counter rules reject a response for another club, account, missing capability or unknown family', () => {
    const payload = { actorId: 'manager', siteId: 'club-beynost', revision: 'a'.repeat(64), canEdit: true, motives: [{ id: 'cp', label: 'Congé payé', active: true, employeeRequestable: true, requiresDocument: false, counterFamily: 'cp' }] };
    assert.deepEqual(validateLeaveCounterRules(payload, 'manager', 'beynost'), payload);
    for (const patch of [{ actorId: 'employee' }, { siteId: 'club-carre-soie' }, { revision: '' }, { canEdit: undefined }, { motives: [{ ...payload.motives[0], counterFamily: 'salary' }] }])
        assert.throws(() => validateLeaveCounterRules({ ...payload, ...patch }, 'manager', 'beynost'));
});
test('personal space refuses a missing motive catalogue instead of offering hard-coded options', () => {
    assert.throws(() => validatePersonalResponse({ employeeId: 'employee', clubId: 'beynost', tasks: [], notifications: [], documents: [], training: [], progress: [], checklists: [], timeEntries: [], leaves: [], shifts: [] }, 'employee', 'beynost'), /incomplètes/);
});
