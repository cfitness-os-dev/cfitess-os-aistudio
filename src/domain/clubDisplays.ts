import type { ClubId } from "../types/cfos";

export type DisplayMode = "planning" | "messages" | "mixed";

export interface ClubDisplayScreen {
  id: string;
  siteId: string;
  name: string;
  zone: string;
  mode: DisplayMode;
  headline: string;
  tickerMessage: string;
  active: boolean;
  updatedAt: string;
}

function getSessionToken(): string | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage.getItem("cfos_bearer_token");
  }
  return (globalThis as any).__cfos_bearer_token ?? null;
}

export async function fetchClubDisplays(clubId: ClubId): Promise<ClubDisplayScreen[]> {
  const token = getSessionToken();
  if (!token) throw new Error("Session requise pour consulter les écrans.");
  const res = await fetch(`/api/displays/${encodeURIComponent(clubId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Impossible de charger les écrans du club.");
  }
  const data = await res.json();
  return Array.isArray(data.screens) ? data.screens : [];
}

export async function createClubDisplay(
  clubId: ClubId,
  input: { name: string; zone: string; mode: DisplayMode; headline: string; tickerMessage: string }
): Promise<ClubDisplayScreen> {
  const token = getSessionToken();
  if (!token) throw new Error("Session requise pour créer un écran.");
  const res = await fetch(`/api/displays/${encodeURIComponent(clubId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Impossible de créer l'écran.");
  }
  const data = await res.json();
  return data.screen;
}

export async function deleteClubDisplay(clubId: ClubId, screenId: string): Promise<void> {
  const token = getSessionToken();
  if (!token) throw new Error("Session requise pour supprimer un écran.");
  const res = await fetch(
    `/api/displays/${encodeURIComponent(clubId)}/${encodeURIComponent(screenId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "Impossible de supprimer l'écran.");
  }
}
