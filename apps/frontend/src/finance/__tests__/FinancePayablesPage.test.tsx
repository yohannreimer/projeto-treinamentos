import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinancePayablesPage } from '../pages/FinancePayablesPage';
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
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    listCategories: vi.fn().mockResolvedValue({ categories: [] }),
    listEntities: vi.fn().mockResolvedValue([
      {
        id: 'ent-vendor',
        organization_id: 'org-holand',
        legal_name: 'Vendor Serviços Ltda',
        trade_name: 'Vendor',
        document_number: null,
        kind: 'supplier',
        email: null,
        phone: null,
        is_active: true,
        created_at: '2026-04-22T09:00:00.000Z',
        updated_at: '2026-04-22T09:00:00.000Z'
      }
    ]),
    getCatalogSnapshot: vi.fn().mockResolvedValue({
      accounts: [{ id: 'acc-1', organization_id: 'org-holand', company_id: 'comp-1', name: 'Banco principal', kind: 'bank', currency: 'BRL', account_number: null, branch_number: null, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
      categories: [{ id: 'cat-1', organization_id: 'org-holand', company_id: 'comp-1', name: 'Software', kind: 'expense', parent_category_id: null, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
      cost_centers: [{ id: 'cc-1', organization_id: 'org-holand', name: 'Operações', code: 'OPS', is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
      payment_methods: [{ id: 'pm-1', organization_id: 'org-holand', name: 'PIX', kind: 'pix', is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }]
    }),
    getEntityDefaultProfile: vi.fn().mockResolvedValue({
      id: 'profile-payable',
      organization_id: 'org-holand',
      financial_entity_id: 'ent-vendor',
      context: 'payable',
      financial_category_id: 'cat-1',
      financial_category_name: 'Software',
      financial_cost_center_id: 'cc-1',
      financial_cost_center_name: 'Operações',
      financial_account_id: 'acc-1',
      financial_account_name: 'Banco principal',
      financial_payment_method_id: 'pm-1',
      financial_payment_method_name: 'PIX',
      due_rule: null,
      competence_rule: null,
      recurrence_rule: null,
      is_active: true,
      created_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T09:00:00.000Z'
    }),
    createEntity: vi.fn().mockImplementation(async (payload) => ({
      id: 'ent-created-supplier',
      organization_id: 'org-holand',
      legal_name: payload.legal_name,
      trade_name: payload.trade_name ?? null,
      document_number: payload.document_number ?? null,
      kind: payload.kind,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      is_active: payload.is_active ?? true,
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    })),
    listPayables: vi.fn().mockResolvedValue({
      summary: { open_cents: 98000, overdue_cents: 98000, due_today_cents: 0 },
      groups: {
        overdue: [
          {
            id: 'pay-1',
            description: 'Licença de software',
            supplier_name: 'Vendor',
            amount_cents: 98000,
            paid_amount_cents: 0,
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
    createPayable: vi.fn().mockResolvedValue({ id: 'pay-created' }),
    settlePayable: vi.fn().mockResolvedValue({ id: 'pay-1', status: 'paid', paid_amount_cents: 98000 }),
    partiallySettlePayable: vi.fn().mockResolvedValue({ id: 'pay-1', status: 'partial', paid_amount_cents: 25000 }),
    duplicatePayable: vi.fn().mockResolvedValue({ id: 'pay-copy' }),
    cancelPayable: vi.fn().mockResolvedValue({ id: 'pay-1', status: 'canceled' }),
    createPayableInstallments: vi.fn().mockResolvedValue({ payables: [] }),
    createPayableRecurrences: vi.fn().mockResolvedValue({ payables: [] })
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
      permissions: ['finance.read', 'finance.write']
    }
  });
});

test('payables page renders and submits a new payable', async () => {
  const user = userEvent.setup();
  render(<FinancePayablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de obrigações' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nova conta a pagar' })).toBeInTheDocument();
  expect(screen.getAllByText('Atrasados').length).toBeGreaterThan(0);

  await user.type(screen.getByLabelText('Descrição'), 'Licença mensal');
  await user.type(screen.getByLabelText('Fornecedor'), 'Ven');
  await user.click(await screen.findByRole('button', { name: 'Vendor' }));
  await user.type(screen.getByLabelText('Valor (R$)'), '98,00');
  await user.click(screen.getByRole('button', { name: 'Registrar conta a pagar' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createPayable).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Licença mensal',
        financial_entity_id: 'ent-vendor',
        financial_category_id: 'cat-1',
        financial_cost_center_id: 'cc-1',
        financial_account_id: 'acc-1',
        financial_payment_method_id: 'pm-1',
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

  expect(await screen.findByText('Nenhuma obrigação em atraso.')).toBeInTheDocument();
});

test('payables page sends paid_at when status is pago', async () => {
  const user = userEvent.setup();
  render(<FinancePayablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de obrigações' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Descrição'), 'Obrigação liquidada');
  await user.type(screen.getByLabelText('Fornecedor'), 'Fornecedor XPTO');
  await user.type(screen.getByLabelText('Valor (R$)'), '20,00');
  await user.selectOptions(screen.getByLabelText('Status'), 'pago');
  await user.click(screen.getByRole('button', { name: 'Registrar conta a pagar' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createPayable).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paid',
        paid_at: todayIso()
      })
    );
  });
});

test('payables page runs daily operation actions', async () => {
  const user = userEvent.setup();
  render(<FinancePayablesPage />);

  await user.selectOptions(await screen.findByLabelText('Período financeiro'), 'all');
  await user.click(await screen.findByRole('button', { name: 'Baixar' }));

  const { financeApi } = await import('../api');
  expect(financeApi.settlePayable).toHaveBeenCalledWith('pay-1', { settled_at: todayIso() });

  await user.click(screen.getByRole('button', { name: 'Parcial' }));
  await user.type(screen.getByLabelText('Valor parcial'), '250,00');
  await user.click(screen.getByRole('button', { name: 'Aplicar' }));
  expect(financeApi.partiallySettlePayable).toHaveBeenCalledWith('pay-1', {
    amount_cents: 25000,
    settled_at: todayIso()
  });
});

test('payables page can create and use a missing supplier from the form', async () => {
  const user = userEvent.setup();
  render(<FinancePayablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de obrigações' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Fornecedor'), 'Novo Fornecedor');
  expect(screen.getByText('Esta entidade não existe no cadastro.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cadastrar e usar' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createEntity).toHaveBeenCalledWith(expect.objectContaining({
      legal_name: 'Novo Fornecedor',
      kind: 'supplier'
    }));
  });
  expect(screen.getByLabelText('Fornecedor')).toHaveValue('Novo Fornecedor');
});

test('payables page clears the form back to the initial state', async () => {
  const user = userEvent.setup();
  render(<FinancePayablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de obrigações' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Descrição'), 'Obrigação temporária');
  await user.type(screen.getByLabelText('Fornecedor'), 'Fornecedor XPTO');
  await user.type(screen.getByLabelText('Valor (R$)'), '32,00');
  await user.type(screen.getByLabelText('Observação'), 'Anotação temporária');
  await user.click(screen.getByRole('button', { name: 'Limpar' }));

  expect(screen.getByLabelText('Descrição')).toHaveValue('');
  expect(screen.getByLabelText('Fornecedor')).toHaveValue('');
  expect(screen.getByLabelText('Valor (R$)')).toHaveValue('');
  expect(screen.getByLabelText('Observação')).toHaveValue('');
  expect(screen.getByLabelText('Status')).toHaveValue('pendente');
});
