import assert from 'node:assert/strict';
import test from 'node:test';
import { readLeadWorkspacePage } from './LeadWorkspaceNavigation';

test('refresh restores a commercial workspace page from its URL', () => {
  for (const page of ['scenarios', 'campaigns', 'models', 'forms', 'sales', 'stats', 'settings', 'planning']) {
    assert.equal(readLeadWorkspacePage('?leadPage=' + page, false), page);
  }
});
test('unknown or absent page returns to the prospect list', () => {
  assert.equal(readLeadWorkspacePage('', false), 'prospects');
  assert.equal(readLeadWorkspacePage('?leadPage=unknown', false), 'prospects');
  assert.equal(readLeadWorkspacePage('?leadPage=https%3A%2F%2Fexample.invalid', false), 'prospects');
});
test('a URL cannot expose technical-only pages in the daily interface', () => {
  assert.equal(readLeadWorkspacePage('?leadPage=traceability', false), 'prospects');
  assert.equal(readLeadWorkspacePage('?leadPage=clients', false), 'prospects');
  assert.equal(readLeadWorkspacePage('?leadPage=traceability', true), 'traceability');
});
test('other query parameters do not change the workspace page', () => {
  assert.equal(readLeadWorkspacePage('?leadSetting=prospects&leadPage=settings&other=value', false), 'settings');
});
