import { useEffect, useState } from 'react';
import { financeApi, type FinanceExecutiveOverview } from '../api';
import { FinanceCashflowPanel } from '../components/FinanceCashflowPanel';
import { FinanceKpiGrid } from '../components/FinanceKpiGrid';
import { FinanceQuickActions } from '../components/FinanceQuickActions';
import { FinanceQueuePanel } from '../components/FinanceQueuePanel';

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
        <div className="panel finance-overview-loading">
          <small className="finance-overview-eyebrow">Executive Overview</small>
          <h1>Executive Overview</h1>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  if (!overview) {
    return (
      <section className="page finance-page finance-overview-page" aria-live="polite">
        <div className="panel finance-overview-loading">
          <small className="finance-overview-eyebrow">Executive Overview</small>
          <h1>Executive Overview</h1>
          <p>Carregando visão executiva do financeiro...</p>
        </div>
      </section>
    );
  }

  const organizationName = overview.organization_name || 'Empresa logada';

  return (
    <section className="page finance-page finance-overview-page">
      <header className="panel finance-overview-hero">
        <div className="finance-overview-hero__copy">
          <small className="finance-overview-eyebrow">Executive Overview</small>
          <h1>Executive Overview</h1>
          <p>Leitura executiva do financeiro da {organizationName}.</p>
        </div>

        <div className="finance-overview-hero__meta" aria-label="Resumo do contexto financeiro">
          <span>{overview.currency} · {overview.timezone}</span>
          <span>Atualizado em {new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: overview.timezone
          }).format(new Date(overview.generated_at))}</span>
          <span>Home principal do módulo</span>
        </div>
      </header>

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
