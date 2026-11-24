import { useEffect, useRef, useState } from 'react';
import { newScenarioOperationId, scenarioRequest, type LeadCampaign, type ScenarioWorkspace, type ScenarioCommand } from '../../domain/leadScenariosApi';
import type { ScenarioClubId } from '../../domain/leadScenarioDefinitions';
import { confirmLeadDraftNavigation } from '../../domain/leadDraftGuard';
import { useLeadDraftGuard } from '../useLeadDraftGuard';
import { estimateSms } from '../../domain/leadMessageTemplates';

const input='w-full rounded-lg border border-slate-500/40 bg-transparent p-3 min-h-[44px]';
const button='rounded-lg border border-slate-500/40 p-3 min-h-[44px] text-sm disabled:opacity-40';
type Draft={name:string;templateId:string;statusIds:string[];sourceIds:string[]};
const fresh=():Draft=>({name:'',templateId:'',statusIds:[],sourceIds:[]});
export function LeadCampaignsView({actorId,clubId}:{actorId:string;clubId:ScenarioClubId|null}) {
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
      if(saved && (command?.action==='save_campaign'||!dirty)) {setSelected(saved);setDraft({name:saved.name,templateId:saved.templateId,statusIds:saved.statusIds,sourceIds:saved.sourceIds});setDirty(false);}
      if(command)setNotice(command.action==='simulate_campaign'?'Simulation enregistrée. Aucun message envoyé.':'Campagne enregistrée sur le serveur.');
    } catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Enregistrement non confirmé.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{setWorkspace(null);setSelected(null);setEditing(false);setDirty(false);setDraft(fresh());retry.current=null;void act();return()=>request.current?.abort();},[actorId,clubId]);
  function open(c:LeadCampaign|null){if(!confirmLeadDraftNavigation(()=>open(c)))return;setSelected(c);setDraft(c?{name:c.name,templateId:c.templateId,statusIds:c.statusIds,sourceIds:c.sourceIds}:fresh());setEditing(true);setDirty(false);setError('');}
  function edit(patch:Partial<Draft>){setDraft(d=>({...d,...patch}));setDirty(true);setNotice('');}
  const row=workspace?.campaigns?.find(row=>row.campaign.id===selected?.id);
  const smsEstimate=estimateSms(sms);
  if(!clubId)return <p>Choisissez un club pour ses campagnes.</p>;
  return <section aria-label="Campagnes" className="space-y-4" aria-busy={busy}>
    <header className="cf-card p-4 flex flex-wrap gap-3 justify-between"><div><h2 className="text-lg font-bold">Campagnes</h2><p>{clubId==='beynost'?'Beynost':'Carré de Soie'} · Modèles et ciblage du club</p></div><div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>void act()}>Actualiser les campagnes</button><button className={button} disabled={busy||!workspace} onClick={()=>open(null)}>Créer une campagne</button></div></header>
    <p className="text-sm p-3 rounded-lg bg-amber-500/10">Simulation uniquement : aucun email envoyé. Les emails existants de Heitz restent gérés par Heitz. Les anciens brouillons enregistrés dans le navigateur ne sont pas importés automatiquement.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {workspace&&<div className="grid xl:grid-cols-[minmax(220px,1fr)_minmax(0,3fr)] gap-4"><aside className="cf-card p-4 space-y-2">{workspace.campaigns?.map(({campaign:c})=><button key={c.id} className={`${button} w-full text-left break-words`} disabled={busy} onClick={()=>open(c)}>{c.name} · {c.archived?'Archivée':`Version ${c.revision}`}</button>)}{!workspace.campaigns?.length&&<p>Aucune campagne dans ce club.</p>}</aside>
    {editing?<div className="cf-card p-4 space-y-4"><h3>{selected?'Modifier la campagne':'Nouvelle campagne'}{dirty?' · Non enregistrée':''}</h3><fieldset disabled={busy||selected?.archived} className="space-y-3"><label className="block">Nom de la campagne<input className={input} value={draft.name} maxLength={200} onChange={e=>edit({name:e.target.value})}/></label><label className="block">Modèle email<select className={input} value={draft.templateId} onChange={e=>edit({templateId:e.target.value})}><option value="">Choisir un modèle enregistré</option>{workspace.templates.filter(t=>t.message.channel==='email'&&!t.archived).map(t=><option key={t.id} value={t.id}>{t.message.name} · Version {t.revision}</option>)}</select></label><p className="text-sm">Créez et composez votre email dans Modèles de messages. Le contenu utilisé sera figé dans l’historique de simulation.</p>
    <fieldset><legend>Statuts ciblés — aucun choix : tous</legend><div className="flex flex-wrap gap-3">{workspace.statusIds.map(s=><label key={s} className="flex items-center gap-2"><input type="checkbox" checked={draft.statusIds.includes(s)} onChange={e=>edit({statusIds:e.target.checked?[...draft.statusIds,s]:draft.statusIds.filter(v=>v!==s)})}/>{s}</label>)}</div></fieldset>
    <fieldset><legend>Sources ciblées — aucun choix : toutes</legend><div className="flex flex-wrap gap-3">{workspace.sources.map(s=><label key={s} className="flex items-center gap-2"><input type="checkbox" checked={draft.sourceIds.includes(s)} onChange={e=>edit({sourceIds:e.target.checked?[...draft.sourceIds,s]:draft.sourceIds.filter(v=>v!==s)})}/>{s}</label>)}</div></fieldset>
    <button className={button} disabled={!draft.name.trim()||!draft.templateId} onClick={()=>void act({action:'save_campaign',campaignId:selected?.id??null,expectedRevision:selected?.revision??null,...draft})}>Enregistrer la campagne</button></fieldset>
    {dirty?<p>Enregistrez pour recalculer le ciblage sur le serveur.</p>:row&&<div className="space-y-3"><p>{row.audience.eligibleIds.length} destinataire(s) éligible(s) · {row.audience.excluded.length} exclu(s). Seul le club de cette campagne est ciblé. Le contrôle sera refait au lancement de la simulation.</p>{row.audience.excluded.map((r,i)=><p key={i} className="text-sm">Exclusion : {r.reason}</p>)}<button className={button} disabled={busy||row.campaign.archived||!workspace.simulationAvailable||row.campaign.simulatedRevisions.includes(row.campaign.revision)} onClick={()=>void act({action:'simulate_campaign',campaignId:row.campaign.id,expectedRevision:row.campaign.revision})}>Simuler la campagne — aucun envoi</button><button className={button} disabled={busy||row.campaign.archived} onClick={()=>{if(window.confirm('Archiver cette campagne ?'))void act({action:'archive_campaign',campaignId:row.campaign.id,expectedRevision:row.campaign.revision});}}>Archiver la campagne</button><h4>Historique des simulations</h4>{row.campaign.runs.map((run,i)=><div key={i} className="rounded-lg border border-slate-500/30 p-3"><p>Version {run.revision} · {new Date(run.at).toLocaleString('fr-FR')} · Aucun envoi</p><p>{run.outcomes.filter(o=>o.status==='simulated').length} préparé(s), {run.outcomes.filter(o=>o.status==='excluded').length} exclu(s) au rendu.</p></div>)}</div>}
    </div>:<p>Ouvrez une campagne ou créez votre premier brouillon.</p>}</div>}
    <details className="cf-card p-4"><summary>Préparer un SMS</summary><p className="text-sm">Calculateur uniquement. Les campagnes SMS et leur gestion des refus ne sont pas encore raccordées au serveur ; aucun SMS envoyé ni coût engagé.</p><label className="block">Message SMS<textarea className={input} value={sms} onChange={e=>setSms(e.target.value)}/></label><p>{smsEstimate.units} unités · {smsEstimate.encoding} · {smsEstimate.segments} segment(s), avant remplacement des variables.</p></details>
  </section>;
}
