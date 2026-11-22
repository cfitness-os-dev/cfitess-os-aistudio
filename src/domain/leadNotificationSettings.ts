/** Shared identifiers used by the service cards and the server alert rules. */
export const SERVICE_ALERT_IDS: Readonly<Record<string, string>> = {
  'srv-rappel-email': 'LEAD-0548',
  'srv-rappel-sms': 'LEAD-0545',
  'srv-modif-email': 'LEAD-0549',
  'srv-modif-sms': 'LEAD-0546',
  'srv-annul-email': 'LEAD-0550',
  'srv-annul-sms': 'LEAD-0547',
};

export function setLeadAlertEnabled(ids: string[], id: string, enabled: boolean): string[] {
  return enabled ? [...new Set([...ids, id])] : ids.filter(value => value !== id);
}
