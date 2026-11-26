import { useEffect, useRef, useState } from 'react';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import type { ApiAuthContext } from '../../domain/clientApi';
import { requestRhMessages, type RhMessages } from '../../domain/hrCollaboration';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
const button = 'cf-card-secondary rounded-lg px-3 py-2 text-sm disabled:opacity-50';
export function HrCommunicationsView({ auth, clubId }: {auth: ApiAuthContext; clubId: string}) {
  const [data, setData] = useState<RhMessages | null>(null);
  const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const submitting = useRef(false); const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  useLeadDraftGuard(!!subject || !!body || !!selected.length);
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError(''); setNotice(''); setSubject(''); setBody(''); setSelected([]); setSearch(''); operation.current = null;
    requestRhMessages(auth, clubId, undefined, undefined, abort.signal).then(setData).catch(e => { if (!abort.signal.aborted) setError(String(e.message)); });
    return () => abort.abort();
  }, [auth.actorId, auth.token, clubId]);
  async function load(before?: string) {
    setBusy(true); setError(''); try { setData(await requestRhMessages(auth, clubId, undefined, before)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible.'); } finally { setBusy(false); }
  }
  async function publish() {
    if (submitting.current || !data) return; submitting.current = true; setBusy(true); setError(''); setNotice('');
    const recipientIds = [...selected].sort(); const fingerprint = JSON.stringify([subject.trim(), body.trim(), recipientIds]);
    if (operation.current?.fingerprint !== fingerprint) operation.current = {fingerprint, id: crypto.randomUUID()};
    try {
      setData(await requestRhMessages(auth, clubId, {subject, body, recipientIds, operationId: operation.current.id}));
      setSubject(''); setBody(''); setSelected([]); operation.current = null;
      setNotice('Message enregistré et disponible dans les notifications des destinataires.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Publication non confirmée. Votre saisie est conservée.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  const visible = data?.recipients.filter(r => r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <div className="space-y-5 min-w-0">
    <header className="cf-card p-5"><h2 className="text-xl font-bold flex gap-2 items-center"><MessageSquare />Communication RH</h2>
      <p className="cf-muted text-sm mt-2">Partagez une information avec les collaborateurs de ce club. Ils la retrouvent dans Mon compte → Accueil → Mes notifications. Aucun e-mail ni SMS n’est envoyé.</p></header>
    {error && <div className="cf-card p-4 space-y-2"><p role="alert" className="text-rose-300">{error}</p><button disabled={busy} className={button} onClick={() => void load()}>Réessayer le chargement</button></div>}
    {notice && <p role="status" className="cf-card p-4 text-emerald-300">{notice}</p>}
    {!data && !error && <p role="status">Chargement des messages…</p>}
    {data && <><section className="cf-card p-5 space-y-4"><h3 className="font-bold">Nouveau message</h3>
      <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold text-sm">Destinataires ({selected.length} sélectionné{selected.length > 1 ? 's' : ''})</legend>
        <input aria-label="Rechercher un destinataire" className="cf-input w-full p-2" placeholder="Rechercher un collaborateur" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setSelected([...new Set([...selected,...visible.map(r => r.id)])])}>Sélectionner les résultats</button><button className={button} onClick={() => setSelected([])}>Tout désélectionner</button></div>
        <div className="max-h-52 overflow-y-auto grid sm:grid-cols-2 gap-2">{visible.map(r => <label key={r.id} className="flex items-center gap-2 cf-card-secondary p-3 rounded-lg"><input type="checkbox" checked={selected.includes(r.id)} onChange={e => setSelected(p => e.target.checked ? [...p,r.id] : p.filter(id => id !== r.id))} />{r.name}</label>)}</div>
        {!visible.length && <p className="cf-muted">Aucun destinataire disponible.</p>}
        <label className="block text-sm">Objet<input className="cf-input w-full p-3 mt-1" maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} /></label>
        <label className="block text-sm">Message<textarea className="cf-input w-full p-3 mt-1" rows={6} maxLength={10000} value={body} onChange={e => setBody(e.target.value)} /></label>
        <button disabled={!selected.length || !subject.trim() || !body.trim()} onClick={() => void publish()} className="cf-brand-gradient text-white rounded-lg p-3 flex items-center gap-2 disabled:opacity-50"><Send size={16} />Publier le message interne</button>
      </fieldset></section>
      <section className="cf-card p-5 space-y-4"><div className="flex flex-wrap gap-3 items-center justify-between"><h3 className="font-bold">Mes messages envoyés dans ce club</h3><button disabled={busy} className={button} onClick={() => void load()}><RefreshCw size={14} className="inline mr-2" />Actualiser les lectures</button></div>
        {!data.messages.length && <p className="cf-muted">Aucun message envoyé sur cette page.</p>}
        {data.messages.map(m => <article key={m.id} className="cf-card-secondary rounded-xl p-4 space-y-2 min-w-0"><h4 className="font-bold break-words">{m.subject}</h4><p className="cf-muted text-xs">{new Date(m.createdAt).toLocaleString('fr-FR')} · {m.recipientCount} destinataire(s)</p><p className="whitespace-pre-wrap break-words">{m.body}</p>
          <details><summary className="cursor-pointer text-sm">Lectures : {m.receipts.filter(r => r.read).length} sur {m.receipts.length} destinataire(s) actuellement consultables</summary><ul className="text-sm mt-2 space-y-1">{m.receipts.map(r => <li key={r.employeeId}>{r.employeeName} — {r.read ? 'Lu' + (r.readAt ? ' le ' + new Date(r.readAt).toLocaleString('fr-FR') : '') : 'Non lu'}</li>)}</ul></details></article>)}
        {data.nextCursor && <button disabled={busy} className={button} onClick={() => void load(data.nextCursor!)}>Messages plus anciens</button>}
      </section></>}
  </div>;
}
