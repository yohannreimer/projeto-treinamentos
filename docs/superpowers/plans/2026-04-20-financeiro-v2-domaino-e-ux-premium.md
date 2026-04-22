# Financeiro V2 (Domínio Correto + UX Premium) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o módulo financeiro para operar por empresa dona da conta (Holand), com clientes/fornecedores como contrapartes, e elevar UX/UI para padrão SaaS premium de operação diária.

**Architecture:** Introduzir `organization` como tenant financeiro, manter `company` como contraparte operacional, migrar o núcleo financeiro para `organization_id`, e separar contexto de operação (`finance context`) de cadastro de clientes. O frontend passa a operar em contexto fixo da organização logada, removendo seletor de “empresa” em telas financeiras.

**Tech Stack:** Node.js + Express + SQLite (better-sqlite3), React + TypeScript + Vite, CSS tokens atuais do projeto.

---

## Premissa de Domínio (bloqueante)

1. `organization` = empresa dona da conta do sistema (ex.: Holand).
2. `company` = contraparte operacional/comercial (clientes e fornecedores da organização).
3. O módulo `Financeiro` é sempre da `organization` logada.
4. Clientes da Holand nunca são tratados como “empresa financeira principal”.

## Benchmark Baseline (produto de referência)

### ERPNext (docs oficiais)
- Estrutura madura de `Chart of Accounts`, `Journal Entry`, `Payment Entry`, `Payment Reconciliation`, `AR/AP Aging`, fechamento por período e multi-moeda.
- Referências:
  - https://docs.frappe.io/erpnext/payment-entry
  - https://docs.frappe.io/erpnext/user/manual/en/accounts-receivable-and-payable
  - https://docs.frappe.io/erpnext/v14/user/manual/en/accounts/payment-reconciliation

### BigCapital (open source)
- Posicionamento de “headless accounting”, double-entry e relatórios financeiros inteligentes.
- Reuso seguro: padrões de arquitetura e fluxo, sem copiar blocos AGPL para core proprietário sem avaliação legal.
- Referências:
  - https://github.com/bigcapitalhq/bigcapital
  - https://docs.bigcapital.app/

### Conta Azul (mercado BR)
- Ênfase em conciliação bancária, contas a pagar/receber, cobrança, NF-e/NFS-e/NFC-e e operação diária simples para PMEs.
- Referências:
  - https://contaazul.com/
  - https://contaazul.com/funcionalidades/conciliacao-bancaria/

## Extração da planilha atual Holand (fonte funcional)

Workbook analisado: `Controle Finanças Holand.xlsx` com abas:
- Dashboard e KPIs
- Premissas (fiscal e metas)
- Histórico mensal
- Orçamento vs realizado
- Entradas e Saídas
- Custos fixos e variáveis
- Fluxo por cliente/projeto
- Catálogo de serviços
- Pipeline comercial
- DRE
- Projeção de caixa (90 dias)
- Simulação
- Dívidas

Essas abas viram os épicos funcionais do V2.

## Norte de UX/UI Premium (SaaS operacional)

1. Linguagem visual unificada com a marca Holand (Inter + tokens sóbrios; vermelho apenas para ação/alerta).
2. Fluxo de trabalho orientado a “inbox operacional”:
   - hoje vencendo
   - vencido
   - sem categoria
   - sem conciliar
3. Redução de fricção:
   - atalhos rápidos
   - lançamentos em lote
   - filtros salvos
   - ações contextuais
4. Auditabilidade sem ruído:
   - timeline legível em linguagem natural
   - drill-down por card (consumido projetado/confirmado, origem dos números)
5. Densidade alternável (`compacto` / `confortável`) com sticky header em tabelas.

## Estratégia de Reuso de Código (compliance)

1. ERPNext/BigCapital usados como referência de domínio e padrões de fluxo.
2. Não copiar código AGPL para partes núcleo sem trilha legal explícita.
3. Priorizar:
   - ideias de modelagem
   - nomenclatura operacional
   - estrutura de UX (não identidade visual deles)
4. Se algum trecho open source for realmente necessário:
   - isolar em adapter
   - manter cabeçalhos de licença
   - registrar em `docs/superpowers/specs/finance-oss-attribution.md`.

## Entrega por Fases (com gates)

### Gate A — Domínio correto
- Financeiro opera por `organization_id`.
- Contraparte aparece apenas onde necessário.
- Não existe mais seletor de “empresa financeira principal” apontando para cliente.

### Gate B — Operação diária completa
- Movimentações, AP, AR, conciliação, dívidas e fechamento mensal funcionando sem planilha.

### Gate C — Gestão avançada
- DRE, projeção 90 dias, orçamento vs realizado e simulação anual com drill-down.

### Gate D — Fiscal-ready
- Contratos e eventos de integração prontos para NFS-e/NF-e/SPED, ainda sem ativar integrações fiscais.

---

### Task 1: Foundation de Domínio (organization + contexto financeiro)

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/internalAuth.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Criar tabela `organization` e vínculo em `internal_user`**

```sql
create table if not exists organization (
  id text primary key,
  name text not null unique,
  slug text not null unique,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null
);
```

```sql
alter table internal_user add column organization_id text references organization(id) on delete set null;
```

- [ ] **Step 2: Seed de organização default e vínculo dos usuários atuais**

```sql
insert or ignore into organization (id, name, slug, is_active, created_at, updated_at)
values ('org-holand', 'Holand', 'holand', 1, ?, ?);
```

```sql
update internal_user
set organization_id = coalesce(organization_id, 'org-holand')
where organization_id is null;
```

- [ ] **Step 3: Expor `organization_id` no contexto interno (auth/me e session)**

```ts
type InternalAuthContext = {
  internal_user_id: string;
  username: string;
  // ...
  organization_id: string | null;
};
```

- [ ] **Step 4: Rodar testes de regressão**

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsx --test apps/backend/src/finance/finance.test.ts`  
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/internalAuth.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat(finance-domain): add organization foundation and auth binding"
```

### Task 2: Migração Financeira para `organization_id`

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Adicionar `organization_id` nas tabelas financeiras**

Tables: `financial_account`, `financial_category`, `financial_transaction`, `financial_payable`, `financial_receivable`, `financial_import_job`, `financial_bank_statement_entry`, `financial_reconciliation_match`, `financial_debt`, `billing_plan`, `billing_subscription`, `billing_invoice`.

- [ ] **Step 2: Backfill de dados legados**

```sql
update financial_transaction
set organization_id = 'org-holand'
where organization_id is null;
```

(repetir para todas as tabelas financeiras)

- [ ] **Step 3: Endurecer constraints e índices por organização**

```sql
create index if not exists idx_financial_transaction_org_status_due
on financial_transaction(organization_id, status, due_date);
```

- [ ] **Step 4: Atualizar DTOs/queries para retornar `organization_id` e manter `counterparty` separado**

```ts
type FinanceTransactionDto = {
  organization_id: string;
  counterparty_company_id: string | null;
  // ...
};
```

- [ ] **Step 5: Rodar suíte de testes financeira**

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsx --test apps/backend/src/finance/finance.test.ts`  
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/finance/types.ts apps/backend/src/finance/service.ts apps/backend/src/finance/finance.test.ts
git commit -m "refactor(finance-domain): migrate financial core to organization_id"
```

### Task 3: API de Contexto Financeiro (sem seletor de empresa)

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/api.ts`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Criar endpoint `GET /finance/context`**

Retorno:

```json
{
  "organization_id": "org-holand",
  "organization_name": "Holand",
  "currency": "BRL",
  "timezone": "America/Sao_Paulo"
}
```

- [ ] **Step 2: Tornar `company_id` opcional nas rotas financeiras e interpretar como `counterparty_company_id`**

- [ ] **Step 3: Atualizar client API**

```ts
getContext: () => req<FinanceContext>('/finance/context')
```

- [ ] **Step 4: Testes**

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsx --test apps/backend/src/finance/finance.test.ts`  
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/finance/routes.ts apps/backend/src/finance/service.ts apps/frontend/src/finance/api.ts apps/backend/src/finance/finance.test.ts
git commit -m "feat(finance-api): add finance context and counterparty-aware contracts"
```

### Task 4: Frontend — Contexto Fixo da Organização

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/FinanceWorkspace.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceDebtsPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`

- [ ] **Step 1: Remover dropdown de “Empresa” das páginas financeiras**
- [ ] **Step 2: Carregar `finance context` no mount e usar `organization_id` implicitamente**
- [ ] **Step 3: Introduzir seletor de contraparte apenas quando fizer sentido (AP/AR/lançamentos)**
- [ ] **Step 4: Ajustar labels para “Contraparte (cliente/fornecedor)”**
- [ ] **Step 5: Teste e build**

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix apps/frontend test -- --run src/finance/__tests__/FinanceWorkspace.test.tsx`  
Expected: pass

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix apps/frontend run build`  
Expected: build ok

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/finance/FinanceWorkspace.tsx apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx apps/frontend/src/finance/pages/FinancePayablesPage.tsx apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx apps/frontend/src/finance/pages/FinanceDebtsPage.tsx apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx
git commit -m "refactor(finance-ui): switch to organization context and counterparty flows"
```

### Task 5: UX/UI Premium Pass 1 (sistema visual financeiro)

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/FinanceWorkspace.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/*.tsx`

- [ ] **Step 1: Criar tokens financeiros (surface, border, emphasis, danger, success)**
- [ ] **Step 2: Reestruturar layouts com grid operacional (header fixo + painel lateral + foco de ação)**
- [ ] **Step 3: Tabelas premium (toolbar, densidade, sticky header, ações em lote)**
- [ ] **Step 4: Estados visuais consistentes (vazio, erro, loading, sucesso)**
- [ ] **Step 5: Build**

Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix apps/frontend run build`  
Expected: build ok

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/styles.css apps/frontend/src/finance/FinanceWorkspace.tsx apps/frontend/src/finance/pages
git commit -m "feat(finance-ui): premium visual system and dense operational layouts"
```

### Task 6: Lançamentos Profissionais (recorrência, baixa parcial, anexos)

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Adicionar campos de recorrência em transações**
- [ ] **Step 2: Adicionar baixa parcial e histórico de baixa**
- [ ] **Step 3: Adicionar anexo de comprovante (metadados + storage já existente)**
- [ ] **Step 4: Testes de regras críticas**
- [ ] **Step 5: Commit**

### Task 7: AP/AR Profundo (comportamento conta azul)

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinancePayablesPage.tsx`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Aging buckets (vencidos, hoje, próximos 7/30 dias)**
- [ ] **Step 2: Filtros salvos + ações em lote**
- [ ] **Step 3: Fluxo de negociação (juros/multa/desconto)**
- [ ] **Step 4: Testes e build**
- [ ] **Step 5: Commit**

### Task 8: Conciliação 2.0

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Matching automático por regra (valor/data/descrição/ref)**
- [ ] **Step 2: Inbox de pendências de conciliação com score**
- [ ] **Step 3: Aprovar/rejeitar em massa**
- [ ] **Step 4: Testes e commit**

### Task 9: Fechamento mensal + travas

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/db.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
- Test: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Criar tabela de períodos fechados**
- [ ] **Step 2: Bloquear mutações em competência fechada (exceto permissão de fechamento)**
- [ ] **Step 3: Tela de fechamento e reabertura controlada**
- [ ] **Step 4: Testes e commit**

### Task 10: Auditoria e export operacional

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/internalAuth.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/routes.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Expandir eventos de auditoria financeira em linguagem natural**
- [ ] **Step 2: Export CSV por período com filtros**
- [ ] **Step 3: Retenção operacional + paginação**
- [ ] **Step 4: Testes e commit**

### Task 11: Fiscal-Ready (contratos, sem integrar agora)

**Files:**
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/fiscalAdapter.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/types.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/service.ts`

- [ ] **Step 1: Definir contrato de adapter fiscal (NF-e/NFS-e/SPED)**
- [ ] **Step 2: Emitir eventos financeiros padronizados para integração futura**
- [ ] **Step 3: Documentar interface e critérios de compatibilidade**
- [ ] **Step 4: Commit**

### Task 12: Hardening final + rollout

**Files:**
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/backend/src/finance/finance.test.ts`
- Modify: `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/__tests__/FinanceWorkspace.test.tsx`
- Create: `/Users/yohannreimer/Documents/Projeto Treinamentos/docs/superpowers/specs/2026-04-20-financeiro-v2-rollout.md`

- [ ] **Step 1: Smoke suite completa backend + frontend**
- [ ] **Step 2: Checklist de regressão funcional com dados reais de homologação**
- [ ] **Step 3: Plano de rollback e toggles de release**
- [ ] **Step 4: Commit final de estabilização**

---

## Verification Commands (every checkpoint)

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsx --test apps/backend/src/finance/finance.test.ts
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --workspace apps/backend run build
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix apps/frontend test -- --run src/finance/__tests__/FinanceWorkspace.test.tsx
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm --prefix apps/frontend run build
```

## Rollout Order

1. Task 1–4 (domínio + contexto)  
2. Task 5 (UI base premium)  
3. Task 6–8 (motor operacional completo)  
4. Task 9–12 (governança, auditoria, fiscal-ready e hardening)

## Non-Goals (V2)

- Integração fiscal BR ativa (somente contrato pronto)
- Cobrança bancária automática
- Módulo contábil completo de razão/livros fiscais

## Critérios de Aceite por Macrocapacidade

1. **Domínio corrigido**
- `GET /finance/context` retorna sempre a organização logada.
- Nenhuma rota financeira principal depende de selecionar cliente para operar base financeira.

2. **Confiabilidade de saldo**
- Cards de resumo batem 100% com drill-down de origem.
- Ajustes manuais alteram consumo (não alteram disponível contratual base).

3. **Conciliação**
- Importação + matching + confirmação geram trilha auditável.
- Reprocessamento não duplica movimentação.

4. **UX operacional**
- Usuário consegue lançar, classificar, conciliar e fechar período sem sair do workspace.
- Tempo de execução de tarefas repetidas reduz com lote, filtros salvos e atalhos.

5. **Governança**
- RBAC financeiro aplicado.
- Auditoria natural + export CSV disponível.
- Retenção configurável sem crescimento descontrolado de histórico.

## Ordem recomendada de execução prática

1. Executar Task 1 a 4 (domínio e contexto fixo).
2. Executar Task 5 (padrão visual premium unificado).
3. Executar Task 6 a 8 (núcleo operacional completo).
4. Executar Task 9 e 10 (governança e rastreabilidade).
5. Executar Task 11 e 12 (fiscal-ready, hardening e rollout).
