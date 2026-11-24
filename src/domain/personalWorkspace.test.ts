import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePersonalResponse } from "./personalWorkspace";

const payload = {
  clockingPolicy: {
    personalAllowed: false,
    terminalAllowed: false,
    terminalReady: false,
  },
  punchAvailability: { allowedTypes: ["arrivee"], openClubId: null },
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
  requestMotives: [],
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
test("personal clock rejects unavailable or forged command contracts", () => {
  for (const punchAvailability of [
    undefined,
    { allowedTypes: ["rewrite_timestamp"], openClubId: null },
    { allowedTypes: ["arrivee"], openClubId: "other-club" },
  ]) {
    assert.throws(
      () =>
        validatePersonalResponse(
          { ...payload, punchAvailability },
          "employee-a",
          "beynost",
        ),
      /pointage/,
    );
  }
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
