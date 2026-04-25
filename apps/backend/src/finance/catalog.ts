import { db, uuid } from '../db.js';
import { listFinanceAccounts, listFinanceCategories } from './service.js';
import type {
  CreateFinanceCostCenterInput,
  CreateFinanceFavoriteCombinationInput,
  CreateFinancePaymentMethodInput,
  FinanceAccountDto,
  FinanceCatalogSnapshotDto,
  FinanceCategoryDto,
  FinanceCostCenterDto,
  FinanceFavoriteCombinationContext,
  FinanceFavoriteCombinationDto,
  FinancePaymentMethodDto,
  FinancePaymentMethodKind,
  UpdateFinanceCostCenterInput,
  UpdateFinanceFavoriteCombinationInput,
  UpdateFinancePaymentMethodInput
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

function mapFavoriteCombinationRow(row: {
  id: string;
  organization_id: string;
  name: string;
  context: string;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceFavoriteCombinationDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    context: row.context as FinanceFavoriteCombinationContext,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    financial_cost_center_id: row.financial_cost_center_id,
    financial_cost_center_name: row.financial_cost_center_name,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_payment_method_id: row.financial_payment_method_id,
    financial_payment_method_name: row.financial_payment_method_name,
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

function readFinanceCostCenterRow(organizationId: string, costCenterId: string) {
  const row = db.prepare(`
    select id, organization_id, name, code, is_active, created_at, updated_at
    from financial_cost_center
    where organization_id = ? and id = ?
    limit 1
  `).get(organizationId, costCenterId) as Parameters<typeof mapCostCenterRow>[0] | undefined;

  if (!row) {
    throw new Error('Centro de custo não encontrado.');
  }

  return row;
}

export function updateFinanceCostCenter(input: UpdateFinanceCostCenterInput): FinanceCostCenterDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const current = readFinanceCostCenterRow(normalizedOrganizationId, input.financial_cost_center_id);
  const nowIso = new Date().toISOString();

  db.prepare(`
    update financial_cost_center
    set name = ?,
        code = ?,
        is_active = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.name?.trim() || current.name,
    Object.prototype.hasOwnProperty.call(input, 'code') ? input.code?.trim() || null : current.code,
    typeof input.is_active === 'boolean' ? (input.is_active ? 1 : 0) : current.is_active,
    nowIso,
    normalizedOrganizationId,
    input.financial_cost_center_id
  );

  return mapCostCenterRow(readFinanceCostCenterRow(normalizedOrganizationId, input.financial_cost_center_id));
}

export function deactivateFinanceCostCenter(organizationId: string, costCenterId: string): FinanceCostCenterDto {
  return updateFinanceCostCenter({
    organization_id: organizationId,
    financial_cost_center_id: costCenterId,
    is_active: false
  });
}

function countCatalogReferences(organizationId: string, table: string, column: string, id: string): number {
  const row = db.prepare(`
    select count(*) as count
    from ${table}
    where organization_id = ? and ${column} = ?
  `).get(organizationId, id) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

function assertNoCatalogReferences(
  organizationId: string,
  id: string,
  references: Array<{ table: string; column: string; label: string }>
) {
  const usedBy = references
    .map((reference) => ({
      ...reference,
      count: countCatalogReferences(organizationId, reference.table, reference.column, id)
    }))
    .filter((reference) => reference.count > 0);

  if (usedBy.length > 0) {
    throw new Error(`Não é possível excluir: existem vínculos em ${usedBy.map((reference) => reference.label).join(', ')}. Inative ou limpe os lançamentos primeiro.`);
  }
}

export function hardDeleteFinanceCostCenter(organizationId: string, costCenterId: string): { ok: true; id: string } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readFinanceCostCenterRow(normalizedOrganizationId, costCenterId);
  assertNoCatalogReferences(normalizedOrganizationId, costCenterId, [
    { table: 'financial_transaction', column: 'financial_cost_center_id', label: 'movimentações' },
    { table: 'financial_payable', column: 'financial_cost_center_id', label: 'contas a pagar' },
    { table: 'financial_receivable', column: 'financial_cost_center_id', label: 'contas a receber' }
  ]);

  const run = db.transaction(() => {
    db.prepare('update financial_entity_default_profile set financial_cost_center_id = null where organization_id = ? and financial_cost_center_id = ?').run(normalizedOrganizationId, costCenterId);
    db.prepare('update financial_favorite_combination set financial_cost_center_id = null where organization_id = ? and financial_cost_center_id = ?').run(normalizedOrganizationId, costCenterId);
    db.prepare('delete from financial_cost_center where organization_id = ? and id = ?').run(normalizedOrganizationId, costCenterId);
  });
  run();
  return { ok: true, id: costCenterId };
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

function readFinancePaymentMethodRow(organizationId: string, paymentMethodId: string) {
  const row = db.prepare(`
    select id, organization_id, name, kind, is_active, created_at, updated_at
    from financial_payment_method
    where organization_id = ? and id = ?
    limit 1
  `).get(organizationId, paymentMethodId) as Parameters<typeof mapPaymentMethodRow>[0] | undefined;

  if (!row) {
    throw new Error('Forma de pagamento não encontrada.');
  }

  return row;
}

export function updateFinancePaymentMethod(input: UpdateFinancePaymentMethodInput): FinancePaymentMethodDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const current = readFinancePaymentMethodRow(normalizedOrganizationId, input.financial_payment_method_id);
  const nowIso = new Date().toISOString();

  db.prepare(`
    update financial_payment_method
    set name = ?,
        kind = ?,
        is_active = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.name?.trim() || current.name,
    input.kind ?? current.kind,
    typeof input.is_active === 'boolean' ? (input.is_active ? 1 : 0) : current.is_active,
    nowIso,
    normalizedOrganizationId,
    input.financial_payment_method_id
  );

  return mapPaymentMethodRow(readFinancePaymentMethodRow(normalizedOrganizationId, input.financial_payment_method_id));
}

export function deactivateFinancePaymentMethod(organizationId: string, paymentMethodId: string): FinancePaymentMethodDto {
  return updateFinancePaymentMethod({
    organization_id: organizationId,
    financial_payment_method_id: paymentMethodId,
    is_active: false
  });
}

export function hardDeleteFinancePaymentMethod(organizationId: string, paymentMethodId: string): { ok: true; id: string } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readFinancePaymentMethodRow(normalizedOrganizationId, paymentMethodId);
  assertNoCatalogReferences(normalizedOrganizationId, paymentMethodId, [
    { table: 'financial_transaction', column: 'financial_payment_method_id', label: 'movimentações' },
    { table: 'financial_payable', column: 'financial_payment_method_id', label: 'contas a pagar' },
    { table: 'financial_receivable', column: 'financial_payment_method_id', label: 'contas a receber' }
  ]);

  const run = db.transaction(() => {
    db.prepare('update financial_entity_default_profile set financial_payment_method_id = null where organization_id = ? and financial_payment_method_id = ?').run(normalizedOrganizationId, paymentMethodId);
    db.prepare('update financial_favorite_combination set financial_payment_method_id = null where organization_id = ? and financial_payment_method_id = ?').run(normalizedOrganizationId, paymentMethodId);
    db.prepare('delete from financial_payment_method where organization_id = ? and id = ?').run(normalizedOrganizationId, paymentMethodId);
  });
  run();
  return { ok: true, id: paymentMethodId };
}

function readFinanceFavoriteCombinationRow(organizationId: string, combinationId: string) {
  const row = db.prepare(`
    select
      ffc.id,
      ffc.organization_id,
      ffc.name,
      ffc.context,
      ffc.financial_category_id,
      fc.name as financial_category_name,
      ffc.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      ffc.financial_account_id,
      fa.name as financial_account_name,
      ffc.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      ffc.is_active,
      ffc.created_at,
      ffc.updated_at
    from financial_favorite_combination ffc
    left join financial_category fc
      on fc.organization_id = ffc.organization_id and fc.id = ffc.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = ffc.organization_id and fcc.id = ffc.financial_cost_center_id
    left join financial_account fa
      on fa.organization_id = ffc.organization_id and fa.id = ffc.financial_account_id
    left join financial_payment_method fpm
      on fpm.organization_id = ffc.organization_id and fpm.id = ffc.financial_payment_method_id
    where ffc.organization_id = ? and ffc.id = ?
    limit 1
  `).get(organizationId, combinationId) as Parameters<typeof mapFavoriteCombinationRow>[0] | undefined;

  if (!row) {
    throw new Error('Combinação favorita não encontrada.');
  }

  return row;
}

export function listFinanceFavoriteCombinations(organizationId: string): FinanceFavoriteCombinationDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);

  const rows = db.prepare(`
    select
      ffc.id,
      ffc.organization_id,
      ffc.name,
      ffc.context,
      ffc.financial_category_id,
      fc.name as financial_category_name,
      ffc.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      ffc.financial_account_id,
      fa.name as financial_account_name,
      ffc.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      ffc.is_active,
      ffc.created_at,
      ffc.updated_at
    from financial_favorite_combination ffc
    left join financial_category fc
      on fc.organization_id = ffc.organization_id and fc.id = ffc.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = ffc.organization_id and fcc.id = ffc.financial_cost_center_id
    left join financial_account fa
      on fa.organization_id = ffc.organization_id and fa.id = ffc.financial_account_id
    left join financial_payment_method fpm
      on fpm.organization_id = ffc.organization_id and fpm.id = ffc.financial_payment_method_id
    where ffc.organization_id = ?
    order by ffc.is_active desc, ffc.name collate nocase asc, ffc.created_at desc
  `).all(normalizedOrganizationId) as Array<Parameters<typeof mapFavoriteCombinationRow>[0]>;

  return rows.map(mapFavoriteCombinationRow);
}

export function createFinanceFavoriteCombination(
  input: CreateFinanceFavoriteCombinationInput
): FinanceFavoriteCombinationDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  const id = uuid('ffav');
  const nowIso = new Date().toISOString();
  db.prepare(`
    insert into financial_favorite_combination (
      id,
      organization_id,
      name,
      context,
      financial_category_id,
      financial_cost_center_id,
      financial_account_id,
      financial_payment_method_id,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    input.name.trim(),
    input.context ?? 'any',
    input.financial_category_id?.trim() || null,
    input.financial_cost_center_id?.trim() || null,
    input.financial_account_id?.trim() || null,
    input.financial_payment_method_id?.trim() || null,
    input.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  return mapFavoriteCombinationRow(readFinanceFavoriteCombinationRow(normalizedOrganizationId, id));
}

export function updateFinanceFavoriteCombination(
  input: UpdateFinanceFavoriteCombinationInput
): FinanceFavoriteCombinationDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const current = readFinanceFavoriteCombinationRow(normalizedOrganizationId, input.financial_favorite_combination_id);
  const nowIso = new Date().toISOString();

  db.prepare(`
    update financial_favorite_combination
    set name = ?,
        context = ?,
        financial_category_id = ?,
        financial_cost_center_id = ?,
        financial_account_id = ?,
        financial_payment_method_id = ?,
        is_active = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.name?.trim() || current.name,
    input.context ?? current.context,
    Object.prototype.hasOwnProperty.call(input, 'financial_category_id') ? input.financial_category_id?.trim() || null : current.financial_category_id,
    Object.prototype.hasOwnProperty.call(input, 'financial_cost_center_id') ? input.financial_cost_center_id?.trim() || null : current.financial_cost_center_id,
    Object.prototype.hasOwnProperty.call(input, 'financial_account_id') ? input.financial_account_id?.trim() || null : current.financial_account_id,
    Object.prototype.hasOwnProperty.call(input, 'financial_payment_method_id') ? input.financial_payment_method_id?.trim() || null : current.financial_payment_method_id,
    typeof input.is_active === 'boolean' ? (input.is_active ? 1 : 0) : current.is_active,
    nowIso,
    normalizedOrganizationId,
    input.financial_favorite_combination_id
  );

  return mapFavoriteCombinationRow(readFinanceFavoriteCombinationRow(normalizedOrganizationId, input.financial_favorite_combination_id));
}

export function deactivateFinanceFavoriteCombination(organizationId: string, combinationId: string): FinanceFavoriteCombinationDto {
  return updateFinanceFavoriteCombination({
    organization_id: organizationId,
    financial_favorite_combination_id: combinationId,
    is_active: false
  });
}

export function hardDeleteFinanceFavoriteCombination(organizationId: string, combinationId: string): { ok: true; id: string } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readFinanceFavoriteCombinationRow(normalizedOrganizationId, combinationId);
  db.prepare('delete from financial_favorite_combination where organization_id = ? and id = ?').run(normalizedOrganizationId, combinationId);
  return { ok: true, id: combinationId };
}

export function getFinanceCatalogSnapshot(organizationId: string): FinanceCatalogSnapshotDto {
  return {
    accounts: listFinanceCatalogAccounts(organizationId),
    categories: listFinanceCatalogCategories(organizationId),
    cost_centers: listFinanceCostCenters(organizationId),
    payment_methods: listFinancePaymentMethods(organizationId)
  };
}
