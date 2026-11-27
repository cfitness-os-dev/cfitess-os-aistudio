import type { ApiAuthContext } from './clientApi';
import type { ClubId, Prospect } from '../types/cfos';
import { validateLeadSnapshot } from './leadProspectSnapshot';

export type LeadContactFields = Partial<Pick<Prospect,
  'firstName'|'lastName'|'phone'|'email'|'source'|'goal'|'notes'|'address'|'comment'|
  'gender'|'street'|'postalCode'|'city'|'birthDate'|'rgpdConsent'|'stage'|'leadStatus'|'segments'>>;
export interface LeadContactWrite {
  clubId: ClubId;
  fields: LeadContactFields;
  target?: {id: string; revision: string};
}
interface Command { operationId: string; expectedRevision?: string; fields: LeadContactFields & {clubId?: ClubId} }
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const revision=(v:unknown):v is string=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
function confirmedFields(contact:Prospect,fields:Command['fields']):boolean {
  const normalizedPhone=(value:string)=>value.replace(/[\s.\-()]/g,'').replace(/^\+33/,'0');
  return Object.entries(fields).every(([key,value])=>{
    if(key==='clubId')return value===contact.clubId;
    const actual=(contact as unknown as Record<string,unknown>)[key];
    if(key==='segments')return Array.isArray(value) && Array.isArray(actual) &&
      JSON.stringify(Array.from(new Set(value.map(v=>String(v).trim()))).sort())===JSON.stringify([...actual].sort());
    if(key==='phone')return typeof value==='string' && typeof actual==='string' && normalizedPhone(value)===actual;
    if(key==='email')return typeof value==='string' && value.trim().toLowerCase()===actual;
    return typeof value==='string'?value.trim()===actual:value===actual;
  });
}
const allowedFields=new Set(['firstName','lastName','phone','email','source','goal','notes','address','comment','gender','street','postalCode','city','birthDate','rgpdConsent','stage','leadStatus','segments']);

export function validateContactAcknowledgment(value:unknown, actorId:string, clubId:ClubId, operationId:string, targetId?:string):Prospect {
  const row=object(value)?value.contact:null;
  if(!object(value) || value.ok!==true || value.actorId!==actorId || value.clubId!==clubId ||
     value.operationId!==operationId || typeof value.replayed!=='boolean' || !object(row) ||
     !revision(row.revision) || typeof row.canEdit!=='boolean' ||
     (targetId!==undefined && row.id!==targetId) ||
     !['goal','notes','address'].every(k=>typeof row[k]==='string'))
    throw new Error('L’enregistrement reçu est incomplet ou ne correspond pas à votre demande. La saisie est conservée.');
  return validateLeadSnapshot({allowedClubs:[clubId],prospects:[value.contact]}).prospects[0];
}
function bearer(auth:ApiAuthContext):string {
  if(auth.token?.trim())return auth.token.trim();
  if(typeof window!=='undefined')try {
    if(window.sessionStorage.getItem('cfos_bearer_actor_id')===auth.actorId) {
      const token=window.sessionStorage.getItem('cfos_bearer_token');
      if(token)return token;
    }
  } catch { /* A blocked storage must never authorize a fallback identity. */ }
  throw new Error('Reconnectez-vous pour enregistrer ce prospect. Votre saisie est conservée.');
}

/** Retains the same operation after an uncertain failure; concurrent identical clicks share a request. */
export function createLeadContactWriter() {
  const pending=new Map<string,Command>();
  const inFlight=new Map<string,Promise<Prospect>>();
  return function write(auth:ApiAuthContext,input:LeadContactWrite):Promise<Prospect> {
    let token:string;
    try {
      token=bearer(auth);
      if(!['beynost','carre-de-soie'].includes(input.clubId) ||
         (input.target && (!input.target.id || !revision(input.target.revision))) ||
         !Object.keys(input.fields).length || Object.keys(input.fields).some(k=>!allowedFields.has(k)))
        throw new Error('Actualisez le dossier avant de l’enregistrer. Votre saisie est conservée.');
    } catch(error) {return Promise.reject(error);}
    // Copy values now so a later form edit cannot change an in-flight command.
    const fields=JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(input.fields).sort(([a],[b])=>a.localeCompare(b))))) as LeadContactFields;
    const key=JSON.stringify([auth.actorId,input.clubId,input.target??null,fields]);
    const running=inFlight.get(key);if(running)return running;
    let command=pending.get(key);
    if(!command) {
      if(pending.size>=128)return Promise.reject(new Error('Trop de saisies restent à confirmer. Réessayez les enregistrements précédents.'));
      command={operationId:crypto.randomUUID(),...(input.target?{expectedRevision:input.target.revision}:{}),
        fields:{...fields,...(input.target?{}:{clubId:input.clubId})}};
      pending.set(key,command);
    }
    const sent=command, targetId=input.target?.id;
    const request=(async()=>{
      const response=await fetch('/api/lead/contacts'+(targetId?'/'+encodeURIComponent(targetId):''),{
        method:targetId?'PATCH':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify(sent),
      });
      let value:unknown;try{value=await response.json();}catch{throw new Error('Le serveur n’a pas confirmé l’enregistrement. Votre saisie est conservée.');}
      if(!response.ok)throw new Error(object(value) && typeof value.error==='string'?value.error:'Enregistrement refusé. Votre saisie est conservée.');
      const contact=validateContactAcknowledgment(value,auth.actorId,input.clubId,sent.operationId,targetId);
      if(!confirmedFields(contact,sent.fields))throw new Error('Le serveur a renvoyé des informations différentes de votre saisie. Vérifiez le dossier avant de réessayer.');
      pending.delete(key);return contact;
    })();
    inFlight.set(key,request);
    void request.finally(()=>{if(inFlight.get(key)===request)inFlight.delete(key);}).catch(()=>{});
    return request;
  };
}
