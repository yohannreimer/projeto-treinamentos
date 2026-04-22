import { db, uuid } from '../db.js';
import { computeViews } from './ledger.js';
import type {
  CreateFinanceAccountInput,
  CreateFinanceDebtInput,
  CreateFinanceImportJobInput,
  CreateFinancePayableInput,
  CreateFinanceReconciliationMatchInput,
  CreateFinanceReceivableInput,
  CreateFinanceStatementEntryInput,
  CreateFinanceCategoryInput,
  CreateFinanceTransactionInput,
  FinanceAccountDto,
  FinanceDebtDto,
  FinanceImportJobDto,
  FinancePayableDto,
  FinanceReconciliationMatchDto,
  FinanceReceivableDto,
  FinanceStatementEntryDto,
  FinanceCategoryDto,
  FinanceContextDto,
  FinanceOverviewDto,
  FinanceTransactionDto,
  FinanceTransactionRow,
  FinanceTransactionListFilters,
  FinanceTransactionStatus,
  UpdateFinanceTransactionInput
} from './types.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';

function resolveDefaultStatus(input: {
  status?: FinanceTransactionStatus;
  settlement_date?: string | null;
}): FinanceTransactionStatus {
  if (input.status) {
    return input.status;
  }
  if (input.settlement_date) {
    return 'settled';
  }
  return 'open';
}

function assertSettlementConsistency(status: FinanceTransactionStatus, settlementDate: string | null) {
  if (status === 'settled' && !settlementDate) {
    throw new Error('Informe settlement_date para status settled.');
  }
}

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

function readCompanyRow(companyId: string) {
  const row = db.prepare(`
    select id, name
    from company
    where id = ?
    limit 1
  `).get(companyId) as { id: string; name: string } | undefined;

  if (!row) {
    throw new Error('Empresa não encontrada.');
  }

  return row;
}

function resolveCompanyRow(companyId?: string | null) {
  if (!companyId) return null;
  return readCompanyRow(companyId);
}

function readFinanceEntityRow(organizationId: string, entityId: string) {
  const row = db.prepare(`
    select id, organization_id, legal_name, trade_name, document_number, kind, email, phone, is_active, created_at, updated_at
    from financial_entity
    where organization_id = ?
      and id = ?
    limit 1
  `).get(organizationId, entityId) as {
    id: string;
    organization_id: string;
    legal_name: string;
    trade_name: string | null;
    document_number: string | null;
    kind: string;
    email: string | null;
    phone: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) {
    throw new Error('Entidade financeira não encontrada.');
  }

  return row;
}

function mapAccountRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  name: string;
  kind: string;
  currency: string;
  account_number: string | null;
  branch_number: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceAccountDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    name: row.name,
    kind: row.kind as FinanceAccountDto['kind'],
    currency: row.currency,
    account_number: row.account_number,
    branch_number: row.branch_number,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapCategoryRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  name: string;
  kind: string;
  parent_category_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}): FinanceCategoryDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    name: row.name,
    kind: row.kind as FinanceCategoryDto['kind'],
    parent_category_id: row.parent_category_id,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceAccounts(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  accounts: FinanceAccountDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      name,
      kind,
      currency,
      account_number,
      branch_number,
      is_active,
      created_at,
      updated_at
    from financial_account
    where organization_id = ?
      and (? is null or company_id = ?)
    order by is_active desc, name collate nocase asc, created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    name: string;
    kind: string;
    currency: string;
    account_number: string | null;
    branch_number: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    accounts: rows.map(mapAccountRow)
  };
}

export function listFinanceCategories(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  categories: FinanceCategoryDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      name,
      kind,
      parent_category_id,
      is_active,
      created_at,
      updated_at
    from financial_category
    where organization_id = ?
      and (? is null or company_id = ?)
    order by is_active desc, name collate nocase asc, created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    name: string;
    kind: string;
    parent_category_id: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    categories: rows.map(mapCategoryRow)
  };
}

export function createFinanceAccount(input: CreateFinanceAccountInput): FinanceAccountDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const nowIso = new Date().toISOString();
  const id = uuid('facc');

  db.prepare(`
    insert into financial_account (
      id,
      organization_id,
      company_id,
      name,
      kind,
      currency,
      account_number,
      branch_number,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.name.trim(),
    input.kind,
    (input.currency?.trim().toUpperCase() || 'BRL').slice(0, 8),
    input.account_number?.trim() || null,
    input.branch_number?.trim() || null,
    input.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      name,
      kind,
      currency,
      account_number,
      branch_number,
      is_active,
      created_at,
      updated_at
    from financial_account
    where id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    name: string;
    kind: string;
    currency: string;
    account_number: string | null;
    branch_number: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar conta financeira.');
  }
  return mapAccountRow(created);
}

export function createFinanceCategory(input: CreateFinanceCategoryInput): FinanceCategoryDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const nowIso = new Date().toISOString();
  const id = uuid('fcat');
  const parentCategoryId = input.parent_category_id?.trim() || null;
  if (parentCategoryId) {
    const parent = db.prepare(`
      select id
      from financial_category
      where id = ?
        and organization_id = ?
        and company_id = ?
      limit 1
    `).get(parentCategoryId, normalizedOrganizationId, companyId) as { id: string } | undefined;
    if (!parent) {
      throw new Error('Categoria pai não encontrada.');
    }
  }

  db.prepare(`
    insert into financial_category (
      id,
      organization_id,
      company_id,
      name,
      kind,
      parent_category_id,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.name.trim(),
    input.kind,
    parentCategoryId,
    input.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      name,
      kind,
      parent_category_id,
      is_active,
      created_at,
      updated_at
    from financial_category
    where id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    name: string;
    kind: string;
    parent_category_id: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar categoria financeira.');
  }
  return mapCategoryRow(created);
}

function mapPayableRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  financial_transaction_id: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  supplier_name: string | null;
  description: string;
  amount_cents: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  source: string;
  source_ref: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}): FinancePayableDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    financial_transaction_id: row.financial_transaction_id,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    supplier_name: row.supplier_name,
    description: row.description,
    amount_cents: row.amount_cents,
    status: row.status as FinancePayableDto['status'],
    issue_date: row.issue_date,
    due_date: row.due_date,
    paid_at: row.paid_at,
    source: row.source,
    source_ref: row.source_ref,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapReceivableRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  financial_transaction_id: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  customer_name: string | null;
  description: string;
  amount_cents: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  received_at: string | null;
  source: string;
  source_ref: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}): FinanceReceivableDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    financial_transaction_id: row.financial_transaction_id,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    customer_name: row.customer_name,
    description: row.description,
    amount_cents: row.amount_cents,
    status: row.status as FinanceReceivableDto['status'],
    issue_date: row.issue_date,
    due_date: row.due_date,
    received_at: row.received_at,
    source: row.source,
    source_ref: row.source_ref,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinancePayables(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  payables: FinancePayableDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      fp.id,
      fp.organization_id,
      fp.company_id,
      fp.financial_transaction_id,
      fp.financial_account_id,
      fa.name as financial_account_name,
      fp.financial_category_id,
      fc.name as financial_category_name,
      fp.supplier_name,
      fp.description,
      fp.amount_cents,
      fp.status,
      fp.issue_date,
      fp.due_date,
      fp.paid_at,
      fp.source,
      fp.source_ref,
      fp.note,
      fp.created_at,
      fp.updated_at
    from financial_payable fp
    left join financial_account fa
      on fa.organization_id = fp.organization_id
      and fa.company_id = fp.company_id
      and fa.id = fp.financial_account_id
    left join financial_category fc
      on fc.organization_id = fp.organization_id
      and fc.company_id = fp.company_id
      and fc.id = fp.financial_category_id
    where fp.organization_id = ?
      and (? is null or fp.company_id = ?)
    order by coalesce(fp.due_date, fp.issue_date, substr(fp.created_at, 1, 10)) asc, fp.created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    financial_transaction_id: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    supplier_name: string | null;
    description: string;
    amount_cents: number;
    status: string;
    issue_date: string | null;
    due_date: string | null;
    paid_at: string | null;
    source: string;
    source_ref: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    payables: rows.map(mapPayableRow)
  };
}

export function listFinanceReceivables(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  receivables: FinanceReceivableDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      fr.id,
      fr.organization_id,
      fr.company_id,
      fr.financial_transaction_id,
      fr.financial_account_id,
      fa.name as financial_account_name,
      fr.financial_category_id,
      fc.name as financial_category_name,
      fr.customer_name,
      fr.description,
      fr.amount_cents,
      fr.status,
      fr.issue_date,
      fr.due_date,
      fr.received_at,
      fr.source,
      fr.source_ref,
      fr.note,
      fr.created_at,
      fr.updated_at
    from financial_receivable fr
    left join financial_account fa
      on fa.organization_id = fr.organization_id
      and fa.company_id = fr.company_id
      and fa.id = fr.financial_account_id
    left join financial_category fc
      on fc.organization_id = fr.organization_id
      and fc.company_id = fr.company_id
      and fc.id = fr.financial_category_id
    where fr.organization_id = ?
      and (? is null or fr.company_id = ?)
    order by coalesce(fr.due_date, fr.issue_date, substr(fr.created_at, 1, 10)) asc, fr.created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    financial_transaction_id: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    customer_name: string | null;
    description: string;
    amount_cents: number;
    status: string;
    issue_date: string | null;
    due_date: string | null;
    received_at: string | null;
    source: string;
    source_ref: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    receivables: rows.map(mapReceivableRow)
  };
}

export function createFinancePayable(input: CreateFinancePayableInput): FinancePayableDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const nowIso = new Date().toISOString();
  const id = uuid('fpay');

  db.prepare(`
    insert into financial_payable (
      id,
      organization_id,
      company_id,
      financial_transaction_id,
      financial_account_id,
      financial_category_id,
      supplier_name,
      description,
      amount_cents,
      status,
      issue_date,
      due_date,
      paid_at,
      source,
      source_ref,
      note,
      created_at,
      updated_at
    ) values (?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', null, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.financial_account_id ?? null,
    input.financial_category_id ?? null,
    input.supplier_name?.trim() || null,
    input.description.trim(),
    Math.trunc(input.amount_cents),
    input.status,
    input.issue_date ?? null,
    input.due_date ?? null,
    input.paid_at ?? null,
    input.note?.trim() || null,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      fp.id,
      fp.organization_id,
      fp.company_id,
      fp.financial_transaction_id,
      fp.financial_account_id,
      fa.name as financial_account_name,
      fp.financial_category_id,
      fc.name as financial_category_name,
      fp.supplier_name,
      fp.description,
      fp.amount_cents,
      fp.status,
      fp.issue_date,
      fp.due_date,
      fp.paid_at,
      fp.source,
      fp.source_ref,
      fp.note,
      fp.created_at,
      fp.updated_at
    from financial_payable fp
    left join financial_account fa
      on fa.organization_id = fp.organization_id
      and fa.company_id = fp.company_id
      and fa.id = fp.financial_account_id
    left join financial_category fc
      on fc.organization_id = fp.organization_id
      and fc.company_id = fp.company_id
      and fc.id = fp.financial_category_id
    where fp.id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    financial_transaction_id: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    supplier_name: string | null;
    description: string;
    amount_cents: number;
    status: string;
    issue_date: string | null;
    due_date: string | null;
    paid_at: string | null;
    source: string;
    source_ref: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar conta a pagar.');
  }
  return mapPayableRow(created);
}

export function createFinanceReceivable(input: CreateFinanceReceivableInput): FinanceReceivableDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const nowIso = new Date().toISOString();
  const id = uuid('frec');

  db.prepare(`
    insert into financial_receivable (
      id,
      organization_id,
      company_id,
      financial_transaction_id,
      financial_account_id,
      financial_category_id,
      customer_name,
      description,
      amount_cents,
      status,
      issue_date,
      due_date,
      received_at,
      source,
      source_ref,
      note,
      created_at,
      updated_at
    ) values (?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', null, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.financial_account_id ?? null,
    input.financial_category_id ?? null,
    input.customer_name?.trim() || null,
    input.description.trim(),
    Math.trunc(input.amount_cents),
    input.status,
    input.issue_date ?? null,
    input.due_date ?? null,
    input.received_at ?? null,
    input.note?.trim() || null,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      fr.id,
      fr.organization_id,
      fr.company_id,
      fr.financial_transaction_id,
      fr.financial_account_id,
      fa.name as financial_account_name,
      fr.financial_category_id,
      fc.name as financial_category_name,
      fr.customer_name,
      fr.description,
      fr.amount_cents,
      fr.status,
      fr.issue_date,
      fr.due_date,
      fr.received_at,
      fr.source,
      fr.source_ref,
      fr.note,
      fr.created_at,
      fr.updated_at
    from financial_receivable fr
    left join financial_account fa
      on fa.organization_id = fr.organization_id
      and fa.company_id = fr.company_id
      and fa.id = fr.financial_account_id
    left join financial_category fc
      on fc.organization_id = fr.organization_id
      and fc.company_id = fr.company_id
      and fc.id = fr.financial_category_id
    where fr.id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    financial_transaction_id: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    customer_name: string | null;
    description: string;
    amount_cents: number;
    status: string;
    issue_date: string | null;
    due_date: string | null;
    received_at: string | null;
    source: string;
    source_ref: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar conta a receber.');
  }
  return mapReceivableRow(created);
}

function mapImportJobRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  import_type: string;
  source_file_name: string;
  source_file_mime_type: string | null;
  source_file_size_bytes: number;
  status: string;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  error_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}): FinanceImportJobDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    import_type: row.import_type,
    source_file_name: row.source_file_name,
    source_file_mime_type: row.source_file_mime_type,
    source_file_size_bytes: row.source_file_size_bytes,
    status: row.status as FinanceImportJobDto['status'],
    total_rows: row.total_rows,
    processed_rows: row.processed_rows,
    error_rows: row.error_rows,
    error_summary: row.error_summary,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at
  };
}

function mapStatementEntryRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  financial_account_id: string;
  financial_account_name: string | null;
  financial_import_job_id: string | null;
  statement_date: string;
  posted_at: string | null;
  amount_cents: number;
  description: string;
  reference_code: string | null;
  balance_cents: number | null;
  source: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}): FinanceStatementEntryDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_import_job_id: row.financial_import_job_id,
    statement_date: row.statement_date,
    posted_at: row.posted_at,
    amount_cents: row.amount_cents,
    description: row.description,
    reference_code: row.reference_code,
    balance_cents: row.balance_cents,
    source: row.source,
    source_ref: row.source_ref,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapReconciliationRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  financial_bank_statement_entry_id: string;
  financial_transaction_id: string;
  match_status: string;
  match_type: string;
  matched_by: string | null;
  matched_at: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}): FinanceReconciliationMatchDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    financial_bank_statement_entry_id: row.financial_bank_statement_entry_id,
    financial_transaction_id: row.financial_transaction_id,
    confidence_score: null,
    match_status: row.match_status as FinanceReconciliationMatchDto['match_status'],
    source: row.match_type,
    reviewed_by: row.matched_by,
    reviewed_at: row.matched_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceImportJobs(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  jobs: FinanceImportJobDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      import_type,
      source_file_name,
      source_file_mime_type,
      source_file_size_bytes,
      status,
      total_rows,
      processed_rows,
      error_rows,
      error_summary,
      created_by,
      created_at,
      updated_at,
      finished_at
    from financial_import_job
    where organization_id = ?
      and (? is null or company_id = ?)
    order by created_at desc, id desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    import_type: string;
    source_file_name: string;
    source_file_mime_type: string | null;
    source_file_size_bytes: number;
    status: string;
    total_rows: number;
    processed_rows: number;
    error_rows: number;
    error_summary: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    finished_at: string | null;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    jobs: rows.map(mapImportJobRow)
  };
}

export function createFinanceImportJob(input: CreateFinanceImportJobInput): FinanceImportJobDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const nowIso = new Date().toISOString();
  const id = uuid('fimp');

  db.prepare(`
    insert into financial_import_job (
      id,
      organization_id,
      company_id,
      import_type,
      source_file_name,
      source_file_mime_type,
      source_file_size_bytes,
      status,
      total_rows,
      processed_rows,
      error_rows,
      error_summary,
      created_by,
      created_at,
      updated_at,
      finished_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.import_type.trim(),
    input.source_file_name.trim(),
    input.source_file_mime_type?.trim() || null,
    Math.max(0, Math.trunc(input.source_file_size_bytes ?? 0)),
    input.status ?? 'queued',
    Math.max(0, Math.trunc(input.total_rows ?? 0)),
    Math.max(0, Math.trunc(input.processed_rows ?? 0)),
    Math.max(0, Math.trunc(input.error_rows ?? 0)),
    input.error_summary?.trim() || null,
    input.created_by ?? null,
    nowIso,
    nowIso,
    input.finished_at ?? null
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      import_type,
      source_file_name,
      source_file_mime_type,
      source_file_size_bytes,
      status,
      total_rows,
      processed_rows,
      error_rows,
      error_summary,
      created_by,
      created_at,
      updated_at,
      finished_at
    from financial_import_job
    where id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    import_type: string;
    source_file_name: string;
    source_file_mime_type: string | null;
    source_file_size_bytes: number;
    status: string;
    total_rows: number;
    processed_rows: number;
    error_rows: number;
    error_summary: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    finished_at: string | null;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar job de importação financeira.');
  }
  return mapImportJobRow(created);
}

export function listFinanceStatementEntries(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  entries: FinanceStatementEntryDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      fbe.id,
      fbe.organization_id,
      fbe.company_id,
      fbe.financial_account_id,
      fa.name as financial_account_name,
      fbe.financial_import_job_id,
      fbe.statement_date,
      fbe.posted_at,
      fbe.amount_cents,
      fbe.description,
      fbe.reference_code,
      fbe.balance_cents,
      fbe.source,
      fbe.source_ref,
      fbe.created_at,
      fbe.updated_at
    from financial_bank_statement_entry fbe
    left join financial_account fa
      on fa.organization_id = fbe.organization_id
      and fa.company_id = fbe.company_id
      and fa.id = fbe.financial_account_id
    where fbe.organization_id = ?
      and (? is null or fbe.company_id = ?)
    order by fbe.statement_date desc, fbe.created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    financial_account_id: string;
    financial_account_name: string | null;
    financial_import_job_id: string | null;
    statement_date: string;
    posted_at: string | null;
    amount_cents: number;
    description: string;
    reference_code: string | null;
    balance_cents: number | null;
    source: string;
    source_ref: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    entries: rows.map(mapStatementEntryRow)
  };
}

export function createFinanceStatementEntry(input: CreateFinanceStatementEntryInput): FinanceStatementEntryDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const account = db.prepare(`
    select id
    from financial_account
    where id = ?
      and organization_id = ?
      and company_id = ?
    limit 1
  `).get(input.financial_account_id, normalizedOrganizationId, companyId) as { id: string } | undefined;
  if (!account) {
    throw new Error('Conta financeira não encontrada.');
  }

  const importJobId = input.financial_import_job_id?.trim() || null;
  if (importJobId) {
    const importJob = db.prepare(`
      select id
      from financial_import_job
      where id = ?
        and organization_id = ?
        and company_id = ?
      limit 1
    `).get(importJobId, normalizedOrganizationId, companyId) as { id: string } | undefined;
    if (!importJob) {
      throw new Error('Job de importação não encontrado.');
    }
  }

  const nowIso = new Date().toISOString();
  const id = uuid('fstm');
  db.prepare(`
    insert into financial_bank_statement_entry (
      id,
      organization_id,
      company_id,
      financial_account_id,
      financial_import_job_id,
      statement_date,
      posted_at,
      amount_cents,
      description,
      reference_code,
      balance_cents,
      source,
      source_ref,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.financial_account_id,
    importJobId,
    input.statement_date,
    input.posted_at ?? null,
    Math.trunc(input.amount_cents),
    input.description.trim(),
    input.reference_code?.trim() || null,
    input.balance_cents ?? null,
    input.source?.trim() || 'bank_import',
    input.source_ref?.trim() || null,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      fbe.id,
      fbe.organization_id,
      fbe.company_id,
      fbe.financial_account_id,
      fa.name as financial_account_name,
      fbe.financial_import_job_id,
      fbe.statement_date,
      fbe.posted_at,
      fbe.amount_cents,
      fbe.description,
      fbe.reference_code,
      fbe.balance_cents,
      fbe.source,
      fbe.source_ref,
      fbe.created_at,
      fbe.updated_at
    from financial_bank_statement_entry fbe
    left join financial_account fa
      on fa.organization_id = fbe.organization_id
      and fa.company_id = fbe.company_id
      and fa.id = fbe.financial_account_id
    where fbe.id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    financial_account_id: string;
    financial_account_name: string | null;
    financial_import_job_id: string | null;
    statement_date: string;
    posted_at: string | null;
    amount_cents: number;
    description: string;
    reference_code: string | null;
    balance_cents: number | null;
    source: string;
    source_ref: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao criar lançamento de extrato.');
  }
  return mapStatementEntryRow(created);
}

export function listFinanceReconciliationMatches(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  matches: FinanceReconciliationMatchDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      financial_bank_statement_entry_id,
      financial_transaction_id,
      match_status,
      match_type,
      matched_by,
      matched_at,
      note,
      created_at,
      updated_at
    from financial_reconciliation_match
    where organization_id = ?
      and (? is null or company_id = ?)
    order by created_at desc, id desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    financial_bank_statement_entry_id: string;
    financial_transaction_id: string;
    match_status: string;
    match_type: string;
    matched_by: string | null;
    matched_at: string;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    matches: rows.map(mapReconciliationRow)
  };
}

export function createFinanceReconciliationMatch(input: CreateFinanceReconciliationMatchInput): FinanceReconciliationMatchDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);

  const statementEntry = db.prepare(`
    select id
    from financial_bank_statement_entry
    where id = ?
      and organization_id = ?
      and company_id = ?
    limit 1
  `).get(input.financial_bank_statement_entry_id, normalizedOrganizationId, companyId) as { id: string } | undefined;
  if (!statementEntry) {
    throw new Error('Lançamento de extrato não encontrado.');
  }

  const transactionId = input.financial_transaction_id.trim();
  const transaction = db.prepare(`
    select id
    from financial_transaction
    where id = ?
      and organization_id = ?
      and coalesce(is_deleted, 0) = 0
    limit 1
  `).get(transactionId, normalizedOrganizationId) as { id: string } | undefined;
  if (!transaction) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const statementAmount = db.prepare(`
    select amount_cents
    from financial_bank_statement_entry
    where id = ?
      and organization_id = ?
      and company_id = ?
    limit 1
  `).get(input.financial_bank_statement_entry_id, normalizedOrganizationId, companyId) as { amount_cents: number } | undefined;
  const matchedAmountCents = Math.abs(statementAmount?.amount_cents ?? 0);
  const matchedAt = input.reviewed_at ?? new Date().toISOString();

  const nowIso = new Date().toISOString();
  const id = uuid('frecm');
  db.prepare(`
    insert into financial_reconciliation_match (
      id,
      organization_id,
      company_id,
      financial_bank_statement_entry_id,
      financial_transaction_id,
      match_type,
      match_status,
      matched_amount_cents,
      matched_at,
      matched_by,
      note,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    input.financial_bank_statement_entry_id,
    transactionId,
    input.source?.trim() || 'manual',
    input.match_status,
    matchedAmountCents,
    matchedAt,
    input.reviewed_by ?? null,
    input.confidence_score == null ? null : `confidence=${input.confidence_score.toFixed(4)}`,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      financial_bank_statement_entry_id,
      financial_transaction_id,
      match_status,
      match_type,
      matched_by,
      matched_at,
      note,
      created_at,
      updated_at
    from financial_reconciliation_match
    where id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    financial_bank_statement_entry_id: string;
    financial_transaction_id: string;
    match_status: string;
    match_type: string;
    matched_by: string | null;
    matched_at: string;
    note: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!created) {
    throw new Error('Falha ao registrar conciliação.');
  }
  return mapReconciliationRow(created);
}

function mapDebtRow(row: {
  id: string;
  organization_id: string;
  company_id: string;
  financial_payable_id: string | null;
  financial_receivable_id: string | null;
  financial_transaction_id: string | null;
  debt_type: string;
  status: string;
  principal_amount_cents: number;
  outstanding_amount_cents: number;
  due_date: string | null;
  settled_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}): FinanceDebtDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    financial_payable_id: row.financial_payable_id,
    financial_receivable_id: row.financial_receivable_id,
    financial_transaction_id: row.financial_transaction_id,
    debt_type: row.debt_type,
    status: row.status as FinanceDebtDto['status'],
    principal_amount_cents: row.principal_amount_cents,
    outstanding_amount_cents: row.outstanding_amount_cents,
    due_date: row.due_date,
    settled_at: row.settled_at,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceDebts(organizationId: string, companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  debts: FinanceDebtDto[];
} {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const companyFilter = company?.id ?? null;

  const rows = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      financial_payable_id,
      financial_receivable_id,
      financial_transaction_id,
      debt_type,
      status,
      principal_amount_cents,
      outstanding_amount_cents,
      due_date,
      settled_at,
      note,
      created_at,
      updated_at
    from financial_debt
    where organization_id = ?
      and (? is null or company_id = ?)
    order by coalesce(due_date, created_at) asc, created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string;
    financial_payable_id: string | null;
    financial_receivable_id: string | null;
    financial_transaction_id: string | null;
    debt_type: string;
    status: string;
    principal_amount_cents: number;
    outstanding_amount_cents: number;
    due_date: string | null;
    settled_at: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    debts: rows.map(mapDebtRow)
  };
}

export function createFinanceDebt(input: CreateFinanceDebtInput): FinanceDebtDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (!companyId) {
    throw new Error('Informe company_id para registrar a contraparte.');
  }
  readCompanyRow(companyId);
  const nowIso = new Date().toISOString();
  const id = uuid('fdeb');

  const payableId = input.financial_payable_id?.trim() || null;
  const receivableId = input.financial_receivable_id?.trim() || null;
  const transactionId = input.financial_transaction_id?.trim() || null;

  if (payableId) {
    const payable = db.prepare(`
      select id from financial_payable
      where id = ? and organization_id = ? and company_id = ?
      limit 1
    `).get(payableId, normalizedOrganizationId, companyId) as { id: string } | undefined;
    if (!payable) throw new Error('Conta a pagar não encontrada.');
  }

  if (receivableId) {
    const receivable = db.prepare(`
      select id from financial_receivable
      where id = ? and organization_id = ? and company_id = ?
      limit 1
    `).get(receivableId, normalizedOrganizationId, companyId) as { id: string } | undefined;
    if (!receivable) throw new Error('Conta a receber não encontrada.');
  }

  if (transactionId) {
    const transaction = db.prepare(`
      select id from financial_transaction
      where id = ? and organization_id = ? and coalesce(is_deleted, 0) = 0
      limit 1
    `).get(transactionId, normalizedOrganizationId) as { id: string } | undefined;
    if (!transaction) throw new Error('Lançamento financeiro não encontrado.');
  }

  db.prepare(`
    insert into financial_debt (
      id,
      organization_id,
      company_id,
      financial_payable_id,
      financial_receivable_id,
      financial_transaction_id,
      debt_type,
      status,
      principal_amount_cents,
      outstanding_amount_cents,
      due_date,
      settled_at,
      note,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    payableId,
    receivableId,
    transactionId,
    input.debt_type.trim(),
    input.status,
    Math.trunc(input.principal_amount_cents),
    Math.trunc(input.outstanding_amount_cents),
    input.due_date ?? null,
    input.settled_at ?? null,
    input.note?.trim() || null,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      id,
      organization_id,
      company_id,
      financial_payable_id,
      financial_receivable_id,
      financial_transaction_id,
      debt_type,
      status,
      principal_amount_cents,
      outstanding_amount_cents,
      due_date,
      settled_at,
      note,
      created_at,
      updated_at
    from financial_debt
    where id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string;
    financial_payable_id: string | null;
    financial_receivable_id: string | null;
    financial_transaction_id: string | null;
    debt_type: string;
    status: string;
    principal_amount_cents: number;
    outstanding_amount_cents: number;
    due_date: string | null;
    settled_at: string | null;
    note: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;
  if (!created) {
    throw new Error('Falha ao criar dívida.');
  }
  return mapDebtRow(created);
}

function mapTransactionRow(row: FinanceTransactionRow): FinanceTransactionDto {
  const views = computeViews({
    kind: row.kind,
    status: row.status,
    amountCents: row.amount_cents,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    settlementDate: row.settlement_date,
    competenceDate: row.competence_date,
    isDeleted: Number(row.is_deleted) === 1
  });

  return {
    id: row.id,
    organization_id: row.organization_id,
    financial_entity_id: row.financial_entity_id,
    financial_entity_name: row.financial_entity_name ?? null,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name ?? null,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name ?? null,
    kind: row.kind,
    status: row.status,
    amount_cents: row.amount_cents,
    issue_date: row.issue_date,
    due_date: row.due_date,
    settlement_date: row.settlement_date,
    competence_date: row.competence_date,
    source: row.source,
    source_ref: row.source_ref,
    note: row.note,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_deleted: Number(row.is_deleted) === 1,
    views
  };
}

function readTransactionRow(
  transactionId: string,
  options?: { onlyActive?: boolean; organizationId?: string | null }
) {
  const whereActive = options?.onlyActive ? 'and coalesce(ft.is_deleted, 0) = 0' : '';
  const organizationFilter = options?.organizationId ? 'and ft.organization_id = ?' : '';
  const params: unknown[] = [transactionId];
  if (options?.organizationId) {
    params.push(options.organizationId);
  }
  const row = db.prepare(`
    select
      ft.id,
      ft.organization_id,
      ft.company_id,
      ft.financial_entity_id,
      ft.financial_account_id,
      ft.financial_category_id,
      ft.kind,
      ft.status,
      ft.amount_cents,
      ft.issue_date,
      ft.due_date,
      ft.settlement_date,
      ft.competence_date,
      ft.source,
      ft.source_ref,
      ft.note,
      ft.created_by,
      ft.created_at,
      ft.updated_at,
      ft.is_deleted,
      coalesce(fe.trade_name, fe.legal_name) as financial_entity_name,
      fa.name as financial_account_name,
      fc.name as financial_category_name
    from financial_transaction ft
    left join financial_entity fe
      on fe.organization_id = ft.organization_id
      and fe.id = ft.financial_entity_id
    left join financial_account fa
      on fa.organization_id = ft.organization_id
      and fa.id = ft.financial_account_id
    left join financial_category fc
      on fc.organization_id = ft.organization_id
      and fc.id = ft.financial_category_id
    where ft.id = ?
      ${organizationFilter}
      ${whereActive}
    limit 1
  `).get(...params) as FinanceTransactionRow | undefined;

  return row ?? null;
}

function buildTransactionLedgerConditions(
  filters?: FinanceTransactionListFilters
): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push('ft.status = ?');
    params.push(filters.status);
  }

  if (filters?.kind) {
    conditions.push('ft.kind = ?');
    params.push(filters.kind);
  }

  if (filters?.financial_account_id) {
    conditions.push('ft.financial_account_id = ?');
    params.push(filters.financial_account_id);
  }

  if (filters?.financial_category_id) {
    conditions.push('ft.financial_category_id = ?');
    params.push(filters.financial_category_id);
  }

  if (filters?.financial_entity_id) {
    conditions.push('ft.financial_entity_id = ?');
    params.push(filters.financial_entity_id);
  }

  const ledgerDateExpr = 'coalesce(ft.competence_date, ft.due_date, ft.issue_date, substr(ft.created_at, 1, 10))';
  if (filters?.from) {
    conditions.push(`${ledgerDateExpr} >= ?`);
    params.push(filters.from);
  }

  if (filters?.to) {
    conditions.push(`${ledgerDateExpr} <= ?`);
    params.push(filters.to);
  }

  if (filters?.search) {
    conditions.push(`
      lower(
        coalesce(ft.note, '') || ' ' ||
        coalesce(ft.source, '') || ' ' ||
        coalesce(ft.source_ref, '') || ' ' ||
        coalesce(fe.trade_name, '') || ' ' ||
        coalesce(fe.legal_name, '') || ' ' ||
        coalesce(fa.name, '') || ' ' ||
        coalesce(fc.name, '')
      ) like ?
    `);
    params.push(`%${filters.search.toLowerCase()}%`);
  }

  return {
    sql: conditions.length > 0 ? `and ${conditions.map((condition) => `(${condition.trim()})`).join(' and ')}` : '',
    params
  };
}

export function listFinanceTransactions(
  organizationId: string,
  filters?: FinanceTransactionListFilters
): { transactions: FinanceTransactionDto[] } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const ledgerConditions = buildTransactionLedgerConditions(filters);
  const whereDeleted = filters?.include_deleted ? '' : 'and coalesce(ft.is_deleted, 0) = 0';

  const rows = db.prepare(`
    select
      ft.id,
      ft.organization_id,
      ft.company_id,
      ft.financial_entity_id,
      ft.financial_account_id,
      ft.financial_category_id,
      ft.kind,
      ft.status,
      ft.amount_cents,
      ft.issue_date,
      ft.due_date,
      ft.settlement_date,
      ft.competence_date,
      ft.source,
      ft.source_ref,
      ft.note,
      ft.created_by,
      ft.created_at,
      ft.updated_at,
      ft.is_deleted,
      coalesce(fe.trade_name, fe.legal_name) as financial_entity_name,
      fa.name as financial_account_name,
      fc.name as financial_category_name
    from financial_transaction ft
    left join financial_entity fe
      on fe.organization_id = ft.organization_id
      and fe.id = ft.financial_entity_id
    left join financial_account fa
      on fa.organization_id = ft.organization_id
      and fa.id = ft.financial_account_id
    left join financial_category fc
      on fc.organization_id = ft.organization_id
      and fc.id = ft.financial_category_id
    where ft.organization_id = ?
      ${whereDeleted}
      ${ledgerConditions.sql}
    order by coalesce(ft.due_date, ft.competence_date, ft.issue_date, substr(ft.created_at, 1, 10)) desc,
      ft.created_at desc,
      ft.id desc
  `).all(normalizedOrganizationId, ...ledgerConditions.params) as FinanceTransactionRow[];

  return {
    transactions: rows.map(mapTransactionRow)
  };
}

export function getFinanceOverview(organizationId: string, companyId?: string | null): FinanceOverviewDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const organization = readOrganizationRow(normalizedOrganizationId);
  const company = resolveCompanyRow(companyId);
  const { transactions } = listFinanceTransactions(normalizedOrganizationId);

  return {
    organization_id: normalizedOrganizationId,
    organization_name: organization.name,
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    transaction_count: transactions.length,
    open_count: transactions.filter((transaction) => !transaction.settlement_date && transaction.status !== 'canceled').length,
    settled_count: transactions.filter((transaction) => Boolean(transaction.settlement_date) || transaction.status === 'settled').length,
    totals: transactions.reduce(
      (accumulator, transaction) => ({
        cash_cents: accumulator.cash_cents + transaction.views.cash_amount_cents,
        competence_cents: accumulator.competence_cents + transaction.views.competence_amount_cents,
        projected_cents: accumulator.projected_cents + transaction.views.projected_amount_cents,
        confirmed_cents: accumulator.confirmed_cents + transaction.views.confirmed_amount_cents
      }),
      {
        cash_cents: 0,
        competence_cents: 0,
        projected_cents: 0,
        confirmed_cents: 0
      }
    )
  };
}

export function getFinanceContext(organizationId: string): FinanceContextDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const organization = readOrganizationRow(normalizedOrganizationId);

  return {
    organization_id: normalizedOrganizationId,
    organization_name: organization.name,
    currency: 'BRL',
    timezone: 'America/Sao_Paulo'
  };
}

export function createFinanceTransaction(input: CreateFinanceTransactionInput): FinanceTransactionDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const financialEntityId = input.financial_entity_id?.trim() || null;

  if (financialEntityId) {
    readFinanceEntityRow(normalizedOrganizationId, financialEntityId);
  }

  const nowIso = new Date().toISOString();
  const transactionId = uuid('ftxn');
  const status = resolveDefaultStatus({
    status: input.status,
    settlement_date: input.settlement_date ?? null
  });
  const settlementDate = input.settlement_date ?? null;
  assertSettlementConsistency(status, settlementDate);

  db.prepare(`
    insert into financial_transaction (
      id,
      organization_id,
      company_id,
      financial_entity_id,
      financial_account_id,
      financial_category_id,
      kind,
      status,
      amount_cents,
      issue_date,
      due_date,
      settlement_date,
      competence_date,
      source,
      source_ref,
      note,
      created_by,
      created_at,
      updated_at,
      is_deleted
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', null, ?, ?, ?, ?, 0)
  `).run(
    transactionId,
    normalizedOrganizationId,
    null,
    financialEntityId,
    input.financial_account_id ?? null,
    input.financial_category_id ?? null,
    input.kind,
    status,
    Math.trunc(input.amount_cents),
    input.issue_date ?? null,
    input.due_date ?? null,
    settlementDate,
    input.competence_date ?? null,
    input.note ?? null,
    input.created_by ?? null,
    nowIso,
    nowIso
  );

  const created = readTransactionRow(transactionId, { organizationId: normalizedOrganizationId });
  if (!created) {
    throw new Error('Falha ao criar lançamento financeiro.');
  }
  return mapTransactionRow(created);
}

export function updateFinanceTransaction(
  organizationId: string,
  transactionId: string,
  input: UpdateFinanceTransactionInput
): FinanceTransactionDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const current = readTransactionRow(transactionId, { onlyActive: true, organizationId: normalizedOrganizationId });
  if (!current) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const nextSettlementDate = Object.prototype.hasOwnProperty.call(input, 'settlement_date')
    ? input.settlement_date ?? null
    : current.settlement_date;
  const nextStatus = resolveDefaultStatus({
    status: input.status ?? current.status,
    settlement_date: nextSettlementDate
  });
  assertSettlementConsistency(nextStatus, nextSettlementDate);
  const nextFinancialEntityId = Object.prototype.hasOwnProperty.call(input, 'financial_entity_id')
    ? input.financial_entity_id?.trim() || null
    : current.financial_entity_id;

  if (nextFinancialEntityId) {
    readFinanceEntityRow(normalizedOrganizationId, nextFinancialEntityId);
  }

  db.prepare(`
    update financial_transaction
    set
      financial_entity_id = ?,
      financial_account_id = ?,
      financial_category_id = ?,
      kind = ?,
      status = ?,
      amount_cents = ?,
      issue_date = ?,
      due_date = ?,
      settlement_date = ?,
      competence_date = ?,
      note = ?,
      updated_at = ?
    where id = ?
      and organization_id = ?
  `).run(
    nextFinancialEntityId,
    Object.prototype.hasOwnProperty.call(input, 'financial_account_id')
      ? input.financial_account_id ?? null
      : current.financial_account_id,
    Object.prototype.hasOwnProperty.call(input, 'financial_category_id')
      ? input.financial_category_id ?? null
      : current.financial_category_id,
    input.kind ?? current.kind,
    nextStatus,
    Object.prototype.hasOwnProperty.call(input, 'amount_cents')
      ? Math.trunc(input.amount_cents ?? current.amount_cents)
      : current.amount_cents,
    Object.prototype.hasOwnProperty.call(input, 'issue_date')
      ? input.issue_date ?? null
      : current.issue_date,
    Object.prototype.hasOwnProperty.call(input, 'due_date')
      ? input.due_date ?? null
      : current.due_date,
    nextSettlementDate,
    Object.prototype.hasOwnProperty.call(input, 'competence_date')
      ? input.competence_date ?? null
      : current.competence_date,
    Object.prototype.hasOwnProperty.call(input, 'note')
      ? input.note ?? null
      : current.note,
    new Date().toISOString(),
    transactionId,
    normalizedOrganizationId
  );

  const updated = readTransactionRow(transactionId, { organizationId: normalizedOrganizationId });
  if (!updated) {
    throw new Error('Lançamento financeiro não encontrado.');
  }
  return mapTransactionRow(updated);
}

export function softDeleteFinanceTransaction(organizationId: string, transactionId: string): FinanceTransactionDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const current = readTransactionRow(transactionId, { onlyActive: true, organizationId: normalizedOrganizationId });
  if (!current) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const result = db.prepare(`
    update financial_transaction
    set is_deleted = 1, updated_at = ?
    where id = ?
      and organization_id = ?
      and coalesce(is_deleted, 0) = 0
  `).run(new Date().toISOString(), transactionId, normalizedOrganizationId);
  if (result.changes === 0) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const deleted = readTransactionRow(transactionId, { organizationId: normalizedOrganizationId });
  if (!deleted) {
    throw new Error('Lançamento financeiro não encontrado.');
  }
  return mapTransactionRow(deleted);
}
