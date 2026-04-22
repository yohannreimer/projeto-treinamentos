import { useEffect, useMemo, useState } from 'react';
import type { FinanceReconciliationBucketKey, FinanceReconciliationInbox } from '../api';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

export function FinanceStatementInbox(props: { inbox: FinanceReconciliationInbox }) {
  const { inbox } = props;
  const [activeBucket, setActiveBucket] = useState<FinanceReconciliationBucketKey>('urgent');

  useEffect(() => {
    const preferred = inbox.buckets.find((bucket) => bucket.count > 0)?.key ?? inbox.buckets[0]?.key ?? 'urgent';
    setActiveBucket(preferred);
  }, [inbox.buckets]);

  const activeSection = useMemo(
    () => inbox.buckets.find((bucket) => bucket.key === activeBucket) ?? inbox.buckets[0],
    [activeBucket, inbox.buckets]
  );

  return (
    <section className="panel finance-statement-inbox" aria-label="Pendências de conciliação">
      <div className="panel-header">
        <div>
          <h2>Pendências de conciliação</h2>
          <p className="finance-statement-inbox__subtitle">
            Inbox operacional com extratos sem match, priorizados para leitura e ação.
          </p>
        </div>
      </div>
      <div className="panel-content finance-statement-inbox__content">
        <div className="finance-statement-inbox__summary">
          <article>
            <span>Na fila</span>
            <strong>{inbox.summary.pending_count}</strong>
            <small>{formatCurrency(inbox.summary.pending_amount_cents)}</small>
          </article>
          <article>
            <span>Importados</span>
            <strong>{inbox.summary.imported_jobs_count}</strong>
            <small>jobs recentes</small>
          </article>
          <article>
            <span>Stale</span>
            <strong>{inbox.summary.stale_count}</strong>
            <small>há mais de 3 dias</small>
          </article>
          <article>
            <span>Cobertura</span>
            <strong>{inbox.summary.pending_count > 0 ? Math.round((inbox.summary.with_suggestion_count / inbox.summary.pending_count) * 100) : 100}%</strong>
            <small>{inbox.summary.with_suggestion_count} com sugestão</small>
          </article>
        </div>

        <div className="finance-statement-inbox__insights">
          {inbox.insights.map((insight) => (
            <article key={insight.id} className={`finance-statement-inbox__insight finance-statement-inbox__insight--${insight.tone}`}>
              <span>{insight.label}</span>
              <strong>{insight.value}</strong>
            </article>
          ))}
        </div>

        <div className="finance-statement-inbox__bucket-switcher" role="tablist" aria-label="Recorte da inbox">
          {inbox.buckets.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              role="tab"
              aria-selected={bucket.key === activeBucket}
              className={bucket.key === activeBucket ? 'is-active' : ''}
              onClick={() => setActiveBucket(bucket.key)}
            >
              <span>{bucket.label}</span>
              <strong>{bucket.count}</strong>
            </button>
          ))}
        </div>

        <div className="finance-statement-inbox__section-head">
          <div>
            <strong>{activeSection?.label ?? 'Fila'}</strong>
            <p>{activeSection ? formatCurrency(activeSection.amount_cents) : formatCurrency(0)} em leitura prioritária</p>
          </div>
          <span>{activeSection?.count ?? 0} item(ns)</span>
        </div>

        <div className="finance-statement-inbox__list">
          {!activeSection || activeSection.entries.length === 0 ? (
            <p className="finance-statement-inbox__empty">Nenhuma pendência de conciliação nesta janela.</p>
          ) : (
            activeSection.entries.map((entry) => (
              <article key={entry.id} className="finance-statement-inbox__item">
                <div className="finance-statement-inbox__item-head">
                  <div>
                    <strong>{entry.description}</strong>
                    <p>
                      {entry.financial_account_name ?? 'Conta não identificada'} • {formatDate(entry.posted_at ?? entry.statement_date)}
                    </p>
                  </div>
                  <strong>{formatCurrency(entry.amount_cents)}</strong>
                </div>
                <div className="finance-statement-inbox__item-meta">
                  <span>{entry.suggestion_count} sugestão(ões)</span>
                  <span>{entry.age_days} dia(s) em fila</span>
                  <span>Saldo extrato: {entry.balance_cents == null ? '-' : formatCurrency(entry.balance_cents)}</span>
                </div>
                <div className="finance-statement-inbox__suggestions">
                  {entry.suggested_matches.length === 0 ? (
                    <span className="finance-statement-inbox__pill finance-statement-inbox__pill--muted">
                      Sem match sugerido
                    </span>
                  ) : (
                    entry.suggested_matches.map((suggestion) => (
                      <div key={suggestion.financial_transaction_id} className="finance-statement-inbox__suggestion">
                        <div>
                          <strong>{suggestion.description}</strong>
                          <p>
                            {suggestion.financial_entity_name ?? 'Sem entidade'} • vencimento {formatDate(suggestion.due_date)}
                          </p>
                        </div>
                        <span className="finance-statement-inbox__pill">
                          {Math.round(suggestion.confidence_score * 100)}%
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
