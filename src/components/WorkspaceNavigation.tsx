import { useEffect, useRef, useState, type ComponentType } from 'react';
import { ChevronDown, Lock } from 'lucide-react';

export interface WorkspaceItem {
  id: string;
  label: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  restricted?: boolean;
}

/** One contextual navigation for all modules; callbacks retain their draft and access guards. */
export function WorkspaceNavigation({ items, activeId, onSelect, label }: {
  items: WorkspaceItem[];
  activeId: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const groups = [...new Set(items.map(item => item.group))];
  const active = items.find(item => item.id === activeId);
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => setOpen(null), [activeId]);
  return <nav ref={root} aria-label={label} className="cf-card p-2 sm:p-3 min-w-0 relative"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        root.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
        setOpen(null);
      }
    }}>
    <label className="sm:hidden block text-sm font-semibold">
      <span className="block cf-muted px-1 mb-2">{label}</span>
      <select className="cf-input min-h-11 p-2 w-full" value={activeId} onChange={event => onSelect(event.target.value)}>
        {groups.map(group => <optgroup key={group} label={group}>
          {items.filter(item => item.group === group).map(item =>
            <option key={item.id} value={item.id}>{item.label}{item.restricted ? ' · Accès restreint' : ''}</option>)}
        </optgroup>)}
      </select>
    </label>
    <div className="hidden sm:flex flex-wrap items-center gap-2">
      {groups.map(group => {
        const selected = active?.group === group;
        const expanded = open === group;
        return <div key={group}>
          <button type="button" aria-expanded={expanded}
            onClick={() => setOpen(expanded ? null : group)}
            className={'min-h-11 rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ' +
              (selected ? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/35' : 'cf-muted hover:bg-violet-500/10')}>
            {group}<ChevronDown className={'w-4 h-4 shrink-0 transition-transform ' + (expanded ? 'rotate-180' : '')}/>
          </button>
          {expanded && <div className="absolute top-full left-0 right-0 mt-2 z-30 cf-card shadow-xl p-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {items.filter(item => item.group === group).map(item => {
              const Icon = item.restricted ? Lock : item.icon;
              return <button key={item.id} type="button" aria-current={activeId === item.id ? 'page' : undefined}
                title={item.restricted ? 'Cette rubrique nécessite une autorisation' : undefined}
                onClick={() => { setOpen(null); onSelect(item.id); }}
                className={'w-full min-h-11 rounded-lg px-3 py-2 flex items-center gap-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ' +
                  (activeId === item.id ? 'bg-violet-500/15 text-violet-400 font-semibold' : 'cf-muted hover:bg-violet-500/10')}>
                <Icon className="w-4 h-4 shrink-0"/><span>{item.label}</span>
                {item.restricted && <span className="sr-only"> · Accès restreint</span>}
              </button>;
            })}
          </div>}
        </div>;
      })}
      {active && <span className="ml-auto px-2 text-sm font-semibold">{active.label}</span>}
    </div>
  </nav>;
}
