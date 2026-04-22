# ERP Financeiro Modular V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo Financeiro V1 multiempresa (core completo + billing opcional), integrado ao app atual via `Administração > Financeiro`, com operação híbrida (caixa + competência), import CSV/Excel/OFX e trilha auditável.

**Architecture:** Implementar um `finance core` orientado a ledgers/transações com read models para dashboard/DRE/projeção, mantendo separação por tenant e ativação de módulos por empresa. O workspace financeiro terá navegação própria no frontend, reaproveitando autenticação/RBAC/auditoria existentes. Billing SaaS entra como módulo opcional ligado ao mesmo núcleo de lançamentos.

**Tech Stack:** Node.js + Express + better-sqlite3 + Zod + TypeScript (backend), React + Vite + CSS + Vitest (frontend), node:test + supertest.

---

## Scope Check (decomposição obrigatória)
O spec aprovado cobre múltiplos subsistemas independentes. Para manter entrega testável e reduzir risco, este plano está dividido em 3 trilhas sequenciais:

1. **Trilha A (Fundação e Workspace):** schema financeiro, RBAC, navegação e shell financeiro.
2. **Trilha B (Operação Financeira Core):** movimentações, pagar/receber, importações, conciliação.
3. **Trilha C (Gestão Avançada):** DRE, projeção 90 dias, dívidas e billing opcional.

Cada trilha termina com software funcionando e validável isoladamente.

---

## File Structure and Responsibilities

### Backend (new)
- Create: `apps/backend/src/finance/types.ts`
  Responsabilidade: tipos de domínio financeiro (status, visões, payloads).
- Create: `apps/backend/src/finance/ledger.ts`
  Responsabilidade: regras canônicas de lançamento (caixa/competência, projetado/confirmado).
- Create: `apps/backend/src/finance/service.ts`
  Responsabilidade: façade de regras de negócio e consultas financeiras.
- Create: `apps/backend/src/finance/routes.ts`
  Responsabilidade: endpoints REST do módulo financeiro.
- Create: `apps/backend/src/finance/importers/csv.ts`
  Responsabilidade: parse e validação CSV/Excel -> staging.
- Create: `apps/backend/src/finance/importers/ofx.ts`
  Responsabilidade: parser OFX -> extrato normalizado.
- Create: `apps/backend/src/finance/reconcile.ts`
  Responsabilidade: matching e confirmação de conciliação.
- Create: `apps/backend/src/finance/finance.test.ts`
  Responsabilidade: cobertura da trilha A/B/C por cenários principais.

### Backend (existing)
- Modify: `apps/backend/src/db.ts`
  Responsabilidade: schema financeiro multiempresa + índices.
- Modify: `apps/backend/src/app.ts`
  Responsabilidade: registrar rotas financeiras.
- Modify: `apps/backend/src/internalAuth.ts`
  Responsabilidade: permissões financeiras e resumo natural de auditoria.
- Modify: `apps/backend/src/coreRoutes.ts`
  Responsabilidade: ativação de módulo financeiro por empresa e integração com auditoria atual.
- Modify: `apps/backend/src/test/appFactory.test.ts`
  Responsabilidade: garantir bootstrap com rotas financeiras.

### Frontend (new)
- Create: `apps/frontend/src/finance/types.ts`
  Responsabilidade: contratos do frontend para recursos financeiros.
- Create: `apps/frontend/src/finance/api.ts`
  Responsabilidade: client API financeiro (reaproveitando token interno).
- Create: `apps/frontend/src/finance/FinanceWorkspace.tsx`
  Responsabilidade: shell com sidebar financeira e botão "Voltar para Operações".
- Create: `apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceDrePage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceProjectionPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceDebtsPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceBillingPage.tsx`
- Create: `apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`

### Frontend (existing)
- Modify: `apps/frontend/src/App.tsx`
  Responsabilidade: rota protegida `/financeiro/*` e redirecionamentos.
- Modify: `apps/frontend/src/auth/session.ts`
  Responsabilidade: novas permissions `finance.*`.
- Modify: `apps/frontend/src/auth/navigation.ts`
  Responsabilidade: entrada `Financeiro` no menu de administração.
- Modify: `apps/frontend/src/services/api.ts`
  Responsabilidade: endpoints para ativação por tenant e metadados financeiros.
- Modify: `apps/frontend/src/components/Layout.tsx`
  Responsabilidade: contexto/topbar para o workspace financeiro.
- Modify: `apps/frontend/src/styles.css`
  Responsabilidade: tokens/estilo premium das telas financeiras.

---

### Task 1: Trilha A — Schema Financeiro Multiempresa

**Files:**
- Modify: `apps/backend/src/db.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste de schema para tabelas financeiras base**
```ts
// apps/backend/src/finance/finance.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, db } from '../db.js';

test('initDb cria schema financeiro v1', () => {
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
    const row = db.prepare("select name from sqlite_master where type='table' and name=?").get(name);
    assert.ok(row, `tabela ausente: ${name}`);
  }
});
```

- [ ] **Step 2: Rodar teste e verificar falha inicial**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: FAIL com tabelas ausentes.

- [ ] **Step 3: Adicionar schema v1 no banco**
```ts
// apps/backend/src/db.ts (trecho)
create table if not exists financial_account (
  id text primary key,
  company_id text not null,
  name text not null,
  kind text not null, -- bank|cash
  currency text not null default 'BRL',
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null,
  foreign key(company_id) references company(id) on delete cascade
);

create table if not exists financial_transaction (
  id text primary key,
  company_id text not null,
  kind text not null, -- income|expense|transfer|adjustment
  status text not null, -- planned|open|partial|settled|overdue|canceled
  amount_cents integer not null,
  issue_date text,
  due_date text,
  settlement_date text,
  competence_date text,
  account_id text,
  category_id text,
  cost_center_id text,
  source text not null default 'manual',
  source_ref text,
  note text,
  created_by text,
  created_at text not null,
  updated_at text not null,
  foreign key(company_id) references company(id) on delete cascade
);
```

- [ ] **Step 4: Rodar teste novamente**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit da fundação de schema**
```bash
git add apps/backend/src/db.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat(finance): add v1 multi-tenant financial schema"
```

### Task 2: Trilha A — Permissões Financeiras e Auditoria

**Files:**
- Modify: `apps/backend/src/internalAuth.ts`
- Modify: `apps/frontend/src/auth/session.ts`
- Modify: `apps/frontend/src/auth/navigation.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Criar teste de autorização para rotas financeiras**
```ts
test('rotas /finance exigem permissões financeiras', async () => {
  // setup usuário junior sem finance.read
  // GET /finance/overview -> 403
});
```

- [ ] **Step 2: Adicionar permission keys no backend e frontend**
```ts
// internalAuth.ts + session.ts
'finance.read',
'finance.write',
'finance.approve',
'finance.reconcile',
'finance.close',
'finance.billing'
```

- [ ] **Step 3: Mapear resumo natural da auditoria para ações financeiras**
```ts
// internalAuth.ts (trecho)
if (path.startsWith('/finance') && method === 'POST') {
  return {
    action_label: 'criou lançamento financeiro',
    resource_label: 'financeiro'
  };
}
```

- [ ] **Step 4: Exibir item `Financeiro` na navegação para quem tem `finance.read`**
```ts
// navigation.ts
{ to: '/financeiro', label: 'Financeiro', permissions: ['finance.read'] }
```

- [ ] **Step 5: Rodar testes de backend e frontend auth**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS
Run: `npm run test -w apps/frontend`
Expected: PASS

- [ ] **Step 6: Commit de RBAC financeiro**
```bash
git add apps/backend/src/internalAuth.ts apps/frontend/src/auth/session.ts apps/frontend/src/auth/navigation.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat(finance): add granular financial permissions and audit labels"
```

### Task 3: Trilha A — Workspace Financeiro no Frontend

**Files:**
- Create: `apps/frontend/src/finance/FinanceWorkspace.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/Layout.tsx`
- Test: `apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`

- [ ] **Step 1: Criar teste de roteamento do workspace**
```tsx
test('abre workspace financeiro e mostra botão voltar para operações', async () => {
  // render app autenticado com permission finance.read
  // navigate('/financeiro')
  // assert texto "Voltar para Operações"
});
```

- [ ] **Step 2: Criar shell financeiro com sidebar própria**
```tsx
// FinanceWorkspace.tsx
export function FinanceWorkspace() {
  return (
    <div className="finance-shell">
      <aside className="finance-sidebar">
        <NavLink to="overview">Visão Geral</NavLink>
        <NavLink to="transactions">Movimentações</NavLink>
        <NavLink to="receivables">Contas a Receber</NavLink>
        <NavLink to="payables">Contas a Pagar</NavLink>
      </aside>
      <main className="finance-main"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 3: Registrar rotas protegidas `/financeiro/*`**
```tsx
// App.tsx
<Route
  path="/financeiro/*"
  element={(
    <ProtectedRoute user={user} permissions={['finance.read']} fallback={defaultRoute}>
      <FinanceWorkspace />
    </ProtectedRoute>
  )}
/>
```

- [ ] **Step 4: Ajustar contexto visual/topbar para modo financeiro**
```tsx
// Layout.tsx
if (pathname.startsWith('/financeiro')) {
  return {
    title: 'Gestão Financeira',
    subtitle: 'Caixa, competência, projeção e governança.',
    badge: 'Financeiro'
  };
}
```

- [ ] **Step 5: Rodar testes frontend**
Run: `npm run test -w apps/frontend -- src/finance/__tests__/FinanceWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit do workspace financeiro**
```bash
git add apps/frontend/src/finance apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx
git commit -m "feat(finance-ui): add financial workspace shell and protected routes"
```

### Task 4: Trilha B — API de Movimentações Manuais (Core Ledger)

**Files:**
- Create: `apps/backend/src/finance/types.ts`
- Create: `apps/backend/src/finance/ledger.ts`
- Create: `apps/backend/src/finance/service.ts`
- Create: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/app.ts`
- Modify: `apps/frontend/src/finance/api.ts`
- Create: `apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever testes para criação/edição/exclusão lógica de lançamento**
```ts
test('POST /finance/transactions cria lançamento manual', async () => {
  // payload com due_date + competence_date
  // assert 201 + persistência
});

test('DELETE /finance/transactions/:id faz soft-delete auditável', async () => {
  // assert is_deleted = 1 e audit log gerado
});
```

- [ ] **Step 2: Implementar regras canônicas no ledger service**
```ts
// ledger.ts
export function computeViews(input: {
  amountCents: number;
  dueDate?: string;
  settlementDate?: string;
  competenceDate?: string;
}) {
  // define impactos em caixa/competência/projetado/confirmado
}
```

- [ ] **Step 3: Expor endpoints de movimentações**
```ts
// routes.ts
router.get('/overview', requireFinanceRead, handleFinanceOverviewGet);
router.get('/transactions', requireFinanceRead, handleFinanceTransactionsList);
router.post('/transactions', requireFinanceWrite, handleFinanceTransactionCreate);
router.patch('/transactions/:id', requireFinanceWrite, handleFinanceTransactionUpdate);
router.delete('/transactions/:id', requireFinanceApprove, handleFinanceTransactionSoftDelete);
```

- [ ] **Step 4: Conectar frontend com tabela e formulário de lançamento manual**
```tsx
// FinanceTransactionsPage.tsx
const onSubmit = async () => {
  await financeApi.createTransaction(form);
  await reload();
};
```

- [ ] **Step 5: Rodar testes backend + frontend do fluxo manual**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS
Run: `npm run test -w apps/frontend`
Expected: PASS

- [ ] **Step 6: Commit do core de movimentações**
```bash
git add apps/backend/src/finance apps/backend/src/app.ts apps/frontend/src/finance
git commit -m "feat(finance-core): add manual transactions and hybrid ledger views"
```

### Task 5: Trilha B — Contas a Pagar/Receber com Recorrência

**Files:**
- Create: `apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/finance/service.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste para títulos com parcela e recorrência mensal**
```ts
test('POST /finance/payables cria parcelas recorrentes', async () => {
  // assert quantidade de títulos criada e datas corretas
});
```

- [ ] **Step 2: Implementar endpoints de payable/receivable**
```ts
router.get('/payables', requireFinanceRead, handleFinancePayablesList);
router.post('/payables', requireFinanceWrite, handleFinancePayableCreate);
router.post('/payables/:id/settle', requireFinanceWrite, handleFinancePayableSettle);

router.get('/receivables', requireFinanceRead, handleFinanceReceivablesList);
router.post('/receivables', requireFinanceWrite, handleFinanceReceivableCreate);
router.post('/receivables/:id/settle', requireFinanceWrite, handleFinanceReceivableSettle);
```

- [ ] **Step 3: Implementar baixa parcial e status automático de atraso**
```ts
// service.ts
if (paidCents < totalCents) status = 'partial';
if (today > dueDate && openAmount > 0) status = 'overdue';
```

- [ ] **Step 4: Implementar telas de pagar/receber com filtros persistentes**
```tsx
// páginas de Pagar/Receber
// filtros: status, período, categoria, centro de custo
// ação: baixar total/parcial
```

- [ ] **Step 5: Rodar testes da trilha de títulos**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit de contas a pagar/receber**
```bash
git add apps/backend/src/finance apps/frontend/src/finance/pages/FinancePayablesPage.tsx apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx
git commit -m "feat(finance-ar-ap): add payables and receivables with recurrence and settlement"
```

### Task 6: Trilha B — Importação CSV/Excel para Staging

**Files:**
- Create: `apps/backend/src/finance/importers/csv.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste de import job com validação de colunas obrigatórias**
```ts
test('POST /finance/imports/csv cria job e rejeita schema inválido', async () => {
  // assert 422 quando faltam colunas
});
```

- [ ] **Step 2: Implementar parser e staging com hash de linha (idempotência)**
```ts
// csv.ts
export function normalizeCsvRows(rows: unknown[]) {
  // retorna linhas normalizadas com row_hash
}
```

- [ ] **Step 3: Expor endpoint de import e consulta de job**
```ts
router.post('/imports/csv', requireFinanceWrite, handleFinanceCsvImportCreate);
router.get('/imports/:id', requireFinanceRead, handleFinanceImportJobGetById);
```

- [ ] **Step 4: Adicionar UX de upload e pré-visualização de import**
```tsx
// Transactions page -> card "Importar CSV/Excel"
// mostra linhas válidas/inválidas antes de confirmar aplicação
```

- [ ] **Step 5: Rodar testes de import**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit de import CSV/Excel**
```bash
git add apps/backend/src/finance/importers/csv.ts apps/backend/src/finance/routes.ts apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx
git commit -m "feat(finance-import): add csv/xlsx staging import with validation"
```

### Task 7: Trilha B — OFX e Conciliação Manual/Assistida

**Files:**
- Create: `apps/backend/src/finance/importers/ofx.ts`
- Create: `apps/backend/src/finance/reconcile.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Create: `apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste de parse OFX e criação de extrato**
```ts
test('POST /finance/imports/ofx registra entradas normalizadas', async () => {
  // assert bank_statement_entries > 0
});
```

- [ ] **Step 2: Implementar parser OFX mínimo e normalizador**
```ts
// ofx.ts
export function parseOfx(content: string): NormalizedStatementEntry[] {
  // parse BANKTRANLIST -> date, amount, memo, fitid
}
```

- [ ] **Step 3: Implementar sugestão e confirmação de match**
```ts
// reconcile.ts
export function suggestMatches(entries, transactions) {
  // score por valor + janela de data + memo
}
```

- [ ] **Step 4: Criar tela de conciliação com ações Confirmar/Desfazer**
```tsx
// FinanceReconciliationPage
// lista extrato + sugestão + botão confirmar
```

- [ ] **Step 5: Rodar testes de conciliação**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit da conciliação OFX**
```bash
git add apps/backend/src/finance/importers/ofx.ts apps/backend/src/finance/reconcile.ts apps/backend/src/finance/routes.ts apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx
git commit -m "feat(finance-reconcile): add ofx import and assisted reconciliation"
```

### Task 8: Trilha C — DRE e Orçamento vs Realizado

**Files:**
- Create: `apps/frontend/src/finance/pages/FinanceDrePage.tsx`
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste de DRE híbrida (caixa e competência)**
```ts
test('GET /finance/dre retorna visões caixa e competência no período', async () => {
  // assert totais e margens
});
```

- [ ] **Step 2: Implementar agregador DRE por plano de contas**
```ts
// service.ts
export function buildDre(companyId: string, from: string, to: string) {
  // receita bruta, deduções, custos/despesas, EBITDA, resultado líquido
}
```

- [ ] **Step 3: Expor endpoint de orçamento vs realizado**
```ts
router.get('/budget-vs-actual', requireFinanceRead, handleFinanceBudgetVsActualGet);
router.put('/budget-lines', requireFinanceWrite, handleFinanceBudgetLinesUpsert);
```

- [ ] **Step 4: Renderizar DRE e budget no frontend com alternância de visão**
```tsx
// FinanceDrePage.tsx
// tabs: Competência | Caixa
```

- [ ] **Step 5: Rodar testes da trilha controladoria**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit DRE + orçamento**
```bash
git add apps/backend/src/finance/service.ts apps/backend/src/finance/routes.ts apps/frontend/src/finance/pages/FinanceDrePage.tsx
git commit -m "feat(finance-control): add dre and budget-vs-actual endpoints and ui"
```

### Task 9: Trilha C — Projeção 90 Dias e Dívidas

**Files:**
- Create: `apps/frontend/src/finance/pages/FinanceProjectionPage.tsx`
- Create: `apps/frontend/src/finance/pages/FinanceDebtsPage.tsx`
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste de projeção (confirmado + previsto)**
```ts
test('GET /finance/projection/90d calcula saldo diário com eventos futuros', async () => {
  // assert dia inicial, alertas e saldo final
});
```

- [ ] **Step 2: Implementar cálculo de projeção com thresholds de alerta**
```ts
// service.ts
export function projectCash90d(companyId: string, startDate: string) {
  // simula 90 dias e marca status ok/atencao/risco
}
```

- [ ] **Step 3: Implementar CRUD de dívidas com prioridade e status**
```ts
router.get('/debts', requireFinanceRead, handleFinanceDebtsList);
router.post('/debts', requireFinanceWrite, handleFinanceDebtCreate);
router.patch('/debts/:id', requireFinanceWrite, handleFinanceDebtUpdate);
```

- [ ] **Step 4: Criar telas de projeção e dívidas com filtros**
```tsx
// projection + debts pages
```

- [ ] **Step 5: Rodar testes de projeção/dívidas**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit projeção e dívidas**
```bash
git add apps/backend/src/finance/service.ts apps/backend/src/finance/routes.ts apps/frontend/src/finance/pages/FinanceProjectionPage.tsx apps/frontend/src/finance/pages/FinanceDebtsPage.tsx
git commit -m "feat(finance-cashflow): add 90-day projection and debt management"
```

### Task 10: Trilha C — Billing SaaS Opcional por Tenant

**Files:**
- Create: `apps/frontend/src/finance/pages/FinanceBillingPage.tsx`
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/backend/src/coreRoutes.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Escrever teste de ativação de módulo billing por empresa**
```ts
test('billing só responde para tenant com módulo ativo', async () => {
  // tenant sem módulo -> 404/feature-disabled
});
```

- [ ] **Step 2: Implementar endpoints de plano/assinatura/fatura**
```ts
router.get('/billing/plans', requireFinanceBilling, handleFinanceBillingPlansList);
router.post('/billing/subscriptions', requireFinanceBilling, handleFinanceBillingSubscriptionCreate);
router.post('/billing/invoices', requireFinanceBilling, handleFinanceBillingInvoiceCreate);
```

- [ ] **Step 3: Integrar fatura com ledger financeiro**
```ts
// invoice issued -> receivable planned
// invoice settled -> transaction settled
```

- [ ] **Step 4: Exibir menu Billing condicional por módulo ativo**
```tsx
// FinanceWorkspace.tsx
{features.billingEnabled ? <NavLink to="billing">Billing SaaS</NavLink> : null}
```

- [ ] **Step 5: Rodar testes do billing opcional**
Run: `npm run test -w apps/backend -- src/finance/finance.test.ts`
Expected: PASS

- [ ] **Step 6: Commit billing opcional**
```bash
git add apps/backend/src/finance apps/backend/src/coreRoutes.ts apps/frontend/src/finance/pages/FinanceBillingPage.tsx apps/frontend/src/finance/FinanceWorkspace.tsx
git commit -m "feat(finance-billing): add optional tenant billing module"
```

### Task 11: Hardening, Smoke e Regressão

**Files:**
- Modify: `apps/backend/src/finance/finance.test.ts`
- Modify: `apps/frontend/src/test/smoke.test.ts`
- Create: `apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`

- [ ] **Step 1: Cobrir cenários de regressão críticos**
```ts
// backend tests
// - não duplica import OFX
// - não permite lançamento sem tenant
// - conciliação não altera saldo duas vezes
```

- [ ] **Step 2: Adicionar smoke de render/rota financeira no frontend**
```tsx
test('rota /financeiro renderiza visão geral sem crash', async () => {
  // assert título de Gestão Financeira
});
```

- [ ] **Step 3: Rodar suíte completa backend**
Run: `npm run test -w apps/backend`
Expected: PASS

- [ ] **Step 4: Rodar suíte completa frontend**
Run: `npm run test -w apps/frontend`
Expected: PASS

- [ ] **Step 5: Build completo**
Run: `npm run build`
Expected: build backend + frontend sem erros.

- [ ] **Step 6: Commit de hardening**
```bash
git add apps/backend/src/finance/finance.test.ts apps/frontend/src/test/smoke.test.ts apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx
git commit -m "test(finance): add smoke and regression coverage for v1"
```

### Task 12: Documentação Operacional e Rollout

**Files:**
- Create: `docs/superpowers/specs/financeiro-v1-mapeamento-planilha.md`
- Create: `docs/superpowers/plans/financeiro-v1-go-live-checklist.md`
- Modify: `README.md`

- [ ] **Step 1: Documentar mapeamento da planilha para entidades do sistema**
```md
# Mapeamento Planilha -> ERP Financeiro
- Entradas -> financial_transaction(kind=income)
- Saídas -> financial_transaction(kind=expense)
- Fixos -> recurrence_rules + payables
- Variáveis -> financial_transaction(kind=expense, source=manual/import)
- DRE -> read model `buildDre(companyId, from, to)`
- Dívidas -> financial_debt + fluxo de atualização por status
```

- [ ] **Step 2: Criar checklist de go-live (paralelo planilha x sistema)**
```md
- Semana 1: lançar tudo em paralelo
- Semana 2: validar diferenças < 1%
- Semana 3: freeze planilha
```

- [ ] **Step 3: Atualizar README com novo módulo Financeiro**
```md
## Módulo Financeiro
Acesso: Administração > Financeiro
```

- [ ] **Step 4: Rodar lint/test/build final de release candidate**
Run: `npm run test -w apps/backend && npm run test -w apps/frontend && npm run build`
Expected: PASS

- [ ] **Step 5: Commit da documentação de rollout**
```bash
git add docs/superpowers/specs/financeiro-v1-mapeamento-planilha.md docs/superpowers/plans/financeiro-v1-go-live-checklist.md README.md
git commit -m "docs(finance): add migration mapping and go-live checklist"
```

---

## Spec Coverage Check (self-review)
- Multiempresa e modularidade por tenant: coberto nas Tasks 1, 2 e 10.
- Workspace financeiro integrado com navegação dedicada: Task 3.
- Core financeiro completo (manual): Tasks 4 e 5.
- Imports CSV/Excel/OFX e conciliação: Tasks 6 e 7.
- DRE e visão híbrida: Task 8.
- Projeção 90 dias e dívidas: Task 9.
- Billing SaaS opcional: Task 10.
- Auditoria e hardening: Tasks 2 e 11.
- Migração da planilha e rollout: Task 12.

## Placeholder Scan (self-review)
- Não há `TODO`, `TBD` ou "implementar depois" no plano.
- Cada task possui arquivos, comandos e expectativa de resultado.

## Type/Contract Consistency (self-review)
- Permissões financeiras usam prefixo `finance.*` em backend e frontend.
- Rotas do workspace frontend usam `/financeiro/*`.
- Rotas de API backend usam `/finance/*`.
- Estratégia híbrida (caixa/competência) centralizada no `ledger.ts`.
