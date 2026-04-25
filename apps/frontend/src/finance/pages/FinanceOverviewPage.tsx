import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { financeApi, type FinanceExecutiveOverview } from '../api';
import { FinanceCashflowPanel } from '../components/FinanceCashflowPanel';
import { FINANCE_QUICK_LAUNCH_CREATED_EVENT } from '../components/FinanceFloatingQuickLauncher';
import { FinanceKpiGrid } from '../components/FinanceKpiGrid';
import { FinancePeriodFilter } from '../components/FinancePeriodFilter';
import { FinanceQueuePanel } from '../components/FinanceQueuePanel';
import { FinanceQuickActions } from '../components/FinanceQuickActions';
import { FinanceErrorState, FinancePageHeader } from '../components/FinancePrimitives';
import { useFinancePeriod } from '../hooks/useFinancePeriod';

function isValidTimeZone(timezone?: string | null) {
  if (!timezone) return false;

  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function formatOverviewGeneratedAt(timezone?: string | null, generatedAt?: string | null) {
  if (!generatedAt) return 'Data indisponível';

  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) return 'Data indisponível';

  const baseOptions: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

  try {
    const formatted = new Intl.DateTimeFormat('pt-BR', isValidTimeZone(timezone) ? { ...baseOptions, timeZone: timezone ?? undefined } : baseOptions).format(parsed);
    return formatted.replace(' às ', ', ');
  } catch {
    return new Intl.DateTimeFormat('pt-BR', baseOptions).format(parsed).replace(' às ', ', ');
  }
}

export function FinanceOverviewPage() {
  const { period, setPeriod, apiFilters } = useFinancePeriod();
  const [overview, setOverview] = useState<FinanceExecutiveOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [qualityNoticeDismissed, setQualityNoticeDismissed] = useState(() =>
    window.localStorage.getItem('finance-quality-notice-dismissed-v1') === '1'
  );

  useEffect(() => {
    let cancelled = false;

    setOverview(null);
    financeApi.getExecutiveOverview(apiFilters)
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
  }, [apiFilters, reloadNonce]);

  useEffect(() => {
    function handleQuickLaunchCreated() {
      setReloadNonce((current) => current + 1);
    }

    window.addEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, handleQuickLaunchCreated);
    return () => window.removeEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, handleQuickLaunchCreated);
  }, []);

  if (error) {
    return (
      <section className="page finance-page finance-overview-page" aria-live="polite">
        <FinanceErrorState
          title="Visão Geral"
          description={error}
        />
      </section>
    );
  }

  if (!overview) {
    return (
      <section className="page finance-page finance-overview-page" aria-live="polite">
        <FinancePageHeader
          eyebrow="Executive Overview"
          title="Visão Geral"
          description="Carregando visão executiva do financeiro..."
          meta={<FinancePeriodFilter value={period} onChange={setPeriod} />}
        />

        <FinanceKpiGrid kpis={[]} currency="BRL" loading />

        <div className="finance-overview-split">
          <FinanceCashflowPanel bands={[]} currency="BRL" loading />

          <aside className="finance-overview-rail">
            <FinanceQueuePanel items={[]} currency="BRL" loading />
          </aside>
        </div>

        <FinanceQuickActions actions={[]} loading />
      </section>
    );
  }

  const organizationName = overview.organization_name || 'Empresa logada';
  const qualityIssueCount = overview.summary.quality_issue_count ?? 0;
  const qualityCriticalCount = overview.summary.quality_critical_count ?? 0;
  function dismissQualityNotice() {
    window.localStorage.setItem('finance-quality-notice-dismissed-v1', '1');
    setQualityNoticeDismissed(true);
  }

  return (
    <section className="page finance-page finance-overview-page">
      <FinancePageHeader
        eyebrow="Executive Overview"
        title="Visão Geral"
        description={`Leitura executiva do financeiro da ${organizationName}.`}
        meta={<FinancePeriodFilter value={period} onChange={setPeriod} />}
      />

      {qualityIssueCount > 0 && !qualityNoticeDismissed ? (
        <div className="finance-quality-notice">
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: 'block', fontSize: 12, color: '#9a3412' }}>{qualityIssueCount} lançamentos precisam de revisão</strong>
            <span style={{ display: 'block', fontSize: 11, color: '#c2410c', marginTop: 2 }}>
              {qualityCriticalCount > 0 ? `${qualityCriticalCount} críticos para DRE e centros de custo.` : 'Há dados operacionais pendentes no período.'}
            </span>
          </div>
          <div className="finance-quality-notice__actions">
            <Link to="/financeiro/reconciliation" className="finance-quality-notice__link">
              Revisar dados
            </Link>
            <button type="button" aria-label="Fechar aviso de revisão" onClick={dismissQualityNotice} className="finance-quality-notice__close">×</button>
          </div>
        </div>
      ) : null}

      <FinanceKpiGrid kpis={overview.kpis} currency={overview.currency} />

      <div className="finance-overview-split">
        <FinanceCashflowPanel bands={overview.cashflow_bands} currency={overview.currency} />

        <aside className="finance-overview-rail">
          <FinanceQueuePanel items={overview.queue} currency={overview.currency} />
        </aside>
      </div>

      <FinanceQuickActions actions={overview.quick_actions} />
    </section>
  );
}
