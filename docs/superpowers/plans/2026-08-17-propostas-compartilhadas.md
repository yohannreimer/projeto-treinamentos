# Propostas Compartilhadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir propostas editáveis e módulos personalizados de serviço no servidor para compartilhamento entre todos os usuários autorizados.

**Architecture:** O backend Express/SQLite manterá propostas como documentos JSON validados e módulos personalizados em uma tabela de catálogo por organização. O frontend React continuará editando em estado local, mas passará a carregar o catálogo pela API e gravará propostas manualmente, usando funções puras para serializar e restaurar o documento.

**Tech Stack:** TypeScript, React 18, Express 4, SQLite/better-sqlite3, Zod, Vitest/Testing Library e Node test/Supertest.

---

## Estrutura de arquivos

- Criar `apps/backend/src/proposals/routes.ts`: schemas Zod, serialização de linhas e rotas autenticadas de propostas e catálogo.
- Criar `apps/backend/src/proposals/proposals.test.ts`: cobertura HTTP e isolamento por organização.
- Modificar `apps/backend/src/db.ts`: tabelas e índices persistentes.
- Modificar `apps/backend/src/coreRoutes.ts`: mapear `/proposals` para a permissão `proposals`.
- Modificar `apps/backend/src/app.ts`: registrar as novas rotas.
- Criar `apps/frontend/src/proposals/proposalDocument.ts`: contrato versionado e restauração de snapshots.
- Criar `apps/frontend/src/proposals/proposalDocument.test.ts`: testes puros de round-trip e recuperação de itens não disponíveis no catálogo atual.
- Criar `apps/frontend/src/proposals/SavedProposalsPanel.tsx`: interface isolada para busca, abertura, criação, salvamento e exclusão.
- Criar `apps/frontend/src/proposals/SavedProposalsPanel.test.tsx`: comportamento isolado da lista e busca.
- Modificar `apps/frontend/src/services/api.ts`: tipos e métodos de transporte.
- Modificar `apps/frontend/src/services/api.test.ts`: contratos HTTP do cliente.
- Modificar `apps/frontend/src/pages/ProposalsPage.tsx`: integrar persistência manual, dirty state e catálogo remoto.
- Modificar `apps/frontend/src/pages/ProposalsPage.test.tsx`: fluxos de salvar, reabrir, falha e catálogo compartilhado.
- Modificar `apps/frontend/src/styles.css`: estilos da área de propostas salvas e feedback de operações.

### Task 1: Criar o schema SQLite e proteger o namespace da API

**Files:**
- Modify: `apps/backend/src/db.ts:159-2790`
- Modify: `apps/backend/src/coreRoutes.ts:3383-3437`
- Test: `apps/backend/src/proposals/proposals.test.ts`

- [ ] **Step 1: Escrever um teste que exige as tabelas e a permissão de Propostas**

Criar `apps/backend/src/proposals/proposals.test.ts` com o setup reutilizável e o primeiro teste:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

test('initializes proposal persistence tables', () => {
  const dbPath = assignTestDbPath('proposal-schema');
  cleanupDbFiles(dbPath);
  createApp({ forceDbRefresh: true });

  const tables = db.prepare(`
    select name from sqlite_master
    where type = 'table' and name in ('proposal', 'proposal_catalog_service')
    order by name
  `).all() as Array<{ name: string }>;

  assert.deepEqual(tables.map((row) => row.name), ['proposal', 'proposal_catalog_service']);
  cleanupDbFiles(dbPath);
});

test('rejects proposal routes for a user without proposals permission', async () => {
  const dbPath = assignTestDbPath('proposal-permission');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const now = new Date().toISOString();
  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json,
      organization_id, is_active, created_at, updated_at
    ) select 'iuser-no-proposals', 'no-proposals', 'Sem propostas', password_hash,
      'custom', '["clients"]', organization_id, 1, ?, ?
    from internal_user where username = 'holand'
  `).run(now, now);

  const { hashInternalPassword } = await import('../internalAuth.js');
  db.prepare('update internal_user set password_hash = ? where id = ?')
    .run(hashInternalPassword('Senha123!'), 'iuser-no-proposals');
  const login = await request(app).post('/auth/login').send({ username: 'no-proposals', password: 'Senha123!' });
  const response = await request(app)
    .get('/proposals')
    .set('Authorization', `Bearer ${login.body.token}`);

  assert.equal(response.status, 403);
  cleanupDbFiles(dbPath);
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha esperada**

Run: `npm --workspace apps/backend test -- src/proposals/proposals.test.ts`

Expected: FAIL porque as tabelas não existem e `/proposals` ainda não exige a permissão correta.

- [ ] **Step 3: Adicionar tabelas e índices no `initDb()`**

Dentro do grande `db.exec` de `initDb`, adicionar:

```sql
create table if not exists proposal (
  id text primary key,
  organization_id text not null,
  number text not null default '',
  client_company_name text not null default '',
  document_json text not null,
  created_by text not null,
  updated_by text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(organization_id) references organization(id) on delete cascade,
  foreign key(created_by) references internal_user(id),
  foreign key(updated_by) references internal_user(id)
);

create table if not exists proposal_catalog_service (
  id text primary key,
  organization_id text not null,
  code text not null default '',
  name text not null,
  value_per_day real not null,
  default_duration_days integer not null,
  description text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(organization_id) references organization(id) on delete cascade,
  foreign key(created_by) references internal_user(id),
  foreign key(updated_by) references internal_user(id)
);

create index if not exists idx_proposal_org_updated
  on proposal(organization_id, updated_at desc);
create index if not exists idx_proposal_org_number
  on proposal(organization_id, number);
create index if not exists idx_proposal_org_client
  on proposal(organization_id, client_company_name);
create index if not exists idx_proposal_catalog_service_org_name
  on proposal_catalog_service(organization_id, name);
```

- [ ] **Step 4: Mapear o namespace da API para a permissão correta**

Em `resolveRequiredPermissionsForRequest`, antes do fallback `return null`, adicionar:

```ts
if (pathname.startsWith('/proposals')) {
  return ['proposals'];
}
```

- [ ] **Step 5: Rodar o teste do schema**

Run: `npm --workspace apps/backend test -- src/proposals/proposals.test.ts`

Expected: os dois testes PASS; o middleware de permissão responde `403` antes de o Express procurar uma rota final.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db.ts apps/backend/src/coreRoutes.ts apps/backend/src/proposals/proposals.test.ts
git commit -m "feat: add proposal persistence schema"
```

### Task 2: Implementar a API de propostas e catálogo compartilhado

**Files:**
- Create: `apps/backend/src/proposals/routes.ts`
- Modify: `apps/backend/src/app.ts:1-40`
- Modify: `apps/backend/src/proposals/proposals.test.ts`

- [ ] **Step 1: Acrescentar testes HTTP de ciclo completo**

Adicionar helpers e testes ao arquivo backend:

```ts
async function loginAsSupremo(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post('/auth/login')
    .send({ username: 'holand', password: 'Holand2026!@#' });
  assert.equal(response.status, 200);
  return response.body.token as string;
}

const proposalDocument = {
  version: 1,
  client: { companyName: 'Cliente A', address: '', cep: '', cnpj: '', contact: '', email: '' },
  proposal: { number: 'P-001', date: '2026-08-17', validityDays: '11', modality: 'Presencial' },
  selectedServiceIds: [], selectedProductIds: [],
  serviceSnapshots: [], productSnapshots: [],
  proposalCustomServices: [], proposalCustomProducts: [],
  proposalServiceEdits: {}, proposalProductEdits: {},
  taxPercent: '12', exchangeRate: '5.80', softwareDiscountPercent: '0',
  discountPercent: '0', targetTotal: '54000', selectedRepresentative: null,
  includeRequirementsTerm: false, snapToTarget: false, serviceTargetTotal: null,
  observations: ''
};

test('creates, lists, reads, updates and deletes a shared proposal', async () => {
  const dbPath = assignTestDbPath('proposal-crud');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };

  const created = await request(app).post('/proposals').set(auth).send({
    number: 'P-001', client_company_name: 'Cliente A', document: proposalDocument
  });
  assert.equal(created.status, 201);

  const listed = await request(app).get('/proposals?q=Cliente').set(auth);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].client_company_name, 'Cliente A');

  const read = await request(app).get(`/proposals/${created.body.id}`).set(auth);
  assert.deepEqual(read.body.document, proposalDocument);

  const updated = await request(app).put(`/proposals/${created.body.id}`).set(auth).send({
    number: 'P-001-R1', client_company_name: 'Cliente B', document: {
      ...proposalDocument,
      client: { ...proposalDocument.client, companyName: 'Cliente B' }
    }
  });
  assert.equal(updated.status, 200);

  const removed = await request(app).delete(`/proposals/${created.body.id}`).set(auth);
  assert.equal(removed.status, 200);
  assert.equal((await request(app).get(`/proposals/${created.body.id}`).set(auth)).status, 404);
  cleanupDbFiles(dbPath);
});

test('shares catalog services and validates proposal documents', async () => {
  const dbPath = assignTestDbPath('proposal-catalog');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };

  const invalid = await request(app).post('/proposals').set(auth).send({
    number: 'inválida', client_company_name: '', document: { version: 99 }
  });
  assert.equal(invalid.status, 400);

  const service = await request(app).post('/proposals/catalog/services').set(auth).send({
    code: 'MOD-X', name: 'Módulo X', valuePerDay: 1500,
    defaultDurationDays: 2, description: 'Sob medida'
  });
  assert.equal(service.status, 201);

  const list = await request(app).get('/proposals/catalog/services').set(auth);
  assert.equal(list.body.items[0].name, 'Módulo X');

  const edit = await request(app).put(`/proposals/catalog/services/${service.body.id}`).set(auth).send({
    code: 'MOD-X', name: 'Módulo X revisado', valuePerDay: 1700,
    defaultDurationDays: 3, description: 'Revisado'
  });
  assert.equal(edit.body.name, 'Módulo X revisado');

  assert.equal((await request(app).delete(`/proposals/catalog/services/${service.body.id}`).set(auth)).status, 200);
  cleanupDbFiles(dbPath);
});

test('isolates proposals by organization', async () => {
  const dbPath = assignTestDbPath('proposal-tenant');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };
  const created = await request(app).post('/proposals').set(auth).send({
    number: 'P-ORG-1', client_company_name: 'Organização 1', document: proposalDocument
  });

  const now = new Date().toISOString();
  const { hashInternalPassword } = await import('../internalAuth.js');
  db.prepare(`insert into organization (id, name, slug, is_active, created_at, updated_at)
    values ('org-2', 'Outra organização', 'outra-organizacao', 1, ?, ?)`)
    .run(now, now);
  db.prepare(`insert into internal_user (
    id, username, display_name, password_hash, role, permissions_json,
    organization_id, is_active, created_at, updated_at
  ) values (?, ?, ?, ?, 'custom', '["proposals"]', 'org-2', 1, ?, ?)`)
    .run('iuser-org-2', 'org-2-user', 'Usuário org 2', hashInternalPassword('Senha123!'), now, now);
  const login = await request(app).post('/auth/login').send({ username: 'org-2-user', password: 'Senha123!' });
  const otherAuth = { Authorization: `Bearer ${login.body.token}` };

  assert.equal((await request(app).get('/proposals').set(otherAuth)).body.items.length, 0);
  assert.equal((await request(app).get(`/proposals/${created.body.id}`).set(otherAuth)).status, 404);
  cleanupDbFiles(dbPath);
});
```

- [ ] **Step 2: Rodar os testes e confirmar falha por rotas ausentes**

Run: `npm --workspace apps/backend test -- src/proposals/proposals.test.ts`

Expected: FAIL com respostas `404` nas novas rotas.

- [ ] **Step 3: Criar schemas Zod e helpers de contexto em `routes.ts`**

O arquivo deve declarar um schema completo do envelope salvo:

```ts
import type { Express, Response } from 'express';
import { z } from 'zod';
import { db, uuid } from '../db.js';
import { readInternalAuthContext, requireInternalAuth } from '../internalAuth.js';

const serviceSchema = z.object({
  id: z.string().min(1).max(120), code: z.string().max(120), name: z.string().min(1).max(300),
  valuePerDay: z.number().finite().nonnegative(), defaultDurationDays: z.number().int().positive(),
  description: z.string().max(20_000), custom: z.boolean().optional()
});
const productSchema = z.object({
  id: z.string().min(1).max(120), code: z.string().max(120), name: z.string().min(1).max(300),
  unitValueUsd: z.number().finite().nonnegative(), defaultQuantity: z.number().int().positive(),
  description: z.string().max(20_000), custom: z.boolean().optional()
});
const productSnapshotSchema = productSchema.extend({
  quantity: z.number().int().positive(), maintenanceEnabled: z.boolean(),
  maintenancePercent: z.number().finite().nonnegative(), maintenanceYears: z.number().int().nonnegative()
});
const serviceEditSchema = z.object({
  name: z.string(), valuePerDay: z.number().finite().nonnegative(),
  durationDays: z.number().int().positive(), description: z.string()
});
const productEditSchema = z.object({
  name: z.string(), unitValueUsd: z.number().finite().nonnegative(), quantity: z.number().int().positive(),
  description: z.string(), maintenanceEnabled: z.boolean(), maintenancePercent: z.number().finite().nonnegative(),
  maintenanceYears: z.number().int().nonnegative()
});
const documentSchema = z.object({
  version: z.literal(1),
  client: z.object({ companyName: z.string(), address: z.string(), cep: z.string(), cnpj: z.string(), contact: z.string(), email: z.string() }),
  proposal: z.object({ number: z.string(), date: z.string(), validityDays: z.string(), modality: z.string() }),
  selectedServiceIds: z.array(z.string()), selectedProductIds: z.array(z.string()),
  serviceSnapshots: z.array(serviceSchema), productSnapshots: z.array(productSnapshotSchema),
  proposalCustomServices: z.array(serviceSchema), proposalCustomProducts: z.array(productSchema),
  proposalServiceEdits: z.record(serviceEditSchema), proposalProductEdits: z.record(productEditSchema),
  taxPercent: z.string(), exchangeRate: z.string(), softwareDiscountPercent: z.string(),
  discountPercent: z.string(), targetTotal: z.string(),
  selectedRepresentative: z.object({ id: z.string(), name: z.string(), role: z.string() }).nullable(),
  includeRequirementsTerm: z.boolean(), snapToTarget: z.boolean(), serviceTargetTotal: z.number().finite().nullable(),
  observations: z.string().max(50_000)
}).strict();
const proposalWriteSchema = z.object({
  number: z.string().max(200), client_company_name: z.string().max(500), document: documentSchema
});
const catalogServiceWriteSchema = serviceSchema.omit({ id: true, custom: true });

function requireOrganization(res: Response) {
  const auth = readInternalAuthContext(res);
  if (!auth?.organization_id) return null;
  return { organizationId: auth.organization_id, userId: auth.internal_user_id };
}
```

- [ ] **Step 4: Implementar as rotas de propostas**

Exportar `registerProposalRoutes(app)` e registrar, nesta ordem, catálogo antes de `/:id`. O núcleo das rotas de proposta deve ser:

```ts
export function registerProposalRoutes(app: Express) {
  app.get('/proposals', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const like = `%${query}%`;
    const items = db.prepare(`
      select id, number, client_company_name, created_by, updated_by, created_at, updated_at
      from proposal
      where organization_id = ? and (? = '' or number like ? or client_company_name like ?)
      order by updated_at desc
    `).all(context.organizationId, query, like, like);
    return res.json({ items });
  });

  app.post('/proposals', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = proposalWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const id = uuid('proposal');
    const now = new Date().toISOString();
    db.prepare(`insert into proposal (
      id, organization_id, number, client_company_name, document_json,
      created_by, updated_by, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, context.organizationId, parsed.data.number, parsed.data.client_company_name,
        JSON.stringify(parsed.data.document), context.userId, context.userId, now, now);
    return res.status(201).json({ id, updated_at: now });
  });

  app.get('/proposals/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const row = db.prepare(`select * from proposal where id = ? and organization_id = ?`)
      .get(req.params.id, context.organizationId) as Record<string, unknown> | undefined;
    if (!row) return res.status(404).json({ message: 'Proposta não encontrada.' });
    return res.json({ ...row, document: JSON.parse(String(row.document_json)), document_json: undefined });
  });

  app.put('/proposals/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = proposalWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const now = new Date().toISOString();
    const result = db.prepare(`update proposal set number = ?, client_company_name = ?,
      document_json = ?, updated_by = ?, updated_at = ? where id = ? and organization_id = ?`)
      .run(parsed.data.number, parsed.data.client_company_name, JSON.stringify(parsed.data.document),
        context.userId, now, req.params.id, context.organizationId);
    if (result.changes === 0) return res.status(404).json({ message: 'Proposta não encontrada.' });
    return res.json({ id: req.params.id, updated_at: now });
  });

  app.delete('/proposals/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const result = db.prepare('delete from proposal where id = ? and organization_id = ?')
      .run(req.params.id, context.organizationId);
    if (result.changes === 0) return res.status(404).json({ message: 'Proposta não encontrada.' });
    return res.json({ ok: true });
  });
}
```

- [ ] **Step 5: Implementar as rotas do catálogo no mesmo registrador**

Antes de `/proposals/:id`, incluir GET/POST/PUT/DELETE em `/proposals/catalog/services`. Retornar sempre o formato frontend:

```ts
function serializeCatalogService(row: Record<string, unknown>) {
  return {
    id: String(row.id), code: String(row.code), name: String(row.name),
    valuePerDay: Number(row.value_per_day), defaultDurationDays: Number(row.default_duration_days),
    description: String(row.description), custom: true
  };
}
```

POST gera `uuid('proposal-service')`; PUT e DELETE filtram simultaneamente por `id` e `organization_id`. POST/PUT validam `catalogServiceWriteSchema`, usam `new Date().toISOString()` e retornam o serviço serializado. GET ordena por `name collate nocase` e responde `{ items }`. DELETE responde `{ ok: true }` ou `404`.

```ts
app.get('/proposals/catalog/services', requireInternalAuth, (_req, res) => {
  const context = requireOrganization(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const rows = db.prepare(`select * from proposal_catalog_service
    where organization_id = ? order by name collate nocase`).all(context.organizationId) as Array<Record<string, unknown>>;
  return res.json({ items: rows.map(serializeCatalogService) });
});

app.post('/proposals/catalog/services', requireInternalAuth, (req, res) => {
  const context = requireOrganization(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const parsed = catalogServiceWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const id = uuid('proposal-service');
  const now = new Date().toISOString();
  db.prepare(`insert into proposal_catalog_service (
    id, organization_id, code, name, value_per_day, default_duration_days,
    description, created_by, updated_by, created_at, updated_at
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, context.organizationId, parsed.data.code, parsed.data.name, parsed.data.valuePerDay,
      parsed.data.defaultDurationDays, parsed.data.description, context.userId, context.userId, now, now);
  const row = db.prepare('select * from proposal_catalog_service where id = ?').get(id) as Record<string, unknown>;
  return res.status(201).json(serializeCatalogService(row));
});

app.put('/proposals/catalog/services/:id', requireInternalAuth, (req, res) => {
  const context = requireOrganization(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const parsed = catalogServiceWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const now = new Date().toISOString();
  const result = db.prepare(`update proposal_catalog_service set code = ?, name = ?, value_per_day = ?,
    default_duration_days = ?, description = ?, updated_by = ?, updated_at = ?
    where id = ? and organization_id = ?`)
    .run(parsed.data.code, parsed.data.name, parsed.data.valuePerDay, parsed.data.defaultDurationDays,
      parsed.data.description, context.userId, now, req.params.id, context.organizationId);
  if (result.changes === 0) return res.status(404).json({ message: 'Módulo não encontrado.' });
  const row = db.prepare('select * from proposal_catalog_service where id = ? and organization_id = ?')
    .get(req.params.id, context.organizationId) as Record<string, unknown>;
  return res.json(serializeCatalogService(row));
});

app.delete('/proposals/catalog/services/:id', requireInternalAuth, (req, res) => {
  const context = requireOrganization(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const result = db.prepare('delete from proposal_catalog_service where id = ? and organization_id = ?')
    .run(req.params.id, context.organizationId);
  if (result.changes === 0) return res.status(404).json({ message: 'Módulo não encontrado.' });
  return res.json({ ok: true });
});
```

- [ ] **Step 6: Registrar as rotas no app**

Em `apps/backend/src/app.ts`:

```ts
import { registerProposalRoutes } from './proposals/routes.js';
// depois de registerCoreRoutes, para reutilizar autenticação, permissão e auditoria:
registerProposalRoutes(app);
```

- [ ] **Step 7: Rodar os testes backend**

Run: `npm --workspace apps/backend test -- src/proposals/proposals.test.ts`

Expected: todos os testes do arquivo PASS, inclusive CRUD, validação, catálogo e `403` por permissão.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/app.ts apps/backend/src/proposals/routes.ts apps/backend/src/proposals/proposals.test.ts
git commit -m "feat: expose shared proposals api"
```

### Task 3: Definir e testar o documento editável no frontend

**Files:**
- Create: `apps/frontend/src/proposals/proposalDocument.ts`
- Create: `apps/frontend/src/proposals/proposalDocument.test.ts`
- Modify: `apps/frontend/src/pages/ProposalsPage.tsx:52-106`

- [ ] **Step 1: Escrever testes de round-trip e fallback de catálogo**

Criar `proposalDocument.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { restoreProposalDocument, type ProposalDocumentV1 } from './proposalDocument';

const sharedSnapshot = {
  id: 'shared-1', code: 'X', name: 'Módulo compartilhado', valuePerDay: 1000,
  defaultDurationDays: 2, description: 'Descrição', custom: true
};

const document: ProposalDocumentV1 = {
  version: 1,
  client: { companyName: 'Cliente', address: '', cep: '', cnpj: '', contact: '', email: '' },
  proposal: { number: 'P1', date: '2026-08-17', validityDays: '11', modality: 'Presencial' },
  selectedServiceIds: ['shared-1'], selectedProductIds: [],
  serviceSnapshots: [sharedSnapshot], productSnapshots: [],
  proposalCustomServices: [], proposalCustomProducts: [],
  proposalServiceEdits: {}, proposalProductEdits: {},
  taxPercent: '12', exchangeRate: '5.80', softwareDiscountPercent: '0', discountPercent: '0', targetTotal: '54000',
  selectedRepresentative: { id: 'rep-x', name: 'João', role: 'Comercial' },
  includeRequirementsTerm: true, snapToTarget: false, serviceTargetTotal: null, observations: 'Obs'
};

describe('proposalDocument', () => {
  test('preserves the complete editable document', () => {
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  test('rehydrates a selected shared module when it no longer exists in the catalog', () => {
    const restored = restoreProposalDocument(document, [], []);
    expect(restored.proposalCustomServices).toEqual([sharedSnapshot]);
    expect([...restored.selectedServiceIds]).toEqual(['shared-1']);
  });

  test('does not duplicate a snapshot that still exists in the shared catalog', () => {
    const restored = restoreProposalDocument(document, [sharedSnapshot], []);
    expect(restored.proposalCustomServices).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha por módulo ausente**

Run: `npm --workspace apps/frontend test -- src/proposals/proposalDocument.test.ts`

Expected: FAIL com erro de importação de `proposalDocument`.

- [ ] **Step 3: Criar o contrato versionado e a restauração**

Em `proposalDocument.ts`, importar `ProposalService`, `ProposalProduct`, `ProposalRepresentative`, `ProposalServiceEdits` e definir:

```ts
export type ClientFields = { companyName: string; address: string; cep: string; cnpj: string; contact: string; email: string };
export type ProposalFields = { number: string; date: string; validityDays: string; modality: string };
export type ProposalProductSessionEdit = {
  name: string; unitValueUsd: number; quantity: number; description: string;
  maintenanceEnabled: boolean; maintenancePercent: number; maintenanceYears: number;
};
export type ProposalProductSessionEdits = Record<string, ProposalProductSessionEdit>;
export type ProposalProductSnapshot = ProposalProduct & {
  quantity: number; maintenanceEnabled: boolean; maintenancePercent: number; maintenanceYears: number;
};

export type ProposalDocumentV1 = {
  version: 1;
  client: ClientFields;
  proposal: ProposalFields;
  selectedServiceIds: string[];
  selectedProductIds: string[];
  serviceSnapshots: ProposalService[];
  productSnapshots: ProposalProductSnapshot[];
  proposalCustomServices: ProposalService[];
  proposalCustomProducts: ProposalProduct[];
  proposalServiceEdits: ProposalServiceEdits;
  proposalProductEdits: ProposalProductSessionEdits;
  taxPercent: string;
  exchangeRate: string;
  softwareDiscountPercent: string;
  discountPercent: string;
  targetTotal: string;
  selectedRepresentative: ProposalRepresentative | null;
  includeRequirementsTerm: boolean;
  snapToTarget: boolean;
  serviceTargetTotal: number | null;
  observations: string;
};

export function restoreProposalDocument(
  document: ProposalDocumentV1,
  catalogServices: ProposalService[],
  availableProducts: ProposalProduct[]
) {
  const serviceIds = new Set(catalogServices.map((item) => item.id));
  const productIds = new Set(availableProducts.map((item) => item.id));
  const missingServices = document.serviceSnapshots.filter((item) => !serviceIds.has(item.id));
  const missingProducts = document.productSnapshots.filter((item) => !productIds.has(item.id));
  const uniqueById = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
  const snapshotServiceEdits: ProposalServiceEdits = Object.fromEntries(document.serviceSnapshots.map((item) => [item.id, {
    name: item.name, valuePerDay: item.valuePerDay,
    durationDays: item.defaultDurationDays, description: item.description
  }]));
  const snapshotProductEdits: ProposalProductSessionEdits = Object.fromEntries(document.productSnapshots.map((item) => [item.id, {
    name: item.name, unitValueUsd: item.unitValueUsd, quantity: item.quantity, description: item.description,
    maintenanceEnabled: item.maintenanceEnabled, maintenancePercent: item.maintenancePercent,
    maintenanceYears: item.maintenanceYears
  }]));

  return {
    ...document,
    selectedServiceIds: new Set(document.selectedServiceIds),
    selectedProductIds: new Set(document.selectedProductIds),
    proposalCustomServices: uniqueById([...document.proposalCustomServices, ...missingServices]),
    proposalCustomProducts: uniqueById([...document.proposalCustomProducts, ...missingProducts]),
    proposalServiceEdits: { ...snapshotServiceEdits, ...document.proposalServiceEdits },
    proposalProductEdits: { ...snapshotProductEdits, ...document.proposalProductEdits }
  };
}
```

Mover os tipos equivalentes de `ProposalsPage.tsx` para esse arquivo e importá-los de volta, evitando duas definições divergentes.

- [ ] **Step 4: Rodar os testes puros**

Run: `npm --workspace apps/frontend test -- src/proposals/proposalDocument.test.ts`

Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/proposals/proposalDocument.ts apps/frontend/src/proposals/proposalDocument.test.ts apps/frontend/src/pages/ProposalsPage.tsx
git commit -m "feat: define editable proposal document"
```

### Task 4: Adicionar o cliente HTTP tipado

**Files:**
- Modify: `apps/frontend/src/services/api.ts:1-1040`
- Modify: `apps/frontend/src/services/api.test.ts`

- [ ] **Step 1: Escrever teste do contrato HTTP**

Adicionar ao teste da API:

```ts
describe('proposal api', () => {
  test('creates and updates a proposal with authenticated JSON requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'proposal-1', updated_at: '2026-08-17T12:00:00.000Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'proposal-1', updated_at: '2026-08-17T12:05:00.000Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const document = { version: 1 } as never;

    await api.createProposal({ number: 'P1', client_company_name: 'Cliente', document });
    await api.updateProposal('proposal-1', { number: 'P1', client_company_name: 'Cliente', document });

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/proposals');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:4000/proposals/proposal-1');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT' });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha por métodos ausentes**

Run: `npm --workspace apps/frontend test -- src/services/api.test.ts`

Expected: FAIL indicando que `createProposal` e `updateProposal` não existem.

- [ ] **Step 3: Adicionar tipos e métodos em `api.ts`**

Importar `ProposalDocumentV1` e `ProposalService`, declarar:

```ts
export type ProposalSummary = {
  id: string; number: string; client_company_name: string;
  created_by: string; updated_by: string; created_at: string; updated_at: string;
};
export type SavedProposal = ProposalSummary & { document: ProposalDocumentV1 };
export type ProposalWritePayload = {
  number: string; client_company_name: string; document: ProposalDocumentV1;
};
export type ProposalCatalogServicePayload = Omit<ProposalService, 'id' | 'custom'>;
```

Adicionar ao objeto `api`:

```ts
proposals: (q?: string) => req<{ items: ProposalSummary[] }>(`/proposals${q ? `?q=${encodeURIComponent(q)}` : ''}`),
proposal: (id: string) => req<SavedProposal>(`/proposals/${id}`),
createProposal: (payload: ProposalWritePayload) => req<{ id: string; updated_at: string }>('/proposals', {
  method: 'POST', body: JSON.stringify(payload)
}),
updateProposal: (id: string, payload: ProposalWritePayload) => req<{ id: string; updated_at: string }>(`/proposals/${id}`, {
  method: 'PUT', body: JSON.stringify(payload)
}),
deleteProposal: (id: string) => req<{ ok: boolean }>(`/proposals/${id}`, { method: 'DELETE' }),
proposalCatalogServices: () => req<{ items: ProposalService[] }>('/proposals/catalog/services'),
createProposalCatalogService: (payload: ProposalCatalogServicePayload) => req<ProposalService>('/proposals/catalog/services', {
  method: 'POST', body: JSON.stringify(payload)
}),
updateProposalCatalogService: (id: string, payload: ProposalCatalogServicePayload) => req<ProposalService>(`/proposals/catalog/services/${id}`, {
  method: 'PUT', body: JSON.stringify(payload)
}),
deleteProposalCatalogService: (id: string) => req<{ ok: boolean }>(`/proposals/catalog/services/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 4: Rodar o teste da API**

Run: `npm --workspace apps/frontend test -- src/services/api.test.ts`

Expected: todos os testes PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/api.ts apps/frontend/src/services/api.test.ts
git commit -m "feat: add proposal api client"
```

### Task 5: Criar o painel de propostas salvas

**Files:**
- Create: `apps/frontend/src/proposals/SavedProposalsPanel.tsx`
- Create: `apps/frontend/src/proposals/SavedProposalsPanel.test.tsx`
- Modify: `apps/frontend/src/styles.css:11906-12388`

- [ ] **Step 1: Adicionar um teste de renderização e busca**

Criar `SavedProposalsPanel.test.tsx` e testar o componente isoladamente:

```ts
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { SavedProposalsPanel } from './SavedProposalsPanel';

test('lists and filters shared saved proposals', async () => {
  const items = [
    { id: 'p1', number: 'P-001', client_company_name: 'Alfa', created_by: 'u1', updated_by: 'u1', created_at: '2026-08-17T10:00:00Z', updated_at: '2026-08-17T10:00:00Z' },
    { id: 'p2', number: 'P-002', client_company_name: 'Beta', created_by: 'u1', updated_by: 'u1', created_at: '2026-08-17T11:00:00Z', updated_at: '2026-08-17T11:00:00Z' }
  ];
  const onQueryChange = vi.fn();
  const { rerender } = render(<SavedProposalsPanel items={items} query="" activeId={null}
    loading={false} saving={false} error="" status="" onQueryChange={onQueryChange}
    onNew={vi.fn()} onSave={vi.fn()} onOpen={vi.fn()} onDelete={vi.fn()} />);

  expect(screen.getByRole('button', { name: /Abrir P-001/i })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar propostas salvas'), { target: { value: 'Beta' } });
  expect(onQueryChange).toHaveBeenLastCalledWith('Beta');
  rerender(<SavedProposalsPanel items={items} query="Beta" activeId={null}
    loading={false} saving={false} error="" status="" onQueryChange={onQueryChange}
    onNew={vi.fn()} onSave={vi.fn()} onOpen={vi.fn()} onDelete={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /Abrir P-001/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Abrir P-002/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste e confirmar falha porque o painel não existe**

Run: `npm --workspace apps/frontend test -- src/proposals/SavedProposalsPanel.test.tsx`

Expected: FAIL ao procurar “Buscar propostas salvas”.

- [ ] **Step 3: Criar `SavedProposalsPanel.tsx`**

Implementar um componente controlado com props explícitas:

```tsx
import type { ProposalSummary } from '../services/api';

type Props = {
  items: ProposalSummary[]; query: string; activeId: string | null;
  loading: boolean; saving: boolean; error: string; status: string;
  onQueryChange(value: string): void; onNew(): void; onSave(): void;
  onOpen(id: string): void; onDelete(id: string): void;
};

export function SavedProposalsPanel(props: Props) {
  const normalized = props.query.trim().toLocaleLowerCase('pt-BR');
  const filtered = props.items.filter((item) =>
    `${item.number} ${item.client_company_name}`.toLocaleLowerCase('pt-BR').includes(normalized)
  );
  return (
    <section className="proposal-panel proposal-saved-panel" aria-label="Propostas salvas">
      <div className="proposal-panel-title-row"><h2>Propostas salvas</h2></div>
      <div className="proposal-primary-actions">
        <button type="button" onClick={props.onNew}>Nova proposta</button>
        <button type="button" onClick={props.onSave} disabled={props.saving}>
          {props.saving ? 'Salvando...' : 'Salvar proposta'}
        </button>
      </div>
      <label>Buscar
        <input aria-label="Buscar propostas salvas" value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} />
      </label>
      {props.error ? <p className="proposal-operation-message is-error" role="alert">{props.error}</p> : null}
      {props.status ? <p className="proposal-operation-message" role="status">{props.status}</p> : null}
      {props.loading ? <p className="proposal-saved-empty">Carregando propostas...</p> : null}
      {!props.loading && filtered.length === 0 ? <p className="proposal-saved-empty">Nenhuma proposta encontrada.</p> : null}
      <div className="proposal-saved-list">
        {filtered.map((item) => (
          <article key={item.id} className={item.id === props.activeId ? 'is-active' : ''}>
            <button type="button" className="proposal-saved-open" onClick={() => props.onOpen(item.id)} aria-label={`Abrir ${item.number || 'proposta sem número'}`}>
              <strong>{item.number || 'Sem número'}</strong><span>{item.client_company_name || 'Cliente não informado'}</span>
              <small>{new Date(item.updated_at).toLocaleString('pt-BR')}</small>
            </button>
            <button type="button" className="proposal-saved-delete" onClick={() => props.onDelete(item.id)} aria-label={`Excluir ${item.number || 'proposta sem número'}`}>×</button>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Adicionar estilos focados**

Em `styles.css`, adicionar classes para `.proposal-primary-actions`, `.proposal-saved-list`, `.proposal-saved-list article`, `.proposal-saved-open`, `.proposal-saved-delete`, `.proposal-operation-message`, `.is-error` e `.proposal-saved-empty`. Usar os tokens já existentes (`--proposal-red`, fundos translúcidos, borda de 6px) e garantir `:focus-visible` e botões desabilitados visíveis.

```css
.proposals-page .proposal-primary-actions { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
.proposals-page .proposal-primary-actions button { border: 1px solid var(--proposal-red); border-radius: 5px; cursor: pointer; padding: 8px; }
.proposals-page .proposal-primary-actions button:last-child { background: var(--proposal-red); color: #fff; }
.proposals-page .proposal-primary-actions button:disabled { cursor: wait; opacity: .6; }
.proposals-page .proposal-primary-actions button:focus-visible,
.proposals-page .proposal-saved-open:focus-visible,
.proposals-page .proposal-saved-delete:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.proposals-page .proposal-saved-list { display: grid; gap: 6px; max-height: 260px; overflow-y: auto; }
.proposals-page .proposal-saved-list article { align-items: stretch; border: 1px solid rgba(255,255,255,.1); border-radius: 6px; display: flex; }
.proposals-page .proposal-saved-list article.is-active { border-color: var(--proposal-red); }
.proposals-page .proposal-saved-open { background: transparent; border: 0; color: #ddd; display: grid; flex: 1; gap: 2px; padding: 9px; text-align: left; }
.proposals-page .proposal-saved-open span,
.proposals-page .proposal-saved-open small { color: #999; font-size: .66rem; }
.proposals-page .proposal-saved-delete { background: transparent; border: 0; color: #999; cursor: pointer; padding: 0 10px; }
.proposals-page .proposal-operation-message,
.proposals-page .proposal-saved-empty { color: #aaa; font-size: .68rem; margin: 0; }
.proposals-page .proposal-operation-message.is-error { color: #ff9b94; }
```

- [ ] **Step 5: Rodar o teste do painel**

Run: `npm --workspace apps/frontend test -- src/proposals/SavedProposalsPanel.test.tsx`

Expected: o novo teste PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/proposals/SavedProposalsPanel.tsx apps/frontend/src/proposals/SavedProposalsPanel.test.tsx apps/frontend/src/styles.css
git commit -m "feat: add saved proposals panel"
```

### Task 6: Integrar salvamento, reabertura e proteção contra descarte

**Files:**
- Modify: `apps/frontend/src/pages/ProposalsPage.tsx:1088-1940`
- Modify: `apps/frontend/src/pages/ProposalsPage.test.tsx`

- [ ] **Step 1: Escrever testes de criar, atualizar, reabrir e preservar formulário em falha**

No topo de `ProposalsPage.test.tsx`, importar `api`, mockar `../services/api` e definir retornos padrão de `api.proposals()` e `api.proposalCatalogServices()` no `beforeEach`, para que os testes antigos continuem isolados. Adicionar quatro cenários:

```ts
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    proposals: vi.fn(), proposal: vi.fn(), createProposal: vi.fn(), updateProposal: vi.fn(), deleteProposal: vi.fn(),
    proposalCatalogServices: vi.fn(), createProposalCatalogService: vi.fn(),
    updateProposalCatalogService: vi.fn(), deleteProposalCatalogService: vi.fn()
  }
}));

// dentro do beforeEach existente:
vi.mocked(api.proposals).mockResolvedValue({ items: [] });
vi.mocked(api.proposalCatalogServices).mockResolvedValue({ items: [] });
```

```ts
test('creates on first manual save and updates the same proposal afterwards', async () => {
  vi.mocked(api.createProposal).mockResolvedValue({ id: 'proposal-1', updated_at: '2026-08-17T12:00:00Z' });
  vi.mocked(api.updateProposal).mockResolvedValue({ id: 'proposal-1', updated_at: '2026-08-17T12:05:00Z' });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.clear(screen.getByLabelText('Número da Proposta'));
  await user.type(screen.getByLabelText('Número da Proposta'), 'P-900');
  await user.type(screen.getByLabelText('Razão Social'), 'Cliente Persistido');
  await user.click(screen.getByRole('button', { name: 'Salvar proposta' }));
  await screen.findByText('Proposta salva.');
  expect(api.createProposal).toHaveBeenCalledTimes(1);
  await user.type(screen.getByLabelText('Contato'), 'Maria');
  await user.click(screen.getByRole('button', { name: 'Salvar proposta' }));
  expect(api.updateProposal).toHaveBeenCalledWith('proposal-1', expect.objectContaining({ number: 'P-900' }));
});

test('opens a saved proposal and restores fields and selections', async () => {
  vi.mocked(api.proposals).mockResolvedValue({ items: [savedSummary] });
  vi.mocked(api.proposal).mockResolvedValue({ ...savedSummary, document: savedDocument });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.click(await screen.findByRole('button', { name: /Abrir P-001/i }));
  expect(screen.getByLabelText('Razão Social')).toHaveValue(savedDocument.client.companyName);
  expect(screen.getByRole('checkbox', { name: /Selecionar Treinamento TopSolid'Design 7 - Básico/i })).toBeChecked();
});

test('keeps edited fields when saving fails', async () => {
  vi.mocked(api.createProposal).mockRejectedValue(new Error('Falha de conexão com a API.'));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.type(screen.getByLabelText('Razão Social'), 'Não perder');
  await user.click(screen.getByRole('button', { name: 'Salvar proposta' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha de conexão');
  expect(screen.getByLabelText('Razão Social')).toHaveValue('Não perder');
});

test('asks before replacing unsaved changes', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.mocked(api.proposals).mockResolvedValue({ items: [savedSummary] });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.type(screen.getByLabelText('Razão Social'), 'Rascunho');
  await user.click(await screen.findByRole('button', { name: /Abrir P-001/i }));
  expect(window.confirm).toHaveBeenCalled();
  expect(api.proposal).not.toHaveBeenCalled();
});
```

Definir `savedSummary` e `savedDocument` completos no teste usando `ProposalDocumentV1`.

- [ ] **Step 2: Rodar e confirmar falha dos fluxos ainda não ligados**

Run: `npm --workspace apps/frontend test -- src/pages/ProposalsPage.test.tsx`

Expected: FAIL nos handlers de salvar e abrir.

- [ ] **Step 3: Criar a função que captura o documento atual**

Adicionar estados `savedProposals`, `proposalSearch`, `proposalsLoading`, `proposalOperationError`, `proposalOperationStatus`, `savingProposal` e `activeProposalId`; carregar `api.proposals()` em `useEffect`; renderizar `SavedProposalsPanel` imediatamente abaixo do cabeçalho da sidebar.

```tsx
const [savedProposals, setSavedProposals] = useState<ProposalSummary[]>([]);
const [proposalSearch, setProposalSearch] = useState('');
const [proposalsLoading, setProposalsLoading] = useState(true);
const [proposalOperationError, setProposalOperationError] = useState('');
const [proposalOperationStatus, setProposalOperationStatus] = useState('');
const [savingProposal, setSavingProposal] = useState(false);
const [activeProposalId, setActiveProposalId] = useState<string | null>(null);

useEffect(() => {
  let active = true;
  api.proposals()
    .then(({ items }) => { if (active) setSavedProposals(items); })
    .catch((error: unknown) => {
      if (active) setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível carregar as propostas.');
    })
    .finally(() => { if (active) setProposalsLoading(false); });
  return () => { active = false; };
}, []);

// imediatamente abaixo do header da sidebar:
<SavedProposalsPanel
  items={savedProposals} query={proposalSearch} activeId={activeProposalId}
  loading={proposalsLoading} saving={savingProposal}
  error={proposalOperationError} status={proposalOperationStatus}
  onQueryChange={setProposalSearch} onNew={() => resetToNewProposal()}
  onSave={saveCurrentProposal} onOpen={openSavedProposal} onDelete={deleteSavedProposal}
/>
```

Fora do componente, criar uma função concreta para o estado inicial:

```ts
function createEmptyProposalDocument(
  config: Partial<ProposalConfig>,
  representative: ProposalRepresentative
): ProposalDocumentV1 {
  return {
    version: 1,
    client: EMPTY_CLIENT,
    proposal: { number: 'P23005_OS', date: todayInputValue(), validityDays: String(DEFAULT_VALIDITY_DAYS), modality: 'Presencial e Online' },
    selectedServiceIds: [], selectedProductIds: [], serviceSnapshots: [], productSnapshots: [],
    proposalCustomServices: [], proposalCustomProducts: [], proposalServiceEdits: {}, proposalProductEdits: {},
    taxPercent: config.taxPercent ?? String(DEFAULT_TAX_PERCENT),
    exchangeRate: config.exchangeRate ?? String(DEFAULT_EXCHANGE_RATE.toFixed(2)),
    softwareDiscountPercent: config.softwareDiscountPercent ?? '0',
    discountPercent: '0', targetTotal: String(SNAP_TOTAL_TARGET), selectedRepresentative: representative,
    includeRequirementsTerm: false, snapToTarget: false, serviceTargetTotal: null,
    observations: loadProposalObservations()
  };
}
```

Dentro do componente, montar `currentDocument` com `useMemo`. Converter `EditableProposalService`/`EditableProposalProduct` selecionados para snapshots usando os nomes exibidos e valores atuais, e incluir todos os campos de `ProposalDocumentV1`:

```ts
const currentDocument = useMemo<ProposalDocumentV1>(() => ({
  version: 1, client, proposal,
  selectedServiceIds: [...selectedIds], selectedProductIds: [...selectedProductIds],
  serviceSnapshots: selectedServices.map((item) => ({
    id: item.id, code: item.code, name: item.displayName, valuePerDay: item.valuePerDay,
    defaultDurationDays: item.durationDays, description: item.displayDescription, custom: item.custom
  })),
  productSnapshots: selectedProducts.map((item) => ({
    id: item.id, code: item.code, name: item.displayName, unitValueUsd: item.unitValueUsd,
    defaultQuantity: item.quantity, description: item.displayDescription, custom: item.custom,
    quantity: item.quantity, maintenanceEnabled: item.maintenanceEnabled,
    maintenancePercent: item.maintenancePercent, maintenanceYears: item.maintenanceYears
  })),
  proposalCustomServices, proposalCustomProducts, proposalServiceEdits, proposalProductEdits,
  taxPercent, exchangeRate, softwareDiscountPercent, discountPercent, targetTotal,
  selectedRepresentative, includeRequirementsTerm, snapToTarget,
  serviceTargetTotal: serviceTargetTotal ?? null, observations
}), [client, proposal, selectedIds, selectedProductIds, selectedServices, selectedProducts,
  proposalCustomServices, proposalCustomProducts, proposalServiceEdits, proposalProductEdits,
  taxPercent, exchangeRate, softwareDiscountPercent, discountPercent, targetTotal,
  selectedRepresentative, includeRequirementsTerm, snapToTarget, serviceTargetTotal, observations]);
```

Manter `baselineDocumentJson` no estado. Inicializá-lo com o JSON do documento inicial e calcular `hasUnsavedChanges = JSON.stringify(currentDocument) !== baselineDocumentJson`.

- [ ] **Step 4: Implementar salvar e atualizar a lista**

```ts
async function saveCurrentProposal() {
  setSavingProposal(true); setProposalOperationError(''); setProposalOperationStatus('');
  const payload = { number: proposal.number.trim(), client_company_name: client.companyName.trim(), document: currentDocument };
  try {
    const result = activeProposalId
      ? await api.updateProposal(activeProposalId, payload)
      : await api.createProposal(payload);
    const id = activeProposalId ?? result.id;
    setActiveProposalId(id);
    setBaselineDocumentJson(JSON.stringify(currentDocument));
    setProposalOperationStatus('Proposta salva.');
    setSavedProposals((previous) => {
      const existing = previous.find((item) => item.id === id);
      const summary: ProposalSummary = {
        id, number: payload.number, client_company_name: payload.client_company_name,
        created_by: existing?.created_by ?? '', updated_by: existing?.updated_by ?? '',
        created_at: existing?.created_at ?? result.updated_at, updated_at: result.updated_at
      };
      return [summary, ...previous.filter((item) => item.id !== id)];
    });
    try {
      const refreshed = await api.proposals();
      setSavedProposals(refreshed.items);
    } catch {
      // A gravação já foi confirmada; o resumo local mantém a interface coerente até o próximo carregamento.
    }
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível salvar a proposta.');
  } finally {
    setSavingProposal(false);
  }
}
```

Se o refresh da lista falhar depois da gravação confirmada, manter o sucesso e atualizar localmente o resumo em vez de informar que o documento não foi salvo.

- [ ] **Step 5: Implementar aplicação atômica de um documento aberto**

Criar `applyDocument(document)` que chama `restoreProposalDocument(document, [...PROPOSAL_SERVICES, ...customServices], [...PROPOSAL_PRODUCTS, ...customProducts])`, atualiza todos os estados correspondentes, fecha editores/formulários temporários e garante que `selectedRepresentative` seja acrescentado aos representantes customizados quando não for padrão. `openSavedProposal(id)` deve confirmar descarte quando `hasUnsavedChanges`, buscar com `api.proposal(id)`, aplicar, definir `activeProposalId` e `baselineDocumentJson` para o JSON recebido.

```ts
function applyDocument(document: ProposalDocumentV1) {
  const restored = restoreProposalDocument(
    document,
    [...PROPOSAL_SERVICES, ...customServices],
    [...PROPOSAL_PRODUCTS, ...customProducts]
  );
  setClient(restored.client);
  setProposal(restored.proposal);
  setSelectedIds(restored.selectedServiceIds);
  setSelectedProductIds(restored.selectedProductIds);
  setProposalCustomServices(restored.proposalCustomServices);
  setProposalCustomProducts(restored.proposalCustomProducts);
  setProposalServiceEdits(restored.proposalServiceEdits);
  setProposalProductEdits(restored.proposalProductEdits);
  setTaxPercent(restored.taxPercent);
  setExchangeRate(restored.exchangeRate);
  setSoftwareDiscountPercent(restored.softwareDiscountPercent);
  setDiscountPercent(restored.discountPercent);
  setTargetTotal(restored.targetTotal);
  setIncludeRequirementsTerm(restored.includeRequirementsTerm);
  setSnapToTarget(restored.snapToTarget);
  setServiceTargetTotal(restored.serviceTargetTotal ?? undefined);
  setObservations(restored.observations);
  const representative = restored.selectedRepresentative ?? DEFAULT_REPRESENTATIVES[0];
  if (!DEFAULT_REPRESENTATIVES.some((item) => item.id === representative.id)) {
    setCustomRepresentatives((previous) => previous.some((item) => item.id === representative.id) ? previous : [...previous, representative]);
  }
  setSelectedRepresentativeId(representative.id);
  setActiveEditor(null);
  setIsAddingCustom(false);
  setIsAddingCustomProduct(false);
  setSnapMessage('');
  return {
    ...document,
    proposalCustomServices: restored.proposalCustomServices,
    proposalCustomProducts: restored.proposalCustomProducts,
    proposalServiceEdits: restored.proposalServiceEdits,
    proposalProductEdits: restored.proposalProductEdits
  } satisfies ProposalDocumentV1;
}

async function openSavedProposal(id: string) {
  if (hasUnsavedChanges && !window.confirm('Descartar alterações não salvas?')) return;
  setProposalOperationError('');
  try {
    const saved = await api.proposal(id);
    const canonicalDocument = applyDocument(saved.document);
    setActiveProposalId(id);
    setBaselineDocumentJson(JSON.stringify(canonicalDocument));
    setProposalOperationStatus('Proposta aberta.');
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível abrir a proposta.');
  }
}
```

- [ ] **Step 6: Implementar Nova, excluir e beforeunload**

`newProposal()` confirma descarte, aplica um documento inicial produzido por uma função `createEmptyProposalDocument(savedConfig)`, zera `activeProposalId` e define o novo baseline. `deleteSavedProposal(id)` confirma com `window.confirm`, chama a API, remove o resumo e, se o registro era o ativo, inicia uma proposta nova sem pedir uma segunda confirmação.

```ts
function resetToNewProposal(skipConfirmation = false) {
  if (!skipConfirmation && hasUnsavedChanges && !window.confirm('Descartar alterações não salvas?')) return;
  const empty = createEmptyProposalDocument(savedConfig, DEFAULT_REPRESENTATIVES[0]);
  const canonicalDocument = applyDocument(empty);
  setActiveProposalId(null);
  setBaselineDocumentJson(JSON.stringify(canonicalDocument));
  setProposalOperationStatus('Nova proposta iniciada.');
  setProposalOperationError('');
}

async function deleteSavedProposal(id: string) {
  if (!window.confirm('Excluir esta proposta permanentemente?')) return;
  setProposalOperationError('');
  try {
    await api.deleteProposal(id);
    setSavedProposals((previous) => previous.filter((item) => item.id !== id));
    if (activeProposalId === id) resetToNewProposal(true);
    setProposalOperationStatus('Proposta excluída.');
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível excluir a proposta.');
  }
}
```

Adicionar proteção de saída:

```ts
useEffect(() => {
  if (!hasUnsavedChanges) return;
  const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
}, [hasUnsavedChanges]);
```

- [ ] **Step 7: Rodar os testes da página**

Run: `npm --workspace apps/frontend test -- src/pages/ProposalsPage.test.tsx`

Expected: todos os testes PASS, incluindo criação, atualização, abertura, confirmação e preservação após erro.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/ProposalsPage.tsx apps/frontend/src/pages/ProposalsPage.test.tsx
git commit -m "feat: save and reopen shared proposals"
```

### Task 7: Substituir o catálogo local de módulos pelo catálogo compartilhado

**Files:**
- Modify: `apps/frontend/src/pages/ProposalsPage.tsx:1097-1430`
- Modify: `apps/frontend/src/pages/ProposalsPage.test.tsx`
- Modify: `apps/frontend/src/proposals/proposalStorage.ts:180-192`
- Modify: `apps/frontend/src/proposals/proposalStorage.test.ts`

- [ ] **Step 1: Atualizar o teste do módulo para exigir a API compartilhada**

Alterar o teste existente “creating and selecting a custom module…” para mockar a criação remota e verificar a chamada:

```ts
vi.mocked(api.createProposalCatalogService).mockResolvedValue({
  id: 'proposal-service-1', code: '020102090', name: 'Treinamento Robodrill Especial',
  valuePerDay: 1500, defaultDurationDays: 2, description: 'Ajustes e rotinas sob medida.', custom: true
});
expect(api.createProposalCatalogService).toHaveBeenCalledWith({
  code: '020102090', name: 'Treinamento Robodrill Especial', valuePerDay: 1500,
  defaultDurationDays: 2, description: 'Ajustes e rotinas sob medida.'
});
```

Adicionar teste de carregamento:

```ts
test('loads shared custom modules for every user entering the page', async () => {
  vi.mocked(api.proposalCatalogServices).mockResolvedValue({ items: [sharedService] });
  render(<ProposalsPage />);
  expect(await screen.findByText(sharedService.name)).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar falha porque o catálogo ainda usa localStorage**

Run: `npm --workspace apps/frontend test -- src/pages/ProposalsPage.test.tsx`

Expected: FAIL na expectativa da API de catálogo.

- [ ] **Step 3: Carregar e criar módulos pelo servidor**

Inicializar `customServices` com `[]` e carregar `api.proposalCatalogServices()` no efeito inicial. Tornar `createCustomService` assíncrona. Para `persist === true`, enviar:

```ts
useEffect(() => {
  let active = true;
  api.proposalCatalogServices()
    .then(({ items }) => { if (active) setCustomServices(items); })
    .catch((error: unknown) => {
      if (active) setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível carregar os módulos compartilhados.');
    });
  return () => { active = false; };
}, []);

async function createCustomService(persist: boolean) {
  const name = customDraft.name.trim();
  if (!name) return;
  const valuePerDay = Math.max(0, numericValue(customDraft.valuePerDay, 1000));
  const durationDays = positiveIntegerValue(customDraft.days, 1);
  if (!persist) {
    setProposalCustomServices((previous) => [...previous, {
      id: `custom_${Date.now()}`, code: customDraft.code.trim(), name, valuePerDay,
      defaultDurationDays: durationDays, description: customDraft.description.trim(), custom: true
    }]);
    setCustomDraft(EMPTY_CUSTOM_MODULE);
    setIsAddingCustom(false);
    return;
  }
  try {
    const persisted = await api.createProposalCatalogService({
      code: customDraft.code.trim(), name, valuePerDay,
      defaultDurationDays: durationDays, description: customDraft.description.trim()
    });
    setCustomServices((previous) => [...previous, persisted]);
    setCustomDraft(EMPTY_CUSTOM_MODULE);
    setIsAddingCustom(false);
    setProposalOperationStatus('Módulo salvo no catálogo compartilhado.');
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível salvar o módulo.');
  }
}
```

Somente limpar o formulário após sucesso. Em falha, manter o rascunho e exibir a mensagem de operação. O caminho `persist === false` continua adicionando apenas a `proposalCustomServices`.

- [ ] **Step 4: Compartilhar edição padrão e exclusão**

Em `saveServiceAsDefault`, detectar `customServices.some(item => item.id === id)`. Nesse caso chamar `api.updateProposalCatalogService` e substituir o item retornado no estado. Se o item estiver em `proposalCustomServices`, criar no servidor, remover o item temporário e trocar o ID em `selectedIds` e `proposalServiceEdits` quando necessário. Serviços estáticos continuam usando `saveProposalServiceEdits` como preferência local existente.

```ts
if (customServices.some((item) => item.id === id)) {
  try {
    const updated = await api.updateProposalCatalogService(id, {
      code: service.code, name: service.displayName, valuePerDay: service.valuePerDay,
      defaultDurationDays: service.durationDays, description: service.displayDescription
    });
    setCustomServices((previous) => previous.map((item) => item.id === id ? updated : item));
    setProposalOperationStatus('Módulo atualizado no catálogo compartilhado.');
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível atualizar o módulo.');
  }
  return;
}

if (proposalCustomServices.some((item) => item.id === id)) {
  try {
    const persisted = await api.createProposalCatalogService({
      code: service.code, name: service.displayName, valuePerDay: service.valuePerDay,
      defaultDurationDays: service.durationDays, description: service.displayDescription
    });
    setCustomServices((previous) => [...previous, persisted]);
    setProposalCustomServices((previous) => previous.filter((item) => item.id !== id));
    setSelectedIds((previous) => {
      if (!previous.has(id)) return previous;
      const next = new Set(previous); next.delete(id); next.add(persisted.id); return next;
    });
    setProposalServiceEdits((previous) => {
      const next = { ...previous };
      if (next[id]) next[persisted.id] = next[id];
      delete next[id];
      return next;
    });
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível salvar o módulo no catálogo.');
  }
  return;
}
```

Em `deleteCustomService`, quando o ID for do catálogo compartilhado, chamar `api.deleteProposalCatalogService(id)` antes de removê-lo do estado. Se falhar, não remover. Itens apenas da proposta continuam sendo excluídos localmente.

```ts
if (customServices.some((item) => item.id === id)) {
  try {
    await api.deleteProposalCatalogService(id);
  } catch (error) {
    setProposalOperationError(error instanceof Error ? error.message : 'Não foi possível excluir o módulo.');
    return;
  }
}
setCustomServices((previous) => previous.filter((item) => item.id !== id));
setProposalCustomServices((previous) => previous.filter((item) => item.id !== id));
setSelectedIds((previous) => { const next = new Set(previous); next.delete(id); return next; });
```

Para evitar duplicidade se o catálogo terminar de carregar depois de uma proposta aberta, deduplicar `buildEditableServices` antes do `.map`:

```diff
- return [...PROPOSAL_SERVICES, ...catalogCustomServices, ...proposalCustomServices].map((service) => {
+ const uniqueServices = [...new Map(
+   [...PROPOSAL_SERVICES, ...catalogCustomServices, ...proposalCustomServices]
+     .map((item) => [item.id, item] as const)
+ ).values()];
+ return uniqueServices.map((service) => {
```

- [ ] **Step 5: Remover a persistência local do catálogo de serviços**

Remover os imports e chamadas `loadProposalCustomServices`, `saveProposalCustomServices` de `ProposalsPage.tsx`. Remover essas duas funções e a chave `CUSTOM_SERVICES_KEY` de `proposalStorage.ts`, junto com os testes específicos delas. Não alterar o armazenamento local de produtos, representantes, configurações ou edições dos serviços estáticos.

- [ ] **Step 6: Rodar testes frontend relevantes**

Run: `npm --workspace apps/frontend test -- src/pages/ProposalsPage.test.tsx src/proposals/proposalStorage.test.ts`

Expected: todos PASS; o catálogo usa API e o restante das preferências locais continua funcional.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/ProposalsPage.tsx apps/frontend/src/pages/ProposalsPage.test.tsx apps/frontend/src/proposals/proposalStorage.ts apps/frontend/src/proposals/proposalStorage.test.ts
git commit -m "feat: share custom proposal modules"
```

### Task 8: Verificação integrada e acabamento

**Files:**
- Modify only if verification exposes a defect in files from Tasks 1-7.

- [ ] **Step 1: Rodar toda a suíte backend**

Run: `npm --workspace apps/backend test`

Expected: exit code 0; nenhum teste FAIL.

- [ ] **Step 2: Rodar toda a suíte frontend**

Run: `npm --workspace apps/frontend test`

Expected: exit code 0; nenhum teste FAIL.

- [ ] **Step 3: Rodar build de produção completo**

Run: `npm run build`

Expected: TypeScript e Vite terminam com exit code 0.

- [ ] **Step 4: Fazer smoke test manual com dois usuários/sessões**

Executar backend e frontend, abrir duas sessões autenticadas e validar:

1. Sessão A salva um módulo no catálogo.
2. Sessão B recarrega/entra em Propostas e vê o módulo.
3. Sessão A cria e salva uma proposta com o módulo selecionado.
4. Sessão B abre a proposta, altera o contato e salva.
5. Sessão A reabre e vê o contato alterado.
6. Desligar temporariamente a API, editar o formulário e tentar salvar; o conteúdo permanece na tela e aparece erro.

- [ ] **Step 5: Conferir diff e ausência de artefatos**

Run: `git diff --check && git status --short`

Expected: sem erros de whitespace; somente arquivos deliberadamente alterados aparecem no status. Não adicionar `.claude/`, `output/`, bancos SQLite, logs ou screenshots.

- [ ] **Step 6: Commit final de correções, se necessário**

Se os passos 1-5 exigirem ajustes:

```bash
git add apps/backend/src apps/frontend/src
git commit -m "fix: harden shared proposal flows"
```

Se não houver ajustes, não criar commit vazio.
