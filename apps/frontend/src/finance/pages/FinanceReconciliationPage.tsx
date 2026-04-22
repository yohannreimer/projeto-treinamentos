import { useEffect, useMemo, useState } from 'react';
import { financeApi, type FinanceReconciliationInbox } from '../api';
import { FinanceStatementInbox } from '../components/FinanceStatementInbox';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

export function FinanceReconciliationPage() {
  const [inbox, setInbox] = useState<FinanceReconciliationInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    financeApi.getReconciliationInbox()
      .then((payload) => {
        if (cancelled) return;
        setInbox(payload);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError((loadError as Error).message || 'Falha ao carregar a inbox de conciliação.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestionRows = useMemo(() => (
    inbox?.inbox.flatMap((entry) =>
      entry.suggested_matches.map((suggestion) => ({
        entry_id: entry.id,
        entry_description: entry.description,
        entry_amount_cents: entry.amount_cents,
        statement_date: entry.posted_at ?? entry.statement_date,
        ...suggestion
      }))
    ) ?? []
  ), [inbox]);

  const coveragePercentage = useMemo(() => {
    if (!inbox || inbox.summary.pending_count === 0) {
      return 100;
    }
    return Math.round((inbox.summary.with_suggestion_count / inbox.summary.pending_count) * 100);
  }, [inbox]);

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Conciliação
          </small>
          <h1>Inbox operacional de extratos</h1>
          <p>
            Leitura contínua das pendências bancárias da organização, com sugestões de match e rastreio dos arquivos importados.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="panel">
          <div className="panel-content">
            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Carregando painel de conciliação...</p>
          </div>
        </div>
      ) : error ? (
        <div className="panel">
          <div className="panel-content">
            <p style={{ margin: 0, color: '#9f3a38' }}>{error}</p>
          </div>
        </div>
      ) : inbox ? (
        <div className="finance-reconciliation-layout">
          <div className="finance-reconciliation-main">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Radar da fila</h2>
                  <p className="finance-reconciliation-panel__copy">
                    Leitura rápida da pressão operacional antes de abrir cada item da inbox.
                  </p>
                </div>
              </div>
              <div className="panel-content finance-reconciliation-panel__content">
                <div className="finance-reconciliation-radar">
                  <article>
                    <span>Na fila</span>
                    <strong>{inbox.summary.pending_count}</strong>
                    <small>{formatCurrency(inbox.summary.pending_amount_cents)}</small>
                  </article>
                  <article>
                    <span>Match hoje</span>
                    <strong>{inbox.summary.matched_today_count}</strong>
                    <small>baixas revisadas no dia</small>
                  </article>
                  <article>
                    <span>Cobertura</span>
                    <strong>{coveragePercentage}%</strong>
                    <small>{inbox.summary.with_suggestion_count} itens com sugestão</small>
                  </article>
                  <article>
                    <span>Sem sugestão</span>
                    <strong>{inbox.summary.without_suggestion_count}</strong>
                    <small>pedem revisão manual</small>
                  </article>
                </div>
              </div>
            </section>

            <FinanceStatementInbox inbox={inbox} />
          </div>

          <div className="finance-reconciliation-side">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Sugestões de match</h2>
                  <p className="finance-reconciliation-panel__copy">
                    Candidatos mais prováveis para acelerar a baixa dos itens na fila.
                  </p>
                </div>
              </div>
              <div className="panel-content finance-reconciliation-panel__content">
                {suggestionRows.length === 0 ? (
                  <p className="finance-reconciliation-panel__empty">Nenhuma sugestão disponível no momento.</p>
                ) : (
                  suggestionRows.map((row) => (
                    <article key={`${row.entry_id}-${row.financial_transaction_id}`} className="finance-reconciliation-suggestion-card">
                      <div className="finance-reconciliation-suggestion-card__head">
                        <strong>{row.description}</strong>
                        <span>{Math.round(row.confidence_score * 100)}%</span>
                      </div>
                      <p>
                        Extrato: {row.entry_description} • {formatDate(row.statement_date)}
                      </p>
                      <div className="finance-reconciliation-suggestion-card__meta">
                        <span>{row.financial_entity_name ?? 'Sem entidade'}</span>
                        <span>{formatCurrency(row.amount_cents)}</span>
                        <span>Vencimento {formatDate(row.due_date)}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Extratos importados</h2>
                  <p className="finance-reconciliation-panel__copy">
                    Últimos jobs processados para rastreabilidade e contexto da fila.
                  </p>
                </div>
              </div>
              <div className="panel-content finance-reconciliation-panel__content">
                {inbox.imported_jobs.length === 0 ? (
                  <p className="finance-reconciliation-panel__empty">Nenhum extrato importado ainda.</p>
                ) : (
                  inbox.imported_jobs.map((job) => (
                    <article key={job.id} className="finance-reconciliation-job-card">
                      <div className="finance-reconciliation-job-card__head">
                        <strong>{job.source_file_name}</strong>
                        <span>{job.status}</span>
                      </div>
                      <p>{job.import_type.toUpperCase()} • {job.processed_rows}/{job.total_rows} linhas processadas</p>
                      <small>
                        Finalizado em {formatDate(job.finished_at?.slice(0, 10) ?? job.updated_at.slice(0, 10))}
                      </small>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Matches recentes</h2>
                  <p className="finance-reconciliation-panel__copy">
                    Últimas conciliações aprovadas para manter rastreabilidade da operação.
                  </p>
                </div>
              </div>
              <div className="panel-content finance-reconciliation-panel__content">
                {inbox.recent_matches.length === 0 ? (
                  <p className="finance-reconciliation-panel__empty">Nenhuma conciliação recente disponível.</p>
                ) : (
                  inbox.recent_matches.map((match) => (
                    <article key={match.id} className="finance-reconciliation-job-card">
                      <div className="finance-reconciliation-job-card__head">
                        <strong>{match.source === 'manual' ? 'Conciliação manual' : match.source}</strong>
                        <span>{match.match_status}</span>
                      </div>
                      <p>Transação vinculada: {match.financial_transaction_id ?? 'Sem transação'}</p>
                      <small>
                        Revisado em {formatDate(match.reviewed_at?.slice(0, 10) ?? match.created_at.slice(0, 10))}
                      </small>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </section>
  );
}
