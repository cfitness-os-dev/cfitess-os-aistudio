import {
  buildSessionContext,
  evaluatePermission,
  filterAnomaliesForActor,
  filterKpisForActor,
  filterLeaveRequestsForActor,
  filterShiftsForActor,
  redactEmployeeForActor,
  validateDelegationUpdate,
} from './rbac';
import { createInitialSeedState } from './seed';
import type {
  AppDatabaseState,
  AuditEvent,
  LeaveRequest,
  McSectionId,
  Organization,
  ProfileId,
  RedactedEmployeeView,
  RoleProfile,
  Scope,
  SessionContext,
  Shift,
  Site,
  SiteKpis,
  TimeclockAnomaly,
  UserPreferences,
} from './types';

export interface ApiResponse<T> {
  status: 200 | 400 | 403 | 404;
  data?: T;
  error?: string;
}

export interface DashboardPayload {
  session: SessionContext;
  organization: Organization;
  org02BillingPolicy: AppDatabaseState['org02BillingPolicy'];
  sites: Site[];
  myShifts: Shift[];
  teamShifts: Shift[];
  myRequests: LeaveRequest[];
  teamRequests: LeaveRequest[];
  anomalies: TimeclockAnomaly[];
  kpis: SiteKpis[];
  visibleEmployees: RedactedEmployeeView[];
  positions: AppDatabaseState['positions'];
  teams: AppDatabaseState['teams'];
  preferences: UserPreferences;
  auditCount: number;
}

export class CFitnessApiEngine {
  private state: AppDatabaseState;

  constructor(initialState?: AppDatabaseState) {
    this.state = initialState
      ? structuredClone(initialState)
      : createInitialSeedState();
  }

  public getRawStateSnapshot(): AppDatabaseState {
    return structuredClone(this.state);
  }

  public exportBackupJson(
    actorId: string,
    activeSiteId: string | 'all'
  ): ApiResponse<string> {
    const perm = evaluatePermission(
      this.state,
      actorId,
      activeSiteId,
      'ORG04-31'
    );
    if (!perm.allowed) {
      return { status: 403, error: `Export sauvegarde refusé : ${perm.reason}` };
    }
    return {
      status: 200,
      data: JSON.stringify(this.state, null, 2),
    };
  }

  public restoreBackupJson(
    actorId: string,
    activeSiteId: string | 'all',
    rawJson: string
  ): ApiResponse<{ restoredAt: string }> {
    const perm = evaluatePermission(
      this.state,
      actorId,
      activeSiteId,
      'ORG04-31'
    );
    if (!perm.allowed) {
      return { status: 403, error: `Restauration refusée : ${perm.reason}` };
    }
    try {
      const parsed = JSON.parse(rawJson) as AppDatabaseState;
      if (
        !parsed ||
        !Array.isArray(parsed.sites) ||
        !Array.isArray(parsed.employees) ||
        !Array.isArray(parsed.profiles)
      ) {
        return { status: 400, error: 'Archive JSON invalide ou incomplète.' };
      }
      this.state = structuredClone(parsed);
      const actor = this.state.employees.find((e) => e.id === actorId);
      const now = new Date().toISOString();
      this.appendAudit(
        actorId,
        actor ? `${actor.firstName} ${actor.lastName}` : actorId,
        'Restauration sauvegarde',
        'Restauration complète d’une sauvegarde fictive (TST28)',
        'org',
        'Système CFitness OS'
      );
      return { status: 200, data: { restoredAt: now } };
    } catch {
      return { status: 400, error: 'JSON de sauvegarde illisible.' };
    }
  }

  public getSession(
    actorId: string,
    siteId: string | 'all'
  ): ApiResponse<SessionContext> {
    const session = buildSessionContext(this.state, actorId, siteId);
    if (!session) {
      return { status: 404, error: 'Session ou collaborateur introuvable.' };
    }
    return { status: 200, data: session };
  }

  public assertSectionRouteAccess(
    actorId: string,
    siteId: string | 'all',
    sectionId: McSectionId
  ): ApiResponse<SessionContext> {
    const session = buildSessionContext(this.state, actorId, siteId);
    if (!session) {
      return { status: 404, error: 'Session invalide.' };
    }
    if (!session.visibleSections.includes(sectionId)) {
      return {
        status: 403,
        error: `Accès refusé côté serveur (403) : le profil ${session.activeProfile.name} ne dispose pas des autorisations pour la section ${sectionId}.`,
      };
    }
    return { status: 200, data: session };
  }

  public getDashboardData(
    actorId: string,
    siteId: string | 'all'
  ): ApiResponse<DashboardPayload> {
    const session = buildSessionContext(this.state, actorId, siteId);
    if (!session) {
      return { status: 404, error: 'Utilisateur introuvable.' };
    }

    const allowedSiteIds = new Set(
      session.employee.siteAccesses.map((a) => a.siteId)
    );
    const accessibleSites = this.state.sites.filter((s) =>
      allowedSiteIds.has(s.id)
    );

    const allAuthorizedShifts = filterShiftsForActor(
      this.state,
      actorId,
      session.activeSiteId
    );
    const allAuthorizedRequests = filterLeaveRequestsForActor(
      this.state,
      actorId,
      session.activeSiteId
    );
    const anomalies = filterAnomaliesForActor(
      this.state,
      actorId,
      session.activeSiteId
    );
    const kpis = filterKpisForActor(
      this.state,
      actorId,
      session.activeSiteId
    );

    const visibleEmployees: RedactedEmployeeView[] = [];
    for (const emp of this.state.employees) {
      const redacted = redactEmployeeForActor(
        this.state,
        actorId,
        session.activeSiteId,
        emp
      );
      if (redacted) {
        visibleEmployees.push(redacted);
      }
    }

    const preferences =
      this.state.preferencesByEmployee[actorId] ??
      this.state.preferencesByEmployee['emp-admin'];

    return {
      status: 200,
      data: {
        session,
        organization: this.state.organization,
        org02BillingPolicy: this.state.org02BillingPolicy,
        sites: accessibleSites,
        myShifts: allAuthorizedShifts.filter((s) => s.employeeId === actorId),
        teamShifts: allAuthorizedShifts,
        myRequests: allAuthorizedRequests.filter(
          (r) => r.employeeId === actorId
        ),
        teamRequests: allAuthorizedRequests.filter(
          (r) => r.employeeId !== actorId
        ),
        anomalies,
        kpis,
        visibleEmployees,
        positions: this.state.positions.filter(
          (p) =>
            session.activeSiteId === 'all' || p.siteId === session.activeSiteId
        ),
        teams: this.state.teams.filter(
          (t) =>
            session.activeSiteId === 'all' || t.siteId === session.activeSiteId
        ),
        preferences: structuredClone(preferences),
        auditCount: this.state.auditLog.length,
      },
    };
  }

  public updateShift(
    actorId: string,
    siteId: string | 'all',
    shiftId: string,
    patch: { startTime?: string; endTime?: string; breakMinutes?: number }
  ): ApiResponse<Shift> {
    const shift = this.state.shifts.find((s) => s.id === shiftId);
    if (!shift) {
      return { status: 404, error: 'Shift introuvable.' };
    }
    const targetEmp = shift.employeeId
      ? this.state.employees.find((e) => e.id === shift.employeeId)
      : undefined;
    const targetTeamIds =
      targetEmp?.siteAccesses.find((a) => a.siteId === shift.siteId)
        ?.teamIds ?? [];

    const check = evaluatePermission(this.state, actorId, siteId, 'ORG04-02', {
      siteId: shift.siteId,
      targetEmployeeId: shift.employeeId ?? undefined,
      targetTeamIds,
      lockState: shift.lockState,
    });

    if (!check.allowed) {
      return { status: 403, error: check.reason };
    }

    const before = `${shift.startTime}-${shift.endTime} (pause ${shift.breakMinutes}m)`;
    if (patch.startTime) shift.startTime = patch.startTime;
    if (patch.endTime) shift.endTime = patch.endTime;
    if (typeof patch.breakMinutes === 'number') {
      shift.breakMinutes = Math.max(0, patch.breakMinutes);
    }
    const after = `${shift.startTime}-${shift.endTime} (pause ${shift.breakMinutes}m)`;

    const actor = this.state.employees.find((e) => e.id === actorId);
    this.appendAudit(
      actorId,
      actor ? `${actor.firstName} ${actor.lastName}` : actorId,
      'Modification de shift',
      `Ajustement créneau ${shift.id}`,
      shift.siteId,
      targetEmp ? `${targetEmp.firstName} ${targetEmp.lastName}` : 'Non assigné',
      before,
      after
    );

    return { status: 200, data: structuredClone(shift) };
  }

  public getProfilesForAdmin(
    actorId: string,
    siteId: string | 'all'
  ): ApiResponse<RoleProfile[]> {
    const canRead =
      evaluatePermission(this.state, actorId, siteId, 'ORG04-31').allowed ||
      evaluatePermission(this.state, actorId, siteId, 'ORG04-32').allowed ||
      evaluatePermission(this.state, actorId, siteId, 'ORG04-33').allowed;
    if (!canRead) {
      return {
        status: 403,
        error: 'Lecture de la matrice de droits réservée aux profils habilités.',
      };
    }
    return { status: 200, data: structuredClone(this.state.profiles) };
  }

  public updateRolePermissions(
    actorId: string,
    siteId: string | 'all',
    targetProfileId: ProfileId,
    nextScope: Scope,
    updatedCheckedMap: Record<string, boolean>
  ): ApiResponse<RoleProfile> {
    const validation = validateDelegationUpdate(
      this.state,
      actorId,
      siteId,
      targetProfileId,
      nextScope,
      updatedCheckedMap
    );
    if (!validation.ok) {
      return { status: 403, error: validation.error };
    }

    const profile = this.state.profiles.find((p) => p.id === targetProfileId);
    if (!profile) {
      return { status: 404, error: 'Profil introuvable.' };
    }

    const prevScope = profile.scopeSelected;
    const changedActions: string[] = [];
    profile.scopeSelected = nextScope;

    for (const row of profile.rows) {
      if (row.actionId in updatedCheckedMap) {
        const nextVal = updatedCheckedMap[row.actionId];
        if (Boolean(row.checked) !== nextVal) {
          changedActions.push(`${row.actionId}:${nextVal ? 'ON' : 'OFF'}`);
          row.checked = nextVal;
        }
      }
    }

    const actor = this.state.employees.find((e) => e.id === actorId);
    this.appendAudit(
      actorId,
      actor ? `${actor.firstName} ${actor.lastName}` : actorId,
      'Modification de permissions',
      `Mise à jour profil ${profile.name} (${changedActions.length} droit(s), portée ${nextScope})`,
      'org',
      profile.name,
      `portée=${prevScope}`,
      `portée=${nextScope}; ${changedActions.join(', ') || 'inchangé'}`
    );

    return { status: 200, data: structuredClone(profile) };
  }

  public getAuditEvents(
    actorId: string,
    siteId: string | 'all',
    filters?: {
      query?: string;
      actionType?: string;
      siteFilter?: string;
      startDate?: string;
      endDate?: string;
    }
  ): ApiResponse<AuditEvent[]> {
    const canView =
      evaluatePermission(this.state, actorId, siteId, 'ORG04-31').allowed ||
      evaluatePermission(this.state, actorId, siteId, 'ORG04-32').allowed ||
      evaluatePermission(this.state, actorId, siteId, 'ORG04-38').allowed;

    if (!canView) {
      return {
        status: 403,
        error: 'Consultation du journal d’activité non autorisée pour ce profil.',
      };
    }

    let events = [...this.state.auditLog];
    if (filters?.actionType && filters.actionType !== 'ALL') {
      events = events.filter((e) => e.actionType === filters.actionType);
    }
    if (filters?.siteFilter && filters.siteFilter !== 'all') {
      events = events.filter((e) => e.siteId === filters.siteFilter);
    }
    if (filters?.startDate) {
      events = events.filter((e) => e.timestamp.slice(0, 10) >= filters.startDate!);
    }
    if (filters?.endDate) {
      events = events.filter((e) => e.timestamp.slice(0, 10) <= filters.endDate!);
    }
    if (filters?.query?.trim()) {
      const q = filters.query.trim().toLowerCase();
      events = events.filter(
        (e) =>
          e.actorName.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.targetLabel.toLowerCase().includes(q) ||
          e.actionType.toLowerCase().includes(q)
      );
    }

    return { status: 200, data: events };
  }

  public exportAuditCsv(
    actorId: string,
    siteId: string | 'all'
  ): ApiResponse<string> {
    const res = this.getAuditEvents(actorId, siteId);
    if (res.status !== 200 || !res.data) {
      return { status: res.status, error: res.error };
    }
    const header = 'ID;Horodatage;Auteur;Type;Site;Cible;Résumé;Avant;Après';
    const lines = res.data.map((e) =>
      [
        e.id,
        e.timestamp,
        e.actorName,
        e.actionType,
        e.siteId,
        e.targetLabel,
        e.summary,
        e.beforeSummary ?? '',
        e.afterSummary ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(';')
    );
    return { status: 200, data: [header, ...lines].join('\n') };
  }

  public updateOrganization(
    actorId: string,
    siteId: string | 'all',
    patch: Partial<Organization>
  ): ApiResponse<Organization> {
    const check = evaluatePermission(this.state, actorId, siteId, 'ORG04-32');
    if (!check.allowed) {
      return { status: 403, error: check.reason };
    }
    const prevName = this.state.organization.name;
    this.state.organization = {
      ...this.state.organization,
      ...patch,
      id: this.state.organization.id,
    };
    const actor = this.state.employees.find((e) => e.id === actorId);
    this.appendAudit(
      actorId,
      actor ? `${actor.firstName} ${actor.lastName}` : actorId,
      'Mise à jour organisation',
      `Modification fiche organisation (${this.state.organization.name})`,
      'org',
      'ORG01',
      prevName,
      this.state.organization.name
    );
    return { status: 200, data: structuredClone(this.state.organization) };
  }

  public updateOrg02BillingPolicy(
    actorId: string,
    siteId: string | 'all',
    policy: AppDatabaseState['org02BillingPolicy']
  ): ApiResponse<{ policy: AppDatabaseState['org02BillingPolicy'] }> {
    const check = evaluatePermission(this.state, actorId, siteId, 'ORG04-32');
    if (!check.allowed) {
      return { status: 403, error: check.reason };
    }
    const prev = this.state.org02BillingPolicy;
    this.state.org02BillingPolicy = policy;
    const actor = this.state.employees.find((e) => e.id === actorId);
    this.appendAudit(
      actorId,
      actor ? `${actor.firstName} ${actor.lastName}` : actorId,
      'Décision périmètre ORG02',
      `Statut facturation/abonnement réglé sur ${policy}`,
      'org',
      'ORG02',
      prev,
      policy
    );
    return { status: 200, data: { policy } };
  }

  public getOwnPreferences(actorId: string): ApiResponse<UserPreferences> {
    const actor = this.state.employees.find((e) => e.id === actorId);
    if (!actor) {
      return { status: 404, error: 'Collaborateur introuvable.' };
    }
    const base =
      this.state.preferencesByEmployee[actorId] ??
      structuredClone(this.state.preferencesByEmployee['emp-admin']);
    return {
      status: 200,
      data: structuredClone({
        ...base,
        themeMode: base.themeMode ?? 'dark',
        accentColor: base.accentColor ?? 'violet',
      }),
    };
  }

  public updateOwnPreferences(
    actorId: string,
    patch: Partial<UserPreferences>
  ): ApiResponse<UserPreferences> {
    const actor = this.state.employees.find((e) => e.id === actorId);
    if (!actor) {
      return { status: 404, error: 'Collaborateur introuvable.' };
    }
    if (patch.themeMode !== undefined && patch.themeMode !== 'dark' && patch.themeMode !== 'light') {
      return { status: 400, error: "Mode d'apparence invalide (dark ou light attendu)." };
    }
    if (
      patch.accentColor !== undefined &&
      !['violet', 'blue', 'emerald', 'rose', 'amber', 'cyan'].includes(patch.accentColor)
    ) {
      return { status: 400, error: "Couleur d'accentuation invalide." };
    }
    const current =
      this.state.preferencesByEmployee[actorId] ??
      structuredClone(this.state.preferencesByEmployee['emp-admin']);

    const updated: UserPreferences = {
      ...current,
      ...patch,
      notifications: {
        ...current.notifications,
        ...(patch.notifications ?? {}),
      },
      themeMode: patch.themeMode ?? current.themeMode ?? 'dark',
      accentColor: patch.accentColor ?? current.accentColor ?? 'violet',
    };
    this.state.preferencesByEmployee[actorId] = updated;
    this.appendAudit(
      actorId,
      `${actor.firstName} ${actor.lastName}`,
      'Préférences personnelles',
      `Mise à jour thème=${updated.themeMode}, accent=${updated.accentColor}, langue=${updated.language}, canal e-mail=${updated.notifications.emailEnabled}, fréquence=${updated.notifications.frequency}`,
      'org',
      'MC13'
    );
    return { status: 200, data: structuredClone(updated) };
  }

  public revokeCalendarToken(actorId: string): ApiResponse<UserPreferences> {
    const actor = this.state.employees.find((e) => e.id === actorId);
    if (!actor) {
      return { status: 404, error: 'Collaborateur introuvable.' };
    }
    const current =
      this.state.preferencesByEmployee[actorId] ??
      structuredClone(this.state.preferencesByEmployee['emp-admin']);
    const prevToken = current.calendarFeedToken;
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    current.calendarFeedToken = `cal-revoked-new-${randomSuffix}`;
    this.state.preferencesByEmployee[actorId] = current;

    this.appendAudit(
      actorId,
      `${actor.firstName} ${actor.lastName}`,
      'Révocation flux calendrier',
      'Renouvellement et révocation de l’URL personnelle .ics (EX32)',
      'org',
      'UTI04',
      prevToken,
      current.calendarFeedToken
    );
    return { status: 200, data: structuredClone(current) };
  }

  public changeOwnPassword(
    actorId: string,
    currentSecret: string,
    newSecret: string
  ): ApiResponse<{ changed: boolean }> {
    const actor = this.state.employees.find((e) => e.id === actorId);
    if (!actor) {
      return { status: 404, error: 'Collaborateur introuvable.' };
    }
    if (!currentSecret || newSecret.length < 12) {
      return {
        status: 400,
        error:
          'Le nouveau mot de passe doit comporter au moins 12 caractères et confirmer le secret actuel.',
      };
    }
    this.appendAudit(
      actorId,
      `${actor.firstName} ${actor.lastName}`,
      'Sécurité compte',
      'Changement de mot de passe utilisateur validé (UTI05 / OS185)',
      'org',
      'UTI05'
    );
    return { status: 200, data: { changed: true } };
  }

  public getAmbiguities(): AppDatabaseState['ambiguities'] {
    return structuredClone(this.state.ambiguities);
  }

  private appendAudit(
    actorId: string,
    actorName: string,
    actionType: string,
    summary: string,
    siteId: string | 'org',
    targetLabel: string,
    beforeSummary?: string,
    afterSummary?: string
  ) {
    const evt: AuditEvent = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorId,
      actorName,
      actionType,
      summary,
      siteId,
      targetLabel,
      beforeSummary,
      afterSummary,
    };
    this.state.auditLog.unshift(evt);
  }
}
