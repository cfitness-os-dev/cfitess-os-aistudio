import { useEffect, useRef, useState } from 'react';
import type { ClubId } from '../../types/cfos';
import { fetchHeitzRecoveryReadings, type HeitzRecoveryReadings, type SourceSection } from '../../domain/heitzRecoveryReadings';
const date = (s: string) => new Date(s).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
function Status({ source }: {
    source: SourceSection<unknown>;
}) { return source.status === 'unavailable' ? <p role="status">{source.message}</p> : !source.items.length ? <p>Aucun élément renvoyé pour cette lecture. Cela ne certifie pas un historique complet.</p> : null; }
export function HeitzRecoveryReadingsPanel({ actorId, caseId, club, revision, disabled }: {
    actorId: string;
    caseId: string;
    club: ClubId;
    revision: string;
    disabled: boolean;
}) {
    const [data, setData] = useState<HeitzRecoveryReadings | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const request = useRef<AbortController | null>(null);
    useEffect(() => { request.current?.abort(); setData(null); setError(''); setBusy(false); return () => request.current?.abort(); }, [actorId, caseId, club, revision]);
    async function load() { if (busy || disabled)
        return; request.current?.abort(); const c = new AbortController(); request.current = c; setBusy(true); setError(''); setData(null); try {
        const v = await fetchHeitzRecoveryReadings(actorId, caseId, club, revision, c.signal);
        if (!c.signal.aborted)
            setData(v);
    }
    catch (e) {
        if (!c.signal.aborted)
            setError(e instanceof Error ? e.message : 'Lecture non confirmée.');
    }
    finally {
        if (!c.signal.aborted)
            setBusy(false);
    } }
    return <section className="cf-card-secondary p-4 rounded-xl space-y-3 min-w-0 break-words" aria-label="Sources Heitz du dossier">
   <h4 className="font-semibold">Échéanciers et abonnements Heitz</h4>
   <p className="text-sm cf-muted">Lecture à la demande du dossier synchronisé. Les échéances prévues ne sont pas des règlements encaissés ; les abonnements actifs ne prouvent pas la signature d’un contrat ou des CGV.</p>
   <button type="button" disabled={disabled || busy} className="cf-brand-gradient text-white px-3 py-2 min-h-[44px] rounded-xl disabled:opacity-50" onClick={() => void load()}>{busy ? 'Lecture des sources…' : 'Lire les échéanciers et abonnements Heitz'}</button>
   {disabled && <p className="text-sm">Terminez ou abandonnez la saisie avant de consulter les sources.</p>}{error && <p role="alert">{error}</p>}
   {data && <>
     <p role="status">Lecture du {new Date(data.collectedAtUtc).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}{data.partial ? ' · Certaines sources restent non confirmées.' : '.'} Cette lecture ne garantit pas que tout l’historique est présent.</p>
     <details><summary className="cursor-pointer font-semibold min-h-[44px]">Échéances prévisionnelles</summary><Status source={data.provisional}/>{data.provisional.status === 'loaded' && data.provisional.items.map((r, i) => <article key={i} className="cf-card p-3 mt-2 rounded-xl"><p>{date(r.date)}</p><p>Règlement prévu : {r.valuePayment.toFixed(2)} · Vente prévue : {r.valueSale.toFixed(2)}</p><p className="cf-muted text-xs">Montants source ; devise à confirmer. Aucun encaissement déduit.</p></article>)}</details>
     <details><summary className="cursor-pointer font-semibold min-h-[44px]">Échéancier affiché par Heitz</summary><Status source={data.display}/>{data.display.status === 'loaded' && data.display.items.map(r => <article key={r.id} className="cf-card p-3 mt-2 rounded-xl"><strong>{r.label || 'Libellé non fourni'} · Référence {r.id}</strong><p>{r.access || 'Accès non renseigné'}</p><p>Vente : {r.totalSale ?? 'Non renseignée'} · Règlement prévu : {r.totalPayment ?? 'Non renseigné'}</p><p>{r.period ?? 'Périodicité non fournie'} · Prochaine échéance : {r.next ? date(r.next) : 'Non fournie'}</p></article>)}</details>
     <details><summary className="cursor-pointer font-semibold min-h-[44px]">Abonnements actifs retournés</summary><Status source={data.subscriptions}/>{data.subscriptions.status === 'loaded' && data.subscriptions.items.map(r => <p key={r.id}>Référence {r.id} · {r.accessLabel || 'Libellé non fourni par Heitz'}</p>)}<p className="text-xs cf-muted">Cette liste montre les abonnements actifs renvoyés. Elle ne comprend pas les contrats signés ni les CGV.</p></details>
     <p className="text-sm">Règlements effectués, contrats originaux et CGV : collecte détaillée encore à raccorder. {data.documents.message}</p>
     <p className="text-xs cf-muted">{data.notice} Cette consultation n’ajoute aucune vérification documentaire au registre.</p>
   </>}
 </section>;
}
