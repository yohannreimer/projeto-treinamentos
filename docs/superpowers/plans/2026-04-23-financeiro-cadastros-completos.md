# Financeiro Cadastros Completos Implementation Plan

**Goal:** Implement Fase 2: complete finance registrations while preserving the current visual style.

**Tech Stack:** TypeScript, Express, Zod, better-sqlite3, React, Vite, Vitest, Testing Library. Use Node 22 commands: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" ...`.

## Context
Fase 1 already added smart entity profiles, tags, quality review and compact connected flows.

Fase 2 builds on that by making `Cadastros` the complete operational base:

- CRUD for accounts, categories, cost centers and payment methods;
- editable entities and intelligent profiles;
- favorite combinations;
- duplicate detection.

## Tasks

### Task 1: Backend Contracts
- Add update/delete input types for catalog resources.
- Add entity update type.
- Add favorite combination DTO/input types.
- Add duplicate detection DTO types.

### Task 2: Schema
- Add `financial_favorite_combination` table.
- Add indexes for lookup by organization/context/status.
- Keep migration safe with `create table if not exists`.

### Task 3: Domain Services
- Add update and deactivate helpers for accounts/categories/cost centers/payment methods.
- Add update entity helper that returns entity with tags.
- Add duplicate detection using normalized document/legal/trade names.
- Add favorite combination list/create/update/deactivate helpers.

### Task 4: Routes
- Add PATCH/DELETE endpoints for catalogs.
- Add PATCH endpoint for entities.
- Add duplicate endpoint.
- Add favorite combination endpoints.
- Validate payloads with Zod.

### Task 5: Frontend API
- Add payload/types/methods for all new contracts.
- Keep existing Fase 1 methods compatible.

### Task 6: Cadastros UI
- Keep the current two-column style.
- Add compact section tabs for entities, accounts, categories, centers, methods, combinations and duplicates.
- Reuse the same form/list density.
- Add edit mode without modal sprawl.
- Show duplicate detection as a compact review list.

### Task 7: Tests
- Backend: catalog CRUD, entity edit/profile edit, duplicates, favorite combinations.
- Frontend: Cadastros tab switching, create/edit/deactivate catalog item, edit entity profile, create combination, view duplicates.

## Verification
Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
git diff --check
```

No commit/push until the user validates the local experience.
