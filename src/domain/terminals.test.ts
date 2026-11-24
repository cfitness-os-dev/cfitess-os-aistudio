import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchClubTerminals,
  createTerminal,
  revokeTerminal,
  submitCoursePresence,
  submitTerminalPunch,
  getVerifiedKioskSession,
  authenticateKioskEmployee,
  clearKioskEmployeeSession,
  resolveKioskPhotoPolicy,
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

test("terminals: getVerifiedKioskSession requires both token and actorId without fallback", () => {
  delete (globalThis as any).__cfos_bearer_token;
  delete (globalThis as any).__cfos_bearer_actor_id;
  assert.equal(getVerifiedKioskSession(), null);

  (globalThis as any).__cfos_bearer_token = "tok-only";
  assert.equal(getVerifiedKioskSession(), null);

  (globalThis as any).__cfos_bearer_actor_id = "emp-chloe";
  assert.deepEqual(getVerifiedKioskSession(), {
    token: "tok-only",
    actorId: "emp-chloe",
  });

  delete (globalThis as any).__cfos_bearer_token;
  delete (globalThis as any).__cfos_bearer_actor_id;
});

test("terminals: authenticateKioskEmployee and clearKioskEmployeeSession manage server bearer lifecycle", async () => {
  delete (globalThis as any).__cfos_bearer_token;
  delete (globalThis as any).__cfos_bearer_actor_id;

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(`${init?.method || "GET"} ${String(url)}`);
    if (String(url).includes("/api/auth/login")) {
      return new Response(
        JSON.stringify({
          sessionToken: "srv-tok-chloe",
          employee: { id: "emp-chloe" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const auth = await authenticateKioskEmployee("emp-chloe", "2222");
    assert.equal(auth.employeeId, "emp-chloe");
    assert.deepEqual(getVerifiedKioskSession(), {
      token: "srv-tok-chloe",
      actorId: "emp-chloe",
    });

    await clearKioskEmployeeSession();
    assert.equal(getVerifiedKioskSession(), null);
    assert.deepEqual(calls, ["POST /api/auth/login", "POST /api/auth/logout"]);
  } finally {
    globalThis.fetch = originalFetch;
    delete (globalThis as any).__cfos_bearer_token;
    delete (globalThis as any).__cfos_bearer_actor_id;
  }
});

test("terminals: resolveKioskPhotoPolicy distinguishes disabled, optional and required", () => {
  assert.equal(resolveKioskPhotoPolicy(null), "disabled");
  assert.equal(
    resolveKioskPhotoPolicy({ photoPolicy: "disabled", photoCaptureAvailable: false }),
    "disabled"
  );
  assert.equal(
    resolveKioskPhotoPolicy({ photoPolicy: "required", photoCaptureAvailable: true }),
    "required"
  );
  assert.equal(
    resolveKioskPhotoPolicy({ photoPolicy: "optional", photoCaptureAvailable: true }),
    "optional"
  );
  assert.equal(resolveKioskPhotoPolicy({ photoCaptureAvailable: true }), "optional");
  assert.equal(resolveKioskPhotoPolicy({ photoCaptureAvailable: false }), "disabled");
});

test("terminals: photo policy and club gallery helpers propagate 403 as TerminalAccessDenied", async () => {
  const mod = await import("./terminals");
  const prevFetch = globalThis.fetch;
  const g = globalThis as Record<string, unknown>;
  g.__cfos_bearer_token = "tok-karim";
  g.__cfos_bearer_actor_id = "emp-karim";

  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Accès réservé au propriétaire." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await assert.rejects(
      () => mod.fetchClubPhotoPolicy("carre-de-soie"),
      (err: unknown) => err instanceof mod.TerminalAccessDenied && /propriétaire/.test(err.message)
    );
    await assert.rejects(
      () => mod.updateClubPhotoPolicy("carre-de-soie", "required"),
      (err: unknown) => err instanceof mod.TerminalAccessDenied
    );
    await assert.rejects(
      () => mod.fetchClubPunchPhotos("carre-de-soie"),
      (err: unknown) => err instanceof mod.TerminalAccessDenied
    );
    await assert.rejects(
      () => mod.deleteClubPunchPhoto("carre-de-soie", "photo-1"),
      (err: unknown) => err instanceof mod.TerminalAccessDenied
    );
    await assert.rejects(
      () => mod.purgeClubPunchPhotos("carre-de-soie", 30),
      (err: unknown) => err instanceof mod.TerminalAccessDenied
    );
  } finally {
    globalThis.fetch = prevFetch;
    delete g.__cfos_bearer_token;
    delete g.__cfos_bearer_actor_id;
  }
});

test("terminals: fetchClubPhotoPolicy, updateClubPhotoPolicy, fetchClubPunchPhotos and purge parse payloads", async () => {
  const mod = await import("./terminals");
  const prevFetch = globalThis.fetch;
  const g = globalThis as Record<string, unknown>;
  g.__cfos_bearer_token = "tok-daniel";
  g.__cfos_bearer_actor_id = "emp-daniel";

  const seenCalls: Array<{ url: string; method: string; auth: string | null }> = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method || "GET";
      const headers = new Headers(init?.headers);
      seenCalls.push({ url, method, auth: headers.get("Authorization") });

      if (url.startsWith("/api/hr/photo-policy/") && method === "GET") {
        return new Response(JSON.stringify({ siteId: "club-carre-soie", mode: "required" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("/api/hr/photo-policy/") && method === "PUT") {
        return new Response(JSON.stringify({ siteId: "club-carre-soie", mode: "disabled" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/hr/punch-photos/carre-de-soie" && method === "GET") {
        return new Response(
          JSON.stringify({
            siteId: "club-carre-soie",
            photos: [
              {
                id: "p-1",
                siteId: "club-carre-soie",
                terminalId: "term-1",
                terminalLabel: "Tablette Accueil",
                employeeId: "emp-karim",
                employeeName: "Karim Benali",
                contentType: "image/jpeg",
                byteSize: 2048,
                capturedAt: "2026-11-24T08:00:00Z",
                expiresAt: "2026-11-24T08:02:00Z",
                consumedAt: "2026-11-24T08:00:20Z",
                consumedByEntryId: "ptg-1",
                filePresent: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/hr/punch-photos/carre-de-soie/purge" && method === "POST") {
        return new Response(
          JSON.stringify({ status: "purged", siteId: "club-carre-soie", retentionDays: 30, removedCount: 2 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ status: "deleted", photoId: "p-1", siteId: "club-carre-soie", fileDeleted: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const policy = await mod.fetchClubPhotoPolicy("carre-de-soie");
    assert.equal(policy, "required");
    const updated = await mod.updateClubPhotoPolicy("carre-de-soie", "disabled");
    assert.equal(updated.mode, "disabled");
    const photos = await mod.fetchClubPunchPhotos("carre-de-soie");
    assert.equal(photos.length, 1);
    assert.equal(photos[0].employeeName, "Karim Benali");
    const purged = await mod.purgeClubPunchPhotos("carre-de-soie", 30);
    assert.equal(purged.removedCount, 2);
    const deleted = await mod.deleteClubPunchPhoto("carre-de-soie", "p-1");
    assert.equal(deleted.fileDeleted, true);

    assert.ok(seenCalls.every((c) => c.auth === "Bearer tok-daniel"));
  } finally {
    globalThis.fetch = prevFetch;
    delete g.__cfos_bearer_token;
    delete g.__cfos_bearer_actor_id;
  }
});

test("terminals: fetchPunchPhotoBlobUrl uses Bearer auth and surfaces backend error", async () => {
  const mod = await import("./terminals");
  const prevFetch = globalThis.fetch;
  const prevCreateObj = URL.createObjectURL;
  const g = globalThis as Record<string, unknown>;
  g.__cfos_bearer_token = "tok-daniel";

  try {
    URL.createObjectURL = () => "blob:mock-photo-url";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), "Bearer tok-daniel");
      const url = typeof input === "string" ? input : String(input);
      if (url.endsWith("/missing")) {
        return new Response(JSON.stringify({ error: "Preuve photo introuvable." }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }) as typeof fetch;

    const blobUrl = await mod.fetchPunchPhotoBlobUrl("beynost", "photo-ok");
    assert.equal(blobUrl, "blob:mock-photo-url");

    await assert.rejects(
      () => mod.fetchPunchPhotoBlobUrl("beynost", "missing"),
      (err: unknown) => err instanceof Error && /introuvable/.test(err.message)
    );
  } finally {
    globalThis.fetch = prevFetch;
    URL.createObjectURL = prevCreateObj;
    delete g.__cfos_bearer_token;
  }
});
