import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceTransactionsPage } from '../pages/FinanceTransactionsPage';
import { todayIso } from '../utils/financeFormatters';

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
    listTransactions: vi.fn().mockResolvedValue({
      transactions: [
        {
          id: 'ftxn-1',
          organization_id: 'org-holand',
          financial_entity_id: 'entity-1',
          financial_entity_name: 'Alpha Serviços',
          financial_account_id: 'facc-1',
          financial_account_name: 'Conta Operacional',
          financial_category_id: 'fcat-1',
          financial_category_name: 'Despesas Operacionais',
          kind: 'expense',
          status: 'open',
          amount_cents: 12500,
          issue_date: '2026-04-20',
          due_date: '2026-04-25',
          settlement_date: null,
          competence_date: '2026-04-20',
          source: 'manual',
          source_ref: null,
          note: 'Mensalidade de serviços',
          created_by: 'finance.user',
          created_at: '2026-04-20T10:00:00.000Z',
          updated_at: '2026-04-20T10:00:00.000Z',
          is_deleted: false,
          views: {
            signed_amount_cents: -12500,
            cash_amount_cents: 0,
            competence_amount_cents: -12500,
            projected_amount_cents: -12500,
            confirmed_amount_cents: 0,
            competence_anchor_date: '2026-04-20',
            cash_anchor_date: null,
            projected_anchor_date: '2026-04-25'
          }
        }
      ]
    }),
    listEntities: vi.fn().mockResolvedValue([
      {
        id: 'entity-1',
        organization_id: 'org-holand',
        legal_name: 'Alpha Serviços LTDA',
        trade_name: 'Alpha Serviços',
        document_number: '12.345.678/0001-90',
        kind: 'supplier',
        email: 'financeiro@alpha.com',
        phone: null,
        is_active: true,
        created_at: '2026-04-20T10:00:00.000Z',
        updated_at: '2026-04-20T10:00:00.000Z'
      }
    ]),
    listAccounts: vi.fn().mockResolvedValue({
      company_id: null,
      company_name: null,
      accounts: [
        {
          id: 'facc-1',
          organization_id: 'org-holand',
          company_id: 'company-holand',
          name: 'Conta Operacional',
          kind: 'bank',
          currency: 'BRL',
          account_number: null,
          branch_number: null,
          is_active: true,
          created_at: '2026-04-20T10:00:00.000Z',
          updated_at: '2026-04-20T10:00:00.000Z'
        }
      ]
    }),
    listCategories: vi.fn().mockResolvedValue({
      company_id: null,
      company_name: null,
      categories: [
        {
          id: 'fcat-1',
          organization_id: 'org-holand',
          company_id: 'company-holand',
          name: 'Despesas Operacionais',
          kind: 'expense',
          parent_category_id: null,
          is_active: true,
          created_at: '2026-04-20T10:00:00.000Z',
          updated_at: '2026-04-20T10:00:00.000Z'
        }
      ]
    }),
    getOverview: vi.fn(),
    getContext: vi.fn(),
    createTransaction: vi.fn().mockResolvedValue({
      id: 'ftxn-2',
      organization_id: 'org-holand',
      financial_entity_id: 'entity-1',
      financial_entity_name: 'Alpha Serviços',
      financial_account_id: 'facc-1',
      financial_account_name: 'Conta Operacional',
      financial_category_id: 'fcat-1',
      financial_category_name: 'Despesas Operacionais',
      kind: 'expense',
      status: 'open',
      amount_cents: 20000,
      issue_date: '2026-04-20',
      due_date: '2026-04-25',
      settlement_date: null,
      competence_date: '2026-04-20',
      source: 'manual',
      source_ref: null,
      note: 'Novo lançamento',
      created_by: 'finance.user',
      created_at: '2026-04-20T10:00:00.000Z',
      updated_at: '2026-04-20T10:00:00.000Z',
      is_deleted: false,
      views: {
        signed_amount_cents: -20000,
        cash_amount_cents: 0,
        competence_amount_cents: -20000,
        projected_amount_cents: -20000,
        confirmed_amount_cents: 0,
        competence_anchor_date: '2026-04-20',
        cash_anchor_date: null,
        projected_anchor_date: '2026-04-25'
      }
    }),
    updateTransaction: vi.fn().mockResolvedValue({
      id: 'ftxn-1'
    }),
    deleteTransaction: vi.fn().mockResolvedValue({
      ok: true,
      transaction: { id: 'ftxn-1' }
    })
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
      role: 'supremo',
      permissions: ['finance.read', 'finance.write', 'finance.approve']
    }
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

test('transactions page renders ledger filters, supports editing and deleting rows', async () => {
  render(<FinanceTransactionsPage />);

  const filtersPanel = await screen.findByRole('region', { name: 'Filtros do ledger' });
  expect(within(filtersPanel).getByLabelText('Busca')).toBeInTheDocument();
  expect(within(filtersPanel).getByLabelText('Status')).toBeInTheDocument();
  expect(within(filtersPanel).getByLabelText('Tipo')).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Ledger financeiro' })).toBeInTheDocument();

  const rowButton = await screen.findByRole('button', { name: /mensalidade de serviços/i });
  rowButton.click();

  await waitFor(() => {
    expect(screen.getByRole('region', { name: 'Detalhes do lançamento' })).toHaveTextContent('Alpha Serviços');
  });

  const details = screen.getByRole('region', { name: 'Detalhes do lançamento' });
  expect(within(details).getAllByText('Conta Operacional').length).toBeGreaterThan(0);
  expect(within(details).getAllByText('Despesas Operacionais').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: 'Editar linha' }));
  fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '230,00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alteração' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.updateTransaction).toHaveBeenCalledWith(
      'ftxn-1',
      expect.objectContaining({
        amount_cents: 23000,
        financial_entity_id: 'entity-1'
      })
    );
  });

  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  await waitFor(() => {
    expect(financeApi.deleteTransaction).toHaveBeenCalledWith('ftxn-1');
  });
});

test('transactions page auto-fills settlement_date when creating a settled transaction', async () => {
  const { financeApi } = await import('../api');
  const user = (await import('@testing-library/user-event')).default.setup();
  render(<FinanceTransactionsPage />);

  await screen.findByRole('region', { name: 'Filtros do ledger' });

  await user.click(screen.getByRole('button', { name: 'Novo lançamento' }));
  await user.type(screen.getByLabelText('Descrição'), 'Lançamento liquidado');
  await user.type(screen.getByLabelText('Valor'), '100,00');
  await user.selectOptions(screen.getByLabelText('Status do lançamento'), 'settled');
  await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

  await waitFor(() => {
      expect(financeApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'settled',
          settlement_date: todayIso()
        })
      );
  });
});

test('transactions page can open a draft and cancel it without persisting', async () => {
  const { financeApi } = await import('../api');
  const user = (await import('@testing-library/user-event')).default.setup();
  render(<FinanceTransactionsPage />);

  await screen.findByRole('region', { name: 'Filtros do ledger' });

  await user.click(screen.getByRole('button', { name: 'Novo lançamento' }));
  await user.type(screen.getByLabelText('Descrição'), 'Rascunho descartado');
  await user.type(screen.getByLabelText('Valor'), '15,00');
  await user.click(screen.getByRole('button', { name: 'Fechar' }));

  expect(screen.queryByDisplayValue('Rascunho descartado')).not.toBeInTheDocument();
  expect(financeApi.createTransaction).not.toHaveBeenCalled();
});
