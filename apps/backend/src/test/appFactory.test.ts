import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from './testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('createApp can skip db init and seed for tests', async () => {
  const dbPath = assignTestDbPath('app-factory-no-init');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, initDb: false, seedDb: false });
  const res = await request(app).get('/health');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  const moduleTable = db.prepare(`
    select count(*) as count
    from sqlite_master
    where type = 'table' and name = 'module_template'
  `).get() as { count: number };
  assert.equal(moduleTable.count, 0);

  cleanupDbFiles(dbPath);
});

test('createApp keeps db init and seed enabled by default', () => {
  const dbPath = assignTestDbPath('app-factory-defaults');
  cleanupDbFiles(dbPath);

  createApp({ forceDbRefresh: true });

  const moduleCount = db.prepare('select count(*) as count from module_template').get() as { count: number };
  assert.equal(moduleCount.count > 0, true);

  cleanupDbFiles(dbPath);
});
