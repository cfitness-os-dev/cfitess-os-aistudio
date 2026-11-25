import { useEffect, useRef, useState } from 'react';
import { HeitzRecoveryReadingsPanel } from './HeitzRecoveryReadingsPanel';
import { HeitzRecoveryLinksPanel } from './HeitzRecoveryLinksPanel';
import type { ClubId } from '../../types/cfos';
import { fetchRecoveryEvidence, recoveryConversationSheet, type RecoveryEvidenceSnapshot, type EvidenceKind, type EvidenceCommand, type RecoveryEventKind } from '../../domain/recoveryEvidence';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
const input = 'cf-input w-full min-w-0 min-h-[44px] rounded-xl px-3 py-2';
const button = 'cf-brand-gradient text-white rounded-xl px-3 py-2 min-h-[44px] disabled:opacity-50';
const labels: Record<EvidenceKind, string> = { contract: 'Contrat et signature', terms: 'CGV : version et signature', debt_detail: 'Détail des sommes et échéances', payments: 'Historique des règlements', reminders: 'Historique des relances' };
const eventLabels: Record<RecoveryEventKind, string> = { contact: 'Échange avec le client', payment_reported: 'Paiement signalé par le client', disputed: 'Somme contestée', review_completed: 'Contrôle effectué — lever la suspension' };
const empty = () => ({ mode: 'record' as 'record' | 'interaction', kind: 'contract' as EvidenceKind, eventKind: 'contact' as RecoveryEventKind, reference: '', version: '', signedOn: '', note: '', reason: '', confirmed: false });
export function RecoveryEvidencePanel({ actorId, caseId, club, onContext, onDirtyChanged }: {
    actorId: string;
    caseId: string;
    club: ClubId;
    onContext: (v: RecoveryEvidenceSnapshot | null) => void;
    onDirtyChanged: (v: boolean) => void;
}) {
    const [data, setData] = useState<RecoveryEvidenceSnapshot | null>(null), [draft, setDraft] = useState(empty), [busy, setBusy] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState(''), [dirty, setDirty] = useState(false);
    const mounted = useRef(true), lock = useRef(false);
    useLeadDraftGuard(dirty);
    useEffect(() => onDirtyChanged(dirty), [dirty, onDirtyChanged]);
    function adopt(value: RecoveryEvidenceSnapshot) { setData(value); onContext(value); setDirty(false); setDraft(empty()); }
    useEffect(() => { mounted.current = true; const controller = new AbortController(); onContext(null); setBusy(true); fetchRecoveryEvidence(actorId, caseId, club, undefined, controller.signal).then(v => { if (!controller.signal.aborted)
        adopt(v); }).catch(e => { if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Chargement impossible.'); }).finally(() => { if (!controller.signal.aborted)
        setBusy(false); }); return () => { mounted.current = false; controller.abort(); }; }, [actorId, caseId, club, onContext]);
    function change(p: Partial<ReturnType<typeof empty>>) { setDraft(d => ({ ...d, ...p })); setDirty(true); setMessage(''); }
    async function run(action: () => Promise<void>) { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); setMessage(''); try {
        await action();
    }
    catch (e) {
        if (mounted.current)
            setError(e instanceof Error ? e.message : 'Action non enregistrée.');
    }
    finally {
        lock.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    async function save(command: EvidenceCommand) { if (!data)
        return; await run(async () => { const v = await fetchRecoveryEvidence(actorId, caseId, club, { expectedRevision: data.revision, reviewConfirmed: draft.confirmed, reason: draft.reason, command }); if (mounted.current) {
        adopt(v);
        setMessage('Contrôle enregistré avec sa trace. Aucun message envoyé.');
    } }); }
    return <section className="cf-card p-4 space-y-4 min-w-0 break-words" aria-label="Dossier de preuves et fiche d’échange">
    <div className="flex flex-wrap gap-3 justify-between items-center"><h3 className="font-bold">Dossier de preuves et fiche d’échange</h3><button type="button" className={button} disabled={busy} onClick={() => { const action = () => void run(async () => { const v = await fetchRecoveryEvidence(actorId, caseId, club); if (mounted.current)
        adopt(v); }); if (confirmLeadDraftNavigation(action))
        action(); }}>Actualiser le dossier de preuves</button></div>
    <p className="cf-muted text-sm">Les références consignent les pièces réellement consultées. Une déclaration dans l’ancien dossier ne constitue pas, à elle seule, une preuve de signature.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{busy && !data && <p role="status">Chargement du dossier…</p>}
    {data && <>
      <HeitzRecoveryReadingsPanel actorId={actorId} caseId={caseId} club={club} revision={data.revision} disabled={dirty||busy}/>
      <HeitzRecoveryLinksPanel actorId={actorId} caseId={caseId} club={club} revision={data.revision} disabled={dirty||busy}/>
      <p className="text-sm">Solde indiqué : {data.amountDueEur.toFixed(2)} € · Source : {data.source || 'À vérifier'} · Dernière remontée : {data.sourceUpdatedAt ? new Date(data.sourceUpdatedAt).toLocaleString('fr-FR') : 'Non renseignée'}.</p>
      <dl className="grid sm:grid-cols-2 gap-3 text-sm"><div><dt className="cf-muted">Contrat indiqué</dt><dd>{data.assistantFacts.contractLabel || 'À vérifier'}</dd></div><div><dt className="cf-muted">Échéances indiquées</dt><dd>{data.assistantFacts.billedMonths.length ? data.assistantFacts.billedMonths.join(', ') : 'À retrouver'}</dd></div><div><dt className="cf-muted">Retard indiqué</dt><dd>{data.assistantFacts.overdueDays === null ? 'Inconnu' : data.assistantFacts.overdueDays + ' jours'}</dd></div><div><dt className="cf-muted">Motif à confirmer</dt><dd>{data.assistantFacts.reportedReason || 'Non renseigné'}</dd></div></dl>
      <button type="button" disabled={busy || dirty} className={button} onClick={() => { const url = URL.createObjectURL(new Blob([recoveryConversationSheet(data)], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'cfitness-fiche-echange.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Télécharger la fiche d’échange</button>
      {data.followupPaused && <p role="status" className="cf-card-secondary p-3 text-amber-400">Suivi suspendu : paiement signalé, contestation ou dossier régularisé. Vérifiez les faits avant toute reprise.</p>}
      <div className="grid sm:grid-cols-2 gap-2">{data.requirements.map(r => <p className="cf-card-secondary p-3 rounded-xl" key={r.kind}>{r.label} : <strong>{r.verified ? 'Référence vérifiée' : 'À retrouver ou à contrôler'}</strong></p>)}</div>
      <p>{data.documented ? 'Références réunies pour une relecture du dossier.' : 'Le dossier nécessite encore des contrôles avant préparation du contentieux.'} Aucune validation juridique automatique.</p>
      <details className="cf-card-secondary rounded-xl p-3"><summary className="cursor-pointer font-semibold">Préparer un échange au téléphone ou au club</summary><ol className="list-decimal pl-5 mt-3 space-y-2">{data.callGuide.map(t => <li key={t}>{t}</li>)}</ol>{data.nextActions.length > 0 && <><h4 className="font-semibold mt-3">Informations à compléter</h4><ul className="list-disc pl-5">{data.nextActions.map(t => <li key={t}>{t}</li>)}</ul></>}</details>
      <section className="space-y-2"><h4 className="font-semibold">Références et versions</h4>{!data.evidence.length && <p>Aucune vérification documentaire consignée.</p>}{data.evidence.map(e => <article className="cf-card-secondary p-3 rounded-xl space-y-1" key={e.id}><strong>{labels[e.kind]} · {e.current ? 'Courante' : e.revokedAt ? 'Retirée' : 'À rapprocher après changement du dossier'}</strong><p>{e.reference} · Version {e.version}{e.signedOn ? ' · Signature vérifiée au ' + e.signedOn : ''}</p><p className="text-xs cf-muted">Contrôle du {new Date(e.verifiedAt).toLocaleString('fr-FR')} · {e.reason}</p>{data.canEdit && !e.revokedAt && <button type="button" className="cf-card px-3 min-h-[44px] rounded-xl" disabled={busy || !draft.confirmed || !draft.reason.trim()} onClick={() => void save({ action: 'revoke', id: e.id })}>Retirer cette vérification</button>}</article>)}</section>
      {data.canEdit && <form className="cf-card-secondary p-4 rounded-xl space-y-3" onSubmit={e => { e.preventDefault(); void save(draft.mode === 'record' ? { action: 'record', kind: draft.kind, reference: draft.reference, version: draft.version, signedOn: draft.signedOn || null } : { action: 'interaction', kind: draft.eventKind, note: draft.note, reference: draft.reference }); }}><fieldset disabled={busy} className="space-y-3"><label className="block">Action sur le dossier<select className={input} value={draft.mode} onChange={e => change({ mode: e.target.value as typeof draft.mode, confirmed: false })}><option value="record">Consigner une pièce vérifiée</option><option value="interaction">Consigner un échange ou un contrôle</option></select></label>
        {draft.mode === 'record' ? <><label className="block">Pièce réellement consultée<select className={input} value={draft.kind} onChange={e => change({ kind: e.target.value as EvidenceKind, confirmed: false })}>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="block">Version ou date du relevé<input className={input} required maxLength={1000} value={draft.version} onChange={e => change({ version: e.target.value })}/></label>{(draft.kind === 'contract' || draft.kind === 'terms') && <label className="block">Date de signature réellement vérifiée<input className={input} type="date" required value={draft.signedOn} onChange={e => change({ signedOn: e.target.value })}/></label>}</> : <><label className="block">Résultat de l’échange<select className={input} value={draft.eventKind} onChange={e => change({ eventKind: e.target.value as RecoveryEventKind, confirmed: false })}>{Object.entries(eventLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label className="block">Résumé factuel de l’échange<textarea className={input} required maxLength={1000} value={draft.note} onChange={e => change({ note: e.target.value })}/></label></>}
        <label className="block">Référence dans Heitz ou dans le dossier<input className={input} required maxLength={1000} value={draft.reference} onChange={e => change({ reference: e.target.value })}/></label><label className="block">Motif du contrôle ou du retrait<textarea className={input} required maxLength={1000} value={draft.reason} onChange={e => change({ reason: e.target.value })}/></label><label className="flex gap-3"><input type="checkbox" checked={draft.confirmed} onChange={e => change({ confirmed: e.target.checked })}/><span>J’ai vérifié la pièce ou le résultat réel de l’échange et son application à ce dossier.</span></label><button className={button} disabled={!draft.confirmed || !draft.reason.trim() || busy}>Enregistrer le contrôle</button>{dirty && <button type="button" className="min-h-[44px] px-3" onClick={() => { setDraft(empty()); setDirty(false); }}>Abandonner la saisie</button>}
      </fieldset></form>}
      <section className="space-y-2"><h4 className="font-semibold">Derniers échanges et contrôles</h4>{!data.timeline.length && <p>Aucun échange consigné dans ce suivi.</p>}{data.timeline.map(e => <article key={e.id} className="cf-card-secondary p-3 rounded-xl"><strong>{eventLabels[e.kind]} · {new Date(e.timestamp).toLocaleString('fr-FR')}</strong><p>{e.note}</p><p className="cf-muted">Référence : {e.reference}</p></article>)}</section>
      <p className="text-xs cf-muted">Les références ne contiennent pas les fichiers eux-mêmes. Les envois et transmissions restent désactivés dans ce parcours.</p>
    </>}
  </section>;
}
