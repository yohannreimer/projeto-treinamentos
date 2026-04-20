import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from '../app.js';
import { db, initDb, resetDbConnection } from '../db.js';
import { createInternalUser } from '../internalAuth.js';
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

test('initDb cria organization foundation e vincula auth interna ao org default', async () => {
  const dbPath = assignTestDbPath('finance-organization-foundation');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();

    const organizationTable = db.prepare(
      "select name from sqlite_master where type = 'table' and name = ?"
    ).get('organization') as { name: string } | undefined;
    assert.ok(organizationTable, 'tabela organization ausente');

    const organization = db.prepare(`
      select id, name, slug, is_active
      from organization
      where id = ?
    `).get('org-holand') as
      | {
          id: string;
          name: string;
          slug: string;
          is_active: number;
        }
      | undefined;

    assert.deepEqual(organization, {
      id: 'org-holand',
      name: 'Holand',
      slug: 'holand',
      is_active: 1
    });

    const organizationFk = db.prepare('pragma foreign_key_list(internal_user)').all() as Array<{
      table: string;
      from: string;
      to: string;
    }>;
    assert.ok(
      organizationFk.some((row) => row.table === 'organization' && row.from === 'organization_id' && row.to === 'id'),
      'foreign key organization_id -> organization.id ausente em internal_user'
    );

    const seededUser = db.prepare(`
      select organization_id
      from internal_user
      where username = ?
    `).get('holand') as { organization_id: string | null } | undefined;
    assert.equal(seededUser?.organization_id, 'org-holand');

    db.prepare(`
      update internal_user
      set organization_id = null
      where username = ?
    `).run('holand');

    initDb();

    const backfilledUser = db.prepare(`
      select organization_id
      from internal_user
      where username = ?
    `).get('holand') as { organization_id: string | null } | undefined;
    assert.equal(backfilledUser?.organization_id, 'org-holand');

    const app = createApp({ forceDbRefresh: false, seedDb: false });

    createInternalUser({
      username: 'finance.org.viewer',
      display_name: 'Finance Org Viewer',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.org.viewer', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.organization_id, 'org-holand');

    const token = loginRes.body.token as string;
    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.organization_id, 'org-holand');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

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

    const transactionColumns = db.prepare('pragma table_info(financial_transaction)').all() as Array<{ name: string }>;
    assert.ok(
      transactionColumns.some((column) => column.name === 'is_deleted'),
      'coluna is_deleted ausente em financial_transaction'
    );

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

test('POST /finance/transactions cria lançamento manual e persiste', async () => {
  const dbPath = assignTestDbPath('finance-transactions-create');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.writer',
      display_name: 'Finance Writer',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.write', 'finance.read']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.writer', password: 'Senha#123' });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const createRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        kind: 'expense',
        amount_cents: 12500,
        due_date: '2026-05-10',
        competence_date: '2026-05-01',
        note: 'Mensalidade do sistema'
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.company_id, 'company-a');
    assert.equal(createRes.body.kind, 'expense');
    assert.equal(createRes.body.amount_cents, 12500);
    assert.equal(createRes.body.source, 'manual');
    assert.equal(createRes.body.created_by, 'finance.writer');
    assert.equal(createRes.body.is_deleted, false);
    assert.equal(createRes.body.views.projected_amount_cents, -12500);
    assert.equal(createRes.body.views.competence_amount_cents, -12500);

    const persisted = db.prepare(`
      select company_id, kind, amount_cents, due_date, competence_date, source, note, created_by, coalesce(is_deleted, 0) as is_deleted
      from financial_transaction
      where id = ?
    `).get(createRes.body.id) as
      | {
          company_id: string;
          kind: string;
          amount_cents: number;
          due_date: string | null;
          competence_date: string | null;
          source: string;
          note: string | null;
          created_by: string | null;
          is_deleted: number;
        }
      | undefined;

    assert.deepEqual(persisted, {
      company_id: 'company-a',
      kind: 'expense',
      amount_cents: 12500,
      due_date: '2026-05-10',
      competence_date: '2026-05-01',
      source: 'manual',
      note: 'Mensalidade do sistema',
      created_by: 'finance.writer',
      is_deleted: 0
    });
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('CRUD base de contas/categorias respeita tenant e vínculos', async () => {
  const dbPath = assignTestDbPath('finance-catalog-basics');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.catalog',
      display_name: 'Finance Catalog',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.catalog', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const accountRes = await request(app)
      .post('/finance/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        name: 'Banco Operacional',
        kind: 'bank'
      });
    assert.equal(accountRes.status, 201);
    assert.equal(accountRes.body.company_id, 'company-a');
    assert.equal(accountRes.body.name, 'Banco Operacional');

    const parentCategoryRes = await request(app)
      .post('/finance/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        name: 'Receita',
        kind: 'income'
      });
    assert.equal(parentCategoryRes.status, 201);

    const childCategoryRes = await request(app)
      .post('/finance/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        name: 'Serviços',
        kind: 'income',
        parent_category_id: parentCategoryRes.body.id
      });
    assert.equal(childCategoryRes.status, 201);
    assert.equal(childCategoryRes.body.parent_category_id, parentCategoryRes.body.id);

    const listAccountsA = await request(app)
      .get('/finance/accounts?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listAccountsA.status, 200);
    assert.equal(listAccountsA.body.accounts.length, 1);

    const listAccountsB = await request(app)
      .get('/finance/accounts?company_id=company-b')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listAccountsB.status, 200);
    assert.equal(listAccountsB.body.accounts.length, 0);

    const listCategoriesA = await request(app)
      .get('/finance/categories?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listCategoriesA.status, 200);
    assert.equal(listCategoriesA.body.categories.length, 2);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST/GET de payables e receivables funciona com tenant correto', async () => {
  const dbPath = assignTestDbPath('finance-payable-receivable-core');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.cashflow',
      display_name: 'Finance Cashflow',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.cashflow', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const payableRes = await request(app)
      .post('/finance/payables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        description: 'Hospedagem mensal',
        amount_cents: 8900,
        status: 'open',
        due_date: '2026-07-10'
      });
    assert.equal(payableRes.status, 201);
    assert.equal(payableRes.body.company_id, 'company-a');

    const receivableRes = await request(app)
      .post('/finance/receivables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        description: 'Parcela contrato implantação',
        amount_cents: 15900,
        status: 'open',
        due_date: '2026-07-12'
      });
    assert.equal(receivableRes.status, 201);
    assert.equal(receivableRes.body.company_id, 'company-a');

    const listPayablesA = await request(app)
      .get('/finance/payables?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listPayablesA.status, 200);
    assert.equal(listPayablesA.body.payables.length, 1);

    const listReceivablesA = await request(app)
      .get('/finance/receivables?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listReceivablesA.status, 200);
    assert.equal(listReceivablesA.body.receivables.length, 1);

    const listPayablesB = await request(app)
      .get('/finance/payables?company_id=company-b')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listPayablesB.status, 200);
    assert.equal(listPayablesB.body.payables.length, 0);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST/GET de debts funciona com vínculos opcionais e isolamento de tenant', async () => {
  const dbPath = assignTestDbPath('finance-debts-core');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.debts',
      display_name: 'Finance Debts',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.debts', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const transactionRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        kind: 'expense',
        amount_cents: 150000,
        due_date: '2026-09-10',
        note: 'Compra parcelada equipamento'
      });
    assert.equal(transactionRes.status, 201);

    const debtRes = await request(app)
      .post('/finance/debts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_transaction_id: transactionRes.body.id,
        debt_type: 'parcelamento',
        status: 'open',
        principal_amount_cents: 150000,
        outstanding_amount_cents: 120000,
        due_date: '2026-10-10',
        note: 'Parcelas em andamento'
      });
    assert.equal(debtRes.status, 201);
    assert.equal(debtRes.body.company_id, 'company-a');
    assert.equal(debtRes.body.financial_transaction_id, transactionRes.body.id);
    assert.equal(debtRes.body.status, 'open');
    assert.equal(debtRes.body.principal_amount_cents, 150000);
    assert.equal(debtRes.body.outstanding_amount_cents, 120000);

    const listA = await request(app)
      .get('/finance/debts?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listA.status, 200);
    assert.equal(listA.body.debts.length, 1);

    const listB = await request(app)
      .get('/finance/debts?company_id=company-b')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listB.status, 200);
    assert.equal(listB.body.debts.length, 0);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('import jobs + extrato + conciliação inicial funcionam com rastreabilidade', async () => {
  const dbPath = assignTestDbPath('finance-import-reconciliation-core');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.reconcile',
      display_name: 'Finance Reconcile',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write', 'finance.reconcile']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.reconcile', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const accountRes = await request(app)
      .post('/finance/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        name: 'Conta Conciliação',
        kind: 'bank'
      });
    assert.equal(accountRes.status, 201);

    const importJobRes = await request(app)
      .post('/finance/import-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        import_type: 'ofx',
        source_file_name: 'abril.ofx',
        source_file_size_bytes: 1024,
        status: 'completed',
        total_rows: 10,
        processed_rows: 10
      });
    assert.equal(importJobRes.status, 201);

    const statementEntryRes = await request(app)
      .post('/finance/statement-entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_account_id: accountRes.body.id,
        financial_import_job_id: importJobRes.body.id,
        statement_date: '2026-08-05',
        amount_cents: -12000,
        description: 'Pagamento fornecedor XPTO',
        source: 'bank_import'
      });
    assert.equal(statementEntryRes.status, 201);

    const transactionRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        kind: 'expense',
        amount_cents: 12000,
        due_date: '2026-08-05',
        note: 'Despesa operacional conciliável'
      });
    assert.equal(transactionRes.status, 201);

    const reconciliationRes = await request(app)
      .post('/finance/reconciliations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_bank_statement_entry_id: statementEntryRes.body.id,
        financial_transaction_id: transactionRes.body.id,
        confidence_score: 0.98,
        match_status: 'matched',
        source: 'manual'
      });
    assert.equal(reconciliationRes.status, 201, JSON.stringify(reconciliationRes.body));
    assert.equal(reconciliationRes.body.match_status, 'matched');

    const listJobs = await request(app)
      .get('/finance/import-jobs?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listJobs.status, 200);
    assert.equal(listJobs.body.jobs.length, 1);

    const listEntries = await request(app)
      .get('/finance/statement-entries?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listEntries.status, 200);
    assert.equal(listEntries.body.entries.length, 1);

    const listMatches = await request(app)
      .get('/finance/reconciliations?company_id=company-a')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listMatches.status, 200);
    assert.equal(listMatches.body.matches.length, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('DELETE /finance/transactions/:id faz soft-delete auditável', async () => {
  const dbPath = assignTestDbPath('finance-transactions-soft-delete');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.approver',
      display_name: 'Finance Approver',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write', 'finance.approve']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.approver', password: 'Senha#123' });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const createRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        kind: 'income',
        amount_cents: 42000,
        due_date: '2026-06-15',
        competence_date: '2026-06-01',
        note: 'Fatura principal'
      });

    assert.equal(createRes.status, 201);

    const deleteRes = await request(app)
      .delete(`/finance/transactions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.ok, true);
    assert.equal(deleteRes.body.transaction.id, createRes.body.id);
    assert.equal(deleteRes.body.transaction.is_deleted, true);

    const persisted = db.prepare(`
      select coalesce(is_deleted, 0) as is_deleted
      from financial_transaction
      where id = ?
    `).get(createRes.body.id) as { is_deleted: number } | undefined;
    assert.equal(persisted?.is_deleted, 1);

    const auditRows = db.prepare(`
      select action, resource_type, resource_id, payload_json
      from internal_audit_log
      order by created_at desc, id desc
      limit 50
    `).all() as Array<{
      action: string;
      resource_type: string;
      resource_id: string | null;
      payload_json: string;
    }>;

    const auditLog = auditRows.find((row) => {
      const payload = JSON.parse(row.payload_json) as { method?: string; path?: string; status?: number };
      return payload.method === 'DELETE'
        && typeof payload.path === 'string'
        && payload.path.endsWith(`/transactions/${createRes.body.id}`)
        && payload.status === 200;
    });

    assert.ok(auditLog, 'esperava auditoria para o soft-delete financeiro');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST /finance/transactions rejeita status settled sem settlement_date', async () => {
  const dbPath = assignTestDbPath('finance-transactions-settled-without-date');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.validator',
      display_name: 'Finance Validator',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.validator', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const createRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        kind: 'income',
        status: 'settled',
        amount_cents: 10000,
        note: 'Teste sem data de liquidação'
      });

    assert.equal(createRes.status, 400);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('PATCH e DELETE bloqueiam transação já soft-deletada', async () => {
  const dbPath = assignTestDbPath('finance-transactions-no-mutate-after-delete');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.locked',
      display_name: 'Finance Locked',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write', 'finance.approve']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.locked', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const createRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        kind: 'expense',
        amount_cents: 5000,
        note: 'Transação para teste de bloqueio'
      });
    assert.equal(createRes.status, 201);

    const firstDelete = await request(app)
      .delete(`/finance/transactions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(firstDelete.status, 200);

    const patchRes = await request(app)
      .patch(`/finance/transactions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Tentativa após delete' });
    assert.equal(patchRes.status, 404);

    const secondDelete = await request(app)
      .delete(`/finance/transactions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(secondDelete.status, 404);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
