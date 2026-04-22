import { useEffect, useMemo, useState } from 'react';
import { financeApi, type FinanceReconciliationInbox } from '../api';
import { FinanceStatementInbox } from '../components/FinanceStatementInbox';
import { FinanceEmptyState, FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader, FinancePanel } from '../components/FinancePrimitives';

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
      <FinancePageHeader
        eyebrow="Conciliação"
        title="Inbox operacional de extratos"
        description="Leitura contínua das pendências bancárias da organização, com sugestões de match e rastreio dos arquivos importados."
      />

      {loading ? (
        <FinanceLoadingState title="Carregando painel de conciliação..." />
      ) : error ? (
        <FinanceErrorState title="Falha ao carregar a inbox de conciliação." description={error} />
      ) : inbox ? (
        <div className="finance-reconciliation-layout">
          <div className="finance-reconciliation-main">
            <FinancePanel title="Radar da fila" description="Leitura rápida da pressão operacional antes de abrir cada item da inbox." eyebrow="Leitura operacional">
                <div className="finance-reconciliation-radar">
                  <article>
                    <span>Na fila</span>
                    <strong><FinanceMono>{inbox.summary.pending_count}</FinanceMono></strong>
                    <small><FinanceMono>{formatCurrency(inbox.summary.pending_amount_cents)}</FinanceMono></small>
                  </article>
                  <article>
                    <span>Match hoje</span>
                    <strong><FinanceMono>{inbox.summary.matched_today_count}</FinanceMono></strong>
                    <small>baixas revisadas no dia</small>
                  </article>
                  <article>
                    <span>Cobertura</span>
                    <strong><FinanceMono>{coveragePercentage}%</FinanceMono></strong>
                    <small><FinanceMono>{inbox.summary.with_suggestion_count}</FinanceMono> itens com sugestão</small>
                  </article>
                  <article>
                    <span>Sem sugestão</span>
                    <strong><FinanceMono>{inbox.summary.without_suggestion_count}</FinanceMono></strong>
                    <small>pedem revisão manual</small>
                  </article>
                </div>
            </FinancePanel>

            <FinanceStatementInbox inbox={inbox} />
          </div>

          <div className="finance-reconciliation-side">
            <FinancePanel title="Sugestões de match" description="Candidatos mais prováveis para acelerar a baixa dos itens na fila." eyebrow="Fila de leitura">
                {suggestionRows.length === 0 ? (
                  <FinanceEmptyState title="Nenhuma sugestão disponível no momento." />
                ) : (
                  suggestionRows.map((row) => (
                    <article key={`${row.entry_id}-${row.financial_transaction_id}`} className="finance-reconciliation-suggestion-card">
                      <div className="finance-reconciliation-suggestion-card__head">
                        <strong>{row.description}</strong>
                        <span><FinanceMono>{Math.round(row.confidence_score * 100)}%</FinanceMono></span>
                      </div>
                      <p>
                        Extrato: {row.entry_description} • <FinanceMono>{formatDate(row.statement_date)}</FinanceMono>
                      </p>
                      <div className="finance-reconciliation-suggestion-card__meta">
                        <span>{row.financial_entity_name ?? 'Sem entidade'}</span>
                        <span><FinanceMono>{formatCurrency(row.amount_cents)}</FinanceMono></span>
                        <span>Vencimento <FinanceMono>{formatDate(row.due_date)}</FinanceMono></span>
                      </div>
                    </article>
                  ))
                )}
            </FinancePanel>

            <FinancePanel title="Extratos importados" description="Últimos jobs processados para rastreabilidade e contexto da fila." eyebrow="Importação">
                {inbox.imported_jobs.length === 0 ? (
                  <FinanceEmptyState title="Nenhum extrato importado ainda." />
                ) : (
                  inbox.imported_jobs.map((job) => (
                    <article key={job.id} className="finance-reconciliation-job-card">
                      <div className="finance-reconciliation-job-card__head">
                        <strong>{job.source_file_name}</strong>
                        <span><FinanceMono>{job.status}</FinanceMono></span>
                      </div>
                      <p><FinanceMono>{job.import_type.toUpperCase()}</FinanceMono> • <FinanceMono>{job.processed_rows}</FinanceMono>/<FinanceMono>{job.total_rows}</FinanceMono> linhas processadas</p>
                      <small>
                        Finalizado em <FinanceMono>{formatDate(job.finished_at?.slice(0, 10) ?? job.updated_at.slice(0, 10))}</FinanceMono>
                      </small>
                    </article>
                  ))
                )}
            </FinancePanel>

            <FinancePanel title="Matches recentes" description="Últimas conciliações aprovadas para manter rastreabilidade da operação." eyebrow="Histórico">
                {inbox.recent_matches.length === 0 ? (
                  <FinanceEmptyState title="Nenhuma conciliação recente disponível." />
                ) : (
                  inbox.recent_matches.map((match) => (
                    <article key={match.id} className="finance-reconciliation-job-card">
                      <div className="finance-reconciliation-job-card__head">
                        <strong>{match.source === 'manual' ? 'Conciliação manual' : match.source}</strong>
                        <span><FinanceMono>{match.match_status}</FinanceMono></span>
                      </div>
                      <p>Transação vinculada: <FinanceMono>{match.financial_transaction_id ?? 'Sem transação'}</FinanceMono></p>
                      <small>
                        Revisado em <FinanceMono>{formatDate(match.reviewed_at?.slice(0, 10) ?? match.created_at.slice(0, 10))}</FinanceMono>
                      </small>
                    </article>
                  ))
                )}
            </FinancePanel>
          </div>
        </div>
      ) : null}
    </section>
  );
}
