import { useEffect, useRef, useState } from 'react';
import type { ApiAuthContext } from '../domain/clientApi';
import type { HrOrganisation, HrOrganisationCommand } from '../domain/hrOrganisation';
import { requestHrOrganisation } from '../domain/hrOrganisation';
import { useLeadDraftGuard } from './useLeadDraftGuard';

type Section = 'organization' | 'club' | 'teams' | 'positions';
type Draft = { kind: 'team' | 'position' | 'club' | 'organization' | 'profile'; id: string | null; values: Record<string,string>; checks: Record<string,boolean> };
const scopes: Record<string,string> = { self: 'Personnel', teams: 'Équipes encadrées', sites: 'Établissements' };
const emptyTeam = (): Draft => ({ kind:'team', id:null, values:{name:''}, checks:{} });
export function HrOrganisationSettingsPanel(props: { auth:ApiAuthContext; mode:'settings'|'profiles'; onRefresh:()=>Promise<void> }) {
  if (props.auth.siteId === 'all') return <p className="cf-card p-4">Choisissez un club pour consulter ses réglages RH.</p>;
  return <SettingsContent key={props.auth.actorId+':'+props.auth.siteId+':'+props.mode} {...props}/>;
}
function SettingsContent({auth,mode,onRefresh}:{auth:ApiAuthContext;mode:'settings'|'profiles';onRefresh:()=>Promise<void>}) {
  const [data,setData]=useState<HrOrganisation|null>(null);
  const [section,setSection]=useState<Section>(() => {
    const value=new URLSearchParams(window.location.search).get('rhReference');
    return ['organization','club','teams','positions'].includes(value??'') ? value as Section : 'teams';
  });
  const [draft,setDraft]=useState<Draft|null>(null);
  const [baseline,setBaseline]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [removeConfirmed,setRemoveConfirmed]=useState(false);
  const [reviewRequired,setReviewRequired]=useState(false);
  const alive=useRef(true), locked=useRef(false);
  const dirty=!!draft&&JSON.stringify(draft)!==baseline;
  useLeadDraftGuard(dirty||saving);
  useEffect(()=>{
    alive.current=true;
    const controller=new AbortController();
    requestHrOrganisation(auth,undefined,undefined,controller.signal).then(value=>{
      if(alive.current&&!controller.signal.aborted)setData(value);
    }).catch(e=>{if(!controller.signal.aborted&&alive.current)setError(e instanceof Error?e.message:'Chargement impossible.');})
      .finally(()=>{if(alive.current&&!controller.signal.aborted)setLoading(false);});
    return()=>{alive.current=false;controller.abort();};
  },[auth.actorId,auth.siteId,auth.token]);
  const open=(next:Draft)=>{
    if(dirty){setError('Enregistrez ou abandonnez votre saisie avant de changer de rubrique.');return;}
    setDraft(next);setBaseline(JSON.stringify(next));setRemoveConfirmed(false);setError('');setNotice('');setReviewRequired(false);
  };
  const edit=(key:string,value:string)=>setDraft(prev=>prev?{...prev,values:{...prev.values,[key]:value}}:prev);
  const refresh=async()=>{
    if(locked.current)return;
    locked.current=true;setLoading(true);setError('');setNotice('');
    try {
      const next=await requestHrOrganisation(auth);
      if(alive.current){setData(next);setReviewRequired(dirty);setNotice(dirty?'Données actualisées, votre saisie est conservée. Comparez-la aux données à jour avant de confirmer.':'Réglages actualisés.');}
    } catch(e){if(alive.current)setError(e instanceof Error?e.message:'Actualisation impossible.');}
    finally{locked.current=false;if(alive.current)setLoading(false);}
  };
  const save=async(command:HrOrganisationCommand)=>{
    if(locked.current||!data||loading)return;
    locked.current=true;setSaving(true);setError('');setNotice('');
    try{
      const next=await requestHrOrganisation(auth,command,data.revision);
      if(!alive.current)return;
      setData(next);setDraft(null);setBaseline('');setRemoveConfirmed(false);setReviewRequired(false);
      setNotice('Enregistrement confirmé sur le serveur.');
      try{await onRefresh();}catch{if(alive.current)setNotice('Enregistrement confirmé. Actualisez la page pour recharger les autres écrans.');}
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Enregistrement impossible.');}
    finally{locked.current=false;if(alive.current)setSaving(false);}
  };
  const command=():HrOrganisationCommand|null=>{
    if(!draft)return null;
    const v=draft.values;
    switch(draft.kind){
      case 'team':return{action:'save_team',id:draft.id,name:v.name};
      case 'position':return{action:'save_position',id:draft.id,label:v.label,color:v.color,defaultBreakMinutes:Number(v.defaultBreakMinutes),active:v.active==='true'};
      case 'club':return{action:'save_club',name:v.name,address:v.address,city:v.city,siret:v.siret};
      case 'organization':return{action:'save_organization',name:v.name,legalName:v.legalName,siren:v.siren,vatNumber:v.vatNumber,sector:v.sector,contactEmail:v.contactEmail,mealAllowanceEur:Number(v.mealAllowanceEur),billingNotice:v.billingNotice};
      case 'profile':return{action:'save_profile',profileId:draft.id!,scopeSelected:v.scopeSelected,checkedMap:draft.checks};
    }
  };
  const button='cf-input px-3 py-2 rounded-xl min-h-[44px] disabled:opacity-40';
  const field='cf-input w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl';
  const formDisabled=saving||loading;
  const fieldInput=(key:string,label:string,type='text',required=false,maxLength=200)=> <label key={key} className="block space-y-1">{label}<input className={field} type={type} required={required} maxLength={maxLength}
    value={draft?.values[key]??''} onChange={e=>edit(key,e.target.value)} {...(type==='number'?{min:0,max:key==='defaultBreakMinutes'?180:1000,step:key==='defaultBreakMinutes'?1:0.01}:{})}/></label>;
  const openOrganization=()=>{
    if(!data?.organization)return;
    const {id,...values}=data.organization;
    open({kind:'organization',id,values:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,String(v)])),checks:{}});
  };
  const canEdit=draft&&data&&(draft.kind==='profile'?data.capabilities.editProfiles:draft.kind==='organization'?data.capabilities.editOrganization:draft.kind==='club'?data.capabilities.editClub:data.capabilities.manageTeams);
  return <section aria-label={mode==='profiles'?'Profils et droits RH':'Organisation et référentiels RH'} className="cf-card p-4 space-y-4 min-w-0">
    <header className="space-y-2"><h2 className="font-bold text-lg">{mode==='profiles'?'Profils et droits RH':'Organisation, clubs et équipes'}</h2>
      {data&&<p>{data.site.name.replace(/\s*\(Fictif\)/gi,'')}</p>}
      {data?.demoMode&&<p className="text-amber-400 text-sm">Espace de test · données fictives</p>}
      <button type="button" className={button} disabled={saving||loading} onClick={()=>void refresh()}>Actualiser les réglages RH</button>
    </header>
    {loading&&<p role="status">Chargement des réglages…</p>}
    {error&&<p role="alert" className="text-red-400 whitespace-pre-wrap break-words">{error}</p>}
    {notice&&<p role="status" className="text-emerald-400">{notice}</p>}
    {data&&<>
      {mode==='settings'?<>
        <nav aria-label="Référentiels RH" className="flex flex-wrap gap-2">{([['organization','Société'],['club','Club actif'],['teams','Équipes'],['positions','Postes']] as const).map(([key,label])=><button type="button" key={key} aria-current={section===key?'page':undefined} className={button} disabled={saving||loading}
          onClick={()=>{if(dirty){setError('Enregistrez ou abandonnez votre saisie avant de changer de rubrique.');return;}setSection(key);const url=new URL(window.location.href);url.searchParams.set('rhReference',key);window.history.replaceState(null,'',url);setDraft(null);setError('');}}>{label}</button>)}</nav>
        {section==='organization'&&<div className="space-y-3"><p>La société est commune aux clubs. Sa modification nécessite les droits d’organisation sur chaque club.</p>
          {data.organization?<><p>{data.organization.name} · {data.organization.legalName}</p><p>SIREN : {data.organization.siren||'Non renseigné'}</p><button type="button" className={button} disabled={formDisabled||!data.capabilities.editOrganization} onClick={openOrganization}>Modifier la société</button></>:<p>La gestion de la société n’est pas autorisée pour votre profil sur l’ensemble des clubs.</p>}</div>}
        {section==='club'&&<div className="space-y-3"><p>{data.site.address} · {data.site.city}</p><p>SIRET : {data.site.siret||'Non renseigné'} · Fuseau : {data.site.timezone}</p>
          <button type="button" className={button} disabled={formDisabled||!data.capabilities.editClub} onClick={()=>open({kind:'club',id:data.site.id,values:{name:data.site.name,address:data.site.address,city:data.site.city,siret:data.site.siret},checks:{}})}>Modifier ce club</button></div>}
        {section==='teams'&&<div className="space-y-3">
          <p>Une équipe appartient à ce club. Les rattachements des salariés et les équipes encadrées restent distincts et se règlent dans leur fiche.</p>
          <button type="button" className={button} disabled={formDisabled||!data.capabilities.manageTeams} onClick={()=>open(emptyTeam())}>Créer une équipe</button>
          {!data.teams.length&&<p>Aucune équipe dans ce club.</p>}
          <ul className="space-y-2">{data.teams.map(row=><li key={row.id} className="cf-card-secondary p-3 rounded-xl flex flex-wrap gap-3 items-center justify-between"><span className="break-words min-w-0">{row.name}</span>
            <button type="button" className={button} disabled={formDisabled} onClick={()=>open({kind:'team',id:row.id,values:{name:row.name},checks:{}})}>Ouvrir l’équipe {row.name}</button></li>)}</ul>
        </div>}
        {section==='positions'&&<div className="space-y-3"><p>Les postes sont les références du planning de ce club. Désactiver un poste conserve son historique.</p>
          <button type="button" className={button} disabled={formDisabled||!data.capabilities.manageTeams} onClick={()=>open({kind:'position',id:null,values:{label:'',color:'#8b5cf6',defaultBreakMinutes:'0',active:'true'},checks:{}})}>Créer un poste</button>
          <ul className="space-y-2">{data.positions.map(row=><li key={row.id} className="cf-card-secondary p-3 rounded-xl flex flex-wrap items-center justify-between gap-3"><span className="break-words">{row.label} · Pause {row.defaultBreakMinutes} min · {row.active?'Actif':'Inactif'}</span>
            <button type="button" className={button} disabled={formDisabled} onClick={()=>open({kind:'position',id:row.id,values:{label:row.label,color:row.color,defaultBreakMinutes:String(row.defaultBreakMinutes),active:String(row.active)},checks:{}})}>Ouvrir le poste {row.label}</button></li>)}</ul>
        </div>}
      </>:<div className="space-y-3"><p>Les définitions des profils sont communes aux clubs ; leur modification nécessite les droits correspondants dans chaque club. Le profil attribué à un salarié peut être différent d’un club à l’autre.</p>
        {!data.capabilities.editProfiles&&<p>Consultation uniquement. La modification globale des profils n’est pas autorisée.</p>}
        <div className="flex flex-wrap gap-2">{data.profiles.map(profile=><button type="button" className={button} key={profile.id} disabled={formDisabled} onClick={()=>open({kind:'profile',id:profile.id,values:{scopeSelected:profile.scopeSelected},checks:Object.fromEntries(profile.rows.filter(r=>r.exposed&&r.editableControl).map(r=>[r.actionId,r.checked===true]))})}>{profile.name}</button>)}</div>
      </div>}
      {draft&&<form className="border-t border-slate-500/30 pt-4 space-y-4" onSubmit={e=>{e.preventDefault();const next=command();if(next)void save(next);}}>
        <h3 className="font-bold">{draft.kind==='team'?'Équipe':draft.kind==='position'?'Poste':draft.kind==='profile'?'Personnaliser les droits':draft.kind==='club'?'Identité du club':'Société'}</h3>
        <fieldset disabled={formDisabled||!canEdit} className="space-y-3 min-w-0">
          {draft.kind==='team'&&fieldInput('name','Nom de l’équipe','text',true,100)}
          {draft.kind==='position'&&<>{fieldInput('label','Nom du poste','text',true,100)}{fieldInput('color','Couleur du poste','color',true)}{fieldInput('defaultBreakMinutes','Pause par défaut (minutes)','number',true)}
            <label className="flex gap-2"><input type="checkbox" checked={draft.values.active==='true'} onChange={e=>edit('active',String(e.target.checked))}/>Poste actif</label></>}
          {(draft.kind==='club'||draft.kind==='organization')&&<>
            {fieldInput('name',draft.kind==='club'?'Nom du club':'Nom affiché de la société','text',true,120)}
            {draft.kind==='club'?<>{fieldInput('address','Adresse','text',false,250)}{fieldInput('city','Ville','text',false,120)}{fieldInput('siret','SIRET','text',false,14)}</>:<>
              {fieldInput('legalName','Raison sociale','text',true,200)}{fieldInput('siren','SIREN','text',false,9)}{fieldInput('vatNumber','Numéro de TVA','text',false,40)}{fieldInput('sector','Secteur','text',false,120)}
              {fieldInput('contactEmail','Email de contact','email',false,254)}{fieldInput('mealAllowanceEur','Indemnité repas (€)','number',true)}
              <label className="block">Mention de facturation<textarea className={field} maxLength={2000} value={draft.values.billingNotice} onChange={e=>edit('billingNotice',e.target.value)}/></label>
            </>}
          </>}
          {draft.kind==='profile'&&(()=>{const profile=data.profiles.find(p=>p.id===draft.id);return profile&&<>
            <p className="font-semibold">{profile.name}</p><label className="block">Périmètre du profil<select className={field} disabled={!profile.scopeEditable} value={draft.values.scopeSelected} onChange={e=>edit('scopeSelected',e.target.value)}>
              {Array.from(new Set([profile.scopeSelected,...profile.scopeOptions])).map(value=><option key={value} value={value}>{scopes[value]??value}</option>)}</select></label>
            <p>Les droits verrouillés ou non proposés restent protégés. Les réglages de badgeuse demeurent réservés au propriétaire ou super administrateur.</p>
            {Array.from(new Set(profile.rows.map(r=>r.group))).map(group=><fieldset key={group} className="space-y-2 border border-slate-500/30 rounded-xl p-3"><legend className="font-semibold">{group}</legend>
              {profile.rows.filter(r=>r.group===group).map(row=><label key={row.actionId} className="flex items-start gap-3 py-2"><input type="checkbox" className="mt-1" disabled={!row.exposed||!row.editableControl||row.disabled===true}
                checked={row.exposed&&(draft.checks[row.actionId]??row.checked??false)} onChange={e=>setDraft({...draft,checks:{...draft.checks,[row.actionId]:e.target.checked}})}/><span>{row.label}{!row.exposed?' · Non proposé':!row.editableControl||row.disabled?' · Verrouillé':''}</span></label>)}
            </fieldset>)}</>;})()}
          {reviewRequired&&<label className="flex gap-2"><input type="checkbox" onChange={e=>{if(e.target.checked)setReviewRequired(false);}}/>J’ai comparé ma saisie aux réglages actualisés.</label>}
          <button className="cf-brand-gradient text-white rounded-xl px-4 py-3 min-h-[44px] disabled:opacity-40" disabled={!dirty||reviewRequired}>Enregistrer les réglages</button>
        </fieldset>
        <button type="button" className={button} disabled={saving} onClick={()=>{setDraft(null);setBaseline('');setReviewRequired(false);setError('');}}>Abandonner la saisie</button>
        {draft.kind==='team'&&draft.id&&data.capabilities.manageTeams&&<div className="space-y-2">
          <p>La suppression est refusée tant que l’équipe est attribuée ou encadrée.</p>
          <label className="flex gap-2"><input type="checkbox" disabled={formDisabled} checked={removeConfirmed} onChange={e=>setRemoveConfirmed(e.target.checked)}/>Je confirme la suppression de cette équipe inutilisée.</label>
          <button type="button" className={button} disabled={formDisabled||!removeConfirmed||dirty} onClick={()=>void save({action:'remove_team',id:draft.id!})}>Supprimer cette équipe</button>
        </div>}
      </form>}
    </>}
  </section>;
}
