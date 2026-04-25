import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from '../app.js';
import { db, initDb, resetDbConnection } from '../db.js';
import { createInternalUser } from '../internalAuth.js';
import { assignTestDbPath } from '../test/testDb.js';
import { currentFinanceMonthRange, financeOffsetDateKey } from './period.js';

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
      role: 'supremo',
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

test('initDb cria schema do núcleo conectado financeiro', async () => {
  const dbPath = assignTestDbPath('finance-connected-core-schema');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: true });

  try {
    assert.ok(app);

    const payableColumns = db.prepare('pragma table_info(financial_payable)').all() as Array<{ name: string }>;
    const receivableColumns = db.prepare('pragma table_info(financial_receivable)').all() as Array<{ name: string }>;
    const transactionColumns = db.prepare('pragma table_info(financial_transaction)').all() as Array<{ name: string }>;

    for (const columns of [payableColumns, receivableColumns, transactionColumns]) {
      assert.ok(columns.some((column) => column.name === 'financial_cost_center_id'));
      assert.ok(columns.some((column) => column.name === 'financial_payment_method_id'));
    }

    const tagTable = db.prepare(`
      select name from sqlite_master where type = 'table' and name = 'financial_entity_tag'
    `).get();
    const tagMapTable = db.prepare(`
      select name from sqlite_master where type = 'table' and name = 'financial_entity_tag_map'
    `).get();
    const defaultTable = db.prepare(`
      select name from sqlite_master where type = 'table' and name = 'financial_entity_default_profile'
    `).get();

    assert.ok(tagTable);
    assert.ok(tagMapTable);
    assert.ok(defaultTable);

    const suggestedTags = db.prepare(`
      select name from financial_entity_tag where organization_id = ? order by name collate nocase asc
    `).all('org-holand') as Array<{ name: string }>;

    assert.ok(suggestedTags.some((row) => row.name === 'Funcionário'));
    assert.ok(suggestedTags.some((row) => row.name === 'Banco'));
    assert.ok(suggestedTags.some((row) => row.name === 'Imposto'));
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

test('GET /finance/overview bloqueia usuário não supremo mesmo com permissão financeira', async () => {
  const dbPath = assignTestDbPath('finance-route-auth-403');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    createInternalUser({
      username: 'finance.viewer',
      display_name: 'Finance Viewer',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.viewer', password: 'Senha#123' });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.user.role, 'custom');
    assert.equal(loginRes.body.user.permissions.includes('finance.read'), false);
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
      role: 'supremo',
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
      role: 'supremo',
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
      role: 'supremo',
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

test('finance cadastros completos editam catálogos, favoritos e detectam duplicidades', async () => {
  const dbPath = assignTestDbPath('finance-cadastros-completos');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();

    createInternalUser({
      username: 'finance.phase2',
      display_name: 'Finance Phase 2',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.phase2', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const accountRes = await request(app)
      .post('/finance/accounts')
      .set(authHeader)
      .send({ name: 'Banco Antigo', kind: 'bank' });
    assert.equal(accountRes.status, 201);

    const editedAccountRes = await request(app)
      .patch(`/finance/accounts/${accountRes.body.id}`)
      .set(authHeader)
      .send({ name: 'Banco Operacional', account_number: '12345' });
    assert.equal(editedAccountRes.status, 200);
    assert.equal(editedAccountRes.body.name, 'Banco Operacional');
    assert.equal(editedAccountRes.body.account_number, '12345');

    const categoryRes = await request(app)
      .post('/finance/categories')
      .set(authHeader)
      .send({ name: 'Despesa antiga', kind: 'expense' });
    assert.equal(categoryRes.status, 201);

    const editedCategoryRes = await request(app)
      .patch(`/finance/categories/${categoryRes.body.id}`)
      .set(authHeader)
      .send({ name: 'Folha', kind: 'expense' });
    assert.equal(editedCategoryRes.status, 200);
    assert.equal(editedCategoryRes.body.name, 'Folha');

    const costCenterRes = await request(app)
      .post('/finance/catalog/cost-centers')
      .set(authHeader)
      .send({ name: 'Comercial', code: 'COM' });
    assert.equal(costCenterRes.status, 201);

    const editedCostCenterRes = await request(app)
      .patch(`/finance/catalog/cost-centers/${costCenterRes.body.id}`)
      .set(authHeader)
      .send({ code: 'VEN' });
    assert.equal(editedCostCenterRes.status, 200);
    assert.equal(editedCostCenterRes.body.code, 'VEN');

    const paymentRes = await request(app)
      .post('/finance/catalog/payment-methods')
      .set(authHeader)
      .send({ name: 'PIX antigo', kind: 'pix' });
    assert.equal(paymentRes.status, 201);

    const editedPaymentRes = await request(app)
      .patch(`/finance/catalog/payment-methods/${paymentRes.body.id}`)
      .set(authHeader)
      .send({ name: 'PIX Principal' });
    assert.equal(editedPaymentRes.status, 200);
    assert.equal(editedPaymentRes.body.name, 'PIX Principal');

    const favoriteRes = await request(app)
      .post('/finance/catalog/favorite-combinations')
      .set(authHeader)
      .send({
        name: 'Folha Comercial PIX',
        context: 'payable',
        financial_category_id: editedCategoryRes.body.id,
        financial_cost_center_id: editedCostCenterRes.body.id,
        financial_account_id: editedAccountRes.body.id,
        financial_payment_method_id: editedPaymentRes.body.id
      });
    assert.equal(favoriteRes.status, 201);
    assert.equal(favoriteRes.body.financial_category_name, 'Folha');
    assert.equal(favoriteRes.body.financial_cost_center_name, 'Comercial');

    const favoriteListRes = await request(app)
      .get('/finance/catalog/favorite-combinations')
      .set(authHeader);
    assert.equal(favoriteListRes.status, 200);
    assert.equal(favoriteListRes.body.length, 1);

    const inactiveFavoriteRes = await request(app)
      .delete(`/finance/catalog/favorite-combinations/${favoriteRes.body.id}`)
      .set(authHeader);
    assert.equal(inactiveFavoriteRes.status, 200);
    assert.equal(inactiveFavoriteRes.body.is_active, false);

    const editedEntityRes = await request(app)
      .patch('/finance/entities/entity-holand-supplier')
      .set(authHeader)
      .send({ trade_name: 'Fornecedor Holand Editado', is_active: true });
    assert.equal(editedEntityRes.status, 200);
    assert.equal(editedEntityRes.body.trade_name, 'Fornecedor Holand Editado');

    const duplicateEntityRes = await request(app)
      .post('/finance/entities')
      .set(authHeader)
      .send({
        legal_name: 'Fornecedor Holand',
        trade_name: 'Fornecedor duplicado',
        document_number: '12.345.678/0001-90',
        kind: 'supplier'
      });
    assert.equal(duplicateEntityRes.status, 201);

    const duplicatesRes = await request(app)
      .get('/finance/entities/duplicates')
      .set(authHeader);
    assert.equal(duplicatesRes.status, 200);
    assert.ok(duplicatesRes.body.some((group: { reason: string; entities: unknown[] }) =>
      group.reason === 'document_number' && group.entities.length === 2
    ));

    const inactiveAccountRes = await request(app)
      .delete(`/finance/accounts/${accountRes.body.id}`)
      .set(authHeader);
    assert.equal(inactiveAccountRes.status, 200);
    assert.equal(inactiveAccountRes.body.is_active, false);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance entity tags and default profiles can be managed', async () => {
  const dbPath = assignTestDbPath('finance-entity-default-profiles');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceAccountAndCategory();

    createInternalUser({
      username: 'finance.defaults',
      display_name: 'Finance Defaults',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.defaults', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const tagRes = await request(app)
      .post('/finance/entities/tags')
      .set(authHeader)
      .send({ name: 'Funcionário' });
    assert.equal(tagRes.status, 201);
    assert.equal(tagRes.body.name, 'Funcionário');

    const tagsRes = await request(app)
      .get('/finance/entities/tags')
      .set(authHeader);
    assert.equal(tagsRes.status, 200);
    assert.ok(tagsRes.body.some((tag: { name: string }) => tag.name === 'Funcionário'));

    const linkRes = await request(app)
      .put('/finance/entities/entity-holand-supplier/tags')
      .set(authHeader)
      .send({ tag_ids: [tagRes.body.id] });
    assert.equal(linkRes.status, 200);
    assert.equal(linkRes.body.tags.length, 1);
    assert.equal(linkRes.body.tags[0].name, 'Funcionário');

    const entityRes = await request(app)
      .get('/finance/entities')
      .set(authHeader);
    assert.equal(entityRes.status, 200);
    const supplier = entityRes.body.find((entity: { id: string }) => entity.id === 'entity-holand-supplier');
    assert.equal(supplier.tags[0].name, 'Funcionário');

    const profileRes = await request(app)
      .put('/finance/entities/entity-holand-supplier/defaults/payable')
      .set(authHeader)
      .send({
        financial_category_id: 'financial-category-holand',
        financial_account_id: 'financial-account-holand',
        due_rule: 'same_day',
        competence_rule: 'issue_month',
        recurrence_rule: 'monthly'
      });

    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.body.context, 'payable');
    assert.equal(profileRes.body.financial_entity_id, 'entity-holand-supplier');
    assert.equal(profileRes.body.financial_category_id, 'financial-category-holand');
    assert.equal(profileRes.body.financial_account_id, 'financial-account-holand');
    assert.equal(profileRes.body.recurrence_rule, 'monthly');

    const resolveRes = await request(app)
      .get('/finance/entities/entity-holand-supplier/defaults/payable')
      .set(authHeader);
    assert.equal(resolveRes.status, 200);
    assert.equal(resolveRes.body.financial_category_name, 'Despesas Operacionais');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('payables and receivables persist cost center and payment method dimensions', async () => {
  const dbPath = assignTestDbPath('finance-ledger-extra-dimensions');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceEntityPartner();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.dimensions',
      display_name: 'Finance Dimensions',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({
      username: 'finance.dimensions',
      password: 'Senha#123'
    });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const costCenterRes = await request(app)
      .post('/finance/catalog/cost-centers')
      .set(authHeader)
      .send({ name: 'Comercial', code: 'COM' });
    assert.equal(costCenterRes.status, 201);

    const paymentRes = await request(app)
      .post('/finance/catalog/payment-methods')
      .set(authHeader)
      .send({ name: 'PIX', kind: 'pix' });
    assert.equal(paymentRes.status, 201);

    const payableRes = await request(app)
      .post('/finance/payables')
      .set(authHeader)
      .send({
        financial_entity_id: 'entity-holand-supplier',
        financial_account_id: 'financial-account-holand',
        financial_category_id: 'financial-category-holand',
        financial_cost_center_id: costCenterRes.body.id,
        financial_payment_method_id: paymentRes.body.id,
        description: 'Salário André',
        amount_cents: 120000,
        status: 'open',
        issue_date: '2026-04-20',
        due_date: '2026-04-30'
      });
    assert.equal(payableRes.status, 201);
    assert.equal(payableRes.body.financial_cost_center_name, 'Comercial');
    assert.equal(payableRes.body.financial_payment_method_name, 'PIX');

    const receivableRes = await request(app)
      .post('/finance/receivables')
      .set(authHeader)
      .send({
        financial_entity_id: 'entity-holand-client',
        financial_account_id: 'financial-account-holand',
        financial_category_id: 'financial-category-income',
        financial_cost_center_id: costCenterRes.body.id,
        financial_payment_method_id: paymentRes.body.id,
        description: 'Mensalidade',
        amount_cents: 240000,
        status: 'open',
        issue_date: '2026-04-20',
        due_date: '2026-04-30'
      });
    assert.equal(receivableRes.status, 201);
    assert.equal(receivableRes.body.financial_cost_center_name, 'Comercial');
    assert.equal(receivableRes.body.financial_payment_method_name, 'PIX');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('payables and receivables apply entity defaults when fields are omitted', async () => {
  const dbPath = assignTestDbPath('finance-apply-entity-defaults');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.apply.defaults',
      display_name: 'Finance Apply Defaults',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.apply.defaults', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const costCenterRes = await request(app)
      .post('/finance/catalog/cost-centers')
      .set(authHeader)
      .send({ name: 'Comercial', code: 'COM' });
    assert.equal(costCenterRes.status, 201);

    const paymentRes = await request(app)
      .post('/finance/catalog/payment-methods')
      .set(authHeader)
      .send({ name: 'PIX', kind: 'pix' });
    assert.equal(paymentRes.status, 201);

    await request(app)
      .put('/finance/entities/entity-holand-supplier/defaults/payable')
      .set(authHeader)
      .send({
        financial_category_id: 'financial-category-holand',
        financial_account_id: 'financial-account-holand',
        financial_cost_center_id: costCenterRes.body.id,
        financial_payment_method_id: paymentRes.body.id
      })
      .expect(200);

    const payableRes = await request(app)
      .post('/finance/payables')
      .set(authHeader)
      .send({
        financial_entity_id: 'entity-holand-supplier',
        description: 'Folha André',
        amount_cents: 120000,
        status: 'open',
        issue_date: '2026-04-20',
        due_date: '2026-04-30'
      });

    assert.equal(payableRes.status, 201);
    assert.equal(payableRes.body.financial_category_id, 'financial-category-holand');
    assert.equal(payableRes.body.financial_account_id, 'financial-account-holand');
    assert.equal(payableRes.body.financial_cost_center_id, costCenterRes.body.id);
    assert.equal(payableRes.body.financial_payment_method_id, paymentRes.body.id);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance daily operations settle, duplicate, cancel, split and recur payables and receivables', async () => {
  const dbPath = assignTestDbPath('finance-daily-operations');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceEntityPartner();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.ops',
      display_name: 'Finance Ops',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.ops', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const payableRes = await request(app)
      .post('/finance/payables')
      .set(authHeader)
      .send({
        financial_entity_id: 'entity-holand-supplier',
        financial_account_id: 'financial-account-holand',
        financial_category_id: 'financial-category-holand',
        description: 'Fornecedor mensal',
        amount_cents: 90000,
        status: 'open',
        issue_date: '2026-04-20',
        due_date: '2026-04-30'
      });
    assert.equal(payableRes.status, 201);
    assert.equal(payableRes.body.paid_amount_cents, 0);

    const partialPayableRes = await request(app)
      .post(`/finance/payables/${payableRes.body.id}/partial`)
      .set(authHeader)
      .send({ amount_cents: 30000, settled_at: '2026-04-23' });
    assert.equal(partialPayableRes.status, 200);
    assert.equal(partialPayableRes.body.status, 'partial');
    assert.equal(partialPayableRes.body.paid_amount_cents, 30000);

    const settlePayableRes = await request(app)
      .post(`/finance/payables/${payableRes.body.id}/settle`)
      .set(authHeader)
      .send({ settled_at: '2026-04-24' });
    assert.equal(settlePayableRes.status, 200);
    assert.equal(settlePayableRes.body.status, 'paid');
    assert.equal(settlePayableRes.body.paid_amount_cents, 90000);
    assert.equal(settlePayableRes.body.paid_at, '2026-04-24');
    assert.ok(settlePayableRes.body.financial_transaction_id);

    const payableMovementRows = db.prepare(`
      select kind, status, amount_cents, settlement_date, source, source_ref
      from financial_transaction
      where organization_id = ?
        and source = 'payable_settlement'
        and source_ref = ?
      order by settlement_date asc, amount_cents asc
    `).all('org-holand', payableRes.body.id) as Array<{
      kind: string;
      status: string;
      amount_cents: number;
      settlement_date: string | null;
      source: string;
      source_ref: string | null;
    }>;
    assert.equal(payableMovementRows.length, 2);
    assert.deepEqual(
      payableMovementRows.map((row) => ({
        kind: row.kind,
        status: row.status,
        amount_cents: row.amount_cents,
        settlement_date: row.settlement_date
      })),
      [
        { kind: 'expense', status: 'settled', amount_cents: 30000, settlement_date: '2026-04-23' },
        { kind: 'expense', status: 'settled', amount_cents: 60000, settlement_date: '2026-04-24' }
      ]
    );

    const duplicatePayableRes = await request(app)
      .post(`/finance/payables/${payableRes.body.id}/duplicate`)
      .set(authHeader)
      .send({});
    assert.equal(duplicatePayableRes.status, 201);
    assert.equal(duplicatePayableRes.body.status, 'open');
    assert.equal(duplicatePayableRes.body.amount_cents, 90000);

    const installmentsRes = await request(app)
      .post(`/finance/payables/${payableRes.body.id}/installments`)
      .set(authHeader)
      .send({ count: 3, first_due_date: '2026-05-10' });
    assert.equal(installmentsRes.status, 201);
    assert.equal(installmentsRes.body.payables.length, 3);
    assert.equal(
      installmentsRes.body.payables.reduce((total: number, item: { amount_cents: number }) => total + item.amount_cents, 0),
      90000
    );

    const recurrencesRes = await request(app)
      .post(`/finance/payables/${payableRes.body.id}/recurrences`)
      .set(authHeader)
      .send({ count: 2, first_due_date: '2026-06-10' });
    assert.equal(recurrencesRes.status, 201);
    assert.equal(recurrencesRes.body.payables.length, 2);
    assert.equal(recurrencesRes.body.payables[0].amount_cents, 90000);

    const cancelPayableRes = await request(app)
      .post(`/finance/payables/${duplicatePayableRes.body.id}/cancel`)
      .set(authHeader)
      .send({ note: 'Duplicado cancelado' });
    assert.equal(cancelPayableRes.status, 200);
    assert.equal(cancelPayableRes.body.status, 'canceled');

    const receivableRes = await request(app)
      .post('/finance/receivables')
      .set(authHeader)
      .send({
        financial_entity_id: 'entity-holand-client',
        financial_account_id: 'financial-account-holand',
        financial_category_id: 'financial-category-income',
        description: 'Cliente mensal',
        amount_cents: 120000,
        status: 'open',
        issue_date: '2026-04-20',
        due_date: '2026-04-30'
      });
    assert.equal(receivableRes.status, 201);

    const partialReceivableRes = await request(app)
      .post(`/finance/receivables/${receivableRes.body.id}/partial`)
      .set(authHeader)
      .send({ amount_cents: 50000, settled_at: '2026-04-23' });
    assert.equal(partialReceivableRes.status, 200);
    assert.equal(partialReceivableRes.body.status, 'partial');
    assert.equal(partialReceivableRes.body.received_amount_cents, 50000);

    const settleReceivableRes = await request(app)
      .post(`/finance/receivables/${receivableRes.body.id}/settle`)
      .set(authHeader)
      .send({ settled_at: '2026-04-24' });
    assert.equal(settleReceivableRes.status, 200);
    assert.equal(settleReceivableRes.body.status, 'received');
    assert.equal(settleReceivableRes.body.received_amount_cents, 120000);
    assert.equal(settleReceivableRes.body.received_at, '2026-04-24');
    assert.ok(settleReceivableRes.body.financial_transaction_id);

    const receivableMovementRows = db.prepare(`
      select kind, status, amount_cents, settlement_date, source, source_ref
      from financial_transaction
      where organization_id = ?
        and source = 'receivable_settlement'
        and source_ref = ?
      order by settlement_date asc, amount_cents asc
    `).all('org-holand', receivableRes.body.id) as Array<{
      kind: string;
      status: string;
      amount_cents: number;
      settlement_date: string | null;
      source: string;
      source_ref: string | null;
    }>;
    assert.equal(receivableMovementRows.length, 2);
    assert.deepEqual(
      receivableMovementRows.map((row) => ({
        kind: row.kind,
        status: row.status,
        amount_cents: row.amount_cents,
        settlement_date: row.settlement_date
      })),
      [
        { kind: 'income', status: 'settled', amount_cents: 50000, settlement_date: '2026-04-23' },
        { kind: 'income', status: 'settled', amount_cents: 70000, settlement_date: '2026-04-24' }
      ]
    );

    const auditRows = db.prepare(`
      select action, count(*) as total
      from financial_operation_audit
      where organization_id = ?
      group by action
    `).all('org-holand') as Array<{ action: string; total: number }>;
    assert.ok(auditRows.some((row) => row.action === 'partial_settle' && row.total >= 2));
    assert.ok(auditRows.some((row) => row.action === 'settle' && row.total >= 2));
    assert.ok(auditRows.some((row) => row.action === 'installments' && row.total >= 1));
    assert.ok(auditRows.some((row) => row.action === 'recurrence' && row.total >= 1));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance recurring rules materialize monthly commitments and can be paused', async () => {
  const dbPath = assignTestDbPath('finance-recurring-rules');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceAccountAndCategory();

    createInternalUser({
      username: 'finance.recurring',
      display_name: 'Finance Recurring',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.recurring', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const templateRes = await request(app)
      .post('/finance/payables')
      .set(authHeader)
      .send({
        financial_entity_id: 'entity-holand-supplier',
        financial_account_id: 'financial-account-holand',
        financial_category_id: 'financial-category-holand',
        description: 'Aluguel mensal',
        amount_cents: 680000,
        status: 'open',
        issue_date: '2026-04-01',
        due_date: '2026-04-15'
      });
    assert.equal(templateRes.status, 201);

    const recurringRes = await request(app)
      .post('/finance/recurring-rules/from-resource')
      .set(authHeader)
      .send({
        resource_type: 'payable',
        resource_id: templateRes.body.id,
        day_of_month: 15,
        start_date: '2026-04-15',
        materialization_months: 3
      });
    assert.equal(recurringRes.status, 201);
    assert.equal(recurringRes.body.rule.name, 'Aluguel mensal');
    assert.equal(recurringRes.body.rule.status, 'active');
    assert.equal(recurringRes.body.rule.last_materialized_until, '2026-06-15');
    assert.equal(recurringRes.body.payables.length, 2);
    assert.deepEqual(
      recurringRes.body.payables.map((payable: { due_date: string; source: string; amount_cents: number }) => ({
        due_date: payable.due_date,
        source: payable.source,
        amount_cents: payable.amount_cents
      })),
      [
        { due_date: '2026-05-15', source: 'recurring_rule', amount_cents: 680000 },
        { due_date: '2026-06-15', source: 'recurring_rule', amount_cents: 680000 }
      ]
    );

    const rulesRes = await request(app)
      .get('/finance/recurring-rules')
      .set(authHeader);
    assert.equal(rulesRes.status, 200);
    assert.equal(rulesRes.body.rules.length, 1);
    assert.equal(rulesRes.body.rules[0].next_due_date, '2026-07-15');

    const reportsRes = await request(app)
      .get('/finance/reports?preset=custom&from=2026-04-01&to=2026-06-30')
      .set(authHeader);
    assert.equal(reportsRes.status, 200);
    assert.equal(reportsRes.body.dre.operating_expenses_cents, 2040000);
    assert.equal(reportsRes.body.dre_by_period.length, 3);

    db.prepare(`
      update financial_payable
      set due_date = ?
      where organization_id = ?
        and id = ?
    `).run('2026-05-20', 'org-holand', templateRes.body.id);
    await request(app)
      .patch(`/finance/recurring-rules/${recurringRes.body.rule.id}`)
      .set(authHeader)
      .send({ materialization_months: 4 })
      .expect(200);

    const payablesAfterWindowRes = await request(app)
      .get('/finance/payables')
      .set(authHeader);
    assert.equal(payablesAfterWindowRes.status, 200);
    assert.equal(
      payablesAfterWindowRes.body.payables.filter((payable: { description: string }) => payable.description === 'Aluguel mensal').length,
      4
    );
    assert.equal(
      payablesAfterWindowRes.body.payables.filter((payable: { due_date: string }) => payable.due_date === '2026-04-15').length,
      0
    );
    assert.ok(payablesAfterWindowRes.body.payables.some((payable: { due_date: string }) => payable.due_date === '2026-07-15'));

    const pausedRes = await request(app)
      .patch(`/finance/recurring-rules/${recurringRes.body.rule.id}`)
      .set(authHeader)
      .send({ status: 'paused' });
    assert.equal(pausedRes.status, 200);
    assert.equal(pausedRes.body.status, 'paused');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance quality inbox detects and corrects incomplete payables', async () => {
  const dbPath = assignTestDbPath('finance-quality-inbox');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceAccountAndCategory();

    createInternalUser({
      username: 'finance.quality',
      display_name: 'Finance Quality',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write', 'finance.reconcile']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.quality', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    const payableRes = await request(app)
      .post('/finance/payables')
      .set(authHeader)
      .send({
        supplier_name: 'Fornecedor sem cadastro',
        description: 'Despesa sem classificação',
        amount_cents: 50000,
        status: 'open',
        issue_date: '2026-04-20',
        due_date: '2026-04-30'
      });
    assert.equal(payableRes.status, 201);

    const inboxRes = await request(app)
      .get('/finance/quality/inbox')
      .set(authHeader);
    assert.equal(inboxRes.status, 200);
    assert.equal(inboxRes.body.summary.critical_count, 1);
    assert.ok(inboxRes.body.issues[0].missing_fields.includes('financial_entity_id'));
    assert.ok(inboxRes.body.issues[0].missing_fields.includes('financial_category_id'));
    assert.ok(inboxRes.body.issues[0].missing_fields.includes('financial_cost_center_id'));

    const costCenterRes = await request(app)
      .post('/finance/catalog/cost-centers')
      .set(authHeader)
      .send({ name: 'Administrativo' });
    assert.equal(costCenterRes.status, 201);

    const correctionRes = await request(app)
      .post('/finance/quality/issues/apply')
      .set(authHeader)
      .send({
        resource_type: 'payable',
        resource_id: payableRes.body.id,
        financial_entity_id: 'entity-holand-supplier',
        financial_category_id: 'financial-category-holand',
        financial_cost_center_id: costCenterRes.body.id,
        financial_account_id: 'financial-account-holand',
        save_as_default: true
      });
    assert.equal(correctionRes.status, 200);
    assert.equal(correctionRes.body.resource_id, payableRes.body.id);
    assert.equal(correctionRes.body.remaining_issue_count, 0);

    const defaultsRes = await request(app)
      .get('/finance/entities/entity-holand-supplier/defaults/payable')
      .set(authHeader);
    assert.equal(defaultsRes.status, 200);
    assert.equal(defaultsRes.body.financial_category_id, 'financial-category-holand');
    assert.equal(defaultsRes.body.financial_cost_center_id, costCenterRes.body.id);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('executive overview supports period filters and KPI series', async () => {
  const dbPath = assignTestDbPath('finance-overview-period-series');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceEntityPartner();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.period',
      display_name: 'Finance Period',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.period', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const authHeader = { Authorization: `Bearer ${loginRes.body.token}` };

    await request(app).post('/finance/transactions').set(authHeader).send({
      financial_entity_id: 'entity-holand-client',
      financial_account_id: 'financial-account-holand',
      financial_category_id: 'financial-category-income',
      kind: 'income',
      status: 'settled',
      amount_cents: 100000,
      issue_date: '2026-04-10',
      competence_date: '2026-04-10',
      settlement_date: '2026-04-10',
      note: 'Receita Abril'
    }).expect(201);

    await request(app).post('/finance/transactions').set(authHeader).send({
      financial_entity_id: 'entity-holand-supplier',
      financial_account_id: 'financial-account-holand',
      financial_category_id: 'financial-category-holand',
      kind: 'expense',
      status: 'open',
      amount_cents: 25000,
      issue_date: '2026-05-10',
      competence_date: '2026-05-10',
      due_date: '2026-05-10',
      note: 'Despesa Maio'
    }).expect(201);

    const overviewRes = await request(app)
      .get('/finance/overview/executive?preset=custom&from=2026-04-01&to=2026-04-30')
      .set(authHeader);

    assert.equal(overviewRes.status, 200);
    const revenueKpi = overviewRes.body.kpis.find((kpi: { id: string }) => kpi.id === 'revenue-month');
    const expenseKpi = overviewRes.body.kpis.find((kpi: { id: string }) => kpi.id === 'expense-month');
    assert.equal(revenueKpi.amount_cents, 100000);
    assert.equal(expenseKpi.amount_cents, 0);
    assert.equal(revenueKpi.scope, 'period');
    assert.equal(revenueKpi.chart_kind, 'sparkline');
    assert.ok(Array.isArray(revenueKpi.series));
    assert.deepEqual(revenueKpi.series, [{ period: '2026-04-10', amount_cents: 100000 }]);
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
      role: 'supremo',
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

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.arap.ops',
      display_name: 'Finance AR/AP Ops',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.arap.ops', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const authHeader = { Authorization: `Bearer ${token}` };

    const operationalDates = {
      overdue: financeOffsetDateKey(-2),
      dueToday: financeOffsetDateKey(0),
      upcoming: financeOffsetDateKey(5),
      settled: financeOffsetDateKey(-1)
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
      role: 'supremo',
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
      role: 'supremo',
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

    const secondStatementRes = await request(app)
      .post('/finance/statement-entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_account_id: accountRes.body.id,
        financial_import_job_id: importJobRes.body.id,
        statement_date: '2026-08-06',
        amount_cents: -13000,
        description: 'Pagamento fornecedor XPTO',
        source: 'bank_import'
      });
    assert.equal(secondStatementRes.status, 201);

    const secondTransactionRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'expense',
        amount_cents: 13000,
        due_date: '2026-08-06',
        note: 'Fornecedor XPTO mensalidade'
      });
    assert.equal(secondTransactionRes.status, 201);

    const secondReconciliationRes = await request(app)
      .post('/finance/reconciliations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_bank_statement_entry_id: secondStatementRes.body.id,
        financial_transaction_id: secondTransactionRes.body.id,
        confidence_score: 0.97,
        match_status: 'matched',
        source: 'manual'
      });
    assert.equal(secondReconciliationRes.status, 201);

    const learnedStatementRes = await request(app)
      .post('/finance/statement-entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_account_id: accountRes.body.id,
        financial_import_job_id: importJobRes.body.id,
        statement_date: '2026-08-07',
        amount_cents: -14000,
        description: 'Pagamento fornecedor XPTO',
        source: 'bank_import'
      });
    assert.equal(learnedStatementRes.status, 201);

    const learnedTransactionRes = await request(app)
      .post('/finance/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'expense',
        amount_cents: 14000,
        due_date: '2026-08-07',
        note: 'Fornecedor XPTO mensalidade'
      });
    assert.equal(learnedTransactionRes.status, 201);

    const inboxRes = await request(app)
      .get('/finance/reconciliation/inbox')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(inboxRes.status, 200, JSON.stringify(inboxRes.body));
    assert.ok(inboxRes.body.learned_rules.length >= 1);
    const learnedEntry = inboxRes.body.inbox.find((entry: { id: string }) => entry.id === learnedStatementRes.body.id);
    assert.ok(learnedEntry, 'entrada nova deve estar na inbox');
    assert.equal(learnedEntry.suggested_matches[0].financial_transaction_id, learnedTransactionRes.body.id);
    assert.equal(learnedEntry.suggested_matches[0].source, 'learned_rule');
    assert.ok(learnedEntry.suggested_matches[0].reasons.some((reason: { label: string }) => reason.label === 'Regra aprendida'));

    const orphanStatementRes = await request(app)
      .post('/finance/statement-entries')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company_id: 'company-a',
        financial_account_id: accountRes.body.id,
        financial_import_job_id: importJobRes.body.id,
        statement_date: '2026-08-08',
        amount_cents: -4500,
        description: 'Tarifa bancaria',
        source: 'bank_import'
      });
    assert.equal(orphanStatementRes.status, 201);

    const statementTransactionRes = await request(app)
      .post(`/finance/reconciliation/statement-entries/${orphanStatementRes.body.id}/transaction`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Tarifa bancaria' });
    assert.equal(statementTransactionRes.status, 201, JSON.stringify(statementTransactionRes.body));
    assert.equal(statementTransactionRes.body.transaction.kind, 'expense');
    assert.equal(statementTransactionRes.body.transaction.status, 'settled');
    assert.equal(statementTransactionRes.body.transaction.amount_cents, 4500);
    assert.equal(statementTransactionRes.body.match.match_status, 'matched');
    assert.equal(statementTransactionRes.body.match.source, 'statement_create');
    assert.equal(statementTransactionRes.body.match.confidence_score, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance advanced controls expose rules, approvals, attachments, exports and integrations', async () => {
  const dbPath = assignTestDbPath('finance-advanced-controls');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.advanced',
      display_name: 'Finance Advanced',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write', 'finance.reconcile', 'finance.approve', 'finance.admin']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.advanced', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;

    const payableRes = await request(app)
      .post('/finance/payables')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Pagamento avançado fornecedor',
        amount_cents: 650000,
        status: 'open',
        due_date: '2026-09-10'
      });
    assert.equal(payableRes.status, 201, JSON.stringify(payableRes.body));

    const initialAdvancedRes = await request(app)
      .get('/finance/advanced')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(initialAdvancedRes.status, 200, JSON.stringify(initialAdvancedRes.body));
    assert.equal(initialAdvancedRes.body.summary.pending_approval_count, 1);
    assert.equal(initialAdvancedRes.body.approval_queue[0].payable_id, payableRes.body.id);
    assert.ok(initialAdvancedRes.body.permission_matrix.some((row: { permission: string; enabled_for_current_user: boolean }) =>
      row.permission === 'finance.approve' && row.enabled_for_current_user
    ));

    const ruleRes = await request(app)
      .post('/finance/advanced/automation-rules')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Exigir aprovação acima de 5 mil',
        trigger_type: 'payable.created',
        conditions: { min_amount_cents: 500000 },
        action_type: 'request_approval',
        action_payload: { queue: 'finance.approval' }
      });
    assert.equal(ruleRes.status, 201, JSON.stringify(ruleRes.body));
    assert.equal(ruleRes.body.is_active, true);

    const attachmentRes = await request(app)
      .post('/finance/advanced/attachments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resource_type: 'payable',
        resource_id: payableRes.body.id,
        file_name: 'comprovante.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: 1024
      });
    assert.equal(attachmentRes.status, 201, JSON.stringify(attachmentRes.body));

    const integrationRes = await request(app)
      .post('/finance/advanced/bank-integrations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        provider: 'Open Finance Sandbox',
        status: 'sandbox',
        account_name: 'Conta teste'
      });
    assert.equal(integrationRes.status, 201, JSON.stringify(integrationRes.body));

    const approveRes = await request(app)
      .post(`/finance/advanced/payables/${payableRes.body.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'Aprovado em teste' });
    assert.equal(approveRes.status, 201, JSON.stringify(approveRes.body));
    assert.equal(approveRes.body.action, 'approve_payment');

    const finalAdvancedRes = await request(app)
      .get('/finance/advanced')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(finalAdvancedRes.status, 200);
    assert.equal(finalAdvancedRes.body.summary.active_rule_count, 1);
    assert.equal(finalAdvancedRes.body.summary.pending_approval_count, 0);
    assert.equal(finalAdvancedRes.body.summary.attachment_count, 1);
    assert.equal(finalAdvancedRes.body.summary.integration_count, 1);
    assert.ok(finalAdvancedRes.body.cockpit, 'esperava cockpit no dashboard avancado');
    assert.equal(finalAdvancedRes.body.cockpit.sections.decisions.label, 'Decisões pendentes');
    assert.ok(finalAdvancedRes.body.automation_rules[0].human_trigger.includes('conta a pagar'));
    assert.ok(finalAdvancedRes.body.automation_rules[0].human_action.includes('aprovação'));
    assert.ok(finalAdvancedRes.body.assisted_rule_templates.some((template: { label: string }) =>
      template.label === 'Pedir aprovação para pagamentos altos'
    ));
    assert.ok(finalAdvancedRes.body.audit_entries.some((entry: { action: string }) => entry.action === 'approve_payment'));

    const csvRes = await request(app)
      .get('/finance/exports?dataset=payables&format=csv')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.text, /Pagamento avançado fornecedor/);

    const pdfRes = await request(app)
      .get('/finance/exports?dataset=audit&format=pdf')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('finance simulations create scenarios, calculate impact and duplicate safely', async () => {
  const dbPath = assignTestDbPath('finance-simulations-core');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.simulation',
      display_name: 'Finance Simulation',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'finance.simulation', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;
    const authHeader = { Authorization: `Bearer ${token}` };

    const scenarioRes = await request(app)
      .post('/finance/simulations')
      .set(authHeader)
      .send({
        name: 'Semana crítica de caixa',
        description: 'Simular entrada, pagamento integral e pagamento parcial.',
        start_date: '2026-10-01',
        end_date: '2026-10-05',
        starting_balance_cents: 100000
      });
    assert.equal(scenarioRes.status, 201, JSON.stringify(scenarioRes.body));
    assert.equal(scenarioRes.body.result.ending_balance_cents, 100000);

    const inflowRes = await request(app)
      .post(`/finance/simulations/${scenarioRes.body.id}/items`)
      .set(authHeader)
      .send({
        kind: 'expected_inflow',
        label: 'Cliente prometeu pagar',
        amount_cents: 80000,
        event_date: '2026-10-02',
        probability_percent: 50
      });
    assert.equal(inflowRes.status, 201, JSON.stringify(inflowRes.body));
    assert.equal(inflowRes.body.result.total_inflow_cents, 40000);
    assert.equal(inflowRes.body.result.ending_balance_cents, 140000);

    const outflowRes = await request(app)
      .post(`/finance/simulations/${scenarioRes.body.id}/items`)
      .set(authHeader)
      .send({
        kind: 'scheduled_outflow',
        label: 'Fornecedor essencial',
        amount_cents: 180000,
        event_date: '2026-10-03',
        note: 'Pagamento que pode quebrar o caixa'
      });
    assert.equal(outflowRes.status, 201, JSON.stringify(outflowRes.body));
    assert.equal(outflowRes.body.result.total_outflow_cents, 180000);
    assert.equal(outflowRes.body.result.ending_balance_cents, -40000);
    assert.equal(outflowRes.body.result.first_negative_date, '2026-10-03');

    const partialRes = await request(app)
      .post(`/finance/simulations/${scenarioRes.body.id}/items`)
      .set(authHeader)
      .send({
        kind: 'partial_payment',
        label: 'Negociar 30% da conta',
        amount_cents: 30000,
        event_date: '2026-10-04'
      });
    assert.equal(partialRes.status, 201, JSON.stringify(partialRes.body));
    assert.equal(partialRes.body.items.length, 3);
    assert.equal(partialRes.body.result.ending_balance_cents, -70000);
    assert.equal(partialRes.body.result.timeline.length, 5);

    const updatedScenarioRes = await request(app)
      .patch(`/finance/simulations/${scenarioRes.body.id}`)
      .set(authHeader)
      .send({ starting_balance_cents: 200000 });
    assert.equal(updatedScenarioRes.status, 200, JSON.stringify(updatedScenarioRes.body));
    assert.equal(updatedScenarioRes.body.result.ending_balance_cents, 30000);

    const updatedItemRes = await request(app)
      .patch(`/finance/simulations/${scenarioRes.body.id}/items/${partialRes.body.items[0].id}`)
      .set(authHeader)
      .send({ event_date: '2026-10-05', probability_percent: 100 });
    assert.equal(updatedItemRes.status, 200, JSON.stringify(updatedItemRes.body));
    assert.equal(updatedItemRes.body.items.find((item: { id: string }) => item.id === partialRes.body.items[0].id).event_date, '2026-10-05');

    const recurringPayableRes = await request(app)
      .post('/finance/payables')
      .set(authHeader)
      .send({
        description: 'Aluguel recorrente',
        amount_cents: 68000,
        status: 'open',
        issue_date: '2026-10-01',
        due_date: '2026-10-02'
      });
    assert.equal(recurringPayableRes.status, 201, JSON.stringify(recurringPayableRes.body));

    const recurringRuleRes = await request(app)
      .post('/finance/recurring-rules/from-resource')
      .set(authHeader)
      .send({
        resource_type: 'payable',
        resource_id: recurringPayableRes.body.id,
        day_of_month: 2,
        start_date: '2026-10-02',
        materialization_months: 3
      });
    assert.equal(recurringRuleRes.status, 201, JSON.stringify(recurringRuleRes.body));

    const sourcesRes = await request(app)
      .get(`/finance/simulations/sources?scenario_id=${scenarioRes.body.id}`)
      .set(authHeader);
    assert.equal(sourcesRes.status, 200, JSON.stringify(sourcesRes.body));
    assert.equal(sourcesRes.body.balance.kind, 'starting_balance');
    assert.ok(Array.isArray(sourcesRes.body.sources));
    assert.ok(sourcesRes.body.sources.some((source: { cadence: string; label: string }) =>
      source.cadence === 'recurring' && source.label === 'Aluguel recorrente'
    ));

    const deleteItemRes = await request(app)
      .delete(`/finance/simulations/${scenarioRes.body.id}/items/${partialRes.body.items[2].id}`)
      .set(authHeader);
    assert.equal(deleteItemRes.status, 200, JSON.stringify(deleteItemRes.body));
    assert.equal(deleteItemRes.body.items.length, 2);

    const listRes = await request(app)
      .get('/finance/simulations')
      .set(authHeader);
    assert.equal(listRes.status, 200, JSON.stringify(listRes.body));
    assert.equal(listRes.body.scenarios.length, 1);
    assert.equal(listRes.body.scenarios[0].result.item_count, 2);

    const duplicateRes = await request(app)
      .post(`/finance/simulations/${scenarioRes.body.id}/duplicate`)
      .set(authHeader);
    assert.equal(duplicateRes.status, 201, JSON.stringify(duplicateRes.body));
    assert.notEqual(duplicateRes.body.id, scenarioRes.body.id);
    assert.equal(duplicateRes.body.items.length, 2);

    const deleteScenarioRes = await request(app)
      .delete(`/finance/simulations/${duplicateRes.body.id}`)
      .set(authHeader);
    assert.equal(deleteScenarioRes.status, 200, JSON.stringify(deleteScenarioRes.body));
    assert.equal(deleteScenarioRes.body.ok, true);
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
      role: 'supremo',
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
    const currentMonthRange = currentFinanceMonthRange();
    const currentMonthStart = new Date(`${currentMonthRange.start}T00:00:00.000Z`);
    const formatDate = (year: number, monthIndex: number, day: number) => (
      `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );
    const currentYear = currentMonthStart.getUTCFullYear();
    const currentMonth = currentMonthStart.getUTCMonth();
    const nextMonthDate = new Date(Date.UTC(currentYear, currentMonth + 1, 5));
    const currentPeriod = formatDate(currentYear, currentMonth, 1).slice(0, 7);
    const nextPeriod = nextMonthDate.toISOString().slice(0, 7);
    const yesterdayIso = financeOffsetDateKey(-1);

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
      role: 'supremo',
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
        }),
      request(app)
        .post('/finance/transactions')
        .set(authHeader)
        .send({
          financial_entity_id: 'entity-holand-supplier',
          financial_account_id: 'financial-account-holand',
          financial_category_id: 'financial-category-holand',
          kind: 'expense',
          status: 'open',
          amount_cents: 5000,
          issue_date: formatDate(currentYear, currentMonth, 20),
          competence_date: formatDate(currentYear, currentMonth, 20),
          due_date: nextMonthDate.toISOString().slice(0, 10),
          note: 'Despesa provisionada por competência'
        })
    ]);

    createdTransactions.forEach((response) => assert.equal(response.status, 201));

    const balanceAdjustmentRes = await request(app)
      .post('/finance/accounts/financial-account-holand/balance-adjustments')
      .set(authHeader)
      .send({
        amount_cents: 250000,
        settlement_date: formatDate(currentYear, currentMonth, 2),
        note: 'Saldo inicial da conta'
      });

    assert.equal(balanceAdjustmentRes.status, 201);
    assert.equal(balanceAdjustmentRes.body.kind, 'adjustment');
    assert.equal(balanceAdjustmentRes.body.views.cash_amount_cents, 250000);

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
    assert.equal(reportsRes.body.dre.operating_expenses_cents, 45000);
    assert.equal(reportsRes.body.dre.operating_result_cents, 85000);
    assert.equal(reportsRes.body.dre_cash.gross_revenue_cents, 100000);
    assert.equal(reportsRes.body.dre_cash.operating_expenses_cents, 40000);
    assert.equal(reportsRes.body.dre_cash.operating_result_cents, 60000);

    assert.equal(reportsRes.body.income_by_category[0].category_name, 'Receita de Serviços');
    assert.equal(reportsRes.body.income_by_category[0].amount_cents, 130000);
    assert.equal(reportsRes.body.income_by_category[0].transaction_count, 2);
    assert.equal(reportsRes.body.expense_by_category[0].category_name, 'Despesas Operacionais');
    assert.equal(reportsRes.body.expense_by_category[0].amount_cents, 45000);
    assert.equal(reportsRes.body.expense_by_category[0].transaction_count, 2);
    assert.equal(reportsRes.body.dre_by_period[0].period, currentPeriod);
    assert.equal(reportsRes.body.dre_by_period[0].net_revenue_cents, 100000);
    assert.equal(reportsRes.body.dre_by_period[0].operating_expenses_cents, 45000);
    assert.equal(reportsRes.body.dre_by_period[0].operating_result_cents, 55000);
    assert.equal(reportsRes.body.dre_cash_by_period[0].period, currentPeriod);
    assert.equal(reportsRes.body.dre_cash_by_period[0].net_revenue_cents, 100000);
    assert.equal(reportsRes.body.dre_cash_by_period[0].operating_expenses_cents, 40000);
    assert.equal(reportsRes.body.dre_cash_by_period[0].operating_result_cents, 60000);
    assert.equal(reportsRes.body.cost_center_results[0].cost_center_name, 'Sem centro de custo');
    assert.equal(reportsRes.body.cost_center_results[0].result_cents, 85000);
    assert.equal(reportsRes.body.cashflow_by_due[0].period, nextPeriod);
    assert.equal(reportsRes.body.cashflow_by_due[0].net_cents, 25000);
    assert.equal(reportsRes.body.cashflow_by_settlement[0].period, currentPeriod);
    assert.equal(reportsRes.body.cashflow_by_settlement[0].net_cents, 60000);

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
        projected_cents: 25000,
        variance_cents: -25000
      }
    ]);
    assert.ok(reportsRes.body.consolidated_cashflow.length >= 1);

    const overviewRes = await request(app)
      .get('/finance/overview')
      .set(authHeader);

    assert.equal(overviewRes.status, 200);
    assert.equal(overviewRes.body.totals.cash_cents, 310000);

    const filteredReportsRes = await request(app)
      .get(`/finance/reports?preset=custom&from=${formatDate(currentYear, currentMonth, 1)}&to=${formatDate(currentYear, currentMonth, 28)}`)
      .set(authHeader);

    assert.equal(filteredReportsRes.status, 200);
    assert.equal(filteredReportsRes.body.dre.gross_revenue_cents, 100000);
    assert.equal(filteredReportsRes.body.dre.operating_expenses_cents, 45000);
    assert.equal(filteredReportsRes.body.dre.operating_result_cents, 55000);
    assert.equal(filteredReportsRes.body.dre_cash.gross_revenue_cents, 100000);
    assert.equal(filteredReportsRes.body.dre_cash.operating_expenses_cents, 40000);
    assert.equal(filteredReportsRes.body.dre_cash.operating_result_cents, 60000);
    assert.equal(filteredReportsRes.body.income_by_category[0].transaction_count, 1);

    const executiveRes = await request(app)
      .get('/finance/overview/executive')
      .set(authHeader);

    assert.equal(executiveRes.status, 200);
    assert.equal(executiveRes.body.summary.monthly_income_cents, 100000);
    assert.equal(executiveRes.body.summary.monthly_expense_cents, 45000);
    assert.equal(executiveRes.body.summary.projected_result_cents, 55000);
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
      role: 'supremo',
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
      role: 'supremo',
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
