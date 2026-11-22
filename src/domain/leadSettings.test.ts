import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseLeadSettings, type LeadSettings } from './leadSettings';
import { LeadSettingsEditor, type LeadSettingsReply } from './leadSettingsEditor';

const fixture = JSON.parse(readFileSync(new URL('../../contracts/lead-settings-cases.json', import.meta.url), 'utf8')) as {
  base: LeadSettings; cases: Array<{ name: string; field: string; value: unknown; valid: boolean }>;
};
const base = () => structuredClone(fixture.base);
const reply = (settings = base()): LeadSettingsReply => ({ ok: true, clubId: 'carre-de-soie', settings });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('Lead settings contract: shared Rust/TypeScript validation cases', () => {
  for (const sample of fixture.cases) {
    const input = { ...base(), [sample.field]: sample.value };
    if (sample.valid) assert.doesNotThrow(() => parseLeadSettings(input, 'carre-de-soie'), sample.name);
    else assert.throws(() => parseLeadSettings(input, 'carre-de-soie'), sample.name);
  }
  assert.throws(() => parseLeadSettings(null, 'carre-de-soie'));
  assert.throws(() => parseLeadSettings({ archiveThresholdDays: 30 }, 'carre-de-soie'));
});

test('Lead settings: load failure blocks editing/saving and explicit retry loads complete data', async () => {
  let fail = true; let writes = 0;
  const editor = new LeadSettingsEditor('carre-de-soie', {
    load: async () => { if (fail) throw new Error('HTTP 403'); return reply(); },
    save: async settings => { writes++; return reply(settings); },
  });
  assert.equal(await editor.save(), false);
  await editor.load();
  assert.equal(editor.getSnapshot().status, 'error');
  assert.equal(editor.getSnapshot().settings, null);
  editor.update(s => ({ ...s, notifEmail: 'wrong@club.fr' }));
  assert.equal(await editor.save(), false);
  assert.equal(writes, 0);
  fail = false; await editor.load();
  assert.equal(editor.getSnapshot().status, 'ready');
  assert.deepEqual(editor.getSnapshot().settings, base());
  assert.equal(editor.getSnapshot().error, null);
});

test('Lead settings: stale load and cancelled effects cannot replace the latest response', async () => {
  const first = deferred<LeadSettingsReply>(); const second = deferred<LeadSettingsReply>(); let calls = 0;
  const editor = new LeadSettingsEditor('carre-de-soie', {
    load: () => (++calls === 1 ? first.promise : second.promise), save: async settings => reply(settings),
  });
  const oldLoad = editor.load(); editor.cancel(); const newLoad = editor.load();
  second.resolve(reply({ ...base(), salesScript: 'current' })); await newLoad;
  first.resolve(reply({ ...base(), salesScript: 'stale' })); await oldLoad;
  assert.equal(editor.getSnapshot().settings?.salesScript, 'current');
});

test('Lead settings: actors/clubs have independent state and mismatched replies are rejected', async () => {
  const pending = deferred<LeadSettingsReply>();
  const oldActor = new LeadSettingsEditor('carre-de-soie', { load: () => pending.promise, save: async s => reply(s) });
  const otherSettings = { ...base(), smsCredits: 980, notifEmail: 'beynost@club.fr', selectedPassOfferIds: ['HZ-BEY-ABO-PASS'] };
  const current = new LeadSettingsEditor('beynost', {
    load: async () => ({ ok: true, clubId: 'beynost', settings: otherSettings }),
    save: async () => reply(), // A malformed cross-club acknowledgement must never report success.
  });
  const oldLoad = oldActor.load(); await current.load();
  pending.resolve(reply()); await oldLoad;
  oldActor.update(s => ({ ...s, notifEmail: 'cds@club.fr' }));
  assert.equal(current.getSnapshot().settings?.notifEmail, 'beynost@club.fr');
  current.update(s => ({ ...s, salesScript: 'Beynost draft' }));
  assert.equal(await current.save(), false);
  assert.equal(current.getSnapshot().saved, false);
  assert.equal(current.getSnapshot().settings?.salesScript, 'Beynost draft');
});

test('Lead settings: failed saves keep draft, reject invalid input, prevent double submit and accept server acknowledgement only', async () => {
  let writes = 0; const pending = deferred<LeadSettingsReply>();
  const editor = new LeadSettingsEditor('carre-de-soie', {
    load: async () => reply(),
    save: async () => { writes++; if (writes === 1) throw new Error('HTTP 500'); return pending.promise; },
  });
  await editor.load();
  editor.update(s => ({ ...s, archiveThresholdDays: 0 }));
  assert.equal(await editor.save(), false); assert.equal(writes, 0);
  editor.update(s => ({ ...s, archiveThresholdDays: 45 }));
  assert.equal(await editor.save(), false);
  assert.equal(editor.getSnapshot().settings?.archiveThresholdDays, 45);
  assert.equal(editor.getSnapshot().dirty, true);
  assert.equal(editor.getSnapshot().saved, false);
  const saving = editor.save();
  assert.equal(await editor.save(), false);
  editor.update(s => ({ ...s, archiveThresholdDays: 90 }));
  assert.equal(editor.getSnapshot().settings?.archiveThresholdDays, 45);
  pending.resolve(reply({ ...base(), archiveThresholdDays: 45 }));
  assert.equal(await saving, true);
  assert.equal(writes, 2);
  assert.equal(editor.getSnapshot().saved, true);
  assert.equal(editor.getSnapshot().dirty, false);
});
