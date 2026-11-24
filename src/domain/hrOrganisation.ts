import type { Organization, RoleProfile, Site, Team, Position } from './types';
import type { ApiAuthContext } from './clientApi';

export interface HrOrganisation {
  demoMode: boolean; actorId: string; siteId: string; revision: string; site: Site; teams: Team[]; positions: Position[];
  organization: Organization | null; profiles: RoleProfile[];
  capabilities: { manageTeams: boolean; editClub: boolean; editOrganization: boolean; editProfiles: boolean };
}
export type HrOrganisationCommand =
  | { action: 'save_team'; id: string | null; name: string }
  | { action: 'remove_team'; id: string }
  | { action: 'save_position'; id: string | null; label: string; color: string; defaultBreakMinutes: number; active: boolean }
  | { action: 'save_club'; name: string; address: string; city: string; siret: string }
  | ({ action: 'save_organization' } & Omit<Organization, 'id'>)
  | { action: 'save_profile'; profileId: string; scopeSelected: string; checkedMap: Record<string, boolean> };

export function validateHrOrganisation(value: unknown, actor: string, site: string): HrOrganisation {
  if (!value || typeof value !== 'object') throw new Error('Réponse RH incomplète.');
  const row = value as Partial<HrOrganisation>;
  if (row.actorId !== actor || row.siteId !== site || row.site?.id !== site)
    throw new Error('Réponse reçue pour un autre compte ou un autre club.');
  const strings=(object:unknown, keys:string[])=> !!object && typeof object==='object' &&
    keys.every(key=>typeof Reflect.get(object,key)==='string');
  const uniqueIds=(items:Array<{id:string}>)=>new Set(items.map(item=>item.id)).size===items.length;
  const nullableBoolean=(value:unknown)=>value===null||typeof value==='boolean';
  if (typeof row.demoMode !== 'boolean' || typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision) ||
      !strings(row.site,['id','name','address','city','siret','timezone']) || !row.site?.settings ||
      !Array.isArray(row.teams) || !row.teams.every(t => t?.siteId === site && strings(t,['id','name'])) || !uniqueIds(row.teams) ||
      !Array.isArray(row.positions) || !row.positions.every(p => p?.siteId === site && strings(p,['id','label','color']) &&
        Number.isFinite(p.defaultBreakMinutes) && p.defaultBreakMinutes>=0 && typeof p.active==='boolean') || !uniqueIds(row.positions) ||
      !Array.isArray(row.profiles) || !row.profiles.every(p => strings(p,['id','name','scopeSelected']) &&
        typeof p.scopeEditable==='boolean' && Array.isArray(p.scopeOptions) && p.scopeOptions.every(s=>typeof s==='string') &&
        Array.isArray(p.rows) && p.rows.every(r=>strings(r,['actionId','label','group']) && typeof r.exposed==='boolean' &&
          typeof r.editableControl==='boolean' && nullableBoolean(r.checked) && nullableBoolean(r.disabled))) || !uniqueIds(row.profiles) ||
      !row.capabilities || !['manageTeams','editClub','editOrganization','editProfiles'].every(k =>
        typeof Reflect.get(row.capabilities!, k) === 'boolean') ||
      !(row.organization === null || (strings(row.organization,['id','name','legalName','siren','vatNumber','sector','contactEmail','billingNotice']) &&
        Number.isFinite(row.organization?.mealAllowanceEur))))
    throw new Error('Les réglages ou autorisations reçus sont incomplets.');
  return row as HrOrganisation;
}
export async function requestHrOrganisation(auth: ApiAuthContext, command?: HrOrganisationCommand, revision?: string, signal?: AbortSignal): Promise<HrOrganisation> {
  const owner = window.sessionStorage.getItem('cfos_bearer_actor_id');
  const token = auth.token || (owner === auth.actorId ? window.sessionStorage.getItem('cfos_bearer_token') : null);
  if (!token) throw new Error('Reconnectez-vous pour consulter les réglages RH.');
  const response = await fetch('/api/hr/organisation/' + encodeURIComponent(auth.siteId), {
    method: command ? 'POST' : 'GET', signal,
    headers: { Authorization: 'Bearer ' + token, ...(command ? { 'Content-Type': 'application/json' } : {}) },
    body: command ? JSON.stringify({ expectedRevision: revision, command }) : undefined,
  });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
    ? value.error : 'Impossible de charger ou enregistrer les réglages RH.');
  return validateHrOrganisation(value, auth.actorId, auth.siteId);
}
