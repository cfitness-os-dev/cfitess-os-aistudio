import type { ScenarioClubId, ScenarioDefinition } from './leadScenarioDefinitions';

export interface LeadScenario {
  id: string; clubId: ScenarioClubId; revision: number; draft: ScenarioDefinition;
  versions: Array<{ number: number; definition: ScenarioDefinition; publishedAt: string; publishedBy: string }>;
  active: boolean; enrollmentLocked: boolean; archived: boolean; updatedAt: string;
}
export interface ScenarioEnrollment {
  id: string; scenarioId: string; clubId: ScenarioClubId; prospectId: string; prospectName: string;
  version: number; status: 'running' | 'completed' | 'stopped'; cursor: number; nextAt: string; createdAt: string;
  history: Array<{ stepId: string; at: string; status: string; detail: string; activityId: string | null }>;
}
export interface ScenarioWorkspace {
  actorId: string; clubId: ScenarioClubId; simulationOnly: boolean; simulationAvailable: boolean;
  sources: string[]; statusIds: string[]; templates: [];
  prospects: Array<{ id: string; name: string; status: string; source: string }>;
  scenarios: LeadScenario[]; enrollments: ScenarioEnrollment[];
}
export type ScenarioCommand =
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
  if (!payload || payload.actorId !== actorId || payload.clubId !== clubId || !Array.isArray(payload.scenarios) || !Array.isArray(payload.enrollments)) throw new Error('La réponse ne correspond pas au compte ou au club choisi. Rechargez cet espace.');
  return payload as ScenarioWorkspace;
}
