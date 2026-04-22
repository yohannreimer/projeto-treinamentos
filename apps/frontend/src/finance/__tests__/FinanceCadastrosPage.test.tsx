import userEvent from '@testing-library/user-event';
import { render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
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

test('cadastros page lists unified entities with customer and supplier filters', async () => {
  render(<FinanceCadastrosPage />);

  expect(await screen.findByRole('tab', { name: 'Todos' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Clientes' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Fornecedores' })).toBeInTheDocument();
  expect(screen.getByText('Contas financeiras')).toBeInTheDocument();
  expect(screen.getByText('Categorias')).toBeInTheDocument();
  expect(screen.getByText('Centros de custo')).toBeInTheDocument();
  expect(screen.getByText('Formas de pagamento')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nova entidade financeira' })).toBeInTheDocument();

  expect(screen.getByRole('table', { name: /entidades/i })).toBeInTheDocument();
  expect(screen.getByText('ACME Comércio Ltda')).toBeInTheDocument();
  expect(screen.getByText('Delta Serviços S/A')).toBeInTheDocument();
  expect(screen.getByText('Omega Holding Ltda')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('tab', { name: 'Clientes' }));

  const table = screen.getByRole('table', { name: /entidades/i });
  expect(within(table).getByText('ACME Comércio Ltda')).toBeInTheDocument();
  expect(within(table).getByText('Omega Holding Ltda')).toBeInTheDocument();
  expect(within(table).queryByText('Delta Serviços S/A')).not.toBeInTheDocument();
});
