import type { ClubId } from '../types/cfos';

export interface ClubRecoveryMailbox {
  clubId: ClubId;
  clubLabel: string;
  clubEmail: string;
}

export interface BuildClubRecoveryMailtoInput {
  clubId: ClubId;
  recipientEmail?: string | null;
  memberName?: string | null;
  body: string;
  followupPaused?: boolean;
}

export interface ClubRecoveryMailtoLink {
  href: string;
  clubEmail: string;
  clubLabel: string;
  recipientEmail: string;
  subject: string;
  truncated: boolean;
}

const MAX_MAILTO_BODY_CHARS = 1800;

export function getClubRecoveryMailbox(clubId: ClubId): ClubRecoveryMailbox {
  if (clubId === 'beynost') {
    return {
      clubId: 'beynost',
      clubLabel: 'C.Fitness Beynost',
      clubEmail: 'beynost@c.fitness',
    };
  }
  return {
    clubId: 'carre-de-soie',
    clubLabel: 'C.Fitness Carré de Soie',
    clubEmail: 'carredesoie@c.fitness',
  };
}

export function isDeliverableMemberEmail(raw?: string | null): raw is string {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('*') || /[\r\n]/.test(trimmed)) {
    return false;
  }
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf('@')) {
    return false;
  }
  const domain = trimmed.slice(atIndex + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

export function buildClubRecoveryMailto(
  input: BuildClubRecoveryMailtoInput
): ClubRecoveryMailtoLink | null {
  if (input.followupPaused) return null;
  if (!isDeliverableMemberEmail(input.recipientEmail)) return null;
  const rawBody = input.body.trim();
  if (!rawBody) return null;

  const mailbox = getClubRecoveryMailbox(input.clubId);
  const cleanRecipient = input.recipientEmail.trim();
  const cleanName = (input.memberName || '').replace(/[\r\n]+/g, ' ').trim();
  const subject = cleanName
    ? `${mailbox.clubLabel} — Suivi de votre dossier adhérent (${cleanName})`
    : `${mailbox.clubLabel} — Suivi de votre dossier adhérent`;

  const truncated = rawBody.length > MAX_MAILTO_BODY_CHARS;
  const mailBody = truncated
    ? `${rawBody.slice(0, MAX_MAILTO_BODY_CHARS).trimEnd()}\n\n[Suite copiée si besoin depuis C.Fitness OS]`
    : rawBody;

  const href = `mailto:${encodeURIComponent(cleanRecipient)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(mailBody)}`;

  return {
    href,
    clubEmail: mailbox.clubEmail,
    clubLabel: mailbox.clubLabel,
    recipientEmail: cleanRecipient,
    subject,
    truncated,
  };
}
