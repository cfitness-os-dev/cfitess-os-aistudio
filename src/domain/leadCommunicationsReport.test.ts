import {test} from 'node:test';
import assert from 'node:assert/strict';
import {communicationsCsv} from './leadCommunicationsReport';
test('communication report labels simulations and neutralizes spreadsheet formulas with quoted multiline subjects',()=>{
  const csv=communicationsCsv([{subject:' =HYPERLINK("bad")\nBonjour',createdAt:'now',clubId:'beynost'}]);
  assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\' =HYPERLINK(""bad"")\nBonjour"'));assert.ok(csv.includes('Simulation — aucun envoi'));
});
