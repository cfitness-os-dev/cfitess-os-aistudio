import { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import type { ApiAuthContext } from '../../domain/clientApi';
import { requestRhMessages, requestRhSchedules, scheduleRhMessage, cancelRhSchedule, scheduledInstant, filterRhRecipients, type RhMessages, type RhSchedules } from '../../domain/hrCollaboration';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
const button = 'cf-card-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50';
export function HrCommunicationsView({ auth, clubId }: {auth: ApiAuthContext; clubId: string}) {
  const [data, setData] = useState<RhMessages | null>(null);
  const [schedules, setSchedules] = useState<RhSchedules | null>(null);
  const [scheduleError, setScheduleError] = useState('');
  const [timing, setTiming] = useState<'now'|'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [team, setTeam] = useState(''); const [incomplete, setIncomplete] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const submitting = useRef(false); const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  useLeadDraftGuard(!!subject || !!body || !!selected.length || !!scheduledAt);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError(''); setNotice(''); setSubject(''); setBody(''); setSelected([]); setSearch(''); setTeam(''); setIncomplete(false); operation.current = null; setTiming('now'); setScheduledAt(''); setCancelId(null); setSchedules(null); setScheduleError('');
    requestRhSchedules(auth, clubId, undefined, abort.signal).then(setSchedules).catch(e => { if (!abort.signal.aborted) setScheduleError(String(e.message)); });
    requestRhMessages(auth, clubId, undefined, undefined, abort.signal).then(setData).catch(e => { if (!abort.signal.aborted) setError(String(e.message)); });
    return () => abort.abort();
  }, [auth.actorId, auth.token, clubId]);
  async function load(before?: string) {
    if (submitting.current) return; submitting.current = true;
    setBusy(true); setError(''); try { setData(await requestRhMessages(auth, clubId, undefined, before)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible.'); } finally { submitting.current = false; setBusy(false); }
  }
  async function publish() {
    if (submitting.current || !data) return; submitting.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const instant = timing === 'later' ? scheduledInstant(scheduledAt) : null;
      const recipientIds = [...selected].sort(); const fingerprint = JSON.stringify([subject.trim(), body.trim(), recipientIds, instant]);
      if (operation.current?.fingerprint !== fingerprint) operation.current = {fingerprint, id: crypto.randomUUID()};
      const command = {subject, body, recipientIds, operationId: operation.current.id};
      if (instant) {
        const saved = await scheduleRhMessage(auth, clubId, {...command, scheduledAt: instant});
        setSchedules(saved);
        setScheduleError('');
        setNotice(saved.schedulerEnabled ? 'Message programmé. Il sera publié dans les notifications internes à la date prévue, après vérification des droits et des destinataires.' : 'Message enregistré. Les publications automatiques sont actuellement suspendues ; il reste en attente.');
      } else {
        setData(await requestRhMessages(auth, clubId, command));
        setNotice('Message enregistré et disponible dans les notifications des destinataires.');
      }
      setSubject(''); setBody(''); setSelected([]); setScheduledAt(''); setTiming('now'); operation.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : 'Publication non confirmée. Votre saisie est conservée.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function loadSchedules(before?: string) {
    if (submitting.current) return; submitting.current = true; setBusy(true); setScheduleError('');
    try { setSchedules(await requestRhSchedules(auth, clubId, before)); }
    catch (e) { setScheduleError(e instanceof Error ? e.message : 'Chargement des programmations impossible.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function cancelSchedule(id: string) {
    if (submitting.current) return; submitting.current = true; setBusy(true); setScheduleError(''); setNotice('');
    try {
      setSchedules(await cancelRhSchedule(auth, clubId, id)); setCancelId(null);
      setNotice('Programmation annulée. Ce message ne sera pas publié.');
    } catch(e) { setScheduleError(e instanceof Error ? e.message : 'Annulation non confirmée.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  const statusLabel = {scheduled:'Programmé', published:'Publié', cancelled:'Annulé', blocked:'À vérifier'};
  const formatDate = (date: string) => new Date(date).toLocaleString('fr-FR', {dateStyle:'medium',timeStyle:'short'});
  const visible = filterRhRecipients(data?.recipients ?? [], search, team, incomplete);
  const teams = [...new Map(data?.recipients.flatMap(r => r.teams).map(t => [t.id,t]) ?? []).values()].sort((a,b) => a.name.localeCompare(b.name,'fr'));
  const selectedRecipients = data?.recipients.filter(r => selected.includes(r.id)) ?? [];
  const hiddenSelected = selectedRecipients.filter(r => !visible.some(v => v.id === r.id)).length;
  return <div className="space-y-5 min-w-0">
    <header className="cf-card p-5"><h2 className="text-xl font-bold flex gap-2 items-center"><MessageSquare />Communication RH</h2>
      <p className="cf-muted text-sm mt-2">Partagez une information avec les collaborateurs de ce club. Ils la retrouvent dans Mon compte → Ma journée → Mes notifications. Aucun e-mail ni SMS n’est envoyé.</p></header>
    {error && <div className="cf-card p-4 space-y-2"><p role="alert" className="text-rose-300">{error}</p><button disabled={busy} className={button} onClick={() => void load()}>Réessayer le chargement</button></div>}
    {notice && <p role="status" className="cf-card p-4 text-emerald-300">{notice}</p>}
    {!data && !error && <p role="status">Chargement des messages…</p>}
    {data && <><section className="cf-card p-5 space-y-4"><div className="flex flex-wrap gap-3 items-center justify-between"><h3 className="font-bold">Mes messages envoyés dans ce club</h3><button disabled={busy} className={button} onClick={() => void load()}><RefreshCw size={14} className="inline mr-2" />Actualiser les lectures</button></div>
        {!data.messages.length && <p className="cf-muted">Aucun message envoyé sur cette page.</p>}
        {data.messages.map(m => <article key={m.id} className="cf-card-secondary rounded-xl p-4 space-y-2 min-w-0"><h4 className="font-bold break-words">{m.subject}</h4><p className="cf-muted text-xs">{new Date(m.createdAt).toLocaleString('fr-FR')} · {m.recipientCount} destinataire(s)</p><p className="whitespace-pre-wrap break-words">{m.body}</p>
          <details><summary className="cursor-pointer text-sm">Lectures : {m.receipts.filter(r => r.read).length} sur {m.receipts.length} destinataire(s) actuellement consultables</summary><ul className="text-sm mt-2 space-y-1">{m.receipts.map(r => <li key={r.employeeId}>{r.employeeName} — {r.read ? 'Lu' + (r.readAt ? ' le ' + new Date(r.readAt).toLocaleString('fr-FR') : '') : 'Non lu'}</li>)}</ul></details></article>)}
        {data.nextCursor && <button disabled={busy} className={button} onClick={() => void load(data.nextCursor!)}>Messages plus anciens</button>}
      </section>
      <section className="cf-card p-5 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between"><h3 className="font-bold">Mes publications programmées</h3><button className={button} disabled={busy} onClick={() => void loadSchedules()}>Actualiser les programmations</button></div>
        {scheduleError && <p role="alert" className="text-rose-300">{scheduleError}</p>}
        {!schedules && !scheduleError && <p role="status">Chargement des programmations…</p>}
        {schedules && !schedules.schedulerEnabled && <p className="text-amber-300 text-sm">Publications automatiques suspendues ; les messages en attente sont conservés.</p>}
        {schedules?.scheduledMessages.length === 0 && <p className="cf-muted">Aucune programmation sur cette page.</p>}
        {schedules?.scheduledMessages.map(m => <article key={m.id} className="cf-card-secondary rounded-xl p-4 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2 justify-between"><h4 className="font-bold break-words">{m.subject}</h4><span className="text-sm">{statusLabel[m.status]}</span></div>
          <p className="cf-muted text-xs">Prévu le {formatDate(m.scheduledAt)} · {m.recipientCount} destinataire(s)</p>
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
          {m.finishedAt && <p className="cf-muted text-xs">Traité le {formatDate(m.finishedAt)}</p>}
          {m.reason && <p role="status" className="text-amber-300 text-sm">{m.reason}</p>}
          {m.status === 'scheduled' && (cancelId === m.id ? <div className="space-y-2"><p>Annuler la publication de « {m.subject} » ?</p><div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={() => void cancelSchedule(m.id)}>Confirmer l’annulation</button><button disabled={busy} className={button} onClick={() => setCancelId(null)}>Garder la programmation</button></div></div> : <button disabled={busy} className={button} onClick={() => setCancelId(m.id)}>Annuler la programmation</button>)}
        </article>)}
        {schedules?.nextCursor && <button disabled={busy} className={button} onClick={() => void loadSchedules(schedules.nextCursor!)}>Programmations plus anciennes</button>}
      </section>
      <details className="cf-card p-5" open={Boolean(subject || body || selected.length || scheduledAt) || undefined}>
        <summary className="cursor-pointer font-bold flex flex-wrap items-center justify-between gap-2">
          <span>Nouveau message</span>
          <span className="text-xs font-normal cf-muted">Déplier pour choisir les destinataires et rédiger</span>
        </summary>
        <div className="mt-4 space-y-4">
      <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold text-sm">Destinataires ({selected.length} sélectionné{selected.length > 1 ? 's' : ''})</legend>
        <input aria-label="Rechercher un destinataire" className="cf-input w-full p-2" placeholder="Rechercher un collaborateur" value={search} onChange={e => setSearch(e.target.value)} />
        <label className="block text-sm">Équipe<select className="cf-input w-full p-2 mt-1" value={team} onChange={e => setTeam(e.target.value)}><option value="">Toutes les équipes autorisées</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={incomplete} onChange={e => setIncomplete(e.target.checked)} />Dossiers RH à compléter ou vérifier uniquement</label>
        <p className="cf-muted text-sm">{visible.length} collaborateur(s) dans les résultats. Les filtres préparent une sélection ; ils ne modifient pas les droits.</p>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setSelected([...new Set([...selected,...visible.map(r => r.id)])])}>Ajouter les résultats</button><button className={button} onClick={() => setSelected(visible.map(r => r.id))}>Utiliser uniquement ces résultats</button><button className={button} onClick={() => setSelected([])}>Tout désélectionner</button></div>
        {hiddenSelected > 0 && <p className="text-amber-300 text-sm">{hiddenSelected} destinataire(s) sélectionné(s) hors des résultats actuels. Vérifiez la liste retenue avant publication.</p>}
        {!!selectedRecipients.length && <details className="cf-card-secondary p-3 rounded-lg"><summary className="cursor-pointer text-sm">Vérifier les {selectedRecipients.length} destinataire(s) retenu(s)</summary><ul className="space-y-2 mt-2">{selectedRecipients.map(r => <li key={r.id} className="flex flex-wrap gap-2 items-center justify-between text-sm"><span>{r.name}</span><button aria-label={'Retirer ' + r.name} className={button} onClick={() => setSelected(p => p.filter(id => id !== r.id))}>Retirer</button></li>)}</ul></details>}
        <div className="max-h-52 overflow-y-auto grid sm:grid-cols-2 gap-2">{visible.map(r => <label key={r.id} className="flex items-center gap-2 cf-card-secondary p-3 rounded-lg"><input type="checkbox" checked={selected.includes(r.id)} onChange={e => setSelected(p => e.target.checked ? [...p,r.id] : p.filter(id => id !== r.id))} /><span>{r.name}{r.teams.length > 0 && <span className="block cf-muted text-xs">{r.teams.map(t => t.name).join(', ')}</span>}</span></label>)}</div>
        {!visible.length && <p className="cf-muted">Aucun destinataire disponible.</p>}
        <label className="block text-sm">Objet<input className="cf-input w-full p-3 mt-1" maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} /></label>
        <label className="block text-sm">Message<textarea className="cf-input w-full p-3 mt-1" rows={6} maxLength={10000} value={body} onChange={e => setBody(e.target.value)} /></label>
        <label className="block text-sm">Publication<select className="cf-input w-full p-2 mt-1" value={timing} onChange={e => setTiming(e.target.value as 'now'|'later')}><option value="now">Maintenant</option><option value="later">À une date choisie</option></select></label>
        {timing === 'later' && <div className="space-y-2">
          <label className="block text-sm">Date et heure de publication<input type="datetime-local" className="cf-input w-full min-w-0 p-2 mt-1" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></label>
          <p className="cf-muted text-xs">Heure de votre appareil ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Dans au moins une minute et dans les douze prochains mois. La liste des destinataires est figée ; leurs droits sont vérifiés à la publication.</p>
          {schedules && !schedules.schedulerEnabled && <p role="alert" className="text-amber-300 text-sm">Les publications programmées sont momentanément suspendues. Vous pouvez enregistrer le message, mais il restera en attente tant que le service n’est pas rétabli.</p>}
        </div>}
        <button disabled={!selected.length || !subject.trim() || !body.trim() || (timing === 'later' && (!scheduledAt || !schedules))} onClick={() => void publish()} className="cf-brand-gradient text-white rounded-lg p-3 flex items-center gap-2 disabled:opacity-50"><Send size={16} />{timing === 'later' ? 'Programmer le message interne' : 'Publier le message interne'}</button>
      </fieldset></div></details></>}
  </div>;
}
