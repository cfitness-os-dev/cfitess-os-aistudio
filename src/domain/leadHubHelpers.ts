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
 * Parse une ligne CSV en respectant les guillemets doubles (ex: "a;b";c).
 */
export function parseCsvLineWithQuotes(line: string, delimiter = ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function isProspectInStatsPeriod(
  createdAt: string,
  periodId: string,
  referenceDate: Date = new Date()
): boolean {
  if (!periodId || periodId === 'all' || periodId === 'all_time') return true;
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return true;
  const refDay = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const itemDay = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
  );
  const diffDays = Math.floor((refDay.getTime() - itemDay.getTime()) / 86400000);
  if (periodId === 'today') return diffDays === 0;
  if (periodId === 'yesterday') return diffDays === 1;
  if (periodId === 'last_week') return diffDays >= 0 && diffDays <= 7;
  if (periodId === 'current_month') {
    return (
      parsed.getUTCFullYear() === referenceDate.getUTCFullYear() &&
      parsed.getUTCMonth() === referenceDate.getUTCMonth()
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
  return true;
}

export interface StatsReportBreakdownItem {
  label: string;
  volume: number;
  cdsCount: number;
  beyCount: number;
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
  }
): {
  filteredCount: number;
  cdsCount: number;
  beyCount: number;
  convertedCount: number;
  conversionPct: number;
  previousYearCount: number | null;
  rows: StatsReportBreakdownItem[];
} {
  const ref = opts.referenceDate ?? new Date('2026-10-25T12:00:00Z');
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
    const idLower = tableId.toLowerCase();
    if (idLower.includes('source')) return p.source;
    if (idLower.includes('commercial') || idLower.includes('sales_rep')) {
      return p.assignedToId || 'Non assigné';
    }
    if (idLower.includes('utm')) {
      return p.source === 'Site c.fitness' ? 'utm_site_cfitness' : `utm_${p.clubId}`;
    }
    if (idLower.includes('rdv') || idLower.includes('meeting') || idLower.includes('appointment')) {
      return p.trialDate ? 'RDV planifié' : 'Sans RDV';
    }
    if (idLower.includes('activity') || idLower.includes('activite')) {
      return p.retryCount > 0 ? `Relancé (${p.retryCount}x)` : 'Nouveau contact';
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
    const conv = list.filter((p) => p.stage === 'Adhérent').length;
    return {
      label,
      volume: list.length,
      cdsCount: c,
      beyCount: b,
      convertedCount: conv,
      conversionPct: list.length ? Math.round((conv / list.length) * 100) : 0,
    };
  });

  return {
    filteredCount: filtered.length,
    cdsCount,
    beyCount,
    convertedCount,
    conversionPct,
    previousYearCount,
    rows,
  };
}

export function computeActivityDueBucket(
  dueAtIso: string,
  status: 'todo' | 'done',
  referenceDate: Date = new Date()
): "En retard" | "Aujourd'hui" | "Demain" | "Cette semaine" | "Plus tard" | "Faites" {
  if (status === 'done') return 'Faites';
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return 'Cette semaine';
  const refDay = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const dueDay = new Date(
    Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  );
  const diffDays = Math.floor((dueDay.getTime() - refDay.getTime()) / 86400000);
  if (diffDays < 0) return 'En retard';
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Demain';
  if (diffDays <= 7) return 'Cette semaine';
  return 'Plus tard';
}
