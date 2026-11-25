import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  Eye,
  EyeOff,
  ExternalLink,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserRound,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import { clientApi } from '../../domain/clientApi';
import {
  describeHeitzAccessStatus,
  filterHeitzMembers,
  filterHeitzMembersByStatus,
  isHeitzMemberUnpaid,
  maskRgpdEmail,
  maskRgpdPhone,
  parseHeitzSnapshot,
  pseudonymizeMemberName,
  safeHeitzWebUrl,
  selectedHeitzMember,
  type HeitzStatusFilter,
} from '../../domain/heitzCrm';
import { describeHeitzCollection } from '../../domain/heitzCollection';
import { HeitzCrmEditor } from '../../domain/heitzCrmEditor';

interface HeitzLiveOverviewPayload {
  configured: boolean;
  liveConnected: boolean;
  baseUrl: string;
  centerIds: Record<string, number>;
  syncedMembersCount: number;
  financesRedactedRgpd?: boolean;
  error?: string;
  fmiToday?: {
    date: string;
    entriesToday: number;
    exitsToday: number;
    currentPresent: number;
    peakPresent: number;
  } | null;
  recentPassages?: Array<{
    id: string;
    clubId: string;
    idCenter: number;
    memberId: string;
    memberDisplayName?: string;
    badgeCode: string;
    timestamp: string;
    granted: boolean;
    reason: string;
  }>;
  recentTickets?: Array<{
    idTicket: number;
    ticketNumber: string | null;
    clubId: string;
    date: string | null;
    sellerName: string | null;
    operation: string | null;
    amountTtcEur: number;
  }>;
  rooms?: Array<{
    id: number;
    label: string;
    idCenter: number;
  }>;
}

function buildHeitzHeaders(actorId: string, siteId: string): Record<string, string> {
  const headers: Record<string, string> = {
    'x-cfitness-actor-id': actorId,
    'x-cfitness-site-id': siteId,
  };
  try {
    const token = window.sessionStorage.getItem('cfos_bearer_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // ignore
  }
  return headers;
}

export function HeitzMembersPanel() {
  const { currentUser, clubFilter, canAccessRecovery } = useCfos();
  const club = clubFilter === 'beynost' ? 'beynost' : 'carre-de-soie';
  const clubName = club === 'beynost' ? 'Beynost' : 'Carré de Soie';
  const siteId = club === 'beynost' ? 'club-beynost' : 'club-carre-soie';
  const centerId = club === 'beynost' ? 4967 : 3845;

  // RGPD Art. 5.1.c & Art. 32 (Besoin d'en connaître) :
  // Seuls la Direction, les Responsables et les collaborateurs habilités Finances ou Recouvrement
  // ont accès aux montants exacts des dettes et aux tickets de caisse TPV.
  const canSeeFinancialAmount =
    currentUser.role === 'admin' ||
    currentUser.role === 'manager' ||
    Boolean(currentUser.canAccessFinances) ||
    Boolean(canAccessRecovery);

  const editor = useMemo(() => {
    const auth = { actorId: currentUser.id, siteId };
    return new HeitzCrmEditor({
      members: () => clientApi.getHeitzMembers(auth),
      integration: () => clientApi.getHeitzIntegration(auth),
      import: rows => clientApi.importHeitzSnapshot(auth, rows),
    });
  }, [currentUser.id, siteId]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => {
    void editor.load();
    return editor.cancel;
  }, [editor]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HeitzStatusFilter>('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [revealContactDetails, setRevealContactDetails] = useState(false);
  const [csv, setCsv] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [liveOverview, setLiveOverview] = useState<HeitzLiveOverviewPayload | null>(null);
  const liveContext = `${currentUser.id}:${siteId}`;
  const activeLiveContext = useRef(liveContext);
  activeLiveContext.current = liveContext;
  const liveReadVersion = useRef(0);
  const [syncingLive, setSyncingLive] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadLiveOverview = useCallback(async () => {
    if (activeLiveContext.current !== liveContext) return;
    const requestVersion = ++liveReadVersion.current;
    setLiveOverview(null);
    try {
      const res = await fetch('/api/heitz/live-overview', {
        headers: buildHeitzHeaders(currentUser.id, siteId),
      });
      if (!res.ok) return;
      const payload = (await res.json()) as HeitzLiveOverviewPayload;
      if (requestVersion === liveReadVersion.current && activeLiveContext.current === liveContext) setLiveOverview(payload);
    } catch {
      // ignore offline in unit tests
    }
  }, [currentUser.id, siteId, liveContext]);

  useEffect(() => {
    setSyncMessage(null); setInputError(null); setSyncingLive(false);
    void loadLiveOverview();
    return () => { liveReadVersion.current += 1; };
  }, [loadLiveOverview]);

  async function triggerLiveSync() {
    setSyncingLive(true);
    setInputError(null);
    setSyncMessage(null);
    try {
      const res = await fetch('/api/heitz/sync-live', {
        method: 'POST',
        headers: buildHeitzHeaders(currentUser.id, siteId),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        syncedMembersCount?: number;
        carreDeSoieMembers?: number;
        beynostMembers?: number;
        entriesToday?: number;
        error?: string;
      };
      if (activeLiveContext.current !== liveContext) return;
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || `Erreur serveur HTTP ${res.status}`);
      }
      setSyncMessage(describeHeitzCollection(payload));
      await editor.load();
      await loadLiveOverview();
    } catch (err) {
      if (activeLiveContext.current === liveContext) setInputError(err instanceof Error ? err.message : 'Échec de synchronisation Heitz Cloud.');
    } finally {
      if (activeLiveContext.current === liveContext) setSyncingLive(false);
    }
  }

  useEffect(() => {
    setSelectedId('');
    setQuery('');
    setStatusFilter('ALL');
    setRevealContactDetails(false);
    setCsv('');
    setImportOpen(false);
    setInputError(null);
  }, [editor]);

  // Re-masquer automatiquement les coordonnées lors du changement de fiche (Protection comptoir RGPD Art. 25)
  useEffect(() => {
    setRevealContactDetails(false);
  }, [selectedId]);

  const clubRows = filterHeitzMembers(state.rows, club, query);
  const rows = filterHeitzMembersByStatus(clubRows, statusFilter);
  const selected = selectedHeitzMember(rows, selectedId);
  const webUrl = safeHeitzWebUrl(state.integration?.webUrls[club]);
  const canImport = state.status === 'ready' && state.integration?.canImportSnapshot;

  const okCount = clubRows.filter(m => m.activeSubscription && !isHeitzMemberUnpaid(m)).length;
  const unpaidCount = clubRows.filter(m => isHeitzMemberUnpaid(m)).length;
  const inactiveCount = clubRows.filter(m => !m.activeSubscription).length;

  async function importSnapshot() {
    setInputError(null);
    try {
      if (await editor.import(parseHeitzSnapshot(csv, club))) setCsv('');
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Export invalide.');
    }
  }
  const webAccess = (label: string) =>
    webUrl ? (
      <a
        href={webUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 cf-brand-gradient text-white rounded-btn px-4 py-2.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-violet-300"
      >
        <ExternalLink className="w-4 h-4" aria-hidden="true" />
        {label}
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    ) : (
      <p className="text-sm cf-muted">
        L’accès web Heitz de ce club reste à configurer auprès du responsable.
      </p>
    );

  const selectedStatus = selected
    ? describeHeitzAccessStatus(selected, canSeeFinancialAmount)
    : null;

  return (
    <div className="space-y-4">
      <header className="cf-card p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UserRound className="w-6 h-6 text-violet-400" aria-hidden="true" />
            Adhérents – CRM
          </h1>
          <p className="text-sm cf-muted mt-2">
            {clubName} (Centre Heitz #{centerId}) · Consultation des dossiers synchronisés depuis HeitzSystem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {webAccess('Ouvrir HeitzSystem')}
          {canImport && liveOverview?.configured && (
            <button
              type="button"
              onClick={() => void triggerLiveSync()}
              disabled={syncingLive || state.saving}
              className="cf-brand-gradient text-white rounded-btn px-3.5 py-2.5 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncingLive ? 'animate-spin' : ''}`} aria-hidden="true" />
              {syncingLive ? 'Sync Heitz Cloud…' : 'Synchroniser Heitz Cloud'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void editor.load();
              void loadLiveOverview();
            }}
            disabled={state.saving || state.status === 'loading'}
            className="cf-card-secondary rounded-btn px-3 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Actualiser
          </button>
          {canImport && (
            <button
              type="button"
              disabled={state.saving}
              onClick={() => setImportOpen(!importOpen)}
              className="cf-card-secondary rounded-btn px-3 py-2.5 text-sm inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              Importer un export Heitz
            </button>
          )}
        </div>
      </header>

      {/* Bandeau de conformité RGPD (Art. 5.1.c Minimisation & Art. 32 Confidentialité Comptoir) */}
      <section
        className="cf-card p-3.5 border border-violet-500/30 text-xs flex flex-wrap items-center justify-between gap-3"
        aria-label="Cadre légal RGPD et confidentialité au comptoir"
      >
        <div className="flex items-start sm:items-center gap-2.5">
          <Lock className="w-4 h-4 text-violet-400 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          <div>
            <span className="font-semibold">
              Protection RGPD active (Art. 5.1.c &amp; Art. 32 — Besoin d’en connaître) :
            </span>{' '}
            <span className="cf-muted">
              Coordonnées masquées par défaut contre les regards indiscrets au comptoir ·{' '}
              {canSeeFinancialAmount
                ? 'Habilitation Direction / Recouvrement : soldes financiers visibles.'
                : 'Profil Accueil : statut d’accès visible, montants financiers réservés aux responsables.'}
            </span>
          </div>
        </div>
      </section>

      {liveOverview?.liveConnected && (
        <section
          className="cf-card p-4 border border-emerald-500/40 space-y-3"
          aria-label="Télémétrie HeitzSystem Cloud en direct"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              Connecté en direct à HeitzSystem Cloud ({liveOverview.baseUrl} · Centre #{centerId} {clubName})
            </div>
            <span className="text-xs cf-muted">
              {clubRows.length} dossier(s) réel(s) sur {clubName}
            </span>
          </div>
          {liveOverview.fmiToday && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="cf-card-secondary p-3 rounded-btn">
                <span className="block text-xs cf-muted">Présents FMI (en direct)</span>
                <strong className="text-lg">{liveOverview.fmiToday.currentPresent}</strong>
              </div>
              <div className="cf-card-secondary p-3 rounded-btn">
                <span className="block text-xs cf-muted">Entrées du jour</span>
                <strong className="text-lg">{liveOverview.fmiToday.entriesToday}</strong>
              </div>
              <div className="cf-card-secondary p-3 rounded-btn">
                <span className="block text-xs cf-muted">Pic de fréquentation</span>
                <strong className="text-lg">{liveOverview.fmiToday.peakPresent}</strong>
              </div>
              <div className="cf-card-secondary p-3 rounded-btn">
                <span className="block text-xs cf-muted">Salles planning Heitz</span>
                <strong className="text-lg">{liveOverview.rooms?.length ?? 0}</strong>
              </div>
            </div>
          )}
          {Boolean(liveOverview.recentPassages?.length) && (
            <div className="text-xs cf-muted flex flex-wrap items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
              <span>Derniers passages portillons ({clubName} · format RGPD pseudonymisé) :</span>
              {liveOverview.recentPassages?.slice(0, 5).map(p => {
                const matchMember = state.rows.find(
                  m => m.id === p.memberId || m.badgeCode === p.badgeCode
                );
                const label =
                  p.memberDisplayName ||
                  (matchMember
                    ? pseudonymizeMemberName(matchMember.firstName, matchMember.lastName)
                    : p.badgeCode);
                return (
                  <span
                    key={p.id}
                    className={`cf-card-secondary px-2.5 py-1 rounded inline-flex items-center gap-1.5 ${
                      p.granted ? 'border border-emerald-500/30' : 'border border-rose-500/40'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        p.granted ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                      aria-hidden="true"
                    />
                    <strong className="font-semibold">{label}</strong>
                    <span>({p.timestamp ? p.timestamp.slice(11, 19) : 'direct'})</span>
                  </span>
                );
              })}
            </div>
          )}
          {Boolean(liveOverview.rooms?.length) && (
            <div className="text-xs cf-muted flex flex-wrap items-center gap-1.5">
              <span>Salles &amp; espaces configurés dans Heitz :</span>
              {liveOverview.rooms?.map(r => (
                <span key={r.id} className="cf-card-secondary px-2 py-0.5 rounded">
                  {r.label}
                </span>
              ))}
            </div>
          )}
          {canSeeFinancialAmount && Boolean(liveOverview.recentTickets?.some(t => t.clubId === club)) && (
            <div className="text-xs cf-muted flex flex-wrap items-center gap-2 pt-1 border-t border-slate-700/30">
              <span>Derniers tickets TPV (accès Direction / Finances) :</span>
              {liveOverview.recentTickets?.filter(t => t.clubId === club).slice(0, 3).map(t => (
                <span key={t.idTicket} className="cf-card-secondary px-2 py-0.5 rounded">
                  #{t.ticketNumber || t.idTicket} · {t.operation} ·{' '}
                  <strong>{t.amountTtcEur.toFixed(2)} € TTC</strong>
                </span>
              ))}
            </div>
          )}
        </section>
      )}
      {syncMessage && (
        <p role="status" className="cf-card p-4 text-emerald-300 text-sm">
          {syncMessage}
        </p>
      )}
      <div className="cf-card p-4 text-sm cf-muted space-y-2">
        <p>
          HeitzSystem reste la référence officielle. Création d’adhérent, modification d’abonnement, règlement d’impayé et attribution de badge sont à effectuer dans Heitz.
        </p>
        <p>
          {liveOverview?.liveConnected
            ? 'Consultation synchronisée en lecture seule depuis HeitzSystem Cloud. Aucune opération d’écriture Heitz n’est effectuée depuis cet écran.'
            : 'Ces dossiers sont une copie de consultation en lecture seule. Aucune opération d’écriture Heitz n’est actuellement disponible ici.'}
        </p>
        {webUrl && (
          <p>
            L’adresse web est fournie par le club et reste à confirmer avec Heitz. La connexion se fait dans son interface ; aucun mot de passe n’est transmis par ce lien.
          </p>
        )}
      </div>
      {state.status === 'loading' && (
        <p role="status" className="cf-card p-5">
          Chargement des dossiers de {clubName}…
        </p>
      )}
      {(state.error || inputError) && (
        <div role="alert" className="cf-card border-rose-500 p-4 text-rose-300 space-y-2">
          <p>{inputError ?? state.error}</p>
          <p className="text-sm">
            Aucun succès n’a été confirmé. Vous pouvez réessayer ou actualiser les dossiers.
          </p>
        </div>
      )}
      {state.status === 'error' && (
        <button
          type="button"
          onClick={() => void editor.load()}
          className="cf-card-secondary px-4 py-2 rounded-btn"
        >
          Réessayer le chargement
        </button>
      )}
      {state.saved && (
        <p role="status" className="cf-card p-4 text-emerald-300">
          Export enregistré et dossiers relus sur le serveur C.Fitness OS. Aucun dossier n’a été créé ou modifié dans Heitz.
        </p>
      )}
      {importOpen && canImport && (
        <section className="cf-card p-4 space-y-3" aria-labelledby="heitz-import-title">
          <h2 id="heitz-import-title" className="font-semibold">
            Importer une copie de consultation
          </h2>
          <p className="text-sm cf-muted">
            Collez l’export CSV Heitz : prénom, nom, badge ou identifiant, club, abonnement, solde et actif. Un club inconnu ou un conflit d’identifiant annule l’import complet.
          </p>
          <label className="block text-sm">
            Contenu de l’export Heitz
            <textarea
              value={csv}
              onChange={event => {
                setCsv(event.target.value);
                setInputError(null);
              }}
              disabled={state.saving}
              rows={6}
              className="cf-input w-full p-3 mt-2 font-mono text-sm"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            disabled={state.saving || !csv.trim()}
            onClick={() => void importSnapshot()}
            className="cf-brand-gradient text-white rounded-btn px-4 py-2.5 disabled:opacity-50"
          >
            {state.saving ? 'Import et relecture…' : 'Enregistrer la copie de consultation'}
          </button>
        </section>
      )}
      {state.status === 'ready' && (
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)] gap-4">
          <div className="cf-card p-4 space-y-3 min-w-0">
            <label className="block text-sm font-semibold">
              Rechercher un adhérent
              <span className="relative block mt-2">
                <Search className="absolute left-3 top-3 w-4 h-4 cf-muted" aria-hidden="true" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className="cf-input w-full pl-9 pr-3 py-2.5"
                  placeholder="Nom, badge, téléphone ou email…"
                  autoComplete="off"
                />
              </span>
            </label>

            {/* Filtres rapides par statut opérationnel */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs" role="group" aria-label="Filtrer par statut d'accès">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                aria-pressed={statusFilter === 'ALL'}
                className={`px-2 py-1.5 rounded-btn font-semibold border ${
                  statusFilter === 'ALL'
                    ? 'border-violet-400 bg-violet-500/20'
                    : 'cf-card-secondary'
                }`}
              >
                Tous ({clubRows.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('OK')}
                aria-pressed={statusFilter === 'OK'}
                className={`px-2 py-1.5 rounded-btn font-semibold border ${
                  statusFilter === 'OK'
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                    : 'cf-card-secondary'
                }`}
              >
                À jour ({okCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('UNPAID')}
                aria-pressed={statusFilter === 'UNPAID'}
                className={`px-2 py-1.5 rounded-btn font-semibold border ${
                  statusFilter === 'UNPAID'
                    ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                    : 'cf-card-secondary'
                }`}
              >
                {canSeeFinancialAmount ? `Impayés (${unpaidCount})` : `À vérifier (${unpaidCount})`}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('INACTIVE')}
                aria-pressed={statusFilter === 'INACTIVE'}
                className={`px-2 py-1.5 rounded-btn font-semibold border ${
                  statusFilter === 'INACTIVE'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                    : 'cf-card-secondary'
                }`}
              >
                Inactifs ({inactiveCount})
              </button>
            </div>

            <p role="status" className="text-xs cf-muted">
              {rows.length} dossier(s) affiché(s) · {clubName}
            </p>
            {!rows.length && (
              <p className="text-sm cf-muted">
                Aucun dossier ne correspond à cette recherche dans ce club.
              </p>
            )}
            <ul className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {rows.map(member => {
                const st = describeHeitzAccessStatus(member, canSeeFinancialAmount);
                const badgeToneClass =
                  st.tone === 'ok'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : st.tone === 'unpaid'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === member.id}
                      onClick={() => setSelectedId(member.id)}
                      className={`w-full text-left p-3 rounded-btn border focus-visible:ring-2 focus-visible:ring-violet-400 ${
                        selected?.id === member.id
                          ? 'border-violet-400 bg-violet-500/15'
                          : 'cf-card-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold break-words">
                          {member.firstName} {member.lastName}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${badgeToneClass}`}
                        >
                          {st.badgeLabel}
                        </span>
                      </div>
                      <span className="block text-xs cf-muted break-all mt-1">
                        {member.badgeCode || 'Identifiant sans badge'} ·{' '}
                        {member.subscriptionName || 'Formule non renseignée'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <article className="cf-card p-5 min-w-0 space-y-4" aria-label="Dossier adhérent sélectionné">
            {!selected || !selectedStatus ? (
              <p className="cf-muted">Sélectionnez un dossier dans les résultats de ce club.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold break-words">
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <p className="text-xs cf-muted mt-0.5">
                      Dossier Heitz #{selected.id} · {clubName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevealContactDetails(prev => !prev)}
                    className="cf-card-secondary rounded-btn px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    {revealContactDetails ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                        Masquer coordonnées (RGPD)
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        Afficher coordonnées
                      </>
                    )}
                  </button>
                </div>

                {/* Bandeau visuel immédiat de statut d'accès pour le staff */}
                <div
                  className={`p-3.5 rounded-btn border flex items-center gap-2.5 text-sm font-semibold ${
                    selectedStatus.tone === 'ok'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : selectedStatus.tone === 'unpaid'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {selectedStatus.tone === 'ok' ? (
                    <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{selectedStatus.detailLabel}</span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {[
                    ['Club de rattachement', clubName],
                    ['Identifiant Heitz importé', selected.badgeCode || selected.id],
                    [
                      'Téléphone',
                      revealContactDetails
                        ? selected.phone || 'Non renseigné'
                        : maskRgpdPhone(selected.phone),
                    ],
                    [
                      'Email',
                      revealContactDetails
                        ? selected.email || 'Non renseigné'
                        : maskRgpdEmail(selected.email),
                    ],
                    ['Abonnement importé', selected.subscriptionName || 'Non renseigné'],
                    ['Statut d’accès portillon', selectedStatus.badgeLabel],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="cf-muted">{label}</dt>
                      <dd className="break-words mt-1">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-sm cf-muted">
                  Pour vérifier le statut actuel, modifier l’abonnement, traiter un impayé ou gérer un badge, consultez HeitzSystem.
                </p>
                {webAccess('Consulter et agir dans Heitz')}
                <p className="text-xs cf-muted">
                  Le lien ouvre la connexion Heitz, sans sélectionner automatiquement ce dossier.
                </p>
              </>
            )}
          </article>
        </section>
      )}
    </div>
  );
}
