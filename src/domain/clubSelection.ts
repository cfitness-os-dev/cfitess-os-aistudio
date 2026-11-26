import type { ClubId } from '../types/cfos';
type ClubStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function clubStorage(): ClubStorage | undefined { try { return window.localStorage; } catch { return undefined; } }
const key = (actor: string) => 'cfos_active_club_v1:' + encodeURIComponent(actor);
export function authorizedClub(candidate: unknown, allowed: readonly ClubId[], preferred: ClubId): ClubId {
  if ((candidate === 'beynost' || candidate === 'carre-de-soie') && allowed.includes(candidate)) return candidate;
  return allowed.includes(preferred) ? preferred : allowed[0] ?? preferred;
}
export function readClubSelection(storage: ClubStorage | undefined, actor: string, allowed: readonly ClubId[], preferred: ClubId): ClubId {
  try { return authorizedClub(storage?.getItem(key(actor)), allowed, preferred); }
  catch { return authorizedClub(undefined, allowed, preferred); }
}
export function rememberClubSelection(storage: ClubStorage | undefined, actor: string, club: ClubId): void {
  try { storage?.setItem(key(actor), club); } catch { /* Storage is optional; server rights still apply. */ }
}
