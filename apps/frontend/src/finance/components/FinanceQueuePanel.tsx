import { Link } from 'react-router-dom';
import type { FinanceExecutiveQueueItem } from '../api';

type FinanceQueuePanelProps = {
  items: FinanceExecutiveQueueItem[];
  currency: string;
};

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(amountCents / 100);
}

export function FinanceQueuePanel({ items, currency }: FinanceQueuePanelProps) {
  return (
    <section className="panel finance-queue-panel" aria-labelledby="finance-queue-title">
      <header className="panel-header">
        <div>
          <small className="finance-panel-eyebrow">Split control</small>
          <h2 id="finance-queue-title">Fila operacional</h2>
        </div>
      </header>

      <div className="panel-content finance-queue-panel__content">
        {items.map((item) => (
          <article key={item.id} className={`finance-queue-item finance-queue-item--${item.tone}`}>
            <div className="finance-queue-item__header">
              <span className="finance-queue-item__status">{item.status}</span>
              <strong>{formatCurrency(item.amount_cents, currency)}</strong>
            </div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <Link to={item.href} className="finance-queue-item__link">
              {item.cta}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
