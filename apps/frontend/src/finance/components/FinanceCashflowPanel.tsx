import type { FinanceExecutiveCashflowBand } from '../api';

type FinanceCashflowPanelProps = {
  bands: FinanceExecutiveCashflowBand[];
  currency: string;
};

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

export function FinanceCashflowPanel({ bands, currency }: FinanceCashflowPanelProps) {
  const leadingBand = bands[bands.length - 1];

  return (
    <section className="panel finance-cashflow-panel" aria-labelledby="finance-cashflow-title">
      <header className="panel-header finance-cashflow-panel__header">
        <div>
          <small className="finance-panel-eyebrow">Principal view</small>
          <h2 id="finance-cashflow-title">Fluxo de caixa 90 dias</h2>
        </div>
        <p>Comparativo de entradas, saídas e saldo acumulado para a janela executiva.</p>
      </header>

      <div className="panel-content finance-cashflow-panel__content">
        <div className="finance-cashflow-summary">
          <div>
            <span>Saldo projetado</span>
            <strong>{formatCurrency(leadingBand.balance_cents, currency)}</strong>
          </div>
          <div>
            <span>Janela atual</span>
            <strong>{leadingBand.label}</strong>
          </div>
        </div>

        <div className="finance-cashflow-chart" role="list" aria-label="Projeção de caixa por período">
          {bands.map((band) => (
            <article key={band.label} className="finance-cashflow-band" role="listitem">
              <div className="finance-cashflow-band__meta">
                <strong>{band.label}</strong>
                <span>
                  {band.balance_label} {formatCurrency(band.balance_cents, currency)}
                </span>
              </div>

              <div className="finance-cashflow-band__bars" aria-hidden="true">
                <div className="finance-cashflow-bar finance-cashflow-bar--inflow" style={{ height: `${band.inflow_share}%` }} />
                <div className="finance-cashflow-bar finance-cashflow-bar--outflow" style={{ height: `${band.outflow_share}%` }} />
              </div>

              <dl className="finance-cashflow-band__stats">
                <div>
                  <dt>Entradas</dt>
                  <dd>{formatCurrency(band.inflow_cents, currency)}</dd>
                </div>
                <div>
                  <dt>Saídas</dt>
                  <dd>{formatCurrency(band.outflow_cents, currency)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
