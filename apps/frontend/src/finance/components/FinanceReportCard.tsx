import type { ReactNode } from 'react';
import { FinancePanel } from './FinancePrimitives';

type FinanceReportCardProps = {
  title: string;
  description: string;
  eyebrow?: string;
  emphasis?: 'default' | 'primary';
  children: ReactNode;
};

export function FinanceReportCard({
  title,
  description,
  eyebrow = 'Relatório',
  emphasis = 'default',
  children
}: FinanceReportCardProps) {
  return (
    <FinancePanel
      className={`finance-report-card ${emphasis === 'primary' ? 'finance-report-card--primary' : ''}`.trim()}
      eyebrow={eyebrow}
      title={title}
      description={description}
    >
      <div className="finance-report-card__content">
        {children}
      </div>
    </FinancePanel>
  );
}
