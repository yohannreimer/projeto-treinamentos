# Financeiro White-Label ERP V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposicionar o módulo `Financeiro` como um ERP financeiro white-label da empresa logada, com navegação própria, home executiva premium, cadastros financeiros independentes e operação completa de movimentações, AP/AR, conciliação, fluxo de caixa e relatórios com DRE gerencial.

**Architecture:** O `Financeiro` deixa de depender do modelo mental do `Orquestrador` e passa a operar no contexto fixo da organização autenticada. O backend mantém `organization_id` como tenant, introduz entidades financeiras próprias (clientes/fornecedores), e trata relatórios/telas como projeções do ledger central. O frontend ganha shell e páginas próprias de ERP, com `Executive Overview` em layout `Split control` e side navigation desacoplada do domínio operacional.

**Tech Stack:** Node.js + Express + Zod + better-sqlite3, React + TypeScript + React Router + Vitest, CSS atual do projeto com tokens de marca e superfícies premium.

---

## Scope Lock

Este plano cobre **um único subsistema**: o módulo `Financeiro` do produto. Ele não altera o `Orquestrador`, exceto o necessário para compartilhar autenticação, rota raiz e shell global. Integrações entre módulos ficam explicitamente fora do escopo do V1.

## File Structure Map

### Existing files to keep and refactor
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
  - Mantém schema e migrações; receberá as novas tabelas/colunas financeiras próprias e seeds mínimos.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
  - Mantém o registro HTTP; deixará de aceitar `company_id`/`counterparty_company_id` como eixo principal e passará a expor rotas do ERP financeiro.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
  - Mantém DTOs base; será expandido para entidades financeiras, KPIs, fluxo e DRE.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`
  - Mantém a suíte concentrada do domínio; será reorganizada por blocos de comportamento.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
  - Mantém a camada HTTP; perderá o viés de `contraparte ativa` e ganhará tipos/clients do novo sitemap.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/FinanceWorkspace.tsx`
  - Mantém o container do módulo; será redesenhado como shell próprio do ERP.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`
  - Mantém tokens e estilos globais; receberá a linguagem visual `Precision Ledger / Executive Overview`.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/App.tsx`
  - Mantém a árvore de rotas; trocará o sitemap financeiro e removerá telas que não pertencem ao V1 aprovado (`debts` da sidebar, por exemplo).

### New backend files to create
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/context.ts`
  - Resumo executivo, KPIs e fila operacional.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/entities.ts`
  - CRUD de entidades financeiras (clientes, fornecedores, ambos).
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/catalog.ts`
  - Contas financeiras, categorias, centros de custo e formas de pagamento.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/cashflow.ts`
  - Projeções 30/60/90 dias e consolidação temporal.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/reports.ts`
  - Realizado vs projetado, aging, categorias, fluxo consolidado e DRE gerencial.

### New frontend files to create
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/hooks/useFinanceContext.ts`
  - Hook para carregar contexto/KPIs/refresh do módulo.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceSidebar.tsx`
  - Sidebar própria do financeiro.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceKpiGrid.tsx`
  - Grid dos KPIs principais e secundários.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceQueuePanel.tsx`
  - Fila operacional da home.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceCashflowPanel.tsx`
  - Painel principal de fluxo.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceQuickActions.tsx`
  - Atalhos de ação da home.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceEntityForm.tsx`
  - Formulário reutilizável de entidades.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceLedgerTable.tsx`
  - Tabela principal de movimentações com filtros e drill-down.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceStatementInbox.tsx`
  - Inbox de conciliação.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceReportCard.tsx`
  - Cartões/listas de relatórios.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceCashflowPage.tsx`
  - Nova tela de fluxo de caixa.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReportsPage.tsx`
  - Nova tela de relatórios.
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx`
  - Nova tela de cadastros.

### New frontend tests to create
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceTransactionsPage.test.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceReconciliationPage.test.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceCashflowPage.test.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceReportsPage.test.tsx`

---

### Task 1: Resetar o domínio do financeiro para tenant da empresa logada

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever o teste falho que protege o novo contexto financeiro**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { buildApp } from '../app.js';

test('GET /finance/context returns only tenant organization context without company selector', async () => {
  const app = buildApp();
  const response = await request(app)
    .get('/finance/context')
    .set('Authorization', 'Bearer token-holand');

  assert.equal(response.status, 200);
  assert.equal(response.body.organization_name, 'Holand');
  assert.equal(response.body.currency, 'BRL');
  assert.ok(!('company_id' in response.body));
  assert.ok(!('company_name' in response.body));
  assert.ok(!('counterparty_company_id' in response.body));
});
```

- [ ] **Step 2: Rodar o teste para confirmar que o domínio antigo ainda quebra a regra**

Run: `npm --workspace apps/backend run test -- --test-name-pattern="returns only tenant organization context without company selector"`
Expected: FAIL com payload antigo contendo referência a `company_id`, `company_name` ou exigindo filtro de contraparte.

- [ ] **Step 3: Ajustar schema e tipos para separar tenant financeiro de entidades externas**

```ts
export type FinanceContextDto = {
  organization_id: string;
  organization_name: string | null;
  currency: string;
  timezone: string;
};

export type FinanceEntityKind = 'customer' | 'supplier' | 'both';

export type FinanceEntityDto = {
  id: string;
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  document_number: string | null;
  kind: FinanceEntityKind;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
```

```sql
create table if not exists financial_entity (
  id text primary key,
  organization_id text not null,
  legal_name text not null,
  trade_name text,
  document_number text,
  kind text not null check(kind in ('customer','supplier','both')),
  email text,
  phone text,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_financial_entity_org_kind
  on financial_entity(organization_id, kind, is_active);
```

- [ ] **Step 4: Remover a leitura de contraparte ativa do contexto e endurecer o service principal**

```ts
export function getFinanceContext(organizationId: string): FinanceContextDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const organization = readOrganizationRow(normalizedOrganizationId);

  return {
    organization_id: normalizedOrganizationId,
    organization_name: organization.name,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo'
  };
}
```

```ts
export function createFinanceTransaction(input: CreateFinanceTransactionInput): FinanceTransactionDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const entityId = input.financial_entity_id?.trim() || null;
  if (entityId) {
    readFinanceEntityRow(normalizedOrganizationId, entityId);
  }
  // resto do create usa organization_id como tenant fixo
}
```

- [ ] **Step 5: Rodar a suíte financeira para validar o reset de domínio**

Run: `npm --workspace apps/backend run test -- src/finance/finance.test.ts`
Expected: PASS com o novo contexto financeiro e sem dependência de `company_id` como eixo do módulo.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/finance/types.ts apps/backend/src/finance/service.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/finance.test.ts
git commit -m "refactor(finance): reset finance domain to organization tenant"
```

### Task 2: Reestruturar shell, sitemap e rotas do módulo financeiro

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/App.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/FinanceWorkspace.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceSidebar.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/hooks/useFinanceContext.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`

- [ ] **Step 1: Escrever o teste falho do novo sitemap aprovado**

```tsx
test('finance workspace shows the approved ERP sitemap and no counterparty copy', async () => {
  render(
    <MemoryRouter initialEntries={['/financeiro']}>
      <Routes>
        <Route path="/financeiro/*" element={<FinanceWorkspace />}>
          <Route index element={<div>home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  expect(await screen.findByRole('link', { name: 'Visão Geral' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Movimentações' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Contas a Receber' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Contas a Pagar' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Conciliação' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Fluxo de Caixa' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Relatórios' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cadastros' })).toBeInTheDocument();
  expect(screen.queryByText(/contraparte/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste do workspace**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceWorkspace.test.tsx`
Expected: FAIL porque a sidebar atual ainda mostra `Dívidas`, texto de contraparte e não contém `Fluxo de Caixa`, `Relatórios` e `Cadastros`.

- [ ] **Step 3: Criar hook de contexto e sidebar do módulo financeiro**

```tsx
export function useFinanceContext() {
  const [context, setContext] = useState<FinanceContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    financeApi.getContext()
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { context, loading };
}
```

```tsx
const FINANCE_NAV = [
  ['overview', 'Visão Geral'],
  ['transactions', 'Movimentações'],
  ['receivables', 'Contas a Receber'],
  ['payables', 'Contas a Pagar'],
  ['reconciliation', 'Conciliação'],
  ['cashflow', 'Fluxo de Caixa'],
  ['reports', 'Relatórios'],
  ['cadastros', 'Cadastros']
] as const;
```

- [ ] **Step 4: Atualizar rotas e shell para o novo posicionamento white-label**

```tsx
<Route path="/financeiro/*" element={<ProtectedRoute user={user} permissions={FINANCE_PERMISSIONS} fallback={defaultRoute}><FinanceWorkspace /></ProtectedRoute>}>
  <Route index element={<Navigate to="overview" replace />} />
  <Route path="overview" element={<FinanceOverviewPage />} />
  <Route path="transactions" element={<FinanceTransactionsPage />} />
  <Route path="receivables" element={<FinanceReceivablesPage />} />
  <Route path="payables" element={<FinancePayablesPage />} />
  <Route path="reconciliation" element={<FinanceReconciliationPage />} />
  <Route path="cashflow" element={<FinanceCashflowPage />} />
  <Route path="reports" element={<FinanceReportsPage />} />
  <Route path="cadastros" element={<FinanceCadastrosPage />} />
  <Route path="*" element={<Navigate to="overview" replace />} />
</Route>
```

- [ ] **Step 5: Rodar testes de frontend e build parcial**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceWorkspace.test.tsx && npm --workspace apps/frontend run build`
Expected: PASS no teste do workspace e build sem erros de rota/import.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/App.tsx apps/frontend/src/finance/FinanceWorkspace.tsx apps/frontend/src/finance/components/FinanceSidebar.tsx apps/frontend/src/finance/hooks/useFinanceContext.ts apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx apps/frontend/src/styles.css
git commit -m "feat(finance): rebuild finance shell and approved sitemap"
```

### Task 3: Construir a home `Executive Overview` em layout `Split control`

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/context.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceKpiGrid.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceQueuePanel.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceCashflowPanel.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceQuickActions.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`

- [ ] **Step 1: Escrever o teste falho da home com KPIs puros + fila operacional**

```tsx
test('overview renders KPI-first executive overview with split control sections', async () => {
  render(<FinanceOverviewPage />);

  expect(await screen.findByText('Saldo em conta')).toBeInTheDocument();
  expect(screen.getByText('A receber')).toBeInTheDocument();
  expect(screen.getByText('A pagar')).toBeInTheDocument();
  expect(screen.getByText('Resultado projetado')).toBeInTheDocument();
  expect(screen.getByText('Fila operacional')).toBeInTheDocument();
  expect(screen.getByText('Fluxo de caixa')).toBeInTheDocument();
  expect(screen.getByText('Ações rápidas')).toBeInTheDocument();
  expect(screen.queryByText(/contraparte/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste da home**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceOverviewPage.test.tsx`
Expected: FAIL porque a tela atual ainda é só um placeholder textual.

- [ ] **Step 3: Criar DTO e endpoint da visão executiva**

```ts
export type FinanceExecutiveOverviewDto = {
  currency: string;
  kpis: {
    cash_balance_cents: number;
    receivables_open_cents: number;
    payables_open_cents: number;
    projected_result_cents: number;
    monthly_revenue_cents: number;
    monthly_expense_cents: number;
    overdue_count: number;
    reconciliation_pending_count: number;
  };
  queue: {
    due_today: number;
    overdue: number;
    uncategorized: number;
    unreconciled: number;
  };
  cashflow: {
    horizon_days: 90;
    points: Array<{ date: string; inflow_cents: number; outflow_cents: number; balance_cents: number }>;
  };
};
```

```ts
app.get('/finance/overview/executive', requireFinancePermission(['finance.read']), (req, res) => {
  try {
    const organizationId = readFinanceOrganizationId(res);
    return res.json(getFinanceExecutiveOverview(organizationId));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});
```

- [ ] **Step 4: Implementar a página com `Split control` e superfícies premium**

```tsx
<section className="finance-overview-grid">
  <div className="finance-overview-main">
    <FinanceKpiGrid overview={overview} />
    <FinanceCashflowPanel cashflow={overview.cashflow} />
  </div>
  <aside className="finance-overview-side">
    <FinanceQueuePanel queue={overview.queue} />
    <FinanceQuickActions />
  </aside>
</section>
```

- [ ] **Step 5: Validar a home no teste e no build**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceOverviewPage.test.tsx && npm --workspace apps/frontend run build`
Expected: PASS no teste da home e build com os novos componentes.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/finance/routes.ts apps/backend/src/finance/context.ts apps/backend/src/finance/types.ts apps/frontend/src/finance/pages/FinanceOverviewPage.tsx apps/frontend/src/finance/components/FinanceKpiGrid.tsx apps/frontend/src/finance/components/FinanceQueuePanel.tsx apps/frontend/src/finance/components/FinanceCashflowPanel.tsx apps/frontend/src/finance/components/FinanceQuickActions.tsx apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx apps/frontend/src/styles.css
git commit -m "feat(finance): add executive overview split-control home"
```

### Task 4: Criar a fundação de `Cadastros` com modelo híbrido (base única, UI separada)

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/entities.ts`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/catalog.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceEntityForm.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`

- [ ] **Step 1: Escrever o teste falho de cadastros híbridos**

```tsx
test('cadastros page lists unified entities with customer and supplier filters', async () => {
  render(<FinanceCadastrosPage />);

  expect(await screen.findByRole('tab', { name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Clientes' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Fornecedores' })).toBeInTheDocument();
  expect(screen.getByText('Contas financeiras')).toBeInTheDocument();
  expect(screen.getByText('Categorias')).toBeInTheDocument();
  expect(screen.getByText('Centros de custo')).toBeInTheDocument();
  expect(screen.getByText('Formas de pagamento')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste de cadastros**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceCadastrosPage.test.tsx`
Expected: FAIL porque a página `cadastros` ainda não existe.

- [ ] **Step 3: Criar schema e rotas de entidades e catálogos**

```sql
create table if not exists financial_cost_center (
  id text primary key,
  organization_id text not null,
  name text not null,
  code text,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);

create table if not exists financial_payment_method (
  id text primary key,
  organization_id text not null,
  name text not null,
  kind text not null,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);
```

```ts
app.get('/finance/entities', requireFinancePermission(['finance.read']), ...);
app.post('/finance/entities', requireFinancePermission(['finance.write']), ...);
app.get('/finance/catalog/accounts', requireFinancePermission(['finance.read']), ...);
app.post('/finance/catalog/accounts', requireFinancePermission(['finance.write']), ...);
app.get('/finance/catalog/categories', requireFinancePermission(['finance.read']), ...);
app.post('/finance/catalog/categories', requireFinancePermission(['finance.write']), ...);
app.get('/finance/catalog/cost-centers', requireFinancePermission(['finance.read']), ...);
app.post('/finance/catalog/cost-centers', requireFinancePermission(['finance.write']), ...);
app.get('/finance/catalog/payment-methods', requireFinancePermission(['finance.read']), ...);
app.post('/finance/catalog/payment-methods', requireFinancePermission(['finance.write']), ...);
```

- [ ] **Step 4: Implementar a página `Cadastros` com base única e filtros de leitura**

```tsx
<Tabs value={entityFilter} onChange={setEntityFilter}>
  <button type="button">Todos</button>
  <button type="button">Clientes</button>
  <button type="button">Fornecedores</button>
</Tabs>
<section className="finance-cadastros-grid">
  <section className="panel"><FinanceEntityForm /></section>
  <section className="panel"><AccountsCatalog /></section>
  <section className="panel"><CategoriesCatalog /></section>
  <section className="panel"><CostCentersCatalog /></section>
  <section className="panel"><PaymentMethodsCatalog /></section>
</section>
```

- [ ] **Step 5: Rodar testes de frontend e backend do cadastro financeiro**

Run: `npm --workspace apps/backend run test -- src/finance/finance.test.ts && npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceCadastrosPage.test.tsx`
Expected: PASS com entidades financeiras independentes do módulo operacional.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/finance/entities.ts apps/backend/src/finance/catalog.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx apps/frontend/src/finance/components/FinanceEntityForm.tsx apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx apps/frontend/src/finance/api.ts
git commit -m "feat(finance): add finance cadastros foundation"
```

### Task 5: Refatorar `Movimentações` como ledger central do ERP

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceLedgerTable.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceTransactionsPage.test.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`

- [ ] **Step 1: Escrever o teste falho da tabela central de movimentações**

```tsx
test('transactions page renders ledger filters and drill-down table', async () => {
  render(<FinanceTransactionsPage />);

  expect(await screen.findByLabelText('Período')).toBeInTheDocument();
  expect(screen.getByLabelText('Status')).toBeInTheDocument();
  expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
  expect(screen.getByLabelText('Conta')).toBeInTheDocument();
  expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
  expect(screen.getByLabelText('Entidade')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Ledger financeiro' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste das movimentações**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceTransactionsPage.test.tsx`
Expected: FAIL porque a tela atual ainda é orientada ao contexto antigo e não possui o ledger V1.

- [ ] **Step 3: Endurecer o contrato da API de movimentações**

```ts
export type FinanceTransactionDto = {
  id: string;
  organization_id: string;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  kind: 'income' | 'expense' | 'transfer' | 'adjustment';
  status: 'planned' | 'open' | 'partial' | 'settled' | 'overdue' | 'canceled';
  amount_cents: number;
  issue_date: string | null;
  due_date: string | null;
  settlement_date: string | null;
  competence_date: string | null;
  note: string | null;
  views: FinanceLedgerViews;
};
```

- [ ] **Step 4: Implementar a página com filtros, tabela e drill-down de número**

```tsx
<section className="finance-ledger-layout">
  <header className="panel finance-ledger-filters">
    <FilterField label="Período" />
    <FilterField label="Status" />
    <FilterField label="Tipo" />
    <FilterField label="Conta" />
    <FilterField label="Categoria" />
    <FilterField label="Entidade" />
  </header>
  <FinanceLedgerTable rows={transactions} />
</section>
```

- [ ] **Step 5: Rodar testes e build da tela de movimentações**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceTransactionsPage.test.tsx && npm --workspace apps/frontend run build`
Expected: PASS com ledger central auditável e filtros do ERP.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/finance/service.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx apps/frontend/src/finance/components/FinanceLedgerTable.tsx apps/frontend/src/finance/__tests__/FinanceTransactionsPage.test.tsx apps/frontend/src/finance/api.ts apps/frontend/src/styles.css
git commit -m "feat(finance): refactor transactions into finance ledger"
```

### Task 6: Subir `Contas a Receber` e `Contas a Pagar` como rotinas operacionais profundas

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever o teste falho de aging e status operacionais**

```ts
test('finance receivables and payables expose overdue and due-today groupings', async () => {
  const app = buildApp();
  const receivables = await request(app).get('/finance/receivables').set('Authorization', 'Bearer token-holand');
  const payables = await request(app).get('/finance/payables').set('Authorization', 'Bearer token-holand');

  assert.equal(receivables.status, 200);
  assert.equal(payables.status, 200);
  assert.ok(Array.isArray(receivables.body.groups.overdue));
  assert.ok(Array.isArray(payables.body.groups.due_today));
});
```

- [ ] **Step 2: Rodar o teste de AP/AR**

Run: `npm --workspace apps/backend run test -- --test-name-pattern="expose overdue and due-today groupings"`
Expected: FAIL porque os endpoints atuais retornam listas simples, sem agrupamento operacional.

- [ ] **Step 3: Atualizar services para agrupar rotina diária e suportar baixa parcial**

```ts
export type FinanceReceivablesListDto = {
  summary: {
    open_cents: number;
    overdue_cents: number;
    due_today_cents: number;
  };
  groups: {
    overdue: FinanceReceivableDto[];
    due_today: FinanceReceivableDto[];
    upcoming: FinanceReceivableDto[];
    settled: FinanceReceivableDto[];
  };
};
```

```ts
export type FinancePayablesListDto = {
  summary: {
    open_cents: number;
    overdue_cents: number;
    due_today_cents: number;
  };
  groups: {
    overdue: FinancePayableDto[];
    due_today: FinancePayableDto[];
    upcoming: FinancePayableDto[];
    settled: FinancePayableDto[];
  };
};
```

- [ ] **Step 4: Atualizar páginas para virarem rotinas operacionais de verdade**

```tsx
<section className="finance-arap-grid">
  <SummaryCards summary={summary} />
  <GroupedList title="Atrasados" rows={groups.overdue} />
  <GroupedList title="Vencendo hoje" rows={groups.due_today} />
  <GroupedList title="Próximos vencimentos" rows={groups.upcoming} />
</section>
```

- [ ] **Step 5: Rodar testes backend + build frontend**

Run: `npm --workspace apps/backend run test -- src/finance/finance.test.ts && npm --workspace apps/frontend run build`
Expected: PASS com AP/AR orientados à operação diária.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/finance/service.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx apps/frontend/src/finance/pages/FinancePayablesPage.tsx apps/frontend/src/finance/api.ts
git commit -m "feat(finance): deepen receivables and payables workflows"
```

### Task 7: Implementar `Conciliação` e `Fluxo de Caixa` com leitura de inbox + horizonte temporal

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/cashflow.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceCashflowPage.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceStatementInbox.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceReconciliationPage.test.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceCashflowPage.test.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`

- [ ] **Step 1: Escrever o teste falho de conciliação como inbox operacional**

```tsx
test('reconciliation page highlights pending statement matches as an inbox', async () => {
  render(<FinanceReconciliationPage />);

  expect(await screen.findByText('Pendências de conciliação')).toBeInTheDocument();
  expect(screen.getByText('Sugestões de match')).toBeInTheDocument();
  expect(screen.getByText('Extratos importados')).toBeInTheDocument();
});

test('cashflow page renders the 30 60 90 day horizon controls', async () => {
  render(<FinanceCashflowPage />);

  expect(await screen.findByRole('button', { name: '30 dias' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '60 dias' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '90 dias' })).toBeInTheDocument();
  expect(screen.getByText('Fluxo de caixa projetado')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste de conciliação**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceReconciliationPage.test.tsx`
Expected: FAIL porque a tela atual ainda não opera com a linguagem de inbox e o teste novo ainda não existe.

- [ ] **Step 3: Criar o endpoint de fluxo de caixa 30/60/90 dias**

```ts
app.get('/finance/cashflow', requireFinancePermission(['finance.read']), (req, res) => {
  try {
    const organizationId = readFinanceOrganizationId(res);
    const horizonDays = Number.parseInt(String(req.query.horizon ?? '90'), 10);
    return res.json(getFinanceCashflow(organizationId, Number.isNaN(horizonDays) ? 90 : horizonDays));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});
```

```ts
export type FinanceCashflowDto = {
  horizon_days: 30 | 60 | 90;
  points: Array<{ date: string; inflow_cents: number; outflow_cents: number; balance_cents: number }>;
  totals: {
    inflow_cents: number;
    outflow_cents: number;
    ending_balance_cents: number;
  };
};
```

- [ ] **Step 4: Implementar UI de conciliação e fluxo com foco operacional premium**

```tsx
<section className="finance-reconciliation-layout">
  <FinanceStatementInbox entries={entries} matches={matches} />
  <section className="panel">
    <h2>Sugestões de match</h2>
    <MatchTable matches={matches} />
  </section>
</section>
```

```tsx
<section className="finance-cashflow-layout">
  <CashflowHorizonSwitcher />
  <CashflowChart points={cashflow.points} />
  <CashflowSummary totals={cashflow.totals} />
</section>
```

- [ ] **Step 5: Rodar testes e build das duas telas**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceReconciliationPage.test.tsx src/finance/__tests__/FinanceCashflowPage.test.tsx && npm --workspace apps/frontend run build && npm --workspace apps/backend run test -- src/finance/finance.test.ts`
Expected: PASS com a inbox de conciliação, a nova tela de fluxo e a nova rota de cashflow.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/finance/routes.ts apps/backend/src/finance/service.ts apps/backend/src/finance/cashflow.ts apps/backend/src/finance/types.ts apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx apps/frontend/src/finance/pages/FinanceCashflowPage.tsx apps/frontend/src/finance/components/FinanceStatementInbox.tsx apps/frontend/src/finance/__tests__/FinanceReconciliationPage.test.tsx apps/frontend/src/finance/__tests__/FinanceCashflowPage.test.tsx apps/frontend/src/finance/api.ts apps/frontend/src/styles.css
git commit -m "feat(finance): add reconciliation inbox and cashflow workspace"
```

### Task 8: Entregar `Relatórios` com DRE gerencial e drill-down confiável

**Files:**
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/reports.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReportsPage.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceReportCard.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceReportsPage.test.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`

- [ ] **Step 1: Escrever o teste falho da tela de relatórios com DRE gerencial**

```tsx
test('reports page exposes the approved report set including DRE gerencial', async () => {
  render(<FinanceReportsPage />);

  expect(await screen.findByText('DRE gerencial')).toBeInTheDocument();
  expect(screen.getByText('Realizado vs projetado')).toBeInTheDocument();
  expect(screen.getByText('Receitas por categoria')).toBeInTheDocument();
  expect(screen.getByText('Despesas por categoria')).toBeInTheDocument();
  expect(screen.getByText('Contas a receber vencidas')).toBeInTheDocument();
  expect(screen.getByText('Contas a pagar vencidas')).toBeInTheDocument();
  expect(screen.getByText('Fluxo consolidado por período')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste de relatórios**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceReportsPage.test.tsx`
Expected: FAIL porque a tela ainda não existe.

- [ ] **Step 3: Criar DTOs e rotas dos relatórios aprovados**

```ts
export type FinanceReportsDto = {
  realized_vs_projected: Array<{ period: string; realized_cents: number; projected_cents: number }>;
  income_by_category: Array<{ category_name: string; amount_cents: number }>;
  expense_by_category: Array<{ category_name: string; amount_cents: number }>;
  overdue_receivables: Array<{ entity_name: string; due_date: string; amount_cents: number }>;
  overdue_payables: Array<{ entity_name: string; due_date: string; amount_cents: number }>;
  consolidated_cashflow: Array<{ period: string; inflow_cents: number; outflow_cents: number; balance_cents: number }>;
  dre: {
    gross_revenue_cents: number;
    deductions_cents: number;
    net_revenue_cents: number;
    operating_expenses_cents: number;
    operating_result_cents: number;
  };
};
```

```ts
app.get('/finance/reports', requireFinancePermission(['finance.read']), (req, res) => {
  try {
    const organizationId = readFinanceOrganizationId(res);
    return res.json(getFinanceReports(organizationId));
  } catch (error) {
    return respondFinanceError(res, error);
  }
});
```

- [ ] **Step 4: Implementar a página com cards, listas e drill-down por relatório**

```tsx
<section className="finance-reports-grid">
  <FinanceReportCard title="DRE gerencial" emphasis="primary">
    <DreSummary report={reports.dre} />
  </FinanceReportCard>
  <FinanceReportCard title="Realizado vs projetado"><ComparisonTable rows={reports.realized_vs_projected} /></FinanceReportCard>
  <FinanceReportCard title="Receitas por categoria"><CategoryBreakdown rows={reports.income_by_category} /></FinanceReportCard>
  <FinanceReportCard title="Despesas por categoria"><CategoryBreakdown rows={reports.expense_by_category} /></FinanceReportCard>
  <FinanceReportCard title="Contas a receber vencidas"><AgingList rows={reports.overdue_receivables} /></FinanceReportCard>
  <FinanceReportCard title="Contas a pagar vencidas"><AgingList rows={reports.overdue_payables} /></FinanceReportCard>
  <FinanceReportCard title="Fluxo consolidado por período"><ConsolidatedCashflow rows={reports.consolidated_cashflow} /></FinanceReportCard>
</section>
```

- [ ] **Step 5: Rodar testes e build final do V1 de relatórios**

Run: `npm --workspace apps/frontend run test -- src/finance/__tests__/FinanceReportsPage.test.tsx && npm --workspace apps/frontend run build && npm --workspace apps/backend run test -- src/finance/finance.test.ts`
Expected: PASS com a tela de relatórios e DRE gerencial funcionando sobre o ledger.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/finance/reports.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/types.ts apps/frontend/src/finance/pages/FinanceReportsPage.tsx apps/frontend/src/finance/components/FinanceReportCard.tsx apps/frontend/src/finance/__tests__/FinanceReportsPage.test.tsx apps/frontend/src/finance/api.ts apps/frontend/src/styles.css
git commit -m "feat(finance): add reports workspace with managerial dre"
```

### Task 9: Hardening final, cleanup visual e verificação integrada do módulo

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/FinanceWorkspace.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceTransactionsPage.test.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceReportsPage.test.tsx`

- [ ] **Step 1: Ajustar estados vazios, loading, erro e microcopy para padrão premium**

```tsx
{loading ? <div className="finance-empty-state">Carregando visão financeira...</div> : null}
{error ? <div className="finance-inline-error">Não foi possível carregar este bloco financeiro agora.</div> : null}
```

```css
.finance-inline-error {
  border: 1px solid rgba(239, 47, 15, 0.14);
  background: rgba(239, 47, 15, 0.05);
  color: var(--ink-strong);
  border-radius: 18px;
  padding: 14px 16px;
}
```

- [ ] **Step 2: Rodar a suíte completa do backend e frontend**

Run: `npm --workspace apps/backend run test && npm --workspace apps/frontend run test && npm run build`
Expected: PASS completo, sem regressões em finance ou no shell da aplicação.

- [ ] **Step 3: Smoke test manual do fluxo principal no localhost**

Run:
```bash
npm run dev:backend > /tmp/finance-backend.log 2>&1 &
npm run dev:frontend > /tmp/finance-frontend.log 2>&1 &
```
Expected: frontend em `http://localhost:5173` e backend em `http://localhost:4000`, com navegação funcionando em `Visão Geral`, `Movimentações`, `Contas a Receber`, `Contas a Pagar`, `Conciliação`, `Fluxo de Caixa`, `Relatórios` e `Cadastros`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/styles.css apps/frontend/src/finance/FinanceWorkspace.tsx apps/frontend/src/finance/api.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/finance.test.ts apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx apps/frontend/src/finance/__tests__/FinanceOverviewPage.test.tsx apps/frontend/src/finance/__tests__/FinanceCadastrosPage.test.tsx apps/frontend/src/finance/__tests__/FinanceTransactionsPage.test.tsx apps/frontend/src/finance/__tests__/FinanceReportsPage.test.tsx
git commit -m "chore(finance): harden white-label erp finance v1"
```

---

## Self-Review

### Spec coverage
- `Financeiro` como app quase separado: coberto nas Tasks 1 e 2.
- Navegação aprovada: coberta na Task 2.
- Home `Executive Overview` + `Split control`: coberta na Task 3.
- KPIs executivos e fila operacional: cobertos na Task 3.
- Cadastros híbridos: cobertos na Task 4.
- Movimentações como ledger central: coberto na Task 5.
- Contas a receber / pagar: coberto na Task 6.
- Conciliação + fluxo de caixa: coberto na Task 7.
- Relatórios V1 + DRE gerencial: coberto na Task 8.
- Ajuste visual premium + verificação integrada: coberto na Task 9.

### Placeholder scan
Run:
```bash
python3 - <<'PY'
from pathlib import Path
import re

path = Path('docs/superpowers/plans/2026-04-21-financeiro-white-label-erp-v1.md')
text = path.read_text()
patterns = [
    r'\\b' + 'TO' + 'DO' + r'\\b',
    r'\\b' + 'TB' + 'D' + r'\\b',
    'implement ' + 'later',
    'fill in ' + 'details',
    'appropriate ' + 'error handling',
    'edge ' + 'cases',
    'similar to ' + 'Task',
]
matches = [pattern for pattern in patterns if re.search(pattern, text)]
print(matches)
PY
```
Expected: `[]`.

### Type consistency
- `organization_id` é o tenant fixo em todas as tasks.
- `financial_entity_id` substitui o antigo papel de contraparte operacional nas operações do financeiro.
- O sitemap é consistente em todas as tasks (`overview`, `transactions`, `receivables`, `payables`, `reconciliation`, `cashflow`, `reports`, `cadastros`).
