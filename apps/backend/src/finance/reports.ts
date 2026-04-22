import { getFinanceCashflow } from './cashflow.js';
import { getFinanceContext, listFinancePayables, listFinanceReceivables, listFinanceTransactions } from './service.js';
import type {
  FinanceAgingRowDto,
  FinanceCategoryBreakdownRowDto,
  FinanceConsolidatedCashflowRowDto,
  FinanceDreGerencialDto,
  FinanceReportComparisonRowDto,
  FinanceReportsDto,
  FinanceTransactionDto
} from './types.js';

function periodKeyFromDate(value: string | null | undefined) {
  if (!value || value.length < 7) {
    return null;
  }

  return value.slice(0, 7);
}

function sortPeriodRows<T extends { period: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.period.localeCompare(right.period));
}

function buildRealizedVsProjected(transactions: FinanceTransactionDto[]): FinanceReportComparisonRowDto[] {
  const buckets = new Map<string, FinanceReportComparisonRowDto>();

  for (const transaction of transactions) {
    const realizedPeriod = periodKeyFromDate(
      transaction.settlement_date
      ?? transaction.views.cash_anchor_date
      ?? transaction.views.competence_anchor_date
    );
    if (realizedPeriod && transaction.views.confirmed_amount_cents !== 0) {
      const current = buckets.get(realizedPeriod) ?? {
        period: realizedPeriod,
        realized_cents: 0,
        projected_cents: 0,
        variance_cents: 0
      };
      current.realized_cents += transaction.views.confirmed_amount_cents;
      buckets.set(realizedPeriod, current);
    }

    const projectedPeriod = periodKeyFromDate(transaction.views.projected_anchor_date);
    if (projectedPeriod && transaction.views.projected_amount_cents !== 0) {
      const current = buckets.get(projectedPeriod) ?? {
        period: projectedPeriod,
        realized_cents: 0,
        projected_cents: 0,
        variance_cents: 0
      };
      current.projected_cents += transaction.views.projected_amount_cents;
      buckets.set(projectedPeriod, current);
    }
  }

  return sortPeriodRows(
    [...buckets.values()].map((row) => ({
      ...row,
      variance_cents: row.realized_cents - row.projected_cents
    }))
  );
}

function buildCategoryBreakdown(
  transactions: FinanceTransactionDto[],
  mode: 'income' | 'expense'
): FinanceCategoryBreakdownRowDto[] {
  const buckets = new Map<string, FinanceCategoryBreakdownRowDto>();

  for (const transaction of transactions) {
    const amount = transaction.views.competence_amount_cents;
    const shouldInclude = mode === 'income' ? amount > 0 : amount < 0;
    if (!shouldInclude) {
      continue;
    }

    const categoryName = transaction.financial_category_name?.trim() || 'Sem categoria';
    const current = buckets.get(categoryName) ?? {
      category_name: categoryName,
      amount_cents: 0,
      transaction_count: 0
    };

    current.amount_cents += Math.abs(amount);
    current.transaction_count += 1;
    buckets.set(categoryName, current);
  }

  return [...buckets.values()].sort((left, right) => {
    if (right.amount_cents !== left.amount_cents) {
      return right.amount_cents - left.amount_cents;
    }
    return left.category_name.localeCompare(right.category_name);
  });
}

function buildAgingRows(
  rows: Array<{
    customer_name?: string | null;
    supplier_name?: string | null;
    description: string;
    due_date: string | null;
    amount_cents: number;
  }>
): FinanceAgingRowDto[] {
  return [...rows]
    .map((row) => ({
      entity_name: row.customer_name?.trim() || row.supplier_name?.trim() || 'Sem entidade',
      due_date: row.due_date,
      amount_cents: row.amount_cents,
      description: row.description
    }))
    .sort((left, right) => {
      const leftDue = left.due_date ?? '9999-12-31';
      const rightDue = right.due_date ?? '9999-12-31';
      return leftDue.localeCompare(rightDue) || right.amount_cents - left.amount_cents;
    });
}

function buildConsolidatedCashflow(
  organizationId: string
): FinanceConsolidatedCashflowRowDto[] {
  const cashflow = getFinanceCashflow(organizationId, 90);
  const buckets = new Map<string, FinanceConsolidatedCashflowRowDto>();

  for (const point of cashflow.points) {
    const period = periodKeyFromDate(point.date);
    if (!period) {
      continue;
    }

    const current = buckets.get(period) ?? {
      period,
      inflow_cents: 0,
      outflow_cents: 0,
      balance_cents: 0
    };

    current.inflow_cents += point.inflow_cents;
    current.outflow_cents += point.outflow_cents;
    current.balance_cents = point.balance_cents;
    buckets.set(period, current);
  }

  return sortPeriodRows([...buckets.values()]);
}

function buildDreGerencial(transactions: FinanceTransactionDto[]): FinanceDreGerencialDto {
  let grossRevenueCents = 0;
  let operatingExpensesCents = 0;

  for (const transaction of transactions) {
    const amount = transaction.views.competence_amount_cents;
    if (amount > 0) {
      grossRevenueCents += amount;
      continue;
    }

    if (amount < 0) {
      operatingExpensesCents += Math.abs(amount);
    }
  }

  const deductionsCents = 0;
  const netRevenueCents = grossRevenueCents - deductionsCents;

  return {
    gross_revenue_cents: grossRevenueCents,
    deductions_cents: deductionsCents,
    net_revenue_cents: netRevenueCents,
    operating_expenses_cents: operatingExpensesCents,
    operating_result_cents: netRevenueCents - operatingExpensesCents
  };
}

export function getFinanceReports(organizationId: string): FinanceReportsDto {
  const context = getFinanceContext(organizationId);
  const { transactions } = listFinanceTransactions(organizationId);
  const receivables = listFinanceReceivables(organizationId);
  const payables = listFinancePayables(organizationId);

  return {
    organization_id: context.organization_id,
    organization_name: context.organization_name,
    generated_at: new Date().toISOString(),
    realized_vs_projected: buildRealizedVsProjected(transactions),
    income_by_category: buildCategoryBreakdown(transactions, 'income'),
    expense_by_category: buildCategoryBreakdown(transactions, 'expense'),
    overdue_receivables: buildAgingRows(receivables.groups.overdue),
    overdue_payables: buildAgingRows(payables.groups.overdue),
    consolidated_cashflow: buildConsolidatedCashflow(organizationId),
    dre: buildDreGerencial(transactions)
  };
}
