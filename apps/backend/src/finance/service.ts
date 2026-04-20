import { db, uuid } from '../db.js';
import { computeViews } from './ledger.js';
import type {
  CreateFinanceAccountInput,
  CreateFinanceImportJobInput,
  CreateFinancePayableInput,
  CreateFinanceReconciliationMatchInput,
  CreateFinanceReceivableInput,
  CreateFinanceStatementEntryInput,
  CreateFinanceCategoryInput,
  CreateFinanceTransactionInput,
  FinanceAccountDto,
  FinanceImportJobDto,
  FinancePayableDto,
  FinanceReconciliationMatchDto,
  FinanceReceivableDto,
  FinanceStatementEntryDto,
  FinanceCategoryDto,
  FinanceOverviewDto,
  FinanceTransactionDto,
  FinanceTransactionRow,
  FinanceTransactionStatus,
  UpdateFinanceTransactionInput
} from './types.js';

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
  if (companyId) {
    return readCompanyRow(companyId);
  }

  const row = db.prepare(`
    select id, name
    from company
    order by name collate nocase asc, id asc
    limit 1
  `).get() as { id: string; name: string } | undefined;

  return row ?? null;
}

function mapAccountRow(row: {
  id: string;
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
    company_id: row.company_id,
    name: row.name,
    kind: row.kind as FinanceCategoryDto['kind'],
    parent_category_id: row.parent_category_id,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function listFinanceAccounts(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  accounts: FinanceAccountDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return {
      company_id: null,
      company_name: null,
      accounts: []
    };
  }

  const rows = db.prepare(`
    select
      id,
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
    where company_id = ?
    order by is_active desc, name collate nocase asc, created_at desc
  `).all(company.id) as Array<{
    id: string;
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
    company_id: company.id,
    company_name: company.name,
    accounts: rows.map(mapAccountRow)
  };
}

export function listFinanceCategories(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  categories: FinanceCategoryDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return {
      company_id: null,
      company_name: null,
      categories: []
    };
  }

  const rows = db.prepare(`
    select
      id,
      company_id,
      name,
      kind,
      parent_category_id,
      is_active,
      created_at,
      updated_at
    from financial_category
    where company_id = ?
    order by is_active desc, name collate nocase asc, created_at desc
  `).all(company.id) as Array<{
    id: string;
    company_id: string;
    name: string;
    kind: string;
    parent_category_id: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
  }>;

  return {
    company_id: company.id,
    company_name: company.name,
    categories: rows.map(mapCategoryRow)
  };
}

export function createFinanceAccount(input: CreateFinanceAccountInput): FinanceAccountDto {
  readCompanyRow(input.company_id);
  const nowIso = new Date().toISOString();
  const id = uuid('facc');

  db.prepare(`
    insert into financial_account (
      id,
      company_id,
      name,
      kind,
      currency,
      account_number,
      branch_number,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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
  readCompanyRow(input.company_id);
  const nowIso = new Date().toISOString();
  const id = uuid('fcat');
  const parentCategoryId = input.parent_category_id?.trim() || null;
  if (parentCategoryId) {
    const parent = db.prepare(`
      select id
      from financial_category
      where id = ?
        and company_id = ?
      limit 1
    `).get(parentCategoryId, input.company_id) as { id: string } | undefined;
    if (!parent) {
      throw new Error('Categoria pai não encontrada.');
    }
  }

  db.prepare(`
    insert into financial_category (
      id,
      company_id,
      name,
      kind,
      parent_category_id,
      is_active,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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

export function listFinancePayables(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  payables: FinancePayableDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return {
      company_id: null,
      company_name: null,
      payables: []
    };
  }

  const rows = db.prepare(`
    select
      fp.id,
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
      on fa.company_id = fp.company_id
      and fa.id = fp.financial_account_id
    left join financial_category fc
      on fc.company_id = fp.company_id
      and fc.id = fp.financial_category_id
    where fp.company_id = ?
    order by coalesce(fp.due_date, fp.issue_date, substr(fp.created_at, 1, 10)) asc, fp.created_at desc
  `).all(company.id) as Array<{
    id: string;
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
    company_id: company.id,
    company_name: company.name,
    payables: rows.map(mapPayableRow)
  };
}

export function listFinanceReceivables(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  receivables: FinanceReceivableDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return {
      company_id: null,
      company_name: null,
      receivables: []
    };
  }

  const rows = db.prepare(`
    select
      fr.id,
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
      on fa.company_id = fr.company_id
      and fa.id = fr.financial_account_id
    left join financial_category fc
      on fc.company_id = fr.company_id
      and fc.id = fr.financial_category_id
    where fr.company_id = ?
    order by coalesce(fr.due_date, fr.issue_date, substr(fr.created_at, 1, 10)) asc, fr.created_at desc
  `).all(company.id) as Array<{
    id: string;
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
    company_id: company.id,
    company_name: company.name,
    receivables: rows.map(mapReceivableRow)
  };
}

export function createFinancePayable(input: CreateFinancePayableInput): FinancePayableDto {
  readCompanyRow(input.company_id);
  const nowIso = new Date().toISOString();
  const id = uuid('fpay');

  db.prepare(`
    insert into financial_payable (
      id,
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
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', null, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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
      on fa.company_id = fp.company_id
      and fa.id = fp.financial_account_id
    left join financial_category fc
      on fc.company_id = fp.company_id
      and fc.id = fp.financial_category_id
    where fp.id = ?
    limit 1
  `).get(id) as {
    id: string;
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
  readCompanyRow(input.company_id);
  const nowIso = new Date().toISOString();
  const id = uuid('frec');

  db.prepare(`
    insert into financial_receivable (
      id,
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
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', null, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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
      on fa.company_id = fr.company_id
      and fa.id = fr.financial_account_id
    left join financial_category fc
      on fc.company_id = fr.company_id
      and fc.id = fr.financial_category_id
    where fr.id = ?
    limit 1
  `).get(id) as {
    id: string;
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

export function listFinanceImportJobs(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  jobs: FinanceImportJobDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return { company_id: null, company_name: null, jobs: [] };
  }

  const rows = db.prepare(`
    select
      id,
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
    where company_id = ?
    order by created_at desc, id desc
  `).all(company.id) as Array<{
    id: string;
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
    company_id: company.id,
    company_name: company.name,
    jobs: rows.map(mapImportJobRow)
  };
}

export function createFinanceImportJob(input: CreateFinanceImportJobInput): FinanceImportJobDto {
  readCompanyRow(input.company_id);
  const nowIso = new Date().toISOString();
  const id = uuid('fimp');

  db.prepare(`
    insert into financial_import_job (
      id,
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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

export function listFinanceStatementEntries(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  entries: FinanceStatementEntryDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return { company_id: null, company_name: null, entries: [] };
  }

  const rows = db.prepare(`
    select
      fbe.id,
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
      on fa.company_id = fbe.company_id
      and fa.id = fbe.financial_account_id
    where fbe.company_id = ?
    order by fbe.statement_date desc, fbe.created_at desc
  `).all(company.id) as Array<{
    id: string;
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
    company_id: company.id,
    company_name: company.name,
    entries: rows.map(mapStatementEntryRow)
  };
}

export function createFinanceStatementEntry(input: CreateFinanceStatementEntryInput): FinanceStatementEntryDto {
  readCompanyRow(input.company_id);
  const account = db.prepare(`
    select id
    from financial_account
    where id = ?
      and company_id = ?
    limit 1
  `).get(input.financial_account_id, input.company_id) as { id: string } | undefined;
  if (!account) {
    throw new Error('Conta financeira não encontrada.');
  }

  const importJobId = input.financial_import_job_id?.trim() || null;
  if (importJobId) {
    const importJob = db.prepare(`
      select id
      from financial_import_job
      where id = ?
        and company_id = ?
      limit 1
    `).get(importJobId, input.company_id) as { id: string } | undefined;
    if (!importJob) {
      throw new Error('Job de importação não encontrado.');
    }
  }

  const nowIso = new Date().toISOString();
  const id = uuid('fstm');
  db.prepare(`
    insert into financial_bank_statement_entry (
      id,
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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
      on fa.company_id = fbe.company_id
      and fa.id = fbe.financial_account_id
    where fbe.id = ?
    limit 1
  `).get(id) as {
    id: string;
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

export function listFinanceReconciliationMatches(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  matches: FinanceReconciliationMatchDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return { company_id: null, company_name: null, matches: [] };
  }

  const rows = db.prepare(`
    select
      id,
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
    where company_id = ?
    order by created_at desc, id desc
  `).all(company.id) as Array<{
    id: string;
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
    company_id: company.id,
    company_name: company.name,
    matches: rows.map(mapReconciliationRow)
  };
}

export function createFinanceReconciliationMatch(input: CreateFinanceReconciliationMatchInput): FinanceReconciliationMatchDto {
  readCompanyRow(input.company_id);

  const statementEntry = db.prepare(`
    select id
    from financial_bank_statement_entry
    where id = ?
      and company_id = ?
    limit 1
  `).get(input.financial_bank_statement_entry_id, input.company_id) as { id: string } | undefined;
  if (!statementEntry) {
    throw new Error('Lançamento de extrato não encontrado.');
  }

  const transactionId = input.financial_transaction_id.trim();
  const transaction = db.prepare(`
    select id
    from financial_transaction
    where id = ?
      and company_id = ?
      and coalesce(is_deleted, 0) = 0
    limit 1
  `).get(transactionId, input.company_id) as { id: string } | undefined;
  if (!transaction) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const statementAmount = db.prepare(`
    select amount_cents
    from financial_bank_statement_entry
    where id = ?
      and company_id = ?
    limit 1
  `).get(input.financial_bank_statement_entry_id, input.company_id) as { amount_cents: number } | undefined;
  const matchedAmountCents = Math.abs(statementAmount?.amount_cents ?? 0);
  const matchedAt = input.reviewed_at ?? new Date().toISOString();

  const nowIso = new Date().toISOString();
  const id = uuid('frecm');
  db.prepare(`
    insert into financial_reconciliation_match (
      id,
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.company_id,
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
    company_id: row.company_id,
    company_name: row.company_name ?? null,
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

function readTransactionRow(transactionId: string, options?: { onlyActive?: boolean }) {
  const whereActive = options?.onlyActive ? 'and coalesce(ft.is_deleted, 0) = 0' : '';
  const row = db.prepare(`
    select
      ft.id,
      ft.company_id,
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
      c.name as company_name,
      fa.name as financial_account_name,
      fc.name as financial_category_name
    from financial_transaction ft
    join company c on c.id = ft.company_id
    left join financial_account fa
      on fa.company_id = ft.company_id
      and fa.id = ft.financial_account_id
    left join financial_category fc
      on fc.company_id = ft.company_id
      and fc.id = ft.financial_category_id
    where ft.id = ?
      ${whereActive}
    limit 1
  `).get(transactionId) as FinanceTransactionRow | undefined;

  return row ?? null;
}

export function listFinanceTransactions(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  transactions: FinanceTransactionDto[];
} {
  const company = resolveCompanyRow(companyId);
  if (!company) {
    return {
      company_id: null,
      company_name: null,
      transactions: []
    };
  }

  const rows = db.prepare(`
    select
      ft.id,
      ft.company_id,
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
      c.name as company_name,
      fa.name as financial_account_name,
      fc.name as financial_category_name
    from financial_transaction ft
    join company c on c.id = ft.company_id
    left join financial_account fa
      on fa.company_id = ft.company_id
      and fa.id = ft.financial_account_id
    left join financial_category fc
      on fc.company_id = ft.company_id
      and fc.id = ft.financial_category_id
    where ft.company_id = ?
      and coalesce(ft.is_deleted, 0) = 0
    order by coalesce(ft.due_date, ft.competence_date, ft.issue_date, substr(ft.created_at, 1, 10)) desc,
      ft.created_at desc,
      ft.id desc
  `).all(company.id) as FinanceTransactionRow[];

  return {
    company_id: company.id,
    company_name: company.name,
    transactions: rows.map(mapTransactionRow)
  };
}

export function getFinanceOverview(companyId?: string | null): FinanceOverviewDto {
  const { company_id, company_name, transactions } = listFinanceTransactions(companyId);

  return {
    company_id,
    company_name,
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

export function createFinanceTransaction(input: CreateFinanceTransactionInput): FinanceTransactionDto {
  readCompanyRow(input.company_id);

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
      company_id,
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', null, ?, ?, ?, ?, 0)
  `).run(
    transactionId,
    input.company_id,
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

  const created = readTransactionRow(transactionId);
  if (!created) {
    throw new Error('Falha ao criar lançamento financeiro.');
  }
  return mapTransactionRow(created);
}

export function updateFinanceTransaction(
  transactionId: string,
  input: UpdateFinanceTransactionInput
): FinanceTransactionDto {
  const current = readTransactionRow(transactionId, { onlyActive: true });
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

  db.prepare(`
    update financial_transaction
    set
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
  `).run(
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
    transactionId
  );

  const updated = readTransactionRow(transactionId);
  if (!updated) {
    throw new Error('Lançamento financeiro não encontrado.');
  }
  return mapTransactionRow(updated);
}

export function softDeleteFinanceTransaction(transactionId: string): FinanceTransactionDto {
  const current = readTransactionRow(transactionId, { onlyActive: true });
  if (!current) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const result = db.prepare(`
    update financial_transaction
    set is_deleted = 1, updated_at = ?
    where id = ?
      and coalesce(is_deleted, 0) = 0
  `).run(new Date().toISOString(), transactionId);
  if (result.changes === 0) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  const deleted = readTransactionRow(transactionId);
  if (!deleted) {
    throw new Error('Lançamento financeiro não encontrado.');
  }
  return mapTransactionRow(deleted);
}
