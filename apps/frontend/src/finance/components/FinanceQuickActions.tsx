import { Link } from 'react-router-dom';
import type { FinanceExecutiveQuickAction } from '../api';
import { FinancePanel } from './FinancePrimitives';

type FinanceQuickActionsProps = {
  actions: FinanceExecutiveQuickAction[];
  loading?: boolean;
};

export function FinanceQuickActions({ actions, loading = false }: FinanceQuickActionsProps) {
  const loadingCards = [
    { id: 'loading-1', label: 'Novo lançamento', detail: 'Carregando atalhos do financeiro.', href: '/financeiro/transactions' },
    { id: 'loading-2', label: 'Registrar recebível', detail: 'Carregando atalhos do financeiro.', href: '/financeiro/receivables' },
    { id: 'loading-3', label: 'Registrar obrigação', detail: 'Carregando atalhos do financeiro.', href: '/financeiro/payables' },
    { id: 'loading-4', label: 'Conciliar extrato', detail: 'Carregando atalhos do financeiro.', href: '/financeiro/reconciliation' }
  ];

  const emptyCards = [
    { id: 'empty-1', label: 'Novo lançamento', detail: 'Registrar entrada ou saída.' },
    { id: 'empty-2', label: 'Registrar recebível', detail: 'Nova conta a receber.' },
    { id: 'empty-3', label: 'Registrar obrigação', detail: 'Nova conta a pagar.' },
    { id: 'empty-4', label: 'Conciliar extrato', detail: 'Processar pendências bancárias.' }
  ];

  const canonicalCards = [
    { id: 'canonical-1', label: 'Novo lançamento', detail: 'Registrar entrada ou saída.', href: '/financeiro/transactions' },
    { id: 'canonical-2', label: 'Registrar recebível', detail: 'Nova conta a receber.', href: '/financeiro/receivables' },
    { id: 'canonical-3', label: 'Registrar obrigação', detail: 'Nova conta a pagar.', href: '/financeiro/payables' },
    { id: 'canonical-4', label: 'Conciliar extrato', detail: 'Processar pendências bancárias.', href: '/financeiro/reconciliation' }
  ];

  if (loading) {
    return (
      <FinancePanel
        className="finance-quick-actions-panel"
        title="Ações rápidas"
      >
        <div className="finance-quick-actions-panel__content finance-quick-actions-panel__content--loading">
          {loadingCards.map((action) => (
            <span key={action.id} className="finance-quick-action finance-quick-action--ghost finance-quick-action--loading">
              <strong>{action.label}</strong>
              <span>{action.detail}</span>
            </span>
          ))}
        </div>
      </FinancePanel>
    );
  }

  if (actions.length === 0) {
    return (
      <FinancePanel
        className="finance-quick-actions-panel"
        title="Ações rápidas"
      >
        <div className="finance-quick-actions-panel__content finance-quick-actions-panel__content--empty">
          {emptyCards.map((action) => (
            <article key={action.id} className="finance-quick-action finance-quick-action--empty">
              <strong>{action.label}</strong>
              <span>{action.detail}</span>
            </article>
          ))}
        </div>
      </FinancePanel>
    );
  }

  return (
    <FinancePanel
      className="finance-quick-actions-panel"
      title="Ações rápidas"
    >
      <div className="finance-quick-actions-panel__content">
        {[...actions, ...canonicalCards.filter((canonical) => !actions.some((action) => action.href === canonical.href))].slice(0, 4).map((action) => (
          <Link key={action.id} to={action.href} className="finance-quick-action finance-quick-action--flat">
            <strong>{action.label}</strong>
            <span>{action.detail}</span>
          </Link>
        ))}
      </div>
    </FinancePanel>
  );
}
