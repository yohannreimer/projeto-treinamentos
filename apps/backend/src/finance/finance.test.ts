import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from '../app.js';
import { db, initDb, resetDbConnection } from '../db.js';
import {
  createInternalUser,
  hasAnyInternalPermission,
  readInternalAuthContext,
  requireInternalAuth
} from '../internalAuth.js';
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

function seedFinanceCompanies() {
  db.prepare(`
    insert into company (id, name)
    values (?, ?), (?, ?)
  `).run(
    'company-a',
    'Company A',
    'company-b',
    'Company B'
  );
}

function registerFinanceOverviewRoute(app: ReturnType<typeof createApp>) {
  app.get('/finance/overview', requireInternalAuth, (_req, res) => {
    const context = readInternalAuthContext(res);
    if (!context || !hasAnyInternalPermission(context, ['finance.read'])) {
      return res.status(403).json({ message: 'Acesso negado para esta área.' });
    }

    return res.json({ ok: true });
  });
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
    assertCompositeForeignKey('financial_payable', 'financial_transaction', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_transaction_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_receivable', 'financial_transaction', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_transaction_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_bank_statement_entry', 'financial_account', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_account_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_reconciliation_match', 'financial_bank_statement_entry', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_bank_statement_entry_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_debt', 'financial_transaction', [
      { from: 'company_id', to: 'company_id' },
      { from: 'financial_transaction_id', to: 'id' }
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

test('initDb bloqueia referencias financeiras entre empresas diferentes', () => {
  const dbPath = assignTestDbPath('finance-schema-tenant-isolation');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();
    seedFinanceCompanies();

    db.prepare(`
      insert into financial_account (
        id, company_id, name, kind, currency, is_active, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'financial-account-b',
      'company-b',
      'Banco B',
      'bank',
      'BRL',
      1,
      '2026-04-19T12:00:00.000Z',
      '2026-04-19T12:00:00.000Z'
    );

    assert.throws(
      () => {
        db.prepare(`
          insert into financial_transaction (
            id, company_id, financial_account_id, financial_category_id, kind, status, amount_cents,
            source, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'financial-transaction-a',
          'company-a',
          'financial-account-b',
          null,
          'expense',
          'open',
          15000,
          'manual',
          '2026-04-19T12:00:00.000Z',
          '2026-04-19T12:00:00.000Z'
        );
      },
      (error) => error instanceof Error && 'code' in error && String((error as { code?: string }).code).startsWith('SQLITE_CONSTRAINT'),
      'expected a SQLITE_CONSTRAINT when company A references company B financial_account'
    );
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('GET /finance/overview bloqueia usuário sem finance.read', async () => {
  const dbPath = assignTestDbPath('finance-route-auth-403');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  registerFinanceOverviewRoute(app);

  try {
    createInternalUser({
      username: 'finance.viewer',
      display_name: 'Finance Viewer',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['dashboard']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.viewer', password: 'Senha#123' });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;
    assert.equal(typeof token, 'string');

    const overviewRes = await request(app)
      .get('/finance/overview')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(overviewRes.status, 403);
    assert.deepEqual(overviewRes.body, {
      message: 'Acesso negado para esta área.'
    });
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
