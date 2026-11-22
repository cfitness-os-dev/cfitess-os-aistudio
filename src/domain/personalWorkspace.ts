import type {
  ClubId,
  HRDocument,
  TrainingModule,
  ModuleProgress,
  ClubChecklistItem,
  CollaboratorTask,
  CollaboratorNotification,
} from "../types/cfos";

export interface PersonalWorkspace {
  punchAvailability: {
    allowedTypes: Array<"arrivee" | "debut_pause" | "fin_pause" | "depart">;
    openClubId: ClubId | null;
  };
  canRequestLeave: boolean;
  employeeId: string;
  clubId: ClubId;
  demoMode: boolean;
  signatureProviderAvailable: false;
  tasks: CollaboratorTask[];
  notifications: CollaboratorNotification[];
  documents: Array<HRDocument & { acknowledgedAt?: string }>;
  training: Array<Omit<TrainingModule, "quizCorrectIndex">>;
  progress: ModuleProgress[];
  checklists: ClubChecklistItem[];
  timeEntries: Array<{
    id: string;
    timestamp: string;
    type: string;
    review?: { note: string; actorId: string; at: string; version: string };
  }>;
  leaves: Array<{
    id: string;
    motive: string;
    startDate: string;
    endDate: string;
    status: string;
    comment: string;
  }>;
  shifts: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    missionLabel?: string;
  }>;
}
export type PersonalAction =
  | { action: "add_task"; title: string; category?: string }
  | { action: "set_task" | "set_checklist"; id: string; completed: boolean }
  | { action: "read_notification"; id: string }
  | { action: "answer_quiz"; id: string; selectedOption: number }
  | {
      action: "request_leave";
      motive: string;
      startDate: string;
      endDate: string;
      comment: string;
    }
  | { action: "punch"; punchType: string }
  | { action: "acknowledge_demo_document"; id: string; consent: boolean };

export function validatePersonalResponse(
  value: unknown,
  employeeId: string,
  clubId: ClubId,
): PersonalWorkspace {
  if (
    !value ||
    typeof value !== "object" ||
    !("employeeId" in value) ||
    value.employeeId !== employeeId ||
    !("clubId" in value) ||
    value.clubId !== clubId
  )
    throw new Error("Réponse reçue pour un autre compte ou un autre club.");
  for (const key of [
    "tasks",
    "notifications",
    "documents",
    "training",
    "progress",
    "checklists",
    "timeEntries",
    "leaves",
    "shifts",
  ])
    if (!(key in value) || !Array.isArray(Reflect.get(value, key)))
      throw new Error("Les données reçues sont incomplètes.");
  const clock = Reflect.get(value, "punchAvailability");
  if (
    !clock ||
    typeof clock !== "object" ||
    !Array.isArray(clock.allowedTypes) ||
    !clock.allowedTypes.every(
      (type: unknown) =>
        typeof type === "string" &&
        ["arrivee", "debut_pause", "fin_pause", "depart"].includes(type),
    ) ||
    ![null, "carre-de-soie", "beynost"].includes(clock.openClubId)
  )
    throw new Error(
      "La situation de pointage n’a pas pu être vérifiée. Actualisez votre espace.",
    );
  return value as PersonalWorkspace;
}

export async function requestPersonalWorkspace(
  employeeId: string,
  clubId: ClubId,
  action?: PersonalAction,
  signal?: AbortSignal,
): Promise<PersonalWorkspace> {
  const token = window.sessionStorage.getItem("cfos_bearer_token");
  const owner = window.sessionStorage.getItem("cfos_bearer_actor_id");
  if (!token || owner !== employeeId)
    throw new Error("Reconnectez-vous pour accéder à votre espace personnel.");
  const response = await fetch(`/api/me/workspace/${clubId}`, {
    method: action ? "POST" : "GET",
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(action ? { "Content-Type": "application/json" } : {}),
    },
    body: action ? JSON.stringify(action) : undefined,
  });
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Impossible de charger ou enregistrer votre espace.",
    );
  return validatePersonalResponse(payload, employeeId, clubId);
}
