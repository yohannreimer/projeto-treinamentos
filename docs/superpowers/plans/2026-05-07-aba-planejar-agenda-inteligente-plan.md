# Aba Planejar Agenda Inteligente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Planejar workspace where operators can plan multiple clients, modules, technicians and real-time encounters before publishing them into turmas and calendario.

**Architecture:** Add a planning layer above the existing cohort/calendar model. Backend stores planning workspaces, planned cohorts and planned encounters, validates them against real cohort/activity schedules, then publishes valid plans into existing cohort, cohort_module_block, cohort_schedule_day and cohort_allocation tables. Frontend adds a dense operational planning page with client/module queue, real-time technician grid, contextual encounter editor and publish summary.

**Tech Stack:** Express, Zod, better-sqlite3, node:test, Supertest, React 18, Vite, Vitest, React Router, existing CSS design tokens.

---

## Scope And Phasing

This feature crosses backend data model, validation, publish workflow, navigation and a complex frontend surface. Implement it as three vertical slices:

1. **Planning Core:** schemas, CRUD, conflict validation, manual planned encounters.
2. **Publish And Replan:** convert planned cohorts into real turmas, reopen published plans and push schedule changes back into turmas.
3. **UX Power Layer:** 30/60 day macro view, assisted suggestions and automatic allocation draft.

This plan covers slices 1 and 2 fully, plus the UI foundation needed for slice 3. Assisted and automatic allocation get a backend extension point and a simple first suggestion endpoint, but advanced optimization remains a later plan.

## File Structure

- Create `apps/backend/src/planning/types.ts`: backend planning row and payload types.
- Create `apps/backend/src/planning/service.ts`: planning validation, read models, conflict checks and publish helpers.
- Create `apps/backend/src/planning/routes.ts`: Express routes for workspaces, planned cohorts, encounters, validation and publishing.
- Create `apps/backend/src/planning/planning.test.ts`: integration tests for CRUD, conflict validation, publish and replan.
- Modify `apps/backend/src/db.ts`: planning tables, indexes and backward-compatible columns linking published cohorts to planning records.
- Modify `apps/backend/src/app.ts`: register planning routes.
- Modify `apps/frontend/src/types/index.ts`: planning DTO types.
- Modify `apps/frontend/src/services/api.ts`: planning API client methods.
- Create `apps/frontend/src/pages/PlanningPage.tsx`: new operational page.
- Create `apps/frontend/src/pages/PlanningPage.test.tsx`: page behavior tests.
- Modify `apps/frontend/src/App.tsx`: `/planejar` route.
- Modify `apps/frontend/src/auth/navigation.ts`: nav item.
- Modify `apps/frontend/src/components/Layout.tsx`: topbar context.
- Modify `apps/frontend/src/styles.css`: planning workspace styles.

## Data Model

Tables:

- `planning_workspace`: one planning session.
- `planning_workspace_client`: selected clients in a workspace.
- `planning_cohort`: planned turma per client/module.
- `planning_encounter`: smallest editable unit with real date/time/technician.
- `planning_version`: publish and replan history.

Statuses:

- workspace: `Rascunho`, `Publicado`, `Alteracao_pendente`, `Arquivado`.
- planning cohort: `Rascunho`, `Pronto`, `Publicado`, `Cancelado`.
- encounter: `Rascunho`, `Confirmacao_cliente`, `Confirmado`, `Publicado`, `Cancelado`.

Publication rule:

- Each planned cohort publishes to one real cohort by default.
- Each planned cohort belongs to one company and one module by default.
- Manual join is represented by multiple planning clients/allocations only after explicit user action. Slice 1 and 2 keep one company per planned cohort.

---

### Task 1: Add Planning Database Schema

**Files:**
- Modify: `apps/backend/src/db.ts`
- Test: `apps/backend/src/planning/planning.test.ts`

- [ ] **Step 1: Write failing schema test**

Add `apps/backend/src/planning/planning.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('initDb creates planning tables and cohort planning link columns', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('planning-schema');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    const tables = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name like 'planning_%'
      order by name asc
    `).all() as Array<{ name: string }>;

    assert.deepEqual(tables.map((row) => row.name), [
      'planning_cohort',
      'planning_encounter',
      'planning_version',
      'planning_workspace',
      'planning_workspace_client'
    ]);

    const cohortColumns = db.prepare('pragma table_info(cohort)').all() as Array<{ name: string }>;
    assert.ok(cohortColumns.some((column) => column.name === 'planning_cohort_id'));
    assert.ok(cohortColumns.some((column) => column.name === 'planning_workspace_id'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning tables"`

Expected: FAIL because `planning_*` tables and cohort planning columns do not exist.

- [ ] **Step 3: Add schema in `initDb`**

In `apps/backend/src/db.ts`, add this inside the main `db.exec` table creation block after `calendar_activity_day`:

```ts
    create table if not exists planning_workspace (
      id text primary key,
      name text not null,
      status text not null default 'Rascunho',
      mode text not null default 'Manual',
      horizon_days integer not null default 60,
      notes text,
      created_at text not null,
      updated_at text not null,
      published_at text
    );

    create table if not exists planning_workspace_client (
      workspace_id text not null,
      company_id text not null,
      priority integer not null default 0,
      created_at text not null,
      primary key (workspace_id, company_id),
      foreign key(workspace_id) references planning_workspace(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );

    create table if not exists planning_cohort (
      id text primary key,
      workspace_id text not null,
      company_id text not null,
      module_id text not null,
      technician_id text,
      published_cohort_id text,
      name text not null,
      status text not null default 'Rascunho',
      delivery_mode text not null default 'Online',
      period text not null default 'Meio_periodo',
      notes text,
      created_at text not null,
      updated_at text not null,
      foreign key(workspace_id) references planning_workspace(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade,
      foreign key(technician_id) references technician(id) on delete set null,
      foreign key(published_cohort_id) references cohort(id) on delete set null
    );

    create table if not exists planning_encounter (
      id text primary key,
      workspace_id text not null,
      planning_cohort_id text not null,
      company_id text not null,
      module_id text not null,
      technician_id text,
      encounter_index integer not null,
      day_date text not null,
      start_time text not null,
      end_time text not null,
      status text not null default 'Rascunho',
      notes text,
      published_cohort_id text,
      created_at text not null,
      updated_at text not null,
      unique(planning_cohort_id, encounter_index),
      foreign key(workspace_id) references planning_workspace(id) on delete cascade,
      foreign key(planning_cohort_id) references planning_cohort(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade,
      foreign key(module_id) references module_template(id) on delete cascade,
      foreign key(technician_id) references technician(id) on delete set null,
      foreign key(published_cohort_id) references cohort(id) on delete set null
    );

    create table if not exists planning_version (
      id text primary key,
      workspace_id text not null,
      version_number integer not null,
      action text not null,
      summary_json text not null default '{}',
      created_at text not null,
      unique(workspace_id, version_number),
      foreign key(workspace_id) references planning_workspace(id) on delete cascade
    );
```

Add ensure columns near existing `ensureColumn` calls:

```ts
  ensureColumn('cohort', 'planning_workspace_id', 'planning_workspace_id text references planning_workspace(id) on delete set null');
  ensureColumn('cohort', 'planning_cohort_id', 'planning_cohort_id text references planning_cohort(id) on delete set null');
```

Add indexes in the index `db.exec` block:

```ts
    create index if not exists idx_planning_workspace_status on planning_workspace(status, updated_at desc);
    create index if not exists idx_planning_workspace_client_company on planning_workspace_client(company_id);
    create index if not exists idx_planning_cohort_workspace on planning_cohort(workspace_id, status);
    create index if not exists idx_planning_cohort_company_module on planning_cohort(company_id, module_id);
    create index if not exists idx_planning_encounter_workspace_date on planning_encounter(workspace_id, day_date);
    create index if not exists idx_planning_encounter_technician_date on planning_encounter(technician_id, day_date);
    create index if not exists idx_cohort_planning_links on cohort(planning_workspace_id, planning_cohort_id);
```

- [ ] **Step 4: Run schema test**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning tables"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/planning/planning.test.ts
git commit -m "feat: add planning schema"
```

---

### Task 2: Add Planning Types And Validation Service

**Files:**
- Create: `apps/backend/src/planning/types.ts`
- Create: `apps/backend/src/planning/service.ts`
- Modify: `apps/backend/src/planning/planning.test.ts`

- [ ] **Step 1: Add failing validation tests**

Update the import block at the top of `apps/backend/src/planning/planning.test.ts`:

```ts
import { validatePlanningEncounterPayload, findPlanningEncounterConflicts } from './service.js';
```

Then append these tests to `apps/backend/src/planning/planning.test.ts`:

```ts

test('planning encounter validation rejects invalid time windows', () => {
  const result = validatePlanningEncounterPayload({
    day_date: '2026-05-11',
    start_time: '14:00',
    end_time: '10:00'
  });

  assert.equal(result.ok, false);
  assert.equal(result.message, 'Horário final deve ser maior que horário inicial.');
});

test('planning conflict check detects overlap with calendar activity', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('planning-calendar-conflict');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into technician (id, name, cost_per_day) values (?, ?, 0)')
      .run('tech-ana', 'Ana Técnica');
    db.prepare(`
      insert into calendar_activity (
        id, title, activity_type, start_date, end_date, selected_dates, hours_scope, all_day,
        start_time, end_time, technician_id, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'act-ana-1',
      'Suporte Alfa',
      'Suporte',
      '2026-05-11',
      '2026-05-11',
      '2026-05-11',
      'none',
      0,
      '10:00',
      '12:00',
      'tech-ana',
      'Planejada',
      '2026-05-07T10:00:00.000Z',
      '2026-05-07T10:00:00.000Z'
    );
    db.prepare('insert into calendar_activity_technician (activity_id, technician_id) values (?, ?)')
      .run('act-ana-1', 'tech-ana');
    db.prepare(`
      insert into calendar_activity_day (activity_id, day_date, all_day, start_time, end_time)
      values (?, ?, ?, ?, ?)
    `).run('act-ana-1', '2026-05-11', 0, '10:00', '12:00');

    const conflicts = findPlanningEncounterConflicts({
      technician_id: 'tech-ana',
      day_date: '2026-05-11',
      start_time: '11:00',
      end_time: '13:00'
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].source_type, 'calendar_activity');
    assert.equal(conflicts[0].source_id, 'act-ana-1');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning encounter validation|planning conflict"`

Expected: FAIL because `planning/service.js` does not exist.

- [ ] **Step 3: Create backend planning types**

Create `apps/backend/src/planning/types.ts`:

```ts
export type PlanningWorkspaceStatus = 'Rascunho' | 'Publicado' | 'Alteracao_pendente' | 'Arquivado';
export type PlanningMode = 'Manual' | 'Assistido' | 'Automatico';
export type PlanningCohortStatus = 'Rascunho' | 'Pronto' | 'Publicado' | 'Cancelado';
export type PlanningEncounterStatus = 'Rascunho' | 'Confirmacao_cliente' | 'Confirmado' | 'Publicado' | 'Cancelado';

export type PlanningEncounterPayload = {
  day_date: string;
  start_time: string;
  end_time: string;
};

export type PlanningConflict = {
  source_type: 'cohort' | 'calendar_activity' | 'planning_encounter';
  source_id: string;
  title: string;
  day_date: string;
  start_time: string | null;
  end_time: string | null;
};

export type PlanningEncounterRow = {
  id: string;
  workspace_id: string;
  planning_cohort_id: string;
  company_id: string;
  module_id: string;
  technician_id: string | null;
  encounter_index: number;
  day_date: string;
  start_time: string;
  end_time: string;
  status: PlanningEncounterStatus;
  notes: string | null;
  published_cohort_id: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 4: Create validation and conflict service**

Create `apps/backend/src/planning/service.ts`:

```ts
import { db } from '../db.js';
import type { PlanningConflict, PlanningEncounterPayload } from './types.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value || !TIME_REGEX.test(value)) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function slotsOverlap(
  leftStart: string | null,
  leftEnd: string | null,
  rightStart: string | null,
  rightEnd: string | null
): boolean {
  const leftStartMinutes = timeToMinutes(leftStart);
  const leftEndMinutes = timeToMinutes(leftEnd);
  const rightStartMinutes = timeToMinutes(rightStart);
  const rightEndMinutes = timeToMinutes(rightEnd);
  if (
    leftStartMinutes === null ||
    leftEndMinutes === null ||
    rightStartMinutes === null ||
    rightEndMinutes === null
  ) {
    return true;
  }
  if (leftEndMinutes <= leftStartMinutes || rightEndMinutes <= rightStartMinutes) {
    return true;
  }
  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}

export function validatePlanningEncounterPayload(payload: PlanningEncounterPayload): { ok: true } | { ok: false; message: string } {
  if (!ISO_DATE_REGEX.test(payload.day_date)) {
    return { ok: false, message: 'Data inválida.' };
  }
  if (!TIME_REGEX.test(payload.start_time) || !TIME_REGEX.test(payload.end_time)) {
    return { ok: false, message: 'Informe horário inicial e final no formato HH:MM.' };
  }
  const start = timeToMinutes(payload.start_time);
  const end = timeToMinutes(payload.end_time);
  if (start === null || end === null || end <= start) {
    return { ok: false, message: 'Horário final deve ser maior que horário inicial.' };
  }
  return { ok: true };
}

export function findPlanningEncounterConflicts(args: {
  technician_id: string | null | undefined;
  day_date: string;
  start_time: string;
  end_time: string;
  exclude_planning_encounter_id?: string;
  exclude_published_cohort_id?: string;
}): PlanningConflict[] {
  if (!args.technician_id) return [];
  const conflicts: PlanningConflict[] = [];

  const activityRows = db.prepare(`
    select ca.id, ca.title, cad.day_date, cad.all_day, cad.start_time, cad.end_time
    from calendar_activity ca
    join calendar_activity_day cad on cad.activity_id = ca.id
    join calendar_activity_technician cat on cat.activity_id = ca.id
    where cat.technician_id = ?
      and cad.day_date = ?
      and ca.status <> 'Cancelada'
  `).all(args.technician_id, args.day_date) as Array<{
    id: string;
    title: string;
    day_date: string;
    all_day: number;
    start_time: string | null;
    end_time: string | null;
  }>;

  activityRows.forEach((row) => {
    if (Number(row.all_day) === 1 || slotsOverlap(args.start_time, args.end_time, row.start_time, row.end_time)) {
      conflicts.push({
        source_type: 'calendar_activity',
        source_id: row.id,
        title: row.title,
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
  });

  const planningRows = db.prepare(`
    select pe.id, pc.name as title, pe.day_date, pe.start_time, pe.end_time
    from planning_encounter pe
    join planning_cohort pc on pc.id = pe.planning_cohort_id
    where pe.technician_id = ?
      and pe.day_date = ?
      and pe.status <> 'Cancelado'
      and (? is null or pe.id <> ?)
  `).all(
    args.technician_id,
    args.day_date,
    args.exclude_planning_encounter_id ?? null,
    args.exclude_planning_encounter_id ?? null
  ) as Array<{ id: string; title: string; day_date: string; start_time: string; end_time: string }>;

  planningRows.forEach((row) => {
    if (slotsOverlap(args.start_time, args.end_time, row.start_time, row.end_time)) {
      conflicts.push({
        source_type: 'planning_encounter',
        source_id: row.id,
        title: row.title,
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
  });

  const cohortRows = db.prepare(`
    select c.id, c.code || ' - ' || c.name as title, csd.day_date, csd.start_time, csd.end_time
    from cohort c
    join cohort_schedule_day csd on csd.cohort_id = c.id
    where c.technician_id = ?
      and csd.day_date = ?
      and c.status <> 'Cancelada'
      and (? is null or c.id <> ?)
  `).all(
    args.technician_id,
    args.day_date,
    args.exclude_published_cohort_id ?? null,
    args.exclude_published_cohort_id ?? null
  ) as Array<{ id: string; title: string; day_date: string; start_time: string | null; end_time: string | null }>;

  cohortRows.forEach((row) => {
    if (slotsOverlap(args.start_time, args.end_time, row.start_time, row.end_time)) {
      conflicts.push({
        source_type: 'cohort',
        source_id: row.id,
        title: row.title,
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
  });

  return conflicts;
}
```

- [ ] **Step 5: Run validation tests**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning encounter validation|planning conflict"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/planning/types.ts apps/backend/src/planning/service.ts apps/backend/src/planning/planning.test.ts
git commit -m "feat: validate planning encounters"
```

---

### Task 3: Add Planning CRUD Routes

**Files:**
- Create: `apps/backend/src/planning/routes.ts`
- Modify: `apps/backend/src/app.ts`
- Modify: `apps/backend/src/planning/planning.test.ts`

- [ ] **Step 1: Add failing API test for creating a workspace**

Append to `apps/backend/src/planning/planning.test.ts`:

```ts
test('planning API creates workspace with clients, planned cohort and encounters', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-create');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 2, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name, cost_per_day) values (?, ?, 0)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({
        name: 'Carteira Maio',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });

    assert.equal(created.status, 201);
    assert.equal(created.body.workspace.name, 'Carteira Maio');
    assert.equal(created.body.clients.length, 1);

    const workspaceId = created.body.workspace.id as string;
    const cohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação',
        delivery_mode: 'Online',
        period: 'Meio_periodo',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmacao_cliente' },
          { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmacao_cliente' }
        ]
      });

    assert.equal(cohort.status, 201);
    assert.equal(cohort.body.cohort.company_id, 'comp-delta');
    assert.equal(cohort.body.encounters.length, 2);

    const detail = await request(app).get(`/planning/workspaces/${workspaceId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.cohorts.length, 1);
    assert.equal(detail.body.cohorts[0].encounters.length, 2);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run API test to verify it fails**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning API creates workspace"`

Expected: FAIL with 404 for `/planning/workspaces`.

- [ ] **Step 3: Create route module**

Create `apps/backend/src/planning/routes.ts`:

```ts
import type { Express } from 'express';
import { z } from 'zod';
import { db, nowDateIso, uuid } from '../db.js';
import { findPlanningEncounterConflicts, validatePlanningEncounterPayload } from './service.js';

const workspaceStatusValues = ['Rascunho', 'Publicado', 'Alteracao_pendente', 'Arquivado'] as const;
const planningModeValues = ['Manual', 'Assistido', 'Automatico'] as const;
const planningCohortStatusValues = ['Rascunho', 'Pronto', 'Publicado', 'Cancelado'] as const;
const planningEncounterStatusValues = ['Rascunho', 'Confirmacao_cliente', 'Confirmado', 'Publicado', 'Cancelado'] as const;

const createWorkspaceSchema = z.object({
  name: z.string().min(3),
  mode: z.enum(planningModeValues).default('Manual'),
  horizon_days: z.number().int().min(7).max(120).default(60),
  notes: z.string().nullable().optional(),
  company_ids: z.array(z.string()).default([])
});

const encounterInputSchema = z.object({
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  status: z.enum(planningEncounterStatusValues).default('Rascunho'),
  notes: z.string().nullable().optional()
});

const createPlanningCohortSchema = z.object({
  company_id: z.string(),
  module_id: z.string(),
  technician_id: z.string().nullable().optional(),
  name: z.string().min(3),
  status: z.enum(planningCohortStatusValues).default('Rascunho'),
  delivery_mode: z.enum(['Online', 'Presencial', 'Hibrida']).default('Online'),
  period: z.enum(['Integral', 'Meio_periodo']).default('Meio_periodo'),
  notes: z.string().nullable().optional(),
  encounters: z.array(encounterInputSchema).default([])
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readWorkspace(workspaceId: string) {
  const workspace = db.prepare('select * from planning_workspace where id = ?').get(workspaceId);
  if (!workspace) return null;

  const clients = db.prepare(`
    select pwc.company_id, c.name as company_name, pwc.priority
    from planning_workspace_client pwc
    join company c on c.id = pwc.company_id
    where pwc.workspace_id = ?
    order by pwc.priority desc, c.name asc
  `).all(workspaceId);

  const cohorts = db.prepare(`
    select pc.*, c.name as company_name, mt.code as module_code, mt.name as module_name, t.name as technician_name
    from planning_cohort pc
    join company c on c.id = pc.company_id
    join module_template mt on mt.id = pc.module_id
    left join technician t on t.id = pc.technician_id
    where pc.workspace_id = ?
    order by c.name asc, mt.code asc, pc.created_at asc
  `).all(workspaceId) as Array<{ id: string }>;

  const encounterRows = db.prepare(`
    select pe.*, t.name as technician_name
    from planning_encounter pe
    left join technician t on t.id = pe.technician_id
    where pe.workspace_id = ?
    order by pe.day_date asc, pe.start_time asc, pe.encounter_index asc
  `).all(workspaceId) as Array<{ planning_cohort_id: string }>;

  return {
    workspace,
    clients,
    cohorts: cohorts.map((cohort) => ({
      ...cohort,
      encounters: encounterRows.filter((encounter) => encounter.planning_cohort_id === cohort.id)
    }))
  };
}

export function registerPlanningRoutes(app: Express) {
  app.get('/planning/workspaces', (_req, res) => {
    const rows = db.prepare(`
      select pw.*,
        (select count(*) from planning_workspace_client pwc where pwc.workspace_id = pw.id) as client_count,
        (select count(*) from planning_encounter pe where pe.workspace_id = pw.id and pe.status <> 'Cancelado') as encounter_count
      from planning_workspace pw
      where pw.status <> 'Arquivado'
      order by pw.updated_at desc
    `).all();
    return res.json({ workspaces: rows });
  });

  app.post('/planning/workspaces', (req, res) => {
    const parsed = createWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const payload = parsed.data;
    const now = nowDateIso();
    const workspaceId = uuid('pln');
    const uniqueCompanyIds = Array.from(new Set(payload.company_ids));

    const tx = db.transaction(() => {
      db.prepare(`
        insert into planning_workspace (id, name, status, mode, horizon_days, notes, created_at, updated_at)
        values (?, ?, 'Rascunho', ?, ?, ?, ?, ?)
      `).run(workspaceId, payload.name.trim(), payload.mode, payload.horizon_days, payload.notes ?? null, now, now);

      const insertClient = db.prepare(`
        insert or ignore into planning_workspace_client (workspace_id, company_id, priority, created_at)
        values (?, ?, 0, ?)
      `);
      uniqueCompanyIds.forEach((companyId) => insertClient.run(workspaceId, companyId, now));
    });

    try {
      tx();
      return res.status(201).json(readWorkspace(workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível criar planejamento.', detail: errorMessage(error) });
    }
  });

  app.get('/planning/workspaces/:workspaceId', (req, res) => {
    const result = readWorkspace(req.params.workspaceId);
    if (!result) return res.status(404).json({ message: 'Planejamento não encontrado.' });
    return res.json(result);
  });

  app.post('/planning/workspaces/:workspaceId/cohorts', (req, res) => {
    const parsed = createPlanningCohortSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const workspace = db.prepare('select id from planning_workspace where id = ?').get(req.params.workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const payload = parsed.data;
    const now = nowDateIso();
    const planningCohortId = uuid('plc');

    for (const encounter of payload.encounters) {
      const validation = validatePlanningEncounterPayload(encounter);
      if (!validation.ok) return res.status(400).json({ message: validation.message });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        insert or ignore into planning_workspace_client (workspace_id, company_id, priority, created_at)
        values (?, ?, 0, ?)
      `).run(req.params.workspaceId, payload.company_id, now);

      db.prepare(`
        insert into planning_cohort (
          id, workspace_id, company_id, module_id, technician_id, name, status,
          delivery_mode, period, notes, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        planningCohortId,
        req.params.workspaceId,
        payload.company_id,
        payload.module_id,
        payload.technician_id ?? null,
        payload.name.trim(),
        payload.status,
        payload.delivery_mode,
        payload.period,
        payload.notes ?? null,
        now,
        now
      );

      const insertEncounter = db.prepare(`
        insert into planning_encounter (
          id, workspace_id, planning_cohort_id, company_id, module_id, technician_id,
          encounter_index, day_date, start_time, end_time, status, notes, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      payload.encounters.forEach((encounter, index) => {
        insertEncounter.run(
          uuid('ple'),
          req.params.workspaceId,
          planningCohortId,
          payload.company_id,
          payload.module_id,
          payload.technician_id ?? null,
          index + 1,
          encounter.day_date,
          encounter.start_time,
          encounter.end_time,
          encounter.status,
          encounter.notes ?? null,
          now,
          now
        );
      });
      db.prepare('update planning_workspace set updated_at = ? where id = ?').run(now, req.params.workspaceId);
    });

    try {
      tx();
      const detail = readWorkspace(req.params.workspaceId);
      const cohort = detail?.cohorts.find((item: any) => item.id === planningCohortId);
      return res.status(201).json({ cohort, encounters: (cohort as any)?.encounters ?? [] });
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível criar turma planejada.', detail: errorMessage(error) });
    }
  });

  app.post('/planning/workspaces/:workspaceId/validate', (req, res) => {
    const detail = readWorkspace(req.params.workspaceId);
    if (!detail) return res.status(404).json({ message: 'Planejamento não encontrado.' });
    const conflicts = detail.cohorts.flatMap((cohort: any) => (
      cohort.encounters.flatMap((encounter: any) => findPlanningEncounterConflicts({
        technician_id: encounter.technician_id,
        day_date: encounter.day_date,
        start_time: encounter.start_time,
        end_time: encounter.end_time,
        exclude_planning_encounter_id: encounter.id,
        exclude_published_cohort_id: encounter.published_cohort_id
      }).map((conflict) => ({ planning_encounter_id: encounter.id, ...conflict })))
    ));
    return res.json({ ok: conflicts.length === 0, conflicts });
  });
}
```

- [ ] **Step 4: Register planning routes**

In `apps/backend/src/app.ts`, import and register routes:

```ts
import { registerPlanningRoutes } from './planning/routes.js';
```

Inside `createApp`, after core routes are registered:

```ts
  registerPlanningRoutes(app);
```

If `createApp` registers `registerCoreRoutes(app, options)` near the end, put `registerPlanningRoutes(app)` immediately after it so auth middleware behavior stays consistent with existing operational routes.

- [ ] **Step 5: Run API test**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning API creates workspace"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/app.ts apps/backend/src/planning/routes.ts apps/backend/src/planning/planning.test.ts
git commit -m "feat: add planning workspace API"
```

---

### Task 4: Add Publish Workflow From Planning To Turmas

**Files:**
- Modify: `apps/backend/src/planning/service.ts`
- Modify: `apps/backend/src/planning/routes.ts`
- Modify: `apps/backend/src/planning/planning.test.ts`

- [ ] **Step 1: Add failing publish test**

Append to `apps/backend/src/planning/planning.test.ts`:

```ts
test('planning publish creates real cohort with module block, schedule days and allocation', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 2, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name, cost_per_day) values (?, ?, 0)')
      .run('tech-ana', 'Ana Técnica');

    const workspace = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Publicação',
      mode: 'Manual',
      horizon_days: 60,
      company_ids: ['comp-delta']
    });
    const workspaceId = workspace.body.workspace.id as string;

    await request(app).post(`/planning/workspaces/${workspaceId}/cohorts`).send({
      company_id: 'comp-delta',
      module_id: 'mod-install',
      technician_id: 'tech-ana',
      name: 'Delta · Instalação',
      delivery_mode: 'Online',
      period: 'Meio_periodo',
      encounters: [
        { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' },
        { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
      ]
    });

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`).send({});

    assert.equal(published.status, 200);
    assert.equal(published.body.created_cohorts, 1);
    assert.equal(published.body.updated_cohorts, 0);

    const cohort = db.prepare('select * from cohort where planning_workspace_id = ?').get(workspaceId) as any;
    assert.ok(cohort);
    assert.equal(cohort.technician_id, 'tech-ana');
    assert.equal(cohort.period, 'Meio_periodo');

    const blocks = db.prepare('select * from cohort_module_block where cohort_id = ?').all(cohort.id);
    assert.equal(blocks.length, 1);

    const schedule = db.prepare('select * from cohort_schedule_day where cohort_id = ? order by day_index asc').all(cohort.id) as any[];
    assert.equal(schedule.length, 2);
    assert.equal(schedule[0].day_date, '2026-05-11');
    assert.equal(schedule[0].start_time, '10:00');

    const allocation = db.prepare('select * from cohort_allocation where cohort_id = ?').get(cohort.id) as any;
    assert.equal(allocation.company_id, 'comp-delta');
    assert.equal(allocation.module_id, 'mod-install');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run publish test to verify it fails**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning publish creates real cohort"`

Expected: FAIL with 404 for publish endpoint.

- [ ] **Step 3: Add publish helper**

In `apps/backend/src/planning/service.ts`, change the db import at the top from `import { db } from '../db.js';` to:

```ts
import { db, nowDateIso, uuid } from '../db.js';
```

Then append the publish helper to `apps/backend/src/planning/service.ts`:

```ts

export function publishPlanningWorkspace(workspaceId: string): {
  created_cohorts: number;
  updated_cohorts: number;
  encounter_count: number;
  version_number: number;
} {
  const workspace = db.prepare('select id from planning_workspace where id = ?').get(workspaceId) as { id: string } | undefined;
  if (!workspace) {
    throw new Error('Planejamento não encontrado.');
  }

  const planningCohorts = db.prepare(`
    select * from planning_cohort
    where workspace_id = ? and status <> 'Cancelado'
    order by created_at asc
  `).all(workspaceId) as Array<{
    id: string;
    company_id: string;
    module_id: string;
    technician_id: string | null;
    published_cohort_id: string | null;
    name: string;
    delivery_mode: 'Online' | 'Presencial' | 'Hibrida';
    period: 'Integral' | 'Meio_periodo';
    notes: string | null;
  }>;

  const encountersByPlanningCohort = new Map<string, Array<{
    id: string;
    day_date: string;
    start_time: string;
    end_time: string;
  }>>();
  const encounterRows = db.prepare(`
    select id, planning_cohort_id, day_date, start_time, end_time
    from planning_encounter
    where workspace_id = ? and status <> 'Cancelado'
    order by planning_cohort_id asc, encounter_index asc
  `).all(workspaceId) as Array<{
    id: string;
    planning_cohort_id: string;
    day_date: string;
    start_time: string;
    end_time: string;
  }>;
  encounterRows.forEach((row) => {
    const list = encountersByPlanningCohort.get(row.planning_cohort_id) ?? [];
    list.push(row);
    encountersByPlanningCohort.set(row.planning_cohort_id, list);
  });

  let createdCohorts = 0;
  let updatedCohorts = 0;
  const now = nowDateIso();

  const nextVersionRow = db.prepare(`
    select coalesce(max(version_number), 0) + 1 as next_version
    from planning_version
    where workspace_id = ?
  `).get(workspaceId) as { next_version: number };
  const versionNumber = nextVersionRow.next_version;

  const tx = db.transaction(() => {
    planningCohorts.forEach((planningCohort, cohortIndex) => {
      const encounters = encountersByPlanningCohort.get(planningCohort.id) ?? [];
      if (encounters.length === 0) {
        throw new Error(`Turma planejada "${planningCohort.name}" não tem encontros.`);
      }

      const firstEncounter = encounters[0];
      const cohortId = planningCohort.published_cohort_id ?? uuid('coh');
      const code = planningCohort.published_cohort_id
        ? null
        : `PLAN-${workspaceId.slice(-5).toUpperCase()}-${String(cohortIndex + 1).padStart(2, '0')}`;

      if (planningCohort.published_cohort_id) {
        db.prepare(`
          update cohort
          set name = ?, start_date = ?, technician_id = ?, status = 'Planejada',
            capacity_companies = 1, period = ?, start_time = ?, end_time = ?,
            delivery_mode = ?, notes = ?, planning_workspace_id = ?, planning_cohort_id = ?
          where id = ?
        `).run(
          planningCohort.name,
          firstEncounter.day_date,
          planningCohort.technician_id,
          planningCohort.period,
          firstEncounter.start_time,
          firstEncounter.end_time,
          planningCohort.delivery_mode,
          planningCohort.notes,
          workspaceId,
          planningCohort.id,
          cohortId
        );
        updatedCohorts += 1;
      } else {
        db.prepare(`
          insert into cohort (
            id, code, name, start_date, technician_id, status, capacity_companies,
            notes, period, start_time, end_time, delivery_mode, planning_workspace_id, planning_cohort_id
          ) values (?, ?, ?, ?, ?, 'Planejada', 1, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cohortId,
          code,
          planningCohort.name,
          firstEncounter.day_date,
          planningCohort.technician_id,
          planningCohort.notes,
          planningCohort.period,
          firstEncounter.start_time,
          firstEncounter.end_time,
          planningCohort.delivery_mode,
          workspaceId,
          planningCohort.id
        );
        db.prepare('update planning_cohort set published_cohort_id = ? where id = ?').run(cohortId, planningCohort.id);
        createdCohorts += 1;
      }

      db.prepare('delete from cohort_module_block where cohort_id = ?').run(cohortId);
      db.prepare(`
        insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
        values (?, ?, ?, 1, 1, ?)
      `).run(uuid('blk'), cohortId, planningCohort.module_id, encounters.length);

      db.prepare('delete from cohort_schedule_day where cohort_id = ?').run(cohortId);
      const insertSchedule = db.prepare(`
        insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
        values (?, ?, ?, ?, ?, ?)
      `);
      encounters.forEach((encounter, index) => {
        insertSchedule.run(uuid('csd'), cohortId, index + 1, encounter.day_date, encounter.start_time, encounter.end_time);
        db.prepare(`
          update planning_encounter
          set status = 'Publicado', published_cohort_id = ?, updated_at = ?
          where id = ?
        `).run(cohortId, now, encounter.id);
      });

      db.prepare(`
        insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
        values (?, ?, ?, ?, 1, 'Previsto', ?)
        on conflict(cohort_id, company_id, module_id)
        do update set status = excluded.status, notes = excluded.notes
      `).run(uuid('all'), cohortId, planningCohort.company_id, planningCohort.module_id, 'Criado via aba Planejar.');

      db.prepare(`
        update planning_cohort
        set status = 'Publicado', updated_at = ?
        where id = ?
      `).run(now, planningCohort.id);
    });

    db.prepare(`
      update planning_workspace
      set status = 'Publicado', published_at = ?, updated_at = ?
      where id = ?
    `).run(now, now, workspaceId);

    db.prepare(`
      insert into planning_version (id, workspace_id, version_number, action, summary_json, created_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(
      uuid('plv'),
      workspaceId,
      versionNumber,
      'publish',
      JSON.stringify({
        created_cohorts: createdCohorts,
        updated_cohorts: updatedCohorts,
        encounter_count: encounterRows.length
      }),
      now
    );
  });

  tx();

  return {
    created_cohorts: createdCohorts,
    updated_cohorts: updatedCohorts,
    encounter_count: encounterRows.length,
    version_number: versionNumber
  };
}
```

- [ ] **Step 4: Add publish route**

In `apps/backend/src/planning/routes.ts`, update import:

```ts
import { findPlanningEncounterConflicts, publishPlanningWorkspace, validatePlanningEncounterPayload } from './service.js';
```

Inside `registerPlanningRoutes`, add:

```ts
  app.post('/planning/workspaces/:workspaceId/publish', (req, res) => {
    const detail = readWorkspace(req.params.workspaceId);
    if (!detail) return res.status(404).json({ message: 'Planejamento não encontrado.' });

    const conflicts = detail.cohorts.flatMap((cohort: any) => (
      cohort.encounters.flatMap((encounter: any) => findPlanningEncounterConflicts({
        technician_id: encounter.technician_id,
        day_date: encounter.day_date,
        start_time: encounter.start_time,
        end_time: encounter.end_time,
        exclude_planning_encounter_id: encounter.id,
        exclude_published_cohort_id: encounter.published_cohort_id
      }).map((conflict) => ({ planning_encounter_id: encounter.id, ...conflict })))
    ));

    if (conflicts.length > 0) {
      return res.status(409).json({ message: 'Planejamento possui conflitos.', conflicts });
    }

    try {
      return res.json(publishPlanningWorkspace(req.params.workspaceId));
    } catch (error) {
      return res.status(400).json({ message: 'Não foi possível publicar planejamento.', detail: errorMessage(error) });
    }
  });
```

- [ ] **Step 5: Run publish test**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning publish creates real cohort"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/planning/service.ts apps/backend/src/planning/routes.ts apps/backend/src/planning/planning.test.ts
git commit -m "feat: publish planning cohorts"
```

---

### Task 5: Add Replanning Encounter Updates

**Files:**
- Modify: `apps/backend/src/planning/routes.ts`
- Modify: `apps/backend/src/planning/planning.test.ts`

- [ ] **Step 1: Add failing replan test**

Append to `apps/backend/src/planning/planning.test.ts`:

```ts
test('replanning updates a single published encounter and republishes cohort schedule', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-replan');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 2, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name, cost_per_day) values (?, ?, 0)')
      .run('tech-ana', 'Ana Técnica');

    const workspace = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Replanejamento',
      company_ids: ['comp-delta']
    });
    const workspaceId = workspace.body.workspace.id as string;
    const createdCohort = await request(app).post(`/planning/workspaces/${workspaceId}/cohorts`).send({
      company_id: 'comp-delta',
      module_id: 'mod-install',
      technician_id: 'tech-ana',
      name: 'Delta · Instalação',
      encounters: [
        { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' },
        { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
      ]
    });
    const encounterId = createdCohort.body.encounters[1].id as string;
    await request(app).post(`/planning/workspaces/${workspaceId}/publish`).send({});

    const updated = await request(app)
      .patch(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`)
      .send({
        day_date: '2026-05-15',
        start_time: '11:00',
        end_time: '14:00',
        status: 'Confirmado'
      });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.workspace.status, 'Alteracao_pendente');

    const republished = await request(app).post(`/planning/workspaces/${workspaceId}/publish`).send({});
    assert.equal(republished.status, 200);
    assert.equal(republished.body.updated_cohorts, 1);

    const cohort = db.prepare('select id from cohort where planning_workspace_id = ?').get(workspaceId) as any;
    const schedule = db.prepare(`
      select day_index, day_date, start_time, end_time
      from cohort_schedule_day
      where cohort_id = ?
      order by day_index asc
    `).all(cohort.id) as any[];

    assert.equal(schedule[1].day_date, '2026-05-15');
    assert.equal(schedule[1].start_time, '11:00');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run replan test to verify it fails**

Run: `npm --workspace apps/backend test -- --test-name-pattern="replanning updates"`

Expected: FAIL with 404 for encounter PATCH endpoint.

- [ ] **Step 3: Add PATCH encounter route**

In `apps/backend/src/planning/routes.ts`, add near other route schemas:

```ts
const updateEncounterSchema = z.object({
  technician_id: z.string().nullable().optional(),
  day_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status: z.enum(planningEncounterStatusValues).optional(),
  notes: z.string().nullable().optional()
});
```

Inside `registerPlanningRoutes`, add:

```ts
  app.patch('/planning/workspaces/:workspaceId/encounters/:encounterId', (req, res) => {
    const parsed = updateEncounterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const existing = db.prepare(`
      select pe.*, pw.status as workspace_status
      from planning_encounter pe
      join planning_workspace pw on pw.id = pe.workspace_id
      where pe.id = ? and pe.workspace_id = ?
    `).get(req.params.encounterId, req.params.workspaceId) as any;

    if (!existing) return res.status(404).json({ message: 'Encontro não encontrado.' });

    const next = {
      technician_id: Object.prototype.hasOwnProperty.call(parsed.data, 'technician_id') ? parsed.data.technician_id : existing.technician_id,
      day_date: parsed.data.day_date ?? existing.day_date,
      start_time: parsed.data.start_time ?? existing.start_time,
      end_time: parsed.data.end_time ?? existing.end_time,
      status: parsed.data.status ?? existing.status,
      notes: Object.prototype.hasOwnProperty.call(parsed.data, 'notes') ? parsed.data.notes : existing.notes
    };

    const validation = validatePlanningEncounterPayload({
      day_date: next.day_date,
      start_time: next.start_time,
      end_time: next.end_time
    });
    if (!validation.ok) return res.status(400).json({ message: validation.message });

    const conflicts = findPlanningEncounterConflicts({
      technician_id: next.technician_id,
      day_date: next.day_date,
      start_time: next.start_time,
      end_time: next.end_time,
      exclude_planning_encounter_id: req.params.encounterId,
      exclude_published_cohort_id: existing.published_cohort_id
    });
    if (conflicts.length > 0) {
      return res.status(409).json({ message: 'Encontro possui conflito.', conflicts });
    }

    const now = nowDateIso();
    const nextWorkspaceStatus = existing.workspace_status === 'Publicado'
      ? 'Alteracao_pendente'
      : existing.workspace_status;

    const tx = db.transaction(() => {
      db.prepare(`
        update planning_encounter
        set technician_id = ?, day_date = ?, start_time = ?, end_time = ?, status = ?, notes = ?, updated_at = ?
        where id = ?
      `).run(
        next.technician_id,
        next.day_date,
        next.start_time,
        next.end_time,
        next.status,
        next.notes,
        now,
        req.params.encounterId
      );
      db.prepare('update planning_workspace set status = ?, updated_at = ? where id = ?')
        .run(nextWorkspaceStatus, now, req.params.workspaceId);
    });

    tx();
    return res.json(readWorkspace(req.params.workspaceId));
  });
```

- [ ] **Step 4: Run replan test**

Run: `npm --workspace apps/backend test -- --test-name-pattern="replanning updates"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/planning/routes.ts apps/backend/src/planning/planning.test.ts
git commit -m "feat: replan published encounters"
```

---

### Task 6: Add Frontend API Types And Navigation

**Files:**
- Modify: `apps/frontend/src/types/index.ts`
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/auth/navigation.ts`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/components/Layout.tsx`
- Create: `apps/frontend/src/pages/PlanningPage.tsx`
- Test: `apps/frontend/src/auth/navigation.test.ts`

- [ ] **Step 1: Add failing navigation test**

Append to `apps/frontend/src/auth/navigation.test.ts`:

```ts
test('planning nav item is visible to calendar or cohort operators', () => {
  const user = {
    id: 'user-planejar',
    username: 'planner',
    display_name: 'Planner',
    role: 'custom',
    permissions: ['calendar', 'cohorts']
  } as const;

  expect(visibleNavItemsForUser(user).some((item) => item.to === '/planejar')).toBe(true);
  expect(canAccessPath(user, '/planejar')).toBe(true);
});
```

- [ ] **Step 2: Run navigation test to verify it fails**

Run: `npm --workspace apps/frontend test -- src/auth/navigation.test.ts`

Expected: FAIL because `/planejar` nav item does not exist.

- [ ] **Step 3: Add frontend planning types**

Append to `apps/frontend/src/types/index.ts`:

```ts
export type PlanningWorkspaceStatus = 'Rascunho' | 'Publicado' | 'Alteracao_pendente' | 'Arquivado';
export type PlanningMode = 'Manual' | 'Assistido' | 'Automatico';
export type PlanningEncounterStatus = 'Rascunho' | 'Confirmacao_cliente' | 'Confirmado' | 'Publicado' | 'Cancelado';

export type PlanningEncounter = {
  id: string;
  workspace_id: string;
  planning_cohort_id: string;
  company_id: string;
  module_id: string;
  technician_id: string | null;
  technician_name?: string | null;
  encounter_index: number;
  day_date: string;
  start_time: string;
  end_time: string;
  status: PlanningEncounterStatus;
  notes: string | null;
  published_cohort_id: string | null;
};

export type PlanningCohort = {
  id: string;
  workspace_id: string;
  company_id: string;
  company_name: string;
  module_id: string;
  module_code: string;
  module_name: string;
  technician_id: string | null;
  technician_name?: string | null;
  published_cohort_id: string | null;
  name: string;
  status: string;
  delivery_mode: 'Online' | 'Presencial' | 'Hibrida';
  period: 'Integral' | 'Meio_periodo';
  notes: string | null;
  encounters: PlanningEncounter[];
};

export type PlanningWorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    status: PlanningWorkspaceStatus;
    mode: PlanningMode;
    horizon_days: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
  };
  clients: Array<{ company_id: string; company_name: string; priority: number }>;
  cohorts: PlanningCohort[];
};
```

- [ ] **Step 4: Add API client methods**

In `apps/frontend/src/services/api.ts`, update imports to include planning types:

```ts
  PlanningWorkspaceDetail
```

Add to `api` object:

```ts
  planningWorkspaces: () =>
    req<{ workspaces: Array<{ id: string; name: string; status: string; client_count: number; encounter_count: number }> }>('/planning/workspaces'),
  planningWorkspace: (id: string) =>
    req<PlanningWorkspaceDetail>(`/planning/workspaces/${id}`),
  createPlanningWorkspace: (payload: {
    name: string;
    mode?: 'Manual' | 'Assistido' | 'Automatico';
    horizon_days?: number;
    notes?: string | null;
    company_ids?: string[];
  }) =>
    req<PlanningWorkspaceDetail>('/planning/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createPlanningCohort: (workspaceId: string, payload: {
    company_id: string;
    module_id: string;
    technician_id?: string | null;
    name: string;
    status?: string;
    delivery_mode?: 'Online' | 'Presencial' | 'Hibrida';
    period?: 'Integral' | 'Meio_periodo';
    notes?: string | null;
    encounters: Array<{
      day_date: string;
      start_time: string;
      end_time: string;
      status?: string;
      notes?: string | null;
    }>;
  }) =>
    req(`/planning/workspaces/${workspaceId}/cohorts`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updatePlanningEncounter: (workspaceId: string, encounterId: string, payload: {
    technician_id?: string | null;
    day_date?: string;
    start_time?: string;
    end_time?: string;
    status?: string;
    notes?: string | null;
  }) =>
    req<PlanningWorkspaceDetail>(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  validatePlanningWorkspace: (workspaceId: string) =>
    req<{ ok: boolean; conflicts: unknown[] }>(`/planning/workspaces/${workspaceId}/validate`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  publishPlanningWorkspace: (workspaceId: string) =>
    req<{ created_cohorts: number; updated_cohorts: number; encounter_count: number; version_number: number }>(
      `/planning/workspaces/${workspaceId}/publish`,
      { method: 'POST', body: JSON.stringify({}) }
    ),
```

- [ ] **Step 5: Add route and nav**

In `apps/frontend/src/auth/navigation.ts`, add after Calendário:

```ts
  { to: '/planejar', label: 'Planejar', permissions: ['calendar', 'cohorts'] },
```

In `apps/frontend/src/App.tsx`, import:

```ts
import { PlanningPage } from './pages/PlanningPage';
```

Add route near `/calendario` and `/turmas`:

```tsx
      <Route
        path="/planejar"
        element={(
          <ProtectedRoute user={user} permissions={['calendar', 'cohorts']} fallback={defaultRoute}>
            <PlanningPage />
          </ProtectedRoute>
        )}
      />
```

In `apps/frontend/src/components/Layout.tsx`, add before calendario context:

```ts
  if (pathname.startsWith('/planejar')) {
    return {
      title: 'Planejamento de Agenda',
      subtitle: 'Monte turmas por cliente, módulo, técnico e horário real antes de publicar.',
      badge: 'Rascunhos e capacidade'
    };
  }
```

- [ ] **Step 6: Create minimal page**

Create `apps/frontend/src/pages/PlanningPage.tsx`:

```tsx
export function PlanningPage() {
  return (
    <div className="page planning-page">
      <div className="page-header">
        <div>
          <h1>Planejar</h1>
          <p>Rascunhe turmas por cliente e módulo, valide técnicos e publique encontros na agenda real.</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run navigation test**

Run: `npm --workspace apps/frontend test -- src/auth/navigation.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/types/index.ts apps/frontend/src/services/api.ts apps/frontend/src/auth/navigation.ts apps/frontend/src/App.tsx apps/frontend/src/components/Layout.tsx apps/frontend/src/pages/PlanningPage.tsx apps/frontend/src/auth/navigation.test.ts
git commit -m "feat: add planning route"
```

---

### Task 7: Build Planning Page Data Shell

**Files:**
- Modify: `apps/frontend/src/pages/PlanningPage.tsx`
- Create: `apps/frontend/src/pages/PlanningPage.test.tsx`
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Add failing page render test**

Create `apps/frontend/src/pages/PlanningPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { api } from '../services/api';
import { PlanningPage } from './PlanningPage';

vi.mock('../services/api', () => ({
  api: {
    planningWorkspaces: vi.fn(),
    planningWorkspace: vi.fn()
  }
}));

describe('PlanningPage', () => {
  test('renders workspace list and selected planning columns', async () => {
    vi.mocked(api.planningWorkspaces).mockResolvedValue({
      workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 3, encounter_count: 12 }]
    });
    vi.mocked(api.planningWorkspace).mockResolvedValue({
      workspace: {
        id: 'pln-1',
        name: 'Carteira Maio',
        status: 'Rascunho',
        mode: 'Manual',
        horizon_days: 60,
        notes: null,
        created_at: '2026-05-07',
        updated_at: '2026-05-07',
        published_at: null
      },
      clients: [{ company_id: 'comp-delta', company_name: 'Delta Ferramentaria', priority: 0 }],
      cohorts: []
    });

    render(<PlanningPage />);

    expect(await screen.findByText('Carteira Maio')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Delta Ferramentaria')).toBeInTheDocument());
    expect(screen.getByText('Agenda por horário')).toBeInTheDocument();
    expect(screen.getByText('Painel contextual')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run page test to verify it fails**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: FAIL because `PlanningPage` does not load data.

- [ ] **Step 3: Implement data shell**

Replace `PlanningPage.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { PlanningCohort, PlanningEncounter, PlanningWorkspaceDetail } from '../types';

type WorkspaceSummary = {
  id: string;
  name: string;
  status: string;
  client_count: number;
  encounter_count: number;
};

export function PlanningPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlanningWorkspaceDetail | null>(null);
  const [selectedEncounter, setSelectedEncounter] = useState<PlanningEncounter | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.planningWorkspaces()
      .then((response) => {
        setWorkspaces(response.workspaces);
        setSelectedWorkspaceId(response.workspaces[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar planejamentos.'));
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setDetail(null);
      return;
    }
    api.planningWorkspace(selectedWorkspaceId)
      .then((response) => {
        setDetail(response);
        setSelectedEncounter(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar planejamento.'));
  }, [selectedWorkspaceId]);

  const encounters = useMemo(() => (
    detail?.cohorts.flatMap((cohort) => cohort.encounters.map((encounter) => ({ cohort, encounter }))) ?? []
  ), [detail]);

  function clientCohorts(companyId: string): PlanningCohort[] {
    return detail?.cohorts.filter((cohort) => cohort.company_id === companyId) ?? [];
  }

  return (
    <div className="page planning-page">
      <div className="page-header planning-page-header">
        <div>
          <h1>Planejar</h1>
          <p>Rascunhe turmas por cliente e módulo, valide técnicos e publique encontros na agenda real.</p>
        </div>
        <div className="planning-workspace-switcher">
          <label>
            Planejamento
            <select
              value={selectedWorkspaceId ?? ''}
              onChange={(event) => setSelectedWorkspaceId(event.target.value || null)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="planning-workbench">
        <aside className="planning-queue" aria-label="Carteira de planejamento">
          <div className="planning-panel-header">
            <strong>Carteira</strong>
            <small>{detail?.workspace.status ?? 'Sem planejamento'}</small>
          </div>
          <div className="planning-filter-row">
            <button type="button">Pendentes</button>
            <button type="button">Risco</button>
            <button type="button">Sem data</button>
          </div>
          <div className="planning-client-list">
            {(detail?.clients ?? []).map((client) => (
              <div key={client.company_id} className="planning-client-block">
                <div className="planning-client-title">
                  <strong>{client.company_name}</strong>
                  <span>{clientCohorts(client.company_id).length} turma(s)</span>
                </div>
                {clientCohorts(client.company_id).map((cohort) => (
                  <button
                    key={cohort.id}
                    type="button"
                    className="planning-module-row"
                    onClick={() => setSelectedEncounter(cohort.encounters[0] ?? null)}
                  >
                    <strong>{cohort.module_code}</strong>
                    <span>{cohort.module_name}</span>
                    <small>{cohort.encounters.length} encontro(s)</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        <main className="planning-calendar" aria-label="Agenda por horário">
          <div className="planning-panel-header">
            <strong>Agenda por horário</strong>
            <div className="planning-zoom-tabs" role="group" aria-label="Zoom do planejamento">
              <button type="button">Dia</button>
              <button type="button" className="is-active">Semana</button>
              <button type="button">30 dias</button>
              <button type="button">60 dias</button>
            </div>
          </div>
          <div className="planning-time-grid">
            {encounters.length === 0 ? (
              <p className="muted">Nenhum encontro planejado ainda.</p>
            ) : encounters.map(({ cohort, encounter }) => (
              <button
                key={encounter.id}
                type="button"
                className={`planning-encounter planning-encounter--${encounter.status.toLowerCase()}`}
                onClick={() => setSelectedEncounter(encounter)}
              >
                <strong>{encounter.start_time} - {encounter.end_time}</strong>
                <span>{cohort.company_name} · {cohort.module_code}</span>
                <small>{encounter.day_date} · {encounter.technician_name ?? cohort.technician_name ?? 'Sem técnico'}</small>
              </button>
            ))}
          </div>
        </main>

        <aside className="planning-context-panel" aria-label="Painel contextual">
          <div className="planning-panel-header">
            <strong>Painel contextual</strong>
            <small>{selectedEncounter ? 'Encontro selecionado' : 'Resumo'}</small>
          </div>
          {selectedEncounter ? (
            <div className="planning-editor-summary">
              <label>
                Data
                <input value={selectedEncounter.day_date} readOnly />
              </label>
              <label>
                Início
                <input value={selectedEncounter.start_time} readOnly />
              </label>
              <label>
                Fim
                <input value={selectedEncounter.end_time} readOnly />
              </label>
              <label>
                Aplicar
                <select defaultValue="encounter">
                  <option value="encounter">Só este encontro</option>
                  <option value="module">Todos do módulo</option>
                  <option value="cohort">Esta turma</option>
                </select>
              </label>
            </div>
          ) : (
            <p className="muted">Selecione um encontro para editar data, horário, técnico e escopo.</p>
          )}
          <button
            type="button"
            onClick={() => setMessage('Validação será executada antes da publicação.')}
          >
            Publicar alterações válidas
          </button>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add focused CSS**

Append to `apps/frontend/src/styles.css`:

```css
.planning-page-header {
  align-items: end;
}

.planning-workspace-switcher label {
  min-width: 260px;
}

.planning-workbench {
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(420px, 1fr) minmax(260px, 300px);
  gap: 10px;
  align-items: start;
}

.planning-queue,
.planning-calendar,
.planning-context-panel {
  min-height: 620px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.planning-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-soft);
}

.planning-panel-header small {
  color: var(--color-text-muted);
}

.planning-filter-row,
.planning-zoom-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.planning-filter-row {
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border);
}

.planning-filter-row button,
.planning-zoom-tabs button {
  padding: 5px 8px;
}

.planning-zoom-tabs .is-active {
  background: var(--color-primary);
  color: var(--color-surface);
}

.planning-client-list {
  display: flex;
  flex-direction: column;
}

.planning-client-block {
  padding: 10px;
  border-bottom: 1px solid var(--color-border);
}

.planning-client-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.planning-client-title span {
  color: var(--color-text-muted);
}

.planning-module-row {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  text-align: left;
  background: var(--color-surface);
}

.planning-time-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  padding: 10px;
}

.planning-encounter {
  min-height: 76px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  border: 1px solid var(--color-border);
  background: var(--color-surface-soft);
}

.planning-encounter small {
  color: var(--color-text-muted);
}

.planning-editor-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px;
}

.planning-context-panel > button {
  margin: 10px;
  width: calc(100% - 20px);
}

@media (max-width: 1160px) {
  .planning-workbench {
    grid-template-columns: 1fr;
  }

  .planning-queue,
  .planning-calendar,
  .planning-context-panel {
    min-height: auto;
  }
}
```

- [ ] **Step 5: Run page test**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/PlanningPage.tsx apps/frontend/src/pages/PlanningPage.test.tsx apps/frontend/src/styles.css
git commit -m "feat: render planning workbench"
```

---

### Task 8: Add Encounter Editing In The Context Panel

**Files:**
- Modify: `apps/frontend/src/pages/PlanningPage.tsx`
- Modify: `apps/frontend/src/pages/PlanningPage.test.tsx`

- [ ] **Step 1: Add failing edit test**

Update the import block in `PlanningPage.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';
```

Then append this test:

```tsx

test('updates selected encounter from context panel', async () => {
  const user = userEvent.setup();
  vi.mocked(api.planningWorkspaces).mockResolvedValue({
    workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Publicado', client_count: 1, encounter_count: 1 }]
  });
  vi.mocked(api.planningWorkspace).mockResolvedValue({
    workspace: {
      id: 'pln-1',
      name: 'Carteira Maio',
      status: 'Publicado',
      mode: 'Manual',
      horizon_days: 60,
      notes: null,
      created_at: '2026-05-07',
      updated_at: '2026-05-07',
      published_at: '2026-05-07'
    },
    clients: [{ company_id: 'comp-delta', company_name: 'Delta Ferramentaria', priority: 0 }],
    cohorts: [{
      id: 'plc-1',
      workspace_id: 'pln-1',
      company_id: 'comp-delta',
      company_name: 'Delta Ferramentaria',
      module_id: 'mod-1',
      module_code: 'MOD-01',
      module_name: 'Instalação',
      technician_id: 'tech-ana',
      technician_name: 'Ana',
      published_cohort_id: 'coh-1',
      name: 'Delta · Instalação',
      status: 'Publicado',
      delivery_mode: 'Online',
      period: 'Meio_periodo',
      notes: null,
      encounters: [{
        id: 'ple-1',
        workspace_id: 'pln-1',
        planning_cohort_id: 'plc-1',
        company_id: 'comp-delta',
        module_id: 'mod-1',
        technician_id: 'tech-ana',
        technician_name: 'Ana',
        encounter_index: 1,
        day_date: '2026-05-11',
        start_time: '10:00',
        end_time: '14:00',
        status: 'Publicado',
        notes: null,
        published_cohort_id: 'coh-1'
      }]
    }]
  });
  vi.mocked(api.updatePlanningEncounter).mockResolvedValue({
    workspace: {
      id: 'pln-1',
      name: 'Carteira Maio',
      status: 'Alteracao_pendente',
      mode: 'Manual',
      horizon_days: 60,
      notes: null,
      created_at: '2026-05-07',
      updated_at: '2026-05-07',
      published_at: '2026-05-07'
    },
    clients: [{ company_id: 'comp-delta', company_name: 'Delta Ferramentaria', priority: 0 }],
    cohorts: []
  });

  render(<PlanningPage />);
  await user.click(await screen.findByText(/10:00 - 14:00/i));
  await user.clear(screen.getByLabelText('Data'));
  await user.type(screen.getByLabelText('Data'), '2026-05-15');
  await user.click(screen.getByRole('button', { name: 'Salvar encontro' }));

  expect(api.updatePlanningEncounter).toHaveBeenCalledWith('pln-1', 'ple-1', expect.objectContaining({
    day_date: '2026-05-15'
  }));
});
```

- [ ] **Step 2: Run edit test to verify it fails**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: FAIL because context panel fields are read-only and no save handler exists.

- [ ] **Step 3: Implement editable draft state**

In `PlanningPage.tsx`, add state:

```tsx
  const [encounterDraft, setEncounterDraft] = useState({
    day_date: '',
    start_time: '',
    end_time: '',
    status: 'Rascunho',
    notes: ''
  });
```

Add effect after selected encounter state:

```tsx
  useEffect(() => {
    if (!selectedEncounter) {
      setEncounterDraft({ day_date: '', start_time: '', end_time: '', status: 'Rascunho', notes: '' });
      return;
    }
    setEncounterDraft({
      day_date: selectedEncounter.day_date,
      start_time: selectedEncounter.start_time,
      end_time: selectedEncounter.end_time,
      status: selectedEncounter.status,
      notes: selectedEncounter.notes ?? ''
    });
  }, [selectedEncounter]);
```

Add save function:

```tsx
  async function saveSelectedEncounter() {
    if (!detail || !selectedEncounter) return;
    try {
      const updated = await api.updatePlanningEncounter(detail.workspace.id, selectedEncounter.id, {
        day_date: encounterDraft.day_date,
        start_time: encounterDraft.start_time,
        end_time: encounterDraft.end_time,
        status: encounterDraft.status,
        notes: encounterDraft.notes || null
      });
      setDetail(updated);
      setSelectedEncounter(null);
      setMessage('Encontro atualizado. Publique para sincronizar turmas e calendário.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar encontro.');
    }
  }
```

Replace the selected encounter editor inputs with editable controls:

```tsx
              <label>
                Data
                <input
                  value={encounterDraft.day_date}
                  onChange={(event) => setEncounterDraft((prev) => ({ ...prev, day_date: event.target.value }))}
                />
              </label>
              <label>
                Início
                <input
                  value={encounterDraft.start_time}
                  onChange={(event) => setEncounterDraft((prev) => ({ ...prev, start_time: event.target.value }))}
                />
              </label>
              <label>
                Fim
                <input
                  value={encounterDraft.end_time}
                  onChange={(event) => setEncounterDraft((prev) => ({ ...prev, end_time: event.target.value }))}
                />
              </label>
```

Add button under editor grid:

```tsx
              <button type="button" onClick={saveSelectedEncounter}>
                Salvar encontro
              </button>
```

- [ ] **Step 4: Update API mock**

Add `updatePlanningEncounter: vi.fn()` to the `vi.mock('../services/api')` block.

- [ ] **Step 5: Run edit test**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/PlanningPage.tsx apps/frontend/src/pages/PlanningPage.test.tsx
git commit -m "feat: edit planning encounters"
```

---

### Task 9: Add Publish Controls And Validation Feedback

**Files:**
- Modify: `apps/frontend/src/pages/PlanningPage.tsx`
- Modify: `apps/frontend/src/pages/PlanningPage.test.tsx`

- [ ] **Step 1: Add failing publish test**

Append to `PlanningPage.test.tsx`:

```tsx
test('validates and publishes current workspace', async () => {
  const user = userEvent.setup();
  vi.mocked(api.planningWorkspaces).mockResolvedValue({
    workspaces: [{ id: 'pln-1', name: 'Carteira Maio', status: 'Rascunho', client_count: 1, encounter_count: 1 }]
  });
  vi.mocked(api.planningWorkspace).mockResolvedValue({
    workspace: {
      id: 'pln-1',
      name: 'Carteira Maio',
      status: 'Rascunho',
      mode: 'Manual',
      horizon_days: 60,
      notes: null,
      created_at: '2026-05-07',
      updated_at: '2026-05-07',
      published_at: null
    },
    clients: [],
    cohorts: []
  });
  vi.mocked(api.validatePlanningWorkspace).mockResolvedValue({ ok: true, conflicts: [] });
  vi.mocked(api.publishPlanningWorkspace).mockResolvedValue({
    created_cohorts: 1,
    updated_cohorts: 0,
    encounter_count: 2,
    version_number: 1
  });

  render(<PlanningPage />);
  await screen.findByText('Carteira Maio');
  await user.click(screen.getByRole('button', { name: 'Publicar alterações válidas' }));

  expect(api.validatePlanningWorkspace).toHaveBeenCalledWith('pln-1');
  expect(api.publishPlanningWorkspace).toHaveBeenCalledWith('pln-1');
  expect(await screen.findByText(/Publicado: 1 criada/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run publish test to verify it fails**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: FAIL because publish button only sets a local message.

- [ ] **Step 3: Implement publish handler**

In `PlanningPage.tsx`, add:

```tsx
  async function publishCurrentWorkspace() {
    if (!detail) return;
    try {
      const validation = await api.validatePlanningWorkspace(detail.workspace.id);
      if (!validation.ok) {
        setError(`Planejamento possui ${validation.conflicts.length} conflito(s).`);
        return;
      }
      const result = await api.publishPlanningWorkspace(detail.workspace.id);
      setMessage(`Publicado: ${result.created_cohorts} criada(s), ${result.updated_cohorts} atualizada(s), ${result.encounter_count} encontro(s).`);
      const refreshed = await api.planningWorkspace(detail.workspace.id);
      setDetail(refreshed);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao publicar planejamento.');
    }
  }
```

Change publish button:

```tsx
            onClick={publishCurrentWorkspace}
```

- [ ] **Step 4: Update API mock**

Add `validatePlanningWorkspace: vi.fn()` and `publishPlanningWorkspace: vi.fn()` to the API mock.

- [ ] **Step 5: Run publish test**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/PlanningPage.tsx apps/frontend/src/pages/PlanningPage.test.tsx
git commit -m "feat: publish planning workspace from UI"
```

---

### Task 10: Improve Time Grid Into Real Hour Layout

**Files:**
- Modify: `apps/frontend/src/pages/PlanningPage.tsx`
- Modify: `apps/frontend/src/styles.css`
- Modify: `apps/frontend/src/pages/PlanningPage.test.tsx`

- [ ] **Step 1: Add pure layout helper test**

Update the local page import in `PlanningPage.test.tsx` from `import { PlanningPage } from './PlanningPage';` to:

```tsx
import { encounterGridStyle, PlanningPage } from './PlanningPage';
```

Then append this test:

```tsx

test('encounterGridStyle maps real time to vertical layout', () => {
  expect(encounterGridStyle('10:00', '14:00')).toEqual({
    top: '20%',
    height: '40%'
  });
});
```

- [ ] **Step 2: Run helper test to verify it fails**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: FAIL because helper is not exported.

- [ ] **Step 3: Add layout helper**

At top of `PlanningPage.tsx`:

```tsx
function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function encounterGridStyle(startTime: string, endTime: string): { top: string; height: string } {
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  const total = dayEnd - dayStart;
  const start = Math.max(dayStart, Math.min(dayEnd, minutes(startTime)));
  const end = Math.max(start + 15, Math.min(dayEnd, minutes(endTime)));
  return {
    top: `${Math.round(((start - dayStart) / total) * 100)}%`,
    height: `${Math.round(((end - start) / total) * 100)}%`
  };
}
```

- [ ] **Step 4: Render day columns**

Replace `planning-time-grid` rendering with:

```tsx
            {encounters.length === 0 ? (
              <p className="muted">Nenhum encontro planejado ainda.</p>
            ) : (
              <div className="planning-hour-board">
                {encounters.map(({ cohort, encounter }) => (
                  <button
                    key={encounter.id}
                    type="button"
                    className={`planning-encounter planning-encounter--${encounter.status.toLowerCase()}`}
                    style={encounterGridStyle(encounter.start_time, encounter.end_time)}
                    onClick={() => setSelectedEncounter(encounter)}
                  >
                    <strong>{encounter.start_time} - {encounter.end_time}</strong>
                    <span>{cohort.company_name} · {cohort.module_code}</span>
                    <small>{encounter.day_date} · {encounter.technician_name ?? cohort.technician_name ?? 'Sem técnico'}</small>
                  </button>
                ))}
              </div>
            )}
```

- [ ] **Step 5: Update CSS**

In `styles.css`, replace `.planning-time-grid` and `.planning-encounter` definitions with:

```css
.planning-time-grid {
  padding: 10px;
}

.planning-hour-board {
  position: relative;
  min-height: 560px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background:
    repeating-linear-gradient(
      to bottom,
      var(--color-surface) 0,
      var(--color-surface) 55px,
      var(--color-surface-soft) 56px,
      var(--color-surface-soft) 112px
    );
  overflow: hidden;
}

.planning-encounter {
  position: absolute;
  left: 10px;
  right: 10px;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-soft);
}
```

- [ ] **Step 6: Run tests**

Run: `npm --workspace apps/frontend test -- src/pages/PlanningPage.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/PlanningPage.tsx apps/frontend/src/pages/PlanningPage.test.tsx apps/frontend/src/styles.css
git commit -m "feat: show planning encounters by real time"
```

---

### Task 11: Add First Assisted Suggestion Endpoint

**Files:**
- Modify: `apps/backend/src/planning/service.ts`
- Modify: `apps/backend/src/planning/routes.ts`
- Modify: `apps/backend/src/planning/planning.test.ts`

- [ ] **Step 1: Add failing suggestion test**

Append to `planning.test.ts`:

```ts
test('planning suggestions return conflict-free technician windows', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-suggestions');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 2, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name, cost_per_day) values (?, ?, 0)')
      .run('tech-ana', 'Ana Técnica');

    const response = await request(app)
      .post('/planning/suggestions')
      .send({
        module_id: 'mod-install',
        technician_ids: ['tech-ana'],
        date_from: '2026-05-11',
        date_to: '2026-05-15',
        duration_minutes: 240
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.suggestions[0].technician_id, 'tech-ana');
    assert.equal(response.body.suggestions[0].day_date, '2026-05-11');
    assert.equal(response.body.suggestions[0].start_time, '08:00');
    assert.equal(response.body.suggestions[0].end_time, '12:00');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run suggestion test to verify it fails**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning suggestions"`

Expected: FAIL with 404 for suggestions endpoint.

- [ ] **Step 3: Add simple suggestion helper**

Append to `planning/service.ts`:

```ts
function addDays(dateIso: string, diff: number): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function suggestPlanningWindows(args: {
  technician_ids: string[];
  date_from: string;
  date_to: string;
  duration_minutes: number;
  max_results?: number;
}) {
  const suggestions: Array<{ technician_id: string; day_date: string; start_time: string; end_time: string }> = [];
  const startMinute = 8 * 60;
  const endMinute = 18 * 60;
  const maxResults = args.max_results ?? 10;

  let cursor = args.date_from;
  while (cursor <= args.date_to && suggestions.length < maxResults) {
    for (const technicianId of args.technician_ids) {
      for (let minute = startMinute; minute + args.duration_minutes <= endMinute; minute += 30) {
        const startTime = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
        const end = minute + args.duration_minutes;
        const endTime = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
        const conflicts = findPlanningEncounterConflicts({
          technician_id: technicianId,
          day_date: cursor,
          start_time: startTime,
          end_time: endTime
        });
        if (conflicts.length === 0) {
          suggestions.push({ technician_id: technicianId, day_date: cursor, start_time: startTime, end_time: endTime });
          break;
        }
      }
      if (suggestions.length >= maxResults) break;
    }
    cursor = addDays(cursor, 1);
  }

  return suggestions;
}
```

- [ ] **Step 4: Add suggestion route**

In `planning/routes.ts`, import helper:

```ts
import { findPlanningEncounterConflicts, publishPlanningWorkspace, suggestPlanningWindows, validatePlanningEncounterPayload } from './service.js';
```

Add schema:

```ts
const suggestionSchema = z.object({
  module_id: z.string(),
  technician_ids: z.array(z.string()).min(1),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z.number().int().min(30).max(600),
  max_results: z.number().int().min(1).max(30).optional()
});
```

Inside `registerPlanningRoutes`, add:

```ts
  app.post('/planning/suggestions', (req, res) => {
    const parsed = suggestionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    return res.json({ suggestions: suggestPlanningWindows(parsed.data) });
  });
```

- [ ] **Step 5: Run suggestion test**

Run: `npm --workspace apps/backend test -- --test-name-pattern="planning suggestions"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/planning/service.ts apps/backend/src/planning/routes.ts apps/backend/src/planning/planning.test.ts
git commit -m "feat: suggest planning windows"
```

---

### Task 12: Final Verification And Manual Smoke

**Files:**
- No source file changes expected unless a verification command reveals a defect.

- [ ] **Step 1: Run backend tests**

Run: `npm --workspace apps/backend test`

Expected: PASS for all backend tests.

- [ ] **Step 2: Run frontend tests**

Run: `npm --workspace apps/frontend test`

Expected: PASS for all frontend tests.

- [ ] **Step 3: Run full build**

Run: `npm run build`

Expected: backend TypeScript build and frontend Vite build both complete successfully.

- [ ] **Step 4: Start local backend**

Run: `npm run dev:backend`

Expected: API starts on `http://localhost:4000`.

- [ ] **Step 5: Start local frontend**

Run in a second terminal: `npm run dev:frontend`

Expected: frontend starts on `http://localhost:5173`.

- [ ] **Step 6: Manual smoke**

In the browser:

1. Open `http://localhost:5173/planejar`.
2. Confirm the Planejar nav item appears for a user with `calendar` and `cohorts`.
3. Seed a planning workspace through the API with `POST /planning/workspaces` and `POST /planning/workspaces/:workspaceId/cohorts`.
4. Confirm the left column shows clients and module turmas.
5. Select an encounter and edit the date/time in the right panel.
6. Publish the planning workspace.
7. Open `/turmas` and confirm the turma exists.
8. Open `/calendario` and confirm the schedule appears on the published dates.
9. Return to `/planejar`, move one encounter, publish again and confirm turma/calendar update.

- [ ] **Step 7: Commit verification fixes if any**

If a fix was needed:

```bash
git add <changed-files>
git commit -m "fix: stabilize planning verification"
```

If no fix was needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: manual planning, turmas by client/module, real-time encounters, conflict validation, publish and replan are covered. 30/60 day macro view gets navigation and structure but not advanced heatmap density in this first implementation plan. Assisted mode gets a first conflict-free suggestion endpoint; full automatic optimization remains intentionally outside this plan.
- Red-flag scan: no vague marker terms or vague edge handling steps are present.
- Type consistency: backend status strings match frontend unions; route names match API client methods; publish links `planning_workspace_id` and `planning_cohort_id` are stored on real cohorts.
