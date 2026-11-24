import { useEffect, useRef, useState } from 'react';
import type { ClubId } from '../../types/cfos';
import { loadAccrual, saveAccrualPolicy, previewAccrual, applyAccrual, validateAccrualPolicy, type AccrualPolicy, type AccrualSnapshot, type AccrualPreview, type AccrualRequest } from '../../domain/hrLeaveAccrual';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });
const days = (value: unknown) => typeof value === 'number' ? numberFormat.format(value) : '—';
const input = 'cf-input w-full min-w-0 px-3 py-2 min-h-[44px] rounded-xl';
const button = 'cf-brand-gradient text-white min-h-[44px] px-4 py-2 rounded-xl disabled:opacity-50';
export function HrLeaveAccrualPanel({ actorId, club }: {
    actorId: string;
    club: ClubId;
}) {
    const [data, setData] = useState<AccrualSnapshot | null>(null);
    const [draft, setDraft] = useState<AccrualPolicy | null>(null);
    const [request, setRequest] = useState<AccrualRequest>({ employeeId: '', kind: 'accrue', month: '' });
    const [preview, setPreview] = useState<AccrualPreview | null>(null);
    const [reason, setReason] = useState('');
    const [baseline, setBaseline] = useState(false);
    const [reviewed, setReviewed] = useState(false);
    const [loss, setLoss] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const lock = useRef(false);
    const mounted = useRef(true);
    const dirty = !!data && !!draft && JSON.stringify(data.policy) !== JSON.stringify(draft);
    useLeadDraftGuard(dirty || !!reason.trim());
    function adopt(value: AccrualSnapshot) { setData(value); setDraft(value.policy); setRequest(prev => ({ ...prev, employeeId: value.employees.some(e => e.id === prev.employeeId) ? prev.employeeId : value.employees.find(e => e.primary)?.id ?? '' })); }
    function clearPreview() { setPreview(null); setBaseline(false); setReviewed(false); setLoss(false); }
    useEffect(() => {
        mounted.current = true;
        const controller = new AbortController();
        setBusy(true);
        loadAccrual(actorId, club, controller.signal).then(value => {
            if (!controller.signal.aborted)
                adopt(value);
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : 'Chargement impossible.');
        }).finally(() => {
            if (!controller.signal.aborted)
                setBusy(false);
        });
        return () => { mounted.current = false; controller.abort(); };
    }, [actorId, club]);
    async function work(action: () => Promise<void>) {
        if (lock.current)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await action();
        }
        catch (e) {
            if (mounted.current)
                setError(e instanceof Error ? e.message : 'Opération impossible.');
        }
        finally {
            lock.current = false;
            if (mounted.current)
                setBusy(false);
        }
    }
    const change = (patch: Partial<AccrualPolicy>) => {
        if (draft) {
            setDraft({ ...draft, ...patch });
            clearPreview();
        }
    };
    const selection = (patch: Partial<AccrualRequest>) => { setRequest({ ...request, ...patch }); clearPreview(); };
    const p = preview?.plan;
    return <section className="space-y-4 min-w-0" aria-label="Acquisition et report des congés">
    <header className="cf-card p-4 space-y-2"><h3 className="font-bold text-lg">Acquisition et report des congés</h3><p>Préparez les droits de congés, puis vérifiez l’aperçu avant chaque enregistrement. Aucune opération n’est exécutée automatiquement.</p><button className={button} disabled={busy} onClick={() => {
            const refresh = () => void work(async () => {
                const value = await loadAccrual(actorId, club);
                if (mounted.current) {
                    adopt(value);
                    clearPreview();
                    setReason('');
                }
            });
            if (confirmLeadDraftNavigation(refresh))
                refresh();
        }}>Actualiser les acquisitions et reports</button></header>
    {error && <p role="alert" className="cf-card p-4">{error}</p>}{notice && <p role="status" className="cf-card p-4 text-emerald-500">{notice}</p>}
    {!data && busy && <p role="status">Chargement des règles…</p>}
    {data && draft && <>
      <form className="cf-card p-4 space-y-3" onSubmit={e => {
                e.preventDefault();
                void work(async () => {
                    const value = await saveAccrualPolicy(actorId, club, data.revision, draft);
                    if (mounted.current) {
                        adopt(value);
                        clearPreview();
                        setNotice('Règles d’acquisition et de report enregistrées.');
                    }
                });
            }}>
        <h4 className="font-bold">Règles du club</h4>
        <fieldset disabled={busy || !data.canEdit} className="space-y-3">
          <label className="flex gap-3 items-start min-h-[44px]"><input type="checkbox" checked={draft.enabled} onChange={e => change({ enabled: e.target.checked })}/><span>Autoriser les opérations après vérification des règles</span></label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label>Unité des congés<select className={input} value={draft.unit} onChange={e => change({ unit: e.target.value as AccrualPolicy['unit'] })}><option value="unconfigured">À vérifier</option><option value="ouvrables">Jours ouvrables</option><option value="ouvres">Jours ouvrés</option><option value="calendaires">Jours calendaires</option></select></label>
            <label>Jours acquis par mois complet<input className={input} type="number" min="0.01" max="100" step="0.0001" value={draft.monthlyDays ?? ''} onChange={e => change({ monthlyDays: e.target.value === '' ? null : Number(e.target.value) })}/></label>
            <label>Premier mois de la période de congés<select className={input} value={draft.periodStartMonth ?? ''} onChange={e => change({ periodStartMonth: e.target.value ? Number(e.target.value) : null })}><option value="">À vérifier</option>{['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            <label>Arrondi du cumul<select className={input} value={draft.rounding} onChange={e => change({ rounding: e.target.value as AccrualPolicy['rounding'] })}><option value="nearest">Au centième le plus proche</option><option value="up">Au centième supérieur</option><option value="down">Au centième inférieur</option></select></label>
            <label>Report des droits de la période qui se termine<select className={input} value={draft.carryMode} onChange={e => change({ carryMode: e.target.value as AccrualPolicy['carryMode'] })}><option value="keep_all">Reporter tout le solde disponible</option><option value="limit">Reporter avec un plafond</option><option value="none">Ne pas reporter</option></select></label>
            {draft.carryMode === 'limit' && <label>Plafond de report en jours<input className={input} type="number" min="0" max="100" step="0.01" value={draft.carryLimit ?? ''} onChange={e => change({ carryLimit: e.target.value === '' ? null : Number(e.target.value) })}/></label>}
            <label>Reliquat déjà présent<select className={input} value={draft.priorCarryMode} onChange={e => change({ priorCarryMode: e.target.value as AccrualPolicy['priorCarryMode'] })}><option value="keep">Le conserver et ajouter le nouveau report</option><option value="expire">Ne pas le conserver lors de la clôture</option></select></label>
          </div>
          <label className="block">Référence des règles vérifiées<textarea className={input} maxLength={1000} value={draft.reference} onChange={e => change({ reference: e.target.value })}/></label>
          <details className="cf-card-secondary p-3 rounded-xl">
            <summary className="cursor-pointer min-h-[44px]">Effet des motifs d’absence sur l’acquisition</summary>
            <p className="text-sm cf-muted mb-3">Ce réglage est indépendant de l’annualisation et du compteur débité. « Permet » ne garantit pas le taux d’un mois sans absence : vérifiez les taux particuliers et plafonds. « Ne permet pas » bloque le crédit complet ; un prorata doit alors être examiné. Un motif non vérifié ne vaut jamais « Oui ».</p>
            <div className="space-y-3">{data.motives.map(m => <label key={m.id} className="grid sm:grid-cols-2 gap-2 items-center"><span>{m.label}{m.active ? '' : ' · désactivé'}</span><select className={input} aria-label={`Acquisition pendant ${m.label}`} value={draft.absenceAcquisition?.[m.id] === true ? 'yes' : draft.absenceAcquisition?.[m.id] === false ? 'no' : 'review'} onChange={e => change({ absenceAcquisition: { ...draft.absenceAcquisition, [m.id]: e.target.value === 'review' ? null : e.target.value === 'yes' } })}><option value="review">À vérifier</option><option value="yes">Permet l’acquisition</option><option value="no">Ne permet pas l’acquisition</option></select></label>)}</div>
          </details>
          <p className="text-sm cf-muted">Les décimales sont conservées entre les mois, puis arrondies sur le cumul. Les mois incomplets de contrat restent à traiter après vérification du prorata. Une acquisition ne calcule pas les effets légaux des absences.</p>
          <button className={button} disabled={busy || !dirty || !!validateAccrualPolicy(draft)}>Enregistrer les règles d’acquisition</button>
          {dirty && <button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl ml-2" onClick={() => { setDraft(data.policy); clearPreview(); }}>Annuler mes changements de règles</button>}
        </fieldset>
        {!data.canEdit && <p>Vos droits permettent la consultation des règles uniquement.</p>}
        {dirty && validateAccrualPolicy(draft) && <p role="status">{validateAccrualPolicy(draft)}</p>}
      </form>
      <form className="cf-card p-4 space-y-3" onSubmit={e => {
                e.preventDefault();
                void work(async () => {
                    const value = await previewAccrual(actorId, club, request);
                    if (mounted.current) {
                        setPreview(value);
                        setBaseline(false);
                        setReviewed(false);
                        setLoss(false);
                    }
                });
            }}>
        <h4 className="font-bold">Préparer une opération</h4>
        <p className="text-sm cf-muted">Utilisez le club principal du salarié. Son compteur est commun à ses clubs et une acquisition ne peut être enregistrée qu’une fois pour le même mois.</p>
        <p className="text-sm cf-muted">Les montants prévisionnels d’un mois en cours ou futur ne sont pas des crédits enregistrés. Ce parcours ne crédite que les mois terminés.</p>
        {!data.policy.enabled && <p>Les règles sont désactivées. Vérifiez puis enregistrez leur activation avant de préparer une opération.</p>}
        <fieldset disabled={busy || dirty || !data.policy.enabled} className="grid sm:grid-cols-2 gap-3">
          <label>Collaborateur<select className={input} required value={request.employeeId} onChange={e => selection({ employeeId: e.target.value })}><option value="">Choisir un collaborateur</option>{data.employees.map(e => <option key={e.id} value={e.id} disabled={!e.primary}>{e.name}{e.primary ? '' : ' · club principal différent'}</option>)}</select></label>
          <label>Opération<select className={input} value={request.kind} onChange={e => selection({ kind: e.target.value as AccrualRequest['kind'] })}><option value="accrue">Acquisition d’un mois complet</option><option value="rollover">Clôture de période et report</option></select></label>
          <label>{request.kind === 'accrue' ? 'Mois à créditer' : 'Dernier mois de la période à clôturer'}<input className={input} type="month" required value={request.month} onChange={e => selection({ month: e.target.value })}/></label>
          <button className={button} disabled={busy || !request.employeeId || !request.month}>Calculer l’aperçu sans enregistrer</button>
        </fieldset>
      </form>
      {preview && p && <form className="cf-card p-4 space-y-3" onSubmit={e => {
                    e.preventDefault();
                    void work(async () => {
                        const value = await applyAccrual(actorId, club, { request, expectedPreview: preview.revision, baselineConfirmed: baseline, absenceReviewed: reviewed, periodReviewed: reviewed, confirmLoss: loss, reason });
                        if (mounted.current) {
                            adopt(value);
                            clearPreview();
                            setReason('');
                            setNotice('Opération et historique du compteur enregistrés.');
                        }
                    });
                }}>
        <h4 className="font-bold">Aperçu à vérifier · {data.employees.find(e => e.id === p.employeeId)?.name}</h4><p>Période : {p.periodStart} → {p.periodEnd}</p>
        <p>Acquisition : {days(p.amount)} j · Nouveau report : {days(p.carried)} j · Droits non conservés : {days(p.expired)} j.</p>
        {p.absenceReviewRequired && <p role="status">{p.absenceCount} absence(s) validée(s) sur le mois, dont {p.unverifiedAbsenceCount} avec un effet sur l’acquisition non vérifié. Contrôlez le taux et les plafonds avant confirmation ; la mention « permet l’acquisition » ne suffit pas à établir un crédit complet.</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Compteur</th><th>Avant</th><th>Après</th></tr></thead><tbody>{[['cpNAcquired', 'CP acquis'], ['cpNTaken', 'CP pris'], ['cpNMinus1Remaining', 'Reliquat']].map(([key, label]) => <tr key={key}><th className="text-left py-2">{label}</th><td className="text-center">{days(p.before[key as keyof typeof p.before])}</td><td className="text-center">{days(p.after[key as keyof typeof p.after])}</td></tr>)}</tbody></table></div>
        {p.kind === 'rollover' && <p>La clôture ouvre la période suivante et conserve les mouvements passés. Une reprise d’absence décomptée sur l’ancien exercice nécessitera une régularisation examinée séparément.</p>}
        <fieldset disabled={busy || dirty} className="space-y-3">
          {p.baselineRequired && <label className="flex gap-3 items-start"><input type="checkbox" checked={baseline} onChange={e => setBaseline(e.target.checked)}/><span>{p.kind === 'accrue' ? 'J’ai vérifié les soldes de reprise : ils ne comprennent pas déjà cette acquisition mensuelle.' : 'J’ai vérifié que les soldes présentés correspondent bien à la période à clôturer.'}</span></label>}
          {p.kind === 'rollover' && <label className="flex gap-3 items-start"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/><span>J’ai vérifié que toutes les acquisitions, absences et corrections de la période sont comptabilisées.</span></label>}
          {p.absenceReviewRequired && <label className="flex gap-3 items-start"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/><span>J’ai vérifié les absences du mois : le crédit de mois complet affiché est applicable. Si un prorata est nécessaire, je ne confirme pas cette opération.</span></label>}
          {p.expired > 0 && <label className="flex gap-3 items-start"><input type="checkbox" checked={loss} onChange={e => setLoss(e.target.checked)}/><span>Je confirme explicitement les {days(p.expired)} jours non conservés selon les règles vérifiées.</span></label>}
          <label className="block">Motif de l’opération<textarea className={input} required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}/></label>
          <button className={button} disabled={busy || dirty || !reason.trim() || (p.baselineRequired && !baseline) || (p.kind === 'rollover' && !reviewed) || (p.absenceReviewRequired && !reviewed) || (p.expired > 0 && !loss)}>Confirmer l’opération sur le compteur</button>
          <button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl ml-2" disabled={busy} onClick={() => { clearPreview(); setReason(''); }}>Abandonner l’aperçu</button>
        </fieldset>
      </form>}
      <section className="cf-card p-4 space-y-3"><h4 className="font-bold">Historique des acquisitions et reports</h4>{!data.history.length && <p>Aucune opération enregistrée dans ce club.</p>}{data.history.map(o => <article key={o.id} className="cf-card-secondary rounded-xl p-3"><strong>{data.employees.find(e => e.id === o.employeeId)?.name} · {o.kind === 'accrue' ? 'Acquisition' : 'Clôture et report'} · {o.month}</strong><p>Crédit : {days(o.amount)} j · Report : {days(o.carried)} j · Non conservés : {days(o.expired)} j.</p><p className="whitespace-pre-wrap break-words">{o.reason}</p></article>)}</section>
    </>}
  </section>;
}
