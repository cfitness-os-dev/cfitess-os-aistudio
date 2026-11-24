import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prospectScenarios} from './leadProspectScenarios';
import type {ScenarioWorkspace,LeadScenario,ScenarioEnrollment} from './leadScenariosApi';
import type {ScenarioDefinition} from './leadScenarioDefinitions';

function scenario(id:string):LeadScenario {
  const definition:ScenarioDefinition={schemaVersion:1,clubId:'carre-de-soie',name:'Parcours publié',mode:'manual',active:false,enrollmentLocked:false,conditions:null,steps:[]};
  return {id,clubId:'carre-de-soie',revision:3,draft:{...definition,mode:'automatic'},versions:[{number:1,definition,publishedAt:'2026-11-24T10:00:00Z',publishedBy:'manager'}],active:true,enrollmentLocked:false,archived:false,updatedAt:'2026-11-24T10:00:00Z'};
}
function enrollment(id:string,prospectId:string,status:ScenarioEnrollment['status']):ScenarioEnrollment {
  return {id,scenarioId:'already',clubId:'carre-de-soie',prospectId,prospectName:'Contact',version:1,status,cursor:0,nextAt:'2026-11-25T09:00:00Z',createdAt:'2026-11-24T10:00:00Z',history:[]};
}
function workspace():ScenarioWorkspace {
  return {actorId:'manager',clubId:'carre-de-soie',simulationOnly:true,simulationAvailable:true,sources:[],statusIds:[],templates:[],prospects:[{id:'canonical',name:'Camille',status:'Nouveau',source:'web'}],scenarios:[scenario('available')],enrollments:[]};
}
test('prospect scenarios require exact canonical identity and club, never infer another contact',()=>{
  const w=workspace();w.enrollments=[enrollment('other','other-person','running')];
  assert.equal(prospectScenarios(w,'carre-de-soie','browser-only').contact,undefined);
  assert.deepEqual(prospectScenarios(w,'beynost','canonical').choices,[]);
  assert.deepEqual(prospectScenarios(w,'carre-de-soie','canonical').enrollments,[]);
  assert.equal(prospectScenarios(w,'carre-de-soie','canonical').choices.length,1);
});
test('manual enrollment follows published mode; unavailable and foreign scenarios are excluded',()=>{
  const w=workspace();w.scenarios=[scenario('available'),{...scenario('paused'),active:false},{...scenario('locked'),enrollmentLocked:true},{...scenario('archived'),archived:true},{...scenario('unpublished'),versions:[]},{...scenario('foreign'),clubId:'beynost'}];
  const automatic=scenario('automatic');automatic.versions[0].definition={...automatic.versions[0].definition,mode:'automatic'};w.scenarios.push(automatic);
  assert.deepEqual(prospectScenarios(w,'carre-de-soie','canonical').choices.map(s=>s.id),['available']);
});
test('existing running, completed or stopped enrollments prevent reentry and stay visible only for their contact',()=>{
  for (const status of ['running','completed','stopped'] as const) {
    const w=workspace();w.scenarios=[scenario('already')];w.enrollments=[enrollment('visible','canonical',status),{...enrollment('foreign','canonical','running'),clubId:'beynost'},enrollment('other','someone-else','running')];
    const data=prospectScenarios(w,'carre-de-soie','canonical');
    assert.deepEqual(data.choices,[]);assert.deepEqual(data.enrollments.map(e=>e.id),['visible']);
  }
});
