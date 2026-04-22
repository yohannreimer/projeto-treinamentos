import { Link } from 'react-router-dom';
import type { FinanceExecutiveQueueItem } from '../api';
import { FinanceBadge, FinanceMono, FinancePanel } from './FinancePrimitives';

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
  const toneMap = (tone: FinanceExecutiveQueueItem['tone']) => {
    if (tone === 'critical') return 'danger' as const;
    if (tone === 'warning') return 'warning' as const;
    return 'neutral' as const;
  };

  return (
    <FinancePanel className="finance-queue-panel" eyebrow="Split control" title="Fila operacional">
      <div className="finance-queue-panel__content">
        {items.map((item) => (
          <article key={item.id} className={`finance-queue-item finance-queue-item--${item.tone}`}>
            <div className="finance-queue-item__header">
              <FinanceBadge tone={toneMap(item.tone)}>{item.status}</FinanceBadge>
              <FinanceMono>{formatCurrency(item.amount_cents, currency)}</FinanceMono>
            </div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <Link to={item.href} className="finance-queue-item__link">
              {item.cta}
            </Link>
          </article>
        ))}
      </div>
    </FinancePanel>
  );
}
