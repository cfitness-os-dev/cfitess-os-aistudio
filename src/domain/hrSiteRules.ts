import type { ClubId } from '../types/cfos';

export interface SiteHrSettingsDto {
  badgeFrequency: 'each_shift' | 'consecutive_shift_series' | string;
  tabletBreakBadging: boolean;
  dayStartHour: string;
  breakAlertHours: number;
  breakAlertEnabled: boolean;
  consecutiveDaysBlocking: boolean;
  complementaryMaxHours: number;
  smartPlannerBreakMaxHours: number;
  alertsLayout: 'split_13_6' | 'single_list' | string;
  missionsModuleActive: boolean;
  reportRulesVisible: boolean;
  annualizationPeriod: string;
  acquisitionMode: string;
  annualizationTotalMotives: number;
  annualizationIncludedMotives: number;
  sundayHoursInAnnualization: boolean;
  rttHoursCounterActive: boolean;
}

export interface SiteAbsenceMotiveConfig {
  id: string;
  siteId: string;
  label: string;
  category: 'conges' | 'maladie' | 'evenement_familial' | 'recuperation' | 'autre';
  active: boolean;
  employeeRequestable: boolean;
  includedInAnnualization: boolean;
  requiresDocument: boolean;
}

export interface SiteStaffingNeed {
  id: string;
  siteId: string;
  positionId: string;
  dayOfWeek:
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday'
    | 'weekdays'
    | 'weekend';
  kind: 'fixed' | 'variable';
  startTime: string;
  endTime: string;
  minHeadcount: number;
  active: boolean;
  note: string;
}

export interface SitePositionRef {
  id: string;
  siteId: string;
  label: string;
  color: string;
  defaultBreakMinutes: number;
  active: boolean;
}

export interface HrSiteRulesSnapshot {
  demoMode: boolean;
  actorId: string;
  clubId: ClubId;
  siteId: string;
  revision: string;
  site: {
    id: string;
    name: string;
    siret: string;
    timezone: string;
  };
  settings: SiteHrSettingsDto;
  motives: SiteAbsenceMotiveConfig[];
  staffingNeeds: SiteStaffingNeed[];
  positions: SitePositionRef[];
  capabilities: {
    canEditRules: boolean;
    canEditAlertsAndReport: boolean;
    canEditAbsences: boolean;
    canEditStaffingNeeds: boolean;
    canEditBadgeSettings: boolean;
  };
}

export type HrSiteRulesCommand =
  | {
      action: 'save_base_rules';
      dayStartHour: string;
      breakAlertEnabled: boolean;
      breakAlertHours: number;
      consecutiveDaysBlocking: boolean;
      complementaryMaxHours: number;
      smartPlannerBreakMaxHours: number;
      alertsLayout: string;
      missionsModuleActive: boolean;
      reportRulesVisible: boolean;
    }
  | {
      action: 'save_counter_rules';
      acquisitionMode: string;
      annualizationPeriod: string;
      sundayHoursInAnnualization: boolean;
      rttHoursCounterActive: boolean;
    }
  | {
      action: 'save_badge_settings';
      badgeFrequency: 'each_shift' | 'consecutive_shift_series';
      tabletBreakBadging: boolean;
    }
  | {
      action: 'save_absence_motive';
      id?: string;
      label: string;
      category: SiteAbsenceMotiveConfig['category'];
      active: boolean;
      employeeRequestable: boolean;
      includedInAnnualization: boolean;
      requiresDocument: boolean;
    }
  | {
      action: 'save_staffing_need';
      id?: string;
      positionId: string;
      dayOfWeek: SiteStaffingNeed['dayOfWeek'];
      kind: 'fixed' | 'variable';
      startTime: string;
      endTime: string;
      minHeadcount: number;
      active: boolean;
      note: string;
    }
  | {
      action: 'remove_staffing_need';
      id: string;
    };

export const DAY_OF_WEEK_LABELS: Record<SiteStaffingNeed['dayOfWeek'], string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
  weekdays: 'Semaine (lun.–ven.)',
  weekend: 'Week-end (sam.–dim.)',
};

export const MOTIVE_CATEGORY_LABELS: Record<SiteAbsenceMotiveConfig['category'], string> = {
  conges: 'Congés',
  maladie: 'Maladie / arrêt',
  evenement_familial: 'Événement familial',
  recuperation: 'Récupération / RTT',
  autre: 'Autre motif',
};

export function clubIdToSiteId(clubId: ClubId): 'club-carre-soie' | 'club-beynost' {
  return clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie';
}

export function isValidHhmm(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59;
}

export function validateBaseRulesForm(input: {
  dayStartHour: string;
  breakAlertHours: number;
  complementaryMaxHours: number;
  smartPlannerBreakMaxHours: number;
}): string | null {
  if (!isValidHhmm(input.dayStartHour)) {
    return 'Indiquez une heure de début de journée valide (HH:MM).';
  }
  if (!Number.isInteger(input.breakAlertHours) || input.breakAlertHours < 1 || input.breakAlertHours > 12) {
    return 'Le seuil d’alerte pause doit être un entier entre 1 et 12 heures.';
  }
  if (!Number.isInteger(input.complementaryMaxHours) || input.complementaryMaxHours < 1 || input.complementaryMaxHours > 48) {
    return 'Le plafond d’heures complémentaires doit être entre 1 et 48 heures.';
  }
  if (!Number.isInteger(input.smartPlannerBreakMaxHours) || input.smartPlannerBreakMaxHours < 1 || input.smartPlannerBreakMaxHours > 12) {
    return 'La pause maximale de planification doit être entre 1 et 12 heures.';
  }
  return null;
}

export function validateStaffingNeedForm(input: {
  positionId: string;
  startTime: string;
  endTime: string;
  minHeadcount: number;
}): string | null {
  if (!input.positionId.trim()) {
    return 'Choisissez un poste du club.';
  }
  if (!isValidHhmm(input.startTime) || !isValidHhmm(input.endTime)) {
    return 'Indiquez des horaires valides (HH:MM).';
  }
  if (input.startTime.trim() >= input.endTime.trim()) {
    return 'L’heure de fin doit être postérieure à l’heure de début.';
  }
  if (!Number.isInteger(input.minHeadcount) || input.minHeadcount < 1 || input.minHeadcount > 30) {
    return 'L’effectif minimal doit être un entier compris entre 1 et 30.';
  }
  return null;
}

export function validateHrSiteRulesSnapshot(
  raw: unknown,
  expectedActorId: string,
  expectedClubId: ClubId,
): HrSiteRulesSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Réponse serveur invalide pour les paramètres de l’établissement.');
  }
  const obj = raw as Record<string, unknown>;
  const expectedSite = clubIdToSiteId(expectedClubId);
  if (obj.actorId !== expectedActorId || obj.siteId !== expectedSite || typeof obj.revision !== 'string') {
    throw new Error('Réponse reçue pour un autre compte ou un autre établissement.');
  }
  if (
    !obj.settings ||
    typeof obj.settings !== 'object' ||
    !Array.isArray(obj.motives) ||
    !Array.isArray(obj.staffingNeeds) ||
    !Array.isArray(obj.positions) ||
    !obj.capabilities ||
    typeof obj.capabilities !== 'object'
  ) {
    throw new Error('Les paramètres RH reçus du serveur sont incomplets.');
  }
  return raw as HrSiteRulesSnapshot;
}

function requireToken(expectedActorId: string): string {
  const token = window.sessionStorage.getItem('cfos_bearer_token');
  const actor = window.sessionStorage.getItem('cfos_bearer_actor_id');
  if (!token || actor !== expectedActorId) {
    throw new Error('Reconnectez-vous pour accéder aux paramètres RH.');
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

export async function fetchHrSiteRules(
  actorId: string,
  clubId: ClubId,
  signal?: AbortSignal,
): Promise<HrSiteRulesSnapshot> {
  const token = requireToken(actorId);
  const res = await fetch(`/api/hr/site-rules/${clubId}`, {
    method: 'GET',
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
    },
  });
  return validateHrSiteRulesSnapshot(await readJson(res), actorId, clubId);
}

export async function mutateHrSiteRules(
  actorId: string,
  clubId: ClubId,
  expectedRevision: string,
  command: HrSiteRulesCommand,
): Promise<HrSiteRulesSnapshot> {
  const token = requireToken(actorId);
  const res = await fetch(`/api/hr/site-rules/${clubId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cfitness-site-id': clubIdToSiteId(clubId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expectedRevision, command }),
  });
  return validateHrSiteRulesSnapshot(await readJson(res), actorId, clubId);
}
