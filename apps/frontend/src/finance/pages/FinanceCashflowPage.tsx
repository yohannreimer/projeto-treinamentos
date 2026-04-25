import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { financeApi, type FinanceCashflow, type FinanceCashflowHorizon } from '../api';
import { FinancePeriodFilter } from '../components/FinancePeriodFilter';
import { FinanceErrorState, FinanceLoadingState, FinanceMono, FinancePageHeader } from '../components/FinancePrimitives';
import { useFinancePeriod } from '../hooks/useFinancePeriod';

const horizons: FinanceCashflowHorizon[] = [30, 60, 90];
const CASHFLOW_ACCENT = '#ea6a21';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatChartDate(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}

function Card({
  children,
  padding = 20,
  style
}: {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding,
        ...style
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 14 }}>{children}</div>;
}

function Badge({
  children,
  color = '#64748b',
  bg = '#f1f5f9',
  size = 11
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  size?: number;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: size,
        fontWeight: 600,
        background: bg,
        color,
        lineHeight: 1.7,
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </span>
  );
}

function MiniProgressBar({ value, max, color = '#2563eb' }: { value: number; max: number; color?: string }) {
  return (
    <div style={{ background: '#e2e8f0', borderRadius: 4, height: 5, width: '100%' }}>
      <div
        style={{
          background: color,
          width: `${Math.min(100, (value / (max || 1)) * 100)}%`,
          height: '100%',
          borderRadius: 4,
          transition: 'width 0.4s'
        }}
      />
    </div>
  );
}

function riskMeta(riskLevel?: FinanceCashflow['windows'][number]['risk_level']) {
  if (riskLevel === 'healthy') return { label: 'Baixo', color: '#059669', bg: '#d1fae5' };
  if (riskLevel === 'attention') return { label: 'Médio', color: '#d97706', bg: '#fef3c7' };
  return { label: 'Alto', color: '#ef4444', bg: '#fee2e2' };
}

function alertMeta(tone: FinanceCashflow['alerts'][number]['tone']) {
  if (tone === 'warning') return { border: '#fef3c7', bg: '#fffbeb', dot: '#d97706', text: '#92400e' };
  if (tone === 'critical') return { border: '#fee2e2', bg: '#fff5f5', dot: '#ef4444', text: '#991b1b' };
  return { border: '#dbeafe', bg: '#eff6ff', dot: '#2563eb', text: '#1e40af' };
}

function getChartGeometry(points: FinanceCashflow['points']) {
  const width = 100;
  const height = 80;

  if (points.length === 0) {
    return { width, height, linePoints: '', areaPoints: '', maxBalance: 1, minBalance: 0, hasData: false, ticks: [] as FinanceCashflow['points'] };
  }

  const balances = points.map((point) => point.balance_cents);
  const maxBalance = Math.max(...balances);
  const minBalance = Math.min(...balances);
  const range = maxBalance - minBalance;
  const usableWidth = points.length > 1 ? width : 0;

  const mapped = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * usableWidth;
    const y = range === 0
      ? height / 2
      : ((maxBalance - point.balance_cents) / range) * (height - 12) + 6;
    return { x, y };
  });

  const linePoints = mapped.map(({ x, y }) => `${x},${y}`).join(' ');
  const areaPoints = mapped.length === 1
    ? `${mapped[0].x},${mapped[0].y} ${width},${height} 0,${height}`
    : `${linePoints} ${width},${height} 0,${height}`;

  const tickStep = points.length <= 7 ? 1 : Math.max(1, Math.ceil((points.length - 1) / 6));
  const ticks = points.filter((_, index) => index % tickStep === 0);
  const last = points[points.length - 1];
  if (ticks[ticks.length - 1]?.date !== last.date) {
    ticks.push(last);
  }

  return {
    width,
    height,
    linePoints,
    areaPoints,
    maxBalance,
    minBalance,
    hasData: true,
    hasVariation: range > 0,
    flatY: height / 2,
    ticks
  };
}

export function FinanceCashflowPage() {
  const { period, setPeriod } = useFinancePeriod();
  const [horizon, setHorizon] = useState<FinanceCashflowHorizon>(90);
  const [cashflow, setCashflow] = useState<FinanceCashflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');

    financeApi.getCashflow(horizon)
      .then((payload) => {
        if (cancelled) return;
        setCashflow(payload);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError((loadError as Error).message || 'Falha ao carregar o fluxo de caixa.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [horizon]);

  const selectedWindow = useMemo(
    () => cashflow?.windows.find((window) => window.horizon_days === horizon) ?? null,
    [cashflow, horizon]
  );

  const geometry = useMemo(() => getChartGeometry(cashflow?.points ?? []), [cashflow]);

  const summaryItems = cashflow ? [
    { label: 'Saldo inicial', value: formatCurrency(cashflow.totals.starting_balance_cents), color: '#0f172a', note: 'base dos extratos já reconciliados/importados' },
    { label: 'Entradas projetadas', value: formatCurrency(cashflow.totals.inflow_cents), color: '#059669', note: `recebimentos previstos para ${horizon} dias` },
    { label: 'Saídas projetadas', value: formatCurrency(cashflow.totals.outflow_cents), color: '#ef4444', note: 'obrigações previstas na mesma janela' },
    { label: 'Saldo final', value: formatCurrency(cashflow.totals.ending_balance_cents), color: 'var(--accent)', note: 'posição acumulada ao fim da janela' },
    { label: 'Pior ponto', value: formatCurrency(selectedWindow?.lowest_balance_cents ?? cashflow.totals.ending_balance_cents), color: '#d97706', note: 'menor saldo previsto no horizonte' },
    { label: 'Nível de risco', value: riskMeta(selectedWindow?.risk_level).label, color: riskMeta(selectedWindow?.risk_level).color, note: 'leituras de pressão da janela selecionada' }
  ] : [];

  const maxComparison = Math.max(...(cashflow?.windows.map((window) => window.ending_balance_cents) ?? [1]));

  return (
    <section className="page finance-page finance-cashflow-page">
      <FinancePageHeader
        eyebrow="Fluxo de Caixa"
        title="Fluxo de caixa projetado"
        description="Projeção de entradas, saídas e saldo em diferentes horizontes temporais."
        meta={<FinancePeriodFilter value={period} onChange={setPeriod} />}
      />

      <Card style={{ marginBottom: 20 }}>
        <SectionTitle>Horizonte temporal</SectionTitle>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {horizons.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={horizon === item}
              onClick={() => setHorizon(item)}
              style={{
                padding: '7px 20px',
                borderRadius: 7,
                border: '1px solid',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                borderColor: horizon === item ? '#2563eb' : '#e2e8f0',
                background: horizon === item ? '#eff6ff' : 'white',
                color: horizon === item ? '#1d4ed8' : '#64748b'
              }}
            >
              <FinanceMono>{item}</FinanceMono> dias
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {horizons.map((item) => {
            const window = cashflow?.windows.find((entry) => entry.horizon_days === item);
            const meta = riskMeta(window?.risk_level);

            return (
              <button
                key={item}
                type="button"
                aria-pressed={horizon === item}
                onClick={() => setHorizon(item)}
                style={{
                  border: `1px solid ${horizon === item ? '#2563eb' : '#e2e8f0'}`,
                  borderRadius: 8,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  background: horizon === item ? '#eff6ff' : 'white',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                    <FinanceMono>{item}</FinanceMono> dias
                  </span>
                  <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#0f172a', marginBottom: 4 }}>
                  <FinanceMono>{formatCurrency(window?.ending_balance_cents ?? 0)}</FinanceMono>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 10, color: '#059669' }}>↑ <FinanceMono>{formatCurrency(window?.inflow_cents ?? 0)}</FinanceMono></span>
                  <span style={{ fontSize: 10, color: '#ef4444' }}>↓ <FinanceMono>{formatCurrency(window?.outflow_cents ?? 0)}</FinanceMono></span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <FinanceLoadingState title="Carregando projeção..." />
      ) : error ? (
        <FinanceErrorState title="Falha ao carregar o fluxo de caixa." description={error} />
      ) : cashflow ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <Card style={{ marginBottom: 16 }}>
              <SectionTitle>Resumo principal — {horizon} dias</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
                {summaryItems.map((item) => (
                  <div key={item.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: item.color }}>
                      <FinanceMono>{item.value}</FinanceMono>
                    </div>
                    <small style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#64748b' }}>{item.note}</small>
                  </div>
                ))}
              </div>

              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600 }}>Curva do saldo projetado</div>
                <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} style={{ width: '100%', height: 120 }} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CASHFLOW_ACCENT} stopOpacity="0.2" />
                      <stop offset="100%" stopColor={CASHFLOW_ACCENT} stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {geometry.hasData ? (
                    <>
                      {geometry.hasVariation ? <polygon points={geometry.areaPoints} fill="url(#cfGrad)" /> : null}
                      {geometry.hasVariation ? (
                        <polyline points={geometry.linePoints} fill="none" stroke={CASHFLOW_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <line
                          x1="0"
                          y1={geometry.flatY}
                          x2={geometry.width}
                          y2={geometry.flatY}
                          stroke={CASHFLOW_ACCENT}
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      )}
                      {(cashflow?.points ?? []).map((point, index) => {
                        const sourcePoints = cashflow?.points ?? [];
                        const x = sourcePoints.length === 1
                          ? geometry.width / 2
                          : (index / (sourcePoints.length - 1)) * geometry.width;
                        const balanceRange = geometry.maxBalance - geometry.minBalance;
                        const y = balanceRange === 0
                          ? geometry.flatY
                          : ((geometry.maxBalance - point.balance_cents) / balanceRange) * (geometry.height - 12) + 6;
                        return <circle key={point.date} cx={x} cy={y} r="2" fill={CASHFLOW_ACCENT} />;
                      })}
                    </>
                  ) : null}
                </svg>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                  {geometry.ticks.map((point) => (
                    <div key={point.date} style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
                        {formatChartDate(point.date)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    {['Data', 'Saldo', 'Entradas', 'Saídas', 'Net'].map((header) => (
                      <th
                        key={header}
                        style={{
                          padding: '7px 10px',
                          textAlign: header === 'Data' ? 'left' : 'right',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: '#94a3b8'
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cashflow.points.map((point) => (
                    <tr key={point.date} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontSize: 12, color: '#475569', fontFamily: "'DM Mono', monospace" }}>
                        <FinanceMono>{formatDate(point.date)}</FinanceMono>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#0f172a', textAlign: 'right' }}>
                        <FinanceMono>{formatCurrency(point.balance_cents)}</FinanceMono>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#059669', textAlign: 'right' }}>
                        {point.inflow_cents > 0 ? <FinanceMono>{formatCurrency(point.inflow_cents)}</FinanceMono> : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#ef4444', textAlign: 'right' }}>
                        {point.outflow_cents > 0 ? <FinanceMono>{formatCurrency(point.outflow_cents)}</FinanceMono> : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontFamily: "'DM Mono', monospace", color: (point.inflow_cents - point.outflow_cents) >= 0 ? '#059669' : '#ef4444', textAlign: 'right' }}>
                        {point.net_cents !== 0 ? <FinanceMono>{formatCurrency(point.net_cents)}</FinanceMono> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <div>
            <Card style={{ marginBottom: 16 }}>
              <SectionTitle>Alertas</SectionTitle>
              {cashflow.alerts.map((alert, index) => {
                const meta = alertMeta(alert.tone);

                return (
                  <div
                    key={alert.id}
                    style={{
                      border: `1px solid ${meta.border}`,
                      background: meta.bg,
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: index < cashflow.alerts.length - 1 ? 8 : 0
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: meta.dot, marginTop: 5, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: meta.text, marginBottom: 2 }}>{alert.title}</div>
                        <div style={{ fontSize: 11, color: meta.text, opacity: 0.8, lineHeight: 1.5 }}>{alert.detail}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>

            <Card>
              <SectionTitle>Comparativo 30/60/90</SectionTitle>
              {cashflow.windows.map((window) => (
                <div key={window.horizon_days} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>
                      <FinanceMono>{window.horizon_days}</FinanceMono> dias
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: riskMeta(window.risk_level).color, fontWeight: 600 }}>
                      <FinanceMono>{formatCurrency(window.ending_balance_cents)}</FinanceMono>
                    </span>
                  </div>
                  <MiniProgressBar
                    value={window.ending_balance_cents}
                    max={maxComparison}
                    color={riskMeta(window.risk_level).color}
                  />
                </div>
              ))}
            </Card>
          </div>
        </div>
      ) : null}
    </section>
  );
}
