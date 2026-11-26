import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rebalanceStaleProspects,
  transferProspect,
  fetchLeadConversionStats,
} from './leadPoolApi';

test('rebalanceStaleProspects sends correct payload and bearer token', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const originalFetch = globalThis.fetch;
  let recordedUrl = '';
  let recordedInit: RequestInit | undefined;

  try {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (k === 'cfos_bearer_token' ? 'token-123' : null),
      },
    });

    globalThis.fetch = async (url, init) => {
      recordedUrl = String(url);
      recordedInit = init;
      return new Response(
        JSON.stringify({
          ok: true,
          clubsProcessed: ['club-carre-soie'],
          reassignedCount: 2,
          reassignedIds: ['p1', 'p2'],
          reassigned: [
            { id: 'p1', clubId: 'club-carre-soie', assignedToId: 'emp-chloe' },
            { id: 'p2', clubId: 'club-carre-soie', assignedToId: 'emp-mario' },
          ],
          thresholdDaysApplied: 4,
        }),
        { status: 200 }
      );
    };

    const res = await rebalanceStaleProspects({ clubId: 'club-carre-soie', thresholdDays: 4 });
    assert.equal(recordedUrl, '/api/lead/automations/rebalance-stale');
    assert.equal(recordedInit?.method, 'POST');
    const headers = new Headers(recordedInit?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer token-123');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(recordedInit?.body)), {
      clubId: 'club-carre-soie',
      thresholdDays: 4,
    });
    assert.equal(res.ok, true);
    assert.equal(res.reassignedCount, 2);
    assert.equal(res.reassigned?.length, 2);
    assert.equal(res.reassigned?.[0]?.assignedToId, 'emp-chloe');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});

test('transferProspect validates required parameters and handles errors', async () => {
  const originalFetch = globalThis.fetch;

  try {
    await assert.rejects(
      transferProspect('', 'club-beynost'),
      /Identifiant prospect manquant/
    );
    await assert.rejects(
      transferProspect('p1', ''),
      /Club cible manquant/
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Transfert refusé (403)' }), { status: 403 });

    await assert.rejects(
      transferProspect('p1', 'club-beynost', 'Déménagement'),
      /Transfert refusé \(403\)/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('transferProspect executes POST and returns transfer payload', async () => {
  const originalFetch = globalThis.fetch;
  let recordedUrl = '';
  let recordedBody = '';

  try {
    globalThis.fetch = async (url, init) => {
      recordedUrl = String(url);
      recordedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          ok: true,
          prospectId: 'lead-42',
          sourceClubId: 'club-carre-soie',
          targetClubId: 'club-beynost',
          assignedTo: 'emp-chloe',
          reason: 'Demande du client',
        }),
        { status: 200 }
      );
    };

    const res = await transferProspect('lead-42', 'club-beynost', 'Demande du client');
    assert.equal(recordedUrl, '/api/lead/prospects/lead-42/transfer');
    assert.deepEqual(JSON.parse(recordedBody), {
      targetClubId: 'club-beynost',
      reason: 'Demande du client',
    });
    assert.equal(res.ok, true);
    assert.equal(res.assignedTo, 'emp-chloe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchLeadConversionStats queries endpoint with optional club filter', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  try {
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          ok: true,
          clubsInScope: ['club-beynost'],
          stats: {
            totalProspects: 15,
            activeLeads: 10,
            convertedLeads: 4,
            lostLeads: 1,
            archivedLeads: 0,
            staleLeads: 2,
            unassignedLeads: 0,
            conversionRatePercent: 26.7,
            commercialBreakdown: [],
          },
        }),
        { status: 200 }
      );
    };

    const resAll = await fetchLeadConversionStats();
    assert.equal(calls[0], '/api/lead/stats/conversion');
    assert.equal(resAll.stats.totalProspects, 15);

    const resClub = await fetchLeadConversionStats('club-beynost');
    assert.equal(calls[1], '/api/lead/stats/conversion?clubId=club-beynost');
    assert.equal(resClub.stats.conversionRatePercent, 26.7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
