import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db, initDb, resetDbConnection } from '../db.js';
import { assignTestDbPath } from './testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function canonicalPath(filePath: string) {
  return fs.realpathSync.native(filePath);
}

function currentDbFile() {
  const rows = db.prepare('pragma database_list').all() as Array<{ name: string; file: string }>;
  const mainDb = rows.find((row) => row.name === 'main');
  assert.ok(mainDb, 'expected main sqlite database');
  return canonicalPath(mainDb.file);
}

test('db reconnects when APP_DB_PATH changes in the same process', () => {
  const firstPath = assignTestDbPath('db-isolation-first');
  cleanupDbFiles(firstPath);
  resetDbConnection();
  initDb();
  db.exec(`
    create table if not exists __test_marker (value text not null);
    insert into __test_marker (value) values ('first');
  `);

  assert.equal(currentDbFile(), canonicalPath(path.resolve(firstPath)));
  assert.equal(
    (db.prepare('select value from __test_marker').get() as { value: string }).value,
    'first'
  );

  const secondPath = assignTestDbPath('db-isolation-second');
  cleanupDbFiles(secondPath);
  resetDbConnection();

  assert.equal(currentDbFile(), canonicalPath(path.resolve(secondPath)));
  const markerTable = db.prepare(`
    select count(*) as count
    from sqlite_master
    where type = 'table' and name = '__test_marker'
  `).get() as { count: number };
  assert.equal(markerTable.count, 0);

  cleanupDbFiles(firstPath);
  cleanupDbFiles(secondPath);
});
