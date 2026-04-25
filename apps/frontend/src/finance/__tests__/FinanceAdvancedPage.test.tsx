import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceAdvancedPage } from '../pages/FinanceAdvancedPage';

vi.mock('../api', () => ({
  financeApiUrl: (path: string) => `http://localhost:4000${path}`,
  financeApi: {
    getAdvancedDashboard: vi.fn().mockResolvedValue({
      organization_id: 'org-holand',
      generated_at: '2026-04-23T20:00:00.000Z',
      cockpit: {
        sections: {
          decisions: { label: 'Decisões pendentes', count: 1, severity: 'warning' },
          risks: { label: 'Riscos de controle', count: 1, severity: 'critical' },
          rules: { label: 'Regras ativas', count: 1, severity: 'neutral' },
          audit: { label: 'Eventos auditados', count: 1, severity: 'neutral' }
        },
        recommended_actions: [
          {
            id: 'review-approvals',
            label: 'Resolver aprovações',
            description: 'Existe um pagamento aguardando decisão.',
            target: 'approvals'
          }
        ]
      },
      assisted_rule_templates: [
        {
          id: 'high-payments',
          label: 'Pedir aprovação para pagamentos altos',
          description: 'Envia pagamentos acima do limite para decisão.',
          trigger_type: 'payable.created',
          default_conditions: { min_amount_cents: 500000 },
          action_type: 'request_approval',
          action_payload: { queue: 'finance.approval' }
        }
      ],
      automation_rules: [
        {
          id: 'rule-1',
          organization_id: 'org-holand',
          company_id: null,
          name: 'Aprovar acima de 5 mil',
          trigger_type: 'payable.created',
          conditions: { min_amount_cents: 500000 },
          action_type: 'request_approval',
          action_payload: { queue: 'finance.approval' },
          human_trigger: 'Quando uma conta a pagar for criada',
          human_conditions: ['Valor acima de R$ 5.000,00'],
          human_action: 'Pedir aprovação antes de pagar',
          last_run_at: null,
          execution_count: 0,
          recommended_action: null,
          is_active: true,
          created_by: 'financeiro',
          created_at: '2026-04-23T18:00:00.000Z',
          updated_at: '2026-04-23T18:00:00.000Z'
        }
      ],
      approval_queue: [
        {
          id: 'approval-pay-1',
          payable_id: 'pay-1',
          description: 'Fornecedor crítico',
          amount_cents: 650000,
          due_date: '2026-04-30',
          supplier_name: 'Atlas',
          severity: 'normal'
        }
      ],
      attachments: [],
      audit_entries: [
        {
          id: 'audit-1',
          organization_id: 'org-holand',
          company_id: null,
          resource_type: 'payable',
          resource_id: 'pay-1',
          action: 'settle',
          amount_cents: 650000,
          note: 'Baixa operacional',
          created_by: 'financeiro',
          created_at: '2026-04-23T19:00:00.000Z'
        }
      ],
      bank_integrations: [],
      permission_matrix: [
        { permission: 'finance.read', label: 'Leitura financeira', scope: 'Visualizar dados e relatorios', enabled_for_current_user: true },
        { permission: 'finance.approve', label: 'Aprovacao', scope: 'Aprovar pagamentos', enabled_for_current_user: true }
      ],
      export_options: [
        { dataset: 'payables', label: 'Contas a pagar', csv_url: '/finance/exports?dataset=payables&format=csv', pdf_url: '/finance/exports?dataset=payables&format=pdf' }
      ],
      summary: {
        active_rule_count: 1,
        pending_approval_count: 1,
        attachment_count: 0,
        integration_count: 0
      }
    }),
    createAutomationRule: vi.fn().mockResolvedValue({ id: 'rule-created' }),
    toggleAutomationRule: vi.fn().mockResolvedValue({ id: 'rule-1', is_active: false }),
    approvePayable: vi.fn().mockResolvedValue({ id: 'audit-approve', action: 'approve_payment' }),
    createAttachment: vi.fn().mockResolvedValue({ id: 'att-1' }),
    createBankIntegration: vi.fn().mockResolvedValue({ id: 'bank-1' })
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('FinanceAdvancedPage renders advanced controls and actions', async () => {
  const user = userEvent.setup();
  render(<FinanceAdvancedPage />);

  expect(await screen.findByText('Cockpit de controle')).toBeInTheDocument();
  expect(screen.getByText('Quando isso acontecer, faça isso')).toBeInTheDocument();
  expect(screen.getByText('O que precisa de você')).toBeInTheDocument();
  expect(screen.getByText('Base de suporte')).toBeInTheDocument();
  expect(screen.getAllByText('Pedir aprovação para pagamentos altos')[0]).toBeInTheDocument();
  expect(screen.getByText('Aprovar acima de 5 mil')).toBeInTheDocument();
  expect(screen.getByText('Quando uma conta a pagar for criada')).toBeInTheDocument();
  expect(screen.queryByText('payable.created')).not.toBeInTheDocument();
  expect(screen.queryByText('request_approval')).not.toBeInTheDocument();

  expect(screen.getByText('Fornecedor crítico')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Aprovar' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.approvePayable).toHaveBeenCalledWith('pay-1', 'Pagamento aprovado pelo cockpit avançado.');
  });

  await user.click(screen.getByRole('button', { name: 'Exportações' }));
  expect(screen.getByRole('link', { name: 'CSV' })).toHaveAttribute('href', 'http://localhost:4000/finance/exports?dataset=payables&format=csv');

  await user.click(screen.getByRole('button', { name: 'Integrações' }));
  await user.click(screen.getByRole('button', { name: 'Conectar sandbox' }));
  await waitFor(() => {
    expect(financeApi.createBankIntegration).toHaveBeenCalledWith({
      provider: 'Open Finance Sandbox',
      status: 'sandbox',
      account_name: 'Conta operacional sandbox'
    });
  });
});
