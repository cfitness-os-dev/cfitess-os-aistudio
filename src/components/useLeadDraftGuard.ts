import { useEffect } from 'react';
import { registerLeadDraft } from '../domain/leadDraftGuard';
export function useLeadDraftGuard(dirty: boolean) {
  useEffect(()=>{
    if(!dirty)return;
    const unregister=registerLeadDraft();
    const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>{unregister();window.removeEventListener('beforeunload',beforeUnload);};
  },[dirty]);
}
