import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceReceivablesPage } from '../pages/FinanceReceivablesPage';

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
    listReceivables: vi.fn().mockResolvedValue({
      summary: { open_cents: 125500, overdue_cents: 125500, due_today_cents: 0 },
      groups: {
        overdue: [
          {
            id: 'recv-1',
            description: 'Contrato mensal',
            customer_name: 'ACME',
            amount_cents: 125500,
            status: 'overdue',
            due_date: '2026-04-18',
            issue_date: '2026-04-01',
            received_at: null,
            financial_account_name: null,
            financial_category_name: null
          }
        ],
        due_today: [],
        upcoming: [],
        settled: []
      },
      receivables: []
    }),
    createReceivable: vi.fn().mockResolvedValue({ id: 'recv-created' })
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

test('receivables page renders and submits a new receivable', async () => {
  const user = userEvent.setup();
  render(<FinanceReceivablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de recebíveis' })).toBeInTheDocument();
  expect(screen.getByText('Atrasados')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Descrição'), 'Contrato mensal');
  await user.type(screen.getByLabelText('Cliente'), 'ACME');
  await user.type(screen.getByLabelText('Valor (R$)'), '125,50');
  await user.click(screen.getByRole('button', { name: 'Registrar conta a receber' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createReceivable).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Contrato mensal',
        customer_name: 'ACME',
        amount_cents: 12550
      })
    );
  });
});

test('receivables page shows the shared empty state when a bucket has no rows', async () => {
  const { financeApi } = await import('../api');
  vi.mocked(financeApi.listReceivables).mockResolvedValueOnce({
    company_id: 'company-finance',
    company_name: 'Empresa Financeira',
    summary: { open_cents: 0, overdue_cents: 0, due_today_cents: 0 },
    groups: {
      overdue: [],
      due_today: [],
      upcoming: [],
      settled: []
    },
    receivables: []
  });

  render(<FinanceReceivablesPage />);

  expect(await screen.findByText('Nenhum recebível atrasado neste recorte.')).toBeInTheDocument();
});
