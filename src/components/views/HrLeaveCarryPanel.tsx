import { useEffect, useRef, useState } from 'react';
import type { ClubId } from '../../types/cfos';
import { loadCarry, saveCarry, type CarrySnapshot, type CarryCommand } from '../../domain/hrLeaveCarry';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
const field = 'cf-input w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl';
const button = 'cf-brand-gradient text-white min-h-[44px] px-4 py-2 rounded-xl disabled:opacity-50';
const empty = () => ({ action: 'create' as CarryCommand['action'], id: '', sourceStart: '', sourceEnd: '', days: '', until: '', reference: '', noticeDate: '', medium: 'remise' as 'bulletin' | 'courrier' | 'email' | 'remise', evidence: '', reason: '', confirmed: false });
const actionNames = { create: 'Créer un suivi', reconcile: 'Réévaluer les jours concernés', extend: 'Prolonger une échéance', notice: 'Consigner une information déjà remise', close: 'Clôturer un suivi soldé' };
const displayDate = (value: string) => new Intl.DateTimeFormat('fr-FR', {timeZone: 'Europe/Paris'}).format(new Date(value.length === 10 ? value + 'T12:00:00Z' : value));
const displayTimestamp = (value: string) => new Intl.DateTimeFormat('fr-FR', {dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris'}).format(new Date(value));
const mediumNames: Record<string, string> = {remise: 'Remise en main propre', bulletin: 'Bulletin de paie', courrier: 'Courrier', email: 'Email'};
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, signDisplay: 'auto' });
export function HrLeaveCarryPanel({ actorId, club }: {
    actorId: string;
    club: ClubId;
}) {
    const [data, setData] = useState<CarrySnapshot | null>(null), [employeeId, setEmployeeId] = useState(''), [draft, setDraft] = useState(empty), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const mounted = useRef(true), lock = useRef(false);
    useLeadDraftGuard(dirty);
    const employee = data?.employees.find(e => e.id === employeeId), selected = employee?.cases.find(c => c.record.id === draft.id);
    function adopt(v: CarrySnapshot) { setData(v); setEmployeeId(old => v.employees.some(e => e.id === old) ? old : v.employees.find(e => e.primary)?.id ?? ''); setDraft(empty()); setDirty(false); }
    function change(patch: Partial<ReturnType<typeof empty>>) { setDraft(old => ({ ...old, ...patch })); setDirty(true); setNotice(''); }
    useEffect(() => { mounted.current = true; const controller = new AbortController(); setBusy(true); loadCarry(actorId, club, controller.signal).then(v => { if (!controller.signal.aborted)
        adopt(v); }).catch(e => { if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Chargement impossible.'); }).finally(() => { if (!controller.signal.aborted)
        setBusy(false); }); return () => { mounted.current = false; controller.abort(); }; }, [actorId, club]);
    async function work(action: () => Promise<void>) { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); setNotice(''); try {
        await action();
    }
    catch (e) {
        if (mounted.current)
            setError(e instanceof Error ? e.message : 'Suivi non enregistré.');
    }
    finally {
        lock.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    function discard(action: () => void) { if (confirmLeadDraftNavigation(action))
        action(); }
    return <section className="space-y-4 min-w-0 break-words" aria-label="Suivi des reports exceptionnels">
    <header className="cf-card p-4 space-y-2"><h3 className="font-bold text-lg">Reports exceptionnels de congés</h3><p>Suivez une échéance vérifiée pour des jours déjà présents dans le reliquat. Ce suivi ne crée ni ne supprime de congés ; une échéance passée déclenche une alerte, sans expiration automatique.</p><button className={button} disabled={busy} onClick={() => discard(() => void work(async () => { const v = await loadCarry(actorId, club); if (mounted.current)
        adopt(v); }))}>Actualiser les reports</button></header>
    {error && <p role="alert" className="cf-card p-4">{error}</p>}{notice && <p role="status" className="cf-card p-4 text-emerald-500">{notice}</p>}{!data && busy && <p role="status">Chargement des reports…</p>}
    {data && <>
      <label className="block cf-card p-4">Collaborateur du suivi<select className={field} value={employeeId} disabled={busy} onChange={e => { const id = e.target.value; discard(() => { setEmployeeId(id); setDraft(empty()); setDirty(false); setError(''); setNotice(''); }); }}><option value="">Choisir un collaborateur</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.primary ? '' : ' · club principal différent'}</option>)}</select></label>
      {employee && <>
        <p className="cf-card p-4">Reliquat actuel : {numberFormat.format(employee.priorBalance)} j · Jours faisant l’objet d’un suivi ouvert : {numberFormat.format(employee.protectedDays)} j. Ces quantités ne s’additionnent pas.</p>
        {!employee.primary && <p role="status">Consultez ce dossier ici ; effectuez les changements dans le club principal du collaborateur.</p>}
        <section className="cf-card p-4 space-y-3"><h4 className="font-bold">Suivis du collaborateur</h4>{!employee.cases.length && <p>Aucun report exceptionnel consigné.</p>}{employee.cases.map(({ record: r, balanceChanged, deadlinePassed }) => <article key={r.id} className="cf-card-secondary rounded-xl p-3 space-y-1"><strong>{displayDate(r.sourceStart)} → {displayDate(r.sourceEnd)} · {r.status === 'open' ? 'Ouvert' : 'Clôturé'}</strong><p>Au relevé initial : {numberFormat.format(r.initialDays)} j · Encore concernés au dernier rapprochement : {numberFormat.format(r.remainingDays)} j.</p><p>Échéance vérifiée : {displayDate(r.availableUntil)}</p><p className="whitespace-pre-wrap break-words">Référence : {r.reference}</p>{balanceChanged && <p role="status">Le reliquat a changé : réévaluez les jours encore concernés avant une autre action.</p>}{deadlinePassed && <p role="status">Échéance dépassée : dossier à examiner. Aucun congé n’a été supprimé.</p>}{r.status === 'open' && (r.notice ? <p>Information déjà remise, consignée au {displayDate(r.notice.notifiedOn)} · {mediumNames[r.notice.medium]}. Référence : {r.notice.evidence}</p> : <p>Information au salarié à consigner ou à renouveler après la dernière réévaluation.</p>)}</article>)}</section>
        <form className="cf-card p-4 space-y-3" onSubmit={e => {
                    e.preventDefault();
                    if (!employee.primary)
                        return;
                    let command: CarryCommand;
                    switch (draft.action) {
                        case 'create':
                            command = { action: 'create', sourceStart: draft.sourceStart, sourceEnd: draft.sourceEnd, days: draft.days === '' ? NaN : Number(draft.days), availableUntil: draft.until, reference: draft.reference };
                            break;
                        case 'reconcile':
                            command = { action: 'reconcile', id: draft.id, remainingDays: draft.days === '' ? NaN : Number(draft.days) };
                            break;
                        case 'extend':
                            command = { action: 'extend', id: draft.id, availableUntil: draft.until };
                            break;
                        case 'notice':
                            command = { action: 'notice', id: draft.id, notifiedOn: draft.noticeDate, medium: draft.medium, evidence: draft.evidence };
                            break;
                        case 'close': command = { action: 'close', id: draft.id };
                    }
                    void work(async () => { const v = await saveCarry(actorId, club, { employeeId, expectedRevision: employee.revision, reviewConfirmed: draft.confirmed, reason: draft.reason, command }); if (mounted.current) {
                        adopt(v);
                        setNotice('Suivi et historique enregistrés. Le compteur de congés est inchangé.');
                    } });
                }}>
          <h4 className="font-bold">Traiter le suivi</h4><fieldset disabled={busy || !employee.primary} className="space-y-3">
            <label className="block">Action sur le report<select className={field} value={draft.action} onChange={e => change({ action: e.target.value as CarryCommand['action'], id: '', confirmed: false })}>{Object.entries(actionNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            {draft.action !== 'create' && <label className="block">Suivi à traiter<select className={field} required value={draft.id} onChange={e => change({ id: e.target.value, confirmed: false })}><option value="">Choisir un suivi ouvert</option>{employee.cases.filter(c => c.record.status === 'open').map(({ record: r }) => <option key={r.id} value={r.id}>{displayDate(r.sourceStart)} → {displayDate(r.sourceEnd)} · {numberFormat.format(r.remainingDays)} j · échéance {displayDate(r.availableUntil)}</option>)}</select></label>}
            <div className="grid sm:grid-cols-2 gap-3">
              {draft.action === 'create' && <><label>Début de la période d’origine<input className={field} type="date" required value={draft.sourceStart} onChange={e => change({ sourceStart: e.target.value })}/></label><label>Fin de la période d’origine<input className={field} type="date" required value={draft.sourceEnd} onChange={e => change({ sourceEnd: e.target.value })}/></label><label className="sm:col-span-2">Référence des droits et de l’échéance<textarea className={field} required maxLength={1000} value={draft.reference} onChange={e => change({ reference: e.target.value })}/></label></>}
              {(draft.action === 'create' || draft.action === 'reconcile') && <label>Jours encore concernés<input className={field} type="number" min={draft.action === 'create' ? 0.01 : 0} max={100} step="0.01" required value={draft.days} onChange={e => change({ days: e.target.value })}/></label>}
              {(draft.action === 'create' || draft.action === 'extend') && <label>Échéance vérifiée du report<input className={field} type="date" required value={draft.until} onChange={e => change({ until: e.target.value })}/></label>}
              {draft.action === 'notice' && <><label>Date réelle d’information du salarié<input className={field} type="date" required max={data.asOf} value={draft.noticeDate} onChange={e => change({ noticeDate: e.target.value })}/></label><label>Support déjà utilisé<select className={field} value={draft.medium} onChange={e => change({ medium: e.target.value as typeof draft.medium })}><option value="remise">Remise en main propre</option><option value="bulletin">Bulletin de paie</option><option value="courrier">Courrier</option><option value="email">Email</option></select></label><label className="sm:col-span-2">Référence de l’information déjà remise<textarea className={field} required maxLength={1000} value={draft.evidence} onChange={e => change({ evidence: e.target.value })}/></label><p className="text-sm cf-muted sm:col-span-2">Cette action consigne une remise déjà effectuée. Elle n’envoie aucun message et ne prouve pas automatiquement sa réception.</p></>}
            </div>
            {selected?.balanceChanged && draft.action !== 'reconcile' && <p role="status">Le solde a changé ; choisissez d’abord « Réévaluer les jours concernés ».</p>}
            {draft.action === 'close' && <p>Un suivi ne peut être clôturé qu’après avoir rapproché ses jours encore concernés à zéro. Aucun congé n’est retiré du compteur.</p>}
            <label className="block">Motif et justification de l’action<textarea className={field} required maxLength={1000} value={draft.reason} onChange={e => change({ reason: e.target.value })}/></label>
            <label className="flex gap-3 items-start"><input type="checkbox" checked={draft.confirmed} onChange={e => change({ confirmed: e.target.checked })}/><span>J’ai vérifié les jours concernés, les justificatifs et l’échéance applicable. Ce suivi ne calcule pas automatiquement une règle légale.</span></label>
            <button className={button} disabled={busy || !draft.confirmed || !draft.reason.trim() || (draft.action !== 'create' && !draft.id) || (!!selected?.balanceChanged && draft.action !== 'reconcile')}>{actionNames[draft.action]}</button>
            {dirty && <button type="button" className="cf-card-secondary min-h-[44px] rounded-xl px-3 ml-2" onClick={() => { setDraft(empty()); setDirty(false); }}>Abandonner la saisie du suivi</button>}
          </fieldset>
        </form>
        <section className="cf-card p-4 space-y-3"><h4 className="font-bold">Historique du suivi des reports</h4>{!employee.history.length && <p>Aucune action consignée.</p>}{employee.history.map(h => <article className="cf-card-secondary rounded-xl p-3" key={h.id}><strong>{actionNames[h.action as keyof typeof actionNames] ?? 'Action consignée'} · {displayTimestamp(h.timestamp)}</strong><p className="whitespace-pre-wrap break-words">{h.reason}</p><p>Jours concernés : {h.before ? numberFormat.format(h.before.remainingDays) : '—'} → {numberFormat.format(h.after.remainingDays)} j · Échéance : {h.before ? displayDate(h.before.availableUntil) : '—'} → {displayDate(h.after.availableUntil)}.</p></article>)}</section>
      </>}
    </>}
  </section>;
}
