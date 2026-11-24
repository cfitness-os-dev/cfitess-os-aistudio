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

export type PhotoPolicyMode = "disabled" | "optional" | "required";

export interface PairedTerminalResponse {
  terminalId: string;
  siteId: string;
  roomId: string;
  roomLabel: string;
  label: string;
  status: string;
  deviceToken: string;
  photoPolicy?: PhotoPolicyMode;
  photoCaptureAvailable?: boolean;
}

export interface TerminalWhoAmI {
  terminalId: string;
  siteId: string;
  roomId: string;
  roomLabel: string;
  label: string;
  status: string;
  pairedAt?: string | null;
  photoPolicy?: PhotoPolicyMode;
  photoCaptureAvailable: boolean;
}

export interface TerminalPunchResponse {
  status: string;
  entry: {
    id: string;
    type: string;
    roomLabel: string;
    photoProofPresent: boolean;
    timestamp: string;
  };
  photoPolicy?: PhotoPolicyMode;
  photoCaptureAvailable: boolean;
}

export interface VerifiedKioskSession {
  token: string;
  actorId: string;
}

export function resolveKioskPhotoPolicy(
  info: Pick<TerminalWhoAmI, "photoPolicy" | "photoCaptureAvailable"> | null
): PhotoPolicyMode {
  if (
    info?.photoPolicy === "disabled" ||
    info?.photoPolicy === "optional" ||
    info?.photoPolicy === "required"
  ) {
    return info.photoPolicy;
  }
  return info?.photoCaptureAvailable ? "optional" : "disabled";
}

export interface CapturedPhotoProof {
  photoId: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  capturedAt: string;
  expiresAt: string;
}

export interface RoomCourseOccurrence {
  id: string;
  siteId: string;
  roomId: string;
  courseTitle: string;
  assignedCoachId: string;
  assignedCoachName: string;
  substituteCoachId: string | null;
  startTime: string;
  endTime: string;
  status: string;
  isVerified: boolean;
  isPrepared: boolean;
  preparedBeforeStart: boolean;
}

export interface CourseChecklistItemPayload {
  itemId: string;
  label: string;
  checked: boolean;
}

export interface VerifyCoursePresenceInput {
  occurrenceId: string;
  coachId: string;
  idempotencyKey: string;
  checklistAnswers: CourseChecklistItemPayload[];
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

export function getVerifiedKioskSession(): VerifiedKioskSession | null {
  let token: string | null = null;
  let actorId: string | null = null;
  if (typeof window !== "undefined" && window.sessionStorage) {
    token = window.sessionStorage.getItem("cfos_bearer_token");
    actorId = window.sessionStorage.getItem("cfos_bearer_actor_id");
  } else {
    token = (globalThis as any).__cfos_bearer_token ?? null;
    actorId = (globalThis as any).__cfos_bearer_actor_id ?? null;
  }
  const cleanToken = typeof token === "string" ? token.trim() : "";
  const cleanActor = typeof actorId === "string" ? actorId.trim() : "";
  if (!cleanToken || !cleanActor) {
    return null;
  }
  return { token: cleanToken, actorId: cleanActor };
}

export async function authenticateKioskEmployee(
  emailOrId: string,
  pinOrPassword: string
): Promise<{ employeeId: string; sessionToken: string }> {
  const trimmedId = emailOrId.trim();
  const trimmedSecret = pinOrPassword.trim();
  if (!trimmedId || !trimmedSecret) {
    throw new Error("Identifiant et code PIN ou mot de passe requis.");
  }

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      emailOrId: trimmedId,
      pinOrPassword: trimmedSecret,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      data?.error || data?.message || "Identifiant ou code PIN/mot de passe invalide."
    );
  }

  const sessionToken =
    typeof data?.sessionToken === "string" ? data.sessionToken.trim() : "";
  if (!sessionToken) {
    throw new Error("Réponse de session invalide du serveur.");
  }
  const employeeId =
    typeof data?.employee?.id === "string" && data.employee.id.trim()
      ? data.employee.id.trim()
      : typeof data?.employeeId === "string" && data.employeeId.trim()
        ? data.employeeId.trim()
        : trimmedId;

  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem("cfos_bearer_token", sessionToken);
    window.sessionStorage.setItem("cfos_bearer_actor_id", employeeId);
    window.sessionStorage.setItem("cfos_local_auth_active", "true");
    window.sessionStorage.setItem("cfos_local_auth_user_id", employeeId);
    window.dispatchEvent(
      new CustomEvent("cfos-bearer-updated", {
        detail: { employeeId, token: sessionToken },
      })
    );
  } else {
    (globalThis as any).__cfos_bearer_token = sessionToken;
    (globalThis as any).__cfos_bearer_actor_id = employeeId;
  }

  return { employeeId, sessionToken };
}

export async function clearKioskEmployeeSession(): Promise<void> {
  const token = getSessionToken();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignorer les erreurs réseau lors de la fermeture locale
    }
  }

  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.removeItem("cfos_bearer_token");
    window.sessionStorage.removeItem("cfos_bearer_actor_id");
    window.sessionStorage.removeItem("cfos_local_auth_active");
    window.sessionStorage.removeItem("cfos_local_auth_user_id");
    window.dispatchEvent(
      new CustomEvent("cfos-bearer-updated", {
        detail: { employeeId: null, token: null },
      })
    );
  } else {
    delete (globalThis as any).__cfos_bearer_token;
    delete (globalThis as any).__cfos_bearer_actor_id;
  }
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

export async function captureTerminalPhoto(
  deviceToken: string,
  imageBase64: string
): Promise<CapturedPhotoProof> {
  const token = getSessionToken();
  if (!token) {
    throw new Error("Connectez-vous avec votre compte salarié avant de capturer une photo.");
  }

  const res = await fetch("/api/terminals/photo-proof", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cfitness-terminal-token": deviceToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ imageBase64 }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Capture photo refusée par le serveur.");
  }

  return await res.json();
}

export async function submitTerminalPunch(
  deviceToken: string,
  employeeId: string,
  punchType: string,
  photoProof?: string
): Promise<TerminalPunchResponse> {
  const token = getSessionToken();
  if (!token) {
    throw new Error("Connectez-vous avec votre compte salarié avant de pointer.");
  }

  const payload: Record<string, string> = {
    employeeId,
    punchType,
  };
  if (photoProof) {
    payload.photoProof = photoProof;
  }

  const res = await fetch("/api/terminals/punch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-cfitness-terminal-token": deviceToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
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
): Promise<{
  status: string;
  attendance?: { checklistCompleted: boolean; completedBeforeStart?: boolean };
}> {
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
