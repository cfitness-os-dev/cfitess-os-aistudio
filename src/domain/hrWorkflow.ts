import type { LeavePolicy } from './hrLeaveRules';
import type { ClubId } from "../types/cfos";
import { requestPersonalWorkspace } from "./personalWorkspace";

export interface HrRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  siteId: string;
  motive: string;
  startDate: string;
  endDate: string;
  status: string;
  comment: string;
  canDecide: boolean;
  revision: string;
  policy?: LeavePolicy;
}
export interface HrEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  clubId: ClubId;
  timestamp: string;
  type: string;
  canReview: boolean;
  review?: { note: string; actorId: string; at: string; version: string };
}
export interface HrWorkspace {
  actorId: string;
  clubId: ClubId;
  requests: HrRequest[];
  timeEntries: HrEntry[];
}
export type HrMutation =
  | {
      kind: "request";
      id: string;
      status: string;
      expectedStatus: string;
      expectedRevision: string;
      note: string;
    }
  | {
      kind: "entry";
      id: string;
      employeeId: string;
      note: string;
      expectedVersion: string | null;
    };
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^\s*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case "approved":
    case "accepted":
    case "valide":
    case "validée":
      return "Validée";
    case "cancelled":
    case "canceled":
    case "annule":
      return "Annulée";
    case "rejected":
    case "refused":
    case "refuse":
      return "Refusée";
    case "pending":
    case "en_attente":
      return "En attente";
    default:
      return "À vérifier";
  }
}
export function entryDay(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export async function fetchHrWorkspace(
  actorId: string,
  clubId: ClubId,
  personal: boolean,
  mutation?: HrMutation,
): Promise<HrWorkspace> {
  if (personal) {
    if (mutation)
      throw new Error(
        "Action responsable indisponible dans votre espace personnel.",
      );
    const data = await requestPersonalWorkspace(actorId, clubId);
    return {
      actorId,
      clubId,
      requests: data.leaves.map((row) => ({
        ...row,
        employeeId: actorId,
        employeeName: "Moi",
        siteId: clubId,
        canDecide: false,
        revision: "",
      })),
      timeEntries: data.timeEntries.map((row) => ({
        ...row,
        employeeId: actorId,
        employeeName: "Moi",
        clubId,
        canReview: false,
      })),
    };
  }
  const token = window.sessionStorage.getItem("cfos_bearer_token");
  if (
    !token ||
    window.sessionStorage.getItem("cfos_bearer_actor_id") !== actorId
  )
    throw new Error("Reconnectez-vous pour consulter les données RH.");
  const path = mutation
    ? `/api/hr/workspace/${clubId}/${mutation.kind === "request" ? "requests" : "time-entries"}/${encodeURIComponent(mutation.id)}`
    : `/api/hr/workspace/${clubId}`;
  const body = mutation
    ? mutation.kind === "request"
      ? {
          status: mutation.status,
          expectedStatus: mutation.expectedStatus,
          expectedRevision: mutation.expectedRevision,
          note: mutation.note,
        }
      : {
          employeeId: mutation.employeeId,
          note: mutation.note,
          expectedVersion: mutation.expectedVersion,
        }
    : undefined;
  const response = await fetch(path, {
    method: mutation ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(mutation ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Le serveur n’a pas fourni les données RH attendues. Réessayez.",
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Chargement ou enregistrement impossible.",
    );
  if (
    data.actorId !== actorId ||
    data.clubId !== clubId ||
    !Array.isArray(data.requests) ||
    !Array.isArray(data.timeEntries)
  )
    throw new Error("Réponse reçue pour un autre compte ou un autre club.");
  return data;
}

export class HrWorkflowEditor {
  private state: {
    data: HrWorkspace | null;
    loading: boolean;
    saving: boolean;
    error: string;
    message: string;
  } = { data: null, loading: false, saving: false, error: "", message: "" };
  private listeners = new Set<() => void>();
  private generation = 0;
  constructor(
    private transport: (mutation?: HrMutation) => Promise<HrWorkspace>,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<typeof this.state>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  cancel() {
    this.generation++;
  }
  async load(preserveRows = false) {
    if (this.state.saving) return;
    const generation = ++this.generation;
    this.publish({ ...(preserveRows ? {} : {data:null}), loading: true, error: "", message: "" });
    try {
      const data = await this.transport();
      if (this.generation === generation)
        this.publish({ data, loading: false });
    } catch (error) {
      if (this.generation === generation)
        this.publish({
          data: null,
          loading: false,
          error:
            error instanceof Error ? error.message : "Chargement impossible.",
        });
    }
  }
  async save(mutation: HrMutation) {
    if (this.state.saving || this.state.loading || !this.state.data)
      return false;
    const generation = ++this.generation;
    this.publish({ saving: true, error: "", message: "" });
    try {
      const data = await this.transport(mutation);
      if (generation !== this.generation) return false;
      this.publish({
        data,
        saving: false,
        message: "Enregistrement confirmé par le serveur.",
      });
      return true;
    } catch (error) {
      if (generation === this.generation)
        this.publish({
          saving: false,
          error:
            error instanceof Error
              ? error.message
              : "Enregistrement impossible.",
        });
      return false;
    }
  }
}
