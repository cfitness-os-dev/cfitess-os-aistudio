import type { ClubId, Employee } from '../types/cfos';

export interface RebalancedProspectItem {
  id: string;
  clubId: string;
  assignedToId: string;
}

export interface RebalanceStaleResult {
  ok: boolean;
  clubsProcessed: string[];
  reassignedCount: number;
  reassignedIds: string[];
  reassigned?: RebalancedProspectItem[];
  thresholdDaysApplied: number;
}

export interface TransferProspectResult {
  ok: boolean;
  prospectId: string;
  sourceClubId: string;
  targetClubId: string;
  assignedTo: string;
  reason: string;
}

export interface CommercialConversionStats {
  employeeId: string;
  activeLeads: number;
  convertedLeads: number;
  staleLeads: number;
}

export interface ConversionStatsData {
  totalProspects: number;
  activeLeads: number;
  convertedLeads: number;
  lostLeads: number;
  archivedLeads: number;
  staleLeads: number;
  unassignedLeads: number;
  conversionRatePercent: number;
  commercialBreakdown: CommercialConversionStats[];
}

export interface LeadConversionStatsResponse {
  ok: boolean;
  clubsInScope: string[];
  stats: ConversionStatsData;
}

function getAuthHeader(): Record<string, string> {
  const storage = typeof window !== 'undefined' ? window.sessionStorage : (globalThis as { sessionStorage?: Storage }).sessionStorage;
  const token = storage?.getItem('cfos_bearer_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function rebalanceStaleProspects(options?: {
  clubId?: string;
  thresholdDays?: number;
}): Promise<RebalanceStaleResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
  };

  const response = await fetch('/api/lead/automations/rebalance-stale', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      clubId: options?.clubId && options.clubId !== 'all' ? club(options.clubId) ?? options.clubId : undefined,
      thresholdDays: options?.thresholdDays ?? 3,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur de rééquilibrage (${response.status})`);
  }

  return validateRebalanceResult(data, options?.clubId, options?.thresholdDays ?? 3);
}

export async function transferProspect(
  prospectId: string,
  targetClubId: ClubId | string,
  reason?: string
): Promise<TransferProspectResult> {
  if (!prospectId?.trim()) {
    throw new Error('Identifiant prospect manquant.');
  }
  if (!targetClubId?.trim()) {
    throw new Error('Club cible manquant.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
  };

  const response = await fetch(`/api/lead/prospects/${encodeURIComponent(prospectId)}/transfer`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      targetClubId: club(targetClubId.trim()) ?? targetClubId.trim(),
      reason: reason?.trim() || 'Transfert inter-clubs',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur de transfert (${response.status})`);
  }

  return validateTransferResult(data, prospectId, targetClubId);
}

export async function fetchLeadConversionStats(
  clubId?: string
): Promise<LeadConversionStatsResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...getAuthHeader(),
  };

  const url = clubId && clubId !== 'all'
    ? `/api/lead/stats/conversion?clubId=${encodeURIComponent(club(clubId) ?? clubId)}`
    : '/api/lead/stats/conversion';

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur récupération stats (${response.status})`);
  }

  return validateConversionStats(data, clubId);
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const nonempty = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
function club(v: unknown): string | null {
  if(v === 'beynost' || v === 'club-beynost') return 'beynost';
  if(v === 'carre-de-soie' || v === 'club-carre-soie') return 'carre-de-soie';
  return null;
}
function scope(v: unknown, selected?: string): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every(c => !!club(c)) &&
    new Set(v.map(club)).size === v.length &&
    (!selected || selected === 'all' || (v.length === 1 && club(v[0]) === club(selected) && !!club(selected)));
}
export function validateConversionStats(value: unknown, selected?: string): LeadConversionStatsResponse {
  if(!record(value) || value.ok !== true || !scope(value.clubsInScope,selected) || !record(value.stats))
    throw new Error('Les indicateurs reçus sont incomplets ou correspondent à un autre club.');
  const s=value.stats;
  if(!['totalProspects','activeLeads','convertedLeads','lostLeads','archivedLeads','staleLeads','unassignedLeads'].every(k=>count(s[k])) ||
    typeof s.conversionRatePercent !== 'number' || !Number.isFinite(s.conversionRatePercent) || s.conversionRatePercent < 0 || s.conversionRatePercent > 100 ||
    Number(s.activeLeads)+Number(s.convertedLeads)+Number(s.lostLeads)+Number(s.archivedLeads) !== s.totalProspects ||
    Number(s.staleLeads)>Number(s.activeLeads) || Number(s.unassignedLeads)>Number(s.activeLeads) ||
    !Array.isArray(s.commercialBreakdown) || !s.commercialBreakdown.every(c=>record(c) && nonempty(c.employeeId) && count(c.activeLeads) && count(c.convertedLeads) && count(c.staleLeads)) ||
    new Set(s.commercialBreakdown.map(c=>c.employeeId)).size !== s.commercialBreakdown.length)
    throw new Error('Les indicateurs reçus sont incomplets. Actualisez avant de continuer.');
  return value as unknown as LeadConversionStatsResponse;
}
export function validateTransferResult(value: unknown, id: string, target: string): TransferProspectResult {
  if(!record(value) || value.ok !== true || value.prospectId !== id || !club(target) ||
    club(value.targetClubId) !== club(target) || !club(value.sourceClubId) || club(value.sourceClubId) === club(target) ||
    !nonempty(value.assignedTo) || typeof value.reason !== 'string')
    throw new Error('Le transfert n’a pas été confirmé pour ce prospect et ce club. Actualisez avant de réessayer.');
  return value as unknown as TransferProspectResult;
}
export function validateRebalanceResult(value: unknown, selected: string | undefined, threshold: number): RebalanceStaleResult {
  if(!record(value)) throw new Error('Répartition non confirmée.');
  const ids=value.reassignedIds; const clubs=value.clubsProcessed;
  if(value.ok !== true || !scope(clubs,selected) ||
    value.thresholdDaysApplied !== threshold || !count(value.reassignedCount) ||
    !Array.isArray(ids) || !ids.every(nonempty) ||
    ids.length !== value.reassignedCount || new Set(ids).size !== ids.length ||
    !Array.isArray(value.reassigned) || value.reassigned.length !== value.reassignedCount ||
    !value.reassigned.every(r=>record(r) && nonempty(r.id) && ids.includes(r.id) && nonempty(r.assignedToId) && clubs.some(c=>club(c)===club(r.clubId))) ||
    new Set(value.reassigned.map(r=>r.id)).size !== value.reassignedCount)
    throw new Error('La répartition n’a pas été confirmée complètement. Actualisez les prospects avant de réessayer.');
  return value as unknown as RebalanceStaleResult;
}

/** UI affordance only; the server independently authorizes every action. Explicit profiles take precedence. */
export function leadManagementClubs(employee: Pick<Employee,'role'|'clubId'|'siteAssignments'>): ClubId[] {
  const assignments=employee.siteAssignments ?? [];
  if(assignments.some(a=>a.profileId==='admin_systeme') ||
      (employee.role==='admin' && !assignments.some(a=>a.profileId))) return ['carre-de-soie','beynost'];
  if(!assignments.length)return employee.role==='manager' ? [employee.clubId] : [];
  return [...new Set(assignments.filter(a=>a.profileId ?
    ['master_avance','planificateur_avance'].includes(a.profileId) : ['admin','manager'].includes(a.roleInClub)).map(a=>a.clubId))];
}
