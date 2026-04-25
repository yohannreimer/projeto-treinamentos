import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceReceivablesPage } from '../pages/FinanceReceivablesPage';
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
        id: 'ent-acme',
        organization_id: 'org-holand',
        legal_name: 'ACME Comércio Ltda',
        trade_name: 'ACME',
        document_number: null,
        kind: 'customer',
        email: null,
        phone: null,
        is_active: true,
        created_at: '2026-04-22T09:00:00.000Z',
        updated_at: '2026-04-22T09:00:00.000Z'
      }
    ]),
    getCatalogSnapshot: vi.fn().mockResolvedValue({
      accounts: [{ id: 'acc-1', organization_id: 'org-holand', company_id: 'comp-1', name: 'Banco recebimentos', kind: 'bank', currency: 'BRL', account_number: null, branch_number: null, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
      categories: [{ id: 'cat-1', organization_id: 'org-holand', company_id: 'comp-1', name: 'Receita recorrente', kind: 'income', parent_category_id: null, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
      cost_centers: [{ id: 'cc-1', organization_id: 'org-holand', name: 'Comercial', code: 'COM', is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
      payment_methods: [{ id: 'pm-1', organization_id: 'org-holand', name: 'PIX', kind: 'pix', is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }]
    }),
    getEntityDefaultProfile: vi.fn().mockResolvedValue({
      id: 'profile-receivable',
      organization_id: 'org-holand',
      financial_entity_id: 'ent-acme',
      context: 'receivable',
      financial_category_id: 'cat-1',
      financial_category_name: 'Receita recorrente',
      financial_cost_center_id: 'cc-1',
      financial_cost_center_name: 'Comercial',
      financial_account_id: 'acc-1',
      financial_account_name: 'Banco recebimentos',
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
      id: 'ent-created-customer',
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
    listReceivables: vi.fn().mockResolvedValue({
      summary: { open_cents: 125500, overdue_cents: 125500, due_today_cents: 0 },
      groups: {
        overdue: [
          {
            id: 'recv-1',
            description: 'Contrato mensal',
            customer_name: 'ACME',
            amount_cents: 125500,
            received_amount_cents: 0,
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
    createReceivable: vi.fn().mockResolvedValue({ id: 'recv-created' }),
    settleReceivable: vi.fn().mockResolvedValue({ id: 'recv-1', status: 'received', received_amount_cents: 125500 }),
    partiallySettleReceivable: vi.fn().mockResolvedValue({ id: 'recv-1', status: 'partial', received_amount_cents: 50000 }),
    duplicateReceivable: vi.fn().mockResolvedValue({ id: 'recv-copy' }),
    cancelReceivable: vi.fn().mockResolvedValue({ id: 'recv-1', status: 'canceled' }),
    createReceivableInstallments: vi.fn().mockResolvedValue({ receivables: [] }),
    createReceivableRecurrences: vi.fn().mockResolvedValue({ receivables: [] })
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

test('receivables page renders and submits a new receivable', async () => {
  const user = userEvent.setup();
  render(<FinanceReceivablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de recebíveis' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nova conta a receber' })).toBeInTheDocument();
  expect(screen.getAllByText('Atrasados').length).toBeGreaterThan(0);

  await user.type(screen.getByLabelText('Descrição'), 'Contrato mensal');
  await user.type(screen.getByLabelText('Cliente'), 'AC');
  await user.click(await screen.findByRole('button', { name: 'ACME' }));
  await user.type(screen.getByLabelText('Valor (R$)'), '125,50');
  await user.click(screen.getByRole('button', { name: 'Registrar conta a receber' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createReceivable).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Contrato mensal',
        financial_entity_id: 'ent-acme',
        financial_category_id: 'cat-1',
        financial_cost_center_id: 'cc-1',
        financial_account_id: 'acc-1',
        financial_payment_method_id: 'pm-1',
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

  expect(await screen.findByText('Nenhum recebível em atraso.')).toBeInTheDocument();
});

test('receivables page sends received_at when status is recebido', async () => {
  const user = userEvent.setup();
  render(<FinanceReceivablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de recebíveis' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Descrição'), 'Recebível quitado');
  await user.type(screen.getByLabelText('Cliente'), 'Cliente XPTO');
  await user.type(screen.getByLabelText('Valor (R$)'), '10,00');
  await user.selectOptions(screen.getByLabelText('Status'), 'recebido');
  await user.click(screen.getByRole('button', { name: 'Registrar conta a receber' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createReceivable).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'received',
        received_at: todayIso()
      })
    );
  });
});

test('receivables page runs daily operation actions', async () => {
  const user = userEvent.setup();
  render(<FinanceReceivablesPage />);

  await user.selectOptions(await screen.findByLabelText('Período financeiro'), 'all');
  await user.click(await screen.findByRole('button', { name: 'Baixar' }));

  const { financeApi } = await import('../api');
  expect(financeApi.settleReceivable).toHaveBeenCalledWith('recv-1', { settled_at: todayIso() });

  await user.click(screen.getByRole('button', { name: 'Parcial' }));
  await user.type(screen.getByLabelText('Valor parcial'), '500,00');
  await user.click(screen.getByRole('button', { name: 'Aplicar' }));
  expect(financeApi.partiallySettleReceivable).toHaveBeenCalledWith('recv-1', {
    amount_cents: 50000,
    settled_at: todayIso()
  });
});

test('receivables page can create and use a missing customer from the form', async () => {
  const user = userEvent.setup();
  render(<FinanceReceivablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de recebíveis' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Cliente'), 'Novo Cliente');
  expect(screen.getByText('Esta entidade não existe no cadastro.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cadastrar e usar' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createEntity).toHaveBeenCalledWith(expect.objectContaining({
      legal_name: 'Novo Cliente',
      kind: 'customer'
    }));
  });
  expect(screen.getByLabelText('Cliente')).toHaveValue('Novo Cliente');
});

test('receivables page clears the form back to the initial state', async () => {
  const user = userEvent.setup();
  render(<FinanceReceivablesPage />);

  expect(await screen.findByRole('heading', { name: 'Rotina operacional de recebíveis' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Descrição'), 'Recebível temporário');
  await user.type(screen.getByLabelText('Cliente'), 'Cliente XPTO');
  await user.type(screen.getByLabelText('Valor (R$)'), '55,00');
  await user.type(screen.getByLabelText('Observação'), 'Anotação temporária');
  await user.click(screen.getByRole('button', { name: 'Limpar' }));

  expect(screen.getByLabelText('Descrição')).toHaveValue('');
  expect(screen.getByLabelText('Cliente')).toHaveValue('');
  expect(screen.getByLabelText('Valor (R$)')).toHaveValue('');
  expect(screen.getByLabelText('Observação')).toHaveValue('');
  expect(screen.getByLabelText('Status')).toHaveValue('pendente');
});
