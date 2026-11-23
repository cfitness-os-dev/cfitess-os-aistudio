export type MessageChannel = 'email' | 'sms' | 'whatsapp';
export interface EmailLayout { heading: string; buttonLabel: string; buttonUrl: string; footer: string; font: string }
export interface LeadMessage { name: string; channel: MessageChannel; subject: string; body: string; emailLayout?: EmailLayout | null }
export function messageText(message: LeadMessage): string {
  const layout = message.emailLayout;
  return layout ? [layout.heading, message.body, layout.buttonUrl ? `${layout.buttonLabel} : ${layout.buttonUrl}` : '', layout.footer].filter(Boolean).join('\n\n') : message.body;
}
export interface LeadMessageTemplate { id: string; clubId: string; revision: number; message: LeadMessage; archived: boolean; updatedAt: string }
export const MESSAGE_VARIABLES = ['prenom', 'nom', 'club', 'telephone-club', 'adresse-club', 'url-rdv-club', 'url-club', 'prenom-commercial', 'rdv-date', 'rdv-heure', 'date', 'heure', 'prix'] as const;
export const EXAMPLE_VALUES: Record<string, string> = { prenom: 'Camille', nom: 'Exemple', club: 'Club de démonstration', 'telephone-club': '00 00 00 00 00', 'adresse-club': 'Adresse fictive', 'url-rdv-club': 'https://example.test/rendez-vous', 'url-club': 'https://example.test', 'prenom-commercial': 'Alex', 'rdv-date': '01/12/2026', 'rdv-heure': '10:00', date: '01/12/2026', heure: '10:00', prix: '39,90 €' };
export function renderMessage(text: string, values: Record<string, string>): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const result = text.replace(/%([a-zA-Z0-9_-]+)%/g, (tag, key: string) => {
    if (!MESSAGE_VARIABLES.includes(key as typeof MESSAGE_VARIABLES[number]) || !values[key]?.trim()) { missing.add(key); return tag; }
    return values[key];
  });
  return { text: result, missing: [...missing] };
}
export function validateMessage(message: LeadMessage): string[] {
  const errors: string[] = [];
  if (!message.name.trim() || message.name.length > 120) errors.push('Indiquez un nom de 1 à 120 caractères.');
  if (!['email', 'sms', 'whatsapp'].includes(message.channel)) errors.push('Canal inconnu.');
  if (!message.body.trim() || message.body.length > 20000) errors.push('Renseignez un message de 1 à 20 000 caractères.');
  if (message.subject.length > 200 || /[\r\n]/.test(message.subject) || (message.channel === 'email' ? !message.subject.trim() : !!message.subject)) errors.push('L’objet est requis uniquement pour les emails (200 caractères maximum).');
  const unknown = renderMessage(message.subject + '\n' + message.body, EXAMPLE_VALUES).missing;
  if (unknown.length) errors.push(`Variables inconnues : ${unknown.join(', ')}.`);
  const layout = message.emailLayout;
  if (layout) {
    let validUrl = !layout.buttonUrl;
    try { const url = new URL(layout.buttonUrl); validUrl = url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !/[\s<>"'\\]/.test(layout.buttonUrl); } catch { /* Invalid URL remains refused. */ }
    if (message.channel !== 'email' || layout.heading.length > 300 || layout.footer.length > 2000 || layout.buttonLabel.length > 120 || layout.buttonUrl.length > 2000 || !/^[A-Za-z0-9 -]{1,80}$/.test(layout.font) || (!!layout.buttonLabel.trim() !== !!layout.buttonUrl) || !validUrl) errors.push('Présentation email invalide : utilisez un bouton nommé avec une adresse HTTPS sans identifiant.');
    if (renderMessage(layout.heading + layout.buttonLabel + layout.footer, EXAMPLE_VALUES).missing.length) errors.push('Variable inconnue dans la présentation email.');
  }
  return errors;
}
/** Transport estimate only; tags must be expanded first. Never a provider invoice. */
export function estimateSms(text: string): { encoding: string; units: number; segments: number } {
  const basic = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const extended = '^{}\\[~]|€\f';
  const gsm = [...text].every(c => basic.includes(c) || extended.includes(c));
  const units = gsm ? [...text].reduce((n, c) => n + (extended.includes(c) ? 2 : 1), 0) : text.length;
  const single = gsm ? 160 : 70; const multipart = gsm ? 153 : 67;
  return { encoding: gsm ? 'GSM-7' : 'Unicode', units, segments: units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multipart) };
}
