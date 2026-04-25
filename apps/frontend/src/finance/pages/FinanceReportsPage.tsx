import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  financeApi,
  type FinanceAgingRow,
  type FinanceCashflowBasisRow,
  type FinanceCategoryBreakdownRow,
  type FinanceConsolidatedCashflowRow,
  type FinanceCostCenterResultRow,
  type FinanceDrePeriodRow,
  type FinanceReportComparisonRow,
  type FinanceReports
} from '../api';
import { FinanceErrorState, FinancePageHeader } from '../components/FinancePrimitives';
import { resolveFinancePeriodWindow, type FinancePeriodState } from '../hooks/useFinancePeriod';

type ReportId = 'dre' | 'dre_cash' | 'dre_period' | 'dre_cash_period' | 'cost_centers' | 'realized' | 'rec_cats' | 'exp_cats' | 'aging_rec' | 'aging_pay' | 'cashflow' | 'cashflow_basis';

const REPORTS: Array<{ id: ReportId; label: string; desc: string }> = [
  { id: 'dre', label: 'DRE por competência', desc: 'Resultado pelo mês contábil' },
  { id: 'dre_cash', label: 'DRE por caixa', desc: 'Resultado pelas baixas efetivas' },
  { id: 'dre_period', label: 'Competência por mês', desc: 'Evolução mensal por competência' },
  { id: 'dre_cash_period', label: 'Caixa por mês', desc: 'Evolução mensal por baixa' },
  { id: 'cost_centers', label: 'Centros de custo', desc: 'Resultado por área operacional' },
  { id: 'realized', label: 'Realizado vs Projetado', desc: 'Comparativo por período' },
  { id: 'rec_cats', label: 'Receitas por categoria', desc: 'Breakdown de entradas' },
  { id: 'exp_cats', label: 'Despesas por categoria', desc: 'Breakdown de saídas' },
  { id: 'aging_rec', label: 'Rec. a receber vencidos', desc: 'Aging de recebíveis' },
  { id: 'aging_pay', label: 'Pag. a pagar vencidos', desc: 'Aging de pagáveis' },
  { id: 'cashflow', label: 'Fluxo consolidado', desc: 'Entradas, saídas e saldo por período' },
  { id: 'cashflow_basis', label: 'Caixa vencimento/baixa', desc: 'Fluxo comparando vencimento e liquidação' }
];

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

const MONTHS_SHORT_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const REPORTS_DEFAULT_PERIOD: FinancePeriodState = { preset: 'month', from: '', to: '' };

function monthRangeFromOffset(offset: number) {
  const base = new Date();
  base.setMonth(base.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = new Date(year, month + 1, 0);
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  return {
    label: `${MONTHS_SHORT_PT[month]}/${String(year).slice(-2)}`,
    from,
    to
  };
}

function previousRange(from: string | null, to: string | null) {
  if (!from || !to) {
    return monthRangeFromOffset(-1);
  }

  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return monthRangeFromOffset(-1);
  }

  const spanDays = Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000));
  const nextToDate = new Date(fromDate);
  nextToDate.setDate(nextToDate.getDate() - 1);
  const nextFromDate = new Date(nextToDate);
  nextFromDate.setDate(nextFromDate.getDate() - spanDays);
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    label: 'Período anterior',
    from: format(nextFromDate),
    to: format(nextToDate)
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('pt-BR');
}

function formatMonthYear(iso?: string | null): string {
  if (!iso) return 'Competência consolidada';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Competência consolidada';
  return `Atualizado em ${MONTHS_PT[date.getMonth()]} ${date.getFullYear()}`;
}

function formatCompactPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return `${MONTHS_SHORT_PT[month - 1]}/${String(year).slice(-2)}`;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 }}>{children}</h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{text}</div>;
}

function MiniProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ background: '#e2e8f0', borderRadius: 4, height: 5, width: '100%' }}>
      <div style={{ background: color, width: `${Math.min(100, (value / (max || 1)) * 100)}%`, height: '100%', borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

function DrillLink({ to, children = 'Detalhar' }: { to: string; children?: string }) {
  return (
    <Link
      to={to}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 24,
        borderRadius: 7,
        border: '1px solid #e2e8f0',
        padding: '0 8px',
        fontSize: 11,
        fontWeight: 700,
        color: '#2563eb',
        textDecoration: 'none',
        background: '#f8fafc'
      }}
    >
      {children}
    </Link>
  );
}

function transactionDrill(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const queryString = query.toString();
  return `/financeiro/transactions${queryString ? `?${queryString}` : ''}`;
}

function formatReportRows(reports: FinanceReports, dre: FinanceReports['dre'], includeCategoryRows = true) {
  const expenseRows = includeCategoryRows ? reports.expense_by_category.slice(0, 3) : [];
  return [
    { label: 'Receita Bruta', value: dre.gross_revenue_cents, type: 'positive' as const, indent: 0, href: transactionDrill({ kind: 'income' }) },
    { label: 'Deduções e impostos', value: -dre.deductions_cents, type: 'negative' as const, indent: 1 },
    { label: 'Receita Líquida', value: dre.net_revenue_cents, type: 'subtotal' as const, indent: 0, href: transactionDrill({ kind: 'income' }) },
    ...expenseRows.map((row) => ({
      label: row.category_name,
      value: -row.amount_cents,
      type: 'negative' as const,
      indent: 1,
      href: transactionDrill({ kind: 'expense', search: row.category_name })
    })),
    { label: 'Despesas Operacionais', value: -dre.operating_expenses_cents, type: 'subtotal' as const, indent: 0, href: transactionDrill({ kind: 'expense' }) },
    { label: 'Resultado Operacional', value: dre.operating_result_cents, type: 'total' as const, indent: 0 }
  ];
}

function signedCurrency(value: number) {
  return value < 0 ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value);
}

function renderDreTable(rows: ReturnType<typeof formatReportRows>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={`${row.label}-${index}`}
            style={{
              borderBottom: '1px solid #f1f5f9',
              background: row.type === 'total' ? '#f0f7ff' : row.type === 'subtotal' ? '#f8fafc' : 'white'
            }}
          >
            <td style={{ padding: `9px ${10 + row.indent * 20}px`, fontSize: 13, fontWeight: row.type !== 'positive' && row.type !== 'negative' ? 700 : 400, color: '#0f172a' }}>{row.label}</td>
            <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: row.type !== 'positive' && row.type !== 'negative' ? 700 : 400, fontFamily: "'DM Mono', monospace", color: row.value >= 0 ? row.type === 'total' ? '#2563eb' : '#059669' : '#ef4444' }}>
              {row.value < 0 ? `(${formatCurrency(Math.abs(row.value))})` : formatCurrency(row.value)}
            </td>
            <td style={{ padding: '9px 14px', textAlign: 'right' }}>
              {'href' in row && row.href ? <DrillLink to={row.href}>Abrir</DrillLink> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FinanceReportsPage() {
  const [period, setPeriod] = useState<FinancePeriodState>(REPORTS_DEFAULT_PERIOD);
  const [reports, setReports] = useState<FinanceReports | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openReport, setOpenReport] = useState<ReportId>('dre');
  const apiFilters = useMemo(() => ({
    preset: period.preset,
    from: period.preset === 'custom' ? period.from || null : null,
    to: period.preset === 'custom' ? period.to || null : null
  }), [period]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');

    financeApi.getReports(apiFilters)
      .then((payload) => {
        if (!cancelled) {
          setReports(payload);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar relatórios.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiFilters]);

  const executiveKpis = useMemo(() => {
    if (!reports) {
      return [] as Array<{ label: string; value: string; color: string }>;
    }

    const overdueReceivables = reports.overdue_receivables.reduce((sum, row) => sum + row.amount_cents, 0);
    const overduePayables = reports.overdue_payables.reduce((sum, row) => sum + row.amount_cents, 0);

    return [
      { label: 'Receita Líquida', value: formatCurrency(reports.dre.net_revenue_cents), color: '#059669' },
      { label: 'Desp. Operacionais', value: formatCurrency(reports.dre.operating_expenses_cents), color: '#ef4444' },
      { label: 'Resultado Op.', value: formatCurrency(reports.dre.operating_result_cents), color: '#2563eb' },
      { label: 'Rec. Vencidos', value: formatCurrency(overdueReceivables), color: '#d97706' },
      { label: 'Pag. Vencidos', value: formatCurrency(overduePayables), color: '#d97706' },
      { label: 'Períodos rastreados', value: String(reports.realized_vs_projected.length), color: '#7c3aed' }
    ];
  }, [reports]);

  const reportPeriodLabel = formatMonthYear(reports?.generated_at ?? null);
  const periodWindow = resolveFinancePeriodWindow(period);
  const quickMonths = useMemo(() => [-1, 0, 1, 2, 3].map(monthRangeFromOffset), []);
  const incomeMax = Math.max(...(reports?.income_by_category.map((row) => row.amount_cents) ?? [1]), 1);
  const expenseMax = Math.max(...(reports?.expense_by_category.map((row) => row.amount_cents) ?? [1]), 1);
  const dreRows = reports ? formatReportRows(reports, reports.dre) : [];
  const dreCashRows = reports ? formatReportRows(reports, reports.dre_cash, false) : [];

  function renderComparisonTable(rows: FinanceReportComparisonRow[]) {
    if (rows.length === 0) {
      return <EmptyState text="Sem períodos rastreados no momento." />;
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Realizado versus projetado">
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Período', 'Realizado', 'Projetado', 'Variação', ''].map((header) => (
              <th
                key={header}
                style={{ padding: '9px 14px', textAlign: header === 'Período' ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const diff = row.realized_cents - row.projected_cents;
            const pct = row.projected_cents === 0 ? 0 : ((diff / row.projected_cents) * 100).toFixed(1);
            return (
              <tr key={row.period} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formatCompactPeriod(row.period)}</td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#059669' }}>{formatCurrency(row.realized_cents)}</td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#64748b' }}>{formatCurrency(row.projected_cents)}</td>
                <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1.7,
                      whiteSpace: 'nowrap',
                      color: diff >= 0 ? '#059669' : '#dc2626',
                      background: diff >= 0 ? '#d1fae5' : '#fee2e2'
                    }}
                  >
                    {diff >= 0 ? '+' : ''}{pct}%
                  </span>
                </td>
                <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                  <DrillLink to={transactionDrill({ search: row.period })}>Abrir</DrillLink>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  function renderCategoryBreakdown(rows: FinanceCategoryBreakdownRow[], color: string, emptyMessage: string) {
    if (rows.length === 0) {
      return <EmptyState text={emptyMessage} />;
    }

    const max = color === '#059669' ? incomeMax : expenseMax;

    return (
      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((row) => (
          <div key={row.category_name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{row.category_name}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{row.transaction_count} movimentações</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace", color }}>{formatCurrency(row.amount_cents)}</span>
                <DrillLink to={transactionDrill({ kind: color === '#059669' ? 'income' : 'expense', search: row.category_name })}>Abrir</DrillLink>
              </div>
            </div>
            <MiniProgressBar value={row.amount_cents} max={max} color={color} />
          </div>
        ))}
      </div>
    );
  }

  function renderDreByPeriod(rows: FinanceDrePeriodRow[], ariaLabel = 'DRE por competência') {
    if (rows.length === 0) {
      return <EmptyState text="Sem competência no período selecionado." />;
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label={ariaLabel}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Competência', 'Receita líquida', 'Despesas', 'Resultado', 'Lançamentos', ''].map((header) => (
              <th key={header} style={{ padding: '9px 14px', textAlign: header === 'Competência' ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{formatCompactPeriod(row.period)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#059669' }}>{formatCurrency(row.net_revenue_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>{formatCurrency(row.operating_expenses_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: row.operating_result_cents >= 0 ? '#2563eb' : '#ef4444' }}>{signedCurrency(row.operating_result_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>{row.transaction_count}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right' }}><DrillLink to={transactionDrill({ search: row.period })}>Abrir</DrillLink></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderCostCenters(rows: FinanceCostCenterResultRow[]) {
    if (rows.length === 0) {
      return <EmptyState text="Sem centros de custo no período selecionado." />;
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Resultado por centro de custo">
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Centro de custo', 'Receitas', 'Despesas', 'Resultado', 'Lançamentos', ''].map((header) => (
              <th key={header} style={{ padding: '9px 14px', textAlign: header === 'Centro de custo' ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cost_center_name} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{row.cost_center_name}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#059669' }}>{formatCurrency(row.revenue_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>{formatCurrency(row.expense_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: row.result_cents >= 0 ? '#2563eb' : '#ef4444' }}>{signedCurrency(row.result_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>{row.transaction_count}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right' }}><DrillLink to={transactionDrill({ search: row.cost_center_name })}>Abrir</DrillLink></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderCashflowBasis(rows: FinanceCashflowBasisRow[], label: string) {
    if (rows.length === 0) {
      return <EmptyState text={`Sem fluxo por ${label.toLowerCase()} no período.`} />;
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label={`Fluxo por ${label}`}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Período', 'Entradas', 'Saídas', 'Saldo', 'Lançamentos', ''].map((header) => (
              <th key={header} style={{ padding: '9px 14px', textAlign: header === 'Período' ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${label}-${row.period}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{formatCompactPeriod(row.period)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#059669' }}>{formatCurrency(row.inflow_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>{formatCurrency(row.outflow_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: row.net_cents >= 0 ? '#2563eb' : '#ef4444' }}>{signedCurrency(row.net_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: '#64748b' }}>{row.transaction_count}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right' }}><DrillLink to={transactionDrill({ search: row.period })}>Abrir</DrillLink></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderAging(rows: FinanceAgingRow[], emptyMessage: string) {
    if (rows.length === 0) {
      return <EmptyState text={emptyMessage} />;
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Aging financeiro">
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Entidade', 'Descrição', 'Vencimento', 'Valor'].map((header) => (
              <th
                key={header}
                style={{ padding: '9px 14px', textAlign: header === 'Valor' ? 'right' : 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.entity_name}-${row.description}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{row.entity_name}</td>
              <td style={{ padding: '9px 14px', fontSize: 12, color: '#475569' }}>{row.description}</td>
              <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>{formatDate(row.due_date)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>{formatCurrency(row.amount_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderCashflow(rows: FinanceConsolidatedCashflowRow[]) {
    if (rows.length === 0) {
      return <EmptyState text="Sem fluxo consolidado disponível." />;
    }

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }} aria-label="Fluxo consolidado por período">
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {['Período', 'Entradas', 'Saídas', 'Saldo'].map((header) => (
              <th
                key={header}
                style={{ padding: '9px 14px', textAlign: header === 'Período' ? 'left' : 'right', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.period}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formatCompactPeriod(row.period)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#059669' }}>{formatCurrency(row.inflow_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 13, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>{formatCurrency(row.outflow_cents)}</td>
              <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: row.balance_cents >= 0 ? '#059669' : '#ef4444' }}>{formatCurrency(row.balance_cents)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (error) {
    return (
      <section className="page finance-page">
        <FinancePageHeader
          eyebrow="Relatórios"
          title="Leituras gerenciais"
          description="DRE gerencial, comparativos período a período e análises por categoria."
        />
        <FinanceErrorState title="Falha ao carregar relatórios." description={error} />
      </section>
    );
  }

  return (
    <section className="page finance-page finance-reports-ref-page">
      <FinancePageHeader
        eyebrow="Relatórios"
        title="Leituras gerenciais"
        description="DRE gerencial, comparativos período a período e análises por categoria."
      />

      <section style={{ marginBottom: 20 }}>
        <div className="finance-report-period-rail" aria-label="Atalhos de período dos relatórios">
          <button
            type="button"
            onClick={() => {
              const previous = previousRange(periodWindow.from, periodWindow.to);
              setPeriod({ preset: 'custom', from: previous.from, to: previous.to });
            }}
          >
            Período anterior
          </button>
          {quickMonths.map((month) => {
            const active = period.preset === 'custom' && period.from === month.from && period.to === month.to;
            return (
              <button
                key={month.from}
                type="button"
                className={active ? 'is-active' : ''}
                onClick={() => setPeriod({ preset: 'custom', from: month.from, to: month.to })}
              >
                {month.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {(executiveKpis.length > 0 ? executiveKpis : Array.from({ length: 6 }, (_, index) => ({ label: `KPI ${index + 1}`, value: '—', color: '#94a3b8' }))).map((kpi) => (
            <div key={kpi.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{kpi.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: kpi.color }}>{loading ? 'Carregando...' : kpi.value}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        <aside style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 8 }}>
          {REPORTS.map((report) => {
            const active = openReport === report.id;
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => setOpenReport(report.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 7,
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  marginBottom: 2,
                  background: active ? '#f0f7ff' : 'transparent',
                  borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`
                }}
                onMouseEnter={(event) => {
                  if (!active) {
                    event.currentTarget.style.background = '#f8fafc';
                  }
                }}
                onMouseLeave={(event) => {
                  if (!active) {
                    event.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? 'var(--accent)' : '#0f172a' }}>{report.label}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{report.desc}</div>
              </button>
            );
          })}
        </aside>

        <section style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
          {openReport === 'dre' ? (
            <>
              <SectionTitle>{`DRE por Competência — ${reportPeriodLabel}`}</SectionTitle>
              {renderDreTable(dreRows)}
            </>
          ) : null}

          {openReport === 'dre_cash' ? (
            <>
              <SectionTitle>{`DRE por Caixa — ${reportPeriodLabel}`}</SectionTitle>
              {renderDreTable(dreCashRows)}
            </>
          ) : null}

          {openReport === 'dre_period' ? (
            <>
              <SectionTitle>Competência por Mês</SectionTitle>
              {renderDreByPeriod(reports?.dre_by_period ?? [])}
            </>
          ) : null}

          {openReport === 'dre_cash_period' ? (
            <>
              <SectionTitle>Caixa por Mês</SectionTitle>
              {renderDreByPeriod(reports?.dre_cash_by_period ?? [], 'DRE por caixa')}
            </>
          ) : null}

          {openReport === 'cost_centers' ? (
            <>
              <SectionTitle>Resultado por Centro de Custo</SectionTitle>
              {renderCostCenters(reports?.cost_center_results ?? [])}
            </>
          ) : null}

          {openReport === 'realized' ? (
            <>
              <SectionTitle>Realizado vs Projetado</SectionTitle>
              {renderComparisonTable(reports?.realized_vs_projected ?? [])}
            </>
          ) : null}

          {openReport === 'rec_cats' ? (
            <>
              <SectionTitle>{`Receitas por Categoria — ${reportPeriodLabel}`}</SectionTitle>
              {renderCategoryBreakdown(reports?.income_by_category ?? [], '#059669', 'Nenhuma receita categorizada.')}
            </>
          ) : null}

          {openReport === 'exp_cats' ? (
            <>
              <SectionTitle>{`Despesas por Categoria — ${reportPeriodLabel}`}</SectionTitle>
              {renderCategoryBreakdown(reports?.expense_by_category ?? [], '#ef4444', 'Nenhuma despesa categorizada.')}
            </>
          ) : null}

          {openReport === 'aging_rec' ? (
            <>
              <SectionTitle>Contas a Receber Vencidas</SectionTitle>
              {renderAging(reports?.overdue_receivables ?? [], 'Nenhum item vencido.')}
            </>
          ) : null}

          {openReport === 'aging_pay' ? (
            <>
              <SectionTitle>Contas a Pagar Vencidas</SectionTitle>
              {renderAging(reports?.overdue_payables ?? [], 'Nenhum item vencido.')}
            </>
          ) : null}

          {openReport === 'cashflow' ? (
            <>
              <SectionTitle>Fluxo Consolidado por Período</SectionTitle>
              {renderCashflow(reports?.consolidated_cashflow ?? [])}
            </>
          ) : null}

          {openReport === 'cashflow_basis' ? (
            <div style={{ display: 'grid', gap: 22 }}>
              <div>
                <SectionTitle>Fluxo por Vencimento</SectionTitle>
                {renderCashflowBasis(reports?.cashflow_by_due ?? [], 'Vencimento')}
              </div>
              <div>
                <SectionTitle>Fluxo por Baixa</SectionTitle>
                {renderCashflowBasis(reports?.cashflow_by_settlement ?? [], 'Baixa')}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}
