import { Link } from 'react-router-dom';
import type { FinanceExecutiveQueueItem } from '../api';
import { formatCurrency } from '../utils/financeFormatters';
import { FinanceBadge, FinanceMono, FinancePanel } from './FinancePrimitives';

type FinanceQueuePanelProps = {
  items: FinanceExecutiveQueueItem[];
  currency: string;
  loading?: boolean;
};

function normalizeOverviewCta(item: Pick<FinanceExecutiveQueueItem, 'href' | 'status' | 'cta'>) {
  if (item.href.includes('/reconciliation')) return 'Conciliar';
  if (item.href.includes('/receivables')) return 'Ver recebíveis';
  if (item.href.includes('/payables')) {
    if (/hoje/i.test(item.status)) return 'Ver pagamentos';
    return 'Ver obrigações';
  }

  return item.cta;
}

export function FinanceQueuePanel({ items, currency, loading = false }: FinanceQueuePanelProps) {
  const toneMap = (tone: FinanceExecutiveQueueItem['tone']) => {
    if (tone === 'critical') return 'danger' as const;
    if (tone === 'warning') return 'warning' as const;
    return 'neutral' as const;
  };

  const emptyRows = [
    { id: 'empty-1', status: 'Crítico', title: 'Atraso a receber', detail: 'Sem títulos críticos no momento.', amount_cents: 0, tone: 'critical' as const, href: '/financeiro/receivables', cta: 'Ver recebíveis' },
    { id: 'empty-2', status: 'Hoje', title: 'Vencem hoje', detail: 'Não há pagamentos vencendo nesta janela.', amount_cents: 0, tone: 'warning' as const, href: '/financeiro/payables', cta: 'Ver pagamentos' },
    { id: 'empty-3', status: 'Fila', title: 'Pendências', detail: 'Sem lançamentos aguardando match.', amount_cents: 0, tone: 'warning' as const, href: '/financeiro/reconciliation', cta: 'Conciliar' },
    { id: 'empty-4', status: 'Próximo', title: 'A pagar em breve', detail: 'Nenhuma obrigação próxima da data crítica.', amount_cents: 0, tone: 'neutral' as const, href: '/financeiro/payables', cta: 'Ver obrigações' }
  ];

  if (loading) {
    const loadingRows = [
      { id: 'loading-1', status: 'Crítico', title: 'Aguardando fila operacional', detail: 'As pendências executivas aparecem aqui quando os dados carregarem.', amount_cents: 0, tone: 'critical' as const, href: '/', cta: 'Abrir' },
      { id: 'loading-2', status: 'Hoje', title: 'Aguardando fila operacional', detail: 'O bloco preserva a cadência visual mesmo sem dados.', amount_cents: 0, tone: 'warning' as const, href: '/', cta: 'Abrir' }
    ];

    return (
      <FinancePanel
        className="finance-queue-panel"
        eyebrow="Split control"
        title="Fila operacional"
      >
        <div className="finance-queue-panel__content finance-queue-panel__content--loading">
          {loadingRows.map((item) => (
            <article key={item.id} className={`finance-queue-item finance-queue-item--${item.tone} finance-queue-item--loading`}>
              <div className="finance-queue-item__header">
                <FinanceBadge tone={toneMap(item.tone)}>{item.status}</FinanceBadge>
                <FinanceMono>—</FinanceMono>
              </div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <span className="finance-queue-item__link finance-queue-item__link--ghost">{item.cta}</span>
            </article>
          ))}
        </div>
      </FinancePanel>
    );
  }

  if (items.length === 0) {
    return (
      <FinancePanel
        className="finance-queue-panel"
        eyebrow="Split control"
        title="Fila operacional"
      >
      <div className="finance-queue-panel__content finance-queue-panel__content--empty">
          {emptyRows.map((item) => (
            <article key={item.id} className="finance-queue-item finance-queue-item--empty">
              <div className="finance-queue-item__header">
                <FinanceBadge tone={toneMap(item.tone)}>{item.status}</FinanceBadge>
                <FinanceMono>{formatCurrency(item.amount_cents, currency)}</FinanceMono>
              </div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <span className="finance-queue-item__link finance-queue-item__link--flat">{item.cta}</span>
            </article>
          ))}
        </div>
      </FinancePanel>
    );
  }

  return (
    <FinancePanel
      className="finance-queue-panel"
      eyebrow="Split control"
      title="Fila operacional"
    >
      <div className="finance-queue-panel__content">
        {items.map((item) => (
          <article key={item.id} className={`finance-queue-item finance-queue-item--${item.tone}`}>
            <div className="finance-queue-item__header">
              <FinanceBadge tone={toneMap(item.tone)}>{item.status}</FinanceBadge>
              <FinanceMono>{formatCurrency(item.amount_cents, currency)}</FinanceMono>
            </div>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <Link to={item.href} className="finance-queue-item__link finance-queue-item__link--flat">
              {normalizeOverviewCta(item)}
            </Link>
          </article>
        ))}
      </div>
    </FinancePanel>
  );
}
