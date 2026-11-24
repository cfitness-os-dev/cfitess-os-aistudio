import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBaseRulesForm,
  validateHrSiteRulesSnapshot,
  validateStaffingNeedForm,
} from './hrSiteRules';

const baseSnapshot = {
  demoMode: true,
  actorId: 'emp-mario',
  clubId: 'beynost',
  siteId: 'club-beynost',
  revision: 'rev-1',
  site: { id: 'club-beynost', name: 'C.Fitness Beynost', siret: '123', timezone: 'Europe/Paris' },
  settings: {
    badgeFrequency: 'each_shift',
    tabletBreakBadging: true,
    dayStartHour: '06:00',
    breakAlertHours: 6,
    breakAlertEnabled: true,
    consecutiveDaysBlocking: false,
    complementaryMaxHours: 10,
    smartPlannerBreakMaxHours: 2,
    alertsLayout: 'single_list',
    missionsModuleActive: true,
    reportRulesVisible: true,
    annualizationPeriod: '2026-2027',
    acquisitionMode: '2,5 jours/mois',
    annualizationTotalMotives: 8,
    annualizationIncludedMotives: 5,
    sundayHoursInAnnualization: false,
    rttHoursCounterActive: false,
  },
  motives: [],
  staffingNeeds: [],
  positions: [],
  capabilities: {
    canEditRules: true,
    canEditAlertsAndReport: true,
    canEditAbsences: true,
    canEditStaffingNeeds: true,
    canEditBadgeSettings: true,
  },
};

test('validateHrSiteRulesSnapshot rejects mismatched actor or club and missing collections', () => {
  assert.equal(validateHrSiteRulesSnapshot(baseSnapshot, 'emp-mario', 'beynost').revision, 'rev-1');
  assert.throws(() => validateHrSiteRulesSnapshot(baseSnapshot, 'emp-chloe', 'beynost'));
  assert.throws(() => validateHrSiteRulesSnapshot(baseSnapshot, 'emp-mario', 'carre-de-soie'));
  assert.throws(() => validateHrSiteRulesSnapshot({ ...baseSnapshot, motives: null }, 'emp-mario', 'beynost'));
});

test('validateBaseRulesForm and validateStaffingNeedForm enforce strict boundaries', () => {
  assert.equal(
    validateBaseRulesForm({
      dayStartHour: '07:00',
      breakAlertHours: 6,
      complementaryMaxHours: 10,
      smartPlannerBreakMaxHours: 2,
    }),
    null,
  );
  assert.ok(
    validateBaseRulesForm({
      dayStartHour: '25:00',
      breakAlertHours: 6,
      complementaryMaxHours: 10,
      smartPlannerBreakMaxHours: 2,
    }),
  );
  assert.ok(
    validateStaffingNeedForm({
      positionId: 'pos-bey-accueil',
      startTime: '18:00',
      endTime: '09:00',
      minHeadcount: 2,
    }),
  );
  assert.equal(
    validateStaffingNeedForm({
      positionId: 'pos-bey-accueil',
      startTime: '09:00',
      endTime: '18:00',
      minHeadcount: 2,
    }),
    null,
  );
});
