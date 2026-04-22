import type { FinanceExecutiveCashflowBand } from '../api';
import { formatCurrency } from '../utils/financeFormatters';
import { FinanceMono, FinancePanel } from './FinancePrimitives';

type FinanceCashflowPanelProps = {
  bands: FinanceExecutiveCashflowBand[];
  currency: string;
};

export function FinanceCashflowPanel({ bands, currency }: FinanceCashflowPanelProps) {
  const leadingBand = bands[bands.length - 1];

  return (
    <FinancePanel
      className="finance-cashflow-panel"
      eyebrow="Principal view"
      title="Fluxo de caixa 90 dias"
      description="Comparativo de entradas, saídas e saldo acumulado para a janela executiva."
    >
      <div className="finance-cashflow-panel__content">
        <div className="finance-cashflow-summary">
          <div>
            <span>Saldo projetado</span>
            <FinanceMono>{formatCurrency(leadingBand.balance_cents, currency)}</FinanceMono>
          </div>
          <div>
            <span>Janela atual</span>
            <FinanceMono>{leadingBand.label}</FinanceMono>
          </div>
        </div>

        <div className="finance-cashflow-chart" role="list" aria-label="Projeção de caixa por período">
          {bands.map((band) => (
            <article key={band.label} className="finance-cashflow-band" role="listitem">
              <div className="finance-cashflow-band__meta">
                <strong>{band.label}</strong>
                <span><FinanceMono>{band.balance_label} {formatCurrency(band.balance_cents, currency)}</FinanceMono></span>
              </div>

              <div className="finance-cashflow-band__bars" aria-hidden="true">
                <div className="finance-cashflow-bar finance-cashflow-bar--inflow" style={{ height: `${band.inflow_share}%` }} />
                <div className="finance-cashflow-bar finance-cashflow-bar--outflow" style={{ height: `${band.outflow_share}%` }} />
              </div>

              <dl className="finance-cashflow-band__stats">
                <div>
                  <dt>Entradas</dt>
                  <dd><FinanceMono>{formatCurrency(band.inflow_cents, currency)}</FinanceMono></dd>
                </div>
                <div>
                  <dt>Saídas</dt>
                  <dd><FinanceMono>{formatCurrency(band.outflow_cents, currency)}</FinanceMono></dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </FinancePanel>
  );
}
