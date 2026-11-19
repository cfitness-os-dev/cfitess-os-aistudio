import assert from 'node:assert/strict';
import test from 'node:test';
import { CFitnessApiEngine } from './apiEngine';
import {
  INITIAL_FICTIVE_SALES,
  computeActivityDueBucket,
  computeLeadReportBreakdown,
  filterFictiveSales,
  parseCsvLineWithQuotes,
} from './leadHubHelpers';
import { INITIAL_ROLE_PROFILES } from './permissionsMatrixSeed';
import { computeShiftNetMinutes, formatMinutesAsHours, getControlState } from './rbac';
import {
  CANDIDATE_ACTIONS,
  ENTITIES_META,
  EXT_COMPLEMENTS,
  MC_SECTIONS,
  SOURCE_SCREENS,
  TOTAL_HISTORICAL_ENTRIES,
} from './referenceRegistry';
import {
  computeSmsSegmentMetrics,
  evaluateLeadModuleAccess,
  evaluateProspectAutoArchive,
  ingestLeadClubEntryWebhook,
  LEAD_11_BLOCAGES,
  LEAD_16_EXEMPLES,
  LEAD_23_ECARTS,
  LEAD_26_CAPTURES,
  LEAD_28_TRACEABILITY_GROUPS,
  LEAD_AUDIT_META,
  LEAD_IMPORT_COLUMNS_11,
  LEAD_PARTNERS_9,
  LEAD_SETTINGS_TABS_14,
  resolveWhatsAppSendDecision,
  validateAndParseLeadImportRows,
  validateAppointmentBooking,
} from './leadAuditRegistry';
import { AMBIGUITIES_BASELINE } from './seed';
import {
  CFITNESS_LEGAL_IDENTITY,
  HARDWARE_COMPATIBILITY_SPECS,
  INITIAL_BACKUP_REPLICAS,
  LEGACY_SOFTWARE_PARITY_MATRIX,
  buildBackupEnvelope,
  buildMywellnessContextualUrl,
  buildSilaeApiPayload,
  buildUnifiedPlanningEvents,
  canAccessFeature,
  canCallProspectProspection,
  canSendProspectSms,
  computeHeitzKpiSummary,
  computeInBodySheetMetrics,
  computePayrollVariables,
  computeProbationNoticePeriod,
  computeSnapshotChecksum,
  convertProspectToHeitzMember,
  createInternalElectronicSignatureProof,
  evaluateGatePassage,
  evaluateShiftCompliance,
  executeTransactionalOnboarding,
  findDuplicateProspect,
  formatClubName,
  formatLeaveStatus,
  formatPointageType,
  generateHeitzTrialPassageCode,
  generateOfficialCdiContractText,
  generateSilaeCsv,
  isNavItemAllowedForRole,
  isSectionAllowedForRole,
  mergeFailoverSnapshot,
  parseRecruitmentEmailPayload,
  resolveTelecomOutboundRoute,
  selectOutboundNumber,
  verifyEmployeePin,
} from './rules';
import { INITIAL_HEITZ_KPI_TICKETS } from '../data/seed';
import type {
  Candidate,
  Employee as CfosEmployee,
  HRDocument,
  HeitzMember,
  InBodyScan,
  Prospect,
  Shift as CfosShift,
  TrainingModule,
  UnifiedPlanningEvent,
} from '../types/cfos';
import './theme.test';
import './__tests__/systemSecurityCompatibility.test';

test('TST39 — Couverture structurelle V1.16 complète (13 MC, 91 écrans, 1605 entrées, 20 EXT, 189 OS, 31 OBJ, 6x44)', () => {
  assert.equal(MC_SECTIONS.length, 13);
  assert.equal(SOURCE_SCREENS.length, 91);
  assert.equal(TOTAL_HISTORICAL_ENTRIES, 1605);
  assert.equal(EXT_COMPLEMENTS.length, 20);
  assert.equal(CANDIDATE_ACTIONS.length, 189);
  assert.equal(ENTITIES_META.length, 31);
  assert.equal(INITIAL_ROLE_PROFILES.length, 6);
  for (const prof of INITIAL_ROLE_PROFILES) {
    assert.equal(prof.rows.length, 44, `Profil ${prof.id} doit contenir 44 lignes ORG04`);
  }
  assert.equal(AMBIGUITIES_BASELINE.length, 10);
});

test('TST01 — Calcul durée nette 09:00–17:00 pause 30 min = 450 min (7h30)', () => {
  const engine = new CFitnessApiEngine();
  const dash = engine.getDashboardData('emp-employe-multi', 'club-carre-soie');
  assert.equal(dash.status, 200);
  const sh = dash.data!.myShifts.find((s) => s.id === 'sh-tst01');
  assert.ok(sh, 'Le shift sh-tst01 doit exister pour emp-employe-multi');
  const net = computeShiftNetMinutes(sh.startTime, sh.endTime, sh.breakMinutes);
  assert.equal(net, 450);
  assert.equal(formatMinutesAsHours(net), '7h30');
});

test('TST02 & TST03 & TST04 — Multi-sites employé et masquage brouillon non assigné', () => {
  const engine = new CFitnessApiEngine();
  const empCs = engine.getDashboardData('emp-employe-multi', 'club-carre-soie');
  assert.equal(empCs.status, 200);
  assert.equal(empCs.data!.sites.length, 2);
  assert.ok(empCs.data!.myShifts.some((s) => s.id === 'sh-tst01'));
  assert.ok(!empCs.data!.teamShifts.some((s) => s.id === 'sh-unassigned-1'));

  const empBey = engine.getDashboardData('emp-employe-multi', 'club-beynost');
  assert.equal(empBey.status, 200);
  assert.ok(empBey.data!.myShifts.some((s) => s.id === 'sh-bey-multi'));
  assert.ok(!empBey.data!.myShifts.some((s) => s.id === 'sh-tst01'));

  const adminAll = engine.getDashboardData('emp-admin', 'all');
  assert.equal(adminAll.status, 200);
  assert.ok(adminAll.data!.teamShifts.some((s) => s.id === 'sh-unassigned-1'));
});

test('TST06 — Lecture seule avancée bloque toute écriture et MC11', () => {
  const engine = new CFitnessApiEngine();
  const dash = engine.getDashboardData('emp-readonly', 'club-beynost');
  assert.equal(dash.status, 200);
  assert.ok(dash.data!.kpis.length >= 1, 'Lecture seule peut consulter le pilotage (ORG04-38)');

  const editOrg = engine.updateOrganization('emp-readonly', 'club-beynost', {
    name: 'Piraté',
  });
  assert.equal(editOrg.status, 403);

  const accessMc11 = engine.assertSectionRouteAccess(
    'emp-readonly',
    'club-beynost',
    'MC11'
  );
  assert.equal(accessMc11.status, 403);
});

test('TST07 & TST32 & TST33 — Périmètre équipes uniquement + masquage IBAN/Salaires ORG04-10', () => {
  const engine = new CFitnessApiEngine();
  const dash = engine.getDashboardData('emp-planif-std', 'club-carre-soie');
  assert.equal(dash.status, 200);

  const visibleIds = dash.data!.visibleEmployees.map((e) => e.id);
  assert.ok(visibleIds.includes('emp-planif-std'), 'Se voit lui-même');
  assert.ok(
    visibleIds.includes('emp-accueil-cs'),
    'Voit Julie Roux (même équipe team-cs-accueil)'
  );
  assert.ok(
    !visibleIds.includes('emp-employe-multi'),
    'Ne voit PAS Thomas Girard (équipe coaching distincte)'
  );

  // Vérification TST33 : Lucas Bernard n'a pas ORG04-10 -> champs sensibles masqués sur Julie Roux
  const julieView = dash.data!.visibleEmployees.find(
    (e) => e.id === 'emp-accueil-cs'
  )!;
  assert.equal(julieView.sensitiveBank, null);
  assert.equal(julieView.contract?.monthlyGrossEur, null);
  assert.equal(julieView.contract?.hourlyRateEur, null);
  assert.equal(julieView.email, undefined);

  // Vérification self : Lucas voit ses propres données sensibles
  const lucasSelf = dash.data!.visibleEmployees.find(
    (e) => e.id === 'emp-planif-std'
  )!;
  assert.ok(lucasSelf.sensitiveBank?.ibanMasked.startsWith('FR76'));
  assert.equal(lucasSelf.contract?.monthlyGrossEur, 2350);
});

test('TST08 — Verrou rouge planning empêche modification sans ORG04-05 (grisé sur Planif. standard)', () => {
  const engine = new CFitnessApiEngine();
  const planifStdProfile = INITIAL_ROLE_PROFILES.find(
    (p) => p.id === 'planificateur_standard'
  )!;
  const row05 = planifStdProfile.rows.find((r) => r.actionId === 'ORG04-05');
  assert.equal(getControlState(row05), 'grise_desactive');

  const blocked = engine.updateShift('emp-planif-std', 'club-carre-soie', 'sh-accueil-1', {
    startTime: '08:30',
  });
  assert.equal(blocked.status, 403);

  const adminOk = engine.updateShift('emp-admin', 'club-carre-soie', 'sh-accueil-1', {
    startTime: '08:15',
  });
  assert.equal(adminOk.status, 200);
  assert.equal(adminOk.data!.startTime, '08:15');
});

test('TST24 — KPI manquant (null) distingué de zéro € sur Beynost', () => {
  const engine = new CFitnessApiEngine();
  const dash = engine.getDashboardData('emp-admin', 'all');
  assert.equal(dash.status, 200);
  const beynost = dash.data!.kpis.find((k) => k.siteId === 'club-beynost')!;
  assert.equal(beynost.revenueEur, null);
  assert.equal(beynost.productivityPerHour, null);
  assert.equal(beynost.payrollMassEur, 10940);
});

test('TST28 — Export & Restauration sauvegarde JSON contrôlés par ORG04-31', () => {
  const engine = new CFitnessApiEngine();
  assert.equal(
    engine.exportBackupJson('emp-employe-multi', 'club-carre-soie').status,
    403
  );

  const snap = engine.exportBackupJson('emp-admin', 'club-carre-soie');
  assert.equal(snap.status, 200);

  engine.updateOrganization('emp-admin', 'club-carre-soie', {
    name: 'Nom Temporaire Test',
  });
  assert.equal(
    engine.getDashboardData('emp-admin', 'club-carre-soie').data!.organization.name,
    'Nom Temporaire Test'
  );

  const restored = engine.restoreBackupJson(
    'emp-admin',
    'club-carre-soie',
    snap.data!
  );
  assert.equal(restored.status, 200);
  assert.equal(
    engine.getDashboardData('emp-admin', 'club-carre-soie').data!.organization.name,
    'C.FITNESS OS (Environnement Fictif)'
  );
});

test('TST29 & EX32 & UTI05 — Préférences, révocation URL .ics et mot de passe >= 12 car.', () => {
  const engine = new CFitnessApiEngine();
  const prefUpd = engine.updateOwnPreferences('emp-employe-multi', {
    language: 'English',
    notifications: {
      emailEnabled: false,
      smsEnabled: true,
      frequency: 'weekly',
      digestHour: '09:00',
      includeActivityReport: true,
    },
  });
  assert.equal(prefUpd.status, 200);
  assert.equal(prefUpd.data!.language, 'English');
  assert.equal(prefUpd.data!.notifications.smsEnabled, true);

  const rev = engine.revokeCalendarToken('emp-employe-multi');
  assert.equal(rev.status, 200);
  assert.notEqual(rev.data!.calendarFeedToken, 'cal-demo-token-0000');

  const weakPwd = engine.changeOwnPassword('emp-employe-multi', 'ancien123', 'court');
  assert.equal(weakPwd.status, 400);

  const strongPwd = engine.changeOwnPassword(
    'emp-employe-multi',
    'ancien123',
    'NouveauMotDePasseTresRobuste2026!'
  );
  assert.equal(strongPwd.status, 200);
});

test('TST31 & TST40 — Employé standard cantonné à soi-même et HTTP 403 URL directe', () => {
  const engine = new CFitnessApiEngine();
  const dash = engine.getDashboardData('emp-employe-multi', 'club-carre-soie');
  assert.equal(dash.status, 200);
  assert.equal(
    dash.data!.visibleEmployees.length,
    1,
    'employe_standard ne doit voir aucun collègue même si DRO05 affiche portée sites'
  );
  assert.equal(dash.data!.visibleEmployees[0].id, 'emp-employe-multi');
  assert.equal(dash.data!.kpis.length, 0);

  const forbiddenMc11 = engine.assertSectionRouteAccess(
    'emp-employe-multi',
    'club-carre-soie',
    'MC11'
  );
  assert.equal(forbiddenMc11.status, 403);

  const allowedMc11Admin = engine.assertSectionRouteAccess(
    'emp-admin',
    'club-carre-soie',
    'MC11'
  );
  assert.equal(allowedMc11Admin.status, 200);
});

test('TST34 & TST35 — Non-élévation en délégation et révocation à effet immédiat', () => {
  const engine = new CFitnessApiEngine();

  // Admin donne ORG04-31 (Gérer droits) à master_avance, mais master_avance n'a pas ORG04-11
  const grant31 = engine.updateRolePermissions(
    'emp-admin',
    'club-carre-soie',
    'master_avance',
    'sites',
    { 'ORG04-31': true }
  );
  assert.equal(grant31.status, 200);

  // Karim Haddad (master_avance) essaie maintenant d'accorder ORG04-25 (editable sur Planif. avancé mais absent de master_avance) -> REFUS 403 TST34
  const escalationAttempt = engine.updateRolePermissions(
    'emp-master',
    'club-carre-soie',
    'planificateur_avance',
    'sites',
    { 'ORG04-25': true }
  );
  assert.equal(escalationAttempt.status, 403);
  assert.ok(escalationAttempt.error?.includes('TST34'));

  // Et un contrôle grisé/verrouillé (ORG04-11) est également refusé en 403
  const lockedAttempt = engine.updateRolePermissions(
    'emp-master',
    'club-carre-soie',
    'planificateur_avance',
    'sites',
    { 'ORG04-11': true }
  );
  assert.equal(lockedAttempt.status, 403);

  // TST35 : Admin révoque ORG04-38 sur lecture_seule_avancee -> effet immédiat sur claire.petit
  const beforeMc08 = engine.assertSectionRouteAccess(
    'emp-readonly',
    'club-beynost',
    'MC08'
  );
  assert.equal(beforeMc08.status, 200);

  const revoke38 = engine.updateRolePermissions(
    'emp-admin',
    'club-carre-soie',
    'lecture_seule_avancee',
    'sites',
    { 'ORG04-38': false, 'ORG04-40': false }
  );
  assert.equal(revoke38.status, 200);

  const afterMc08 = engine.assertSectionRouteAccess(
    'emp-readonly',
    'club-beynost',
    'MC08'
  );
  assert.equal(afterMc08.status, 403);
});

test('TST36 & PAR13 & PAR17 & Sécurité V1.16 — Diffs Carré de Soie vs Beynost, doublons Entretien, zéro donnée réelle', () => {
  const engine = new CFitnessApiEngine();
  const state = engine.getRawStateSnapshot();

  const cs = state.sites.find((s) => s.id === 'club-carre-soie')!;
  const bey = state.sites.find((s) => s.id === 'club-beynost')!;
  assert.notEqual(cs.settings.dayStartHour, bey.settings.dayStartHour);
  assert.notEqual(cs.settings.badgeFrequency, bey.settings.badgeFrequency);
  assert.notEqual(cs.settings.missionsModuleActive, bey.settings.missionsModuleActive);

  const entretiens = state.positions.filter((p) => p.label === 'Entretien');
  assert.equal(entretiens.length, 2);
  assert.notEqual(entretiens[0].id, entretiens[1].id);

  const serialized = JSON.stringify(state);
  assert.ok(!serialized.includes('skello.io'), 'Aucune trace domaine réel ne doit exister');
  for (const emp of state.employees) {
    assert.ok(emp.email.endsWith('@cfitness-fictif.local'));
  }
});

const aistudioBaseEmployee: CfosEmployee = {
  id: 'emp-1',
  firstName: 'Lucas',
  lastName: 'Martin',
  email: 'lucas@cfitness.fr',
  phone: '0612345678',
  role: 'coach',
  clubId: 'carre-de-soie',
  contractType: 'CDI',
  jobTitle: 'Coach Sportif',
  hourlyRate: 15,
  weeklyContractHours: 35,
  pinCode: '2468',
  failedPinAttempts: 0,
  pinLocked: false,
  totpEnabled: false,
  cpBalance: 12,
  rttBalance: 3,
  hireDate: '2025-09-01',
};

test('IDCC 2511 detects < 11h daily rest between evening close and early morning open', () => {
  const shifts: CfosShift[] = [
    {
      id: 's1',
      employeeId: 'emp-1',
      clubId: 'carre-de-soie',
      date: '2026-10-22',
      startTime: '14:00',
      endTime: '22:30',
      breakMinutes: 30,
      roleLabel: 'Fermeture Plateau',
      published: true,
    },
    {
      id: 's2',
      employeeId: 'emp-1',
      clubId: 'carre-de-soie',
      date: '2026-10-23',
      startTime: '06:30',
      endTime: '13:30',
      breakMinutes: 30,
      roleLabel: 'Ouverture Plateau',
      published: true,
    },
  ];

  const violations = evaluateShiftCompliance(shifts);
  assert.equal(violations.some((v) => v.code === 'DAILY_REST_UNDER_11H'), true);
});

test('IDCC 2511 passes compliant schedule with >= 11h rest and >= 20min break', () => {
  const shifts: CfosShift[] = [
    {
      id: 's1',
      employeeId: 'emp-1',
      clubId: 'carre-de-soie',
      date: '2026-10-22',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      roleLabel: 'Coaching',
      published: true,
    },
    {
      id: 's2',
      employeeId: 'emp-1',
      clubId: 'carre-de-soie',
      date: '2026-10-23',
      startTime: '08:00',
      endTime: '16:00',
      breakMinutes: 30,
      roleLabel: 'Coaching',
      published: true,
    },
  ];

  const violations = evaluateShiftCompliance(shifts);
  assert.equal(violations.length, 0);
});

test('07 mobile pool rotation never repeats the last 07 caller ID on consecutive retries', () => {
  const club = {
    landline: '04 26 22 55 30',
    mobilePool: ['07 55 52 28 04', '07 55 52 13 57', '07 55 52 44 19'],
  };

  assert.equal(selectOutboundNumber(club, '04'), '04 26 22 55 30');
  const first = selectOutboundNumber(club, '07', undefined, 0);
  const second = selectOutboundNumber(club, '07', first, 1);
  const third = selectOutboundNumber(club, '07', second, 2);

  assert.equal(first, '07 55 52 28 04');
  assert.equal(second, '07 55 52 13 57');
  assert.equal(third, '07 55 52 44 19');
  assert.notEqual(first, second);
  assert.notEqual(second, third);
});

test('PIN authentication locks employee after 5 consecutive wrong attempts', () => {
  let emp = { ...aistudioBaseEmployee };
  for (let i = 1; i <= 4; i++) {
    const res = verifyEmployeePin(emp, '0000');
    assert.equal(res.authenticated, false);
    assert.equal(res.locked, false);
    assert.equal(res.remainingAttempts, 5 - i);
    emp = res.updatedEmployee;
  }

  const fifth = verifyEmployeePin(emp, '0000');
  assert.equal(fifth.authenticated, false);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.remainingAttempts, 0);

  const afterLock = verifyEmployeePin(fifth.updatedEmployee, '2468');
  assert.equal(afterLock.authenticated, false);
  assert.equal(afterLock.locked, true);
});

test('Heitz gatekeeper blocks SEPA unpaid with SMS relance and allows inter-club access without surcharge (D9)', () => {
  const unpaidMember: HeitzMember = {
    id: 'm-1',
    badgeCode: 'HZ-9012',
    firstName: 'Camille',
    lastName: 'Roux',
    phone: '06 44 11 22 33',
    homeClubId: 'beynost',
    subscriptionName: 'Formule Liberté Bi-Clubs',
    activeSubscription: true,
    finBalanceEur: -39.9,
    finBalanceState: 0,
    technogymMoves30d: 2400,
    daysSinceLastWorkout: 3,
  };

  const blocked = evaluateGatePassage(
    unpaidMember,
    { id: 'carre-de-soie', degradedMode: false, fireAlarmOpen: false },
    '2026-10-23T10:15:00Z'
  );
  assert.equal(blocked.granted, false);
  assert.equal(blocked.smsRelanceSent, true);

  const validInterClubMember: HeitzMember = {
    ...unpaidMember,
    id: 'm-2',
    finBalanceEur: 0,
    finBalanceState: 1,
  };
  const allowed = evaluateGatePassage(
    validInterClubMember,
    { id: 'carre-de-soie', degradedMode: false, fireAlarmOpen: false },
    '2026-10-23T10:16:00Z'
  );
  assert.equal(allowed.granted, true);
  assert.equal(allowed.reason.includes('D9'), true);
});

test('Transactional 1-click onboarding rolls back cleanly on simulated failure and commits atomically with official C.FITNESS CDI contract', () => {
  const candidate: Candidate = {
    id: 'cand-1',
    offerId: 'off-1',
    firstName: 'Inès',
    lastName: 'Benali',
    email: 'ines.benali@mail.fr',
    phone: '06 78 90 12 34',
    clubId: 'beynost',
    roleTarget: 'commercial',
    contractTarget: 'CDI',
    sourceChannel: 'recrutement@c.fitness',
    stage: 'Retenu',
    experienceSummary: 'Vente et conseil fitness',
    certifications: ['PSC1'],
    aiDecisionSupportNote: 'Profil aligné accueil 3S',
    aiFitIndicators: ['PSC1 valide', 'Disponibilité samedi'],
    appliedAt: '2026-10-15',
    rgpdRetentionUntil: '2028-10-15',
  };

  const modules: TrainingModule[] = [
    {
      id: 'mod-1',
      code: 'M1',
      title: 'Accueil & posture 3S',
      authors: 'Mario & Daniel Carvalho',
      durationMin: 45,
      mandatoryFor: ['apprenti', 'coach', 'commercial'],
      summary: 'Sourire, Saluer, Servir',
      keyPoints: ['3S'],
      quizQuestion: 'Que signifie 3S ?',
      quizOptions: ['Sourire, Saluer, Servir', 'Sport, Santé, Souplesse'],
      quizCorrectIndex: 0,
    },
  ];

  const rbacDenied = executeTransactionalOnboarding({
    candidate,
    existingEmployees: [aistudioBaseEmployee],
    trainingModules: modules,
    firstShiftDate: '2026-10-26',
    firstShiftStart: '09:00',
    firstShiftEnd: '16:00',
    hourlyRate: 12.02,
    weeklyHours: 35,
    actorName: 'Commercial Test',
    actorRole: 'commercial',
    nowIso: '2026-10-23T11:00:00Z',
  });
  assert.equal(rbacDenied.ok, false);

  const rolledBack = executeTransactionalOnboarding({
    candidate,
    existingEmployees: [aistudioBaseEmployee],
    trainingModules: modules,
    firstShiftDate: '2026-10-26',
    firstShiftStart: '09:00',
    firstShiftEnd: '16:00',
    hourlyRate: 12.02,
    weeklyHours: 35,
    actorName: 'Mario Carvalho',
    actorRole: 'admin',
    nowIso: '2026-10-23T11:00:00Z',
    simulateMidWayFailure: true,
  });
  assert.equal(rolledBack.ok, false);
  assert.equal(rolledBack.newEmployee, undefined);

  const committed = executeTransactionalOnboarding({
    candidate,
    existingEmployees: [aistudioBaseEmployee],
    trainingModules: modules,
    firstShiftDate: '2026-10-26',
    firstShiftStart: '09:00',
    firstShiftEnd: '16:00',
    hourlyRate: 12.02,
    weeklyHours: 35,
    actorName: 'Mario Carvalho',
    actorRole: 'admin',
    nowIso: '2026-10-23T11:00:00Z',
  });
  assert.equal(committed.ok, true);
  assert.equal(committed.newEmployee?.pinCode.length, 4);
  assert.equal(committed.newEmployee?.monthlyGrossEur, 1823.03);
  assert.equal(committed.newEmployee?.monthlySubscriptionsTarget, 20);
  assert.equal(committed.newDocuments?.length, 2);
  assert.equal(
    committed.newDocuments?.[0].contractBodyText?.includes(CFITNESS_LEGAL_IDENTITY.siret),
    true
  );
});

test('v1.2 specifications: probation notice periods, recrutement@c.fitness parser, and official CDI contract clauses', () => {
  const noticeUnder8d = computeProbationNoticePeriod('2026-10-19', '2026-10-23', false);
  assert.equal(noticeUnder8d.employerNoticeDelayLabel.includes('24 heures'), true);

  const noticeUnder1m = computeProbationNoticePeriod('2026-10-01', '2026-10-23', false);
  assert.equal(noticeUnder1m.employerNoticeDelayLabel.includes('48 heures'), true);

  const noticeBetween1And3m = computeProbationNoticePeriod('2026-09-01', '2026-10-23', false);
  assert.equal(noticeBetween1And3m.employerNoticeDelayLabel.includes('2 semaines'), true);

  const parsedEmail = parseRecruitmentEmailPayload({
    senderLine: 'Lucas Garnier <lucas.garnier@mail.fr>',
    subjectLine: 'Candidature Conseiller Commercial Beynost',
    bodyText: 'Bonjour, voici mon CV. Tel: 06 58 41 29 70.',
    attachmentPdf: 'CV_Lucas_Garnier.pdf',
  });
  assert.equal(parsedEmail.firstName, 'Lucas');
  assert.equal(parsedEmail.lastName, 'Garnier');
  assert.equal(parsedEmail.email, 'lucas.garnier@mail.fr');
  assert.equal(parsedEmail.phone, '06 58 41 29 70');
  assert.equal(parsedEmail.clubId, 'beynost');
  assert.equal(parsedEmail.rgpdAutoReplyText.includes('recrutement@c.fitness'), true);

  const contractText = generateOfficialCdiContractText({
    firstName: 'Lucas',
    lastName: 'Garnier',
    email: 'lucas.garnier@mail.fr',
    phone: '06 58 41 29 70',
    jobTitle: 'Conseiller Commercial Fitness',
    clubId: 'carre-de-soie',
    startDate: '2026-10-26',
  });
  assert.equal(contractText.includes('818 651 317 00018'), true);
  assert.equal(contractText.includes('827000002188207761'), true);
  assert.equal(contractText.includes('20 abonnements mensuels'), true);
  assert.equal(
    contractText.includes('TOUTE ACTION COMMERCIALE NON TRACÉE DANS LE CRM C.FITNESS OS EST JURIDIQUEMENT RÉPUTÉE NON RÉALISÉE'),
    true
  );
});

test('Silae payroll calculation, formatters, and CRM guards work accurately', () => {
  const shifts: CfosShift[] = [
    {
      id: 'sh-1',
      employeeId: 'emp-1',
      clubId: 'carre-de-soie',
      date: '2026-10-25',
      startTime: '09:00',
      endTime: '17:30',
      breakMinutes: 30,
      roleLabel: 'Permanence Dimanche',
      published: true,
    },
  ];
  const rows = computePayrollVariables([aistudioBaseEmployee], shifts, '2026-10');
  assert.equal(rows[0].sundayHours, 8);
  const csv = generateSilaeCsv(rows, '2026-10');
  assert.equal(csv.includes('CDS_VAULX;2026-10;HORAIRE;HEURES;8.00;0.00;8.00'), true);
  assert.equal(csv.includes('CF-1;'), true);
  assert.equal(formatPointageType('arrivee'), 'Arrivée');
  assert.equal(formatLeaveStatus('en_attente'), 'En attente de validation');

  const prospects: Prospect[] = [
    {
      id: 'p1',
      firstName: 'Claire',
      lastName: 'Dupont',
      phone: '06 11 22 33 44',
      email: 'claire@mail.fr',
      clubId: 'beynost',
      source: 'Site c.fitness',
      stage: 'Nouveau',
      assignedToId: 'emp-1',
      rgpdConsent: true,
      bloctelListed: true,
      smsStopOptOut: true,
      retryCount: 0,
      goal: 'Remise en forme',
      notes: '',
      createdAt: '2026-10-22',
    },
  ];
  assert.ok(findDuplicateProspect(prospects, '0611223344', 'other@mail.fr'));
  assert.equal(canSendProspectSms(prospects[0]).allowed, false);
  assert.equal(canCallProspectProspection(prospects[0]).allowed, false);
  assert.equal(canAccessFeature('commercial', 'finances_payroll'), false);
  assert.equal(canAccessFeature('admin', 'finances_payroll'), true);
  assert.equal(canAccessFeature('coach', 'inbody_health_data'), true);
  assert.equal(canAccessFeature('commercial', 'inbody_health_data'), false);
  assert.equal(formatClubName('carre-de-soie'), 'Carré de Soie');
  assert.equal(formatClubName('carre-de-soie', true), 'CDS');
  assert.equal(formatClubName('beynost', true), 'BEY');
  assert.equal(isSectionAllowedForRole('governance', 'admin'), true);
  assert.equal(isSectionAllowedForRole('governance', 'commercial'), false);
  assert.equal(isSectionAllowedForRole('crm', 'coach'), false);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'devices', subTarget: 'finances' }, 'admin'), true);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'devices', subTarget: 'finances' }, 'commercial'), false);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'devices', subTarget: 'finances' }, 'coach'), false);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'devices', subTarget: 'adherents' }, 'commercial'), true);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'devices', subTarget: 'adherents' }, 'coach'), false);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'orchestrator', subTarget: 'maintenance' }, 'commercial', { canAccessMaintenance: false }), false);
  assert.equal(isNavItemAllowedForRole({ sectionId: 'orchestrator', subTarget: 'maintenance' }, 'commercial', { canAccessMaintenance: true }), true);
});

test('Multi-device backup envelope checksum and power-outage failover merge preserve offline club activity', () => {
  assert.equal(INITIAL_BACKUP_REPLICAS.length, 6);
  const checksumA = computeSnapshotChecksum('{"clubs":2,"members":6}');
  const checksumB = computeSnapshotChecksum('{"clubs":2,"members":6}');
  const checksumC = computeSnapshotChecksum('{"clubs":2,"members":7}');
  assert.equal(checksumA, checksumB);
  assert.notEqual(checksumA, checksumC);
  assert.equal(checksumA.startsWith('CFOS-SHA-'), true);

  const primaryState = {
    heitzMembers: [
      {
        id: 'm-1',
        badgeCode: 'HZ-9012',
        firstName: 'Camille',
        lastName: 'Roux',
        phone: '06 44 11 22 33',
        homeClubId: 'beynost' as const,
        subscriptionName: 'Formule Liberté',
        activeSubscription: true,
        finBalanceEur: -39.9,
        finBalanceState: 0 as const,
        technogymMoves30d: 2400,
        daysSinceLastWorkout: 3,
      },
    ],
    employees: [aistudioBaseEmployee],
    prospects: [],
    shifts: [],
    timeEntries: [],
    offlinePointageQueue: [],
    accessEvents: [],
    callLogs: [],
    auditLogs: [],
  };

  const envelope = buildBackupEnvelope(
    primaryState,
    'Tablette Kiosque Accueil Beynost',
    'coupure_courant_bascule_active',
    '2026-10-23T14:00:00Z'
  );
  assert.equal(envelope.schemaVersion, 'cfos-replica-v1.2');
  assert.equal(envelope.counts.members, 1);

  const replicaDuringOutage = {
    ...primaryState,
    heitzMembers: [
      {
        ...primaryState.heitzMembers[0],
        finBalanceEur: 0,
        finBalanceState: 1 as const,
      },
    ],
    offlinePointageQueue: [
      {
        id: 'te-offline-1',
        employeeId: 'emp-1',
        clubId: 'beynost' as const,
        timestamp: '2026-10-23T14:05:00Z',
        type: 'arrivee' as const,
        source: 'tablette_pin' as const,
        syncedFromOffline: true,
      },
    ],
    accessEvents: [
      {
        id: 'acc-offline-1',
        clubId: 'beynost' as const,
        memberId: 'm-1',
        memberName: 'Camille Roux',
        homeClubId: 'beynost' as const,
        timestamp: '2026-10-23T14:06:00Z',
        latencyMs: 12,
        granted: true,
        reason: 'Validé sur appareil de secours',
        smsRelanceSent: false,
        qrTokenGenerated: 'HZ-SEC-01',
      },
    ],
  };

  const merged = mergeFailoverSnapshot(primaryState, replicaDuringOutage);
  assert.equal(merged.stats.addedPunches, 1);
  assert.equal(merged.stats.addedAccessEvents, 1);
  assert.equal(merged.stats.regularisedMembers, 1);
  assert.equal(merged.mergedState.timeEntries.length, 1);
  assert.equal(merged.mergedState.offlinePointageQueue.length, 0);
  assert.equal(merged.mergedState.heitzMembers[0].finBalanceEur, 0);
});

test('ARCEP Decision n° 2022-1583 telecom routing and manufacturer hardware specs prevent real-world blocking', () => {
  const fixedRoute = resolveTelecomOutboundRoute('04', 'ovhcloud_sip');
  assert.equal(fixedRoute.arcepCompliant, true);
  assert.equal(fixedRoute.sipEndpoint.includes('sip.ovh.fr'), true);

  const mobileRoute = resolveTelecomOutboundRoute('07', 'ovhcloud_sip');
  assert.equal(mobileRoute.arcepCompliant, true);
  assert.equal(mobileRoute.hardwareGateway.includes('Yeastar TG400'), true);
  assert.equal(mobileRoute.sipEndpoint.includes('10.10.0.14'), true);

  assert.equal(HARDWARE_COMPATIBILITY_SPECS.length, 5);
  assert.equal(
    HARDWARE_COMPATIBILITY_SPECS.some((s) => s.domain === 'TELEPHONIE_ARCEP_SIP_GSM'),
    true
  );
  assert.equal(
    HARDWARE_COMPATIBILITY_SPECS.some((s) => s.domain === 'PORTILLONS_HEITZ_WIEGAND'),
    true
  );
  assert.equal(
    HARDWARE_COMPATIBILITY_SPECS.some((s) => s.domain === 'TABLETTES_KIOSQUES_POE'),
    true
  );
  assert.equal(
    HARDWARE_COMPATIBILITY_SPECS.some((s) => s.domain === 'BIOMETRIE_INBODY_LB120'),
    true
  );
  assert.equal(
    HARDWARE_COMPATIBILITY_SPECS.some((s) => s.domain === 'PARC_MACHINES_CARDIO_MUSCU'),
    true
  );
});

test('Legacy software 100% parity matrix, LookinBody 120 sheet metrics, and CRM-to-Heitz member conversion', () => {
  assert.equal(LEGACY_SOFTWARE_PARITY_MATRIX.length, 6);
  assert.equal(
    LEGACY_SOFTWARE_PARITY_MATRIX.every((entry) => entry.parityScorePct === 100 && entry.featuresImplemented.length >= 6),
    true
  );

  const sampleScan: InBodyScan = {
    id: 'inb-test',
    personName: 'Thomas Mercier',
    personType: 'Adhérent',
    clubId: 'carre-de-soie',
    date: '2026-10-23',
    deviceModel: 'Technogym Checkup (Mywellness)',
    weightKg: 78.4,
    skeletalMuscleMassKg: 36.2,
    bodyFatPercent: 14.2,
    totalBodyWaterL: 49.1,
    visceralFatLevel: 5,
    coachNote: 'Objectif hypertrophie',
  };

  const sheet = computeInBodySheetMetrics(sampleScan);
  assert.equal(sheet.inBodyScore >= 70 && sheet.inBodyScore <= 98, true);
  assert.equal(sheet.basalMetabolicRateKcal > 1600, true);
  assert.equal(sheet.smmStatus, 'Élevé (Athlétique)');
  assert.equal(sheet.pbfStatus, 'Normal');
  assert.equal(sheet.segmentalLean.balanceStatus, 'Équilibré');

  const prospect: Prospect = {
    id: 'pr-conv-1',
    firstName: 'Julie',
    lastName: 'Morel',
    phone: '06 45 12 89 34',
    email: 'julie.morel@mail.fr',
    clubId: 'carre-de-soie',
    source: 'Site c.fitness',
    stage: 'Venu',
    assignedToId: 'emp-maxime',
    rgpdConsent: true,
    bloctelListed: false,
    smsStopOptOut: false,
    retryCount: 1,
    goal: 'Biocircuit & Cours Co',
    notes: 'Séance découverte validée',
    createdAt: '2026-10-20',
  };

  const conv = convertProspectToHeitzMember({
    prospect,
    subscriptionName: 'Formule Premium Bi-Club + Biocircuit (39,90 €/mois)',
    actorName: 'Maxime Lefèvre',
    actorRole: 'commercial',
    nowIso: '2026-10-23T15:30:00Z',
  });

  assert.equal(conv.newMember.activeSubscription, true);
  assert.equal(conv.newMember.finBalanceEur, 0);
  assert.equal(conv.newMember.finBalanceState, 1);
  assert.equal(conv.newMember.badgeCode.startsWith('HZ-'), true);
  assert.equal(conv.sepaMandateRum.startsWith('RUM-CFIT-2026-CDS-'), true);
  assert.equal(conv.updatedProspect.stage, 'Adhérent');
});

test('Internal zero-cost electronic signature proof, Unified multi-source planning deduplication, Mywellness deep-links, and Silae API payload', () => {
  const sampleDoc: HRDocument = {
    id: 'doc-avenant-1',
    employeeId: aistudioBaseEmployee.id,
    title: 'Avenant CDI Objectifs CRM C.Fitness',
    category: 'Avenant',
    uploadedAt: '2026-10-25',
    encryptedAtRest: true,
    signedStatus: 'En attente signature',
    contractBodyText: 'Clause CRM C.Fitness OS — 20 abonnements/mois',
  };

  const rejectedConsent = createInternalElectronicSignatureProof({
    document: sampleDoc,
    employee: aistudioBaseEmployee,
    otpInput: '246842',
    consentChecked: false,
    consentPhrase: 'Lu et approuvé, bon pour accord',
  });
  assert.equal(rejectedConsent.ok, false);

  const signedRes = createInternalElectronicSignatureProof({
    document: sampleDoc,
    employee: aistudioBaseEmployee,
    otpInput: '246842',
    consentChecked: true,
    consentPhrase: 'Lu et approuvé, bon pour accord',
    nowIso: '2026-10-25T10:30:00Z',
  });
  assert.equal(signedRes.ok, true);
  assert.equal(signedRes.signedDocument?.signedStatus, 'Signé horodaté');
  assert.equal(signedRes.proof?.documentSha256.startsWith('SHA256-DOC-'), true);
  assert.equal(signedRes.proof?.proofSealSha256.startsWith('SHA256-SEAL-'), true);
  assert.equal(signedRes.proof?.legalFramework.includes('0 € / signature'), true);

  const shifts: CfosShift[] = [
    {
      id: 'sh-101',
      employeeId: aistudioBaseEmployee.id,
      clubId: 'carre-de-soie',
      date: '2026-10-23',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 60,
      roleLabel: 'Plateau & Bilans Checkup',
      published: true,
    },
  ];
  const extEvents: UnifiedPlanningEvent[] = [
    {
      id: 'ev-1',
      externalSourceId: 'MW-CRS-999',
      originSystem: 'mywellness_api',
      category: 'Cours Mywellness',
      title: 'Biocircuit Guidé',
      subtitle: 'Technogym Mywellness',
      clubId: 'carre-de-soie',
      employeeId: aistudioBaseEmployee.id,
      date: '2026-10-23',
      startTime: '10:30',
      endTime: '11:30',
      locationLabel: 'Studio CDS',
      writableViaApi: true,
      lastSyncedAt: '2026-10-23T08:00:00Z',
    },
    {
      id: 'ev-1-dup',
      externalSourceId: 'MW-CRS-999',
      originSystem: 'mywellness_api',
      category: 'Cours Mywellness',
      title: 'Biocircuit Guidé (Doublon)',
      subtitle: 'Technogym Mywellness',
      clubId: 'carre-de-soie',
      employeeId: aistudioBaseEmployee.id,
      date: '2026-10-23',
      startTime: '10:30',
      endTime: '11:30',
      locationLabel: 'Studio CDS',
      writableViaApi: true,
      lastSyncedAt: '2026-10-23T08:00:00Z',
    },
  ];

  const unified = buildUnifiedPlanningEvents(shifts, extEvents);
  assert.equal(unified.length, 2);

  const deepLink = buildMywellnessContextualUrl({
    mywellnessMemberId: 'mw-claire-1042',
    personName: 'Claire Dubois',
    clubId: 'carre-de-soie',
  });
  assert.equal(deepLink.isContextualDeepLink, true);
  assert.equal(deepLink.url.includes('/member/mw-claire-1042'), true);

  const fallbackLink = buildMywellnessContextualUrl({ clubId: 'beynost' });
  assert.equal(fallbackLink.isContextualDeepLink, false);
  assert.equal(fallbackLink.url.includes('/dashboard'), true);

  const payrollRows = computePayrollVariables([aistudioBaseEmployee], shifts);
  const apiPayload = buildSilaeApiPayload(payrollRows, '2026-10', 'API_REST_SILAE');
  assert.equal(apiPayload.dossierNumero, '081865');
  assert.equal(apiPayload.idcc, '2511');
  assert.equal(apiPayload.variables.length, 1);

  const trialQr = generateHeitzTrialPassageCode(
    {
      id: 'pr-2',
      firstName: 'Nicolas',
      lastName: 'Perrin',
      clubId: 'carre-de-soie',
    },
    '2026-10-25 18:00'
  );
  assert.equal(trialQr.idCenter, 5052);
  assert.equal(trialQr.heitzPassageQrCode.startsWith('HZ-QR-PASS-5052-'), true);
  assert.equal(trialQr.smsConfirmationText.includes(trialQr.heitzPassageQrCode), true);

  const kpiSummary = computeHeitzKpiSummary(INITIAL_HEITZ_KPI_TICKETS, 'all');
  assert.equal(kpiSummary.ticketsCount, 5);
  assert.equal(kpiSummary.totalRevenueTtcEur > 180, true);
  assert.equal(kpiSummary.totalSilaeCommissionsEur > 40, true);
  assert.equal(kpiSummary.byEmployeeSeller.length >= 3, true);
});

test('LEAD-TST01 — Intégrité du registre Lead v0.4 (1682 entrées, 28 groupes, 23 écarts, 11 blocages, 16 exemples)', () => {
  assert.equal(
    LEAD_AUDIT_META.observedCount + LEAD_AUDIT_META.documentedCount + LEAD_AUDIT_META.toVerifyCount,
    LEAD_AUDIT_META.totalEntries
  );
  assert.equal(LEAD_AUDIT_META.totalEntries, 1682);
  assert.equal(LEAD_28_TRACEABILITY_GROUPS.length, 28);
  const groupSum = LEAD_28_TRACEABILITY_GROUPS.reduce((acc, g) => acc + g.count, 0);
  assert.equal(groupSum, 1682);
  assert.equal(LEAD_23_ECARTS.length, 23);
  assert.equal(LEAD_11_BLOCAGES.length, 11);
  assert.equal(LEAD_16_EXEMPLES.length, 16);
  assert.equal(LEAD_SETTINGS_TABS_14.length, 14);
  assert.equal(LEAD_PARTNERS_9.length, 9);
  assert.equal(LEAD_26_CAPTURES.length, 26);
  assert.equal(LEAD_IMPORT_COLUMNS_11.length, 11);
});

test('LEAD-TST02 — Contrôle RBAC serveur ADMIN / MANAGER / COMMERCIAL & ACL-01', () => {
  assert.equal(evaluateLeadModuleAccess('admin', 'communication').httpStatus, 200);
  assert.equal(evaluateLeadModuleAccess('manager', 'settings').httpStatus, 200);

  const commBlocked = evaluateLeadModuleAccess('commercial', 'communication');
  assert.equal(commBlocked.allowed, false);
  assert.equal(commBlocked.httpStatus, 403);

  const settingsBlocked = evaluateLeadModuleAccess('commercial', 'settings');
  assert.equal(settingsBlocked.allowed, false);
  assert.equal(settingsBlocked.httpStatus, 403);

  // ACL-01 : corbeille formulaire bloquée en 403 pour COMMERCIAL
  const acl01 = evaluateLeadModuleAccess('commercial', 'form_delete');
  assert.equal(acl01.allowed, false);
  assert.equal(acl01.httpStatus, 403);
  assert.equal(acl01.reason.includes('ACL-01'), true);

  // COACH et BASIC obsolètes refusés en 403
  assert.equal(evaluateLeadModuleAccess('coach', 'prospects').httpStatus, 403);
  assert.equal(evaluateLeadModuleAccess('basic', 'prospects').httpStatus, 403);
});

test('LEAD-TST03 — Import Excel officiel 11 colonnes (Email requis, doublons, RGPD false par défaut)', () => {
  const rows: string[][] = [
    [...LEAD_IMPORT_COLUMNS_11],
    ['F', 'Camille', 'Test', 'camille@fictif.fr', '0611223344', '1 Rue Test', '69120', 'Vaulx-en-Velin', '15/05/1995', '', 'Sans consentement -> false'],
    ['M', 'Dupont', 'Invalide', 'pas-un-email', '0622334455', '2 Rue Test', '01700', 'Beynost', '01/01/1990', 'VRAI', 'Rejet email'],
    ['F', 'Claire', 'Doublon', 'existant@club.fr', '0699887766', '3 Rue Test', '69120', 'Vaulx-en-Velin', '10/03/1992', 'VRAI', 'Doublon email'],
  ];

  const summary = validateAndParseLeadImportRows(rows, ['existant@club.fr'], ['0600000000']);
  assert.equal(summary.totalDataRows, 3);
  assert.equal(summary.validCount, 1);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.duplicateCount, 1);
  assert.equal(summary.results[0].consentGranted, false);
});

test('LEAD-TST04 — Archivage prospect (réponse entrante uniquement) & exclusion Vacances client', () => {
  // Envoi sortant à J-1 ne repousse PAS l'archivage si aucune réponse entrante depuis 35 jours
  const archive = evaluateProspectAutoArchive(35, 1, 30, false);
  assert.equal(archive.shouldArchive, true);
  assert.equal(archive.excludedFromCampaigns, true);

  // Réponse entrante à J-5 repousse l'archivage
  const keepActive = evaluateProspectAutoArchive(5, 1, 30, false);
  assert.equal(keepActive.shouldArchive, false);

  // Vacances client actives : exclu des campagnes sans archivage
  const vacation = evaluateProspectAutoArchive(35, 1, 30, true);
  assert.equal(vacation.shouldArchive, false);
  assert.equal(vacation.excludedFromCampaigns, true);
});

test('LEAD-TST05 — WhatsApp 24h & replis WA-01/WA-02/INC-001, collisions RDV-01, SMS-01 & webhook API-01', () => {
  // INC-001 : sans explicitSave, aucun brouillon créé
  const openWin = resolveWhatsAppSendDecision({
    hoursSinceLastInboundMessage: 10,
    templateMetaApproved: true,
    requiredMediaAttached: true,
    fallbackPolicy: 'ne_pas_envoyer',
    explicitSave: false,
  });
  assert.equal(openWin.window24hOpen, true);
  assert.equal(openWin.deliveryChannel, 'whatsapp_direct');
  assert.equal(openWin.draftCreated, false);

  // WA-01 : fenêtre expirée -> repli SMS
  const closedSms = resolveWhatsAppSendDecision({
    hoursSinceLastInboundMessage: 30,
    templateMetaApproved: true,
    requiredMediaAttached: true,
    fallbackPolicy: 'sms_repli',
    explicitSave: true,
  });
  assert.equal(closedSms.window24hOpen, false);
  assert.equal(closedSms.deliveryChannel, 'sms_repli');
  assert.equal(closedSms.draftCreated, true);

  // WA-02 : média manquant bloque l'envoi même si Meta approuvé
  const missingMedia = resolveWhatsAppSendDecision({
    hoursSinceLastInboundMessage: 12,
    templateMetaApproved: true,
    requiredMediaAttached: false,
    fallbackPolicy: 'modele_approuve',
    explicitSave: false,
  });
  assert.equal(missingMedia.deliveryChannel, 'bloque');
  assert.equal(missingMedia.validationErrors[0].includes('WA-02'), true);

  // RDV-01 : collision inter-types refusée sur même créneau/coach
  const rdvCollision = validateAppointmentBooking(
    [
      {
        id: 's1',
        clubId: 'carre-de-soie',
        coachId: 'emp-karim',
        typeName: 'Bilan Checkup',
        date: '2026-11-20',
        startTime: '10:00',
        durationMinutes: 45,
        capacityMax: 1,
        currentBookedCount: 1,
        paidRequired: false,
        paymentStatus: 'non_requis',
      },
    ],
    {
      clubId: 'carre-de-soie',
      coachId: 'emp-karim',
      typeName: 'Coaching Découverte',
      date: '2026-11-20',
      startTime: '10:00',
      hoursBeforeSlot: 6,
      minDelayHours: 2,
      capacityMax: 1,
      requiresStripePayment: true,
      stripePaidConfirmed: false,
    },
    true
  );
  assert.equal(rdvCollision.accepted, false);
  assert.equal(rdvCollision.collisionDetected, true);

  // SMS-01 : GSM-7 vs UCS-2
  assert.equal(computeSmsSegmentMetrics('Bonjour C.Fitness').maxPerSms, 160);
  assert.equal(computeSmsSegmentMetrics('Bonjour C.Fitness 💪').encoding, 'UCS-2');

  // API-01 : Webhook clubEntry contact vs essai
  const whTrial = ingestLeadClubEntryWebhook({
    apiKey: 'secret-demo',
    club: 'beynost',
    email: 'test@fictif.fr',
    lastname: 'Test',
    firstname: 'Lucas',
    offername: 'Pass 7 jours',
  });
  assert.equal(whTrial.status, 200);
  assert.equal(whTrial.entryType, 'demande_essai');
  const whMissing = ingestLeadClubEntryWebhook({ apiKey: 'secret-demo', club: 'beynost' });
  assert.equal(whMissing.status, 400);
});

test('LEAD-TST06 — Statistiques par période, ventes fin abonnement, CSV guillemets et échéances activités', () => {
  // CSV avec point-virgule protégé par guillemets (CFOS-050)
  const cols = parseCsvLineWithQuotes('F;Camille;Garnier;"12 Rue;Lyon";0611223344', ';');
  assert.equal(cols.length, 5);
  assert.equal(cols[3], '12 Rue;Lyon');

  // Ventes filtrées par date de fin d'abonnement (CFOS-020/044)
  const decSales = filterFictiveSales(INITIAL_FICTIVE_SALES, {
    clubCds: true,
    clubBeynost: true,
    endsAfter: '2026-12-01',
    endsBefore: '2026-12-31',
  });
  assert.equal(decSales.length, 1);
  assert.equal(decSales[0].clubId, 'beynost');

  // Statistiques par période + série N-1 distincte
  const sampleProspects: Prospect[] = [
    {
      id: 'st-1',
      firstName: 'A',
      lastName: 'B',
      phone: '0600000001',
      email: 'a@test.fr',
      clubId: 'carre-de-soie',
      source: 'Site c.fitness',
      stage: 'Adhérent',
      assignedToId: 'emp-maxime',
      rgpdConsent: true,
      bloctelListed: false,
      smsStopOptOut: false,
      retryCount: 0,
      goal: 'Test',
      notes: '',
      createdAt: '2026-10-25',
    },
    {
      id: 'st-2',
      firstName: 'C',
      lastName: 'D',
      phone: '0600000002',
      email: 'c@test.fr',
      clubId: 'beynost',
      source: 'Parrainage',
      stage: 'Nouveau',
      assignedToId: 'emp-chloe',
      rgpdConsent: true,
      bloctelListed: false,
      smsStopOptOut: false,
      retryCount: 1,
      goal: 'Test',
      notes: '',
      createdAt: '2025-10-25',
    },
  ];
  const statsToday = computeLeadReportBreakdown('source', sampleProspects, {
    periodId: 'today',
    multiClubCds: true,
    multiClubBeynost: true,
    ignoreArchived: true,
    compareToPreviousYear: true,
    referenceDate: new Date('2026-10-25T12:00:00Z'),
  });
  assert.equal(statsToday.filteredCount, 1);
  assert.equal(statsToday.previousYearCount, 1);
  assert.equal(statsToday.rows[0].label, 'Site c.fitness');

  // Échéances activités dynamiques (CFOS-046/047)
  const ref = new Date('2026-11-19T12:00:00Z');
  assert.equal(computeActivityDueBucket('2026-11-18T10:00', 'todo', ref), 'En retard');
  assert.equal(computeActivityDueBucket('2026-11-19T15:00', 'todo', ref), "Aujourd'hui");
  assert.equal(computeActivityDueBucket('2026-11-20T09:00', 'todo', ref), 'Demain');
  assert.equal(computeActivityDueBucket('2026-11-18T10:00', 'done', ref), 'Faites');
});
