# Financeiro Chat Analítico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production slice of the premium Financeiro analyst chat: answer payable questions with real numbers, render a dark lateral panel with actionable rows, settle an item directly, and offer undo.

**Architecture:** Extend the existing `/finance/assistant/run` flow so a command can return either an executable command plan or an analytical answer. Analytical answers are computed by backend finance services, then rendered by `FinanceWhisperFlow` as a dark side panel with dense item rows and inline actions. Direct row actions call existing finance APIs plus a small undo endpoint for individual payable settlements.

**Tech Stack:** Node.js 22, TypeScript, Express, better-sqlite3, React, Vite, CSS modules-by-file convention, Node test runner, Vitest.

---

## Task 1: Backend Analytical Answer

**Files:**
- Modify: `apps/backend/src/finance/types.ts`
- Modify: `apps/backend/src/finance/assistant.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] Add `mode: 'command' | 'analysis' | 'hybrid'` and `answer` fields to `FinanceAssistantPlanDto`.
- [ ] Add a failing backend test for: “quanto tenho para pagar nos próximos 7 dias?”
- [ ] Implement a deterministic payables-due answer builder that filters open payables by horizon, sums remaining values, returns breakdown rows, insights and suggested actions.
- [ ] Make question phrases such as `quanto`, `quais`, `me mostra`, `próximas contas a pagar` return `mode: 'analysis'` instead of `query_quality`.
- [ ] Verify the test passes.

## Task 2: Direct Settle With Undo

**Files:**
- Modify: `apps/backend/src/finance/service.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Modify: `apps/frontend/src/finance/api.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] Add a failing backend test that settles one payable and then undoes the settlement.
- [ ] Implement `undoSettleFinancePayable` for a fully settled payable created by a settlement movement.
- [ ] Add `POST /finance/payables/:id/undo-settle`.
- [ ] Add `financeApi.undoSettlePayable`.
- [ ] Verify backend tests pass.

## Task 3: Premium Analyst Chat UI

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Modify: `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`
- Modify: `apps/frontend/src/finance/finance-whisper.css`
- Test: `apps/frontend/src/finance/components/FinanceWhisperFlow.test.tsx`

- [ ] Add frontend types for analytical answer payload.
- [ ] Add a failing frontend test that renders answer metric and breakdown after interpreting an analysis command.
- [ ] Implement dark side-panel rendering for `plan.mode === 'analysis'`.
- [ ] Render summary card, dense breakdown rows, insight/suggestion block, and chatbar.
- [ ] Add `Baixar` button per payable row; on success mark row settled and show `Desfazer`.
- [ ] Add `Desfazer` button that calls undo endpoint and restores row state.
- [ ] Verify frontend test passes.

## Task 4: Full Verification

**Files:**
- No new files.

- [ ] Run backend assistant tests.
- [ ] Run frontend Whisper Flow tests.
- [ ] Run full build.
- [ ] Run `git diff --check`.
