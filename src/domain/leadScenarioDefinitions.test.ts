import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioDefinition, type ScenarioCatalog, type ScenarioDefinition } from './leadScenarioDefinitions';

const catalog: ScenarioCatalog = { clubId: 'carre-de-soie', statusIds: ['new'], sourceIds: ['web'], templates: [{ id: 'welcome', channel: 'email' }] };
function scenario(): ScenarioDefinition {
  return { schemaVersion: 1, clubId: 'carre-de-soie', name: 'Découverte', mode: 'automatic', active: true, enrollmentLocked: true,
    conditions: { statusIds: ['new'], sourceIds: ['web'], requireAssignedCommercial: true },
    steps: [{ id: 'email-1', type: 'email', enabled: true, delay: { amount: 0, unit: 'minutes' }, templateId: 'welcome', content: null, comment: '' },
      { id: 'call-2', type: 'call_task', enabled: true, delay: { amount: 5, unit: 'minutes' }, templateId: null, content: null, comment: 'Appeler le prospect' }] };
}
test('active and enrollment-locked remain independent; immediate and deferred steps are valid', () => {
  const input = scenario(); const result = validateScenarioDefinition(input, catalog);
  assert.equal(result.ok, true);
  if (result.ok) { input.steps[0].id = 'changed'; assert.equal(result.value.steps[0].id, 'email-1'); }
});
test('manual enrollment must not retain hidden automatic conditions', () => {
  const input = scenario(); input.mode = 'manual';
  assert.equal(validateScenarioDefinition(input, catalog).ok, false);
  input.conditions = null; assert.equal(validateScenarioDefinition(input, catalog).ok, true);
});
for (const [name, change] of [
  ['other club', (s: ScenarioDefinition) => { s.clubId = 'beynost'; }],
  ['unknown source', (s: ScenarioDefinition) => { s.conditions!.sourceIds = ['outside']; }],
  ['unknown target status', (s: ScenarioDefinition) => { s.conditions!.statusIds = ['outside']; }],
  ['duplicate source', (s: ScenarioDefinition) => { s.conditions!.sourceIds = ['web', 'web']; }],
  ['missing target status', (s: ScenarioDefinition) => { s.conditions!.statusIds = []; }],
  ['foreign model', (s: ScenarioDefinition) => { s.steps[0].templateId = 'other-club'; }],
  ['wrong model channel', (s: ScenarioDefinition) => { s.steps[0].type = 'sms'; }],
  ['duplicate step', (s: ScenarioDefinition) => { s.steps[1].id = s.steps[0].id; }],
  ['negative delay', (s: ScenarioDefinition) => { s.steps[0].delay.amount = -1; }],
  ['fractional delay', (s: ScenarioDefinition) => { s.steps[0].delay.amount = 0.5; }],
  ['non-finite delay', (s: ScenarioDefinition) => { s.steps[0].delay.amount = Infinity; }],
  ['blank name', (s: ScenarioDefinition) => { s.name = ' '; }],
  ['empty workflow', (s: ScenarioDefinition) => { s.steps = []; }],
  ['no enabled step', (s: ScenarioDefinition) => { s.steps.forEach(step => { step.enabled = false; }); }],
  ['empty automatic message', (s: ScenarioDefinition) => { s.steps[0].templateId = null; }],
  ['task pretending to send', (s: ScenarioDefinition) => { s.steps[1].content = 'Send now'; }],
] as const) test(`publication rejects ${name}`, () => { const s = scenario(); change(s); assert.equal(validateScenarioDefinition(s, catalog).ok, false); });
test('untrusted fields and string booleans cannot be silently accepted', () => {
  assert.equal(validateScenarioDefinition({ ...scenario(), owner: true }, catalog).ok, false);
  assert.equal(validateScenarioDefinition({ ...scenario(), active: 'true' }, catalog).ok, false);
  assert.equal(validateScenarioDefinition(null, catalog).ok, false);
});
test('all supported time units and action types can be expressed without technical screen labels', () => {
  for (const unit of ['minutes', 'hours', 'days'] as const) {
    for (const type of ['email', 'sms', 'whatsapp', 'email_task', 'sms_task', 'call_task'] as const) {
      const s = scenario(); s.steps = [{ id: 'first', type, enabled: true, delay: { amount: 1, unit }, templateId: null,
        content: ['email', 'sms', 'whatsapp'].includes(type) ? 'Bonjour' : null, comment: 'Contacter le prospect' }];
      assert.equal(validateScenarioDefinition(s, catalog).ok, true, `${type}/${unit}`);
    }
  }
});

test('scenario message windows share the strict Rust contract and remain optional for old definitions', async () => {
  const {readFileSync}=await import('node:fs');
  const cases=JSON.parse(readFileSync(new URL('../../contracts/lead-message-window-cases.json',import.meta.url),'utf8'));
  for (const c of cases) assert.equal(validateScenarioDefinition({...scenario(),messageWindow:c.value},catalog).ok,c.valid,c.name);
  assert.equal(validateScenarioDefinition({...scenario(),messageWindow:null},catalog).ok,true);
});
