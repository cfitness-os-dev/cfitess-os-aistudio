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
