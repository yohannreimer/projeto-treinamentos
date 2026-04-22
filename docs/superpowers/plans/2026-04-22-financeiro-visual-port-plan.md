# Financeiro Visual Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the visual language from `/Users/yohannreimer/Downloads/finance 2` into the real finance module so every finance page feels materially identical in shell, hierarchy, typography, spacing, cards, filters, and tables while preserving the existing white-label ERP domain and live backend behavior.

**Architecture:** Keep the approved finance domain and routing intact; replace the module shell and page presentation layer with a finance-specific design system derived from `finance 2`. Use shared finance UI primitives and tokens to keep the port consistent across `Visão Geral`, `Movimentações`, `Contas a Receber`, `Contas a Pagar`, `Conciliação`, `Fluxo de Caixa`, `Relatórios`, and `Cadastros`.

**Tech Stack:** React, TypeScript, Vite, CSS, existing finance frontend pages/components under `apps/frontend/src/finance`, finance API contracts already in place, Vitest/RTL frontend tests.

---

## Reference Inputs

- Visual source of truth:
  - `/Users/yohannreimer/Downloads/finance 2/index.html`
  - `/Users/yohannreimer/Downloads/finance 2/shared.jsx`
  - `/Users/yohannreimer/Downloads/finance 2/app.jsx`
  - `/Users/yohannreimer/Downloads/finance 2/pages/overview.jsx`
  - `/Users/yohannreimer/Downloads/finance 2/pages/transactions.jsx`
  - `/Users/yohannreimer/Downloads/finance 2/pages/reconciliation.jsx`
- Approved product/design spec:
  - `/Users/yohannreimer/Documents/Projeto Treinamentos/docs/superpowers/specs/2026-04-22-financeiro-visual-port-design.md`

## Constraints

- Do not reintroduce the old orquestrador shell into the finance module.
- Do not alter the approved finance domain model to fit mock UI shortcuts.
- Do not introduce fake or hard-coded business data to mimic the prototype.
- Preserve real loading, empty, and error states, but style them in the new visual language.
- Finance uses its own typography and shell even while sharing auth and company context with the rest of the SaaS.
- Avoid decorative gradients, glassmorphism, or generic dashboard styling that diverges from `finance 2`.

## Implementation Strategy

Port in layers:
1. finance-wide visual foundation and shell
2. page header / KPI / panel / table primitives
3. page-by-page port from highest-visibility to most operational
4. cross-page consistency and polish
5. verification and screenshot/manual review

---

## Task 1 — Port Finance Design Tokens and Shell

**Why:** The module will never feel "really equal" until the shell, typography, spacing, and base surfaces match the reference everywhere.

- [ ] Port the base finance design tokens into the frontend style layer:
  - `DM Sans` as finance body/headline font
  - `DM Mono` for numeric values, ledger figures, IDs, and dates when appropriate
  - background `#f1f5f9`
  - surface `#ffffff`
  - border `#e2e8f0`
  - text `#0f172a`, `#64748b`, `#94a3b8`
  - accent `#ea580c`
  - radius/sizing/spacing scale from the prototype
- [ ] Update the finance workspace shell to match the prototype structure:
  - independent finance sidebar
  - finance-specific content container width and paddings
  - finance footer/back action style
  - finance navigation active/hover states
- [ ] Remove remaining shell artifacts that still visually read as “adapted from the orquestrador”.
- [ ] Ensure the shell works across all finance routes without page-level overrides fighting the layout.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/FinanceWorkspace.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/FinanceSidebar.tsx`

**Verification:**
- finance workspace route renders with only finance shell
- typography and base colors match the approved port

**Commit:** `feat(finance): port finance shell and visual tokens`

---

## Task 2 — Create Shared Finance UI Primitives

**Why:** Page-by-page fidelity will drift unless we centralize the recurring visual patterns from the prototype.

- [ ] Create or refactor shared finance UI primitives for:
  - page header with eyebrow/title/subtitle/meta area
  - KPI card
  - section card / panel shell
  - finance table shell
  - finance badge/status pill
  - finance filter block
  - empty state / loading state / inline error state
- [ ] Align these primitives to the reference in density, type scale, border treatment, and spacing.
- [ ] Make sure numeric rendering can opt into `DM Mono` without ad-hoc per-page hacks.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/components/*`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/styles.css`

**Verification:**
- primitives are reused by at least two finance pages before moving on
- no page-specific visual duplication for the same card/header/table patterns

**Commit:** `feat(finance): add shared finance visual primitives`

---

## Task 3 — Port Finance Overview to Match the Reference

**Why:** The home page is the strongest credibility signal and should read almost one-to-one with the prototype’s `Executive Overview` / `Split control` feel.

- [ ] Port the `Visão Geral` page structure to the approved layout:
  - editorial page header
  - KPI band
  - split between executive reading and operational queue
  - primary flow visualization block
  - action cards/quick actions that preserve the current domain
- [ ] Make the page visually match the reference in rhythm, spacing, card composition, and number treatment.
- [ ] Preserve real finance metrics and current white-label ERP semantics.
- [ ] Ensure empty states still look premium when there is no real data.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceOverviewPage.tsx`
- any shared finance overview components created/extracted

**Verification:**
- page visually matches the approved mock direction
- tests still pass or are updated to match new structure

**Commit:** `feat(finance): port finance overview visual design`

---

## Task 4 — Port Movimentações to the Real Ledger Design

**Why:** `Movimentações` is the operational core and must look like a premium ERP ledger, not a generic admin table.

- [ ] Port the `transactions.jsx` visual language into the live ledger page:
  - page header
  - summary cards
  - filter module
  - main table structure
  - right-side or lower drill-down panel depending on responsive fit
  - CTA placement and record action rhythm
- [ ] Keep the live behaviors already implemented:
  - create/edit/delete flows
  - deleted history option
  - drill-down by caixa / competência / projetado / confirmado
- [ ] Style numeric columns, statuses, and filters to match the source design.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceTransactionsPage.tsx`
- shared table/filter/detail components

**Verification:**
- ledger behaviors remain intact
- visual parity with source is materially improved

**Commit:** `feat(finance): port transactions ledger visual design`

---

## Task 5 — Port Contas a Receber and Contas a Pagar

**Why:** AP/AR pages are where SMEs live day-to-day; they need the same design maturity as the home and ledger.

- [ ] Port `Contas a Receber` into the new finance visual language:
  - summary cards
  - operational grouping sections
  - actions and status presentation
  - filters and table/list behavior
- [ ] Port `Contas a Pagar` with the same system.
- [ ] Keep both pages aligned to the approved white-label finance domain, not the old company/counterparty model.
- [ ] Ensure both pages feel like siblings visually and structurally.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReceivablesPage.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinancePayablesPage.tsx`

**Verification:**
- AR/AP pages have consistent shell, filters, cards, groups, and detail treatment
- no residual visual drift from old internal admin UI

**Commit:** `feat(finance): port receivables and payables visual design`

---

## Task 6 — Port Conciliação as Inbox Operacional

**Why:** The reference has a very specific reconciliation voice; this page should feel like an operational inbox, not a fallback API page or plain list.

- [ ] Port the `reconciliation.jsx` composition into the real page:
  - headline and description treatment
  - reconciliation inbox layout
  - pending buckets/tabs
  - imported files support area
  - suggestion cards and decision controls
- [ ] Keep the real API integration intact.
- [ ] Add robust UI for loading/error/empty states so API issues never render raw HTML or route fallbacks in the content pane.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReconciliationPage.tsx`
- any finance reconciliation shared components

**Verification:**
- `Cannot GET ...` or raw backend HTML never leaks into content area
- page feels like the source reference and remains functional

**Commit:** `feat(finance): port reconciliation inbox visual design`

---

## Task 7 — Port Fluxo de Caixa and Relatórios

**Why:** These pages close the executive story and need to feel premium, readable, and consistent with the rest of the module.

- [ ] Port `Fluxo de Caixa` into the new system:
  - header
  - executive cards
  - chart/panel framing
  - period controls and supporting tables
- [ ] Port `Relatórios` with the same design language.
- [ ] Ensure `DRE gerencial` and the rest of the approved reports feel native to the visual system and not like an afterthought.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceCashflowPage.tsx`
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceReportsPage.tsx`

**Verification:**
- both pages visually align with overview/ledger
- DRE and report panels are readable and premium

**Commit:** `feat(finance): port cashflow and reports visual design`

---

## Task 8 — Port Cadastros to the Same System

**Why:** Cadastros should not look like a fallback admin page. They need the same design discipline while staying lower-profile than operational pages.

- [ ] Port the entities/accounts/categories/centers/payment methods area into the new finance design system.
- [ ] Maintain the approved hybrid registration model:
  - one base entity model underneath
  - segmented UI reading where useful
- [ ] Ensure forms, tabs, and tables follow the same visual grammar as the other finance pages.

**Primary files:**
- `/Users/yohannreimer/Documents/Projeto Treinamentos/apps/frontend/src/finance/pages/FinanceCadastrosPage.tsx`

**Verification:**
- cadastros no longer feel visually secondary or inherited from another module

**Commit:** `feat(finance): port cadastros visual design`

---

## Task 9 — Cross-Page Consistency and Polish

**Why:** The design will only feel “really equal” if cross-page inconsistencies are intentionally removed.

- [ ] Run a consistency pass across all finance pages for:
  - spacing
  - border radius
  - heading hierarchy
  - mono numeric usage
  - button sizes
  - badge styles
  - filter density
  - table row rhythm
  - empty/loading/error states
- [ ] Remove any remnants of old finance UI patterns that conflict with the new system.
- [ ] Tighten responsiveness so the shell and tables degrade cleanly on narrower widths.

**Primary files:**
- all finance pages/components/styles touched above

**Verification:**
- manual visual walkthrough of every finance route
- no major page feels “old” compared to the others

**Commit:** `feat(finance): polish finance visual consistency`

---

## Task 10 — Verification, Screenshots, and Final QA

**Why:** The user asked for a very high-fidelity port, so we need evidence before calling it done.

- [ ] Run focused frontend tests for finance pages/components touched.
- [ ] Run finance frontend build.
- [ ] If backend contracts changed indirectly, run backend build/tests relevant to finance.
- [ ] Launch localhost and manually verify each finance route:
  - `/financeiro`
  - `/financeiro/transactions`
  - `/financeiro/receivables`
  - `/financeiro/payables`
  - `/financeiro/reconciliation`
  - `/financeiro/cashflow`
  - `/financeiro/reports`
  - `/financeiro/cadastros`
- [ ] Capture before/after screenshots or at minimum validate parity against the `finance 2` files.
- [ ] Fix any last-mile regressions uncovered in the walkthrough.

**Suggested commands:**
```bash
cd /Users/yohannreimer/Documents/Projeto\ Treinamentos
npm --prefix apps/frontend test -- --runInBand
npm --prefix apps/frontend run build
npm --prefix apps/backend run build
```

**Commit:** `test(finance): verify full finance visual port`

---

## Execution Notes for Agentic Workers

- Implement in order; do not jump to deep page polish before the shell and primitives exist.
- Reuse the `finance 2` proportions and composition wherever technically possible.
- When a prototype layout conflicts with real data/state, preserve behavior but keep the look and feel as close as possible.
- Prefer extracting shared primitives instead of duplicating page-local CSS.
- Before claiming success on any task, run the relevant tests/build and verify the page manually in localhost.
- Do not commit unrelated repo noise such as `.superpowers/`.

## Definition of Done

The plan is complete when:
- every finance page visually reads as part of the same premium ERP app;
- the design is recognizably and materially faithful to `finance 2`;
- the finance shell no longer feels like an adaptation of the orquestrador;
- all approved finance routes retain their real behavior and data contracts;
- verification evidence exists through tests/builds/manual route review.
