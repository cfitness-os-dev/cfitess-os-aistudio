import { WorkspaceNavigation } from './WorkspaceNavigation';
import { Activity, BarChart3, Calendar, FileText, GitBranch, History, Link, Mail, MessageCircle, Settings, ShoppingBag, Users } from 'lucide-react';
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
  const items = GROUPS.flatMap(group => group.items
    .filter(item => technicalMode || !item.technical)
    .map(item => ({ ...item, group: group.label, restricted: !canAccess(item.id) })));
  return <WorkspaceNavigation label="Rubriques de prospection" items={items}
    activeId={activePage} onSelect={id => onSelect(id as LeadWorkspacePage)} />;
}
