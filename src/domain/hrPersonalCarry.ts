import type { ClubId } from '../types/cfos';

export interface PersonalCarryItem {
  id: string; sourceStart: string; sourceEnd: string; initialDays: number;
  reviewedRemainingDays: number; availableUntil: string; status: 'open' | 'closed';
  reviewedAt: string; balanceChanged: boolean; deadlinePassed: boolean;
}
export interface PersonalCarrySnapshot {
  actorId: string; siteId: string; asOf: string; priorBalance: number; items: PersonalCarryItem[];
}
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const days = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
export function validatePersonalCarry(value: unknown, actorId: string, club: ClubId): PersonalCarrySnapshot {
  const v = value as PersonalCarrySnapshot;
  const allowed = ['id','sourceStart','sourceEnd','initialDays','reviewedRemainingDays','availableUntil','status','reviewedAt','balanceChanged','deadlinePassed'];
  if (!v || v.actorId !== actorId || v.siteId !== (club === 'beynost' ? 'club-beynost' : 'club-carre-soie') || !date(v.asOf) || !days(v.priorBalance) || !Array.isArray(v.items) || !v.items.every(r => r && Object.keys(r).every(k => allowed.includes(k)) && typeof r.id === 'string' && date(r.sourceStart) && date(r.sourceEnd) && r.sourceStart <= r.sourceEnd && date(r.availableUntil) && r.availableUntil >= r.sourceEnd && days(r.initialDays) && r.initialDays > 0 && days(r.reviewedRemainingDays) && r.reviewedRemainingDays <= r.initialDays && ['open','closed'].includes(r.status) && (r.status !== 'closed' || r.reviewedRemainingDays === 0) && typeof r.reviewedAt === 'string' && Number.isFinite(Date.parse(r.reviewedAt)) && typeof r.balanceChanged === 'boolean' && typeof r.deadlinePassed === 'boolean') || new Set(v.items.map(r => r.id)).size !== v.items.length)
    throw new Error('Les reports reçus ne correspondent pas à votre espace. Actualisez les données.');
  return v;
}
export async function fetchPersonalCarry(actorId: string, club: ClubId, signal?: AbortSignal): Promise<PersonalCarrySnapshot> {
  const token = window.sessionStorage.getItem('cfos_bearer_token');
  if (!token || window.sessionStorage.getItem('cfos_bearer_actor_id') !== actorId) throw new Error('Reconnectez-vous pour consulter vos reports.');
  const response = await fetch('/api/me/carryovers/' + club, { signal, headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) throw new Error('Vos reports ne sont pas disponibles. Réessayez ou contactez votre responsable.');
  return validatePersonalCarry(await response.json(), actorId, club);
}
