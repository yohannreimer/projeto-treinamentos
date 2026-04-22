import { render, screen } from '@testing-library/react';
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
    dre: {
      gross_revenue_cents: 100000,
      deductions_cents: 0,
      net_revenue_cents: 100000,
      operating_expenses_cents: 40000,
      operating_result_cents: 60000
    }
  });
});

test('reports page renders DRE and management report sections from the backend contract', async () => {
  render(<FinanceReportsPage />);

  expect(await screen.findByText('DRE gerencial')).toBeInTheDocument();
  expect(screen.getByText('Realizado vs projetado')).toBeInTheDocument();
  expect(screen.getByText('Receitas por categoria')).toBeInTheDocument();
  expect(screen.getByText('Despesas por categoria')).toBeInTheDocument();
  expect(screen.getByText('Contas a receber vencidas')).toBeInTheDocument();
  expect(screen.getByText('Contas a pagar vencidas')).toBeInTheDocument();
  expect(screen.getByText('Fluxo consolidado por período')).toBeInTheDocument();
  expect(screen.getByText('Receita de Serviços')).toBeInTheDocument();
  expect(screen.getByText('Recebível em atraso')).toBeInTheDocument();
  expect(screen.getByText('Pagamento em atraso')).toBeInTheDocument();
});
