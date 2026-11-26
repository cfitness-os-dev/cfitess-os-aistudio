import type { ClubId } from '../types/cfos';

export interface RebalanceStaleResult {
  ok: boolean;
  clubsProcessed: string[];
  reassignedCount: number;
  reassignedIds: string[];
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
      clubId: options?.clubId || undefined,
      thresholdDays: options?.thresholdDays ?? 3,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur de rééquilibrage (${response.status})`);
  }

  return data as RebalanceStaleResult;
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
      targetClubId: targetClubId.trim(),
      reason: reason?.trim() || 'Transfert inter-clubs',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur de transfert (${response.status})`);
  }

  return data as TransferProspectResult;
}

export async function fetchLeadConversionStats(
  clubId?: string
): Promise<LeadConversionStatsResponse> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...getAuthHeader(),
  };

  const url = clubId && clubId !== 'all'
    ? `/api/lead/stats/conversion?clubId=${encodeURIComponent(clubId)}`
    : '/api/lead/stats/conversion';

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Erreur récupération stats (${response.status})`);
  }

  return data as LeadConversionStatsResponse;
}
