import { useEffect, useMemo, useState } from 'react';
import { financeApi, type FinanceCashflow, type FinanceCashflowHorizon } from '../api';
import { FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader, FinancePanel } from '../components/FinancePrimitives';

const horizons: FinanceCashflowHorizon[] = [30, 60, 90];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

export function FinanceCashflowPage() {
  const [horizon, setHorizon] = useState<FinanceCashflowHorizon>(90);
  const [cashflow, setCashflow] = useState<FinanceCashflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');

    financeApi.getCashflow(horizon)
      .then((payload) => {
        if (cancelled) return;
        setCashflow(payload);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError((loadError as Error).message || 'Falha ao carregar o fluxo de caixa.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [horizon]);

  const highlightedPoints = useMemo(() => {
    if (!cashflow) return [];
    return cashflow.points.filter((point) =>
      point.inflow_cents !== 0
      || point.outflow_cents !== 0
      || point.date === cashflow.points[0]?.date
      || point.date === cashflow.points[cashflow.points.length - 1]?.date
    ).slice(0, 8);
  }, [cashflow]);

  const selectedWindow = useMemo(
    () => cashflow?.windows.find((window) => window.horizon_days === horizon) ?? null,
    [cashflow, horizon]
  );

  const largestMagnitude = useMemo(() => (
    Math.max(
      1,
      ...(cashflow?.windows ?? []).map((window) => Math.max(window.inflow_cents, window.outflow_cents))
    )
  ), [cashflow]);

  return (
    <section className="page finance-page">
      <FinancePageHeader
        eyebrow="Fluxo de Caixa"
        title="Fluxo de caixa projetado"
        description="Horizonte temporal para antecipar pressão de caixa, folga operacional e ritmo de entradas e saídas."
      />

      <div className="finance-cashflow-layout">
        <FinancePanel
          title="Horizonte temporal"
          description="Alterne entre leitura tática, tendência próxima e planejamento ampliado."
          eyebrow="Principal view"
          action={(
            <div className="finance-cashflow-horizon-switcher" role="tablist" aria-label="Horizonte do fluxo de caixa">
              {horizons.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === horizon ? 'is-active' : ''}
                  aria-pressed={item === horizon}
                  onClick={() => setHorizon(item)}
                >
                  <FinanceMono>{item}</FinanceMono> dias
                </button>
              ))}
            </div>
          )}
        >
            {loading ? (
              <FinanceLoadingState title="Carregando projeção..." />
            ) : error ? (
              <FinanceErrorState title="Falha ao carregar o fluxo de caixa." description={error} />
            ) : cashflow ? (
              <>
                <div className="finance-cashflow-window-grid">
                  {cashflow.windows.map((window) => (
                    <button
                      key={window.horizon_days}
                      type="button"
                      className={`finance-cashflow-window-card ${window.horizon_days === horizon ? 'is-active' : ''}`}
                      onClick={() => setHorizon(window.horizon_days)}
                    >
                      <div className="finance-cashflow-window-card__head">
                        <span><FinanceMono>{window.horizon_days}</FinanceMono> dias</span>
                        <small className={`finance-cashflow-window-card__risk finance-cashflow-window-card__risk--${window.risk_level}`}>
                          {window.risk_level === 'healthy' ? 'Estável' : window.risk_level === 'attention' ? 'Atenção' : 'Crítico'}
                        </small>
                      </div>
                      <strong><FinanceMono>{formatCurrency(window.ending_balance_cents)}</FinanceMono></strong>
                      <p>
                        Entradas <FinanceMono>{formatCurrency(window.inflow_cents)}</FinanceMono> • Saídas <FinanceMono>{formatCurrency(window.outflow_cents)}</FinanceMono>
                      </p>
                    </button>
                  ))}
                </div>

                <div className="finance-cashflow-page__summary">
                  <article>
                    <span>Saldo inicial</span>
                    <strong><FinanceMono>{formatCurrency(cashflow.totals.starting_balance_cents)}</FinanceMono></strong>
                    <small>base dos extratos já reconciliados/importados</small>
                  </article>
                  <article>
                    <span>Entradas projetadas</span>
                    <strong><FinanceMono>{formatCurrency(cashflow.totals.inflow_cents)}</FinanceMono></strong>
                    <small>recebimentos previstos para <FinanceMono>{cashflow.horizon_days}</FinanceMono> dias</small>
                  </article>
                  <article>
                    <span>Saídas projetadas</span>
                    <strong><FinanceMono>{formatCurrency(cashflow.totals.outflow_cents)}</FinanceMono></strong>
                    <small>obrigações previstas na mesma janela</small>
                  </article>
                  <article>
                    <span>Saldo final</span>
                    <strong><FinanceMono>{formatCurrency(cashflow.totals.ending_balance_cents)}</FinanceMono></strong>
                    <small>posição acumulada ao fim da janela</small>
                  </article>
                  <article>
                    <span>Pior ponto</span>
                    <strong><FinanceMono>{formatCurrency(selectedWindow?.lowest_balance_cents ?? cashflow.totals.ending_balance_cents)}</FinanceMono></strong>
                    <small>menor saldo previsto no horizonte</small>
                  </article>
                </div>

                <div className="finance-cashflow-alerts">
                  {cashflow.alerts.map((alert) => (
                    <article key={alert.id} className={`finance-cashflow-alert finance-cashflow-alert--${alert.tone}`}>
                      <strong>{alert.title}</strong>
                      <p>{alert.detail}</p>
                    </article>
                  ))}
                </div>

                <div className="finance-cashflow-page__chart" role="region" aria-label="Curva projetada do fluxo de caixa">
                  {highlightedPoints.map((point) => {
                    const chartLargestMagnitude = Math.max(
                      ...highlightedPoints.map((item) => Math.max(item.inflow_cents, item.outflow_cents, 1))
                    );
                    const inflowWidth = `${Math.max((point.inflow_cents / chartLargestMagnitude) * 100, point.inflow_cents ? 8 : 0)}%`;
                    const outflowWidth = `${Math.max((point.outflow_cents / chartLargestMagnitude) * 100, point.outflow_cents ? 8 : 0)}%`;

                    return (
                      <article key={point.date} className="finance-cashflow-page__point">
                        <div className="finance-cashflow-page__point-head">
                          <strong><FinanceMono>{formatDate(point.date)}</FinanceMono></strong>
                          <span>Saldo <FinanceMono>{formatCurrency(point.balance_cents)}</FinanceMono></span>
                        </div>
                        <div className="finance-cashflow-page__point-bars">
                          <div className="finance-cashflow-page__bar finance-cashflow-page__bar--inflow" style={{ width: inflowWidth }} />
                          <div className="finance-cashflow-page__bar finance-cashflow-page__bar--outflow" style={{ width: outflowWidth }} />
                        </div>
                        <dl className="finance-cashflow-page__point-stats">
                          <div>
                            <dt>Entradas</dt>
                            <dd><FinanceMono>{formatCurrency(point.inflow_cents)}</FinanceMono></dd>
                          </div>
                          <div>
                            <dt>Saídas</dt>
                            <dd><FinanceMono>{formatCurrency(point.outflow_cents)}</FinanceMono></dd>
                          </div>
                          <div>
                            <dt>Net</dt>
                            <dd><FinanceMono>{formatCurrency(point.net_cents)}</FinanceMono></dd>
                          </div>
                        </dl>
                      </article>
                    );
                  })}
                </div>

                <section className="finance-cashflow-bars panel-shell-reset" aria-label="Comparativo das janelas 30 60 90 dias">
                  {cashflow.windows.map((window) => (
                    <article key={window.horizon_days} className="finance-cashflow-bars__item">
                      <div className="finance-cashflow-bars__meta">
                        <strong><FinanceMono>{window.horizon_days}</FinanceMono> dias</strong>
                        <span>Saldo final <FinanceMono>{formatCurrency(window.ending_balance_cents)}</FinanceMono></span>
                      </div>
                      <div className="finance-cashflow-bars__bars" aria-hidden="true">
                        <div
                          className="finance-cashflow-bars__bar finance-cashflow-bars__bar--inflow"
                          style={{ height: `${Math.max((window.inflow_cents / largestMagnitude) * 100, window.inflow_cents ? 12 : 0)}%` }}
                        />
                        <div
                          className="finance-cashflow-bars__bar finance-cashflow-bars__bar--outflow"
                          style={{ height: `${Math.max((window.outflow_cents / largestMagnitude) * 100, window.outflow_cents ? 12 : 0)}%` }}
                        />
                      </div>
                    </article>
                  ))}
                </section>
              </>
            ) : null}
        </FinancePanel>
      </div>
    </section>
  );
}
