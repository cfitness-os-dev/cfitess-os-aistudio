import { WorkspaceNavigation } from './WorkspaceNavigation';
import type { ComponentType } from 'react';

export interface HrNavigationItem {
  id: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
}

export function HrWorkspaceNavigation({ items, activeId, onSelect, label }: {
  items: HrNavigationItem[];
  activeId: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return <WorkspaceNavigation items={items} activeId={activeId} onSelect={onSelect} label={label} />;
}
