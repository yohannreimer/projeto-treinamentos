import type { ReactNode } from 'react';
import { FinanceEmptyState, FinanceKpiCard, FinanceMono, FinancePanel, FinanceStatusPill } from './FinancePrimitives';
import { formatCurrency, formatDate } from '../utils/financeFormatters';

export function FinanceOperationalSummaryCard(props: {
  label: string;
  amount: number;
  detail: string;
  tone: 'default' | 'warning' | 'critical';
  accentLabel: string;
  formatCurrency: (amount: number) => string;
}) {
  return (
    <FinanceKpiCard
      label={props.label}
      value={<FinanceMono>{props.formatCurrency(props.amount)}</FinanceMono>}
      description={props.detail}
      tone={props.tone === 'critical' ? 'danger' : props.tone === 'warning' ? 'warning' : 'neutral'}
      accentLabel={props.accentLabel}
    />
  );
}

export function FinanceOperationalListGroup<T>(props: {
  title: string;
  caption: string;
  rows: T[];
  emptyMessage: string;
  rowKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
}) {
  return (
    <FinancePanel title={props.title} description={props.caption} eyebrow="Carteira operacional" ariaLabel={props.title}>
      <div className="finance-list-stack">
        {props.rows.length === 0 ? (
          <FinanceEmptyState title={props.emptyMessage} />
        ) : (
          props.rows.map((row) => <div key={props.rowKey(row)}>{props.renderRow(row)}</div>)
        )}
      </div>
    </FinancePanel>
  );
}

export function FinanceOperationalRow(props: {
  description: string;
  counterpartyLabel: string;
  counterpartyValue?: string | null;
  accountName?: string | null;
  categoryName?: string | null;
  amountCents: number;
  primaryDateLabel: string;
  primaryDate?: string | null;
  secondaryDateLabel: string;
  secondaryDate?: string | null;
  statusLabel: string;
  statusTone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'positive' | 'critical';
}) {
  const accountSuffix = props.accountName || props.categoryName
    ? ` • ${props.accountName ?? 'Sem conta'} • ${props.categoryName ?? 'Sem categoria'}`
    : '';

  return (
    <article className="finance-list-row">
      <div className="finance-list-row__copy">
        <strong>{props.description}</strong>
        <span>
          {props.counterpartyValue || `${props.counterpartyLabel} não informado`}
          {accountSuffix}
        </span>
      </div>
      <strong><FinanceMono>{formatCurrency(props.amountCents)}</FinanceMono></strong>
      <div className="finance-list-row__meta">
        <span>{props.primaryDateLabel}: <FinanceMono>{formatDate(props.primaryDate)}</FinanceMono></span>
        <span>{props.secondaryDateLabel}: <FinanceMono>{formatDate(props.secondaryDate)}</FinanceMono></span>
        <FinanceStatusPill tone={props.statusTone}>
          {props.statusLabel}
        </FinanceStatusPill>
      </div>
    </article>
  );
}
