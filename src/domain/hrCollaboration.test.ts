import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMessages, validateCalendar, filterRhRecipients, validateSchedules, scheduledInstant } from './hrCollaboration';
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

const schedules=()=>({actorId:'emp-mario',clubId:'beynost',schedulerEnabled:true,scheduledMessages:[{id:'scheduled-1',subject:'Bonjour',body:'Consigne',scheduledAt:'2026-12-18T09:00:00Z',createdAt:'2026-11-26T09:00:00Z',status:'scheduled',finishedAt:null,publishedMessageId:null,reason:null,recipientCount:1}],nextCursor:null});
test('scheduled messages reject mismatched account, club, duplicate and incoherent delivery state',()=>{
  assert.equal(validateSchedules(schedules(),'emp-mario','beynost').scheduledMessages[0].status,'scheduled');
  assert.throws(()=>validateSchedules(schedules(),'emp-chloe','beynost'));
  assert.throws(()=>validateSchedules(schedules(),'emp-mario','carre-de-soie'));
  for(const row of [
    {...schedules().scheduledMessages[0],status:'published'},
    {...schedules().scheduledMessages[0],recipientCount:0},
    {...schedules().scheduledMessages[0],scheduledAt:'invalid'},
    {...schedules().scheduledMessages[0],status:'unknown'},
  ]) assert.throws(()=>validateSchedules({...schedules(),scheduledMessages:[row]},'emp-mario','beynost'));
  assert.throws(()=>validateSchedules({...schedules(),scheduledMessages:[...schedules().scheduledMessages,...schedules().scheduledMessages]},'emp-mario','beynost'));
});
test('scheduled dates reject missing, past, overflow dates and dates beyond one year',()=>{
  const now=new Date('2026-11-26T09:00:00Z').getTime();
  assert.match(scheduledInstant('2026-12-18T10:30',now),/T.*Z$/);
  for(const value of ['', '2026-02-30T10:30','2026-12-18','2025-01-01T10:30','2028-01-01T10:30'])
    assert.throws(()=>scheduledInstant(value,now));
});
