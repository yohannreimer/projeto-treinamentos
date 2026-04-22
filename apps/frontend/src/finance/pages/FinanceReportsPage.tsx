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
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceKpiCard,
  FinanceLoadingState,
  FinanceMono,
  FinancePageHeader,
  FinancePanel,
  FinanceTableShell
} from '../components/FinancePrimitives';

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
  return (
    <FinanceKpiCard
      label={props.label}
      value={<FinanceMono>{props.value}</FinanceMono>}
      description={props.detail}
      tone={props.tone === 'positive' ? 'success' : props.tone === 'warning' ? 'warning' : 'neutral'}
      accentLabel="Gerencial"
    />
  );
}

function ComparisonTable(props: { rows: FinanceReportComparisonRow[] }) {
  return (
    <FinanceTableShell title="Realizado vs projetado" description="Compara o que já virou número confirmado com a trilha ainda projetada por período.">
      {props.rows.length === 0 ? (
        <FinanceEmptyState title="Sem períodos rastreados no momento." />
      ) : (
        <table aria-label="Realizado versus projetado">
          <thead>
            <tr>
              <th>Período</th>
              <th>Realizado</th>
              <th>Projetado</th>
              <th>Variação</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.period}>
                <td><FinanceMono>{formatPeriod(row.period)}</FinanceMono></td>
                <td><FinanceMono>{formatCurrency(row.realized_cents)}</FinanceMono></td>
                <td><FinanceMono>{formatCurrency(row.projected_cents)}</FinanceMono></td>
                <td><FinanceMono>{formatCurrency(row.variance_cents)}</FinanceMono></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </FinanceTableShell>
  );
}

function CategoryList(props: {
  rows: FinanceCategoryBreakdownRow[];
  emptyMessage: string;
}) {
  return (
    <div className="finance-list-stack">
      {props.rows.length === 0 ? (
        <FinanceEmptyState title={props.emptyMessage} />
      ) : (
        props.rows.map((row) => (
          <article key={row.category_name} className="finance-list-row">
            <div className="finance-list-row__copy">
              <strong>{row.category_name}</strong>
              <span><FinanceMono>{row.transaction_count}</FinanceMono> movimentação(ões)</span>
            </div>
            <strong><FinanceMono>{formatCurrency(row.amount_cents)}</FinanceMono></strong>
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
    <div className="finance-list-stack">
      {props.rows.length === 0 ? (
        <FinanceEmptyState title={props.emptyMessage} />
      ) : (
        props.rows.map((row) => (
          <article key={`${row.entity_name}-${row.description}-${row.due_date ?? 'sem-data'}`} className="finance-list-row">
            <div className="finance-list-row__copy">
              <strong>{row.entity_name}</strong>
              <span>{row.description}</span>
              <span>Vencimento <FinanceMono>{formatDate(row.due_date)}</FinanceMono></span>
            </div>
            <strong><FinanceMono>{formatCurrency(row.amount_cents)}</FinanceMono></strong>
          </article>
        ))
      )}
    </div>
  );
}

function CashflowList(props: { rows: FinanceConsolidatedCashflowRow[] }) {
  return (
    <FinanceTableShell title="Fluxo consolidado por período" description="Consolida entradas, saídas e saldo acumulado em uma leitura mais executiva do tempo.">
      {props.rows.length === 0 ? (
        <FinanceEmptyState title="Sem fluxo consolidado disponível." />
      ) : (
        <table aria-label="Fluxo consolidado por período">
          <thead>
            <tr>
              <th>Período</th>
              <th>Entradas</th>
              <th>Saídas</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.period}>
                <td><FinanceMono>{formatPeriod(row.period)}</FinanceMono></td>
                <td><FinanceMono>{formatCurrency(row.inflow_cents)}</FinanceMono></td>
                <td><FinanceMono>{formatCurrency(row.outflow_cents)}</FinanceMono></td>
                <td><FinanceMono>{formatCurrency(row.balance_cents)}</FinanceMono></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </FinanceTableShell>
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
      <FinancePageHeader
        eyebrow="Relatórios"
        title="Leituras gerenciais"
        description="DRE gerencial, comparativos e análises derivadas do ledger financeiro da empresa logada."
      />

      {loading ? (
        <FinanceLoadingState title="Carregando relatórios gerenciais..." />
      ) : error ? (
        <FinanceErrorState title="Falha ao carregar relatórios." description={error} />
      ) : reports && summary ? (
        <div className="finance-report-stack">
          <FinancePanel eyebrow="Camada gerencial" title="Visão executiva dos relatórios" description="Base derivada do ledger, do contas a pagar/receber e do fluxo consolidado para leitura confiável.">
            <div className="finance-kpi-grid finance-kpi-grid--three">
                <SummaryStat label="Receita líquida" value={formatCurrency(reports.dre.net_revenue_cents)} detail="após deduções do período lido" tone="positive" />
                <SummaryStat label="Despesas operacionais" value={formatCurrency(reports.dre.operating_expenses_cents)} detail="pressão operacional consolidada" tone="warning" />
                <SummaryStat label="Resultado operacional" value={formatCurrency(reports.dre.operating_result_cents)} detail="resultado base do DRE gerencial" tone={reports.dre.operating_result_cents >= 0 ? 'positive' : 'warning'} />
                <SummaryStat label="Recebíveis vencidos" value={formatCurrency(summary.overdueReceivables)} detail={`${reports.overdue_receivables.length} item(ns) em atraso`} />
                <SummaryStat label="Pagáveis vencidos" value={formatCurrency(summary.overduePayables)} detail={`${reports.overdue_payables.length} obrigação(ões) fora do prazo`} />
                <SummaryStat label="Períodos rastreados" value={String(summary.projectedPeriods)} detail={`${summary.consolidatedPeriods} janela(s) no fluxo consolidado`} />
            </div>
          </FinancePanel>

          <div className="finance-report-list">
            <FinanceReportCard
              title="DRE gerencial"
              description="Leitura resumida de receita, despesa e resultado, com cara de relatório executivo e sem ruído operacional."
              eyebrow="Relatório principal"
              emphasis="primary"
            >
              <div className="finance-report-metrics">
                <article className="finance-report-metric-row">
                  <span>Receita bruta</span>
                  <strong><FinanceMono>{formatCurrency(reports.dre.gross_revenue_cents)}</FinanceMono></strong>
                </article>
                <article className="finance-report-metric-row">
                  <span>Deduções</span>
                  <strong><FinanceMono>{formatCurrency(reports.dre.deductions_cents)}</FinanceMono></strong>
                </article>
                <article className="finance-report-metric-row">
                  <span>Receita líquida</span>
                  <strong><FinanceMono>{formatCurrency(reports.dre.net_revenue_cents)}</FinanceMono></strong>
                </article>
                <article className="finance-report-metric-row">
                  <span>Despesas operacionais</span>
                  <strong><FinanceMono>{formatCurrency(reports.dre.operating_expenses_cents)}</FinanceMono></strong>
                </article>
                <article className="finance-report-metric-row finance-report-metric-row--total">
                  <span>Resultado operacional</span>
                  <strong><FinanceMono>{formatCurrency(reports.dre.operating_result_cents)}</FinanceMono></strong>
                </article>
              </div>
            </FinanceReportCard>

            <ComparisonTable rows={reports.realized_vs_projected} />

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

            <CashflowList rows={reports.consolidated_cashflow} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
