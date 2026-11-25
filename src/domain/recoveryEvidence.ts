import type { ClubId } from '../types/cfos';
export type EvidenceKind = 'contract'|'terms'|'debt_detail'|'payments'|'reminders';
export type RecoveryEventKind = 'contact'|'payment_reported'|'disputed'|'review_completed';
export interface EvidenceRow { id:string;kind:EvidenceKind;reference:string;version:string;signedOn:string|null;verifiedAt:string;actorId:string;reason:string;revokedAt:string|null;current:boolean }
export interface RecoveryEvidenceSnapshot {
  actorId:string;caseId:string;clubId:ClubId;revision:string;amountDueEur:number;canEdit:boolean;
  source:string|null;sourceUpdatedAt:string|null;documented:boolean;followupPaused:boolean;externalActionsEnabled:false;
  requirements:Array<{kind:EvidenceKind;label:string;verified:boolean}>;evidence:EvidenceRow[];
  nextActions:string[];callGuide:string[];timeline:Array<{id:string;caseId:string;actorId:string;kind:RecoveryEventKind;note:string;reference:string;timestamp:string}>;
  assistantFacts:{memberName:string;contractLabel:string;status:string;reportedReason:string;overdueDays:number|null;billedMonths:string[];reminderCount:number};notice:string;
}
export type EvidenceCommand = {action:'record';kind:EvidenceKind;reference:string;version:string;signedOn:string|null}|{action:'revoke';id:string}|{action:'interaction';kind:RecoveryEventKind;note:string;reference:string};
const kinds=['contract','terms','debt_detail','payments','reminders'];
export function validateRecoveryEvidence(value:unknown,actor:string,id:string,club:ClubId):RecoveryEvidenceSnapshot {
  const v=value as RecoveryEvidenceSnapshot;
  if(!v||v.actorId!==actor||v.caseId!==id||v.clubId!==club||!/^[a-f0-9]{64}$/.test(v.revision)||typeof v.canEdit!=='boolean'||v.externalActionsEnabled!==false||typeof v.followupPaused!=='boolean'||!Number.isFinite(v.amountDueEur)||v.amountDueEur<0||typeof v.documented!=='boolean'||!Array.isArray(v.requirements)||v.requirements.length<4||!v.requirements.every(r=>r&&kinds.includes(r.kind)&&typeof r.label==='string'&&typeof r.verified==='boolean')||new Set(v.requirements.map(r=>r.kind)).size!==v.requirements.length||!["contract","terms","debt_detail","payments"].every(k=>v.requirements.some(r=>r.kind===k))||v.documented!==(!v.followupPaused&&v.amountDueEur>0&&v.requirements.every(r=>r.verified))||!Array.isArray(v.evidence)||!v.evidence.every(r=>r&&typeof r.id==='string'&&kinds.includes(r.kind)&&typeof r.reference==='string'&&typeof r.version==='string'&&typeof r.actorId==='string'&&typeof r.reason==='string'&&(r.revokedAt===null||Number.isFinite(Date.parse(r.revokedAt)))&&(r.signedOn===null||/^\d{4}-\d{2}-\d{2}$/.test(r.signedOn))&&typeof r.current==='boolean'&&typeof r.verifiedAt==='string'&&Number.isFinite(Date.parse(r.verifiedAt)))||!Array.isArray(v.nextActions)||!v.nextActions.every(s=>typeof s==='string')||!Array.isArray(v.callGuide)||!v.callGuide.every(s=>typeof s==='string')||!Array.isArray(v.timeline)||!v.timeline.every(e=>e&&e.caseId===id&&['contact','payment_reported','disputed','review_completed'].includes(e.kind)&&typeof e.note==='string'&&typeof e.reference==='string')||(v.sourceUpdatedAt!==null&&!Number.isFinite(Date.parse(v.sourceUpdatedAt)))||!v.assistantFacts||typeof v.assistantFacts.memberName!=='string') throw new Error('Le dossier reçu ne correspond pas à votre compte et à ce club. Actualisez les informations.');
  return v;
}
export async function fetchRecoveryEvidence(actor:string,id:string,club:ClubId,input?:{expectedRevision:string;reviewConfirmed:boolean;reason:string;command:EvidenceCommand},signal?:AbortSignal):Promise<RecoveryEvidenceSnapshot> {
  const token=window.sessionStorage.getItem('cfos_bearer_token');
  if(!token||window.sessionStorage.getItem('cfos_bearer_actor_id')!==actor)throw new Error('Reconnectez-vous pour consulter ce dossier.');
  const response=await fetch('/api/recovery/cases/'+encodeURIComponent(id)+'/evidence',{method:input?'POST':'GET',signal,headers:{Authorization:'Bearer '+token,...(input?{'Content-Type':'application/json'}:{})},body:input?JSON.stringify(input):undefined});
  const value:unknown=await response.json();
  if(!response.ok)throw new Error(value&&typeof value==='object'&&'error' in value&&typeof value.error==='string'?value.error:'Dossier non confirmé par le serveur.');
  return validateRecoveryEvidence(value,actor,id,club);
}
export function recoveryFollowupCsv(rows:Array<{memberName:string;clubId:string;amountDueEur:number;daysOverdue:number;overdueDaysKnown?:boolean|null;complianceVerified?:boolean|null;hasSignedContract:boolean;hasCgvAccepted:boolean;hasIdAndRib:boolean;phone:string;email:string;status:string}>):string {
  const cell=(v:unknown)=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const declared=(c:typeof rows[number],value:boolean)=>c.complianceVerified===true?(value?'Déclaré présent — preuve à vérifier':'Déclaré absent'):'À vérifier';
  return '\uFEFF'+[['Adhérent','Club','Solde indiqué EUR','Retard déclaré','Contrat déclaré','CGV déclarées','Identité/RIB déclarés','Téléphone','Email','Statut'],...rows.map(c=>[c.memberName,c.clubId,c.amountDueEur.toFixed(2),c.overdueDaysKnown===true?c.daysOverdue:'À vérifier',declared(c,c.hasSignedContract),declared(c,c.hasCgvAccepted),declared(c,c.hasIdAndRib),c.phone,c.email,c.status])].map(row=>row.map(cell).join(';')).join('\r\n');
}
