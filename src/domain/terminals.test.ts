import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchClubTerminals,
  createTerminal,
  revokeTerminal,
  submitCoursePresence,
  submitTerminalPunch,
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

test("terminals: submitCoursePresence sends checklistAnswers with itemId and no checklistItems key", async () => {
  (globalThis as any).__cfos_bearer_token = "fake-token";

  let sentBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/courses\/verify-presence/);
    sentBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        status: "verified",
        attendance: { checklistCompleted: true, completedBeforeStart: true },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const res = await submitCoursePresence("dev-tok", {
      occurrenceId: "occ-1",
      coachId: "emp-chloe",
      idempotencyKey: "kiosk-1",
      checklistAnswers: [
        { itemId: "chk-sono", label: "Sonorisation, micro et playlist vérifiés", checked: true },
      ],
    });
    assert.equal(res.status, "verified");
    assert.equal(res.attendance?.checklistCompleted, true);
    const body = sentBody as Record<string, unknown> | undefined;
    assert.ok(body);
    assert.equal("checklistItems" in body, false);
    assert.ok(Array.isArray(body.checklistAnswers));
    assert.equal((body.checklistAnswers as any[])[0].itemId, "chk-sono");
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
  }
});

test("terminals: submitTerminalPunch sends photoProof only when provided", async () => {
  (globalThis as any).__cfos_bearer_token = "fake-token";

  const bodies: Record<string, unknown>[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/terminals\/punch/);
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        status: "recorded",
        entry: {
          id: "p-1",
          type: "arrivee",
          roomLabel: "Accueil",
          photoProofPresent: Boolean(bodies[bodies.length - 1].photoProof),
          timestamp: "2026-11-22T21:00:00Z",
        },
        photoCaptureAvailable: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const resWithout = await submitTerminalPunch("dev-tok", "emp-karim", "arrivee");
    const resWith = await submitTerminalPunch("dev-tok", "emp-karim", "arrivee", "photo-123");
    assert.equal(resWithout.entry.roomLabel, "Accueil");
    assert.equal(resWith.entry.photoProofPresent, true);
    assert.equal("photoProof" in bodies[0], false);
    assert.equal(bodies[1].photoProof, "photo-123");
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
  }
});
