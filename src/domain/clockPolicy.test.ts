import { test } from "node:test";
import assert from "node:assert/strict";
import { validateClockPolicies } from "./clockPolicy";
const data = {
  actorId: "responsable",
  clubId: "beynost",
  terminalReady: false,
  rows: [
    {
      employeeId: "salarie",
      employeeName: "Salarié fictif",
      employeeReference: "TEST-01",
      canEdit: true,
      policy: { personalAllowed: false, terminalAllowed: false, revision: "" },
    },
  ],
};
test("clock policies reject another session, club or fabricated terminal readiness", () => {
  for (const patch of [
    { actorId: "autre" },
    { clubId: "carre-de-soie" },
    { terminalReady: true },
    { rows: [{ ...data.rows[0], policy: { personalAllowed: "yes" } }] },
  ])
    assert.throws(() =>
      validateClockPolicies({ ...data, ...patch }, "responsable", "beynost"),
    );
});
test("clock policies preserve explicit default denial from server", () => {
  assert.deepEqual(validateClockPolicies(data, "responsable", "beynost"), data);
});
