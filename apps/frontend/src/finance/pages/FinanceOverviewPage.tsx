import { useEffect, useState } from 'react';
import { financeApi, type FinanceExecutiveOverview } from '../api';
import { FinanceCashflowPanel } from '../components/FinanceCashflowPanel';
import { FinanceKpiGrid } from '../components/FinanceKpiGrid';
import { FinanceQuickActions } from '../components/FinanceQuickActions';
import { FinanceQueuePanel } from '../components/FinanceQueuePanel';
import { FinanceErrorState, FinanceLoadingState, FinancePageHeader, FinanceMono } from '../components/FinancePrimitives';

export function FinanceOverviewPage() {
  const [overview, setOverview] = useState<FinanceExecutiveOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    financeApi.getExecutiveOverview()
      .then((response) => {
        if (cancelled) return;
        setOverview(response);
        setError(null);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setOverview(null);
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar a visão executiva.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="page finance-page finance-overview-page" aria-live="polite">
        <FinanceErrorState
          title="Executive Overview"
          description={error}
        />
      </section>
    );
  }

  if (!overview) {
    return (
      <section className="page finance-page finance-overview-page" aria-live="polite">
        <FinanceLoadingState
          title="Executive Overview"
          description="Carregando visão executiva do financeiro..."
        />
      </section>
    );
  }

  const organizationName = overview.organization_name || 'Empresa logada';

  return (
    <section className="page finance-page finance-overview-page">
      <FinancePageHeader
        eyebrow="Executive Overview"
        title="Visão Geral"
        description={`Leitura executiva do financeiro da ${organizationName}.`}
        meta={(
          <>
            <span>{overview.currency} · <FinanceMono>{overview.timezone}</FinanceMono></span>
            <span>Atualizado em {new Intl.DateTimeFormat('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: overview.timezone
            }).format(new Date(overview.generated_at))}</span>
            <span>Home principal do módulo</span>
          </>
        )}
      />

      <FinanceKpiGrid kpis={overview.kpis} currency={overview.currency} />

      <div className="finance-overview-split">
        <FinanceCashflowPanel bands={overview.cashflow_bands} currency={overview.currency} />

        <aside className="finance-overview-rail">
          <FinanceQueuePanel items={overview.queue} currency={overview.currency} />
          <FinanceQuickActions actions={overview.quick_actions} />
        </aside>
      </div>
    </section>
  );
}
