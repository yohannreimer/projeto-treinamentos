import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceReportsPage } from '../pages/FinanceReportsPage';

const mocks = vi.hoisted(() => ({
  getReports: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    getReports: mocks.getReports
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getReports.mockResolvedValue({
    organization_id: 'org-holand',
    organization_name: 'Holand',
    generated_at: '2026-04-22T12:00:00.000Z',
    realized_vs_projected: [
      {
        period: '2026-04',
        realized_cents: 100000,
        projected_cents: 30000,
        variance_cents: 70000
      }
    ],
    income_by_category: [
      {
        category_name: 'Receita de Serviços',
        amount_cents: 100000,
        transaction_count: 2
      }
    ],
    expense_by_category: [
      {
        category_name: 'Despesas Operacionais',
        amount_cents: 40000,
        transaction_count: 1
      }
    ],
    overdue_receivables: [
      {
        entity_name: 'Cliente Holand',
        due_date: '2026-04-20',
        amount_cents: 15000,
        description: 'Recebível em atraso'
      }
    ],
    overdue_payables: [
      {
        entity_name: 'Fornecedor Holand',
        due_date: '2026-04-20',
        amount_cents: 9000,
        description: 'Pagamento em atraso'
      }
    ],
    consolidated_cashflow: [
      {
        period: '2026-04',
        inflow_cents: 115000,
        outflow_cents: 49000,
        balance_cents: 66000
      }
    ],
    dre_by_period: [
      {
        period: '2026-04',
        gross_revenue_cents: 100000,
        deductions_cents: 0,
        net_revenue_cents: 100000,
        operating_expenses_cents: 40000,
        operating_result_cents: 60000,
        transaction_count: 3
      }
    ],
    dre_cash_by_period: [
      {
        period: '2026-04',
        gross_revenue_cents: 90000,
        deductions_cents: 0,
        net_revenue_cents: 90000,
        operating_expenses_cents: 30000,
        operating_result_cents: 60000,
        transaction_count: 2
      }
    ],
    cost_center_results: [
      {
        cost_center_name: 'Comercial',
        revenue_cents: 100000,
        expense_cents: 40000,
        result_cents: 60000,
        transaction_count: 3
      }
    ],
    cashflow_by_due: [
      {
        period: '2026-04',
        inflow_cents: 100000,
        outflow_cents: 40000,
        net_cents: 60000,
        transaction_count: 3
      }
    ],
    cashflow_by_settlement: [
      {
        period: '2026-04',
        inflow_cents: 90000,
        outflow_cents: 30000,
        net_cents: 60000,
        transaction_count: 2
      }
    ],
    dre: {
      gross_revenue_cents: 100000,
      deductions_cents: 0,
      net_revenue_cents: 100000,
      operating_expenses_cents: 40000,
      operating_result_cents: 60000
    },
    dre_cash: {
      gross_revenue_cents: 90000,
      deductions_cents: 0,
      net_revenue_cents: 90000,
      operating_expenses_cents: 30000,
      operating_result_cents: 60000
    }
  });
});

test('reports page renders DRE and management report sections from the backend contract', async () => {
  render(
    <MemoryRouter>
      <FinanceReportsPage />
    </MemoryRouter>
  );

  expect(await screen.findByRole('heading', { name: /DRE por Competência/i })).toBeInTheDocument();
  expect((await screen.findAllByText('R$ 1.000,00')).length).toBeGreaterThan(0);
  expect(screen.queryByText('R$ 100.000,00')).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Abrir' })[0]).toHaveAttribute('href', '/financeiro/transactions?kind=income');

  await userEvent.click(screen.getByRole('button', { name: /DRE por caixa/i }));
  expect(await screen.findByRole('heading', { name: /DRE por Caixa/i })).toBeInTheDocument();
  expect((await screen.findAllByText('R$ 900,00')).length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole('button', { name: /Competência por mês/i }));
  expect(await screen.findByRole('table', { name: /DRE por competência/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Caixa por mês/i }));
  expect(await screen.findByRole('table', { name: /DRE por caixa/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Centros de custo/i }));
  expect(await screen.findByRole('table', { name: /Resultado por centro de custo/i })).toBeInTheDocument();
  expect(await screen.findByText('Comercial')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Realizado vs Projetado/i }));
  expect((await screen.findAllByText(/Abr\/26/i)).length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole('button', { name: /Receitas por categoria/i }));
  expect(await screen.findByText('Receita de Serviços')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Despesas por categoria/i }));
  expect(await screen.findByText('Despesas Operacionais')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Rec\. a receber vencidos/i }));
  expect(await screen.findByRole('heading', { name: /Contas a Receber Vencidas/i })).toBeInTheDocument();
  expect(await screen.findByText('Recebível em atraso')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Pag\. a pagar vencidos/i }));
  expect(await screen.findByRole('heading', { name: /Contas a Pagar Vencidas/i })).toBeInTheDocument();
  expect(await screen.findByText('Pagamento em atraso')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Fluxo consolidado/i }));
  expect(await screen.findByRole('table', { name: /Fluxo consolidado por período/i })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Caixa vencimento\/baixa/i }));
  expect(await screen.findByRole('table', { name: /Fluxo por Vencimento/i })).toBeInTheDocument();
  expect(await screen.findByRole('table', { name: /Fluxo por Baixa/i })).toBeInTheDocument();
});
