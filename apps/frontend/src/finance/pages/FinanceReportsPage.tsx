import { useEffect, useMemo, useState } from 'react';
import {
  financeApi,
  type FinanceAgingRow,
  type FinanceCategoryBreakdownRow,
  type FinanceConsolidatedCashflowRow,
  type FinanceReportComparisonRow,
  type FinanceReports
} from '../api';
import { FinanceReportCard } from '../components/FinanceReportCard';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric'
  });
}

function SummaryStat(props: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'positive' | 'warning';
}) {
  const tone = props.tone ?? 'default';
  const styles = {
    default: {
      border: '1px solid rgba(18, 31, 53, 0.10)',
      background: 'rgba(255,255,255,0.94)'
    },
    positive: {
      border: '1px solid rgba(46, 125, 50, 0.14)',
      background: 'linear-gradient(180deg, rgba(240,249,242,0.95), rgba(255,255,255,0.96))'
    },
    warning: {
      border: '1px solid rgba(180, 110, 0, 0.18)',
      background: 'linear-gradient(180deg, rgba(255,248,233,0.96), rgba(255,255,255,0.96))'
    }
  } as const;

  return (
    <article style={{ borderRadius: '18px', padding: '18px', display: 'grid', gap: '8px', ...styles[tone] }}>
      <span style={{ fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 700 }}>
        {props.label}
      </span>
      <strong style={{ fontSize: '1.5rem', lineHeight: 1.08 }}>{props.value}</strong>
      <span style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>{props.detail}</span>
    </article>
  );
}

function ComparisonTable(props: { rows: FinanceReportComparisonRow[] }) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {props.rows.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Sem períodos rastreados no momento.</p>
      ) : (
        props.rows.map((row) => (
          <article
            key={row.period}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 1fr) repeat(3, minmax(120px, 1fr))',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '16px',
              border: '1px solid rgba(18, 31, 53, 0.08)',
              background: 'rgba(255, 255, 255, 0.9)'
            }}
          >
            <strong>{formatPeriod(row.period)}</strong>
            <span>Realizado {formatCurrency(row.realized_cents)}</span>
            <span>Projetado {formatCurrency(row.projected_cents)}</span>
            <span>Variação {formatCurrency(row.variance_cents)}</span>
          </article>
        ))
      )}
    </div>
  );
}

function CategoryList(props: {
  rows: FinanceCategoryBreakdownRow[];
  emptyMessage: string;
}) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {props.rows.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{props.emptyMessage}</p>
      ) : (
        props.rows.map((row) => (
          <article
            key={row.category_name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '16px',
              border: '1px solid rgba(18, 31, 53, 0.08)',
              background: 'rgba(255, 255, 255, 0.9)'
            }}
          >
            <div style={{ display: 'grid', gap: '4px' }}>
              <strong>{row.category_name}</strong>
              <span style={{ color: 'var(--ink-soft)', fontSize: '0.88rem' }}>{row.transaction_count} movimentação(ões)</span>
            </div>
            <strong>{formatCurrency(row.amount_cents)}</strong>
          </article>
        ))
      )}
    </div>
  );
}

function AgingList(props: {
  rows: FinanceAgingRow[];
  emptyMessage: string;
}) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {props.rows.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{props.emptyMessage}</p>
      ) : (
        props.rows.map((row) => (
          <article
            key={`${row.entity_name}-${row.description}-${row.due_date ?? 'sem-data'}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '16px',
              border: '1px solid rgba(18, 31, 53, 0.08)',
              background: 'rgba(255, 255, 255, 0.9)'
            }}
          >
            <div style={{ display: 'grid', gap: '4px' }}>
              <strong>{row.entity_name}</strong>
              <span style={{ color: 'var(--ink-soft)', fontSize: '0.88rem' }}>{row.description}</span>
              <span style={{ color: 'var(--ink-soft)', fontSize: '0.84rem' }}>Vencimento {formatDate(row.due_date)}</span>
            </div>
            <strong>{formatCurrency(row.amount_cents)}</strong>
          </article>
        ))
      )}
    </div>
  );
}

function CashflowList(props: { rows: FinanceConsolidatedCashflowRow[] }) {
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {props.rows.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Sem fluxo consolidado disponível.</p>
      ) : (
        props.rows.map((row) => (
          <article
            key={row.period}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(100px, 1fr) repeat(3, minmax(120px, 1fr))',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '16px',
              border: '1px solid rgba(18, 31, 53, 0.08)',
              background: 'rgba(255, 255, 255, 0.9)'
            }}
          >
            <strong>{formatPeriod(row.period)}</strong>
            <span>Entradas {formatCurrency(row.inflow_cents)}</span>
            <span>Saídas {formatCurrency(row.outflow_cents)}</span>
            <span>Saldo {formatCurrency(row.balance_cents)}</span>
          </article>
        ))
      )}
    </div>
  );
}

export function FinanceReportsPage() {
  const [reports, setReports] = useState<FinanceReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');

    financeApi.getReports()
      .then((payload) => {
        if (cancelled) return;
        setReports(payload);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError((loadError as Error).message || 'Falha ao carregar relatórios.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    if (!reports) {
      return null;
    }

    const overdueReceivables = reports.overdue_receivables.reduce((sum, row) => sum + row.amount_cents, 0);
    const overduePayables = reports.overdue_payables.reduce((sum, row) => sum + row.amount_cents, 0);

    return {
      overdueReceivables,
      overduePayables,
      projectedPeriods: reports.realized_vs_projected.length,
      consolidatedPeriods: reports.consolidated_cashflow.length
    };
  }, [reports]);

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Relatórios
          </small>
          <h1>Leituras gerenciais</h1>
          <p>DRE gerencial, comparativos e análises derivadas do ledger financeiro da empresa logada.</p>
        </div>
      </header>

      {loading ? (
        <section className="panel">
          <div className="panel-content">
            <div className="finance-empty-state">Carregando relatórios gerenciais...</div>
          </div>
        </section>
      ) : error ? (
        <section className="panel">
          <div className="panel-content">
            <div className="finance-inline-error">{error}</div>
          </div>
        </section>
      ) : reports && summary ? (
        <div style={{ display: 'grid', gap: '18px' }}>
          <section className="panel">
            <div className="panel-header">
              <small style={{ color: '#b4442f', fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Camada gerencial
              </small>
              <h2>Visão executiva dos relatórios</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', maxWidth: '64ch' }}>
                Base derivada do ledger, do contas a pagar/receber e do fluxo consolidado para leitura confiável.
              </p>
            </div>
            <div className="panel-content">
              <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <SummaryStat label="Receita líquida" value={formatCurrency(reports.dre.net_revenue_cents)} detail="após deduções do período lido" tone="positive" />
                <SummaryStat label="Despesas operacionais" value={formatCurrency(reports.dre.operating_expenses_cents)} detail="pressão operacional consolidada" tone="warning" />
                <SummaryStat label="Resultado operacional" value={formatCurrency(reports.dre.operating_result_cents)} detail="resultado base do DRE gerencial" tone={reports.dre.operating_result_cents >= 0 ? 'positive' : 'warning'} />
                <SummaryStat label="Recebíveis vencidos" value={formatCurrency(summary.overdueReceivables)} detail={`${reports.overdue_receivables.length} item(ns) em atraso`} />
                <SummaryStat label="Pagáveis vencidos" value={formatCurrency(summary.overduePayables)} detail={`${reports.overdue_payables.length} obrigação(ões) fora do prazo`} />
                <SummaryStat label="Períodos rastreados" value={String(summary.projectedPeriods)} detail={`${summary.consolidatedPeriods} janela(s) no fluxo consolidado`} />
              </div>
            </div>
          </section>

          <div className="finance-report-list">
            <FinanceReportCard
              title="DRE gerencial"
              description="Leitura resumida de receita, despesa e resultado, com cara de relatório executivo e sem ruído operacional."
              eyebrow="Relatório principal"
              emphasis="primary"
            >
              <div style={{ display: 'grid', gap: '10px' }}>
                <article style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>Receita bruta</span>
                  <strong>{formatCurrency(reports.dre.gross_revenue_cents)}</strong>
                </article>
                <article style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>Deduções</span>
                  <strong>{formatCurrency(reports.dre.deductions_cents)}</strong>
                </article>
                <article style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>Receita líquida</span>
                  <strong>{formatCurrency(reports.dre.net_revenue_cents)}</strong>
                </article>
                <article style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>Despesas operacionais</span>
                  <strong>{formatCurrency(reports.dre.operating_expenses_cents)}</strong>
                </article>
                <article style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', paddingTop: '10px', borderTop: '1px solid rgba(18, 31, 53, 0.08)' }}>
                  <span>Resultado operacional</span>
                  <strong>{formatCurrency(reports.dre.operating_result_cents)}</strong>
                </article>
              </div>
            </FinanceReportCard>

            <FinanceReportCard
              title="Realizado vs projetado"
              description="Compara o que já virou número confirmado com a trilha ainda projetada por período."
              eyebrow="Controle gerencial"
            >
              <ComparisonTable rows={reports.realized_vs_projected} />
            </FinanceReportCard>

            <FinanceReportCard
              title="Receitas por categoria"
              description="Mostra a composição das entradas por natureza financeira."
              eyebrow="Composição"
            >
              <CategoryList rows={reports.income_by_category} emptyMessage="Sem receitas categorizadas no período." />
            </FinanceReportCard>

            <FinanceReportCard
              title="Despesas por categoria"
              description="Expõe onde a operação está consumindo mais caixa e competência."
              eyebrow="Composição"
            >
              <CategoryList rows={reports.expense_by_category} emptyMessage="Sem despesas categorizadas no período." />
            </FinanceReportCard>

            <FinanceReportCard
              title="Contas a receber vencidas"
              description="Aging operacional dos títulos em atraso, com leitura pronta para cobrança."
              eyebrow="Aging"
            >
              <AgingList rows={reports.overdue_receivables} emptyMessage="Nenhum recebível vencido no momento." />
            </FinanceReportCard>

            <FinanceReportCard
              title="Contas a pagar vencidas"
              description="Fila crítica de obrigações vencidas para evitar ruído operacional e risco financeiro."
              eyebrow="Aging"
            >
              <AgingList rows={reports.overdue_payables} emptyMessage="Nenhuma obrigação vencida no momento." />
            </FinanceReportCard>

            <FinanceReportCard
              title="Fluxo consolidado por período"
              description="Consolida entradas, saídas e saldo acumulado em uma leitura mais executiva do tempo."
              eyebrow="Fluxo"
            >
              <CashflowList rows={reports.consolidated_cashflow} />
            </FinanceReportCard>
          </div>
        </div>
      ) : null}
    </section>
  );
}
