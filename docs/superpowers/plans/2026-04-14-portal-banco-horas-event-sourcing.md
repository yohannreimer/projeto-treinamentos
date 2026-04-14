# Banco de Horas Event-Driven (Portal + Operação Interna) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar banco de horas auditável por eventos, com saldo automático por contrato, sugestões pendentes com confirmação manual, card simples no portal do cliente e controle interno completo.

**Architecture:** Criar um event store append-only com projeções de leitura para saldo/extrato/sugestões e integrar reconciliação determinística por cliente. O portal consome projeções prontas (card premium e status claros), enquanto a operação interna confirma sugestões e registra ajustes manuais e horas reais de entregáveis via calendário vinculado.

**Tech Stack:** Node.js + Express + better-sqlite3 + Zod + TypeScript (backend), React + Vite + CSS + Vitest (frontend), node:test + supertest.

---

## File Structure and Responsibilities

### Backend (new)
- Create: `apps/backend/src/hours/types.ts`
  Responsabilidade: contratos de evento/projeção e enums de domínio de horas.
- Create: `apps/backend/src/hours/store.ts`
  Responsabilidade: append idempotente no event store e leitura de eventos por aggregate/cliente.
- Create: `apps/backend/src/hours/projector.ts`
  Responsabilidade: aplicar eventos e materializar projeções (`balance`, `ledger`, `pending`).
- Create: `apps/backend/src/hours/reconcile.ts`
  Responsabilidade: reconciliação determinística por cliente (gerar sugestões automáticas sem duplicar eventos).
- Create: `apps/backend/src/hours/service.ts`
  Responsabilidade: façade para append+project+queries usadas por rotas.
- Create: `apps/backend/src/hours/hours.test.ts`
  Responsabilidade: testes unitários de regra e projeção.

### Backend (existing)
- Modify: `apps/backend/src/db.ts`
  Responsabilidade: schema de event store/projeções e campos de classificação de módulo + vínculo de atividade.
- Modify: `apps/backend/src/coreRoutes.ts`
  Responsabilidade: APIs internas de banco de horas, confirmação/rejeição, ajustes manuais, extensão de módulos/admin e calendário.
- Modify: `apps/backend/src/portal/routes.ts`
  Responsabilidade: incluir `hours_summary` no `overview/planning` e acionar reconciliação segura no read path.
- Modify: `apps/backend/src/portal/readModels.test.ts`
  Responsabilidade: cobertura de card de horas no portal + filtros entregável/ministrado.

### Frontend (existing)
- Modify: `apps/frontend/src/types/index.ts`
  Responsabilidade: tipos de módulo e payloads com classificação de entrega/horas.
- Modify: `apps/frontend/src/services/api.ts`
  Responsabilidade: cliente HTTP para novas APIs de banco de horas e campos novos de módulo/atividade.
- Modify: `apps/frontend/src/pages/AdminPage.tsx`
  Responsabilidade: CRUD de módulo com `delivery_mode` e `client_hours_policy`.
- Modify: `apps/frontend/src/pages/CalendarPage.tsx`
  Responsabilidade: vínculo opcional de atividade a módulo + escopo de horas internas/cliente.
- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`
  Responsabilidade: painel interno de banco de horas (saldo, pendências, ajustes, extrato).
- Modify: `apps/frontend/src/portal/types.ts`
  Responsabilidade: contratos de `hours_summary` e módulos cliente-safe.
- Modify: `apps/frontend/src/portal/api.ts`
  Responsabilidade: consumir novos campos do overview/planning.
- Modify: `apps/frontend/src/portal/pages/PortalPlanningPage.tsx`
  Responsabilidade: card simples premium de banco de horas + tabela sem ruído.
- Modify: `apps/frontend/src/styles.css`
  Responsabilidade: sistema visual premium consistente para card/ledger/pendências.
- Modify: `apps/frontend/src/portal/__tests__/PortalPlanningPage.test.tsx`
  Responsabilidade: validação de render do card de horas e estados.

---

### Task 1: Schema Base (Event Store + Projeções + Campos de Classificação)

**Files:**
- Modify: `apps/backend/src/db.ts`

- [ ] **Step 1: Escrever teste de schema para tabelas de horas e colunas novas**
```ts
// apps/backend/src/hours/hours.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { db, initDb } from '../db.js';

test('db cria estrutura de banco de horas', () => {
  initDb();
  const table = db.prepare("select name from sqlite_master where type='table' and name='hours_event_store'").get();
  assert.ok(table);
});
```

- [ ] **Step 2: Rodar teste e confirmar falha inicial**
Run: `npm run test -w apps/backend -- src/hours/hours.test.ts`
Expected: FAIL com tabela/coluna ausente.

- [ ] **Step 3: Adicionar schema e ensureColumn no db**
```ts
// apps/backend/src/db.ts (trecho)
ensureColumn('module_template', 'delivery_mode', "delivery_mode text not null default 'ministrado'");
ensureColumn('module_template', 'client_hours_policy', "client_hours_policy text not null default 'consome'");
ensureColumn('calendar_activity', 'linked_module_id', 'linked_module_id text');
ensureColumn('calendar_activity', 'hours_scope', "hours_scope text not null default 'none'");

// tabelas novas
create table if not exists hours_event_store (...);
create unique index if not exists idx_hours_event_idempotency on hours_event_store(idempotency_key);
create table if not exists hours_projection_balance (...);
create table if not exists hours_projection_ledger (...);
create table if not exists hours_projection_pending (...);
```

- [ ] **Step 4: Rodar teste novamente**
Run: `npm run test -w apps/backend -- src/hours/hours.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit da fundação de schema**
```bash
git add apps/backend/src/db.ts apps/backend/src/hours/hours.test.ts
git commit -m "feat(hours): add event-store schema and module/activity hour fields"
```

### Task 2: Núcleo Event-Driven (Tipos, Store e Projector)

**Files:**
- Create: `apps/backend/src/hours/types.ts`
- Create: `apps/backend/src/hours/store.ts`
- Create: `apps/backend/src/hours/projector.ts`
- Create: `apps/backend/src/hours/service.ts`
- Modify: `apps/backend/src/hours/hours.test.ts`

- [ ] **Step 1: Definir contratos de evento e payloads suportados**
```ts
// types.ts
export type HoursEventType =
  | 'module_scope_defined'
  | 'hours_adjustment_suggested'
  | 'hours_adjustment_confirmed'
  | 'hours_adjustment_rejected'
  | 'hours_manual_adjustment_added'
  | 'training_encounter_completed'
  | 'deliverable_worklog_logged';
```

- [ ] **Step 2: Implementar append idempotente no store**
```ts
// store.ts
export function appendHoursEvent(input: AppendHoursEventInput) {
  // insert ignore by idempotency_key; retorna inserted: boolean
}
```

- [ ] **Step 3: Implementar projector para balance/ledger/pending**
```ts
// projector.ts
export function projectHoursEvent(event: HoursEventRow) {
  // switch(event_type) -> atualiza views materializadas
}
```

- [ ] **Step 4: Implementar façade do service (append+project+query)**
```ts
// service.ts
export function appendAndProject(input: AppendHoursEventInput) {
  // append -> se inseriu => project
}
```

- [ ] **Step 5: Cobrir cenários de projeção em teste**
```ts
// hours.test.ts
// 1) suggested nao altera saldo
// 2) confirmed altera saldo
// 3) manual adjustment altera saldo e entra no ledger
```

- [ ] **Step 6: Rodar suite de horas**
Run: `npm run test -w apps/backend -- src/hours/hours.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit do núcleo event-driven**
```bash
git add apps/backend/src/hours/*.ts
git commit -m "feat(hours): implement append-only event store and projectors"
```

### Task 3: Reconciliação Determinística por Cliente (Contrato Automático + Sugestões)

**Files:**
- Create: `apps/backend/src/hours/reconcile.ts`
- Modify: `apps/backend/src/hours/service.ts`
- Modify: `apps/backend/src/portal/routes.ts`
- Modify: `apps/backend/src/portal/readModels.test.ts`

- [ ] **Step 1: Extrair cálculo de horas contratadas/consumidas por módulo ministrado**
```ts
// reconcile.ts
// usa company_module_progress + jornada (Integral/Meio_periodo) para calcular:
// contracted_hours, consumed_hours, remaining_hours por company_id
```

- [ ] **Step 2: Gerar sugestões pendentes com chave idempotente por snapshot**
```ts
const idempotencyKey = `suggested:${companyId}:${moduleId}:${hash(snapshot)}`;
appendAndProject({ event_type: 'hours_adjustment_suggested', idempotency_key: idempotencyKey, ... });
```

- [ ] **Step 3: Integrar reconciliação em reads do portal (overview/planning)**
```ts
// portal/routes.ts
reconcileCompanyHours(context.company_id);
```

- [ ] **Step 4: Expor `hours_summary` no payload de overview/planning**
```ts
return res.status(200).json({
  ...,
  hours_summary: {
    available_hours,
    consumed_hours,
    balance_hours,
    remaining_diarias
  }
});
```

- [ ] **Step 5: Adicionar testes de read model para hours_summary**
Run: `npm run test -w apps/backend -- src/portal/readModels.test.ts`
Expected: PASS com asserts de `hours_summary` e projeções.

- [ ] **Step 6: Commit da reconciliação no read path**
```bash
git add apps/backend/src/hours/reconcile.ts apps/backend/src/hours/service.ts apps/backend/src/portal/routes.ts apps/backend/src/portal/readModels.test.ts
git commit -m "feat(hours): add deterministic company reconciliation and portal hour summary"
```

### Task 4: APIs Internas de Banco de Horas (Confirmar/Rejeitar/Ajustar)

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/types/index.ts`

- [ ] **Step 1: Criar endpoints internos por cliente**
```ts
// coreRoutes.ts
GET    /companies/:id/hours/summary
GET    /companies/:id/hours/ledger
GET    /companies/:id/hours/pending
POST   /companies/:id/hours/pending/:pendingId/confirm
POST   /companies/:id/hours/pending/:pendingId/reject
POST   /companies/:id/hours/adjustments
```

- [ ] **Step 2: Validar payload de ajuste manual**
```ts
const schema = z.object({
  delta_hours: z.number().finite().refine((n) => n !== 0),
  reason: z.string().trim().min(5).max(500)
});
```

- [ ] **Step 3: Ligar endpoints ao `hours/service`**
```ts
appendAndProject({ event_type: 'hours_manual_adjustment_added', payload: { delta_hours, reason } });
```

- [ ] **Step 4: Adicionar client API tipada no frontend**
```ts
hoursSummaryByCompany(companyId)
hoursLedgerByCompany(companyId)
hoursPendingByCompany(companyId)
confirmHoursSuggestion(companyId, pendingId)
rejectHoursSuggestion(companyId, pendingId)
createHoursAdjustment(companyId, payload)
```

- [ ] **Step 5: Build backend + frontend**
Run: `npm run build -w apps/backend && npm run build -w apps/frontend`
Expected: PASS.

- [ ] **Step 6: Commit das APIs internas de horas**
```bash
git add apps/backend/src/coreRoutes.ts apps/frontend/src/services/api.ts apps/frontend/src/types/index.ts
git commit -m "feat(hours): expose internal APIs for summary pending ledger and manual adjustments"
```

### Task 5: Classificação de Módulo no Admin (delivery_mode + policy)

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/frontend/src/pages/AdminPage.tsx`
- Modify: `apps/frontend/src/types/index.ts`
- Modify: `apps/frontend/src/services/api.ts`

- [ ] **Step 1: Estender schema de create/update módulo no backend**
```ts
const deliveryModeSchema = z.enum(['ministrado', 'entregavel']);
const hoursPolicySchema = z.enum(['consome', 'nao_consume']);
```

- [ ] **Step 2: Incluir campos no `/admin/catalog` e `/modules`**
```sql
select id, code, ..., delivery_mode, client_hours_policy from module_template
```

- [ ] **Step 3: Adicionar campos no formulário do AdminPage**
```tsx
<select value={editDeliveryMode}>...</select>
<select value={editHoursPolicy}>...</select>
```

- [ ] **Step 4: Ajustar payload de criar/editar módulo no frontend**
```ts
{ ..., delivery_mode: newDeliveryMode, client_hours_policy: newHoursPolicy }
```

- [ ] **Step 5: Rodar frontend test/build**
Run: `npm run test -w apps/frontend && npm run build -w apps/frontend`
Expected: PASS.

- [ ] **Step 6: Commit da classificação de módulo**
```bash
git add apps/backend/src/coreRoutes.ts apps/frontend/src/pages/AdminPage.tsx apps/frontend/src/types/index.ts apps/frontend/src/services/api.ts
git commit -m "feat(admin): add module delivery mode and client hour policy"
```

### Task 6: Calendário com Vínculo a Módulo e Worklog Interno de Entregáveis

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/frontend/src/pages/CalendarPage.tsx`
- Modify: `apps/frontend/src/services/api.ts`

- [ ] **Step 1: Estender schema create/update de atividade (`linked_module_id`, `hours_scope`)**
```ts
hours_scope: z.enum(['none', 'client_consumption', 'internal_effort']).default('none')
```

- [ ] **Step 2: Persistir vínculo e escopo no insert/update de `calendar_activity`**
```sql
insert into calendar_activity (..., linked_module_id, hours_scope, ...)
```

- [ ] **Step 3: Gerar evento `deliverable_worklog_logged` em escopo interno**
```ts
if (hours_scope === 'internal_effort' && linkedModule.delivery_mode === 'entregavel') {
  appendAndProject({ event_type: 'deliverable_worklog_logged', payload: { minutes_logged, module_id, activity_id } });
}
```

- [ ] **Step 4: Adicionar UI no formulário de atividade extra**
```tsx
<select value={activityCompanyId}>...</select>
<select value={linkedModuleId}>...</select>
<select value={hoursScope}>...</select>
```

- [ ] **Step 5: Validar regra UX**
Run: `npm run build -w apps/backend && npm run build -w apps/frontend`
Expected: PASS com formulário funcional e sem regressão.

- [ ] **Step 6: Commit da integração de calendário/worklog**
```bash
git add apps/backend/src/coreRoutes.ts apps/frontend/src/pages/CalendarPage.tsx apps/frontend/src/services/api.ts
git commit -m "feat(calendar): link activities to modules and log internal deliverable effort"
```

### Task 7: Portal Planejamento com Card Premium de Banco de Horas

**Files:**
- Modify: `apps/frontend/src/portal/types.ts`
- Modify: `apps/frontend/src/portal/api.ts`
- Modify: `apps/frontend/src/portal/pages/PortalPlanningPage.tsx`
- Modify: `apps/frontend/src/styles.css`
- Modify: `apps/frontend/src/portal/__tests__/PortalPlanningPage.test.tsx`

- [ ] **Step 1: Estender tipos do portal para `hours_summary`**
```ts
hours_summary?: {
  available_hours: number;
  consumed_hours: number;
  balance_hours: number;
  remaining_diarias: number;
  updated_at: string;
}
```

- [ ] **Step 2: Renderizar card simples no topo de Planejamento**
```tsx
<section className="portal-hours-card">
  <article><strong>{summary.available_hours}</strong><span>Disponível (h)</span></article>
  ...
</section>
```

- [ ] **Step 3: Garantir linguagem cliente-safe para entregáveis**
```tsx
// entregável mostra status de entrega; não mostra horas internas
```

- [ ] **Step 4: Ajuste visual premium coerente com marca**
```css
.portal-hours-card { border-radius: 18px; background: linear-gradient(...); }
```

- [ ] **Step 5: Cobrir render de card e fallback sem summary**
Run: `npm run test -w apps/frontend -- src/portal/__tests__/PortalPlanningPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit do card de banco de horas no portal**
```bash
git add apps/frontend/src/portal/types.ts apps/frontend/src/portal/api.ts apps/frontend/src/portal/pages/PortalPlanningPage.tsx apps/frontend/src/styles.css apps/frontend/src/portal/__tests__/PortalPlanningPage.test.tsx
git commit -m "feat(portal): add premium hour-bank summary card on planning"
```

### Task 8: Painel Interno por Cliente (Saldo, Pendências, Ajustes, Extrato)

**Files:**
- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`
- Modify: `apps/frontend/src/styles.css`
- Modify: `apps/frontend/src/services/api.ts`

- [ ] **Step 1: Carregar summary/pending/ledger ao abrir cliente**
```ts
const [hoursSummary, pendingRows, ledgerRows] = await Promise.all([
  api.hoursSummaryByCompany(id),
  api.hoursPendingByCompany(id),
  api.hoursLedgerByCompany(id)
]);
```

- [ ] **Step 2: Renderizar bloco de decisão com ações confirm/reject**
```tsx
<button onClick={() => api.confirmHoursSuggestion(id, pending.id)}>Confirmar</button>
<button onClick={() => api.rejectHoursSuggestion(id, pending.id)}>Rejeitar</button>
```

- [ ] **Step 3: Implementar formulário de ajuste manual (+/- horas + motivo)**
```tsx
api.createHoursAdjustment(id, { delta_hours: Number(delta), reason })
```

- [ ] **Step 4: Renderizar extrato cronológico (ledger)**
```tsx
<tr><td>{row.occurred_at}</td><td>{row.event_label}</td><td>{row.delta_hours}</td><td>{row.balance_after}</td></tr>
```

- [ ] **Step 5: Smoke de UX interna**
Run: `npm run build -w apps/frontend`
Expected: PASS e sem quebra no `ClientDetailPage`.

- [ ] **Step 6: Commit do painel interno de horas**
```bash
git add apps/frontend/src/pages/ClientDetailPage.tsx apps/frontend/src/services/api.ts apps/frontend/src/styles.css
git commit -m "feat(client-detail): add internal hour-bank controls and ledger"
```

### Task 9: Hardening + Validação Final

**Files:**
- Modify: `apps/backend/src/hours/hours.test.ts`
- Modify: `apps/backend/src/portal/readModels.test.ts`
- Modify: `apps/frontend/src/portal/__tests__/PortalPlanningPage.test.tsx`

- [ ] **Step 1: Cobrir idempotência e replay determinístico**
```ts
// mesmo idempotency_key não duplica saldo/ledger
```

- [ ] **Step 2: Cobrir fluxo completo suggested -> confirm/reject**
```ts
// pending -> confirmed altera saldo; pending -> rejected mantém saldo
```

- [ ] **Step 3: Rodar suíte completa**
Run: `npm run test -w apps/backend && npm run test -w apps/frontend && npm run build -w apps/backend && npm run build -w apps/frontend`
Expected: PASS total.

- [ ] **Step 4: Commit final de hardening**
```bash
git add apps/backend/src/hours apps/backend/src/portal/readModels.test.ts apps/frontend/src/portal/__tests__/PortalPlanningPage.test.tsx
git commit -m "test(hours): harden event idempotency and portal hour summary flow"
```

---

## Self-Review (Plan)
- **Spec coverage:** cobre event sourcing, classificação de módulo, sugestões pendentes com confirmação, ajuste manual por lançamento, card cliente simples, worklog interno de entregáveis e validação visual/técnica.
- **Placeholder scan:** nenhum TODO/TBD; todas as tasks possuem ações, arquivos e comandos de validação.
- **Type consistency:** `delivery_mode`, `client_hours_policy`, `hours_scope` e `hours_summary` mantidos com nomes consistentes entre schema, API e UI.

## Execution Handoff
Plan complete and saved to `docs/superpowers/plans/2026-04-14-portal-banco-horas-event-sourcing.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
