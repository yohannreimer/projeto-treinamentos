import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinancePayablesPage } from '../pages/FinancePayablesPage';

const mocks = vi.hoisted(() => ({
  sessionRead: vi.fn()
}));

vi.mock('../../auth/session', () => ({
  hasAnyPermission: vi.fn(() => true),
  internalSessionStore: {
    read: mocks.sessionRead
  }
}));

vi.mock('../api', () => ({
  financeApi: {
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    listCategories: vi.fn().mockResolvedValue({ categories: [] }),
    listPayables: vi.fn().mockResolvedValue({
      summary: { open_cents: 98000, overdue_cents: 98000, due_today_cents: 0 },
      groups: {
        overdue: [
          {
            id: 'pay-1',
            description: 'Licença de software',
            supplier_name: 'Vendor',
            amount_cents: 98000,
            status: 'overdue',
            due_date: '2026-04-18',
            issue_date: '2026-04-01',
            paid_at: null,
            financial_account_name: null,
            financial_category_name: null
          }
        ],
        due_today: [],
        upcoming: [],
        settled: []
      },
      payables: []
    }),
    createPayable: vi.fn().mockResolvedValue({ id: 'pay-created' })
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionRead.mockReturnValue({
    token: 'token-finance',
    expires_at: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'user-finance',
      username: 'financeiro',
      display_name: 'Financeiro',
      role: 'custom',
      permissions: ['finance.read', 'finance.write']
    }
  });
});

test('payables page renders and submits a new payable', async () => {
  const user = userEvent.setup();
  render(<FinancePayablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de obrigações' })).toBeInTheDocument();
  expect(screen.getByText('Atrasados')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Descrição'), 'Licença mensal');
  await user.type(screen.getByLabelText('Fornecedor'), 'Vendor');
  await user.type(screen.getByLabelText('Valor (R$)'), '98,00');
  await user.click(screen.getByRole('button', { name: 'Registrar conta a pagar' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createPayable).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Licença mensal',
        supplier_name: 'Vendor',
        amount_cents: 9800
      })
    );
  });
});

test('payables page shows the shared empty state when a bucket has no rows', async () => {
  const { financeApi } = await import('../api');
  vi.mocked(financeApi.listPayables).mockResolvedValueOnce({
    company_id: 'company-finance',
    company_name: 'Empresa Financeira',
    summary: { open_cents: 0, overdue_cents: 0, due_today_cents: 0 },
    groups: {
      overdue: [],
      due_today: [],
      upcoming: [],
      settled: []
    },
    payables: []
  });

  render(<FinancePayablesPage />);

  expect(await screen.findByText('Nenhuma obrigação atrasada neste recorte.')).toBeInTheDocument();
});
