import type { ScenarioClubId, ScenarioDefinition } from './leadScenarioDefinitions';
import type { LeadMessage, LeadMessageTemplate } from './leadMessageTemplates';

export interface LeadScenario {
  id: string; clubId: ScenarioClubId; revision: number; draft: ScenarioDefinition;
  versions: Array<{ number: number; definition: ScenarioDefinition; publishedAt: string; publishedBy: string }>;
  active: boolean; enrollmentLocked: boolean; archived: boolean; updatedAt: string;
}
export interface ScenarioEnrollment {
  id: string; scenarioId: string; clubId: ScenarioClubId; prospectId: string; prospectName: string;
  version: number; status: 'running' | 'completed' | 'stopped'; cursor: number; nextAt: string; createdAt: string;
  history: Array<{ stepId: string; at: string; status: string; detail: string; activityId: string | null; renderedSubject?: string | null; renderedContent?: string | null; renderedHtml?: string | null }>;
}
export interface ScenarioWorkspace {
  actorId: string; clubId: ScenarioClubId; simulationOnly: boolean; simulationAvailable: boolean;
  sources: string[]; statusIds: string[]; templates: LeadMessageTemplate[];
  prospects: Array<{ id: string; name: string; status: string; source: string }>;
  scenarios: LeadScenario[]; enrollments: ScenarioEnrollment[];
  commandResult?: { scenarioId: string | null; templateId: string | null } | null;
  segments?: string[];
}
export async function previewScenarioEmail(actorId: string, clubId: ScenarioClubId, message: LeadMessage, signal?: AbortSignal): Promise<string> {
  const token = sessionStorage.getItem('cfos_bearer_token');
  if (!token || sessionStorage.getItem('cfos_bearer_actor_id') !== actorId) throw new Error('Reconnectez-vous pour consulter cet aperçu.');
  const response = await fetch(`/api/lead/scenarios/${encodeURIComponent(clubId)}/email-preview`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.error || 'Aperçu indisponible.');
  if (payload?.actorId !== actorId || payload.clubId !== clubId || payload.fictitious !== true || typeof payload.html !== 'string') throw new Error('La réponse ne correspond pas à cet aperçu.');
  return payload.html;
}
export type ScenarioCommand =
  | { action: 'save_template'; templateId: string | null; expectedRevision: number | null; message: LeadMessage }
  | { action: 'archive_template'; templateId: string; expectedRevision: number }
  | { action: 'copy_template'; templateId: string; destinationClubId: ScenarioClubId }
  | { action: 'save'; scenarioId: string | null; expectedRevision: number | null; definition: ScenarioDefinition }
  | { action: 'publish' | 'archive'; scenarioId: string; expectedRevision: number }
  | { action: 'status'; scenarioId: string; expectedRevision: number; active: boolean; enrollmentLocked: boolean }
  | { action: 'copy'; scenarioId: string; expectedRevision: number; destinationClubId: ScenarioClubId }
  | { action: 'enroll'; scenarioId: string; prospectId: string }
  | { action: 'stop'; enrollmentId: string; reason: string }
  | { action: 'run' };

export function newScenarioOperationId(): string {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export async function scenarioRequest(actorId: string, clubId: ScenarioClubId, command?: ScenarioCommand, operationId?: string, signal?: AbortSignal): Promise<ScenarioWorkspace> {
  const token = sessionStorage.getItem('cfos_bearer_token');
  if (!token || sessionStorage.getItem('cfos_bearer_actor_id') !== actorId) throw new Error('Reconnectez-vous avec votre compte pour accéder aux scénarios.');
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (command) { headers['Content-Type'] = 'application/json'; if (!operationId) throw new Error('Commande sans identifiant.'); headers['x-cfitness-operation-id'] = operationId; }
  const response = await fetch(`/api/lead/scenarios/${encodeURIComponent(clubId)}`, { method: command ? 'POST' : 'GET', headers, body: command ? JSON.stringify(command) : undefined, signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || payload?.message || (response.status === 403 ? 'Les scénarios sont réservés aux responsables habilités de ce club.' : 'Impossible de joindre le serveur. Votre modification n’est pas confirmée.'));
  if (!payload || payload.actorId !== actorId || payload.clubId !== clubId || !Array.isArray(payload.scenarios) || !Array.isArray(payload.enrollments) || !Array.isArray(payload.templates) || !Array.isArray(payload.sources) || !Array.isArray(payload.statusIds) || !Array.isArray(payload.prospects)) throw new Error('La réponse ne correspond pas au compte ou au club choisi. Rechargez cet espace.');
  if ([...payload.scenarios, ...payload.enrollments, ...payload.templates].some(row => !row || row.clubId !== clubId)) throw new Error('Le serveur a retourné des données d’un autre club. Rechargez cet espace.');
  if (command?.action === 'save' && command.scenarioId === null && !payload.scenarios.some((s: { id: string }) => s.id === payload.commandResult?.scenarioId)) throw new Error('La réponse ne permet pas d’identifier le scénario créé. Votre saisie est conservée ; actualisez avant de recommencer.');
  if (command?.action === 'save_template' && command.templateId === null && !payload.templates.some((t: { id: string }) => t.id === payload.commandResult?.templateId)) throw new Error('La réponse ne permet pas d’identifier le modèle créé. Votre saisie est conservée ; actualisez avant de recommencer.');
  return payload as ScenarioWorkspace;
}
