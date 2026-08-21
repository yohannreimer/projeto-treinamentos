import type { Express, Response } from 'express';
import { z } from 'zod';
import { db, uuid } from '../db.js';
import { readInternalAuthContext, requireInternalAuth } from '../internalAuth.js';

const catalogMetadataSchema = z.object({
  family: z.string().trim().min(1).max(160),
  subfamily: z.string().trim().min(1).max(160),
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
const catalogRecordWriteSchema = z.object({
  source: z.enum(['official', 'custom']),
  product: catalogProductSchema
}).strict();

type CatalogProduct = z.infer<typeof catalogProductSchema>;
type CatalogProductSource = 'official' | 'custom';

type CatalogProductRow = {
  id: string;
  organization_id: string;
  product_id: string;
  source: CatalogProductSource;
  product_json: string | null;
  is_archived: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

type CatalogContext = {
  organizationId: string;
  userId: string;
};

function requireCatalogContext(res: Response): CatalogContext | null {
  const auth = readInternalAuthContext(res);
  if (!auth?.organization_id) return null;
  return { organizationId: auth.organization_id, userId: auth.internal_user_id };
}

function serializeCatalogProduct(row: CatalogProductRow) {
  return {
    id: row.product_id,
    source: row.source,
    archived: row.is_archived === 1,
    product: row.product_json ? JSON.parse(row.product_json) as CatalogProduct : null,
    updatedAt: row.updated_at
  };
}

function upsertCatalogProduct(
  context: CatalogContext,
  productId: string,
  source: CatalogProductSource,
  product: CatalogProduct,
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
    uuid('proposal-catalog-product'),
    context.organizationId,
    productId,
    source,
    JSON.stringify(product),
    archived ? 1 : 0,
    context.userId,
    context.userId,
    now,
    now
  );

  return db.prepare(`
    select * from proposal_catalog_product
    where organization_id = ? and product_id = ?
  `).get(context.organizationId, productId) as CatalogProductRow;
}

export function registerProposalCatalogProductRoutes(app: Express) {
  app.get('/proposals/catalog/products', requireInternalAuth, (_req, res) => {
    const context = requireCatalogContext(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const rows = db.prepare(`
      select * from proposal_catalog_product
      where organization_id = ?
      order by updated_at, product_id
    `).all(context.organizationId) as CatalogProductRow[];
    return res.json({ items: rows.map(serializeCatalogProduct) });
  });

  app.post('/proposals/catalog/products', requireInternalAuth, (req, res) => {
    const context = requireCatalogContext(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = productWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const productId = uuid('proposal-product');
    const product: CatalogProduct = {
      id: productId,
      ...parsed.data,
      custom: true
    };
    const row = upsertCatalogProduct(context, productId, 'custom', product, false);
    return res.status(201).json(serializeCatalogProduct(row));
  });

  app.put('/proposals/catalog/products/:productId', requireInternalAuth, (req, res) => {
    const context = requireCatalogContext(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = catalogRecordWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    if (parsed.data.product.id !== req.params.productId) {
      return res.status(400).json({ message: 'O identificador do produto não confere.' });
    }

    const product = {
      ...parsed.data.product,
      custom: parsed.data.source === 'custom'
    };
    const row = upsertCatalogProduct(
      context,
      req.params.productId,
      parsed.data.source,
      product,
      false
    );
    return res.json(serializeCatalogProduct(row));
  });

  app.delete('/proposals/catalog/products/:productId', requireInternalAuth, (req, res) => {
    const context = requireCatalogContext(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = catalogRecordWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    if (parsed.data.product.id !== req.params.productId) {
      return res.status(400).json({ message: 'O identificador do produto não confere.' });
    }

    const product = {
      ...parsed.data.product,
      custom: parsed.data.source === 'custom'
    };
    const row = upsertCatalogProduct(
      context,
      req.params.productId,
      parsed.data.source,
      product,
      true
    );
    return res.json(serializeCatalogProduct(row));
  });
}
