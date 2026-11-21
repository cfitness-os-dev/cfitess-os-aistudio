import type { ClubId, Prospect } from '../types/cfos';

export interface FictiveSaleRow {
  id: string;
  memberName: string;
  planName: string;
  clubId: ClubId;
  amountEur: number;
  paidAt: string;
  subscriptionEndDate: string;
  status: 'Actif' | 'À renouveler' | 'Résilié';
}

export const INITIAL_FICTIVE_SALES: FictiveSaleRow[] = [
  {
    id: 'sale-1',
    memberName: 'Claire Dubois (Fictif)',
    planName: 'Pass Liberté + Biocircuit 12 mois',
    clubId: 'carre-de-soie',
    amountEur: 49.9,
    paidAt: '2026-10-05',
    subscriptionEndDate: '2026-11-28',
    status: 'À renouveler',
  },
  {
    id: 'sale-2',
    memberName: 'Lucas Garnier (Fictif)',
    planName: 'Abonnement Club Carré de Soie',
    clubId: 'carre-de-soie',
    amountEur: 39.9,
    paidAt: '2026-10-18',
    subscriptionEndDate: '2027-01-15',
    status: 'Actif',
  },
  {
    id: 'sale-3',
    memberName: 'Nadia Benali (Fictif)',
    planName: 'Coaching Checkup + Accès Beynost',
    clubId: 'beynost',
    amountEur: 59.9,
    paidAt: '2026-11-02',
    subscriptionEndDate: '2026-12-05',
    status: 'À renouveler',
  },
  {
    id: 'sale-4',
    memberName: 'Hugo Lefebvre (Fictif)',
    planName: 'Abonnement Essentiel Beynost',
    clubId: 'beynost',
    amountEur: 34.9,
    paidAt: '2026-11-10',
    subscriptionEndDate: '2027-03-31',
    status: 'Actif',
  },
];

export function filterFictiveSales(
  sales: FictiveSaleRow[],
  opts: {
    clubCds: boolean;
    clubBeynost: boolean;
    endsAfter?: string;
    endsBefore?: string;
  }
): FictiveSaleRow[] {
  return sales.filter((s) => {
    if (!opts.clubCds && s.clubId === 'carre-de-soie') return false;
    if (!opts.clubBeynost && s.clubId === 'beynost') return false;
    if (opts.endsAfter && s.subscriptionEndDate < opts.endsAfter) return false;
    if (opts.endsBefore && s.subscriptionEndDate > opts.endsBefore) return false;
    return true;
  });
}

/**
 * Parse un fichier CSV complet en respectant les guillemets doubles et les retours à la ligne internes.
 */
export function parseCsvRowsWithQuotes(csvText: string, delimiter = ';'): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    if (ch === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && csvText[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }
  return rows;
}

/**
 * Parse une ligne CSV en respectant les guillemets doubles (ex: "a;b";c).
 */
export function parseCsvLineWithQuotes(line: string, delimiter = ';'): string[] {
  const rows = parseCsvRowsWithQuotes(line, delimiter);
  return rows[0] ?? [''];
}

export function isProspectInStatsPeriod(
  createdAt: string,
  periodId: string,
  referenceDate: Date = new Date()
): boolean {
  if (!periodId || periodId === 'all' || periodId === 'all_time') return true;
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return false;
  const refDay = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const itemDay = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  );
  const diffDays = Math.floor((refDay.getTime() - itemDay.getTime()) / 86400000);
  if (periodId === 'today') return diffDays === 0;
  if (periodId === 'yesterday') return diffDays === 1;
  if (periodId === 'last_week') {
    // Semaine calendaire précédente (lundi -> dimanche)
    const dow = (refDay.getUTCDay() + 6) % 7; // 0 = lundi, 6 = dimanche
    const currentWeekMonday = new Date(refDay.getTime() - dow * 86400000);
    const prevWeekMonday = new Date(currentWeekMonday.getTime() - 7 * 86400000);
    const prevWeekSunday = new Date(currentWeekMonday.getTime() - 86400000);
    return itemDay >= prevWeekMonday && itemDay <= prevWeekSunday;
  }
  if (periodId === 'current_month') {
    return (
      parsed.getUTCFullYear() === referenceDate.getUTCFullYear() &&
      parsed.getUTCMonth() === referenceDate.getUTCMonth() &&
      itemDay <= refDay
    );
  }
  if (periodId === 'last_month') {
    const prevMonth = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1)
    );
    return (
      parsed.getUTCFullYear() === prevMonth.getUTCFullYear() &&
      parsed.getUTCMonth() === prevMonth.getUTCMonth()
    );
  }
  if (periodId === 'last_30_days') return diffDays >= 0 && diffDays <= 30;
  if (periodId === 'year_to_date') {
    const jan1 = new Date(Date.UTC(referenceDate.getUTCFullYear(), 0, 1));
    return itemDay >= jan1 && itemDay <= refDay;
  }
  return false;
}

export type LeadReportDimension = 'rdv' | 'commercial' | 'utm' | 'source' | 'stage';

export function resolveLeadReportDimension(tableId: string): LeadReportDimension {
  const idLower = tableId.toLowerCase();
  if (idLower === 'st-tunnel-com' || idLower === 'st-act-com' || idLower.includes('commercial') || idLower.includes('sales_rep')) {
    return 'commercial';
  }
  if (idLower === 'st-tunnel-src' || idLower === 'st-act-src' || idLower.includes('source')) {
    return 'source';
  }
  if (idLower === 'st-tunnel-utm' || idLower === 'st-act-utm' || idLower.includes('utm')) {
    return 'utm';
  }
  if (idLower === 'st-tunnel-rdv' || idLower === 'st-act-rdv' || idLower.includes('rdv') || idLower.includes('meeting') || idLower.includes('appointment')) {
    return 'rdv';
  }
  return 'stage';
}

export interface StatsReportBreakdownItem {
  label: string;
  volume: number;
  cdsCount: number;
  beyCount: number;
  rdvTakenCount: number;
  visitedCount: number;
  convertedCount: number;
  conversionPct: number;
}

export function computeLeadReportBreakdown(
  tableId: string,
  prospects: Prospect[],
  opts: {
    periodId: string;
    multiClubCds: boolean;
    multiClubBeynost: boolean;
    ignoreArchived: boolean;
    compareToPreviousYear: boolean;
    referenceDate?: Date;
    dimension?: LeadReportDimension;
    commercialLabelById?: Record<string, string>;
  }
): {
  dimension: LeadReportDimension;
  filteredCount: number;
  cdsCount: number;
  beyCount: number;
  convertedCount: number;
  conversionPct: number;
  previousYearCount: number | null;
  rows: StatsReportBreakdownItem[];
} {
  const ref = opts.referenceDate ?? new Date();
  const dimension = opts.dimension ?? resolveLeadReportDimension(tableId);
  const filtered = prospects.filter((p) => {
    if (!opts.multiClubCds && p.clubId === 'carre-de-soie') return false;
    if (!opts.multiClubBeynost && p.clubId === 'beynost') return false;
    if (opts.ignoreArchived && p.stage === 'Perdu') return false;
    if (!isProspectInStatsPeriod(p.createdAt, opts.periodId, ref)) return false;
    return true;
  });

  const cdsCount = filtered.filter((p) => p.clubId === 'carre-de-soie').length;
  const beyCount = filtered.filter((p) => p.clubId === 'beynost').length;
  const convertedCount = filtered.filter((p) => p.stage === 'Adhérent').length;
  const conversionPct = filtered.length ? Math.round((convertedCount / filtered.length) * 100) : 0;

  // Série N-1 calculée sur l'année précédente (ou 0 si aucune donnée N-1)
  const prevRef = new Date(Date.UTC(ref.getUTCFullYear() - 1, ref.getUTCMonth(), ref.getUTCDate()));
  const previousYearCount = opts.compareToPreviousYear
    ? prospects.filter((p) => {
        if (!opts.multiClubCds && p.clubId === 'carre-de-soie') return false;
        if (!opts.multiClubBeynost && p.clubId === 'beynost') return false;
        if (opts.ignoreArchived && p.stage === 'Perdu') return false;
        return isProspectInStatsPeriod(p.createdAt, opts.periodId, prevRef);
      }).length
    : null;

  const groupKey = (p: Prospect): string => {
    if (dimension === 'source') return p.source || 'Source non renseignée';
    if (dimension === 'commercial') {
      const assigned = p.assignedToId?.trim();
      if (!assigned) return 'Non assigné';
      return opts.commercialLabelById?.[assigned] ?? assigned;
    }
    if (dimension === 'utm') {
      const collectedUtm = (p as Prospect & { utmCampaign?: string }).utmCampaign?.trim();
      return collectedUtm && collectedUtm.length > 0 ? collectedUtm : 'Sans UTM collectée';
    }
    if (dimension === 'rdv') {
      return p.trialDate ? 'Séance / RDV planifié' : 'Sans RDV planifié';
    }
    return p.stage;
  };

  const buckets = new Map<string, Prospect[]>();
  for (const p of filtered) {
    const k = groupKey(p);
    const list = buckets.get(k) ?? [];
    list.push(p);
    buckets.set(k, list);
  }

  const rows: StatsReportBreakdownItem[] = Array.from(buckets.entries()).map(([label, list]) => {
    const c = list.filter((p) => p.clubId === 'carre-de-soie').length;
    const b = list.filter((p) => p.clubId === 'beynost').length;
    const rdvTakenCount = list.filter(
      (p) => Boolean(p.trialDate) || p.stage === 'Séance planifiée' || p.stage === 'Venu' || p.stage === 'Adhérent'
    ).length;
    const visitedCount = list.filter((p) => p.stage === 'Venu' || p.stage === 'Adhérent').length;
    const conv = list.filter((p) => p.stage === 'Adhérent').length;
    return {
      label,
      volume: list.length,
      cdsCount: c,
      beyCount: b,
      rdvTakenCount,
      visitedCount,
      convertedCount: conv,
      conversionPct: list.length ? Math.round((conv / list.length) * 100) : 0,
    };
  });

  return {
    dimension,
    filteredCount: filtered.length,
    cdsCount,
    beyCount,
    convertedCount,
    conversionPct,
    previousYearCount,
    rows,
  };
}

const PARIS_TZ = 'Europe/Paris';
const HAS_TZ_SUFFIX_RE = /(?:[zZ]|[+-]\d{2}:\d{2})$/;

function toParisDateKeyFromDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function extractParisDateKey(dueAtIso: string): string | null {
  const trimmed = (dueAtIso || '').trim();
  if (!trimmed) return null;
  if (HAS_TZ_SUFFIX_RE.test(trimmed)) {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return toParisDateKeyFromDate(d);
  }
  const datePart = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

export function formatActivityDueAtParis(dueAtIso: string): string {
  const trimmed = (dueAtIso || '').trim();
  if (!trimmed) return '';
  if (HAS_TZ_SUFFIX_RE.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      const parts = new Intl.DateTimeFormat('fr-CA', {
        timeZone: PARIS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
    }
  }
  return trimmed.replace('T', ' ').slice(0, 16);
}

export function computeActivityDueBucket(
  dueAtIso: string,
  status: 'todo' | 'done',
  referenceDate: Date = new Date()
): "En retard" | "Aujourd'hui" | "Demain" | "Cette semaine" | "Plus tard" | "Faites" {
  if (status === 'done') return 'Faites';
  const dueKey = extractParisDateKey(dueAtIso);
  if (!dueKey) return 'Cette semaine';
  const refKey = toParisDateKeyFromDate(referenceDate);
  const [dy, dm, dd] = dueKey.split('-').map(Number);
  const [ry, rm, rd] = refKey.split('-').map(Number);
  const refDayMs = Date.UTC(ry, rm - 1, rd);
  const dueDayMs = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.floor((dueDayMs - refDayMs) / 86400000);
  if (diffDays < 0) return 'En retard';
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Demain';
  if (diffDays <= 7) return 'Cette semaine';
  return 'Plus tard';
}

/**
 * Offres Heitz importées et éligibles pour le passage au statut Client (LEAD-0553 / LEAD-0554).
 */
export interface HeitzClientPassOffer {
  id: string;
  clubId: ClubId;
  label: string;
  category: 'Abonnement' | 'Carte / Pack' | 'Entreprise';
  triggersClientStatus: boolean;
  targetScope: 'club' | 'enseigne';
}

export const CANONICAL_HEITZ_PASS_OFFERS: readonly HeitzClientPassOffer[] = [
  {
    id: 'HZ-CDS-ABO-PASS',
    clubId: 'carre-de-soie',
    label: 'Abonnement Annuel Pass Liberté (Biocircuit inclus)',
    category: 'Abonnement',
    triggersClientStatus: true,
    targetScope: 'enseigne',
  },
  {
    id: 'HZ-CDS-ABO-SOLO',
    clubId: 'carre-de-soie',
    label: 'Abonnement Club Carré de Soie (Accès unique CDS)',
    category: 'Abonnement',
    triggersClientStatus: true,
    targetScope: 'club',
  },
  {
    id: 'HZ-CDS-CARTE-10',
    clubId: 'carre-de-soie',
    label: 'Carte 10 Séances Découverte CDS',
    category: 'Carte / Pack',
    triggersClientStatus: true,
    targetScope: 'club',
  },
  {
    id: 'HZ-CDS-COACH-PK',
    clubId: 'carre-de-soie',
    label: 'Pack Coaching Premium Suivi Forme CDS',
    category: 'Carte / Pack',
    triggersClientStatus: true,
    targetScope: 'club',
  },
  {
    id: 'HZ-BEY-ABO-PASS',
    clubId: 'beynost',
    label: 'Abonnement Annuel Pass Liberté Beynost',
    category: 'Abonnement',
    triggersClientStatus: true,
    targetScope: 'enseigne',
  },
  {
    id: 'HZ-BEY-ABO-SOLO',
    clubId: 'beynost',
    label: 'Abonnement Club Beynost ZAC des Baterses',
    category: 'Abonnement',
    triggersClientStatus: true,
    targetScope: 'club',
  },
  {
    id: 'HZ-BEY-CARTE-10',
    clubId: 'beynost',
    label: 'Carte 10 Entrées Découverte Beynost',
    category: 'Carte / Pack',
    triggersClientStatus: true,
    targetScope: 'club',
  },
  {
    id: 'HZ-BEY-ENTREPRISE',
    clubId: 'beynost',
    label: 'Convention Entreprise Partenaire Côtière',
    category: 'Entreprise',
    triggersClientStatus: true,
    targetScope: 'club',
  },
];

/**
 * Familles d'alertes & notifications CRM (LEAD-0545 à LEAD-0552).
 */
export interface LeadAlertConfigItem {
  id: string;
  label: string;
  description: string;
  channel: 'SMS' | 'Email' | 'In-App';
  activeByDefault: boolean;
  category: 'Rappel 24h' | 'Modification' | 'Annulation' | 'Retard Commercial' | 'Décrochage' | 'Statut Client';
}

export const CANONICAL_LEAD_ALERTS: readonly LeadAlertConfigItem[] = [
  {
    id: 'LEAD-0545',
    label: 'SMS rappel RDV 24h avant séance',
    description: 'Envoi automatique au prospect 24h avant sa séance d’essai (GSM-7 sans surcoût)',
    channel: 'SMS',
    activeByDefault: false,
    category: 'Rappel 24h',
  },
  {
    id: 'LEAD-0546',
    label: 'SMS notification de déplacement / modification RDV',
    description: 'Envoi instantané au prospect dès qu’un créneau est modifié par le commercial',
    channel: 'SMS',
    activeByDefault: false,
    category: 'Modification',
  },
  {
    id: 'LEAD-0547',
    label: 'SMS notification d’annulation de RDV',
    description: 'Alerte au prospect avec lien de réengagement immédiat',
    channel: 'SMS',
    activeByDefault: false,
    category: 'Annulation',
  },
  {
    id: 'LEAD-0548',
    label: 'Email rappel RDV 24h avec récapitulatif accès club',
    description: 'Email HTML responsive avec QR code et consignes tenue / badgeage',
    channel: 'Email',
    activeByDefault: true,
    category: 'Rappel 24h',
  },
  {
    id: 'LEAD-0549',
    label: 'Email notification de modification / confirmation de créneau',
    description: 'Confirmation de la nouvelle date et heure envoyée au prospect',
    channel: 'Email',
    activeByDefault: false,
    category: 'Modification',
  },
  {
    id: 'LEAD-0550',
    label: 'Email notification d’annulation de séance',
    description: 'Notification officielle et proposition de recontact sous 48h',
    channel: 'Email',
    activeByDefault: false,
    category: 'Annulation',
  },
  {
    id: 'LEAD-0551',
    label: 'Alerte interne In-App : Retard commercial / échéance dépassée',
    description: 'Notifie le manager quand un prospect n’a reçu aucun contact après la deadline',
    channel: 'In-App',
    activeByDefault: true,
    category: 'Retard Commercial',
  },
  {
    id: 'LEAD-0552',
    label: 'Désactivation emails service MSDS tiers pour éviter doublons',
    description: 'Neutralise les notifications redondantes du prestataire externe',
    channel: 'Email',
    activeByDefault: true,
    category: 'Statut Client',
  },
];

