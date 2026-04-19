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

type ForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
};

function assertCompositeForeignKey(
  childTable: string,
  parentTable: string,
  expectedMappings: Array<{ from: string; to: string }>
) {
  const rows = db.prepare(`pragma foreign_key_list(${childTable})`).all() as ForeignKeyRow[];
  const parentRows = rows.filter((row) => row.table === parentTable);

  assert.ok(parentRows.length > 0, `foreign key ausente em ${childTable} -> ${parentTable}`);

  const groupedById = new Map<number, ForeignKeyRow[]>();
  parentRows.forEach((row) => {
    const current = groupedById.get(row.id) ?? [];
    current.push(row);
    groupedById.set(row.id, current);
  });

  const matchingGroup = [...groupedById.values()].find((group) =>
    expectedMappings.every((mapping) =>
      group.some((row) => row.from === mapping.from && row.to === mapping.to)
    )
  );

  assert.ok(
    matchingGroup,
    `foreign key composto ausente em ${childTable} -> ${parentTable}: ${expectedMappings
      .map((mapping) => `${mapping.from}->${mapping.to}`)
      .join(', ')}`
  );
}

test('initDb cria schema financeiro v1', () => {
  const dbPath = assignTestDbPath('finance-schema-v1');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();

    const tables = [
      'financial_account',
      'financial_category',
      'financial_transaction',
      'financial_payable',
      'financial_receivable',
      'financial_import_job',
      'financial_bank_statement_entry',
      'financial_reconciliation_match',
      'financial_debt',
      'billing_plan',
      'billing_subscription',
      'billing_invoice'
    ];

    for (const name of tables) {
      const row = db.prepare(
        "select name from sqlite_master where type = 'table' and name = ?"
      ).get(name) as { name: string } | undefined;

      assert.ok(row, `tabela ausente: ${name}`);
    }

    assertCompositeForeignKey('financial_transaction', 'financial_account', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_account_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_transaction', 'financial_category', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_category_id', to: 'id' }
    ]);
    assertCompositeForeignKey('billing_subscription', 'billing_plan', [
      { from: 'company_id', to: 'company_id' },
      { from: 'billing_plan_id', to: 'id' }
    ]);
    assertCompositeForeignKey('billing_invoice', 'billing_subscription', [
      { from: 'company_id', to: 'company_id' },
      { from: 'billing_subscription_id', to: 'id' }
    ]);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
