import type { DashboardPayload } from './apiEngine';
import type {
  CandidateActionRef,
  EntityMetaRef,
  ExtComplementRef,
  McSectionRef,
  SourceScreenRef,
} from './referenceRegistry';
import type {
  AmbiguityRecord,
  AppDatabaseState,
  AuditEvent,
  EmployeeSiteAccess,
  McSectionId,
  Organization,
  ProfileId,
  RoleProfile,
  Scope,
  SessionContext,
  Shift,
  UserPreferences,
} from './types';

export interface RegistryPayload {
  total_screens: number;
  total_historical_entries: number;
  total_complements: number;
  total_candidate_actions: number;
  sections: McSectionRef[];
  screens: SourceScreenRef[];
  complements: ExtComplementRef[];
  actions: CandidateActionRef[];
  entities: EntityMetaRef[];
}

export interface HealthPayload {
  status: string;
  service: string;
  version: string;
  backend: string;
}

export class ApiClientError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

export interface ApiAuthContext {
  actorId: string;
  siteId: string | 'all';
  token?: string | null;
}

function resolveBearerToken(auth: ApiAuthContext): string | null {
  if (auth.token && auth.token.trim().length > 0) {
    return auth.token.trim();
  }
  if (typeof window === 'undefined') return null;
  try {
    const storedToken = window.sessionStorage.getItem('cfos_bearer_token');
    const storedActor = window.sessionStorage.getItem('cfos_bearer_actor_id');
    if (storedToken && storedActor === auth.actorId) {
      return storedToken;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

async function requestJson<T>(
  path: string,
  auth: ApiAuthContext,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-cfitness-actor-id', auth.actorId);
  headers.set('x-cfitness-site-id', auth.siteId);
  const bearer = resolveBearerToken(auth);
  if (bearer && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errMsg = `Erreur serveur HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) errMsg = payload.error;
    } catch {
      // Garde le message HTTP générique si réponse non JSON
    }
    throw new ApiClientError(response.status, errMsg);
  }

  return (await response.json()) as T;
}

export const clientApi = {
  getHealth(): Promise<HealthPayload> {
    return requestJson<HealthPayload>('/api/health', {
      actorId: 'emp-employe-multi',
      siteId: 'club-carre-soie',
    });
  },

  getRegistry(auth: ApiAuthContext): Promise<RegistryPayload> {
    return requestJson<RegistryPayload>('/api/registry', auth);
  },

  getAmbiguities(auth: ApiAuthContext): Promise<AmbiguityRecord[]> {
    return requestJson<AmbiguityRecord[]>('/api/ambiguities', auth);
  },

  getDashboard(auth: ApiAuthContext): Promise<DashboardPayload> {
    return requestJson<DashboardPayload>('/api/dashboard', auth);
  },

  assertSectionAccess(
    auth: ApiAuthContext,
    sectionId: McSectionId
  ): Promise<SessionContext> {
    return requestJson<SessionContext>(
      `/api/section-access/${encodeURIComponent(sectionId)}`,
      auth
    );
  },

  updateShift(
    auth: ApiAuthContext,
    shiftId: string,
    patch: { startTime?: string; endTime?: string; breakMinutes?: number }
  ): Promise<Shift> {
    return requestJson<Shift>(
      `/api/shifts/${encodeURIComponent(shiftId)}`,
      auth,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
  },

  getAdminProfiles(auth: ApiAuthContext): Promise<RoleProfile[]> {
    return requestJson<RoleProfile[]>('/api/admin/profiles', auth);
  },

  updateRoleProfile(
    auth: ApiAuthContext,
    profileId: ProfileId,
    scopeSelected: Scope,
    checkedMap: Record<string, boolean>
  ): Promise<RoleProfile> {
    return requestJson<RoleProfile>(
      `/api/admin/profiles/${encodeURIComponent(profileId)}`,
      auth,
      {
        method: 'PUT',
        body: JSON.stringify({ scopeSelected, checkedMap }),
      }
    );
  },

  getAuditLog(
    auth: ApiAuthContext,
    filters?: {
      query?: string;
      actionType?: string;
      siteFilter?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<AuditEvent[]> {
    const params = new URLSearchParams();
    if (filters?.query) params.set('query', filters.query);
    if (filters?.actionType && filters.actionType !== 'ALL') {
      params.set('actionType', filters.actionType);
    }
    if (filters?.siteFilter && filters.siteFilter !== 'all') {
      params.set('siteFilter', filters.siteFilter);
    }
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    const qs = params.toString();
    return requestJson<AuditEvent[]>(
      `/api/admin/audit-log${qs ? `?${qs}` : ''}`,
      auth
    );
  },

  async downloadAuditCsv(auth: ApiAuthContext): Promise<string> {
    const response = await fetch('/api/admin/audit-log/csv', {
      headers: {
        'x-cfitness-actor-id': auth.actorId,
        'x-cfitness-site-id': auth.siteId,
      },
    });
    if (!response.ok) {
      let errMsg = `Erreur serveur HTTP ${response.status}`;
      try {
        const p = (await response.json()) as { error?: string };
        if (p?.error) errMsg = p.error;
      } catch {
        // Ignorer
      }
      throw new ApiClientError(response.status, errMsg);
    }
    return response.text();
  },

  updateOrganization(
    auth: ApiAuthContext,
    patch: Partial<Organization>
  ): Promise<Organization> {
    return requestJson<Organization>('/api/admin/organization', auth, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  updateOrg02Policy(
    auth: ApiAuthContext,
    policy: AppDatabaseState['org02BillingPolicy']
  ): Promise<{ policy: AppDatabaseState['org02BillingPolicy'] }> {
    return requestJson<{ policy: AppDatabaseState['org02BillingPolicy'] }>(
      '/api/admin/org02-policy',
      auth,
      {
        method: 'PUT',
        body: JSON.stringify({ policy }),
      }
    );
  },

  exportBackup(auth: ApiAuthContext): Promise<{ backupJson: string }> {
    return requestJson<{ backupJson: string }>('/api/admin/backup', auth);
  },

  restoreBackup(
    auth: ApiAuthContext,
    backupJson: string
  ): Promise<{ restoredAt: string }> {
    return requestJson<{ restoredAt: string }>('/api/admin/restore', auth, {
      method: 'POST',
      body: JSON.stringify({ backupJson }),
    });
  },

  updateOwnPreferences(
    auth: ApiAuthContext,
    patch: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    return requestJson<UserPreferences>('/api/me/preferences', auth, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  createEmployee(
    auth: ApiAuthContext,
    payload: {
      firstName: string;
      lastName: string;
      siteId: string;
      contractType?: string;
      weeklyHours?: number;
      profileId?: ProfileId;
      teamIds?: string[];
      managedTeamIds?: string[];
    }
  ): Promise<{ ok: boolean; employee: { id: string; firstName: string; lastName: string } }> {
    return requestJson('/api/admin/employees', auth, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateEmployeeSiteAccesses(
    auth: ApiAuthContext,
    employeeId: string,
    siteAccesses: Array<{
      siteId: string;
      isPrimary: boolean;
      profileId: ProfileId;
      teamIds: string[];
      managedTeamIds?: string[];
      showOnPlanning: boolean;
      positionIds: string[];
    }>
  ): Promise<{ ok: boolean; employeeId: string; siteAccesses?: EmployeeSiteAccess[] }> {
    return requestJson<{ ok: boolean; employeeId: string; siteAccesses?: EmployeeSiteAccess[] }>(
      `/api/admin/employees/${encodeURIComponent(employeeId)}/site-accesses`,
      auth,
      {
        method: 'PUT',
        body: JSON.stringify({ siteAccesses }),
      }
    );
  },

  loginLocal(
    emailOrId: string,
    pinOrPassword: string
  ): Promise<{
    authenticated: boolean;
    authMode: string;
    role: string;
    sessionToken: string;
    issuedAt: string;
  }> {
    return requestJson(
      '/api/auth/login',
      { actorId: emailOrId, siteId: 'club-carre-soie' },
      {
        method: 'POST',
        body: JSON.stringify({ emailOrId, pinOrPassword }),
      }
    );
  },

  logoutSession(token: string): Promise<{ ok: boolean }> {
    return requestJson(
      '/api/auth/logout',
      { actorId: 'emp-employe-multi', siteId: 'club-carre-soie', token },
      { method: 'POST' }
    );
  },

  getLeadWorkspace(auth: ApiAuthContext): Promise<{
    allowedClubs: string[];
    forms: Array<{
      id: string;
      name: string;
      clubId: 'carre-de-soie' | 'beynost';
      published: boolean;
      sectionTitles?: string[];
      fields?: Array<{ id: string; label: string; type: 'text' | 'email' | 'tel' | 'select' | 'checkbox'; required: boolean; options?: string[] }>;
      responsesCount: number;
      sampleResponses?: Array<{
        id: string;
        fullName: string;
        email: string;
        phone: string;
        rgpdConsent: boolean;
        answers?: Record<string, string | boolean>;
        submittedAt: string;
        linkedProspectId?: string;
      }>;
    }>;
    prospects: Array<{
      id: string;
      gender: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      street: string;
      postalCode: string;
      city: string;
      birthDate: string;
      comment: string;
      clubId: 'carre-de-soie' | 'beynost';
      source: string;
      stage: string;
      leadStatus: string;
      rgpdConsent: boolean;
      segments: string[];
      trialDate?: string;
      createdAt: string;
    }>;
    appointments: Array<{
      id: string;
      clubId: 'carre-de-soie' | 'beynost';
      coachId: string;
      typeName: string;
      prospectId?: string;
      prospectName?: string;
      prospectEmail?: string;
      activityId?: string;
      date: string;
      startTime: string;
      durationMinutes: number;
      capacityMax: number;
      currentBookedCount: number;
      paymentStatus: string;
      status: string;
    }>;
    activities: Array<{
      id: string;
      type: string;
      title: string;
      prospectId?: string;
      prospectName: string;
      clubId: 'carre-de-soie' | 'beynost';
      dueAt: string;
      status: 'todo' | 'done';
      assignedToId: string;
      statusLabel: string;
    }>;
  }> {
    return requestJson('/api/lead/workspace', auth);
  },

  putLeadForm(
    auth: ApiAuthContext,
    formId: string,
    payload: { published?: boolean; name?: string }
  ): Promise<{ ok: boolean }> {
    return requestJson(`/api/lead/forms/${encodeURIComponent(formId)}`, auth, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  patchLeadAppointment(
    auth: ApiAuthContext,
    slotId: string,
    startTime: string
  ): Promise<{ ok: boolean }> {
    return requestJson(`/api/lead/appointments/${encodeURIComponent(slotId)}`, auth, {
      method: 'PATCH',
      body: JSON.stringify({ startTime }),
    });
  },

  deleteLeadAppointment(auth: ApiAuthContext, slotId: string): Promise<{ ok: boolean }> {
    return requestJson(`/api/lead/appointments/${encodeURIComponent(slotId)}`, auth, {
      method: 'DELETE',
    });
  },

  revokeCalendarToken(auth: ApiAuthContext): Promise<UserPreferences> {
    return requestJson<UserPreferences>('/api/me/calendar-token/revoke', auth, {
      method: 'POST',
    });
  },

  changeOwnPassword(
    auth: ApiAuthContext,
    currentSecret: string,
    newSecret: string
  ): Promise<{ changed: boolean }> {
    return requestJson<{ changed: boolean }>('/api/me/password', auth, {
      method: 'POST',
      body: JSON.stringify({ currentSecret, newSecret }),
    });
  },
};
