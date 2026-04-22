import { Link } from 'react-router-dom';
import type { FinanceExecutiveQuickAction } from '../api';

type FinanceQuickActionsProps = {
  actions: FinanceExecutiveQuickAction[];
};

export function FinanceQuickActions({ actions }: FinanceQuickActionsProps) {
  return (
    <section className="panel finance-quick-actions-panel" aria-labelledby="finance-quick-actions-title">
      <header className="panel-header">
        <div>
          <small className="finance-panel-eyebrow">Utility layer</small>
          <h2 id="finance-quick-actions-title">Ações rápidas</h2>
        </div>
      </header>

      <div className="panel-content finance-quick-actions-panel__content">
        {actions.map((action) => (
          <Link key={action.id} to={action.href} className="finance-quick-action">
            <strong>{action.label}</strong>
            <span>{action.detail}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
