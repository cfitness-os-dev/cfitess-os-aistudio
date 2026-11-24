const guards = new Set<symbol>();
let prompt: ((discard:()=>void)=>void)|null=null;
export function installLeadDraftPrompt(handler:(discard:()=>void)=>void):()=>void {prompt=handler;return()=>{if(prompt===handler)prompt=null;};}
export function discardLeadDrafts():void {guards.clear();}
export function registerLeadDraft(): () => void {
  const id=Symbol('lead-draft'); guards.add(id);
  return ()=>{ guards.delete(id); };
}
export function hasLeadDraft(): boolean { return guards.size > 0; }
export function confirmLeadDraftNavigation(discard?:()=>void): boolean {
  if(hasLeadDraft() && discard && prompt) {prompt(discard);return false;}
  return !hasLeadDraft() || window.confirm('Vos modifications ne sont pas enregistrées. Les abandonner pour continuer ?');
}
