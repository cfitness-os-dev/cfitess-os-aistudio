import type { ClubId } from "../types/cfos";
export interface ClockPolicy {
  personalAllowed: boolean;
  terminalAllowed: boolean;
  revision: string;
  updatedAt: string;
  updatedBy: string;
}
export interface ClockPolicyRow {
  employeeId: string;
  employeeName: string;
  employeeReference: string;
  canEdit: boolean;
  policy: ClockPolicy;
}
export interface ClockPolicies {
  actorId: string;
  clubId: ClubId;
  terminalReady: false;
  rows: ClockPolicyRow[];
}
export class ClockPolicyAccessDenied extends Error {}
export function validateClockPolicies(
  data: unknown,
  actor: string,
  club: ClubId,
): ClockPolicies {
  if (!data || typeof data !== "object")
    throw new Error("Réponse des autorisations invalide.");
  const d = data as Partial<ClockPolicies>;
  if (
    d.actorId !== actor ||
    d.clubId !== club ||
    d.terminalReady !== false ||
    !Array.isArray(d.rows) ||
    !d.rows.every(
      (r) =>
        r &&
        typeof r.employeeId === "string" &&
        typeof r.employeeName === "string" &&
        typeof r.employeeReference === "string" &&
        typeof r.canEdit === "boolean" &&
        r.policy &&
        typeof r.policy.personalAllowed === "boolean" &&
        typeof r.policy.terminalAllowed === "boolean" &&
        typeof r.policy.revision === "string",
    )
  )
    throw new Error(
      "Autorisations reçues pour un autre compte ou un autre club, ou données incomplètes.",
    );
  return d as ClockPolicies;
}
export async function requestClockPolicies(
  actor: string,
  club: ClubId,
  signal?: AbortSignal,
  update?: {
    employeeId: string;
    personalAllowed: boolean;
    terminalAllowed: boolean;
    expectedRevision: string | null;
    reason: string;
  },
): Promise<ClockPolicies> {
  if (window.sessionStorage.getItem("cfos_bearer_actor_id") !== actor)
    throw new Error("Reconnectez-vous pour gérer les pointages.");
  const token = window.sessionStorage.getItem("cfos_bearer_token");
  if (!token) throw new Error("Reconnectez-vous pour gérer les pointages.");
  const { employeeId, ...body } = update ?? { employeeId: "" };
  const response = await fetch(
    `/api/hr/clock-policies/${club}${update ? "/" + encodeURIComponent(employeeId) : ""}`,
    {
      method: update ? "PUT" : "GET",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(update ? { "Content-Type": "application/json" } : {}),
      },
      body: update ? JSON.stringify(body) : undefined,
    },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Le serveur n’a pas confirmé les autorisations. Réessayez.",
    );
  }
  if (response.status === 403 && !update)
    throw new ClockPolicyAccessDenied(
      "Vos droits ne permettent pas de gérer ces autorisations.",
    );
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Autorisations non enregistrées.",
    );
  return validateClockPolicies(data, actor, club);
}
