export type LeadClubId = 'carre-de-soie' | 'beynost';

/** One club per request. Keep these names aligned with the Rust settings DTO. */
export interface LeadSettings {
  smsCredits: number;
  salesScript: string;
  archiveThresholdDays: number;
  notifEmail: string;
  notifMobile: string;
  whatsappNumber: string;
  clientPassOffer: string;
  autoAssignEnabled: boolean;
  autoUnassignOnLeave: boolean;
  dropoutThresholdDays: number;
  dropoutResetOnBadge: boolean;
  autoArchiveEnabled: boolean;
  archiveTargetStage: 'Archivé' | 'Froid';
  enabledAlertIds: string[];
  selectedPassOfferIds: string[];
  clientPassTargetScope: 'club' | 'enseigne';
  uiLanguage: 'fr' | 'en';
}

const settingsKeys = ['smsCredits', 'salesScript', 'archiveThresholdDays', 'notifEmail',
  'notifMobile', 'whatsappNumber', 'clientPassOffer', 'autoAssignEnabled', 'autoUnassignOnLeave',
  'dropoutThresholdDays', 'dropoutResetOnBadge', 'autoArchiveEnabled', 'archiveTargetStage',
  'enabledAlertIds', 'selectedPassOfferIds', 'clientPassTargetScope', 'uiLanguage'];

export function leadSettingsError(settings: LeadSettings, clubId: LeadClubId): string | null {
  if (!Number.isSafeInteger(settings.smsCredits) || settings.smsCredits < 0 || settings.smsCredits > 4294967295)
    return 'Le solde SMS doit être un entier positif ou nul.';
  if (!Number.isInteger(settings.archiveThresholdDays) || settings.archiveThresholdDays < 1 || settings.archiveThresholdDays > 730)
    return 'Le délai d’archivage doit être compris entre 1 et 730 jours.';
  if (!Number.isInteger(settings.dropoutThresholdDays) || settings.dropoutThresholdDays < 1 || settings.dropoutThresholdDays > 180)
    return 'Le seuil de décrochage doit être compris entre 1 et 180 jours.';
  for (const [name, value, max] of [
    ['Script commercial', settings.salesScript, 16000], ['Email', settings.notifEmail, 254],
    ['Mobile', settings.notifMobile, 40], ['WhatsApp', settings.whatsappNumber, 40],
    ['Offre', settings.clientPassOffer, 256],
  ] as const) {
    if (typeof value !== 'string' || value.length > max) return `${name} : longueur invalide.`;
  }
  if (settings.notifEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.notifEmail) ||
      settings.notifEmail.split('@')[1].startsWith('.') || settings.notifEmail.endsWith('.')))
    return 'L’adresse email de notification est invalide.';
  for (const value of [settings.notifMobile, settings.whatsappNumber]) {
    const digits = value.replace(/\D/g, '').length;
    if (value && (!/^\+?[\d ().-]+$/.test(value) || digits < 8 || digits > 15))
      return 'Le numéro de téléphone est invalide (8 à 15 chiffres).';
  }
  if (!['Archivé', 'Froid'].includes(settings.archiveTargetStage) ||
      !['club', 'enseigne'].includes(settings.clientPassTargetScope) || !['fr', 'en'].includes(settings.uiLanguage))
    return 'Une option des réglages est invalide.';
  for (const key of ['autoAssignEnabled', 'autoUnassignOnLeave', 'dropoutResetOnBadge', 'autoArchiveEnabled'] as const)
    if (typeof settings[key] !== 'boolean') return 'Une option d’automatisation est invalide.';
  for (const ids of [settings.enabledAlertIds, settings.selectedPassOfferIds]) {
    if (!Array.isArray(ids) || ids.length > 256 || new Set(ids).size !== ids.length ||
        ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 128))
      return 'La sélection contient un identifiant invalide ou un doublon.';
  }
  if (settings.enabledAlertIds.some(id => !/^LEAD-05(4[5-9]|5[0-2])$/.test(id)))
    return 'Une alerte sélectionnée est inconnue.';
  const otherPrefix = clubId === 'beynost' ? 'HZ-CDS-' : 'HZ-BEY-';
  if (settings.selectedPassOfferIds.some(id => id.startsWith(otherPrefix)))
    return 'Une offre sélectionnée appartient à l’autre club.';
  return null;
}

export function parseLeadSettings(value: unknown, clubId: LeadClubId): LeadSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réglages serveur invalides.');
  if (Object.keys(value).some(key => !settingsKeys.includes(key))) throw new Error('Champ de réglage inconnu.');
  const settings = value as LeadSettings;
  const error = leadSettingsError(settings, clubId);
  if (error) throw new Error(error);
  // No cache/default merge: the response must contain the complete club contract.
  return { ...settings, enabledAlertIds: [...settings.enabledAlertIds], selectedPassOfferIds: [...settings.selectedPassOfferIds] };
}
