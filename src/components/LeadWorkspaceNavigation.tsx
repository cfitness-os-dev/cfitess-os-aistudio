import { Activity, BarChart3, Calendar, FileText, GitBranch, History, Link, Lock, Mail, MessageCircle, Settings, ShoppingBag, Users } from 'lucide-react';
import type { ComponentType } from 'react';

export type LeadWorkspacePage = 'prospects' | 'activities' | 'planning' | 'messaging' | 'stats' | 'sales' | 'forms' | 'models' | 'campaigns' | 'utm' | 'scenarios' | 'logs' | 'settings' | 'clients' | 'traceability';

const GROUPS: Array<{ label: string; items: Array<{ id: LeadWorkspacePage; label: string; icon: ComponentType<{ className?: string }>; technical?: boolean }> }> = [
  { label: 'Suivi commercial', items: [
    { id: 'prospects', label: 'Prospects', icon: Users },
    { id: 'activities', label: 'Activités', icon: Activity },
    { id: 'planning', label: 'Planning des rendez-vous', icon: Calendar },
    { id: 'messaging', label: 'Messagerie', icon: MessageCircle },
  ] },
  { label: 'Communication', items: [
    { id: 'models', label: 'Modèles de messages', icon: FileText },
    { id: 'campaigns', label: 'Campagnes', icon: Mail },
    { id: 'scenarios', label: 'Scénarios', icon: GitBranch },
    { id: 'utm', label: 'Suivi des campagnes', icon: Link },
    { id: 'logs', label: 'Historique des échanges', icon: History },
  ] },
  { label: 'Analyse et acquisition', items: [
    { id: 'stats', label: 'Statistiques', icon: BarChart3 },
    { id: 'sales', label: 'Ventes', icon: ShoppingBag },
    { id: 'forms', label: 'Formulaires', icon: FileText },
  ] },
  { label: 'Configuration', items: [
    { id: 'settings', label: 'Paramètres de prospection', icon: Settings },
    { id: 'clients', label: 'Clients · diagnostic', icon: Users, technical: true },
    { id: 'traceability', label: 'Registre de recette', icon: History, technical: true },
  ] },
];

export function LeadWorkspaceNavigation({ activePage, onSelect, canAccess, technicalMode }: {
  activePage: LeadWorkspacePage;
  onSelect: (page: LeadWorkspacePage) => void;
  canAccess: (page: LeadWorkspacePage) => boolean;
  technicalMode: boolean;
}) {
  const groups = GROUPS.map(group => ({ ...group, items: group.items.filter(item => technicalMode || !item.technical) }));
  return <>
    <label className="xl:hidden cf-card p-3 block text-sm font-semibold">
      <span className="block mb-2 cf-muted">Rubrique de prospection</span>
      <select className="w-full min-h-11 rounded-xl border border-slate-700 bg-[var(--cf-bg)] p-2" value={activePage} onChange={event => onSelect(event.target.value as LeadWorkspacePage)}>
        {groups.map(group => <optgroup key={group.label} label={group.label}>
          {group.items.map(item => <option key={item.id} value={item.id}>{item.label}{canAccess(item.id) ? '' : ' · Accès restreint'}</option>)}
        </optgroup>)}
      </select>
    </label>
    <nav aria-label="Rubriques de prospection" className="hidden xl:block cf-card p-3 self-start xl:sticky xl:top-4 space-y-4">
      {groups.map(group => <div key={group.label}>
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest cf-muted">{group.label}</p>
        <div className="space-y-1">{group.items.map(item => {
          const allowed = canAccess(item.id);
          const Icon = allowed ? item.icon : Lock;
          return <button key={item.id} type="button" aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)} title={allowed ? undefined : 'Cette rubrique nécessite une autorisation'}
            className={`w-full min-h-11 flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${activePage === item.id ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/35' : 'cf-muted hover:bg-violet-500/10 hover:text-violet-400'}`}>
            <Icon className="w-4 h-4 shrink-0" /><span>{item.label}</span>
          </button>;
        })}</div>
      </div>)}
    </nav>
  </>;
}
