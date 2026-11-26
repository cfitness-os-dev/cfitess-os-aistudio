import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rebalanceStaleProspects,
  transferProspect,
  fetchLeadConversionStats,
  leadManagementClubs, validateConversionStats, validateTransferResult, validateRebalanceResult,
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
          clubsProcessed: ['carre-de-soie'],
          reassignedCount: 2,
          reassignedIds: ['p1', 'p2'],
          reassigned: [
            { id: 'p1', clubId: 'carre-de-soie', assignedToId: 'emp-chloe' },
            { id: 'p2', clubId: 'carre-de-soie', assignedToId: 'emp-mario' },
          ],
          thresholdDaysApplied: 4,
        }),
        { status: 200 }
      );
    };

    const res = await rebalanceStaleProspects({ clubId: 'carre-de-soie', thresholdDays: 4 });
    assert.equal(recordedUrl, '/api/lead/automations/rebalance-stale');
    assert.equal(recordedInit?.method, 'POST');
    const headers = new Headers(recordedInit?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer token-123');
    assert.equal(headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(recordedInit?.body)), {
      clubId: 'carre-de-soie',
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
      transferProspect('', 'beynost'),
      /Identifiant prospect manquant/
    );
    await assert.rejects(
      transferProspect('p1', ''),
      /Club cible manquant/
    );

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Transfert refusé (403)' }), { status: 403 });

    await assert.rejects(
      transferProspect('p1', 'beynost', 'Déménagement'),
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
          sourceClubId: 'carre-de-soie',
          targetClubId: 'beynost',
          assignedTo: 'emp-chloe',
          reason: 'Demande du client',
        }),
        { status: 200 }
      );
    };

    const res = await transferProspect('lead-42', 'beynost', 'Demande du client');
    assert.equal(recordedUrl, '/api/lead/prospects/lead-42/transfer');
    assert.deepEqual(JSON.parse(recordedBody), {
      targetClubId: 'beynost',
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
          clubsInScope: ['beynost'],
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

    const resClub = await fetchLeadConversionStats('beynost');
    assert.equal(calls[1], '/api/lead/stats/conversion?clubId=beynost');
    assert.equal(resClub.stats.conversionRatePercent, 26.7);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const statsFixture=()=>({ok:true,clubsInScope:['beynost'],stats:{totalProspects:2,activeLeads:1,convertedLeads:1,lostLeads:0,archivedLeads:0,staleLeads:1,unassignedLeads:0,conversionRatePercent:50,commercialBreakdown:[{employeeId:'employee',activeLeads:1,convertedLeads:1,staleLeads:1}]}});
test('conversion statistics reject malformed, wrong-club, negative and non-finite results',()=>{
  assert.equal(validateConversionStats(statsFixture(),'beynost').stats.activeLeads,1);
  assert.throws(()=>validateConversionStats(statsFixture(),'carre-de-soie'));
  for(const patch of [{activeLeads:-1},{activeLeads:1.5},{conversionRatePercent:Infinity},{conversionRatePercent:101},{totalProspects:3},{staleLeads:2},{commercialBreakdown:[{},{}]}])
    assert.throws(()=>validateConversionStats({...statsFixture(),stats:{...statsFixture().stats,...patch}},'beynost'));
  assert.throws(()=>validateConversionStats({}));
  assert.throws(()=>validateConversionStats({...statsFixture(),ok:false}));
});
test('transfer acknowledgement must match exact prospect and target before local state changes',()=>{
  const ack={ok:true,prospectId:'p1',sourceClubId:'carre-de-soie',targetClubId:'beynost',assignedTo:'employee',reason:'fixture'};
  assert.equal(validateTransferResult(ack,'p1','beynost').assignedTo,'employee');
  for(const patch of [{ok:false},{prospectId:'p2'},{targetClubId:'carre-de-soie'},{sourceClubId:'beynost'},{assignedTo:''},{reason:null}])
    assert.throws(()=>validateTransferResult({...ack,...patch},'p1','beynost'));
});
test('redistribution acknowledgement rejects partial, duplicate and other-club changes',()=>{
  const ack={ok:true,clubsProcessed:['beynost'],thresholdDaysApplied:7,reassignedCount:1,reassignedIds:['p1'],reassigned:[{id:'p1',clubId:'beynost',assignedToId:'employee'}]};
  assert.equal(validateRebalanceResult(ack,'beynost',7).reassignedCount,1);
  for(const patch of [{ok:false},{thresholdDaysApplied:3},{clubsProcessed:['carre-de-soie']},{reassignedCount:2},{reassigned:[]},{reassignedIds:['p1','p1']},{reassigned:[{id:'p1',clubId:'carre-de-soie',assignedToId:'employee'}]}])
    assert.throws(()=>validateRebalanceResult({...ack,...patch},'beynost',7));
});
test('HTTP 200 without a complete business acknowledgement never confirms success',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response('{}',{status:200});
    await assert.rejects(fetchLeadConversionStats('beynost'));
    await assert.rejects(transferProspect('p1','beynost'));
    await assert.rejects(rebalanceStaleProspects({clubId:'beynost',thresholdDays:3}));
  } finally {globalThis.fetch=original;}
});

test('management affordances preserve explicit club profiles over legacy role labels',()=>{
  assert.deepEqual(leadManagementClubs({role:'admin',clubId:'carre-de-soie'}),['carre-de-soie','beynost']);
  assert.deepEqual(leadManagementClubs({role:'commercial',clubId:'beynost'}),[]);
  assert.deepEqual(leadManagementClubs({role:'manager',clubId:'beynost'}),['beynost']);
  assert.deepEqual(leadManagementClubs({role:'manager',clubId:'carre-de-soie',siteAssignments:[
    {clubId:'carre-de-soie',isPrimary:true,roleInClub:'manager',profileId:'master_avance',teamIds:[]},
    {clubId:'beynost',isPrimary:false,roleInClub:'manager',profileId:'employe_standard',teamIds:[]},
  ]}),['carre-de-soie']);
  assert.deepEqual(leadManagementClubs({role:'admin',clubId:'beynost',siteAssignments:[
    {clubId:'beynost',isPrimary:true,roleInClub:'admin',profileId:'lecture_seule_avancee',teamIds:[]},
  ]}),[]);
});
