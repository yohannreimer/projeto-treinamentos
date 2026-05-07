import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('initDb creates planning tables and cohort planning link columns', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('planning-schema');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    const tables = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name like 'planning_%'
      order by name asc
    `).all() as Array<{ name: string }>;

    assert.deepEqual(tables.map((row) => row.name), [
      'planning_cohort',
      'planning_encounter',
      'planning_version',
      'planning_workspace',
      'planning_workspace_client'
    ]);

    const cohortColumns = db.prepare('pragma table_info(cohort)').all() as Array<{ name: string }>;
    assert.ok(cohortColumns.some((column) => column.name === 'planning_cohort_id'));
    assert.ok(cohortColumns.some((column) => column.name === 'planning_workspace_id'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
