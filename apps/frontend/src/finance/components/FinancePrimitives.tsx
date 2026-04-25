import type { PropsWithChildren, ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'positive' | 'critical';

function toneClass(base: string, tone: Tone) {
  const resolvedTone = tone === 'positive' ? 'success' : tone === 'critical' ? 'danger' : tone;
  return `${base} ${base}--${resolvedTone}`;
}

export function FinancePageHeader({
  eyebrow,
  title,
  description,
  meta
}: {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: ReactNode;
}) {
  return (
    <header className={`finance-page-header${meta ? ' finance-page-header--with-meta' : ''}`}>
      <div className="finance-page-header__copy">
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {meta ? <div className="finance-page-header__meta">{meta}</div> : null}
    </header>
  );
}

export function FinancePanel({
  eyebrow,
  title,
  action,
  description,
  ariaLabel,
  children,
  className = ''
}: PropsWithChildren<{
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  description?: string;
  ariaLabel?: string;
  className?: string;
}>) {
  return (
    <section className={`panel finance-panel ${className}`.trim()} aria-label={ariaLabel ?? title}>
      {(eyebrow || title || action || description) ? (
        <header className="panel-header finance-panel__header">
          <div className="finance-panel__header-copy">
            {eyebrow ? <small className="finance-panel-eyebrow">{eyebrow}</small> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="panel-header-actions finance-panel__actions">{action}</div> : null}
        </header>
      ) : null}
      <div className="panel-content finance-panel__content">{children}</div>
    </section>
  );
}

export function FinanceKpiCard({
  label,
  value,
  description,
  tone = 'neutral',
  accentLabel
}: {
  label: string;
  value: ReactNode;
  description?: string;
  tone?: Tone;
  accentLabel?: string;
}) {
  return (
    <article className={toneClass('finance-kpi-card', tone)}>
      <div className="finance-kpi-card__accent" aria-hidden="true" />
      {accentLabel ? <small className="finance-kpi-card__accent-label">{accentLabel}</small> : null}
      <h3 className="finance-kpi-card__eyebrow">{label}</h3>
      <strong>{value}</strong>
      {description ? <p>{description}</p> : null}
    </article>
  );
}

export function FinanceTableShell({
  title,
  description,
  action,
  children,
  className = ''
}: PropsWithChildren<{
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={`finance-table-shell panel ${className}`.trim()}>
      <header className="finance-table-shell__header panel-header">
        <div>
          <small className="finance-panel-eyebrow">Tabela operacional</small>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="panel-header-actions">{action}</div> : null}
      </header>
      <div className="finance-table-shell__content panel-content">{children}</div>
    </section>
  );
}

export function FinanceFilterBlock({
  title,
  description,
  children,
  footer,
  ariaLabel,
  className = ''
}: PropsWithChildren<{
  title: string;
  description?: string;
  footer?: ReactNode;
  ariaLabel?: string;
  className?: string;
}>) {
  return (
    <section className={`finance-filter-block panel ${className}`.trim()} aria-label={ariaLabel ?? title}>
      <header className="finance-filter-block__header panel-header">
        <div>
          <small className="finance-panel-eyebrow">Filtro de leitura</small>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <div className="finance-filter-block__content panel-content">
        {children}
        {footer ? <div className="finance-filter-block__footer">{footer}</div> : null}
      </div>
    </section>
  );
}

export function FinanceBadge({
  children,
  tone = 'neutral'
}: PropsWithChildren<{ tone?: Tone }>) {
  return <span className={toneClass('finance-badge', tone)}>{children}</span>;
}

export function FinanceStatusPill({
  children,
  tone = 'neutral'
}: PropsWithChildren<{ tone?: Tone }>) {
  return <span className={toneClass('finance-status-pill', tone)}>{children}</span>;
}

export function FinanceMono({
  children,
  className = ''
}: PropsWithChildren<{ className?: string }>) {
  return <span className={`finance-mono ${className}`.trim()}>{children}</span>;
}

export function FinanceEmptyState({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="finance-empty-state" role="status">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="finance-empty-state__action">{action}</div> : null}
    </div>
  );
}

export function FinanceLoadingState({
  title = 'Carregando...',
  description
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="finance-state-card finance-state-card--loading" aria-live="polite">
      <small className="finance-panel-eyebrow">Financeiro ERP</small>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function FinanceErrorState({
  title = 'Não foi possível carregar esta área.',
  description,
  action
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="finance-state-card finance-state-card--error" role="alert" aria-live="polite">
      <small className="finance-panel-eyebrow">Financeiro ERP</small>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {action ? <div className="finance-state-card__action">{action}</div> : null}
    </div>
  );
}
