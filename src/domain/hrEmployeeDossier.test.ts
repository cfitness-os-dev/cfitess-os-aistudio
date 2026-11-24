import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEurOptional,
  formatOptionalNumber,
  resolveEffectiveClubSiteId,
  validateContractForm,
  validateCounterForm,
  validateHrDossiersResponse,
  validatePersonalDossierResponse,
} from './hrEmployeeDossier';

test('resolveEffectiveClubSiteId synchronizes global Beynost selection even if primary club is Carre de Soie', () => {
  assert.equal(
    resolveEffectiveClubSiteId('beynost', ['carre-de-soie', 'beynost'], 'carre-de-soie'),
    'club-beynost',
  );
  assert.equal(
    resolveEffectiveClubSiteId('carre-de-soie', ['carre-de-soie', 'beynost'], 'beynost'),
    'club-carre-soie',
  );
  assert.equal(
    resolveEffectiveClubSiteId('beynost', ['carre-de-soie'], 'carre-de-soie'),
    'club-carre-soie',
  );
  assert.equal(
    resolveEffectiveClubSiteId('all', ['beynost'], 'carre-de-soie'),
    'club-beynost',
  );
});

test('validateHrDossiersResponse and validatePersonalDossierResponse reject cross-actor or cross-club payloads', () => {
  const validHr = {
    actorId: 'emp-mario',
    clubId: 'beynost',
    siteId: 'club-beynost',
    demoMode: true,
    sites: [],
    teams: [],
    profiles: [],
    employees: [],
  };
  assert.deepEqual(validateHrDossiersResponse(validHr, 'emp-mario', 'beynost'), validHr);
  assert.throws(() => validateHrDossiersResponse(validHr, 'emp-mario', 'carre-de-soie'));
  assert.throws(() => validateHrDossiersResponse(validHr, 'emp-chloe', 'beynost'));

  const validMe = {
    actorId: 'emp-chloe',
    clubId: 'beynost',
    siteId: 'club-beynost',
    demoMode: true,
    sites: [],
    teams: [],
    dossier: { id: 'emp-chloe' },
  };
  assert.equal(validatePersonalDossierResponse(validMe, 'emp-chloe', 'beynost').actorId, 'emp-chloe');
  assert.throws(() =>
    validatePersonalDossierResponse(
      { ...validMe, dossier: { id: 'emp-mario' } },
      'emp-chloe',
      'beynost',
    ),
  );
});

test('absent values never render as 0 or fabricated defaults', () => {
  assert.equal(formatOptionalNumber(null, 'j'), 'Non renseigné');
  assert.equal(formatOptionalNumber(undefined, 'h'), 'Non renseigné');
  assert.equal(formatOptionalNumber(0, 'j'), '0 j');
  assert.equal(formatEurOptional(null), 'Non renseigné');
  assert.equal(formatEurOptional(undefined), 'Non renseigné');
});

test('counter and contract validators enforce mandatory reason and bounds', () => {
  assert.ok(
    validateCounterForm({
      reason: '   ',
      cpNAcquired: '25',
      cpNTaken: '10',
      cpNMinus1Remaining: '2',
      rttDaysRemaining: '',
      annualizationBalanceHours: '',
    }),
  );
  assert.ok(
    validateCounterForm({
      reason: 'Correction valide',
      cpNAcquired: '-1',
      cpNTaken: '10',
      cpNMinus1Remaining: '2',
      rttDaysRemaining: '',
      annualizationBalanceHours: '',
    }),
  );
  assert.equal(
    validateCounterForm({
      reason: 'Régularisation validée',
      cpNAcquired: '25',
      cpNTaken: '10',
      cpNMinus1Remaining: '2',
      rttDaysRemaining: '',
      annualizationBalanceHours: '-12.5',
    }),
    null,
  );
  assert.ok(
    validateContractForm({
      regime: 'hours',
      weeklyHours: '35',
      annualDays: '',
      effectiveFrom: '2026-05-01',
      effectiveTo: '2026-04-01',
    }),
  );
  assert.equal(
    validateContractForm({
      regime: 'forfait_jours',
      weeklyHours: '',
      annualDays: '218',
      effectiveFrom: '2026-01-01',
      effectiveTo: '',
    }),
    null,
  );
});
