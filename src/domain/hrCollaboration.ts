import { notificationsChanged } from './rhNotifications';
import type { ApiAuthContext } from './clientApi';
export interface RhRecipient { id: string; name: string; teams: {id: string; name: string}[]; fileStatus: string }
export interface RhMessages {
  actorId: string; clubId: string; channel: 'internal';
  recipients: RhRecipient[];
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
    !Array.isArray(value.recipients) || !value.recipients.every(r => object(r) && typeof r.id === 'string' && typeof r.name === 'string' && typeof r.fileStatus === 'string' && Array.isArray(r.teams) && r.teams.every(t => object(t) && typeof t.id === 'string' && typeof t.name === 'string')) ||
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
  const result = validateMessages(await request(auth, '/api/hr/communications/' + encodeURIComponent(club) + (before ? '?before=' + encodeURIComponent(before) : ''), command, signal), auth.actorId, club);
  if(command?.recipientIds.includes(auth.actorId)) notificationsChanged(auth.actorId,club);
  return result;
}
export async function requestCalendarStatus(auth: ApiAuthContext, signal?: AbortSignal) {
  return validateCalendar(await request(auth, '/api/me/calendar-link', undefined, signal), auth.actorId) as CalendarStatus;
}
export async function issueCalendarLink(auth: ApiAuthContext, clubIds: string[]) {
  return validateCalendar(await request(auth, '/api/me/calendar-link', {clubIds}), auth.actorId, true) as CalendarLink;
}

export function filterRhRecipients(recipients: RhRecipient[], search: string, team: string, incomplete: boolean): RhRecipient[] {
  const needle=search.trim().toLocaleLowerCase('fr-FR');
  return recipients.filter(r => r.name.toLocaleLowerCase('fr-FR').includes(needle) && (!team || r.teams.some(t => t.id===team)) && (!incomplete || r.fileStatus!=='complete'));
}

export interface RhScheduledMessage {
  id: string; subject: string; body: string; scheduledAt: string; createdAt: string;
  status: 'scheduled' | 'published' | 'cancelled' | 'blocked'; finishedAt: string | null;
  publishedMessageId: string | null; reason: string | null; recipientCount: number;
}
export interface RhSchedules { actorId: string; clubId: string; schedulerEnabled: boolean; scheduledMessages: RhScheduledMessage[]; nextCursor: string | null }
export function validateSchedules(value: unknown, actor: string, club: string): RhSchedules {
  if (!object(value) || value.actorId !== actor || value.clubId !== club || typeof value.schedulerEnabled !== 'boolean' ||
    !Array.isArray(value.scheduledMessages) || value.scheduledMessages.length > 50 ||
    new Set(value.scheduledMessages.map(r => object(r) ? r.id : null)).size !== value.scheduledMessages.length ||
    !value.scheduledMessages.every(r => object(r) &&
      ['id','subject','body'].every(k => typeof r[k] === 'string' && r[k]) && dated(r.scheduledAt) && dated(r.createdAt) &&
      ['scheduled','published','cancelled','blocked'].includes(String(r.status)) &&
      (r.finishedAt === null || dated(r.finishedAt)) &&
      (r.publishedMessageId === null || typeof r.publishedMessageId === 'string') &&
      (r.reason === null || typeof r.reason === 'string') &&
      Number.isSafeInteger(r.recipientCount) && Number(r.recipientCount) >= 1 && Number(r.recipientCount) <= 200 &&
      (r.status === 'scheduled' ? r.finishedAt === null && r.publishedMessageId === null :
        dated(r.finishedAt) && (r.status === 'published' ? typeof r.publishedMessageId === 'string' : r.publishedMessageId === null))) ||
    !(value.nextCursor === null || typeof value.nextCursor === 'string'))
    throw new Error('Les programmations reçues ne correspondent pas à votre compte ou sont incomplètes.');
  return value as unknown as RhSchedules;
}
export function scheduledInstant(local: string, now = Date.now()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  const date = new Date(local);
  if (!match || !Number.isFinite(date.getTime()) ||
    [date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes()].some((v,i) => v !== Number(match[i+1])) ||
    date.getTime() < now + 60_000 || date.getTime() > now + 366*86400_000)
    throw new Error('Choisissez une date valide dans au moins une minute et dans les douze prochains mois.');
  return date.toISOString();
}
export async function requestRhSchedules(auth: ApiAuthContext, club: string, before?: string, signal?: AbortSignal) {
  return validateSchedules(await request(auth, '/api/hr/communications/' + encodeURIComponent(club) + '/scheduled' +
    (before ? '?before=' + encodeURIComponent(before) : ''), undefined, signal), auth.actorId, club);
}
export async function scheduleRhMessage(auth: ApiAuthContext, club: string, command: RhPublication & {scheduledAt: string}) {
  return validateSchedules(await request(auth, '/api/hr/communications/' + encodeURIComponent(club) + '/scheduled', command), auth.actorId, club);
}
export async function cancelRhSchedule(auth: ApiAuthContext, club: string, id: string) {
  return validateSchedules(await request(auth, '/api/hr/communications/' + encodeURIComponent(club) + '/scheduled/' + encodeURIComponent(id) + '/cancel', {}), auth.actorId, club);
}
