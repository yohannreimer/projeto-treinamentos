import { db, uuid } from '../db.js';
import { computeViews } from './ledger.js';
import type {
  CreateFinanceTransactionInput,
  FinanceOverviewDto,
  FinanceTransactionDto,
  FinanceTransactionRow,
  FinanceTransactionStatus,
  UpdateFinanceTransactionInput
} from './types.js';

function ensureFinanceSchema() {
  const columns = db.prepare('pragma table_info(financial_transaction)').all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'is_deleted')) {
    db.exec("alter table financial_transaction add column is_deleted integer not null default 0");
  }
}

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

function readTransactionRow(transactionId: string) {
  ensureFinanceSchema();
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
    limit 1
  `).get(transactionId) as FinanceTransactionRow | undefined;

  return row ?? null;
}

export function listFinanceTransactions(companyId?: string | null): {
  company_id: string | null;
  company_name: string | null;
  transactions: FinanceTransactionDto[];
} {
  ensureFinanceSchema();
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
  ensureFinanceSchema();
  readCompanyRow(input.company_id);

  const nowIso = new Date().toISOString();
  const transactionId = uuid('ftxn');
  const status = resolveDefaultStatus({
    status: input.status,
    settlement_date: input.settlement_date ?? null
  });

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
    input.settlement_date ?? null,
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
  ensureFinanceSchema();
  const current = readTransactionRow(transactionId);
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
  ensureFinanceSchema();
  const current = readTransactionRow(transactionId);
  if (!current) {
    throw new Error('Lançamento financeiro não encontrado.');
  }

  db.prepare(`
    update financial_transaction
    set is_deleted = 1, updated_at = ?
    where id = ?
  `).run(new Date().toISOString(), transactionId);

  const deleted = readTransactionRow(transactionId);
  if (!deleted) {
    throw new Error('Lançamento financeiro não encontrado.');
  }
  return mapTransactionRow(deleted);
}
