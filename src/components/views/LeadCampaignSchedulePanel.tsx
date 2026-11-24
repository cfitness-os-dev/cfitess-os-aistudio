import { useState } from 'react';
import type { LeadCampaign, ScenarioCommand } from '../../domain/leadScenariosApi';
import { useLeadDraftGuard } from '../useLeadDraftGuard';

const date = (value: string) => new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris',
}).format(new Date(value));
const labels: Record<string, string> = {
  scheduled: 'Programmée', cancelled: 'Annulée', simulated: 'Simulation terminée', failed: 'À vérifier',
};

export function LeadCampaignSchedulePanel({ campaign, busy, available, automatic, onCommand }: {
  campaign: LeadCampaign; busy: boolean; available: boolean; automatic: boolean;
  onCommand: (command: ScenarioCommand) => void;
}) {
  const [localDateTime, setLocalDateTime] = useState('');
  const [reason, setReason] = useState('');
  const channel=campaign.channel==='sms'?'SMS':'email';
  const pending = campaign.schedules?.find(s => s.status === 'scheduled');
  useLeadDraftGuard(!!localDateTime || !!reason.trim());
  const disabled = busy || !available || campaign.archived;
  const button = 'min-h-[44px] rounded-lg border border-slate-500/40 p-3 disabled:opacity-40';
  return <section aria-label={`Programmation ${channel}`} className="space-y-3 border-t border-slate-500/30 pt-4">
    <h4 className="font-bold">Programmer la campagne {channel}</h4>
    <p className="text-sm">Simulation uniquement, sans envoi. Horaires de France (Europe/Paris). Le message est conservé à la programmation ; les contacts et leurs consentements sont contrôlés à l’échéance. Si le serveur est arrêté, la simulation attend son redémarrage.</p>
    {!automatic && <p className="text-sm">Le traitement automatique est désactivé dans cet environnement. Utilisez « Vérifier les échéances » pour traiter les simulations arrivées à leur heure.</p>}
    {pending ? <div className="space-y-3 rounded-lg bg-violet-500/10 p-3">
      <p>Programmée pour le {date(pending.scheduledAt)} (heure de France).</p>
      <p className="text-sm">Annulez cette programmation avant de modifier ou archiver la campagne. Une simulation déjà terminée ne peut pas être annulée.</p>
      <label className="block">Motif d’annulation<textarea className="w-full min-h-[80px] rounded-lg border border-slate-500/40 bg-transparent p-3" value={reason} maxLength={2000} disabled={disabled} onChange={e => setReason(e.target.value)} /></label>
      <button className={button} disabled={disabled || !reason.trim()} onClick={() => onCommand({ action: 'cancel_campaign_schedule', campaignId: campaign.id, expectedRevision: campaign.revision, scheduleId: pending.id, reason })}>Annuler la programmation {channel}</button>
    </div> : !campaign.simulatedRevisions.includes(campaign.revision) && <div className="space-y-3">
      <label className="block">Date et heure de la simulation {channel}<input type="datetime-local" className="w-full min-h-[44px] min-w-0 rounded-lg border border-slate-500/40 bg-transparent p-3" value={localDateTime} disabled={disabled} onChange={e => setLocalDateTime(e.target.value)} /></label>
      <p className="text-sm">Dans les douze prochains mois. Les heures inexistantes ou doubles au changement d’heure sont refusées.</p>
      <button className={button} disabled={disabled || !localDateTime} onClick={() => onCommand({ action: 'schedule_campaign', campaignId: campaign.id, expectedRevision: campaign.revision, localDateTime, timezone: 'Europe/Paris' })}>Programmer la simulation {channel}</button>
    </div>}
    {(campaign.schedules ?? []).map(s => <article key={s.id} className="rounded-lg border border-slate-500/30 p-3 break-words">
      <p>{labels[s.status] ?? 'État à vérifier'} · {date(s.scheduledAt)} · Version {s.campaignRevision}</p>
      <p className="text-sm">Message conservé : {s.message.body}</p>{s.message.channel==='email'&&<p className="text-sm">Objet conservé : {s.message.subject}</p>}
      {s.reason && <p>{s.reason}</p>}
      {s.finishedAt && <p className="text-sm">Traitée le {date(s.finishedAt)} · Aucun envoi réel</p>}
    </article>)}
    <button className={button} disabled={disabled} onClick={() => onCommand({ action: 'run_campaigns' })}>Vérifier les échéances — aucun envoi</button>
  </section>;
}
