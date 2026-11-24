import { useEffect, useRef, useState } from 'react';
import { settleLeave, validAllocations, type LeaveAllocations, type LeavePolicy } from '../../domain/hrLeaveRules';
import type { HrRequest } from '../../domain/hrWorkflow';
import type { ClubId } from '../../types/cfos';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
export function LeavePolicySummary({ policy }: {
    policy: LeavePolicy;
}) {
    return <div className="space-y-2 text-sm">
    {policy.closedCounterPeriod&&<p role="status">Ce décompte appartient à une période clôturée. Une régularisation doit être examinée par le responsable ; cette reprise ne modifiera pas automatiquement les compteurs du nouvel exercice.</p>}
    <p>Début : {policy.startPeriod === 'pm' ? 'après-midi' : 'matin'} · Fin : {policy.endPeriod === 'am' ? 'fin de matinée' : 'fin de journée'}.</p>
    {policy.active === false && <p role="status">Ce motif est désactivé. Vérifiez la demande avant toute décision.</p>}
    {policy.requiresDocument && <p>{policy.missingDocument ? 'Justificatif requis : la validation reste bloquée.' : 'Justificatif joint · à vérifier avant de valider.'}</p>}
    {policy.documents.map(doc => <details key={doc.id}><summary className="cursor-pointer min-h-[44px] py-2">{doc.title}</summary><p className="whitespace-pre-wrap break-words">{doc.text || 'Contenu indisponible. Demandez le document au collaborateur.'}</p></details>)}
    {policy.activeSettlement && <p>Décompte appliqué : {policy.activeSettlement.allocations.cpN} j de CP en cours, {policy.activeSettlement.allocations.cpNMinus1} j de reliquat et {policy.activeSettlement.allocations.rtt} j de RTT.</p>}
    {!!policy.settlementHistory.length && <details><summary className="cursor-pointer min-h-[44px] py-2">Historique des décomptes et reprises</summary><ul className="space-y-2">{policy.settlementHistory.map(item => <li key={item.id}>{item.active ? 'Décompte actif' : 'Décompte compensé'} · {item.allocations.cpN} j CP en cours / {item.allocations.cpNMinus1} j reliquat / {item.allocations.rtt} j RTT · {item.reason}</li>)}</ul></details>}
  </div>;
}
export function LeaveDecisionPanel({ row, actorId, club, locked, onChanged, onSimpleDecision }: {
    row: HrRequest;
    actorId: string;
    club: ClubId;
    locked: boolean;
    onChanged: () => Promise<void>;
    onSimpleDecision: (status: string, note: string) => Promise<boolean>;
}) {
    const policy = row.policy!;
    const [snapshot, setSnapshot] = useState(policy);
    const [amounts, setAmounts] = useState({ cpN: '0', cpNMinus1: '0', rtt: '0' });
    const [reason, setReason] = useState('');
    const [reviewed, setReviewed] = useState(false);
    const [nextStatus, setNextStatus] = useState<'pending' | 'rejected'>('pending');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const lock = useRef(false);
    const ownDecision = useRef(false);
    useEffect(() => {
        if (ownDecision.current) {
            setSnapshot(policy);
            ownDecision.current = false;
        }
    }, [policy]);
    const blocked = busy || locked;
    const dirty = !!reason || Object.values(amounts).some(v => Number(v) !== 0);
    useLeadDraftGuard(dirty);
    const stale = snapshot.requestRevision !== policy.requestRevision || snapshot.policyRevision !== policy.policyRevision || snapshot.counter?.revision !== policy.counter?.revision;
    const reverse = snapshot.hasActiveSettlement;
    const family = snapshot.counterFamily;
    const allocations: LeaveAllocations = { cpN: Number(amounts.cpN), cpNMinus1: Number(amounts.cpNMinus1), rtt: Number(amounts.rtt) };
    const canApprove = row.status === 'pending' && !reverse && policy.canSettle && !!policy.counter && !policy.missingDocument && policy.active !== false && (!policy.requiresDocument || policy.canViewDocuments);
    const simple = async (status: string) => {
        if (lock.current || locked || !reason.trim() || stale)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            ownDecision.current = true;
            if (await onSimpleDecision(status, reason)) {
                setReason('');
                setReviewed(false);
            }
            else
                ownDecision.current = false;
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return <div className="space-y-3">
    {stale && <div role="alert"><p>La demande, ses règles ou le compteur ont changé. Vérifiez les données actualisées avant de décider.</p><button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl" disabled={blocked} onClick={() => { setSnapshot(policy); setReviewed(false); setError(''); }}>Utiliser les données actualisées</button></div>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {snapshot.counter && <p className="text-sm">CP en cours : {snapshot.counter.values.cpNAcquired - snapshot.counter.values.cpNTaken} j disponibles · Reliquat : {snapshot.counter.values.cpNMinus1Remaining} j · RTT : {snapshot.counter.values.rttDaysRemaining ?? 'non disponible'}</p>}
    {!policy.canSettle && !policy.closedCounterPeriod && <p>Un responsable habilité aux absences et aux compteurs doit confirmer ce décompte.</p>}
    {row.status === 'approved' && !reverse && <p>Aucun décompte lié n’est enregistré pour cette validation historique. Une remise en attente ne modifiera pas les soldes.</p>}
    <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current || locked || stale || !policy.counter || !policy.canSettle || !reviewed || !reason.trim() || (!reverse && !validAllocations(allocations, family)))
                return;
            lock.current = true;
            setBusy(true);
            setError('');
            setNotice('');
            try {
                await settleLeave(actorId, club, row.id, { action: reverse ? 'reverse' : 'approve', expectedRequestRevision: snapshot.requestRevision, expectedCounterRevision: snapshot.counter!.revision, expectedPolicyRevision: snapshot.policyRevision, allocations: reverse ? { cpN: 0, cpNMinus1: 0, rtt: 0 } : allocations, reason, nextStatus: reverse ? nextStatus : undefined });
                ownDecision.current = true;
                setReason('');
                setAmounts({ cpN: '0', cpNMinus1: '0', rtt: '0' });
                setReviewed(false);
                setNotice('Décision et mouvement de compteur enregistrés.');
                await onChanged();
            }
            catch (e) {
                setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
            }
            finally {
                lock.current = false;
                setBusy(false);
            }
        }}>
      {canApprove && <div className="grid sm:grid-cols-2 gap-3">{(family === 'cp' ? ['cpN', 'cpNMinus1'] : ['rtt']).map(key => {
                const field = key as keyof LeaveAllocations;
                return <label key={field}>{field === 'cpN' ? 'Jours de CP de la période en cours' : field === 'cpNMinus1' ? 'Jours sur le reliquat précédent' : 'Jours de RTT'}<input className="cf-input w-full min-h-[44px] px-3 rounded-xl" type="number" min="0" max="100" step="0.01" required value={amounts[field]} disabled={blocked || stale} onChange={e => { setAmounts({ ...amounts, [field]: e.target.value }); setReviewed(false); }}/></label>;
            })}</div>}
      <label className="block">Motif de décision pour {row.employeeName}<textarea className="cf-input w-full min-h-[88px] px-3 rounded-xl" maxLength={1000} required value={reason} disabled={blocked} onChange={e => setReason(e.target.value)}/></label>
      {reverse && <label className="block">Après compensation du décompte<select className="cf-input w-full min-h-[44px] px-3 rounded-xl" value={nextStatus} disabled={blocked || stale} onChange={e => { setNextStatus(e.target.value as 'pending' | 'rejected'); setReviewed(false); }}><option value="pending">Remettre en attente</option><option value="rejected">Refuser l’absence</option></select></label>}
      {(canApprove || reverse) && <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={reviewed} disabled={blocked || stale} onChange={e => setReviewed(e.target.checked)}/><span>{reverse ? 'Je confirme la compensation des quantités du décompte d’origine sur les soldes actuels.' : 'J’ai vérifié les dates, les justificatifs requis et les jours à décompter.'}</span></label>}
      <div className="flex flex-wrap gap-2">
        {(canApprove || reverse) && <button className="cf-brand-gradient text-white min-h-[44px] px-3 rounded-xl disabled:opacity-50" disabled={blocked || stale || !policy.canSettle || !reviewed || !reason.trim() || (!reverse && !validAllocations(allocations, family))}>{reverse ? 'Reprendre et compenser le décompte' : 'Valider et décompter les jours'}</button>}
        {!reverse && row.status === 'pending' && <button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl disabled:opacity-50" disabled={blocked || stale || !reason.trim()} onClick={() => void simple('rejected')}>Refuser la demande</button>}
        {!reverse && row.status !== 'pending' && <button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl disabled:opacity-50" disabled={blocked || stale || !reason.trim()} onClick={() => void simple('pending')}>Remettre en attente</button>}
        {dirty && <button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl" disabled={blocked} onClick={() => { setReason(''); setAmounts({ cpN: '0', cpNMinus1: '0', rtt: '0' }); setReviewed(false); setError(''); }}>Effacer mon brouillon</button>}
      </div>
    </form>
  </div>;
}
