import { getFinanceCashflow } from './cashflow.js';
import {
  getFinanceContext,
  listFinancePayables,
  listFinanceReceivables,
  listFinanceRecurringProjectionTransactions,
  listFinanceTransactions
} from './service.js';
import type {
  FinanceAgingRowDto,
  FinanceCashflowBasisRowDto,
  FinanceCategoryBreakdownRowDto,
  FinanceConsolidatedCashflowRowDto,
  FinanceCostCenterResultRowDto,
  FinanceDreGerencialDto,
  FinanceDrePeriodRowDto,
  FinancePeriodFilterInput,
  FinanceReportComparisonRowDto,
  FinanceReportsDto,
  FinanceTransactionDto
} from './types.js';
import { resolveFinancePeriodWindow } from './period.js';

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
  organizationId: string,
  periodWindow: { start: string | null; end: string | null }
): FinanceConsolidatedCashflowRowDto[] {
  const cashflow = getFinanceCashflow(organizationId, 90);
  const buckets = new Map<string, FinanceConsolidatedCashflowRowDto>();

  for (const point of cashflow.points) {
    if (periodWindow.start && point.date < periodWindow.start) {
      continue;
    }
    if (periodWindow.end && point.date > periodWindow.end) {
      continue;
    }

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

function filterAgingRowsByPeriod<T extends { due_date: string | null }>(
  rows: T[],
  periodWindow: { start: string | null; end: string | null }
) {
  return rows.filter((row) => {
    if (!row.due_date) return false;
    if (periodWindow.start && row.due_date < periodWindow.start) return false;
    if (periodWindow.end && row.due_date > periodWindow.end) return false;
    return true;
  });
}

function anchorInWindow(anchor: string | null | undefined, periodWindow: { start: string | null; end: string | null }) {
  if (!anchor) return false;
  if (periodWindow.start && anchor < periodWindow.start) return false;
  if (periodWindow.end && anchor > periodWindow.end) return false;
  return true;
}

function buildDreGerencial(
  transactions: FinanceTransactionDto[],
  basis: 'competence' | 'cash',
  periodWindow: { start: string | null; end: string | null }
): FinanceDreGerencialDto {
  let grossRevenueCents = 0;
  let operatingExpensesCents = 0;

  for (const transaction of transactions) {
    const anchor = basis === 'cash'
      ? transaction.views.cash_anchor_date
      : transaction.views.competence_anchor_date ?? transaction.competence_date;
    if (!anchorInWindow(anchor, periodWindow)) continue;

    const amount = basis === 'cash'
      ? transaction.views.cash_amount_cents
      : transaction.views.competence_amount_cents;
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

function buildDreByPeriod(
  transactions: FinanceTransactionDto[],
  basis: 'competence' | 'cash',
  periodWindow: { start: string | null; end: string | null }
): FinanceDrePeriodRowDto[] {
  const buckets = new Map<string, FinanceDrePeriodRowDto>();

  for (const transaction of transactions) {
    const anchor = basis === 'cash'
      ? transaction.views.cash_anchor_date
      : transaction.views.competence_anchor_date ?? transaction.competence_date;
    if (!anchorInWindow(anchor, periodWindow)) continue;

    const period = periodKeyFromDate(anchor);
    if (!period) continue;

    const current = buckets.get(period) ?? {
      period,
      gross_revenue_cents: 0,
      deductions_cents: 0,
      net_revenue_cents: 0,
      operating_expenses_cents: 0,
      operating_result_cents: 0,
      transaction_count: 0
    };

    const amount = basis === 'cash'
      ? transaction.views.cash_amount_cents
      : transaction.views.competence_amount_cents;
    if (amount > 0) {
      current.gross_revenue_cents += amount;
    }
    if (amount < 0) {
      current.operating_expenses_cents += Math.abs(amount);
    }
    current.net_revenue_cents = current.gross_revenue_cents - current.deductions_cents;
    current.operating_result_cents = current.net_revenue_cents - current.operating_expenses_cents;
    current.transaction_count += 1;
    buckets.set(period, current);
  }

  return sortPeriodRows([...buckets.values()]);
}

function buildCostCenterResults(transactions: FinanceTransactionDto[]): FinanceCostCenterResultRowDto[] {
  const buckets = new Map<string, FinanceCostCenterResultRowDto>();

  for (const transaction of transactions) {
    const name = transaction.financial_cost_center_name?.trim() || 'Sem centro de custo';
    const current = buckets.get(name) ?? {
      cost_center_name: name,
      revenue_cents: 0,
      expense_cents: 0,
      result_cents: 0,
      transaction_count: 0
    };

    const amount = transaction.views.competence_amount_cents;
    if (amount > 0) {
      current.revenue_cents += amount;
    }
    if (amount < 0) {
      current.expense_cents += Math.abs(amount);
    }
    current.result_cents = current.revenue_cents - current.expense_cents;
    current.transaction_count += 1;
    buckets.set(name, current);
  }

  return [...buckets.values()].sort((left, right) => {
    if (right.result_cents !== left.result_cents) return right.result_cents - left.result_cents;
    return left.cost_center_name.localeCompare(right.cost_center_name);
  });
}

function buildCashflowBasisRows(
  transactions: FinanceTransactionDto[],
  basis: 'due' | 'settlement'
): FinanceCashflowBasisRowDto[] {
  const buckets = new Map<string, FinanceCashflowBasisRowDto>();

  for (const transaction of transactions) {
    const anchor = basis === 'due'
      ? transaction.due_date
      : (transaction.settlement_date ?? transaction.views.cash_anchor_date);
    const period = periodKeyFromDate(anchor);
    if (!period) continue;

    const current = buckets.get(period) ?? {
      period,
      inflow_cents: 0,
      outflow_cents: 0,
      net_cents: 0,
      transaction_count: 0
    };
    const signed = transaction.kind === 'income' ? transaction.amount_cents : -transaction.amount_cents;
    if (signed > 0) {
      current.inflow_cents += signed;
    }
    if (signed < 0) {
      current.outflow_cents += Math.abs(signed);
    }
    current.net_cents = current.inflow_cents - current.outflow_cents;
    current.transaction_count += 1;
    buckets.set(period, current);
  }

  return sortPeriodRows([...buckets.values()]);
}

export function getFinanceReports(organizationId: string, periodFilter?: FinancePeriodFilterInput | null): FinanceReportsDto {
  const context = getFinanceContext(organizationId);
  const periodWindow = resolveFinancePeriodWindow(periodFilter);
  const { transactions } = listFinanceTransactions(organizationId, {
    from: periodWindow.start,
    to: periodWindow.end
  });
  const reportTransactions = [
    ...transactions,
    ...listFinanceRecurringProjectionTransactions(organizationId, periodWindow)
  ];
  const cashTransactions = listFinanceTransactions(organizationId).transactions;
  const receivables = listFinanceReceivables(organizationId);
  const payables = listFinancePayables(organizationId);

  return {
    organization_id: context.organization_id,
    organization_name: context.organization_name,
    generated_at: new Date().toISOString(),
    realized_vs_projected: buildRealizedVsProjected(reportTransactions),
    income_by_category: buildCategoryBreakdown(reportTransactions, 'income'),
    expense_by_category: buildCategoryBreakdown(reportTransactions, 'expense'),
    overdue_receivables: buildAgingRows(filterAgingRowsByPeriod(receivables.groups.overdue, periodWindow)),
    overdue_payables: buildAgingRows(filterAgingRowsByPeriod(payables.groups.overdue, periodWindow)),
    consolidated_cashflow: buildConsolidatedCashflow(organizationId, periodWindow),
    dre_by_period: buildDreByPeriod(reportTransactions, 'competence', periodWindow),
    dre_cash_by_period: buildDreByPeriod(cashTransactions, 'cash', periodWindow),
    cost_center_results: buildCostCenterResults(reportTransactions),
    cashflow_by_due: buildCashflowBasisRows(reportTransactions, 'due'),
    cashflow_by_settlement: buildCashflowBasisRows(reportTransactions, 'settlement'),
    dre: buildDreGerencial(reportTransactions, 'competence', periodWindow),
    dre_cash: buildDreGerencial(cashTransactions, 'cash', periodWindow)
  };
}
