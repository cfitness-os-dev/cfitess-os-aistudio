import { useEffect, useId, useRef, useState } from 'react';
import { Bell, RefreshCw, X } from 'lucide-react';
import { useCfos } from '../context/CfosContext';
import { requestNotifications, type NotificationPage } from '../domain/rhNotifications';
const btn='cf-card-secondary rounded-lg px-3 py-2 text-sm min-h-[40px] disabled:opacity-50';
export function PersonalNotifications({actor,club,variant='inbox'}:{actor:string;club:string;variant?:'bell'|'inbox'|'preview'}) {
  return <Inbox key={actor+':'+club} actor={actor} club={club} variant={variant}/>;
}
function Inbox({actor,club,variant}:{actor:string;club:string;variant:'bell'|'inbox'|'preview'}) {
  const {setActiveSection}=useCfos();
  const panelId=useId();const trigger=useRef<HTMLButtonElement>(null);
  const [data,setData]=useState<NotificationPage|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [tick,setTick]=useState(0);const [before,setBefore]=useState<string|undefined>();const [unread,setUnread]=useState(false);
  const [busy,setBusy]=useState(false);const [open,setOpen]=useState(false);
  const generation=useRef(0);const mounted=useRef(true);const writing=useRef(false);const root=useRef<HTMLDivElement>(null);const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(writing.current)return;
    const controller=new AbortController();const epoch=++generation.current;setError('');
    requestNotifications(actor,club,unread,before,undefined,controller.signal).then(value=>{if(!controller.signal.aborted&&epoch===generation.current)setData(value);}).catch(e=>{if(!controller.signal.aborted&&epoch===generation.current)setError(e.message);});
    return()=>controller.abort();
  },[actor,club,unread,before,tick]);
  useEffect(()=>{
    const refresh=()=>{if(!writing.current)setTick(t=>t+1);};
    const changed=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.actor===actor&&d?.club===club)refresh();};
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    window.addEventListener('cfos:notifications-changed',changed);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
    const timer=window.setInterval(visible,30000);
    return()=>{clearInterval(timer);window.removeEventListener('cfos:notifications-changed',changed);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
  },[actor,club]);
  useEffect(()=>{
    if(!open)return;close.current?.focus();
    const dismiss=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[open]);
  async function read(ids:string[]) {
    if(writing.current||!ids.length)return;writing.current=true;++generation.current;setBusy(true);setError('');setNotice('');
    try {const next=await requestNotifications(actor,club,unread,undefined,ids);if(mounted.current){setData(next);setBefore(undefined);setNotice('Lecture enregistrée.');}}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Lecture non enregistrée.');}
    finally {writing.current=false;if(mounted.current)setBusy(false);}
  }
  function go(page:string){
    setActiveSection('my-day','personal-'+page);setOpen(false);
  }
  const entries=variant==='preview'?data?.notifications.slice(0,3):data?.notifications;
  const panel=<section aria-label="Mes notifications" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold flex items-center gap-2"><Bell size={16}/>Mes notifications</h2>{variant==='bell'&&<button ref={close} className={btn} onClick={()=>{setOpen(false);trigger.current?.focus();}} aria-label="Fermer les notifications"><X size={16}/></button>}</div>
    <p className="text-xs cf-muted">{club==='beynost'?'Beynost':'Carré de Soie'} · {data&&!error?data.unreadCount+' non lue(s)':'Actualisation nécessaire'}</p>
    {data?.demoMode&&<p className="text-xs cf-muted">Données de démonstration</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy} className={btn} onClick={()=>setTick(t=>t+1)}><RefreshCw size={14} className="inline mr-1"/>Actualiser</button>{variant!=='preview'&&<><button disabled={busy} className={btn} aria-pressed={!unread} onClick={()=>{setUnread(false);setBefore(undefined);}}>Toutes</button><button disabled={busy} className={btn} aria-pressed={unread} onClick={()=>{setUnread(true);setBefore(undefined);}}>Non lues</button></>}</div>
    {error?<div role="alert" className="text-rose-300">{error}</div>:(!data||data.unreadOnly!==unread)?<p role="status">Chargement des notifications…</p>:<>
      {notice&&<p role="status" className="text-emerald-300 text-sm">{notice}</p>}
      {!entries?.length&&<p className="cf-muted text-sm">{unread?'Aucune notification non lue sur cette page.':'Aucune notification sur cette page.'}</p>}
      {!!entries?.some(n=>!n.read)&&<button disabled={busy} className={btn} onClick={()=>void read(entries.filter(n=>!n.read).map(n=>n.id))}>{variant==='preview'?'Marquer ces notifications comme lues':'Marquer cette page comme lue'}</button>}
      {entries?.map(n=><article key={n.id} className="cf-card-secondary p-3 rounded-xl space-y-2 min-w-0"><h3 className="font-semibold text-sm break-words">{n.title}</h3>{n.senderName&&<p className="cf-muted text-xs">De {n.senderName}</p>}<p className="whitespace-pre-wrap break-words text-sm">{n.message}</p><p className="text-xs cf-muted">{Number.isFinite(Date.parse(n.createdAt))?new Date(n.createdAt).toLocaleString('fr-FR'):'Date à vérifier'} · {n.read?'Lue':'Non lue'}</p><div className="flex flex-wrap gap-2">{!n.read&&<button className={btn} disabled={busy} onClick={()=>void read([n.id])}>Marquer comme lue</button>}{['leave','time','team-leave'].includes(n.targetPage??'')&&<button className={btn} onClick={()=>{if(n.targetPage==='team-leave'){setActiveSection('my-day','MC04');setOpen(false);}else go(n.targetPage!);}}>Consulter</button>}</div></article>)}
      {variant!=='preview'&&<div className="flex flex-wrap gap-2">{before&&<button disabled={busy} className={btn} onClick={()=>setBefore(undefined)}>Revenir aux dernières</button>}{data.nextCursor&&<button disabled={busy} className={btn} onClick={()=>setBefore(data.nextCursor!)}>Plus anciennes</button>}</div>}
    </>}
    {variant!=='inbox'&&<button className={btn} onClick={()=>go('notifications')}>Ouvrir toutes mes notifications</button>}
  </section>;
  if(variant!=='bell')return <div className="cf-card p-4">{panel}</div>;
  return <div className="relative" ref={root}><button ref={trigger} aria-controls={open?panelId:undefined} type="button" aria-label={error?'Notifications indisponibles':data?'Notifications ('+data.unreadCount+' non lue(s))':'Notifications : chargement'} aria-expanded={open} onClick={()=>{setOpen(p=>!p);setTick(t=>t+1);}} className="relative w-9 h-9 rounded-xl border border-[var(--cf-border)] flex items-center justify-center"><Bell size={16}/>{data&&!error&&data.unreadCount>0&&<span className="absolute -top-1 -right-1 min-w-4 px-1 h-4 rounded-full bg-rose-500 text-white text-[10px]">{data.unreadCount>99?'99+':data.unreadCount}</span>}</button>{open&&<div id={panelId} className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[70dvh] overflow-y-auto cf-card p-4 shadow-xl z-50">{panel}</div>}</div>;
}
