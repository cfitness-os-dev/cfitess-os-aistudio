import { useEffect, useState } from 'react';
import type { ClubId } from '../../types/cfos';
import { fetchHeitzRecoveryLinks, type HeitzRecoveryLinks } from '../../domain/heitzRecoveryLinks';

export function HeitzRecoveryLinksPanel({ actorId, caseId, club, revision, disabled }: { actorId: string; caseId: string; club: ClubId; revision: string; disabled: boolean }) {
  const [state, setState] = useState<{ data: HeitzRecoveryLinks | null; error: string }>({ data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: '' });
    if (!disabled) void fetchHeitzRecoveryLinks(actorId, caseId, club, revision, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ data, error: '' });
    }).catch((e: unknown) => {
      if (!controller.signal.aborted) setState({ data: null, error: e instanceof Error ? e.message : 'Accès Heitz indisponible.' });
    });
    return () => controller.abort();
  }, [actorId, caseId, club, revision, disabled]);
  const data = state.data && state.data.actorId === actorId && state.data.caseId === caseId && state.data.clubId === club && state.data.revision === revision ? state.data : null;
  const urls = data?.urls;
  return <section aria-label="Consulter le dossier dans Heitz" className="cf-card-secondary p-4 rounded-xl space-y-3 min-w-0 break-words">
    <h4 className="font-semibold">Vérifier les règlements et les pièces dans Heitz</h4>
    <p className="text-sm cf-muted">Pour les informations qui ne remontent pas encore ici, consultez le dossier d’origine. Heitz conserve sa propre connexion et ses propres droits.</p>
    {disabled ? <p>Terminez ou abandonnez votre saisie avant d’ouvrir le dossier.</p> : state.error ? <p role="status">{state.error}</p> : !data ? <p role="status">Vérification des accès…</p> : urls ? <>
      <div className="flex flex-wrap gap-2">{([
        ['financial', 'Règlements et rejets'], ['subscriptions', 'Abonnements et accès'], ['documents', 'Contrats et documents'],
      ] as const).map(([key, label]) => <a key={key} href={urls[key]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center cf-brand-gradient text-white px-3 py-2 min-h-[44px] rounded-xl">{label}<span className="sr-only"> — ouvre Heitz dans un nouvel onglet</span></a>)}</div>
      <p className="text-xs cf-muted">{data.notice}</p>
    </> : <p role="status">{data.demoOffline ? 'Démonstration sur données fictives : les accès à Heitz sont désactivés.' : 'L’adresse du dossier Heitz de ce club reste à confirmer par un administrateur. Aucun accès n’est inventé.'}</p>}
  </section>;
}
