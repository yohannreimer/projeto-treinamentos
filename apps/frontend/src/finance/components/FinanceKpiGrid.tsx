import type { FinanceExecutiveKpi } from '../api';
import { FinanceKpiCard, FinanceMono } from './FinancePrimitives';

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
        <FinanceKpiCard
          key={kpi.id}
          label={kpi.label}
          value={<FinanceMono>{formatExecutiveValue(kpi, currency)}</FinanceMono>}
          description={kpi.hint}
          tone={kpi.tone}
          accentLabel="KPI executivo"
        />
      ))}
    </section>
  );
}
