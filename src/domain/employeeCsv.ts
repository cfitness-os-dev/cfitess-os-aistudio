export interface ImportEmployeeRowPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  matricule?: string;
  siteIds: string[];
  profileId?: string;
  contractType?: string;
  weeklyHours?: number;
  initialPassword?: string;
}

export interface ParsedEmployeeCsvRow {
  lineNumber: number;
  payload: ImportEmployeeRowPayload;
  errors: string[];
}

export interface ParsedEmployeesCsvResult {
  rows: ParsedEmployeeCsvRow[];
  validCount: number;
  invalidCount: number;
}

export const EMPLOYEE_CSV_TEMPLATE = [
  'prenom;nom;email;telephone;matricule;clubs;profil;contrat;heures_hebdo;mot_de_passe_initial',
  'Prenom1;Nom1;prenom1.nom1@c.fitness;0600000010;CF-101;Carré de Soie;Employé;CDI;35;MotDePasseTemp2026!',
  'Prenom2;Nom2;prenom2.nom2@c.fitness;0600000011;CF-102;Carré de Soie + Beynost;Responsable;CDI;39;MotDePasseTemp2026!',
].join('\n');

const PROFILE_LABELS: Record<string, string> = {
  admin_systeme: 'Administrateur système',
  master_avance: 'Master avancé',
  planificateur_avance: 'Planificateur avancé',
  planificateur_standard: 'Planificateur standard',
  lecture_seule_avance: 'Lecture seule avancé',
  employe_standard: 'Employé',
};

export function getProfileDisplayLabel(profileId?: string): string {
  if (!profileId) return PROFILE_LABELS.employe_standard;
  return PROFILE_LABELS[profileId] ?? profileId;
}

function normalizeHeaderKey(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
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
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function mapClubTokens(rawClubs: string): string[] {
  const normalized = rawClubs
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return [];
  if (
    normalized === 'tous' ||
    normalized === 'all' ||
    normalized === 'bi-club' ||
    normalized === 'biclub' ||
    normalized === '2 clubs'
  ) {
    return ['club-carre-soie', 'club-beynost'];
  }

  const tokens = normalized
    .split(/[+|,/]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const resolved: string[] = [];
  for (const tok of tokens) {
    let siteId: string | null = null;
    if (
      tok === 'club-carre-soie' ||
      tok === 'carre-de-soie' ||
      tok === 'carre de soie' ||
      tok === 'cds' ||
      tok === 'site_cds' ||
      tok.includes('carre')
    ) {
      siteId = 'club-carre-soie';
    } else if (
      tok === 'club-beynost' ||
      tok === 'beynost' ||
      tok === 'bey' ||
      tok === 'site_bey' ||
      tok.includes('beynost')
    ) {
      siteId = 'club-beynost';
    }
    if (siteId && !resolved.includes(siteId)) {
      resolved.push(siteId);
    }
  }
  return resolved;
}

function mapProfileAlias(rawProfile: string): string | null {
  const norm = rawProfile
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!norm) return 'employe_standard';

  if (
    norm === 'admin_systeme' ||
    norm.includes('admin') ||
    norm.includes('direction') ||
    norm.includes('dirigeant')
  ) {
    return 'admin_systeme';
  }
  if (norm === 'master_avance' || norm.includes('master') || norm.includes('manager')) {
    return 'master_avance';
  }
  if (
    norm === 'planificateur_avance' ||
    norm.includes('responsable') ||
    norm.includes('planificateur avance')
  ) {
    return 'planificateur_avance';
  }
  if (norm === 'planificateur_standard' || norm.includes('planificateur')) {
    return 'planificateur_standard';
  }
  if (norm === 'lecture_seule_avance' || norm.includes('lecture')) {
    return 'lecture_seule_avance';
  }
  if (
    norm === 'employe_standard' ||
    norm.includes('employe') ||
    norm.includes('accueil') ||
    norm.includes('coach') ||
    norm.includes('commercial') ||
    norm.includes('apprenti')
  ) {
    return 'employe_standard';
  }
  return null;
}

function resolveColumnIndex(headers: string[], candidates: string[]): number {
  return headers.findIndex((h) => candidates.includes(h));
}

export function parseEmployeesCsv(rawText: string): ParsedEmployeesCsvResult {
  const cleanText = rawText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) {
    return { rows: [], validCount: 0, invalidCount: 0 };
  }

  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { rows: [], validCount: 0, invalidCount: 0 };
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = splitCsvLine(headerLine, delimiter).map(normalizeHeaderKey);

  const idxFirst = resolveColumnIndex(headers, ['prenom', 'firstname', 'first_name']);
  const idxLast = resolveColumnIndex(headers, ['nom', 'lastname', 'last_name']);
  const idxEmail = resolveColumnIndex(headers, ['email', 'mail', 'courriel']);
  const idxPhone = resolveColumnIndex(headers, ['telephone', 'tel', 'phone', 'mobile']);
  const idxMatricule = resolveColumnIndex(headers, ['matricule', 'badge', 'code']);
  const idxClubs = resolveColumnIndex(headers, ['clubs', 'club', 'sites', 'site', 'etablissement', 'etablissements']);
  const idxProfile = resolveColumnIndex(headers, ['profil', 'profile', 'role']);
  const idxContract = resolveColumnIndex(headers, ['contrat', 'contract', 'type_contrat']);
  const idxHours = resolveColumnIndex(headers, ['heures_hebdo', 'heures', 'weekly_hours', 'heures_semaine']);
  const idxPassword = resolveColumnIndex(headers, ['mot_de_passe_initial', 'mot_de_passe', 'password', 'initial_password']);

  const rows: ParsedEmployeeCsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter);
    const getCell = (colIdx: number) => (colIdx >= 0 ? (cells[colIdx] ?? '').trim() : '');

    const firstName = getCell(idxFirst);
    const lastName = getCell(idxLast);
    const email = getCell(idxEmail);
    const phone = getCell(idxPhone);
    const matricule = getCell(idxMatricule);
    const rawClubs = getCell(idxClubs);
    const rawProfile = getCell(idxProfile);
    const contractType = getCell(idxContract) || 'CDI';
    const rawHours = getCell(idxHours);
    const initialPassword = getCell(idxPassword);

    const errors: string[] = [];
    if (!firstName || !lastName) {
      errors.push('Prénom et nom obligatoires.');
    }

    const siteIds = mapClubTokens(rawClubs);
    if (siteIds.length === 0) {
      errors.push('Club invalide (Carré de Soie, Beynost ou Tous).');
    }

    const profileId = mapProfileAlias(rawProfile);
    if (!profileId) {
      errors.push(`Profil non reconnu (${rawProfile}).`);
    }

    let weeklyHours: number | undefined;
    if (rawHours) {
      const parsedHours = Number.parseInt(rawHours, 10);
      if (Number.isNaN(parsedHours) || parsedHours < 1 || parsedHours > 48) {
        errors.push(`Heures hebdo invalides (${rawHours}).`);
      } else {
        weeklyHours = parsedHours;
      }
    }

    if (initialPassword && initialPassword.length < 12) {
      errors.push('Mot de passe initial < 12 caractères.');
    }

    rows.push({
      lineNumber: i + 1,
      payload: {
        firstName,
        lastName,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(matricule ? { matricule } : {}),
        siteIds,
        ...(profileId ? { profileId } : {}),
        contractType,
        ...(weeklyHours !== undefined ? { weeklyHours } : {}),
        ...(initialPassword ? { initialPassword } : {}),
      },
      errors,
    });
  }

  const invalidCount = rows.filter((r) => r.errors.length > 0).length;
  return {
    rows,
    validCount: rows.length - invalidCount,
    invalidCount,
  };
}
