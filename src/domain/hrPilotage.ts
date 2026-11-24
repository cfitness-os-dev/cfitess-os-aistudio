import type { ClubId } from '../types/cfos';

export interface SiteKpisSnapshot {
  periodLabel: string;
  workedHours: number | null;
  retentionRatePct: number | null;
  revenueEur: number | null;
  payrollMassEur: number | null;
  productivityPerHour: number | null;
  monthlyTargetEur: number | null;
}

export interface PilotageOperationalSummary {
  activeEmployeesCount: number;
  publishedShiftsCount: number;
  pendingLeaveRequestsCount: number;
  openAnomaliesCount: number;
  activeMissionsCount: number;
  completedMissionsCount: number;
  totalMissionBudgetHours: number;
  totalMissionLoggedHours: number;
}

export interface ClubMissionDto {
  id: string;
  siteId: string;
  title: string;
  budgetHours: number;
  loggedHours: number;
  hourlyBudgetEur: number | null;
  estimatedBudgetEur: number | null;
  loggedCostEur: number | null;
  status: 'active' | 'done';
}

export interface HrPilotageSnapshot {
  demoMode: boolean;
  actorId: string;
  clubId: ClubId;
  siteId: string;
  revision: string;
  site: {
    id: string;
    name: string;
    siret: string;
    missionsModuleActive: boolean;
  };
  kpis: SiteKpisSnapshot;
  operationalSummary: PilotageOperationalSummary;
  missions: ClubMissionDto[];
  capabilities: {
    canViewFinances: boolean;
    canEditOperationalKpis: boolean;
    canEditFinancialKpis: boolean;
    canManageMissions: boolean;
  };
}

export type HrPilotageCommand =
  | {
      action: 'save_site_kpis';
      periodLabel: string;
      workedHours: number | null;
      retentionRatePct: number | null;
      revenueEur: number | null;
      payrollMassEur: number | null;
      productivityPerHour: number | null;
      monthlyTargetEur: number | null;
    }
  | {
      action: 'create_mission';
      title: string;
      budgetHours: number;
      loggedHours?: number;
      hourlyBudgetEur?: number;
    }
  | {
      action: 'update_mission';
      id: string;
      title?: string;
      budgetHours?: number;
      loggedHours?: number;
      addHours?: number;
      hourlyBudgetEur?: number;
      status?: 'active' | 'done';
    }
  | {
      action: 'delete_mission';
      id: string;
    };

export function clubIdToSiteId(clubId: ClubId): 'club-carre-soie' | 'club-beynost' {
  return clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie';
}

export function formatOptionalMetric(
  value: number | null,
  suffix = '',
  decimals = 0,
): string {
  if (value === null || Number.isNaN(value)) {
    return 'Non renseigné';
  }
  const formatted = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function validateKpisForm(input: {
  periodLabel: string;
  workedHours: string;
  retentionRatePct: string;
  canEditFinancialKpis: boolean;
  revenueEur: string;
  payrollMassEur: string;
  productivityPerHour: string;
  monthlyTargetEur: string;
}): { error: string } | { payload: Extract<HrPilotageCommand, { action: 'save_site_kpis' }> } {
  const periodLabel = input.periodLabel.trim();
  if (!periodLabel || periodLabel.length > 80) {
    return { error: 'Indiquez une période valide (1 à 80 caractères).' };
  }

  const parseOpt = (raw: string, label: string, max: number): number | null | 'ERR' => {
    const trimmed = raw.trim().replace(',', '.');
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || n > max) return 'ERR';
    return Math.round(n * 100) / 100;
  };

  const workedHours = parseOpt(input.workedHours, 'Heures travaillées', 100_000);
  if (workedHours === 'ERR') {
    return { error: 'Heures travaillées invalides (0 à 100 000).' };
  }
  const retentionRatePct = parseOpt(input.retentionRatePct, 'Rétention', 100);
  if (retentionRatePct === 'ERR') {
    return { error: 'Le taux de rétention doit être compris entre 0 et 100 %.' };
  }

  if (!input.canEditFinancialKpis) {
    return {
      payload: {
        action: 'save_site_kpis',
        periodLabel,
        workedHours,
        retentionRatePct,
        revenueEur: null,
        payrollMassEur: null,
        productivityPerHour: null,
        monthlyTargetEur: null,
      },
    };
  }

  const revenueEur = parseOpt(input.revenueEur, 'Chiffre d’affaires', 50_000_000);
  const payrollMassEur = parseOpt(input.payrollMassEur, 'Masse salariale', 50_000_000);
  const productivityPerHour = parseOpt(input.productivityPerHour, 'Productivité', 50_000);
  const monthlyTargetEur = parseOpt(input.monthlyTargetEur, 'Objectif mensuel', 50_000_000);
  if (
    revenueEur === 'ERR' ||
    payrollMassEur === 'ERR' ||
    productivityPerHour === 'ERR' ||
    monthlyTargetEur === 'ERR'
  ) {
    return { error: 'Un montant financier saisi est invalide (nombre positif attendu).' };
  }

  return {
    payload: {
      action: 'save_site_kpis',
      periodLabel,
      workedHours,
      retentionRatePct,
      revenueEur,
      payrollMassEur,
      productivityPerHour,
      monthlyTargetEur,
    },
  };
}

export function validateMissionForm(input: {
  title: string;
  budgetHours: number;
  hourlyBudgetEur?: number;
  canViewFinances: boolean;
}): string | null {
  const title = input.title.trim();
  if (!title || title.length > 120) {
    return 'Indiquez un intitulé de mission (1 à 120 caractères).';
  }
  if (!Number.isFinite(input.budgetHours) || input.budgetHours <= 0 || input.budgetHours > 2000) {
    return 'Le budget d’heures doit être compris entre 0,5 et 2 000 h.';
  }
  if (
    input.canViewFinances &&
    input.hourlyBudgetEur !== undefined &&
    (!Number.isFinite(input.hourlyBudgetEur) ||
      input.hourlyBudgetEur < 0 ||
      input.hourlyBudgetEur > 500)
  ) {
    return 'Le taux horaire doit être compris entre 0 et 500 €.';
  }
  return null;
}

function escapeCsvCell(raw: string): string {
  const normalized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildPilotageCsv(snapshot: HrPilotageSnapshot): string {
  const withFinances = snapshot.capabilities.canViewFinances;
  const headers = [
    'Établissement',
    'Mission',
    'Statut',
    'Heures prévues',
    'Heures réalisées',
    ...(withFinances ? ['Taux horaire (€)', 'Budget estimé (€)', 'Coût engagé (€)'] : []),
  ];
  const rows = snapshot.missions.map((m) => {
    const base = [
      snapshot.site.name,
      m.title,
      m.status === 'done' ? 'Terminée' : 'En cours',
      String(m.budgetHours),
      String(m.loggedHours),
    ];
    if (withFinances) {
      base.push(
        m.hourlyBudgetEur !== null ? String(m.hourlyBudgetEur) : '',
        m.estimatedBudgetEur !== null ? String(m.estimatedBudgetEur) : '',
        m.loggedCostEur !== null ? String(m.loggedCostEur) : '',
      );
    }
    return base.map(escapeCsvCell).join(';');
  });
  return [headers.map(escapeCsvCell).join(';'), ...rows].join('\n');
}

export function validateHrPilotageSnapshot(
  raw: unknown,
  expectedActorId: string,
  expectedClubId: ClubId,
): HrPilotageSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Réponse serveur invalide pour le pilotage de l’établissement.');
  }
  const obj = raw as Record<string, unknown>;
  const expectedSite = clubIdToSiteId(expectedClubId);
  if (
    obj.actorId !== expectedActorId ||
    obj.siteId !== expectedSite ||
    typeof obj.revision !== 'string'
  ) {
    throw new Error('Réponse de pilotage reçue pour un autre compte ou un autre établissement.');
  }
  if (
    !obj.site ||
    typeof obj.site !== 'object' ||
    !obj.kpis ||
    typeof obj.kpis !== 'object' ||
    !obj.operationalSummary ||
    typeof obj.operationalSummary !== 'object' ||
    !Array.isArray(obj.missions) ||
    !obj.capabilities ||
    typeof obj.capabilities !== 'object'
  ) {
    throw new Error('Données de pilotage reçues du serveur incomplètes.');
  }
  return raw as HrPilotageSnapshot;
}

function requireToken(expectedActorId: string): string {
  const token = window.sessionStorage.getItem('cfos_bearer_token');
  const actor = window.sessionStorage.getItem('cfos_bearer_actor_id');
  if (!token || actor !== expectedActorId) {
    throw new Error('Reconnectez-vous pour accéder au pilotage et aux missions.');
  }
  return token;
}

async function readJson<T>(res: Response): Promise<T> {
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Erreur serveur (${res.status}).`;
    throw new Error(msg);
  }
  return payload as T;
}

export async function fetchHrPilotage(
  actorId: string,
  clubId: ClubId,
  signal?: AbortSignal,
): Promise<HrPilotageSnapshot> {
  const token = requireToken(actorId);
  const res = await fetch(`/api/hr/pilotage/${clubId}`, {
    method: 'GET',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
    },
  });
  return validateHrPilotageSnapshot(await readJson(res), actorId, clubId);
}

export async function mutateHrPilotage(
  actorId: string,
  clubId: ClubId,
  expectedRevision: string,
  command: HrPilotageCommand,
): Promise<HrPilotageSnapshot> {
  const token = requireToken(actorId);
  const res = await fetch(`/api/hr/pilotage/${clubId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expectedRevision, command }),
  });
  return validateHrPilotageSnapshot(await readJson(res), actorId, clubId);
}
