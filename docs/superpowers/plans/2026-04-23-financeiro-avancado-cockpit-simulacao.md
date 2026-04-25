# Financeiro Avançado Cockpit + Simulação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the main workspace. Steps use checkbox (`- [ ]`) syntax for tracking. User explicitly requested no isolated worktree and no commit until the full finance phase is reviewed.

**Goal:** Transform `Avançado` into a user-friendly control cockpit with assisted rules, then add a new `Simulação` workspace for scenario blocks that never mutate real finance data.

**Architecture:** Extend existing finance advanced contracts with human-readable labels and cockpit sections before refactoring the advanced page away from technical tabs. Add simulation as a separate backend domain with scenario/items/result calculation, exposed through focused `/finance/simulations` routes and a new frontend page in the finance shell.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Vite, Vitest, Testing Library, existing finance CSS/components.

---

## File Structure

- Modify `apps/backend/src/finance/types.ts`: add humanized advanced DTO fields and simulation DTO/input types.
- Modify `apps/backend/src/db.ts`: add `financial_simulation_scenario` and `financial_simulation_item` tables with tenant indexes.
- Modify `apps/backend/src/finance/service.ts`: humanize advanced dashboard data and implement simulation CRUD/calculation.
- Modify `apps/backend/src/finance/routes.ts`: add assisted-rule validation and simulation endpoints.
- Modify `apps/backend/src/finance/finance.test.ts`: cover humanized advanced output and simulation safety/calculation.
- Modify `apps/frontend/src/finance/api.ts`: add humanized advanced types plus simulation types/API methods.
- Modify `apps/frontend/src/App.tsx`: add `/financeiro/simulation`.
- Modify `apps/frontend/src/finance/components/FinanceSidebar.tsx`: add `Simulação` nav item and icon.
- Replace/refactor `apps/frontend/src/finance/pages/FinanceAdvancedPage.tsx`: cockpit layout, no technical strings, assisted rule builder.
- Create `apps/frontend/src/finance/pages/FinanceSimulationPage.tsx`: three-column scenario table with blocks, scenario editor and results.
- Modify/create tests:
  - `apps/frontend/src/finance/__tests__/FinanceAdvancedPage.test.tsx`
  - `apps/frontend/src/finance/__tests__/FinanceSimulationPage.test.tsx`
  - optionally `apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`
- Modify `apps/frontend/src/finance/finance-pages.css`: shared polish for cockpit/simulation if inline styles get too noisy.

---

## Task 1: Humanize Advanced Backend Contracts

**Files:**
- Modify: `apps/backend/src/finance/types.ts`
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add failing backend assertions for humanized advanced output**

In `apps/backend/src/finance/finance.test.ts`, extend `finance advanced controls expose rules, approvals, attachments, exports and integrations` after the final `GET /finance/advanced`:

```ts
assert.ok(finalAdvancedRes.body.cockpit, 'esperava cockpit no dashboard avancado');
assert.equal(finalAdvancedRes.body.cockpit.sections.decisions.label, 'Decisões pendentes');
assert.ok(finalAdvancedRes.body.automation_rules[0].human_trigger.includes('conta a pagar'));
assert.ok(finalAdvancedRes.body.automation_rules[0].human_action.includes('aprovação'));
assert.ok(finalAdvancedRes.body.assisted_rule_templates.some((template: { label: string }) =>
  template.label === 'Pedir aprovação para pagamentos altos'
));
```

- [ ] **Step 2: Run backend finance test and verify failure**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
```

Expected: FAIL because `cockpit`, `human_trigger` and `human_action` do not exist yet.

- [ ] **Step 3: Extend backend DTOs**

In `apps/backend/src/finance/types.ts`, extend `FinanceAutomationRuleDto`:

```ts
human_trigger: string;
human_conditions: string[];
human_action: string;
last_run_at: string | null;
execution_count: number;
recommended_action: string | null;
```

Extend `FinanceAdvancedDashboardDto`:

```ts
cockpit: {
  sections: {
    decisions: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
    risks: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
    rules: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
    audit: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
  };
  recommended_actions: Array<{ id: string; label: string; description: string; target: 'approvals' | 'rules' | 'audit' | 'attachments' | 'integrations' }>;
};
assisted_rule_templates: Array<{
  id: string;
  label: string;
  description: string;
  trigger_type: string;
  default_conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
}>;
```

- [ ] **Step 4: Add helper functions in `service.ts`**

Add near advanced helpers:

```ts
function humanizeAutomationTrigger(triggerType: string): string {
  if (triggerType === 'payable.created') return 'Quando uma conta a pagar for criada';
  if (triggerType === 'receivable.overdue') return 'Quando uma conta a receber atrasar';
  if (triggerType === 'reconciliation.pending') return 'Quando uma conciliação ficar pendente';
  return 'Quando uma condição financeira acontecer';
}

function humanizeAutomationConditions(conditions: Record<string, unknown>): string[] {
  const output: string[] = [];
  const minAmount = typeof conditions.min_amount_cents === 'number' ? conditions.min_amount_cents : null;
  if (minAmount !== null) output.push(`Valor mínimo de ${formatFinanceCurrency(minAmount)}`);
  const dueInDays = typeof conditions.due_in_days === 'number' ? conditions.due_in_days : null;
  if (dueInDays !== null) output.push(`Vencimento em até ${dueInDays} dias`);
  const tagName = typeof conditions.entity_tag_name === 'string' ? conditions.entity_tag_name : '';
  if (tagName) output.push(`Entidade classificada como ${tagName}`);
  return output.length > 0 ? output : ['Sem condição adicional'];
}

function humanizeAutomationAction(actionType: string): string {
  if (actionType === 'request_approval') return 'Pedir aprovação financeira';
  if (actionType === 'flag_review') return 'Marcar para revisão';
  if (actionType === 'classify_transaction') return 'Classificar lançamento';
  return 'Executar ação financeira';
}
```

If `formatFinanceCurrency` does not exist, add:

```ts
function formatFinanceCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
```

- [ ] **Step 5: Map automation rules with human fields**

Update `listFinanceAutomationRules` mapping or post-process in `getFinanceAdvancedDashboard`:

```ts
const automationRules = listFinanceAutomationRules(normalizedOrganizationId).map((rule) => ({
  ...rule,
  human_trigger: humanizeAutomationTrigger(rule.trigger_type),
  human_conditions: humanizeAutomationConditions(rule.conditions),
  human_action: humanizeAutomationAction(rule.action_type),
  last_run_at: null,
  execution_count: 0,
  recommended_action: rule.is_active ? null : 'Revise e ative se esta regra ainda fizer sentido.'
}));
```

- [ ] **Step 6: Add cockpit and templates to `getFinanceAdvancedDashboard`**

Return:

```ts
cockpit: {
  sections: {
    decisions: { label: 'Decisões pendentes', count: approvalQueue.length, severity: approvalQueue.length > 0 ? 'warning' : 'neutral' },
    risks: { label: 'Riscos operacionais', count: approvalQueue.filter((item) => item.severity === 'high').length, severity: approvalQueue.some((item) => item.severity === 'high') ? 'critical' : 'neutral' },
    rules: { label: 'Regras em operação', count: automationRules.filter((rule) => rule.is_active).length, severity: 'neutral' },
    audit: { label: 'Eventos auditados', count: listFinanceAuditEntries(normalizedOrganizationId).length, severity: 'neutral' }
  },
  recommended_actions: buildFinanceAdvancedRecommendations(approvalQueue, automationRules)
},
assisted_rule_templates: financeAssistedRuleTemplates()
```

Add helpers:

```ts
function financeAssistedRuleTemplates() {
  return [
    {
      id: 'approval-high-payable',
      label: 'Pedir aprovação para pagamentos altos',
      description: 'Quando uma conta a pagar passar de um valor definido, ela entra na fila de aprovação.',
      trigger_type: 'payable.created',
      default_conditions: { min_amount_cents: 500000 },
      action_type: 'request_approval',
      action_payload: { queue: 'finance.approval' }
    },
    {
      id: 'review-missing-classification',
      label: 'Revisar lançamentos sem classificação',
      description: 'Quando um lançamento estiver sem categoria ou centro de custo, ele entra na revisão.',
      trigger_type: 'transaction.incomplete',
      default_conditions: { missing_classification: true },
      action_type: 'flag_review',
      action_payload: { queue: 'finance.review' }
    }
  ];
}
```

- [ ] **Step 7: Run backend finance test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
```

Expected: PASS.

---

## Task 2: Replace Advanced UI With Cockpit

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Replace/refactor: `apps/frontend/src/finance/pages/FinanceAdvancedPage.tsx`
- Test: `apps/frontend/src/finance/__tests__/FinanceAdvancedPage.test.tsx`

- [ ] **Step 1: Add failing frontend expectations**

In `FinanceAdvancedPage.test.tsx`, assert:

```ts
expect(await screen.findByText('Cockpit de controle')).toBeInTheDocument();
expect(screen.getByText('Decisões pendentes')).toBeInTheDocument();
expect(screen.getByText('Regras assistidas')).toBeInTheDocument();
expect(screen.queryByText('payable.created')).not.toBeInTheDocument();
expect(screen.queryByText('min_amount_cents')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run focused frontend test and verify failure**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceAdvancedPage
```

Expected: FAIL because the UI still renders technical/tab-oriented advanced structure.

- [ ] **Step 3: Extend frontend advanced types**

In `apps/frontend/src/finance/api.ts`, mirror the backend fields:

```ts
export type FinanceAssistedRuleTemplate = {
  id: string;
  label: string;
  description: string;
  trigger_type: string;
  default_conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
};
```

Add the human fields to `FinanceAutomationRule`, and add `cockpit` plus `assisted_rule_templates` to `FinanceAdvancedDashboard`.

- [ ] **Step 4: Refactor `FinanceAdvancedPage` to cockpit sections**

Use these top-level sections:

```tsx
<FinancePageHeader
  eyebrow="Poder avançado"
  title="Cockpit de controle"
  description="Aprovações, riscos, regras assistidas, auditoria e integrações em linguagem operacional."
/>
```

Render:

- status cards from `dashboard.cockpit.sections`;
- `Decisões pendentes` list from `approval_queue`;
- `Regras assistidas` builder from `assisted_rule_templates`;
- `Regras em operação` from `automation_rules` using `human_trigger`, `human_conditions`, `human_action`;
- `Auditoria recente`;
- compact `Conexões e permissões`.

Do not render raw `trigger_type`, `conditions`, `action_type` or queue ids in visible text.

- [ ] **Step 5: Implement assisted rule creation**

Builder fields:

```ts
const [selectedTemplateId, setSelectedTemplateId] = useState(dashboard?.assisted_rule_templates[0]?.id ?? '');
const [ruleName, setRuleName] = useState('');
const [ruleAmount, setRuleAmount] = useState('5.000,00');
```

Create payload by taking the selected template and replacing `min_amount_cents` when needed:

```ts
const template = dashboard.assisted_rule_templates.find((item) => item.id === selectedTemplateId);
await financeApi.createAutomationRule({
  name: ruleName.trim() || template.label,
  trigger_type: template.trigger_type,
  conditions: { ...template.default_conditions, min_amount_cents: parseCurrencyToCents(ruleAmount) },
  action_type: template.action_type,
  action_payload: template.action_payload,
  is_active: true
});
```

- [ ] **Step 6: Run focused frontend test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceAdvancedPage
```

Expected: PASS.

---

## Task 3: Add Simulation Backend Domain

**Files:**
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/backend/src/finance/types.ts`
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add failing simulation backend test**

Add a test named `finance simulations calculate scenarios without mutating real records`:

```ts
test('finance simulations calculate scenarios without mutating real records', async () => {
  const dbPath = assignTestDbPath('finance-simulations');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    createInternalUser({
      username: 'finance.simulation',
      display_name: 'Finance Simulation',
      password: 'Senha#123',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({ username: 'finance.simulation', password: 'Senha#123' });
    const token = loginRes.body.token as string;

    const scenarioRes = await request(app)
      .post('/finance/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cenário caixa fim do mês', start_date: '2026-04-23', end_date: '2026-04-30' });

    assert.equal(scenarioRes.status, 201, JSON.stringify(scenarioRes.body));

    const itemRes = await request(app)
      .post(`/finance/simulations/${scenarioRes.body.id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Entrada hipotética',
        kind: 'manual_inflow',
        amount_cents: 1000000,
        simulated_date: '2026-04-24'
      });

    assert.equal(itemRes.status, 201, JSON.stringify(itemRes.body));

    const resultRes = await request(app)
      .get(`/finance/simulations/${scenarioRes.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(resultRes.status, 200, JSON.stringify(resultRes.body));
    assert.equal(resultRes.body.result.total_inflow_cents, 1000000);
    assert.equal(resultRes.body.result.ending_balance_cents >= resultRes.body.result.starting_balance_cents, true);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run backend finance test and verify failure**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
```

Expected: FAIL because `/finance/simulations` does not exist.

- [ ] **Step 3: Add simulation tables in `db.ts`**

Add schema:

```sql
create table if not exists financial_simulation_scenario (
  id text primary key,
  organization_id text not null references organization(id),
  name text not null,
  description text,
  start_date text,
  end_date text,
  status text not null default 'draft',
  base_scenario_id text,
  created_by text,
  created_at text not null,
  updated_at text not null
);

create table if not exists financial_simulation_item (
  id text primary key,
  organization_id text not null references organization(id),
  scenario_id text not null references financial_simulation_scenario(id),
  source_type text not null,
  source_id text,
  kind text not null,
  label text not null,
  amount_cents integer not null,
  original_amount_cents integer,
  payment_percent integer,
  simulated_date text,
  metadata_json text not null default '{}',
  created_at text not null,
  updated_at text not null
);
```

Add indexes on `(organization_id, created_at)` and `(organization_id, scenario_id)`.

- [ ] **Step 4: Add simulation types**

In `types.ts`:

```ts
export type FinanceSimulationItemKind = 'opening_balance' | 'expected_inflow' | 'scheduled_outflow' | 'manual_inflow' | 'manual_outflow' | 'partial_payment';
export type FinanceSimulationScenarioDto = { id: string; organization_id: string; name: string; description: string | null; start_date: string | null; end_date: string | null; status: 'draft' | 'saved' | 'archived'; base_scenario_id: string | null; created_by: string | null; created_at: string; updated_at: string };
export type FinanceSimulationItemDto = { id: string; organization_id: string; scenario_id: string; source_type: string; source_id: string | null; kind: FinanceSimulationItemKind; label: string; amount_cents: number; original_amount_cents: number | null; payment_percent: number | null; simulated_date: string | null; metadata: Record<string, unknown>; created_at: string; updated_at: string };
export type FinanceSimulationResultDto = { starting_balance_cents: number; total_inflow_cents: number; total_outflow_cents: number; ending_balance_cents: number; minimum_balance_cents: number; first_negative_date: string | null; timeline: Array<{ date: string; balance_cents: number; inflow_cents: number; outflow_cents: number }> };
export type FinanceSimulationDetailDto = FinanceSimulationScenarioDto & { items: FinanceSimulationItemDto[]; result: FinanceSimulationResultDto };
```

- [ ] **Step 5: Implement service functions**

In `service.ts`, add:

```ts
export function createFinanceSimulationScenario(input: { organization_id: string; name: string; description?: string | null; start_date?: string | null; end_date?: string | null; created_by?: string | null }): FinanceSimulationDetailDto
export function getFinanceSimulationScenario(organizationId: string, scenarioId: string): FinanceSimulationDetailDto
export function listFinanceSimulationScenarios(organizationId: string): FinanceSimulationDetailDto[]
export function createFinanceSimulationItem(input: { organization_id: string; scenario_id: string; label: string; kind: FinanceSimulationItemKind; amount_cents: number; simulated_date?: string | null; source_type?: string; source_id?: string | null; original_amount_cents?: number | null; payment_percent?: number | null; metadata?: Record<string, unknown> }): FinanceSimulationDetailDto
export function duplicateFinanceSimulationScenario(organizationId: string, scenarioId: string, createdBy?: string | null): FinanceSimulationDetailDto
```

Calculate result by sorting items by date and applying inflow/outflow signs. Treat `manual_inflow` and `expected_inflow` as inflows; treat `manual_outflow`, `scheduled_outflow`, `partial_payment` as outflows.

- [ ] **Step 6: Add routes**

In `routes.ts`:

```ts
router.get('/simulations', requireFinancePermission(['finance.read']), ...);
router.post('/simulations', requireFinancePermission(['finance.write']), ...);
router.get('/simulations/:id', requireFinancePermission(['finance.read']), ...);
router.post('/simulations/:id/items', requireFinancePermission(['finance.write']), ...);
router.post('/simulations/:id/duplicate', requireFinancePermission(['finance.write']), ...);
```

- [ ] **Step 7: Run backend finance test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
```

Expected: PASS.

---

## Task 4: Add Simulation Frontend Page

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/finance/components/FinanceSidebar.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceSimulationPage.tsx`
- Create: `apps/frontend/src/finance/__tests__/FinanceSimulationPage.test.tsx`

- [ ] **Step 1: Add failing frontend simulation test**

Create `FinanceSimulationPage.test.tsx` with mocked API:

```ts
test('FinanceSimulationPage builds a manager scenario with manual blocks and results', async () => {
  render(<FinanceSimulationPage />);
  expect(await screen.findByText('Mesa de simulação')).toBeInTheDocument();
  expect(screen.getByText('Biblioteca de blocos')).toBeInTheDocument();
  expect(screen.getByText('Cenário montado')).toBeInTheDocument();
  expect(screen.getByText('Resultado')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceSimulationPage
```

Expected: FAIL because page/API do not exist.

- [ ] **Step 3: Add simulation types and API methods**

In `api.ts`, add frontend equivalents of simulation types and:

```ts
listSimulationScenarios: () => req<FinanceSimulationDetail[]>('/finance/simulations'),
createSimulationScenario: (payload: CreateFinanceSimulationScenarioPayload) => req<FinanceSimulationDetail>('/finance/simulations', { method: 'POST', body: JSON.stringify(payload) }),
getSimulationScenario: (scenarioId: string) => req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}`),
createSimulationItem: (scenarioId: string, payload: CreateFinanceSimulationItemPayload) => req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}/items`, { method: 'POST', body: JSON.stringify(payload) }),
duplicateSimulationScenario: (scenarioId: string) => req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}/duplicate`, { method: 'POST' })
```

- [ ] **Step 4: Add route and sidebar**

In `App.tsx`:

```tsx
import { FinanceSimulationPage } from './finance/pages/FinanceSimulationPage';
...
<Route path="simulation" element={<FinanceSimulationPage />} />
```

In `FinanceSidebar.tsx`, add nav item:

```ts
{ to: 'simulation', label: 'Simulação', icon: 'simulation' }
```

Add a simple simulation icon case using existing inline SVG style.

- [ ] **Step 5: Implement `FinanceSimulationPage`**

Use three areas:

```tsx
<FinancePageHeader eyebrow="Simulação" title="Mesa de simulação" description="Monte cenários de caixa sem alterar o financeiro real." />
```

Render:

- `Biblioteca de blocos`: Saldo atual, Entrada prevista, Conta a pagar, Entrada manual, Saída manual, Pagamento parcial.
- `Cenário montado`: current scenario items with editable date/amount labels in v1 as form additions.
- `Resultado`: starting balance, inflow, outflow, ending balance, minimum balance, first negative date and timeline bars.

If there is no scenario, auto-create a local empty draft UI and ask user to click `Criar cenário` before saving items.

- [ ] **Step 6: Add manager actions**

Buttons:

- `Novo cenário`
- `Duplicar cenário`
- `Adicionar entrada manual`
- `Adicionar saída manual`
- `Simular pagamento parcial`

Each action calls backend and reloads the detail.

- [ ] **Step 7: Run focused frontend simulation test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceSimulationPage
```

Expected: PASS.

---

## Task 5: Integrated Verification and Visual Polish

**Files:**
- Modify as needed: `apps/frontend/src/finance/finance-pages.css`
- Verify: all files touched above.

- [ ] **Step 1: Run focused frontend suite**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceAdvancedPage FinanceSimulationPage FinanceWorkspace FinanceOverviewPage FinanceReceivablesPage FinancePayablesPage
```

Expected: PASS.

- [ ] **Step 2: Run backend finance suite**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build -w apps/frontend
```

Expected: PASS. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 4: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Browser visual verification**

Using Chrome or headless browser, verify:

- `/financeiro/advanced` says `Cockpit de controle`.
- No visible raw strings: `payable.created`, `min_amount_cents`, `request_approval`, `finance.approval`.
- `/financeiro/simulation` appears in sidebar.
- Simulation page shows `Biblioteca de blocos`, `Cenário montado`, `Resultado`.
- Adding a manual inflow updates result and does not create a real transaction.

- [ ] **Step 6: Stop before commit**

Do not commit. Report changed files, verification output and any remaining product tradeoffs to the user.
