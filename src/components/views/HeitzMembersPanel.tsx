import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ExternalLink, RefreshCw, Search, Upload, UserRound } from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import { clientApi } from '../../domain/clientApi';
import { filterHeitzMembers, selectedHeitzMember, safeHeitzWebUrl, parseHeitzSnapshot } from '../../domain/heitzCrm';
import { HeitzCrmEditor } from '../../domain/heitzCrmEditor';

export function HeitzMembersPanel() {
  const { currentUser, clubFilter } = useCfos();
  const club = clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie';
  const clubName = club === 'beynost' ? 'Beynost' : 'Carré de Soie';
  const editor = useMemo(() => {
    const auth = { actorId: currentUser.id, siteId: club === 'beynost' ? 'club-beynost' : 'club-carre-soie' };
    return new HeitzCrmEditor({ members: () => clientApi.getHeitzMembers(auth),
      integration: () => clientApi.getHeitzIntegration(auth), import: rows => clientApi.importHeitzSnapshot(auth, rows) });
  }, [currentUser.id, club]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => { void editor.load(); return editor.cancel; }, [editor]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [csv, setCsv] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  useEffect(() => { setSelectedId(''); setQuery(''); setCsv(''); setImportOpen(false); setInputError(null); }, [editor]);
  const rows = filterHeitzMembers(state.rows, club, query);
  const selected = selectedHeitzMember(rows, selectedId);
  const webUrl = safeHeitzWebUrl(state.integration?.webUrls[club]);
  const canImport = state.status === 'ready' && state.integration?.canImportSnapshot;
  async function importSnapshot() {
    setInputError(null);
    try {
      if (await editor.import(parseHeitzSnapshot(csv, club))) setCsv('');
    } catch (error) { setInputError(error instanceof Error ? error.message : 'Export invalide.'); }
  }
  const webAccess = (label: string) => webUrl
    ? <a href={webUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 cf-brand-gradient text-white rounded-btn px-4 py-2.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-violet-300">
        <ExternalLink className="w-4 h-4" aria-hidden="true" />{label}<span className="sr-only"> (nouvel onglet)</span>
      </a>
    : <p className="text-sm cf-muted">L’accès web Heitz de ce club reste à configurer auprès du responsable.</p>;

  return <div className="space-y-4">
    <header className="cf-card p-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold flex items-center gap-2"><UserRound className="w-6 h-6 text-violet-400" aria-hidden="true" />Adhérents – CRM</h1>
        <p className="text-sm cf-muted mt-2">{clubName} · Consultation des dossiers importés de HeitzSystem.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {webAccess('Ouvrir HeitzSystem')}
        <button type="button" onClick={() => void editor.load()} disabled={state.saving || state.status === 'loading'} className="cf-card-secondary rounded-btn px-3 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />Actualiser
        </button>
        {canImport && <button type="button" disabled={state.saving} onClick={() => setImportOpen(!importOpen)} className="cf-card-secondary rounded-btn px-3 py-2.5 text-sm inline-flex items-center gap-2"><Upload className="w-4 h-4" aria-hidden="true" />Importer un export Heitz</button>}
      </div>
    </header>
    <div className="cf-card p-4 text-sm cf-muted space-y-2">
      <p>HeitzSystem reste la référence. Création d’adhérent, abonnement, impayé et badge sont à gérer dans Heitz.</p>
      <p>Ces dossiers sont une copie de consultation, sans synchronisation en direct. Aucune opération d’écriture Heitz n’est actuellement disponible ici.</p>
      {webUrl && <p>L’adresse web est fournie par le club et reste à confirmer avec Heitz. La connexion se fait dans son interface ; aucun mot de passe n’est transmis par ce lien.</p>}
    </div>
    {state.status === 'loading' && <p role="status" className="cf-card p-5">Chargement des dossiers de {clubName}…</p>}
    {(state.error || inputError) && <div role="alert" className="cf-card border-rose-500 p-4 text-rose-300 space-y-2"><p>{inputError ?? state.error}</p><p className="text-sm">Aucun succès n’a été confirmé. Vous pouvez réessayer ou actualiser les dossiers.</p></div>}
    {state.status === 'error' && <button type="button" onClick={() => void editor.load()} className="cf-card-secondary px-4 py-2 rounded-btn">Réessayer le chargement</button>}
    {state.saved && <p role="status" className="cf-card p-4 text-emerald-300">Export enregistré et dossiers relus sur le serveur C.Fitness OS. Aucun dossier n’a été créé ou modifié dans Heitz.</p>}
    {importOpen && canImport && <section className="cf-card p-4 space-y-3" aria-labelledby="heitz-import-title">
      <h2 id="heitz-import-title" className="font-semibold">Importer une copie de consultation</h2>
      <p className="text-sm cf-muted">Collez l’export CSV Heitz : prénom, nom, badge ou identifiant, club, abonnement, solde et actif. Un club inconnu ou un conflit d’identifiant annule l’import complet.</p>
      <label className="block text-sm">Contenu de l’export Heitz
        <textarea value={csv} onChange={event => { setCsv(event.target.value); setInputError(null); }} disabled={state.saving} rows={6} className="cf-input w-full p-3 mt-2 font-mono text-sm" spellCheck={false} />
      </label>
      <button type="button" disabled={state.saving || !csv.trim()} onClick={() => void importSnapshot()} className="cf-brand-gradient text-white rounded-btn px-4 py-2.5 disabled:opacity-50">{state.saving ? 'Import et relecture…' : 'Enregistrer la copie de consultation'}</button>
    </section>}
    {state.status === 'ready' && <section className="grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)] gap-4">
      <div className="cf-card p-4 space-y-3 min-w-0">
        <label className="block text-sm font-semibold">Rechercher un adhérent
          <span className="relative block mt-2"><Search className="absolute left-3 top-3 w-4 h-4 cf-muted" aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} className="cf-input w-full pl-9 pr-3 py-2.5" placeholder="Nom, badge, téléphone ou email…" autoComplete="off" /></span>
        </label>
        <p role="status" className="text-xs cf-muted">{rows.length} dossier(s) affiché(s) · {clubName}</p>
        {!rows.length && <p className="text-sm cf-muted">Aucun dossier ne correspond à cette recherche dans ce club.</p>}
        <ul className="space-y-2">
          {rows.map(member => <li key={member.id}><button type="button" aria-pressed={selected?.id === member.id} onClick={() => setSelectedId(member.id)} className={`w-full text-left p-3 rounded-btn border focus-visible:ring-2 focus-visible:ring-violet-400 ${selected?.id === member.id ? 'border-violet-400 bg-violet-500/15' : 'cf-card-secondary'}`}>
            <span className="block font-semibold break-words">{member.firstName} {member.lastName}</span>
            <span className="block text-xs cf-muted break-all mt-1">{member.badgeCode || 'Identifiant sans badge'}</span>
          </button></li>)}
        </ul>
      </div>
      <article className="cf-card p-5 min-w-0 space-y-4" aria-label="Dossier adhérent sélectionné">
        {!selected ? <p className="cf-muted">Sélectionnez un dossier dans les résultats de ce club.</p> : <>
          <h2 className="text-lg font-bold break-words">{selected.firstName} {selected.lastName}</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[['Club de rattachement', clubName], ['Identifiant Heitz importé', selected.badgeCode || selected.id], ['Téléphone', selected.phone || 'Non renseigné'], ['Email', selected.email || 'Non renseigné'], ['Abonnement importé', selected.subscriptionName || 'Non renseigné']].map(([label, value]) => <div key={label}><dt className="cf-muted">{label}</dt><dd className="break-words mt-1">{value}</dd></div>)}
          </dl>
          <p className="text-sm cf-muted">Pour vérifier le statut actuel, modifier l’abonnement, traiter un impayé ou gérer un badge, consultez HeitzSystem.</p>
          {webAccess('Consulter et agir dans Heitz')}
          <p className="text-xs cf-muted">Le lien ouvre la connexion Heitz, sans sélectionner automatiquement ce dossier.</p>
        </>}
      </article>
    </section>}
  </div>;
}
