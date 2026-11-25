import { useEffect, useState } from 'react';
import type { ClubId } from '../../types/cfos';
import { fetchPersonalCarry, type PersonalCarrySnapshot } from '../../domain/hrPersonalCarry';

const day = (value: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(value + 'T12:00:00Z'));
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export function PersonalCarryPanel({ actorId, club }: { actorId: string; club: ClubId }) {
  const [data, setData] = useState<PersonalCarrySnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(''); setLoading(true);
    fetchPersonalCarry(actorId, club, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(() => { if (!controller.signal.aborted) setError('Vos reports ne sont pas disponibles. Réessayez ou contactez votre responsable.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [actorId, club, reload]);
  return <section className="cf-card-secondary p-4 space-y-3 min-w-0 break-words" aria-label="Mes reports exceptionnels">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">Mes reports exceptionnels</h4><button type="button" disabled={loading} className="cf-card px-3 py-2 min-h-[44px] rounded-xl disabled:opacity-50" onClick={() => setReload(n => n + 1)}>Actualiser mes reports</button></div>
    <p className="cf-muted">Ces suivis concernent des jours déjà compris dans votre reliquat N-1. Ils ne s’ajoutent pas à vos congés.</p>
    {loading && <p role="status">Chargement de vos reports…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <><p>Reliquat actuel confirmé : {number.format(data.priorBalance)} j.</p>
      {!data.items.length && <p>Aucun report exceptionnel consigné pour votre dossier.</p>}
      {data.items.map(r => <article className="cf-card p-3 rounded-xl space-y-2" key={r.id}>
        <h5 className="font-semibold">Période du {day(r.sourceStart)} au {day(r.sourceEnd)} · {r.status === 'open' ? 'Suivi ouvert' : 'Suivi clôturé'}</h5>
        <p>Jours encore concernés au dernier rapprochement : {number.format(r.reviewedRemainingDays)} j sur {number.format(r.initialDays)} j au relevé initial.</p>
        <p>Échéance consignée par votre responsable : {day(r.availableUntil)}.</p>
        {r.balanceChanged && <p role="status" className="text-amber-400">Votre reliquat a changé depuis ce relevé. Les jours encore concernés doivent être rapprochés par votre responsable.</p>}
        {r.deadlinePassed && <p role="status" className="text-amber-400">Cette échéance est dépassée : contactez votre responsable. Aucun congé n’est supprimé automatiquement.</p>}
        {r.status === 'closed' && <p>La clôture de ce suivi ne retire aucun congé de votre compteur.</p>}
      </article>)}
      <p className="text-xs cf-muted">Cette consultation ne remplace pas une information formelle sur vos droits. Pour toute question ou correction, contactez votre responsable.</p>
    </>}
  </section>;
}
