import { useState } from 'react';
import type { Prospect } from '../types/cfos';
import { useCfos } from '../context/CfosContext';
import { useLeadDraftGuard } from './useLeadDraftGuard';
interface Props { prospect:Prospect; mode?:'edit'|'recover'; onClose:()=>void }
export function LeadContactEditor({prospect,mode='edit',onClose}:Props){
  const {updateProspect,createProspect}=useCfos();
  const [initial]=useState(()=>({firstName:prospect.firstName,lastName:prospect.lastName,phone:prospect.phone,email:prospect.email,
    source:prospect.source,goal:prospect.goal,notes:prospect.notes,address:prospect.address??'',
    rgpdConsent:mode==='recover'?false:prospect.rgpdConsent}));
  const [form,setForm]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dirty=JSON.stringify(form)!==JSON.stringify(initial);
  useLeadDraftGuard(dirty);
  const close=()=>{if(!busy && (!dirty || window.confirm('Fermer sans enregistrer vos modifications ?')))onClose();};
  const input='cf-input w-full min-h-11 px-3 py-2 rounded-lg mt-1';
  return <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
    <form role="dialog" aria-modal="true" aria-labelledby="lead-contact-editor-title"
      className="cf-card rounded-2xl w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 space-y-4"
      onSubmit={async e=>{
        e.preventDefault();if(busy)return;setBusy(true);setError('');
        const result=mode==='recover'
          ?await createProspect({...form,clubId:prospect.clubId,allowEmptyPhone:true})
          :await updateProspect(prospect.id,form,undefined,prospect.serverRevision);
        setBusy(false);if(result.ok)onClose();else setError(result.message);
      }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="lead-contact-editor-title" className="text-lg font-bold">{mode==='recover'?'Reprendre un contact local':'Modifier le prospect'}</h2>
        <button type="button" disabled={busy} onClick={close} className="min-h-11 px-3 rounded-lg cf-card-secondary">Fermer</button>
      </div>
      <p className="cf-muted text-sm">{mode==='recover'
        ?'Vérifiez les informations avant de créer un nouveau prospect partagé. L’ancienne copie reste conservée. Aucun message ne sera envoyé ; aucune adhésion ne sera créée.'
        :'Les modifications sont partagées avec le club après confirmation de leur enregistrement.'}</p>
      {error&&<p role="alert" className="text-rose-400 text-sm whitespace-pre-wrap">{error}</p>}
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          {([['firstName','Prénom'],['lastName','Nom'],['phone','Téléphone'],['email','Email'],['address','Adresse']] as const).map(([key,label])=>
            <label key={key} className="block text-sm font-semibold">{label}
              <input name={key} required={key==='firstName'||key==='lastName'} type={key==='email'?'email':'text'} value={form[key]}
                onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} className={input}/>
            </label>)}
          <label className="block text-sm font-semibold">Source d’acquisition
            <select value={form.source} className={input} onChange={e=>setForm(f=>({...f,source:e.target.value as Prospect['source']}))}>
              {Array.from(new Set([prospect.source,'Tablette accueil','Site c.fitness','Appel entrant','Parrainage'])).map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-semibold">Objectif sportif
          <textarea rows={2} value={form.goal} onChange={e=>setForm(f=>({...f,goal:e.target.value}))} className={input}/>
        </label>
        <label className="block text-sm font-semibold">Notes du contact
          <textarea rows={4} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} className={input}/>
        </label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={form.rgpdConsent}
          onChange={e=>setForm(f=>({...f,rgpdConsent:e.target.checked}))} className="mt-1"/>
          Consentement explicite du contact recueilli et vérifié
        </label>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" disabled={busy} onClick={close} className="min-h-11 px-4 cf-card-secondary rounded-lg">Annuler</button>
        <button type="submit" disabled={busy} className="min-h-11 px-4 bg-violet-600 text-white rounded-lg font-semibold disabled:opacity-50">
          {busy?'Enregistrement…':mode==='recover'?'Créer le prospect partagé':'Enregistrer les modifications'}
        </button>
      </div>
    </form>
  </div>;
}
