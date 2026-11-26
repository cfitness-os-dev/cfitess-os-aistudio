import { useEffect, useRef, useState } from 'react';
import type { ApiAuthContext } from '../domain/clientApi';
import { clientApi } from '../domain/clientApi';
import { issueCalendarLink, requestCalendarStatus, type CalendarStatus } from '../domain/hrCollaboration';
import { useCfos } from '../context/CfosContext';
export function PersonalCalendarPanel({ auth, enabled, unsaved }: {auth: ApiAuthContext; enabled: boolean; unsaved: boolean}) {
  const { authorizedClubIds } = useCfos();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  useEffect(() => {
    const abort = new AbortController(); setUrl(''); setStatus(null); setError(''); setNotice('');
    requestCalendarStatus(auth, abort.signal).then(value => {
      setStatus(value); setSelected(value.clubIds.length ? value.clubIds.filter(c => authorizedClubIds.includes(c as typeof authorizedClubIds[number])) : [...authorizedClubIds]);
    }).catch(e => {if (!abort.signal.aborted) setError(e.message);});
    return () => abort.abort();
  }, [auth.actorId, auth.token, enabled, authorizedClubIds.join(','), attempt]);
  async function act(revoke: boolean) {
    if (pending.current || unsaved) return; pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (revoke) { await clientApi.revokeCalendarToken(auth); setUrl(''); setStatus(p => p ? {...p, issued: false, clubIds: [], createdAt: null} : p); setNotice('Lien révoqué. Il ne permet plus de consulter votre calendrier.'); }
      else { const result = await issueCalendarLink(auth, selected); setUrl(new URL(result.relativeUrl, window.location.origin).href);
        setStatus({actorId: auth.actorId, enabled:true, issued:true, clubIds:result.clubIds, createdAt:result.createdAt}); setNotice('Nouveau lien créé. Tout ancien lien est invalidé.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Opération non confirmée.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="space-y-3 text-sm min-w-0">
    <p className="cf-muted">Vos horaires publiés et vos absences validées, de trois mois passés à un an à venir. Les motifs d’absence restent confidentiels. Les demi-journées utilisent midi comme limite.</p>
    <p className="cf-muted">Ce lien privé donne accès à votre planning sans connexion. Conservez-le confidentiel. Le révoquer bloque les prochaines consultations ; les événements déjà téléchargés restent dans votre agenda.</p>
    {error && <div><p role="alert" className="text-rose-300">{error}</p><button className="cf-card-secondary p-2 rounded-lg" disabled={busy} onClick={() => setAttempt(p => p + 1)}>Réessayer le chargement</button></div>}
    {notice && <p role="status" className="text-emerald-300">{notice}</p>}
    {unsaved && <p className="text-amber-300">Enregistrez vos préférences avant de gérer ce lien.</p>}
    {!status && !error && <p>Chargement du calendrier…</p>}
    {status && <><fieldset disabled={busy || unsaved || !status.enabled} className="space-y-2"><legend className="font-semibold">Clubs inclus dans mon calendrier</legend>
      {authorizedClubIds.map(club => <label key={club} className="flex gap-2"><input type="checkbox" checked={selected.includes(club)} onChange={e => setSelected(p => e.target.checked ? [...p,club] : p.filter(c => c !== club))} />{club === 'beynost' ? 'Beynost' : 'Carré de Soie'}</label>)}
      <button disabled={!selected.length} className="cf-card-secondary rounded-lg p-3 disabled:opacity-50" onClick={() => void act(false)}>{status.issued ? 'Renouveler le lien et invalider l’ancien' : 'Créer mon lien privé'}</button>
    </fieldset>
    {!status.enabled && <p>Calendrier désactivé. Activez-le ci-dessus et enregistrez vos préférences.</p>}
    {url && <div className="space-y-2"><label className="block">Mon lien privé<input aria-label="Mon lien privé" className="cf-input p-2 w-full min-w-0" readOnly value={url} /></label><p className="cf-muted text-xs">Copiez ce lien dans la fonction « Ajouter un calendrier par URL » de votre agenda. En local, le lien fonctionne uniquement sur cet ordinateur ; l’abonnement externe nécessite une adresse stable et accessible.</p>
      <a className="text-violet-300 underline inline-block" href={url} referrerPolicy="no-referrer">Télécharger mon calendrier</a></div>}
    {status.issued && !url && <p className="cf-muted">Un lien est actif. Pour protéger sa confidentialité, il n’est pas réaffiché après fermeture. Renouvelez-le si vous ne l’avez plus.</p>}
    {status.issued && <button disabled={busy || unsaved} className="cf-card-secondary rounded-lg p-3 text-amber-300 disabled:opacity-50" onClick={() => void act(true)}>Révoquer ce lien</button>}</>}
  </div>;
}
