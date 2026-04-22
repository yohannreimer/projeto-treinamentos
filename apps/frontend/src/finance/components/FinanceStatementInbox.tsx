import { useEffect, useMemo, useState } from 'react';
import type { FinanceReconciliationBucketKey, FinanceReconciliationInbox } from '../api';
import { FinanceBadge, FinanceEmptyState, FinanceMono, FinancePanel, FinanceStatusPill } from './FinancePrimitives';

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
    <FinancePanel className="finance-statement-inbox" title="Pendências de conciliação" description="Inbox operacional com extratos sem match, priorizados para leitura e ação.">
      <div className="finance-statement-inbox__content">
        <div className="finance-statement-inbox__summary">
          <article>
            <span>Na fila</span>
            <strong><FinanceMono>{inbox.summary.pending_count}</FinanceMono></strong>
            <small><FinanceMono>{formatCurrency(inbox.summary.pending_amount_cents)}</FinanceMono></small>
          </article>
          <article>
            <span>Importados</span>
            <strong><FinanceMono>{inbox.summary.imported_jobs_count}</FinanceMono></strong>
            <small>jobs recentes</small>
          </article>
          <article>
            <span>Stale</span>
            <strong><FinanceMono>{inbox.summary.stale_count}</FinanceMono></strong>
            <small>há mais de 3 dias</small>
          </article>
          <article>
            <span>Cobertura</span>
            <strong><FinanceMono>{inbox.summary.pending_count > 0 ? Math.round((inbox.summary.with_suggestion_count / inbox.summary.pending_count) * 100) : 100}%</FinanceMono></strong>
            <small>{inbox.summary.with_suggestion_count} com sugestão</small>
          </article>
        </div>

        <div className="finance-statement-inbox__insights">
          {inbox.insights.map((insight) => (
            <article key={insight.id} className={`finance-statement-inbox__insight finance-statement-inbox__insight--${insight.tone}`}>
              <span>{insight.label}</span>
              <strong><FinanceMono>{insight.value}</FinanceMono></strong>
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
              <strong><FinanceMono>{bucket.count}</FinanceMono></strong>
            </button>
          ))}
        </div>

        <div className="finance-statement-inbox__section-head">
          <div>
            <strong>{activeSection?.label ?? 'Fila'}</strong>
            <p>
              <FinanceMono>{activeSection ? formatCurrency(activeSection.amount_cents) : formatCurrency(0)}</FinanceMono>
              {' '}em leitura prioritária
            </p>
          </div>
          <span><FinanceMono>{activeSection?.count ?? 0}</FinanceMono> item(ns)</span>
        </div>

        <div className="finance-statement-inbox__list">
          {!activeSection || activeSection.entries.length === 0 ? (
            <FinanceEmptyState title="Nenhuma pendência de conciliação nesta janela." />
          ) : (
            activeSection.entries.map((entry) => (
              <article key={entry.id} className="finance-statement-inbox__item">
                  <div className="finance-statement-inbox__item-head">
                    <div>
                      <strong>{entry.description}</strong>
                      <p>
                        {entry.financial_account_name ?? 'Conta não identificada'} • <FinanceMono>{formatDate(entry.posted_at ?? entry.statement_date)}</FinanceMono>
                      </p>
                    </div>
                  <strong><FinanceMono>{formatCurrency(entry.amount_cents)}</FinanceMono></strong>
                </div>
                <div className="finance-statement-inbox__item-meta">
                  <span>{entry.suggestion_count} sugestão(ões)</span>
                  <span>{entry.age_days} dia(s) em fila</span>
                  <span>Saldo extrato: {entry.balance_cents == null ? '-' : <FinanceMono>{formatCurrency(entry.balance_cents)}</FinanceMono>}</span>
                </div>
                <div className="finance-statement-inbox__suggestions">
                  {entry.suggested_matches.length === 0 ? (
                    <FinanceStatusPill tone="neutral">Sem match sugerido</FinanceStatusPill>
                  ) : (
                    entry.suggested_matches.map((suggestion) => (
                      <div key={suggestion.financial_transaction_id} className="finance-statement-inbox__suggestion">
                        <div>
                          <strong>{suggestion.description}</strong>
                          <p>
                            {suggestion.financial_entity_name ?? 'Sem entidade'} • vencimento <FinanceMono>{formatDate(suggestion.due_date)}</FinanceMono>
                          </p>
                        </div>
                        <FinanceBadge tone="success"><FinanceMono>{Math.round(suggestion.confidence_score * 100)}%</FinanceMono></FinanceBadge>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </FinancePanel>
  );
}
