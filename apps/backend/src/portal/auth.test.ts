import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { importAppWithTestDb } from '../test/testDb.js';

const { createApp } = await importAppWithTestDb('portal-auth');

test('GET /health returns ok', async () => {
  const app = createApp();
  const res = await request(app).get('/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
