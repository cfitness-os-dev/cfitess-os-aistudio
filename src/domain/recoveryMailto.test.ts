import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClubRecoveryMailto,
  describeMemberRecoveryChannels,
  getClubRecoveryMailbox,
  isDeliverableMemberEmail,
  isDeliverableMemberPhone,
} from './recoveryMailto.ts';

test('getClubRecoveryMailbox returns official club Microsoft 365 addresses', () => {
  assert.deepEqual(getClubRecoveryMailbox('carre-de-soie'), {
    clubId: 'carre-de-soie',
    clubLabel: 'C.Fitness Carré de Soie',
    clubEmail: 'carredesoie@c.fitness',
  });
  assert.deepEqual(getClubRecoveryMailbox('beynost'), {
    clubId: 'beynost',
    clubLabel: 'C.Fitness Beynost',
    clubEmail: 'beynost@c.fitness',
  });
});

test('buildClubRecoveryMailto builds a safe mailto link for active case with valid member email', () => {
  const link = buildClubRecoveryMailto({
    clubId: 'beynost',
    recipientEmail: ' adherent@example.com ',
    memberName: 'Camille Martin',
    body: 'Bonjour Camille,\nMerci de nous contacter au sujet de votre dossier.',
    followupPaused: false,
  });

  assert.ok(link);
  assert.equal(link.clubEmail, 'beynost@c.fitness');
  assert.equal(link.recipientEmail, 'adherent@example.com');
  assert.equal(link.truncated, false);
  assert.ok(link.href.startsWith('mailto:adherent%40example.com?subject='));
  assert.ok(link.href.includes('C.Fitness%20Beynost'));
});

test('buildClubRecoveryMailto refuses paused cases, masked RGPD emails, empty bodies and CRLF injection', () => {
  assert.equal(
    buildClubRecoveryMailto({
      clubId: 'carre-de-soie',
      recipientEmail: 'adherent@example.com',
      body: 'Relance',
      followupPaused: true,
    }),
    null
  );
  assert.equal(isDeliverableMemberEmail('c***@example.com'), false);
  assert.equal(isDeliverableMemberEmail('test@example.com\r\nBcc:evil@x.fr'), false);
  assert.equal(
    buildClubRecoveryMailto({
      clubId: 'carre-de-soie',
      recipientEmail: 'c***@example.com',
      body: 'Relance',
    }),
    null
  );
  assert.equal(
    buildClubRecoveryMailto({
      clubId: 'carre-de-soie',
      recipientEmail: 'adherent@example.com',
      body: '   ',
    }),
    null
  );
});

test('isDeliverableMemberPhone and describeMemberRecoveryChannels detect contact channels and RGPD masking', () => {
  assert.equal(isDeliverableMemberPhone('06 18 44 22 90'), true);
  assert.equal(isDeliverableMemberPhone('+33 6 12 34 56 78'), true);
  assert.equal(isDeliverableMemberPhone('06 ** ** 11 45'), false);
  assert.equal(isDeliverableMemberPhone(''), false);
  assert.equal(isDeliverableMemberPhone('1234'), false);

  const both = describeMemberRecoveryChannels({
    email: 'camille@example.fr',
    phone: '06 18 44 22 90',
  });
  assert.equal(both.emailDeliverable, true);
  assert.equal(both.phoneDeliverable, true);
  assert.equal(both.emailMasked, false);
  assert.equal(both.phoneMasked, false);
  assert.equal(both.recommendedChannelLabel, 'Envoi possible : E-mail & Téléphone / SMS');

  const maskedAndPhone = describeMemberRecoveryChannels({
    email: 'c***@example.fr',
    phone: '06 18 44 22 90',
  });
  assert.equal(maskedAndPhone.emailDeliverable, false);
  assert.equal(maskedAndPhone.emailMasked, true);
  assert.equal(maskedAndPhone.phoneDeliverable, true);
  assert.equal(
    maskedAndPhone.recommendedChannelLabel,
    'Envoi possible : Téléphone / SMS uniquement'
  );

  const missingBoth = describeMemberRecoveryChannels({
    email: '',
    phone: '06 ** ** 11 45',
  });
  assert.equal(missingBoth.emailDeliverable, false);
  assert.equal(missingBoth.phoneMasked, true);
  assert.equal(missingBoth.emailLabel, 'Aucun e-mail');
  assert.equal(
    missingBoth.recommendedChannelLabel,
    'Aucun canal direct (coordonnées manquantes ou masquées)'
  );
});
