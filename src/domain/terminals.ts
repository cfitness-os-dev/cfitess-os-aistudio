import type { ClubId } from "../types/cfos";

export interface ClockTerminalItem {
  id: string;
  siteId: string;
  roomId: string;
  roomLabel: string;
  label: string;
  status: "pending_pairing" | "active" | "revoked";
  hasSecret: boolean;
  createdAt: string;
  pairedAt?: string | null;
  lastSeenAt?: string | null;
  pairingExpiresAt?: string | null;
  pairingCode?: string | null;
}

export interface TerminalsListResponse {
  siteId: string;
  terminals: ClockTerminalItem[];
}

export interface CreateTerminalInput {
  label: string;
  roomId: string;
  roomLabel: string;
}

export interface CreatedTerminalResponse {
  terminalId: string;
  pairingCode: string;
  pairingExpiresAt: string;
  label: string;
  roomLabel: string;
  roomId: string;
  siteId: string;
}

export interface PairedTerminalResponse {
  terminalId: string;
  siteId: string;
  roomId: string;
  roomLabel: string;
  label: string;
  status: string;
  deviceToken: string;
}

export interface TerminalWhoAmI {
  terminalId: string;
  siteId: string;
  roomId: string;
  roomLabel: string;
  label: string;
  status: string;
  pairedAt?: string | null;
  photoCaptureAvailable: boolean;
}

export interface TerminalPunchResponse {
  id: string;
  employeeId: string;
  type: string;
  recordedAt: string;
  terminalId: string;
  roomLabel: string;
}

export interface RoomCourseOccurrence {
  occurrenceId: string;
  templateId: string;
  courseTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  coachId: string;
  coachName: string;
  roomId: string;
  roomLabel: string;
  status: string;
  attendanceVerified: boolean;
  checklistCompleted: boolean;
}

export interface CourseChecklistItemPayload {
  id: string;
  label: string;
  checked: boolean;
}

export interface VerifyCoursePresenceInput {
  occurrenceId: string;
  coachId: string;
  idempotencyKey: string;
  checklistItems: CourseChecklistItemPayload[];
  note?: string;
}

export const TERMINAL_TOKEN_STORAGE_KEY = "cfos_terminal_token";

export function getStoredTerminalToken(): string | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage.getItem(TERMINAL_TOKEN_STORAGE_KEY);
  }
  return (globalThis as any).__cfos_terminal_token ?? null;
}

export function setStoredTerminalToken(token: string): void {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(TERMINAL_TOKEN_STORAGE_KEY, token);
  } else {
    (globalThis as any).__cfos_terminal_token = token;
  }
}

export function clearStoredTerminalToken(): void {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(TERMINAL_TOKEN_STORAGE_KEY);
  } else {
    delete (globalThis as any).__cfos_terminal_token;
  }
}

export class TerminalAccessDenied extends Error {}

function getSessionToken(): string | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage.getItem("cfos_bearer_token");
  }
  return (globalThis as any).__cfos_bearer_token ?? null;
}

export async function fetchClubTerminals(
  actorId: string,
  clubId: ClubId,
  signal?: AbortSignal
): Promise<ClockTerminalItem[]> {
  const token = getSessionToken();
  if (!token) throw new Error("Reconnectez-vous pour administrer les appareils.");

  const res = await fetch(`/api/terminals/${encodeURIComponent(clubId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal,
  });

  if (res.status === 401 || res.status === 403) {
    throw new TerminalAccessDenied("Habilitation insuffisante pour gérer les terminaux de ce club.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Impossible de charger les appareils de pointage.");
  }

  const data: TerminalsListResponse = await res.json();
  return Array.isArray(data.terminals) ? data.terminals : [];
}

export async function createTerminal(
  actorId: string,
  clubId: ClubId,
  input: CreateTerminalInput
): Promise<CreatedTerminalResponse> {
  const token = getSessionToken();
  if (!token) throw new Error("Reconnectez-vous pour enregistrer un appareil.");

  const res = await fetch(`/api/terminals/${encodeURIComponent(clubId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (res.status === 401 || res.status === 403) {
    throw new TerminalAccessDenied("Droits insuffisants pour créer un terminal.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Échec de création du terminal.");
  }

  return await res.json();
}

export async function revokeTerminal(
  actorId: string,
  clubId: ClubId,
  terminalId: string,
  reason: string
): Promise<void> {
  const token = getSessionToken();
  if (!token) throw new Error("Reconnectez-vous pour révoquer cet appareil.");

  const res = await fetch(
    `/api/terminals/${encodeURIComponent(clubId)}/${encodeURIComponent(terminalId)}/revoke`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ reason: reason.trim() || "Révocation par le responsable" }),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Échec de révocation de l'appareil.");
  }
}

export async function pairTerminal(
  terminalId: string,
  pairingCode: string
): Promise<PairedTerminalResponse> {
  const res = await fetch("/api/terminals/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      terminalId: terminalId.trim(),
      pairingCode: pairingCode.trim(),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Code d'appairage invalide ou expiré.");
  }

  return await res.json();
}

export async function fetchTerminalWhoAmI(
  deviceToken: string,
  signal?: AbortSignal
): Promise<TerminalWhoAmI> {
  const res = await fetch("/api/terminals/whoami", {
    headers: {
      "x-cfitness-terminal-token": deviceToken,
      Accept: "application/json",
    },
    signal,
  });

  if (res.status === 401 || res.status === 403) {
    throw new TerminalAccessDenied("Appareil non reconnu ou révoqué.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Impossible de vérifier l'état de l'appareil.");
  }

  return await res.json();
}

export async function submitTerminalPunch(
  deviceToken: string,
  employeeId: string,
  punchType: string
): Promise<TerminalPunchResponse> {
  const token = getSessionToken();
  if (!token) {
    throw new Error("Connectez-vous avec votre compte salarié avant de pointer.");
  }

  const res = await fetch("/api/terminals/punch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cfitness-terminal-token": deviceToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      employeeId,
      punchType,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Pointage refusé par le serveur.");
  }

  return await res.json();
}

export async function fetchRoomOccurrences(
  deviceToken: string,
  signal?: AbortSignal
): Promise<RoomCourseOccurrence[]> {
  const res = await fetch("/api/courses/room-occurrences", {
    headers: {
      "x-cfitness-terminal-token": deviceToken,
      Accept: "application/json",
    },
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Impossible de charger les séances de la salle.");
  }

  const data = await res.json();
  return Array.isArray(data.occurrences) ? data.occurrences : [];
}

export async function submitCoursePresence(
  deviceToken: string,
  input: VerifyCoursePresenceInput
): Promise<{ alreadyVerified?: boolean; checklistCompleted: boolean; message?: string }> {
  const token = getSessionToken();
  if (!token) {
    throw new Error("Connectez-vous avec votre session coach pour valider votre présence.");
  }

  const res = await fetch("/api/courses/verify-presence", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cfitness-terminal-token": deviceToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Validation de présence cours refusée.");
  }

  return await res.json();
}
