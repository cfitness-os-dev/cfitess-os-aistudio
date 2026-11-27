import { reconcileConfirmedLeadContact } from './leadProspectSnapshot';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLeadSnapshot,reconcileLeadSnapshot} from './leadProspectSnapshot';
const row=(id='shared',clubId='beynost')=>({id,clubId,firstName:'Contact',lastName:'Fictif',phone:'',email:id+'@example.invalid',
 source:'Site c.fitness',stage:'Nouveau',createdAt:'2026-11-26',rgpdConsent:false,segments:[],assignedToId:'commercial-authorized'});
const snapshot=(rows:unknown[]=[row()],allowedClubs=['beynost'])=>validateLeadSnapshot({allowedClubs,prospects:rows});
test('snapshot keeps actual server assignment and never invents a default employee',()=>{
 assert.equal(snapshot().prospects[0].assignedToId,'commercial-authorized');
 assert.equal(snapshot([{...row(),assignedToId:null}]).prospects[0].assignedToId,'');
});
test('incomplete, duplicate and foreign club snapshots fail before cache replacement',()=>{
 for(const value of [{},{allowedClubs:['beynost']},{allowedClubs:['beynost'],prospects:null},
 {allowedClubs:['beynost','beynost'],prospects:[]},{allowedClubs:['beynost'],prospects:[row('foreign','carre-de-soie')]},
 {allowedClubs:['beynost'],prospects:[row(),row()]},{allowedClubs:['beynost'],prospects:[{...row(),assignedToId:undefined}]}])
 assert.throws(()=>validateLeadSnapshot(value));
});
test('empty authoritative club list clears visible contacts but preserves local-only copies',()=>{
 const previous=snapshot([row('local')]).prospects;
 const untouched=JSON.stringify(previous);
 const result=reconcileLeadSnapshot(previous,[],snapshot([]));
 assert.equal(result.prospects.length,0);assert.equal(result.history.length,1);
 assert.equal(JSON.stringify(previous),untouched);
});
test('same email does not merge different IDs or silently delete a local record',()=>{
 const local=snapshot([{...row('local'),email:'same@example.invalid'}]).prospects;
 const shared=snapshot([{...row('shared'),email:'same@example.invalid'}]);
 const result=reconcileLeadSnapshot(local,[],shared);
 assert.deepEqual(result.prospects.map(p=>p.id),['shared']);assert.deepEqual(result.history.map(p=>p.id),['local']);
});
test('club scoped reconciliation preserves other clubs and deduplicates history on repeated reload',()=>{
 const previous=snapshot([row('local'),row('other','carre-de-soie')],['beynost','carre-de-soie']).prospects;
 const first=reconcileLeadSnapshot(previous,[],snapshot([]));
 assert.deepEqual(first.prospects.map(p=>p.id),['other']);
 const second=reconcileLeadSnapshot(previous,first.history,snapshot([]));
 assert.equal(second.history.length,1);
});
test('transfer by stable ID removes previous club copy and retains exact server club and assignment',()=>{
 const previous=snapshot([row('same')]).prospects;
 const transferred=snapshot([{...row('same','carre-de-soie'),assignedToId:'different-commercial'}],['beynost','carre-de-soie']);
 const result=reconcileLeadSnapshot(previous,[],transferred);
 assert.equal(result.prospects.length,1);assert.equal(result.prospects[0].clubId,'carre-de-soie');
 assert.equal(result.prospects[0].assignedToId,'different-commercial');
 assert.equal(result.history[0].clubId,'beynost');
});
test('local notes and enriched fields overwritten by server remain recoverable as older version',()=>{
 const original={...snapshot().prospects[0],notes:'Unsent local note',heitzPassageQrCode:'synthetic-local-qr'};
 const result=reconcileLeadSnapshot([original],[],snapshot());
 assert.notEqual(result.prospects[0].notes,original.notes);
 assert.equal(result.history[0].notes,original.notes);
 assert.equal(result.history[0].heitzPassageQrCode,'synthetic-local-qr');
});

test('target-only scope preserves prior transferred version without keeping it in the visible list',()=>{
 const previous=snapshot([{...row('moved'),comment:'older local comment'}]).prospects;
 const target=snapshot([row('moved','carre-de-soie')],['carre-de-soie']);
 const result=reconcileLeadSnapshot(previous,[],target);
 assert.equal(result.prospects.length,1);assert.equal(result.prospects[0].clubId,'carre-de-soie');
 assert.equal(result.history.length,1);assert.equal(result.history[0].clubId,'beynost');
 assert.equal(result.history[0].comment,'older local comment');
});

test('confirmed single-contact edit preserves other contacts and older local notes/segments',()=>{
 const raw=(id:string)=>({id,firstName:'Contact',lastName:'Fictif',phone:'0600000001',email:'',clubId:'carre-de-soie',source:'Tablette accueil',
  stage:'Nouveau',createdAt:'2026-11-27',assignedToId:null,rgpdConsent:false,segments:[],comment:''});
 const base=validateLeadSnapshot({allowedClubs:['carre-de-soie'],prospects:[raw('one'),raw('two')]}).prospects;
 const old={...base[0],notes:'Local-only note',segments:['Local tag']};
 const confirmed={...base[0],notes:'Shared note',serverRevision:'b'.repeat(64)};
 const result=reconcileConfirmedLeadContact([old,base[1]],[],confirmed);
 assert.equal(result.prospects.length,2);assert.equal(result.prospects[1].id,'two');
 assert.equal(result.prospects[0].notes,'Shared note');assert.equal(result.history[0].notes,'Local-only note');
 assert.deepEqual(result.history[0].segments,['Local tag']);
 const again=reconcileConfirmedLeadContact(result.prospects,result.history,confirmed);
 assert.equal(again.history.length,1);
});
test('confirmed single-contact creation never replaces another ID sharing the email',()=>{
 const raw=(id:string)=>({id,firstName:'Contact',lastName:'Fictif',phone:'',email:'same@example.invalid',clubId:'carre-de-soie',source:'Tablette accueil',
  stage:'Nouveau',createdAt:'2026-11-27',assignedToId:null,rgpdConsent:false,segments:[],comment:''});
 const rows=validateLeadSnapshot({allowedClubs:['carre-de-soie'],prospects:[raw('one'),raw('two')]}).prospects;
 const result=reconcileConfirmedLeadContact([rows[0]],[],rows[1]);
 assert.deepEqual(result.prospects.map(p=>p.id),['two','one']);assert.equal(result.history.length,0);
});
