import type {
  AppDatabaseState,
  Employee,
  EmployeeSiteAccess,
  LeaveRequest,
  McSectionId,
  PermissionCheckResult,
  PermissionControlState,
  PermissionRow,
  PlanningLockState,
  ProfileId,
  RedactedEmployeeView,
  Scope,
  SessionContext,
  Shift,
  SiteKpis,
  TimeclockAnomaly,
} from './types';

const SCOPE_RANK: Record<Scope, number> = {
  self: 1,
  teams: 2,
  sites: 3,
};

const SELF_ONLY_ACTIONS = new Set<string>([
  'ORG04-18', // Faire ses propres demandes de disponibilité
  'ORG04-19', // Faire ses propres demandes de congés
  'ORG04-20', // Modifier son dossier RH
  'ORG04-21', // Ajouter ses documents
  'ORG04-22', // Accéder à ses compteurs heures jours fériés et RCR
]);

export function computeShiftNetMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number
): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (
    Number.isNaN(sh) ||
    Number.isNaN(sm) ||
    Number.isNaN(eh) ||
    Number.isNaN(em)
  ) {
    return 0;
  }
  const startTotal = sh * 60 + sm;
  let endTotal = eh * 60 + em;
  if (endTotal < startTotal) {
    endTotal += 24 * 60; // Passage de minuit
  }
  const gross = endTotal - startTotal;
  return Math.max(0, gross - Math.max(0, breakMinutes));
}

export function formatMinutesAsHours(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours}h${mins.toString().padStart(2, '0')}`;
}

export function getControlState(row?: PermissionRow): PermissionControlState {
  if (!row || !row.exposed) {
    return 'non_propose';
  }
  if (row.disabled === true) {
    return 'grise_desactive';
  }
  if (row.checked === true) {
    return 'autorise';
  }
  return 'decoche';
}

export function resolveSiteAccess(
  employee: Employee,
  requestedSiteId: string | 'all'
): EmployeeSiteAccess | undefined {
  if (requestedSiteId === 'all') {
    return (
      employee.siteAccesses.find((a) => a.isPrimary) ??
      employee.siteAccesses[0]
    );
  }
  return employee.siteAccesses.find((a) => a.siteId === requestedSiteId);
}

export interface PermissionTarget {
  siteId?: string;
  targetEmployeeId?: string;
  targetTeamIds?: string[];
  lockState?: PlanningLockState;
}

export function evaluatePermission(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all',
  actionId: string,
  target?: PermissionTarget
): PermissionCheckResult {
  const actor = state.employees.find((e) => e.id === actorId);
  if (!actor || !actor.active) {
    return {
      allowed: false,
      state: 'non_propose',
      effectiveScope: 'self',
      reason: 'Compte inexistant ou archivé.',
    };
  }

  const targetSiteId = target?.siteId ?? activeSiteId;
  const access = resolveSiteAccess(actor, targetSiteId);
  if (!access) {
    return {
      allowed: false,
      state: 'non_propose',
      effectiveScope: 'self',
      reason: 'Établissement hors périmètre de rattachement.',
    };
  }

  const profile = state.profiles.find((p) => p.id === access.profileId);
  if (!profile) {
    return {
      allowed: false,
      state: 'non_propose',
      effectiveScope: 'self',
      reason: 'Profil de droits introuvable.',
    };
  }

  const row = profile.rows.find((r) => r.actionId === actionId);
  const ctrlState = getControlState(row);
  const declaredScope = profile.scopeSelected;

  if (ctrlState !== 'autorise') {
    return {
      allowed: false,
      state: ctrlState,
      effectiveScope: declaredScope,
      reason:
        ctrlState === 'non_propose'
          ? `Action ${actionId} non proposée pour le profil ${profile.name}.`
          : ctrlState === 'grise_desactive'
            ? `Action ${actionId} désactivée (grisée) sur ${profile.name}.`
            : `Action ${actionId} décochée pour ${profile.name}.`,
    };
  }

  // Vérification des actions strictement personnelles même si l'UI source affiche "établissements" (cas DRO05)
  if (SELF_ONLY_ACTIONS.has(actionId)) {
    if (target?.targetEmployeeId && target.targetEmployeeId !== actorId) {
      return {
        allowed: false,
        state: 'autorise',
        effectiveScope: 'self',
        reason: `L'action personnelle ${actionId} est strictement limitée à soi-même.`,
      };
    }
    return {
      allowed: true,
      state: 'autorise',
      effectiveScope: 'self',
      reason: 'Autorisé sur son propre dossier.',
    };
  }

  // Contrôle de portée (moi / mes équipes / mes établissements)
  if (declaredScope === 'self') {
    if (target?.targetEmployeeId && target.targetEmployeeId !== actorId) {
      return {
        allowed: false,
        state: 'autorise',
        effectiveScope: 'self',
        reason: 'Portée limitée à soi-même (me concernant uniquement).',
      };
    }
  } else if (declaredScope === 'teams') {
    if (target?.targetEmployeeId && target.targetEmployeeId !== actorId) {
      const targetTeams = target.targetTeamIds ?? [];
      const sharesTeam = targetTeams.some((tid) => access.teamIds.includes(tid));
      if (!sharesTeam) {
        return {
          allowed: false,
          state: 'autorise',
          effectiveScope: 'teams',
          reason: 'Donnée hors de votre périmètre d’équipe(s).',
        };
      }
    }
  }

  // Vérification des verrous du planning (TST08)
  if (
    (actionId === 'ORG04-01' || actionId === 'ORG04-02') &&
    target?.lockState &&
    target.lockState !== 'none'
  ) {
    const requiredLockAction =
      target.lockState === 'red' ? 'ORG04-05' : 'ORG04-04';
    const lockRow = profile.rows.find((r) => r.actionId === requiredLockAction);
    if (getControlState(lockRow) !== 'autorise') {
      return {
        allowed: false,
        state: getControlState(lockRow),
        effectiveScope: declaredScope,
        reason: `Période verrouillée (${target.lockState}) : droit ${requiredLockAction} requis.`,
      };
    }
  }

  return {
    allowed: true,
    state: 'autorise',
    effectiveScope: declaredScope,
    reason: 'Autorisé.',
  };
}

export function canAccessSiteScope(
  state: AppDatabaseState,
  actorId: string,
  siteId: string | 'all'
): boolean {
  const actor = state.employees.find((e) => e.id === actorId);
  if (!actor || !actor.active) return false;
  if (siteId === 'all') {
    const primary = resolveSiteAccess(actor, 'all');
    if (!primary) return false;
    const profile = state.profiles.find((p) => p.id === primary.profileId);
    return Boolean(
      actor.siteAccesses.length > 1 &&
        profile &&
        profile.scopeSelected === 'sites' &&
        (evaluatePermission(state, actorId, primary.siteId, 'ORG04-07').allowed ||
          evaluatePermission(state, actorId, primary.siteId, 'ORG04-38').allowed)
    );
  }
  return actor.siteAccesses.some((a) => a.siteId === siteId);
}

export function redactEmployeeForActor(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all',
  targetEmployee: Employee
): RedactedEmployeeView | null {
  const isSelf = actorId === targetEmployee.id;

  const targetSiteAccess =
    activeSiteId === 'all'
      ? targetEmployee.siteAccesses.find((a) => a.isPrimary) ??
        targetEmployee.siteAccesses[0]
      : targetEmployee.siteAccesses.find((a) => a.siteId === activeSiteId);

  if (!targetSiteAccess) {
    return null;
  }

  const canViewFile =
    isSelf ||
    evaluatePermission(state, actorId, targetSiteAccess.siteId, 'ORG04-07', {
      siteId: targetSiteAccess.siteId,
      targetEmployeeId: targetEmployee.id,
      targetTeamIds: targetSiteAccess.teamIds,
    }).allowed;

  if (!canViewFile) {
    return null;
  }

  const canViewSensitivePay =
    isSelf ||
    evaluatePermission(state, actorId, targetSiteAccess.siteId, 'ORG04-10', {
      siteId: targetSiteAccess.siteId,
      targetEmployeeId: targetEmployee.id,
      targetTeamIds: targetSiteAccess.teamIds,
    }).allowed;

  const baseView: RedactedEmployeeView = {
    id: targetEmployee.id,
    firstName: targetEmployee.firstName,
    lastName: targetEmployee.lastName,
    matricule: targetEmployee.matricule,
    active: targetEmployee.active,
    hrFileStatus: targetEmployee.hrFileStatus,
    siteAccesses: targetEmployee.siteAccesses,
    counter: targetEmployee.counter,
    contract: {
      id: targetEmployee.contract.id,
      siteId: targetEmployee.contract.siteId,
      contractType: targetEmployee.contract.contractType,
      regime: targetEmployee.contract.regime,
      weeklyHours: targetEmployee.contract.weeklyHours,
      annualDays: targetEmployee.contract.annualDays,
      loadedCostFactor: targetEmployee.contract.loadedCostFactor,
      effectiveFrom: targetEmployee.contract.effectiveFrom,
      effectiveTo: targetEmployee.contract.effectiveTo,
      monthlyGrossEur: canViewSensitivePay
        ? targetEmployee.contract.monthlyGrossEur
        : null,
      hourlyRateEur: canViewSensitivePay
        ? targetEmployee.contract.hourlyRateEur
        : null,
    },
  };

  if (canViewSensitivePay) {
    baseView.email = targetEmployee.email;
    baseView.phone = targetEmployee.phone;
    baseView.sensitiveBank = targetEmployee.sensitiveBank;
  } else {
    baseView.sensitiveBank = null;
  }

  return baseView;
}

export function filterShiftsForActor(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all'
): Shift[] {
  const actor = state.employees.find((e) => e.id === actorId);
  if (!actor) return [];

  return state.shifts.filter((shift) => {
    if (activeSiteId !== 'all' && shift.siteId !== activeSiteId) {
      return false;
    }
    const siteAccess = resolveSiteAccess(actor, shift.siteId);
    if (!siteAccess) return false;

    if (shift.employeeId === actorId) {
      return shift.published || evaluatePermission(state, actorId, shift.siteId, 'ORG04-02').allowed;
    }

    if (shift.employeeId === null) {
      // Shift non assigné visible aux planificateurs et gestionnaires autorisés
      return (
        evaluatePermission(state, actorId, shift.siteId, 'ORG04-01').allowed ||
        evaluatePermission(state, actorId, shift.siteId, 'ORG04-02').allowed
      );
    }

    const targetEmp = state.employees.find((e) => e.id === shift.employeeId);
    const targetAccess = targetEmp?.siteAccesses.find(
      (a) => a.siteId === shift.siteId
    );
    const canSeeOthers = evaluatePermission(
      state,
      actorId,
      shift.siteId,
      'ORG04-07',
      {
        siteId: shift.siteId,
        targetEmployeeId: shift.employeeId,
        targetTeamIds: targetAccess?.teamIds ?? [],
      }
    ).allowed;
    return canSeeOthers;
  });
}

export function filterLeaveRequestsForActor(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all'
): LeaveRequest[] {
  const actor = state.employees.find((e) => e.id === actorId);
  if (!actor) return [];
  return state.leaveRequests.filter((req) => {
    if (activeSiteId !== 'all' && req.siteId !== activeSiteId) return false;
    if (req.employeeId === actorId) return true;
    const targetEmp = state.employees.find((e) => e.id === req.employeeId);
    const targetAccess = targetEmp?.siteAccesses.find(
      (a) => a.siteId === req.siteId
    );
    return evaluatePermission(state, actorId, req.siteId, 'ORG04-17', {
      siteId: req.siteId,
      targetEmployeeId: req.employeeId,
      targetTeamIds: targetAccess?.teamIds ?? [],
    }).allowed;
  });
}

export function filterAnomaliesForActor(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all'
): TimeclockAnomaly[] {
  const actor = state.employees.find((e) => e.id === actorId);
  if (!actor) return [];
  return state.anomalies
    .filter((anom) => {
      if (activeSiteId !== 'all' && anom.siteId !== activeSiteId) return false;
      if (anom.employeeId === actorId) return true;
      const targetEmp = state.employees.find((e) => e.id === anom.employeeId);
      const targetAccess = targetEmp?.siteAccesses.find(
        (a) => a.siteId === anom.siteId
      );
      return evaluatePermission(state, actorId, anom.siteId, 'ORG04-35', {
        siteId: anom.siteId,
        targetEmployeeId: anom.employeeId,
        targetTeamIds: targetAccess?.teamIds ?? [],
      }).allowed;
    })
    .map((anom) => {
      // EX27 : masquer les preuves photo/signature si pas d'habilitation badgeuse
      const canSeeProof =
        anom.employeeId === actorId ||
        evaluatePermission(state, actorId, anom.siteId, 'ORG04-35').allowed;
      return canSeeProof ? anom : { ...anom, hasProofPhoto: false };
    });
}

export function filterKpisForActor(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all'
): SiteKpis[] {
  const actor = state.employees.find((e) => e.id === actorId) as
    | (Employee & { canAccessFinances?: boolean; canAccessReports?: boolean })
    | undefined;
  const primaryAccess = actor?.siteAccesses.find((a) => a.isPrimary) ?? actor?.siteAccesses[0];
  const profileId = primaryAccess?.profileId;
  const isAdminProfile = profileId === 'admin_systeme';
  const isManagerProfile = profileId === 'master_avance' || profileId === 'planificateur_avance';
  const canSeeFinances = Boolean(actor?.canAccessFinances) || isAdminProfile;
  const canSeeReports = Boolean(actor?.canAccessReports) || isAdminProfile || isManagerProfile;

  const visible: SiteKpis[] = [];
  for (const kpi of state.kpis) {
    if (activeSiteId !== 'all' && kpi.siteId !== activeSiteId) continue;
    const allowed = canSeeReports || evaluatePermission(state, actorId, kpi.siteId, 'ORG04-38', {
      siteId: kpi.siteId,
    }).allowed;
    if (!allowed) continue;
    visible.push(
      canSeeFinances
        ? kpi
        : {
            ...kpi,
            revenueEur: null,
            productivityPerHour: null,
            payrollMassEur: null,
          }
    );
  }
  return visible;
}

export function validateDelegationUpdate(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all',
  targetProfileId: ProfileId,
  nextScope: Scope,
  updatedCheckedMap: Record<string, boolean>
): { ok: boolean; error?: string } {
  const canEditRights = evaluatePermission(
    state,
    actorId,
    activeSiteId,
    'ORG04-31'
  );
  if (!canEditRights.allowed) {
    return {
      ok: false,
      error: `Refus serveur (403) : ${canEditRights.reason}`,
    };
  }

  const actor = state.employees.find((e) => e.id === actorId);
  const actorAccess = actor ? resolveSiteAccess(actor, activeSiteId) : undefined;
  const actorProfile = actorAccess
    ? state.profiles.find((p) => p.id === actorAccess.profileId)
    : undefined;
  const targetProfile = state.profiles.find((p) => p.id === targetProfileId);

  if (!actorProfile || !targetProfile) {
    return { ok: false, error: 'Profil introuvable.' };
  }

  if (!targetProfile.scopeEditable && nextScope !== targetProfile.scopeSelected) {
    return {
      ok: false,
      error: `Le périmètre de ${targetProfile.name} n'est pas modifiable.`,
    };
  }

  // TST34 : aucune délégation d'un périmètre supérieur au sien
  if (SCOPE_RANK[nextScope] > SCOPE_RANK[actorProfile.scopeSelected]) {
    return {
      ok: false,
      error: `Délégation refusée (TST34) : portée demandée (${nextScope}) supérieure à votre propre portée (${actorProfile.scopeSelected}).`,
    };
  }

  // TST34 : aucune attribution d'une action que l'acteur ne détient pas ou sur une case verrouillée
  for (const [actionId, wantChecked] of Object.entries(updatedCheckedMap)) {
    const targetRow = targetProfile.rows.find((r) => r.actionId === actionId);
    if (!targetRow || !targetRow.exposed) {
      return {
        ok: false,
        error: `Action ${actionId} non proposée sur ${targetProfile.name}.`,
      };
    }
    if (!targetRow.editableControl && Boolean(targetRow.checked) !== wantChecked) {
      return {
        ok: false,
        error: `Contrôle grisé/verrouillé pour ${actionId} sur ${targetProfile.name}.`,
      };
    }
    if (wantChecked && !targetRow.checked) {
      const actorRow = actorProfile.rows.find((r) => r.actionId === actionId);
      if (getControlState(actorRow) !== 'autorise') {
        return {
          ok: false,
          error: `Délégation refusée (TST34) : vous ne détenez pas la capacité ${actionId} (${targetRow.label}).`,
        };
      }
    }
  }

  return { ok: true };
}

export function getVisibleSectionsForSession(
  state: AppDatabaseState,
  actorId: string,
  activeSiteId: string | 'all'
): McSectionId[] {
  const sections: McSectionId[] = [
    'MC01', // Tableau de bord
    'MC02', // Mes informations et mon dossier
    'MC03', // Planning RH
    'MC04', // Demandes et disponibilités
    'MC05', // Temps et pointeuse (mon suivi)
    'MC06', // Documents (mes documents)
  ];

  const has = (actionId: string) =>
    evaluatePermission(state, actorId, activeSiteId, actionId).allowed;

  const actor = state.employees.find((e) => e.id === actorId) as
    | (Employee & { canAccessFinances?: boolean; canAccessReports?: boolean })
    | undefined;
  const primaryAccess = actor?.siteAccesses.find((a) => a.isPrimary) ?? actor?.siteAccesses[0];
  const profileId = primaryAccess?.profileId;
  const isAdminProfile = profileId === 'admin_systeme';
  const isManagerProfile = profileId === 'master_avance' || profileId === 'planificateur_avance';
  const canFinance = Boolean(actor?.canAccessFinances) || isAdminProfile;
  const canReports = Boolean(actor?.canAccessReports) || isAdminProfile || isManagerProfile;

  if (canFinance) {
    sections.push('MC07'); // Finances / préparation de paie
  }
  if (has('ORG04-38') || has('ORG04-40') || canReports) {
    sections.push('MC08'); // Pilotage et rapports
  }
  if (isAdminProfile || isManagerProfile) {
    sections.push('MC09'); // Collaborateurs et RH
  }
  if (
    has('ORG04-27') ||
    has('ORG04-28') ||
    has('ORG04-29') ||
    has('ORG04-30') ||
    has('ORG04-34') ||
    has('ORG04-37')
  ) {
    sections.push('MC10'); // Paramètres RH
  }
  if (has('ORG04-31') || has('ORG04-32') || has('ORG04-33')) {
    sections.push('MC11'); // Administration et droits
  }
  if (has('ORG04-31') || has('ORG04-33')) {
    sections.push('MC12'); // Intégrations et recrutement
  }

  sections.push('MC13'); // Préférences et assistance toujours accessibles pour soi
  return sections;
}

export function buildSessionContext(
  state: AppDatabaseState,
  actorId: string,
  requestedSiteId: string | 'all'
): SessionContext | null {
  const employee = state.employees.find((e) => e.id === actorId);
  if (!employee) return null;

  const activeSiteId =
    requestedSiteId === 'all' && canAccessSiteScope(state, actorId, 'all')
      ? 'all'
      : requestedSiteId !== 'all' &&
          employee.siteAccesses.some((a) => a.siteId === requestedSiteId)
        ? requestedSiteId
        : (employee.siteAccesses.find((a) => a.isPrimary)?.siteId ??
          employee.siteAccesses[0]?.siteId ??
          'club-carre-soie');

  const activeAccess = resolveSiteAccess(employee, activeSiteId);
  if (!activeAccess) return null;

  const activeProfile = state.profiles.find(
    (p) => p.id === activeAccess.profileId
  );
  if (!activeProfile) return null;

  const resolvedPermissions: SessionContext['resolvedPermissions'] = {};
  for (const row of activeProfile.rows) {
    const res = evaluatePermission(state, actorId, activeSiteId, row.actionId);
    resolvedPermissions[row.actionId] = {
      state: res.state,
      allowed: res.allowed,
      scope: res.effectiveScope,
    };
  }

  return {
    employee,
    activeSiteId,
    activeAccess,
    activeProfile,
    resolvedPermissions,
    visibleSections: getVisibleSectionsForSession(
      state,
      actorId,
      activeSiteId
    ),
  };
}
