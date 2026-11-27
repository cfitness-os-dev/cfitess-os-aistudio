import {LeadCampaignSchedulePanel} from './LeadCampaignSchedulePanel';
import {LeadSmsPreferencesPanel} from "./LeadSmsPreferencesPanel";
import { useEffect, useRef, useState } from 'react';
import { newScenarioOperationId, scenarioRequest, type LeadCampaign, type ScenarioWorkspace, type ScenarioCommand } from '../../domain/leadScenariosApi';
import type { ScenarioClubId } from '../../domain/leadScenarioDefinitions';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import { estimateSms } from '../../domain/leadMessageTemplates';

const input='w-full rounded-lg border border-slate-500/40 bg-transparent p-3 min-h-[44px]';
const button='rounded-lg border border-slate-500/40 p-3 min-h-[44px] text-sm disabled:opacity-40';
type Draft={name:string;templateId:string;statusIds:string[];sourceIds:string[];segmentIds:string[];channel:'email'|'sms'};
const fresh=():Draft=>({name:'',templateId:'',statusIds:[],sourceIds:[],segmentIds:[],channel:'email'});
export function LeadCampaignsView({actorId,clubId,onOpenModels}:{actorId:string;clubId:ScenarioClubId|null;onOpenModels?:()=>void}) {
  const [workspace,setWorkspace]=useState<ScenarioWorkspace|null>(null);
  const [selected,setSelected]=useState<LeadCampaign|null>(null);
  const [draft,setDraft]=useState<Draft>(fresh);
  const [editing,setEditing]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [sms,setSms]=useState('');
  const retry=useRef<{body:string;id:string}|null>(null);
  const request=useRef<AbortController|null>(null);
  useLeadDraftGuard(dirty);
  async function act(command?:ScenarioCommand) {
    if(!clubId)return;
    request.current?.abort(); const controller=new AbortController();request.current=controller;
    setBusy(true);setError('');setNotice('');
    if(command && retry.current?.body!==JSON.stringify(command))retry.current={body:JSON.stringify(command),id:newScenarioOperationId()};
    try {
      const data=await scenarioRequest(actorId,clubId,command,retry.current?.id,controller.signal);
      if(controller.signal.aborted)return;
      setWorkspace(data);retry.current=null;
      const id=command?.action==='save_campaign' ? command.campaignId??data.commandResult?.campaignId : selected?.id;
      const saved=data.campaigns?.find(row=>row.campaign.id===id)?.campaign;
      if(saved && (command?.action==='save_campaign'||!dirty)) {setSelected(saved);setDraft({name:saved.name,templateId:saved.templateId,statusIds:saved.statusIds,sourceIds:saved.sourceIds,segmentIds:saved.segmentIds,channel:saved.channel});setDirty(false);}
      if(command)setNotice(command.action==='schedule_campaign'?'Simulation programmée. Aucun message envoyé.':command.action==='cancel_campaign_schedule'?'Programmation annulée. Aucun message envoyé.':command.action==='run_campaigns'?'Échéances vérifiées. Aucun message envoyé.':command.action==='set_sms_consent'||command.action==='stop_sms'?'Préférence SMS enregistrée. Aucun message envoyé.':command.action==='simulate_campaign'?'Simulation enregistrée. Aucun message envoyé.':'Campagne enregistrée.');
    } catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Enregistrement non confirmé.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{setWorkspace(null);setSelected(null);setEditing(false);setDirty(false);setDraft(fresh());retry.current=null;void act();return()=>request.current?.abort();},[actorId,clubId]);
  function open(c:LeadCampaign|null){if(!confirmLeadDraftNavigation(()=>open(c)))return;setSelected(c);setDraft(c?{name:c.name,templateId:c.templateId,statusIds:c.statusIds,sourceIds:c.sourceIds,segmentIds:c.segmentIds,channel:c.channel}:fresh());setEditing(true);setDirty(false);setError('');}
  function edit(patch:Partial<Draft>){setDraft(d=>({...d,...patch}));setDirty(true);setNotice('');}
  const row=workspace?.campaigns?.find(row=>row.campaign.id===selected?.id);
  const pending=!!row?.campaign.schedules?.some(s=>s.status==='scheduled');
  const smsEstimate=estimateSms(sms);
  if(!clubId)return <p>Choisissez un club pour ses campagnes.</p>;
  return <section aria-label="Campagnes" className="space-y-4" aria-busy={busy}>
    <header className="cf-card p-4 flex flex-wrap gap-3 justify-between"><div><h2 className="text-lg font-bold">Campagnes</h2><p>{clubId==='beynost'?'Beynost':'Carré de Soie'} · Modèles et ciblage du club</p></div><div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>void act()}>Actualiser les campagnes</button><button className={button} disabled={busy||!workspace} onClick={()=>open(null)}>Créer une campagne</button></div></header>
    <p className="text-sm p-3 rounded-lg bg-amber-500/10">Simulation uniquement : aucun email ou SMS envoyé. Les emails existants de Heitz restent gérés par Heitz. Les anciens brouillons enregistrés dans le navigateur ne sont pas importés automatiquement.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {workspace&&<div className="grid xl:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)] gap-4"><aside className="cf-card self-start p-4 space-y-2">{workspace.campaigns?.map(({campaign:c})=><button key={c.id} className={`${button} w-full text-left break-words`} disabled={busy} onClick={()=>open(c)}>{c.name} · {c.channel==='sms'?'SMS':'Email'} · {c.archived?'Archivée':`Version ${c.revision}`}</button>)}{!workspace.campaigns?.length&&<p>Aucune campagne dans ce club.</p>}</aside>
    {editing?<div className="cf-card p-4 space-y-4"><h3>{selected?'Modifier la campagne':'Nouvelle campagne'}{dirty?' · Non enregistrée':''}</h3><fieldset disabled={busy||selected?.archived||pending} className="space-y-3"><label className="block">Nom de la campagne<input className={input} value={draft.name} maxLength={200} onChange={e=>edit({name:e.target.value})}/></label><label className="block">Canal de campagne<select className={input} disabled={!!selected} value={draft.channel} onChange={e=>edit({channel:e.target.value as 'email'|'sms',templateId:''})}><option value="email">Email</option><option value="sms">SMS</option></select></label><label className="block">Modèle de campagne<select className={input} value={draft.templateId} onChange={e=>edit({templateId:e.target.value})}><option value="">Choisir un modèle enregistré</option>{workspace.templates.filter(t=>t.message.channel===draft.channel&&!t.archived).map(t=><option key={t.id} value={t.id}>{t.message.name} · Version {t.revision}</option>)}</select></label><p className="text-sm">Créez et composez votre message dans Modèles de messages. Le contenu utilisé sera figé dans l’historique de simulation.</p><div className="cf-card-secondary rounded-xl p-3 space-y-2">
      {!workspace.templates.some(template=>template.message.channel===draft.channel&&!template.archived)&&<p className="text-sm">Aucun modèle {draft.channel==='sms'?'SMS':'email'} actif dans ce club. Créez un modèle avant d’enregistrer cette campagne.</p>}
      {onOpenModels&&<button type="button" className={button} onClick={onOpenModels}>Ouvrir les modèles de messages</button>}
    </div>
    <fieldset><legend>Statuts ciblés — aucun choix : tous</legend><div className="flex flex-wrap gap-3">{workspace.statusIds.map(s=><label key={s} className="flex items-center gap-2"><input type="checkbox" checked={draft.statusIds.includes(s)} onChange={e=>edit({statusIds:e.target.checked?[...draft.statusIds,s]:draft.statusIds.filter(v=>v!==s)})}/>{s}</label>)}</div></fieldset>
    <fieldset><legend>Sources ciblées — aucun choix : toutes</legend><div className="flex flex-wrap gap-3">{workspace.sources.map(s=><label key={s} className="flex items-center gap-2"><input type="checkbox" checked={draft.sourceIds.includes(s)} onChange={e=>edit({sourceIds:e.target.checked?[...draft.sourceIds,s]:draft.sourceIds.filter(v=>v!==s)})}/>{s}</label>)}</div></fieldset>
    <fieldset><legend>Segments ciblés — au moins un des choix, aucun : tous</legend><div className="flex flex-wrap gap-3">{(workspace.segments??[]).map(segment=><label key={segment} className="flex items-center gap-2"><input type="checkbox" checked={draft.segmentIds.includes(segment)} onChange={e=>edit({segmentIds:e.target.checked?[...draft.segmentIds,segment]:draft.segmentIds.filter(v=>v!==segment)})}/>{segment}</label>)}</div></fieldset>
    <button className={button} disabled={!draft.name.trim()||!draft.templateId} onClick={()=>void act({action:'save_campaign',campaignId:selected?.id??null,expectedRevision:selected?.revision??null,name:draft.name,templateId:draft.templateId,statusIds:draft.statusIds,sourceIds:draft.sourceIds,segmentIds:draft.segmentIds})}>Enregistrer la campagne</button></fieldset>
    {dirty?<p>Enregistrez pour actualiser la liste des destinataires.</p>:row&&<div className="space-y-3"><p>{row.audience.eligibleIds.length} destinataire(s) éligible(s) · {row.audience.excluded.length} exclu(s). Seul le club de cette campagne est ciblé. Le contrôle sera refait au lancement de la simulation.</p>{row.audience.excluded.map((r,i)=><p key={i} className="text-sm">Exclusion : {r.reason}</p>)}<button className={button} disabled={busy||pending||row.campaign.archived||!workspace.simulationAvailable||row.campaign.simulatedRevisions.includes(row.campaign.revision)} onClick={()=>void act({action:'simulate_campaign',campaignId:row.campaign.id,expectedRevision:row.campaign.revision})}>Simuler la campagne — aucun envoi</button><button className={button} disabled={busy||pending||row.campaign.archived} onClick={()=>{if(window.confirm('Archiver cette campagne ?'))void act({action:'archive_campaign',campaignId:row.campaign.id,expectedRevision:row.campaign.revision});}}>Archiver la campagne</button>{<LeadCampaignSchedulePanel key={row.campaign.id+JSON.stringify(row.campaign.schedules)} campaign={row.campaign} busy={busy} available={workspace.simulationAvailable} automatic={!!workspace.campaignSchedulingAutomatic} onCommand={command=>void act(command)}/>}<h4>Historique des simulations</h4>{row.campaign.runs.map((run,i)=><div key={i} className="rounded-lg border border-slate-500/30 p-3"><p>Version {run.revision} · {new Date(run.at).toLocaleString('fr-FR')} · Aucun envoi</p><p>{run.outcomes.filter(o=>o.status==='simulated').length} préparé(s), {run.outcomes.filter(o=>o.status==='excluded').length} exclu(s) au rendu.</p>{row.campaign.channel==='sms'&&<p>{run.estimatedSegments??0} segment(s) SMS estimé(s) après personnalisation ; mention de désabonnement réelle et tarification fournisseur non raccordées.</p>}</div>)}</div>}
    </div>:<p>Ouvrez une campagne ou créez votre premier brouillon.</p>}</div>}
    {workspace&&<LeadSmsPreferencesPanel workspace={workspace} busy={busy} onCommand={command=>void act(command)}/>}
    <details className="cf-card p-4"><summary>Préparer un SMS</summary><p className="text-sm">Calculateur complémentaire. Les campagnes SMS utilisent les modèles enregistrés et les préférences ci-dessus. Estimation hors instruction de désabonnement à confirmer avec le fournisseur ; aucun SMS envoyé ni coût engagé.</p><label className="block">Message SMS<textarea className={input} value={sms} onChange={e=>setSms(e.target.value)}/></label><p>{smsEstimate.units} unités · {smsEstimate.encoding} · {smsEstimate.segments} segment(s), avant remplacement des variables.</p></details>
  </section>;
}
