import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Compass,
  Lock,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { useCfos } from '../../context/CfosContext';
import type { ClubFilter } from '../../types/cfos';
import type { DashboardPayload } from '../../domain/apiEngine';
import {
  ApiClientError,
  clientApi,
  type RegistryPayload,
} from '../../domain/clientApi';
import type { AmbiguityRecord, McSectionId } from '../../domain/types';
import { PERSONA_OPTIONS } from '../Layout';
import { AdminRightsView } from '../../views/AdminRightsView';
import { DashboardView } from '../../views/DashboardView';
import { PlanningAndModulesView } from '../../views/PlanningAndModulesView';
import { PreferencesView } from '../../views/PreferencesView';
import { MyDayCollaboratorView } from './MyDayCollaboratorView';
import { PlanningHrView } from './PlanningHrView';
import { AtsView } from './AtsView';

export type MonCompteHubTab =
  | 'mon-compte'
  | 'traceability'
  | 'github-my-day'
  | 'github-planning';

interface MonCompteRhHubViewProps {
  subTarget?: string | null;
  planningOnly?: boolean;
}

function clubFilterToSiteId(filter: ClubFilter): string | 'all' {
  if (filter === 'carre-de-soie') return 'club-carre-soie';
  if (filter === 'beynost') return 'club-beynost';
  return 'all';
}

function siteIdToClubFilter(siteId: string | 'all'): ClubFilter {
  if (siteId === 'club-carre-soie') return 'carre-de-soie';
  if (siteId === 'club-beynost') return 'beynost';
  return 'all';
}

function parseInitialTarget(subTarget?: string | null): {
  tab: MonCompteHubTab;
  section: McSectionId;
  isPersonalSpace: boolean;
} {
  if (!subTarget) {
    return { tab: 'mon-compte', section: 'MC01', isPersonalSpace: false };
  }
  const normalized = subTarget.trim();
  if (normalized.toLowerCase() === 'personal') {
    return { tab: 'mon-compte', section: 'MC01', isPersonalSpace: true };
  }
  if (normalized === 'traceability') {
    return { tab: 'traceability', section: 'MC01', isPersonalSpace: false };
  }
  if (normalized === 'github-my-day') {
    return { tab: 'github-my-day', section: 'MC01', isPersonalSpace: false };
  }
  if (normalized === 'github-planning') {
    return { tab: 'github-planning', section: 'MC03', isPersonalSpace: false };
  }
  const upper = normalized.toUpperCase();
  if (/^MC(0[1-9]|1[0-3])$/.test(upper)) {
    return { tab: 'mon-compte', section: upper as McSectionId, isPersonalSpace: false };
  }
  return { tab: 'mon-compte', section: 'MC01', isPersonalSpace: false };
}

export function MonCompteRhHubView({ subTarget, planningOnly = false }: MonCompteRhHubViewProps) {
  const {
    currentUser,
    clubFilter,
    setClubFilter,
    isTechnicalMode,
    setActiveSection: setShellSection,
  } = useCfos();
  const initialTarget = parseInitialTarget(subTarget);
  const isPersonalSpace = !planningOnly && initialTarget.isPersonalSpace;
  const isShellAdmin = currentUser.role === 'admin' || currentUser.role === 'manager';
  const isStrictAdmin = currentUser.role === 'admin';

  const defaultActorForShellUser = () => currentUser.id;

  const [hubTab, setHubTab] = useState<MonCompteHubTab>(initialTarget.tab);

  useEffect(() => {
    if (!isTechnicalMode && (hubTab === 'traceability' || hubTab === 'github-planning')) {
      setHubTab('mon-compte');
    }
  }, [isTechnicalMode, hubTab]);
  const [activeActorId, setActiveActorId] = useState<string>(defaultActorForShellUser);
  const [bearerToken, setBearerToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const tok = window.sessionStorage.getItem('cfos_bearer_token');
      const actor = window.sessionStorage.getItem('cfos_bearer_actor_id');
      return tok && actor === defaultActorForShellUser() ? tok : null;
    } catch {
      return null;
    }
  });
  const [activeSiteId, setActiveSiteId] = useState<string | 'all'>(() =>
    currentUser.clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie'
  );
  const [activeSection, setActiveSection] = useState<McSectionId>(initialTarget.section);

  useEffect(() => {
    const onBearerUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ employeeId?: string; token?: string }>).detail;
      if (detail?.employeeId === activeActorId && detail?.token) {
        setBearerToken(detail.token);
      }
    };
    window.addEventListener('cfos-bearer-updated', onBearerUpdated);
    return () => window.removeEventListener('cfos-bearer-updated', onBearerUpdated);
  }, [activeActorId]);

  useEffect(() => {
    const nextActor = defaultActorForShellUser();
    setActiveActorId(nextActor);
    try {
      const tok = window.sessionStorage.getItem('cfos_bearer_token');
      const actor = window.sessionStorage.getItem('cfos_bearer_actor_id');
      setBearerToken(tok && actor === nextActor ? tok : null);
    } catch {
      setBearerToken(null);
    }
    const primarySite = currentUser.clubId === 'beynost' ? 'club-beynost' : 'club-carre-soie';
    setActiveSiteId(primarySite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.role, currentUser.clubId]);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [registry, setRegistry] = useState<RegistryPayload | null>(null);
  const [ambiguities, setAmbiguities] = useState<AmbiguityRecord[]>([]);
  const [backendKind, setBackendKind] = useState<string>('vite-middleware');
  const [forbiddenBanner, setForbiddenBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const auth = { actorId: activeActorId, siteId: activeSiteId, token: bearerToken };

  async function refreshAll(nextAuth = auth, verifySection?: McSectionId) {
    setLoading(true);
    setFatalError(null);
    try {
      const [healthRes, dashRes, regRes, ambRes] = await Promise.all([
        clientApi.getHealth(),
        clientApi.getDashboard(nextAuth),
        clientApi.getRegistry(nextAuth),
        clientApi.getAmbiguities(nextAuth),
      ]);
      setBackendKind(healthRes.backend);
      setDashboard(dashRes);
      setRegistry(regRes);
      setAmbiguities(ambRes);
      if (isStrictAdmin && dashRes.session.activeSiteId !== nextAuth.siteId) {
        setActiveSiteId(dashRes.session.activeSiteId);
      }

      if (verifySection) {
        try {
          await clientApi.assertSectionAccess(
            {
              actorId: nextAuth.actorId,
              siteId: dashRes.session.activeSiteId,
            },
            verifySection
          );
          setForbiddenBanner(null);
        } catch (err) {
          if (err instanceof ApiClientError && err.status === 403) {
            setForbiddenBanner(err.message);
            setHubTab('mon-compte');
            setActiveSection('MC01');
          }
        }
      }
    } catch (err) {
      setFatalError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les données RH CFitness OS.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll(
      { actorId: activeActorId, siteId: activeSiteId, token: bearerToken },
      hubTab === 'mon-compte' ? activeSection : undefined
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeActorId, activeSiteId, bearerToken]);

  // Synchronisation lorsque la navigation globale AdminShell change subTarget
  useEffect(() => {
    const parsed = parseInitialTarget(subTarget);
    if (parsed.isPersonalSpace && activeActorId !== currentUser.id) {
      setActiveActorId(currentUser.id);
    }
    setHubTab(parsed.tab);
    if (parsed.tab === 'mon-compte') {
      setActiveSection(parsed.section);
      if (dashboard) {
        void clientApi
          .assertSectionAccess(auth, parsed.section)
          .then(() => {
            setForbiddenBanner(null);
          })
          .catch((err) => {
            if (err instanceof ApiClientError && err.status === 403) {
              setForbiddenBanner(err.message);
              setActiveSection('MC01');
            }
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTarget, currentUser.id]);

  // Synchronisation avec le filtre club de la sidebar AdminShell
  useEffect(() => {
    const mapped = clubFilterToSiteId(clubFilter);
    if (mapped !== activeSiteId) {
      setActiveSiteId(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubFilter]);

  function syncUrl(nextPath: string) {
    if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
  }

  async function handleNavigateSection(sectionId: McSectionId) {
    setForbiddenBanner(null);
    try {
      await clientApi.assertSectionAccess(auth, sectionId);
      setHubTab('mon-compte');
      setActiveSection(sectionId);
      syncUrl(sectionId === 'MC01' ? '/mon-compte' : `/mon-compte/${sectionId}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        setForbiddenBanner(err.message);
      } else {
        setForbiddenBanner(
          err instanceof Error ? err.message : 'Erreur contrôle accès.'
        );
      }
    }
  }

  function handleNavigateTraceability() {
    setForbiddenBanner(null);
    setHubTab('traceability');
    syncUrl('/tracabilite');
  }

  function handleChangeActor(nextActorId: string) {
    setForbiddenBanner(null);
    setActiveActorId(nextActorId);
  }

  function handleChangeSite(nextSiteId: string | 'all') {
    setForbiddenBanner(null);
    setActiveSiteId(nextSiteId);
    const nextFilter = siteIdToClubFilter(nextSiteId);
    if (nextFilter !== clubFilter) {
      setClubFilter(nextFilter);
    }
  }

  // Vérité serveur exclusive : aucune projection synthétique côté client (#1 / #9)
  const effectiveDashboard: DashboardPayload | null =
    dashboard && dashboard.session.employee.id === currentUser.id ? dashboard : null;
  const identityMismatchBanner =
    dashboard && dashboard.session.employee.id !== currentUser.id
      ? `Identité serveur (${dashboard.session.employee.id}) différente de la session (${currentUser.id}). Dossier synthétique désactivé.`
      : null;

  const effectiveSitesForCanSelect = effectiveDashboard?.sites ?? dashboard?.sites ?? [];

  return (
    <div className="space-y-5">
      {/* Bandeau de sélection de vue unifiée (V1.16 Mon compte <-> Traçabilité <-> Vues GitHub CFOS) */}
      <div className="cf-card p-3 sm:p-4 space-y-3">
        {!planningOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setHubTab('mon-compte');
                syncUrl(
                  activeSection === 'MC01'
                    ? '/mon-compte'
                    : `/mon-compte/${activeSection}`
                );
              }}
              className={`px-3 py-2 rounded-btn text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                hubTab === 'mon-compte'
                  ? 'cf-brand-gradient text-white shadow-sm'
                  : 'cf-card-secondary hover:border-violet-500/50'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>
                {isPersonalSpace
                  ? 'Mon compte personnel'
                  : isTechnicalMode
                  ? 'Espace Mon compte RH V1.16 (MC01–MC13)'
                  : 'Collaborateurs et RH'}
              </span>
            </button>

            {isTechnicalMode && (
              <button
                type="button"
                onClick={handleNavigateTraceability}
                className={`px-3 py-2 rounded-btn text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  hubTab === 'traceability'
                    ? 'cf-brand-gradient text-white shadow-sm'
                    : 'cf-card-secondary hover:border-violet-500/50'
                }`}
              >
                <Compass className="w-4 h-4 text-violet-400 shrink-0" />
                <span>Traçabilité &amp; Livrables V1.16 (91/1605 • 111 captures)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setHubTab('github-my-day')}
              className={`px-3 py-2 rounded-btn text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                hubTab === 'github-my-day'
                  ? 'cf-brand-gradient text-white shadow-sm'
                  : 'cf-card-secondary hover:border-violet-500/50'
              }`}
            >
              <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                {isTechnicalMode
                  ? 'Ma Journée & Tâches Terrain (Vue GitHub CFOS)'
                  : 'Ma Journée & Tâches'}
              </span>
            </button>

            {isTechnicalMode && (
              <button
                type="button"
                onClick={() => setHubTab('github-planning')}
                className={`px-3 py-2 rounded-btn text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  hubTab === 'github-planning'
                    ? 'cf-brand-gradient text-white shadow-sm'
                    : 'cf-card-secondary hover:border-violet-500/50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Planning Unifié, Pointage &amp; Contrats CDI (Vue GitHub CFOS)</span>
              </button>
            )}
          </div>

          {dashboard && (
            <div className="text-[11px] cf-muted flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              {isTechnicalMode ? (
                <span>
                  Rôle et établissement :{' '}
                  <strong className="text-violet-300">
                    {dashboard.session.activeProfile.name}
                  </strong>{' '}
                  • Portée{' '}
                  <span className="cf-mono uppercase text-emerald-300">
                    {dashboard.session.activeProfile.scopeSelected}
                  </span>{' '}
                  • Backend <span className="cf-mono">{backendKind}</span>
                </span>
              ) : (
                <span>
                  Profil :{' '}
                  <strong className="text-violet-300">
                    {dashboard.session.activeProfile.name}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>
        )}

        {/* Contrôles de simulation RBAC V1.16 et barre MC01..MC13 */}
        {(hubTab === 'mon-compte' || hubTab === 'traceability') && dashboard && registry && (
          <div className={`${planningOnly ? '' : 'pt-3 border-t border-[var(--cf-border)]'} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {planningOnly && (
                  <div className="flex items-center gap-2 pr-2">
                    <Calendar className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="text-sm font-extrabold">Planning des équipes</span>
                  </div>
                )}
                {!planningOnly && !isPersonalSpace && isStrictAdmin && isTechnicalMode && (
                  <div className="flex items-center gap-2 min-w-0 max-w-full">
                    <Users className="w-4 h-4 text-violet-400 shrink-0" />
                    <label htmlFor="hub-persona-select" className="text-xs cf-muted hidden sm:inline shrink-0">
                      {isTechnicalMode ? 'Compte simulé :' : 'Collaborateur :'}
                    </label>
                    <select
                      id="hub-persona-select"
                      value={activeActorId}
                      onChange={(e) => handleChangeActor(e.target.value)}
                      className="cf-input text-xs px-2.5 py-1.5 font-medium w-full max-w-[260px] sm:max-w-xs min-w-0 truncate"
                    >
                      {PERSONA_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} — {p.roleSummary}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!planningOnly && (isPersonalSpace || !isStrictAdmin || !isTechnicalMode) && (
                  <div className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-800/40 border border-[var(--cf-border)] min-w-0 max-w-full">
                    <Users className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    <span className="truncate">
                      {currentUser.firstName} {currentUser.lastName} ({currentUser.jobTitle})
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 min-w-0 max-w-full">
                  <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <label htmlFor="hub-site-select" className="text-xs cf-muted hidden sm:inline shrink-0">
                    Club :
                  </label>
                  <select
                    id="hub-site-select"
                    value={activeSiteId}
                    onChange={(e) => handleChangeSite(e.target.value)}
                    className="cf-input text-xs px-2.5 py-1.5 font-medium w-full max-w-[220px] sm:max-w-xs min-w-0 truncate"
                  >
                    {effectiveSitesForCanSelect.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isTechnicalMode && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleNavigateSection('MC11')}
                    title="Tester l'accès direct à MC11 (Organisation & Droits) pour vérifier le refus HTTP 403 serveur selon le profil actif"
                    className="cf-input px-2.5 py-1.5 text-xs flex items-center gap-1.5 hover:border-violet-500/60 transition-colors cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tester URL /MC11</span>
                  </button>
                </div>
              )}
            </div>

            {/* Barre des sous-sections (retour à la ligne sans scrollbar) */}
            {!planningOnly && (
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                {isTechnicalMode && (
                  <span className="text-[11px] cf-mono cf-muted mr-1.5 flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    /mon-compte
                  </span>
                )}
                {registry.sections.map((sec) => {
                  const secId = sec.id as McSectionId;
                  if (!isTechnicalMode && secId === 'MC03') return null;
                  if (
                    isPersonalSpace &&
                    !isTechnicalMode &&
                    !['MC01', 'MC02', 'MC04', 'MC05', 'MC06', 'MC13'].includes(secId)
                  ) {
                    return null;
                  }
                  const isVisible = dashboard.session.visibleSections.includes(secId);
                  if (!isVisible) return null;
                  const isActive =
                    hubTab === 'mon-compte' && activeSection === secId;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => void handleNavigateSection(secId)}
                      className={`px-2.5 py-1.5 rounded-btn text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                        isActive
                          ? 'cf-brand-gradient text-white font-semibold'
                          : 'cf-card-secondary hover:border-violet-500/50'
                      }`}
                    >
                      {isTechnicalMode && (
                        <span className="cf-mono text-[10px] opacity-80">{sec.id}</span>
                      )}
                      <span>{sec.label}</span>
                    </button>
                  );
                })}
                {isTechnicalMode && (
                  <button
                    type="button"
                    onClick={handleNavigateTraceability}
                    className={`px-2.5 py-1.5 rounded-btn text-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                      hubTab === 'traceability'
                        ? 'cf-brand-gradient text-white font-semibold'
                        : 'cf-card-secondary hover:border-violet-500/50'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-violet-400" />
                    <span>Traçabilité &amp; Ambiguïtés 91/1605</span>
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {identityMismatchBanner && (
        <div className="p-4 rounded-card bg-amber-950/50 border border-amber-500/50 text-amber-100 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">{identityMismatchBanner}</div>
        </div>
      )}

      {/* Bannière 403 / Refus serveur */}
      {forbiddenBanner && (
        <div className="p-4 rounded-card bg-red-950/50 border border-red-500/50 text-red-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm">
                {isTechnicalMode
                  ? 'Accès refusé côté serveur (HTTP 403 Forbidden — TST40 / RBAC)'
                  : 'Accès restreint'}
              </div>
              <p className="text-xs text-red-200/90 mt-1">{forbiddenBanner}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForbiddenBanner(null)}
            className="text-xs px-2.5 py-1 rounded-lg bg-red-900/60 hover:bg-red-800/70 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Contenu selon onglet */}
      {hubTab === 'github-my-day' && <MyDayCollaboratorView />}
      {hubTab === 'github-planning' && (
        <PlanningHrView
          personalScopeOnly={!isShellAdmin}
          scopedEmployeeId={isShellAdmin ? undefined : currentUser.id}
          forcedClubScope={currentUser.clubId}
        />
      )}

      {(hubTab === 'mon-compte' || hubTab === 'traceability') && (
        <>
          {loading && !dashboard ? (
            <div className="cf-card p-8 text-center text-sm cf-muted">
              Chargement du module RH « Mon compte » V1.16...
            </div>
          ) : fatalError || !dashboard || !registry ? (
            <div className="cf-card p-6 space-y-3 border-red-500/40">
              <div className="font-bold text-sm text-red-400">
                Erreur de chargement API RH CFitness OS
              </div>
              <p className="text-xs cf-muted">{fatalError ?? 'Données absentes.'}</p>
              <button
                type="button"
                onClick={() => void refreshAll()}
                className="cf-brand-gradient text-white text-xs font-semibold px-4 py-2 rounded-btn cursor-pointer"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <>
              {hubTab === 'traceability' && effectiveDashboard && (
                <PlanningAndModulesView
                  mode="traceability"
                  activeSection={activeSection}
                  auth={auth}
                  dashboard={effectiveDashboard}
                  registry={registry}
                  ambiguities={ambiguities}
                  onRefreshDashboard={() => refreshAll()}
                />
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC01' && effectiveDashboard && (
                <DashboardView
                  dashboard={effectiveDashboard}
                  onOpenPlanning={() => setShellSection('planning-hr', 'planning')}
                  onOpenPreferences={() => void handleNavigateSection('MC13')}
                />
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC04' && (
                <div className="space-y-4">
                  <PlanningHrView
                    forcedSubTab="CONGES"
                    personalScopeOnly={!isShellAdmin}
                    scopedEmployeeId={!isShellAdmin ? currentUser.id : undefined}
                    forcedClubScope={currentUser.clubId}
                  />
                </div>
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC05' && (
                <div className="space-y-4">
                  <PlanningHrView
                    forcedSubTab="POINTAGES"
                    personalScopeOnly={!isShellAdmin}
                    scopedEmployeeId={!isShellAdmin ? currentUser.id : undefined}
                    forcedClubScope={currentUser.clubId}
                  />
                </div>
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC06' && (
                <div className="space-y-4">
                  <AtsView
                    initialTab="YOUSIGN_PARAPHEUR"
                    personalScopeOnly={!isShellAdmin}
                    scopedEmployeeId={!isShellAdmin ? currentUser.id : undefined}
                    canManageRecruitment={isShellAdmin}
                  />
                </div>
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC07' && (
                <div className="space-y-4">
                  <PlanningHrView
                    forcedSubTab="SILAE"
                  />
                </div>
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC12' && (
                <div className="space-y-4">
                  {isShellAdmin ? (
                    <AtsView initialTab="FLATCHR_KANBAN" />
                  ) : (
                    <div className="cf-card p-6 text-sm text-amber-200 border border-amber-500/30 bg-amber-500/10 rounded-xl">
                      Accès refusé (RBAC) : l&apos;espace Recrutement ATS est réservé aux profils RH / Direction habilités.
                    </div>
                  )}
                </div>
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC11' && effectiveDashboard && (
                <AdminRightsView
                  auth={auth}
                  dashboard={effectiveDashboard}
                  onRefreshDashboard={() => refreshAll()}
                />
              )}

              {hubTab === 'mon-compte' && activeSection === 'MC13' && effectiveDashboard && (
                <PreferencesView
                  auth={auth}
                  preferences={effectiveDashboard.preferences}
                  onRefreshDashboard={() => refreshAll()}
                />
              )}

              {hubTab === 'mon-compte' &&
                effectiveDashboard &&
                activeSection !== 'MC01' &&
                activeSection !== 'MC04' &&
                activeSection !== 'MC05' &&
                activeSection !== 'MC06' &&
                activeSection !== 'MC07' &&
                activeSection !== 'MC11' &&
                activeSection !== 'MC12' &&
                activeSection !== 'MC13' && (
                  <PlanningAndModulesView
                    mode={activeSection === 'MC03' ? 'planning' : 'blueprint'}
                    activeSection={activeSection}
                    auth={auth}
                    dashboard={effectiveDashboard}
                    registry={registry}
                    ambiguities={ambiguities}
                    onRefreshDashboard={() => refreshAll()}
                  />
                )}
            </>
          )}
        </>
      )}
    </div>
  );
}
