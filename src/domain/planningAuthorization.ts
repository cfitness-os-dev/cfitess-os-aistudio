import type { Scope } from './types';

export interface PlanningActionCapability {
  allowed: boolean;
  actorId: string;
  scope: Scope;
  managedTeamIds: readonly string[];
}

export function canUsePlanningAction(
  capability: PlanningActionCapability,
  targetEmployeeId: string | null,
  targetTeamIds: readonly string[] = []
): boolean {
  if (!capability.allowed) return false;
  if (targetEmployeeId === null) return capability.scope === 'sites';
  if (targetEmployeeId === capability.actorId || capability.scope === 'sites') return true;
  if (capability.scope === 'self') return false;
  return targetTeamIds.some((teamId) => capability.managedTeamIds.includes(teamId));
}
