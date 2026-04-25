# Financeiro Operação Diária Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 3 daily-operation actions for payables and receivables.

**Architecture:** Extend payables/receivables with settled amount fields and an operation audit table. Add small service functions and routes for settle, partial settlement, duplicate, cancel, installments and simple recurrence. Keep frontend controls inline inside existing operation cards.

**Tech Stack:** TypeScript, Express, Zod, better-sqlite3, React, Vite, Vitest, Testing Library.

---

## Tasks

### Task 1: Schema and Types
- [x] Add settled amount columns to `financial_payable` and `financial_receivable`.
- [x] Add `financial_operation_audit`.
- [x] Extend DTOs and API payloads.

### Task 2: Backend Operations
- [x] Implement payable operations.
- [x] Implement receivable operations.
- [x] Persist audit rows for each operation.
- [x] Keep cancel non-destructive.

### Task 3: Routes
- [x] Add operation endpoints for payables and receivables.
- [x] Validate amount, count and reason fields with Zod.

### Task 4: UI
- [x] Add compact action controls to payable/receivable cards.
- [x] Use inline partial/parcel/recurrence inputs.
- [x] Refresh the current list after each operation.

### Task 5: Tests and Verification
- [x] Add backend coverage for settle/partial/cancel/duplicate/installments/recurrence.
- [x] Add frontend coverage for key actions.
- [x] Run backend finance tests, frontend finance target tests, build, and diff check.
