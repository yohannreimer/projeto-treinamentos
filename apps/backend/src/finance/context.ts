import { db } from '../db.js';
import { getFinanceOverview } from './service.js';
import type {
  FinanceExecutiveCashflowBandDto,
  FinanceExecutiveKpiDto,
  FinanceExecutiveOverviewDto,
  FinanceExecutiveQueueItemDto,
  FinanceExecutiveQuickActionDto,
  FinancePeriodFilterInput
} from './types.js';
import { getFinanceQualityInbox } from './quality.js';
import { FINANCE_TIMEZONE, financeDayWindow, resolveFinancePeriodWindow } from './period.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';
const OPEN_RECEIVABLE_STATUSES = ['planned', 'open', 'partial', 'overdue'] as const;
const OPEN_PAYABLE_STATUSES = ['planned', 'open', 'partial', 'overdue'] as const;

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

function sumCents(sql: string, params: unknown[] = []) {
  const row = db.prepare(sql).get(...params) as { total_cents: number | null } | undefined;
  return Number(row?.total_cents ?? 0);
}

function countRows(sql: string, params: unknown[] = []) {
  const row = db.prepare(sql).get(...params) as { total_count: number | null } | undefined;
  return Number(row?.total_count ?? 0);
}

function statusBindings(statuses: readonly string[]) {
  return statuses.map(() => '?').join(', ');
}

type OpenTitleRow = {
  amount_cents: number | null;
  due_date: string | null;
  issue_date: string | null;
  created_at: string | null;
};

function toZonedDateKey(value: string, timeZone = FINANCE_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function resolveRowDateKey(row: OpenTitleRow & { competence_date?: string | null }) {
  if (row.due_date) return row.due_date;
  if (row.issue_date) return row.issue_date;
  if ('competence_date' in row && row.competence_date) return row.competence_date;
  if (row.created_at) return toZonedDateKey(row.created_at);
  return null;
}

function resolveTransactionDateKey(row: OpenTitleRow & { competence_date?: string | null }) {
  if (row.competence_date) return row.competence_date;
  if (row.due_date) return row.due_date;
  if (row.issue_date) return row.issue_date;
  if (row.created_at) return toZonedDateKey(row.created_at);
  return null;
}

function isWithinWindow(dateKey: string | null, startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return true;
  if (!dateKey) return false;
  return dateKey >= startDate && dateKey <= endDate;
}

function sumOpenRows(rows: OpenTitleRow[], startDate?: string, endDate?: string) {
  const filtered = rows.filter((row) => isWithinWindow(resolveRowDateKey(row), startDate, endDate));
  return {
    amount_cents: filtered.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0),
    count: filtered.length
  };
}

function readOpenReceivables(organizationId: string, startDate?: string, endDate?: string) {
  const rows = db.prepare(
    `
      select amount_cents, due_date, issue_date, created_at
      from financial_receivable
      where organization_id = ?
        and status in (${statusBindings(OPEN_RECEIVABLE_STATUSES)})
        and coalesce(received_at, '') = ''
    `
  ).all(organizationId, ...OPEN_RECEIVABLE_STATUSES) as OpenTitleRow[];

  return sumOpenRows(rows, startDate, endDate);
}

function readOpenPayables(organizationId: string, startDate?: string, endDate?: string) {
  const rows = db.prepare(
    `
      select amount_cents, due_date, issue_date, created_at
      from financial_payable
      where organization_id = ?
        and status in (${statusBindings(OPEN_PAYABLE_STATUSES)})
        and coalesce(paid_at, '') = ''
    `
  ).all(organizationId, ...OPEN_PAYABLE_STATUSES) as OpenTitleRow[];

  return sumOpenRows(rows, startDate, endDate);
}

function resolveCashflowBands(organizationId: string, cashBalanceCents: number): FinanceExecutiveCashflowBandDto[] {
  const windows = [30, 60, 90];

  return windows.map((days) => {
    const { start, end } = financeDayWindow(days);
    const receivables = readOpenReceivables(organizationId, start, end);
    const payables = readOpenPayables(organizationId, start, end);
    const inflowCents = receivables.amount_cents;
    const outflowCents = payables.amount_cents;
    const netCents = inflowCents - outflowCents;

    return {
      label: `${days} dias`,
      inflow_cents: inflowCents,
      outflow_cents: outflowCents,
      net_cents: netCents,
      balance_cents: cashBalanceCents + netCents,
      balance_label: 'saldo acumulado',
      inflow_share: 0,
      outflow_share: 0
    };
  });
}

function normalizeBandShares(bands: FinanceExecutiveCashflowBandDto[]) {
  const maxInflow = Math.max(...bands.map((band) => band.inflow_cents), 1);
  const maxOutflow = Math.max(...bands.map((band) => band.outflow_cents), 1);

  return bands.map((band) => ({
    ...band,
    inflow_share: Math.max(10, Math.round((band.inflow_cents / maxInflow) * 100)),
    outflow_share: Math.max(10, Math.round((band.outflow_cents / maxOutflow) * 100))
  }));
}

function monthIncomeExpense(organizationId: string, start: string | null, end: string | null) {
  const incomeRows = db.prepare(
    `
      select amount_cents, issue_date, competence_date, due_date, created_at
      from financial_transaction
      where organization_id = ?
        and kind = 'income'
        and status <> 'canceled'
        and coalesce(is_deleted, 0) = 0
    `
  ).all(organizationId) as Array<OpenTitleRow & { competence_date: string | null }>;

  const expenseRows = db.prepare(
    `
      select amount_cents, issue_date, competence_date, due_date, created_at
      from financial_transaction
      where organization_id = ?
        and kind = 'expense'
        and status <> 'canceled'
        and coalesce(is_deleted, 0) = 0
    `
  ).all(organizationId) as Array<OpenTitleRow & { competence_date: string | null }>;

  const monthlyIncomeCents = incomeRows
    .filter((row) => isWithinWindow(resolveTransactionDateKey(row), start ?? undefined, end ?? undefined))
    .reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);

  const monthlyExpenseCents = expenseRows
    .filter((row) => isWithinWindow(resolveTransactionDateKey(row), start ?? undefined, end ?? undefined))
    .reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0);

  return { monthlyIncomeCents, monthlyExpenseCents };
}

function transactionSeries(organizationId: string, kind: 'income' | 'expense', start: string | null, end: string | null) {
  return db.prepare(`
    select
      coalesce(competence_date, due_date, issue_date, substr(created_at, 1, 10)) as period,
      coalesce(sum(amount_cents), 0) as amount_cents
    from financial_transaction
    where organization_id = ?
      and kind = ?
      and status <> 'canceled'
      and coalesce(is_deleted, 0) = 0
      and (? is null or coalesce(competence_date, due_date, issue_date, substr(created_at, 1, 10)) >= ?)
      and (? is null or coalesce(competence_date, due_date, issue_date, substr(created_at, 1, 10)) <= ?)
    group by period
    order by period asc
  `).all(organizationId, kind, start, start, end, end) as Array<{ period: string; amount_cents: number }>;
}

function enrichKpisWithSeries(
  kpis: FinanceExecutiveKpiDto[],
  organizationId: string,
  periodWindow: { start: string | null; end: string | null }
): FinanceExecutiveKpiDto[] {
  const incomeSeries = transactionSeries(organizationId, 'income', periodWindow.start, periodWindow.end);
  const expenseSeries = transactionSeries(organizationId, 'expense', periodWindow.start, periodWindow.end);

  return kpis.map((kpi) => {
    if (kpi.id === 'revenue-month') {
      return { ...kpi, scope: 'period', chart_kind: 'sparkline', series: incomeSeries };
    }
    if (kpi.id === 'expense-month') {
      return { ...kpi, scope: 'period', chart_kind: 'sparkline', series: expenseSeries };
    }
    if (kpi.id === 'projection') {
      return {
        ...kpi,
        scope: 'period',
        chart_kind: 'progress',
        series: [
          { period: 'receita', amount_cents: Math.max(0, incomeSeries.reduce((sum, item) => sum + item.amount_cents, 0)) },
          { period: 'despesa', amount_cents: Math.max(0, expenseSeries.reduce((sum, item) => sum + item.amount_cents, 0)) }
        ]
      };
    }
    if (kpi.id === 'receivables' || kpi.id === 'payables') {
      return { ...kpi, scope: 'period', chart_kind: 'bars', series: [] };
    }
    return { ...kpi, scope: 'global' };
  });
}

function buildKpis(input: {
  cashBalanceCents: number;
  receivablesOpenCents: number;
  payablesOpenCents: number;
  projectedResultCents: number;
  activeAccounts: number;
  monthlyIncomeCents: number;
  monthlyExpenseCents: number;
  overdueCount: number;
  reconciliationPendingCount: number;
}): FinanceExecutiveKpiDto[] {
  return [
    {
      id: 'balance',
      label: 'Saldo em conta',
      amount_cents: input.cashBalanceCents,
      hint: `${input.activeAccounts} contas ativas, liquidez imediata`,
      tone: 'positive',
      value_kind: 'currency'
    },
    {
      id: 'receivables',
      label: 'A receber',
      amount_cents: input.receivablesOpenCents,
      hint: 'Títulos em aberto e provisionados',
      tone: 'neutral',
      value_kind: 'currency'
    },
    {
      id: 'payables',
      label: 'A pagar',
      amount_cents: input.payablesOpenCents,
      hint: 'Obrigações abertas e provisionadas',
      tone: 'warning',
      value_kind: 'currency'
    },
    {
      id: 'projection',
      label: 'Resultado projetado',
      amount_cents: input.projectedResultCents,
      hint: 'Receitas menos despesas do mês',
      tone: 'critical',
      value_kind: 'currency'
    },
    {
      id: 'revenue-month',
      label: 'Faturamento do mês',
      amount_cents: input.monthlyIncomeCents,
      hint: 'Entradas confirmadas e projetadas',
      tone: 'positive',
      value_kind: 'currency'
    },
    {
      id: 'expense-month',
      label: 'Despesas do mês',
      amount_cents: input.monthlyExpenseCents,
      hint: 'Saídas confirmadas e projetadas',
      tone: 'warning',
      value_kind: 'currency'
    },
    {
      id: 'overdue',
      label: 'Atrasos',
      amount_cents: input.overdueCount,
      hint: `${input.overdueCount} títulos fora da régua`,
      tone: 'critical',
      value_kind: 'number'
    },
    {
      id: 'reconciliation-pending',
      label: 'Conciliação pendente',
      amount_cents: input.reconciliationPendingCount,
      hint: `${input.reconciliationPendingCount} lançamentos aguardando match`,
      tone: 'neutral',
      value_kind: 'number'
    }
  ];
}

function buildQueue(input: {
  reconciliationPendingCount: number;
  reconciliationPendingAmountCents: number;
  dueTodayCount: number;
  dueTodayAmountCents: number;
  uncategorizedCount: number;
  uncategorizedAmountCents: number;
  overdueReceivablesCount: number;
  overdueReceivablesAmountCents: number;
  overduePayablesCount: number;
  overduePayablesAmountCents: number;
  qualityIssueCount: number;
  qualityCriticalCount: number;
}): FinanceExecutiveQueueItemDto[] {
  const items: FinanceExecutiveQueueItemDto[] = [
    {
      id: 'reconciliation',
      status: 'Crítico',
      title: 'Sem conciliação',
      detail: `${input.reconciliationPendingCount} lançamentos de extrato aguardam match.`,
      amount_cents: input.reconciliationPendingAmountCents,
      tone: 'critical',
      href: '/financeiro/reconciliation',
      cta: 'Conciliar extrato'
    },
    {
      id: 'due-today',
      status: 'Hoje',
      title: 'Vencem hoje',
      detail: `${input.dueTodayCount} obrigações de saída precisam de baixa.`,
      amount_cents: input.dueTodayAmountCents,
      tone: 'warning',
      href: '/financeiro/payables',
      cta: 'Abrir vencimentos'
    },
    {
      id: 'uncategorized',
      status: 'Atenção',
      title: 'Sem categoria',
      detail: `${input.uncategorizedCount} lançamentos ainda não foram classificados.`,
      amount_cents: input.uncategorizedAmountCents,
      tone: 'neutral',
      href: '/financeiro/transactions',
      cta: 'Classificar agora'
    }
  ];

  if (input.qualityIssueCount > 0) {
    items.splice(1, 0, {
      id: 'quality-review',
      status: input.qualityCriticalCount > 0 ? 'Crítico' : 'Atenção',
      title: 'Dados incompletos',
      detail: `${input.qualityIssueCount} lançamentos precisam de revisão operacional.`,
      amount_cents: 0,
      tone: input.qualityCriticalCount > 0 ? 'critical' : 'warning',
      href: '/financeiro/reconciliation',
      cta: 'Revisar dados'
    });
  }

  if (input.overdueReceivablesCount > 0) {
    items.push({
      id: 'overdue-receivables',
      status: 'Risco',
      title: 'Recebíveis atrasados',
      detail: `${input.overdueReceivablesCount} cobranças estão vencidas e sem baixa.`,
      amount_cents: input.overdueReceivablesAmountCents,
      tone: 'critical',
      href: '/financeiro/receivables',
      cta: 'Cobrar recebíveis'
    });
  }

  if (input.overduePayablesCount > 0) {
    items.push({
      id: 'overdue-payables',
      status: 'Risco',
      title: 'Pagamentos atrasados',
      detail: `${input.overduePayablesCount} obrigações estão vencidas e exigem decisão.`,
      amount_cents: input.overduePayablesAmountCents,
      tone: 'critical',
      href: '/financeiro/payables',
      cta: 'Rever pagamentos'
    });
  }

  return items;
}

function buildQuickActions(): FinanceExecutiveQuickActionDto[] {
  return [
    {
      id: 'new-revenue',
      label: 'Nova receita',
      detail: 'Registrar recebível ou faturamento manual.',
      href: '/financeiro/receivables'
    },
    {
      id: 'new-expense',
      label: 'Nova despesa',
      detail: 'Criar obrigação, ajuste ou saída recorrente.',
      href: '/financeiro/payables'
    },
    {
      id: 'reconcile',
      label: 'Conciliar extrato',
      detail: 'Entrar direto na fila de matching bancário.',
      href: '/financeiro/reconciliation'
    },
    {
      id: 'import-statement',
      label: 'Importar extrato',
      detail: 'Subir arquivo bancário para preparar a conciliação.',
      href: '/financeiro/reconciliation'
    },
    {
      id: 'open-cashflow',
      label: 'Abrir caixa',
      detail: 'Consultar a trilha de 30/60/90 dias.',
      href: '/financeiro/cashflow'
    }
  ];
}

export function getFinanceExecutiveOverview(
  organizationId?: string | null,
  periodFilter?: FinancePeriodFilterInput | null
): FinanceExecutiveOverviewDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const organization = readOrganizationRow(normalizedOrganizationId);
  const overview = getFinanceOverview(normalizedOrganizationId);
  const periodWindow = resolveFinancePeriodWindow(periodFilter);

  const activeAccounts = countRows(
    `
      select count(*) as total_count
      from financial_account
      where organization_id = ?
        and is_active = 1
    `,
    [normalizedOrganizationId]
  );

  const receivablesOpenCents = readOpenReceivables(
    normalizedOrganizationId,
    periodWindow.start ?? undefined,
    periodWindow.end ?? undefined
  ).amount_cents;

  const payablesOpenCents = readOpenPayables(
    normalizedOrganizationId,
    periodWindow.start ?? undefined,
    periodWindow.end ?? undefined
  ).amount_cents;

  const overdueReceivables = countRows(
    `
      select count(*) as total_count
      from financial_receivable
      where organization_id = ?
        and status = 'overdue'
        and coalesce(received_at, '') = ''
    `,
    [normalizedOrganizationId]
  );

  const overduePayables = countRows(
    `
      select count(*) as total_count
      from financial_payable
      where organization_id = ?
        and status = 'overdue'
        and coalesce(paid_at, '') = ''
    `,
    [normalizedOrganizationId]
  );

  const overdueReceivablesAmountCents = sumCents(
    `
      select coalesce(sum(amount_cents), 0) as total_cents
      from financial_receivable
      where organization_id = ?
        and status = 'overdue'
        and coalesce(received_at, '') = ''
    `,
    [normalizedOrganizationId]
  );

  const overduePayablesAmountCents = sumCents(
    `
      select coalesce(sum(amount_cents), 0) as total_cents
      from financial_payable
      where organization_id = ?
        and status = 'overdue'
        and coalesce(paid_at, '') = ''
    `,
    [normalizedOrganizationId]
  );

  const dueToday = financeDayWindow(0);
  const dueTodayReceivables = readOpenReceivables(normalizedOrganizationId, dueToday.start, dueToday.end);
  const dueTodayPayables = readOpenPayables(normalizedOrganizationId, dueToday.start, dueToday.end);

  const reconciliationPendingCount = countRows(
    `
      select count(*) as total_count
      from financial_bank_statement_entry fbe
      left join financial_reconciliation_match frm
        on frm.organization_id = fbe.organization_id
       and frm.financial_bank_statement_entry_id = fbe.id
      where fbe.organization_id = ?
        and frm.id is null
    `,
    [normalizedOrganizationId]
  );

  const reconciliationPendingAmountCents = sumCents(
    `
      select coalesce(sum(amount_cents), 0) as total_cents
      from financial_bank_statement_entry fbe
      left join financial_reconciliation_match frm
        on frm.organization_id = fbe.organization_id
       and frm.financial_bank_statement_entry_id = fbe.id
      where fbe.organization_id = ?
        and frm.id is null
    `,
    [normalizedOrganizationId]
  );
  const qualityInbox = getFinanceQualityInbox(normalizedOrganizationId);

  const uncategorizedCount = countRows(
    `
      select count(*) as total_count
      from financial_transaction
      where organization_id = ?
        and coalesce(is_deleted, 0) = 0
        and kind <> 'adjustment'
        and financial_category_id is null
    `,
    [normalizedOrganizationId]
  );

  const uncategorizedAmountCents = sumCents(
    `
      select coalesce(sum(amount_cents), 0) as total_cents
      from financial_transaction
      where organization_id = ?
        and coalesce(is_deleted, 0) = 0
        and kind <> 'adjustment'
        and financial_category_id is null
    `,
    [normalizedOrganizationId]
  );

  const { monthlyIncomeCents, monthlyExpenseCents } = monthIncomeExpense(
    normalizedOrganizationId,
    periodWindow.start,
    periodWindow.end
  );
  const projectedResultCents = monthlyIncomeCents - monthlyExpenseCents;
  const cashBalanceCents = overview.totals.cash_cents;

  const bands = normalizeBandShares(resolveCashflowBands(normalizedOrganizationId, cashBalanceCents));

  return {
    organization_id: normalizedOrganizationId,
    organization_name: organization.name,
    currency: 'BRL',
    timezone: FINANCE_TIMEZONE,
    generated_at: new Date().toISOString(),
    kpis: enrichKpisWithSeries(
      buildKpis({
        cashBalanceCents,
        receivablesOpenCents,
        payablesOpenCents,
        projectedResultCents,
        activeAccounts,
        monthlyIncomeCents,
        monthlyExpenseCents,
        overdueCount: overdueReceivables + overduePayables,
        reconciliationPendingCount
      }),
      normalizedOrganizationId,
      periodWindow
    ),
    queue: buildQueue({
      reconciliationPendingCount,
      reconciliationPendingAmountCents,
      dueTodayCount: dueTodayPayables.count,
      dueTodayAmountCents: dueTodayPayables.amount_cents,
      uncategorizedCount,
      uncategorizedAmountCents,
      overdueReceivablesCount: overdueReceivables,
      overdueReceivablesAmountCents,
      overduePayablesCount: overduePayables,
      overduePayablesAmountCents,
      qualityIssueCount: qualityInbox.summary.total_count,
      qualityCriticalCount: qualityInbox.summary.critical_count
    }),
    cashflow_bands: bands,
    quick_actions: buildQuickActions(),
    summary: {
      cash_balance_cents: cashBalanceCents,
      receivables_open_cents: receivablesOpenCents,
      payables_open_cents: payablesOpenCents,
      projected_result_cents: projectedResultCents,
      reconciliation_pending_count: reconciliationPendingCount,
      uncategorized_count: uncategorizedCount,
      quality_issue_count: qualityInbox.summary.total_count,
      quality_critical_count: qualityInbox.summary.critical_count,
      quality_warning_count: qualityInbox.summary.warning_count,
      overdue_count: overdueReceivables + overduePayables,
      monthly_income_cents: monthlyIncomeCents,
      monthly_expense_cents: monthlyExpenseCents
    }
  };
}
