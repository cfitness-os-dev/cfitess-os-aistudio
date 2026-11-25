import type { ClubId } from '../types/cfos';

export interface HeitzRecoveryLinks {
  actorId: string; caseId: string; clubId: ClubId; revision: string;
  configured: boolean;
  urls: null | { financial: string; documents: string; subscriptions: string };
  notice: string;
}
export function validateHeitzRecoveryLinks(value: unknown, actor: string, id: string, club: ClubId, revision: string): HeitzRecoveryLinks {
  const v = value as HeitzRecoveryLinks;
  if (!v || v.actorId !== actor || v.caseId !== id || v.clubId !== club || v.revision !== revision || typeof v.configured !== 'boolean' || typeof v.notice !== 'string' || (!v.configured && v.urls !== null) || (v.configured && !v.urls)) throw new Error('Les accès reçus ne correspondent pas au dossier. Actualisez-le.');
  if (v.urls) {
    const client = /^rec-hz-hz-([1-9][0-9]*)$/.exec(id)?.[1];
    if (!client || !Number.isSafeInteger(Number(client))) throw new Error('Identité Heitz non confirmée.');
    let base = '';
    for (const [key, screen] of [['financial', 'financial'], ['documents', 'document'], ['subscriptions', 'subscriptions']] as const) {
      const raw = v.urls[key];
      if (typeof raw !== 'string' || /[\s\\]/.test(raw)) throw new Error('Adresse Heitz non confirmée.');
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || !/^\/app\/heitz\/[1-9][0-9]*\/crm\/$/.test(url.pathname) || url.hash !== `#/app/client/${client}/${screen}`) throw new Error('Adresse Heitz non confirmée.');
      const root = url.origin + url.pathname;
      if (base && base !== root) throw new Error('Les accès ne ciblent pas le même club Heitz.');
      base = root;
    }
  }
  return v;
}
export async function fetchHeitzRecoveryLinks(actor: string, id: string, club: ClubId, revision: string, signal: AbortSignal): Promise<HeitzRecoveryLinks> {
  const token = window.sessionStorage.getItem('cfos_bearer_token');
  if (!token || window.sessionStorage.getItem('cfos_bearer_actor_id') !== actor) throw new Error('Reconnectez-vous pour consulter les accès Heitz.');
  const response = await fetch(`/api/recovery/cases/${encodeURIComponent(id)}/heitz-access-links?revision=${encodeURIComponent(revision)}`, { signal, headers: { Authorization: `Bearer ${token}` } });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Les accès Heitz ne sont pas disponibles.');
  return validateHeitzRecoveryLinks(value, actor, id, club, revision);
}
