import {useEffect,useState} from 'react';
import {discardLeadDrafts,installLeadDraftPrompt} from '../domain/leadDraftGuard';
export function LeadDraftNavigationDialog(){
  const [pending,setPending]=useState<(()=>void)|null>(null);
  useEffect(()=>installLeadDraftPrompt(discard=>setPending(()=>discard)),[]);
  if(!pending)return null;
  return <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"><div role="dialog" aria-modal="true" aria-labelledby="lead-draft-title" className="cf-card p-5 max-w-md w-full space-y-4" onKeyDown={e=>{if(e.key==='Escape')setPending(null); if(e.key==='Tab'){const buttons=e.currentTarget.querySelectorAll<HTMLButtonElement>('button');const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}><h2 id="lead-draft-title" className="font-bold text-lg">Conserver votre rédaction ?</h2><p>Vos modifications ne sont pas enregistrées. Vous pouvez revenir à votre rédaction ou les abandonner pour continuer.</p><div className="flex flex-wrap gap-3"><button autoFocus className="rounded-lg border p-3 min-h-[44px]" onClick={()=>setPending(null)}>Continuer la rédaction</button><button className="rounded-lg bg-violet-600 text-white p-3 min-h-[44px]" onClick={()=>{const action=pending;discardLeadDrafts();setPending(null);action();}}>Abandonner et continuer</button></div></div></div>;
}
