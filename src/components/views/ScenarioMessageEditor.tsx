import type { ScenarioStep } from '../../domain/leadScenarioDefinitions';
import { EXAMPLE_VALUES, MESSAGE_VARIABLES, estimateSms, renderMessage, messageText, type LeadMessageTemplate } from '../../domain/leadMessageTemplates';

const variableLabels: Record<string, string> = {
  prenom: 'Prénom', nom: 'Nom', club: 'Nom du club',
  'telephone-club': 'Téléphone du club', 'adresse-club': 'Adresse du club',
  'url-rdv-club': 'Lien de rendez-vous', 'url-club': 'Site du club',
  'prenom-commercial': 'Prénom du commercial', 'rdv-date': 'Date du rendez-vous',
  'rdv-heure': 'Heure du rendez-vous', date: 'Date', heure: 'Heure',
  prix: 'Prix', 'unsubscribe-url': 'Lien de désinscription',
};
const input = 'w-full rounded-lg border border-slate-500/40 bg-transparent px-3 py-2 min-h-[44px]';
const button = 'rounded-lg border border-slate-500/40 px-3 py-2 min-h-[44px] text-xs';
export function ScenarioMessageEditor({ step, templates, onChange }: { step: ScenarioStep; templates: LeadMessageTemplate[]; onChange: (patch: Partial<ScenarioStep>) => void }) {
  const available = templates.filter(t => !t.archived && t.message.channel === step.type);
  const model = available.find(t => t.id === step.templateId);
  const body = (model ? messageText(model.message) : null) ?? step.content ?? '';
  const subject = model?.message.subject ?? step.subject ?? '';
  const rendered = renderMessage(body, EXAMPLE_VALUES);
  const sms = estimateSms(rendered.text);
  const wa = step.whatsapp ?? { mode: step.templateId ? 'template' : 'direct', closedAction: 'skip', fallbackTemplateId: null, fallbackContent: null };
  return <div className="space-y-3">
    <label className="block text-sm">{step.type === 'whatsapp' ? 'Modèle WhatsApp ou message direct' : 'Modèle de message'}<select className={input} value={step.templateId ?? ''} onChange={e => onChange({ templateId: e.target.value || null, content: e.target.value ? null : '', subject: null, ...(step.type === 'whatsapp' ? { whatsapp: { ...wa, mode: e.target.value ? 'template' : 'direct' } } : {}) })}><option value="">{step.type === 'whatsapp' ? 'Message direct' : 'Message libre'}</option>{available.map(t => <option key={t.id} value={t.id}>{t.message.name} · Version {t.revision}</option>)}{step.templateId && !model && <option value={step.templateId}>Modèle indisponible — choisissez un autre modèle</option>}</select></label>
    {step.type === 'email' && !step.templateId && <label className="block text-sm">Objet du message<input className={input} value={step.subject ?? ''} maxLength={200} onChange={e => onChange({ subject: e.target.value })} /></label>}
    {!step.templateId && <><label className="block text-sm">Message<textarea className={input} rows={3} value={step.content ?? ''} maxLength={20000} onChange={e => onChange({ content: e.target.value })} /></label><details className="cf-card-secondary rounded-xl p-3"><summary className="cursor-pointer text-sm font-semibold">Personnaliser avec une information du contact</summary><div className="flex flex-wrap gap-2 mt-3" aria-label="Variables du message">{MESSAGE_VARIABLES.map(tag => <button key={tag} type="button" className={button} onClick={() => onChange({ content: (step.content ?? '') + `%${tag}%` })}>{variableLabels[tag] ?? tag}</button>)}</div></details></>}
    <div className="rounded-lg bg-slate-500/10 p-3 text-sm space-y-2"><strong>Aperçu avec données fictives</strong>{subject && <p className="font-semibold break-words">{renderMessage(subject, EXAMPLE_VALUES).text}</p>}<pre className="whitespace-pre-wrap break-words font-sans">{rendered.text}</pre>{step.type === 'sms' && <p className="text-xs cf-muted">Estimation sur cet exemple : {sms.units} unités · {sms.encoding} · {sms.segments} segment(s). Les variables et le fournisseur peuvent modifier le coût.</p>}{rendered.missing.length > 0 && <p className="text-amber-500">Variables inconnues : {rendered.missing.join(', ')}</p>}</div>
    {step.type === 'whatsapp' && <div className="border border-amber-500/30 rounded-lg p-3 space-y-3"><label className="block text-sm">Si la conversation est fermée<select className={input} value={wa.closedAction} onChange={e => onChange({ whatsapp: { ...wa, closedAction: e.target.value as typeof wa.closedAction, fallbackTemplateId: null, fallbackContent: null } })}><option value="skip">Ne pas envoyer</option><option value="template">Utiliser un modèle WhatsApp</option><option value="sms">Préparer un SMS de repli</option></select></label>{wa.closedAction === 'template' && <label className="block text-sm">Modèle WhatsApp de repli<select className={input} value={wa.fallbackTemplateId ?? ''} onChange={e => onChange({ whatsapp: { ...wa, fallbackTemplateId: e.target.value || null } })}><option value="">Choisir un modèle</option>{templates.filter(t => !t.archived && t.message.channel === 'whatsapp').map(t => <option key={t.id} value={t.id}>{t.message.name}</option>)}</select></label>}{wa.closedAction === 'sms' && <label className="block text-sm">SMS de repli<textarea className={input} rows={3} maxLength={20000} value={wa.fallbackContent ?? ''} onChange={e => onChange({ whatsapp: { ...wa, fallbackContent: e.target.value } })} /></label>}<p className="text-xs text-amber-500">Options enregistrées uniquement. Le compte Meta, l’approbation du modèle et la fenêtre depuis le dernier message WhatsApp reçu ne sont pas vérifiés : aucun WhatsApp ni repli ne sera exécuté. Un modèle local n’est pas un modèle approuvé par Meta.</p></div>}
  </div>;
}
