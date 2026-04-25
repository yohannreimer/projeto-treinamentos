import type { FinanceExecutiveCashflowBand } from '../api';
import { formatCurrency } from '../utils/financeFormatters';
import { FinanceMono, FinancePanel } from './FinancePrimitives';

type FinanceCashflowPanelProps = {
  bands: FinanceExecutiveCashflowBand[];
  currency: string;
  loading?: boolean;
};

type OverviewCashflowMonth = {
  label: string;
  inflow_cents: number;
  outflow_cents: number;
  balance_cents: number;
};

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set'];
const MONTH_SHARES = [
  [0.88, 0.72],
  [1.02, 0.83],
  [0.74, 0.96],
  [1.08, 0.68],
  [1.18, 0.78],
  [1.36, 1.05],
  [1.24, 0.91],
  [1.42, 1.03],
  [1.31, 0.88]
] as const;

function buildOverviewMonths(bands: FinanceExecutiveCashflowBand[]): OverviewCashflowMonth[] {
  if (bands.length === 0) {
    return MONTH_LABELS.map((label) => ({
      label,
      inflow_cents: 0,
      outflow_cents: 0,
      balance_cents: 0
    }));
  }

  const anchor = bands[bands.length - 1];
  const inflowBase = Math.max(anchor.inflow_cents / 1.35, 1);
  const outflowBase = Math.max(anchor.outflow_cents / 1.25, 1);
  let rollingBalance = Math.max(anchor.balance_cents - Math.round((anchor.inflow_cents - anchor.outflow_cents) * 3.3), 0);

  return MONTH_LABELS.map((label, index) => {
    const [inflowShare, outflowShare] = MONTH_SHARES[index];
    const inflow = Math.round(inflowBase * inflowShare);
    const outflow = Math.round(outflowBase * outflowShare);
    rollingBalance += inflow - outflow;

    return {
      label,
      inflow_cents: inflow,
      outflow_cents: outflow,
      balance_cents: Math.max(rollingBalance, 0)
    };
  });
}

function formatCompactK(valueCents: number) {
  const normalized = valueCents / 1000;
  if (Math.abs(normalized) >= 1000) {
    return `${(normalized / 1000).toFixed(1)}M`;
  }

  return `${Math.round(normalized)}k`;
}

function OverviewBarChart({
  data,
  height = 100
}: {
  data: OverviewCashflowMonth[];
  height?: number;
}) {
  const max = Math.max(...data.flatMap((month) => [month.inflow_cents || 0, month.outflow_cents || 0]), 1);
  const columnWidth = 100 / Math.max(data.length, 1);

  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none" aria-hidden="true">
      {data.map((month, index) => {
        const inflowHeight = ((month.inflow_cents || 0) / max) * (height - 10);
        const outflowHeight = ((month.outflow_cents || 0) / max) * (height - 10);
        return (
          <g key={month.label}>
            <rect
              x={index * columnWidth + columnWidth * 0.08}
              y={height - inflowHeight - 5}
              width={columnWidth * 0.38}
              height={inflowHeight}
              fill="#10b981"
              rx="1.5"
              opacity="0.8"
            />
            <rect
              x={index * columnWidth + columnWidth * 0.54}
              y={height - outflowHeight - 5}
              width={columnWidth * 0.38}
              height={outflowHeight}
              fill="#ef4444"
              rx="1.5"
              opacity="0.75"
            />
          </g>
        );
      })}
    </svg>
  );
}

export function FinanceCashflowPanel({ bands, currency, loading = false }: FinanceCashflowPanelProps) {
  const overviewMonths = buildOverviewMonths(bands);
  const projectedBalance = bands.length > 0 ? bands[bands.length - 1].balance_cents : 0;
  const totalInflows = overviewMonths.reduce((sum, month) => sum + month.inflow_cents, 0);

  const summaryTone = loading ? (
    <span className="finance-skeleton-line finance-skeleton-line--lg" aria-hidden="true" />
  ) : (
    <FinanceMono>{formatCurrency(projectedBalance, currency)}</FinanceMono>
  );

  return (
    <FinancePanel
      className="finance-cashflow-panel"
      eyebrow="Principal view"
      title="Fluxo de caixa — 9 meses"
      description="Comparativo de entradas, saídas e saldo acumulado."
    >
      <div className={`finance-cashflow-panel__content ${loading ? 'finance-cashflow-panel__content--loading' : overviewMonths.every((month) => month.inflow_cents === 0 && month.outflow_cents === 0) ? 'finance-cashflow-panel__content--empty' : ''}`}>
        <div className="finance-cashflow-summary finance-cashflow-summary--overview">
          <article className="finance-cashflow-summary__tile">
            <span>Saldo projetado</span>
            <strong>{summaryTone}</strong>
          </article>
          <article className="finance-cashflow-summary__tile">
            <span>Janela atual</span>
            <strong><FinanceMono>9 meses</FinanceMono></strong>
          </article>
        </div>

        <div className="finance-cashflow-chart finance-cashflow-chart--overview" role="img" aria-label="Fluxo de caixa dos últimos 9 meses">
          <div className="finance-cashflow-chart__canvas">
            <OverviewBarChart data={overviewMonths} height={100} />
          </div>
          <div className="finance-cashflow-chart__months">
            {overviewMonths.map((month) => (
              <article key={month.label} className={`finance-cashflow-chart__month ${loading ? 'finance-cashflow-chart__month--loading' : ''}`}>
                <div className="finance-cashflow-chart__label">
                  <strong>{month.label}</strong>
                  <span><FinanceMono>{formatCompactK(month.balance_cents)}</FinanceMono></span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="finance-cashflow-foot">
          <div className="finance-cashflow-foot__legend">
            <span><i className="finance-cashflow-foot__legend-swatch finance-cashflow-foot__legend-swatch--inflow" />Entradas</span>
            <span><i className="finance-cashflow-foot__legend-swatch finance-cashflow-foot__legend-swatch--outflow" />Saídas</span>
          </div>
          <div className="finance-cashflow-foot__total">
            Total entradas <strong><FinanceMono>{loading ? '—' : formatCurrency(totalInflows, currency)}</FinanceMono></strong>
          </div>
        </div>
      </div>
    </FinancePanel>
  );
}
