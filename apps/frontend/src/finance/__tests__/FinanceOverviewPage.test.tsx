import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceCashflowPanel } from '../components/FinanceCashflowPanel';
import { FinanceKpiGrid } from '../components/FinanceKpiGrid';
import { FinanceQuickActions } from '../components/FinanceQuickActions';
import { FinanceQueuePanel } from '../components/FinanceQueuePanel';
import { FinanceOverviewPage } from '../pages/FinanceOverviewPage';

const { getExecutiveOverview } = vi.hoisted(() => ({
  getExecutiveOverview: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    getExecutiveOverview
  }
}));

const populatedOverview = {
      organization_id: 'org-holand',
      organization_name: 'Holand',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      generated_at: '2026-04-22T12:00:00.000Z',
      kpis: [
        {
          id: 'balance',
          label: 'Saldo em conta',
          amount_cents: 128430000,
          hint: '4 contas ativas, liquidez imediata',
          tone: 'positive',
          value_kind: 'currency'
        },
        {
          id: 'receivables',
          label: 'A receber',
          amount_cents: 41800000,
          hint: '61 títulos em aberto',
          tone: 'neutral',
          value_kind: 'currency',
          scope: 'period',
          chart_kind: 'sparkline',
          series: [
            { period: '2026-04-01', amount_cents: 12000000 },
            { period: '2026-04-02', amount_cents: 18000000 },
            { period: '2026-04-03', amount_cents: 41800000 }
          ]
        },
        {
          id: 'payables',
          label: 'A pagar',
          amount_cents: 21400000,
          hint: '28 obrigações mapeadas',
          tone: 'warning',
          value_kind: 'currency'
        },
        {
          id: 'projection',
          label: 'Resultado projetado',
          amount_cents: 20400000,
          hint: 'Fechamento da janela de 90 dias',
          tone: 'critical',
          value_kind: 'currency'
        },
        {
          id: 'overdue',
          label: 'Atrasos',
          amount_cents: 6,
          hint: '6 títulos fora da régua',
          tone: 'critical',
          value_kind: 'number'
        }
      ],
      queue: [
        {
          id: 'reconciliation',
          status: 'Crítico',
          title: 'Sem conciliação',
          detail: '6 lançamentos de extrato aguardam match.',
          amount_cents: 9214000,
          tone: 'critical',
          href: '/financeiro/reconciliation',
          cta: 'Conciliar extrato'
        },
        {
          id: 'due-today',
          status: 'Hoje',
          title: 'Vencem hoje',
          detail: '4 obrigações de saída precisam de baixa.',
          amount_cents: 3842000,
          tone: 'warning',
          href: '/financeiro/payables',
          cta: 'Abrir vencimentos'
        }
      ],
      cashflow_bands: [
        {
          label: '30 dias',
          inflow_cents: 72400000,
          outflow_cents: 53200000,
          net_cents: 19200000,
          balance_cents: 147200000,
          balance_label: 'saldo acumulado',
          inflow_share: 86,
          outflow_share: 64
        },
        {
          label: '60 dias',
          inflow_cents: 102000000,
          outflow_cents: 81400000,
          net_cents: 20600000,
          balance_cents: 168100000,
          balance_label: 'saldo acumulado',
          inflow_share: 100,
          outflow_share: 78
        },
        {
          label: '90 dias',
          inflow_cents: 131000000,
          outflow_cents: 107000000,
          net_cents: 24100000,
          balance_cents: 189100000,
          balance_label: 'saldo acumulado',
          inflow_share: 88,
          outflow_share: 72
        }
      ],
      quick_actions: [
        {
          id: 'new-revenue',
          label: 'Nova receita',
          detail: 'Registrar recebível ou faturamento manual.',
          href: '/financeiro/receivables'
        },
        {
          id: 'reconcile',
          label: 'Conciliar extrato',
          detail: 'Entrar direto na fila de matching bancário.',
          href: '/financeiro/reconciliation'
        },
        {
          id: 'import-statement',
          label: 'Importar extrato',
          detail: 'Subir arquivo bancário para preparar a conciliação.',
          href: '/financeiro/reconciliation'
        }
      ],
      summary: {
        cash_balance_cents: 128430000,
        receivables_open_cents: 41800000,
        payables_open_cents: 21400000,
        projected_result_cents: 20400000,
        reconciliation_pending_count: 2,
        uncategorized_count: 1,
        quality_issue_count: 3,
        quality_critical_count: 1,
        quality_warning_count: 2,
        overdue_count: 6,
        monthly_income_cents: 33900000,
        monthly_expense_cents: 13500000
      }
};

beforeEach(() => {
  getExecutiveOverview.mockReset();
});

test('FinanceOverviewPage renders the approved executive split-control home', async () => {
  const user = userEvent.setup();
  getExecutiveOverview.mockImplementation(() => Promise.resolve(populatedOverview));

  const { container } = render(
    <MemoryRouter>
      <FinanceOverviewPage />
    </MemoryRouter>
  );

  expect(await screen.findByText('R$ 1.284.300,00')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument();
  expect(screen.getByLabelText('Período financeiro')).toHaveValue('month');
  expect(getExecutiveOverview).toHaveBeenCalledWith({ preset: 'month', from: null, to: null });
  expect(screen.getByText('Leitura executiva do financeiro da Holand.')).toBeInTheDocument();
  expect(screen.getByText('3 lançamentos precisam de revisão')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Revisar dados' })).toBeInTheDocument();
  expect(screen.getByText('Saldo em conta')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /A receber/i })).toHaveAttribute('href', '/financeiro/receivables');
  expect(screen.getByRole('heading', { name: 'Fila operacional' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fluxo de caixa — 9 meses' })).toBeInTheDocument();
  expect(screen.getByText('R$ 418.000,00')).toBeInTheDocument();
  expect(container.querySelectorAll('.finance-overview-kpi__spark')).toHaveLength(populatedOverview.kpis.length);
  expect(container.querySelectorAll('.finance-overview-kpi__spark svg')).toHaveLength(populatedOverview.kpis.length);
  expect(screen.getByText('Atrasos')).toBeInTheDocument();
  expect(screen.queryByText(/contraparte/i)).not.toBeInTheDocument();

  const queue = screen.getByRole('region', { name: 'Fila operacional' });
  const quickActions = screen.getByRole('region', { name: 'Ações rápidas' });

  expect(within(queue).getByText('Sem conciliação')).toBeInTheDocument();
  expect(within(queue).getByRole('link', { name: /Conciliar/i })).toBeInTheDocument();
  expect(within(quickActions).getByRole('link', { name: /Nova receita/i })).toBeInTheDocument();
  expect(within(quickActions).getByRole('link', { name: /Conciliar extrato/i })).toBeInTheDocument();
  expect(within(quickActions).getByRole('link', { name: /Importar extrato/i })).toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Período financeiro'), 'next_7');
  await waitFor(() => {
    expect(getExecutiveOverview).toHaveBeenLastCalledWith({ preset: 'next_7', from: null, to: null });
  });
  expect(window.localStorage.getItem('orquestrador_finance_global_period_v1:anonymous')).toContain('next_7');

  await user.click(screen.getByRole('button', { name: 'Salvar filtro' }));
  await user.type(screen.getByLabelText('Nome do filtro'), 'Semana executiva');
  await user.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(screen.getByRole('option', { name: 'Semana executiva' })).toBeInTheDocument();
});

test('FinanceOverviewPage keeps premium loading states in the approved rhythm', async () => {
  getExecutiveOverview.mockImplementation(() => new Promise(() => {}));

  render(
    <MemoryRouter>
      <FinanceOverviewPage />
    </MemoryRouter>
  );

  expect(screen.getByText('Carregando visão executiva do financeiro...')).toBeInTheDocument();
  expect(screen.getAllByText('Carregando leitura executiva.')).toHaveLength(8);
  expect(screen.getAllByText('Aguardando fila operacional')).toHaveLength(2);
  expect(screen.getAllByText('Carregando atalhos do financeiro.')).toHaveLength(4);
});

test('FinanceOverviewPage shows a graceful error state when the overview request fails', async () => {
  getExecutiveOverview.mockImplementation(() => Promise.reject(new Error('Falha de teste na visão executiva.')));

  render(
    <MemoryRouter>
      <FinanceOverviewPage />
    </MemoryRouter>
  );

  const alert = await screen.findByRole('alert');
  expect(within(alert).getByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument();
  expect(within(alert).getByText('Falha de teste na visão executiva.')).toBeInTheDocument();
});

test('FinanceOverviewPage empty subcomponents keep premium empty compositions', () => {
  const { container } = render(
    <MemoryRouter>
      <div>
        <FinanceKpiGrid kpis={[]} currency="BRL" />
        <FinanceCashflowPanel bands={[]} currency="BRL" />
        <FinanceQueuePanel items={[]} currency="BRL" />
        <FinanceQuickActions actions={[]} />
      </div>
    </MemoryRouter>
  );

  expect(within(container).getAllByText('—').length).toBeGreaterThanOrEqual(6);
  expect(within(container).getByText('3 contas ativas, liquidez imediata')).toBeInTheDocument();
  expect(within(container).getByText('Fluxo de caixa — 9 meses')).toBeInTheDocument();
  expect(within(container).getByText('Atraso a receber')).toBeInTheDocument();
  expect(within(container).getByText('Lançamentos aguardando match')).toBeInTheDocument();
  expect(within(container).getByText('Novo lançamento')).toBeInTheDocument();
  expect(within(container).queryByText('Carregando leitura executiva.')).not.toBeInTheDocument();
});
