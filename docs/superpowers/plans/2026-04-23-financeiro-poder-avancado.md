# Financeiro Poder Avancado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 7 advanced finance controls for automation rules, payment approval, attachments, audit, exports and bank integrations.

**Architecture:** Add small persistent finance tables for automation rules, attachments and bank integrations. Expose one aggregate advanced endpoint plus focused write actions, then render them in a new `Avancado` finance page that preserves the existing compact ERP visual style.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Vite, Vitest, Testing Library.

---

## Tasks

### Task 1: Advanced Persistence and Types
- [x] Add finance advanced tables and indexes.
- [x] Add backend/frontend DTOs for advanced dashboard blocks.
- [x] Keep existing finance contracts compatible.

### Task 2: Backend Actions
- [x] Implement advanced dashboard aggregation.
- [x] Implement automation rule creation/toggle.
- [x] Implement payment approval with audit entry.
- [x] Implement attachment and bank integration creation.
- [x] Implement CSV/PDF export endpoint.

### Task 3: Advanced UI
- [x] Add finance sidebar and route for `Avancado`.
- [x] Build compact advanced page with internal tabs.
- [x] Wire create rule, approve payment, attach receipt, export and sandbox integration actions.

### Task 4: Tests and Verification
- [x] Add backend finance advanced test.
- [x] Add frontend advanced page test.
- [x] Run backend finance tests, frontend finance tests, build and diff check.
