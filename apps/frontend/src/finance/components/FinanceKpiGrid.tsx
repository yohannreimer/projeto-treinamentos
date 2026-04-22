import type { FinanceExecutiveKpi } from '../api';

type FinanceKpiGridProps = {
  kpis: FinanceExecutiveKpi[];
  currency: string;
};

function formatExecutiveValue(kpi: FinanceExecutiveKpi, currency: string) {
  if (kpi.value_kind === 'number') {
    return new Intl.NumberFormat('pt-BR').format(kpi.amount_cents);
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(kpi.amount_cents / 100);
}

export function FinanceKpiGrid({ kpis, currency }: FinanceKpiGridProps) {
  return (
    <section className="finance-kpi-grid" aria-label="KPIs executivos">
      {kpis.map((kpi) => (
        <article key={kpi.id} className={`finance-kpi-card finance-kpi-card--${kpi.tone}`}>
          <small className="finance-kpi-card__eyebrow">KPI executivo</small>
          <h2>{kpi.label}</h2>
          <strong>{formatExecutiveValue(kpi, currency)}</strong>
          <p>{kpi.hint}</p>
        </article>
      ))}
    </section>
  );
}
