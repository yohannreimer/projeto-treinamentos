import type { Express, Response } from 'express';
import { z } from 'zod';
import { db, uuid } from '../db.js';
import { readInternalAuthContext, requireInternalAuth } from '../internalAuth.js';

const serviceSchema = z.object({
  id: z.string().min(1).max(120),
  code: z.string().max(120),
  name: z.string().min(1).max(300),
  valuePerDay: z.number().finite().nonnegative(),
  defaultDurationDays: z.number().int().positive(),
  description: z.string().max(20_000),
  custom: z.boolean().optional()
});

const productSchema = z.object({
  id: z.string().min(1).max(120),
  code: z.string().max(120),
  name: z.string().min(1).max(300),
  unitValueUsd: z.number().finite().nonnegative(),
  defaultQuantity: z.number().int().positive(),
  description: z.string().max(20_000),
  custom: z.boolean().optional()
});

const productSnapshotSchema = productSchema.extend({
  quantity: z.number().int().positive(),
  maintenanceEnabled: z.boolean(),
  maintenancePercent: z.number().finite().nonnegative(),
  maintenanceYears: z.number().int().nonnegative()
});

const serviceEditSchema = z.object({
  name: z.string().max(300),
  valuePerDay: z.number().finite().nonnegative(),
  durationDays: z.number().int().positive(),
  description: z.string().max(20_000)
});

const productEditSchema = z.object({
  name: z.string().max(300),
  unitValueUsd: z.number().finite().nonnegative(),
  quantity: z.number().int().positive(),
  description: z.string().max(20_000),
  maintenanceEnabled: z.boolean(),
  maintenancePercent: z.number().finite().nonnegative(),
  maintenanceYears: z.number().int().nonnegative()
});

const documentSchema = z.object({
  version: z.literal(1),
  client: z.object({
    companyName: z.string().max(500),
    address: z.string().max(1000),
    cep: z.string().max(40),
    cnpj: z.string().max(80),
    contact: z.string().max(300),
    email: z.string().max(500)
  }).strict(),
  proposal: z.object({
    number: z.string().max(200),
    date: z.string().max(40),
    validityDays: z.string().max(20),
    modality: z.string().max(120)
  }).strict(),
  selectedServiceIds: z.array(z.string().max(120)).max(500),
  selectedProductIds: z.array(z.string().max(120)).max(500),
  serviceSnapshots: z.array(serviceSchema).max(500),
  productSnapshots: z.array(productSnapshotSchema).max(500),
  proposalCustomServices: z.array(serviceSchema).max(500),
  proposalCustomProducts: z.array(productSchema).max(500),
  proposalServiceEdits: z.record(serviceEditSchema),
  proposalProductEdits: z.record(productEditSchema),
  taxPercent: z.string().max(40),
  exchangeRate: z.string().max(40),
  softwareDiscountPercent: z.string().max(40),
  discountPercent: z.string().max(40),
  targetTotal: z.string().max(80),
  selectedRepresentative: z.object({
    id: z.string().max(120),
    name: z.string().max(300),
    role: z.string().max(500)
  }).strict().nullable(),
  includeRequirementsTerm: z.boolean(),
  snapToTarget: z.boolean(),
  serviceTargetTotal: z.number().finite().nullable(),
  observations: z.string().max(50_000)
}).strict();

const proposalWriteSchema = z.object({
  number: z.string().max(200),
  client_company_name: z.string().max(500),
  document: documentSchema
}).strict();

const catalogServiceWriteSchema = serviceSchema.omit({ id: true, custom: true }).strict();

type ProposalRow = {
  id: string;
  organization_id: string;
  number: string;
  client_company_name: string;
  document_json: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

type CatalogServiceRow = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  value_per_day: number;
  default_duration_days: number;
  description: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

function requireOrganization(res: Response) {
  const auth = readInternalAuthContext(res);
  if (!auth?.organization_id) return null;
  return { organizationId: auth.organization_id, userId: auth.internal_user_id };
}

function serializeProposal(row: ProposalRow) {
  const { organization_id: _organizationId, document_json: documentJson, ...summary } = row;
  return { ...summary, document: JSON.parse(documentJson) as unknown };
}

function serializeCatalogService(row: CatalogServiceRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    valuePerDay: Number(row.value_per_day),
    defaultDurationDays: Number(row.default_duration_days),
    description: row.description,
    custom: true as const
  };
}

export function registerProposalRoutes(app: Express) {
  app.get('/proposals', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });

    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const like = `%${query}%`;
    const items = db.prepare(`
      select id, number, client_company_name, created_by, updated_by, created_at, updated_at
      from proposal
      where organization_id = ?
        and (? = '' or number like ? or client_company_name like ?)
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
    db.prepare(`
      insert into proposal (
        id, organization_id, number, client_company_name, document_json,
        created_by, updated_by, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      context.organizationId,
      parsed.data.number,
      parsed.data.client_company_name,
      JSON.stringify(parsed.data.document),
      context.userId,
      context.userId,
      now,
      now
    );
    return res.status(201).json({ id, updated_at: now });
  });

  app.get('/proposals/catalog/services', requireInternalAuth, (_req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const rows = db.prepare(`
      select * from proposal_catalog_service
      where organization_id = ?
      order by name collate nocase
    `).all(context.organizationId) as CatalogServiceRow[];
    return res.json({ items: rows.map(serializeCatalogService) });
  });

  app.post('/proposals/catalog/services', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = catalogServiceWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const id = uuid('proposal-service');
    const now = new Date().toISOString();
    db.prepare(`
      insert into proposal_catalog_service (
        id, organization_id, code, name, value_per_day, default_duration_days,
        description, created_by, updated_by, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      context.organizationId,
      parsed.data.code,
      parsed.data.name,
      parsed.data.valuePerDay,
      parsed.data.defaultDurationDays,
      parsed.data.description,
      context.userId,
      context.userId,
      now,
      now
    );
    const row = db.prepare('select * from proposal_catalog_service where id = ?').get(id) as CatalogServiceRow;
    return res.status(201).json(serializeCatalogService(row));
  });

  app.put('/proposals/catalog/services/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = catalogServiceWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const now = new Date().toISOString();
    const result = db.prepare(`
      update proposal_catalog_service
      set code = ?, name = ?, value_per_day = ?, default_duration_days = ?,
          description = ?, updated_by = ?, updated_at = ?
      where id = ? and organization_id = ?
    `).run(
      parsed.data.code,
      parsed.data.name,
      parsed.data.valuePerDay,
      parsed.data.defaultDurationDays,
      parsed.data.description,
      context.userId,
      now,
      req.params.id,
      context.organizationId
    );
    if (result.changes === 0) return res.status(404).json({ message: 'Módulo não encontrado.' });
    const row = db.prepare(`
      select * from proposal_catalog_service where id = ? and organization_id = ?
    `).get(req.params.id, context.organizationId) as CatalogServiceRow;
    return res.json(serializeCatalogService(row));
  });

  app.delete('/proposals/catalog/services/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const result = db.prepare(`
      delete from proposal_catalog_service where id = ? and organization_id = ?
    `).run(req.params.id, context.organizationId);
    if (result.changes === 0) return res.status(404).json({ message: 'Módulo não encontrado.' });
    return res.json({ ok: true });
  });

  app.get('/proposals/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const row = db.prepare(`
      select * from proposal where id = ? and organization_id = ?
    `).get(req.params.id, context.organizationId) as ProposalRow | undefined;
    if (!row) return res.status(404).json({ message: 'Proposta não encontrada.' });
    return res.json(serializeProposal(row));
  });

  app.put('/proposals/:id', requireInternalAuth, (req, res) => {
    const context = requireOrganization(res);
    if (!context) return res.status(403).json({ message: 'Organização não configurada.' });
    const parsed = proposalWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    const now = new Date().toISOString();
    const result = db.prepare(`
      update proposal
      set number = ?, client_company_name = ?, document_json = ?, updated_by = ?, updated_at = ?
      where id = ? and organization_id = ?
    `).run(
      parsed.data.number,
      parsed.data.client_company_name,
      JSON.stringify(parsed.data.document),
      context.userId,
      now,
      req.params.id,
      context.organizationId
    );
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
