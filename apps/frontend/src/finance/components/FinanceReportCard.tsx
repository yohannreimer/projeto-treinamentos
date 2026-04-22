import type { ReactNode } from 'react';

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
  const isPrimary = emphasis === 'primary';

  return (
    <article
      className="panel"
      style={{
        borderRadius: '22px',
        overflow: 'hidden',
        border: isPrimary ? '1px solid rgba(239, 47, 15, 0.18)' : undefined,
        boxShadow: isPrimary
          ? '0 22px 48px rgba(18, 31, 53, 0.08), 0 4px 14px rgba(239, 47, 15, 0.06)'
          : undefined
      }}
    >
      <div
        className="panel-header"
        style={{
          borderBottom: '1px solid rgba(18, 31, 53, 0.08)',
          background: isPrimary
            ? 'linear-gradient(180deg, rgba(255, 247, 244, 0.95), rgba(255, 255, 255, 0.98))'
            : 'linear-gradient(180deg, rgba(252, 253, 254, 0.98), rgba(255, 255, 255, 0.98))'
        }}
      >
        <small
          style={{
            color: isPrimary ? '#b4442f' : 'var(--ink-soft)',
            fontSize: '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}
        >
          {eyebrow}
        </small>
        <h2>{title}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', maxWidth: '56ch' }}>{description}</p>
      </div>
      <div className="panel-content" style={{ display: 'grid', gap: '14px' }}>
        {children}
      </div>
    </article>
  );
}
