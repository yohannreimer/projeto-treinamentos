# TopSolid Catalog Search and Shared Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a busca e a hierarquia do catálogo TopSolid e permitir criação, edição e arquivamento compartilhados sem alterar itens já incluídos em rascunhos ou propostas salvas.

**Architecture:** Os 450 produtos gerados continuam como base imutável. Uma tabela SQLite por organização armazena produtos criados, sobreposições e arquivamentos; o frontend resolve essa camada sobre a base antes de montar a árvore e preserva snapshots no momento da seleção. Busca, classificação, resolução de sobreposições e agrupamento permanecem funções puras, enquanto o modal e `ProposalsPage` cuidam somente da interação e da API.

**Tech Stack:** React 18, TypeScript 5.7, Vite, Vitest, Testing Library, Express 4, Zod, better-sqlite3, Node test runner.

---

## File map

### Create

- `apps/backend/src/proposals/catalogProductRoutes.ts` — validação, serialização e rotas compartilhadas de produtos.
- `apps/frontend/src/proposals/topsolidCatalogClassification.ts` — lista explícita dos produtos principais oficiais.
- `apps/frontend/src/proposals/topsolidCatalogClassification.test.ts` — cobertura da classificação curada.
- `apps/frontend/src/proposals/sharedSoftwareCatalog.ts` — aplica registros compartilhados, arquivamentos e compatibilidade local.
- `apps/frontend/src/proposals/sharedSoftwareCatalog.test.ts` — cobertura de precedência, isolamento lógico e arquivamento.
- `apps/frontend/src/proposals/SoftwareCatalogProductModal.tsx` — modal acessível de criação, edição e arquivamento.
- `apps/frontend/src/proposals/SoftwareCatalogProductModal.test.tsx` — interações e preservação de formulário.

### Modify

- `apps/backend/src/db.ts` — tabela e índices de `proposal_catalog_product`, limpeza de testes.
- `apps/backend/src/proposals/routes.ts` — registra as novas rotas antes de `/proposals/:id`.
- `apps/backend/src/proposals/proposals.test.ts` — schema, CRUD, arquivamento e isolamento por organização.
- `apps/frontend/src/proposals/proposalData.ts` — classificação `isPrimary` no metadado.
- `apps/frontend/src/services/api.ts` — contratos e métodos do catálogo compartilhado.
- `apps/frontend/src/services/api.test.ts` — URLs, métodos e payloads.
- `apps/frontend/src/proposals/softwareCatalog.ts` — normalização por tokens, relevância, pseudo-subfamília e agrupamento.
- `apps/frontend/src/proposals/softwareCatalog.test.ts` — buscas aprovadas, ordem e agrupamento.
- `apps/frontend/src/proposals/SoftwareCatalogExplorer.tsx` — resultados agrupados e ações administrativas.
- `apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx` — navegação, grupos e abertura do modal.
- `apps/frontend/src/pages/ProposalsPage.tsx` — carga compartilhada, mutações e snapshot na seleção.
- `apps/frontend/src/pages/ProposalsPage.test.tsx` — integração, falhas e histórico do rascunho.
- `apps/frontend/src/styles.css` — agrupamentos, menu, modal e responsividade.

## Task 1: Persistir registros compartilhados do catálogo

**Files:**
- Modify: `apps/backend/src/db.ts:989-1014`
- Modify: `apps/backend/src/db.ts:3166-3170`
- Test: `apps/backend/src/proposals/proposals.test.ts:49-61`

- [ ] **Step 1: Escrever o teste de schema que falha**

Substituir a consulta do teste `initializes proposal persistence tables` e acrescentar as asserções de colunas e índice:

```ts
const tables = db.prepare(`
  select name from sqlite_master
  where type = 'table' and name in (
    'proposal', 'proposal_catalog_product', 'proposal_catalog_service'
  ) order by name
`).all() as Array<{ name: string }>;
assert.deepEqual(tables.map((row) => row.name), [
  'proposal', 'proposal_catalog_product', 'proposal_catalog_service'
]);

const columns = db.prepare('pragma table_info(proposal_catalog_product)')
  .all() as Array<{ name: string }>;
assert.deepEqual(columns.map((row) => row.name), [
  'id', 'organization_id', 'product_id', 'source', 'product_json',
  'is_archived', 'created_by', 'updated_by', 'created_at', 'updated_at'
]);
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `npm --workspace apps/backend exec -- tsx --test --test-name-pattern="initializes proposal persistence tables" src/proposals/proposals.test.ts`

Expected: FAIL porque `proposal_catalog_product` ainda não existe.

- [ ] **Step 3: Criar tabela, restrições e índice**

Adicionar ao mesmo bloco de schema que cria `proposal_catalog_service`:

```sql
create table if not exists proposal_catalog_product (
  id text primary key,
  organization_id text not null,
  product_id text not null,
  source text not null check(source in ('official', 'custom')),
  product_json text,
  is_archived integer not null default 0 check(is_archived in (0, 1)),
  created_by text not null,
  updated_by text not null,
  created_at text not null,
  updated_at text not null,
  foreign key(organization_id) references organization(id) on delete cascade,
  foreign key(created_by) references internal_user(id),
  foreign key(updated_by) references internal_user(id),
  unique(organization_id, product_id)
);

create index if not exists idx_proposal_catalog_product_org_updated
  on proposal_catalog_product(organization_id, updated_at desc);
```

Adicionar `delete from proposal_catalog_product;` logo após `delete from proposal;` em `clearAllData()`.

- [ ] **Step 4: Rodar o teste focado**

Run: `npm --workspace apps/backend exec -- tsx --test --test-name-pattern="initializes proposal persistence tables" src/proposals/proposals.test.ts`

Expected: PASS.

- [ ] **Step 5: Commitar o schema**

```bash
git add apps/backend/src/db.ts apps/backend/src/proposals/proposals.test.ts
git commit -m "feat: persist shared proposal catalog products"
```

## Task 2: Implementar a API organizacional de produtos

**Files:**
- Create: `apps/backend/src/proposals/catalogProductRoutes.ts`
- Modify: `apps/backend/src/proposals/routes.ts:1-10,108-112`
- Test: `apps/backend/src/proposals/proposals.test.ts`

- [ ] **Step 1: Escrever testes de criação, edição, arquivamento e isolamento**

Adicionar um teste que autentica dois usuários da mesma organização, cria um
produto com um e lista com o outro; depois atualiza um oficial e arquiva os dois:

```ts
test('shares catalog products, stores official overrides and archives without deleting history', async () => {
  const dbPath = assignTestDbPath('proposal-product-catalog');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };
  const product = {
    code: 'CUSTOM-1', name: 'Produto compartilhado', unitValueUsd: 1200,
    defaultQuantity: 1, description: 'Criado no aplicativo',
    catalog: { family: 'Design', subfamily: 'Extensões', folder: 'Customizados', reviewStatus: '', isPrimary: false }
  };

  const created = await request(app).post('/proposals/catalog/products').set(auth).send(product);
  assert.equal(created.status, 201);
  assert.equal(created.body.source, 'custom');
  assert.equal(created.body.product.custom, true);

  const official = await request(app).put('/proposals/catalog/products/p3').set(auth).send({
    source: 'official',
    product: { id: 'p3', ...product, name: 'TopSolid Design Pro revisado', unitValueUsd: 9900 }
  });
  assert.equal(official.status, 200);
  assert.equal(official.body.product.id, 'p3');

  const listed = await request(app).get('/proposals/catalog/products').set(auth);
  assert.equal(listed.body.items.length, 2);

  const archived = await request(app)
    .delete('/proposals/catalog/products/p3')
    .set(auth)
    .send({ source: 'official', product: official.body.product });
  assert.equal(archived.body.archived, true);
  assert.equal((db.prepare(`select count(*) as count from proposal_catalog_product where product_id = 'p3'`)
    .get() as { count: number }).count, 1);
  cleanupDbFiles(dbPath);
});
```

No teste `isolates proposals by organization`, criar um registro com o primeiro
usuário e afirmar que `GET /proposals/catalog/products` da segunda organização
retorna `items: []` e que seu `PUT` no mesmo `product_id` cria uma sobreposição
separada.

- [ ] **Step 2: Rodar os testes e confirmar 404/falha**

Run: `npm --workspace apps/backend exec -- tsx --test --test-name-pattern="catalog products|isolates proposals" src/proposals/proposals.test.ts`

Expected: FAIL porque as rotas não estão registradas.

- [ ] **Step 3: Criar contratos e serialização em `catalogProductRoutes.ts`**

Usar estes contratos públicos no arquivo novo:

```ts
import type { Express, Response } from 'express';
import { z } from 'zod';
import { db, uuid } from '../db.js';
import { readInternalAuthContext, requireInternalAuth } from '../internalAuth.js';

const catalogMetadataSchema = z.object({
  family: z.string().min(1).max(160),
  subfamily: z.string().min(1).max(160),
  folder: z.string().max(240),
  reviewStatus: z.enum(['', 'REVISAR']),
  isPrimary: z.boolean()
}).strict();

const catalogProductSchema = z.object({
  id: z.string().min(1).max(120),
  code: z.string().max(120),
  name: z.string().trim().min(1).max(300),
  unitValueUsd: z.number().finite().nonnegative(),
  defaultQuantity: z.number().int().positive(),
  description: z.string().max(20_000),
  custom: z.boolean().optional(),
  catalog: catalogMetadataSchema
}).strict();

const productWriteSchema = catalogProductSchema.omit({ id: true, custom: true });
const overrideWriteSchema = z.object({
  source: z.enum(['official', 'custom']),
  product: catalogProductSchema
}).strict();

const archiveWriteSchema = z.object({
  source: z.enum(['official', 'custom']),
  product: catalogProductSchema
}).strict();

export type CatalogProductRow = {
  id: string; organization_id: string; product_id: string;
  source: 'official' | 'custom'; product_json: string | null; is_archived: number;
  created_by: string; updated_by: string; created_at: string; updated_at: string;
};

function serialize(row: CatalogProductRow) {
  return {
    id: row.product_id,
    source: row.source,
    archived: row.is_archived === 1,
    product: row.product_json ? JSON.parse(row.product_json) as unknown : null,
    updatedAt: row.updated_at
  };
}

type CatalogContext = { organizationId: string; userId: string };

function requireCatalogContext(res: Response): CatalogContext | null {
  const auth = readInternalAuthContext(res);
  if (!auth?.organization_id) return null;
  return { organizationId: auth.organization_id, userId: auth.internal_user_id };
}

function upsertRecord(
  context: CatalogContext,
  productId: string,
  source: 'official' | 'custom',
  product: unknown,
  archived: boolean
): CatalogProductRow {
  const now = new Date().toISOString();
  db.prepare(`
    insert into proposal_catalog_product (
      id, organization_id, product_id, source, product_json, is_archived,
      created_by, updated_by, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(organization_id, product_id) do update set
      source = excluded.source,
      product_json = excluded.product_json,
      is_archived = excluded.is_archived,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(
    uuid('proposal-catalog-product'), context.organizationId, productId, source,
    JSON.stringify(product), archived ? 1 : 0,
    context.userId, context.userId, now, now
  );
  return db.prepare(`
    select * from proposal_catalog_product
    where organization_id = ? and product_id = ?
  `).get(context.organizationId, productId) as CatalogProductRow;
}
```

O `on conflict` atualiza `source`, `product_json`, `is_archived`, `updated_by` e
`updated_at`, preservando autoria e criação.

- [ ] **Step 4: Registrar as quatro rotas antes de `/proposals/:id`**

Implementar em `registerProposalCatalogProductRoutes(app)`:

```ts
app.get('/proposals/catalog/products', requireInternalAuth, (_req, res) => {
  const context = requireCatalogContext(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const rows = db.prepare(`select * from proposal_catalog_product where organization_id = ? order by updated_at`)
    .all(context.organizationId) as CatalogProductRow[];
  return res.json({ items: rows.map(serialize) });
});

app.post('/proposals/catalog/products', requireInternalAuth, (req, res) => {
  const context = requireCatalogContext(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const parsed = productWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const productId = uuid('proposal-product');
  const row = upsertRecord(context, productId, 'custom', {
    id: productId, ...parsed.data, custom: true
  }, false);
  return res.status(201).json(serialize(row));
});

app.put('/proposals/catalog/products/:productId', requireInternalAuth, (req, res) => {
  const context = requireCatalogContext(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const parsed = overrideWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.product.id !== req.params.productId) {
    return res.status(400).json({ message: 'O identificador do produto não confere.' });
  }
  const product = { ...parsed.data.product, custom: parsed.data.source === 'custom' };
  return res.json(serialize(upsertRecord(context, req.params.productId, parsed.data.source, product, false)));
});

app.delete('/proposals/catalog/products/:productId', requireInternalAuth, (req, res) => {
  const context = requireCatalogContext(res);
  if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
  const parsed = archiveWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  if (parsed.data.product.id !== req.params.productId) {
    return res.status(400).json({ message: 'O identificador do produto não confere.' });
  }
  const product = { ...parsed.data.product, custom: parsed.data.source === 'custom' };
  return res.json(serialize(upsertRecord(context, req.params.productId, parsed.data.source, product, true)));
});
```

Regras exatas:

- `GET` seleciona apenas `organization_id = ?` e retorna `{ items: rows.map(serialize) }`;
- `POST` valida `productWriteSchema`, gera `uuid('proposal-product')`, força
  `custom: true`, grava `source = 'custom'` e retorna 201;
- `PUT` valida `overrideWriteSchema`, confere o ID da URL, força `custom` conforme a
  origem, grava `is_archived = 0` e retorna o registro serializado;
- `DELETE` valida `archiveWriteSchema`, exige que o ID do corpo seja igual ao da
  URL, grava a cópia completa com `is_archived = 1` e retorna `{ ...record,
  archived: true }`;
- todas as operações obtêm `organization_id` e `internal_user_id` de
  `readInternalAuthContext(res)` e nunca aceitam organização do cliente.

Importar e chamar o registrador no início de `registerProposalRoutes`, antes da
rota dinâmica `/proposals/:id`:

```ts
import { registerProposalCatalogProductRoutes } from './catalogProductRoutes.js';

export function registerProposalRoutes(app: Express) {
  registerProposalCatalogProductRoutes(app);
  // rotas existentes de propostas e serviços
}
```

- [ ] **Step 5: Rodar backend focado e build**

Run: `npm --workspace apps/backend exec -- tsx --test src/proposals/proposals.test.ts`

Expected: todos os testes de propostas passam.

Run: `npm --workspace apps/backend run build`

Expected: TypeScript termina sem erros.

- [ ] **Step 6: Commitar a API**

```bash
git add apps/backend/src/proposals/catalogProductRoutes.ts apps/backend/src/proposals/routes.ts apps/backend/src/proposals/proposals.test.ts
git commit -m "feat: add shared software catalog API"
```

## Task 3: Adicionar contratos da API no frontend

**Files:**
- Modify: `apps/frontend/src/proposals/proposalData.ts:11-16`
- Modify: `apps/frontend/src/services/api.ts:1-110,978-1010`
- Test: `apps/frontend/src/services/api.test.ts:48-91`

- [ ] **Step 1: Escrever o teste dos novos métodos**

Adicionar ao bloco `proposal api`:

```ts
test('uses shared product catalog endpoints', async () => {
  const record = {
    id: 'p3', source: 'official', archived: false, updatedAt: '2026-08-21T12:00:00.000Z',
    product: { id: 'p3', code: '0030', name: 'Design Pro', unitValueUsd: 9000,
      defaultQuantity: 1, description: '', catalog: {
        family: 'Design', subfamily: "TopSolid'Design", folder: 'Pacotes Design',
        reviewStatus: '', isPrimary: true
      } }
  } as const;
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [record] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...record, archived: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await api.proposalCatalogProducts();
  await api.updateProposalCatalogProduct('p3', { source: 'official', product: record.product });
  await api.archiveProposalCatalogProduct('p3', { source: 'official', product: record.product });

  expect(fetchMock.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
    ['http://localhost:4000/proposals/catalog/products', undefined],
    ['http://localhost:4000/proposals/catalog/products/p3', 'PUT'],
    ['http://localhost:4000/proposals/catalog/products/p3', 'DELETE']
  ]);
});
```

- [ ] **Step 2: Rodar e confirmar a falha de tipos/métodos**

Run: `npm --workspace apps/frontend test -- src/services/api.test.ts`

Expected: FAIL porque os métodos ainda não existem.

- [ ] **Step 3: Estender tipos e cliente HTTP**

Adicionar `isPrimary?: boolean` a `ProposalProductCatalogMetadata` para manter o
arquivo gerado compatível, e estes tipos
em `api.ts`:

```ts
import type { ProposalProduct, ProposalProductCatalogMetadata, ProposalService } from '../proposals/proposalData';

export type ProposalCatalogProductSource = 'official' | 'custom';
export type ProposalCatalogProduct = Omit<ProposalProduct, 'catalog'> & {
  catalog: ProposalProductCatalogMetadata & { isPrimary: boolean };
};
export type ProposalCatalogProductRecord = {
  id: string;
  source: ProposalCatalogProductSource;
  archived: boolean;
  product: ProposalCatalogProduct | null;
  updatedAt: string;
};
export type ProposalCatalogProductWrite = {
  source: ProposalCatalogProductSource;
  product: ProposalCatalogProduct;
};
export type ProposalCatalogProductCreate = Omit<ProposalCatalogProduct, 'id' | 'custom'>;
```

Adicionar ao objeto `api`:

```ts
proposalCatalogProducts: () =>
  req<{ items: ProposalCatalogProductRecord[] }>('/proposals/catalog/products'),
createProposalCatalogProduct: (product: ProposalCatalogProductCreate) =>
  req<ProposalCatalogProductRecord>('/proposals/catalog/products', {
    method: 'POST', body: JSON.stringify(product)
  }),
updateProposalCatalogProduct: (id: string, payload: ProposalCatalogProductWrite) =>
  req<ProposalCatalogProductRecord>(`/proposals/catalog/products/${id}`, {
    method: 'PUT', body: JSON.stringify(payload)
  }),
archiveProposalCatalogProduct: (id: string, payload: ProposalCatalogProductWrite) =>
  req<ProposalCatalogProductRecord>(`/proposals/catalog/products/${id}`, {
    method: 'DELETE', body: JSON.stringify(payload)
  }),
```

- [ ] **Step 4: Rodar teste e build do frontend**

Run: `npm --workspace apps/frontend test -- src/services/api.test.ts && npm --workspace apps/frontend run build`

Expected: teste e build passam.

- [ ] **Step 5: Commitar contratos frontend**

```bash
git add apps/frontend/src/proposals/proposalData.ts apps/frontend/src/services/api.ts apps/frontend/src/services/api.test.ts
git commit -m "feat: add frontend shared catalog contracts"
```

## Task 4: Resolver classificação, sobreposições e arquivamentos

**Files:**
- Create: `apps/frontend/src/proposals/topsolidCatalogClassification.ts`
- Create: `apps/frontend/src/proposals/topsolidCatalogClassification.test.ts`
- Create: `apps/frontend/src/proposals/sharedSoftwareCatalog.ts`
- Create: `apps/frontend/src/proposals/sharedSoftwareCatalog.test.ts`

- [ ] **Step 1: Escrever testes das regras puras**

Cobrir os quatro produtos de Design, famílias sem inferência e precedência:

```ts
test('marks the four approved Design packages as primary', () => {
  const classified = applyTopsolidPrimaryClassification(TOPSOLID_CATALOG_PRODUCTS);
  const designPrimary = classified.filter((item) => item.catalog.family === 'Design' && item.catalog.isPrimary);
  expect(designPrimary.map((item) => item.id)).toEqual(expect.arrayContaining([
    'topsolid-d56ae13cb542', 'topsolid-f26302408a1b', 'topsolid-656d52c2e9e3', 'p3'
  ]));
  expect(designPrimary).toHaveLength(4);
});

test('applies shared overrides and keeps archived products only in allProducts', () => {
  const result = resolveSharedSoftwareCatalog([official], [], [{
    id: official.id, source: 'official', archived: true,
    product: { ...official, name: 'Nome preservado' }, updatedAt: '2026-08-21T12:00:00.000Z'
  }]);
  expect(result.activeProducts).toEqual([]);
  expect(result.allProducts[0].name).toBe('Nome preservado');
});
```

- [ ] **Step 2: Rodar e confirmar módulos ausentes**

Run: `npm --workspace apps/frontend test -- src/proposals/topsolidCatalogClassification.test.ts src/proposals/sharedSoftwareCatalog.test.ts`

Expected: FAIL porque os módulos não existem.

- [ ] **Step 3: Criar a classificação explícita**

Usar uma lista `ReadonlySet<string>`; não usar regex de nome:

```ts
const PRIMARY_PRODUCT_IDS = new Set([
  'topsolid-d56ae13cb542', 'topsolid-f26302408a1b', 'topsolid-656d52c2e9e3', 'p3',
  'p8',
  'topsolid-80cc488ed480',
  'topsolid-6383b3ffa2c0',
  'topsolid-a6d9b1bb1e4f', 'topsolid-3aea329bf720', 'topsolid-2a03618e88ff',
  'topsolid-dd72c04603a3', 'topsolid-ae3e904b9153', 'topsolid-d640ad25391a',
  'topsolid-1f8a27ab3395', 'topsolid-716515e70b77',
  'topsolid-aa0a8bb284ce', 'topsolid-6f6750dfc4ac'
]);

export function applyTopsolidPrimaryClassification(products: SoftwareCatalogProduct[]): SoftwareCatalogProduct[] {
  return products.map((product) => ({
    ...product,
    catalog: { ...product.catalog, isPrimary: PRIMARY_PRODUCT_IDS.has(product.id) }
  }));
}
```

Os conjuntos representam: quatro Design, Mold 1310, Progress 1340+1362,
Electrode 1320, pacotes CAM Essential/Standard/Pro, dois Wire, Inspection e
PartCosting. Interfaces e Pós-processadores exibem a aba vazia até haver uma
classificação explícita, em vez de classificar dezenas de itens por heurística.

- [ ] **Step 4: Criar o resolvedor de registros compartilhados**

Implementar este contrato em `sharedSoftwareCatalog.ts`:

```ts
export type ResolvedSoftwareCatalog = {
  allProducts: ProposalProduct[];
  activeProducts: ProposalProduct[];
  archivedIds: ReadonlySet<string>;
};

export function resolveSharedSoftwareCatalog(
  official: ProposalProduct[],
  legacyBrowserProducts: ProposalProduct[],
  records: ProposalCatalogProductRecord[]
): ResolvedSoftwareCatalog {
  const products = new Map(official.map((item) => [item.id, item]));
  for (const legacyProduct of legacyBrowserProducts) {
    if (!products.has(legacyProduct.id)) products.set(legacyProduct.id, legacyProduct);
  }
  const archivedIds = new Set<string>();
  for (const record of records) {
    if (record.product) products.set(record.id, record.product);
    if (record.archived) archivedIds.add(record.id);
    else archivedIds.delete(record.id);
  }
  const allProducts = [...products.values()];
  return {
    allProducts,
    activeProducts: allProducts.filter((item) => !archivedIds.has(item.id)),
    archivedIds
  };
}
```

- [ ] **Step 5: Rodar os testes puros**

Run: `npm --workspace apps/frontend test -- src/proposals/topsolidCatalogClassification.test.ts src/proposals/sharedSoftwareCatalog.test.ts`

Expected: todos passam.

- [ ] **Step 6: Commitar classificação e resolução**

```bash
git add apps/frontend/src/proposals/topsolidCatalogClassification.ts apps/frontend/src/proposals/topsolidCatalogClassification.test.ts apps/frontend/src/proposals/sharedSoftwareCatalog.ts apps/frontend/src/proposals/sharedSoftwareCatalog.test.ts
git commit -m "feat: classify and resolve shared software catalog"
```

## Task 5: Corrigir busca, relevância e grupos hierárquicos

**Files:**
- Modify: `apps/frontend/src/proposals/softwareCatalog.ts`
- Test: `apps/frontend/src/proposals/softwareCatalog.test.ts`

- [ ] **Step 1: Escrever os testes aprovados de busca e hierarquia**

Adicionar casos com apóstrofo reto e tipográfico, tokens e pseudo-subfamília:

```ts
test.each(['TopSolid Design', 'TopSolid Design Standard'])('matches punctuation-insensitive tokens: %s', (query) => {
  const result = querySoftwareCatalog(designEntries, {
    query, family: 'CAM', subfamily: 'Milling', limit: 50
  });
  expect(result.items.map((item) => item.name)).toContain("TopSolid’Design Standard 7 - Módulo - 0020");
});

test('ranks name matches before description-only matches', () => {
  const result = querySoftwareCatalog(rankingEntries, {
    query: 'design', family: 'Todos', subfamily: 'Todos', limit: 50
  });
  expect(result.items.map((item) => item.id)).toEqual(['name-match', 'description-match']);
});

test('puts Produtos principais first for every family and groups global results', () => {
  const tree = buildCatalogTree(designEntries);
  expect(tree[0].subfamilies[0].name).toBe('Produtos principais');
  const groups = groupSoftwareCatalogResults(querySoftwareCatalog(designEntries, {
    query: 'design', family: 'Todos', subfamily: 'Todos', limit: 50
  }).items);
  expect(groups[0]).toEqual(expect.objectContaining({ family: 'Design', subfamily: 'Produtos principais' }));
});
```

- [ ] **Step 2: Rodar e confirmar as falhas atuais**

Run: `npm --workspace apps/frontend test -- src/proposals/softwareCatalog.test.ts`

Expected: FAIL para `TopSolid Design`, relevância, grupo e ordem de subfamília.

- [ ] **Step 3: Implementar normalização e score determinístico**

Substituir a normalização literal e ordenar buscas não vazias:

```ts
export const PRIMARY_SUBFAMILY = 'Produtos principais';

export function normalizeCatalogText(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function relevance(entry: SoftwareCatalogEntry, query: string, tokens: string[]): number {
  const code = normalizeCatalogText(entry.code);
  const name = normalizeCatalogText(entry.name);
  if (code === query) return 500;
  if (name === query) return 400;
  if (name.startsWith(query)) return 300;
  if (tokens.every((token) => name.includes(token))) return 200;
  return 100;
}
```

Em `toEntry`, calcular o caminho apresentado como:

```ts
const shownSubfamily = metadata.isPrimary ? PRIMARY_SUBFAMILY : metadata.subfamily;
const path: [string, string, string] = [metadata.family, shownSubfamily, metadata.folder];
const searchText = normalizeCatalogText([
  product.code, product.name, product.description,
  metadata.family, metadata.subfamily, metadata.folder, shownSubfamily
].join(' '));
```

Em `querySoftwareCatalog`, uma busca corresponde quando `tokens.every(token =>
entry.searchText.includes(token))`; ordenar por score decrescente, produto
principal antes de comum em empate e `name.localeCompare('pt-BR')` no último
desempate.

- [ ] **Step 4: Garantir a pseudo-subfamília e criar agrupamento**

Ao iniciar cada família em `buildCatalogTree`, garantir um mapa vazio para
`PRIMARY_SUBFAMILY`. Em `compareSubfamilies`, retornar `-1` quando somente o lado
esquerdo for `PRIMARY_SUBFAMILY` e `1` quando somente o direito for.

Exportar:

```ts
export type SoftwareCatalogResultGroup = {
  family: string;
  subfamily: string;
  items: SoftwareCatalogEntry[];
};

export function groupSoftwareCatalogResults(items: SoftwareCatalogEntry[]): SoftwareCatalogResultGroup[] {
  const groups = new Map<string, SoftwareCatalogResultGroup>();
  for (const item of items) {
    const [family, subfamily] = item.path;
    const key = `${family}\u0000${subfamily}`;
    const group = groups.get(key) ?? { family, subfamily, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) =>
    compareFamilies(left.family, right.family)
      || compareSubfamilies(left.family, left.subfamily, right.subfamily)
  );
}
```

- [ ] **Step 5: Rodar testes do modelo**

Run: `npm --workspace apps/frontend test -- src/proposals/softwareCatalog.test.ts src/proposals/topsolidCatalogClassification.test.ts`

Expected: todos passam, incluindo `design`, `TopSolid Design Standard`, ordem e
paginação.

- [ ] **Step 6: Commitar busca e hierarquia**

```bash
git add apps/frontend/src/proposals/softwareCatalog.ts apps/frontend/src/proposals/softwareCatalog.test.ts
git commit -m "feat: improve catalog search and hierarchy"
```

## Task 6: Criar o modal de produto

**Files:**
- Create: `apps/frontend/src/proposals/SoftwareCatalogProductModal.tsx`
- Create: `apps/frontend/src/proposals/SoftwareCatalogProductModal.test.tsx`

- [ ] **Step 1: Escrever testes de criar, editar, arquivar e falhar**

Os testes devem usar `userEvent` e verificar:

```ts
const editableEntry = mergeSoftwareCatalog([{
  id: 'p3', code: '0030', name: 'Design Pro', unitValueUsd: 9000,
  defaultQuantity: 1, description: '',
  catalog: { family: 'Design', subfamily: "TopSolid'Design", folder: 'Pacotes Design', reviewStatus: '', isPrimary: true }
}], [], [])[0];

test('submits every editable product field', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<SoftwareCatalogProductModal product={null} busy={false} error="" onClose={vi.fn()} onSave={onSave} onArchive={vi.fn()} />);
  await user.type(screen.getByLabelText('Nome'), 'Produto novo');
  await user.type(screen.getByLabelText('Código'), 'N-1');
  await user.type(screen.getByLabelText('Descrição'), 'Informações');
  await user.selectOptions(screen.getByLabelText('Família'), 'Design');
  await user.type(screen.getByLabelText('Subfamília'), 'Extensões');
  await user.type(screen.getByLabelText('Valor USD'), '1250');
  await user.click(screen.getByRole('checkbox', { name: 'Produto principal' }));
  await user.click(screen.getByRole('button', { name: 'Criar produto' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Produto novo', code: 'N-1', unitValueUsd: 1250,
    catalog: expect.objectContaining({ family: 'Design', subfamily: 'Extensões', isPrimary: true })
  }));
});

test('requires a second confirmation before archiving', async () => {
  const user = userEvent.setup();
  const onArchive = vi.fn().mockResolvedValue(undefined);
  render(<SoftwareCatalogProductModal product={editableEntry} busy={false} error="" onClose={vi.fn()} onSave={vi.fn()} onArchive={onArchive} />);
  await user.click(screen.getByRole('button', { name: 'Excluir produto' }));
  expect(screen.getByText(/continuará nas propostas antigas/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ocultar produto' }));
  expect(onArchive).toHaveBeenCalledWith(editableEntry);
});
```

Adicionar estes dois testes para erro e estado ocupado:

```ts
test('keeps typed values when the parent reports a save error', async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <SoftwareCatalogProductModal product={null} busy={false} error="" onClose={vi.fn()} onSave={vi.fn()} onArchive={vi.fn()} />
  );
  await user.type(screen.getByLabelText('Nome'), 'Não perder este nome');
  rerender(<SoftwareCatalogProductModal product={null} busy={false} error="Falha ao salvar" onClose={vi.fn()} onSave={vi.fn()} onArchive={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
  expect(screen.getByLabelText('Nome')).toHaveValue('Não perder este nome');
});

test('disables modal actions while saving', () => {
  render(<SoftwareCatalogProductModal product={editableEntry} busy error="" onClose={vi.fn()} onSave={vi.fn()} onArchive={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Excluir produto' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Fechar editor de produto' })).toBeDisabled();
});
```

- [ ] **Step 2: Rodar e confirmar arquivo ausente**

Run: `npm --workspace apps/frontend test -- src/proposals/SoftwareCatalogProductModal.test.tsx`

Expected: FAIL porque o componente não existe.

- [ ] **Step 3: Implementar estado e validação do modal**

Usar este contrato:

```ts
import type { ProposalCatalogProductCreate } from '../services/api';

type Props = {
  product: SoftwareCatalogEntry | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (product: ProposalCatalogProductCreate) => Promise<void>;
  onArchive: (product: SoftwareCatalogEntry) => Promise<void>;
};
```

Inicializar o draft do produto ou com `{ code: '', name: '', unitValueUsd: '',
description: '', family: 'Design', subfamily: '', folder: '', isPrimary: false }`.
Ao editar um produto legado sem `catalog`, usar `product.path` para família,
subfamília e pasta e assumir `isPrimary: false`.
Converter vírgula decimal para ponto e impedir submit quando nome, família ou
subfamília estiverem vazios, ou quando preço não for finito/não negativo.
Preservar `reviewStatus` existente e usar `''` para novos produtos.

O JSX raiz deve ser:

```tsx
<div className="proposal-catalog-modal-backdrop" role="presentation">
  <section role="dialog" aria-modal="true" aria-labelledby="catalog-product-modal-title" className="proposal-catalog-modal">
    <header>
      <div><span>Catálogo compartilhado</span><h2 id="catalog-product-modal-title">{product ? 'Editar produto' : 'Novo produto'}</h2></div>
      <button type="button" aria-label="Fechar editor de produto" disabled={busy} onClick={onClose}>×</button>
    </header>
    <form onSubmit={submit}>
      <label className="is-wide">Nome<input aria-label="Nome" value={draft.name} onChange={(event) => update('name', event.target.value)} /></label>
      <label>Código<input aria-label="Código" value={draft.code} onChange={(event) => update('code', event.target.value)} /></label>
      <label>Valor USD<input aria-label="Valor USD" type="number" min="0" step="0.01" value={draft.unitValueUsd} onChange={(event) => update('unitValueUsd', event.target.value)} /></label>
      <label>Família<select aria-label="Família" value={draft.family} onChange={(event) => update('family', event.target.value)}>{SOFTWARE_CATALOG_FAMILY_ORDER.filter((item) => item !== 'Personalizados').map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Subfamília<input aria-label="Subfamília" value={draft.subfamily} onChange={(event) => update('subfamily', event.target.value)} /></label>
      <label className="is-wide">Pasta<input aria-label="Pasta" value={draft.folder} onChange={(event) => update('folder', event.target.value)} /></label>
      <label className="is-wide">Descrição<textarea aria-label="Descrição" value={draft.description} onChange={(event) => update('description', event.target.value)} /></label>
      <label className="is-wide"><input type="checkbox" checked={draft.isPrimary} onChange={(event) => update('isPrimary', event.target.checked)} /> Produto principal</label>
      <footer className="is-wide">
        {product ? <button type="button" disabled={busy} onClick={() => setConfirmArchive(true)}>Excluir produto</button> : null}
        <button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" disabled={busy}>{product ? 'Salvar alterações' : 'Criar produto'}</button>
      </footer>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {confirmArchive && product ? (
      <div role="alertdialog" aria-label="Confirmar exclusão do produto">
        <p>O produto sairá do catálogo ativo, mas continuará nas propostas antigas.</p>
        <button type="button" disabled={busy} onClick={() => setConfirmArchive(false)}>Cancelar</button>
        <button type="button" disabled={busy} onClick={() => onArchive(product)}>Ocultar produto</button>
      </div>
    ) : null}
  </section>
</div>
```

Renderizar os sete controles descritos no desenho, com `select` de família
usando `SOFTWARE_CATALOG_FAMILY_ORDER` sem `Personalizados`; o rodapé contém
**Excluir produto** somente em edição, **Cancelar** e **Criar produto/Salvar
alterações**.

- [ ] **Step 4: Implementar foco e teclado**

Focar o campo Nome ao montar. Fechar com Escape somente quando não estiver
ocupado e não houver confirmação destrutiva; na confirmação, Escape volta ao
formulário. Restaurar o foco ficará a cargo do explorador.

- [ ] **Step 5: Rodar os testes do modal**

Run: `npm --workspace apps/frontend test -- src/proposals/SoftwareCatalogProductModal.test.tsx`

Expected: todos passam.

- [ ] **Step 6: Commitar o modal**

```bash
git add apps/frontend/src/proposals/SoftwareCatalogProductModal.tsx apps/frontend/src/proposals/SoftwareCatalogProductModal.test.tsx
git commit -m "feat: add shared catalog product editor"
```

## Task 7: Integrar grupos e ações ao explorador

**Files:**
- Modify: `apps/frontend/src/proposals/SoftwareCatalogExplorer.tsx`
- Test: `apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx`

- [ ] **Step 1: Escrever testes de grupos e comandos**

Adicionar callbacks `onNewProduct` e `onEditProduct` aos props de teste e cobrir:

```ts
const user = userEvent.setup();
await user.type(screen.getByRole('searchbox', { name: 'Buscar software' }), 'TopSolid Design Standard');
expect(screen.getByRole('heading', { name: 'Design' })).toBeInTheDocument();
expect(screen.getByRole('heading', { name: 'Produtos principais' })).toBeInTheDocument();
expect(screen.getByText("TopSolid’Design Standard 7 - Módulo - 0020")).toBeInTheDocument();

await user.click(screen.getByRole('button', { name: 'Novo produto' }));
expect(onNewProduct).toHaveBeenCalledOnce();
await user.click(screen.getByRole('button', { name: /Editar TopSolid’Design Standard/ }));
expect(onEditProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 'topsolid-656d52c2e9e3' }));
```

Verificar também que todas as famílias exibem **Produtos principais** logo após
**Todos**, inclusive quando sua contagem é zero.

- [ ] **Step 2: Rodar e confirmar falhas de interface**

Run: `npm --workspace apps/frontend test -- src/proposals/SoftwareCatalogExplorer.test.tsx`

Expected: FAIL porque busca agrupada e ações ainda não existem.

- [ ] **Step 3: Estender props e cabeçalho**

Adicionar:

```ts
type SoftwareCatalogExplorerProps = {
  products: SoftwareCatalogEntry[];
  selectedIds: ReadonlySet<string>;
  softwareSubtotalUsd: number;
  adminDisabled: boolean;
  onToggle: (id: string) => void;
  onNewProduct: () => void;
  onEditProduct: (product: SoftwareCatalogEntry) => void;
  onDone: () => void;
};
```

No cabeçalho, inserir `<button aria-label="Novo produto">+ Novo produto</button>`
e desabilitá-lo quando `adminDisabled` for verdadeiro.

- [ ] **Step 4: Renderizar grupos somente durante busca**

Calcular `const groups = useMemo(() => groupSoftwareCatalogResults(result.items),
[result.items])`. Quando `query` não estiver vazio, renderizar cada grupo com
`<section className="proposal-catalog-result-group">`, heading de família e
heading de subfamília. Sem busca, manter a lista atual filtrada.

Extrair o card para uma função local `renderProduct(product)` e acrescentar:

```tsx
<button
  type="button"
  className="proposal-catalog-product-menu"
  aria-label={`Editar ${product.name}`}
  disabled={adminDisabled}
  onClick={() => onEditProduct(product)}
>⋯</button>
```

O botão de edição não deve disparar `onToggle`.

- [ ] **Step 5: Rodar testes do explorador e modelo**

Run: `npm --workspace apps/frontend test -- src/proposals/SoftwareCatalogExplorer.test.tsx src/proposals/softwareCatalog.test.ts`

Expected: todos passam.

- [ ] **Step 6: Commitar o explorador**

```bash
git add apps/frontend/src/proposals/SoftwareCatalogExplorer.tsx apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx
git commit -m "feat: group catalog search and expose product actions"
```

## Task 8: Integrar o catálogo compartilhado e congelar itens selecionados

**Files:**
- Modify: `apps/frontend/src/pages/ProposalsPage.tsx`
- Modify: `apps/frontend/src/pages/ProposalsPage.test.tsx`

- [ ] **Step 1: Atualizar mock e escrever testes de integração**

Importar `ProposalCatalogProductRecord`, adicionar ao mock de `api` os quatro
métodos de produto e configurar no `beforeEach`:

```ts
vi.mocked(api.proposalCatalogProducts).mockResolvedValue({ items: [] });
vi.mocked(api.createProposalCatalogProduct).mockImplementation(async (product) => ({
  id: 'proposal-product-1', source: 'custom', archived: false,
  product: { id: 'proposal-product-1', ...product, custom: true },
  updatedAt: '2026-08-21T12:00:00.000Z'
}));
vi.mocked(api.updateProposalCatalogProduct).mockImplementation(async (id, payload) => ({
  id, source: payload.source, archived: false, product: payload.product,
  updatedAt: '2026-08-21T12:05:00.000Z'
}));
vi.mocked(api.archiveProposalCatalogProduct).mockImplementation(async (id, payload) => ({
  id, source: payload.source, archived: true, product: payload.product,
  updatedAt: '2026-08-21T12:10:00.000Z'
}));
```

Criar os seguintes fixtures e testes:

```ts
const createdRecord: ProposalCatalogProductRecord = {
  id: 'proposal-product-1', source: 'custom', archived: false,
  updatedAt: '2026-08-21T12:00:00.000Z',
  product: {
    id: 'proposal-product-1', code: 'CUSTOM-1', name: 'Produto compartilhado',
    unitValueUsd: 1200, defaultQuantity: 1, description: '', custom: true,
    catalog: { family: 'Design', subfamily: 'Extensões', folder: '', reviewStatus: '', isPrimary: false }
  }
};
const updatedRecord: ProposalCatalogProductRecord = {
  ...createdRecord,
  product: { ...createdRecord.product!, unitValueUsd: 1500 }
};
const designOverrideRecord: ProposalCatalogProductRecord = {
  id: 'p3', source: 'official', archived: false,
  updatedAt: '2026-08-21T12:05:00.000Z',
  product: {
    id: 'p3', code: '0030', name: 'Design Pro global revisado',
    unitValueUsd: 19900, defaultQuantity: 1, description: 'Descrição global', custom: false,
    catalog: { family: 'Design', subfamily: "TopSolid'Design", folder: 'Pacotes Design', reviewStatus: '', isPrimary: true }
  }
};

test('creates and edits a product for the shared catalog', async () => {
  vi.mocked(api.createProposalCatalogProduct).mockResolvedValue(createdRecord);
  vi.mocked(api.updateProposalCatalogProduct).mockResolvedValue(updatedRecord);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  await user.click(screen.getByRole('button', { name: 'Novo produto' }));
  await user.type(screen.getByLabelText('Nome'), 'Produto compartilhado');
  await user.type(screen.getByLabelText('Código'), 'CUSTOM-1');
  await user.type(screen.getByLabelText('Subfamília'), 'Extensões');
  await user.type(screen.getByLabelText('Valor USD'), '1200');
  await user.click(screen.getByRole('button', { name: 'Criar produto' }));
  await waitFor(() => expect(api.createProposalCatalogProduct).toHaveBeenCalledOnce());
  expect(screen.getByText(createdRecord.product!.name)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: `Editar ${createdRecord.product!.name}` }));
  await user.clear(screen.getByLabelText('Valor USD'));
  await user.type(screen.getByLabelText('Valor USD'), '1500');
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(api.updateProposalCatalogProduct).toHaveBeenCalledOnce());
});

test('keeps a selected draft snapshot after a global catalog edit', async () => {
  vi.mocked(api.updateProposalCatalogProduct).mockResolvedValue(designOverrideRecord);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await addSoftwareFromCatalog(user, '0030', /Adicionar TopSolid’Design Pro/);
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  await user.click(screen.getByRole('button', { name: /Editar TopSolid’Design Pro/ }));
  await user.clear(screen.getByLabelText('Nome'));
  await user.type(screen.getByLabelText('Nome'), 'Design Pro global revisado');
  await user.clear(screen.getByLabelText('Valor USD'));
  await user.type(screen.getByLabelText('Valor USD'), '19900');
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await user.click(screen.getByRole('button', { name: 'Concluir seleção' }));
  expect(within(screen.getByRole('region', { name: 'Prévia da proposta' })))
    .toHaveTextContent('TopSolid’Design Pro 7 - Módulo - 0030');
  expect(within(screen.getByRole('region', { name: 'Prévia da proposta' })))
    .not.toHaveTextContent('Design Pro global revisado');
});
```

Adicionar casos completos com estes resultados observáveis:

```ts
test('hides an archived product from search but keeps its selected snapshot', async () => {
  vi.mocked(api.proposalCatalogProducts).mockResolvedValue({ items: [createdRecord] });
  vi.mocked(api.archiveProposalCatalogProduct).mockResolvedValue({ ...createdRecord, archived: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  await user.type(screen.getByRole('searchbox', { name: 'Buscar software' }), 'CUSTOM-1');
  await user.click(screen.getByRole('button', { name: `Adicionar ${createdRecord.product!.name}` }));
  await user.click(screen.getByRole('button', { name: `Editar ${createdRecord.product!.name}` }));
  await user.click(screen.getByRole('button', { name: 'Excluir produto' }));
  await user.click(screen.getByRole('button', { name: 'Ocultar produto' }));
  expect(screen.queryByText(createdRecord.product!.name)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Concluir seleção' }));
  expect(within(screen.getByRole('region', { name: 'Prévia da proposta' })))
    .toHaveTextContent(createdRecord.product!.name);
});

test('keeps the catalog modal values when update fails', async () => {
  vi.mocked(api.proposalCatalogProducts).mockResolvedValue({ items: [createdRecord] });
  vi.mocked(api.updateProposalCatalogProduct).mockRejectedValue(new Error('Falha ao salvar produto.'));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  await user.click(screen.getByRole('button', { name: `Editar ${createdRecord.product!.name}` }));
  await user.clear(screen.getByLabelText('Nome'));
  await user.type(screen.getByLabelText('Nome'), 'Nome que deve permanecer');
  await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao salvar produto.');
  expect(screen.getByLabelText('Nome')).toHaveValue('Nome que deve permanecer');
});

test('loads a shared override before showing catalog values', async () => {
  vi.mocked(api.proposalCatalogProducts).mockResolvedValue({ items: [designOverrideRecord] });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ProposalsPage />);
  await user.click(screen.getByRole('button', { name: 'Adicionar software do catálogo' }));
  expect(await screen.findByText(designOverrideRecord.product!.name)).toBeInTheDocument();
  expect(screen.getByText('US$ 19,900.00')).toBeInTheDocument();
});
```

Estender o teste existente `manually saves and reopens a proposal with a
generated catalog product`: após salvar, retornar da API uma sobreposição com
outro nome e preço antes de reabrir e manter as asserções no nome e preço do
snapshot salvo.

- [ ] **Step 2: Rodar e confirmar falhas**

Run: `npm --workspace apps/frontend test -- src/pages/ProposalsPage.test.tsx`

Expected: FAIL por falta dos métodos, modal e resolução de estado.

- [ ] **Step 3: Carregar e resolver o catálogo compartilhado**

Adicionar estados:

```ts
const [catalogProductRecords, setCatalogProductRecords] = useState<ProposalCatalogProductRecord[]>([]);
const [catalogProductsReady, setCatalogProductsReady] = useState(false);
const [catalogProductBusy, setCatalogProductBusy] = useState(false);
const [catalogProductError, setCatalogProductError] = useState('');
const [catalogProductModal, setCatalogProductModal] = useState<SoftwareCatalogEntry | null | 'new'>(null);
```

Incluir `api.proposalCatalogProducts()` no `Promise.allSettled` inicial. Uma
falha mantém a base oficial visível, adiciona a mensagem de carregamento aos
erros existentes e deixa `catalogProductsReady = false`; sucesso grava os
registros e marca `true`.

Calcular:

```ts
const classifiedOfficial = useMemo(
  () => applyTopsolidPrimaryClassification(PROPOSAL_PRODUCTS as SoftwareCatalogProduct[]), []
);
const resolvedCatalog = useMemo(
  () => resolveSharedSoftwareCatalog(classifiedOfficial, customProducts, catalogProductRecords),
  [classifiedOfficial, customProducts, catalogProductRecords]
);
```

Alterar `buildEditableProducts` para receber `catalogProducts` como primeiro
argumento em vez de ler `PROPOSAL_PRODUCTS` internamente. Usar
`resolvedCatalog.allProducts` para `products` e `resolvedCatalog.activeProducts`
para `catalogEntries`. Passar todos os produtos, inclusive arquivados, a
`restoreProposalDocument`.

Para montar `catalogEntries`, separar `resolvedCatalog.activeProducts` pelo
conjunto de IDs de `classifiedOfficial` e chamar:

```ts
mergeSoftwareCatalog(
  activeProducts.filter((item) => officialIds.has(item.id)) as SoftwareCatalogProduct[],
  activeProducts.filter((item) => !officialIds.has(item.id)),
  proposalCustomProducts
)
```

Assim, os cards oficiais mantêm `source = 'official'`, enquanto produtos
compartilhados, locais legados e exclusivos da proposta mantêm origem customizável.

Quando `catalogProductsReady` for verdadeiro, passar `{}` no lugar de
`productEdits` para impedir que edições antigas do `localStorage` sobreponham o
servidor. Usar `productEdits` somente como fallback quando a carga compartilhada
falhar. Registros compartilhados continuam vencendo produtos locais com o mesmo
ID dentro de `resolveSharedSoftwareCatalog`.

- [ ] **Step 4: Capturar snapshot ao selecionar e descartá-lo ao remover**

Substituir `toggleProductSelected` pela lógica:

```ts
function toggleProductSelected(id: string) {
  resetTargetDiscount();
  const product = products.find((item) => item.id === id);
  if (!product) return;
  if (selectedProductIds.has(id)) {
    setSelectedProductIds((previous) => {
      const next = new Set(previous); next.delete(id); return next;
    });
    setProposalProductEdits((edits) => {
      const copy = { ...edits }; delete copy[id]; return copy;
    });
    return;
  }
  setSelectedProductIds((previous) => new Set(previous).add(id));
  setProposalProductEdits((edits) => ({
    ...edits,
    [id]: {
      name: product.displayName, unitValueUsd: product.unitValueUsd,
      quantity: product.quantity, description: product.displayDescription,
      maintenanceEnabled: product.maintenanceEnabled,
      maintenancePercent: product.maintenancePercent,
      maintenanceYears: product.maintenanceYears
    }
  }));
}
```

Isso garante que alteração global posterior não modifica o rascunho. Remover e
adicionar novamente captura a versão atual.

- [ ] **Step 5: Implementar criar, editar e arquivar**

Criar três funções assíncronas. `createCatalogProduct` chama POST e acrescenta o
registro retornado. `saveCatalogProduct` chama PUT usando `source = 'official'`
somente quando o ID pertence a `classifiedOfficial`; demais origens usam
`custom`. `archiveCatalogProduct` chama DELETE com uma cópia completa do produto.

Normalizar qualquer entry antes de PUT/DELETE para satisfazer o contrato:

```ts
function catalogProductFromEntry(entry: SoftwareCatalogEntry): ProposalCatalogProduct {
  return {
    id: entry.id,
    code: entry.code,
    name: entry.name,
    unitValueUsd: entry.unitValueUsd,
    defaultQuantity: entry.defaultQuantity,
    description: entry.description,
    custom: !officialIds.has(entry.id),
    catalog: {
      family: entry.catalog?.family ?? entry.path[0],
      subfamily: entry.catalog?.subfamily ?? entry.path[1],
      folder: entry.catalog?.folder ?? entry.path[2],
      reviewStatus: entry.catalog?.reviewStatus ?? '',
      isPrimary: entry.catalog?.isPrimary ?? entry.path[1] === PRIMARY_SUBFAMILY
    }
  };
}
```

Todas devem:

- limpar erro antes da chamada;
- definir `catalogProductBusy` durante a requisição;
- substituir registros pelo `id` retornado, nunca montar uma resposta otimista;
- fechar modal apenas em sucesso;
- manter modal e draft em erro;
- mostrar status “Produto criado/atualizado/ocultado no catálogo
  compartilhado.”.

Renderizar `SoftwareCatalogProductModal` ao lado do explorador e passar ao
explorador `adminDisabled={!catalogProductsReady || catalogProductBusy}`.

Alterar `createCustomProduct(true)` para chamar `createCatalogProduct` e remover
a gravação nova em `localStorage`. Enviar a classificação explícita
`{ family: 'Personalizados', subfamily: 'Produtos personalizados', folder:
'Personalizados', reviewStatus: '', isPrimary: false }`. Manter
`createCustomProduct(false)` para item exclusivo da proposta. Dados locais
históricos continuam entrando pelo resolvedor até serem promovidos por uma
edição compartilhada.

Remover `saveProductAsDefault` e a seção **Padrão do catálogo** de
`ProductEditorPanel`; mover **Restaurar nesta proposta** para o bloco **Nesta
proposta**. Edições globais passam exclusivamente pelo modal compartilhado do
explorador, impedindo a criação de novos padrões somente no navegador.

- [ ] **Step 6: Rodar testes de página e documentos**

Run: `npm --workspace apps/frontend test -- src/pages/ProposalsPage.test.tsx src/proposals/proposalDocument.test.ts`

Expected: integração e snapshots passam sem regressão de proposta antiga.

- [ ] **Step 7: Commitar integração**

```bash
git add apps/frontend/src/pages/ProposalsPage.tsx apps/frontend/src/pages/ProposalsPage.test.tsx
git commit -m "feat: manage shared software catalog in proposals"
```

## Task 9: Finalizar apresentação e responsividade

**Files:**
- Modify: `apps/frontend/src/styles.css:12395-12765,13592-13700`
- Test: `apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx`
- Test: `apps/frontend/src/proposals/SoftwareCatalogProductModal.test.tsx`

- [ ] **Step 1: Acrescentar classes estruturais**

Adicionar estilos para:

```css
.proposals-page .proposal-catalog-result-group { display: grid; gap: 6px; margin-bottom: 18px; }
.proposals-page .proposal-catalog-result-family { color: #fff; font-size: .82rem; margin: 0; }
.proposals-page .proposal-catalog-result-subfamily { color: var(--proposal-red); font-size: .62rem; letter-spacing: .08em; margin: 2px 0; text-transform: uppercase; }
.proposals-page .proposal-catalog-product-menu { align-self: flex-start; min-width: 32px; }
.proposal-catalog-modal-backdrop { align-items: center; background: rgba(0,0,0,.72); display: flex; inset: 0; justify-content: center; padding: 20px; position: fixed; z-index: 1000; }
.proposal-catalog-modal { background: #242424; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; color: #ddd; max-height: calc(100vh - 40px); max-width: 680px; overflow-y: auto; padding: 20px; width: 100%; }
.proposal-catalog-modal form { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
.proposal-catalog-modal textarea, .proposal-catalog-modal .is-wide { grid-column: 1 / -1; }
.proposal-catalog-modal [role='alertdialog'] { border: 1px solid rgba(192,40,28,.55); margin-top: 16px; padding: 14px; }
```

Reutilizar cores, foco e botões do catálogo existente. A ação **Ocultar
produto** usa vermelho; ações canceláveis não usam vermelho.

- [ ] **Step 2: Adicionar comportamento móvel e redução de movimento**

No breakpoint `max-width: 560px`, usar uma coluna no formulário, modal com
`padding: 14px`, cards sem overflow horizontal e botões com área mínima de 44px.
Sob `prefers-reduced-motion: reduce`, remover transições novas.

- [ ] **Step 3: Rodar testes de acessibilidade de interação**

Run: `npm --workspace apps/frontend test -- src/proposals/SoftwareCatalogExplorer.test.tsx src/proposals/SoftwareCatalogProductModal.test.tsx`

Expected: todos passam; botões continuam localizáveis por nome acessível.

- [ ] **Step 4: Commitar estilos**

```bash
git add apps/frontend/src/styles.css apps/frontend/src/proposals/SoftwareCatalogExplorer.test.tsx apps/frontend/src/proposals/SoftwareCatalogProductModal.test.tsx
git commit -m "style: polish shared catalog management"
```

## Task 10: Verificar fluxo completo e compatibilidade

**Files:**
- Modify only if a failing regression identifies a scoped defect in files from Tasks 1-9.

- [ ] **Step 1: Rodar todas as suítes**

Run: `npm --workspace apps/backend test`

Expected: todos os testes backend passam.

Run: `npm --workspace apps/frontend test`

Expected: todos os testes frontend passam.

- [ ] **Step 2: Rodar o build de produção**

Run: `npm run build`

Expected: backend TypeScript, frontend TypeScript e Vite terminam com exit code 0.

- [ ] **Step 3: Fazer verificação manual local**

Subir backend e frontend pelos scripts existentes e verificar:

1. pesquisar `design`, `TopSolid Design` e `TopSolid Design Standard`;
2. confirmar grupos Família → Subfamília e Produtos principais primeiro;
3. criar um produto, recarregar e confirmar persistência;
4. abrir o modal pelo `⋯`, alterar preço e confirmar em outro navegador;
5. selecionar um item, editar globalmente e confirmar que o rascunho não muda;
6. remover e adicionar novamente e confirmar o novo valor;
7. ocultar e confirmar ausência no catálogo e presença em proposta salva;
8. validar desktop e viewport de 390 px sem rolagem horizontal.

- [ ] **Step 4: Conferir diff e estado do repositório**

Run: `git diff --check && git status --short`

Expected: sem erros de whitespace; somente alterações intencionais desta
funcionalidade. Preservar `.claude/` e `output/` sem adicioná-los.

- [ ] **Step 5: Criar commit de correções finais somente se necessário**

Se a verificação exigiu ajustes, adicionar apenas os arquivos alterados e usar:

```bash
git commit -m "test: verify shared software catalog workflow"
```

Se nenhum ajuste foi necessário, não criar commit vazio.
