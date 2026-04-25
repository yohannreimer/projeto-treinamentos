import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FinanceExecutiveKpi } from '../api';
import { FinanceMono } from './FinancePrimitives';

type FinanceKpiGridProps = {
  kpis: FinanceExecutiveKpi[];
  currency: string;
  loading?: boolean;
};

type OverviewKpiTone = 'positive' | 'neutral' | 'warning' | 'critical';

type OverviewKpiCard = {
  label: string;
  hint: string;
  accent: string;
  delta: string;
  deltaTone: 'positive' | 'warning' | 'critical';
  trendUp: boolean;
  seed: number;
  spark: number[];
};

const FALLBACK_CARDS: OverviewKpiCard[] = [
  { label: 'Saldo em conta', hint: '3 contas ativas, liquidez imediata', accent: '#2563eb', delta: '8,2%', deltaTone: 'positive', trendUp: true, seed: 284500000, spark: [58, 62, 55, 58, 55, 66, 61, 66, 60] },
  { label: 'A receber', hint: 'Títulos em aberto e provisionados', accent: '#059669', delta: '12%', deltaTone: 'positive', trendUp: true, seed: 152300000, spark: [59, 54, 61, 57, 60, 61, 54, 59, 55] },
  { label: 'A pagar', hint: 'Obrigações abertas no período', accent: '#ef4444', delta: '3,1%', deltaTone: 'critical', trendUp: false, seed: 87650000, spark: [58, 57, 58, 62, 56, 61, 62, 56, 55] },
  { label: 'Resultado projetado', hint: 'Saldo projetado do mês', accent: '#7c3aed', delta: '5,4%', deltaTone: 'positive', trendUp: true, seed: 196850000, spark: [59, 55, 56, 57, 59, 63, 56, 61, 62] },
  { label: 'Faturamento do mês', hint: 'Entradas confirmadas e projetadas', accent: '#0891b2', delta: '18%', deltaTone: 'positive', trendUp: true, seed: 435200000, spark: [57, 59, 54, 55, 55, 56, 58, 53, 57] },
  { label: 'Despesas do mês', hint: 'Saídas confirmadas e projetadas', accent: '#f59e0b', delta: '2,3%', deltaTone: 'critical', trendUp: false, seed: 238350000, spark: [61, 63, 60, 62, 61, 60, 60, 61, 56] },
  { label: 'Atrasos', hint: 'Títulos fora da régua', accent: '#ef4444', delta: '2', deltaTone: 'critical', trendUp: false, seed: 7000, spark: [58, 60, 59, 62, 61, 63, 62, 62, 62] },
  { label: 'Conciliação pendente', hint: 'Lançamentos aguardando match', accent: '#d97706', delta: '4', deltaTone: 'critical', trendUp: false, seed: 14000, spark: [59, 61, 60, 63, 60, 64, 61, 65, 64] }
];

const KPI_ORDER = [
  'saldo',
  'receber',
  'pagar',
  'resultado',
  'faturamento',
  'despesa',
  'atras',
  'concilia'
] as const;

function detectKpiKey(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes('saldo')) return 'saldo';
  if (normalized.includes('receber')) return 'receber';
  if (normalized.includes('pagar')) return 'pagar';
  if (normalized.includes('resultado') || normalized.includes('projetado')) return 'resultado';
  if (normalized.includes('faturamento') || normalized.includes('receita')) return 'faturamento';
  if (normalized.includes('despesa') || normalized.includes('saída') || normalized.includes('saida')) return 'despesa';
  if (normalized.includes('atras')) return 'atras';
  if (normalized.includes('concilia')) return 'concilia';
  return 'saldo';
}

function formatExecutiveValue(kpi: FinanceExecutiveKpi, currency: string) {
  if (kpi.value_kind === 'number') {
    return new Intl.NumberFormat('pt-BR').format(kpi.amount_cents);
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(kpi.amount_cents / 100);
}

function buildSparklinePath(series: number[]) {
  const safeSeries = series.length > 1 ? series : [series[0] ?? 50, series[0] ?? 50];
  const max = Math.max(...safeSeries);
  const min = Math.min(...safeSeries);
  const range = max - min || 1;
  const height = 16;
  const width = 100;
  return safeSeries
    .map((point, index) => {
      const x = (index / (safeSeries.length - 1)) * width;
      const y = ((max - point) / range) * height + 4;
      return `${x},${y}`;
    })
    .join(' ');
}

function sparkValuesForCard(card: OverviewKpiCard, kpi?: FinanceExecutiveKpi) {
  if (!kpi?.series?.length) return card.spark;
  return kpi.series.slice(-9).map((point) => point.amount_cents);
}

function resolveCardMeta(kpi: FinanceExecutiveKpi, index: number): OverviewKpiCard {
  const fallback = FALLBACK_CARDS[index % FALLBACK_CARDS.length];
  const label = kpi.label;
  const hint = fallback.hint;

  if (/saldo/i.test(label)) {
    return { ...fallback, label, hint, accent: '#2563eb', delta: '8,2%', deltaTone: 'positive', trendUp: true, seed: kpi.amount_cents };
  }

  if (/receber/i.test(label)) {
    return { ...fallback, label, hint, accent: '#059669', delta: '12%', deltaTone: 'positive', trendUp: true, seed: kpi.amount_cents };
  }

  if (/pagar/i.test(label)) {
    return { ...fallback, label, hint, accent: '#ef4444', delta: '3,1%', deltaTone: 'critical', trendUp: false, seed: kpi.amount_cents };
  }

  if (/resultado|projetado/i.test(label)) {
    return { ...fallback, label, hint, accent: '#7c3aed', delta: '5,4%', deltaTone: 'positive', trendUp: true, seed: kpi.amount_cents };
  }

  if (/faturamento|receita/i.test(label)) {
    return { ...fallback, label, hint, accent: '#0891b2', delta: '18%', deltaTone: 'positive', trendUp: true, seed: kpi.amount_cents };
  }

  if (/despesa|saída/i.test(label)) {
    return { ...fallback, label, hint, accent: '#f59e0b', delta: '2,3%', deltaTone: 'critical', trendUp: false, seed: kpi.amount_cents };
  }

  if (/atras/i.test(label)) {
    return { ...fallback, label, hint, accent: '#ef4444', delta: '2', deltaTone: 'critical', trendUp: false, seed: kpi.amount_cents };
  }

  if (/concilia/i.test(label)) {
    return { ...fallback, label, hint, accent: '#d97706', delta: '4', deltaTone: 'critical', trendUp: false, seed: kpi.amount_cents };
  }

  return { ...fallback, label, hint, accent: fallback.accent, delta: fallback.delta, deltaTone: fallback.deltaTone, trendUp: fallback.trendUp, seed: kpi.amount_cents || fallback.seed };
}

function OverviewKpiCard({
  card,
  kpi,
  value,
  loading,
  empty,
  tone,
  href
}: {
  card: OverviewKpiCard;
  kpi?: FinanceExecutiveKpi;
  value: ReactNode;
  loading?: boolean;
  empty?: boolean;
  tone: OverviewKpiTone;
  href?: string | null;
}) {
  const path = buildSparklinePath(sparkValuesForCard(card, kpi));
  const className = `finance-kpi-card finance-kpi-card--${tone} finance-overview-kpi ${loading ? 'finance-overview-kpi--loading' : ''} ${empty ? 'finance-overview-kpi--empty' : ''}`;
  const content = (
    <>
      <span className="finance-overview-kpi__dot" aria-hidden="true" style={{ backgroundColor: card.accent }} />
      <div className="finance-overview-kpi__head">
        <small className="finance-kpi-card__eyebrow">{card.label}</small>
        <strong>{value}</strong>
      </div>

      <div className="finance-overview-kpi__footer">
        <span className={`finance-overview-kpi__delta finance-overview-kpi__delta--${card.deltaTone}`}>{card.trendUp ? '↑' : '↓'} {card.delta}</span>
        <span className="finance-overview-kpi__hint">{card.hint}</span>
      </div>

      <div className="finance-overview-kpi__spark" aria-hidden="true">
        <svg viewBox="0 0 100 34" preserveAspectRatio="none">
          <polygon points={`${path} 100,34 0,34`} fill={card.accent} opacity="0.08" />
          <polyline points={path} fill="none" stroke={card.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );

  if (href && !loading && !empty) {
    return <Link to={href} className={className}>{content}</Link>;
  }

  return (
    <article className={className}>
      {content}
    </article>
  );
}

function kpiHref(kpi: FinanceExecutiveKpi) {
  const key = detectKpiKey(kpi.label);
  if (key === 'receber') return '/financeiro/receivables';
  if (key === 'pagar') return '/financeiro/payables';
  if (key === 'faturamento') return '/financeiro/transactions?kind=income';
  if (key === 'despesa') return '/financeiro/transactions?kind=expense';
  if (key === 'resultado') return '/financeiro/transactions';
  if (key === 'atras') return '/financeiro/receivables?status=overdue';
  if (key === 'concilia') return '/financeiro/reconciliation';
  return null;
}

export function FinanceKpiGrid({ kpis, currency, loading = false }: FinanceKpiGridProps) {
  if (loading) {
    return (
      <section className="finance-kpi-grid finance-kpi-grid--overview" aria-label="KPIs executivos">
        {FALLBACK_CARDS.map((card) => (
          <OverviewKpiCard
            key={card.label}
            card={{ ...card, hint: 'Carregando leitura executiva.' }}
            loading
            tone="neutral"
            value={<span className="finance-skeleton-line finance-skeleton-line--lg" aria-hidden="true" />}
          />
        ))}
      </section>
    );
  }

  if (kpis.length === 0) {
    return (
      <section className="finance-kpi-grid finance-kpi-grid--overview" aria-label="KPIs executivos">
        {FALLBACK_CARDS.map((card) => (
          <OverviewKpiCard
            key={card.label}
            card={card}
            empty
            tone="neutral"
            value={<FinanceMono>—</FinanceMono>}
          />
        ))}
      </section>
    );
  }

  return (
    <section className="finance-kpi-grid finance-kpi-grid--overview" aria-label="KPIs executivos">
      {[...kpis]
        .sort((left, right) => KPI_ORDER.indexOf(detectKpiKey(left.label)) - KPI_ORDER.indexOf(detectKpiKey(right.label)))
        .map((kpi, index) => {
        const card = resolveCardMeta(kpi, index);

        return (
          <OverviewKpiCard
            key={kpi.id}
            card={card}
          kpi={kpi}
          tone={kpi.tone}
          value={<FinanceMono>{formatExecutiveValue(kpi, currency)}</FinanceMono>}
          href={kpiHref(kpi)}
        />
        );
      })}
    </section>
  );
}
