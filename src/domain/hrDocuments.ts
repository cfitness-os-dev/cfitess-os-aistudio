import { notificationsChanged } from './rhNotifications';
export interface RhDocument {
  id:string;employeeId:string;employeeName:string;title:string;category:string;fileName:string;mediaType:string;
  byteLength:number;createdAt:string;acknowledgedAt:string|null;archivedAt:string|null;
}
export interface RhDocuments {
  actorId:string;clubId:string;own:boolean;canUpload:boolean;maxBytes:number;categories:string[];
  employees:{id:string;name:string;canUpload:boolean}[];documents:RhDocument[];nextCursor:string|null;
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object';
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function validateRhDocuments(v:unknown,actor:string,club:string,own:boolean):RhDocuments {
  if(!obj(v)||v.actorId!==actor||v.clubId!==club||v.own!==own||typeof v.canUpload!=='boolean'||v.maxBytes!==4*1024*1024||
    !Array.isArray(v.categories)||!v.categories.every(c=>typeof c==='string')||
    !Array.isArray(v.employees)||!v.employees.every(e=>obj(e)&&typeof e.id==='string'&&typeof e.name==='string'&&typeof e.canUpload==='boolean'&&(!own||e.id===actor))||
    !Array.isArray(v.documents)||v.documents.length>50||new Set(v.documents.map(d=>obj(d)?d.id:null)).size!==v.documents.length||
    !v.documents.every(d=>obj(d)&&['id','employeeId','employeeName','title','category','fileName','mediaType'].every(k=>typeof d[k]==='string')&&
      ['application/pdf','image/png','image/jpeg'].includes(String(d.mediaType))&&Number.isSafeInteger(d.byteLength)&&Number(d.byteLength)>0&&Number(d.byteLength)<=Number(v.maxBytes)&&
      date(d.createdAt)&&(d.acknowledgedAt===null||date(d.acknowledgedAt))&&(d.archivedAt===null||date(d.archivedAt))&&(!own||(d.employeeId===actor&&d.archivedAt===null)))||
    !(v.nextCursor===null||typeof v.nextCursor==='string'))throw new Error('Les documents reçus ne correspondent pas à votre compte ou sont incomplets.');
  return v as unknown as RhDocuments;
}
function token(actor:string):string {
  if(window.sessionStorage.getItem('cfos_bearer_actor_id')!==actor)throw new Error('Reconnectez-vous pour consulter vos documents.');
  const value=window.sessionStorage.getItem('cfos_bearer_token');if(!value)throw new Error('Reconnectez-vous pour consulter vos documents.');return value;
}
async function request(actor:string,path:string,body?:unknown,signal?:AbortSignal):Promise<unknown>{
  const r=await fetch(path,{signal,method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token(actor),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  const value:unknown=await r.json();if(!r.ok)throw new Error(obj(value)&&typeof value.error==='string'?value.error:'Enregistrement non confirmé. Réessayez.');return value;
}
export async function loadRhDocuments(actor:string,club:string,own:boolean,archived=false,before?:string,signal?:AbortSignal){
  const query=new URLSearchParams();if(archived&&!own)query.set('includeArchived','true');if(before)query.set('before',before);
  return validateRhDocuments(await request(actor,'/api/'+(own?'me':'hr')+'/documents/'+encodeURIComponent(club)+(query.size?'?'+query:''),undefined,signal),actor,club,own);
}
export async function uploadRhDocument(actor:string,club:string,command:{employeeId:string;operationId:string;title:string;category:string;fileName:string;mediaType:string;base64:string}){
  const v=await request(actor,'/api/hr/documents/'+encodeURIComponent(club),command);
  if(!obj(v)||v.actorId!==actor||v.clubId!==club||typeof v.documentId!=='string')throw new Error('Import non confirmé. Votre saisie est conservée.');
  notificationsChanged(actor,club);return v.documentId;
}
export async function acknowledgeRhDocument(actor:string,club:string,id:string){
  const result=validateRhDocuments(await request(actor,'/api/me/documents/'+encodeURIComponent(club)+'/'+encodeURIComponent(id)+'/ack',{consent:true}),actor,club,true);
  notificationsChanged(actor,club);return result;
}
export async function archiveRhDocument(actor:string,club:string,id:string,archived:boolean){
  return validateRhDocuments(await request(actor,'/api/hr/documents/'+encodeURIComponent(club)+'/'+encodeURIComponent(id)+'/archive',{archived}),actor,club,false);
}
export async function downloadRhDocument(actor:string,club:string,document:RhDocument){
  const r=await fetch('/api/hr/documents/'+encodeURIComponent(club)+'/'+encodeURIComponent(document.id)+'/file',{headers:{Authorization:'Bearer '+token(actor)}});
  if(!r.ok)throw new Error('Le fichier ne peut pas être téléchargé. Actualisez ou contactez votre responsable.');
  if(r.headers.get('content-type')?.split(';')[0]!==document.mediaType)throw new Error('Le type du fichier nécessite une vérification.');
  const file=await r.blob();if(file.size!==document.byteLength)throw new Error('Le fichier reçu est incomplet.');
  return file;
}
export async function documentFile(file:File):Promise<{fileName:string;mediaType:string;base64:string}> {
  if(!file.size||file.size>4*1024*1024)throw new Error('Choisissez un fichier non vide de 4 Mo maximum.');
  const lower=file.name.toLowerCase();
  const mediaType=lower.endsWith('.pdf')?'application/pdf':lower.endsWith('.png')?'image/png':/\.(jpg|jpeg)$/.test(lower)?'image/jpeg':'';
  if(!mediaType||(file.type&&file.type!==mediaType))throw new Error('Formats acceptés : PDF, PNG et JPEG.');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error('Le fichier ne peut pas être lu.'));
    reader.onload=()=>{const value=reader.result;if(typeof value!=='string'||!value.includes(','))reject(new Error('Fichier illisible.'));else resolve({fileName:file.name,mediaType,base64:value.slice(value.indexOf(',')+1)});};
    reader.readAsDataURL(file);
  });
}
