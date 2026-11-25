import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecoveryEvidence, recoveryFollowupCsv, recoveryConversationSheet } from './recoveryEvidence';
const kinds = ['contract', 'terms', 'debt_detail', 'payments'];
const value = { actorId: 'employee', caseId: 'case', clubId: 'beynost', revision: 'a'.repeat(64), canEdit: true, externalActionsEnabled: false, followupPaused: false, amountDueEur: 80, documented: false, source: null, sourceUpdatedAt: null, requirements: kinds.map(kind => ({ kind, label: kind, verified: false })), evidence: [], nextActions: [], callGuide: [], timeline: [], assistantFacts: { memberName: 'Fictif', contractLabel: 'À vérifier', status: 'a_relancer', reportedReason: 'Non renseigné', overdueDays: null, billedMonths: [], reminderCount: 0 } };
test('documentary response stays bound to authenticated actor, case and club', () => {
    assert.equal(validateRecoveryEvidence(value, 'employee', 'case', 'beynost'), value);
    for (const patch of [{ actorId: 'other' }, { caseId: 'other' }, { clubId: 'carre-de-soie' }, { revision: '_'.repeat(64) }, { externalActionsEnabled: true }, { amountDueEur: -1 }, { sourceUpdatedAt: 'unknown' }])
        assert.throws(() => validateRecoveryEvidence({ ...value, ...patch }, 'employee', 'case', 'beynost'));
});
test('a missing requirement or paused case cannot be presented as documented', () => {
    for (const patch of [{ requirements: value.requirements.slice(1) }, { requirements: [...value.requirements, value.requirements[0]] }, { documented: true }, { documented: true, followupPaused: true, requirements: value.requirements.map(r => ({ ...r, verified: true })) }])
        assert.throws(() => validateRecoveryEvidence({ ...value, ...patch }, 'employee', 'case', 'beynost'));
    const complete = { ...value, documented: true, requirements: value.requirements.map(r => ({ ...r, verified: true })) };
    assert.equal(validateRecoveryEvidence(complete, 'employee', 'case', 'beynost').documented, true);
});
test('followup CSV distinguishes unknowns and declarations and protects spreadsheet formulas', () => {
    const row = { memberName: '=HYPERLINK("bad")', clubId: 'beynost', amountDueEur: 80, daysOverdue: 0, hasSignedContract: true, hasCgvAccepted: true, hasIdAndRib: true, phone: '+33000000000', email: 'fictif@example.test', status: 'a_relancer' };
    const csv = recoveryFollowupCsv([row, { ...row, memberName: 'Nom;avec\nretour', complianceVerified: true, overdueDaysKnown: true }]);
    assert.ok(csv.includes("'=HYPERLINK"));
    assert.ok(csv.includes("'+33000000000"));
    assert.ok(csv.includes('À vérifier'));
    assert.ok(csv.includes('Déclaré présent — preuve à vérifier'));
    assert.ok(csv.includes('"Nom;avec\nretour"'));
    assert.ok(!csv.includes(';OUI;'));
});
test('conversation sheet preserves missing dates and distinguishes references from files', () => { const sheet = recoveryConversationSheet(validateRecoveryEvidence(value, 'employee', 'case', 'beynost')); assert.ok(sheet.includes('Retard : Inconnu')); assert.ok(sheet.includes('Échéances indiquées : À retrouver')); assert.ok(sheet.includes('Aucun texte de CGV fourni')); });
