import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { db, initDb, resetDbConnection, seedDb } from '../db.js';
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

test('production seed keeps finance demo data disabled by default', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSeedFinanceDemo = process.env.SEED_FINANCE_DEMO;
  const dbPath = assignTestDbPath('production-skips-finance-demo-seed');
  cleanupDbFiles(dbPath);
  process.env.NODE_ENV = 'production';
  delete process.env.SEED_FINANCE_DEMO;
  resetDbConnection();

  try {
    initDb();
    seedDb();

    const moduleCount = db.prepare('select count(*) as count from module_template').get() as { count: number };
    const payableCount = db.prepare('select count(*) as count from financial_payable').get() as { count: number };
    const receivableCount = db.prepare('select count(*) as count from financial_receivable').get() as { count: number };

    assert.ok(moduleCount.count > 0);
    assert.equal(payableCount.count, 0);
    assert.equal(receivableCount.count, 0);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousSeedFinanceDemo === undefined) {
      delete process.env.SEED_FINANCE_DEMO;
    } else {
      process.env.SEED_FINANCE_DEMO = previousSeedFinanceDemo;
    }
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('production seed can opt in to finance demo data explicitly', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSeedFinanceDemo = process.env.SEED_FINANCE_DEMO;
  const dbPath = assignTestDbPath('production-allows-explicit-finance-demo-seed');
  cleanupDbFiles(dbPath);
  process.env.NODE_ENV = 'production';
  process.env.SEED_FINANCE_DEMO = 'true';
  resetDbConnection();

  try {
    initDb();
    seedDb();

    const payableCount = db.prepare('select count(*) as count from financial_payable').get() as { count: number };
    const receivableCount = db.prepare('select count(*) as count from financial_receivable').get() as { count: number };

    assert.ok(payableCount.count > 0);
    assert.ok(receivableCount.count > 0);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    if (previousSeedFinanceDemo === undefined) {
      delete process.env.SEED_FINANCE_DEMO;
    } else {
      process.env.SEED_FINANCE_DEMO = previousSeedFinanceDemo;
    }
    db.close();
    cleanupDbFiles(dbPath);
  }
});
