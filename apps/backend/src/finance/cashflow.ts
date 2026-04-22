import { db } from '../db.js';
import type {
  FinanceCashflowAlertDto,
  FinanceCashflowDto,
  FinanceCashflowHorizon,
  FinanceCashflowPointDto,
  FinanceCashflowWindowDto
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
  `).get(organizationId) as { id: string; name: string | null } | undefined;

  if (!row) {
    throw new Error('Organização não encontrada.');
  }

  return row;
}

function resolveCashflowHorizon(horizonDays?: number): FinanceCashflowHorizon {
  if (horizonDays === 30 || horizonDays === 60 || horizonDays === 90) {
    return horizonDays;
  }
  if ((horizonDays ?? 0) <= 30) {
    return 30;
  }
  if ((horizonDays ?? 0) <= 60) {
    return 60;
  }
  return 90;
}

function getTodayIso() {
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

function getDateOffsetIso(baseDate: string, offsetDays: number) {
  const value = new Date(`${baseDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function buildCashflowWindow(points: FinanceCashflowPointDto[], horizon: FinanceCashflowHorizon, startingBalanceCents: number): FinanceCashflowWindowDto {
  const slice = points.slice(0, horizon);
  let lowestBalance = startingBalanceCents;
  let inflow = 0;
  let outflow = 0;

  for (const point of slice) {
    inflow += point.inflow_cents;
    outflow += point.outflow_cents;
    lowestBalance = Math.min(lowestBalance, point.balance_cents);
  }

  const endingBalance = slice.at(-1)?.balance_cents ?? startingBalanceCents;
  const riskLevel: FinanceCashflowWindowDto['risk_level'] = lowestBalance < 0
    ? 'critical'
    : endingBalance < startingBalanceCents
      ? 'attention'
      : 'healthy';

  return {
    horizon_days: horizon,
    inflow_cents: inflow,
    outflow_cents: outflow,
    net_cents: inflow - outflow,
    starting_balance_cents: startingBalanceCents,
    ending_balance_cents: endingBalance,
    lowest_balance_cents: lowestBalance,
    risk_level: riskLevel
  };
}

function buildCashflowAlerts(params: { selectedWindow: FinanceCashflowWindowDto; windows: FinanceCashflowWindowDto[] }): FinanceCashflowAlertDto[] {
  const alerts: FinanceCashflowAlertDto[] = [];
  const { selectedWindow } = params;

  if (selectedWindow.lowest_balance_cents < 0) {
    alerts.push({
      id: 'negative-balance',
      tone: 'critical',
      title: 'Risco de caixa negativo',
      detail: 'A janela selecionada projeta saldo abaixo de zero e merece ação antes do vencimento.'
    });
  } else if (selectedWindow.ending_balance_cents < selectedWindow.starting_balance_cents) {
    alerts.push({
      id: 'cash-compression',
      tone: 'warning',
      title: 'Compressão de caixa',
      detail: 'O horizonte fecha abaixo do saldo inicial. Vale revisar saídas concentradas ou atrasos de recebimento.'
    });
  } else {
    alerts.push({
      id: 'cash-healthy',
      tone: 'neutral',
      title: 'Janela estável',
      detail: 'A projeção mantém caixa positivo e com leitura saudável para a janela selecionada.'
    });
  }

  const futurePressure = params.windows.find((window) => window.horizon_days > selectedWindow.horizon_days && window.risk_level !== 'healthy');
  if (futurePressure) {
    alerts.push({
      id: `future-pressure-${futurePressure.horizon_days}`,
      tone: futurePressure.risk_level === 'critical' ? 'critical' : 'warning',
      title: `Pressão no horizonte de ${futurePressure.horizon_days} dias`,
      detail: 'As próximas janelas pedem atenção mesmo que o curto prazo pareça confortável.'
    });
  }

  return alerts;
}

export function getFinanceCashflow(
  organizationId: string,
  horizonDays?: number,
  companyId?: string | null
): FinanceCashflowDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  const organization = readOrganizationRow(normalizedOrganizationId);
  const normalizedCompanyId = companyId?.trim() || null;
  const horizon = resolveCashflowHorizon(horizonDays);
  const todayIso = getTodayIso();
  const endDateIso = getDateOffsetIso(todayIso, horizon - 1);

  const startingBalanceRow = db.prepare(`
    select coalesce(sum(amount_cents), 0) as balance_cents
    from financial_bank_statement_entry
    where organization_id = ?
      and (? is null or company_id = ?)
      and statement_date <= ?
  `).get(
    normalizedOrganizationId,
    normalizedCompanyId,
    normalizedCompanyId,
    todayIso
  ) as { balance_cents: number };

  const rows = db.prepare(`
    select anchor_date, flow_kind, sum(amount_cents) as amount_cents
    from (
      select
        case when due_date < ? then ? else due_date end as anchor_date,
        'inflow' as flow_kind,
        amount_cents
      from financial_receivable
      where organization_id = ?
        and (? is null or company_id = ?)
        and due_date is not null
        and status not in ('received', 'canceled')
        and due_date <= ?

      union all

      select
        case when due_date < ? then ? else due_date end as anchor_date,
        'outflow' as flow_kind,
        amount_cents
      from financial_payable
      where organization_id = ?
        and (? is null or company_id = ?)
        and due_date is not null
        and status not in ('paid', 'canceled')
        and due_date <= ?
    )
    where anchor_date >= ?
    group by anchor_date, flow_kind
    order by anchor_date asc
  `).all(
    todayIso,
    todayIso,
    normalizedOrganizationId,
    normalizedCompanyId,
    normalizedCompanyId,
    endDateIso,
    todayIso,
    todayIso,
    normalizedOrganizationId,
    normalizedCompanyId,
    normalizedCompanyId,
    endDateIso,
    todayIso
  ) as Array<{
    anchor_date: string;
    flow_kind: 'inflow' | 'outflow';
    amount_cents: number;
  }>;

  const aggregates = new Map<string, { inflow_cents: number; outflow_cents: number }>();
  for (const row of rows) {
    const current = aggregates.get(row.anchor_date) ?? { inflow_cents: 0, outflow_cents: 0 };
    if (row.flow_kind === 'inflow') {
      current.inflow_cents += row.amount_cents;
    } else {
      current.outflow_cents += row.amount_cents;
    }
    aggregates.set(row.anchor_date, current);
  }

  const points90: FinanceCashflowPointDto[] = [];
  let runningBalance = startingBalanceRow.balance_cents;

  for (let offset = 0; offset < 90; offset += 1) {
    const date = getDateOffsetIso(todayIso, offset);
    const aggregate = aggregates.get(date) ?? { inflow_cents: 0, outflow_cents: 0 };
    runningBalance += aggregate.inflow_cents - aggregate.outflow_cents;

    points90.push({
      date,
      inflow_cents: aggregate.inflow_cents,
      outflow_cents: aggregate.outflow_cents,
      net_cents: aggregate.inflow_cents - aggregate.outflow_cents,
      balance_cents: runningBalance
    });
  }

  const windows: FinanceCashflowWindowDto[] = [
    buildCashflowWindow(points90, 30, startingBalanceRow.balance_cents),
    buildCashflowWindow(points90, 60, startingBalanceRow.balance_cents),
    buildCashflowWindow(points90, 90, startingBalanceRow.balance_cents)
  ];
  const selectedWindow = windows.find((window) => window.horizon_days === horizon) ?? windows[2];
  const points = points90.slice(0, horizon);

  return {
    organization_id: normalizedOrganizationId,
    organization_name: organization.name,
    generated_at: new Date().toISOString(),
    horizon_days: horizon,
    points,
    windows,
    alerts: buildCashflowAlerts({ selectedWindow, windows }),
    totals: {
      inflow_cents: selectedWindow.inflow_cents,
      outflow_cents: selectedWindow.outflow_cents,
      ending_balance_cents: selectedWindow.ending_balance_cents,
      starting_balance_cents: startingBalanceRow.balance_cents
    }
  };
}
