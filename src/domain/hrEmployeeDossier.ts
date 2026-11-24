import type { ClubFilter, ClubId } from '../types/cfos';

export interface EmployeeCounter {
  cpNAcquired: number;
  cpNTaken: number;
  cpNMinus1Remaining: number;
  rttDaysRemaining: number | null;
  annualizationBalanceHours: number | null;
}

export interface CounterAdjustmentRecord {
  id: string;
  employeeId: string;
  siteId: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  reason: string;
  before: EmployeeCounter;
  after: EmployeeCounter;
}

export interface DossierContractView {
  id: string;
  siteId: string;
  contractType: string;
  regime: string;
  weeklyHours: number | null;
  annualDays: number | null;
  monthlyGrossEur?: number | null;
  hourlyRateEur?: number | null;
  loadedCostFactor?: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface DossierSiteAccessView {
  siteId: string;
  siteName: string;
  isPrimary: boolean;
  profileId: string;
  profileName: string;
  showOnPlanning: boolean;
  teamIds: string[];
  teamNames: string[];
  managedTeamIds: string[];
  managedTeamNames: string[];
  positionIds: string[];
}

export interface DossierSensitiveBankInfo {
  paymentMode: string;
  ibanMasked: string;
  bic: string;
  nirMasked: string;
}

export interface DossierPermissionsView {
  isSelf: boolean;
  canViewSensitive: boolean;
  canViewCounters: boolean;
  canEditIdentity: boolean;
  canToggleActive: boolean;
  canEditContract: boolean;
  canEditSalary: boolean;
  canEditCounters: boolean;
  canEditSiteAccess: boolean;
}

export interface EmployeeDossierView {
  id: string;
  firstName: string;
  lastName: string;
  birthName: string | null;
  matricule: string;
  active: boolean;
  hrFileStatus: string;
  dossierRevision: string;
  counterRevision?: string;
  email?: string;
  phone?: string;
  sensitiveBank?: DossierSensitiveBankInfo;
  contract: DossierContractView;
  siteAccesses: DossierSiteAccessView[];
  counter?: EmployeeCounter;
  counterHistory?: CounterAdjustmentRecord[];
  permissions: DossierPermissionsView;
}

export interface DossierSiteRef {
  id: string;
  name: string;
}

export interface DossierTeamRef {
  id: string;
  siteId: string;
  name: string;
}

export interface DossierProfileRef {
  id: string;
  name: string;
  scopeSelected: string;
}

export interface HrDossiersWorkspace {
  actorId: string;
  clubId: ClubId;
  siteId: string;
  demoMode: boolean;
  sites: DossierSiteRef[];
  teams: DossierTeamRef[];
  profiles: DossierProfileRef[];
  employees: EmployeeDossierView[];
}

export interface PersonalDossierResponse {
  actorId: string;
  clubId: ClubId;
  siteId: string;
  demoMode: boolean;
  sites: DossierSiteRef[];
  teams: DossierTeamRef[];
  dossier: EmployeeDossierView;
}

export interface DossierPatchInput {
  siteId: string;
  expectedRevision: string;
  firstName?: string;
  lastName?: string;
  birthName?: string;
  email?: string;
  phone?: string;
  matricule?: string;
  active?: boolean;
  hrFileStatus?: string;
  contractType?: string;
  regime?: string;
  weeklyHours?: number;
  annualDays?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  monthlyGrossEur?: number;
  hourlyRateEur?: number;
  reason?: string;
}

export interface CounterUpdateInput {
  siteId: string;
  expectedRevision: string;
  reason: string;
  cpNAcquired?: number;
  cpNTaken?: number;
  cpNMinus1Remaining?: number;
  rttDaysRemaining?: number;
  clearRtt?: boolean;
  annualizationBalanceHours?: number;
  clearAnnualization?: boolean;
}

export interface SiteAccessUpdateInput {
  siteId: string;
  isPrimary: boolean;
  profileId: string;
  teamIds: string[];
  managedTeamIds: string[];
  showOnPlanning: boolean;
  positionIds: string[];
}

export function clubIdToSiteId(clubId: ClubId): 'club-carre-soie' | 'club-beynost' {
  return clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie';
}

export function siteIdToClubId(siteId: string): ClubId {
  return siteId === 'club-beynost' || siteId === 'beynost' ? 'beynost' : 'carre-de-soie';
}

/**
 * Synchronizes the local RH club selector with the global sidebar clubFilter while
 * guaranteeing the returned siteId belongs to the authenticated user's authorized clubs.
 */
export function resolveEffectiveClubSiteId(
  clubFilter: ClubFilter,
  authorizedClubIds: readonly ClubId[],
  fallbackClubId: ClubId,
): 'club-carre-soie' | 'club-beynost' {
  if (clubFilter !== 'all' && authorizedClubIds.includes(clubFilter)) {
    return clubIdToSiteId(clubFilter);
  }
  if (authorizedClubIds.includes(fallbackClubId)) {
    return clubIdToSiteId(fallbackClubId);
  }
  return clubIdToSiteId(authorizedClubIds[0] ?? fallbackClubId);
}

export function validateHrDossiersResponse(
  raw: unknown,
  expectedActorId: string,
  expectedClubId: ClubId,
): HrDossiersWorkspace {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Réponse serveur invalide pour les dossiers RH.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.actorId !== expectedActorId || obj.clubId !== expectedClubId) {
    throw new Error('Réponse reçue pour un autre compte ou un autre établissement.');
  }
  if (!Array.isArray(obj.employees) || !Array.isArray(obj.sites) || !Array.isArray(obj.teams)) {
    throw new Error('Les données des dossiers collaborateurs sont incomplètes.');
  }
  return raw as HrDossiersWorkspace;
}

export function validatePersonalDossierResponse(
  raw: unknown,
  expectedActorId: string,
  expectedClubId: ClubId,
): PersonalDossierResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Réponse serveur invalide pour votre dossier.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.actorId !== expectedActorId || obj.clubId !== expectedClubId) {
    throw new Error('Réponse reçue pour un autre compte ou un autre établissement.');
  }
  const dossier = obj.dossier as Record<string, unknown> | undefined;
  if (!dossier || typeof dossier !== 'object' || dossier.id !== expectedActorId) {
    throw new Error('Dossier personnel absent ou incohérent.');
  }
  return raw as PersonalDossierResponse;
}

export function formatOptionalNumber(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Non renseigné';
  }
  const formatted = value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${unit}`;
}

export function formatEurOptional(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'Non renseigné';
  }
  return `${value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} €`;
}

export function formatParisDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Date à vérifier';
  return parsed.toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function regimeLabel(regime: string): string {
  if (regime === 'forfait_jours') return 'Forfait jours';
  if (regime === 'hours') return 'Horaire hebdomadaire';
  return regime || 'Non renseigné';
}

export function hrFileStatusLabel(status: string): string {
  switch (status) {
    case 'complete':
      return 'Complet';
    case 'incomplete':
      return 'Incomplet';
    case 'pending':
      return 'En attente de validation';
    default:
      return status || 'Non renseigné';
  }
}

export function validateCounterForm(input: {
  reason: string;
  cpNAcquired: string;
  cpNTaken: string;
  cpNMinus1Remaining: string;
  rttDaysRemaining: string;
  annualizationBalanceHours: string;
}): string | null {
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) {
    return 'Indiquez un motif de correction entre 1 et 1000 caractères.';
  }
  for (const [label, raw] of [
    ['CP N acquis', input.cpNAcquired],
    ['CP N pris', input.cpNTaken],
    ['Reliquat CP N-1', input.cpNMinus1Remaining],
  ] as const) {
    const val = Number(raw);
    if (!raw.trim() || !Number.isFinite(val) || val < 0 || val > 100) {
      return `${label} doit être un nombre compris entre 0 et 100.`;
    }
  }
  if (input.rttDaysRemaining.trim()) {
    const rtt = Number(input.rttDaysRemaining);
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 50) {
      return 'Le solde RTT doit être compris entre 0 et 50 jours (ou laissé vide).';
    }
  }
  if (input.annualizationBalanceHours.trim()) {
    const ann = Number(input.annualizationBalanceHours);
    if (!Number.isFinite(ann) || ann < -500 || ann > 500) {
      return 'Le solde d’annualisation doit être compris entre -500 et +500 heures (ou laissé vide).';
    }
  }
  return null;
}

export function validateContractForm(input: {
  regime: string;
  weeklyHours: string;
  annualDays: string;
  effectiveFrom: string;
  effectiveTo: string;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom.trim())) {
    return 'Indiquez une date de début valide (AAAA-MM-JJ).';
  }
  if (input.effectiveTo.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveTo.trim())) {
      return 'La date de fin doit respecter le format AAAA-MM-JJ.';
    }
    if (input.effectiveTo.trim() < input.effectiveFrom.trim()) {
      return 'La date de fin ne peut pas être antérieure à la date de début.';
    }
  }
  if (input.regime === 'forfait_jours') {
    const days = Number(input.annualDays);
    if (!Number.isInteger(days) || days < 1 || days > 235) {
      return 'Le forfait jours doit être un entier compris entre 1 et 235 jours.';
    }
  } else {
    const hours = Number(input.weeklyHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 48) {
      return 'La durée hebdomadaire doit être un entier compris entre 1 et 48 heures.';
    }
  }
  return null;
}

function requireSessionToken(expectedActorId: string): string {
  const token = window.sessionStorage.getItem('cfos_bearer_token');
  const actor = window.sessionStorage.getItem('cfos_bearer_actor_id');
  if (!token || actor !== expectedActorId) {
    throw new Error('Reconnectez-vous pour accéder aux dossiers RH.');
  }
  return token;
}

async function readApiJson<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Erreur serveur (${response.status}).`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchHrDossiers(
  actorId: string,
  clubId: ClubId,
  signal?: AbortSignal,
): Promise<HrDossiersWorkspace> {
  const token = requireSessionToken(actorId);
  const res = await fetch(`/api/hr/dossiers/${clubId}`, {
    method: 'GET',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
    },
  });
  const payload = await readApiJson<unknown>(res);
  return validateHrDossiersResponse(payload, actorId, clubId);
}

export async function fetchMyDossier(
  actorId: string,
  clubId: ClubId,
  signal?: AbortSignal,
): Promise<PersonalDossierResponse> {
  const token = requireSessionToken(actorId);
  const res = await fetch(`/api/me/dossier/${clubId}`, {
    method: 'GET',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
    },
  });
  const payload = await readApiJson<unknown>(res);
  return validatePersonalDossierResponse(payload, actorId, clubId);
}

export async function patchEmployeeDossier(
  actorId: string,
  clubId: ClubId,
  employeeId: string,
  patch: DossierPatchInput,
): Promise<EmployeeDossierView> {
  const token = requireSessionToken(actorId);
  const res = await fetch(`/api/admin/employees/${encodeURIComponent(employeeId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  const payload = await readApiJson<{ dossier?: EmployeeDossierView }>(res);
  if (!payload.dossier || payload.dossier.id !== employeeId) {
    throw new Error('Réponse de sauvegarde dossier incomplète.');
  }
  return payload.dossier;
}

export async function updateEmployeeCounters(
  actorId: string,
  clubId: ClubId,
  employeeId: string,
  patch: CounterUpdateInput,
): Promise<EmployeeDossierView> {
  const token = requireSessionToken(actorId);
  const res = await fetch(
    `/api/admin/employees/${encodeURIComponent(employeeId)}/counters`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-cfitness-site-id': clubIdToSiteId(clubId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    },
  );
  const payload = await readApiJson<{ dossier?: EmployeeDossierView }>(res);
  if (!payload.dossier || payload.dossier.id !== employeeId) {
    throw new Error('Réponse de mise à jour des compteurs incomplète.');
  }
  return payload.dossier;
}

export async function updateEmployeeSiteAccesses(
  actorId: string,
  clubId: ClubId,
  employeeId: string,
  siteAccesses: SiteAccessUpdateInput[],
): Promise<void> {
  const token = requireSessionToken(actorId);
  const res = await fetch(
    `/api/admin/employees/${encodeURIComponent(employeeId)}/site-accesses`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-cfitness-site-id': clubIdToSiteId(clubId),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ siteAccesses }),
    },
  );
  await readApiJson<unknown>(res);
}
