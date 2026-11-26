import type { ApiAuthContext } from './clientApi';
export interface RhMessages {
  actorId: string; clubId: string; channel: 'internal';
  recipients: { id: string; name: string }[];
  messages: { id: string; subject: string; body: string; createdAt: string; recipientCount: number;
    receipts: { employeeId: string; employeeName: string; read: boolean; readAt: string | null }[] }[];
  nextCursor: string | null;
}
export interface CalendarStatus { actorId: string; enabled: boolean; issued: boolean; clubIds: string[]; createdAt: string | null }
export interface CalendarLink { actorId: string; relativeUrl: string; clubIds: string[]; createdAt: string }
export interface RhPublication { operationId: string; subject: string; body: string; recipientIds: string[] }
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(i => typeof i === 'string');
const clubs = (x: unknown) => strings(x) && x.every(c => ['beynost', 'carre-de-soie'].includes(c)) && new Set(x).size === x.length;
const dated = (x: unknown) => typeof x === 'string' && Number.isFinite(Date.parse(x));
export function validateMessages(value: unknown, actor: string, club: string): RhMessages {
  if (!object(value) || value.actorId !== actor || value.clubId !== club || value.channel !== 'internal' ||
    !Array.isArray(value.recipients) || !value.recipients.every(r => object(r) && typeof r.id === 'string' && typeof r.name === 'string') ||
    !Array.isArray(value.messages) || !value.messages.every(m => object(m) && ['id','subject','body'].every(k => typeof m[k] === 'string') && dated(m.createdAt) &&
      Number.isSafeInteger(m.recipientCount) && Number(m.recipientCount) > 0 && Array.isArray(m.receipts) && m.receipts.every(r => object(r) &&
        typeof r.employeeId === 'string' && typeof r.employeeName === 'string' && typeof r.read === 'boolean' && (r.readAt === null || dated(r.readAt)))) ||
    !(value.nextCursor === null || typeof value.nextCursor === 'string')) throw new Error('Les messages reçus ne correspondent pas à votre compte ou sont incomplets.');
  return value as unknown as RhMessages;
}
export function validateCalendar(value: unknown, actor: string, issued = false): CalendarStatus | CalendarLink {
  if (!object(value) || value.actorId !== actor || !clubs(value.clubIds)) throw new Error('Calendrier personnel indisponible.');
  if (issued) {
    if (typeof value.relativeUrl !== 'string' || !/^\/api\/calendar\/[a-f0-9]{64}\.ics$/.test(value.relativeUrl) || !dated(value.createdAt) || !(value.clubIds as string[]).length)
      throw new Error('Le lien du calendrier reçu est invalide.');
  } else if (typeof value.enabled !== 'boolean' || typeof value.issued !== 'boolean' || !(value.createdAt === null || dated(value.createdAt))) throw new Error('État du calendrier incomplet.');
  return value as unknown as CalendarStatus | CalendarLink;
}
async function request(auth: ApiAuthContext, path: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const token = auth.token || (window.sessionStorage.getItem('cfos_bearer_actor_id') === auth.actorId ? window.sessionStorage.getItem('cfos_bearer_token') : null);
  if (!token) throw new Error('Reconnectez-vous pour continuer.');
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', signal,
    headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(object(value) && typeof value.error === 'string' ? value.error : 'L’opération n’a pas été confirmée. Réessayez.');
  return value;
}
export async function requestRhMessages(auth: ApiAuthContext, club: string, command?: RhPublication, before?: string, signal?: AbortSignal) {
  return validateMessages(await request(auth, '/api/hr/communications/' + encodeURIComponent(club) + (before ? '?before=' + encodeURIComponent(before) : ''), command, signal), auth.actorId, club);
}
export async function requestCalendarStatus(auth: ApiAuthContext, signal?: AbortSignal) {
  return validateCalendar(await request(auth, '/api/me/calendar-link', undefined, signal), auth.actorId) as CalendarStatus;
}
export async function issueCalendarLink(auth: ApiAuthContext, clubIds: string[]) {
  return validateCalendar(await request(auth, '/api/me/calendar-link', {clubIds}), auth.actorId, true) as CalendarLink;
}
