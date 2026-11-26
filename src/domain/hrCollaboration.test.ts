import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessages, validateCalendar, filterRhRecipients } from './hrCollaboration';
const messages = () => ({actorId:'emp-mario',clubId:'beynost',channel:'internal',recipients:[{id:'emp-chloe',name:'Chloé',teams:[{id:'accueil',name:'Accueil'}],fileStatus:'awaiting_employee'}],messages:[{id:'m',subject:'Consigne',body:'Bonjour',createdAt:'2026-11-26T12:00:00Z',recipientCount:1,receipts:[{employeeId:'emp-chloe',employeeName:'Chloé',read:false,readAt:null}]}],nextCursor:null});
test('messages: rejects another actor or club before replacing the current screen', () => {
  assert.throws(() => validateMessages(messages(),'emp-chloe','beynost'));
  assert.throws(() => validateMessages(messages(),'emp-mario','carre-de-soie'));
  assert.equal(validateMessages(messages(),'emp-mario','beynost').messages[0].receipts[0].read,false);
});
test('messages: incomplete read receipts and invalid pagination fail visibly', () => {
  const x=messages(); (x.messages[0].receipts[0] as {read:unknown}).read='yes';
  assert.throws(() => validateMessages(x,'emp-mario','beynost'));
  assert.throws(() => validateMessages({...messages(),nextCursor:42},'emp-mario','beynost'));
  assert.throws(() => validateMessages({...messages(),messages:[{...messages().messages[0],createdAt:'not-a-date'}]},'emp-mario','beynost'));
});
const status={actorId:'emp-chloe',enabled:true,issued:false,clubIds:[],createdAt:null};
test('calendar: only own status and known clubs are accepted', () => {
  assert.equal(validateCalendar(status,'emp-chloe').actorId,'emp-chloe');
  assert.throws(() => validateCalendar(status,'emp-mario'));
  assert.throws(() => validateCalendar({...status,clubIds:['another-club']},'emp-chloe'));
});
test('calendar: refuses external URLs and predictable legacy tokens', () => {
  const valid={actorId:'emp-chloe',clubIds:['beynost'],createdAt:'2026-11-26T12:00:00Z',relativeUrl:'/api/calendar/'+'a'.repeat(64)+'.ics'};
  assert.equal(validateCalendar(valid,'emp-chloe',true).actorId,'emp-chloe');
  for(const relativeUrl of ['https://example.com/steal','//example.com/a','/api/calendar/cal-emp-chloe.ics','/api/calendar/'+'a'.repeat(64)+'.ics?leak=1'])
    assert.throws(() => validateCalendar({...valid,relativeUrl},'emp-chloe',true));
});

test('audience combines team, search and file status without inventing recipients', () => {
  const recipients=[...messages().recipients,{id:'other',name:'Autre',teams:[{id:'sport',name:'Sport'}],fileStatus:'complete'}];
  assert.deepEqual(filterRhRecipients(recipients,' ChLoÉ ','accueil',true).map(r=>r.id),['emp-chloe']);
  assert.deepEqual(filterRhRecipients(recipients,'','sport',true),[]);
  assert.equal(filterRhRecipients(recipients,'','',false).length,2);
  assert.equal(recipients.length,2);
});
test('audience metadata must be complete before offering group selection', () => {
  assert.throws(()=>validateMessages({...messages(),recipients:[{id:'x',name:'X'}]},'emp-mario','beynost'));
  assert.throws(()=>validateMessages({...messages(),recipients:[{...messages().recipients[0],teams:[{id:'x'}]}]},'emp-mario','beynost'));
});
