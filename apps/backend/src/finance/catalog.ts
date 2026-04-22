import { db, uuid } from '../db.js';
import { listFinanceAccounts, listFinanceCategories } from './service.js';
import type {
  CreateFinanceCostCenterInput,
  CreateFinancePaymentMethodInput,
  FinanceAccountDto,
  FinanceCatalogSnapshotDto,
  FinanceCategoryDto,
  FinanceCostCenterDto,
  FinancePaymentMethodDto,
  FinancePaymentMethodKind
} from './types.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';

function resolveOrganizationId(organizationId?: string | null) {
  const normalized = organizationId?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_ORGANIZATION_ID;
}

function readOrganizationRow(organizationId: string) {
  const row = db.prepare(`
    select id, name
    from organization
    where id = ?
    limit 1
  `).get(organizationId) as { id: string; name: string } | undefined;

  if (!row) {
    throw new Error('Organização não encontrada.');
  }

  return row;
}

function mapCostCenterRow(row: {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceCostCenterDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    code: row.code,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapPaymentMethodRow(row: {
  id: string;
  organization_id: string;
  name: string;
  kind: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinancePaymentMethodDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    kind: row.kind as FinancePaymentMethodKind,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceCatalogAccounts(organizationId: string): FinanceAccountDto[] {
  return listFinanceAccounts(organizationId).accounts;
}

export function listFinanceCatalogCategories(organizationId: string): FinanceCategoryDto[] {
  return listFinanceCategories(organizationId).categories;
}

export function listFinanceCostCenters(organizationId: string): FinanceCostCenterDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);

  const rows = db.prepare(`
    select
      id,
      organization_id,
      name,
      code,
      is_active,
      created_at,
      updated_at
    from financial_cost_center
    where organization_id = ?
    order by is_active desc, name collate nocase asc, created_at desc
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    code: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapCostCenterRow);
}

export function createFinanceCostCenter(input: CreateFinanceCostCenterInput): FinanceCostCenterDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  const nowIso = new Date().toISOString();
  const id = uuid('fccr');
  db.prepare(`
    insert into financial_cost_center (
      id,
      organization_id,
      name,
      code,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    input.name.trim(),
    input.code?.trim() || null,
    input.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      name,
      code,
      is_active,
      created_at,
      updated_at
    from financial_cost_center
    where id = ?
    limit 1
  `).get(id) as
    | {
        id: string;
        organization_id: string;
        name: string;
        code: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!created) {
    throw new Error('Falha ao criar centro de custo.');
  }

  return mapCostCenterRow(created);
}

export function listFinancePaymentMethods(organizationId: string): FinancePaymentMethodDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);

  const rows = db.prepare(`
    select
      id,
      organization_id,
      name,
      kind,
      is_active,
      created_at,
      updated_at
    from financial_payment_method
    where organization_id = ?
    order by is_active desc, name collate nocase asc, created_at desc
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    kind: string;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapPaymentMethodRow);
}

export function createFinancePaymentMethod(input: CreateFinancePaymentMethodInput): FinancePaymentMethodDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  const nowIso = new Date().toISOString();
  const id = uuid('fpmt');
  db.prepare(`
    insert into financial_payment_method (
      id,
      organization_id,
      name,
      kind,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    input.name.trim(),
    input.kind,
    input.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      name,
      kind,
      is_active,
      created_at,
      updated_at
    from financial_payment_method
    where id = ?
    limit 1
  `).get(id) as
    | {
        id: string;
        organization_id: string;
        name: string;
        kind: string;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!created) {
    throw new Error('Falha ao criar forma de pagamento.');
  }

  return mapPaymentMethodRow(created);
}

export function getFinanceCatalogSnapshot(organizationId: string): FinanceCatalogSnapshotDto {
  return {
    accounts: listFinanceCatalogAccounts(organizationId),
    categories: listFinanceCatalogCategories(organizationId),
    cost_centers: listFinanceCostCenters(organizationId),
    payment_methods: listFinancePaymentMethods(organizationId)
  };
}
