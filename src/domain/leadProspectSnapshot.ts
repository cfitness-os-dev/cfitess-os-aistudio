import type { ClubId, Prospect } from '../types/cfos';
export interface LeadProspectSnapshot { allowedClubs:ClubId[]; prospects:Prospect[] }
const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const club=(v:unknown):v is ClubId=>v==='beynost'||v==='carre-de-soie';
export function validateLeadSnapshot(value:unknown):LeadProspectSnapshot {
  if(!object(value) || !Array.isArray(value.allowedClubs) || !value.allowedClubs.every(club) ||
     new Set(value.allowedClubs).size!==value.allowedClubs.length || (!Array.isArray(value.prospects) || value.prospects.length>10000))
    throw new Error('La liste partagée est incomplète. Aucun contact local n’a été remplacé.');
  const clubs=value.allowedClubs;
  const rows=value.prospects.map((r:unknown)=>{
    if(!object(r) || !['id','firstName','lastName','phone','email','source','stage','createdAt'].every(k=>typeof r[k]==='string') ||
       !r.id || !club(r.clubId) || !clubs.includes(r.clubId) || typeof r.rgpdConsent!=='boolean' ||
       !(r.assignedToId===null || typeof r.assignedToId==='string') ||
       !Array.isArray(r.segments) || !r.segments.every(s=>typeof s==='string'))
      throw new Error('Un contact partagé est incomplet ou appartient à un autre club.');
    return {id:r.id,firstName:r.firstName,lastName:r.lastName,phone:r.phone,email:r.email,clubId:r.clubId,
      source:r.source,stage:r.stage,assignedToId:r.assignedToId??'',rgpdConsent:r.rgpdConsent,
      bloctelListed:false,smsStopOptOut:false,retryCount:0,goal:typeof r.comment==='string'?r.comment:'',
      notes:typeof r.comment==='string'?r.comment:'',createdAt:r.createdAt,segments:r.segments,
      leadStatus:typeof r.leadStatus==='string'?r.leadStatus:'',
      trialDate:typeof r.trialDate==='string'?r.trialDate:undefined,
      gender:typeof r.gender==='string'?r.gender:undefined,street:typeof r.street==='string'?r.street:undefined,
      postalCode:typeof r.postalCode==='string'?r.postalCode:undefined,city:typeof r.city==='string'?r.city:undefined,
      birthDate:typeof r.birthDate==='string'?r.birthDate:undefined,comment:typeof r.comment==='string'?r.comment:undefined} as Prospect;
  });
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('La liste partagée contient des références en double.');
  return {allowedClubs:clubs,prospects:rows};
}
export function reconcileLeadSnapshot(previous:Prospect[],history:Prospect[],snapshot:LeadProspectSnapshot) {
  const scope=new Set(snapshot.allowedClubs), incomingById=new Map(snapshot.prospects.map(r=>[r.id,r]));
  const ids=new Set(incomingById.keys()), historical=[...history], historyKeys=new Set(history.map(r=>JSON.stringify(r)));
  for(const row of previous) {
    const incoming=incomingById.get(row.id), key=JSON.stringify(row);
    if(scope.has(row.clubId) && (!incoming || JSON.stringify(incoming)!==key) && !historyKeys.has(key)){historical.push(row);historyKeys.add(key);}
  }
  return {prospects:[...previous.filter(r=>!scope.has(r.clubId)&&!ids.has(r.id)),...snapshot.prospects],history:historical};
}
