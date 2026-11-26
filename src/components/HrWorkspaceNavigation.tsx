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
  const groups = [...new Set(items.map(item => item.group))];
  return <>
    <label className="xl:hidden cf-card p-3 block text-sm font-semibold">
      <span className="block cf-muted mb-2">{label}</span>
      <select className="cf-input min-h-11 p-2 w-full" value={activeId} onChange={event => onSelect(event.target.value)}>
        {groups.map(group => <optgroup key={group} label={group}>
          {items.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </optgroup>)}
      </select>
    </label>
    <nav aria-label={label} className="hidden xl:block cf-card p-3 space-y-4 self-start xl:sticky xl:top-4">
      {groups.map(group => <div key={group}>
        <p className="px-3 pb-2 cf-muted text-[10px] font-bold uppercase tracking-widest">{group}</p>
        <div className="space-y-1">{items.filter(item => item.group === group).map(item => {
          const Icon = item.icon;
          return <button type="button" key={item.id} aria-current={activeId === item.id ? 'page' : undefined}
            onClick={() => onSelect(item.id)}
            className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${activeId === item.id ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/35' : 'cf-muted hover:bg-violet-500/10 hover:text-violet-400'}`}>
            <Icon className="w-4 h-4 shrink-0" /><span>{item.label}</span>
          </button>;
        })}</div>
      </div>)}
    </nav>
  </>;
}
