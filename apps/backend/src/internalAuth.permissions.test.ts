import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePermissions, resolvePermissionsForRole } from './internalAuth.js';

test('proposal permission is available for custom users and supremo only by preset', () => {
  assert.deepEqual(normalizePermissions(['proposals', 'clients', 'unknown', 'proposals']), ['proposals', 'clients']);

  assert.ok(resolvePermissionsForRole('supremo').includes('proposals'));
  assert.deepEqual(resolvePermissionsForRole('custom', ['proposals']), ['proposals']);
  assert.equal(resolvePermissionsForRole('intermediario').includes('proposals'), false);
  assert.equal(resolvePermissionsForRole('junior').includes('proposals'), false);
});
