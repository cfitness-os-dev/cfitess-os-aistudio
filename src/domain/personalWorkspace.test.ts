import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePersonalResponse } from "./personalWorkspace";

const payload = {
  employeeId: "employee-a",
  clubId: "beynost",
  tasks: [],
  notifications: [],
  documents: [],
  training: [],
  progress: [],
  checklists: [],
  timeEntries: [],
  leaves: [],
  shifts: [],
};
test("personal workspace rejects another actor or club before rendering", () => {
  assert.throws(() =>
    validatePersonalResponse(
      { ...payload, employeeId: "employee-b" },
      "employee-a",
      "beynost",
    ),
  );
  assert.throws(() =>
    validatePersonalResponse(
      { ...payload, clubId: "carre-de-soie" },
      "employee-a",
      "beynost",
    ),
  );
});
test("personal workspace rejects missing collections instead of rendering cached rows", () => {
  assert.throws(() =>
    validatePersonalResponse(
      { ...payload, documents: undefined },
      "employee-a",
      "beynost",
    ),
  );
  assert.throws(() => validatePersonalResponse(null, "employee-a", "beynost"));
});
test("personal workspace accepts empty server data for the exact session scope", () => {
  assert.deepEqual(
    validatePersonalResponse(payload, "employee-a", "beynost"),
    payload,
  );
});
