import type { FinanceExecutiveKpiTone, FinanceKpiSeriesPoint } from '../api';

function normalizePoints(series: FinanceKpiSeriesPoint[]) {
  const max = Math.max(...series.map((point) => Math.abs(point.amount_cents)), 1);
  return series.map((point, index) => {
    const x = series.length <= 1 ? 0 : (index / (series.length - 1)) * 100;
    const y = 36 - (Math.abs(point.amount_cents) / max) * 30;
    return `${x},${y}`;
  }).join(' ');
}

function chartColor(tone: FinanceExecutiveKpiTone) {
  if (tone === 'positive') return '#059669';
  if (tone === 'critical') return '#dc2626';
  if (tone === 'warning') return '#d97706';
  return '#2563eb';
}

export function FinanceMiniChart({
  label,
  kind = 'sparkline',
  series = [],
  tone = 'neutral'
}: {
  label: string;
  kind?: 'sparkline' | 'bars' | 'progress';
  series?: FinanceKpiSeriesPoint[];
  tone?: FinanceExecutiveKpiTone;
}) {
  const color = chartColor(tone);
  const safeSeries = series.length > 0 ? series : [{ period: 'empty', amount_cents: 0 }];

  if (kind === 'bars') {
    const max = Math.max(...safeSeries.map((point) => Math.abs(point.amount_cents)), 1);
    return (
      <div aria-label={`Distribuição de ${label}`} className="finance-mini-chart finance-mini-chart--bars">
        {safeSeries.slice(-12).map((point) => (
          <span
            key={`${point.period}-${point.amount_cents}`}
            style={{
              height: `${Math.max(10, (Math.abs(point.amount_cents) / max) * 100)}%`,
              background: color
            }}
          />
        ))}
      </div>
    );
  }

  if (kind === 'progress') {
    const total = safeSeries.reduce((sum, point) => sum + point.amount_cents, 0);
    const width = Math.max(8, Math.min(100, Math.abs(total) / Math.max(Math.abs(total), 1) * 100));
    return (
      <div aria-label={`Progresso de ${label}`} className="finance-mini-chart finance-mini-chart--progress">
        <span style={{ width: `${width}%`, background: color }} />
      </div>
    );
  }

  return (
    <svg aria-label={`Tendência de ${label}`} viewBox="0 0 100 40" className="finance-mini-chart finance-mini-chart--sparkline">
      <polyline points={normalizePoints(safeSeries)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
