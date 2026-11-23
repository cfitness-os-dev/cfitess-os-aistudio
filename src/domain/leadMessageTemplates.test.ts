import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMessage, estimateSms, validateMessage, messageText } from './leadMessageTemplates';
import { validateScenarioDefinition, type ScenarioDefinition } from './leadScenarioDefinitions';

test('message interpolation is single pass, preserves literal percent and reports missing or unknown context', () => {
  assert.deepEqual(renderMessage('Bonjour %prenom%, remise 10% aujourd’hui', { prenom: '%nom%' }), { text: 'Bonjour %nom%, remise 10% aujourd’hui', missing: [] });
  assert.deepEqual(renderMessage('%rdv-date% %inconnu%', {}), { text: '%rdv-date% %inconnu%', missing: ['rdv-date', 'inconnu'] });
  assert.ok(validateMessage({ name: 'Test', channel: 'email', subject: 'Bonjour\nBcc: autre', body: 'Bonjour' }).length);
  assert.ok(validateMessage({ name: 'Test', channel: 'sms', subject: '', body: '%inconnu%' }).length);
  assert.deepEqual(validateMessage({ name: 'Relance', channel: 'email', subject: 'Bonjour %prenom%', body: 'Rendez-vous au %club%.' }), []);
});
test('SMS estimate handles multipart GSM, extended alphabet and Unicode UTF16 units', () => {
  assert.equal(estimateSms('a'.repeat(160)).segments, 1);
  assert.equal(estimateSms('a'.repeat(161)).segments, 2);
  assert.equal(estimateSms('€'.repeat(81)).units, 162);
  assert.equal(estimateSms('漢'.repeat(71)).segments, 2);
  assert.equal(estimateSms('😀').units, 2);
  assert.equal(estimateSms('').segments, 0);
});
test('email composition preserves title/button/footer and refuses executable or credential-bearing links', () => {
  const message = { name: 'Accueil', channel: 'email' as const, subject: 'Bienvenue', body: 'Bonjour %prenom%', emailLayout: { heading: 'Votre visite', buttonLabel: 'Réserver', buttonUrl: 'https://example.test/rdv', footer: 'À bientôt', font: 'Arial' } };
  assert.deepEqual(validateMessage(message), []);
  assert.equal(messageText(message), 'Votre visite\n\nBonjour %prenom%\n\nRéserver : https://example.test/rdv\n\nÀ bientôt');
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.test', 'http://example.test']) {
    assert.ok(validateMessage({ ...message, emailLayout: { ...message.emailLayout, buttonUrl: url } }).length);
  }
});
test('scenario contract validates template channel, WhatsApp fallback and mode-specific exits', () => {
  const catalog = { clubId: 'beynost' as const, statusIds: ['Nouveau', 'Client'], sourceIds: [], templates: [{ id: 'wa', channel: 'whatsapp' as const }] };
  const d: ScenarioDefinition = { schemaVersion: 1, clubId: 'beynost', name: 'Relance', mode: 'manual', active: false, enrollmentLocked: false, conditions: null, steps: [{ id: '1', type: 'whatsapp', enabled: true, delay: { amount: 0, unit: 'minutes' }, templateId: null, content: 'Bonjour %prenom%', comment: '', whatsapp: { mode: 'direct', closedAction: 'sms', fallbackTemplateId: null, fallbackContent: 'Bonjour %prenom%' } }], exitRules: { stopOnReply: true, statusIds: ['Client'], stopIfNoLongerMatches: false } };
  assert.ok(validateScenarioDefinition(d, catalog).ok);
  d.steps[0].whatsapp!.fallbackContent = '';
  assert.equal(validateScenarioDefinition(d, catalog).ok, false);
  d.steps[0].whatsapp = { mode: 'template', closedAction: 'skip', fallbackTemplateId: null, fallbackContent: null };
  d.steps[0].templateId = 'wa'; d.steps[0].content = null;
  assert.ok(validateScenarioDefinition(d, catalog).ok);
  d.exitRules!.stopIfNoLongerMatches = true;
  assert.equal(validateScenarioDefinition(d, catalog).ok, false);
});
