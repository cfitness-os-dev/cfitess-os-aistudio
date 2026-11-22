import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchClubTerminals,
  createTerminal,
  revokeTerminal,
  TerminalAccessDenied,
} from "./terminals";

test("terminals: fetchClubTerminals throws when no session token", async () => {
  delete (globalThis as any).__cfos_bearer_token;
  await assert.rejects(
    async () => {
      await fetchClubTerminals("emp-mario", "beynost");
    },
    { message: "Reconnectez-vous pour administrer les appareils." }
  );
});

test("terminals: fetchClubTerminals throws TerminalAccessDenied on 403", async () => {
  (globalThis as any).__cfos_bearer_token = "fake-token";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Interdit" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });

  try {
    await assert.rejects(
      async () => {
        await fetchClubTerminals("emp-coach", "beynost");
      },
      (err: any) => err instanceof TerminalAccessDenied
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
  }
});

test("terminals: fetchClubTerminals parses terminal list successfully", async () => {
  (globalThis as any).__cfos_bearer_token = "fake-token";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/terminals\/beynost/);
    return new Response(
      JSON.stringify({
        siteId: "club-beynost",
        terminals: [
          {
            id: "term-1",
            siteId: "club-beynost",
            roomId: "room-salle-a",
            roomLabel: "Salle Cours Collectifs A",
            label: "Tablette Salle A",
            status: "active",
            hasSecret: true,
            createdAt: "2026-11-22T10:00:00Z",
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const list = await fetchClubTerminals("emp-mario", "beynost");
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "term-1");
    assert.equal(list[0].status, "active");
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
  }
});

test("terminals: createTerminal returns 6-digit pairing code", async () => {
  (globalThis as any).__cfos_bearer_token = "fake-token";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.label, "Nouvelle Tablette");
    return new Response(
      JSON.stringify({
        terminalId: "term-new",
        pairingCode: "482910",
        pairingExpiresAt: "2026-11-22T10:10:00Z",
        label: "Nouvelle Tablette",
        roomLabel: "Salle A",
        roomId: "room-salle-a",
        siteId: "club-beynost",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const res = await createTerminal("emp-mario", "beynost", {
      label: "Nouvelle Tablette",
      roomId: "room-salle-a",
      roomLabel: "Salle A",
    });
    assert.equal(res.pairingCode, "482910");
    assert.equal(res.terminalId, "term-new");
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
  }
});

test("terminals: revokeTerminal posts reason correctly", async () => {
  (globalThis as any).__cfos_bearer_token = "fake-token";

  let calledReason = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/terminals\/beynost\/term-1\/revoke/);
    const body = JSON.parse(String(init?.body));
    calledReason = body.reason;
    return new Response(JSON.stringify({ status: "revoked" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await revokeTerminal("emp-mario", "beynost", "term-1", "Tablette cassée");
    assert.equal(calledReason, "Tablette cassée");
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
  }
});
