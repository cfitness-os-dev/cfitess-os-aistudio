import {
  AlertTriangle,
  Building2,
  Calendar,
  ChartColumn,
  Clock,
  Compass,
  Euro,
  FileText,
  Lock,
  Megaphone,
  Moon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { McSectionRef } from '../domain/referenceRegistry';
import type { McSectionId, SessionContext, Site } from '../domain/types';

export interface PersonaOption {
  id: string;
  label: string;
  roleSummary: string;
}

export const PERSONA_OPTIONS: PersonaOption[] = [
  {
    id: 'emp-admin',
    label: 'Nadia Moreau (Admin système)',
    roleSummary: 'Carré de Soie & Beynost — 43 droits',
  },
  {
    id: 'emp-master',
    label: 'Karim Haddad (Master / Lecture)',
    roleSummary: 'Master Carré de Soie • Lecture seule Beynost',
  },
  {
    id: 'emp-planif-av',
    label: 'Sophie Laurent (Planif. avancé)',
    roleSummary: 'Carré de Soie (Coaching)',
  },
  {
    id: 'emp-planif-std',
    label: 'Lucas Bernard (Planif. standard)',
    roleSummary: 'Portée équipe Accueil CS • Masquage salaires',
  },
  {
    id: 'emp-readonly',
    label: 'Claire Petit (Lecture seule avancée)',
    roleSummary: 'Beynost — Aucune écriture',
  },
  {
    id: 'emp-employe-multi',
    label: 'Thomas Girard (Employé multi-sites)',
    roleSummary: 'Principal Carré de Soie • Secondaire Beynost',
  },
  {
    id: 'emp-accueil-cs',
    label: 'Julie Roux (Employée Accueil CS)',
    roleSummary: 'Dossier paie incomplet • Shift rouge',
  },
];

interface LayoutProps {
  session: SessionContext;
  sites: Site[];
  sectionsMeta: McSectionRef[];
  activeRoute: 'mon-compte' | 'planning' | 'traceability';
  activeSection: McSectionId;
  activeActorId: string;
  activeSiteId: string | 'all';
  darkMode: boolean;
  backendKind: string;
  forbiddenBanner: string | null;
  onToggleTheme: () => void;
  onChangeActor: (actorId: string) => void;
  onChangeSite: (siteId: string | 'all') => void;
  onNavigateSection: (sectionId: McSectionId) => void;
  onNavigatePlanningShortcut: () => void;
  onNavigateTraceability: () => void;
  onDismissForbidden: () => void;
  children: ReactNode;
}

const SIDEBAR_MODULES: Array<{
  id: 'mon-compte' | 'planning' | 'documents' | 'finances' | 'rapports' | 'marketing' | 'taches';
  label: string;
  icon: typeof Users;
  oklchColor: string;
  badge: string;
  targetSection: McSectionId;
}> = [
  {
    id: 'mon-compte',
    label: 'Personnel (Mon compte)',
    icon: Users,
    oklchColor: 'oklch(0.623 0.214 259.815)',
    badge: 'MC01',
    targetSection: 'MC01',
  },
  {
    id: 'planning',
    label: 'Planning',
    icon: Calendar,
    oklchColor: 'oklch(0.627 0.265 303.9)',
    badge: 'MC03',
    targetSection: 'MC03',
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    oklchColor: 'oklch(0.696 0.17 162.48)',
    badge: 'MC06',
    targetSection: 'MC06',
  },
  {
    id: 'finances',
    label: 'Finances & Paie',
    icon: Euro,
    oklchColor: 'oklch(0.769 0.188 70.08)',
    badge: 'MC07',
    targetSection: 'MC07',
  },
  {
    id: 'rapports',
    label: 'Rapports & Pilotage',
    icon: ChartColumn,
    oklchColor: 'oklch(0.585 0.233 277.117)',
    badge: 'MC08',
    targetSection: 'MC08',
  },
  {
    id: 'marketing',
    label: 'Marketing & Com.',
    icon: Megaphone,
    oklchColor: 'oklch(0.656 0.241 354.308)',
    badge: 'MC09',
    targetSection: 'MC09',
  },
  {
    id: 'taches',
    label: 'Tâches & Pointeuse',
    icon: Clock,
    oklchColor: 'oklch(0.541 0.281 293.009)',
    badge: 'MC05',
    targetSection: 'MC05',
  },
];

const MON_COMPTE_HUB_SECTIONS = new Set<McSectionId>([
  'MC01',
  'MC02',
  'MC04',
  'MC10',
  'MC11',
  'MC12',
  'MC13',
]);

export function Layout({
  session,
  sites,
  sectionsMeta,
  activeRoute,
  activeSection,
  activeActorId,
  activeSiteId,
  darkMode,
  backendKind,
  forbiddenBanner,
  onToggleTheme,
  onChangeActor,
  onChangeSite,
  onNavigateSection,
  onNavigatePlanningShortcut,
  onNavigateTraceability,
  onDismissForbidden,
  children,
}: LayoutProps) {
  const canSelectAllSites =
    sites.length > 1 &&
    session.activeProfile.scopeSelected === 'sites' &&
    (session.resolvedPermissions['ORG04-07']?.allowed ||
      session.resolvedPermissions['ORG04-38']?.allowed);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sidebar CFitness OS (#111522 en mode sombre) */}
      <aside className="cf-sidebar-surface lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r flex flex-col justify-between">
        <div>
          <div className="p-5 flex items-center justify-between border-b border-[var(--cf-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl cf-brand-gradient flex items-center justify-center text-white font-bold shadow-lg shadow-violet-950/30">
                CF
              </div>
              <div>
                <div className="font-semibold tracking-tight text-sm flex items-center gap-2">
                  CFITNESS OS
                  <span className="text-[10px] cf-mono px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                    V1.16
                  </span>
                </div>
                <p className="text-xs cf-muted">Module RH « Mon compte »</p>
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider cf-muted font-semibold">
              Navigation CFitness OS
            </div>
            {SIDEBAR_MODULES.map((mod) => {
              const Icon = mod.icon;
              const isCurrent =
                mod.id === 'planning'
                  ? activeRoute === 'planning' ||
                    (activeRoute === 'mon-compte' && activeSection === 'MC03')
                  : mod.id === 'mon-compte'
                    ? activeRoute === 'mon-compte' &&
                      MON_COMPTE_HUB_SECTIONS.has(activeSection)
                    : activeRoute === 'mon-compte' &&
                      activeSection === mod.targetSection;
              const isSectionAllowed = session.visibleSections.includes(
                mod.targetSection
              );

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() =>
                    mod.id === 'planning'
                      ? onNavigatePlanningShortcut()
                      : onNavigateSection(mod.targetSection)
                  }
                  title={
                    isSectionAllowed
                      ? `Ouvrir ${mod.label} (${mod.targetSection})`
                      : `Accès restreint pour ${session.activeProfile.name} (cliquer pour vérifier le contrôle HTTP 403)`
                  }
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-btn text-sm transition-all ${
                    isCurrent
                      ? 'cf-brand-gradient text-white font-semibold shadow-md shadow-violet-950/25'
                      : isSectionAllowed
                        ? 'hover:bg-slate-800/40'
                        : 'opacity-70 hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className="w-4 h-4 shrink-0"
                      style={{ color: isCurrent ? '#ffffff' : mod.oklchColor }}
                    />
                    <span className="truncate">{mod.label}</span>
                  </div>
                  <span
                    className={`text-[10px] cf-mono px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0 ${
                      isCurrent
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800/60 cf-muted'
                    }`}
                  >
                    {!isSectionAllowed && (
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                    )}
                    {mod.badge}
                  </span>
                </button>
              );
            })}

            <div className="pt-3 border-t border-[var(--cf-border)] mt-3">
              <button
                type="button"
                onClick={onNavigateTraceability}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-btn text-sm transition-all ${
                  activeRoute === 'traceability'
                    ? 'cf-brand-gradient text-white font-semibold'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-violet-400" />
                  <span>Traçabilité & Ambiguïtés</span>
                </div>
                <span className="text-[10px] cf-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  91/1605
                </span>
              </button>
            </div>
          </nav>
        </div>

        {/* Sélecteur d'identité fictive & état serveur */}
        <div className="p-4 border-t border-[var(--cf-border)] space-y-3">
          <div className="cf-card-secondary p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="cf-muted font-medium">Profil actif testé</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xs font-semibold text-violet-300">
              {session.activeProfile.name}
            </div>
            <div className="text-[11px] cf-muted flex items-center justify-between">
              <span>Portée :</span>
              <span className="cf-mono uppercase text-emerald-300">
                {session.activeProfile.scopeSelected}
              </span>
            </div>
            <div className="text-[11px] cf-muted flex items-center justify-between">
              <span>Backend API :</span>
              <span className="cf-mono">{backendKind}</span>
            </div>
          </div>

          <div className="text-[11px] cf-muted leading-relaxed">
            Données <strong className="text-emerald-400">100 % fictives</strong>{' '}
            (V1.16) • Serveur prêt pour Linux / Docker.
          </div>
        </div>
      </aside>

      {/* Zone principale */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barre supérieure */}
        <header className="cf-sidebar-surface border-b px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              <label htmlFor="persona-select" className="text-xs cf-muted hidden sm:inline">
                Compte simulé :
              </label>
              <select
                id="persona-select"
                value={activeActorId}
                onChange={(e) => onChangeActor(e.target.value)}
                className="cf-input text-xs px-2.5 py-1.5 font-medium"
              >
                {PERSONA_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — {p.roleSummary}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              <label htmlFor="site-select" className="text-xs cf-muted hidden sm:inline">
                Club :
              </label>
              <select
                id="site-select"
                value={activeSiteId}
                onChange={(e) => onChangeSite(e.target.value)}
                className="cf-input text-xs px-2.5 py-1.5 font-medium"
              >
                {canSelectAllSites && (
                  <option value="all">Tous les clubs ({sites.length})</option>
                )}
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Test URL directe 403 TST40 */}
            <button
              type="button"
              onClick={() => onNavigateSection('MC11')}
              title="Tester l'accès direct à MC11 (Organisation & Droits) pour vérifier le refus HTTP 403 serveur selon le profil actif"
              className="cf-input px-2.5 py-1.5 text-xs flex items-center gap-1.5 hover:border-violet-500/60 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">Tester URL /MC11</span>
            </button>

            <button
              type="button"
              onClick={onToggleTheme}
              title={darkMode ? 'Passer en thème clair' : 'Revenir au thème sombre CFitness'}
              className="cf-input p-2 hover:border-violet-500/60 transition-colors"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>
        </header>

        {/* Sous-navigation unifiée Mon compte (MC01..MC13) */}
        {activeRoute !== 'traceability' && (
          <div className="cf-sidebar-surface border-b px-4 lg:px-6 py-2.5 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-max">
              <span className="text-[11px] cf-mono cf-muted mr-2 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                /mon-compte
              </span>
              {sectionsMeta.map((sec) => {
                const secId = sec.id as McSectionId;
                const isVisible = session.visibleSections.includes(secId);
                if (!isVisible) return null;
                const isActive =
                  (activeRoute === 'mon-compte' && activeSection === secId) ||
                  (activeRoute === 'planning' && secId === 'MC03');
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => onNavigateSection(secId)}
                    className={`px-3 py-1.5 rounded-btn text-xs transition-all flex items-center gap-1.5 ${
                      isActive
                        ? 'cf-brand-gradient text-white font-semibold'
                        : 'cf-card-secondary hover:border-violet-500/50'
                    }`}
                  >
                    <span className="cf-mono text-[10px] opacity-80">{sec.id}</span>
                    <span>{sec.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bannière 403 / Refus serveur */}
        {forbiddenBanner && (
          <div className="mx-4 lg:mx-6 mt-4 p-4 rounded-card bg-red-950/50 border border-red-500/50 text-red-100 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm">
                  Accès refusé côté serveur (HTTP 403 Forbidden — TST40 / RBAC)
                </div>
                <p className="text-xs text-red-200/90 mt-1">{forbiddenBanner}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissForbidden}
              className="text-xs px-2.5 py-1 rounded-lg bg-red-900/60 hover:bg-red-800/70"
            >
              Fermer
            </button>
          </div>
        )}

        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
