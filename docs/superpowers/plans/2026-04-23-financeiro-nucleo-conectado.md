# Financeiro Núcleo Conectado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Financeiro Fase 1 "Núcleo Conectado": smart entity profiles, assisted payables/receivables, quality review inbox, compact filters, and real KPI mini-series.

**Architecture:** Add the missing finance dimensions at the domain layer first, then expose small API contracts for entity defaults and quality issues. The frontend should preserve the current premium visual language while wiring payables, receivables, overview, and Conciliação & Revisão into those contracts.

**Tech Stack:** TypeScript, Express, Zod, better-sqlite3, React, Vite, Vitest, Testing Library, Playwright. Use Node 22 commands: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" ...`.

---

## Current Context

The existing module already has:

- Backend tables: `financial_entity`, `financial_account`, `financial_category`, `financial_cost_center`, `financial_payment_method`, `financial_transaction`, `financial_payable`, `financial_receivable`.
- Backend routes for entities, accounts, categories, cost centers, payment methods, payables, receivables, transactions, overview, reports, and reconciliation.
- Frontend pages for Cadastros, Contas a Pagar, Contas a Receber, Movimentações, Visão Geral, Relatórios, Fluxo de Caixa, and Conciliação.
- Existing financial tests in `apps/backend/src/finance/finance.test.ts` and frontend tests under `apps/frontend/src/finance/__tests__`.

Important execution note:

- The workspace may already be dirty. Do not revert unrelated changes.
- Run backend/frontend commands with Node 22:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage FinancePayablesPage FinanceReceivablesPage FinanceReconciliationPage FinanceOverviewPage
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

## File Structure

### Backend

- Modify `apps/backend/src/db.ts`
  - Add migration-safe columns for cost center and payment method on transactions, payables, and receivables.
  - Add tables for operational tags and entity default profiles.
  - Add indexes and seed suggested tags.

- Modify `apps/backend/src/finance/types.ts`
  - Add DTOs and inputs for operational tags, entity profiles, quality issues, period filters, and KPI series.
  - Extend transaction/payable/receivable DTOs with cost center and payment method fields.

- Modify `apps/backend/src/finance/entities.ts`
  - Map entity tags.
  - Create/list tags.
  - Save/list entity default profiles.
  - Resolve defaults for an entity/context.

- Create `apps/backend/src/finance/quality.ts`
  - Compute quality issues across payables, receivables, and transactions.
  - Apply corrections.
  - Optionally save correction as an entity default profile.

- Modify `apps/backend/src/finance/service.ts`
  - Read/write cost center and payment method fields.
  - Join names for DTOs.
  - Use entity defaults during payable/receivable creation when fields are missing.

- Modify `apps/backend/src/finance/context.ts`
  - Accept a period filter for executive overview.
  - Return card series for mini-graphs.
  - Include quality issue counts in summary/queue.

- Modify `apps/backend/src/finance/routes.ts`
  - Add schemas and routes for tags/defaults/quality.
  - Extend payables/receivables/transactions schemas.
  - Add overview period query parsing.

- Modify `apps/backend/src/finance/finance.test.ts`
  - Add backend coverage task-by-task.

### Frontend

- Modify `apps/frontend/src/finance/api.ts`
  - Add new types and API methods.
  - Extend DTOs/payloads with cost center/payment method/default profile/quality fields.

- Create `apps/frontend/src/finance/hooks/useFinancePeriod.ts`
  - Global/local period state helpers backed by URL/search params or local state.

- Create `apps/frontend/src/finance/components/FinancePeriodFilter.tsx`
  - Compact period control with custom range support.

- Create `apps/frontend/src/finance/components/FinanceEntityCombobox.tsx`
  - Entity search/select with "new entity" confirmation state.

- Create `apps/frontend/src/finance/components/FinanceQualityBadge.tsx`
  - Small severity badge for cards/lists.

- Create `apps/frontend/src/finance/components/FinanceMiniChart.tsx`
  - Sparkline, bars, and progress mini-chart variants.

- Modify `apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx`
  - Add smart entity profile UI.
  - Add tags and default profiles by context.

- Modify `apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
  - Use entity combobox and defaults.
  - Add cost center/payment method fields.
  - Show incomplete warning.
  - Add compact filters.

- Modify `apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
  - Mirror the payable workflow for receivables.

- Modify `apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
  - Rename product text to Conciliação & Revisão.
  - Add quality inbox tab.
  - Add side review panel.

- Modify `apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
  - Add period filter.
  - Render mini-charts from backend series.
  - Show quality issue summary.

- Modify `apps/frontend/src/finance/components/FinanceSidebar.tsx`
  - Rename nav item to `Conciliação & Revisão`.

- Modify frontend tests:
  - `apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx`
  - `apps/frontend/src/finance/__tests__/FinancePayablesPage.test.tsx`
  - `apps/frontend/src/finance/__tests__/FinanceReceivablesPage.test.tsx`
  - `apps/frontend/src/finance/__tests__/FinanceReconciliationPage.test.tsx`
  - `apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`

---

### Task 1: Schema and Domain Types

**Files:**
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing schema/type coverage**

Add a backend test near the existing finance schema tests in `apps/backend/src/finance/finance.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance-connected-core-schema
```

Expected: FAIL because the new columns/tables do not exist.

- [ ] **Step 3: Add schema changes**

In `apps/backend/src/db.ts`, add create-table blocks inside the finance schema setup:

```sql
create table if not exists financial_entity_tag (
  id text primary key,
  organization_id text not null,
  name text not null,
  normalized_name text not null,
  is_system integer not null default 0,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null,
  unique(organization_id, normalized_name),
  unique(organization_id, id),
  foreign key(organization_id) references organization(id) on delete cascade
);

create table if not exists financial_entity_tag_map (
  organization_id text not null,
  financial_entity_id text not null,
  financial_entity_tag_id text not null,
  created_at text not null,
  primary key(organization_id, financial_entity_id, financial_entity_tag_id),
  foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete cascade,
  foreign key(organization_id, financial_entity_tag_id) references financial_entity_tag(organization_id, id) on delete cascade
);

create table if not exists financial_entity_default_profile (
  id text primary key,
  organization_id text not null,
  financial_entity_id text not null,
  context text not null check(context in ('payable', 'receivable', 'transaction')),
  financial_category_id text,
  financial_cost_center_id text,
  financial_account_id text,
  financial_payment_method_id text,
  due_rule text,
  competence_rule text,
  recurrence_rule text,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null,
  unique(organization_id, financial_entity_id, context),
  foreign key(organization_id, financial_entity_id) references financial_entity(organization_id, id) on delete cascade,
  foreign key(organization_id, financial_category_id) references financial_category(organization_id, id) on delete restrict,
  foreign key(organization_id, financial_cost_center_id) references financial_cost_center(organization_id, id) on delete restrict,
  foreign key(organization_id, financial_account_id) references financial_account(organization_id, id) on delete restrict,
  foreign key(organization_id, financial_payment_method_id) references financial_payment_method(organization_id, id) on delete restrict
);
```

Add migration columns with the existing `ensureColumn` pattern:

```ts
ensureColumn('financial_transaction', 'financial_cost_center_id', 'financial_cost_center_id text');
ensureColumn('financial_transaction', 'financial_payment_method_id', 'financial_payment_method_id text');
ensureColumn('financial_payable', 'financial_cost_center_id', 'financial_cost_center_id text');
ensureColumn('financial_payable', 'financial_payment_method_id', 'financial_payment_method_id text');
ensureColumn('financial_receivable', 'financial_cost_center_id', 'financial_cost_center_id text');
ensureColumn('financial_receivable', 'financial_payment_method_id', 'financial_payment_method_id text');
```

Add indexes:

```sql
create index if not exists idx_financial_entity_tag_org_active
  on financial_entity_tag(organization_id, is_active, normalized_name);
create index if not exists idx_financial_entity_tag_map_entity
  on financial_entity_tag_map(organization_id, financial_entity_id);
create index if not exists idx_financial_entity_default_profile_entity_context
  on financial_entity_default_profile(organization_id, financial_entity_id, context, is_active);
create index if not exists idx_financial_transaction_org_cost_center
  on financial_transaction(organization_id, financial_cost_center_id);
create index if not exists idx_financial_payable_org_cost_center
  on financial_payable(organization_id, financial_cost_center_id);
create index if not exists idx_financial_receivable_org_cost_center
  on financial_receivable(organization_id, financial_cost_center_id);
```

Seed suggested tags near the finance seed:

```ts
const insertEntityTag = db.prepare(`
  insert or ignore into financial_entity_tag (
    id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
  ) values (?, ?, ?, ?, 1, 1, ?, ?)
`);

[
  ['fetag-funcionario', 'Funcionário'],
  ['fetag-banco', 'Banco'],
  ['fetag-imposto', 'Imposto'],
  ['fetag-software', 'Software'],
  ['fetag-aluguel', 'Aluguel'],
  ['fetag-prestador', 'Prestador'],
  ['fetag-cliente-recorrente', 'Cliente recorrente'],
  ['fetag-fornecedor-critico', 'Fornecedor crítico'],
  ['fetag-comissao', 'Comissão'],
  ['fetag-marketing', 'Marketing'],
  ['fetag-juridico', 'Jurídico']
].forEach(([id, name]) => {
  insertEntityTag.run(id, organizationId, name, normalizeFinanceText(name), createdAt, createdAt);
});
```

If `normalizeFinanceText` does not exist in `db.ts`, add:

```ts
function normalizeFinanceText(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
```

- [ ] **Step 4: Extend backend types**

In `apps/backend/src/finance/types.ts`, add:

```ts
export type FinanceEntityDefaultContext = 'payable' | 'receivable' | 'transaction';

export type FinanceEntityTagDto = {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceEntityWithTagsDto = FinanceEntityDto & {
  tags: FinanceEntityTagDto[];
};

export type FinanceEntityDefaultProfileDto = {
  id: string;
  organization_id: string;
  financial_entity_id: string;
  context: FinanceEntityDefaultContext;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  due_rule: string | null;
  competence_rule: string | null;
  recurrence_rule: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinanceEntityTagInput = {
  organization_id: string;
  name: string;
  is_active?: boolean;
};

export type UpsertFinanceEntityDefaultProfileInput = {
  organization_id: string;
  financial_entity_id: string;
  context: FinanceEntityDefaultContext;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  due_rule?: string | null;
  competence_rule?: string | null;
  recurrence_rule?: string | null;
  is_active?: boolean;
};

export type SetFinanceEntityTagsInput = {
  organization_id: string;
  financial_entity_id: string;
  tag_ids: string[];
};
```

Extend `FinanceTransactionRow`, `FinanceTransactionDto`, `FinancePayableDto`, `FinanceReceivableDto`, `CreateFinancePayableInput`, and `CreateFinanceReceivableInput` with:

```ts
financial_cost_center_id: string | null;
financial_cost_center_name: string | null;
financial_payment_method_id: string | null;
financial_payment_method_name: string | null;
```

For create input fields, use optional nullable:

```ts
financial_cost_center_id?: string | null;
financial_payment_method_id?: string | null;
```

- [ ] **Step 5: Run schema test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance-connected-core-schema
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/finance/types.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat: add connected finance schema"
```

---

### Task 2: Entity Tags and Default Profiles API

**Files:**
- Modify: `apps/backend/src/finance/entities.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing API test**

Add test:

```ts
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
      role: 'custom',
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "entity tags and default profiles"
```

Expected: FAIL with 404 for new routes.

- [ ] **Step 3: Implement entity tag helpers**

In `apps/backend/src/finance/entities.ts`, add:

```ts
function normalizeEntityTagName(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mapEntityTagRow(row: {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  is_system: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceEntityTagDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    normalized_name: row.normalized_name,
    is_system: Number(row.is_system) === 1,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceEntityTags(organizationId: string): FinanceEntityTagDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const rows = db.prepare(`
    select id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    from financial_entity_tag
    where organization_id = ?
    order by is_active desc, name collate nocase asc
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    normalized_name: string;
    is_system: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map(mapEntityTagRow);
}

export function createFinanceEntityTag(input: CreateFinanceEntityTagInput): FinanceEntityTagDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const name = input.name.trim();
  const normalizedName = normalizeEntityTagName(name);
  const nowIso = new Date().toISOString();
  const id = uuid('fetag');

  db.prepare(`
    insert or ignore into financial_entity_tag (
      id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, normalizedOrganizationId, name, normalizedName, input.is_active === false ? 0 : 1, nowIso, nowIso);

  const created = db.prepare(`
    select id, organization_id, name, normalized_name, is_system, is_active, created_at, updated_at
    from financial_entity_tag
    where organization_id = ? and normalized_name = ?
    limit 1
  `).get(normalizedOrganizationId, normalizedName) as {
    id: string;
    organization_id: string;
    name: string;
    normalized_name: string;
    is_system: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar classificação da entidade.');
  }

  return mapEntityTagRow(created);
}

function listTagsForEntity(organizationId: string, entityId: string): FinanceEntityTagDto[] {
  const rows = db.prepare(`
    select
      fet.id,
      fet.organization_id,
      fet.name,
      fet.normalized_name,
      fet.is_system,
      fet.is_active,
      fet.created_at,
      fet.updated_at
    from financial_entity_tag_map fetm
    inner join financial_entity_tag fet
      on fet.organization_id = fetm.organization_id
     and fet.id = fetm.financial_entity_tag_id
    where fetm.organization_id = ?
      and fetm.financial_entity_id = ?
    order by fet.name collate nocase asc
  `).all(organizationId, entityId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    normalized_name: string;
    is_system: number;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapEntityTagRow);
}

export function setFinanceEntityTags(input: SetFinanceEntityTagsInput): FinanceEntityWithTagsDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const entity = db.prepare(`
    select id, organization_id, legal_name, trade_name, document_number, kind, email, phone, is_active, created_at, updated_at
    from financial_entity
    where organization_id = ? and id = ?
    limit 1
  `).get(normalizedOrganizationId, input.financial_entity_id) as Parameters<typeof mapEntityRow>[0] | undefined;

  if (!entity) {
    throw new Error('Entidade financeira não encontrada.');
  }

  const validTagRows = input.tag_ids.length === 0
    ? []
    : db.prepare(`
      select id from financial_entity_tag
      where organization_id = ?
        and id in (${input.tag_ids.map(() => '?').join(', ')})
        and is_active = 1
    `).all(normalizedOrganizationId, ...input.tag_ids) as Array<{ id: string }>;

  if (validTagRows.length !== input.tag_ids.length) {
    throw new Error('Uma ou mais classificações são inválidas.');
  }

  const nowIso = new Date().toISOString();
  const replaceTags = db.transaction(() => {
    db.prepare(`
      delete from financial_entity_tag_map
      where organization_id = ? and financial_entity_id = ?
    `).run(normalizedOrganizationId, input.financial_entity_id);

    const insert = db.prepare(`
      insert into financial_entity_tag_map (
        organization_id, financial_entity_id, financial_entity_tag_id, created_at
      ) values (?, ?, ?, ?)
    `);

    input.tag_ids.forEach((tagId) => {
      insert.run(normalizedOrganizationId, input.financial_entity_id, tagId, nowIso);
    });
  });

  replaceTags();

  return {
    ...mapEntityRow(entity),
    tags: listTagsForEntity(normalizedOrganizationId, input.financial_entity_id)
  };
}
```

- [ ] **Step 4: Implement default profile helpers**

In `apps/backend/src/finance/entities.ts`, add:

```ts
function mapEntityDefaultProfileRow(row: {
  id: string;
  organization_id: string;
  financial_entity_id: string;
  context: string;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  due_rule: string | null;
  competence_rule: string | null;
  recurrence_rule: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceEntityDefaultProfileDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    financial_entity_id: row.financial_entity_id,
    context: row.context as FinanceEntityDefaultContext,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    financial_cost_center_id: row.financial_cost_center_id,
    financial_cost_center_name: row.financial_cost_center_name,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_payment_method_id: row.financial_payment_method_id,
    financial_payment_method_name: row.financial_payment_method_name,
    due_rule: row.due_rule,
    competence_rule: row.competence_rule,
    recurrence_rule: row.recurrence_rule,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function readDefaultProfile(organizationId: string, entityId: string, context: FinanceEntityDefaultContext) {
  return db.prepare(`
    select
      fdp.id,
      fdp.organization_id,
      fdp.financial_entity_id,
      fdp.context,
      fdp.financial_category_id,
      fc.name as financial_category_name,
      fdp.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      fdp.financial_account_id,
      fa.name as financial_account_name,
      fdp.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      fdp.due_rule,
      fdp.competence_rule,
      fdp.recurrence_rule,
      fdp.is_active,
      fdp.created_at,
      fdp.updated_at
    from financial_entity_default_profile fdp
    left join financial_category fc
      on fc.organization_id = fdp.organization_id and fc.id = fdp.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = fdp.organization_id and fcc.id = fdp.financial_cost_center_id
    left join financial_account fa
      on fa.organization_id = fdp.organization_id and fa.id = fdp.financial_account_id
    left join financial_payment_method fpm
      on fpm.organization_id = fdp.organization_id and fpm.id = fdp.financial_payment_method_id
    where fdp.organization_id = ?
      and fdp.financial_entity_id = ?
      and fdp.context = ?
      and fdp.is_active = 1
    limit 1
  `).get(organizationId, entityId, context) as Parameters<typeof mapEntityDefaultProfileRow>[0] | undefined;
}

export function getFinanceEntityDefaultProfile(
  organizationId: string,
  entityId: string,
  context: FinanceEntityDefaultContext
): FinanceEntityDefaultProfileDto | null {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const row = readDefaultProfile(normalizedOrganizationId, entityId, context);
  return row ? mapEntityDefaultProfileRow(row) : null;
}

export function upsertFinanceEntityDefaultProfile(
  input: UpsertFinanceEntityDefaultProfileInput
): FinanceEntityDefaultProfileDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const nowIso = new Date().toISOString();
  const existing = readDefaultProfile(normalizedOrganizationId, input.financial_entity_id, input.context);

  if (existing) {
    db.prepare(`
      update financial_entity_default_profile
      set financial_category_id = ?,
          financial_cost_center_id = ?,
          financial_account_id = ?,
          financial_payment_method_id = ?,
          due_rule = ?,
          competence_rule = ?,
          recurrence_rule = ?,
          is_active = ?,
          updated_at = ?
      where id = ? and organization_id = ?
    `).run(
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_rule?.trim() || null,
      input.competence_rule?.trim() || null,
      input.recurrence_rule?.trim() || null,
      input.is_active === false ? 0 : 1,
      nowIso,
      existing.id,
      normalizedOrganizationId
    );
  } else {
    db.prepare(`
      insert into financial_entity_default_profile (
        id, organization_id, financial_entity_id, context, financial_category_id,
        financial_cost_center_id, financial_account_id, financial_payment_method_id,
        due_rule, competence_rule, recurrence_rule, is_active, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid('fedp'),
      normalizedOrganizationId,
      input.financial_entity_id,
      input.context,
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_rule?.trim() || null,
      input.competence_rule?.trim() || null,
      input.recurrence_rule?.trim() || null,
      input.is_active === false ? 0 : 1,
      nowIso,
      nowIso
    );
  }

  const created = readDefaultProfile(normalizedOrganizationId, input.financial_entity_id, input.context);
  if (!created) {
    throw new Error('Falha ao salvar perfil padrão da entidade.');
  }
  return mapEntityDefaultProfileRow(created);
}
```

- [ ] **Step 5: Add routes and schemas**

In `apps/backend/src/finance/routes.ts`, import:

```ts
import {
  createFinanceEntity,
  createFinanceEntityTag,
  getFinanceEntityDefaultProfile,
  listFinanceEntities,
  listFinanceEntityTags,
  setFinanceEntityTags,
  upsertFinanceEntityDefaultProfile
} from './entities.js';
```

Add values/schemas:

```ts
const financeEntityDefaultContextValues = ['payable', 'receivable', 'transaction'] as const;

const entityTagCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  is_active: z.boolean().optional()
});

const entityDefaultProfileSchema = z.object({
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  due_rule: z.string().trim().max(80).nullable().optional(),
  competence_rule: z.string().trim().max(80).nullable().optional(),
  recurrence_rule: z.string().trim().max(80).nullable().optional(),
  is_active: z.boolean().optional()
});

const entityTagsSetSchema = z.object({
  tag_ids: z.array(z.string().trim().min(1)).max(20)
});
```

Add routes near `/finance/entities`:

```ts
router.get('/entities/tags', requireFinancePermission(['finance.read']), (_req, res) => {
  try {
    return res.json(listFinanceEntityTags(readFinanceOrganizationId(res)));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});

router.post('/entities/tags', requireFinancePermission(['finance.write']), (req, res) => {
  const parsed = entityTagCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    return res.status(201).json(createFinanceEntityTag({
      ...parsed.data,
      organization_id: readFinanceOrganizationId(res)
    }));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});

router.put('/entities/:entityId/tags', requireFinancePermission(['finance.write']), (req, res) => {
  const parsed = entityTagsSetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    return res.json(setFinanceEntityTags({
      organization_id: readFinanceOrganizationId(res),
      financial_entity_id: req.params.entityId,
      tag_ids: parsed.data.tag_ids
    }));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});

router.get('/entities/:entityId/defaults/:context', requireFinancePermission(['finance.read']), (req, res) => {
  const context = z.enum(financeEntityDefaultContextValues).safeParse(req.params.context);
  if (!context.success) {
    return res.status(400).json(context.error.flatten());
  }

  try {
    const profile = getFinanceEntityDefaultProfile(readFinanceOrganizationId(res), req.params.entityId, context.data);
    return res.json(profile);
  } catch (error) {
    return respondFinanceError(res, error);
  }
});

router.put('/entities/:entityId/defaults/:context', requireFinancePermission(['finance.write']), (req, res) => {
  const context = z.enum(financeEntityDefaultContextValues).safeParse(req.params.context);
  const parsed = entityDefaultProfileSchema.safeParse(req.body);
  if (!context.success) {
    return res.status(400).json(context.error.flatten());
  }
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    return res.json(upsertFinanceEntityDefaultProfile({
      ...parsed.data,
      organization_id: readFinanceOrganizationId(res),
      financial_entity_id: req.params.entityId,
      context: context.data
    }));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});
```

- [ ] **Step 6: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "entity tags and default profiles"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/finance/entities.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat: add finance entity defaults api"
```

---

### Task 3: Persist Cost Center and Payment Method on Ledger Rows

**Files:**
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing test**

Add:

```ts
test('payables and receivables persist cost center and payment method dimensions', async () => {
  const dbPath = assignTestDbPath('finance-ledger-extra-dimensions');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.dimensions',
      display_name: 'Finance Dimensions',
      password: 'Senha#123',
      role: 'custom',
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "extra dimensions"
```

Expected: FAIL because route schemas and service mappings do not include the fields.

- [ ] **Step 3: Extend route schemas**

In `apps/backend/src/finance/routes.ts`, add to `payableCreateSchema`, `receivableCreateSchema`, and transaction create/update schemas:

```ts
financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
```

- [ ] **Step 4: Extend service SELECTs and mappers**

In `apps/backend/src/finance/service.ts`, update SELECTs for transactions, payables, and receivables to include:

```sql
fp.financial_cost_center_id,
fcc.name as financial_cost_center_name,
fp.financial_payment_method_id,
fpm.name as financial_payment_method_name
```

Use aliases matching each table alias:

- payable alias: `fp`;
- receivable alias: `fr`;
- transaction alias: `ft`.

Add joins:

```sql
left join financial_cost_center fcc
  on fcc.organization_id = fp.organization_id
 and fcc.id = fp.financial_cost_center_id
left join financial_payment_method fpm
  on fpm.organization_id = fp.organization_id
 and fpm.id = fp.financial_payment_method_id
```

For transactions, use `ft`; for receivables, use `fr`.

In `mapPayableRow`, `mapReceivableRow`, and `mapTransactionRow`, return:

```ts
financial_cost_center_id: row.financial_cost_center_id,
financial_cost_center_name: row.financial_cost_center_name ?? null,
financial_payment_method_id: row.financial_payment_method_id,
financial_payment_method_name: row.financial_payment_method_name ?? null,
```

- [ ] **Step 5: Extend INSERTs**

In `createFinancePayable`, include `financial_cost_center_id` and `financial_payment_method_id` in the INSERT column list and values.

Use:

```ts
input.financial_cost_center_id ?? null,
input.financial_payment_method_id ?? null,
```

Do the same in `createFinanceReceivable` and `createFinanceTransaction`.

When a payable/receivable creates its linked transaction, pass the same cost center and payment method into `createFinanceTransaction`.

- [ ] **Step 6: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "extra dimensions"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/finance/service.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat: persist finance cost and payment dimensions"
```

---

### Task 4: Apply Entity Defaults During Payable and Receivable Creation

**Files:**
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing test**

Add:

```ts
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
      role: 'custom',
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "apply entity defaults"
```

Expected: FAIL because create flow does not apply defaults.

- [ ] **Step 3: Import default profile resolver**

In `apps/backend/src/finance/service.ts`, import:

```ts
import { getFinanceEntityDefaultProfile } from './entities.js';
```

- [ ] **Step 4: Add helper to merge defaults**

In `apps/backend/src/finance/service.ts`, add:

```ts
function applyEntityDefaultsToPayable(input: CreateFinancePayableInput): CreateFinancePayableInput {
  if (!input.financial_entity_id) return input;
  const defaults = getFinanceEntityDefaultProfile(input.organization_id, input.financial_entity_id, 'payable');
  if (!defaults) return input;

  return {
    ...input,
    financial_category_id: input.financial_category_id ?? defaults.financial_category_id,
    financial_cost_center_id: input.financial_cost_center_id ?? defaults.financial_cost_center_id,
    financial_account_id: input.financial_account_id ?? defaults.financial_account_id,
    financial_payment_method_id: input.financial_payment_method_id ?? defaults.financial_payment_method_id
  };
}

function applyEntityDefaultsToReceivable(input: CreateFinanceReceivableInput): CreateFinanceReceivableInput {
  if (!input.financial_entity_id) return input;
  const defaults = getFinanceEntityDefaultProfile(input.organization_id, input.financial_entity_id, 'receivable');
  if (!defaults) return input;

  return {
    ...input,
    financial_category_id: input.financial_category_id ?? defaults.financial_category_id,
    financial_cost_center_id: input.financial_cost_center_id ?? defaults.financial_cost_center_id,
    financial_account_id: input.financial_account_id ?? defaults.financial_account_id,
    financial_payment_method_id: input.financial_payment_method_id ?? defaults.financial_payment_method_id
  };
}
```

At the top of `createFinancePayable`, replace direct input usage:

```ts
const payload = applyEntityDefaultsToPayable(input);
```

Then use `payload` for all persisted fields.

At the top of `createFinanceReceivable`:

```ts
const payload = applyEntityDefaultsToReceivable(input);
```

Then use `payload`.

- [ ] **Step 5: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "apply entity defaults"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/finance/service.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat: apply finance entity defaults"
```

---

### Task 5: Quality Issue Service and API

**Files:**
- Create: `apps/backend/src/finance/quality.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add types**

In `apps/backend/src/finance/types.ts`, add:

```ts
export type FinanceQualitySeverity = 'critical' | 'warning' | 'suggestion';
export type FinanceQualityResourceType = 'payable' | 'receivable' | 'transaction';

export type FinanceQualityIssueDto = {
  id: string;
  organization_id: string;
  resource_type: FinanceQualityResourceType;
  resource_id: string;
  severity: FinanceQualitySeverity;
  missing_fields: string[];
  title: string;
  detail: string;
  amount_cents: number;
  reference_date: string | null;
  entity_name: string | null;
  suggestions: Array<{
    field: string;
    value: string;
    label: string;
    confidence: number;
  }>;
};

export type FinanceQualityInboxDto = {
  organization_id: string;
  generated_at: string;
  summary: {
    total_count: number;
    critical_count: number;
    warning_count: number;
    suggestion_count: number;
  };
  issues: FinanceQualityIssueDto[];
};

export type ApplyFinanceQualityCorrectionInput = {
  organization_id: string;
  resource_type: FinanceQualityResourceType;
  resource_id: string;
  financial_entity_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  due_date?: string | null;
  competence_date?: string | null;
  save_as_default?: boolean;
};
```

- [ ] **Step 2: Write failing test**

Add:

```ts
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
      role: 'custom',
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "quality inbox"
```

Expected: FAIL because quality routes do not exist.

- [ ] **Step 4: Implement `quality.ts`**

Create `apps/backend/src/finance/quality.ts`:

```ts
import { db } from '../db.js';
import { upsertFinanceEntityDefaultProfile } from './entities.js';
import type {
  ApplyFinanceQualityCorrectionInput,
  FinanceQualityInboxDto,
  FinanceQualityIssueDto,
  FinanceQualityResourceType
} from './types.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';

function resolveOrganizationId(organizationId?: string | null) {
  const normalized = organizationId?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_ORGANIZATION_ID;
}

function readOrganizationRow(organizationId: string) {
  const row = db.prepare('select id, name from organization where id = ? limit 1').get(organizationId);
  if (!row) throw new Error('Organização não encontrada.');
}

function severityForMissingFields(missingFields: string[]) {
  const criticalFields = ['financial_entity_id', 'financial_category_id', 'financial_cost_center_id'];
  if (missingFields.some((field) => criticalFields.includes(field))) {
    return 'critical' as const;
  }
  return 'warning' as const;
}

function buildIssue(params: {
  organization_id: string;
  resource_type: FinanceQualityResourceType;
  resource_id: string;
  description: string;
  amount_cents: number;
  reference_date: string | null;
  entity_name: string | null;
  financial_entity_id: string | null;
  financial_category_id: string | null;
  financial_cost_center_id: string | null;
  financial_account_id: string | null;
  financial_payment_method_id: string | null;
  due_date: string | null;
  competence_date?: string | null;
}): FinanceQualityIssueDto | null {
  const missingFields: string[] = [];
  if (!params.financial_entity_id) missingFields.push('financial_entity_id');
  if (!params.financial_category_id) missingFields.push('financial_category_id');
  if (!params.financial_cost_center_id) missingFields.push('financial_cost_center_id');
  if (!params.financial_account_id) missingFields.push('financial_account_id');
  if (!params.financial_payment_method_id) missingFields.push('financial_payment_method_id');
  if (!params.due_date) missingFields.push('due_date');
  if ('competence_date' in params && !params.competence_date) missingFields.push('competence_date');

  if (missingFields.length === 0) return null;
  const severity = severityForMissingFields(missingFields);

  return {
    id: `${params.resource_type}:${params.resource_id}`,
    organization_id: params.organization_id,
    resource_type: params.resource_type,
    resource_id: params.resource_id,
    severity,
    missing_fields: missingFields,
    title: severity === 'critical' ? 'Classificação crítica pendente' : 'Dados operacionais pendentes',
    detail: `${params.description} precisa de ${missingFields.join(', ')}.`,
    amount_cents: params.amount_cents,
    reference_date: params.reference_date,
    entity_name: params.entity_name,
    suggestions: []
  };
}

export function getFinanceQualityInbox(organizationId: string): FinanceQualityInboxDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);

  const payableRows = db.prepare(`
    select
      fp.id,
      fp.organization_id,
      fp.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name, fp.supplier_name) as entity_name,
      fp.financial_category_id,
      fp.financial_cost_center_id,
      fp.financial_account_id,
      fp.financial_payment_method_id,
      fp.description,
      fp.amount_cents,
      fp.due_date
    from financial_payable fp
    left join financial_entity fe
      on fe.organization_id = fp.organization_id and fe.id = fp.financial_entity_id
    where fp.organization_id = ?
      and fp.status <> 'canceled'
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    financial_entity_id: string | null;
    entity_name: string | null;
    financial_category_id: string | null;
    financial_cost_center_id: string | null;
    financial_account_id: string | null;
    financial_payment_method_id: string | null;
    description: string;
    amount_cents: number;
    due_date: string | null;
  }>;

  const issues = payableRows
    .map((row) => buildIssue({
      organization_id: row.organization_id,
      resource_type: 'payable',
      resource_id: row.id,
      description: row.description,
      amount_cents: row.amount_cents,
      reference_date: row.due_date,
      entity_name: row.entity_name,
      financial_entity_id: row.financial_entity_id,
      financial_category_id: row.financial_category_id,
      financial_cost_center_id: row.financial_cost_center_id,
      financial_account_id: row.financial_account_id,
      financial_payment_method_id: row.financial_payment_method_id,
      due_date: row.due_date
    }))
    .filter((issue): issue is FinanceQualityIssueDto => Boolean(issue));

  return {
    organization_id: normalizedOrganizationId,
    generated_at: new Date().toISOString(),
    summary: {
      total_count: issues.length,
      critical_count: issues.filter((issue) => issue.severity === 'critical').length,
      warning_count: issues.filter((issue) => issue.severity === 'warning').length,
      suggestion_count: issues.filter((issue) => issue.severity === 'suggestion').length
    },
    issues
  };
}

export function applyFinanceQualityCorrection(input: ApplyFinanceQualityCorrectionInput) {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  if (input.resource_type !== 'payable') {
    throw new Error('Correção de qualidade disponível para contas a pagar nesta etapa.');
  }

  db.prepare(`
    update financial_payable
    set financial_entity_id = coalesce(?, financial_entity_id),
        financial_category_id = coalesce(?, financial_category_id),
        financial_cost_center_id = coalesce(?, financial_cost_center_id),
        financial_account_id = coalesce(?, financial_account_id),
        financial_payment_method_id = coalesce(?, financial_payment_method_id),
        due_date = coalesce(?, due_date),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.financial_entity_id ?? null,
    input.financial_category_id ?? null,
    input.financial_cost_center_id ?? null,
    input.financial_account_id ?? null,
    input.financial_payment_method_id ?? null,
    input.due_date ?? null,
    new Date().toISOString(),
    normalizedOrganizationId,
    input.resource_id
  );

  if (input.save_as_default && input.financial_entity_id) {
    upsertFinanceEntityDefaultProfile({
      organization_id: normalizedOrganizationId,
      financial_entity_id: input.financial_entity_id,
      context: 'payable',
      financial_category_id: input.financial_category_id ?? null,
      financial_cost_center_id: input.financial_cost_center_id ?? null,
      financial_account_id: input.financial_account_id ?? null,
      financial_payment_method_id: input.financial_payment_method_id ?? null
    });
  }

  const remainingIssues = getFinanceQualityInbox(normalizedOrganizationId).issues
    .filter((issue) => issue.resource_type === input.resource_type && issue.resource_id === input.resource_id);

  return {
    resource_type: input.resource_type,
    resource_id: input.resource_id,
    remaining_issue_count: remainingIssues.length
  };
}
```

- [ ] **Step 5: Add quality routes**

In `apps/backend/src/finance/routes.ts`, import:

```ts
import { applyFinanceQualityCorrection, getFinanceQualityInbox } from './quality.js';
```

Add schema:

```ts
const qualityCorrectionSchema = z.object({
  resource_type: z.enum(['payable', 'receivable', 'transaction']),
  resource_id: z.string().trim().min(1),
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  competence_date: isoDateSchema.nullable().optional(),
  save_as_default: z.boolean().optional()
});
```

Add routes:

```ts
router.get('/quality/inbox', requireFinancePermission(['finance.read']), (_req, res) => {
  try {
    return res.json(getFinanceQualityInbox(readFinanceOrganizationId(res)));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});

router.post('/quality/issues/apply', requireFinancePermission(['finance.write', 'finance.reconcile']), (req, res) => {
  const parsed = qualityCorrectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  try {
    return res.json(applyFinanceQualityCorrection({
      ...parsed.data,
      organization_id: readFinanceOrganizationId(res)
    }));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});
```

- [ ] **Step 6: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "quality inbox"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/finance/quality.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat: add finance quality inbox api"
```

---

### Task 6: Period Filters and KPI Series in Executive Overview

**Files:**
- Modify: `apps/backend/src/finance/context.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add types**

In `apps/backend/src/finance/types.ts`, extend `FinanceExecutiveKpiDto`:

```ts
series?: Array<{
  period: string;
  amount_cents: number;
}>;
chart_kind?: 'sparkline' | 'bars' | 'progress';
scope?: 'global' | 'period';
```

Add:

```ts
export type FinancePeriodPreset =
  | 'last_7'
  | 'last_30'
  | 'today'
  | 'next_7'
  | 'next_30'
  | 'month'
  | 'all'
  | 'custom';

export type FinancePeriodFilterInput = {
  preset?: FinancePeriodPreset | null;
  from?: string | null;
  to?: string | null;
};
```

- [ ] **Step 2: Write failing test**

Add:

```ts
test('executive overview supports period filters and KPI series', async () => {
  const dbPath = assignTestDbPath('finance-overview-period-series');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceEntity();
    seedFinanceAccountAndCategory();
    seedFinanceIncomeCategory();

    createInternalUser({
      username: 'finance.period',
      display_name: 'Finance Period',
      password: 'Senha#123',
      role: 'custom',
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
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "period filters and KPI series"
```

Expected: FAIL because query and series are not implemented.

- [ ] **Step 4: Add period parsing route**

In `apps/backend/src/finance/routes.ts`, add:

```ts
function readFinancePeriodFilter(req: Request) {
  const preset = typeof req.query.preset === 'string' ? req.query.preset : null;
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  const to = typeof req.query.to === 'string' ? req.query.to : null;
  return { preset, from, to };
}
```

Update overview route:

```ts
router.get('/overview/executive', requireFinancePermission(['finance.read']), (req, res) => {
  try {
    return res.json(getFinanceExecutiveOverview(readFinanceOrganizationId(res), readFinancePeriodFilter(req)));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});
```

- [ ] **Step 5: Add period handling and series in context**

In `apps/backend/src/finance/context.ts`, update signature:

```ts
export function getFinanceExecutiveOverview(
  organizationId?: string | null,
  periodFilter?: FinancePeriodFilterInput | null
): FinanceExecutiveOverviewDto {
```

Add resolver:

```ts
function resolvePeriodWindow(filter?: FinancePeriodFilterInput | null) {
  if (filter?.preset === 'all') return { start: null, end: null };
  if (filter?.preset === 'custom' && filter.from && filter.to) {
    return { start: filter.from, end: filter.to };
  }
  if (filter?.preset === 'last_7') {
    const { start } = dayWindow(-6);
    const today = dayWindow(0).start;
    return { start, end: today };
  }
  if (filter?.preset === 'last_30') {
    const { start } = dayWindow(-29);
    const today = dayWindow(0).start;
    return { start, end: today };
  }
  if (filter?.preset === 'today') {
    const today = dayWindow(0).start;
    return { start: today, end: today };
  }
  if (filter?.preset === 'next_7') return dayWindow(7);
  if (filter?.preset === 'next_30') return dayWindow(30);
  return currentMonthRange();
}
```

If `dayWindow(-6)` does not support negative windows, add a separate helper:

```ts
function offsetDateKey(days: number) {
  const { year, month, day } = getZonedDateParts(new Date(), FINANCE_TIMEZONE);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}
```

Then use:

```ts
if (filter?.preset === 'last_7') return { start: offsetDateKey(-6), end: offsetDateKey(0) };
if (filter?.preset === 'last_30') return { start: offsetDateKey(-29), end: offsetDateKey(0) };
```

Add a simple daily series query for transactions:

```ts
function transactionSeries(organizationId: string, kind: 'income' | 'expense', start: string | null, end: string | null) {
  const rows = db.prepare(`
    select
      coalesce(competence_date, due_date, issue_date, substr(created_at, 1, 10)) as period,
      coalesce(sum(amount_cents), 0) as amount_cents
    from financial_transaction
    where organization_id = ?
      and kind = ?
      and status <> 'canceled'
      and coalesce(is_deleted, 0) = 0
      and (? is null or coalesce(competence_date, due_date, issue_date, substr(created_at, 1, 10)) >= ?)
      and (? is null or coalesce(competence_date, due_date, issue_date, substr(created_at, 1, 10)) <= ?)
    group by period
    order by period asc
  `).all(organizationId, kind, start, start, end, end) as Array<{ period: string; amount_cents: number }>;

  return rows;
}
```

Use the resolved window for monthly income/expense and append series/chart metadata to KPIs:

```ts
const periodWindow = resolvePeriodWindow(periodFilter);
const { monthlyIncomeCents, monthlyExpenseCents } = monthIncomeExpense(normalizedOrganizationId, periodWindow.start, periodWindow.end);
```

Update `monthIncomeExpense` to accept optional start/end.

When building KPIs, add series after `buildKpis`:

```ts
const kpis = buildKpis({ ... });
const incomeSeries = transactionSeries(normalizedOrganizationId, 'income', periodWindow.start, periodWindow.end);
const expenseSeries = transactionSeries(normalizedOrganizationId, 'expense', periodWindow.start, periodWindow.end);
const enrichedKpis = kpis.map((kpi) => {
  if (kpi.id === 'revenue-month') {
    return { ...kpi, scope: 'period' as const, chart_kind: 'sparkline' as const, series: incomeSeries };
  }
  if (kpi.id === 'expense-month') {
    return { ...kpi, scope: 'period' as const, chart_kind: 'sparkline' as const, series: expenseSeries };
  }
  if (kpi.id === 'projection') {
    return { ...kpi, scope: 'period' as const, chart_kind: 'progress' as const, series: [] };
  }
  if (kpi.id === 'receivables' || kpi.id === 'payables') {
    return { ...kpi, scope: 'period' as const, chart_kind: 'bars' as const, series: [] };
  }
  return { ...kpi, scope: 'global' as const };
});
```

Return `kpis: enrichedKpis`.

- [ ] **Step 6: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- "period filters and KPI series"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/finance/context.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat: add finance overview period series"
```

---

### Task 7: Frontend API Types and Shared Controls

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Create: `apps/frontend/src/finance/hooks/useFinancePeriod.ts`
- Create: `apps/frontend/src/finance/components/FinancePeriodFilter.tsx`
- Create: `apps/frontend/src/finance/components/FinanceEntityCombobox.tsx`
- Create: `apps/frontend/src/finance/components/FinanceQualityBadge.tsx`
- Create: `apps/frontend/src/finance/components/FinanceMiniChart.tsx`
- Test: `apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`

- [ ] **Step 1: Write failing component smoke test**

In `apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`, extend the populated overview mock with one KPI:

```ts
{
  id: 'revenue-month',
  label: 'Faturamento do mês',
  amount_cents: 100000,
  hint: 'Entradas do período',
  tone: 'positive',
  value_kind: 'currency',
  scope: 'period',
  chart_kind: 'sparkline',
  series: [
    { period: '2026-04-01', amount_cents: 20000 },
    { period: '2026-04-02', amount_cents: 80000 }
  ]
}
```

Add expectation:

```ts
expect(await screen.findByLabelText('Tendência de Faturamento do mês')).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceOverviewPage
```

Expected: FAIL because mini-chart is not rendered.

- [ ] **Step 3: Extend frontend API types**

In `apps/frontend/src/finance/api.ts`, add/extend:

```ts
export type FinanceEntityDefaultContext = 'payable' | 'receivable' | 'transaction';

export type FinanceEntityTag = {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceEntityDefaultProfile = {
  id: string;
  organization_id: string;
  financial_entity_id: string;
  context: FinanceEntityDefaultContext;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  due_rule: string | null;
  competence_rule: string | null;
  recurrence_rule: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceKpiSeriesPoint = {
  period: string;
  amount_cents: number;
};
```

Extend `FinanceExecutiveKpi`:

```ts
series?: FinanceKpiSeriesPoint[];
chart_kind?: 'sparkline' | 'bars' | 'progress';
scope?: 'global' | 'period';
```

Add API methods:

```ts
listEntityTags: () =>
  req<FinanceEntityTag[]>('/finance/entities/tags'),
createEntityTag: (payload: { name: string; is_active?: boolean }) =>
  req<FinanceEntityTag>('/finance/entities/tags', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
setEntityTags: (entityId: string, tagIds: string[]) =>
  req<FinanceEntity & { tags: FinanceEntityTag[] }>(`/finance/entities/${entityId}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tag_ids: tagIds })
  }),
getEntityDefaultProfile: (entityId: string, context: FinanceEntityDefaultContext) =>
  req<FinanceEntityDefaultProfile | null>(`/finance/entities/${entityId}/defaults/${context}`),
upsertEntityDefaultProfile: (entityId: string, context: FinanceEntityDefaultContext, payload: Partial<FinanceEntityDefaultProfile>) =>
  req<FinanceEntityDefaultProfile>(`/finance/entities/${entityId}/defaults/${context}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  }),
getExecutiveOverview: (filters?: { preset?: string; from?: string | null; to?: string | null }) => {
  const params = new URLSearchParams();
  if (filters?.preset) params.set('preset', filters.preset);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const query = params.toString();
  return req<FinanceExecutiveOverview>(query ? `/finance/overview/executive?${query}` : '/finance/overview/executive');
},
```

Remove the old zero-argument `getExecutiveOverview` duplicate after adding the filtered version.

- [ ] **Step 4: Create period hook**

Create `apps/frontend/src/finance/hooks/useFinancePeriod.ts`:

```ts
import { useMemo, useState } from 'react';

export type FinancePeriodPreset = 'last_7' | 'last_30' | 'today' | 'next_7' | 'next_30' | 'month' | 'all' | 'custom';

export type FinancePeriodState = {
  preset: FinancePeriodPreset;
  from: string;
  to: string;
};

export const FINANCE_PERIOD_OPTIONS: Array<{ value: FinancePeriodPreset; label: string }> = [
  { value: 'last_7', label: 'Últimos 7 dias' },
  { value: 'last_30', label: 'Últimos 30 dias' },
  { value: 'today', label: 'Hoje' },
  { value: 'next_7', label: 'Próximos 7 dias' },
  { value: 'next_30', label: 'Próximos 30 dias' },
  { value: 'month', label: 'Mês atual' },
  { value: 'all', label: 'Todos' },
  { value: 'custom', label: 'Customizado' }
];

export function useFinancePeriod(initial: FinancePeriodState = { preset: 'month', from: '', to: '' }) {
  const [period, setPeriod] = useState<FinancePeriodState>(initial);
  const apiFilters = useMemo(() => ({
    preset: period.preset,
    from: period.preset === 'custom' ? period.from || null : null,
    to: period.preset === 'custom' ? period.to || null : null
  }), [period]);

  return { period, setPeriod, apiFilters };
}
```

- [ ] **Step 5: Create period filter component**

Create `apps/frontend/src/finance/components/FinancePeriodFilter.tsx`:

```tsx
import { FINANCE_PERIOD_OPTIONS, type FinancePeriodState } from '../hooks/useFinancePeriod';

export function FinancePeriodFilter({
  value,
  onChange,
  scopeLabel = 'Usando período global'
}: {
  value: FinancePeriodState;
  onChange: (next: FinancePeriodState) => void;
  scopeLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} aria-label="Filtro de período financeiro">
      <select
        value={value.preset}
        onChange={(event) => onChange({ ...value, preset: event.target.value as FinancePeriodState['preset'] })}
        style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit', background: 'white' }}
      >
        {FINANCE_PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {value.preset === 'custom' ? (
        <>
          <input
            aria-label="Data inicial"
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit' }}
          />
          <input
            aria-label="Data final"
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 9px', fontSize: 12, fontFamily: 'inherit' }}
          />
        </>
      ) : null}
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{scopeLabel}</span>
    </div>
  );
}
```

- [ ] **Step 6: Create mini chart component**

Create `apps/frontend/src/finance/components/FinanceMiniChart.tsx`:

```tsx
import type { FinanceKpiSeriesPoint } from '../api';

function normalizePoints(series: FinanceKpiSeriesPoint[]) {
  const max = Math.max(...series.map((point) => Math.abs(point.amount_cents)), 1);
  return series.map((point, index) => {
    const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * 100;
    const y = 36 - (Math.abs(point.amount_cents) / max) * 30;
    return `${x},${y}`;
  }).join(' ');
}

export function FinanceMiniChart({
  label,
  kind = 'sparkline',
  series = [],
  tone = 'neutral'
}: {
  label: string;
  kind?: 'sparkline' | 'bars' | 'progress';
  series?: FinanceKpiSeriesPoint[];
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}) {
  const color = tone === 'positive' ? '#059669' : tone === 'critical' ? '#ef4444' : tone === 'warning' ? '#d97706' : '#2563eb';
  const safeSeries = series.length > 0 ? series : [{ period: 'empty', amount_cents: 0 }];

  if (kind === 'bars') {
    const max = Math.max(...safeSeries.map((point) => Math.abs(point.amount_cents)), 1);
    return (
      <div aria-label={`Distribuição de ${label}`} style={{ display: 'flex', alignItems: 'end', gap: 3, height: 36, marginTop: 8 }}>
        {safeSeries.slice(-12).map((point) => (
          <span
            key={`${point.period}-${point.amount_cents}`}
            style={{ width: '100%', height: `${Math.max(10, (Math.abs(point.amount_cents) / max) * 100)}%`, background: color, opacity: 0.75, borderRadius: 3 }}
          />
        ))}
      </div>
    );
  }

  if (kind === 'progress') {
    const total = safeSeries.reduce((sum, point) => sum + point.amount_cents, 0);
    const width = Math.max(8, Math.min(100, Math.abs(total) / Math.max(Math.abs(total), 1) * 100));
    return (
      <div aria-label={`Progresso de ${label}`} style={{ height: 7, background: '#e2e8f0', borderRadius: 999, marginTop: 16 }}>
        <div style={{ height: 7, width: `${width}%`, background: color, borderRadius: 999 }} />
      </div>
    );
  }

  return (
    <svg aria-label={`Tendência de ${label}`} viewBox="0 0 100 40" style={{ width: '100%', height: 38, marginTop: 8, display: 'block' }}>
      <polyline points={normalizePoints(safeSeries)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 7: Create quality badge**

Create `apps/frontend/src/finance/components/FinanceQualityBadge.tsx`:

```tsx
export function FinanceQualityBadge({ severity }: { severity: 'critical' | 'warning' | 'suggestion' }) {
  const meta = {
    critical: { label: 'Crítico', color: '#dc2626', bg: '#fee2e2' },
    warning: { label: 'Atenção', color: '#d97706', bg: '#fef3c7' },
    suggestion: { label: 'Sugestão', color: '#2563eb', bg: '#dbeafe' }
  }[severity];

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg }}>
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 8: Create entity combobox**

Create `apps/frontend/src/finance/components/FinanceEntityCombobox.tsx`:

```tsx
import type { FinanceEntity } from '../api';

export function FinanceEntityCombobox({
  entities,
  value,
  inputValue,
  onSelect,
  onInputChange,
  disabled
}: {
  entities: FinanceEntity[];
  value: string;
  inputValue: string;
  onSelect: (entity: FinanceEntity) => void;
  onInputChange: (value: string) => void;
  disabled?: boolean;
}) {
  const matches = inputValue.trim().length > 0
    ? entities.filter((entity) => `${entity.trade_name ?? ''} ${entity.legal_name}`.toLowerCase().includes(inputValue.toLowerCase())).slice(0, 5)
    : [];

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={inputValue}
        onChange={(event) => onInputChange(event.target.value)}
        disabled={disabled}
        placeholder="Buscar ou digitar entidade"
        style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit' }}
      />
      <input type="hidden" value={value} readOnly />
      {matches.length > 0 ? (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: 'calc(100% + 4px)', background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)' }}>
          {matches.map((entity) => (
            <button
              key={entity.id}
              type="button"
              onClick={() => onSelect(entity)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {entity.trade_name || entity.legal_name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: Wire mini chart into KPI grid**

In `apps/frontend/src/finance/components/FinanceKpiGrid.tsx`, import:

```ts
import { FinanceMiniChart } from './FinanceMiniChart';
```

Inside each rendered KPI card, after the main amount/hint block, add:

```tsx
{kpi.chart_kind ? (
  <FinanceMiniChart
    label={kpi.label}
    kind={kpi.chart_kind}
    series={kpi.series ?? []}
    tone={kpi.tone}
  />
) : null}
```

- [ ] **Step 10: Run frontend test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceOverviewPage
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/finance/api.ts apps/frontend/src/finance/hooks/useFinancePeriod.ts apps/frontend/src/finance/components/FinancePeriodFilter.tsx apps/frontend/src/finance/components/FinanceEntityCombobox.tsx apps/frontend/src/finance/components/FinanceQualityBadge.tsx apps/frontend/src/finance/components/FinanceMiniChart.tsx apps/frontend/src/finance/components/FinanceKpiGrid.tsx apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx
git commit -m "feat: add finance connected UI primitives"
```

---

### Task 8: Smart Cadastros UI

**Files:**
- Modify: `apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx`
- Modify: `apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx`

- [ ] **Step 1: Write failing test**

In `FinanceCadastrosPage.test.tsx`, add expectations for smart profiles:

```tsx
expect(await screen.findByText('Perfil inteligente')).toBeInTheDocument();
expect(screen.getByText('Classificações')).toBeInTheDocument();
expect(screen.getByText('Defaults por contexto')).toBeInTheDocument();
```

Mock `financeApi.listEntityTags`, `financeApi.createEntityTag`, `financeApi.getEntityDefaultProfile`, and `financeApi.upsertEntityDefaultProfile`.
Mock `financeApi.setEntityTags` as a successful response that returns the created entity plus `tags`.

- [ ] **Step 2: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage
```

Expected: FAIL because the page lacks the smart profile UI.

- [ ] **Step 3: Load tags and catalog data**

In `FinanceCadastrosPage.tsx`, extend the initial Promise:

```ts
Promise.allSettled([
  financeApi.listEntities(),
  financeApi.getCatalogSnapshot(),
  financeApi.listEntityTags()
])
```

Add state:

```ts
const [entityTags, setEntityTags] = useState<FinanceEntityTag[]>([]);
const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
const [defaultContext, setDefaultContext] = useState<FinanceEntityDefaultContext>('payable');
const [defaultForm, setDefaultForm] = useState({
  financial_category_id: '',
  financial_cost_center_id: '',
  financial_account_id: '',
  financial_payment_method_id: '',
  due_rule: '',
  competence_rule: '',
  recurrence_rule: ''
});
```

- [ ] **Step 4: Add smart profile card**

Below the entity creation form, add a card:

```tsx
<Card>
  <SectionTitle>Perfil inteligente</SectionTitle>
  <div style={{ display: 'grid', gap: 12 }}>
    <div>
      <div style={labelStyle}>Classificações</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {entityTags.map((tag) => {
          const active = selectedTagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => setSelectedTagIds((current) => active ? current.filter((id) => id !== tag.id) : [...current, tag.id])}
              style={{
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : '#e2e8f0',
                background: active ? '#f0f7ff' : 'white',
                color: active ? 'var(--accent)' : '#64748b',
                borderRadius: 999,
                padding: '4px 9px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {tag.name}
            </button>
          );
        })}
      </div>
    </div>

    <div>
      <div style={labelStyle}>Defaults por contexto</div>
      <select value={defaultContext} onChange={(event) => setDefaultContext(event.target.value as FinanceEntityDefaultContext)} style={inputStyle}>
        <option value="payable">Conta a pagar</option>
        <option value="receivable">Conta a receber</option>
        <option value="transaction">Movimentação</option>
      </select>
    </div>
  </div>
</Card>
```

Add fields for category, cost center, account, and payment method using `catalog`.

- [ ] **Step 5: Include tags/defaults in creation flow**

For Fase 1, after `createEntity`, call default profile save if at least one default field is filled:

```ts
const hasDefaults = Object.values(defaultForm).some((value) => value.trim().length > 0);
if (hasDefaults) {
  await financeApi.upsertEntityDefaultProfile(created.id, defaultContext, {
    financial_category_id: defaultForm.financial_category_id || null,
    financial_cost_center_id: defaultForm.financial_cost_center_id || null,
    financial_account_id: defaultForm.financial_account_id || null,
    financial_payment_method_id: defaultForm.financial_payment_method_id || null,
    due_rule: defaultForm.due_rule || null,
    competence_rule: defaultForm.competence_rule || null,
    recurrence_rule: defaultForm.recurrence_rule || null
  });
}
```

Persist tag mapping immediately after `createEntity` when at least one tag is selected:

```ts
if (selectedTagIds.length > 0) {
  await financeApi.setEntityTags(created.id, selectedTagIds);
}
```

Keep this helper note in the UI so the tags read as classification metadata, not as accounting categories:

```tsx
<p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Classificações ajudam a organizar o perfil inteligente da entidade.</p>
```

- [ ] **Step 6: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx
git commit -m "feat: add smart finance cadastros UI"
```

---

### Task 9: Assisted Payables and Receivables UI

**Files:**
- Modify: `apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
- Modify: `apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- Modify: `apps/frontend/src/finance/__tests__/FinancePayablesPage.test.tsx`
- Modify: `apps/frontend/src/finance/__tests__/FinanceReceivablesPage.test.tsx`

- [ ] **Step 1: Write failing payables test**

In `FinancePayablesPage.test.tsx`, add:

```tsx
await user.type(screen.getByPlaceholderText('Buscar ou digitar entidade'), 'Fornecedor Novo');
expect(await screen.findByText(/Essa entidade não existe/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Cadastrar e usar/i })).toBeInTheDocument();
```

Mock:

```ts
listEntities: vi.fn().mockResolvedValue([]),
createEntity: vi.fn().mockResolvedValue({
  id: 'entity-new',
  organization_id: 'org-holand',
  legal_name: 'Fornecedor Novo',
  trade_name: null,
  document_number: null,
  kind: 'supplier',
  email: null,
  phone: null,
  is_active: true,
  created_at: '2026-04-23T10:00:00.000Z',
  updated_at: '2026-04-23T10:00:00.000Z'
}),
getEntityDefaultProfile: vi.fn().mockResolvedValue({
  financial_category_id: 'cat-1',
  financial_cost_center_id: 'cc-1',
  financial_account_id: 'acc-1',
  financial_payment_method_id: 'pm-1'
})
```

- [ ] **Step 2: Run payables test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinancePayablesPage
```

Expected: FAIL because entity combobox/confirmation does not exist.

- [ ] **Step 3: Update payables form state**

In `FinancePayablesPage.tsx`, add form fields:

```ts
financial_entity_id: '',
financial_category_id: '',
financial_cost_center_id: '',
financial_account_id: '',
financial_payment_method_id: '',
entityInput: ''
```

Load entities/catalog with existing page data:

```ts
const [entities, setEntities] = useState<FinanceEntity[]>([]);
const [catalog, setCatalog] = useState<FinanceCatalogSnapshot | null>(null);
```

Use `Promise.all` in reload or a separate `useEffect`:

```ts
const [entitiesResponse, catalogResponse] = await Promise.all([
  financeApi.listEntities(),
  financeApi.getCatalogSnapshot()
]);
setEntities(entitiesResponse);
setCatalog(catalogResponse);
```

- [ ] **Step 4: Add entity combobox and confirmation**

Import `FinanceEntityCombobox`.

Render in place of the free supplier input:

```tsx
<FinanceEntityCombobox
  entities={entities}
  value={form.financial_entity_id}
  inputValue={form.entityInput}
  disabled={!canWrite || submitting}
  onInputChange={(value) => setForm((current) => ({ ...current, entityInput: value, financial_entity_id: '' }))}
  onSelect={async (entity) => {
    setForm((current) => ({
      ...current,
      financial_entity_id: entity.id,
      entityInput: entity.trade_name || entity.legal_name
    }));
    const defaults = await financeApi.getEntityDefaultProfile(entity.id, 'payable');
    if (defaults) {
      setForm((current) => ({
        ...current,
        financial_category_id: defaults.financial_category_id ?? current.financial_category_id,
        financial_cost_center_id: defaults.financial_cost_center_id ?? current.financial_cost_center_id,
        financial_account_id: defaults.financial_account_id ?? current.financial_account_id,
        financial_payment_method_id: defaults.financial_payment_method_id ?? current.financial_payment_method_id
      }));
    }
  }}
/>
```

Show confirmation when typed entity has no match and no selected id:

```tsx
{form.entityInput.trim() && !form.financial_entity_id && !entities.some((entity) => (entity.trade_name || entity.legal_name).toLowerCase() === form.entityInput.trim().toLowerCase()) ? (
  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 12, color: '#475569', marginBottom: 12 }}>
    Essa entidade não existe no cadastro. Quer cadastrar agora com essas informações?
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <button type="button" onClick={handleCreateEntityFromPayable} style={primarySmallButtonStyle}>Cadastrar e usar</button>
      <button type="button" onClick={() => setForm((current) => ({ ...current, financial_entity_id: '' }))} style={secondarySmallButtonStyle}>Usar só neste lançamento</button>
    </div>
  </div>
) : null}
```

Implement `handleCreateEntityFromPayable`:

```ts
async function handleCreateEntityFromPayable() {
  const created = await financeApi.createEntity({
    legal_name: form.entityInput.trim(),
    trade_name: null,
    document_number: null,
    kind: 'supplier',
    email: null,
    phone: null,
    is_active: true
  });
  setEntities((current) => [created, ...current]);
  setForm((current) => ({ ...current, financial_entity_id: created.id, entityInput: created.trade_name || created.legal_name }));
}
```

- [ ] **Step 5: Add classification fields**

Add selects for category, cost center, account, and payment method from `catalog`:

```tsx
<select value={form.financial_category_id} onChange={(event) => setForm((current) => ({ ...current, financial_category_id: event.target.value }))}>
  <option value="">Sem categoria</option>
  {(catalog?.categories ?? []).map((category) => (
    <option key={category.id} value={category.id}>{category.name}</option>
  ))}
</select>
```

Repeat for:

- `financial_cost_center_id` from `catalog.cost_centers`;
- `financial_account_id` from `catalog.accounts`;
- `financial_payment_method_id` from `catalog.payment_methods`.

- [ ] **Step 6: Submit new fields**

In `createPayable` payload:

```ts
financial_entity_id: form.financial_entity_id || null,
financial_account_id: form.financial_account_id || null,
financial_category_id: form.financial_category_id || null,
financial_cost_center_id: form.financial_cost_center_id || null,
financial_payment_method_id: form.financial_payment_method_id || null,
supplier_name: form.financial_entity_id ? null : form.entityInput.trim() || null,
```

Show incomplete warning before submit when critical fields are missing:

```tsx
{(!form.financial_entity_id || !form.financial_category_id || !form.financial_cost_center_id) ? (
  <div style={warningBannerStyle}>Este lançamento será salvo com pendência de revisão.</div>
) : null}
```

- [ ] **Step 7: Mirror the same flow in Receivables**

In `FinanceReceivablesPage.tsx`, apply the same pattern with context `receivable`, entity kind `customer`, and payload `customer_name`.

- [ ] **Step 8: Run tests**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinancePayablesPage FinanceReceivablesPage
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/finance/pages/FinancePayablesPage.tsx apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx apps/frontend/src/finance/__tests__/FinancePayablesPage.test.tsx apps/frontend/src/finance/__tests__/FinanceReceivablesPage.test.tsx
git commit -m "feat: add assisted finance payables receivables"
```

---

### Task 10: Conciliação & Revisão Quality Inbox UI

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Modify: `apps/frontend/src/finance/components/FinanceSidebar.tsx`
- Modify: `apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- Modify: `apps/frontend/src/finance/__tests__/FinanceReconciliationPage.test.tsx`

- [ ] **Step 1: Add frontend API types/methods**

In `apps/frontend/src/finance/api.ts`, add:

```ts
export type FinanceQualitySeverity = 'critical' | 'warning' | 'suggestion';

export type FinanceQualityIssue = {
  id: string;
  organization_id: string;
  resource_type: 'payable' | 'receivable' | 'transaction';
  resource_id: string;
  severity: FinanceQualitySeverity;
  missing_fields: string[];
  title: string;
  detail: string;
  amount_cents: number;
  reference_date: string | null;
  entity_name: string | null;
  suggestions: Array<{ field: string; value: string; label: string; confidence: number }>;
};

export type FinanceQualityInbox = {
  organization_id: string;
  generated_at: string;
  summary: {
    total_count: number;
    critical_count: number;
    warning_count: number;
    suggestion_count: number;
  };
  issues: FinanceQualityIssue[];
};
```

Add API methods:

```ts
getQualityInbox: () =>
  req<FinanceQualityInbox>('/finance/quality/inbox'),
applyQualityCorrection: (payload: {
  resource_type: 'payable' | 'receivable' | 'transaction';
  resource_id: string;
  financial_entity_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  due_date?: string | null;
  competence_date?: string | null;
  save_as_default?: boolean;
}) =>
  req<{ resource_type: string; resource_id: string; remaining_issue_count: number }>('/finance/quality/issues/apply', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
```

- [ ] **Step 2: Write failing UI test**

In `FinanceReconciliationPage.test.tsx`, mock:

```ts
getQualityInbox: vi.fn().mockResolvedValue({
  organization_id: 'org-holand',
  generated_at: '2026-04-23T10:00:00.000Z',
  summary: { total_count: 1, critical_count: 1, warning_count: 0, suggestion_count: 0 },
  issues: [{
    id: 'payable:pay-1',
    organization_id: 'org-holand',
    resource_type: 'payable',
    resource_id: 'pay-1',
    severity: 'critical',
    missing_fields: ['financial_category_id', 'financial_cost_center_id'],
    title: 'Classificação crítica pendente',
    detail: 'Despesa sem classificação precisa de categoria e centro.',
    amount_cents: 50000,
    reference_date: '2026-04-30',
    entity_name: 'Fornecedor sem cadastro',
    suggestions: []
  }]
}),
applyQualityCorrection: vi.fn().mockResolvedValue({ resource_type: 'payable', resource_id: 'pay-1', remaining_issue_count: 0 }),
getCatalogSnapshot: vi.fn().mockResolvedValue({ accounts: [], categories: [], cost_centers: [], payment_methods: [] }),
listEntities: vi.fn().mockResolvedValue([])
```

Add test:

```tsx
expect(await screen.findByText('Conciliação & Revisão')).toBeInTheDocument();
await user.click(screen.getByRole('tab', { name: /Dados incompletos/i }));
expect(await screen.findByText('Classificação crítica pendente')).toBeInTheDocument();
await user.click(screen.getByText('Classificação crítica pendente'));
expect(await screen.findByRole('dialog', { name: /Revisar pendência/i })).toBeInTheDocument();
```

- [ ] **Step 3: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceReconciliationPage
```

Expected: FAIL because quality inbox UI does not exist.

- [ ] **Step 4: Rename sidebar item**

In `apps/frontend/src/finance/components/FinanceSidebar.tsx`, change label:

```ts
{ to: 'reconciliation', label: 'Conciliação & Revisão', icon: 'reconciliation' }
```

- [ ] **Step 5: Load quality inbox in page**

In `FinanceReconciliationPage.tsx`, add state:

```ts
const [qualityInbox, setQualityInbox] = useState<FinanceQualityInbox | null>(null);
const [selectedIssue, setSelectedIssue] = useState<FinanceQualityIssue | null>(null);
```

Load with reconciliation inbox:

```ts
Promise.all([financeApi.getReconciliationInbox(), financeApi.getQualityInbox()])
  .then(([reconciliationPayload, qualityPayload]) => {
    setInbox(reconciliationPayload);
    setQualityInbox(qualityPayload);
  })
```

Add tab key:

```ts
type TabKey = 'fila' | 'importados' | 'matches' | 'quality';
```

Add tab:

```ts
{ id: 'quality', label: 'Dados incompletos', count: qualityInbox?.summary.total_count ?? 0 }
```

- [ ] **Step 6: Render quality issue list and side panel**

In tab content:

```tsx
{tab === 'quality' ? (
  qualityInbox && qualityInbox.issues.length > 0 ? (
    qualityInbox.issues.map((issue) => (
      <button
        key={issue.id}
        type="button"
        onClick={() => setSelectedIssue(issue)}
        style={{ width: '100%', textAlign: 'left', padding: '14px 20px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{issue.title}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{issue.detail}</div>
          </div>
          <FinanceQualityBadge severity={issue.severity} />
        </div>
      </button>
    ))
  ) : (
    <div style={{ padding: '32px 0' }}>
      <FinanceEmptyState title="Nenhuma pendência de qualidade." />
    </div>
  )
) : null}
```

Add side panel:

```tsx
{selectedIssue ? (
  <aside role="dialog" aria-label="Revisar pendência" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'white', borderLeft: '1px solid #e2e8f0', boxShadow: '-20px 0 40px rgba(15, 23, 42, 0.16)', padding: 20, zIndex: 80 }}>
    <button type="button" onClick={() => setSelectedIssue(null)} style={{ float: 'right', border: 'none', background: 'transparent', cursor: 'pointer' }}>Fechar</button>
    <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Revisar pendência</h2>
    <FinanceQualityBadge severity={selectedIssue.severity} />
    <p style={{ fontSize: 13, color: '#475569' }}>{selectedIssue.detail}</p>
    <button
      type="button"
      onClick={() => financeApi.applyQualityCorrection({
        resource_type: selectedIssue.resource_type,
        resource_id: selectedIssue.resource_id,
        save_as_default: false
      }).then(() => setSelectedIssue(null))}
      style={{ width: '100%', marginTop: 16, padding: '9px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 700, cursor: 'pointer' }}
    >
      Aplicar correção
    </button>
  </aside>
) : null}
```

Extend the side panel with correction form state before the apply button:

```ts
const [qualityCorrection, setQualityCorrection] = useState({
  financial_entity_id: '',
  financial_category_id: '',
  financial_cost_center_id: '',
  financial_account_id: '',
  financial_payment_method_id: '',
  save_as_default: false
});
```

Load catalog and entities in the same `Promise.all` as the inboxes:

```ts
Promise.all([
  financeApi.getReconciliationInbox(),
  financeApi.getQualityInbox(),
  financeApi.getCatalogSnapshot(),
  financeApi.listEntities()
])
```

Inside the panel, render selects for each correction field:

```tsx
<select value={qualityCorrection.financial_entity_id} onChange={(event) => setQualityCorrection((current) => ({ ...current, financial_entity_id: event.target.value }))}>
  <option value="">Entidade</option>
  {entities.map((entity) => (
    <option key={entity.id} value={entity.id}>{entity.trade_name || entity.legal_name}</option>
  ))}
</select>
<select value={qualityCorrection.financial_category_id} onChange={(event) => setQualityCorrection((current) => ({ ...current, financial_category_id: event.target.value }))}>
  <option value="">Categoria</option>
  {(catalog?.categories ?? []).map((category) => (
    <option key={category.id} value={category.id}>{category.name}</option>
  ))}
</select>
<select value={qualityCorrection.financial_cost_center_id} onChange={(event) => setQualityCorrection((current) => ({ ...current, financial_cost_center_id: event.target.value }))}>
  <option value="">Centro de custo</option>
  {(catalog?.cost_centers ?? []).map((costCenter) => (
    <option key={costCenter.id} value={costCenter.id}>{costCenter.name}</option>
  ))}
</select>
<select value={qualityCorrection.financial_account_id} onChange={(event) => setQualityCorrection((current) => ({ ...current, financial_account_id: event.target.value }))}>
  <option value="">Conta financeira</option>
  {(catalog?.accounts ?? []).map((account) => (
    <option key={account.id} value={account.id}>{account.name}</option>
  ))}
</select>
<select value={qualityCorrection.financial_payment_method_id} onChange={(event) => setQualityCorrection((current) => ({ ...current, financial_payment_method_id: event.target.value }))}>
  <option value="">Forma de pagamento</option>
  {(catalog?.payment_methods ?? []).map((method) => (
    <option key={method.id} value={method.id}>{method.name}</option>
  ))}
</select>
<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#475569' }}>
  <input
    type="checkbox"
    checked={qualityCorrection.save_as_default}
    onChange={(event) => setQualityCorrection((current) => ({ ...current, save_as_default: event.target.checked }))}
  />
  Salvar como padrão da entidade
</label>
```

Update the apply payload:

```ts
financeApi.applyQualityCorrection({
  resource_type: selectedIssue.resource_type,
  resource_id: selectedIssue.resource_id,
  financial_entity_id: qualityCorrection.financial_entity_id || null,
  financial_category_id: qualityCorrection.financial_category_id || null,
  financial_cost_center_id: qualityCorrection.financial_cost_center_id || null,
  financial_account_id: qualityCorrection.financial_account_id || null,
  financial_payment_method_id: qualityCorrection.financial_payment_method_id || null,
  save_as_default: qualityCorrection.save_as_default
})
```

- [ ] **Step 7: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceReconciliationPage
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/finance/api.ts apps/frontend/src/finance/components/FinanceSidebar.tsx apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx apps/frontend/src/finance/__tests__/FinanceReconciliationPage.test.tsx
git commit -m "feat: add finance reconciliation review inbox"
```

---

### Task 11: Overview Period Filter and Mini-Graphs

**Files:**
- Modify: `apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
- Modify: `apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`

- [ ] **Step 1: Write failing period test**

In `FinanceOverviewPage.test.tsx`, add:

```tsx
const user = userEvent.setup();
render(
  <MemoryRouter>
    <FinanceOverviewPage />
  </MemoryRouter>
);

expect(await screen.findByLabelText('Filtro de período financeiro')).toBeInTheDocument();
await user.selectOptions(screen.getByLabelText('Filtro de período financeiro').querySelector('select') as HTMLSelectElement, 'next_30');
await waitFor(() => {
  expect(getExecutiveOverview).toHaveBeenCalledWith(expect.objectContaining({ preset: 'next_30' }));
});
```

If querying nested select is awkward, add `aria-label="Período financeiro"` to the select in `FinancePeriodFilter` and use:

```tsx
await user.selectOptions(screen.getByLabelText('Período financeiro'), 'next_30');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceOverviewPage
```

Expected: FAIL because overview does not use the period control.

- [ ] **Step 3: Wire period hook into overview**

In `FinanceOverviewPage.tsx`, import:

```ts
import { FinancePeriodFilter } from '../components/FinancePeriodFilter';
import { useFinancePeriod } from '../hooks/useFinancePeriod';
```

Inside component:

```ts
const { period, setPeriod, apiFilters } = useFinancePeriod();
```

Update data loading effect dependency to call:

```ts
financeApi.getExecutiveOverview(apiFilters)
```

Include `apiFilters` in dependencies.

Render the filter near the page header, in a compact area:

```tsx
<div style={{ marginBottom: 14 }}>
  <FinancePeriodFilter value={period} onChange={setPeriod} />
</div>
```

- [ ] **Step 4: Run test**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceOverviewPage
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/finance/pages/FinanceOverviewPage.tsx apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx
git commit -m "feat: add finance overview period filter"
```

---

### Task 12: Full Verification and Browser QA

**Files:**
- Test-only scripts under `.tmp/` are allowed but do not commit them unless the team wants persistent QA scripts.

- [ ] **Step 1: Run backend finance tests**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
```

Expected: all backend tests pass.

- [ ] **Step 2: Run targeted frontend tests**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage FinancePayablesPage FinanceReceivablesPage FinanceReconciliationPage FinanceOverviewPage
```

Expected: targeted tests pass.

- [ ] **Step 3: Run build**

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

Expected: backend TypeScript and frontend Vite build pass. Vite chunk-size warning is acceptable if no new build error appears.

- [ ] **Step 4: Browser QA**

Start servers:

```bash
python3 /Users/yohannreimer/.agents/skills/webapp-testing/scripts/with_server.py \
  --server "PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run dev:backend" --port 4000 \
  --server "PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run dev:frontend -- --host 127.0.0.1" --port 5173 \
  --timeout 60 \
  -- env NODE_PATH=/Users/yohannreimer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  /opt/homebrew/opt/node@22/bin/node .tmp/finance-connected-core-qa.mjs
```

Create `.tmp/finance-connected-core-qa.mjs` with this content before running:

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const backend = 'http://127.0.0.1:4000';
const frontend = 'http://localhost:5173';

const loginResponse = await fetch(`${backend}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'holand', password: 'Holand2026!@#' })
});
if (!loginResponse.ok) throw new Error(`Login failed: ${loginResponse.status}`);

const session = await loginResponse.json();
session.user = {
  ...session.user,
  permissions: Array.from(new Set([...(session.user?.permissions ?? []), 'finance.read', 'finance.write', 'finance.reconcile']))
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript((savedSession) => {
  window.localStorage.setItem('orquestrador_internal_auth_v2', JSON.stringify(savedSession));
  window.sessionStorage.setItem('orquestrador_internal_tab_initialized_v1', '1');
}, session);

const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.route('**/auth/me', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: session.user }) });
});

await page.goto(`${frontend}/financeiro/overview`, { waitUntil: 'domcontentloaded' });
await page.getByRole('heading', { name: 'Visão Geral' }).waitFor();
await page.getByLabel('Filtro de período financeiro').waitFor();
await page.screenshot({ path: '.tmp/finance-connected-overview.png', fullPage: true });

await page.goto(`${frontend}/financeiro/cadastros`, { waitUntil: 'domcontentloaded' });
await page.getByText('Perfil inteligente').waitFor();
await page.screenshot({ path: '.tmp/finance-connected-cadastros.png', fullPage: true });

await page.goto(`${frontend}/financeiro/payables`, { waitUntil: 'domcontentloaded' });
await page.getByText('Nova conta a pagar').waitFor();
await page.screenshot({ path: '.tmp/finance-connected-payables.png', fullPage: true });

await page.goto(`${frontend}/financeiro/reconciliation`, { waitUntil: 'domcontentloaded' });
await page.getByText('Conciliação & Revisão').waitFor();
await page.getByRole('tab', { name: /Dados incompletos/i }).waitFor();
await page.screenshot({ path: '.tmp/finance-connected-review.png', fullPage: true });

const overflow = await page.evaluate(() => ({
  bodyScrollWidth: document.body.scrollWidth,
  bodyClientWidth: document.body.clientWidth,
  documentScrollWidth: document.documentElement.scrollWidth,
  documentClientWidth: document.documentElement.clientWidth
}));

await browser.close();

console.log(JSON.stringify({ errors, overflow }, null, 2));
```

Expected:

- no browser errors;
- no horizontal overflow at 1440px;
- screenshots show Cadastros smart profile, Payables assisted fields, Overview period filter/mini-charts, and Conciliação & Revisão quality tab.

- [ ] **Step 5: Final commit if QA fixes were needed**

If QA required small fixes:

```bash
git add <changed-files>
git commit -m "fix: polish connected finance core qa"
```

If no fixes were needed, do not create an empty commit.
