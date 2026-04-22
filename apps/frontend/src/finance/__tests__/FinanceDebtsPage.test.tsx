import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceDebtsPage } from '../pages/FinanceDebtsPage';

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
    listDebts: vi.fn().mockResolvedValue({
      debts: [
        {
          id: 'debt-1',
          debt_type: 'operacional',
          status: 'open',
          principal_amount_cents: 450000,
          outstanding_amount_cents: 450000,
          due_date: '2026-05-10',
          settled_at: null,
          note: 'Fornecedor estratégico'
        }
      ]
    }),
    createDebt: vi.fn().mockResolvedValue({ id: 'debt-created' })
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

test('debts page renders and submits a new debt', async () => {
  const user = userEvent.setup();
  render(<FinanceDebtsPage />);

  expect(await screen.findByRole('heading', { name: 'Passivos controlados' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Dívidas registradas' })).toBeInTheDocument();

  await user.clear(screen.getByLabelText('Tipo da dívida'));
  await user.type(screen.getByLabelText('Tipo da dívida'), 'fiscal');
  await user.type(screen.getByLabelText('Principal (R$)'), '450,00');
  await user.type(screen.getByLabelText('Saldo pendente (R$)'), '450,00');
  await user.click(screen.getByRole('button', { name: 'Registrar dívida' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createDebt).toHaveBeenCalledWith(
      expect.objectContaining({
        debt_type: 'fiscal',
        principal_amount_cents: 45000,
        outstanding_amount_cents: 45000
      })
    );
  });
});
