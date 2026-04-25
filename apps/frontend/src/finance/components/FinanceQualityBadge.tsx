import type { FinanceQualitySeverity } from '../api';

export function FinanceQualityBadge({ severity }: { severity: FinanceQualitySeverity }) {
  const meta = {
    critical: { label: 'Crítico', className: 'finance-quality-badge--critical' },
    warning: { label: 'Atenção', className: 'finance-quality-badge--warning' },
    suggestion: { label: 'Sugestão', className: 'finance-quality-badge--suggestion' }
  }[severity];

  return (
    <span className={`finance-quality-badge ${meta.className}`}>
      {meta.label}
    </span>
  );
}
