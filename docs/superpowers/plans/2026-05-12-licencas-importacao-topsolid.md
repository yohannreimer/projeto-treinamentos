# Licenças Importação TopSolid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TopSolid license text importer that previews modules by expiration date, matches license programs by TopSolid kind/code, and makes license edit/renew/delete actions visible from details.

**Architecture:** Keep parsing and matching in the backend so the behavior is testable and reusable. Extend `license_program` with optional TopSolid metadata, expose it through existing program endpoints, and add a preview endpoint consumed by the existing React licenses page. The frontend remains a review-first flow: applying an import preview fills the form but never saves automatically.

**Tech Stack:** Express, zod, better-sqlite3, node:test, React, Vite, TypeScript.

---

### Task 1: License Program TopSolid Metadata

**Files:**
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/backend/src/licenses.test.ts`
- Modify: `apps/frontend/src/types/index.ts`
- Modify: `apps/frontend/src/pages/LicenseProgramsPage.tsx`

- [ ] **Step 1: Write failing backend test**

Add a test to `apps/backend/src/licenses.test.ts` that creates a license program with `topsolid_kind: 'Group'` and `topsolid_code: '600'`, verifies it appears in `GET /license-programs`, then verifies another program with the same kind/code is rejected.

- [ ] **Step 2: Run test to verify RED**

Run: `cd apps/backend && npm test -- src/licenses.test.ts`

Expected: FAIL because `topsolid_kind` and `topsolid_code` are not persisted/returned/validated yet.

- [ ] **Step 3: Implement backend metadata**

In `apps/backend/src/db.ts`, add `ensureColumn` calls for `license_program.topsolid_kind` and `license_program.topsolid_code`.

In `apps/backend/src/coreRoutes.ts`, extend create/update schemas for license programs, return metadata from `GET /license-programs`, and reject duplicate non-empty `topsolid_kind + topsolid_code` pairs.

- [ ] **Step 4: Run backend test to verify GREEN**

Run: `cd apps/backend && npm test -- src/licenses.test.ts`

Expected: PASS for license tests.

- [ ] **Step 5: Update frontend program management**

In `apps/frontend/src/types/index.ts`, add `topsolid_kind` and `topsolid_code` to `LicenseProgram`.

In `apps/frontend/src/pages/LicenseProgramsPage.tsx`, add fields for TopSolid type and code in the form, include them in create/update payloads, display them in the table, and load them when editing a program.

### Task 2: TopSolid Import Preview Endpoint

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/backend/src/licenses.test.ts`
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/types/index.ts`

- [ ] **Step 1: Write failing parser/preview tests**

Add backend tests covering:

- `POST /licenses/import-preview` parses `Group:600/"TopSolid'Cam Essential Milling"/30-6-2026`.
- Date `30-6-2026` becomes `2026-06-30`.
- Matching uses `topsolid_kind + topsolid_code`, not name.
- Unknown code is returned in `unmatched_items`.
- Different dates produce separate groups.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd apps/backend && npm test -- src/licenses.test.ts`

Expected: FAIL with 404 or missing endpoint.

- [ ] **Step 3: Implement parser and endpoint**

In `apps/backend/src/coreRoutes.ts`, add:

- `licenseImportPreviewSchema`;
- line parser for `Module:<code>/"<name>"/<d>-<m>-<yyyy>` and `Group:<code>/"<name>"/<d>-<m>-<yyyy>`;
- date normalization to `YYYY-MM-DD`;
- catalog matching by `topsolid_kind + topsolid_code`;
- fallback by unique `topsolid_code` if kind is empty on a legacy program;
- grouped response by `expires_at`;
- summary counts for parsed, ignored, matched, unmatched, and group totals.

- [ ] **Step 4: Run backend tests to verify GREEN**

Run: `cd apps/backend && npm test -- src/licenses.test.ts`

Expected: PASS.

- [ ] **Step 5: Add frontend API/types**

In `apps/frontend/src/services/api.ts`, add `licenseImportPreview(payload)`.

In `apps/frontend/src/types/index.ts`, add `LicenseImportPreviewResponse`, `LicenseImportPreviewGroup`, and related item types.

### Task 3: Licenses Page Import UI and Detail Actions

**Files:**
- Modify: `apps/frontend/src/pages/LicensesPage.tsx`
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Add import state and handlers**

In `LicensesPage`, add state for raw import text, loading, preview response, applied group key, and unmatched warning list.

Add `analyzeTopSolidText()` to call the preview endpoint.

Add `applyImportGroup(group)` to set `expiresAt` and merge matched program names into `selectedProgramNames`.

- [ ] **Step 2: Render import preview**

Inside the license form, render:

- textarea for TopSolid text;
- "Analisar" button;
- summary counts;
- group rows/cards by expiration date;
- "Aplicar este grupo" action;
- unmatched item list with `kind:code` and imported name.

- [ ] **Step 3: Add detail panel actions**

In the detail modal, add Editar, Renovar, and Excluir actions. Editar closes the modal and calls the existing edit flow. Renovar and Excluir call existing handlers and close/update state as needed.

- [ ] **Step 4: Add focused CSS**

Add compact styles for the import textarea, preview groups, summary chips, and detail action row. Keep the existing admin/table visual language.

### Task 4: Verification

**Files:**
- Verify: backend and frontend packages.

- [ ] **Step 1: Backend tests**

Run: `cd apps/backend && npm test -- src/licenses.test.ts`

Expected: PASS.

- [ ] **Step 2: Backend typecheck**

Run: `cd apps/backend && npm run build`

Expected: PASS.

- [ ] **Step 3: Frontend build**

Run: `cd apps/frontend && npm run build`

Expected: PASS.

- [ ] **Step 4: Review diff**

Run: `git diff -- apps/backend/src/db.ts apps/backend/src/coreRoutes.ts apps/backend/src/licenses.test.ts apps/frontend/src/types/index.ts apps/frontend/src/services/api.ts apps/frontend/src/pages/LicenseProgramsPage.tsx apps/frontend/src/pages/LicensesPage.tsx apps/frontend/src/styles.css`

Expected: Diff only contains the TopSolid license importer and license program metadata changes.
