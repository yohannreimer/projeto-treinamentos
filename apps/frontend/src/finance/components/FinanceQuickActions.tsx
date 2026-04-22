import { Link } from 'react-router-dom';
import type { FinanceExecutiveQuickAction } from '../api';
import { FinancePanel } from './FinancePrimitives';

type FinanceQuickActionsProps = {
  actions: FinanceExecutiveQuickAction[];
};

export function FinanceQuickActions({ actions }: FinanceQuickActionsProps) {
  return (
    <FinancePanel className="finance-quick-actions-panel" eyebrow="Utility layer" title="Ações rápidas">
      <div className="finance-quick-actions-panel__content">
        {actions.map((action) => (
          <Link key={action.id} to={action.href} className="finance-quick-action">
            <strong>{action.label}</strong>
            <span>{action.detail}</span>
          </Link>
        ))}
      </div>
    </FinancePanel>
  );
}
