import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceCadastrosPage } from '../pages/FinanceCadastrosPage';

vi.mock('../api', () => ({
  financeApi: {
    listEntities: vi.fn().mockResolvedValue([
      {
        id: 'ent-1',
        organization_id: 'org-holand',
        legal_name: 'ACME Comércio Ltda',
        trade_name: 'ACME',
        document_number: '12.345.678/0001-90',
        kind: 'customer',
        email: 'financeiro@acme.com',
        phone: '(47) 98888-1111',
        is_active: true,
        tags: [{ id: 'tag-cliente', organization_id: 'org-holand', name: 'Cliente recorrente', normalized_name: 'cliente recorrente', is_system: true, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
        created_at: '2026-04-22T09:00:00.000Z',
        updated_at: '2026-04-22T09:00:00.000Z'
      },
      {
        id: 'ent-2',
        organization_id: 'org-holand',
        legal_name: 'Delta Serviços S/A',
        trade_name: 'Delta Serviços',
        document_number: '98.765.432/0001-10',
        kind: 'supplier',
        email: 'contato@delta.com',
        phone: '(47) 97777-2222',
        is_active: true,
        tags: [{ id: 'tag-func', organization_id: 'org-holand', name: 'Funcionário', normalized_name: 'funcionario', is_system: true, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }],
        created_at: '2026-04-22T09:10:00.000Z',
        updated_at: '2026-04-22T09:10:00.000Z'
      },
      {
        id: 'ent-3',
        organization_id: 'org-holand',
        legal_name: 'Omega Holding Ltda',
        trade_name: 'Omega',
        document_number: null,
        kind: 'both',
        email: null,
        phone: null,
        is_active: false,
        tags: [],
        created_at: '2026-04-22T09:20:00.000Z',
        updated_at: '2026-04-22T09:20:00.000Z'
      }
    ]),
    getCatalogSnapshot: vi.fn().mockResolvedValue({
      accounts: [
        { id: 'acc-1', organization_id: 'org-holand', company_id: 'comp-1', name: 'Banco principal', kind: 'bank', currency: 'BRL', account_number: null, branch_number: null, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }
      ],
      categories: [
        { id: 'cat-1', organization_id: 'org-holand', company_id: 'comp-1', name: 'Receita recorrente', kind: 'income', parent_category_id: null, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }
      ],
      cost_centers: [
        { id: 'cc-1', organization_id: 'org-holand', name: 'Operações', code: 'OPS', is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }
      ],
      payment_methods: [
        { id: 'pm-1', organization_id: 'org-holand', name: 'PIX', kind: 'pix', is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }
      ]
    }),
    listEntityTags: vi.fn().mockResolvedValue([
      { id: 'tag-func', organization_id: 'org-holand', name: 'Funcionário', normalized_name: 'funcionario', is_system: true, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' },
      { id: 'tag-soft', organization_id: 'org-holand', name: 'Software', normalized_name: 'software', is_system: true, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' }
    ]),
    createEntityTag: vi.fn().mockImplementation(async (payload) => ({
      id: 'tag-created',
      organization_id: 'org-holand',
      name: payload.name,
      normalized_name: payload.name.toLowerCase(),
      is_system: false,
      is_active: payload.is_active ?? true,
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    })),
    listFavoriteCombinations: vi.fn().mockResolvedValue([]),
    listRecurringRules: vi.fn().mockResolvedValue({
      rules: [
        {
          id: 'rule-1',
          organization_id: 'org-holand',
          company_id: null,
          resource_type: 'payable',
          template_resource_id: 'pay-1',
          name: 'Aluguel sala',
          frequency: 'monthly',
          day_of_month: 15,
          start_date: '2026-04-15',
          end_date: null,
          materialization_months: 3,
          status: 'active',
          last_materialized_until: '2026-06-15',
          next_due_date: '2026-05-15',
          created_by: 'financeiro',
          created_at: '2026-04-22T10:00:00.000Z',
          updated_at: '2026-04-22T10:00:00.000Z'
        }
      ]
    }),
    updateRecurringRule: vi.fn().mockImplementation(async (_ruleId, payload) => ({
      id: 'rule-1',
      organization_id: 'org-holand',
      company_id: null,
      resource_type: 'payable',
      template_resource_id: 'pay-1',
      name: 'Aluguel sala',
      frequency: 'monthly',
      day_of_month: 15,
      start_date: '2026-04-15',
      end_date: payload.end_date ?? null,
      materialization_months: payload.materialization_months ?? 3,
      status: payload.status ?? 'active',
      last_materialized_until: '2026-06-15',
      next_due_date: '2026-05-15',
      created_by: 'financeiro',
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:30:00.000Z'
    })),
    listEntityDuplicates: vi.fn().mockResolvedValue([]),
    updateEntity: vi.fn().mockImplementation(async (_entityId, payload) => ({
      id: 'ent-1',
      organization_id: 'org-holand',
      legal_name: payload.legal_name ?? 'ACME Comércio Ltda',
      trade_name: payload.trade_name ?? null,
      document_number: payload.document_number ?? null,
      kind: payload.kind ?? 'customer',
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      is_active: payload.is_active ?? true,
      created_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    })),
    deleteEntity: vi.fn().mockResolvedValue({
      id: 'ent-1',
      organization_id: 'org-holand',
      legal_name: 'ACME Comércio Ltda',
      trade_name: 'ACME',
      document_number: '12.345.678/0001-90',
      kind: 'customer',
      email: 'financeiro@acme.com',
      phone: '(47) 98888-1111',
      is_active: false,
      tags: [],
      created_at: '2026-04-22T09:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    }),
    hardDeleteEntity: vi.fn().mockResolvedValue({ ok: true, id: 'ent-1' }),
    setEntityTags: vi.fn().mockImplementation(async (entityId, tagIds) => ({
      id: entityId,
      organization_id: 'org-holand',
      legal_name: 'Nova Empresa LTDA',
      trade_name: 'Nova Empresa',
      document_number: '11.222.333/0001-44',
      kind: 'supplier',
      email: 'financeiro@novaempresa.com',
      phone: '(47) 99999-0000',
      is_active: true,
      tags: tagIds.map((id: string) => ({ id, organization_id: 'org-holand', name: id === 'tag-func' ? 'Funcionário' : 'Software', normalized_name: id, is_system: true, is_active: true, created_at: '2026-04-22T09:00:00.000Z', updated_at: '2026-04-22T09:00:00.000Z' })),
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    })),
    upsertEntityDefaultProfile: vi.fn().mockResolvedValue({
      id: 'profile-1',
      organization_id: 'org-holand',
      financial_entity_id: 'ent-created',
      context: 'payable',
      financial_category_id: 'cat-1',
      financial_category_name: 'Receita recorrente',
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
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    }),
    getEntityDefaultProfile: vi.fn().mockResolvedValue(null),
    updateAccount: vi.fn(),
    createAccount: vi.fn().mockImplementation(async (payload) => ({
      id: 'acc-created',
      organization_id: 'org-holand',
      company_id: null,
      name: payload.name,
      kind: payload.kind,
      currency: payload.currency ?? 'BRL',
      account_number: payload.account_number ?? null,
      branch_number: payload.branch_number ?? null,
      is_active: payload.is_active ?? true,
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    })),
    deleteAccount: vi.fn(),
    hardDeleteAccount: vi.fn().mockResolvedValue({ ok: true, id: 'acc-1' }),
    createAccountBalanceAdjustment: vi.fn().mockResolvedValue({ id: 'tx-adjustment' }),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    hardDeleteCategory: vi.fn().mockResolvedValue({ ok: true, id: 'cat-1' }),
    createCostCenter: vi.fn(),
    updateCostCenter: vi.fn(),
    deleteCostCenter: vi.fn(),
    hardDeleteCostCenter: vi.fn().mockResolvedValue({ ok: true, id: 'cc-1' }),
    createPaymentMethod: vi.fn(),
    updatePaymentMethod: vi.fn(),
    deletePaymentMethod: vi.fn(),
    hardDeletePaymentMethod: vi.fn().mockResolvedValue({ ok: true, id: 'pm-1' }),
    createFavoriteCombination: vi.fn().mockImplementation(async (payload) => ({
      id: 'combo-created',
      organization_id: 'org-holand',
      name: payload.name,
      context: payload.context ?? 'any',
      financial_category_id: payload.financial_category_id ?? null,
      financial_category_name: payload.financial_category_id ? 'Receita recorrente' : null,
      financial_cost_center_id: payload.financial_cost_center_id ?? null,
      financial_cost_center_name: payload.financial_cost_center_id ? 'Operações' : null,
      financial_account_id: payload.financial_account_id ?? null,
      financial_account_name: payload.financial_account_id ? 'Banco principal' : null,
      financial_payment_method_id: payload.financial_payment_method_id ?? null,
      financial_payment_method_name: payload.financial_payment_method_id ? 'PIX' : null,
      is_active: payload.is_active ?? true,
      created_at: '2026-04-22T10:00:00.000Z',
      updated_at: '2026-04-22T10:00:00.000Z'
    })),
    updateFavoriteCombination: vi.fn(),
    deleteFavoriteCombination: vi.fn(),
    hardDeleteFavoriteCombination: vi.fn().mockResolvedValue({ ok: true, id: 'combo-created' }),
    deleteRecurringRule: vi.fn().mockResolvedValue({ ok: true, id: 'rule-1' }),
    createEntity: vi.fn().mockImplementation(async (payload) => ({
      id: 'ent-created',
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
    }))
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('cadastros page lists unified entities with customer and supplier filters', async () => {
  render(<FinanceCadastrosPage />);

  expect(await screen.findByRole('tab', { name: /Todos/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Clientes/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Fornecedores/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Contas/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Categorias/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Centros/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Formas/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Combinações/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Recorrências/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Duplicidades/i })).toBeInTheDocument();
  expect(screen.getByText('Defaults inteligentes')).toBeInTheDocument();
  expect(screen.getAllByText('Classificações').length).toBeGreaterThanOrEqual(1);
  expect(screen.getByLabelText('Nova classificação')).toBeInTheDocument();
  expect(screen.getByText('Usar estes defaults em')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nova entidade financeira' })).toBeInTheDocument();

  expect(screen.getByRole('table')).toBeInTheDocument();
  expect(screen.getByText('ACME Comércio Ltda')).toBeInTheDocument();
  expect(screen.getByText('Delta Serviços S/A')).toBeInTheDocument();
  expect(screen.getByText('Omega Holding Ltda')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: /Clientes/i }));

  const table = screen.getByRole('table');
  expect(within(table).getByText('ACME Comércio Ltda')).toBeInTheDocument();
  expect(within(table).getByText('Omega Holding Ltda')).toBeInTheDocument();
  expect(within(table).queryByText('Delta Serviços S/A')).not.toBeInTheDocument();
});

test('cadastros page creates a new entity and clears the form on demand', async () => {
  const user = userEvent.setup();
  render(<FinanceCadastrosPage />);

  expect(await screen.findByRole('heading', { name: 'Nova entidade financeira' })).toBeInTheDocument();

  await user.type(screen.getByLabelText('Razão social'), 'Nova Empresa LTDA');
  await user.type(screen.getByLabelText('Nome fantasia'), 'Nova Empresa');
  await user.type(screen.getByLabelText('CNPJ / CPF'), '11.222.333/0001-44');
  await user.click(screen.getByRole('button', { name: 'Fornecedor' }));
  await user.click(screen.getByRole('button', { name: 'Funcionário' }));
  await user.selectOptions(screen.getByLabelText('Categoria padrão'), 'cat-1');
  await user.selectOptions(screen.getByLabelText('Centro de custo padrão'), 'cc-1');
  await user.selectOptions(screen.getByLabelText('Conta padrão'), 'acc-1');
  await user.selectOptions(screen.getByLabelText('Forma de pagamento padrão'), 'pm-1');
  await user.type(screen.getByLabelText('E-mail'), 'financeiro@novaempresa.com');
  await user.type(screen.getByLabelText('Telefone'), '(47) 99999-0000');
  await user.click(screen.getByRole('button', { name: 'Cadastrar entidade' }));

  const { financeApi } = await import('../api');
  expect(financeApi.createEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      legal_name: 'Nova Empresa LTDA',
      trade_name: 'Nova Empresa',
      document_number: '11.222.333/0001-44',
      kind: 'supplier',
      email: 'financeiro@novaempresa.com',
      phone: '(47) 99999-0000',
      is_active: true
    })
  );
  expect(financeApi.setEntityTags).toHaveBeenCalledWith('ent-created', ['tag-func']);
  expect(financeApi.upsertEntityDefaultProfile).toHaveBeenCalledWith(
    'ent-created',
    'payable',
    expect.objectContaining({
      financial_category_id: 'cat-1',
      financial_cost_center_id: 'cc-1',
      financial_account_id: 'acc-1',
      financial_payment_method_id: 'pm-1',
      is_active: true
    })
  );

  expect(await screen.findByText('✓ Entidade cadastrada com sucesso!')).toBeInTheDocument();
  expect(screen.getByText('Nova Empresa LTDA')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Razão social'), 'Rascunho');
  await user.click(screen.getByRole('button', { name: 'Limpar' }));

  expect(screen.getByLabelText('Razão social')).toHaveValue('');
  expect(screen.getByLabelText('Nome fantasia')).toHaveValue('');
  expect(screen.getByLabelText('CNPJ / CPF')).toHaveValue('');
  expect(screen.getByLabelText('E-mail')).toHaveValue('');
  expect(screen.getByLabelText('Telefone')).toHaveValue('');
});

test('cadastros page creates catalog records, favorite combinations and shows duplicates', async () => {
  const user = userEvent.setup();
  const { financeApi } = await import('../api');

  vi.mocked(financeApi.listEntityDuplicates).mockResolvedValueOnce([
    {
      id: 'document_number:12345678000190',
      reason: 'document_number',
      label: '12345678000190',
      entities: [
        {
          id: 'ent-1',
          organization_id: 'org-holand',
          legal_name: 'ACME Comércio Ltda',
          trade_name: 'ACME',
          document_number: '12.345.678/0001-90',
          kind: 'customer',
          email: 'financeiro@acme.com',
          phone: '(47) 98888-1111',
          is_active: true,
          tags: [],
          created_at: '2026-04-22T09:00:00.000Z',
          updated_at: '2026-04-22T09:00:00.000Z'
        },
        {
          id: 'ent-duplicate',
          organization_id: 'org-holand',
          legal_name: 'ACME Comercio',
          trade_name: 'ACME duplicado',
          document_number: '12.345.678/0001-90',
          kind: 'customer',
          email: null,
          phone: null,
          is_active: true,
          tags: [],
          created_at: '2026-04-22T09:00:00.000Z',
          updated_at: '2026-04-22T09:00:00.000Z'
        }
      ]
    }
  ]);

  render(<FinanceCadastrosPage />);

  await user.click(await screen.findByRole('tab', { name: /Contas/i }));
  await user.type(screen.getByLabelText('Nome da conta'), 'Banco secundário');
  await user.selectOptions(screen.getByLabelText('Tipo da conta'), 'wallet');
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

  expect(financeApi.createAccount).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Banco secundário',
    kind: 'wallet'
  }));
  expect(await screen.findByText('Conta financeira salva.')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: /Combinações/i }));
  await user.type(screen.getByLabelText('Nome da combinação'), 'Receita Operações PIX');
  await user.selectOptions(screen.getByLabelText('Contexto da combinação'), 'receivable');
  await user.selectOptions(screen.getByLabelText('Categoria da combinação'), 'cat-1');
  await user.selectOptions(screen.getByLabelText('Centro da combinação'), 'cc-1');
  await user.selectOptions(screen.getByLabelText('Conta da combinação'), 'acc-1');
  await user.selectOptions(screen.getByLabelText('Forma da combinação'), 'pm-1');
  await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

  expect(financeApi.createFavoriteCombination).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Receita Operações PIX',
    context: 'receivable',
    financial_category_id: 'cat-1',
    financial_cost_center_id: 'cc-1',
    financial_account_id: 'acc-1',
    financial_payment_method_id: 'pm-1'
  }));
  expect(await screen.findByText('Combinação favorita salva.')).toBeInTheDocument();
  expect(screen.getByText('Receita Operações PIX')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: /Duplicidades/i }));
  expect(screen.getByText('12345678000190')).toBeInTheDocument();
  expect(screen.getByText('ACME Comercio')).toBeInTheDocument();
});

test('cadastros page manages monthly recurring commitments', async () => {
  const user = userEvent.setup();
  const { financeApi } = await import('../api');

  render(<FinanceCadastrosPage />);

  await user.click(await screen.findByRole('tab', { name: /Recorrências/i }));

  expect(screen.getByText('Compromissos recorrentes')).toBeInTheDocument();
  expect(screen.getByText('Aluguel sala')).toBeInTheDocument();
  expect(screen.getByText('Todo mês, dia 15')).toBeInTheDocument();
  expect(screen.getByText('Lançado até 15/06/2026')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Pausar' }));

  expect(financeApi.updateRecurringRule).toHaveBeenCalledWith('rule-1', expect.objectContaining({
    status: 'paused'
  }));
  expect(await screen.findByText('Recorrência pausada.')).toBeInTheDocument();
  expect(screen.getByText('Pausada')).toBeInTheDocument();
});
