import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csvCell,
  statusLabel,
  entryDay,
  HrWorkflowEditor,
  type HrWorkspace,
} from "./hrWorkflow";
const data: HrWorkspace = {
  actorId: "manager-a",
  clubId: "beynost",
  requests: [],
  timeEntries: [],
};
test("failed manager save keeps confirmed state and never reports success", async () => {
  const editor = new HrWorkflowEditor(async (mutation) => {
    if (mutation) throw new Error("Disque indisponible");
    return data;
  });
  await editor.load();
  assert.equal(
    await editor.save({
      kind: "request",
      id: "r1",
      status: "approved",
      expectedStatus: "pending",
      expectedRevision: "initial",
      note: "",
    }),
    false,
  );
  assert.equal(editor.getSnapshot().data, data);
  assert.equal(editor.getSnapshot().message, "");
  assert.match(editor.getSnapshot().error, /Disque/);
});
test("cancelled club response cannot populate the current manager view", async () => {
  let finish!: (data: HrWorkspace) => void;
  const editor = new HrWorkflowEditor(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = editor.load();
  editor.cancel();
  finish(data);
  await pending;
  assert.equal(editor.getSnapshot().data, null);
});
test("manager duplicate submit is prevented while waiting for server acknowledgement", async () => {
  let finish!: (data: HrWorkspace) => void;
  let writes = 0;
  const editor = new HrWorkflowEditor(async (mutation) => {
    if (!mutation) return data;
    writes++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await editor.load();
  const command = {
    kind: "request" as const,
    id: "r1",
    status: "approved",
    expectedStatus: "pending",
    expectedRevision: "initial",
    note: "",
  };
  const pending = editor.save(command);
  assert.equal(await editor.save(command), false);
  assert.equal(editor.getSnapshot().message, "");
  finish({ ...data, requests: [] });
  assert.equal(await pending, true);
  assert.equal(writes, 1);
});
test("CSV encodes separators/quotes and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('Texte; "test"'), '"Texte; ""test"""');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("  @SUM(A1)"), '"\'  @SUM(A1)"');
});
test("timeclock date filters follow the club day across winter and summer midnight", () => {
  assert.equal(entryDay("2026-11-22T23:30:00Z"), "2026-11-23");
  assert.equal(entryDay("2026-07-22T22:30:00Z"), "2026-07-23");
  assert.equal(entryDay("invalid"), "");
});

test("withdrawn leave is a distinct final label in manager filters and exports", () => {
  assert.equal(statusLabel("cancelled"), "Annulée");
  assert.notEqual(statusLabel("cancelled"), statusLabel("pending"));
  assert.equal(statusLabel("approved"), "Validée");
});

test('existing accepted leave is never counted as pending in manager filters or exports', () => {
  const requests = [{ status: 'pending' }, { status: 'accepted' }, { status: 'approved' }, { status: 'unrecognized_status' }];
  assert.deepEqual(requests.filter(row => statusLabel(row.status) === 'En attente'), [{ status: 'pending' }]);
  assert.equal(statusLabel('accepted'), statusLabel('approved'));
  assert.equal(statusLabel('refused'), 'Refusée');
  assert.equal(statusLabel('unrecognized_status'), 'À vérifier');
});

test('refresh after a linked counter decision keeps mounted drafts until updated rows arrive, but clears inaccessible rows on failure',async()=>{
  let finish!: (data:HrWorkspace)=>void;
  let calls=0;
  const editor=new HrWorkflowEditor(async()=>{calls++;if(calls===1)return data;if(calls===3)throw new Error('Accès retiré');return new Promise(resolve=>{finish=resolve;});});
  await editor.load();
  const refresh=editor.load(true);
  assert.equal(editor.getSnapshot().data,data);assert.equal(editor.getSnapshot().loading,true);
  const updated={...data,requests:[]};finish(updated);await refresh;
  assert.equal(editor.getSnapshot().data,updated);
  await editor.load(true);assert.equal(editor.getSnapshot().data,null);assert.match(editor.getSnapshot().error,/Accès retiré/);
});
