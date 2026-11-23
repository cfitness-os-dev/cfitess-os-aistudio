import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_BLOCK_KINDS, createEmailBlock, emailDocumentText, validateEmailDocument, type EmailDocument } from './leadEmailBlocks';
import { validateMessage } from './leadMessageTemplates';
import { validateScenarioDefinition, type ScenarioDefinition } from './leadScenarioDefinitions';
import { embeddedImageBytes, MAX_EMAIL_IMAGE_BYTES, validateImageImport } from './leadEmailImages';

test('image import checks actual signature, total budget and replacement without double counting', () => {
  const png=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const doc:EmailDocument={version:1,blocks:[createEmailBlock('image','a'),createEmailBlock('image','b')]};
  assert.equal(validateImageImport(doc,'a','image/png',png),null);
  assert.match(validateImageImport(doc,'a','image/jpeg',png)!,/correspond/);
  assert.match(validateImageImport(doc,'a','image/png',new TextEncoder().encode('<svg/>'))!,/correspond/);
  assert.match(validateImageImport(doc,'deleted','image/png',png)!,/existe plus/);
  assert.equal(embeddedImageBytes('data:image/png;base64,YQ=='),1);
  assert.equal(embeddedImageBytes('data:image/jpeg;base64,YWI='),2);
  assert.equal(embeddedImageBytes('https://example.test/image.png'),0);
  doc.blocks[0].image='data:image/png;base64,'+Buffer.alloc(MAX_EMAIL_IMAGE_BYTES).toString('base64');
  assert.equal(validateImageImport(doc,'a','image/png',png),null);
  assert.match(validateImageImport(doc,'b','image/png',png)!,/2 Mo au total/);
});

test('all twelve blocks keep ordered content, styles and links; invalid media/schema/URLs rejected', () => {
  const document:EmailDocument={version:1,blocks:EMAIL_BLOCK_KINDS.map((kind,i)=>({...createEmailBlock(kind,`b${i}`),text:'Bonjour %prenom%',label:'Réserver',url:'https://example.test/rdv',image:'https://example.test/image.png',alt:'Illustration',html:'<p>Bonjour</p>',links:[{label:'Club',url:'https://example.test'}]}))};
  assert.deepEqual(validateEmailDocument(document),[]);
  assert.equal(document.blocks.length,12);
  assert.ok(emailDocumentText(document).includes('%unsubscribe-url%'));
  assert.deepEqual(validateMessage({name:'Email',channel:'email',subject:'Visite',body:'Version texte',emailDocument:document}),[]);
  const copy=structuredClone(document);copy.blocks[0].image='data:image/svg+xml;base64,PHN2Zz4=';assert.ok(validateEmailDocument(copy).length);
  copy.blocks[0].image='https://example.test/image.png';copy.blocks[0].url='javascript:alert(1)';assert.ok(validateEmailDocument(copy).length);
  copy.blocks[0].url='https://example.test';copy.blocks[0].style.padding[0]=101;assert.ok(validateEmailDocument(copy).length);
  for(const value of [null,7,[],{version:1,blocks:[{}]},{version:1,blocks:'bad'}]) assert.ok(validateEmailDocument(value).length);
});
test('conditional graph validates both branches and explicit action ends; loops, missing and disabled targets refused', () => {
  const base={enabled:true,delay:{amount:0,unit:'minutes' as const},templateId:null,content:null,comment:''};
  const d:ScenarioDefinition={schemaVersion:1,clubId:'beynost',name:'Parcours',mode:'manual',active:false,enrollmentLocked:false,conditions:null,steps:[{...base,id:'if',type:'condition',branch:{predicate:'status',values:['Client'],yesStepId:'yes',noStepId:'no'}},{...base,id:'yes',type:'email',content:'Parcours oui',next:{stepId:null}},{...base,id:'no',type:'sms',content:'Parcours non',next:{stepId:null}}]};
  const catalog={clubId:'beynost' as const,statusIds:['Client'],sourceIds:[],segmentIds:[],templates:[]};
  assert.ok(validateScenarioDefinition(d,catalog).ok);
  const back=structuredClone(d);back.steps[1].next={stepId:'if'};assert.equal(validateScenarioDefinition(back,catalog).ok,false);
  const missing=structuredClone(d);missing.steps[0].branch!.noStepId='deleted';assert.equal(validateScenarioDefinition(missing,catalog).ok,false);
  const disabled=structuredClone(d);disabled.steps[1].enabled=false;assert.equal(validateScenarioDefinition(disabled,catalog).ok,false);
  const foreign=structuredClone(d);foreign.steps[0].branch!.values=['Statut étranger'];assert.equal(validateScenarioDefinition(foreign,catalog).ok,false);
  const malformed=structuredClone(d);Reflect.set(malformed.steps[1],'emailDocument',7);assert.equal(validateScenarioDefinition(malformed,catalog).ok,false);
});
