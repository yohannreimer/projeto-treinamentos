# Financeiro Relatórios e DRE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 5 reporting improvements for DRE by competence, cost-center result, cashflow by due/settlement, filtered reports and drill-down.

**Architecture:** Extend the existing finance reports endpoint with additive fields, keeping the old DRE/report fields compatible. Render the new report slices inside the existing reports page, using compact tabs and link-based drill-down into the ledger.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Vite, Vitest, Testing Library.

---

## Tasks

### Task 1: Backend Report Contract
- [x] Add report row types for DRE by period, cost-center result and cashflow basis.
- [x] Calculate all new rows from `FinanceTransactionDto`.
- [x] Keep existing report fields unchanged.

### Task 2: Reports UI
- [x] Add report tabs for DRE by competence, cost centers and cashflow basis.
- [x] Add compact drill-down links in DRE, categories, cost centers and cashflow rows.
- [x] Keep the existing visual style and layout density.

### Task 3: Tests and Verification
- [x] Expand backend report test with new report fields.
- [x] Expand frontend report test with new tabs and drill-down links.
- [x] Run backend finance tests, frontend finance tests, build and diff check.
