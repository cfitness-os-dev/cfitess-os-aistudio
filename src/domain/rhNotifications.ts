import type { CollaboratorNotification } from '../types/cfos';
export interface NotificationPage { employeeId:string;clubId:string;demoMode:boolean;unreadCount:number;total:number;unreadOnly:boolean;notifications:CollaboratorNotification[];nextCursor:string|null }
export function validateNotifications(value:unknown,actor:string,club:string,unreadOnly:boolean):NotificationPage {
  if(!value||typeof value!=='object')throw new Error('Notifications incomplètes.');
  const r=value as NotificationPage;
  if(r.employeeId!==actor||r.clubId!==club||r.unreadOnly!==unreadOnly||typeof r.demoMode!=='boolean'||
    !Number.isSafeInteger(r.unreadCount)||r.unreadCount<0||!Number.isSafeInteger(r.total)||r.total<r.unreadCount||
    !Array.isArray(r.notifications)||r.notifications.length>50||r.total<r.notifications.length||
    !r.notifications.every(n=>n&&n.employeeId===actor&&(n.clubId==null||n.clubId===club)&&typeof n.id==='string'&&!!n.id&&
      typeof n.title==='string'&&typeof n.message==='string'&&typeof n.createdAt==='string'&&typeof n.read==='boolean'&&(!unreadOnly||!n.read))||
    new Set(r.notifications.map(n=>n.id)).size!==r.notifications.length||!(r.nextCursor===null||typeof r.nextCursor==='string'))
    throw new Error('Les notifications reçues ne correspondent pas à votre compte ou à ce club.');
  return r;
}
export function notificationsChanged(actor:string,club:string) { if(typeof window!=='undefined' && typeof window.dispatchEvent==='function') window.dispatchEvent(new CustomEvent('cfos:notifications-changed',{detail:{actor,club}})); }
export async function requestNotifications(actor:string,club:string,unreadOnly=false,before?:string,ids?:string[],signal?:AbortSignal):Promise<NotificationPage>{
  const token=window.sessionStorage.getItem('cfos_bearer_token');
  if(!token||window.sessionStorage.getItem('cfos_bearer_actor_id')!==actor)throw new Error('Reconnectez-vous pour consulter vos notifications.');
  const query=new URLSearchParams({unreadOnly:String(unreadOnly)});if(before&&!ids)query.set('before',before);
  const response=await fetch('/api/me/notifications/'+encodeURIComponent(club)+'?'+query,{method:ids?'POST':'GET',signal,headers:{Authorization:'Bearer '+token,...(ids?{'Content-Type':'application/json'}:{})},body:ids?JSON.stringify({ids}):undefined});
  const value:unknown=await response.json();
  if(!response.ok)throw new Error(value&&typeof value==='object'&&'error'in value&&typeof value.error==='string'?value.error:'Notifications indisponibles. Réessayez.');
  const result=validateNotifications(value,actor,club,unreadOnly);
  if(ids)notificationsChanged(actor,club);
  return result;
}
