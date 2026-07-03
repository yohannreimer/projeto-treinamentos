# Área de Tarefas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma página `/tarefas` com lista, filtros por aba, painel de detalhes lateral, checklist e comentários por tarefa — gestão interna geral da equipe.

**Architecture:** Quatro tabelas novas no SQLite (`task_area`, `task`, `task_checklist_item`, `task_comment`), rotas REST em `coreRoutes.ts` protegidas por `requireInternalAuth`, e componentes React com estado local para seleção e edição inline.

**Tech Stack:** SQLite (better-sqlite3), Express, Zod, React, TypeScript

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/backend/src/db.ts` | Modify | Adicionar 4 tabelas + seed de áreas padrão em `initDb()` |
| `apps/backend/src/internalAuth.ts` | Modify | Adicionar `'tasks'` a `INTERNAL_PERMISSION_KEYS` |
| `apps/backend/src/coreRoutes.ts` | Modify | Adicionar rotas de task-areas, tasks, checklist e comments |
| `apps/backend/src/tasks/tasks.test.ts` | Create | Testes de integração das rotas |
| `apps/frontend/src/auth/session.ts` | Modify | Adicionar `'tasks'` a `INTERNAL_PERMISSION_KEYS` |
| `apps/frontend/src/auth/navigation.ts` | Modify | Adicionar `/tarefas` a `APP_NAV_ITEMS` |
| `apps/frontend/src/App.tsx` | Modify | Adicionar rota `/tarefas` |
| `apps/frontend/src/services/api.ts` | Modify | Adicionar métodos de API para tasks |
| `apps/frontend/src/pages/TasksPage.tsx` | Create | Página principal: abas, filtros, tabela, estado de seleção |
| `apps/frontend/src/components/tasks/TaskDetailPanel.tsx` | Create | Painel lateral com metadados, checklist e comments |
| `apps/frontend/src/components/tasks/TaskFormModal.tsx` | Create | Modal de criação e edição de tarefa |
| `apps/frontend/src/components/tasks/TaskChecklist.tsx` | Create | Checklist interativo |
| `apps/frontend/src/components/tasks/TaskComments.tsx` | Create | Thread de comentários |

---

## Task 1: Schema do banco — 4 tabelas novas + seed

**Files:**
- Modify: `apps/backend/src/db.ts` — dentro de `initDb()`, antes do `}` final da função (próximo à linha 2940)

- [ ] **Step 1: Adicionar as 4 tabelas a `initDb()`**

Localizar o final da função `initDb()` em `db.ts` (linha ~2940, logo antes da função `shouldSeedFinanceDemoData`). Adicionar o bloco SQL antes do `}` de fechamento de `initDb()`:

```typescript
  // Área de Tarefas
  db.exec(`
    create table if not exists task_area (
      id text primary key,
      name text not null unique,
      color text not null default '#6366f1',
      position integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists task (
      id text primary key,
      title text not null,
      description text,
      area_id text not null,
      assignee_id text not null,
      assignee_name text not null,
      due_date text not null,
      priority text not null default 'Normal',
      status text not null default 'A_fazer',
      created_by text not null,
      created_at text not null,
      updated_at text not null,
      foreign key(area_id) references task_area(id)
    );

    create table if not exists task_checklist_item (
      id text primary key,
      task_id text not null,
      label text not null,
      completed integer not null default 0,
      position integer not null default 0,
      created_at text not null,
      foreign key(task_id) references task(id) on delete cascade
    );

    create table if not exists task_comment (
      id text primary key,
      task_id text not null,
      author_id text not null,
      author_name text not null,
      body text not null,
      created_at text not null,
      foreign key(task_id) references task(id) on delete cascade
    );

    create index if not exists idx_task_area_id on task(area_id);
    create index if not exists idx_task_assignee_id on task(assignee_id);
    create index if not exists idx_task_due_date on task(due_date);
    create index if not exists idx_task_checklist_task_id on task_checklist_item(task_id);
    create index if not exists idx_task_comment_task_id on task_comment(task_id);
  `);

  const defaultTaskAreas = [
    { id: 'tarea-tecnico', name: 'Técnico', color: '#3b82f6', position: 0 },
    { id: 'tarea-comercial', name: 'Comercial', color: '#f59e0b', position: 1 },
    { id: 'tarea-financeiro', name: 'Financeiro', color: '#10b981', position: 2 },
    { id: 'tarea-interno', name: 'Interno', color: '#6366f1', position: 3 },
    { id: 'tarea-rh', name: 'RH', color: '#ec4899', position: 4 }
  ];
  const existingAreaCount = db.prepare('select count(*) as count from task_area').get() as { count: number };
  if (existingAreaCount.count === 0) {
    const insertArea = db.prepare(`
      insert into task_area (id, name, color, position, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `);
    const nowIsoSeed = nowDateIso();
    defaultTaskAreas.forEach((area) => {
      insertArea.run(area.id, area.name, area.color, area.position, nowIsoSeed, nowIsoSeed);
    });
  }
```

- [ ] **Step 2: Verificar compilação do backend**

```bash
cd "apps/backend" && npx tsc --noEmit
```

Esperado: sem erros de compilação.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/db.ts
git commit -m "feat: adicionar tabelas task_area, task, task_checklist_item e task_comment"
```

---

## Task 2: Permissão `tasks` no backend e frontend

**Files:**
- Modify: `apps/backend/src/internalAuth.ts` — linha ~8, array `INTERNAL_PERMISSION_KEYS`
- Modify: `apps/frontend/src/auth/session.ts` — linha ~4, array `INTERNAL_PERMISSION_KEYS`

- [ ] **Step 1: Adicionar `'tasks'` ao backend**

Em `apps/backend/src/internalAuth.ts`, dentro de `INTERNAL_PERMISSION_KEYS`, adicionar `'tasks'` antes de `'admin'`:

```typescript
export const INTERNAL_PERMISSION_KEYS = [
  'dashboard',
  'calendar',
  'cohorts',
  'clients',
  'technicians',
  'implementation',
  'support',
  'recruitment',
  'licenses',
  'license_programs',
  'docs',
  'tasks',           // ← nova permissão
  'finance.read',
  'finance.write',
  'finance.approve',
  'finance.reconcile',
  'finance.close',
  'finance.billing',
  'admin'
] as const;
```

- [ ] **Step 2: Adicionar `'tasks'` ao frontend**

Em `apps/frontend/src/auth/session.ts`, mesmo array, mesma posição (antes de `'finance.read'`):

```typescript
export const INTERNAL_PERMISSION_KEYS = [
  'dashboard',
  'calendar',
  'cohorts',
  'clients',
  'technicians',
  'implementation',
  'support',
  'recruitment',
  'licenses',
  'license_programs',
  'docs',
  'tasks',           // ← nova permissão
  'finance.read',
  'finance.write',
  'finance.approve',
  'finance.reconcile',
  'finance.close',
  'finance.billing',
  'admin'
] as const;
```

- [ ] **Step 3: Verificar compilação**

```bash
cd "apps/backend" && npx tsc --noEmit
cd "apps/frontend" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/internalAuth.ts apps/frontend/src/auth/session.ts
git commit -m "feat: adicionar permissão tasks"
```

---

## Task 3: Rotas de task-areas

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts` — adicionar ao final de `registerCoreRoutes`, antes do `}` final

- [ ] **Step 1: Adicionar constantes e schemas para task-areas**

Adicionar perto das outras constantes no topo de `coreRoutes.ts` (antes da função `registerCoreRoutes`):

```typescript
const TASK_PRIORITY_VALUES = ['Critica', 'Alta', 'Normal', 'Baixa'] as const;
const TASK_STATUS_VALUES = ['A_fazer', 'Em_andamento', 'Concluida'] as const;

const taskAreaCreateSchema = z.object({
  name: z.string().min(1).max(60).trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
});

const taskCreateSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  area_id: z.string().min(1),
  assignee_id: z.string().min(1),
  assignee_name: z.string().min(1).max(120),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  description: z.string().max(5000).nullable().optional()
});

const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  area_id: z.string().min(1).optional(),
  assignee_id: z.string().min(1).optional(),
  assignee_name: z.string().min(1).max(120).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  description: z.string().max(5000).nullable().optional()
});

const taskChecklistItemCreateSchema = z.object({
  label: z.string().min(1).max(200).trim()
});

const taskChecklistItemUpdateSchema = z.object({
  label: z.string().min(1).max(200).trim().optional(),
  completed: z.boolean().optional()
});

const taskCommentCreateSchema = z.object({
  body: z.string().min(1).max(2000).trim()
});
```

- [ ] **Step 2: Adicionar rotas GET e POST /task-areas**

Dentro de `registerCoreRoutes`, antes do `}` final da função:

```typescript
  // ── Task Areas ──────────────────────────────────────────────────────────────
  app.get('/task-areas', requireInternalAuth, (_req, res) => {
    const rows = db.prepare(`
      select id, name, color, position, created_at, updated_at
      from task_area
      order by position asc, name asc
    `).all();
    return res.json(rows);
  });

  app.post('/task-areas', requireInternalAuth, (req, res) => {
    const parsed = taskAreaCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const areaId = uuid('tarea');
    const nowIso = nowDateIso();
    const nextPosition = (db.prepare('select coalesce(max(position), -1) + 1 as pos from task_area').get() as { pos: number }).pos;

    db.prepare(`
      insert into task_area (id, name, color, position, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(areaId, parsed.data.name, parsed.data.color ?? '#6366f1', nextPosition, nowIso, nowIso);

    return res.status(201).json({ id: areaId });
  });
```

- [ ] **Step 3: Verificar compilação**

```bash
cd "apps/backend" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/coreRoutes.ts
git commit -m "feat: rotas GET e POST /task-areas"
```

---

## Task 4: Rotas CRUD de tasks

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts` — continuar adicionando rotas após `/task-areas`

- [ ] **Step 1: Adicionar GET /tasks (lista com filtros)**

```typescript
  // ── Tasks ───────────────────────────────────────────────────────────────────
  app.get('/tasks', requireInternalAuth, (req, res) => {
    const { area_id, assignee_id, priority, status, overdue, q } = req.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (area_id) {
      conditions.push('t.area_id = ?');
      params.push(area_id);
    }
    if (assignee_id) {
      conditions.push('t.assignee_id = ?');
      params.push(assignee_id);
    }
    if (priority) {
      conditions.push('t.priority = ?');
      params.push(priority);
    }
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }
    if (overdue === 'true') {
      conditions.push("t.due_date < date('now') and t.status != 'Concluida'");
    }
    if (q) {
      conditions.push('lower(t.title) like lower(?)');
      params.push(`%${q}%`);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

    const tasks = db.prepare(`
      select
        t.id, t.title, t.description, t.area_id, t.assignee_id, t.assignee_name,
        t.due_date, t.priority, t.status, t.created_by, t.created_at, t.updated_at,
        ta.name as area_name, ta.color as area_color,
        (select count(*) from task_checklist_item where task_id = t.id) as checklist_total,
        (select count(*) from task_checklist_item where task_id = t.id and completed = 1) as checklist_done
      from task t
      join task_area ta on ta.id = t.area_id
      ${where}
      order by
        case t.priority when 'Critica' then 0 when 'Alta' then 1 when 'Normal' then 2 when 'Baixa' then 3 else 4 end asc,
        t.due_date asc,
        t.created_at desc
    `).all(...params);

    return res.json(tasks);
  });
```

- [ ] **Step 2: Adicionar POST /tasks**

```typescript
  app.post('/tasks', requireInternalAuth, (req, res) => {
    const parsed = taskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const area = db.prepare('select id from task_area where id = ?').get(parsed.data.area_id) as { id: string } | undefined;
    if (!area) {
      return res.status(404).json({ message: 'Área não encontrada.' });
    }

    const authCtx = readInternalAuthContext(res);
    const taskId = uuid('task');
    const nowIso = nowDateIso();

    db.prepare(`
      insert into task (id, title, description, area_id, assignee_id, assignee_name, due_date, priority, status, created_by, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, 'A_fazer', ?, ?, ?)
    `).run(
      taskId,
      parsed.data.title,
      parsed.data.description?.trim() || null,
      parsed.data.area_id,
      parsed.data.assignee_id,
      parsed.data.assignee_name,
      parsed.data.due_date,
      parsed.data.priority ?? 'Normal',
      authCtx?.internal_user_id ?? 'unknown',
      nowIso,
      nowIso
    );

    return res.status(201).json({ id: taskId });
  });
```

- [ ] **Step 3: Adicionar GET /tasks/:id**

```typescript
  app.get('/tasks/:id', requireInternalAuth, (req, res) => {
    const task = db.prepare(`
      select
        t.id, t.title, t.description, t.area_id, t.assignee_id, t.assignee_name,
        t.due_date, t.priority, t.status, t.created_by, t.created_at, t.updated_at,
        ta.name as area_name, ta.color as area_color
      from task t
      join task_area ta on ta.id = t.area_id
      where t.id = ?
    `).get(req.params.id) as Record<string, unknown> | undefined;

    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    const checklist = db.prepare(`
      select id, label, completed, position, created_at
      from task_checklist_item
      where task_id = ?
      order by position asc, created_at asc
    `).all(req.params.id);

    const comments = db.prepare(`
      select id, author_id, author_name, body, created_at
      from task_comment
      where task_id = ?
      order by created_at asc
    `).all(req.params.id);

    return res.json({ ...task, checklist, comments });
  });
```

- [ ] **Step 4: Adicionar PATCH /tasks/:id**

```typescript
  app.patch('/tasks/:id', requireInternalAuth, (req, res) => {
    const parsed = taskUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const task = db.prepare('select id from task where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    if (parsed.data.area_id) {
      const area = db.prepare('select id from task_area where id = ?').get(parsed.data.area_id) as { id: string } | undefined;
      if (!area) {
        return res.status(404).json({ message: 'Área não encontrada.' });
      }
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (parsed.data.title !== undefined) { fields.push('title = ?'); params.push(parsed.data.title); }
    if (parsed.data.area_id !== undefined) { fields.push('area_id = ?'); params.push(parsed.data.area_id); }
    if (parsed.data.assignee_id !== undefined) { fields.push('assignee_id = ?'); params.push(parsed.data.assignee_id); }
    if (parsed.data.assignee_name !== undefined) { fields.push('assignee_name = ?'); params.push(parsed.data.assignee_name); }
    if (parsed.data.due_date !== undefined) { fields.push('due_date = ?'); params.push(parsed.data.due_date); }
    if (parsed.data.priority !== undefined) { fields.push('priority = ?'); params.push(parsed.data.priority); }
    if (parsed.data.status !== undefined) { fields.push('status = ?'); params.push(parsed.data.status); }
    if (parsed.data.description !== undefined) { fields.push('description = ?'); params.push(parsed.data.description); }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar.' });
    }

    fields.push('updated_at = ?');
    params.push(nowDateIso());
    params.push(req.params.id);

    db.prepare(`update task set ${fields.join(', ')} where id = ?`).run(...params);

    return res.json({ ok: true });
  });
```

- [ ] **Step 5: Adicionar DELETE /tasks/:id**

```typescript
  app.delete('/tasks/:id', requireInternalAuth, (req, res) => {
    const task = db.prepare('select id from task where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }
    db.prepare('delete from task where id = ?').run(req.params.id);
    return res.json({ ok: true });
  });
```

- [ ] **Step 6: Verificar compilação**

```bash
cd "apps/backend" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/coreRoutes.ts
git commit -m "feat: rotas CRUD de tasks"
```

---

## Task 5: Rotas de checklist e comentários

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`

- [ ] **Step 1: Adicionar rotas de checklist**

```typescript
  // ── Task Checklist ───────────────────────────────────────────────────────────
  app.post('/tasks/:id/checklist', requireInternalAuth, (req, res) => {
    const task = db.prepare('select id from task where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    const parsed = taskChecklistItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const itemId = uuid('tcho');
    const nowIso = nowDateIso();
    const nextPos = (db.prepare('select coalesce(max(position), -1) + 1 as pos from task_checklist_item where task_id = ?').get(req.params.id) as { pos: number }).pos;

    db.prepare(`
      insert into task_checklist_item (id, task_id, label, completed, position, created_at)
      values (?, ?, ?, 0, ?, ?)
    `).run(itemId, req.params.id, parsed.data.label, nextPos, nowIso);

    return res.status(201).json({ id: itemId });
  });

  app.patch('/tasks/:id/checklist/:itemId', requireInternalAuth, (req, res) => {
    const item = db.prepare('select id from task_checklist_item where id = ? and task_id = ?').get(req.params.itemId, req.params.id) as { id: string } | undefined;
    if (!item) {
      return res.status(404).json({ message: 'Item não encontrado.' });
    }

    const parsed = taskChecklistItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    if (parsed.data.label !== undefined) { fields.push('label = ?'); params.push(parsed.data.label); }
    if (parsed.data.completed !== undefined) { fields.push('completed = ?'); params.push(parsed.data.completed ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ message: 'Nenhum campo para atualizar.' });
    }

    params.push(req.params.itemId);
    db.prepare(`update task_checklist_item set ${fields.join(', ')} where id = ?`).run(...params);

    return res.json({ ok: true });
  });

  app.delete('/tasks/:id/checklist/:itemId', requireInternalAuth, (req, res) => {
    const item = db.prepare('select id from task_checklist_item where id = ? and task_id = ?').get(req.params.itemId, req.params.id) as { id: string } | undefined;
    if (!item) {
      return res.status(404).json({ message: 'Item não encontrado.' });
    }
    db.prepare('delete from task_checklist_item where id = ?').run(req.params.itemId);
    return res.json({ ok: true });
  });
```

- [ ] **Step 2: Adicionar rotas de comentários**

```typescript
  // ── Task Comments ────────────────────────────────────────────────────────────
  app.get('/tasks/:id/comments', requireInternalAuth, (req, res) => {
    const task = db.prepare('select id from task where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    const comments = db.prepare(`
      select id, author_id, author_name, body, created_at
      from task_comment
      where task_id = ?
      order by created_at asc
    `).all(req.params.id);

    return res.json(comments);
  });

  app.post('/tasks/:id/comments', requireInternalAuth, (req, res) => {
    const task = db.prepare('select id from task where id = ?').get(req.params.id) as { id: string } | undefined;
    if (!task) {
      return res.status(404).json({ message: 'Tarefa não encontrada.' });
    }

    const parsed = taskCommentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const authCtx = readInternalAuthContext(res);
    const commentId = uuid('tcmt');
    const nowIso = nowDateIso();

    db.prepare(`
      insert into task_comment (id, task_id, author_id, author_name, body, created_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(
      commentId,
      req.params.id,
      authCtx?.internal_user_id ?? 'unknown',
      authCtx?.display_name ?? authCtx?.username ?? 'Usuário',
      parsed.data.body,
      nowIso
    );

    return res.status(201).json({ id: commentId });
  });
```

- [ ] **Step 3: Verificar compilação**

```bash
cd "apps/backend" && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/coreRoutes.ts
git commit -m "feat: rotas de checklist e comentários de tasks"
```

---

## Task 6: Testes de integração do backend

**Files:**
- Create: `apps/backend/src/tasks/tasks.test.ts`

- [ ] **Step 1: Criar arquivo de testes**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { createInternalUser } from '../internalAuth.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function loginInternalUser(app: ReturnType<typeof createApp>, username: string, password: string) {
  const login = await request(app).post('/auth/login').send({ username, password });
  assert.equal(login.status, 200);
  return { Authorization: `Bearer ${login.body.token as string}` };
}

test('initDb cria tabelas de task', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('tasks-schema');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    const tables = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name like 'task%'
      order by name asc
    `).all() as Array<{ name: string }>;

    assert.deepEqual(tables.map((r) => r.name), [
      'task',
      'task_area',
      'task_checklist_item',
      'task_comment'
    ]);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('initDb seed cria 5 áreas padrão', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('tasks-seed-areas');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });
    const areas = db.prepare('select name from task_area order by position asc').all() as Array<{ name: string }>;
    assert.deepEqual(areas.map((r) => r.name), ['Técnico', 'Comercial', 'Financeiro', 'Interno', 'RH']);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST /task-areas cria nova área', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-post-area');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser(db, { username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const res = await request(app)
      .post('/task-areas')
      .set(headers)
      .send({ name: 'Marketing', color: '#ef4444' });

    assert.equal(res.status, 201);
    assert.ok(res.body.id);

    const area = db.prepare('select name, color from task_area where id = ?').get(res.body.id) as { name: string; color: string } | undefined;
    assert.equal(area?.name, 'Marketing');
    assert.equal(area?.color, '#ef4444');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST /tasks cria tarefa e GET /tasks retorna na lista', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-crud');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser(db, { username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaRes = await request(app).get('/task-areas').set(headers);
    const areaId = (areaRes.body as Array<{ id: string; name: string }>)[0].id;

    const createRes = await request(app)
      .post('/tasks')
      .set(headers)
      .send({
        title: 'Terminar módulo RH',
        area_id: areaId,
        assignee_id: 'user-1',
        assignee_name: 'João',
        due_date: '2026-07-01',
        priority: 'Alta'
      });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.id);

    const listRes = await request(app).get('/tasks').set(headers);
    assert.equal(listRes.status, 200);
    const tasks = listRes.body as Array<{ id: string; title: string }>;
    assert.ok(tasks.some((t) => t.title === 'Terminar módulo RH'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('GET /tasks?overdue=true retorna só tarefas atrasadas', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-overdue');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser(db, { username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaRes = await request(app).get('/task-areas').set(headers);
    const areaId = (areaRes.body as Array<{ id: string }>)[0].id;

    await request(app).post('/tasks').set(headers).send({
      title: 'Atrasada',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2020-01-01',
      priority: 'Normal'
    });
    await request(app).post('/tasks').set(headers).send({
      title: 'No prazo',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2099-12-31',
      priority: 'Normal'
    });

    const res = await request(app).get('/tasks?overdue=true').set(headers);
    assert.equal(res.status, 200);
    const tasks = res.body as Array<{ title: string }>;
    assert.ok(tasks.some((t) => t.title === 'Atrasada'));
    assert.ok(!tasks.some((t) => t.title === 'No prazo'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST /tasks/:id/checklist e PATCH toggle', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-checklist');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser(db, { username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaId = ((await request(app).get('/task-areas').set(headers)).body as Array<{ id: string }>)[0].id;
    const taskId = ((await request(app).post('/tasks').set(headers).send({
      title: 'Task com checklist',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2026-12-31',
      priority: 'Normal'
    })).body as { id: string }).id;

    const itemRes = await request(app)
      .post(`/tasks/${taskId}/checklist`)
      .set(headers)
      .send({ label: 'Passo 1' });
    assert.equal(itemRes.status, 201);
    const itemId = (itemRes.body as { id: string }).id;

    const toggleRes = await request(app)
      .patch(`/tasks/${taskId}/checklist/${itemId}`)
      .set(headers)
      .send({ completed: true });
    assert.equal(toggleRes.status, 200);

    const detail = await request(app).get(`/tasks/${taskId}`).set(headers);
    const checklist = (detail.body as { checklist: Array<{ id: string; completed: number }> }).checklist;
    const item = checklist.find((c) => c.id === itemId);
    assert.equal(item?.completed, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST /tasks/:id/comments adiciona comentário', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-comments');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser(db, { username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaId = ((await request(app).get('/task-areas').set(headers)).body as Array<{ id: string }>)[0].id;
    const taskId = ((await request(app).post('/tasks').set(headers).send({
      title: 'Task com comment',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2026-12-31',
      priority: 'Normal'
    })).body as { id: string }).id;

    const commentRes = await request(app)
      .post(`/tasks/${taskId}/comments`)
      .set(headers)
      .send({ body: 'Atualizando progresso!' });
    assert.equal(commentRes.status, 201);

    const commentsRes = await request(app).get(`/tasks/${taskId}/comments`).set(headers);
    assert.equal(commentsRes.status, 200);
    const comments = commentsRes.body as Array<{ body: string }>;
    assert.ok(comments.some((c) => c.body === 'Atualizando progresso!'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Executar testes**

```bash
cd "apps/backend" && node --import tsx/esm --test src/tasks/tasks.test.ts
```

Esperado: todos os testes passam (`✓` em verde para cada `test(...)`).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/tasks/tasks.test.ts
git commit -m "test: testes de integração das rotas de tasks"
```

---

## Task 7: Frontend — rota, navegação e API service

**Files:**
- Modify: `apps/frontend/src/auth/navigation.ts`
- Modify: `apps/frontend/src/App.tsx`
- Modify: `apps/frontend/src/services/api.ts`

- [ ] **Step 1: Adicionar `/tarefas` à navegação**

Em `apps/frontend/src/auth/navigation.ts`, adicionar à array `APP_NAV_ITEMS` antes de `{ to: '/documentacao', ... }`:

```typescript
  { to: '/tarefas', label: 'Tarefas', permissions: ['tasks'] },
```

- [ ] **Step 2: Adicionar rota `/tarefas` no App.tsx**

Em `apps/frontend/src/App.tsx`, adicionar import no topo:

```typescript
import { TasksPage } from './pages/TasksPage';
```

E dentro do componente de rotas (próximo às outras rotas), adicionar:

```typescript
      <Route
        path="/tarefas"
        element={(
          <ProtectedRoute user={user} permissions={['tasks']} fallback={defaultRoute}>
            <TasksPage />
          </ProtectedRoute>
        )}
      />
```

- [ ] **Step 3: Adicionar métodos de API ao services/api.ts**

Adicionar os tipos e métodos ao objeto `api` em `apps/frontend/src/services/api.ts`:

Primeiro, adicionar os tipos (próximo aos outros tipos no topo do arquivo):

```typescript
export type TaskArea = {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  description: string | null;
  area_id: string;
  area_name: string;
  area_color: string;
  assignee_id: string;
  assignee_name: string;
  due_date: string;
  priority: 'Critica' | 'Alta' | 'Normal' | 'Baixa';
  status: 'A_fazer' | 'Em_andamento' | 'Concluida';
  created_by: string;
  created_at: string;
  updated_at: string;
  checklist_total: number;
  checklist_done: number;
};

export type TaskChecklistItem = {
  id: string;
  label: string;
  completed: number;
  position: number;
  created_at: string;
};

export type TaskComment = {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type TaskDetail = TaskSummary & {
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
};

export type TaskListFilters = {
  area_id?: string;
  assignee_id?: string;
  priority?: string;
  status?: string;
  overdue?: boolean;
  q?: string;
};
```

Depois, dentro do objeto `api`, adicionar os métodos:

```typescript
  taskAreas: () =>
    req<TaskArea[]>('/task-areas'),
  createTaskArea: (payload: { name: string; color?: string }) =>
    req<{ id: string }>('/task-areas', { method: 'POST', body: JSON.stringify(payload) }),

  tasks: (filters?: TaskListFilters) => {
    const params = new URLSearchParams();
    if (filters?.area_id) params.set('area_id', filters.area_id);
    if (filters?.assignee_id) params.set('assignee_id', filters.assignee_id);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.overdue) params.set('overdue', 'true');
    if (filters?.q) params.set('q', filters.q);
    const qs = params.toString();
    return req<TaskSummary[]>(`/tasks${qs ? `?${qs}` : ''}`);
  },
  task: (id: string) =>
    req<TaskDetail>(`/tasks/${id}`),
  createTask: (payload: {
    title: string;
    area_id: string;
    assignee_id: string;
    assignee_name: string;
    due_date: string;
    priority?: string;
    description?: string | null;
  }) =>
    req<{ id: string }>('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id: string, payload: Partial<{
    title: string;
    area_id: string;
    assignee_id: string;
    assignee_name: string;
    due_date: string;
    priority: string;
    status: string;
    description: string | null;
  }>) =>
    req<{ ok: boolean }>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (id: string) =>
    req<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),

  addTaskChecklistItem: (taskId: string, label: string) =>
    req<{ id: string }>(`/tasks/${taskId}/checklist`, { method: 'POST', body: JSON.stringify({ label }) }),
  updateTaskChecklistItem: (taskId: string, itemId: string, payload: { label?: string; completed?: boolean }) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTaskChecklistItem: (taskId: string, itemId: string) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/checklist/${itemId}`, { method: 'DELETE' }),

  taskComments: (taskId: string) =>
    req<TaskComment[]>(`/tasks/${taskId}/comments`),
  addTaskComment: (taskId: string, body: string) =>
    req<{ id: string }>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
```

- [ ] **Step 4: Verificar compilação do frontend**

```bash
cd "apps/frontend" && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/auth/navigation.ts apps/frontend/src/App.tsx apps/frontend/src/services/api.ts
git commit -m "feat: rota /tarefas, navegação e métodos de API"
```

---

## Task 8: TasksPage — estrutura principal

**Files:**
- Create: `apps/frontend/src/pages/TasksPage.tsx`

- [ ] **Step 1: Criar TasksPage.tsx**

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { TaskArea, TaskSummary, TaskListFilters } from '../services/api';
import { TaskDetailPanel } from '../components/tasks/TaskDetailPanel';
import { TaskFormModal } from '../components/tasks/TaskFormModal';

type TaskTab = 'todas' | 'minhas' | 'atrasadas' | 'por-area';

function isOverdue(task: TaskSummary): boolean {
  return task.status !== 'Concluida' && task.due_date < new Date().toISOString().slice(0, 10);
}

function priorityBadge(priority: TaskSummary['priority']): string | null {
  if (priority === 'Critica') return 'Crítica';
  if (priority === 'Alta') return 'Alta';
  return null;
}

const STATUS_LABELS: Record<TaskSummary['status'], string> = {
  A_fazer: 'A fazer',
  Em_andamento: 'Em andamento',
  Concluida: 'Concluída'
};

const STATUS_COLORS: Record<TaskSummary['status'], string> = {
  A_fazer: '#3b82f6',
  Em_andamento: '#f59e0b',
  Concluida: '#10b981'
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [areas, setAreas] = useState<TaskArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>('todas');
  const [filterArea, setFilterArea] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [tasksData, areasData] = await Promise.all([api.tasks(), api.taskAreas()]);
      setTasks(tasksData);
      setAreas(areasData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentUserId = useMemo(() => {
    // Reads from sessionStorage — same key used by internalSessionStore
    try {
      const raw = sessionStorage.getItem('orquestrador_internal_auth_v2');
      if (!raw) return null;
      return (JSON.parse(raw) as { user?: { id?: string } }).user?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);

  const visibleTasks = useMemo(() => {
    let list = tasks;

    if (activeTab === 'minhas' && currentUserId) {
      list = list.filter((t) => t.assignee_id === currentUserId);
    } else if (activeTab === 'atrasadas') {
      list = list.filter(isOverdue);
    }

    if (filterArea) list = list.filter((t) => t.area_id === filterArea);
    if (filterAssignee) list = list.filter((t) => t.assignee_name.toLowerCase().includes(filterAssignee.toLowerCase()));
    if (filterPriority) list = list.filter((t) => t.priority === filterPriority);
    if (searchQuery) list = list.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()));

    return list;
  }, [tasks, activeTab, currentUserId, filterArea, filterAssignee, filterPriority, searchQuery]);

  const tasksByArea = useMemo(() => {
    if (activeTab !== 'por-area') return null;
    const map = new Map<string, { area: TaskArea; tasks: TaskSummary[] }>();
    visibleTasks.forEach((task) => {
      if (!map.has(task.area_id)) {
        const area = areas.find((a) => a.id === task.area_id);
        if (area) map.set(task.area_id, { area, tasks: [] });
      }
      map.get(task.area_id)?.tasks.push(task);
    });
    return Array.from(map.values());
  }, [activeTab, visibleTasks, areas]);

  const selectedTask = useMemo(() => tasks.find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);

  function handleRowClick(task: TaskSummary) {
    setSelectedId((prev) => (prev === task.id ? null : task.id));
  }

  function handleOpenCreate() {
    setEditingTask(null);
    setShowModal(true);
  }

  function handleOpenEdit(task: TaskSummary) {
    setEditingTask(task);
    setShowModal(true);
  }

  async function handleModalSave() {
    setShowModal(false);
    setEditingTask(null);
    await loadData();
  }

  async function handleTaskUpdated() {
    await loadData();
  }

  const TABS: Array<{ id: TaskTab; label: string; badge?: number }> = [
    { id: 'todas', label: 'Todas' },
    { id: 'minhas', label: 'Minhas' },
    { id: 'atrasadas', label: 'Atrasadas', badge: overdueCount > 0 ? overdueCount : undefined },
    { id: 'por-area', label: 'Por área' }
  ];

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--text-secondary)' }}>Carregando tarefas...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Tarefas</h1>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gestão interna da equipe</p>
        </div>
        <button
          onClick={handleOpenCreate}
          style={{ padding: '7px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          + Nova tarefa
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab.id === 'atrasadas' && overdueCount > 0 ? '#ef4444' : (activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)'),
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 700 : 400,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 10, padding: '1px 7px', fontSize: '0.75em', fontWeight: 700 }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
        >
          <option value="">Área: Todas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
        >
          <option value="">Prioridade: Todas</option>
          <option value="Critica">Crítica</option>
          <option value="Alta">Alta</option>
          <option value="Normal">Normal</option>
          <option value="Baixa">Baixa</option>
        </select>

        <input
          type="text"
          placeholder="Buscar tarefa..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', flex: 1, minWidth: 160 }}
        />
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Task List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px 120px', gap: 8, padding: '8px 20px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
            <span>Tarefa</span>
            <span>Área</span>
            <span>Responsável</span>
            <span>Prazo</span>
            <span>Status</span>
          </div>

          {activeTab === 'por-area' && tasksByArea ? (
            tasksByArea.map(({ area, tasks: areaTasks }) => (
              <div key={area.id}>
                <div style={{ padding: '8px 20px', fontSize: '0.75rem', fontWeight: 700, color: area.color, borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  {area.name} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({areaTasks.length})</span>
                </div>
                {areaTasks.map((task) => (
                  <TaskRow key={task.id} task={task} selected={selectedId === task.id} onClick={() => handleRowClick(task)} />
                ))}
              </div>
            ))
          ) : (
            visibleTasks.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Nenhuma tarefa encontrada.
              </div>
            ) : (
              visibleTasks.map((task) => (
                <TaskRow key={task.id} task={task} selected={selectedId === task.id} onClick={() => handleRowClick(task)} />
              ))
            )
          )}
        </div>

        {/* Detail Panel */}
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedId(null)}
            onEdit={handleOpenEdit}
            onUpdated={handleTaskUpdated}
          />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <TaskFormModal
          areas={areas}
          editingTask={editingTask}
          onSave={handleModalSave}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}

type TaskRowProps = {
  task: TaskSummary;
  selected: boolean;
  onClick: () => void;
};

function TaskRow({ task, selected, onClick }: TaskRowProps) {
  const overdue = isOverdue(task);
  const badge = priorityBadge(task.priority);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 90px 110px 100px 120px',
        gap: 8,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: selected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
        alignItems: 'center',
        fontSize: '0.82rem'
      }}
    >
      <div>
        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {badge && (
            <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 3, padding: '1px 6px', fontSize: '0.72em', fontWeight: 700 }}>
              {badge}
            </span>
          )}
          {task.title}
        </div>
        {task.checklist_total > 0 && (
          <div style={{ fontSize: '0.75em', color: 'var(--text-secondary)', marginTop: 2 }}>
            {task.checklist_done}/{task.checklist_total} itens
          </div>
        )}
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8em' }}>{task.area_name}</span>
      <span>{task.assignee_name}</span>
      <span style={{ color: overdue ? '#ef4444' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
        {task.due_date.split('-').reverse().join('/')}
        {overdue && ' ⚠'}
      </span>
      <span style={{
        display: 'inline-block',
        background: `${STATUS_COLORS[task.status]}22`,
        color: STATUS_COLORS[task.status],
        borderRadius: 10,
        padding: '3px 10px',
        fontSize: '0.78em',
        fontWeight: 500,
        textAlign: 'center'
      }}>
        {STATUS_LABELS[task.status]}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd "apps/frontend" && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/TasksPage.tsx
git commit -m "feat: TasksPage com abas, filtros e tabela"
```

---

## Task 9: TaskDetailPanel

**Files:**
- Create: `apps/frontend/src/components/tasks/TaskDetailPanel.tsx`

- [ ] **Step 1: Criar TaskDetailPanel.tsx**

```typescript
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import type { TaskSummary, TaskDetail } from '../../services/api';
import { TaskChecklist } from './TaskChecklist';
import { TaskComments } from './TaskComments';

type Props = {
  task: TaskSummary;
  onClose: () => void;
  onEdit: (task: TaskSummary) => void;
  onUpdated: () => void;
};

const STATUS_LABELS: Record<TaskSummary['status'], string> = {
  A_fazer: 'A fazer',
  Em_andamento: 'Em andamento',
  Concluida: 'Concluída'
};

const STATUS_COLORS: Record<TaskSummary['status'], string> = {
  A_fazer: '#3b82f6',
  Em_andamento: '#f59e0b',
  Concluida: '#10b981'
};

const PRIORITY_LABELS: Record<TaskSummary['priority'], string> = {
  Critica: 'Crítica',
  Alta: 'Alta',
  Normal: 'Normal',
  Baixa: 'Baixa'
};

function isOverdue(task: TaskSummary): boolean {
  return task.status !== 'Concluida' && task.due_date < new Date().toISOString().slice(0, 10);
}

export function TaskDetailPanel({ task, onClose, onEdit, onUpdated }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [concluding, setConcluding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDetail(null);
    void api.task(task.id).then(setDetail);
  }, [task.id]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleConclude() {
    if (concluding) return;
    setConcluding(true);
    try {
      await api.updateTask(task.id, { status: 'Concluida' });
      onUpdated();
    } finally {
      setConcluding(false);
    }
  }

  const overdue = isOverdue(task);

  return (
    <div
      ref={panelRef}
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-primary)'
      }}
    >
      {/* Panel header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem', padding: '2px 6px' }}
          title="Fechar"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title + badges */}
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 8, lineHeight: 1.3 }}>{task.title}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {task.priority !== 'Normal' && (
              <span style={{ background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            <span style={{ background: 'var(--bg-secondary)', borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {task.area_name}
            </span>
            <span style={{ background: `${STATUS_COLORS[task.status]}22`, color: STATUS_COLORS[task.status], borderRadius: 10, padding: '2px 8px', fontSize: '0.72rem' }}>
              {STATUS_LABELS[task.status]}
            </span>
          </div>
        </div>

        {/* Metadata */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.8rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Responsável</div>
            <div style={{ fontWeight: 600 }}>{task.assignee_name}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prazo</div>
            <div style={{ fontWeight: 600, color: overdue ? '#ef4444' : 'inherit' }}>
              {task.due_date.split('-').reverse().join('/')}
              {overdue && <span style={{ marginLeft: 4, fontSize: '0.85em' }}>· Atrasado</span>}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Descrição</div>
          {task.description ? (
            <div style={{ fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: 5, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
              {task.description}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Sem descrição</div>
          )}
        </div>

        {/* Checklist */}
        {detail && (
          <TaskChecklist
            taskId={task.id}
            items={detail.checklist}
            onChanged={() => void api.task(task.id).then(setDetail)}
          />
        )}

        {/* Comments */}
        {detail && (
          <TaskComments
            taskId={task.id}
            comments={detail.comments}
            onAdded={() => void api.task(task.id).then(setDetail)}
          />
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <button
          onClick={() => onEdit(task)}
          style={{ flex: 1, padding: '7px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.82rem' }}
        >
          Editar
        </button>
        {task.status !== 'Concluida' && (
          <button
            onClick={handleConclude}
            disabled={concluding}
            style={{ flex: 1, padding: '7px', background: '#10b98122', border: '1px solid #10b981', borderRadius: 5, cursor: 'pointer', color: '#10b981', fontWeight: 600, fontSize: '0.82rem' }}
          >
            {concluding ? '...' : 'Concluir'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd "apps/frontend" && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/tasks/TaskDetailPanel.tsx
git commit -m "feat: TaskDetailPanel com metadados, checklist e comentários"
```

---

## Task 10: TaskChecklist

**Files:**
- Create: `apps/frontend/src/components/tasks/TaskChecklist.tsx`

- [ ] **Step 1: Criar TaskChecklist.tsx**

```typescript
import { useState } from 'react';
import { api } from '../../services/api';
import type { TaskChecklistItem } from '../../services/api';

type Props = {
  taskId: string;
  items: TaskChecklistItem[];
  onChanged: () => void;
};

export function TaskChecklist({ taskId, items, onChanged }: Props) {
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);

  const done = items.filter((i) => i.completed).length;

  async function handleToggle(item: TaskChecklistItem) {
    if (toggling === item.id) return;
    setToggling(item.id);
    try {
      await api.updateTaskChecklistItem(taskId, item.id, { completed: item.completed !== 1 });
      onChanged();
    } finally {
      setToggling(null);
    }
  }

  async function handleAdd() {
    if (!newLabel.trim() || adding) return;
    setAdding(true);
    try {
      await api.addTaskChecklistItem(taskId, newLabel.trim());
      setNewLabel('');
      setShowInput(false);
      onChanged();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(itemId: string) {
    await api.deleteTaskChecklistItem(taskId, itemId);
    onChanged();
  }

  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', justifyContent: 'space-between' }}>
        <span>Checklist</span>
        {items.length > 0 && <span style={{ fontWeight: 400 }}>{done}/{items.length}</span>}
      </div>

      {items.length === 0 && !showInput && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 6 }}>Sem itens</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={item.completed === 1}
              onChange={() => handleToggle(item)}
              disabled={toggling === item.id}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ flex: 1, textDecoration: item.completed === 1 ? 'line-through' : 'none', color: item.completed === 1 ? 'var(--text-secondary)' : 'inherit' }}>
              {item.label}
            </span>
            <button
              onClick={() => handleDelete(item.id)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8em', padding: '0 2px', opacity: 0.6 }}
              title="Remover item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {showInput ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            autoFocus
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); if (e.key === 'Escape') { setShowInput(false); setNewLabel(''); } }}
            placeholder="Novo item..."
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newLabel.trim()}
            style={{ padding: '4px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {adding ? '...' : 'Ok'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          style={{ marginTop: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.78rem', padding: 0 }}
        >
          + Adicionar item
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd "apps/frontend" && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/tasks/TaskChecklist.tsx
git commit -m "feat: TaskChecklist com toggle, add e delete"
```

---

## Task 11: TaskComments

**Files:**
- Create: `apps/frontend/src/components/tasks/TaskComments.tsx`

- [ ] **Step 1: Criar TaskComments.tsx**

```typescript
import { useState } from 'react';
import { api } from '../../services/api';
import type { TaskComment } from '../../services/api';

type Props = {
  taskId: string;
  comments: TaskComment[];
  onAdded: () => void;
};

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

export function TaskComments({ taskId, comments, onAdded }: Props) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await api.addTaskComment(taskId, body.trim());
      setBody('');
      onAdded();
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Comentários {comments.length > 0 && `(${comments.length})`}
      </div>

      {comments.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>Sem comentários.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: comments.length > 0 ? 10 : 0 }}>
        {comments.map((comment) => (
          <div key={comment.id} style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{comment.author_name}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75em' }}>{relativeTime(comment.created_at)}</span>
            </div>
            <div style={{ lineHeight: 1.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{comment.body}</div>
          </div>
        ))}
      </div>

      {/* New comment input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleSend(); }}
          placeholder="Escreva um comentário... (Ctrl+Enter para enviar)"
          rows={2}
          style={{ padding: '7px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !body.trim()}
          style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', alignSelf: 'flex-end' }}
        >
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd "apps/frontend" && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/tasks/TaskComments.tsx
git commit -m "feat: TaskComments com lista e campo de envio"
```

---

## Task 12: TaskFormModal

**Files:**
- Create: `apps/frontend/src/components/tasks/TaskFormModal.tsx`

- [ ] **Step 1: Criar TaskFormModal.tsx**

```typescript
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { TaskArea, TaskSummary } from '../../services/api';

type Props = {
  areas: TaskArea[];
  editingTask: TaskSummary | null;
  onSave: () => void;
  onClose: () => void;
};

type Technician = { id: string; name: string };

const PRIORITY_OPTIONS = [
  { value: 'Normal', label: 'Normal' },
  { value: 'Baixa', label: 'Baixa' },
  { value: 'Alta', label: 'Alta' },
  { value: 'Critica', label: 'Crítica' }
];

export function TaskFormModal({ areas, editingTask, onSave, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [description, setDescription] = useState('');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCreatingArea = areaId === '__new__';

  useEffect(() => {
    void api.tasks(); // preload areas already in props
    void fetch('/technicians', {
      headers: { 'Authorization': `Bearer ${(() => { try { const r = sessionStorage.getItem('orquestrador_internal_auth_v2'); return r ? (JSON.parse(r) as { token?: string }).token ?? '' : ''; } catch { return ''; } })()}` }
    }).then((r) => r.json()).then((data) => setTechnicians(data as Technician[])).catch(() => setTechnicians([]));
  }, []);

  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setAreaId(editingTask.area_id);
      setAssigneeId(editingTask.assignee_id);
      setAssigneeName(editingTask.assignee_name);
      setDueDate(editingTask.due_date);
      setPriority(editingTask.priority);
      setDescription(editingTask.description ?? '');
    } else {
      setTitle('');
      setAreaId(areas[0]?.id ?? '');
      setAssigneeId('');
      setAssigneeName('');
      setDueDate('');
      setPriority('Normal');
      setDescription('');
    }
  }, [editingTask, areas]);

  function handleAssigneeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setAssigneeId(id);
    const tech = technicians.find((t) => t.id === id);
    setAssigneeName(tech?.name ?? id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!title.trim() || !dueDate || !assigneeId) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      let resolvedAreaId = areaId;

      if (isCreatingArea) {
        if (!newAreaName.trim()) {
          setError('Informe o nome da nova área.');
          setSaving(false);
          return;
        }
        const result = await api.createTaskArea({ name: newAreaName.trim() });
        resolvedAreaId = result.id;
      }

      if (editingTask) {
        await api.updateTask(editingTask.id, {
          title: title.trim(),
          area_id: resolvedAreaId,
          assignee_id: assigneeId,
          assignee_name: assigneeName,
          due_date: dueDate,
          priority,
          description: description.trim() || null
        });
      } else {
        await api.createTask({
          title: title.trim(),
          area_id: resolvedAreaId,
          assignee_id: assigneeId,
          assignee_name: assigneeName,
          due_date: dueDate,
          priority,
          description: description.trim() || null
        });
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem', boxSizing: 'border-box' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#00000066', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-primary)', borderRadius: 10, padding: 24, width: 440, maxWidth: '95vw', boxShadow: '0 8px 32px #0005' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título *</label>
            <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descreva a tarefa..." required />
          </div>

          <div>
            <label style={labelStyle}>Área *</label>
            <select style={inputStyle} value={areaId} onChange={(e) => setAreaId(e.target.value)} required>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__new__">+ Criar nova área</option>
            </select>
            {isCreatingArea && (
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                placeholder="Nome da nova área..."
                autoFocus
              />
            )}
          </div>

          <div>
            <label style={labelStyle}>Responsável *</label>
            <select style={inputStyle} value={assigneeId} onChange={handleAssigneeChange} required>
              <option value="">Selecionar...</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Prazo *</label>
              <input type="date" style={inputStyle} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Prioridade</label>
              <select style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes opcionais..."
            />
          </div>

          {error && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
              {saving ? 'Salvando...' : (editingTask ? 'Salvar' : 'Criar tarefa')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Corrigir chamada de `/technicians` no modal**

O modal chama `/technicians` diretamente via `fetch`. Para usar o helper `api` com autenticação correta, substituir o `useEffect` de carregamento de técnicos por:

```typescript
  useEffect(() => {
    void api.technicians().then((data) => setTechnicians(data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))));
  }, []);
```

E remover o `fetch` manual. O método `api.technicians()` já existe em `api.ts` (busca `/technicians`). Verificar o nome do método em `api.ts` com:

```bash
grep -n "technicians" "apps/frontend/src/services/api.ts" | head -5
```

Usar o método existente. Se não existir, adicionar:

```typescript
  technicians: () => req<Array<{ id: string; name: string; calendar_color?: string | null }>>('/technicians'),
```

- [ ] **Step 3: Verificar compilação**

```bash
cd "apps/frontend" && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/tasks/TaskFormModal.tsx apps/frontend/src/services/api.ts
git commit -m "feat: TaskFormModal com criação e edição de tarefas"
```

---

## Task 13: Teste manual e ajustes finais

- [ ] **Step 1: Iniciar o app**

```bash
# Terminal 1 — backend
cd "apps/backend" && npm run dev

# Terminal 2 — frontend
cd "apps/frontend" && npm run dev
```

- [ ] **Step 2: Validar fluxo completo**

1. Acessar `/tarefas` — verificar que a página carrega com as abas e filtros
2. Clicar em "Nova tarefa" — preencher formulário com área, responsável, prazo e criar
3. Verificar que a tarefa aparece na lista
4. Clicar na linha da tarefa — verificar que o painel lateral abre com os dados corretos
5. Adicionar um item de checklist no painel — verificar que aparece com checkbox
6. Marcar o checklist — verificar que o item aparece riscado
7. Adicionar um comentário — verificar que aparece no painel
8. Clicar em "Editar" — verificar que o modal abre com os dados preenchidos
9. Alterar o prazo para data passada e salvar — verificar que o prazo aparece vermelho na lista
10. Testar aba "Atrasadas" — verificar que só lista tarefas com prazo vencido e status != Concluída
11. Testar filtro de área — verificar que filtra corretamente
12. Clicar em "Concluir" no painel — verificar que o status muda para Concluída

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: área de tarefas internas completa"
```
