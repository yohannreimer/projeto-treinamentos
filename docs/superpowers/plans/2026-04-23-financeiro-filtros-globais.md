# Financeiro Filtros Globais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 4 global period filters, saved period filters, filtered reports and KPI drill-down.

**Architecture:** Add a shared finance period persistence layer in the frontend, backed by user-scoped `localStorage`. Reuse the same period query contract in backend reports by moving period-window resolution into a shared backend helper. Keep UI compact by extending the existing `FinancePeriodFilter` instead of adding new filter panels.

**Tech Stack:** TypeScript, React, Vite, Express, better-sqlite3, Vitest, Testing Library.

---

## Tasks

### Task 1: Shared Period State
- [x] Add user-scoped persistent period state to `useFinancePeriod`.
- [x] Add saved period filters to `FinancePeriodFilter`.
- [x] Keep default state compatible with existing pages.

### Task 2: Backend Report Filtering
- [x] Create shared backend period resolver.
- [x] Use it in executive overview and reports.
- [x] Add `preset`, `from`, and `to` query support to `/finance/reports`.

### Task 3: Frontend Page Adoption
- [x] Make reports call `getReports(apiFilters)`.
- [x] Make transactions load from backend with global period filters.
- [x] Keep payables and receivables using the global period instead of local-only defaults.

### Task 4: Drill-Down
- [x] Add KPI destination resolution to `FinanceKpiGrid`.
- [x] Pass current period context through persisted global state.
- [x] Support query-driven transaction kind/status filters for drill-down.

### Task 5: Tests and Verification
- [x] Add frontend tests for persisted period and saved filters.
- [x] Add backend tests for report period filtering.
- [x] Update existing page tests where global period changes expectations.
- [x] Run backend finance tests, frontend finance target tests, build, and diff check.
