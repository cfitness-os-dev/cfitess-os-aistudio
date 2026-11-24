import { useEffect, useRef, useState } from 'react';
import { getLeaveCounterRules, saveLeaveCounterRule, type CounterFamily, type LeaveCounterRules } from '../../domain/hrLeaveRules';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import type { ClubId } from '../../types/cfos';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
export function LeaveCounterRulesPanel({ actorId, club }: {
    actorId: string;
    club: ClubId;
}) {
    const [data, setData] = useState<LeaveCounterRules | null>(null);
    const [motive, setMotive] = useState('');
    const [family, setFamily] = useState<CounterFamily>('none');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const mounted = useRef(true);
    const current = data?.motives.find(m => m.id === motive);
    const dirty = !!current && current.counterFamily !== family;
    useLeadDraftGuard(dirty);
    useEffect(() => {
        mounted.current = true;
        const controller = new AbortController();
        getLeaveCounterRules(actorId, club, controller.signal).then(value => {
            if (controller.signal.aborted)
                return;
            setData(value);
            setMotive(value.motives[0]?.id ?? '');
            setFamily(value.motives[0]?.counterFamily ?? 'none');
        }).catch(e => {
            if (!controller.signal.aborted)
                setError(e instanceof Error ? e.message : 'Chargement impossible.');
        });
        return () => { mounted.current = false; controller.abort(); };
    }, [actorId, club]);
    return <section className="cf-card p-4 space-y-3 min-w-0" aria-label="Décompte des absences">
    <h3 className="font-bold">Décompte des absences</h3>
    <p className="text-sm cf-muted">Associez chaque motif à un compteur. Le responsable confirme les jours à décompter lors de la validation : aucune durée n’est déduite automatiquement des dates.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Chargement des règles de décompte…</p>}
    <button type="button" className="cf-card-secondary min-h-[44px] px-3 rounded-xl disabled:opacity-50" disabled={busy} onClick={() => {
            const refresh = async () => {
                if (lock.current)
                    return;
                lock.current = true;
                setBusy(true);
                setError('');
                try {
                    const next = await getLeaveCounterRules(actorId, club);
                    if (mounted.current) {
                        setData(next);
                        setMotive(next.motives[0]?.id ?? '');
                        setFamily(next.motives[0]?.counterFamily ?? 'none');
                        setNotice('Règles actualisées.');
                    }
                }
                catch (e) {
                    if (mounted.current)
                        setError(e instanceof Error ? e.message : 'Actualisation impossible.');
                }
                finally {
                    lock.current = false;
                    if (mounted.current)
                        setBusy(false);
                }
            };
            if (!dirty || confirmLeadDraftNavigation(() => void refresh()))
                void refresh();
        }}>Actualiser les motifs et décomptes</button>
    {data && <form className="space-y-3" onSubmit={async (e) => {
                e.preventDefault();
                if (lock.current || !dirty || !data.canEdit)
                    return;
                lock.current = true;
                setBusy(true);
                setError('');
                setNotice('');
                try {
                    const next = await saveLeaveCounterRule(actorId, club, { expectedRevision: data.revision, motiveId: motive, family });
                    if (mounted.current) {
                        setData(next);
                        setNotice('Règle de décompte enregistrée.');
                    }
                }
                catch (e) {
                    if (mounted.current)
                        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
                }
                finally {
                    lock.current = false;
                    if (mounted.current)
                        setBusy(false);
                }
            }}>
      <label className="block">Motif d’absence
        <select className="cf-input w-full min-h-[44px] px-3 rounded-xl" value={motive} disabled={busy || dirty} onChange={e => { setMotive(e.target.value); setFamily(data.motives.find(m => m.id === e.target.value)?.counterFamily ?? 'none'); setNotice(''); }}>
          {data.motives.map(m => <option key={m.id} value={m.id}>{m.label}{m.active ? '' : ' · inactif'}</option>)}
        </select>
      </label>
      <label className="block">Compteur à utiliser
        <select className="cf-input w-full min-h-[44px] px-3 rounded-xl" disabled={busy || !data.canEdit || !current} value={family} onChange={e => setFamily(e.target.value as CounterFamily)}>
          <option value="none">Aucun décompte lié</option><option value="cp">Congés payés · période en cours et reliquat précédent</option><option value="rtt">RTT</option>
        </select>
      </label>
      {!data.canEdit && <p>Vos droits permettent uniquement la consultation de ces règles.</p>}
      <div className="flex flex-wrap gap-2">
        <button className="cf-brand-gradient text-white min-h-[44px] px-4 rounded-xl disabled:opacity-50" disabled={busy || !dirty || !data.canEdit}>Enregistrer le décompte du motif</button>
        {dirty && <button type="button" className="cf-card-secondary min-h-[44px] px-4 rounded-xl" disabled={busy} onClick={() => setFamily(current?.counterFamily ?? 'none')}>Annuler mes changements</button>}
      </div>
      <p className="text-sm cf-muted">Les soldes appartiennent au dossier du collaborateur, même s’il travaille dans les deux clubs. Ce réglage ne calcule pas l’acquisition de congés, les jours ouvrés ni la paie.</p>
    </form>}
  </section>;
}
