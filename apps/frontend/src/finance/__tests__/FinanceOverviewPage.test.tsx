import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { FinanceOverviewPage } from '../pages/FinanceOverviewPage';

vi.mock('../api', () => ({
  financeApi: {
    getExecutiveOverview: vi.fn().mockResolvedValue({
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
          value_kind: 'currency'
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
      ]
    })
  }
}));

test('FinanceOverviewPage renders the approved executive split-control home', async () => {
  render(
    <MemoryRouter>
      <FinanceOverviewPage />
    </MemoryRouter>
  );

  expect(await screen.findByText('R$ 1.284.300,00')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Visão Geral' })).toBeInTheDocument();
  expect(screen.getByText('Leitura executiva do financeiro da Holand.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Saldo em conta' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fila operacional' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Fluxo de caixa 90 dias' })).toBeInTheDocument();
  expect(screen.getByText('R$ 418.000,00')).toBeInTheDocument();
  expect(screen.getByText('6 títulos fora da régua')).toBeInTheDocument();
  expect(screen.queryByText(/contraparte/i)).not.toBeInTheDocument();

  const queue = screen.getByRole('region', { name: 'Fila operacional' });
  const quickActions = screen.getByRole('region', { name: 'Ações rápidas' });

  expect(within(queue).getByText('Sem conciliação')).toBeInTheDocument();
  expect(within(queue).getByRole('link', { name: /Conciliar extrato/i })).toBeInTheDocument();
  expect(within(quickActions).getByRole('link', { name: /Nova receita/i })).toBeInTheDocument();
  expect(within(quickActions).getByRole('link', { name: /Conciliar extrato/i })).toBeInTheDocument();
  expect(within(quickActions).getByRole('link', { name: /Importar extrato/i })).toBeInTheDocument();
});
