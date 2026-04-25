import userEvent from '@testing-library/user-event';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  FINANCE_QUICK_LAUNCH_CREATED_EVENT,
  FinanceFloatingQuickLauncher
} from '../components/FinanceFloatingQuickLauncher';

const mocks = vi.hoisted(() => ({
  createPayable: vi.fn(),
  createReceivable: vi.fn(),
  createRecurringRuleFromResource: vi.fn(),
  createTransaction: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    getCatalogSnapshot: vi.fn().mockResolvedValue({
      accounts: [
        {
          id: 'acc-1',
          organization_id: 'org-holand',
          company_id: 'comp-1',
          name: 'Banco principal',
          kind: 'bank',
          currency: 'BRL',
          account_number: null,
          branch_number: null,
          is_active: true,
          created_at: '2026-04-22T09:00:00.000Z',
          updated_at: '2026-04-22T09:00:00.000Z'
        }
      ],
      categories: [
        {
          id: 'cat-expense',
          organization_id: 'org-holand',
          company_id: 'comp-1',
          name: 'Aluguel',
          kind: 'expense',
          parent_category_id: null,
          is_active: true,
          created_at: '2026-04-22T09:00:00.000Z',
          updated_at: '2026-04-22T09:00:00.000Z'
        },
        {
          id: 'cat-income',
          organization_id: 'org-holand',
          company_id: 'comp-1',
          name: 'Mensalidades',
          kind: 'income',
          parent_category_id: null,
          is_active: true,
          created_at: '2026-04-22T09:00:00.000Z',
          updated_at: '2026-04-22T09:00:00.000Z'
        }
      ],
      cost_centers: [],
      payment_methods: []
    }),
    listEntities: vi.fn().mockResolvedValue([
      {
        id: 'ent-1',
        organization_id: 'org-holand',
        legal_name: 'Fornecedor Alpha LTDA',
        trade_name: 'Fornecedor Alpha',
        document_number: null,
        kind: 'supplier',
        email: null,
        phone: null,
        is_active: true,
        created_at: '2026-04-22T09:00:00.000Z',
        updated_at: '2026-04-22T09:00:00.000Z'
      }
    ]),
    createPayable: mocks.createPayable,
    createReceivable: mocks.createReceivable,
    createRecurringRuleFromResource: mocks.createRecurringRuleFromResource,
    createTransaction: mocks.createTransaction
  }
}));

beforeEach(() => {
  mocks.createPayable.mockReset();
  mocks.createReceivable.mockReset();
  mocks.createRecurringRuleFromResource.mockReset();
  mocks.createTransaction.mockReset();
  mocks.createPayable.mockResolvedValue({ id: 'pay-quick' });
  mocks.createReceivable.mockResolvedValue({ id: 'rec-quick' });
  mocks.createRecurringRuleFromResource.mockResolvedValue({
    rule: { id: 'rule-quick' },
    payables: [],
    receivables: []
  });
  mocks.createTransaction.mockResolvedValue({ id: 'txn-quick' });
});

test('FinanceFloatingQuickLauncher creates a payable without leaving the current page', async () => {
  const user = userEvent.setup();
  const created = vi.fn();
  window.addEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, created);

  render(
    <MemoryRouter initialEntries={['/financeiro/payables']}>
      <FinanceFloatingQuickLauncher />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir lançamento rápido' }));
  await user.type(await screen.findByLabelText('Descrição'), 'Aluguel sala');
  await user.type(screen.getByLabelText('Fornecedor'), 'Fornecedor Alpha');
  await user.type(screen.getByLabelText('Valor'), '6800,00');
  await screen.findByRole('option', { name: 'Aluguel' });
  await user.selectOptions(screen.getByLabelText('Categoria'), 'cat-expense');
  await user.click(screen.getByLabelText('Já foi pago agora'));
  await user.click(screen.getByRole('button', { name: 'Concluir lançamento' }));

  await waitFor(() => expect(mocks.createPayable).toHaveBeenCalledTimes(1));
  expect(mocks.createPayable).toHaveBeenCalledWith(expect.objectContaining({
    financial_entity_id: 'ent-1',
    financial_category_id: 'cat-expense',
    description: 'Aluguel sala',
    amount_cents: 680000,
    paid_amount_cents: 680000,
    status: 'paid'
  }));
  expect(created).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Conta a pagar lançada.')).toBeInTheDocument();

  window.removeEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, created);
});

test('FinanceFloatingQuickLauncher creates a monthly recurring payable from one launch', async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={['/financeiro/payables']}>
      <FinanceFloatingQuickLauncher />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir lançamento rápido' }));
  await user.type(await screen.findByLabelText('Descrição'), 'Aluguel mensal');
  await user.type(screen.getByLabelText('Fornecedor'), 'Fornecedor Alpha');
  await user.type(screen.getByLabelText('Valor'), '6800,00');
  await user.selectOptions(await screen.findByLabelText('Categoria'), 'cat-expense');
  await user.click(screen.getByRole('button', { name: 'Mensal fixo' }));
  await user.click(screen.getByRole('button', { name: 'Concluir lançamento' }));

  await waitFor(() => expect(mocks.createPayable).toHaveBeenCalledTimes(1));
  expect(mocks.createRecurringRuleFromResource).toHaveBeenCalledWith(expect.objectContaining({
    resource_type: 'payable',
    resource_id: 'pay-quick',
    materialization_months: 3
  }));
  expect(await screen.findByText('Conta a pagar mensal fixa lançada.')).toBeInTheDocument();
});

test('FinanceFloatingQuickLauncher creates installments without duplicating a total account', async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={['/financeiro/payables']}>
      <FinanceFloatingQuickLauncher />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir lançamento rápido' }));
  await user.type(await screen.findByLabelText('Descrição'), 'Notebooks');
  await user.type(screen.getByLabelText('Fornecedor'), 'Fornecedor Alpha');
  await user.type(screen.getByLabelText('Valor'), '10000,00');
  await user.click(screen.getByRole('button', { name: 'Parcelado' }));
  await user.clear(screen.getByLabelText('Parcelas'));
  await user.type(screen.getByLabelText('Parcelas'), '10');
  await user.click(within(screen.getByRole('radiogroup', { name: 'Parcela inicial' })).getByRole('radio', { name: '4' }));
  await user.click(screen.getByRole('button', { name: 'Concluir lançamento' }));

  await waitFor(() => expect(mocks.createPayable).toHaveBeenCalledTimes(7));
  expect(mocks.createPayable).toHaveBeenNthCalledWith(1, expect.objectContaining({
    description: 'Notebooks 4/10',
    amount_cents: 100000,
    due_date: expect.any(String),
    status: 'open'
  }));
  expect(mocks.createPayable).toHaveBeenNthCalledWith(7, expect.objectContaining({
    description: 'Notebooks 10/10',
    amount_cents: 100000,
    status: 'open'
  }));
  expect(mocks.createRecurringRuleFromResource).not.toHaveBeenCalled();
  expect(await screen.findByText('7 contas a pagar parceladas lançadas.')).toBeInTheDocument();
});

test('FinanceFloatingQuickLauncher creates a direct ledger movement from the same compact panel', async () => {
  const user = userEvent.setup();

  render(
    <MemoryRouter initialEntries={['/financeiro/overview']}>
      <FinanceFloatingQuickLauncher />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir lançamento rápido' }));
  await user.click(await screen.findByRole('button', { name: 'Movimento direto' }));
  await user.click(screen.getByRole('button', { name: 'Entrada' }));
  await user.type(screen.getByLabelText('Descrição'), 'Aporte pontual');
  await user.type(screen.getByLabelText('Valor'), '1200,50');
  await screen.findByRole('option', { name: 'Mensalidades' });
  await user.selectOptions(screen.getByLabelText('Categoria'), 'cat-income');
  await user.click(screen.getByRole('button', { name: 'Concluir lançamento' }));

  await waitFor(() => expect(mocks.createTransaction).toHaveBeenCalledTimes(1));
  expect(mocks.createTransaction).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'income',
    status: 'settled',
    financial_category_id: 'cat-income',
    note: 'Aporte pontual',
    amount_cents: 120050
  }));
  expect(await screen.findByText('Movimento direto lançado.')).toBeInTheDocument();
});
