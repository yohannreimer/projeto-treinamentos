# Financeiro Agent-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Financeiro Whisper Flow from one-shot command parsing into an agent-first operation layer with query-before-action, short memory, target resolution, and safe execution for recurring rules and financial catalogs.

**Architecture:** Add a focused agent layer around the existing finance services. The LLM plans with a capability registry, the backend executes only approved tools, and deterministic resolvers handle common references like "essa recorrência", "os próximos dois", and catalog names before falling back to the LLM.

**Tech Stack:** Node.js 22, TypeScript, Express, better-sqlite3, OpenRouter chat completions with function tools, existing finance service modules, Node test runner, Vitest for frontend.

---

## File Structure

- Create `apps/backend/src/finance/agentCapabilities.ts`
  - Defines capability metadata, tool schemas, risk, permission, confirmation policy, and examples.
- Create `apps/backend/src/finance/agentContext.ts`
  - Reads and writes short operational memory from `financial_ai_interaction` plus compact helper rows when needed.
- Create `apps/backend/src/finance/agentQueries.ts`
  - Read-only tools for categories, cost centers, payment methods, accounts, entities, recurring rules, payables, receivables, and recent context.
- Create `apps/backend/src/finance/agentResolvers.ts`
  - Deterministic target resolution for "essa", "última", "os próximos", fuzzy catalog names, and recent created objects.
- Create `apps/backend/src/finance/agentPlanner.ts`
  - Runs the short loop: classify intent, call query tools, ask LLM for plan, validate actions.
- Modify `apps/backend/src/finance/assistant.ts`
  - Delegate advanced interpretation to `agentPlanner`, keep current fast path for simple commands, execute new intents.
- Modify `apps/backend/src/finance/assistantTools.ts`
  - Replace the small static tool list with registry-derived tools.
- Modify `apps/backend/src/finance/types.ts`
  - Add assistant intents for update/delete/inactivate catalog items and recurring rules.
- Modify `apps/backend/src/finance/service.ts`
  - Reuse existing update functions; add missing service functions only when routes already support the behavior poorly.
- Modify `apps/backend/src/finance/entities.ts`
  - Reuse existing create/update/list; expose compact search helpers if needed.
- Modify `apps/backend/src/finance/routes.ts`
  - No new public route is required for phase 1; `/finance/assistant/run` remains the entry point.
- Modify `apps/backend/src/finance/finance.test.ts`
  - Add agent-first tests for memory, query-before-action, recurring edit, and catalog CRUD by voice.
- Modify `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`
  - Show queried targets in preview and render disambiguation choices when backend returns them.
- Modify `apps/frontend/src/finance/api.ts`
  - Add optional plan fields for `targets`, `before_after`, and `requires_choice`.

---

## Task 1: Capability Registry

**Files:**
- Create: `apps/backend/src/finance/agentCapabilities.ts`
- Modify: `apps/backend/src/finance/assistantTools.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing registry test**

Add this test near the other assistant tests:

```ts
test('finance agent capabilities expose query and write tools with safety metadata', () => {
  const capabilities = getFinanceAgentCapabilities();
  const names = capabilities.map((capability) => capability.name);

  assert.ok(names.includes('finance.list_cost_centers'));
  assert.ok(names.includes('finance.search_recurring_rules'));
  assert.ok(names.includes('finance.update_recurring_rule'));
  assert.ok(names.includes('finance.create_category'));
  assert.ok(names.includes('finance.inactivate_category'));

  const updateRecurring = capabilities.find((capability) => capability.name === 'finance.update_recurring_rule');
  assert.equal(updateRecurring?.risk_level, 'medium');
  assert.equal(updateRecurring?.requires_confirmation, true);
  assert.equal(updateRecurring?.requires_permission, 'finance.write');

  const listCostCenters = capabilities.find((capability) => capability.name === 'finance.list_cost_centers');
  assert.equal(listCostCenters?.risk_level, 'low');
  assert.equal(listCostCenters?.requires_confirmation, false);
  assert.equal(listCostCenters?.requires_permission, 'finance.read');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "capabilities expose"
```

Expected: fail because `getFinanceAgentCapabilities` does not exist.

- [ ] **Step 3: Create capability registry**

Create `apps/backend/src/finance/agentCapabilities.ts`:

```ts
import type { FinanceAssistantRiskLevel } from './types.js';

export type FinanceAgentCapabilityName =
  | 'finance.list_categories'
  | 'finance.search_categories'
  | 'finance.create_category'
  | 'finance.update_category'
  | 'finance.inactivate_category'
  | 'finance.delete_category'
  | 'finance.list_cost_centers'
  | 'finance.search_cost_centers'
  | 'finance.create_cost_center'
  | 'finance.update_cost_center'
  | 'finance.inactivate_cost_center'
  | 'finance.delete_cost_center'
  | 'finance.list_payment_methods'
  | 'finance.list_financial_accounts'
  | 'finance.list_entities'
  | 'finance.search_entities'
  | 'finance.list_recurring_rules'
  | 'finance.search_recurring_rules'
  | 'finance.update_recurring_rule'
  | 'finance.pause_recurring_rule'
  | 'finance.list_payables'
  | 'finance.list_receivables'
  | 'finance.settle_payable'
  | 'finance.settle_receivable';

export type FinanceAgentCapability = {
  name: FinanceAgentCapabilityName;
  label: string;
  domain: string;
  mode: 'read' | 'write' | 'delete';
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  requires_permission: 'finance.read' | 'finance.write';
  description: string;
  examples: string[];
};

const read = {
  mode: 'read' as const,
  risk_level: 'low' as const,
  requires_confirmation: false,
  requires_permission: 'finance.read' as const
};

const write = {
  mode: 'write' as const,
  risk_level: 'medium' as const,
  requires_confirmation: true,
  requires_permission: 'finance.write' as const
};

const deletion = {
  mode: 'delete' as const,
  risk_level: 'high' as const,
  requires_confirmation: true,
  requires_permission: 'finance.write' as const
};

export function getFinanceAgentCapabilities(): FinanceAgentCapability[] {
  return [
    { name: 'finance.list_categories', label: 'Listar categorias', domain: 'categories', description: 'Lista categorias financeiras.', examples: ['quais categorias existem?'], ...read },
    { name: 'finance.search_categories', label: 'Buscar categorias', domain: 'categories', description: 'Busca categorias por nome aproximado.', examples: ['procure categoria marketing'], ...read },
    { name: 'finance.create_category', label: 'Criar categoria', domain: 'categories', description: 'Cria uma categoria financeira.', examples: ['crie categoria impostos'], ...write },
    { name: 'finance.update_category', label: 'Editar categoria', domain: 'categories', description: 'Edita nome, tipo ou status de categoria.', examples: ['renomeie essa categoria'], ...write },
    { name: 'finance.inactivate_category', label: 'Inativar categoria', domain: 'categories', description: 'Inativa uma categoria sem apagar histórico.', examples: ['inative essa categoria'], ...write },
    { name: 'finance.delete_category', label: 'Excluir categoria', domain: 'categories', description: 'Exclui categoria quando permitido.', examples: ['exclua a categoria teste'], ...deletion },
    { name: 'finance.list_cost_centers', label: 'Listar centros de custo', domain: 'cost_centers', description: 'Lista centros de custo disponíveis.', examples: ['quais centros de custo existem?'], ...read },
    { name: 'finance.search_cost_centers', label: 'Buscar centros de custo', domain: 'cost_centers', description: 'Busca centros de custo por nome aproximado.', examples: ['procure centro comercial'], ...read },
    { name: 'finance.create_cost_center', label: 'Criar centro de custo', domain: 'cost_centers', description: 'Cria centro de custo.', examples: ['crie centro comercial'], ...write },
    { name: 'finance.update_cost_center', label: 'Editar centro de custo', domain: 'cost_centers', description: 'Edita centro de custo.', examples: ['renomeie esse centro'], ...write },
    { name: 'finance.inactivate_cost_center', label: 'Inativar centro de custo', domain: 'cost_centers', description: 'Inativa centro de custo.', examples: ['inative centro antigo'], ...write },
    { name: 'finance.delete_cost_center', label: 'Excluir centro de custo', domain: 'cost_centers', description: 'Exclui centro de custo quando permitido.', examples: ['exclua centro teste'], ...deletion },
    { name: 'finance.list_payment_methods', label: 'Listar formas de pagamento', domain: 'payment_methods', description: 'Lista formas de pagamento.', examples: ['quais formas de pagamento existem?'], ...read },
    { name: 'finance.list_financial_accounts', label: 'Listar contas financeiras', domain: 'accounts', description: 'Lista contas financeiras.', examples: ['quais contas existem?'], ...read },
    { name: 'finance.list_entities', label: 'Listar entidades', domain: 'entities', description: 'Lista clientes e fornecedores.', examples: ['liste fornecedores'], ...read },
    { name: 'finance.search_entities', label: 'Buscar entidades', domain: 'entities', description: 'Busca clientes e fornecedores.', examples: ['procure bradesco'], ...read },
    { name: 'finance.list_recurring_rules', label: 'Listar recorrências', domain: 'recurring_rules', description: 'Lista recorrências financeiras.', examples: ['quais recorrências tenho?'], ...read },
    { name: 'finance.search_recurring_rules', label: 'Buscar recorrências', domain: 'recurring_rules', description: 'Busca recorrências por descrição.', examples: ['procure recorrência aluguel'], ...read },
    { name: 'finance.update_recurring_rule', label: 'Editar recorrência', domain: 'recurring_rules', description: 'Edita nome, valor ou dia de recorrência.', examples: ['renomeie essa conta recorrente'], ...write },
    { name: 'finance.pause_recurring_rule', label: 'Pausar recorrência', domain: 'recurring_rules', description: 'Pausa recorrência.', examples: ['pause esse aluguel'], ...write },
    { name: 'finance.list_payables', label: 'Listar contas a pagar', domain: 'payables', description: 'Lista contas a pagar.', examples: ['próximas contas a pagar'], ...read },
    { name: 'finance.list_receivables', label: 'Listar contas a receber', domain: 'receivables', description: 'Lista contas a receber.', examples: ['próximos recebíveis'], ...read },
    { name: 'finance.settle_payable', label: 'Baixar conta a pagar', domain: 'payables', description: 'Baixa conta a pagar.', examples: ['baixe essa conta'], ...write },
    { name: 'finance.settle_receivable', label: 'Baixar conta a receber', domain: 'receivables', description: 'Baixa conta a receber.', examples: ['baixe esse recebível'], ...write }
  ];
}
```

- [ ] **Step 4: Export registry-derived OpenRouter tools**

Modify `apps/backend/src/finance/assistantTools.ts` after the current constants:

```ts
import { getFinanceAgentCapabilities } from './agentCapabilities.js';

export function getFinanceAssistantTools() {
  return [
    ...FINANCE_ASSISTANT_TOOLS,
    ...getFinanceAgentCapabilities().map((capability) => ({
      type: 'function' as const,
      function: {
        name: capability.name.replaceAll('.', '_'),
        description: `${capability.label}. ${capability.description}`,
        parameters: objectSchema({
          search: { type: 'string', maxLength: 160 },
          id: { type: 'string', maxLength: 80 },
          name: { type: 'string', maxLength: 160 },
          description: { type: 'string', maxLength: 240 },
          amount_cents: { type: 'integer' },
          day_of_month: { type: 'integer', minimum: 1, maximum: 31 },
          is_active: { type: 'boolean' }
        })
      }
    }))
  ];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "capabilities expose"
```

Expected: pass.

---

## Task 2: Query Tools

**Files:**
- Create: `apps/backend/src/finance/agentQueries.ts`
- Modify: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing query test**

Add:

```ts
test('finance agent query tools list compact cost centers, categories and recurring rules', async () => {
  const dbPath = assignTestDbPath('finance-agent-query-tools');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    seedFinanceCompanies();
    seedFinanceAccountAndCategory();

    const categoryResult = runFinanceAgentQueryTool({
      organization_id: 'org-holand',
      name: 'finance.list_categories',
      args: {}
    });
    assert.ok(categoryResult.items.some((item) => item.label === 'Receita de Serviços'));

    const costCenterResult = runFinanceAgentQueryTool({
      organization_id: 'org-holand',
      name: 'finance.list_cost_centers',
      args: {}
    });
    assert.ok(costCenterResult.items.length >= 1);

    const recurringResult = runFinanceAgentQueryTool({
      organization_id: 'org-holand',
      name: 'finance.list_recurring_rules',
      args: {}
    });
    assert.equal(Array.isArray(recurringResult.items), true);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "query tools list compact"
```

Expected: fail because `runFinanceAgentQueryTool` does not exist.

- [ ] **Step 3: Implement query tool runner**

Create `apps/backend/src/finance/agentQueries.ts`:

```ts
import {
  listFinanceCategories,
  listFinanceCostCenters,
  listFinancePaymentMethods,
  listFinanceAccounts,
  listFinanceRecurringRules,
  listFinancePayables,
  listFinanceReceivables
} from './service.js';
import { listFinanceEntities } from './entities.js';

export type FinanceAgentQueryToolInput = {
  organization_id: string;
  name: string;
  args: Record<string, unknown>;
};

export type FinanceAgentQueryToolResult = {
  name: string;
  items: Array<{
    id: string;
    label: string;
    detail: string | null;
    kind: string | null;
    status: string | null;
    amount_cents?: number | null;
    due_date?: string | null;
  }>;
};

function normalizedSearch(args: Record<string, unknown>) {
  return typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
}

function keepMatching<T extends { label: string; detail: string | null }>(items: T[], search: string) {
  if (!search) return items;
  return items.filter((item) => `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(search));
}

export function runFinanceAgentQueryTool(input: FinanceAgentQueryToolInput): FinanceAgentQueryToolResult {
  const search = normalizedSearch(input.args);

  if (input.name === 'finance.list_categories' || input.name === 'finance.search_categories') {
    const items = listFinanceCategories(input.organization_id).map((category) => ({
      id: category.id,
      label: category.name,
      detail: category.parent_name ?? null,
      kind: category.type,
      status: category.is_active ? 'active' : 'inactive'
    }));
    return { name: input.name, items: keepMatching(items, search).slice(0, 40) };
  }

  if (input.name === 'finance.list_cost_centers' || input.name === 'finance.search_cost_centers') {
    const items = listFinanceCostCenters(input.organization_id).map((center) => ({
      id: center.id,
      label: center.name,
      detail: center.code ?? null,
      kind: null,
      status: center.is_active ? 'active' : 'inactive'
    }));
    return { name: input.name, items: keepMatching(items, search).slice(0, 40) };
  }

  if (input.name === 'finance.list_payment_methods') {
    return {
      name: input.name,
      items: listFinancePaymentMethods(input.organization_id).map((method) => ({
        id: method.id,
        label: method.name,
        detail: method.type,
        kind: method.type,
        status: method.is_active ? 'active' : 'inactive'
      })).slice(0, 40)
    };
  }

  if (input.name === 'finance.list_financial_accounts') {
    return {
      name: input.name,
      items: listFinanceAccounts(input.organization_id).map((account) => ({
        id: account.id,
        label: account.name,
        detail: account.bank_name ?? null,
        kind: account.type,
        status: account.is_active ? 'active' : 'inactive'
      })).slice(0, 40)
    };
  }

  if (input.name === 'finance.list_entities' || input.name === 'finance.search_entities') {
    const items = listFinanceEntities(input.organization_id).map((entity) => ({
      id: entity.id,
      label: entity.trade_name || entity.legal_name,
      detail: entity.legal_name,
      kind: entity.kind,
      status: entity.is_active ? 'active' : 'inactive'
    }));
    return { name: input.name, items: keepMatching(items, search).slice(0, 40) };
  }

  if (input.name === 'finance.list_recurring_rules' || input.name === 'finance.search_recurring_rules') {
    const items = listFinanceRecurringRules(input.organization_id).map((rule) => ({
      id: rule.id,
      label: rule.description,
      detail: `dia ${rule.day_of_month}`,
      kind: rule.resource_type,
      status: rule.is_active ? 'active' : 'paused',
      amount_cents: rule.amount_cents,
      due_date: rule.next_due_date
    }));
    return { name: input.name, items: keepMatching(items, search).slice(0, 40) };
  }

  if (input.name === 'finance.list_payables') {
    return {
      name: input.name,
      items: listFinancePayables(input.organization_id).payables.map((payable) => ({
        id: payable.id,
        label: payable.description,
        detail: payable.supplier_name,
        kind: 'payable',
        status: payable.status,
        amount_cents: payable.amount_cents,
        due_date: payable.due_date
      })).slice(0, 40)
    };
  }

  if (input.name === 'finance.list_receivables') {
    return {
      name: input.name,
      items: listFinanceReceivables(input.organization_id).receivables.map((receivable) => ({
        id: receivable.id,
        label: receivable.description,
        detail: receivable.customer_name,
        kind: 'receivable',
        status: receivable.status,
        amount_cents: receivable.amount_cents,
        due_date: receivable.due_date
      })).slice(0, 40)
    };
  }

  throw new Error(`Ferramenta de consulta financeira desconhecida: ${input.name}`);
}
```

- [ ] **Step 4: Run test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "query tools list compact"
```

Expected: pass after adapting function names if existing service exports differ.

---

## Task 3: Conversation Memory

**Files:**
- Create: `apps/backend/src/finance/agentContext.ts`
- Modify: `apps/backend/src/finance/assistant.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing memory test**

Add:

```ts
test('finance agent remembers last created recurring rule for follow-up edit', async () => {
  const dbPath = assignTestDbPath('finance-agent-memory-recurring');
  cleanupDbFiles(dbPath);
  resetDbConnection();
  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceAccountAndCategory();
    createInternalUser({
      username: 'finance.agent.memory',
      display_name: 'Finance Agent Memory',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({
      username: 'finance.agent.memory',
      password: 'Senha#123'
    });
    assert.equal(loginRes.status, 200);

    const createPlan = await request(app)
      .post('/finance/assistant/run')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        transcript: 'crie uma conta recorrente de aluguel de 12000 todo dia 10',
        surface_path: '/financeiro/payables'
      });
    assert.equal(createPlan.status, 201);

    const createExec = await request(app)
      .post(`/finance/assistant/plans/${createPlan.body.id}/execute`)
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ confirmed: true });
    assert.equal(createExec.status, 200);

    const editPlan = await request(app)
      .post('/finance/assistant/run')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        transcript: 'agora altere o nome dessa conta recorrente para Aluguel Sala Centro',
        surface_path: '/financeiro/payables'
      });

    assert.equal(editPlan.status, 201);
    assert.equal(editPlan.body.actions[0].intent, 'update_recurring_rule');
    assert.equal(editPlan.body.actions[0].payload.description, 'Aluguel Sala Centro');
    assert.ok(editPlan.body.actions[0].payload.recurring_rule_id);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "remembers last created recurring"
```

Expected: fail because memory is not yet used for recurring follow-up edits.

- [ ] **Step 3: Implement context helpers**

Create `apps/backend/src/finance/agentContext.ts`:

```ts
import { db } from '../db.js';

export type FinanceAgentRecentObject = {
  type: 'payable' | 'receivable' | 'recurring_rule' | 'category' | 'cost_center' | 'entity';
  id: string;
  label: string;
};

export function getFinanceAgentRecentObjects(organizationId: string, createdBy: string | null): FinanceAgentRecentObject[] {
  const rows = db.prepare(`
    select result_json
    from financial_ai_interaction
    where organization_id = ?
      and (? is null or created_by = ?)
      and status = 'executed'
    order by confirmed_at desc, updated_at desc
    limit 8
  `).all(organizationId, createdBy, createdBy) as Array<{ result_json: string | null }>;

  const objects: FinanceAgentRecentObject[] = [];
  for (const row of rows) {
    if (!row.result_json) continue;
    const parsed = JSON.parse(row.result_json) as { results?: Array<{ resource_type?: string; resource_id?: string; payload?: Record<string, unknown> }> };
    for (const result of parsed.results ?? []) {
      if (result.resource_type === 'payable' && result.resource_id) {
        const recurringRule = (result.payload?.recurring_rule ?? null) as { id?: string; description?: string } | null;
        if (recurringRule?.id) {
          objects.push({ type: 'recurring_rule', id: recurringRule.id, label: recurringRule.description ?? 'Recorrência' });
        }
        objects.push({ type: 'payable', id: result.resource_id, label: 'Conta a pagar' });
      }
      if (result.resource_type === 'receivable' && result.resource_id) {
        objects.push({ type: 'receivable', id: result.resource_id, label: 'Conta a receber' });
      }
      if (result.resource_type === 'entity' && result.resource_id) {
        objects.push({ type: 'entity', id: result.resource_id, label: 'Entidade' });
      }
    }
  }
  return objects;
}

export function getLastFinanceAgentObject(input: {
  organization_id: string;
  created_by: string | null;
  type: FinanceAgentRecentObject['type'];
}) {
  return getFinanceAgentRecentObjects(input.organization_id, input.created_by)
    .find((object) => object.type === input.type) ?? null;
}
```

- [ ] **Step 4: Save recurring rule into execution result**

Modify `apps/backend/src/finance/assistant.ts` in the recurring creation result so the payload already contains:

```ts
payload: {
  payable,
  recurring_rule: recurring?.rule ?? null,
  materialized_payables: recurring?.payables ?? []
}
```

This is already present for payables; keep it stable because memory depends on it.

- [ ] **Step 5: Run test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "remembers last created recurring"
```

Expected: still fail until Task 4 adds `update_recurring_rule`.

---

## Task 4: Edit Last Recurring Rule

**Files:**
- Modify: `apps/backend/src/finance/types.ts`
- Modify: `apps/backend/src/finance/assistant.ts`
- Modify: `apps/backend/src/finance/service.ts` if existing update function is missing
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add assistant intent**

Modify `FinanceAssistantIntent` in `apps/backend/src/finance/types.ts`:

```ts
export type FinanceAssistantIntent =
  | 'create_entity'
  | 'create_payable'
  | 'create_receivable'
  | 'update_recurring_rule'
  | 'settle_payable'
  | 'settle_receivable'
  | 'query_due'
  | 'query_quality'
  | 'create_simulation';
```

- [ ] **Step 2: Add parser for follow-up recurring edit**

In `apps/backend/src/finance/assistant.ts`, add a helper:

```ts
function extractRenameTarget(text: string) {
  const match = text.match(/(?:para|pra|como)\s+(.+)$/i);
  return match?.[1]?.trim().replace(/[.!?]+$/g, '') || null;
}

function isRecurringRuleRenameCommand(text: string) {
  return includesAny(text, ['altere o nome', 'alterar o nome', 'renomeie', 'mude o nome'])
    && includesAny(text, ['recorrente', 'recorrencia', 'conta recorrente']);
}
```

- [ ] **Step 3: Build action from memory**

Inside `interpretFinanceAssistantCommand`, before create/payable fallback, add:

```ts
if (actions.length === 0 && isRecurringRuleRenameCommand(normalized)) {
  const lastRecurring = getLastFinanceAgentObject({
    organization_id: input.organization_id,
    created_by: input.created_by?.trim() || null,
    type: 'recurring_rule'
  });
  const nextDescription = extractRenameTarget(transcript);
  if (lastRecurring && nextDescription) {
    actions.push(buildAction({
      intent: 'update_recurring_rule',
      confidence: 0.88,
      riskLevel: 'medium',
      requiresConfirmation: true,
      requiresPermission: 'finance.write',
      humanSummary: `Renomear recorrência ${lastRecurring.label} para ${nextDescription}.`,
      payload: {
        recurring_rule_id: lastRecurring.id,
        description: titleCaseDescription(nextDescription)
      }
    }));
  }
}
```

- [ ] **Step 4: Execute update recurring action**

In `executeAction`, add:

```ts
if (action.intent === 'update_recurring_rule') {
  const recurringRuleId = readPayloadString(action.payload, 'recurring_rule_id');
  const description = readOptionalPayloadString(action.payload, 'description');
  if (!recurringRuleId || !description) {
    throw new Error('Não encontrei a recorrência ou o novo nome para alterar.');
  }

  const recurringRule = updateFinanceRecurringRule({
    organization_id: organizationId,
    recurring_rule_id: recurringRuleId,
    description
  });

  return {
    action_id: action.id,
    intent: action.intent,
    resource_type: 'recurring_rule',
    resource_id: recurringRule.id,
    payload: { recurring_rule: recurringRule }
  };
}
```

If `updateFinanceRecurringRule` has a different signature, adapt only this call site and keep the action payload unchanged.

- [ ] **Step 5: Run memory recurring test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "remembers last created recurring"
```

Expected: pass.

---

## Task 5: Query-Before-Action For Cost Centers

**Files:**
- Modify: `apps/backend/src/finance/agentResolvers.ts`
- Modify: `apps/backend/src/finance/assistant.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing test**

Add:

```ts
test('finance agent queries cost centers before classifying an incomplete payable', async () => {
  const dbPath = assignTestDbPath('finance-agent-cost-center-resolution');
  cleanupDbFiles(dbPath);
  resetDbConnection();
  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceAccountAndCategory();
    createInternalUser({
      username: 'finance.agent.costcenter',
      display_name: 'Finance Agent Cost Center',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({
      username: 'finance.agent.costcenter',
      password: 'Senha#123'
    });
    assert.equal(loginRes.status, 200);

    const payableRes = await request(app)
      .post('/finance/payables')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        description: 'Seguro mensal',
        amount_cents: 680000,
        status: 'open',
        issue_date: '2026-04-01',
        due_date: '2026-05-07'
      });
    assert.equal(payableRes.status, 201);

    const planRes = await request(app)
      .post('/finance/assistant/run')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        transcript: 'esse seguro mensal é do centro de custo Comercial, salve isso',
        surface_path: '/financeiro/reconciliation'
      });

    assert.equal(planRes.status, 201);
    assert.equal(planRes.body.actions[0].intent, 'update_payable_classification');
    assert.equal(planRes.body.actions[0].payload.payable_id, payableRes.body.id);
    assert.ok(planRes.body.actions[0].payload.financial_cost_center_id);
    assert.match(planRes.body.actions[0].human_summary, /Comercial/i);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "queries cost centers"
```

Expected: fail because classification intent does not exist.

- [ ] **Step 3: Implement resolver file**

Create `apps/backend/src/finance/agentResolvers.ts`:

```ts
export function bestLabelMatch<T extends { id: string; label: string }>(items: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;
  return items
    .map((item) => {
      const label = item.label.toLowerCase();
      const score = label === normalizedQuery ? 1 : label.includes(normalizedQuery) || normalizedQuery.includes(label) ? 0.82 : 0;
      return { item, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}
```

- [ ] **Step 4: Add classification intent**

Add `update_payable_classification` to `FinanceAssistantIntent`.

- [ ] **Step 5: Build classification action**

Use `runFinanceAgentQueryTool({ name: 'finance.list_cost_centers' })` and `bestLabelMatch` to resolve `Comercial`.

Use `listFinancePayables` to resolve `Seguro mensal`.

Build payload:

```ts
{
  payable_id: payable.id,
  financial_cost_center_id: costCenter.id,
  save_default: true
}
```

- [ ] **Step 6: Execute classification**

Call the existing payable update service or add a narrow helper that updates only classification fields. The action must not alter amount, status, paid amount, due date, or transaction.

- [ ] **Step 7: Run test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "queries cost centers"
```

Expected: pass.

---

## Task 6: Catalog CRUD By Voice

**Files:**
- Modify: `apps/backend/src/finance/assistant.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing test**

Add:

```ts
test('finance agent creates two categories and inactivates one by voice', async () => {
  const dbPath = assignTestDbPath('finance-agent-catalog-crud');
  cleanupDbFiles(dbPath);
  resetDbConnection();
  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceAccountAndCategory();
    createInternalUser({
      username: 'finance.agent.catalog',
      display_name: 'Finance Agent Catalog',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({
      username: 'finance.agent.catalog',
      password: 'Senha#123'
    });
    assert.equal(loginRes.status, 200);

    const createPlan = await request(app)
      .post('/finance/assistant/run')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        transcript: 'crie duas categorias de despesa chamadas Eventos e Fretes',
        surface_path: '/financeiro/registrations'
      });

    assert.equal(createPlan.status, 201);
    assert.deepEqual(createPlan.body.actions.map((action: { intent: string }) => action.intent), [
      'create_category',
      'create_category'
    ]);

    const createExec = await request(app)
      .post(`/finance/assistant/plans/${createPlan.body.id}/execute`)
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({ confirmed: true });
    assert.equal(createExec.status, 200);

    const inactivatePlan = await request(app)
      .post('/finance/assistant/run')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        transcript: 'agora inative a categoria Fretes',
        surface_path: '/financeiro/registrations'
      });

    assert.equal(inactivatePlan.status, 201);
    assert.equal(inactivatePlan.body.actions[0].intent, 'inactivate_category');
    assert.match(inactivatePlan.body.human_summary, /Fretes/i);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Add intents**

Add to `FinanceAssistantIntent`:

```ts
| 'create_category'
| 'inactivate_category'
| 'delete_category'
| 'create_cost_center'
| 'inactivate_cost_center'
| 'delete_cost_center'
```

- [ ] **Step 3: Parse simple catalog commands deterministically**

Add helpers:

```ts
function extractNamedListAfterCalled(text: string) {
  const match = text.match(/(?:chamadas|chamados|chamada|chamado)\s+(.+)$/i);
  return (match?.[1] ?? '')
    .split(/\s+e\s+|,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}
```

For `"crie duas categorias de despesa chamadas Eventos e Fretes"`, build two `create_category` actions.

- [ ] **Step 4: Resolve inactivation target by query**

For `"inative a categoria Fretes"`, run `finance.search_categories` and choose exact/best match. Build `inactivate_category` with `category_id`.

- [ ] **Step 5: Execute category actions**

Use existing category service functions:

- create: `createFinanceCategory`;
- inactivate: `updateFinanceCategory({ is_active: false })`;
- delete: only if existing route/service supports delete safely.

- [ ] **Step 6: Run test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "creates two categories"
```

Expected: pass.

---

## Task 7: Frontend Preview For Targets And Choices

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Modify: `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`
- Test: `apps/frontend/src/finance/FinanceWhisperFlow.test.tsx`

- [ ] **Step 1: Add plan target types**

In `api.ts`, extend assistant action type:

```ts
export type FinanceAssistantTarget = {
  id: string;
  label: string;
  detail: string | null;
  kind: string | null;
};
```

Add optional fields to action:

```ts
targets?: FinanceAssistantTarget[];
before_after?: Array<{ label: string; before: string | null; after: string | null }>;
requires_choice?: boolean;
choices?: FinanceAssistantTarget[];
```

- [ ] **Step 2: Write frontend test**

Add a test that renders a plan action with:

```ts
{
  intent: 'update_recurring_rule',
  human_summary: 'Renomear recorrência Aluguel para Aluguel Sala Centro.',
  targets: [{ id: 'frule_1', label: 'Aluguel', detail: 'dia 10', kind: 'payable' }],
  before_after: [{ label: 'Nome', before: 'Aluguel', after: 'Aluguel Sala Centro' }]
}
```

Assert the UI shows `Aluguel`, `dia 10`, `Nome`, `Aluguel Sala Centro`.

- [ ] **Step 3: Render targets and before/after**

In `FinanceWhisperFlow.tsx`, inside the action preview card, render:

```tsx
{action.targets?.length ? (
  <div className="finance-whisper-flow__targets">
    {action.targets.map((target) => (
      <span key={target.id}>{target.label}{target.detail ? ` · ${target.detail}` : ''}</span>
    ))}
  </div>
) : null}
{action.before_after?.length ? (
  <dl className="finance-whisper-flow__diff">
    {action.before_after.map((item) => (
      <div key={item.label}>
        <dt>{item.label}</dt>
        <dd>{item.before ?? 'Vazio'} -> {item.after ?? 'Vazio'}</dd>
      </div>
    ))}
  </dl>
) : null}
```

- [ ] **Step 4: Run frontend test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/frontend -- FinanceWhisperFlow
```

Expected: pass.

---

## Task 8: Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run backend assistant suite**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "agent|assistant|Whisper Flow|recurring|categories|cost centers"
```

Expected: all matching tests pass.

- [ ] **Step 2: Run frontend Whisper tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/frontend -- FinanceWhisperFlow
```

Expected: all matching tests pass.

- [ ] **Step 3: Run build**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

Expected: backend TypeScript build passes and frontend Vite build completes.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Manual smoke in browser**

Restart backend/frontend, open the finance module, and test:

1. "crie uma conta recorrente de aluguel de 12000 todo dia 10";
2. confirm execution;
3. "agora altere o nome dessa conta recorrente para Aluguel Sala Centro";
4. confirm execution;
5. "quais centros de custo existem?";
6. "crie duas categorias de despesa chamadas Eventos e Fretes";
7. "inative a categoria Fretes".

Expected: every write action shows a clear preview before execution, queries do not require confirmation, and follow-up references resolve from memory.

---

## Self-Review

- Spec coverage: this plan implements the first deliverable slice of the approved spec: capability registry, query tools, target resolution, memory, recurring edits, catalog CRUD, preview targets, and verification. Later phases for conciliation automation, attachments, proactive alerts, and deep reporting are intentionally left for follow-up plans after the core proves stable.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: recurring action uses `update_recurring_rule`; catalog actions use `create_category` and `inactivate_category`; query tools use `FinanceAgentQueryToolResult` compact items.
