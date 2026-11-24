import {useEffect,useRef,useState} from 'react';
import {scenarioRequest,newScenarioOperationId,type ScenarioWorkspace,type ScenarioCommand} from '../../domain/leadScenariosApi';
import type {ScenarioClubId} from '../../domain/leadScenarioDefinitions';
import {prospectScenarios} from '../../domain/leadProspectScenarios';
import {useLeadDraftGuard} from '../useLeadDraftGuard';

const date=(value:string)=>Number.isNaN(new Date(value).getTime())?'Date à vérifier':new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris'});
const states={running:'En cours',completed:'Terminé',stopped:'Arrêté'};
export function LeadProspectScenariosPanel({actorId,clubId,prospectId}:{actorId:string;clubId:ScenarioClubId;prospectId:string}) {
  const [workspace,setWorkspace]=useState<ScenarioWorkspace|null>(null);
  const [selected,setSelected]=useState('');
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const sequence=useRef(0);const request=useRef<AbortController|null>(null);
  const retry=useRef<{body:string;id:string}|null>(null);
  useLeadDraftGuard(Object.values(reasons).some(value=>!!value.trim()));
  async function act(command?:ScenarioCommand) {
    const ticket=++sequence.current;request.current?.abort();const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setNotice('');
    if(command&&retry.current?.body!==JSON.stringify(command))retry.current={body:JSON.stringify(command),id:newScenarioOperationId()};
    try {
      const data=await scenarioRequest(actorId,clubId,command,retry.current?.id,controller.signal);
      if(controller.signal.aborted||ticket!==sequence.current)return;
      setWorkspace(data);
      setReasons(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>data.enrollments.some(e=>e.id===id && e.clubId===clubId && e.prospectId===prospectId && e.status==='running'))));
      if(command){retry.current=null;setNotice(command.action==='stop'?'Parcours arrêté sur le serveur. Les tâches déjà créées restent dans les Activités.':'Inscription confirmée sur le serveur. Aucun message envoyé.');}
      if(command?.action==='enroll')setSelected('');
    } catch(e) {if(!controller.signal.aborted&&ticket===sequence.current){setWorkspace(null);setError(e instanceof Error?e.message:'Chargement indisponible. Aucune modification confirmée.');}}
    finally {if(!controller.signal.aborted&&ticket===sequence.current)setBusy(false);}
  }
  useEffect(()=>{setWorkspace(null);setSelected('');setReasons({});retry.current=null;void act();return()=>{sequence.current++;request.current?.abort();};},[actorId,clubId,prospectId]);
  const data=workspace?prospectScenarios(workspace,clubId,prospectId):null;
  const button='min-h-[44px] rounded-lg border border-slate-500/40 p-3 text-sm disabled:opacity-40';
  return <section aria-label="Scénarios de ce prospect" aria-busy={busy} className="cf-card min-w-0 p-4 space-y-3">
    <header className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold">Scénarios de ce prospect</h3><p className="text-sm">{clubId==='beynost'?'Beynost':'Carré de Soie'} · Suivi et relances du contact</p></div><button className={button} disabled={busy} onClick={()=>void act()}>Actualiser les parcours du prospect</button></header>
    <p className="text-sm cf-muted">Les inscriptions et arrêts sont enregistrés sur le serveur. Les messages restent simulés ; aucun envoi ni changement dans Heitz ou Brevo.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {workspace&&!data?.contact&&<p>Ce contact n’est pas disponible dans les données du serveur pour ce club. Actualisez les données avant toute inscription.</p>}
    {data?.contact&&<>
      <p className="text-sm">Contact confirmé : {data.contact.name}</p>
      <fieldset disabled={busy||!workspace?.simulationAvailable} className="space-y-2"><label className="block">Scénario manuel à démarrer<select className="w-full min-w-0 min-h-[44px] rounded-lg border border-slate-500/40 bg-transparent p-3" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choisir un scénario</option>{data.choices.map(s=><option key={s.id} value={s.id}>{s.versions.at(-1)?.definition.name??s.draft.name} · Version {s.versions.at(-1)?.number}</option>)}</select></label><button className={button} disabled={!data.choices.some(s=>s.id===selected)} onClick={()=>void act({action:'enroll',scenarioId:selected,prospectId})}>Inscrire ce prospect au scénario</button></fieldset>
      {!data.choices.length&&<p className="text-sm cf-muted">Aucun scénario manuel disponible : il doit être publié, actif et ouvert aux inscriptions. Un contact déjà inscrit ne peut pas être réinscrit au même scénario, même après sa fin.</p>}
      {!data.enrollments.length&&<p>Aucun parcours enregistré pour ce prospect.</p>}
      {data.enrollments.map(e=>{
        const scenario=workspace?.scenarios.find(s=>s.id===e.scenarioId&&s.clubId===clubId);
        const name=scenario?.versions.find(v=>v.number===e.version)?.definition.name??scenario?.draft.name??'Scénario enregistré';
        return <article key={e.id} className="rounded-xl border border-slate-500/30 p-3 space-y-2 break-words">
          <h4 className="font-semibold">{name} · Version {e.version}</h4><p>{states[e.status]??'À vérifier'}</p>
          {e.status==='running'&&<p className="text-sm">Prochaine échéance : {date(e.nextAt)} (heure de France)</p>}
          <details><summary>Historique du parcours</summary>{e.history.length?e.history.map((event,index)=><div key={index} className="mt-2 border-t border-slate-500/20 pt-2 text-sm"><p>{date(event.at)}</p><p>{event.detail}</p>{event.renderedSubject&&<strong>{event.renderedSubject}</strong>}{event.renderedContent&&<p className="whitespace-pre-wrap">{event.renderedContent}</p>}{event.renderedHtml&&<iframe title="Email du parcours du prospect" sandbox="" referrerPolicy="no-referrer" className="w-full rounded-lg bg-white min-h-[300px]" srcDoc={event.renderedHtml}/>} {event.activityId&&<p>La tâche reste consultable dans les Activités.</p>}</div>):<p>Première étape en attente.</p>}</details>
          {e.status==='running'&&<fieldset disabled={busy||!workspace?.simulationAvailable} className="space-y-2"><label className="block">Motif d’arrêt pour {name}<textarea className="w-full min-h-[80px] rounded-lg border border-slate-500/40 bg-transparent p-3" maxLength={2000} value={reasons[e.id]??''} onChange={event=>setReasons(previous=>({...previous,[e.id]:event.target.value}))}/></label><button className={button} disabled={!reasons[e.id]?.trim()} onClick={()=>void act({action:'stop',enrollmentId:e.id,reason:reasons[e.id]})}>Arrêter ce parcours pour le prospect</button></fieldset>}
        </article>;
      })}
    </>}
  </section>;
}
