import test from 'node:test';
import assert from 'node:assert/strict';
import type { HeitzMember } from '../types/cfos';
import {
  describeHeitzAccessStatus,
  describeHeitzLastVisit,
  filterHeitzMembers,
  filterHeitzMembersByStatus,
  isHeitzDropout,
  maskRgpdEmail,
  maskRgpdPhone,
  parseHeitzSnapshot,
  pseudonymizeMemberName,
  safeHeitzWebUrl,
  selectedHeitzMember,
  type HeitzIntegration,
} from './heitzCrm';
import { HeitzCrmEditor } from './heitzCrmEditor';

const member = (id: string, club: 'carre-de-soie' | 'beynost'): HeitzMember => ({
  id, homeClubId: club, firstName: 'Recette', lastName: id, phone: '', email: `${id}@example.test`,
  badgeCode: id, subscriptionName: 'Import', activeSubscription: true, finBalanceEur: -40,
  finBalanceState: 0, technogymMoves30d: 0, daysSinceLastWorkout: 0,
});
const integration: HeitzIntegration = { apiWritesAvailable: false, canImportSnapshot: true, webUrls: {} };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('Heitz dossier always belongs to filtered results and current club', () => {
  const rows = [member('CDS', 'carre-de-soie'), member('BEY', 'beynost')];
  assert.equal(selectedHeitzMember(filterHeitzMembers(rows, 'carre-de-soie', ''), 'BEY')?.id, 'CDS');
  assert.equal(selectedHeitzMember(filterHeitzMembers(rows, 'beynost', 'absent'), 'CDS'), null);
  assert.equal(filterHeitzMembers(rows, 'beynost', 'bey@example.test').length, 1);
});

test('Heitz CSV preserves quoted names and rejects unknown clubs, amounts and identities', () => {
  const csv = 'prenom;nom;badge;club;solde;actif\nCamille;"Nom; composé";HZ-1;beynost;"-39,90";oui';
  const row = parseHeitzSnapshot(csv, 'carre-de-soie')[0];
  assert.equal(row.firstName, 'Camille'); assert.equal(row.lastName, 'Nom; composé');
  assert.equal(row.homeClubId, 'beynost'); assert.equal(row.finBalanceEur, -39.9); assert.equal(row.activeSubscription, true);
  assert.throws(() => parseHeitzSnapshot(csv.replace('beynost', 'unknown'), 'carre-de-soie'));
  assert.throws(() => parseHeitzSnapshot(csv.replace('-39,90', 'bad'), 'carre-de-soie'));
  assert.throws(() => parseHeitzSnapshot('prenom;nom;badge\nCamille;Test;', 'carre-de-soie'));
  assert.throws(() => parseHeitzSnapshot('prenom;nom\nCamille;Test', 'carre-de-soie'));
});

test('Heitz web URL is a login link, never an executable or credential-bearing URL', () => {
  for (const url of ['javascript:alert(1)', 'https://user:secret@example.test', 'bad', 'https://example.test/ bad']) assert.equal(safeHeitzWebUrl(url), null);
  assert.equal(safeHeitzWebUrl('http://heitz.example.test:8081/app/heitz/auth/#/app/login'), 'http://heitz.example.test:8081/app/heitz/auth/#/app/login');
});

test('Heitz import failure keeps confirmed rows and never creates a successful local dossier', async () => {
  const original = member('existing', 'carre-de-soie');
  const editor = new HeitzCrmEditor({ members: async () => [original], integration: async () => integration,
    import: async () => { throw new Error('Écriture refusée (500)'); } });
  await editor.load();
  assert.equal(await editor.import([{ firstName: 'Test', lastName: 'Refus', badgeCode: 'NEW', homeClubId: 'carre-de-soie' }]), false);
  assert.deepEqual(editor.getSnapshot().rows, [original]); assert.equal(editor.getSnapshot().saved, false);
  assert.match(editor.getSnapshot().error!, /500/);
});

test('Heitz import succeeds only after server confirmation and second read; double submit blocked', async () => {
  const pending = deferred<{ added: number; updated: number; totalProcessed: number }>();
  let writes = 0; let reads = 0;
  const editor = new HeitzCrmEditor({ members: async () => ++reads === 1 ? [] : [member('confirmed', 'beynost')],
    integration: async () => integration, import: () => { writes++; return pending.promise; } });
  await editor.load();
  const rows = [{ firstName: 'Test', lastName: 'Export', badgeCode: 'HZ-1', homeClubId: 'beynost' as const }];
  const saving = editor.import(rows);
  assert.equal(editor.getSnapshot().saved, false); assert.equal(editor.getSnapshot().rows.length, 0);
  assert.equal(await editor.import(rows), false); assert.equal(writes, 1);
  pending.resolve({ added: 1, updated: 0, totalProcessed: 1 });
  assert.equal(await saving, true); assert.equal(reads, 2); assert.equal(editor.getSnapshot().rows[0].id, 'confirmed');
});

test('Heitz cancelled actor or club cannot receive a late reply; failed load has no cached dossier', async () => {
  const pending = deferred<HeitzMember[]>();
  const old = new HeitzCrmEditor({ members: () => pending.promise, integration: async () => integration,
    import: async () => ({ added: 0, updated: 0, totalProcessed: 0 }) });
  const loading = old.load(); old.cancel(); pending.resolve([member('private', 'carre-de-soie')]); await loading;
  assert.deepEqual(old.getSnapshot().rows, []);
  const next = new HeitzCrmEditor({ members: async () => { throw new Error('403'); }, integration: async () => integration,
    import: async () => ({ added: 0, updated: 0, totalProcessed: 0 }) });
  await next.load(); assert.equal(next.getSnapshot().status, 'error'); assert.deepEqual(next.getSnapshot().rows, []);
});

test('RGPD helpers mask contact details, pseudonymize passages and restrict debt amounts by role', () => {
  assert.equal(maskRgpdPhone('06 11 22 33 44'), '06 •• •• •• 44');
  assert.equal(maskRgpdPhone(''), 'Non renseigné');
  assert.equal(maskRgpdEmail('camille.martin@c.fitness'), 'c•••@c.fitness');
  assert.equal(pseudonymizeMemberName('Camille', 'Martin'), 'Camille M.');

  const debtor = member('DEBT', 'carre-de-soie');
  const forReception = describeHeitzAccessStatus(debtor, false);
  assert.equal(forReception.tone, 'unpaid');
  assert.equal(forReception.badgeLabel, 'À régulariser');
  assert.doesNotMatch(forReception.detailLabel, /-40/);

  const forFinance = describeHeitzAccessStatus(debtor, true);
  assert.equal(forFinance.tone, 'unpaid');
  assert.match(forFinance.badgeLabel, /-40\.00 €/);

  const activeOk: HeitzMember = { ...debtor, id: 'OK', finBalanceEur: 0, finBalanceState: 1 };
  const suspended: HeitzMember = { ...activeOk, id: 'SUSP', activeSubscription: false };
  const all = [debtor, activeOk, suspended];
  assert.equal(filterHeitzMembersByStatus(all, 'OK').length, 1);
  assert.equal(filterHeitzMembersByStatus(all, 'UNPAID').length, 1);
  assert.equal(filterHeitzMembersByStatus(all, 'INACTIVE').length, 1);
});

test('unknown Heitz visit dates are not displayed as zero or counted as inactivity', () => {
  const unknown = { ...member('UNKNOWN', 'carre-de-soie'), daysSinceLastWorkout: 0, lastWorkoutKnown: false };
  assert.equal(describeHeitzLastVisit(unknown), 'Dernier passage à vérifier dans Heitz');
  assert.equal(isHeitzDropout(unknown, 15), false);

  const known = { ...unknown, daysSinceLastWorkout: 15, lastWorkoutKnown: true };
  assert.equal(describeHeitzLastVisit(known), 'Dernier passage : il y a 15j');
  assert.equal(isHeitzDropout(known, 15), true);
});
