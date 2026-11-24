import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPilotageCsv,
  formatOptionalMetric,
  validateHrPilotageSnapshot,
  validateKpisForm,
  validateMissionForm,
  type HrPilotageSnapshot,
} from './hrPilotage';

const baseSnapshot: HrPilotageSnapshot = {
  demoMode: true,
  actorId: 'emp-sarah',
  clubId: 'carre-de-soie',
  siteId: 'club-carre-soie',
  revision: 'rev-1',
  site: {
    id: 'club-carre-soie',
    name: 'C.Fitness Carré de Soie',
    siret: '999',
    missionsModuleActive: false,
  },
  kpis: {
    periodLabel: 'Novembre 2026',
    workedHours: 429,
    retentionRatePct: 91.4,
    revenueEur: null,
    payrollMassEur: null,
    productivityPerHour: null,
    monthlyTargetEur: null,
  },
  operationalSummary: {
    activeEmployeesCount: 8,
    publishedShiftsCount: 14,
    pendingLeaveRequestsCount: 2,
    openAnomaliesCount: 1,
    activeMissionsCount: 1,
    completedMissionsCount: 0,
    totalMissionBudgetHours: 14,
    totalMissionLoggedHours: 8,
  },
  missions: [
    {
      id: 'mis-03',
      siteId: 'club-carre-soie',
      title: '=cmd|Audit cardio',
      budgetHours: 14,
      loggedHours: 8,
      hourlyBudgetEur: null,
      estimatedBudgetEur: null,
      loggedCostEur: null,
      status: 'active',
    },
  ],
  capabilities: {
    canViewFinances: false,
    canEditOperationalKpis: true,
    canEditFinancialKpis: false,
    canManageMissions: true,
  },
};

test('validateHrPilotageSnapshot rejects mismatched actor or club and incomplete shapes', () => {
  assert.equal(
    validateHrPilotageSnapshot(baseSnapshot, 'emp-sarah', 'carre-de-soie').revision,
    'rev-1',
  );
  assert.throws(() => validateHrPilotageSnapshot(baseSnapshot, 'emp-mario', 'carre-de-soie'));
  assert.throws(() => validateHrPilotageSnapshot(baseSnapshot, 'emp-sarah', 'beynost'));
  assert.throws(() =>
    validateHrPilotageSnapshot({ ...baseSnapshot, missions: null }, 'emp-sarah', 'carre-de-soie'),
  );
});

test('validateKpisForm, validateMissionForm and formatOptionalMetric enforce honest boundaries', () => {
  assert.equal(formatOptionalMetric(null, '€'), 'Non renseigné');
  const kpiErr = validateKpisForm({
    periodLabel: 'Décembre 2026',
    workedHours: '300',
    retentionRatePct: '120',
    canEditFinancialKpis: false,
    revenueEur: '',
    payrollMassEur: '',
    productivityPerHour: '',
    monthlyTargetEur: '',
  });
  assert.ok('error' in kpiErr);

  const kpiOk = validateKpisForm({
    periodLabel: 'Décembre 2026',
    workedHours: '320,5',
    retentionRatePct: '90',
    canEditFinancialKpis: false,
    revenueEur: '9999',
    payrollMassEur: '1000',
    productivityPerHour: '50',
    monthlyTargetEur: '12000',
  });
  assert.ok('payload' in kpiOk);
  assert.equal(kpiOk.payload.revenueEur, null);
  assert.equal(kpiOk.payload.workedHours, 320.5);

  assert.ok(validateMissionForm({ title: '', budgetHours: 10, canViewFinances: true }));
  assert.equal(
    validateMissionForm({ title: 'Audit', budgetHours: 12, hourlyBudgetEur: 28, canViewFinances: true }),
    null,
  );
});

test('buildPilotageCsv neutralizes formulas and omits financial columns without finance rights', () => {
  const csvRedacted = buildPilotageCsv(baseSnapshot);
  assert.ok(!csvRedacted.includes('Budget estimé'));
  assert.ok(csvRedacted.includes(`"'=cmd|Audit cardio"`));

  const csvFinance = buildPilotageCsv({
    ...baseSnapshot,
    capabilities: { ...baseSnapshot.capabilities, canViewFinances: true },
    missions: [
      {
        ...baseSnapshot.missions[0],
        hourlyBudgetEur: 30,
        estimatedBudgetEur: 420,
        loggedCostEur: 240,
      },
    ],
  });
  assert.ok(csvFinance.includes('Budget estimé (€)'));
  assert.ok(csvFinance.includes('"420"'));
});
