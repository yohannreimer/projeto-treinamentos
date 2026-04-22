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

function assertCompositeUniqueIndex(table: string, expectedColumns: string[]) {
  const indexes = db.prepare(`pragma index_list(${table})`).all() as Array<{
    name: string;
    unique: number;
  }>;

  const hasMatch = indexes.some((index) => {
    if (index.unique !== 1) {
      return false;
    }

    const columns = db.prepare(`pragma index_info(${index.name})`).all() as Array<{
      seqno: number;
      name: string;
    }>;

    const orderedColumns = columns
      .sort((left, right) => left.seqno - right.seqno)
      .map((column) => column.name);

    return orderedColumns.length === expectedColumns.length
      && orderedColumns.every((column, position) => column === expectedColumns[position]);
  });

  assert.ok(
    hasMatch,
    `índice único composto ausente em ${table}: ${expectedColumns.join(', ')}`
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

function seedFinanceEntity() {
  db.prepare(`
    insert into financial_entity (
      id,
      organization_id,
      legal_name,
      trade_name,
      document_number,
      kind,
      email,
      phone,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'entity-holand-supplier',
    'org-holand',
    'Fornecedor Holand',
    'Fornecedor Holand LTDA',
    '12.345.678/0001-90',
    'supplier',
    'financeiro@fornecedorholand.com',
    '+55 11 99999-0000',
    1,
    '2026-04-21T12:00:00.000Z',
    '2026-04-21T12:00:00.000Z'
  );
}

function seedFinanceEntityPartner() {
  db.prepare(`
    insert into financial_entity (
      id,
      organization_id,
      legal_name,
      trade_name,
      document_number,
      kind,
      email,
      phone,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'entity-holand-client',
    'org-holand',
    'Cliente Holand',
    'Cliente Holand SA',
    '98.765.432/0001-10',
    'customer',
    'financeiro@clienteholand.com',
    '+55 11 98888-0000',
    1,
    '2026-04-21T12:00:00.000Z',
    '2026-04-21T12:00:00.000Z'
  );
}

function seedFinanceAccountAndCategory() {
  db.prepare(`
    insert into financial_account (
      id,
      organization_id,
      company_id,
      name,
      kind,
      currency,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'financial-account-holand',
    'org-holand',
    'company-a',
    'Conta Holand',
    'bank',
    'BRL',
    1,
    '2026-04-21T12:00:00.000Z',
    '2026-04-21T12:00:00.000Z'
  );

  db.prepare(`
    insert into financial_category (
      id,
      organization_id,
      company_id,
      name,
      kind,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'financial-category-holand',
    'org-holand',
    'company-a',
    'Despesas Operacionais',
    'expense',
    1,
    '2026-04-21T12:00:00.000Z',
    '2026-04-21T12:00:00.000Z'
  );
}

function seedFinanceIncomeCategory() {
  db.prepare(`
    insert into financial_category (
      id,
      organization_id,
      company_id,
      name,
      kind,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'financial-category-income',
    'org-holand',
    'company-a',
    'Receita de Serviços',
    'income',
    1,
    '2026-04-21T12:00:00.000Z',
    '2026-04-21T12:00:00.000Z'
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

    const financialEntityTrigger = db.prepare(`
      select name
      from sqlite_master
      where type = 'trigger'
        and name = ?
    `).get('financial_transaction_financial_entity_consistency_insert') as { name: string } | undefined;
    assert.ok(financialEntityTrigger, 'trigger de integridade para financial_entity_id ausente');

    assertCompositeForeignKey('financial_transaction', 'financial_account', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_account_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_transaction', 'company', [
      { from: 'company_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_transaction', 'financial_category', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_category_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_transaction', 'financial_entity', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_entity_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_payable', 'financial_transaction', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_transaction_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_payable', 'financial_entity', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_entity_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_receivable', 'financial_transaction', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_transaction_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_receivable', 'financial_entity', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_entity_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_bank_statement_entry', 'financial_account', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_account_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_reconciliation_match', 'financial_bank_statement_entry', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_bank_statement_entry_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_reconciliation_match', 'financial_transaction', [
      { from: 'organization_id', to: 'organization_id' },
      { from: 'financial_transaction_id', to: 'id' }
    ]);
    assertCompositeForeignKey('financial_debt', 'financial_transaction', [
      { from: 'organization_id', to: 'organization_id' },
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
      insert into organization (id, name, slug, is_active, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(
      'org-other',
      'Other Org',
      'other-org',
      1,
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z'
    );

    db.prepare(`
      insert into financial_account (
        id, organization_id, company_id, name, kind, currency, is_active, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'financial-account-b',
      'org-other',
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
            id, organization_id, company_id, financial_account_id, financial_category_id, kind, status, amount_cents,
            source, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'financial-transaction-a',
          'org-holand',
          null,
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
      'expected a SQLITE_CONSTRAINT when an organization references a financial_account from another organization'
    );
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('initDb migra financial_transaction legado para company_id nullable', () => {
  const dbPath = assignTestDbPath('finance-transaction-migration');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();
    seedFinanceCompanies();
    db.prepare(`
      insert into financial_entity (
        id,
        organization_id,
        legal_name,
        trade_name,
        document_number,
        kind,
        email,
        phone,
        is_active,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'entity-migration-supplier',
      'org-holand',
      'Fornecedor Migração',
      'Fornecedor Migração LTDA',
      '11.222.333/0001-44',
      'supplier',
      'financeiro@migracao.com',
      '+55 11 97777-0000',
      1,
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z'
    );
    db.prepare(`
      insert into financial_account (
        id,
        organization_id,
        company_id,
        name,
        kind,
        currency,
        is_active,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'financial-account-migration',
      'org-holand',
      'company-a',
      'Conta Migração',
      'bank',
      'BRL',
      1,
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z'
    );
    db.prepare(`
      insert into financial_category (
        id,
        organization_id,
        company_id,
        name,
        kind,
        is_active,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'financial-category-migration',
      'org-holand',
      'company-a',
      'Categoria Migração',
      'expense',
      1,
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z'
    );

    db.exec('pragma foreign_keys = off');
    db.exec('drop table financial_transaction');
    db.exec(`
      create table financial_transaction (
        id text primary key,
        organization_id text,
        company_id text not null,
        financial_account_id text,
        financial_category_id text,
        kind text not null,
        status text not null,
        amount_cents integer not null,
        issue_date text,
        due_date text,
        settlement_date text,
        competence_date text,
        source text not null default 'manual',
        source_ref text,
        note text,
        created_by text,
        created_at text not null,
        updated_at text not null,
        is_deleted integer not null default 0,
        unique(company_id, id),
        foreign key(company_id) references company(id) on delete cascade,
        foreign key(company_id, financial_account_id) references financial_account(company_id, id) on delete restrict,
        foreign key(company_id, financial_category_id) references financial_category(company_id, id) on delete restrict
      );
    `);
    db.exec(`
      insert into financial_transaction (
        id,
        organization_id,
        company_id,
        financial_account_id,
        financial_category_id,
        kind,
        status,
        amount_cents,
        issue_date,
        due_date,
        settlement_date,
        competence_date,
        source,
        source_ref,
        note,
        created_by,
        created_at,
        updated_at,
        is_deleted
      ) values (
        'ftxn-legacy',
        'org-holand',
        'company-a',
        'financial-account-migration',
        'financial-category-migration',
        'expense',
        'open',
        7800,
        null,
        '2026-05-10',
        null,
        '2026-05-01',
        'manual',
        null,
        'Legado',
        'legacy.user',
        '2026-04-21T12:00:00.000Z',
        '2026-04-21T12:00:00.000Z',
        0
      );
    `);
    db.exec('pragma foreign_keys = on');

    initDb();

    const transactionColumns = db.prepare('pragma table_info(financial_transaction)').all() as Array<{
      name: string;
      notnull: number;
    }>;
    assert.equal(
      transactionColumns.find((column) => column.name === 'company_id')?.notnull,
      0
    );
    assert.equal(
      transactionColumns.find((column) => column.name === 'organization_id')?.notnull,
      1
    );

    const migratedLegacy = db.prepare(`
      select company_id, organization_id, financial_account_id, financial_category_id, coalesce(is_deleted, 0) as is_deleted
      from financial_transaction
      where id = ?
    `).get('ftxn-legacy') as {
      company_id: string | null;
      organization_id: string | null;
      financial_account_id: string | null;
      financial_category_id: string | null;
      is_deleted: number;
    } | undefined;

    assert.deepEqual(migratedLegacy, {
      company_id: 'company-a',
      organization_id: 'org-holand',
      financial_account_id: 'financial-account-migration',
      financial_category_id: 'financial-category-migration',
      is_deleted: 0
    });

    db.prepare(`
      insert into financial_transaction (
        id,
        organization_id,
        company_id,
        financial_entity_id,
        financial_account_id,
        financial_category_id,
        kind,
        status,
        amount_cents,
        issue_date,
        due_date,
        settlement_date,
        competence_date,
        source,
        source_ref,
        note,
        created_by,
        created_at,
        updated_at,
        is_deleted
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'ftxn-org-first',
      'org-holand',
      null,
      'entity-migration-supplier',
      'financial-account-migration',
      'financial-category-migration',
      'expense',
      'open',
      9900,
      null,
      '2026-05-12',
      null,
      '2026-05-01',
      'manual',
      null,
      'Org-first',
      'finance.migration',
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z',
      0
    );

    const orgFirst = db.prepare(`
      select company_id, financial_entity_id
      from financial_transaction
      where id = ?
    `).get('ftxn-org-first') as { company_id: string | null; financial_entity_id: string | null } | undefined;

    assert.deepEqual(orgFirst, {
      company_id: null,
      financial_entity_id: 'entity-migration-supplier'
    });
  } finally {
    db.exec('pragma foreign_keys = on');
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('initDb reconstroi financial_account e financial_category legados para chaves compostas por organization', () => {
  const dbPath = assignTestDbPath('finance-account-category-org-rebuild');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();
    seedFinanceCompanies();

    db.exec('pragma foreign_keys = off');
    db.exec('drop table financial_transaction');
    db.exec('drop table financial_category');
    db.exec('drop table financial_account');

    db.exec(`
      create table financial_account (
        id text primary key,
        company_id text not null,
        name text not null,
        kind text not null,
        currency text not null default 'BRL',
        account_number text,
        branch_number text,
        is_active integer not null default 1,
        created_at text not null,
        updated_at text not null,
        organization_id text references organization(id) on delete cascade,
        unique(company_id, id),
        foreign key(company_id) references company(id) on delete cascade
      );
    `);

    db.exec(`
      create table financial_category (
        id text primary key,
        company_id text not null,
        name text not null,
        kind text not null,
        parent_category_id text,
        is_active integer not null default 1,
        created_at text not null,
        updated_at text not null,
        organization_id text references organization(id) on delete cascade,
        unique(company_id, id),
        foreign key(company_id) references company(id) on delete cascade,
        foreign key(company_id, parent_category_id) references financial_category(company_id, id) on delete restrict
      );
    `);

    db.exec(`
      create table financial_transaction (
        id text primary key,
        organization_id text not null,
        company_id text,
        financial_entity_id text,
        financial_account_id text,
        financial_category_id text,
        kind text not null,
        status text not null,
        amount_cents integer not null,
        issue_date text,
        due_date text,
        settlement_date text,
        competence_date text,
        source text not null default 'manual',
        source_ref text,
        note text,
        created_by text,
        created_at text not null,
        updated_at text not null,
        is_deleted integer not null default 0,
        unique(organization_id, id),
        unique(company_id, id),
        foreign key(organization_id) references organization(id) on delete cascade,
        foreign key(company_id) references company(id) on delete cascade,
        foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
        foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict
      );
    `);
    db.exec('pragma foreign_keys = on');

    db.prepare(`
      insert into financial_account (
        id,
        company_id,
        name,
        kind,
        currency,
        is_active,
        created_at,
        updated_at,
        organization_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-fin-account',
      'company-a',
      'Conta Legada',
      'bank',
      'BRL',
      1,
      '2026-04-22T10:00:00.000Z',
      '2026-04-22T10:00:00.000Z',
      'org-holand'
    );

    db.prepare(`
      insert into financial_category (
        id,
        company_id,
        name,
        kind,
        is_active,
        created_at,
        updated_at,
        organization_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-fin-category',
      'company-a',
      'Categoria Legada',
      'expense',
      1,
      '2026-04-22T10:00:00.000Z',
      '2026-04-22T10:00:00.000Z',
      'org-holand'
    );

    initDb();

    assertCompositeUniqueIndex('financial_account', ['organization_id', 'id']);
    assertCompositeUniqueIndex('financial_category', ['organization_id', 'id']);

    db.prepare(`
      insert into financial_transaction (
        id,
        organization_id,
        company_id,
        financial_account_id,
        financial_category_id,
        kind,
        status,
        amount_cents,
        issue_date,
        due_date,
        competence_date,
        source,
        created_at,
        updated_at,
        is_deleted
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-org-txn',
      'org-holand',
      null,
      'legacy-fin-account',
      'legacy-fin-category',
      'expense',
      'open',
      2500,
      '2026-04-22',
      '2026-04-23',
      '2026-04-22',
      'manual',
      '2026-04-22T10:00:00.000Z',
      '2026-04-22T10:00:00.000Z',
      0
    );

    const inserted = db.prepare(`
      select financial_account_id, financial_category_id, company_id
      from financial_transaction
      where id = ?
    `).get('legacy-org-txn') as {
      financial_account_id: string | null;
      financial_category_id: string | null;
      company_id: string | null;
    } | undefined;

    assert.deepEqual(inserted, {
      financial_account_id: 'legacy-fin-account',
      financial_category_id: 'legacy-fin-category',
      company_id: null
    });
  } finally {
    db.exec('pragma foreign_keys = on');
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

test('GET /finance/context returns only tenant organization context without company selector', async () => {
  const dbPath = assignTestDbPath('finance-context-route');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    createInternalUser({
      username: 'finance.context',
      display_name: 'Finance Context',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.context', password: 'Senha#123' });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const contextRes = await request(app)
      .get('/finance/context')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(contextRes.status, 200);
    assert.deepEqual(contextRes.body, {
      organization_id: 'org-holand',
      organization_name: 'Holand',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo'
    });
    assert.ok(!('company_id' in contextRes.body));
    assert.ok(!('company_name' in contextRes.body));
    assert.ok(!('counterparty_company_id' in contextRes.body));
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
    seedFinanceEntity();
    seedFinanceEntityPartner();
    seedFinanceAccountAndCategory();
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
        financial_entity_id: 'entity-holand-supplier',
        financial_account_id: 'financial-account-holand',
        financial_category_id: 'financial-category-holand',
        kind: 'expense',
        amount_cents: 12500,
        due_date: '2026-05-10',
        competence_date: '2026-05-01',
        note: 'Mensalidade do sistema'
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.organization_id, 'org-holand');
    assert.equal(createRes.body.financial_entity_id, 'entity-holand-supplier');
    assert.equal(createRes.body.financial_account_id, 'financial-account-holand');
    assert.equal(createRes.body.financial_category_id, 'financial-category-holand');
    assert.equal(createRes.body.financial_account_name, 'Conta Holand');
    assert.equal(createRes.body.financial_category_name, 'Despesas Operacionais');
    assert.equal(createRes.body.kind, 'expense');
    assert.equal(createRes.body.amount_cents, 12500);
    assert.equal(createRes.body.source, 'manual');
    assert.equal(createRes.body.created_by, 'finance.writer');
    assert.equal(createRes.body.is_deleted, false);
    assert.equal(createRes.body.views.projected_amount_cents, -12500);
    assert.equal(createRes.body.views.competence_amount_cents, -12500);

    const persisted = db.prepare(`
      select company_id, financial_entity_id, financial_account_id, financial_category_id, kind, amount_cents, due_date, competence_date, source, note, created_by, coalesce(is_deleted, 0) as is_deleted
      from financial_transaction
      where id = ?
    `).get(createRes.body.id) as
      | {
          company_id: string | null;
          financial_entity_id: string | null;
          financial_account_id: string | null;
          financial_category_id: string | null;
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
      company_id: null,
      financial_entity_id: 'entity-holand-supplier',
      financial_account_id: 'financial-account-holand',
      financial_category_id: 'financial-category-holand',
      kind: 'expense',
      amount_cents: 12500,
      due_date: '2026-05-10',
      competence_date: '2026-05-01',
      source: 'manual',
      note: 'Mensalidade do sistema',
      created_by: 'finance.writer',
      is_deleted: 0
    });

    const patchRes = await request(app)
      .patch(`/finance/transactions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        financial_entity_id: 'entity-holand-client'
      });

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.financial_entity_id, 'entity-holand-client');

    const clearedRes = await request(app)
      .patch(`/finance/transactions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        financial_entity_id: null
      });

    assert.equal(clearedRes.status, 200);
    assert.equal(clearedRes.body.financial_entity_id, null);

    const persistedAfterPatch = db.prepare(`
      select financial_entity_id
      from financial_transaction
      where id = ?
    `).get(createRes.body.id) as { financial_entity_id: string | null } | undefined;

    assert.equal(persistedAfterPatch?.financial_entity_id, null);
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
        name: 'Banco Operacional',
        kind: 'bank'
      });
    assert.equal(accountRes.status, 201);
    assert.equal(accountRes.body.company_id, null);
    assert.equal(accountRes.body.name, 'Banco Operacional');

    const parentCategoryRes = await request(app)
      .post('/finance/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Receita',
        kind: 'income'
      });
    assert.equal(parentCategoryRes.status, 201);

    const childCategoryRes = await request(app)
      .post('/finance/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Serviços',
        kind: 'income',
        parent_category_id: parentCategoryRes.body.id
      });
    assert.equal(childCategoryRes.status, 201);
    assert.equal(childCategoryRes.body.parent_category_id, parentCategoryRes.body.id);

    const listAccountsA = await request(app)
      .get('/finance/accounts')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listAccountsA.status, 200);
    assert.equal(listAccountsA.body.accounts.length, 1);

    const listCategoriesA = await request(app)
      .get('/finance/categories')
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
        description: 'Hospedagem mensal',
        amount_cents: 8900,
        status: 'open',
        due_date: '2026-07-10'
      });
    assert.equal(payableRes.status, 201);
    assert.equal(payableRes.body.company_id, null);

    const receivableRes = await request(app)
      .post('/finance/receivables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Parcela contrato implantação',
        amount_cents: 15900,
        status: 'open',
        due_date: '2026-07-12'
      });
    assert.equal(receivableRes.status, 201);
    assert.equal(receivableRes.body.company_id, null);

    const listPayablesA = await request(app)
      .get('/finance/payables')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listPayablesA.status, 200);
    assert.equal(listPayablesA.body.payables.length, 1);

    const listReceivablesA = await request(app)
      .get('/finance/receivables')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listReceivablesA.status, 200);
    assert.equal(listReceivablesA.body.receivables.length, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance receivables and payables expose overdue and due-today groupings', async () => {
  const dbPath = assignTestDbPath('finance-payable-receivable-groupings');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  const today = new Date();
  const formatOffsetDate = (offsetDays: number) => {
    const value = new Date(today);
    value.setDate(value.getDate() + offsetDays);
    return value.toISOString().slice(0, 10);
  };

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.arap.ops',
      display_name: 'Finance AR/AP Ops',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.arap.ops', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const authHeader = { Authorization: `Bearer ${token}` };

    const operationalDates = {
      overdue: formatOffsetDate(-2),
      dueToday: formatOffsetDate(0),
      upcoming: formatOffsetDate(5),
      settled: formatOffsetDate(-1)
    };

    const createPayable = (payload: Record<string, unknown>) =>
      request(app)
        .post('/finance/payables')
        .set(authHeader)
        .send({
          company_id: 'company-a',
          issue_date: operationalDates.overdue,
          ...payload
        });

    const createReceivable = (payload: Record<string, unknown>) =>
      request(app)
        .post('/finance/receivables')
        .set(authHeader)
        .send({
          company_id: 'company-a',
          issue_date: operationalDates.overdue,
          ...payload
        });

    const createResponses = await Promise.all([
      createPayable({
        description: 'Fornecedor atrasado',
        amount_cents: 15000,
        status: 'open',
        due_date: operationalDates.overdue
      }),
      createPayable({
        description: 'Fornecedor vence hoje',
        amount_cents: 9000,
        status: 'partial',
        due_date: operationalDates.dueToday
      }),
      createPayable({
        description: 'Fornecedor próximo vencimento',
        amount_cents: 12000,
        status: 'planned',
        due_date: operationalDates.upcoming
      }),
      createPayable({
        description: 'Fornecedor liquidado',
        amount_cents: 7000,
        status: 'paid',
        due_date: operationalDates.settled,
        paid_at: operationalDates.settled
      }),
      createReceivable({
        description: 'Cliente atrasado',
        amount_cents: 21000,
        status: 'open',
        due_date: operationalDates.overdue
      }),
      createReceivable({
        description: 'Cliente vence hoje',
        amount_cents: 11000,
        status: 'partial',
        due_date: operationalDates.dueToday
      }),
      createReceivable({
        description: 'Cliente próximo vencimento',
        amount_cents: 17000,
        status: 'planned',
        due_date: operationalDates.upcoming
      }),
      createReceivable({
        description: 'Cliente liquidado',
        amount_cents: 8000,
        status: 'received',
        due_date: operationalDates.settled,
        received_at: operationalDates.settled
      })
    ]);

    createResponses.forEach((response) => assert.equal(response.status, 201));

    const [receivablesRes, payablesRes] = await Promise.all([
      request(app)
        .get('/finance/receivables?company_id=company-a')
        .set(authHeader),
      request(app)
        .get('/finance/payables?company_id=company-a')
        .set(authHeader)
    ]);

    assert.equal(receivablesRes.status, 200);
    assert.equal(payablesRes.status, 200);

    assert.deepEqual(receivablesRes.body.summary, {
      open_cents: 49000,
      overdue_cents: 21000,
      due_today_cents: 11000
    });
    assert.deepEqual(payablesRes.body.summary, {
      open_cents: 36000,
      overdue_cents: 15000,
      due_today_cents: 9000
    });

    assert.equal(receivablesRes.body.groups.overdue.length, 1);
    assert.equal(receivablesRes.body.groups.due_today.length, 1);
    assert.equal(receivablesRes.body.groups.upcoming.length, 1);
    assert.equal(receivablesRes.body.groups.settled.length, 1);
    assert.equal(payablesRes.body.groups.overdue.length, 1);
    assert.equal(payablesRes.body.groups.due_today.length, 1);
    assert.equal(payablesRes.body.groups.upcoming.length, 1);
    assert.equal(payablesRes.body.groups.settled.length, 1);

    assert.equal(receivablesRes.body.groups.overdue[0].description, 'Cliente atrasado');
    assert.equal(receivablesRes.body.groups.due_today[0].description, 'Cliente vence hoje');
    assert.equal(receivablesRes.body.groups.upcoming[0].description, 'Cliente próximo vencimento');
    assert.equal(receivablesRes.body.groups.settled[0].description, 'Cliente liquidado');
    assert.equal(payablesRes.body.groups.overdue[0].description, 'Fornecedor atrasado');
    assert.equal(payablesRes.body.groups.due_today[0].description, 'Fornecedor vence hoje');
    assert.equal(payablesRes.body.groups.upcoming[0].description, 'Fornecedor próximo vencimento');
    assert.equal(payablesRes.body.groups.settled[0].description, 'Fornecedor liquidado');
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
        financial_transaction_id: transactionRes.body.id,
        debt_type: 'parcelamento',
        status: 'open',
        principal_amount_cents: 150000,
        outstanding_amount_cents: 120000,
        due_date: '2026-10-10',
        note: 'Parcelas em andamento'
      });
    assert.equal(debtRes.status, 201);
    assert.equal(debtRes.body.company_id, null);
    assert.equal(debtRes.body.financial_transaction_id, transactionRes.body.id);
    assert.equal(debtRes.body.status, 'open');
    assert.equal(debtRes.body.principal_amount_cents, 150000);
    assert.equal(debtRes.body.outstanding_amount_cents, 120000);

    const listA = await request(app)
      .get('/finance/debts')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listA.status, 200);
    assert.equal(listA.body.debts.length, 1);
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

    const ledgerRes = await request(app)
      .get('/finance/transactions?include_deleted=1')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(ledgerRes.status, 200);
    assert.equal(ledgerRes.body.transactions.length, 1);
    assert.equal(ledgerRes.body.transactions[0].id, createRes.body.id);
    assert.equal(ledgerRes.body.transactions[0].is_deleted, true);

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

test('GET /finance/reports consolida DRE, aging e fluxo a partir do ledger financeiro', async () => {
  const dbPath = assignTestDbPath('finance-reports-overview');
  cleanupDbFiles(dbPath);
  resetDbConnection();

    const app = createApp({ forceDbRefresh: true, seedDb: false });
    const now = new Date();
    const formatDate = (year: number, monthIndex: number, day: number) => (
      `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth();
    const nextMonthDate = new Date(Date.UTC(currentYear, currentMonth + 1, 5));
    const currentPeriod = formatDate(currentYear, currentMonth, 1).slice(0, 7);
    const nextPeriod = nextMonthDate.toISOString().slice(0, 7);
    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayIso = yesterdayDate.toISOString().slice(0, 10);

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceEntityPartner();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.reports',
      display_name: 'Finance Reports',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.reports', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;
    const authHeader = { Authorization: `Bearer ${token}` };

    const createdTransactions = await Promise.all([
      request(app)
        .post('/finance/transactions')
        .set(authHeader)
        .send({
          financial_entity_id: 'entity-holand-client',
          financial_account_id: 'financial-account-holand',
          financial_category_id: 'financial-category-income',
          kind: 'income',
          status: 'settled',
          amount_cents: 100000,
          issue_date: formatDate(currentYear, currentMonth, 10),
          competence_date: formatDate(currentYear, currentMonth, 10),
          settlement_date: formatDate(currentYear, currentMonth, 12),
          note: 'Receita do mês'
        }),
      request(app)
        .post('/finance/transactions')
        .set(authHeader)
        .send({
          financial_entity_id: 'entity-holand-supplier',
          financial_account_id: 'financial-account-holand',
          financial_category_id: 'financial-category-holand',
          kind: 'expense',
          status: 'settled',
          amount_cents: 40000,
          issue_date: formatDate(currentYear, currentMonth, 11),
          competence_date: formatDate(currentYear, currentMonth, 11),
          settlement_date: formatDate(currentYear, currentMonth, 13),
          note: 'Despesa operacional do mês'
        }),
      request(app)
        .post('/finance/transactions')
        .set(authHeader)
        .send({
          financial_entity_id: 'entity-holand-client',
          financial_account_id: 'financial-account-holand',
          financial_category_id: 'financial-category-income',
          kind: 'income',
          status: 'open',
          amount_cents: 30000,
          issue_date: nextMonthDate.toISOString().slice(0, 10),
          due_date: nextMonthDate.toISOString().slice(0, 10),
          note: 'Receita projetada'
        })
    ]);

    createdTransactions.forEach((response) => assert.equal(response.status, 201));

    const [receivableRes, payableRes] = await Promise.all([
      request(app)
        .post('/finance/receivables')
        .set(authHeader)
        .send({
          company_id: 'company-a',
          customer_name: 'Cliente Holand',
          description: 'Recebível em atraso',
          amount_cents: 15000,
          status: 'open',
          issue_date: yesterdayIso,
          due_date: yesterdayIso
        }),
      request(app)
        .post('/finance/payables')
        .set(authHeader)
        .send({
          company_id: 'company-a',
          supplier_name: 'Fornecedor Holand',
          description: 'Pagamento em atraso',
          amount_cents: 9000,
          status: 'open',
          issue_date: yesterdayIso,
          due_date: yesterdayIso
        })
    ]);

    assert.equal(receivableRes.status, 201);
    assert.equal(payableRes.status, 201);

    const reportsRes = await request(app)
      .get('/finance/reports')
      .set(authHeader);

    assert.equal(reportsRes.status, 200);
    assert.equal(reportsRes.body.organization_id, 'org-holand');
    assert.equal(reportsRes.body.dre.gross_revenue_cents, 130000);
    assert.equal(reportsRes.body.dre.operating_expenses_cents, 40000);
    assert.equal(reportsRes.body.dre.operating_result_cents, 90000);

    assert.equal(reportsRes.body.income_by_category[0].category_name, 'Receita de Serviços');
    assert.equal(reportsRes.body.income_by_category[0].amount_cents, 130000);
    assert.equal(reportsRes.body.income_by_category[0].transaction_count, 2);
    assert.equal(reportsRes.body.expense_by_category[0].category_name, 'Despesas Operacionais');
    assert.equal(reportsRes.body.expense_by_category[0].amount_cents, 40000);
    assert.equal(reportsRes.body.expense_by_category[0].transaction_count, 1);

    assert.equal(reportsRes.body.overdue_receivables.length, 1);
    assert.equal(reportsRes.body.overdue_receivables[0].description, 'Recebível em atraso');
    assert.equal(reportsRes.body.overdue_payables.length, 1);
    assert.equal(reportsRes.body.overdue_payables[0].description, 'Pagamento em atraso');

    assert.deepEqual(reportsRes.body.realized_vs_projected, [
      {
        period: currentPeriod,
        realized_cents: 60000,
        projected_cents: 0,
        variance_cents: 60000
      },
      {
        period: nextPeriod,
        realized_cents: 0,
        projected_cents: 30000,
        variance_cents: -30000
      }
    ]);
    assert.ok(reportsRes.body.consolidated_cashflow.length >= 1);
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
