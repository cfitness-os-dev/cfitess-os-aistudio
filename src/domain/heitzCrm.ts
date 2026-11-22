import type { ClubId, HeitzMember } from '../types/cfos';
import { parseCsvRowsWithQuotes } from './leadHubHelpers';

export interface HeitzSnapshotRow {
  id?: string; firstName: string; lastName: string; phone?: string; email?: string;
  badgeCode?: string; homeClubId: ClubId; subscriptionName?: string;
  activeSubscription?: boolean; finBalanceEur?: number; mywellnessMemberId?: string;
}
export interface HeitzIntegration {
  webUrls: Partial<Record<ClubId, string | null>>;
  apiWritesAvailable: false;
  canImportSnapshot: boolean;
}

export function safeHeitzWebUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || /[\s\\]/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function filterHeitzMembers(rows: HeitzMember[], club: ClubId, search: string) {
  const query = search.trim().toLocaleLowerCase('fr');
  return rows.filter(member => member.homeClubId === club && (!query ||
    [member.firstName, member.lastName, member.email ?? '', member.phone, member.badgeCode]
      .some(value => value.toLocaleLowerCase('fr').includes(query))));
}

export function selectedHeitzMember(rows: HeitzMember[], id: string) {
  return rows.find(member => member.id === id) ?? rows[0] ?? null;
}

/** An export is a consultation snapshot, never a command to create a Heitz account. */
export function parseHeitzSnapshot(csv: string, activeClub: ClubId): HeitzSnapshotRow[] {
  const delimiter = csv.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows = parseCsvRowsWithQuotes(csv.replace(/^\uFEFF/, ''), delimiter);
  if (rows.length < 2) throw new Error('L’export doit contenir un en-tête et au moins un dossier.');
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const headers = rows[0].map(normalize);
  const index = (...aliases: string[]) => headers.findIndex(header => aliases.includes(header));
  const first = index('prenom', 'first_name', 'firstname');
  const last = index('nom', 'last_name', 'lastname');
  const badge = index('badge', 'badgecode', 'carte');
  const id = index('id', 'identifiant', 'heitz_id');
  if (first < 0 || last < 0 || (badge < 0 && id < 0)) throw new Error('Colonnes requises : prénom, nom et badge ou identifiant Heitz.');
  return rows.slice(1).map((row, offset) => {
    const field = (...aliases: string[]) => { const i = index(...aliases); return i < 0 ? '' : (row[i] ?? '').trim(); };
    const rawClub = normalize(field('club', 'site') || activeClub);
    const homeClubId = ['carre-de-soie', 'club-carre-soie', 'carre de soie'].includes(rawClub) ? 'carre-de-soie'
      : ['beynost', 'club-beynost'].includes(rawClub) ? 'beynost' : null;
    const sourceId = id < 0 ? '' : (row[id] ?? '').trim();
    const badgeCode = badge < 0 ? '' : (row[badge] ?? '').trim();
    if (!homeClubId || !row[first]?.trim() || !row[last]?.trim() || (!sourceId && !badgeCode))
      throw new Error(`Ligne ${offset + 2} : identité, badge ou club invalide. Aucun dossier importé.`);
    const balanceText = field('solde', 'balance');
    const balance = balanceText ? Number(balanceText.replace(',', '.')) : undefined;
    if (balance !== undefined && !Number.isFinite(balance)) throw new Error(`Ligne ${offset + 2} : solde invalide.`);
    const status = normalize(field('actif', 'active_subscription'));
    if (status && !['true', 'false', '1', '0', 'oui', 'non'].includes(status)) throw new Error(`Ligne ${offset + 2} : état d’abonnement invalide.`);
    return { id: sourceId || undefined, firstName: row[first].trim(), lastName: row[last].trim(),
      badgeCode: badgeCode || undefined, homeClubId, phone: field('telephone', 'tel', 'phone') || undefined,
      email: field('email', 'mail') || undefined, subscriptionName: field('abonnement', 'formule') || undefined,
      finBalanceEur: balance, activeSubscription: status ? ['true', '1', 'oui'].includes(status) : undefined };
  });
}
