# Financeiro Conciliação Inteligente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 6 reconciliation intelligence with richer suggestions, statement-to-transaction creation, learned patterns and clearer decision history.

**Architecture:** Extend the existing reconciliation inbox contract additively, keeping the current endpoint and UI shape. Reuse historical matches as the learning source, and add one focused backend action for creating a settled transaction from a statement entry while recording the reconciliation match.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Vite, Vitest, Testing Library.

---

## Tasks

### Task 1: Backend Suggestion Intelligence
- [x] Add suggestion metadata types for reasons, source, score gaps and learned-rule hints.
- [x] Derive learned rules from historical matched statement entries and transactions.
- [x] Rank suggestions by value, date, direction, description, entity and learned history.

### Task 2: Statement-to-Transaction Action
- [x] Add backend input/output types for creating a transaction from a statement entry.
- [x] Add service action that creates a settled transaction and reconciliation match together.
- [x] Add route and frontend API method for the action.

### Task 3: Reconciliation UI
- [x] Show suggestion reasons without changing the visual language.
- [x] Add create-from-statement action for unmatched entries.
- [x] Improve recent match rows with confidence/source history.

### Task 4: Tests and Verification
- [x] Expand backend reconciliation test with learned suggestions and create-from-statement.
- [x] Expand frontend reconciliation test with reasons and create action.
- [x] Run backend finance tests, frontend finance tests, build and diff check.
