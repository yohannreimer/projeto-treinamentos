import { db, uuid } from '../db.js';
import { getFinanceEntityDefaultProfile } from './entities.js';
import { computeViews } from './ledger.js';
import type {
  CreateFinanceAccountInput,
  CreateFinanceAttachmentInput,
  CreateFinanceAutomationRuleInput,
  CreateFinanceBankIntegrationInput,
  CreateFinanceDebtInput,
  CreateFinanceImportJobInput,
  CreateFinanceSimulationItemInput,
  CreateFinanceSimulationScenarioInput,
  CreateFinancePayableInput,
  CreateFinanceReconciliationMatchInput,
  CreateFinanceReceivableInput,
  CreateFinanceRecurringRuleInput,
  CreateFinanceStatementEntryInput,
  CreateFinanceTransactionFromStatementInput,
  CreateFinanceCategoryInput,
  CreateFinanceTransactionInput,
  FinanceAccountDto,
  FinanceAdvancedDashboardDto,
  FinanceAdvancedApprovalDto,
  FinanceAttachmentDto,
  FinanceAuditEntryDto,
  FinanceAutomationRuleDto,
  FinanceBankIntegrationDto,
  FinanceDebtDto,
  FinanceImportJobDto,
  FinancePayableDto,
  FinancePayablesListDto,
  FinanceReconciliationInboxDto,
  FinanceReconciliationInsightDto,
  FinanceReconciliationLearnedRuleDto,
  FinanceReconciliationMatchDto,
  FinanceReconciliationBucketDto,
  FinanceReconciliationBucketKey,
  FinanceReconciliationSuggestionReasonDto,
  FinanceReceivableDto,
  FinanceReceivablesListDto,
  FinanceReconciliationSuggestionDto,
  FinanceSimulationDetailDto,
  FinanceSimulationItemDto,
  FinanceSimulationItemKind,
  FinanceSimulationResultDto,
  FinanceSimulationScenarioDto,
  FinanceSimulationSourceDto,
  FinanceRecurringRuleDto,
  FinanceRecurringRuleResourceType,
  FinanceStatementTransactionResultDto,
  FinanceStatementEntryDto,
  FinanceCategoryDto,
  FinanceContextDto,
  FinanceOverviewDto,
  FinanceOperationInput,
  FinancePartialSettlementInput,
  FinanceScheduleOperationInput,
  FinanceTransactionDto,
  FinanceTransactionRow,
  FinanceTransactionListFilters,
  FinanceTransactionStatus,
  UpdateFinanceAccountInput,
  UpdateFinanceCategoryInput,
  UpdateFinanceRecurringRuleInput,
  UpdateFinanceSimulationItemInput,
  UpdateFinanceSimulationScenarioInput,
  UpdateFinanceTransactionInput
} from './types.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';
type FinanceOperationalGroupKey = 'overdue' | 'due_today' | 'upcoming' | 'settled';

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
  company_id: string | null;
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
  company_id: string | null;
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
    company_id: string | null;
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
    company_id: string | null;
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
  if (companyId) {
    readCompanyRow(companyId);
  }
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
    company_id: string | null;
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

function readFinanceAccountRow(organizationId: string, accountId: string) {
  const row = db.prepare(`
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
    where organization_id = ? and id = ?
    limit 1
  `).get(organizationId, accountId) as Parameters<typeof mapAccountRow>[0] | undefined;

  if (!row) {
    throw new Error('Conta financeira não encontrada.');
  }

  return row;
}

export function updateFinanceAccount(input: UpdateFinanceAccountInput): FinanceAccountDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const current = readFinanceAccountRow(normalizedOrganizationId, input.financial_account_id);
  const nowIso = new Date().toISOString();

  db.prepare(`
    update financial_account
    set name = ?,
        kind = ?,
        currency = ?,
        account_number = ?,
        branch_number = ?,
        is_active = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.name?.trim() || current.name,
    input.kind ?? current.kind,
    (input.currency?.trim().toUpperCase() || current.currency).slice(0, 8),
    Object.prototype.hasOwnProperty.call(input, 'account_number') ? input.account_number?.trim() || null : current.account_number,
    Object.prototype.hasOwnProperty.call(input, 'branch_number') ? input.branch_number?.trim() || null : current.branch_number,
    typeof input.is_active === 'boolean' ? (input.is_active ? 1 : 0) : current.is_active,
    nowIso,
    normalizedOrganizationId,
    input.financial_account_id
  );

  return mapAccountRow(readFinanceAccountRow(normalizedOrganizationId, input.financial_account_id));
}

export function deactivateFinanceAccount(organizationId: string, accountId: string): FinanceAccountDto {
  return updateFinanceAccount({
    organization_id: organizationId,
    financial_account_id: accountId,
    is_active: false
  });
}

export function createFinanceCategory(input: CreateFinanceCategoryInput): FinanceCategoryDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = input.company_id?.trim() || null;
  if (companyId) {
    readCompanyRow(companyId);
  }
  const nowIso = new Date().toISOString();
  const id = uuid('fcat');
  const parentCategoryId = input.parent_category_id?.trim() || null;
  if (parentCategoryId) {
    const parent = db.prepare(`
      select id
      from financial_category
      where id = ?
        and organization_id = ?
        and (
          (? is null and company_id is null)
          or company_id = ?
        )
      limit 1
    `).get(parentCategoryId, normalizedOrganizationId, companyId, companyId) as { id: string } | undefined;
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
    company_id: string | null;
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

function readFinanceCategoryRow(organizationId: string, categoryId: string) {
  const row = db.prepare(`
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
    where organization_id = ? and id = ?
    limit 1
  `).get(organizationId, categoryId) as Parameters<typeof mapCategoryRow>[0] | undefined;

  if (!row) {
    throw new Error('Categoria financeira não encontrada.');
  }

  return row;
}

export function updateFinanceCategory(input: UpdateFinanceCategoryInput): FinanceCategoryDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const current = readFinanceCategoryRow(normalizedOrganizationId, input.financial_category_id);
  const nowIso = new Date().toISOString();
  const hasParent = Object.prototype.hasOwnProperty.call(input, 'parent_category_id');
  const parentCategoryId = hasParent ? input.parent_category_id?.trim() || null : current.parent_category_id;

  if (parentCategoryId) {
    if (parentCategoryId === input.financial_category_id) {
      throw new Error('Categoria pai não pode ser a própria categoria.');
    }
    const parent = db.prepare(`
      select id
      from financial_category
      where id = ?
        and organization_id = ?
        and (
          (? is null and company_id is null)
          or company_id = ?
        )
      limit 1
    `).get(parentCategoryId, normalizedOrganizationId, current.company_id, current.company_id) as { id: string } | undefined;
    if (!parent) {
      throw new Error('Categoria pai não encontrada.');
    }
  }

  db.prepare(`
    update financial_category
    set name = ?,
        kind = ?,
        parent_category_id = ?,
        is_active = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.name?.trim() || current.name,
    input.kind ?? current.kind,
    parentCategoryId,
    typeof input.is_active === 'boolean' ? (input.is_active ? 1 : 0) : current.is_active,
    nowIso,
    normalizedOrganizationId,
    input.financial_category_id
  );

  return mapCategoryRow(readFinanceCategoryRow(normalizedOrganizationId, input.financial_category_id));
}

export function deactivateFinanceCategory(organizationId: string, categoryId: string): FinanceCategoryDto {
  return updateFinanceCategory({
    organization_id: organizationId,
    financial_category_id: categoryId,
    is_active: false
  });
}

function mapPayableRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  financial_transaction_id: string | null;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  supplier_name: string | null;
  description: string;
  amount_cents: number;
  paid_amount_cents: number;
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
    financial_entity_id: row.financial_entity_id,
    financial_entity_name: row.financial_entity_name,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    financial_cost_center_id: row.financial_cost_center_id,
    financial_cost_center_name: row.financial_cost_center_name,
    financial_payment_method_id: row.financial_payment_method_id,
    financial_payment_method_name: row.financial_payment_method_name,
    supplier_name: row.supplier_name,
    description: row.description,
    amount_cents: row.amount_cents,
    paid_amount_cents: Number(row.paid_amount_cents ?? 0),
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
  company_id: string | null;
  financial_transaction_id: string | null;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  customer_name: string | null;
  description: string;
  amount_cents: number;
  received_amount_cents: number;
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
    financial_entity_id: row.financial_entity_id,
    financial_entity_name: row.financial_entity_name,
    financial_account_id: row.financial_account_id,
    financial_account_name: row.financial_account_name,
    financial_category_id: row.financial_category_id,
    financial_category_name: row.financial_category_name,
    financial_cost_center_id: row.financial_cost_center_id,
    financial_cost_center_name: row.financial_cost_center_name,
    financial_payment_method_id: row.financial_payment_method_id,
    financial_payment_method_name: row.financial_payment_method_name,
    customer_name: row.customer_name,
    description: row.description,
    amount_cents: row.amount_cents,
    received_amount_cents: Number(row.received_amount_cents ?? 0),
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

function mapRecurringRuleRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  resource_type: string;
  template_resource_id: string;
  name: string;
  frequency: string;
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  materialization_months: number;
  status: string;
  last_materialized_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceRecurringRuleDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    resource_type: row.resource_type as FinanceRecurringRuleResourceType,
    template_resource_id: row.template_resource_id,
    name: row.name,
    frequency: 'monthly',
    day_of_month: Number(row.day_of_month),
    start_date: row.start_date,
    end_date: row.end_date,
    materialization_months: Number(row.materialization_months),
    status: row.status as FinanceRecurringRuleDto['status'],
    last_materialized_until: row.last_materialized_until,
    next_due_date: row.status === 'active' ? nextRuleDueDate(row.start_date, row.day_of_month, row.end_date, row.last_materialized_until) : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function getOperationalTodayIso() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function buildOperationalGroups<T>(rows: T[], options: {
  getAmountCents: (row: T) => number;
  getDueDate: (row: T) => string | null;
  getStatus: (row: T) => string;
  isCanceled: (row: T) => boolean;
  isSettled: (row: T) => boolean;
}) {
  const todayIso = getOperationalTodayIso();
  const groups: Record<FinanceOperationalGroupKey, T[]> = {
    overdue: [],
    due_today: [],
    upcoming: [],
    settled: []
  };
  const summary = {
    open_cents: 0,
    overdue_cents: 0,
    due_today_cents: 0
  };

  for (const row of rows) {
    if (options.isCanceled(row)) {
      continue;
    }

    const dueDate = options.getDueDate(row);
    const status = options.getStatus(row);
    const amountCents = options.getAmountCents(row);

    if (options.isSettled(row)) {
      groups.settled.push(row);
      continue;
    }

    if (status === 'overdue' || (dueDate && dueDate < todayIso)) {
      groups.overdue.push(row);
      summary.open_cents += amountCents;
      summary.overdue_cents += amountCents;
      continue;
    }

    if (dueDate === todayIso) {
      groups.due_today.push(row);
      summary.open_cents += amountCents;
      summary.due_today_cents += amountCents;
      continue;
    }

    groups.upcoming.push(row);
    summary.open_cents += amountCents;
  }

  return { summary, groups };
}

export function listFinancePayables(organizationId: string, companyId?: string | null): FinancePayablesListDto {
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
      fp.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name) as financial_entity_name,
      fp.financial_account_id,
      fa.name as financial_account_name,
      fp.financial_category_id,
      fc.name as financial_category_name,
      fp.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      fp.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      fp.supplier_name,
      fp.description,
      fp.amount_cents,
      fp.paid_amount_cents,
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
    left join financial_entity fe
      on fe.organization_id = fp.organization_id
      and fe.id = fp.financial_entity_id
    left join financial_account fa
      on fa.organization_id = fp.organization_id
      and fa.id = fp.financial_account_id
    left join financial_category fc
      on fc.organization_id = fp.organization_id
      and fc.id = fp.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = fp.organization_id
      and fcc.id = fp.financial_cost_center_id
    left join financial_payment_method fpm
      on fpm.organization_id = fp.organization_id
      and fpm.id = fp.financial_payment_method_id
    where fp.organization_id = ?
      and (? is null or fp.company_id = ?)
    order by coalesce(fp.due_date, fp.issue_date, substr(fp.created_at, 1, 10)) asc, fp.created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string | null;
    financial_transaction_id: string | null;
    financial_entity_id: string | null;
    financial_entity_name: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    financial_cost_center_id: string | null;
    financial_cost_center_name: string | null;
    financial_payment_method_id: string | null;
    financial_payment_method_name: string | null;
    supplier_name: string | null;
    description: string;
    amount_cents: number;
    paid_amount_cents: number;
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
  const payables = rows.map(mapPayableRow);
  const operational = buildOperationalGroups(payables, {
    getAmountCents: (row) => Math.max(0, row.amount_cents - row.paid_amount_cents),
    getDueDate: (row) => row.due_date,
    getStatus: (row) => row.status,
    isCanceled: (row) => row.status === 'canceled',
    isSettled: (row) => row.status === 'paid' || row.paid_amount_cents >= row.amount_cents || Boolean(row.paid_at)
  });

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    payables,
    summary: operational.summary,
    groups: operational.groups
  };
}

export function listFinanceReceivables(organizationId: string, companyId?: string | null): FinanceReceivablesListDto {
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
      fr.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name) as financial_entity_name,
      fr.financial_account_id,
      fa.name as financial_account_name,
      fr.financial_category_id,
      fc.name as financial_category_name,
      fr.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      fr.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      fr.customer_name,
      fr.description,
      fr.amount_cents,
      fr.received_amount_cents,
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
    left join financial_entity fe
      on fe.organization_id = fr.organization_id
      and fe.id = fr.financial_entity_id
    left join financial_account fa
      on fa.organization_id = fr.organization_id
      and fa.id = fr.financial_account_id
    left join financial_category fc
      on fc.organization_id = fr.organization_id
      and fc.id = fr.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = fr.organization_id
      and fcc.id = fr.financial_cost_center_id
    left join financial_payment_method fpm
      on fpm.organization_id = fr.organization_id
      and fpm.id = fr.financial_payment_method_id
    where fr.organization_id = ?
      and (? is null or fr.company_id = ?)
    order by coalesce(fr.due_date, fr.issue_date, substr(fr.created_at, 1, 10)) asc, fr.created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string | null;
    financial_transaction_id: string | null;
    financial_entity_id: string | null;
    financial_entity_name: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    financial_cost_center_id: string | null;
    financial_cost_center_name: string | null;
    financial_payment_method_id: string | null;
    financial_payment_method_name: string | null;
    customer_name: string | null;
    description: string;
    amount_cents: number;
    received_amount_cents: number;
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
  const receivables = rows.map(mapReceivableRow);
  const operational = buildOperationalGroups(receivables, {
    getAmountCents: (row) => Math.max(0, row.amount_cents - row.received_amount_cents),
    getDueDate: (row) => row.due_date,
    getStatus: (row) => row.status,
    isCanceled: (row) => row.status === 'canceled',
    isSettled: (row) => row.status === 'received' || row.received_amount_cents >= row.amount_cents || Boolean(row.received_at)
  });

  return {
    company_id: company?.id ?? null,
    company_name: company?.name ?? null,
    receivables,
    summary: operational.summary,
    groups: operational.groups
  };
}

function applyEntityDefaultsToPayable(input: CreateFinancePayableInput): CreateFinancePayableInput {
  if (!input.financial_entity_id) {
    return input;
  }
  const defaults = getFinanceEntityDefaultProfile(input.organization_id, input.financial_entity_id, 'payable');
  if (!defaults) {
    return input;
  }

  return {
    ...input,
    financial_category_id: input.financial_category_id ?? defaults.financial_category_id,
    financial_cost_center_id: input.financial_cost_center_id ?? defaults.financial_cost_center_id,
    financial_account_id: input.financial_account_id ?? defaults.financial_account_id,
    financial_payment_method_id: input.financial_payment_method_id ?? defaults.financial_payment_method_id
  };
}

function applyEntityDefaultsToReceivable(input: CreateFinanceReceivableInput): CreateFinanceReceivableInput {
  if (!input.financial_entity_id) {
    return input;
  }
  const defaults = getFinanceEntityDefaultProfile(input.organization_id, input.financial_entity_id, 'receivable');
  if (!defaults) {
    return input;
  }

  return {
    ...input,
    financial_category_id: input.financial_category_id ?? defaults.financial_category_id,
    financial_cost_center_id: input.financial_cost_center_id ?? defaults.financial_cost_center_id,
    financial_account_id: input.financial_account_id ?? defaults.financial_account_id,
    financial_payment_method_id: input.financial_payment_method_id ?? defaults.financial_payment_method_id
  };
}

export function createFinancePayable(input: CreateFinancePayableInput): FinancePayableDto {
  const payload = applyEntityDefaultsToPayable(input);
  const normalizedOrganizationId = resolveOrganizationId(payload.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = payload.company_id?.trim() || null;
  const financialEntityId = payload.financial_entity_id?.trim() || null;
  if (financialEntityId) {
    readFinanceEntityRow(normalizedOrganizationId, financialEntityId);
  }
  const nowIso = new Date().toISOString();
  const id = uuid('fpay');

  db.prepare(`
    insert into financial_payable (
      id,
      organization_id,
      company_id,
      financial_transaction_id,
      financial_entity_id,
      financial_account_id,
      financial_category_id,
      financial_cost_center_id,
      financial_payment_method_id,
      supplier_name,
      description,
      amount_cents,
      paid_amount_cents,
      status,
      issue_date,
      due_date,
      paid_at,
      source,
      source_ref,
      note,
      created_at,
      updated_at
    ) values (?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    financialEntityId,
    payload.financial_account_id ?? null,
    payload.financial_category_id ?? null,
    payload.financial_cost_center_id ?? null,
    payload.financial_payment_method_id ?? null,
    payload.supplier_name?.trim() || null,
    payload.description.trim(),
    Math.trunc(payload.amount_cents),
    Math.min(Math.trunc(payload.paid_amount_cents ?? (payload.status === 'paid' ? payload.amount_cents : 0)), Math.trunc(payload.amount_cents)),
    payload.status,
    payload.issue_date ?? null,
    payload.due_date ?? null,
    payload.paid_at ?? null,
    payload.source?.trim() || 'manual',
    payload.source_ref?.trim() || null,
    payload.note?.trim() || null,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      fp.id,
      fp.organization_id,
      fp.company_id,
      fp.financial_transaction_id,
      fp.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name) as financial_entity_name,
      fp.financial_account_id,
      fa.name as financial_account_name,
      fp.financial_category_id,
      fc.name as financial_category_name,
      fp.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      fp.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      fp.supplier_name,
      fp.description,
      fp.amount_cents,
      fp.paid_amount_cents,
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
    left join financial_entity fe
      on fe.organization_id = fp.organization_id
      and fe.id = fp.financial_entity_id
    left join financial_account fa
      on fa.organization_id = fp.organization_id
      and fa.id = fp.financial_account_id
    left join financial_category fc
      on fc.organization_id = fp.organization_id
      and fc.id = fp.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = fp.organization_id
      and fcc.id = fp.financial_cost_center_id
    left join financial_payment_method fpm
      on fpm.organization_id = fp.organization_id
      and fpm.id = fp.financial_payment_method_id
    where fp.id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string | null;
    financial_transaction_id: string | null;
    financial_entity_id: string | null;
    financial_entity_name: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    financial_cost_center_id: string | null;
    financial_cost_center_name: string | null;
    financial_payment_method_id: string | null;
    financial_payment_method_name: string | null;
    supplier_name: string | null;
    description: string;
    amount_cents: number;
    paid_amount_cents: number;
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
  const payable = mapPayableRow(created);
  if (payable.status === 'paid' && payable.paid_amount_cents > 0 && payable.paid_at) {
    const movement = createPayableSettlementMovement(payable, payable.paid_amount_cents, payable.paid_at, null, payable.note);
    db.prepare(`
      update financial_payable
      set financial_transaction_id = ?,
          updated_at = ?
      where organization_id = ?
        and id = ?
    `).run(movement.id, new Date().toISOString(), normalizedOrganizationId, payable.id);
    return readFinancePayable(normalizedOrganizationId, payable.id);
  }
  return payable;
}

export function createFinanceReceivable(input: CreateFinanceReceivableInput): FinanceReceivableDto {
  const payload = applyEntityDefaultsToReceivable(input);
  const normalizedOrganizationId = resolveOrganizationId(payload.organization_id);
  readOrganizationRow(normalizedOrganizationId);
  const companyId = payload.company_id?.trim() || null;
  const financialEntityId = payload.financial_entity_id?.trim() || null;
  if (financialEntityId) {
    readFinanceEntityRow(normalizedOrganizationId, financialEntityId);
  }
  const nowIso = new Date().toISOString();
  const id = uuid('frec');

  db.prepare(`
    insert into financial_receivable (
      id,
      organization_id,
      company_id,
      financial_transaction_id,
      financial_entity_id,
      financial_account_id,
      financial_category_id,
      financial_cost_center_id,
      financial_payment_method_id,
      customer_name,
      description,
      amount_cents,
      received_amount_cents,
      status,
      issue_date,
      due_date,
      received_at,
      source,
      source_ref,
      note,
      created_at,
      updated_at
    ) values (?, ?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizedOrganizationId,
    companyId,
    financialEntityId,
    payload.financial_account_id ?? null,
    payload.financial_category_id ?? null,
    payload.financial_cost_center_id ?? null,
    payload.financial_payment_method_id ?? null,
    payload.customer_name?.trim() || null,
    payload.description.trim(),
    Math.trunc(payload.amount_cents),
    Math.min(Math.trunc(payload.received_amount_cents ?? (payload.status === 'received' ? payload.amount_cents : 0)), Math.trunc(payload.amount_cents)),
    payload.status,
    payload.issue_date ?? null,
    payload.due_date ?? null,
    payload.received_at ?? null,
    payload.source?.trim() || 'manual',
    payload.source_ref?.trim() || null,
    payload.note?.trim() || null,
    nowIso,
    nowIso
  );

  const created = db.prepare(`
    select
      fr.id,
      fr.organization_id,
      fr.company_id,
      fr.financial_transaction_id,
      fr.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name) as financial_entity_name,
      fr.financial_account_id,
      fa.name as financial_account_name,
      fr.financial_category_id,
      fc.name as financial_category_name,
      fr.financial_cost_center_id,
      fcc.name as financial_cost_center_name,
      fr.financial_payment_method_id,
      fpm.name as financial_payment_method_name,
      fr.customer_name,
      fr.description,
      fr.amount_cents,
      fr.received_amount_cents,
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
    left join financial_entity fe
      on fe.organization_id = fr.organization_id
      and fe.id = fr.financial_entity_id
    left join financial_account fa
      on fa.organization_id = fr.organization_id
      and fa.id = fr.financial_account_id
    left join financial_category fc
      on fc.organization_id = fr.organization_id
      and fc.id = fr.financial_category_id
    left join financial_cost_center fcc
      on fcc.organization_id = fr.organization_id
      and fcc.id = fr.financial_cost_center_id
    left join financial_payment_method fpm
      on fpm.organization_id = fr.organization_id
      and fpm.id = fr.financial_payment_method_id
    where fr.id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string | null;
    financial_transaction_id: string | null;
    financial_entity_id: string | null;
    financial_entity_name: string | null;
    financial_account_id: string | null;
    financial_account_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    financial_cost_center_id: string | null;
    financial_cost_center_name: string | null;
    financial_payment_method_id: string | null;
    financial_payment_method_name: string | null;
    customer_name: string | null;
    description: string;
    amount_cents: number;
    received_amount_cents: number;
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
  const receivable = mapReceivableRow(created);
  if (receivable.status === 'received' && receivable.received_amount_cents > 0 && receivable.received_at) {
    const movement = createReceivableSettlementMovement(receivable, receivable.received_amount_cents, receivable.received_at, null, receivable.note);
    db.prepare(`
      update financial_receivable
      set financial_transaction_id = ?,
          updated_at = ?
      where organization_id = ?
        and id = ?
    `).run(movement.id, new Date().toISOString(), normalizedOrganizationId, receivable.id);
    return readFinanceReceivable(normalizedOrganizationId, receivable.id);
  }
  return receivable;
}

function addMonthsIso(dateIso: string, months: number) {
  const [year, month, day] = dateIso.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthOneBased: number) {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
}

function monthlyRuleDate(startDate: string, dayOfMonth: number, monthOffset: number) {
  const [startYear, startMonth] = startDate.split('-').map((part) => Number.parseInt(part, 10));
  const anchor = new Date(Date.UTC(startYear, startMonth - 1 + monthOffset, 1));
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + 1;
  const day = Math.min(dayOfMonth, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthStartIso(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

function monthOffsetFromStart(startDate: string, dateIso: string) {
  const [startYear, startMonth] = startDate.split('-').map((part) => Number.parseInt(part, 10));
  const [dateYear, dateMonth] = dateIso.split('-').map((part) => Number.parseInt(part, 10));
  return ((dateYear - startYear) * 12) + (dateMonth - startMonth);
}

function recurringWindowOffsets(rule: Pick<FinanceRecurringRuleDto, 'start_date' | 'day_of_month' | 'materialization_months'>) {
  const today = getOperationalTodayIso();
  const anchorDate = today < rule.start_date ? rule.start_date : monthStartIso(today);
  const startOffset = Math.max(0, monthOffsetFromStart(rule.start_date, anchorDate));
  const endOffset = startOffset + Math.max(1, Math.min(24, rule.materialization_months)) - 1;
  return { startOffset, endOffset };
}

function nextRuleDueDate(startDate: string, dayOfMonth: number, endDate?: string | null, lastMaterializedUntil?: string | null) {
  const today = getOperationalTodayIso();
  for (let index = 0; index < 60; index += 1) {
    const dueDate = monthlyRuleDate(startDate, dayOfMonth, index);
    if (dueDate < startDate) continue;
    if (lastMaterializedUntil && dueDate <= lastMaterializedUntil) continue;
    if (endDate && dueDate > endDate) return null;
    if (dueDate >= today) return dueDate;
  }
  return null;
}

function writeFinanceOperationAudit(input: {
  organization_id: string;
  company_id?: string | null;
  resource_type: 'payable' | 'receivable';
  resource_id: string;
  action: string;
  amount_cents?: number | null;
  note?: string | null;
  created_by?: string | null;
}) {
  db.prepare(`
    insert into financial_operation_audit (
      id,
      organization_id,
      company_id,
      resource_type,
      resource_id,
      action,
      amount_cents,
      note,
      created_by,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid('foau'),
    input.organization_id,
    input.company_id ?? null,
    input.resource_type,
    input.resource_id,
    input.action,
    typeof input.amount_cents === 'number' ? Math.trunc(input.amount_cents) : null,
    input.note?.trim() || null,
    input.created_by?.trim() || null,
    new Date().toISOString()
  );
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function formatFinanceCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function humanizeAutomationTrigger(triggerType: string): string {
  if (triggerType === 'payable.created') return 'Quando uma conta a pagar for criada';
  if (triggerType === 'receivable.overdue') return 'Quando uma conta a receber atrasar';
  if (triggerType === 'reconciliation.pending') return 'Quando uma conciliação ficar pendente';
  if (triggerType === 'transaction.incomplete') return 'Quando um lançamento estiver incompleto';
  return 'Quando uma condição financeira acontecer';
}

function humanizeAutomationConditions(conditions: Record<string, unknown>): string[] {
  const output: string[] = [];
  const minAmount = typeof conditions.min_amount_cents === 'number' ? conditions.min_amount_cents : null;
  if (minAmount !== null) output.push(`Valor mínimo de ${formatFinanceCurrency(minAmount)}`);
  const dueInDays = typeof conditions.due_in_days === 'number' ? conditions.due_in_days : null;
  if (dueInDays !== null) output.push(`Vencimento em até ${dueInDays} dias`);
  const tagName = typeof conditions.entity_tag_name === 'string' ? conditions.entity_tag_name : '';
  if (tagName) output.push(`Entidade classificada como ${tagName}`);
  if (conditions.missing_classification === true) output.push('Categoria ou centro de custo ausente');
  return output.length > 0 ? output : ['Sem condição adicional'];
}

function humanizeAutomationAction(actionType: string): string {
  if (actionType === 'request_approval') return 'Pedir aprovação financeira';
  if (actionType === 'flag_review') return 'Marcar para revisão';
  if (actionType === 'classify_transaction') return 'Classificar lançamento';
  return 'Executar ação financeira';
}

function mapAutomationRuleRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  trigger_type: string;
  conditions_json: string;
  action_type: string;
  action_payload_json: string;
  is_active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceAutomationRuleDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    name: row.name,
    trigger_type: row.trigger_type,
    conditions: parseJsonObject(row.conditions_json),
    action_type: row.action_type,
    action_payload: parseJsonObject(row.action_payload_json),
    human_trigger: humanizeAutomationTrigger(row.trigger_type),
    human_conditions: humanizeAutomationConditions(parseJsonObject(row.conditions_json)),
    human_action: humanizeAutomationAction(row.action_type),
    last_run_at: null,
    execution_count: 0,
    recommended_action: Number(row.is_active) === 1 ? null : 'Revise e ative se esta regra ainda fizer sentido.',
    is_active: Number(row.is_active) === 1,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapAttachmentRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  resource_type: string;
  resource_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_ref: string;
  created_by: string | null;
  created_at: string;
}): FinanceAttachmentDto {
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    resource_type: row.resource_type as FinanceAttachmentDto['resource_type'],
    resource_id: row.resource_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size_bytes: row.file_size_bytes,
    storage_ref: row.storage_ref,
    created_by: row.created_by,
    created_at: row.created_at
  };
}

function mapAuditRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  amount_cents: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}): FinanceAuditEntryDto {
  return row;
}

function mapBankIntegrationRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  provider: string;
  status: string;
  account_name: string | null;
  last_sync_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceBankIntegrationDto {
  return {
    ...row,
    status: row.status as FinanceBankIntegrationDto['status']
  };
}

function listFinanceAutomationRules(organizationId: string): FinanceAutomationRuleDto[] {
  const rows = db.prepare(`
    select *
    from financial_automation_rule
    where organization_id = ?
    order by is_active desc, created_at desc
  `).all(organizationId) as Parameters<typeof mapAutomationRuleRow>[0][];
  return rows.map(mapAutomationRuleRow);
}

function listFinanceAttachments(organizationId: string): FinanceAttachmentDto[] {
  const rows = db.prepare(`
    select *
    from financial_attachment
    where organization_id = ?
    order by created_at desc
    limit 20
  `).all(organizationId) as Parameters<typeof mapAttachmentRow>[0][];
  return rows.map(mapAttachmentRow);
}

function listFinanceAuditEntries(organizationId: string): FinanceAuditEntryDto[] {
  const rows = db.prepare(`
    select *
    from financial_operation_audit
    where organization_id = ?
    order by created_at desc
    limit 30
  `).all(organizationId) as Parameters<typeof mapAuditRow>[0][];
  return rows.map(mapAuditRow);
}

function listFinanceBankIntegrations(organizationId: string): FinanceBankIntegrationDto[] {
  const rows = db.prepare(`
    select *
    from financial_bank_integration
    where organization_id = ?
    order by created_at desc
  `).all(organizationId) as Parameters<typeof mapBankIntegrationRow>[0][];
  return rows.map(mapBankIntegrationRow);
}

function buildFinanceApprovalQueue(organizationId: string): FinanceAdvancedApprovalDto[] {
  const approvedRows = db.prepare(`
    select resource_id
    from financial_operation_audit
    where organization_id = ?
      and resource_type = 'payable'
      and action = 'approve_payment'
  `).all(organizationId) as Array<{ resource_id: string }>;
  const approvedIds = new Set(approvedRows.map((row) => row.resource_id));

  return listFinancePayables(organizationId).payables
    .filter((payable) => !approvedIds.has(payable.id))
    .filter((payable) => ['planned', 'open', 'partial', 'overdue'].includes(payable.status))
    .filter((payable) => payable.amount_cents >= 500_000)
    .map((payable) => ({
      id: `approval-${payable.id}`,
      payable_id: payable.id,
      description: payable.description,
      amount_cents: payable.amount_cents,
      due_date: payable.due_date,
      supplier_name: payable.financial_entity_name ?? payable.supplier_name,
      severity: payable.amount_cents >= 2_000_000 ? 'high' : 'normal'
    }));
}

function buildFinancePermissionMatrix(currentPermissions: string[] = []) {
  const permissionSet = new Set(currentPermissions);
  return [
    { permission: 'finance.read', label: 'Leitura financeira', scope: 'Visualizar dados e relatorios' },
    { permission: 'finance.write', label: 'Operacao financeira', scope: 'Criar e editar lancamentos' },
    { permission: 'finance.reconcile', label: 'Conciliacao', scope: 'Conciliar extratos e matches' },
    { permission: 'finance.approve', label: 'Aprovacao', scope: 'Aprovar pagamentos e excecoes' },
    { permission: 'finance.admin', label: 'Administracao', scope: 'Regras, integracoes e auditoria' }
  ].map((row) => ({
    ...row,
    enabled_for_current_user: permissionSet.has(row.permission) || permissionSet.has('admin') || permissionSet.has('finance.admin')
  }));
}

function financeExportOptions() {
  return [
    { dataset: 'transactions' as const, label: 'Movimentacoes' },
    { dataset: 'payables' as const, label: 'Contas a pagar' },
    { dataset: 'receivables' as const, label: 'Contas a receber' },
    { dataset: 'audit' as const, label: 'Auditoria' }
  ].map((option) => ({
    ...option,
    csv_url: `/finance/exports?dataset=${option.dataset}&format=csv`,
    pdf_url: `/finance/exports?dataset=${option.dataset}&format=pdf`
  }));
}

function financeAssistedRuleTemplates() {
  return [
    {
      id: 'approval-high-payable',
      label: 'Pedir aprovação para pagamentos altos',
      description: 'Quando uma conta a pagar passar de um valor definido, ela entra na fila de aprovação.',
      trigger_type: 'payable.created',
      default_conditions: { min_amount_cents: 500000 },
      action_type: 'request_approval',
      action_payload: { queue: 'finance.approval' }
    },
    {
      id: 'review-missing-classification',
      label: 'Revisar lançamentos sem classificação',
      description: 'Quando um lançamento estiver sem categoria ou centro de custo, ele entra na revisão.',
      trigger_type: 'transaction.incomplete',
      default_conditions: { missing_classification: true },
      action_type: 'flag_review',
      action_payload: { queue: 'finance.review' }
    },
    {
      id: 'review-pending-reconciliation',
      label: 'Acompanhar conciliações pendentes',
      description: 'Quando uma conciliação ficar parada, o financeiro ganha uma pendência de revisão.',
      trigger_type: 'reconciliation.pending',
      default_conditions: { due_in_days: 2 },
      action_type: 'flag_review',
      action_payload: { queue: 'finance.reconciliation' }
    }
  ];
}

function buildFinanceAdvancedRecommendations(
  approvalQueue: FinanceAdvancedApprovalDto[],
  automationRules: FinanceAutomationRuleDto[]
) {
  const recommendations: Array<{ id: string; label: string; description: string; target: 'approvals' | 'rules' | 'audit' | 'attachments' | 'integrations' }> = [];
  if (approvalQueue.length > 0) {
    recommendations.push({
      id: 'review-approvals',
      label: 'Revisar aprovações pendentes',
      description: `${approvalQueue.length} pagamento(s) aguardam decisão financeira.`,
      target: 'approvals'
    });
  }
  if (automationRules.length === 0) {
    recommendations.push({
      id: 'create-first-rule',
      label: 'Criar primeira regra assistida',
      description: 'Comece protegendo pagamentos altos ou lançamentos sem classificação.',
      target: 'rules'
    });
  }
  if (automationRules.some((rule) => !rule.is_active)) {
    recommendations.push({
      id: 'review-paused-rules',
      label: 'Revisar regras pausadas',
      description: 'Há regras paradas que podem voltar a proteger a rotina.',
      target: 'rules'
    });
  }
  return recommendations;
}

export function getFinanceAdvancedDashboard(
  organizationId: string,
  currentPermissions: string[] = []
): FinanceAdvancedDashboardDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const automationRules = listFinanceAutomationRules(normalizedOrganizationId);
  const attachments = listFinanceAttachments(normalizedOrganizationId);
  const bankIntegrations = listFinanceBankIntegrations(normalizedOrganizationId);
  const approvalQueue = buildFinanceApprovalQueue(normalizedOrganizationId);
  const auditEntries = listFinanceAuditEntries(normalizedOrganizationId);
  const highRiskCount = approvalQueue.filter((item) => item.severity === 'high').length;

  return {
    organization_id: normalizedOrganizationId,
    generated_at: new Date().toISOString(),
    cockpit: {
      sections: {
        decisions: {
          label: 'Decisões pendentes',
          count: approvalQueue.length,
          severity: approvalQueue.length > 0 ? 'warning' : 'neutral'
        },
        risks: {
          label: 'Riscos operacionais',
          count: highRiskCount,
          severity: highRiskCount > 0 ? 'critical' : 'neutral'
        },
        rules: {
          label: 'Regras em operação',
          count: automationRules.filter((rule) => rule.is_active).length,
          severity: 'neutral'
        },
        audit: {
          label: 'Eventos auditados',
          count: auditEntries.length,
          severity: 'neutral'
        }
      },
      recommended_actions: buildFinanceAdvancedRecommendations(approvalQueue, automationRules)
    },
    automation_rules: automationRules,
    assisted_rule_templates: financeAssistedRuleTemplates(),
    approval_queue: approvalQueue,
    attachments,
    audit_entries: auditEntries,
    bank_integrations: bankIntegrations,
    permission_matrix: buildFinancePermissionMatrix(currentPermissions),
    export_options: financeExportOptions(),
    summary: {
      active_rule_count: automationRules.filter((rule) => rule.is_active).length,
      pending_approval_count: approvalQueue.length,
      attachment_count: attachments.length,
      integration_count: bankIntegrations.length
    }
  };
}

export function createFinanceAutomationRule(input: CreateFinanceAutomationRuleInput): FinanceAutomationRuleDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(organizationId);
  const nowIso = new Date().toISOString();
  const id = uuid('farul');
  db.prepare(`
    insert into financial_automation_rule (
      id, organization_id, company_id, name, trigger_type, conditions_json,
      action_type, action_payload_json, is_active, created_by, created_at, updated_at
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    input.name.trim(),
    input.trigger_type.trim(),
    JSON.stringify(input.conditions ?? {}),
    input.action_type.trim(),
    JSON.stringify(input.action_payload ?? {}),
    input.is_active === false ? 0 : 1,
    input.created_by?.trim() || null,
    nowIso,
    nowIso
  );
  const created = listFinanceAutomationRules(organizationId).find((rule) => rule.id === id);
  if (!created) throw new Error('Falha ao criar regra financeira.');
  return created;
}

export function toggleFinanceAutomationRule(
  organizationId: string,
  ruleId: string,
  isActive: boolean
): FinanceAutomationRuleDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_automation_rule
    set is_active = ?, updated_at = ?
    where organization_id = ? and id = ?
  `).run(isActive ? 1 : 0, nowIso, normalizedOrganizationId, ruleId);
  const updated = listFinanceAutomationRules(normalizedOrganizationId).find((rule) => rule.id === ruleId);
  if (!updated) throw new Error('Regra financeira nao encontrada.');
  return updated;
}

export function approveFinancePayable(input: FinanceOperationInput): FinanceAuditEntryDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'approve_payment',
    amount_cents: payable.amount_cents,
    note: input.note?.trim() || 'Pagamento aprovado na camada avancada.',
    created_by: input.created_by
  });
  const latest = listFinanceAuditEntries(organizationId).find((entry) =>
    entry.resource_type === 'payable'
    && entry.resource_id === payable.id
    && entry.action === 'approve_payment'
  );
  if (!latest) throw new Error('Falha ao aprovar pagamento.');
  return latest;
}

export function createFinanceAttachment(input: CreateFinanceAttachmentInput): FinanceAttachmentDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(organizationId);
  const nowIso = new Date().toISOString();
  const id = uuid('fatt');
  db.prepare(`
    insert into financial_attachment (
      id, organization_id, company_id, resource_type, resource_id, file_name,
      mime_type, file_size_bytes, storage_ref, created_by, created_at
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    input.resource_type,
    input.resource_id.trim(),
    input.file_name.trim(),
    input.mime_type.trim(),
    Math.max(0, Math.trunc(input.file_size_bytes ?? 0)),
    input.storage_ref?.trim() || `finance://${organizationId}/${id}/${input.file_name.trim()}`,
    input.created_by?.trim() || null,
    nowIso
  );
  const created = listFinanceAttachments(organizationId).find((attachment) => attachment.id === id);
  if (!created) throw new Error('Falha ao registrar anexo financeiro.');
  return created;
}

export function createFinanceBankIntegration(input: CreateFinanceBankIntegrationInput): FinanceBankIntegrationDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(organizationId);
  const nowIso = new Date().toISOString();
  const id = uuid('fbank');
  db.prepare(`
    insert into financial_bank_integration (
      id, organization_id, company_id, provider, status, account_name,
      last_sync_at, created_by, created_at, updated_at
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    input.provider.trim(),
    input.status ?? 'sandbox',
    input.account_name?.trim() || null,
    null,
    input.created_by?.trim() || null,
    nowIso,
    nowIso
  );
  const created = listFinanceBankIntegrations(organizationId).find((integration) => integration.id === id);
  if (!created) throw new Error('Falha ao registrar integracao bancaria.');
  return created;
}

function mapSimulationItemRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  financial_simulation_scenario_id: string;
  source_type: string;
  source_id: string | null;
  kind: string;
  label: string;
  amount_cents: number;
  event_date: string;
  probability_percent: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}): FinanceSimulationItemDto {
  return {
    ...row,
    source_type: row.source_type as FinanceSimulationItemDto['source_type'],
    kind: row.kind as FinanceSimulationItemKind,
    amount_cents: Number(row.amount_cents),
    probability_percent: Number(row.probability_percent)
  };
}

function simulationItemDirection(kind: FinanceSimulationItemKind) {
  return ['manual_outflow', 'scheduled_outflow', 'partial_payment'].includes(kind) ? 'outflow' : 'inflow';
}

function buildSimulationResult(
  scenario: {
    start_date: string;
    end_date: string;
    starting_balance_cents: number;
  },
  items: FinanceSimulationItemDto[]
): FinanceSimulationResultDto {
  let balance = Number(scenario.starting_balance_cents);
  let minimumBalance = balance;
  let firstNegativeDate: string | null = balance < 0 ? scenario.start_date : null;
  let totalInflow = 0;
  let totalOutflow = 0;
  const timeline = [];
  const dayCount = Math.max(0, getDateDifferenceInDays(scenario.end_date, scenario.start_date));

  for (let offset = 0; offset <= dayCount; offset += 1) {
    const date = getDateOffsetIso(scenario.start_date, offset);
    const dayItems = items.filter((item) => item.event_date === date);
    let inflow = 0;
    let outflow = 0;

    for (const item of dayItems) {
      const weightedAmount = Math.round(Math.abs(item.amount_cents) * Math.min(100, Math.max(0, item.probability_percent)) / 100);
      if (simulationItemDirection(item.kind) === 'inflow') {
        inflow += weightedAmount;
      } else {
        outflow += weightedAmount;
      }
    }

    totalInflow += inflow;
    totalOutflow += outflow;
    balance += inflow - outflow;
    minimumBalance = Math.min(minimumBalance, balance);
    if (!firstNegativeDate && balance < 0) {
      firstNegativeDate = date;
    }
    timeline.push({
      date,
      inflow_cents: inflow,
      outflow_cents: outflow,
      net_cents: inflow - outflow,
      balance_cents: balance
    });
  }

  return {
    starting_balance_cents: Number(scenario.starting_balance_cents),
    total_inflow_cents: totalInflow,
    total_outflow_cents: totalOutflow,
    ending_balance_cents: balance,
    minimum_balance_cents: minimumBalance,
    first_negative_date: firstNegativeDate,
    item_count: items.length,
    timeline
  };
}

function listFinanceSimulationItems(organizationId: string, scenarioId: string): FinanceSimulationItemDto[] {
  const rows = db.prepare(`
    select *
    from financial_simulation_item
    where organization_id = ? and financial_simulation_scenario_id = ?
    order by event_date asc, created_at asc
  `).all(organizationId, scenarioId) as Parameters<typeof mapSimulationItemRow>[0][];
  return rows.map(mapSimulationItemRow);
}

function clampSimulationDate(dateIso: string | null | undefined, startDate: string, endDate: string) {
  const candidate = dateIso || startDate;
  if (candidate < startDate) return startDate;
  if (candidate > endDate) return endDate;
  return candidate;
}

function mapSimulationScenarioRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  starting_balance_cents: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): FinanceSimulationScenarioDto {
  const items = listFinanceSimulationItems(row.organization_id, row.id);
  return {
    ...row,
    starting_balance_cents: Number(row.starting_balance_cents),
    result: buildSimulationResult(row, items)
  };
}

function readFinanceSimulationScenario(organizationId: string, scenarioId: string): FinanceSimulationDetailDto {
  const row = db.prepare(`
    select *
    from financial_simulation_scenario
    where organization_id = ? and id = ?
    limit 1
  `).get(organizationId, scenarioId) as Parameters<typeof mapSimulationScenarioRow>[0] | undefined;
  if (!row) throw new Error('Cenário de simulação não encontrado.');
  const scenario = mapSimulationScenarioRow(row);
  return {
    ...scenario,
    items: listFinanceSimulationItems(organizationId, scenario.id)
  };
}

export function listFinanceSimulationScenarios(organizationId: string): FinanceSimulationScenarioDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const rows = db.prepare(`
    select *
    from financial_simulation_scenario
    where organization_id = ?
    order by updated_at desc
  `).all(normalizedOrganizationId) as Parameters<typeof mapSimulationScenarioRow>[0][];
  return rows.map(mapSimulationScenarioRow);
}

export function getFinanceSimulationScenario(organizationId: string, scenarioId: string): FinanceSimulationDetailDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  return readFinanceSimulationScenario(normalizedOrganizationId, scenarioId);
}

export function createFinanceSimulationScenario(input: CreateFinanceSimulationScenarioInput): FinanceSimulationDetailDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(organizationId);
  const startDate = input.start_date?.trim() || getOperationalTodayIso();
  const endDate = input.end_date?.trim() || getDateOffsetIso(startDate, 30);
  if (endDate < startDate) {
    throw new Error('A data final da simulação precisa ser depois da data inicial.');
  }
  const startingBalance = input.starting_balance_cents ?? getFinanceOverview(organizationId).totals.cash_cents;
  const nowIso = new Date().toISOString();
  const id = uuid('fsim');

  db.prepare(`
    insert into financial_simulation_scenario (
      id, organization_id, company_id, name, description, start_date, end_date,
      starting_balance_cents, created_by, created_at, updated_at
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    input.name.trim(),
    input.description?.trim() || null,
    startDate,
    endDate,
    Math.trunc(startingBalance),
    input.created_by?.trim() || null,
    nowIso,
    nowIso
  );

  return readFinanceSimulationScenario(organizationId, id);
}

export function updateFinanceSimulationScenario(input: UpdateFinanceSimulationScenarioInput): FinanceSimulationDetailDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const current = readFinanceSimulationScenario(organizationId, input.scenario_id);
  const nextStart = input.start_date?.trim() || current.start_date;
  const nextEnd = input.end_date?.trim() || current.end_date;
  if (nextEnd < nextStart) {
    throw new Error('A data final da simulação precisa ser depois da data inicial.');
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_simulation_scenario
    set name = ?,
        description = ?,
        start_date = ?,
        end_date = ?,
        starting_balance_cents = ?,
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    input.name?.trim() || current.name,
    typeof input.description === 'undefined' ? current.description : input.description?.trim() || null,
    nextStart,
    nextEnd,
    Math.trunc(input.starting_balance_cents ?? current.starting_balance_cents),
    nowIso,
    organizationId,
    current.id
  );

  return readFinanceSimulationScenario(organizationId, current.id);
}

export function createFinanceSimulationItem(input: CreateFinanceSimulationItemInput): FinanceSimulationDetailDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const scenario = readFinanceSimulationScenario(organizationId, input.scenario_id);
  const eventDate = input.event_date.trim();
  if (eventDate < scenario.start_date || eventDate > scenario.end_date) {
    throw new Error('O bloco precisa estar dentro do período da simulação.');
  }
  const nowIso = new Date().toISOString();
  const id = uuid('fsimi');
  db.prepare(`
    insert into financial_simulation_item (
      id, organization_id, company_id, financial_simulation_scenario_id, source_type, source_id,
      kind, label, amount_cents, event_date, probability_percent, note, created_at, updated_at
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    organizationId,
    scenario.id,
    input.source_type ?? 'manual',
    input.source_id?.trim() || null,
    input.kind,
    input.label.trim(),
    Math.trunc(Math.abs(input.amount_cents)),
    eventDate,
    Math.min(100, Math.max(0, Math.trunc(input.probability_percent ?? 100))),
    input.note?.trim() || null,
    nowIso,
    nowIso
  );

  db.prepare(`
    update financial_simulation_scenario
    set updated_at = ?
    where organization_id = ? and id = ?
  `).run(nowIso, organizationId, scenario.id);

  return readFinanceSimulationScenario(organizationId, scenario.id);
}

export function updateFinanceSimulationItem(input: UpdateFinanceSimulationItemInput): FinanceSimulationDetailDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const scenario = readFinanceSimulationScenario(organizationId, input.scenario_id);
  const current = scenario.items.find((item) => item.id === input.item_id);
  if (!current) {
    throw new Error('Bloco de simulação não encontrado.');
  }

  const eventDate = input.event_date?.trim() || current.event_date;
  if (eventDate < scenario.start_date || eventDate > scenario.end_date) {
    throw new Error('O bloco precisa estar dentro do período da simulação.');
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_simulation_item
    set source_type = ?,
        source_id = ?,
        kind = ?,
        label = ?,
        amount_cents = ?,
        event_date = ?,
        probability_percent = ?,
        note = ?,
        updated_at = ?
    where organization_id = ? and financial_simulation_scenario_id = ? and id = ?
  `).run(
    input.source_type ?? current.source_type,
    typeof input.source_id === 'undefined' ? current.source_id : input.source_id?.trim() || null,
    input.kind ?? current.kind,
    input.label?.trim() || current.label,
    Math.trunc(Math.abs(input.amount_cents ?? current.amount_cents)),
    eventDate,
    Math.min(100, Math.max(0, Math.trunc(input.probability_percent ?? current.probability_percent))),
    typeof input.note === 'undefined' ? current.note : input.note?.trim() || null,
    nowIso,
    organizationId,
    scenario.id,
    current.id
  );

  db.prepare(`
    update financial_simulation_scenario
    set updated_at = ?
    where organization_id = ? and id = ?
  `).run(nowIso, organizationId, scenario.id);

  return readFinanceSimulationScenario(organizationId, scenario.id);
}

export function deleteFinanceSimulationItem(
  organizationId: string,
  scenarioId: string,
  itemId: string
): FinanceSimulationDetailDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readFinanceSimulationScenario(normalizedOrganizationId, scenarioId);
  const result = db.prepare(`
    delete from financial_simulation_item
    where organization_id = ? and financial_simulation_scenario_id = ? and id = ?
  `).run(normalizedOrganizationId, scenarioId, itemId);
  if (result.changes === 0) {
    throw new Error('Bloco de simulação não encontrado.');
  }
  db.prepare(`
    update financial_simulation_scenario
    set updated_at = ?
    where organization_id = ? and id = ?
  `).run(new Date().toISOString(), normalizedOrganizationId, scenarioId);
  return readFinanceSimulationScenario(normalizedOrganizationId, scenarioId);
}

export function deleteFinanceSimulationScenario(
  organizationId: string,
  scenarioId: string
): { ok: true; scenario_id: string } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readFinanceSimulationScenario(normalizedOrganizationId, scenarioId);
  db.prepare(`
    delete from financial_simulation_scenario
    where organization_id = ? and id = ?
  `).run(normalizedOrganizationId, scenarioId);
  return { ok: true, scenario_id: scenarioId };
}

export function listFinanceSimulationSources(
  organizationId: string,
  scenarioId?: string | null
): { balance: FinanceSimulationSourceDto; sources: FinanceSimulationSourceDto[] } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  ensureFinanceRecurringWindow(normalizedOrganizationId);
  const scenario = scenarioId ? readFinanceSimulationScenario(normalizedOrganizationId, scenarioId) : null;
  const startDate = scenario?.start_date ?? getOperationalTodayIso();
  const endDate = scenario?.end_date ?? getDateOffsetIso(startDate, 30);
  const recurringEndDate = getDateOffsetIso(startDate, 92);
  const recurringTemplateIds = new Set(
    listFinanceRecurringRules(normalizedOrganizationId)
      .filter((rule) => rule.status === 'active')
      .map((rule) => rule.template_resource_id)
  );
  const balanceCents = getFinanceOverview(normalizedOrganizationId).totals.cash_cents;
  const balance: FinanceSimulationSourceDto = {
    id: 'current-balance',
    label: 'Saldo atual em conta',
    detail: 'Usar como saldo inicial da mesa',
    amount_cents: balanceCents,
    event_date: startDate,
    kind: 'starting_balance',
    source_type: 'balance',
    source_id: null,
    tone: 'balance',
    cadence: 'one_time'
  };

  const receivableSources = listFinanceReceivables(normalizedOrganizationId).receivables
    .filter((item) => ['planned', 'open', 'partial', 'overdue'].includes(item.status))
    .map((item): FinanceSimulationSourceDto => ({
      id: `receivable-${item.id}`,
      label: item.description,
      detail: `${item.source === 'recurring_rule' || recurringTemplateIds.has(item.id) ? 'Recorrente · ' : ''}${item.financial_entity_name ?? item.customer_name ?? 'Cliente'} · ${item.status}`,
      amount_cents: Math.max(0, item.amount_cents - item.received_amount_cents),
      event_date: clampSimulationDate(item.due_date, startDate, endDate),
      kind: 'expected_inflow',
      source_type: 'receivable',
      source_id: item.id,
      tone: 'inflow',
      cadence: item.source === 'recurring_rule' || recurringTemplateIds.has(item.id) ? 'recurring' : 'one_time'
    }));

  const payableSources = listFinancePayables(normalizedOrganizationId).payables
    .filter((item) => ['planned', 'open', 'partial', 'overdue'].includes(item.status))
    .map((item): FinanceSimulationSourceDto => ({
      id: `payable-${item.id}`,
      label: item.description,
      detail: `${item.source === 'recurring_rule' || recurringTemplateIds.has(item.id) ? 'Recorrente · ' : ''}${item.financial_entity_name ?? item.supplier_name ?? 'Fornecedor'} · ${item.status}`,
      amount_cents: Math.max(0, item.amount_cents - item.paid_amount_cents),
      event_date: clampSimulationDate(item.due_date, startDate, endDate),
      kind: 'scheduled_outflow',
      source_type: 'payable',
      source_id: item.id,
      tone: 'outflow',
      cadence: item.source === 'recurring_rule' || recurringTemplateIds.has(item.id) ? 'recurring' : 'one_time'
    }));

  return {
    balance,
    sources: [...receivableSources, ...payableSources]
      .filter((source) => source.amount_cents > 0)
      .filter((source) => source.cadence !== 'recurring' || source.event_date <= recurringEndDate)
      .sort((left, right) => left.event_date.localeCompare(right.event_date) || right.amount_cents - left.amount_cents)
      .slice(0, 40)
  };
}

export function duplicateFinanceSimulationScenario(
  organizationId: string,
  scenarioId: string,
  createdBy?: string | null
): FinanceSimulationDetailDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const source = readFinanceSimulationScenario(normalizedOrganizationId, scenarioId);
  const copy = createFinanceSimulationScenario({
    organization_id: normalizedOrganizationId,
    name: `${source.name} - cópia`,
    description: source.description,
    start_date: source.start_date,
    end_date: source.end_date,
    starting_balance_cents: source.starting_balance_cents,
    created_by: createdBy
  });
  source.items.forEach((item) => {
    createFinanceSimulationItem({
      organization_id: normalizedOrganizationId,
      scenario_id: copy.id,
      source_type: item.source_type,
      source_id: item.source_id,
      kind: item.kind,
      label: item.label,
      amount_cents: item.amount_cents,
      event_date: item.event_date,
      probability_percent: item.probability_percent,
      note: item.note
    });
  });
  return readFinanceSimulationScenario(normalizedOrganizationId, copy.id);
}

function csvEscape(value: unknown) {
  const normalized = value == null ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(','))
  ].join('\n');
}

function simplePdfBuffer(title: string, lines: string[]) {
  const text = [title, ...lines].join(' | ').replace(/[()\\]/g, '');
  const stream = `BT /F1 12 Tf 50 760 Td (${text.slice(0, 900)}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`
  ];
  const body = `%PDF-1.4\n${objects.join('\n')}\n%%EOF`;
  return Buffer.from(body, 'utf8');
}

export function buildFinanceExport(
  organizationId: string,
  dataset: 'transactions' | 'payables' | 'receivables' | 'audit',
  format: 'csv' | 'pdf'
): { fileName: string; contentType: string; body: string | Buffer } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const nowLabel = getOperationalTodayIso();
  let title = 'Financeiro';
  let csv = '';

  if (dataset === 'transactions') {
    title = 'Movimentacoes financeiras';
    const rows = listFinanceTransactions(normalizedOrganizationId, {}).transactions;
    csv = toCsv(['id', 'tipo', 'status', 'valor_centavos', 'competencia', 'entidade', 'categoria'], rows.map((row) => [
      row.id, row.kind, row.status, row.amount_cents, row.competence_date, row.financial_entity_name, row.financial_category_name
    ]));
  } else if (dataset === 'payables') {
    title = 'Contas a pagar';
    const rows = listFinancePayables(normalizedOrganizationId).payables;
    csv = toCsv(['id', 'descricao', 'status', 'valor_centavos', 'vencimento', 'fornecedor'], rows.map((row) => [
      row.id, row.description, row.status, row.amount_cents, row.due_date, row.financial_entity_name ?? row.supplier_name
    ]));
  } else if (dataset === 'receivables') {
    title = 'Contas a receber';
    const rows = listFinanceReceivables(normalizedOrganizationId).receivables;
    csv = toCsv(['id', 'descricao', 'status', 'valor_centavos', 'vencimento', 'cliente'], rows.map((row) => [
      row.id, row.description, row.status, row.amount_cents, row.due_date, row.financial_entity_name ?? row.customer_name
    ]));
  } else {
    title = 'Auditoria financeira';
    const rows = listFinanceAuditEntries(normalizedOrganizationId);
    csv = toCsv(['id', 'recurso', 'recurso_id', 'acao', 'valor_centavos', 'usuario', 'data'], rows.map((row) => [
      row.id, row.resource_type, row.resource_id, row.action, row.amount_cents, row.created_by, row.created_at
    ]));
  }

  if (format === 'csv') {
    return {
      fileName: `${dataset}-${nowLabel}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: csv
    };
  }

  return {
    fileName: `${dataset}-${nowLabel}.pdf`,
    contentType: 'application/pdf',
    body: simplePdfBuffer(title, csv.split('\n').slice(0, 12))
  };
}

function readFinancePayable(organizationId: string, payableId: string) {
  const payable = listFinancePayables(organizationId).payables.find((item) => item.id === payableId);
  if (!payable) {
    throw new Error('Conta a pagar não encontrada.');
  }
  return payable;
}

function readFinanceReceivable(organizationId: string, receivableId: string) {
  const receivable = listFinanceReceivables(organizationId).receivables.find((item) => item.id === receivableId);
  if (!receivable) {
    throw new Error('Conta a receber não encontrada.');
  }
  return receivable;
}

function readFinanceRecurringRule(organizationId: string, ruleId: string) {
  const row = db.prepare(`
    select *
    from financial_recurring_rule
    where organization_id = ?
      and id = ?
    limit 1
  `).get(organizationId, ruleId) as {
    id: string;
    organization_id: string;
    company_id: string | null;
    resource_type: string;
    template_resource_id: string;
    name: string;
    frequency: string;
    day_of_month: number;
    start_date: string;
    end_date: string | null;
    materialization_months: number;
    status: string;
    last_materialized_until: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) {
    throw new Error('Recorrência não encontrada.');
  }

  return mapRecurringRuleRow(row);
}

export function listFinanceRecurringRules(organizationId: string): FinanceRecurringRuleDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);
  const rows = db.prepare(`
    select *
    from financial_recurring_rule
    where organization_id = ?
    order by status = 'active' desc, coalesce(last_materialized_until, start_date) asc, created_at desc
  `).all(normalizedOrganizationId) as Parameters<typeof mapRecurringRuleRow>[0][];

  return rows.map(mapRecurringRuleRow);
}

export function ensureFinanceRecurringWindow(organizationId: string): { payables: FinancePayableDto[]; receivables: FinanceReceivableDto[] } {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const createdPayables: FinancePayableDto[] = [];
  const createdReceivables: FinanceReceivableDto[] = [];

  for (const rule of listFinanceRecurringRules(normalizedOrganizationId).filter((item) => item.status === 'active')) {
    const materialized = materializeFinanceRecurringRule(rule);
    createdPayables.push(...materialized.payables);
    createdReceivables.push(...materialized.receivables);
  }

  return { payables: createdPayables, receivables: createdReceivables };
}

function recurringSourceRef(ruleId: string, dueDate: string) {
  return `${ruleId}:${dueDate.slice(0, 7)}`;
}

function recurringOccurrenceExists(organizationId: string, resourceType: FinanceRecurringRuleResourceType, sourceRef: string) {
  const table = resourceType === 'payable' ? 'financial_payable' : 'financial_receivable';
  const row = db.prepare(`
    select id
    from ${table}
    where organization_id = ?
      and source = 'recurring_rule'
      and source_ref = ?
    limit 1
  `).get(organizationId, sourceRef);
  return Boolean(row);
}

function materializeFinanceRecurringRule(rule: FinanceRecurringRuleDto): { payables: FinancePayableDto[]; receivables: FinanceReceivableDto[] } {
  if (rule.status !== 'active') {
    return { payables: [], receivables: [] };
  }

  const createdPayables: FinancePayableDto[] = [];
  const createdReceivables: FinanceReceivableDto[] = [];
  const { startOffset, endOffset } = recurringWindowOffsets(rule);
  const nowIso = new Date().toISOString();
  let lastMaterializedUntil: string | null = rule.last_materialized_until;

  if (rule.resource_type === 'payable') {
    const template = readFinancePayable(rule.organization_id, rule.template_resource_id);
    for (let index = startOffset; index <= endOffset; index += 1) {
      const dueDate = monthlyRuleDate(rule.start_date, rule.day_of_month, index);
      if (dueDate < rule.start_date) continue;
      if (rule.end_date && dueDate > rule.end_date) continue;
      if (dueDate.slice(0, 7) === rule.start_date.slice(0, 7)) {
        lastMaterializedUntil = dueDate;
        continue;
      }
      const sourceRef = recurringSourceRef(rule.id, dueDate);
      if (recurringOccurrenceExists(rule.organization_id, 'payable', sourceRef)) {
        lastMaterializedUntil = dueDate;
        continue;
      }
      createdPayables.push(createFinancePayable({
        organization_id: rule.organization_id,
        company_id: template.company_id,
        financial_entity_id: template.financial_entity_id,
        financial_account_id: template.financial_account_id,
        financial_category_id: template.financial_category_id,
        financial_cost_center_id: template.financial_cost_center_id,
        financial_payment_method_id: template.financial_payment_method_id,
        supplier_name: template.supplier_name,
        description: template.description,
        amount_cents: template.amount_cents,
        status: 'open',
        issue_date: getOperationalTodayIso(),
        due_date: dueDate,
        source: 'recurring_rule',
        source_ref: sourceRef,
        note: template.note
      }));
      lastMaterializedUntil = dueDate;
    }
  } else {
    const template = readFinanceReceivable(rule.organization_id, rule.template_resource_id);
    for (let index = startOffset; index <= endOffset; index += 1) {
      const dueDate = monthlyRuleDate(rule.start_date, rule.day_of_month, index);
      if (dueDate < rule.start_date) continue;
      if (rule.end_date && dueDate > rule.end_date) continue;
      if (dueDate.slice(0, 7) === rule.start_date.slice(0, 7)) {
        lastMaterializedUntil = dueDate;
        continue;
      }
      const sourceRef = recurringSourceRef(rule.id, dueDate);
      if (recurringOccurrenceExists(rule.organization_id, 'receivable', sourceRef)) {
        lastMaterializedUntil = dueDate;
        continue;
      }
      createdReceivables.push(createFinanceReceivable({
        organization_id: rule.organization_id,
        company_id: template.company_id,
        financial_entity_id: template.financial_entity_id,
        financial_account_id: template.financial_account_id,
        financial_category_id: template.financial_category_id,
        financial_cost_center_id: template.financial_cost_center_id,
        financial_payment_method_id: template.financial_payment_method_id,
        customer_name: template.customer_name,
        description: template.description,
        amount_cents: template.amount_cents,
        status: 'open',
        issue_date: getOperationalTodayIso(),
        due_date: dueDate,
        source: 'recurring_rule',
        source_ref: sourceRef,
        note: template.note
      }));
      lastMaterializedUntil = dueDate;
    }
  }

  if (lastMaterializedUntil !== rule.last_materialized_until) {
    db.prepare(`
      update financial_recurring_rule
      set last_materialized_until = ?,
          updated_at = ?
      where organization_id = ?
        and id = ?
    `).run(lastMaterializedUntil, nowIso, rule.organization_id, rule.id);
  }

  return { payables: createdPayables, receivables: createdReceivables };
}

export function createFinanceRecurringRuleFromResource(input: CreateFinanceRecurringRuleInput): {
  rule: FinanceRecurringRuleDto;
  payables: FinancePayableDto[];
  receivables: FinanceReceivableDto[];
} {
  const organizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(organizationId);
  const dayOfMonth = Math.max(1, Math.min(31, Math.trunc(input.day_of_month)));
  const materializationMonths = Math.max(1, Math.min(24, Math.trunc(input.materialization_months ?? 3)));
  const template = input.resource_type === 'payable'
    ? readFinancePayable(organizationId, input.resource_id)
    : readFinanceReceivable(organizationId, input.resource_id);
  const startDate = input.start_date || template.due_date || getOperationalTodayIso();
  const nowIso = new Date().toISOString();
  const id = uuid('frrule');

  db.prepare(`
    insert into financial_recurring_rule (
      id,
      organization_id,
      company_id,
      resource_type,
      template_resource_id,
      name,
      frequency,
      day_of_month,
      start_date,
      end_date,
      materialization_months,
      status,
      last_materialized_until,
      created_by,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, 'monthly', ?, ?, ?, ?, 'active', null, ?, ?, ?)
  `).run(
    id,
    organizationId,
    template.company_id,
    input.resource_type,
    template.id,
    template.description,
    dayOfMonth,
    startDate,
    input.end_date ?? null,
    materializationMonths,
    input.created_by ?? null,
    nowIso,
    nowIso
  );

  const rule = readFinanceRecurringRule(organizationId, id);
  const materialized = materializeFinanceRecurringRule(rule);
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: template.company_id,
    resource_type: input.resource_type,
    resource_id: template.id,
    action: 'recurring_rule',
    amount_cents: template.amount_cents,
    note: `Recorrência mensal criada para o dia ${dayOfMonth}`,
    created_by: input.created_by
  });

  return {
    rule: readFinanceRecurringRule(organizationId, id),
    ...materialized
  };
}

export function updateFinanceRecurringRule(input: UpdateFinanceRecurringRuleInput): FinanceRecurringRuleDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const current = readFinanceRecurringRule(organizationId, input.recurring_rule_id);
  const nextStatus = input.status ?? current.status;
  const nowIso = new Date().toISOString();

  db.prepare(`
    update financial_recurring_rule
    set status = ?,
        end_date = ?,
        materialization_months = ?,
        updated_at = ?
    where organization_id = ?
      and id = ?
  `).run(
    nextStatus,
    typeof input.end_date === 'undefined' ? current.end_date : input.end_date,
    Math.max(1, Math.min(24, Math.trunc(input.materialization_months ?? current.materialization_months))),
    nowIso,
    organizationId,
    input.recurring_rule_id
  );

  return readFinanceRecurringRule(organizationId, input.recurring_rule_id);
}

function recurringProjectionBounds(window: { start: string | null; end: string | null }) {
  const start = window.start ?? monthStartIso(getOperationalTodayIso());
  const end = window.end ?? addMonthsIso(start, 11);
  return { start, end };
}

function payableProjectionStatus(payable: Pick<FinancePayableDto, 'status'>): FinanceTransactionStatus {
  if (payable.status === 'paid') return 'settled';
  if (payable.status === 'partial') return 'partial';
  if (payable.status === 'canceled') return 'canceled';
  if (payable.status === 'planned') return 'planned';
  return 'open';
}

function receivableProjectionStatus(receivable: Pick<FinanceReceivableDto, 'status'>): FinanceTransactionStatus {
  if (receivable.status === 'received') return 'settled';
  if (receivable.status === 'partial') return 'partial';
  if (receivable.status === 'canceled') return 'canceled';
  if (receivable.status === 'planned') return 'planned';
  return 'open';
}

function recurringPayableAsTransaction(rule: FinanceRecurringRuleDto, payable: FinancePayableDto, scheduledDate: string, anchorDate: string): FinanceTransactionDto {
  const status = payableProjectionStatus(payable);
  const settlementDate = payable.paid_at ?? null;
  return {
    id: `recurring-projection:${rule.id}:${scheduledDate.slice(0, 7)}`,
    organization_id: payable.organization_id,
    financial_entity_id: payable.financial_entity_id,
    financial_entity_name: payable.financial_entity_name,
    financial_account_id: payable.financial_account_id,
    financial_account_name: payable.financial_account_name,
    financial_category_id: payable.financial_category_id,
    financial_category_name: payable.financial_category_name,
    financial_cost_center_id: payable.financial_cost_center_id,
    financial_cost_center_name: payable.financial_cost_center_name,
    financial_payment_method_id: payable.financial_payment_method_id,
    financial_payment_method_name: payable.financial_payment_method_name,
    kind: 'expense',
    status,
    amount_cents: payable.amount_cents,
    issue_date: payable.issue_date ?? anchorDate,
    due_date: anchorDate,
    settlement_date: settlementDate,
    competence_date: anchorDate,
    source: 'recurring_projection',
    source_ref: recurringSourceRef(rule.id, scheduledDate),
    note: payable.description,
    created_by: null,
    created_at: payable.created_at,
    updated_at: payable.updated_at,
    is_deleted: false,
    views: computeViews({
      kind: 'expense',
      status,
      amountCents: payable.amount_cents,
      issueDate: payable.issue_date ?? anchorDate,
      dueDate: anchorDate,
      settlementDate,
      competenceDate: anchorDate
    })
  };
}

function recurringReceivableAsTransaction(rule: FinanceRecurringRuleDto, receivable: FinanceReceivableDto, scheduledDate: string, anchorDate: string): FinanceTransactionDto {
  const status = receivableProjectionStatus(receivable);
  const settlementDate = receivable.received_at ?? null;
  return {
    id: `recurring-projection:${rule.id}:${scheduledDate.slice(0, 7)}`,
    organization_id: receivable.organization_id,
    financial_entity_id: receivable.financial_entity_id,
    financial_entity_name: receivable.financial_entity_name,
    financial_account_id: receivable.financial_account_id,
    financial_account_name: receivable.financial_account_name,
    financial_category_id: receivable.financial_category_id,
    financial_category_name: receivable.financial_category_name,
    financial_cost_center_id: receivable.financial_cost_center_id,
    financial_cost_center_name: receivable.financial_cost_center_name,
    financial_payment_method_id: receivable.financial_payment_method_id,
    financial_payment_method_name: receivable.financial_payment_method_name,
    kind: 'income',
    status,
    amount_cents: receivable.amount_cents,
    issue_date: receivable.issue_date ?? anchorDate,
    due_date: anchorDate,
    settlement_date: settlementDate,
    competence_date: anchorDate,
    source: 'recurring_projection',
    source_ref: recurringSourceRef(rule.id, scheduledDate),
    note: receivable.description,
    created_by: null,
    created_at: receivable.created_at,
    updated_at: receivable.updated_at,
    is_deleted: false,
    views: computeViews({
      kind: 'income',
      status,
      amountCents: receivable.amount_cents,
      issueDate: receivable.issue_date ?? anchorDate,
      dueDate: anchorDate,
      settlementDate,
      competenceDate: anchorDate
    })
  };
}

export function listFinanceRecurringProjectionTransactions(
  organizationId: string,
  window: { start: string | null; end: string | null }
): FinanceTransactionDto[] {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const { start, end } = recurringProjectionBounds(window);
  const activeRules = listFinanceRecurringRules(normalizedOrganizationId).filter((rule) => rule.status === 'active');
  if (activeRules.length === 0) return [];

  const payables = listFinancePayables(normalizedOrganizationId).payables;
  const receivables = listFinanceReceivables(normalizedOrganizationId).receivables;
  const payablesById = new Map(payables.map((payable) => [payable.id, payable]));
  const receivablesById = new Map(receivables.map((receivable) => [receivable.id, receivable]));
  const payablesBySourceRef = new Map(payables.filter((payable) => payable.source_ref).map((payable) => [payable.source_ref, payable]));
  const receivablesBySourceRef = new Map(receivables.filter((receivable) => receivable.source_ref).map((receivable) => [receivable.source_ref, receivable]));
  const projections: FinanceTransactionDto[] = [];

  for (const rule of activeRules) {
    const startOffset = Math.max(0, monthOffsetFromStart(rule.start_date, start));
    const endOffset = Math.max(startOffset, monthOffsetFromStart(rule.start_date, end));

    for (let index = startOffset; index <= endOffset; index += 1) {
      const scheduledDate = monthlyRuleDate(rule.start_date, rule.day_of_month, index);
      if (scheduledDate < rule.start_date) continue;
      if (rule.end_date && scheduledDate > rule.end_date) continue;

      if (rule.resource_type === 'payable') {
        const sourceRef = recurringSourceRef(rule.id, scheduledDate);
        const actualPayable = scheduledDate.slice(0, 7) === rule.start_date.slice(0, 7)
          ? payablesById.get(rule.template_resource_id)
          : payablesBySourceRef.get(sourceRef);
        const payable = actualPayable ?? payablesById.get(rule.template_resource_id);
        if (!payable) continue;
        const anchor = actualPayable ? payable.due_date ?? scheduledDate : scheduledDate;
        if (anchor < start || anchor > end) continue;
        projections.push(recurringPayableAsTransaction(rule, payable, scheduledDate, anchor));
      } else {
        const sourceRef = recurringSourceRef(rule.id, scheduledDate);
        const actualReceivable = scheduledDate.slice(0, 7) === rule.start_date.slice(0, 7)
          ? receivablesById.get(rule.template_resource_id)
          : receivablesBySourceRef.get(sourceRef);
        const receivable = actualReceivable ?? receivablesById.get(rule.template_resource_id);
        if (!receivable) continue;
        const anchor = actualReceivable ? receivable.due_date ?? scheduledDate : scheduledDate;
        if (anchor < start || anchor > end) continue;
        projections.push(recurringReceivableAsTransaction(rule, receivable, scheduledDate, anchor));
      }
    }
  }

  return projections;
}

function createPayableSettlementMovement(
  payable: FinancePayableDto,
  amountCents: number,
  settledAt: string,
  createdBy?: string | null,
  note?: string | null
) {
  return createFinanceTransaction({
    organization_id: payable.organization_id,
    company_id: payable.company_id,
    financial_entity_id: payable.financial_entity_id,
    financial_account_id: payable.financial_account_id,
    financial_category_id: payable.financial_category_id,
    financial_cost_center_id: payable.financial_cost_center_id,
    financial_payment_method_id: payable.financial_payment_method_id,
    kind: 'expense',
    status: 'settled',
    amount_cents: amountCents,
    issue_date: payable.issue_date ?? payable.due_date ?? settledAt,
    due_date: payable.due_date,
    settlement_date: settledAt,
    competence_date: payable.due_date ?? payable.issue_date ?? settledAt,
    source: 'payable_settlement',
    source_ref: payable.id,
    note: note?.trim() || `Baixa de conta a pagar: ${payable.description}`,
    created_by: createdBy ?? null
  });
}

function createReceivableSettlementMovement(
  receivable: FinanceReceivableDto,
  amountCents: number,
  settledAt: string,
  createdBy?: string | null,
  note?: string | null
) {
  return createFinanceTransaction({
    organization_id: receivable.organization_id,
    company_id: receivable.company_id,
    financial_entity_id: receivable.financial_entity_id,
    financial_account_id: receivable.financial_account_id,
    financial_category_id: receivable.financial_category_id,
    financial_cost_center_id: receivable.financial_cost_center_id,
    financial_payment_method_id: receivable.financial_payment_method_id,
    kind: 'income',
    status: 'settled',
    amount_cents: amountCents,
    issue_date: receivable.issue_date ?? receivable.due_date ?? settledAt,
    due_date: receivable.due_date,
    settlement_date: settledAt,
    competence_date: receivable.due_date ?? receivable.issue_date ?? settledAt,
    source: 'receivable_settlement',
    source_ref: receivable.id,
    note: note?.trim() || `Baixa de conta a receber: ${receivable.description}`,
    created_by: createdBy ?? null
  });
}

export function settleFinancePayable(input: FinanceOperationInput): FinancePayableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  if (payable.status === 'canceled') {
    throw new Error('Conta a pagar cancelada não pode ser baixada.');
  }
  const remainingAmount = Math.max(0, payable.amount_cents - payable.paid_amount_cents);
  if (remainingAmount <= 0) {
    throw new Error('Conta a pagar já está baixada.');
  }
  const settledAt = input.settled_at ?? getOperationalTodayIso();
  const movement = createPayableSettlementMovement(payable, remainingAmount, settledAt, input.created_by, input.note);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_payable
    set status = 'paid',
        paid_at = ?,
        paid_amount_cents = amount_cents,
        financial_transaction_id = ?,
        note = coalesce(nullif(?, ''), note),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(settledAt, movement.id, input.note?.trim() || null, nowIso, organizationId, input.resource_id);
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'settle',
    amount_cents: remainingAmount,
    note: input.note,
    created_by: input.created_by
  });
  return readFinancePayable(organizationId, input.resource_id);
}

export function partiallySettleFinancePayable(input: FinancePartialSettlementInput): FinancePayableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  if (payable.status === 'canceled') {
    throw new Error('Conta a pagar cancelada não pode receber baixa parcial.');
  }
  if (input.amount_cents <= 0) {
    throw new Error('Informe um valor positivo para baixa parcial.');
  }
  const remainingAmount = Math.max(0, payable.amount_cents - payable.paid_amount_cents);
  if (remainingAmount <= 0) {
    throw new Error('Conta a pagar já está baixada.');
  }
  const settlementAmount = Math.min(remainingAmount, Math.trunc(input.amount_cents));
  const nextPaidAmount = Math.min(payable.amount_cents, payable.paid_amount_cents + settlementAmount);
  const isPaid = nextPaidAmount >= payable.amount_cents;
  const settledAt = input.settled_at ?? getOperationalTodayIso();
  const movement = createPayableSettlementMovement(payable, settlementAmount, settledAt, input.created_by, input.note);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_payable
    set status = ?,
        paid_at = ?,
        paid_amount_cents = ?,
        financial_transaction_id = ?,
        note = coalesce(nullif(?, ''), note),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    isPaid ? 'paid' : 'partial',
    isPaid ? settledAt : null,
    nextPaidAmount,
    movement.id,
    input.note?.trim() || null,
    nowIso,
    organizationId,
    input.resource_id
  );
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'partial_settle',
    amount_cents: settlementAmount,
    note: input.note,
    created_by: input.created_by
  });
  return readFinancePayable(organizationId, input.resource_id);
}

export function cancelFinancePayable(input: FinanceOperationInput): FinancePayableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_payable
    set status = 'canceled',
        note = coalesce(nullif(?, ''), note),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(input.note?.trim() || null, nowIso, organizationId, input.resource_id);
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'cancel',
    note: input.note,
    created_by: input.created_by
  });
  return readFinancePayable(organizationId, input.resource_id);
}

export function duplicateFinancePayable(input: FinanceOperationInput): FinancePayableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  const duplicated = createFinancePayable({
    organization_id: organizationId,
    company_id: payable.company_id,
    financial_entity_id: payable.financial_entity_id,
    financial_account_id: payable.financial_account_id,
    financial_category_id: payable.financial_category_id,
    financial_cost_center_id: payable.financial_cost_center_id,
    financial_payment_method_id: payable.financial_payment_method_id,
    supplier_name: payable.supplier_name,
    description: `${payable.description} (cópia)`,
    amount_cents: payable.amount_cents,
    status: 'open',
    issue_date: getOperationalTodayIso(),
    due_date: payable.due_date,
    note: input.note?.trim() || payable.note
  });
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'duplicate',
    note: `Cópia criada: ${duplicated.id}`,
    created_by: input.created_by
  });
  return duplicated;
}

export function createFinancePayableInstallments(input: FinanceScheduleOperationInput): FinancePayableDto[] {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  const count = Math.max(2, Math.min(36, Math.trunc(input.count)));
  const baseAmount = Math.floor(payable.amount_cents / count);
  const remainder = payable.amount_cents - (baseAmount * count);
  const firstDueDate = input.first_due_date || payable.due_date || getOperationalTodayIso();
  const created: FinancePayableDto[] = [];

  for (let index = 0; index < count; index += 1) {
    created.push(createFinancePayable({
      organization_id: organizationId,
      company_id: payable.company_id,
      financial_entity_id: payable.financial_entity_id,
      financial_account_id: payable.financial_account_id,
      financial_category_id: payable.financial_category_id,
      financial_cost_center_id: payable.financial_cost_center_id,
      financial_payment_method_id: payable.financial_payment_method_id,
      supplier_name: payable.supplier_name,
      description: `${payable.description} ${index + 1}/${count}`,
      amount_cents: baseAmount + (index === 0 ? remainder : 0),
      status: 'open',
      issue_date: getOperationalTodayIso(),
      due_date: addMonthsIso(firstDueDate, index),
      note: input.note?.trim() || payable.note
    }));
  }

  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'installments',
    amount_cents: payable.amount_cents,
    note: `${count} parcelas criadas`,
    created_by: input.created_by
  });
  return created;
}

export function createFinancePayableRecurrences(input: FinanceScheduleOperationInput): FinancePayableDto[] {
  const organizationId = resolveOrganizationId(input.organization_id);
  const payable = readFinancePayable(organizationId, input.resource_id);
  const count = Math.max(1, Math.min(36, Math.trunc(input.count)));
  const firstDueDate = input.first_due_date || payable.due_date || getOperationalTodayIso();
  const created: FinancePayableDto[] = [];

  for (let index = 0; index < count; index += 1) {
    created.push(createFinancePayable({
      organization_id: organizationId,
      company_id: payable.company_id,
      financial_entity_id: payable.financial_entity_id,
      financial_account_id: payable.financial_account_id,
      financial_category_id: payable.financial_category_id,
      financial_cost_center_id: payable.financial_cost_center_id,
      financial_payment_method_id: payable.financial_payment_method_id,
      supplier_name: payable.supplier_name,
      description: `${payable.description} recorrente ${index + 1}/${count}`,
      amount_cents: payable.amount_cents,
      status: 'open',
      issue_date: getOperationalTodayIso(),
      due_date: addMonthsIso(firstDueDate, index),
      note: input.note?.trim() || payable.note
    }));
  }

  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: payable.company_id,
    resource_type: 'payable',
    resource_id: payable.id,
    action: 'recurrence',
    amount_cents: payable.amount_cents,
    note: `${count} recorrências criadas`,
    created_by: input.created_by
  });
  return created;
}

export function settleFinanceReceivable(input: FinanceOperationInput): FinanceReceivableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const receivable = readFinanceReceivable(organizationId, input.resource_id);
  if (receivable.status === 'canceled') {
    throw new Error('Conta a receber cancelada não pode ser baixada.');
  }
  const remainingAmount = Math.max(0, receivable.amount_cents - receivable.received_amount_cents);
  if (remainingAmount <= 0) {
    throw new Error('Conta a receber já está baixada.');
  }
  const settledAt = input.settled_at ?? getOperationalTodayIso();
  const movement = createReceivableSettlementMovement(receivable, remainingAmount, settledAt, input.created_by, input.note);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_receivable
    set status = 'received',
        received_at = ?,
        received_amount_cents = amount_cents,
        financial_transaction_id = ?,
        note = coalesce(nullif(?, ''), note),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(settledAt, movement.id, input.note?.trim() || null, nowIso, organizationId, input.resource_id);
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: receivable.company_id,
    resource_type: 'receivable',
    resource_id: receivable.id,
    action: 'settle',
    amount_cents: remainingAmount,
    note: input.note,
    created_by: input.created_by
  });
  return readFinanceReceivable(organizationId, input.resource_id);
}

export function partiallySettleFinanceReceivable(input: FinancePartialSettlementInput): FinanceReceivableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const receivable = readFinanceReceivable(organizationId, input.resource_id);
  if (receivable.status === 'canceled') {
    throw new Error('Conta a receber cancelada não pode receber baixa parcial.');
  }
  if (input.amount_cents <= 0) {
    throw new Error('Informe um valor positivo para baixa parcial.');
  }
  const remainingAmount = Math.max(0, receivable.amount_cents - receivable.received_amount_cents);
  if (remainingAmount <= 0) {
    throw new Error('Conta a receber já está baixada.');
  }
  const settlementAmount = Math.min(remainingAmount, Math.trunc(input.amount_cents));
  const nextReceivedAmount = Math.min(receivable.amount_cents, receivable.received_amount_cents + settlementAmount);
  const isReceived = nextReceivedAmount >= receivable.amount_cents;
  const settledAt = input.settled_at ?? getOperationalTodayIso();
  const movement = createReceivableSettlementMovement(receivable, settlementAmount, settledAt, input.created_by, input.note);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_receivable
    set status = ?,
        received_at = ?,
        received_amount_cents = ?,
        financial_transaction_id = ?,
        note = coalesce(nullif(?, ''), note),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(
    isReceived ? 'received' : 'partial',
    isReceived ? settledAt : null,
    nextReceivedAmount,
    movement.id,
    input.note?.trim() || null,
    nowIso,
    organizationId,
    input.resource_id
  );
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: receivable.company_id,
    resource_type: 'receivable',
    resource_id: receivable.id,
    action: 'partial_settle',
    amount_cents: settlementAmount,
    note: input.note,
    created_by: input.created_by
  });
  return readFinanceReceivable(organizationId, input.resource_id);
}

export function cancelFinanceReceivable(input: FinanceOperationInput): FinanceReceivableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const receivable = readFinanceReceivable(organizationId, input.resource_id);
  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_receivable
    set status = 'canceled',
        note = coalesce(nullif(?, ''), note),
        updated_at = ?
    where organization_id = ? and id = ?
  `).run(input.note?.trim() || null, nowIso, organizationId, input.resource_id);
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: receivable.company_id,
    resource_type: 'receivable',
    resource_id: receivable.id,
    action: 'cancel',
    note: input.note,
    created_by: input.created_by
  });
  return readFinanceReceivable(organizationId, input.resource_id);
}

export function duplicateFinanceReceivable(input: FinanceOperationInput): FinanceReceivableDto {
  const organizationId = resolveOrganizationId(input.organization_id);
  const receivable = readFinanceReceivable(organizationId, input.resource_id);
  const duplicated = createFinanceReceivable({
    organization_id: organizationId,
    company_id: receivable.company_id,
    financial_entity_id: receivable.financial_entity_id,
    financial_account_id: receivable.financial_account_id,
    financial_category_id: receivable.financial_category_id,
    financial_cost_center_id: receivable.financial_cost_center_id,
    financial_payment_method_id: receivable.financial_payment_method_id,
    customer_name: receivable.customer_name,
    description: `${receivable.description} (cópia)`,
    amount_cents: receivable.amount_cents,
    status: 'open',
    issue_date: getOperationalTodayIso(),
    due_date: receivable.due_date,
    note: input.note?.trim() || receivable.note
  });
  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: receivable.company_id,
    resource_type: 'receivable',
    resource_id: receivable.id,
    action: 'duplicate',
    note: `Cópia criada: ${duplicated.id}`,
    created_by: input.created_by
  });
  return duplicated;
}

export function createFinanceReceivableInstallments(input: FinanceScheduleOperationInput): FinanceReceivableDto[] {
  const organizationId = resolveOrganizationId(input.organization_id);
  const receivable = readFinanceReceivable(organizationId, input.resource_id);
  const count = Math.max(2, Math.min(36, Math.trunc(input.count)));
  const baseAmount = Math.floor(receivable.amount_cents / count);
  const remainder = receivable.amount_cents - (baseAmount * count);
  const firstDueDate = input.first_due_date || receivable.due_date || getOperationalTodayIso();
  const created: FinanceReceivableDto[] = [];

  for (let index = 0; index < count; index += 1) {
    created.push(createFinanceReceivable({
      organization_id: organizationId,
      company_id: receivable.company_id,
      financial_entity_id: receivable.financial_entity_id,
      financial_account_id: receivable.financial_account_id,
      financial_category_id: receivable.financial_category_id,
      financial_cost_center_id: receivable.financial_cost_center_id,
      financial_payment_method_id: receivable.financial_payment_method_id,
      customer_name: receivable.customer_name,
      description: `${receivable.description} ${index + 1}/${count}`,
      amount_cents: baseAmount + (index === 0 ? remainder : 0),
      status: 'open',
      issue_date: getOperationalTodayIso(),
      due_date: addMonthsIso(firstDueDate, index),
      note: input.note?.trim() || receivable.note
    }));
  }

  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: receivable.company_id,
    resource_type: 'receivable',
    resource_id: receivable.id,
    action: 'installments',
    amount_cents: receivable.amount_cents,
    note: `${count} parcelas criadas`,
    created_by: input.created_by
  });
  return created;
}

export function createFinanceReceivableRecurrences(input: FinanceScheduleOperationInput): FinanceReceivableDto[] {
  const organizationId = resolveOrganizationId(input.organization_id);
  const receivable = readFinanceReceivable(organizationId, input.resource_id);
  const count = Math.max(1, Math.min(36, Math.trunc(input.count)));
  const firstDueDate = input.first_due_date || receivable.due_date || getOperationalTodayIso();
  const created: FinanceReceivableDto[] = [];

  for (let index = 0; index < count; index += 1) {
    created.push(createFinanceReceivable({
      organization_id: organizationId,
      company_id: receivable.company_id,
      financial_entity_id: receivable.financial_entity_id,
      financial_account_id: receivable.financial_account_id,
      financial_category_id: receivable.financial_category_id,
      financial_cost_center_id: receivable.financial_cost_center_id,
      financial_payment_method_id: receivable.financial_payment_method_id,
      customer_name: receivable.customer_name,
      description: `${receivable.description} recorrente ${index + 1}/${count}`,
      amount_cents: receivable.amount_cents,
      status: 'open',
      issue_date: getOperationalTodayIso(),
      due_date: addMonthsIso(firstDueDate, index),
      note: input.note?.trim() || receivable.note
    }));
  }

  writeFinanceOperationAudit({
    organization_id: organizationId,
    company_id: receivable.company_id,
    resource_type: 'receivable',
    resource_id: receivable.id,
    action: 'recurrence',
    amount_cents: receivable.amount_cents,
    note: `${count} recorrências criadas`,
    created_by: input.created_by
  });
  return created;
}

function mapImportJobRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
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
  company_id: string | null;
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
  company_id: string | null;
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
  const confidenceMatch = row.note?.match(/confidence=([0-9.]+)/);
  const confidenceScore = confidenceMatch ? Number(confidenceMatch[1]) : null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    company_id: row.company_id,
    financial_bank_statement_entry_id: row.financial_bank_statement_entry_id,
    financial_transaction_id: row.financial_transaction_id,
    confidence_score: Number.isFinite(confidenceScore) ? confidenceScore : null,
    match_status: row.match_status as FinanceReconciliationMatchDto['match_status'],
    source: row.match_type,
    reviewed_by: row.matched_by,
    reviewed_at: row.matched_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function getDateDifferenceInDays(left: string, right: string) {
  const leftValue = new Date(`${left}T00:00:00.000Z`).getTime();
  const rightValue = new Date(`${right}T00:00:00.000Z`).getTime();
  return Math.round((leftValue - rightValue) / 86_400_000);
}

function getDateOffsetIso(baseDate: string, offsetDays: number) {
  const value = new Date(`${baseDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function getTransactionAnchorDate(transaction: FinanceTransactionDto) {
  return transaction.settlement_date
    ?? transaction.due_date
    ?? transaction.competence_date
    ?? transaction.issue_date
    ?? transaction.created_at.slice(0, 10);
}

const RECONCILIATION_STOPWORDS = new Set([
  'a',
  'ao',
  'com',
  'da',
  'de',
  'do',
  'dos',
  'em',
  'e',
  'para',
  'pagamento',
  'pago',
  'recebimento',
  'recebido',
  'transferencia',
  'pix',
  'ted',
  'doc'
]);

function normalizeReconciliationText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function reconciliationTokens(value: string | null | undefined) {
  return normalizeReconciliationText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !RECONCILIATION_STOPWORDS.has(token));
}

function reconciliationPattern(value: string | null | undefined) {
  return reconciliationTokens(value).slice(0, 3).join(' ');
}

function descriptionScore(entryDescription: string, transaction: FinanceTransactionDto) {
  const entryTokens = reconciliationTokens(entryDescription);
  if (entryTokens.length === 0) return 0;

  const transactionTokens = new Set(reconciliationTokens([
    transaction.note,
    transaction.financial_entity_name,
    transaction.financial_category_name,
    transaction.financial_cost_center_name
  ].filter(Boolean).join(' ')));
  if (transactionTokens.size === 0) return 0;

  const overlap = entryTokens.filter((token) => transactionTokens.has(token)).length;
  return Number(Math.min(1, overlap / Math.max(1, Math.min(entryTokens.length, 5))).toFixed(2));
}

function entryMentionsEntity(entryDescription: string, transaction: FinanceTransactionDto) {
  const entityTokens = reconciliationTokens(transaction.financial_entity_name);
  if (entityTokens.length === 0) return false;
  const entryText = ` ${normalizeReconciliationText(entryDescription)} `;
  return entityTokens.some((token) => entryText.includes(` ${token} `));
}

function buildLearnedReconciliationRules(params: {
  entries: FinanceStatementEntryDto[];
  matches: FinanceReconciliationMatchDto[];
  transactions: FinanceTransactionDto[];
}): FinanceReconciliationLearnedRuleDto[] {
  const entriesById = new Map(params.entries.map((entry) => [entry.id, entry]));
  const transactionsById = new Map(params.transactions.map((transaction) => [transaction.id, transaction]));
  const buckets = new Map<string, {
    pattern: string;
    usage_count: number;
    financial_entity_id: string | null;
    financial_entity_name: string | null;
    financial_category_id: string | null;
    financial_category_name: string | null;
    financial_cost_center_id: string | null;
    financial_cost_center_name: string | null;
  }>();

  for (const match of params.matches) {
    if (match.match_status !== 'matched' || !match.financial_transaction_id) continue;
    const entry = entriesById.get(match.financial_bank_statement_entry_id);
    const transaction = transactionsById.get(match.financial_transaction_id);
    if (!entry || !transaction) continue;

    const pattern = reconciliationPattern(entry.description);
    if (!pattern) continue;
    const key = [
      pattern,
      transaction.kind,
      transaction.financial_entity_id ?? '',
      transaction.financial_category_id ?? '',
      transaction.financial_cost_center_id ?? ''
    ].join('|');
    const current = buckets.get(key) ?? {
      pattern,
      usage_count: 0,
      financial_entity_id: transaction.financial_entity_id,
      financial_entity_name: transaction.financial_entity_name,
      financial_category_id: transaction.financial_category_id,
      financial_category_name: transaction.financial_category_name,
      financial_cost_center_id: transaction.financial_cost_center_id,
      financial_cost_center_name: transaction.financial_cost_center_name
    };
    current.usage_count += 1;
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .filter((rule) => rule.usage_count >= 2)
    .map((rule) => {
      const label = rule.financial_entity_name
        ?? rule.financial_category_name
        ?? rule.financial_cost_center_name
        ?? rule.pattern;
      return {
        id: `rule-${normalizeReconciliationText(`${rule.pattern} ${label}`).replace(/\s+/g, '-')}`,
        label,
        pattern: rule.pattern,
        usage_count: rule.usage_count,
        confidence_boost: Number(Math.min(0.2, 0.08 + rule.usage_count * 0.04).toFixed(2)),
        financial_entity_name: rule.financial_entity_name,
        financial_category_name: rule.financial_category_name,
        financial_cost_center_name: rule.financial_cost_center_name
      };
    })
    .sort((left, right) => right.usage_count - left.usage_count || left.label.localeCompare(right.label))
    .slice(0, 8);
}

function matchingLearnedRule(
  entry: FinanceStatementEntryDto,
  transaction: FinanceTransactionDto,
  rules: FinanceReconciliationLearnedRuleDto[]
) {
  const entryText = ` ${normalizeReconciliationText(entry.description)} `;
  return rules.find((rule) => {
    const patternTokens = reconciliationTokens(rule.pattern);
    if (patternTokens.length === 0 || !patternTokens.every((token) => entryText.includes(` ${token} `))) {
      return false;
    }
    if (rule.financial_entity_name && transaction.financial_entity_name !== rule.financial_entity_name) {
      return false;
    }
    if (rule.financial_category_name && transaction.financial_category_name !== rule.financial_category_name) {
      return false;
    }
    if (rule.financial_cost_center_name && transaction.financial_cost_center_name !== rule.financial_cost_center_name) {
      return false;
    }
    return true;
  }) ?? null;
}

function buildReconciliationSuggestion(
  entry: FinanceStatementEntryDto,
  transaction: FinanceTransactionDto,
  learnedRules: FinanceReconciliationLearnedRuleDto[]
): FinanceReconciliationSuggestionDto {
  const entryDate = entry.posted_at ?? entry.statement_date;
  const anchorDate = getTransactionAnchorDate(transaction);
  const dateGapDays = anchorDate ? Math.abs(getDateDifferenceInDays(entryDate, anchorDate)) : 30;
  const entryDirection = entry.amount_cents >= 0 ? 'inflow' : 'outflow';
  const transactionDirection = transaction.kind === 'income' ? 'inflow' : 'outflow';
  const directionMatches = entryDirection === transactionDirection;
  const amountGapCents = Math.abs(Math.abs(entry.amount_cents) - Math.abs(transaction.amount_cents));
  const textScore = descriptionScore(entry.description, transaction);
  const mentionsEntity = entryMentionsEntity(entry.description, transaction);
  const learnedRule = matchingLearnedRule(entry, transaction, learnedRules);
  const reasons: FinanceReconciliationSuggestionReasonDto[] = [];

  let confidence = 0.16;
  if (amountGapCents === 0) {
    confidence += 0.28;
    reasons.push({ label: 'Valor exato', detail: 'O valor do extrato bate com o lançamento.', tone: 'positive' });
  } else {
    confidence += 0.12;
    reasons.push({ label: 'Valor próximo', detail: `Diferença de ${Math.abs(amountGapCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, tone: 'warning' });
  }
  if (directionMatches) {
    confidence += 0.16;
    reasons.push({ label: 'Direção compatível', detail: entryDirection === 'inflow' ? 'Entrada com receita.' : 'Saída com despesa.', tone: 'positive' });
  }
  if (dateGapDays <= 1) {
    confidence += 0.16;
    reasons.push({ label: 'Data muito próxima', detail: `${dateGapDays} dia de diferença.`, tone: 'positive' });
  } else if (dateGapDays <= 3) {
    confidence += 0.1;
    reasons.push({ label: 'Data próxima', detail: `${dateGapDays} dias de diferença.`, tone: 'positive' });
  } else if (dateGapDays <= 7) {
    confidence += 0.05;
    reasons.push({ label: 'Data aceitável', detail: `${dateGapDays} dias de diferença.`, tone: 'neutral' });
  }
  if (textScore > 0) {
    confidence += Math.min(0.16, textScore * 0.16);
    reasons.push({ label: 'Descrição parecida', detail: `${Math.round(textScore * 100)}% de sinal textual.`, tone: 'positive' });
  }
  if (mentionsEntity) {
    confidence += 0.1;
    reasons.push({ label: 'Entidade encontrada', detail: transaction.financial_entity_name ?? 'Nome da entidade aparece no extrato.', tone: 'positive' });
  }
  if (learnedRule) {
    confidence += learnedRule.confidence_boost;
    reasons.push({ label: 'Regra aprendida', detail: `${learnedRule.usage_count} decisões anteriores parecidas.`, tone: 'positive' });
  }

  const source = learnedRule
    ? 'learned_rule'
    : textScore >= 0.2 || mentionsEntity
      ? 'description'
      : 'value_date';

  return {
    financial_transaction_id: transaction.id,
    description: transaction.note?.trim()
      || transaction.financial_entity_name
      || transaction.financial_category_name
      || (transaction.kind === 'income' ? 'Receita operacional' : 'Despesa operacional'),
    amount_cents: transaction.amount_cents,
    kind: transaction.kind,
    status: transaction.status,
    due_date: transaction.due_date,
    competence_date: transaction.competence_date,
    financial_entity_name: transaction.financial_entity_name,
    confidence_score: Number(Math.min(confidence, 0.99).toFixed(2)),
    source,
    amount_gap_cents: amountGapCents,
    date_gap_days: anchorDate ? dateGapDays : null,
    description_score: textScore,
    learned_rule_id: learnedRule?.id ?? null,
    learned_rule_label: learnedRule?.label ?? null,
    reasons
  };
}

function buildReconciliationSuggestions(params: {
  entry: FinanceStatementEntryDto;
  transactions: FinanceTransactionDto[];
  matchedTransactionIds: Set<string>;
  learnedRules: FinanceReconciliationLearnedRuleDto[];
}) {
  const entryAmount = Math.abs(params.entry.amount_cents);
  const entryDirection = params.entry.amount_cents >= 0 ? 'income' : 'expense';
  const maxAmountGap = Math.max(500, Math.round(entryAmount * 0.02));

  return params.transactions
    .filter((transaction) => !params.matchedTransactionIds.has(transaction.id))
    .filter((transaction) => !transaction.is_deleted && transaction.status !== 'canceled')
    .filter((transaction) => Math.abs(Math.abs(transaction.amount_cents) - entryAmount) <= maxAmountGap)
    .filter((transaction) => {
      if (transaction.kind === 'transfer' || transaction.kind === 'adjustment') {
        return true;
      }
      return transaction.kind === entryDirection;
    })
    .map((transaction) => buildReconciliationSuggestion(params.entry, transaction, params.learnedRules))
    .filter((suggestion) => suggestion.confidence_score >= 0.48)
    .sort((left, right) => right.confidence_score - left.confidence_score)
    .slice(0, 3);
}

function classifyReconciliationBucket(params: {
  entryDate: string;
  ageDays: number;
  suggestionCount: number;
}): FinanceReconciliationBucketKey {
  if (params.ageDays >= 3 || params.suggestionCount === 0) {
    return 'urgent';
  }
  if (params.entryDate === getOperationalTodayIso()) {
    return 'today';
  }
  return 'review';
}

function buildReconciliationBucketDtos(
  entries: FinanceReconciliationInboxDto['inbox']
): FinanceReconciliationBucketDto[] {
  const bucketMap = new Map<FinanceReconciliationBucketKey, FinanceReconciliationBucketDto>([
    ['urgent', { key: 'urgent', label: 'Urgentes', count: 0, amount_cents: 0, entries: [] }],
    ['today', { key: 'today', label: 'Movimento de hoje', count: 0, amount_cents: 0, entries: [] }],
    ['review', { key: 'review', label: 'Fila geral', count: 0, amount_cents: 0, entries: [] }]
  ]);

  for (const entry of entries) {
    const bucket = bucketMap.get(entry.queue_bucket);
    if (!bucket) continue;
    bucket.entries.push(entry);
    bucket.count += 1;
    bucket.amount_cents += Math.abs(entry.amount_cents);
  }

  return Array.from(bucketMap.values());
}

function buildReconciliationInsights(params: {
  pendingCount: number;
  withSuggestionCount: number;
  withoutSuggestionCount: number;
  staleCount: number;
}): FinanceReconciliationInsightDto[] {
  const coverage = params.pendingCount > 0
    ? Math.round((params.withSuggestionCount / params.pendingCount) * 100)
    : 100;

  return [
    {
      id: 'coverage',
      label: 'Cobertura de sugestão',
      value: `${coverage}%`,
      tone: coverage >= 70 ? 'neutral' : 'warning'
    },
    {
      id: 'manual-review',
      label: 'Sem sugestão',
      value: `${params.withoutSuggestionCount}`,
      tone: params.withoutSuggestionCount > 0 ? 'warning' : 'neutral'
    },
    {
      id: 'stale',
      label: 'Aging crítico',
      value: `${params.staleCount}`,
      tone: params.staleCount > 0 ? 'critical' : 'neutral'
    }
  ];
}

export function getFinanceReconciliationInbox(
  organizationId: string,
  companyId?: string | null
): FinanceReconciliationInboxDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const organization = readOrganizationRow(normalizedOrganizationId);
  const entries = listFinanceStatementEntries(normalizedOrganizationId, companyId).entries;
  const jobs = listFinanceImportJobs(normalizedOrganizationId, companyId).jobs;
  const matches = listFinanceReconciliationMatches(normalizedOrganizationId, companyId).matches;
  const transactions = listFinanceTransactions(normalizedOrganizationId, {}).transactions;
  const learnedRules = buildLearnedReconciliationRules({ entries, matches, transactions });
  const todayIso = getOperationalTodayIso();
  const staleCutoff = getDateOffsetIso(todayIso, -3);

  const matchedEntries = new Map<string, FinanceReconciliationMatchDto>();
  const matchedTransactionIds = new Set<string>();
  for (const match of matches) {
    if (match.match_status !== 'matched') {
      continue;
    }
    if (!matchedEntries.has(match.financial_bank_statement_entry_id)) {
      matchedEntries.set(match.financial_bank_statement_entry_id, match);
    }
    if (match.financial_transaction_id) {
      matchedTransactionIds.add(match.financial_transaction_id);
    }
  }

  const inbox = entries
    .filter((entry) => !matchedEntries.has(entry.id))
    .map((entry) => {
      const entryDate = entry.posted_at ?? entry.statement_date;
      const ageDays = Math.max(0, getDateDifferenceInDays(todayIso, entryDate));
      const suggestedMatches = buildReconciliationSuggestions({
        entry,
        transactions,
        matchedTransactionIds,
        learnedRules
      });
      return {
        ...entry,
        matched_transaction_id: null,
        matched_at: null,
        queue_bucket: classifyReconciliationBucket({
          entryDate,
          ageDays,
          suggestionCount: suggestedMatches.length
        }),
        age_days: ageDays,
        suggestion_count: suggestedMatches.length,
        suggested_matches: suggestedMatches
      };
    })
    .sort((left, right) => {
      const bucketRank: Record<FinanceReconciliationBucketKey, number> = {
        urgent: 0,
        today: 1,
        review: 2
      };
      const bucketCompare = bucketRank[left.queue_bucket] - bucketRank[right.queue_bucket];
      if (bucketCompare !== 0) {
        return bucketCompare;
      }
      const dateCompare = right.statement_date.localeCompare(left.statement_date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return Math.abs(right.amount_cents) - Math.abs(left.amount_cents);
    });

  const recentMatches = matches
    .filter((match) => match.match_status === 'matched')
    .slice(0, 5);

  const withSuggestionCount = inbox.filter((entry) => entry.suggestion_count > 0).length;
  const withoutSuggestionCount = inbox.length - withSuggestionCount;

  return {
    organization_id: normalizedOrganizationId,
    organization_name: organization.name,
    generated_at: new Date().toISOString(),
    summary: {
      pending_count: inbox.length,
      pending_amount_cents: inbox.reduce((total, entry) => total + Math.abs(entry.amount_cents), 0),
      matched_today_count: recentMatches.filter((match) => match.reviewed_at?.slice(0, 10) === todayIso).length,
      imported_jobs_count: jobs.length,
      stale_count: inbox.filter((entry) => entry.statement_date < staleCutoff).length,
      with_suggestion_count: withSuggestionCount,
      without_suggestion_count: withoutSuggestionCount
    },
    buckets: buildReconciliationBucketDtos(inbox),
    insights: buildReconciliationInsights({
      pendingCount: inbox.length,
      withSuggestionCount,
      withoutSuggestionCount,
      staleCount: inbox.filter((entry) => entry.statement_date < staleCutoff).length
    }),
    learned_rules: learnedRules,
    inbox,
    recent_matches: recentMatches,
    imported_jobs: jobs.slice(0, 5)
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
    company_id: string | null;
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
  if (companyId) {
    readCompanyRow(companyId);
  }
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
    company_id: string | null;
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
      and fa.id = fbe.financial_account_id
    where fbe.organization_id = ?
      and (? is null or fbe.company_id = ?)
    order by fbe.statement_date desc, fbe.created_at desc
  `).all(normalizedOrganizationId, companyFilter, companyFilter) as Array<{
    id: string;
    organization_id: string;
    company_id: string | null;
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
  const account = db.prepare(`
    select id
    from financial_account
    where id = ?
      and organization_id = ?
    limit 1
  `).get(input.financial_account_id, normalizedOrganizationId) as { id: string } | undefined;
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
      limit 1
    `).get(importJobId, normalizedOrganizationId) as { id: string } | undefined;
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
      and fa.id = fbe.financial_account_id
    where fbe.id = ?
    limit 1
  `).get(id) as {
    id: string;
    organization_id: string;
    company_id: string | null;
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
    company_id: string | null;
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

  const statementEntry = db.prepare(`
    select id
    from financial_bank_statement_entry
    where id = ?
      and organization_id = ?
    limit 1
  `).get(input.financial_bank_statement_entry_id, normalizedOrganizationId) as { id: string } | undefined;
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
    limit 1
  `).get(input.financial_bank_statement_entry_id, normalizedOrganizationId) as { amount_cents: number } | undefined;
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
    company_id: string | null;
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

export function createFinanceTransactionFromStatement(
  input: CreateFinanceTransactionFromStatementInput
): FinanceStatementTransactionResultDto {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  return db.transaction(() => {
    const statementEntry = db.prepare(`
      select
        id,
        organization_id,
        company_id,
        financial_account_id,
        statement_date,
        posted_at,
        amount_cents,
        description
      from financial_bank_statement_entry
      where id = ?
        and organization_id = ?
      limit 1
    `).get(input.financial_bank_statement_entry_id, normalizedOrganizationId) as {
      id: string;
      organization_id: string;
      company_id: string | null;
      financial_account_id: string;
      statement_date: string;
      posted_at: string | null;
      amount_cents: number;
      description: string;
    } | undefined;

    if (!statementEntry) {
      throw new Error('Lançamento de extrato não encontrado.');
    }

    const existingMatch = db.prepare(`
      select id
      from financial_reconciliation_match
      where organization_id = ?
        and financial_bank_statement_entry_id = ?
        and match_status = 'matched'
      limit 1
    `).get(normalizedOrganizationId, statementEntry.id) as { id: string } | undefined;
    if (existingMatch) {
      throw new Error('Extrato já conciliado.');
    }

    const anchorDate = statementEntry.posted_at ?? statementEntry.statement_date;
    const transaction = createFinanceTransaction({
      organization_id: normalizedOrganizationId,
      financial_entity_id: input.financial_entity_id ?? null,
      financial_account_id: statementEntry.financial_account_id,
      financial_category_id: input.financial_category_id ?? null,
      financial_cost_center_id: input.financial_cost_center_id ?? null,
      financial_payment_method_id: input.financial_payment_method_id ?? null,
      kind: statementEntry.amount_cents >= 0 ? 'income' : 'expense',
      status: 'settled',
      amount_cents: Math.abs(statementEntry.amount_cents),
      issue_date: anchorDate,
      due_date: anchorDate,
      settlement_date: anchorDate,
      competence_date: anchorDate,
      note: input.note?.trim() || statementEntry.description,
      created_by: input.created_by ?? null
    });

    const match = createFinanceReconciliationMatch({
      organization_id: normalizedOrganizationId,
      company_id: statementEntry.company_id,
      financial_bank_statement_entry_id: statementEntry.id,
      financial_transaction_id: transaction.id,
      confidence_score: 1,
      match_status: 'matched',
      source: 'statement_create',
      reviewed_by: input.created_by ?? null
    });

    return { transaction, match };
  })();
}

function mapDebtRow(row: {
  id: string;
  organization_id: string;
  company_id: string | null;
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
    company_id: string | null;
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
  const nowIso = new Date().toISOString();
  const id = uuid('fdeb');

  const payableId = input.financial_payable_id?.trim() || null;
  const receivableId = input.financial_receivable_id?.trim() || null;
  const transactionId = input.financial_transaction_id?.trim() || null;

  if (payableId) {
    const payable = db.prepare(`
      select id from financial_payable
      where id = ? and organization_id = ?
      limit 1
    `).get(payableId, normalizedOrganizationId) as { id: string } | undefined;
    if (!payable) throw new Error('Conta a pagar não encontrada.');
  }

  if (receivableId) {
    const receivable = db.prepare(`
      select id from financial_receivable
      where id = ? and organization_id = ?
      limit 1
    `).get(receivableId, normalizedOrganizationId) as { id: string } | undefined;
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
    company_id: string | null;
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
    financial_cost_center_id: row.financial_cost_center_id,
    financial_cost_center_name: row.financial_cost_center_name ?? null,
    financial_payment_method_id: row.financial_payment_method_id,
    financial_payment_method_name: row.financial_payment_method_name ?? null,
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
      ft.financial_cost_center_id,
      ft.financial_payment_method_id,
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
      fc.name as financial_category_name,
      fcc.name as financial_cost_center_name,
      fpm.name as financial_payment_method_name
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
    left join financial_cost_center fcc
      on fcc.organization_id = ft.organization_id
      and fcc.id = ft.financial_cost_center_id
    left join financial_payment_method fpm
      on fpm.organization_id = ft.organization_id
      and fpm.id = ft.financial_payment_method_id
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
        coalesce(ft.issue_date, '') || ' ' ||
        coalesce(ft.due_date, '') || ' ' ||
        coalesce(ft.settlement_date, '') || ' ' ||
        coalesce(ft.competence_date, '') || ' ' ||
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
      ft.financial_cost_center_id,
      ft.financial_payment_method_id,
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
      fc.name as financial_category_name,
      fcc.name as financial_cost_center_name,
      fpm.name as financial_payment_method_name
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
    left join financial_cost_center fcc
      on fcc.organization_id = ft.organization_id
      and fcc.id = ft.financial_cost_center_id
    left join financial_payment_method fpm
      on fpm.organization_id = ft.organization_id
      and fpm.id = ft.financial_payment_method_id
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
      financial_cost_center_id,
      financial_payment_method_id,
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    transactionId,
    normalizedOrganizationId,
    input.company_id?.trim() || null,
    financialEntityId,
    input.financial_account_id ?? null,
    input.financial_category_id ?? null,
    input.financial_cost_center_id ?? null,
    input.financial_payment_method_id ?? null,
    input.kind,
    status,
    Math.trunc(input.amount_cents),
    input.issue_date ?? null,
    input.due_date ?? null,
    settlementDate,
    input.competence_date ?? null,
    input.source?.trim() || 'manual',
    input.source_ref?.trim() || null,
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
      financial_cost_center_id = ?,
      financial_payment_method_id = ?,
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
    Object.prototype.hasOwnProperty.call(input, 'financial_cost_center_id')
      ? input.financial_cost_center_id ?? null
      : current.financial_cost_center_id,
    Object.prototype.hasOwnProperty.call(input, 'financial_payment_method_id')
      ? input.financial_payment_method_id ?? null
      : current.financial_payment_method_id,
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
