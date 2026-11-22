import React, { Suspense, lazy, useState } from 'react';
import { useCfos } from '../context/CfosContext';
import {
  Users,
  Calendar,
  GraduationCap,
  Menu,
  X,
  Smartphone,
  Tablet,
  RotateCcw,
  LogOut,
  ZapOff,
  Sun,
  Moon,
  Headphones,
  ChevronDown,
  ChevronRight,
  Lock,
  Home,
  Building2,
  TrendingUp,
  Activity,
  Euro,
  Wrench,
  Package,
  Megaphone,
  FileText,
  BarChart3,
  Sparkles,
  Settings,
  Search,
  Bell,
  MessageSquare,
  Compass,
  Globe,
  Scale,
  UserCheck,
} from 'lucide-react';
import { AdminSection } from '../types/cfos';
import { isNavItemAllowedForRole, isSectionAllowedForRole } from '../domain/rules';
import { AuthSwitchModal } from './AuthSwitchModal';
import { MywellnessQuickConnect } from './MywellnessQuickConnect';

const DashboardView = lazy(() =>
  import('./views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const OrchestratorMaintenanceView = lazy(() =>
  import('./views/OrchestratorMaintenanceView').then((m) => ({
    default: m.OrchestratorMaintenanceView,
  }))
);
const MonCompteRhHubView = lazy(() =>
  import('./views/MonCompteRhHubView').then((m) => ({ default: m.MonCompteRhHubView }))
);
const TelephonyView = lazy(() =>
  import('./views/TelephonyView').then((m) => ({ default: m.TelephonyView }))
);
const CrmView = lazy(() =>
  import('./views/CrmView').then((m) => ({ default: m.CrmView }))
);
const PlanningHrView = lazy(() =>
  import('./views/PlanningHrView').then((m) => ({ default: m.PlanningHrView }))
);
const AcademyView = lazy(() =>
  import('./views/AcademyView').then((m) => ({ default: m.AcademyView }))
);
const AtsView = lazy(() =>
  import('./views/AtsView').then((m) => ({ default: m.AtsView }))
);
const DevicesHeitzView = lazy(() =>
  import('./views/DevicesHeitzView').then((m) => ({ default: m.DevicesHeitzView }))
);
const GovernanceView = lazy(() =>
  import('./views/GovernanceView').then((m) => ({ default: m.GovernanceView }))
);
const RecoveryView = lazy(() =>
  import('./views/RecoveryView').then((m) => ({ default: m.RecoveryView }))
);
const SocialWebView = lazy(() =>
  import('./views/SocialWebView').then((m) => ({ default: m.SocialWebView }))
);

interface VisualNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  sectionId?: AdminSection;
  subTarget?: string;
  shellTarget?: 'employe' | 'telephone' | 'tablette';
  badge?: string;
  hasChevron?: boolean;
  technicalOnly?: boolean;
}

const VISUAL_SIDEBAR_ITEMS: VisualNavItem[] = [
  {
    id: 'nav-crm',
    label: 'Prospection – Vente',
    icon: TrendingUp,
    iconColor: 'text-emerald-500',
    sectionId: 'crm',
    hasChevron: true,
  },
  {
    id: 'nav-adherents',
    label: 'Adhérents – CRM',
    icon: Users,
    iconColor: 'text-amber-500',
    sectionId: 'devices',
    subTarget: 'adherents',
    hasChevron: true,
  },
  {
    id: 'nav-marketing',
    label: 'Téléphonie',
    icon: Megaphone,
    iconColor: 'text-pink-500',
    sectionId: 'telephony',
    hasChevron: true,
  },
  {
    id: 'nav-social-web',
    label: 'Site Web & Réseaux',
    icon: Globe,
    iconColor: 'text-cyan-400',
    sectionId: 'social-web',
    hasChevron: true,
  },
  {
    id: 'nav-planning',
    label: 'Mon planning',
    icon: Calendar,
    iconColor: 'text-purple-500',
    sectionId: 'planning-hr',
    subTarget: 'planning',
    hasChevron: true,
  },
  {
    id: 'nav-cours',
    label: 'Planning cours collectifs',
    icon: Activity,
    iconColor: 'text-rose-500',
    sectionId: 'planning-hr',
    subTarget: 'cours-collectifs',
    hasChevron: true,
  },
  {
    id: 'nav-mon-compte',
    label: 'Mon compte',
    icon: UserCheck,
    iconColor: 'text-blue-500',
    sectionId: 'my-day',
    subTarget: 'personal',
    hasChevron: true,
  },
  {
    id: 'nav-personnel',
    label: 'Collaborateurs et RH',
    icon: Users,
    iconColor: 'text-indigo-500',
    sectionId: 'my-day',
    subTarget: 'MC01',
    hasChevron: true,
  },
  {
    id: 'nav-lead-trace',
    label: 'Traçabilité Lead (1682)',
    icon: Compass,
    iconColor: 'text-emerald-400',
    sectionId: 'crm',
    subTarget: 'lead-traceability',
    hasChevron: true,
    technicalOnly: true,
  },
  {
    id: 'nav-tracabilite',
    label: 'Traçabilité V1.16 (91/1605)',
    icon: Compass,
    iconColor: 'text-violet-400',
    sectionId: 'my-day',
    subTarget: 'traceability',
    hasChevron: true,
    technicalOnly: true,
  },
  {
    id: 'nav-finances',
    label: 'Finances',
    icon: Euro,
    iconColor: 'text-amber-500',
    sectionId: 'devices',
    subTarget: 'finances',
    hasChevron: true,
  },
  {
    id: 'nav-recovery',
    label: 'Recouvrement',
    icon: Scale,
    iconColor: 'text-rose-500',
    sectionId: 'recovery',
    hasChevron: true,
  },
  {
    id: 'nav-maintenance',
    label: 'Maintenance',
    icon: Wrench,
    iconColor: 'text-sky-500',
    sectionId: 'orchestrator',
    subTarget: 'maintenance',
    hasChevron: true,
    technicalOnly: true,
  },
  {
    id: 'nav-stock',
    label: 'Stock & Achats',
    icon: Package,
    iconColor: 'text-orange-500',
    sectionId: 'orchestrator',
    subTarget: 'stocks',
    hasChevron: true,
  },
  {
    id: 'nav-documents',
    label: 'Documents',
    icon: FileText,
    iconColor: 'text-emerald-500',
    sectionId: 'ats',
    subTarget: 'documents',
    hasChevron: true,
    technicalOnly: true,
  },
  {
    id: 'nav-rapports',
    label: 'Rapports',
    icon: BarChart3,
    iconColor: 'text-indigo-500',
    sectionId: 'academy',
    subTarget: 'rapports',
    hasChevron: true,
  },
  {
    id: 'nav-agents-ia',
    label: 'Agents IA',
    icon: Sparkles,
    iconColor: 'text-violet-500',
    sectionId: 'orchestrator',
    subTarget: 'agents',
    hasChevron: true,
    technicalOnly: true,
  },
];

interface NumberedNavItem {
  key: string;
  sectionId?: AdminSection;
  subTarget?: string;
  shellTarget?: 'employe' | 'telephone' | 'tablette';
  badgeText: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NUMBERED_PLAN_ITEMS: NumberedNavItem[] = [
  {
    key: 'borne-mobile',
    shellTarget: 'employe',
    badgeText: 'APP',
    label: 'App Mobile & Tablette',
    icon: Smartphone,
  },
  {
    key: 'borne-softphone',
    shellTarget: 'telephone',
    badgeText: 'VOIP',
    label: 'Softphone WebRTC',
    icon: Headphones,
  },
  {
    key: 'borne-kiosque',
    shellTarget: 'tablette',
    badgeText: 'PIN',
    label: 'Borne Tablette Kiosque',
    icon: Tablet,
  },
  {
    key: 'module-bpjeps',
    sectionId: 'academy',
    subTarget: 'bpjeps',
    badgeText: '3S',
    label: 'Académie & Livret BPJEPS',
    icon: GraduationCap,
  },
];

export function AdminShell() {
  const {
    clubFilter,
    setClubFilter,
    authorizedClubIds,
    isDemoMode,
    currentUser,
    activeSection,
    navSubTarget,
    setActiveSection,
    isArchitectUnlocked,
    isTechnicalMode,
    toggleTechnicalMode,
    canAccessRecovery,
    lockArchitectSpace,
    setShellMode,
    logoutSession,
    resetDemoData,
    serverPowerStatus,
    activeFailoverNodeId,
    backupReplicas,
    simulateServerPowerOutage,
    exportDeviceBackupJson,
    themeMode,
    toggleThemeMode,
    heitzMembers,
    prospects,
  } = useCfos();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = mobileMenuRef.current;
    const focusable = () => Array.from(drawer?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'
    ) ?? []).filter(element => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileMenuOpen(false);
      } else if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleResize);
      previousFocus?.focus();
    };
  }, [mobileMenuOpen]);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [numberedPlanExpanded, setNumberedPlanExpanded] = useState(false);
  const [selectedNavId, setSelectedNavId] = useState<string>('nav-dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const formatFrenchDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const raw = d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };
  const todayLabel = formatFrenchDate(0);
  const tomorrowLabel = formatFrenchDate(1);
  const [selectedDateLabel, setSelectedDateLabel] = useState(todayLabel);
  const [notifPopoverOpen, setNotifPopoverOpen] = useState(false);

  React.useEffect(() => {
    if (activeSection === 'dashboard') {
      setSelectedNavId('nav-dashboard');
    } else if (activeSection === 'devices') {
      setSelectedNavId(navSubTarget === 'finances' ? 'nav-finances' : 'nav-adherents');
    } else if (activeSection === 'crm') {
      setSelectedNavId(
        navSubTarget === 'lead-traceability' ? 'nav-lead-trace' : 'nav-crm'
      );
    } else if (activeSection === 'planning-hr') {
      setSelectedNavId(navSubTarget === 'cours-collectifs' ? 'nav-cours' : 'nav-planning');
    } else if (activeSection === 'my-day') {
      if (navSubTarget === 'traceability') {
        setSelectedNavId('nav-tracabilite');
      } else if (navSubTarget?.toLowerCase() === 'personal') {
        setSelectedNavId('nav-mon-compte');
      } else {
        setSelectedNavId('nav-personnel');
      }
    } else if (activeSection === 'orchestrator') {
      if (navSubTarget === 'stocks') setSelectedNavId('nav-stock');
      else if (navSubTarget === 'maintenance') setSelectedNavId('nav-maintenance');
      else setSelectedNavId('nav-agents-ia');
    } else if (activeSection === 'telephony') {
      setSelectedNavId('nav-marketing');
    } else if (activeSection === 'social-web') {
      setSelectedNavId('nav-social-web');
    } else if (activeSection === 'ats') {
      setSelectedNavId('nav-documents');
    } else if (activeSection === 'academy') {
      setSelectedNavId(navSubTarget === 'bpjeps' ? 'module-bpjeps' : 'nav-rapports');
    } else if (activeSection === 'recovery') {
      setSelectedNavId('nav-recovery');
    } else if (activeSection === 'governance') {
      setSelectedNavId('nav-governance');
    }
  }, [activeSection, navSubTarget]);

  const isDark = themeMode === 'dark';
  const isOutage = serverPowerStatus === 'coupure_courant_bascule_active';
  const activeFailoverDevice =
    backupReplicas.find((r) => r.id === activeFailoverNodeId) ?? backupReplicas[0];

  const handleVisualItemClick = (item: VisualNavItem) => {
    setSelectedNavId(item.id);
    if (item.shellTarget) {
      setShellMode(item.shellTarget);
      return;
    }
    if (item.sectionId) {
      setActiveSection(item.sectionId, item.subTarget);
    }
  };

  const handleNumberedItemClick = (item: NumberedNavItem) => {
    setSelectedNavId(item.key);
    if (item.shellTarget) {
      setShellMode(item.shellTarget);
      return;
    }
    if (item.sectionId) {
      setActiveSection(item.sectionId, item.subTarget);
    }
  };

  const handleGovernanceClick = () => {
    setSelectedNavId('nav-governance');
    setActiveSection('governance');
  };

  // Search results for global search bar
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchingMembers = normalizedQuery
    ? heitzMembers
        .filter((m) =>
          `${m.firstName} ${m.lastName} ${m.badgeCode}`.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, 3)
    : [];
  const matchingProspects = normalizedQuery
    ? prospects
        .filter((p) =>
          `${p.firstName} ${p.lastName} ${p.phone}`.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, 3)
    : [];

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row overflow-x-hidden transition-colors duration-200 ${
        isDark ? 'bg-[#0B0E17] text-slate-100' : 'bg-[#F6F7FB] text-slate-900'
      }`}
    >
      {/* =====================================================================
          DESKTOP LEFT SIDEBAR (Matches C.Fitness OS Reference Design)
         ===================================================================== */}
      <aside
        className={`hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-40 border-r transition-colors duration-200 ${
          isDark
            ? 'bg-[#111522] border-slate-800/80 text-slate-200'
            : 'bg-white border-slate-200/80 text-slate-700'
        }`}
      >
        {/* Brand Header: C.Fitness OS — Une vision unifiée */}
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 via-purple-600 to-blue-500 flex items-center justify-center shadow-sm shrink-0">
            <span className="font-black text-xl text-white tracking-tighter">C</span>
          </div>
          <div className="min-w-0">
            <div
              className={`font-extrabold text-base leading-tight truncate ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              C.Fitness OS
            </div>
            <div className="text-[11px] text-slate-400 truncate">Une vision unifiée</div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {/* Primary Active Item: Tableau de bord */}
          <button
            type="button"
            aria-current={activeSection === 'dashboard' ? 'page' : undefined}
            onClick={() => {
              setSelectedNavId('nav-dashboard');
              setActiveSection('dashboard');
            }}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-all cursor-pointer ${
              activeSection === 'dashboard' && selectedNavId === 'nav-dashboard'
                ? isDark
                  ? 'bg-violet-600/25 text-violet-300 border border-violet-500/30 shadow-2xs'
                  : 'bg-violet-50 text-violet-600 shadow-2xs'
                : isDark
                ? 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Home
              className={`w-4 h-4 shrink-0 ${
                activeSection === 'dashboard' ? 'text-violet-500' : 'text-violet-400'
              }`}
            />
            <span>Tableau de bord</span>
          </button>

          {/* Sélecteur de club unique, strictement limité aux clubs autorisés */}
          <div className="pt-1 pb-1">
            <label
              htmlFor="desktop-club-selector"
              className="px-2 pb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400"
            >
              Établissement actif
            </label>
            <div
              className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${
                isDark
                  ? 'bg-[#171C2E] border-slate-800 text-slate-100'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
              <select
                id="desktop-club-selector"
                aria-label="Club actif"
                value={clubFilter === 'all' ? authorizedClubIds[0] : clubFilter}
                disabled={authorizedClubIds.length <= 1}
                onChange={(e) => {
                  setClubFilter(e.target.value as 'carre-de-soie' | 'beynost');
                }}
                className="w-full bg-transparent text-xs font-semibold outline-hidden cursor-pointer disabled:cursor-default truncate"
              >
                {authorizedClubIds.map((cid) => (
                  <option key={cid} value={cid} className="text-slate-900">
                    {cid === 'carre-de-soie'
                      ? 'C.Fitness Carré de Soie'
                      : 'C.Fitness Beynost'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* All Visual Navigation Items from Reference Mockup */}
          <div className="space-y-0.5 pt-1">
            {VISUAL_SIDEBAR_ITEMS.filter(
              (item) =>
                (!item.technicalOnly || isTechnicalMode) &&
                isNavItemAllowedForRole(item, currentUser.role, {
                  canAccessRecovery,
                  canAccessFinances: currentUser.role === 'admin' || Boolean(currentUser.canAccessFinances),
                  canAccessStocks: Boolean(currentUser.canAccessStocks),
                  canAccessReports: Boolean(currentUser.canAccessReports),
                  canAccessMaintenance: currentUser.role === 'admin' || currentUser.role === 'coach',
                  isTechnicalMode,
                })
            ).map((item) => {
              const Icon = item.icon;
              const isSelected =
                selectedNavId === item.id &&
                (item.sectionId ? activeSection === item.sectionId : false);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleVisualItemClick(item)}
                  className={`w-full px-3.5 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? isDark
                        ? 'bg-violet-600/25 text-violet-300 font-semibold'
                        : 'bg-violet-50 text-violet-600 font-semibold'
                      : isDark
                      ? 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${item.iconColor}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.hasChevron && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400/70 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Non-redundant Terminals & Kiosks Accordion (visible en mode technique) */}
          {isTechnicalMode && (
            <div
              className={`pt-2 mt-2 border-t ${
                isDark ? 'border-slate-800/80' : 'border-slate-200/80'
              }`}
            >
              <button
                type="button"
                onClick={() => setNumberedPlanExpanded((prev) => !prev)}
                className={`w-full px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center justify-between cursor-pointer ${
                  isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>Bornes &amp; Terminaux ({NUMBERED_PLAN_ITEMS.length})</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    numberedPlanExpanded ? '' : '-rotate-90'
                  }`}
                />
              </button>

              {numberedPlanExpanded && (
                <div className="mt-1 space-y-0.5">
                  {NUMBERED_PLAN_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active =
                      selectedNavId === item.key &&
                      (item.sectionId ? activeSection === item.sectionId : false);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleNumberedItemClick(item)}
                        className={`w-full px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-between gap-2 cursor-pointer ${
                          active
                            ? isDark
                              ? 'bg-violet-500/20 text-violet-300 font-semibold'
                              : 'bg-violet-50 text-violet-700 font-semibold'
                            : isDark
                            ? 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Icon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <span className="font-mono text-[10px] opacity-60">{item.badgeText}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Bottom Settings / Mon Espace (accessible à tous) & Session Controls */}
        <div
          className={`p-3 border-t space-y-2 ${
            isDark ? 'border-slate-800/80' : 'border-slate-200/80'
          }`}
        >
          <button
            type="button"
            onClick={handleGovernanceClick}
            className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
              activeSection === 'governance'
                ? 'bg-violet-600 text-white shadow-2xs'
                : isDark
                ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Settings className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate">Paramètres · Mon espace</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
          </button>

          <div className={`grid gap-1.5 ${isDemoMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={logoutSession}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-rose-950/60 text-rose-300'
                  : 'bg-slate-100 hover:bg-rose-50 text-rose-600'
              }`}
            >
              <LogOut className="w-3 h-3" />
              <span>Quitter</span>
            </button>
            {isDemoMode && (
              <button
                type="button"
                onClick={resetDemoData}
                className={`py-1.5 px-2 rounded-lg text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                  isDark
                    ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset démo</span>
              </button>
            )}
          </div>

          {isArchitectUnlocked && (
            <button
              type="button"
              onClick={toggleTechnicalMode}
              title={
                isTechnicalMode
                  ? 'Revenir à la vue métier épurée'
                  : 'Afficher les onglets techniques, audit et architecture'
              }
              className={`w-full py-1 px-2 rounded-lg text-[10px] font-medium flex items-center justify-between cursor-pointer transition-colors ${
                isTechnicalMode
                  ? isDark
                    ? 'bg-violet-950/60 text-violet-300 border border-violet-700/60'
                    : 'bg-violet-50 text-violet-700 border border-violet-200'
                  : isDark
                  ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{isTechnicalMode ? 'Vue Technique active' : 'Vue Métier épurée'}</span>
              <span className="font-mono">{isTechnicalMode ? 'Masquer' : 'Tech.'}</span>
            </button>
          )}
        </div>
      </aside>

      {/* =====================================================================
          MAIN WORKSPACE CONTAINER
         ===================================================================== */}
      <div className="flex-1 min-w-0 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Sticky Header (Matches C.Fitness OS Reference Mockup) */}
        <header
          className={`sticky top-0 z-30 border-b backdrop-blur transition-colors duration-200 ${
            isDark
              ? 'bg-[#111522]/95 border-slate-800/80'
              : 'bg-white/95 border-slate-200/80'
          }`}
        >
          <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3">
            {/* Left: Mobile Menu Button + Wide Global Search Bar */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-md xl:max-w-lg">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Ouvrir le menu de navigation"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation-menu"
                className={`lg:hidden min-h-[44px] min-w-[44px] rounded-xl border flex items-center justify-center cursor-pointer shrink-0 ${
                  isDark
                    ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Global Search Input */}
              <div className="relative flex-1 min-w-0">
                <div
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs transition-colors ${
                    isDark
                      ? 'bg-[#1A2033] border-slate-700/80 text-slate-200 focus-within:border-violet-500'
                      : 'bg-slate-100/80 border-slate-200/80 text-slate-700 focus-within:border-violet-500 focus-within:bg-white'
                  }`}
                >
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un adhérent, un cours, un document..."
                    className="w-full bg-transparent outline-hidden text-xs placeholder:text-slate-400"
                  />
                  <span
                    className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                      isDark
                        ? 'bg-slate-800 text-slate-400 border border-slate-700'
                        : 'bg-white text-slate-400 border border-slate-200'
                    }`}
                  >
                    ⌘ K
                  </span>
                </div>

                {/* Instant Search Results Dropdown */}
                {searchFocused && normalizedQuery.length > 0 && (
                  <div
                    className={`absolute left-0 right-0 mt-1.5 rounded-2xl border shadow-xl p-3 z-50 space-y-2 text-xs ${
                      isDark
                        ? 'bg-[#161B2B] border-slate-700 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase text-slate-400">
                      Résultats de recherche rapide
                    </div>
                    {matchingMembers.length === 0 && matchingProspects.length === 0 ? (
                      <div className="text-slate-400 py-2">
                        Aucun adhérent ou prospect trouvé pour « {searchQuery} ».
                      </div>
                    ) : (
                      <>
                        {matchingMembers.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setActiveSection('devices');
                              setSearchQuery('');
                            }}
                            className={`w-full p-2 rounded-xl flex items-center justify-between text-left cursor-pointer ${
                              isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                            }`}
                          >
                            <div>
                              <span className="font-bold">
                                {m.firstName} {m.lastName}
                              </span>{' '}
                              <span className="text-slate-400">· Adhérent #{m.badgeCode}</span>
                            </div>
                            <span className="text-violet-500 font-semibold">Ouvrir Heitz →</span>
                          </button>
                        ))}
                        {matchingProspects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setActiveSection('crm');
                              setSearchQuery('');
                            }}
                            className={`w-full p-2 rounded-xl flex items-center justify-between text-left cursor-pointer ${
                              isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                            }`}
                          >
                            <div>
                              <span className="font-bold">
                                {p.firstName} {p.lastName}
                              </span>{' '}
                              <span className="text-slate-400">· Prospect ({p.stage})</span>
                            </div>
                            <span className="text-emerald-500 font-semibold">Ouvrir CRM →</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Controls: Date Selector, Light/Dark Toggle, Mobile App Preview, Bell, Chat, User Profile */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Date Picker Selector (Lundi 14 avril 2025) */}
              <div className="hidden xl:flex items-center">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium ${
                    isDark
                      ? 'bg-[#1A2033] border-slate-700/80 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    aria-label="Sélectionner la date"
                    value={selectedDateLabel}
                    onChange={(e) => setSelectedDateLabel(e.target.value)}
                    className="bg-transparent outline-hidden cursor-pointer text-xs font-medium"
                  >
                    <option value={todayLabel} className="text-slate-900">
                      {todayLabel}
                    </option>
                    <option value={tomorrowLabel} className="text-slate-900">
                      {tomorrowLabel}
                    </option>
                    <option value="Temps réel" className="text-slate-900">
                      Temps réel
                    </option>
                  </select>
                </div>
              </div>

              {/* Bascule Jour / Nuit épurée */}
              <button
                type="button"
                onClick={toggleThemeMode}
                title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
                className={`p-2 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                  isDark
                    ? 'bg-[#1A2033] border-slate-700 text-amber-400 hover:bg-slate-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-slate-600" />}
              </button>

              {/* Mode Épuré / Vue Technique Toggle (visible uniquement quand Mon Espace 0766 est déverrouillé) */}
              {isArchitectUnlocked && (
                <button
                  type="button"
                  onClick={toggleTechnicalMode}
                  title={
                    isTechnicalMode
                      ? 'Revenir en Mode Épuré (vue client)'
                      : 'Afficher la Vue Technique (audit, traçabilité, architecture)'
                  }
                  className={`flex min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold items-center gap-1.5 cursor-pointer transition-colors ${
                    isTechnicalMode
                      ? isDark
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30'
                        : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                      : isDark
                      ? 'bg-[#1A2033] border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Compass className={`w-3.5 h-3.5 ${isTechnicalMode ? 'text-amber-400' : 'text-emerald-500'}`} />
                  <span className="hidden sm:inline">
                    {isTechnicalMode ? 'Vue Technique' : 'Mode Épuré'}
                  </span>
                </button>
              )}

              {/* Notifications Bell with Badge 3 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifPopoverOpen((prev) => !prev)}
                  aria-label="Notifications (3)"
                  className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-colors ${
                    isDark
                      ? 'bg-[#1A2033] border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    3
                  </span>
                </button>

                {notifPopoverOpen && (
                  <div
                    className={`absolute right-0 mt-2 w-80 rounded-2xl border shadow-xl p-3.5 z-50 space-y-2.5 text-xs ${
                      isDark
                        ? 'bg-[#161B2B] border-slate-700 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>Actions importantes (3)</span>
                      <button
                        type="button"
                        onClick={() => setNotifPopoverOpen(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Fermer
                      </button>
                    </div>
                    {currentUser.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection('devices', 'finances');
                          setNotifPopoverOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                          isDark ? 'bg-rose-950/40 hover:bg-rose-950/60' : 'bg-rose-50 hover:bg-rose-100'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-rose-500">5 impayés à relancer</div>
                          <div className="text-[11px] opacity-80">Représentent 1 250 €</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-rose-400" />
                      </button>
                    )}
                    {currentUser.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSection('my-day', 'MC06');
                          setNotifPopoverOpen(false);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                          isDark
                            ? 'bg-amber-950/40 hover:bg-amber-950/60'
                            : 'bg-amber-50 hover:bg-amber-100'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-amber-500">2 contrats en attente</div>
                          <div className="text-[11px] opacity-80">À valider cette semaine</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('orchestrator', 'maintenance');
                        setNotifPopoverOpen(false);
                      }}
                      className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                        isDark
                          ? 'bg-emerald-950/40 hover:bg-emerald-950/60'
                          : 'bg-emerald-50 hover:bg-emerald-100'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-emerald-500">Maintenance prévue</div>
                        <div className="text-[11px] opacity-80">CTA Beynost – 15 avril</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-emerald-400" />
                    </button>
                  </div>
                )}
              </div>

              {/* Chat / Softphone WebRTC Button */}
              <button
                type="button"
                onClick={() => setShellMode('telephone')}
                title="Ouvrir le Softphone WebRTC & Messagerie SMS 07"
                aria-label="Ouvrir la messagerie et le softphone"
                className={`hidden sm:flex w-9 h-9 rounded-xl border items-center justify-center cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-[#1A2033] border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
              </button>

              <div className="hidden md:flex">
                <MywellnessQuickConnect variant="header" />
              </div>

              {/* Lock button when Architect Space is unlocked */}
              {activeSection === 'governance' && isArchitectUnlocked && (
                <button
                  type="button"
                  onClick={() => lockArchitectSpace()}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors bg-rose-600 hover:bg-rose-700 text-white shadow-2xs"
                >
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Verrouiller Mon Espace</span>
                </button>
              )}

              {/* Identité du collaborateur connecté */}
              <button
                type="button"
                onClick={() => {
                  if (isDemoMode) {
                    setAuthModalOpen(true);
                  } else {
                    setSelectedNavId('nav-mon-compte');
                    setActiveSection('my-day', 'personal');
                  }
                }}
                className={`pl-2 pr-3 py-1.5 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors ${
                  isDark
                    ? 'bg-[#1A2033] border-slate-700 hover:bg-slate-800 text-white'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-900'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {`${currentUser.firstName[0] || ''}${currentUser.lastName[0] || ''}`.toUpperCase()}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <div className="text-xs font-bold">
                    {`${currentUser.firstName} ${currentUser.lastName}`}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {currentUser.jobTitle}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>
            </div>
          </div>
        </header>

        {/* Emergency Power Outage / Server Failure Continuity Banner */}
        {isOutage && (
          <div className="bg-amber-600 text-white px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <ZapOff className="w-4 h-4 shrink-0" />
              <span>
                COUPURE SERVEUR PRINCIPAL DÉTECTÉE — Les 2 clubs fonctionnent en autonomie sur{' '}
                <span className="underline font-bold">{activeFailoverDevice.deviceName}</span>{' '}
                (Tourniquets Heitz sur cache local, Badgeuse PIN &amp; CRM sauvegardés sans perte).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => exportDeviceBackupJson(activeFailoverDevice.id)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer whitespace-nowrap"
              >
                Télécharger copie .json
              </button>
              <button
                onClick={() => simulateServerPowerOutage(false)}
                className="px-2.5 py-1 rounded-lg bg-white text-amber-900 font-bold hover:bg-amber-50 cursor-pointer whitespace-nowrap"
              >
                Rétablir Serveur &amp; Resynchroniser
              </button>
            </div>
          </div>
        )}

        {/* Active View Content (Réservation d'espace inférieur pb-32 sm:pb-36 anti-chevauchement barre mobile #20) */}
        <main className="flex-1 px-3 pt-3 pb-32 sm:px-6 sm:pt-6 sm:pb-36 lg:p-6 max-w-[1440px] w-full mx-auto min-w-0 overflow-x-clip">
          <Suspense
            fallback={
              <div className="cf-card p-6 text-xs cf-muted flex items-center gap-2">
                <span>Chargement du module…</span>
              </div>
            }
          >
          {activeSection === 'my-day' && (
            <MonCompteRhHubView subTarget={navSubTarget} />
          )}
          {activeSection === 'planning-hr' && (
            navSubTarget === 'mc03-legacy' && isTechnicalMode ? (
              <div className="space-y-4">
                <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="cf-muted">
                    Mode Technique : <strong className="text-violet-300">MC03 Tableau Planning RH V1.16</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('planning-hr', 'planning')}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer"
                  >
                    Revenir à la Grille Skello →
                  </button>
                </div>
                <MonCompteRhHubView subTarget="MC03" planningOnly />
              </div>
            ) : (
              <div className="space-y-4">
                {isTechnicalMode && (
                  <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="cf-muted">
                      Vue active : <strong className="text-slate-100">Grille Planning Skello &amp; Cours Collectifs</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveSection('planning-hr', 'mc03-legacy')}
                      className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer"
                    >
                      Ouvrir Tableau MC03 V1.16
                    </button>
                  </div>
                )}
                <PlanningHrView
                  personalScopeOnly={currentUser.role !== 'admin' && currentUser.role !== 'manager'}
                  scopedEmployeeId={
                    currentUser.role !== 'admin' && currentUser.role !== 'manager'
                      ? currentUser.id
                      : undefined
                  }
                  forcedClubScope={currentUser.clubId || undefined}
                />
              </div>
            )
          )}
          {activeSection === 'recovery' && <RecoveryView />}
          {activeSection === 'social-web' && <SocialWebView />}
          {activeSection === 'telephony' && (
            <div className="space-y-4">
              {isTechnicalMode && (
                <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="cf-muted">
                    Module Téléphonie WebRTC 12 Lignes (Ringover · périmètre en attente d&apos;audit)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('my-day', 'MC09')}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer"
                  >
                    Ouvrir MC09 Communication RH (V1.16) →
                  </button>
                </div>
              )}
              <TelephonyView />
            </div>
          )}
          {activeSection === 'crm' && <CrmView subTarget={navSubTarget} />}
          {activeSection === 'ats' && (
            <div className="space-y-4">
              {isTechnicalMode && (
                <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="cf-muted">
                    Module ATS Recrutement &amp; Signatures Internes eIDAS (GitHub CFOS)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('my-day', 'MC06')}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer"
                  >
                    Ouvrir MC06 Documents &amp; signatures RH (V1.16) →
                  </button>
                </div>
              )}
              <AtsView />
            </div>
          )}
          {activeSection === 'devices' && <DevicesHeitzView />}
          {(activeSection === 'dashboard' || activeSection === 'executive-dossier') && (
            <DashboardView />
          )}
          {activeSection === 'orchestrator' && <OrchestratorMaintenanceView />}
          {activeSection === 'academy' && (
            <div className="space-y-4">
              {isTechnicalMode && (
                <div className="cf-card p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="cf-muted">
                    Module Rapports, Académie 3S &amp; Livret BPJEPS (GitHub CFOS)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveSection('my-day', 'MC08')}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer"
                  >
                    Ouvrir MC08 Pilotage &amp; missions (V1.16) →
                  </button>
                </div>
              )}
              <AcademyView />
            </div>
          )}
          {activeSection === 'governance' && <GovernanceView />}
          </Suspense>

          {/* Spacer garanti anti-chevauchement avec la barre fixe mobile (< lg) - Défaut #20 */}
          <div className="h-8 sm:h-12 lg:hidden pointer-events-none" aria-hidden="true" />
        </main>
      </div>

      {/* Responsive Bottom Navigation Bar for Real Smartphones & Portrait Tablets (< lg) */}
      <nav
        aria-label="Navigation rapide mobile et tablette"
        className={`fixed bottom-0 inset-x-0 z-40 lg:hidden border-t backdrop-blur-md pb-safe ${
          isDark
            ? 'bg-[#111522]/95 border-slate-800 text-slate-300'
            : 'bg-white/95 border-slate-200 text-slate-700'
        }`}
      >
        <div className="grid grid-cols-5 gap-1 px-2 pt-1.5">
          <button
            type="button"
            aria-current={activeSection === 'dashboard' ? 'page' : undefined}
            onClick={() => {
              setSelectedNavId('nav-dashboard');
              setActiveSection(isSectionAllowedForRole('dashboard', currentUser.role) ? 'dashboard' : 'my-day');
            }}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer ${
              activeSection === 'dashboard'
                ? 'text-violet-500 bg-violet-500/10'
                : 'opacity-75 hover:opacity-100'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="truncate">Accueil</span>
          </button>

          <button
            type="button"
            aria-current={activeSection === 'devices' && navSubTarget !== 'finances' ? 'page' : undefined}
            onClick={() => {
              const canAdherents = isSectionAllowedForRole('devices', currentUser.role) && currentUser.role !== 'coach' && currentUser.role !== 'apprenti';
              setSelectedNavId(canAdherents ? 'nav-adherents' : 'nav-checkup');
              setActiveSection('devices', canAdherents ? 'adherents' : 'checkup');
            }}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer ${
              activeSection === 'devices' && navSubTarget !== 'finances'
                ? 'text-violet-500 bg-violet-500/10'
                : 'opacity-75 hover:opacity-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="max-w-full text-center leading-tight">
              {currentUser.role === 'coach' || currentUser.role === 'apprenti' ? 'Bilans' : 'Adhérents – CRM'}
            </span>
          </button>

          <button
            type="button"
            aria-current={activeSection === 'planning-hr' && navSubTarget !== 'cours-collectifs' ? 'page' : undefined}
            onClick={() => {
              setSelectedNavId('nav-planning');
              setActiveSection('planning-hr', 'planning');
            }}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer ${
              activeSection === 'planning-hr' && navSubTarget !== 'cours-collectifs'
                ? 'text-violet-500 bg-violet-500/10'
                : 'opacity-75 hover:opacity-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="truncate">Mon planning</span>
          </button>

          <button
            type="button"
            aria-current={activeSection === 'my-day' && navSubTarget === 'personal' ? 'page' : undefined}
            onClick={() => {
              setSelectedNavId('nav-mon-compte');
              setActiveSection('my-day', 'personal');
            }}
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer ${
              activeSection === 'my-day' && navSubTarget === 'personal'
                ? 'text-violet-500 bg-violet-500/10'
                : 'opacity-75 hover:opacity-100'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span className="truncate">Mon compte</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-menu"
            className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer ${
              mobileMenuOpen
                ? 'text-violet-500 bg-violet-500/10'
                : 'opacity-75 hover:opacity-100'
            }`}
          >
            <Menu className="w-4 h-4" />
            <span className="truncate">Menus</span>
          </button>
        </div>
      </nav>

      {/* Mobile & Tablet Off-Canvas Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            id="mobile-navigation-menu"
            ref={mobileMenuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navigation"
            className={`relative w-72 max-w-[85vw] h-full flex flex-col justify-between p-4 z-10 overflow-y-auto ${
              isDark ? 'bg-[#111522] text-white' : 'bg-white text-slate-900'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-blue-500 flex items-center justify-center font-black text-sm text-white">
                    C
                  </div>
                  <div>
                    <div className="font-bold text-sm">C.Fitness OS</div>
                    <div className="text-[10px] text-slate-400">Une vision unifiée</div>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fermer le menu"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Bascule rapide Jour / Nuit dans le menu mobile */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={toggleThemeMode}
                  className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${
                    isDark
                      ? 'bg-[#171C2E] border-slate-800 text-amber-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  {isDark ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mode Jour</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-violet-600" />
                      <span>Mode Nuit</span>
                    </>
                  )}
                </button>
              </div>

              {/* Sélecteur de club unique (limité aux clubs autorisés) */}
              <div
                className={`px-3 py-2 rounded-xl border flex items-center gap-2 ${
                  isDark
                    ? 'bg-[#171C2E] border-slate-800 text-slate-100'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                <select
                  aria-label="Club actif mobile"
                  value={clubFilter === 'all' ? authorizedClubIds[0] : clubFilter}
                  disabled={authorizedClubIds.length <= 1}
                  onChange={(e) => {
                    setClubFilter(e.target.value as 'carre-de-soie' | 'beynost');
                    setMobileMenuOpen(false);
                  }}
                  className="w-full bg-transparent text-xs font-semibold outline-hidden cursor-pointer disabled:cursor-default truncate"
                >
                  {authorizedClubIds.map((cid) => (
                    <option key={cid} value={cid} className="text-slate-900">
                      {cid === 'carre-de-soie'
                        ? 'C.Fitness Carré de Soie'
                        : 'C.Fitness Beynost'}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedNavId('nav-dashboard');
                  setActiveSection('dashboard');
                  setMobileMenuOpen(false);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 bg-violet-600 text-white cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Tableau de bord</span>
              </button>

              <div className="space-y-1">
                {VISUAL_SIDEBAR_ITEMS.filter(
                  (item) =>
                    (!item.technicalOnly || isTechnicalMode) &&
                    isNavItemAllowedForRole(item, currentUser.role, {
                      canAccessRecovery,
                      canAccessFinances: currentUser.role === 'admin' || Boolean(currentUser.canAccessFinances),
                      canAccessStocks: Boolean(currentUser.canAccessStocks),
                      canAccessReports: Boolean(currentUser.canAccessReports),
                      canAccessMaintenance: currentUser.role === 'admin' || currentUser.role === 'coach',
                      isTechnicalMode,
                    })
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      aria-current={selectedNavId === item.id ? 'page' : undefined}
                      onClick={() => {
                        handleVisualItemClick(item);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-medium flex items-center gap-3 cursor-pointer ${
                        selectedNavId === item.id
                          ? 'bg-violet-600/15 text-violet-400 font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${item.iconColor}`} />
                      <span className="text-left leading-snug">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bornes & Terminaux in Mobile/Tablet Drawer (visible en mode technique) */}
              {isTechnicalMode && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                  <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Bornes &amp; Terminaux ({NUMBERED_PLAN_ITEMS.length})
                  </div>
                  {NUMBERED_PLAN_ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          handleNumberedItemClick(item);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <Icon className="w-4 h-4 text-violet-500 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="text-[10px] font-mono opacity-60">{item.badgeText}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {isArchitectUnlocked && (
                <button
                  type="button"
                  onClick={toggleTechnicalMode}
                  className="w-full px-3 py-1.5 rounded-xl text-[11px] font-medium flex items-center justify-between text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <span>{isTechnicalMode ? 'Vue Technique active' : 'Vue Métier épurée'}</span>
                  <span className="font-mono">{isTechnicalMode ? 'Masquer' : 'Tech.'}</span>
                </button>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    handleGovernanceClick();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between bg-slate-100 dark:bg-slate-800 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-violet-500" />
                    Paramètres · Mon espace
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                </button>

                <div className={`grid gap-1.5 ${isDemoMode ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logoutSession();
                    }}
                    className="py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 bg-rose-500/15 text-rose-500 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Quitter</span>
                  </button>
                  {isDemoMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        resetDemoData();
                      }}
                      className="py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset démo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {authModalOpen && isDemoMode && <AuthSwitchModal onClose={() => setAuthModalOpen(false)} />}
    </div>
  );
}
