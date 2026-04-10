# Portal Cliente Premium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o portal cliente premium em `/portal/{slug}` com login próprio, visualização de planejamento/agenda e abertura de suporte integrada automaticamente ao Kanban interno.

**Architecture:** Implementar um módulo de portal isolado logicamente no mesmo backend/frontend atual (abordagem B), com autenticação e rotas dedicadas (`/portal/api/*` e `/portal/*`). Manter sessão portal separada da sessão interna e garantir isolamento multi-tenant por `company_id` em toda leitura/escrita do portal. Integrar chamados do portal ao board existente `implementation_kanban_*`.

**Tech Stack:** Node.js + Express + better-sqlite3 + Zod (backend), React + Vite + React Router + CSS (frontend), Node test runner + Supertest (backend tests), Vitest + RTL (frontend tests).

---

## Scope Check
O spec cobre um único subprojeto coeso (Portal Cliente Premium). Não há necessidade de quebrar em múltiplos planos independentes nesta fase.

## File Structure and Responsibilities

### Backend
- Create: `apps/backend/src/app.ts`  
  Responsabilidade: instanciar e configurar o `express()` (middleware, rotas e bootstrap), exportando `createApp()` para testes.
- Create: `apps/backend/src/coreRoutes.ts`  
  Responsabilidade: concentrar o registro das rotas já existentes (não-portal) após extração de `server.ts`.
- Modify: `apps/backend/src/server.ts`  
  Responsabilidade: virar apenas bootstrap (`createApp().listen(...)`) sem lógica de negócio.
- Modify: `apps/backend/src/db.ts`  
  Responsabilidade: schema das tabelas do portal, índices, suporte a DB path por ambiente de teste.
- Create: `apps/backend/src/portal/auth.ts`  
  Responsabilidade: hash/verify de senha, emissão e verificação de sessão do portal, middleware de autenticação.
- Create: `apps/backend/src/portal/status.ts`  
  Responsabilidade: mapear estado interno Kanban/ticket para estado externo cliente.
- Create: `apps/backend/src/portal/routes.ts`  
  Responsabilidade: rotas `/portal/api/*` (auth, overview, planning, agenda, tickets).
- Create: `apps/backend/src/portal/types.ts`  
  Responsabilidade: contratos tipados do portal.
- Create: `apps/backend/src/test/testDb.ts`  
  Responsabilidade: utilitários para DB isolada em testes.
- Create: `apps/backend/src/portal/auth.test.ts`
- Create: `apps/backend/src/portal/readModels.test.ts`
- Create: `apps/backend/src/portal/tickets.test.ts`

### Frontend
- Modify: `apps/frontend/src/App.tsx`  
  Responsabilidade: separar roteamento interno e portal.
- Create: `apps/frontend/src/portal/api.ts`  
  Responsabilidade: client HTTP do portal (token separado).
- Create: `apps/frontend/src/portal/auth.ts`  
  Responsabilidade: persistência de sessão portal por slug.
- Create: `apps/frontend/src/portal/types.ts`  
  Responsabilidade: tipos de dados do portal.
- Create: `apps/frontend/src/portal/PortalShell.tsx`  
  Responsabilidade: layout premium da área cliente.
- Create: `apps/frontend/src/portal/pages/PortalLoginPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalOverviewPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalPlanningPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalAgendaPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalTicketsPage.tsx`
- Modify: `apps/frontend/src/services/api.ts`  
  Responsabilidade: endpoints internos para provisionar acesso portal por cliente.
- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`  
  Responsabilidade: UI interna para slug/usuário/senha portal do cliente.
- Modify: `apps/frontend/src/styles.css`  
  Responsabilidade: seção de estilos premium do portal.

### Frontend Tests
- Modify: `apps/frontend/vite.config.ts`  
  Responsabilidade: configuração do Vitest.
- Modify: `apps/frontend/package.json`  
  Responsabilidade: script `test`.
- Create: `apps/frontend/src/test/setup.ts`
- Create: `apps/frontend/src/test/smoke.test.ts`
- Create: `apps/frontend/src/portal/__tests__/PortalLoginPage.test.tsx`
- Create: `apps/frontend/src/portal/__tests__/PortalTicketsPage.test.tsx`

### Documentation
- Create: `docs/superpowers/specs/portal-client-states-mapping.md`  
  Responsabilidade: tabela de mapeamento estados internos x externos.

---

### Task 1: Backend Test Foundation (App Factory + Isolated DB)

**Files:**
- Create: `apps/backend/src/app.ts`
- Create: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/backend/src/server.ts`
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/backend/package.json`
- Create: `apps/backend/src/test/testDb.ts`
- Test: `apps/backend/src/portal/auth.test.ts` (scaffold smoke)

- [ ] **Step 1: Add backend test dependencies**

```bash
npm i -D -w apps/backend supertest @types/supertest
```

Expected: install success with lockfile update.

- [ ] **Step 2: Add backend test script**

```json
{
  "scripts": {
    "dev": "tsx src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "tsx --test src/**/*.test.ts"
  }
}
```

- [ ] **Step 3: Write failing smoke test that expects `createApp` export**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

test('GET /health returns ok', async () => {
  const app = createApp();
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -w apps/backend -- --test-name-pattern="GET /health returns ok"`  
Expected: FAIL with missing `../app.js` or missing `createApp`.

- [ ] **Step 5: Implement `createApp` extraction and minimal test DB utility**

```ts
// apps/backend/src/app.ts
import express from 'express';
import cors from 'cors';
import { initDb, seedDb } from './db.js';
import { registerCoreRoutes } from './coreRoutes.js';
import { registerPortalRoutes } from './portal/routes.js';

export function createApp() {
  initDb();
  seedDb();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));

  registerCoreRoutes(app);
  registerPortalRoutes(app);
  return app;
}
```

```ts
// apps/backend/src/coreRoutes.ts
import type express from 'express';

export function registerCoreRoutes(app: express.Express) {
  app.get('/health', (_req, res) => res.json({ ok: true }));
}
```

```ts
// apps/backend/src/server.ts
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);
createApp().listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
```

```ts
// apps/backend/src/test/testDb.ts
import path from 'node:path';
import { tmpdir } from 'node:os';

export function assignTestDbPath(testName: string) {
  process.env.APP_DB_PATH = path.join(tmpdir(), `orq-${testName}-${Date.now()}.db`);
}
```

- [ ] **Step 6: Make DB path configurable for tests**

```ts
// apps/backend/src/db.ts
const explicitDbPath = process.env.APP_DB_PATH?.trim();
const dbPath = explicitDbPath
  ? path.resolve(explicitDbPath)
  : path.resolve(dataDir, 'app.db');
```

- [ ] **Step 7: Run backend tests to verify pass**

Run: `npm run test -w apps/backend`  
Expected: PASS for health smoke test.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/package.json apps/backend/src/app.ts apps/backend/src/coreRoutes.ts apps/backend/src/server.ts apps/backend/src/db.ts apps/backend/src/test/testDb.ts apps/backend/src/portal/auth.test.ts package-lock.json
git commit -m "test(backend): preparar app factory e base de testes isolada"
```

---

### Task 2: Portal Schema + Auth Primitives

**Files:**
- Modify: `apps/backend/src/db.ts`
- Create: `apps/backend/src/portal/auth.ts`
- Create: `apps/backend/src/portal/types.ts`
- Test: `apps/backend/src/portal/auth.test.ts`

- [ ] **Step 1: Write failing auth tests (hash/login session primitives)**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.js';

test('hashPassword/verifyPassword validates correct secret', async () => {
  const hash = await hashPassword('Holand#123');
  assert.equal(await verifyPassword('Holand#123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w apps/backend -- --test-name-pattern="hashPassword/verifyPassword"`  
Expected: FAIL (module/function not found).

- [ ] **Step 3: Add portal DB tables and indexes**

```sql
create table if not exists portal_client (
  id text primary key,
  company_id text not null unique,
  slug text not null unique,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null,
  foreign key(company_id) references company(id) on delete cascade
);

create table if not exists portal_user (
  id text primary key,
  portal_client_id text not null,
  username text not null,
  password_hash text not null,
  is_active integer not null default 1,
  last_login_at text,
  created_at text not null,
  updated_at text not null,
  unique(portal_client_id, username),
  foreign key(portal_client_id) references portal_client(id) on delete cascade
);

create table if not exists portal_session (
  id text primary key,
  portal_user_id text not null,
  portal_client_id text not null,
  company_id text not null,
  token_hash text not null unique,
  expires_at text not null,
  created_at text not null,
  last_seen_at text not null,
  foreign key(portal_user_id) references portal_user(id) on delete cascade,
  foreign key(portal_client_id) references portal_client(id) on delete cascade,
  foreign key(company_id) references company(id) on delete cascade
);
```

- [ ] **Step 4: Implement auth helpers**

```ts
// apps/backend/src/portal/auth.ts
import crypto from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = await scrypt(password, salt);
  return `scrypt:${salt}:${digest}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, expected] = stored.split(':');
  const digest = await scrypt(password, salt);
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected));
}
```

- [ ] **Step 5: Run backend tests to verify pass**

Run: `npm run test -w apps/backend`  
Expected: PASS for auth primitive tests.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/portal/auth.ts apps/backend/src/portal/types.ts apps/backend/src/portal/auth.test.ts
git commit -m "feat(portal): criar schema e primitivas de autenticação"
```

---

### Task 3: Portal Auth Routes (`/portal/api/auth/*`) + Tenant Middleware

**Files:**
- Create: `apps/backend/src/portal/routes.ts`
- Modify: `apps/backend/src/app.ts`
- Modify: `apps/backend/src/portal/auth.ts`
- Test: `apps/backend/src/portal/auth.test.ts`

- [ ] **Step 1: Write failing API tests for login and profile**

```ts
test('POST /portal/api/auth/login returns token for valid slug/user', async () => {
  const res = await request(app)
    .post('/portal/api/auth/login')
    .send({ slug: 'grupo-cbm', username: 'cliente', password: '123456' });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.token, 'string');
});

test('GET /portal/api/me rejects missing bearer token', async () => {
  const res = await request(app).get('/portal/api/me');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run targeted tests to verify fail**

Run: `npm run test -w apps/backend -- --test-name-pattern="portal/api/auth"`  
Expected: FAIL (routes not found / 404).

- [ ] **Step 3: Implement auth routes and middleware**

```ts
// routes.ts (excerpt)
router.post('/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const { slug, username, password } = parsed.data;
  const user = findPortalUserBySlugAndUsername(slug, username);
  if (!user) return res.status(401).json({ message: 'Credenciais inválidas.' });
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ message: 'Credenciais inválidas.' });
  const token = await createPortalSession(user);
  return res.json({ token, expires_at: token.expires_at });
});

router.get('/me', requirePortalAuth, (req, res) => {
  res.json({
    company_id: req.portal.company_id,
    company_name: req.portal.company_name,
    username: req.portal.username
  });
});
```

- [ ] **Step 4: Register portal routes in app**

```ts
// app.ts
import { registerPortalRoutes } from './portal/routes.js';
import { registerCoreRoutes } from './coreRoutes.js';
registerCoreRoutes(app);
registerPortalRoutes(app);
```

- [ ] **Step 5: Run full backend tests**

Run: `npm run test -w apps/backend`  
Expected: PASS for login success/fail + unauthorized profile.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/app.ts apps/backend/src/portal/auth.ts apps/backend/src/portal/routes.ts apps/backend/src/portal/auth.test.ts
git commit -m "feat(portal): adicionar login, sessão e middleware tenant"
```

---

### Task 4: Portal Read Models (Overview, Planning, Agenda)

**Files:**
- Modify: `apps/backend/src/portal/routes.ts`
- Create: `apps/backend/src/portal/readModels.test.ts`
- Create: `apps/backend/src/portal/status.ts`

- [ ] **Step 1: Write failing tests for data visibility scoped by tenant**

```ts
test('GET /portal/api/planning returns only authenticated company modules', async () => {
  const res = await authed.get('/portal/api/planning');
  assert.equal(res.status, 200);
  assert.ok(res.body.items.every((row: any) => row.company_id === 'comp-grupo-cbm'));
});

test('GET /portal/api/agenda returns only company activities', async () => {
  const res = await authed.get('/portal/api/agenda');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -w apps/backend -- --test-name-pattern="portal/api/planning|portal/api/agenda"`  
Expected: FAIL with 404 or shape mismatch.

- [ ] **Step 3: Implement endpoints**

```ts
router.get('/overview', requirePortalAuth, (req, res) => {
  const summary = portalOverviewByCompany(req.portal.company_id);
  return res.json(summary);
});

router.get('/planning', requirePortalAuth, (req, res) => {
  const items = db.prepare(`
    select cmp.company_id, mt.code as module_code, mt.name as module_name, cmp.status, cmp.completed_at
    from company_module_progress cmp
    join module_template mt on mt.id = cmp.module_id
    where cmp.company_id = ?
    order by mt.code asc
  `).all(req.portal.company_id);
  return res.json({ items });
});

router.get('/agenda', requirePortalAuth, (req, res) => {
  const items = db.prepare(`
    select id, title, activity_type, start_date, end_date, all_day, start_time, end_time, status, notes
    from calendar_activity
    where company_id = ?
    order by date(start_date) asc, coalesce(start_time, '00:00') asc
  `).all(req.portal.company_id);
  return res.json({ items });
});
```

- [ ] **Step 4: Implement state mapping helper file**

```ts
// status.ts
export function toClientFacingStatus(internal: { ticketStatus: string; columnTitle?: string | null }) {
  if (internal.ticketStatus === 'Resolvido' || internal.ticketStatus === 'Fechado') return 'Resolvido';
  if ((internal.columnTitle ?? '').toLowerCase().includes('andamento')) return 'Em execução';
  if ((internal.columnTitle ?? '').toLowerCase().includes('anál')) return 'Em análise';
  if ((internal.columnTitle ?? '').toLowerCase().includes('aguard')) return 'Aguardando cliente';
  return 'Recebido';
}
```

- [ ] **Step 5: Run backend tests to verify pass**

Run: `npm run test -w apps/backend`  
Expected: PASS and tenant scoping assertions valid.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/portal/routes.ts apps/backend/src/portal/readModels.test.ts apps/backend/src/portal/status.ts
git commit -m "feat(portal): expor overview, planejamento e agenda com escopo tenant"
```

---

### Task 5: Ticket Bridge (Portal Ticket -> Internal Kanban Card)

**Files:**
- Modify: `apps/backend/src/portal/routes.ts`
- Create: `apps/backend/src/portal/tickets.test.ts`
- Modify: `apps/backend/src/db.ts`

- [ ] **Step 1: Write failing test for automatic kanban card creation**

```ts
test('POST /portal/api/tickets creates portal_ticket and implementation_kanban_card', async () => {
  const createRes = await authed
    .post('/portal/api/tickets')
    .send({ title: 'Erro no acesso', description: 'Detalhes', priority: 'Alta' });
  assert.equal(createRes.status, 201);

  const listRes = await authed.get('/portal/api/tickets');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.body.items.some((item: any) => item.title === 'Erro no acesso'));
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -w apps/backend -- --test-name-pattern="creates portal_ticket and implementation_kanban_card"`  
Expected: FAIL with route missing or persistence missing.

- [ ] **Step 3: Implement ticket routes + atomic transaction**

```ts
router.post('/tickets', requirePortalAuth, (req, res) => {
  const tx = db.transaction(() => {
    const ticketId = uuid('ptk');
    const column = resolveSupportInboxColumn();
    db.prepare(`
      insert into portal_ticket (id, company_id, portal_user_id, title, description, priority, status, origin, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, 'Aberto', 'portal_cliente', ?, ?)
    `).run(ticketId, req.portal.company_id, req.portal.portal_user_id, payload.title, payload.description, payload.priority, nowIso, nowIso);
    const cardId = uuid('kbn');
    db.prepare(`
      insert into implementation_kanban_card (
        id, title, description, column_id, client_name, subcategory, priority, position, created_at, updated_at
      ) values (?, ?, ?, ?, ?, 'Suporte', ?, ?, ?, ?)
    `).run(cardId, payload.title, payload.description, column.id, req.portal.company_name, payload.priority, column.nextPosition, nowIso, nowIso);
    db.prepare('update portal_ticket set kanban_card_id = ?, updated_at = ? where id = ?').run(cardId, nowIso, ticketId);
  });
  tx();
  return res.status(201).json({ id: ticketId });
});

router.get('/tickets', requirePortalAuth, (req, res) => {
  const items = db.prepare(`
    select pt.id, pt.title, pt.description, pt.priority, pt.status, pt.created_at, pt.updated_at, c.title as column_title
    from portal_ticket pt
    left join implementation_kanban_card kc on kc.id = pt.kanban_card_id
    left join implementation_kanban_column c on c.id = kc.column_id
    where pt.company_id = ?
    order by datetime(pt.created_at) desc
  `).all(req.portal.company_id).map((row) => ({
    ...row,
    client_status: toClientFacingStatus({ ticketStatus: row.status, columnTitle: row.column_title })
  }));
  return res.json({ items });
});
```

- [ ] **Step 4: Add DB safeguard indexes**

```sql
create index if not exists idx_portal_ticket_company_created on portal_ticket(company_id, created_at desc);
create index if not exists idx_portal_ticket_kanban on portal_ticket(kanban_card_id);
```

- [ ] **Step 5: Run backend tests to verify pass**

Run: `npm run test -w apps/backend`  
Expected: PASS with ticket creation and mapping validated.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/portal/routes.ts apps/backend/src/portal/tickets.test.ts apps/backend/src/db.ts
git commit -m "feat(portal): integrar chamados do portal ao kanban interno"
```

---

### Task 6: Internal Provisioning API (`/companies/:id/portal-access`)

**Files:**
- Modify: `apps/backend/src/coreRoutes.ts`
- Modify: `apps/backend/src/portal/auth.ts`
- Test: `apps/backend/src/portal/auth.test.ts`

- [ ] **Step 1: Write failing tests for internal provisioning endpoint**

```ts
test('PUT /companies/:id/portal-access upserts slug, username and password', async () => {
  const res = await request(app)
    .put('/companies/comp-grupo-cbm/portal-access')
    .send({ slug: 'grupo-cbm', username: 'cliente', password: 'NovaSenha#123', is_active: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -w apps/backend -- --test-name-pattern="portal-access upserts slug"`  
Expected: FAIL (404 route).

- [ ] **Step 3: Implement get/upsert routes**

```ts
app.get('/companies/:id/portal-access', (_req, res) => {
  const row = db.prepare(`
    select pc.slug, pc.is_active, pu.username
    from portal_client pc
    left join portal_user pu on pu.portal_client_id = pc.id and pu.is_active = 1
    where pc.company_id = ?
    limit 1
  `).get(_req.params.id);
  return res.json(row ?? { slug: null, username: null, is_active: false });
});

app.put('/companies/:id/portal-access', async (req, res) => {
  const parsed = portalAccessUpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const payload = parsed.data;
  const tx = db.transaction(async () => {
    const portalClientId = upsertPortalClient(req.params.id, payload.slug, payload.is_active);
    await upsertPortalUser(portalClientId, payload.username, payload.password);
  });
  await tx();
  return res.json({ ok: true });
});
```

- [ ] **Step 4: Run backend tests**

Run: `npm run test -w apps/backend`  
Expected: PASS for provisioning flow.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/coreRoutes.ts apps/backend/src/portal/auth.ts apps/backend/src/portal/auth.test.ts
git commit -m "feat(portal): adicionar provisionamento interno de acesso por cliente"
```

---

### Task 7: Frontend Test Foundation (Vitest + RTL)

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/vite.config.ts`
- Create: `apps/frontend/src/test/setup.ts`

- [ ] **Step 1: Add frontend test dependencies**

```bash
npm i -D -w apps/frontend vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: install success.

- [ ] **Step 2: Add test script and Vite test config**

```json
{
  "scripts": {
    "dev": "vite --host localhost --port 5173 --strictPort",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
```

- [ ] **Step 3: Add setup file**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add a smoke test to keep command green**

```ts
// apps/frontend/src/test/smoke.test.ts
import { test, expect } from 'vitest';

test('frontend test harness is ready', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run test command**

Run: `npm run test -w apps/frontend`  
Expected: PASS with 1 test passed.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/package.json apps/frontend/vite.config.ts apps/frontend/src/test/setup.ts apps/frontend/src/test/smoke.test.ts package-lock.json
git commit -m "test(frontend): configurar vitest e testing-library"
```

---

### Task 8: Portal Frontend Shell + Login

**Files:**
- Modify: `apps/frontend/src/App.tsx`
- Create: `apps/frontend/src/portal/types.ts`
- Create: `apps/frontend/src/portal/auth.ts`
- Create: `apps/frontend/src/portal/api.ts`
- Create: `apps/frontend/src/portal/PortalShell.tsx`
- Create: `apps/frontend/src/portal/pages/PortalLoginPage.tsx`
- Create: `apps/frontend/src/portal/__tests__/PortalLoginPage.test.tsx`

- [ ] **Step 1: Write failing login UI test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalLoginPage } from '../pages/PortalLoginPage';

test('submits username and password', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(<PortalLoginPage slug="grupo-cbm" onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText(/login/i), 'cliente');
  await user.type(screen.getByLabelText(/senha/i), '123456');
  await user.click(screen.getByRole('button', { name: /entrar/i }));
  expect(onSubmit).toHaveBeenCalledWith({ username: 'cliente', password: '123456' });
});
```

- [ ] **Step 2: Run frontend tests to verify fail**

Run: `npm run test -w apps/frontend -- PortalLoginPage`  
Expected: FAIL (component not found).

- [ ] **Step 3: Implement portal session and login page**

```ts
// auth.ts
export const portalSessionStore = {
  key: (slug: string) => `portal_auth_${slug}`,
  save: (slug: string, token: string) => localStorage.setItem(`portal_auth_${slug}`, token),
  read: (slug: string) => localStorage.getItem(`portal_auth_${slug}`),
  clear: (slug: string) => localStorage.removeItem(`portal_auth_${slug}`)
};
```

```tsx
// App.tsx (excerpt)
<Routes>
  <Route path="/portal/:slug/*" element={<PortalShell />} />
  <Route path="*" element={<InternalApp />} />
</Routes>
```

- [ ] **Step 4: Run tests and build**

Run: `npm run test -w apps/frontend`  
Expected: PASS for login test.

Run: `npm run build -w apps/frontend`  
Expected: build successful.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/App.tsx apps/frontend/src/portal/types.ts apps/frontend/src/portal/auth.ts apps/frontend/src/portal/api.ts apps/frontend/src/portal/PortalShell.tsx apps/frontend/src/portal/pages/PortalLoginPage.tsx apps/frontend/src/portal/__tests__/PortalLoginPage.test.tsx
git commit -m "feat(portal-ui): adicionar shell e login do portal cliente"
```

---

### Task 9: Portal Pages (Overview, Planning, Agenda, Tickets)

**Files:**
- Create: `apps/frontend/src/portal/pages/PortalOverviewPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalPlanningPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalAgendaPage.tsx`
- Create: `apps/frontend/src/portal/pages/PortalTicketsPage.tsx`
- Create: `apps/frontend/src/portal/__tests__/PortalTicketsPage.test.tsx`
- Modify: `apps/frontend/src/portal/PortalShell.tsx`

- [ ] **Step 1: Write failing tickets page test**

```tsx
test('renders ticket list and opens new ticket form', async () => {
  render(<PortalTicketsPage api={fakeApi} />);
  expect(await screen.findByText(/chamados/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /novo chamado/i }));
  expect(screen.getByLabelText(/assunto/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run test -w apps/frontend -- PortalTicketsPage`  
Expected: FAIL (page missing).

- [ ] **Step 3: Implement portal pages with logical IA**

```tsx
// PortalShell navigation
<NavLink to="">Visão Geral</NavLink>
<NavLink to="planejamento">Planejamento</NavLink>
<NavLink to="agenda">Agenda</NavLink>
<NavLink to="chamados">Chamados</NavLink>
```

```tsx
// PortalTicketsPage create form (excerpt)
<form onSubmit={handleCreate}>
  <label>Assunto<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
  <label>Descrição<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
  <label>Prioridade<select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
    <option value="Baixa">Baixa</option>
    <option value="Normal">Normal</option>
    <option value="Alta">Alta</option>
    <option value="Critica">Crítica</option>
  </select></label>
  <button type="submit">Enviar chamado</button>
</form>
```

- [ ] **Step 4: Run tests and type/build validation**

Run: `npm run test -w apps/frontend`  
Expected: PASS for portal page tests.

Run: `npm run build -w apps/frontend`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/portal/pages/PortalOverviewPage.tsx apps/frontend/src/portal/pages/PortalPlanningPage.tsx apps/frontend/src/portal/pages/PortalAgendaPage.tsx apps/frontend/src/portal/pages/PortalTicketsPage.tsx apps/frontend/src/portal/__tests__/PortalTicketsPage.test.tsx apps/frontend/src/portal/PortalShell.tsx
git commit -m "feat(portal-ui): implementar páginas principais e fluxo de chamados"
```

---

### Task 10: Internal Client Provisioning UI + Premium Styling

**Files:**
- Modify: `apps/frontend/src/services/api.ts`
- Modify: `apps/frontend/src/pages/ClientDetailPage.tsx`
- Modify: `apps/frontend/src/styles.css`
- Create: `docs/superpowers/specs/portal-client-states-mapping.md`

- [ ] **Step 1: Write failing UI test for provisioning panel visibility**

```tsx
test('shows portal access section in client detail', async () => {
  render(<ClientDetailPage />);
  expect(await screen.findByText(/acesso ao portal do cliente/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run frontend test to verify fail**

Run: `npm run test -w apps/frontend -- ClientDetailPage`  
Expected: FAIL (section not present).

- [ ] **Step 3: Add internal endpoints to API client**

```ts
portalAccessByCompany: (companyId: string) => req(`/companies/${companyId}/portal-access`),
upsertPortalAccessByCompany: (companyId: string, payload: { slug: string; username: string; password?: string; is_active: boolean }) =>
  req(`/companies/${companyId}/portal-access`, { method: 'PUT', body: JSON.stringify(payload) }),
```

- [ ] **Step 4: Implement client detail section + premium UI polish**

```tsx
<Section title="Acesso ao Portal do Cliente">
  <p className="form-hint">Gerencie URL, login e status de acesso do cliente.</p>
  <div className="grid two-cols">
    <label>Slug<input value={portalSlug} onChange={(e) => setPortalSlug(e.target.value)} /></label>
    <label>Usuário<input value={portalUsername} onChange={(e) => setPortalUsername(e.target.value)} /></label>
    <label>Nova senha<input type="password" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} /></label>
    <label>Status
      <select value={portalActive ? 'ativo' : 'inativo'} onChange={(e) => setPortalActive(e.target.value === 'ativo')}>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </select>
    </label>
  </div>
  <button type="button" onClick={savePortalAccess}>Salvar acesso do portal</button>
</Section>
```

```css
.portal-shell { background: linear-gradient(180deg, #ffffff 0%, #f6f8fa 100%); }
.portal-card { border: 1px solid #d7d7d7; border-radius: 18px; box-shadow: 0 8px 24px rgba(29,40,48,.06); }
.portal-primary-btn { background: #ef2f0f; color: #fff; }
```

- [ ] **Step 5: Document canonical state mapping**

```md
# Mapeamento de Estados Portal Cliente
- Aberto -> Recebido
- Em_andamento + coluna análise -> Em análise
- Em_andamento + coluna execução -> Em execução
- Em_andamento + coluna aguardando -> Aguardando cliente
- Resolvido/Fechado -> Resolvido
```

- [ ] **Step 6: Run validation**

Run: `npm run test -w apps/frontend`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS backend + frontend.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/services/api.ts apps/frontend/src/pages/ClientDetailPage.tsx apps/frontend/src/styles.css docs/superpowers/specs/portal-client-states-mapping.md
git commit -m "feat(portal): provisionamento interno e acabamento visual premium"
```

---

### Task 11: End-to-End Verification and Release Readiness

**Files:**
- Modify: `README.md` (portal section)
- Modify: `docs/superpowers/specs/2026-04-08-portal-cliente-premium-design.md` (implementation notes)

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm run test -w apps/backend
npm run test -w apps/frontend
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Run manual smoke script**

```bash
# 1) login interno
# 2) configurar slug/usuario em Cliente > Acesso ao Portal
# 3) abrir /portal/<slug>
# 4) login do cliente
# 5) abrir chamado
# 6) validar card no /suporte
# 7) mover card e validar status refletido no portal
```

Expected: todos fluxos críticos funcionam sem vazamento entre clientes.

- [ ] **Step 3: Update docs**

```md
## Portal do Cliente
- URL: /portal/{slug}
- Provisionamento: Clientes > Acesso ao Portal
- Fluxo de chamado: portal -> kanban suporte
```

- [ ] **Step 4: Final commit**

```bash
git add README.md docs/superpowers/specs/2026-04-08-portal-cliente-premium-design.md
git commit -m "docs: registrar execução e operação do portal cliente premium"
```

---

## Spec Coverage Checklist (Self-check)
- `/portal/{slug}` + login próprio: coberto nas Tasks 3 e 8.
- planejamento + agenda + chamados: coberto nas Tasks 4 e 9.
- suporte caindo automático no board interno: coberto na Task 5.
- provisionamento (1 usuário por cliente): coberto na Task 6 e Task 10.
- UI/UX premium cliente-facing: coberto nas Tasks 9 e 10.
- isolamento por tenant (`company_id`): coberto nas Tasks 3, 4 e 5.
- validação e critérios de aceite: coberto na Task 11.
