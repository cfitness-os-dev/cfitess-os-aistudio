import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHrOrganisation } from './hrOrganisation';
const snapshot = {
  demoMode:true,actorId:'actor-a',siteId:'club-a',revision:'a'.repeat(64),
  site:{id:'club-a',name:'Club A',address:'',city:'',siret:'',timezone:'Europe/Paris',settings:{}},teams:[{id:'t1',siteId:'club-a',name:'Équipe A'}],
  positions:[{id:'p1',siteId:'club-a',label:'Accueil',color:'#8b5cf6',defaultBreakMinutes:20,active:true}],profiles:[],
  organization:null,capabilities:{manageTeams:true,editClub:false,editOrganization:false,editProfiles:false},
};
test('RH organisation rejects another actor/site before exposing configuration',()=>{
  assert.throws(()=>validateHrOrganisation(snapshot,'actor-b','club-a'),/autre compte/);
  assert.throws(()=>validateHrOrganisation(snapshot,'actor-a','club-b'),/autre compte/);
});
test('RH organisation rejects mixed club references and unverifiable permissions',()=>{
  for(const bad of [
    {...snapshot,teams:[{siteId:'club-b',name:'Autre'}]},
    {...snapshot,positions:[{siteId:'club-b',label:'Autre'}]},
    {...snapshot,revision:''},
    {...snapshot,capabilities:{manageTeams:true}},
    {...snapshot,organization:undefined},
    {...snapshot,profiles:[{id:'p1'}]},
    {...snapshot,site:{id:'club-a'}},
    {...snapshot,teams:[...snapshot.teams,...snapshot.teams]},
    {...snapshot,positions:[{...snapshot.positions[0],active:'yes'}]},
    {...snapshot,organization:{id:'org',name:'Société'}},
  ]) assert.throws(()=>validateHrOrganisation(bad,'actor-a','club-a'),/incomplets/);
});
test('RH organisation accepts the scoped canonical snapshot without manufacturing missing organization rights',()=>{
  const result=validateHrOrganisation(snapshot,'actor-a','club-a');
  assert.equal(result.organization,null);
  assert.equal(result.capabilities.editProfiles,false);
  assert.equal(result.teams[0].name,'Équipe A');
});
