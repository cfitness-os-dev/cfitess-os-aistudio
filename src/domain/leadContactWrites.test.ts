import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeadContactWriter,validateContactAcknowledgment } from './leadContactWrites';
const auth={actorId:'fictitious-actor',siteId:'all',token:'fictitious-test-token'};
const clubId='carre-de-soie' as const;
const contact={id:'pr-fictitious',firstName:'Contact',lastName:'Fictif',phone:'0600000001',email:'',
  source:'Tablette accueil',stage:'Nouveau',createdAt:'2026-11-26T12:00:00Z',clubId,
  rgpdConsent:false,assignedToId:null,segments:[],goal:'Objectif',notes:'Note',address:'',
  revision:'a'.repeat(64),canEdit:true};
const fields={firstName:'Contact',lastName:'Fictif',phone:'0600000001',email:''};
function ack(operationId:string){return {ok:true,actorId:auth.actorId,clubId,operationId,replayed:false,contact};}
test('acknowledgments preserve independent goal/notes and exact server revision',()=>{
 const p=validateContactAcknowledgment(ack('operation-0000001'),auth.actorId,clubId,'operation-0000001');
 assert.equal(p.goal,'Objectif');assert.equal(p.notes,'Note');assert.equal(p.serverRevision,'a'.repeat(64));
 assert.equal(p.assignedToId,'');assert.equal(p.canEdit,true);
});
test('wrong actor club operation target revision and missing details are rejected',()=>{
 const base=ack('operation-0000001');
 for(const bad of [{...base,actorId:'other'},{...base,clubId:'beynost'},{...base,operationId:'other'},
  {...base,contact:{...contact,revision:'bad'}},{...base,contact:{...contact,notes:undefined}},
  {...base,contact:{...contact,clubId:'beynost'}},{...base,ok:false}])
  assert.throws(()=>validateContactAcknowledgment(bad,auth.actorId,clubId,'operation-0000001'));
 assert.throws(()=>validateContactAcknowledgment(base,auth.actorId,clubId,'operation-0000001','different-id'));
});
test('create sends bearer and real fields without fallback email consent or assignee',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,init)=>{
   assert.equal(url,'/api/lead/contacts');assert.equal(init?.method,'POST');
   assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+auth.token);
   const body=JSON.parse(String(init?.body));assert.equal(body.fields.clubId,clubId);
   assert.equal(body.fields.email,'');assert.equal(body.fields.rgpdConsent,undefined);assert.equal(body.fields.assignedToId,undefined);
   return new Response(JSON.stringify(ack(body.operationId)));
  };
  assert.equal((await createLeadContactWriter()(auth,{clubId,fields})).id,contact.id);
 }finally{globalThis.fetch=original;}
});
test('uncertain failure retries identical operation and concurrent clicks share a request',async()=>{
 const original=globalThis.fetch;let calls=0;const ids:string[]=[];
 try{
  globalThis.fetch=async(_url,init)=>{
   calls++;const body=JSON.parse(String(init?.body));ids.push(body.operationId);
   if(calls===1)throw new Error('simulated connection loss');
   return new Response(JSON.stringify(ack(body.operationId)));
  };
  const write=createLeadContactWriter();await assert.rejects(write(auth,{clubId,fields}));
  const a=write(auth,{clubId,fields}),b=write(auth,{clubId,fields});
  assert.equal(a,b);await Promise.all([a,b]);assert.equal(calls,2);assert.equal(ids[0],ids[1]);
 }finally{globalThis.fetch=original;}
});
test('server failure malformed success and cross-account acknowledgment never become success',async()=>{
 const original=globalThis.fetch;
 try{
  for(const response of [new Response(JSON.stringify({error:'Fictitious disk failure'}),{status:500}),
   new Response('invalid JSON'),new Response(JSON.stringify(ack('wrong-operation')))]){
   globalThis.fetch=async()=>response;
   await assert.rejects(createLeadContactWriter()(auth,{clubId,fields}));
  }
 }finally{globalThis.fetch=original;}
});
test('edit includes expected revision and targets exact escaped record ID',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url,init)=>{
   assert.equal(url,'/api/lead/contacts/pr-fictitious');assert.equal(init?.method,'PATCH');
   const body=JSON.parse(String(init?.body));assert.equal(body.expectedRevision,contact.revision);
   assert.equal(body.fields.clubId,undefined);
   return new Response(JSON.stringify(ack(body.operationId)));
  };
  const p=await createLeadContactWriter()(auth,{clubId,target:{id:contact.id,revision:contact.revision},fields:{notes:'Note'}});
  assert.equal(p.notes,'Note');
 }finally{globalThis.fetch=original;}
});
test('missing session missing revision forbidden fields and empty patch never reach network',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;throw new Error('unexpected network');};
  const write=createLeadContactWriter();
  await assert.rejects(write({...auth,token:undefined},{clubId,fields}));
  await assert.rejects(write(auth,{clubId,fields:{}}));
  await assert.rejects(write(auth,{clubId,fields,target:{id:contact.id,revision:''}}));
  await assert.rejects(write(auth,{clubId,fields:JSON.parse('{"assignedToId":"another"}')}));
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});

test('a matching envelope with stale changed fields is not a confirmed save',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_url,init)=>new Response(JSON.stringify(ack(JSON.parse(String(init?.body)).operationId)));
  await assert.rejects(createLeadContactWriter()(auth,{clubId,fields:{...fields,notes:'different requested note'}}),/informations différentes/);
 }finally{globalThis.fetch=original;}
});
test('acknowledged normalized phone email and deduplicated segments match the submitted command',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(String(init?.body));
    return new Response(JSON.stringify({...ack(body.operationId),contact:{...contact,email:'contact@example.invalid',segments:['Suivi']}}));
  };
  const p=await createLeadContactWriter()(auth,{clubId,fields:{...fields,phone:'+33 6 00 00 00 01',email:' CONTACT@EXAMPLE.INVALID ',segments:[' Suivi ','Suivi']}});
  assert.equal(p.email,'contact@example.invalid');
 }finally{globalThis.fetch=original;}
});
