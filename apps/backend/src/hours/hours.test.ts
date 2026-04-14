import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { db, initDb, resetDbConnection } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function readTableColumns(table: string) {
  return db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
}

test('initDb creates hour-bank schema base', () => {
  const dbPath = assignTestDbPath('hours-schema-base');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();

    const moduleColumns = readTableColumns('module_template').map((row) => row.name);
    assert.ok(moduleColumns.includes('delivery_mode'));
    assert.ok(moduleColumns.includes('client_hours_policy'));

    const activityColumns = readTableColumns('calendar_activity').map((row) => row.name);
    assert.ok(activityColumns.includes('linked_module_id'));
    assert.ok(activityColumns.includes('hours_scope'));

    const eventStore = db.prepare(`
      select name
      from sqlite_master
      where type = 'table'
        and name in (
          'hours_event_store',
          'hours_projection_balance',
          'hours_projection_ledger',
          'hours_projection_pending'
        )
      order by name asc
    `).all() as Array<{ name: string }>;
    assert.equal(eventStore.length, 4);

    const eventIndexes = db.prepare(`
      select name
      from sqlite_master
      where type = 'index'
        and tbl_name = 'hours_event_store'
        and name = 'idx_hours_event_store_idempotency_key'
    `).all() as Array<{ name: string }>;
    assert.equal(eventIndexes.length, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
