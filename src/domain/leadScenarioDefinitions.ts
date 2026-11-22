/** Contract for a complete scenario definition. This is not an execution engine. */
export type ScenarioClubId = 'carre-de-soie' | 'beynost';
export type ScenarioStepType = 'email' | 'sms' | 'whatsapp' | 'email_task' | 'sms_task' | 'call_task';
export interface ScenarioStep {
  id: string;
  type: ScenarioStepType;
  enabled: boolean;
  delay: { amount: number; unit: 'minutes' | 'hours' | 'days' };
  templateId: string | null;
  content: string | null;
  comment: string;
}
export interface ScenarioDefinition {
  schemaVersion: 1;
  clubId: ScenarioClubId;
  name: string;
  mode: 'automatic' | 'manual';
  active: boolean;
  enrollmentLocked: boolean;
  conditions: { statusIds: string[]; sourceIds: string[]; requireAssignedCommercial: boolean } | null;
  steps: ScenarioStep[];
}
export interface ScenarioCatalog {
  clubId: ScenarioClubId;
  statusIds: readonly string[];
  sourceIds: readonly string[];
  templates: readonly { id: string; channel: 'email' | 'sms' | 'whatsapp' }[];
}
export interface ScenarioIssue { path: string; message: string }
export type ScenarioValidation = { ok: true; value: ScenarioDefinition } | { ok: false; issues: ScenarioIssue[] };

const STEP_TYPES: readonly string[] = ['email', 'sms', 'whatsapp', 'email_task', 'sms_task', 'call_task'];
const UNITS: readonly string[] = ['minutes', 'hours', 'days'];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validate against the selected club's canonical catalog, never a browser-stored role. */
export function validateScenarioDefinition(input: unknown, catalog: ScenarioCatalog): ScenarioValidation {
  const issues: ScenarioIssue[] = [];
  const fail = (path: string, message: string) => { issues.push({ path, message }); };
  const fields = (value: Record<string, unknown>, allowed: string[], path: string) => {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}${key}`, 'Champ non reconnu.');
  };
  const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!isRecord(input)) return { ok: false, issues: [{ path: '', message: 'Scénario invalide.' }] };
  fields(input, ['schemaVersion', 'clubId', 'name', 'mode', 'active', 'enrollmentLocked', 'conditions', 'steps'], '');
  if (input.schemaVersion !== 1) fail('schemaVersion', 'Version de scénario non prise en charge.');
  if (input.clubId !== catalog.clubId || !['carre-de-soie', 'beynost'].includes(String(input.clubId))) fail('clubId', 'Ce scénario appartient à un autre club ou à un club inconnu.');
  if (!text(input.name, 120)) fail('name', 'Indiquez un nom de 1 à 120 caractères.');
  if (typeof input.mode !== 'string' || !['automatic', 'manual'].includes(input.mode)) fail('mode', 'Choisissez un mode automatique ou manuel.');
  for (const key of ['active', 'enrollmentLocked']) if (typeof input[key] !== 'boolean') fail(key, 'Choisissez oui ou non.');
  if (input.mode === 'manual' && input.conditions !== null) fail('conditions', 'Un scénario manuel ne contient pas de conditions d’inscription automatique.');
  if (input.mode === 'automatic') {
    if (!isRecord(input.conditions)) fail('conditions', 'Définissez les conditions d’inscription automatique.');
    else {
      const conditions = input.conditions;
      fields(conditions, ['statusIds', 'sourceIds', 'requireAssignedCommercial'], 'conditions.');
      for (const [key, known, required] of [
        ['statusIds', catalog.statusIds, true], ['sourceIds', catalog.sourceIds, false],
      ] as const) {
        const values = conditions[key];
        if (!Array.isArray(values) || (required && values.length === 0) || values.length > 200) fail(`conditions.${key}`, 'Sélection de conditions invalide.');
        else if (new Set(values).size !== values.length || values.some(v => typeof v !== 'string' || !known.includes(v))) fail(`conditions.${key}`, 'Choisissez des valeurs distinctes du club courant.');
      }
      if (typeof conditions.requireAssignedCommercial !== 'boolean') fail('conditions.requireAssignedCommercial', 'Précisez si un commercial doit être assigné.');
    }
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 100) fail('steps', 'Ajoutez de 1 à 100 étapes.');
  else {
    const ids = new Set<string>();
    let enabled = false;
    input.steps.forEach((step: unknown, index: number) => {
      const path = `steps.${index}.`;
      if (!isRecord(step)) { fail(`steps.${index}`, 'Étape invalide.'); return; }
      fields(step, ['id', 'type', 'enabled', 'delay', 'templateId', 'content', 'comment'], path);
      if (!text(step.id, 100) || typeof step.id !== 'string' || step.id !== step.id.trim()) fail(`${path}id`, 'Identifiant d’étape invalide.');
      else if (ids.has(step.id)) fail(`${path}id`, 'Chaque étape doit avoir un identifiant distinct.');
      else ids.add(step.id);
      if (typeof step.type !== 'string' || !STEP_TYPES.includes(step.type)) fail(`${path}type`, 'Choisissez un type d’étape connu.');
      if (typeof step.enabled !== 'boolean') fail(`${path}enabled`, 'Précisez si cette étape est activée.');
      if (step.enabled === true) enabled = true;
      if (!isRecord(step.delay)) fail(`${path}delay`, 'Définissez le délai.');
      else {
        fields(step.delay, ['amount', 'unit'], `${path}delay.`);
        if (!Number.isSafeInteger(step.delay.amount) || Number(step.delay.amount) < 0 || Number(step.delay.amount) > 525600) fail(`${path}delay.amount`, 'Le délai doit être un entier positif ou nul et borné.');
        if (typeof step.delay.unit !== 'string' || !UNITS.includes(step.delay.unit)) fail(`${path}delay.unit`, 'Choisissez minutes, heures ou jours.');
      }
      if (typeof step.comment !== 'string' || step.comment.length > 2000) fail(`${path}comment`, 'Commentaire invalide (2 000 caractères maximum).');
      const channel = step.type === 'email' || step.type === 'sms' || step.type === 'whatsapp' ? step.type : null;
      if (step.templateId !== null) {
        if (typeof step.templateId !== 'string' || !catalog.templates.some(t => t.id === step.templateId && t.channel === channel)) fail(`${path}templateId`, 'Choisissez un modèle du bon canal et du club courant.');
      }
      if (step.content !== null && !text(step.content, 20000)) fail(`${path}content`, 'Le contenu doit être renseigné et limité à 20 000 caractères.');
      if (channel && step.templateId === null && step.content === null) fail(`${path}content`, 'Choisissez un modèle ou renseignez le message.');
      if (!channel && (step.templateId !== null || step.content !== null)) fail(`${path}content`, 'Une tâche utilise son commentaire ; elle ne déclenche pas directement un envoi.');
      if (!channel && !text(step.comment, 2000)) fail(`${path}comment`, 'Décrivez la tâche à réaliser.');
    });
    if (!enabled) fail('steps', 'Activez au moins une étape avant de publier.');
  }
  if (issues.length) return { ok: false, issues };
  // All fields and nested values were checked above; return a detached copy.
  return { ok: true, value: structuredClone(input) as unknown as ScenarioDefinition };
}
