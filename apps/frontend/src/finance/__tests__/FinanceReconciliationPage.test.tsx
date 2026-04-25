import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceReconciliationPage } from '../pages/FinanceReconciliationPage';

const mocks = vi.hoisted(() => ({
  sessionRead: vi.fn()
}));

vi.mock('../../auth/session', () => ({
  hasAnyPermission: vi.fn(() => true),
  internalSessionStore: {
    read: mocks.sessionRead
  }
}));

vi.mock('../../services/api', () => ({
  api: {
    companies: vi.fn().mockResolvedValue([
      { id: 'company-holand', name: 'Holand' }
    ])
  }
}));

vi.mock('../api', () => ({
  financeApi: {
    getReconciliationInbox: vi.fn().mockResolvedValue({
      organization_id: 'org-holand',
      organization_name: 'Holand',
      generated_at: '2026-04-22T15:00:00.000Z',
      summary: {
        pending_count: 2,
        pending_amount_cents: 424500,
        matched_today_count: 1,
        imported_jobs_count: 2,
        stale_count: 1,
        with_suggestion_count: 1,
        without_suggestion_count: 0
      },
      buckets: [
        {
          key: 'urgent',
          label: 'Na fila',
          count: 1,
          amount_cents: 124500,
          entries: [
            {
              id: 'stmt-1',
              organization_id: 'org-holand',
              company_id: 'company-holand',
              financial_account_id: 'acc-1',
              financial_account_name: 'Banco principal',
              financial_import_job_id: 'job-1',
              statement_date: '2026-04-22',
              posted_at: '2026-04-22',
              amount_cents: -124500,
              description: 'Fornecedor Atlas',
              reference_code: null,
              balance_cents: 1000000,
              source: 'ofx',
              source_ref: null,
              created_at: '2026-04-22T10:00:00.000Z',
              updated_at: '2026-04-22T10:00:00.000Z',
              matched_transaction_id: null,
              matched_at: null,
              queue_bucket: 'urgent',
              age_days: 4,
              suggestion_count: 1,
              suggested_matches: [
                {
                  financial_transaction_id: 'ftxn-1',
                  description: 'Mensalidade Atlas',
                  amount_cents: 124500,
                  kind: 'expense',
                  status: 'open',
                  due_date: '2026-04-22',
                  competence_date: '2026-04-22',
                  financial_entity_name: 'Atlas',
                  confidence_score: 0.92,
                  source: 'learned_rule',
                  amount_gap_cents: 0,
                  date_gap_days: 0,
                  description_score: 0.75,
                  learned_rule_id: 'rule-atlas',
                  learned_rule_label: 'Atlas',
                  reasons: [
                    { label: 'Valor exato', detail: 'O valor do extrato bate com o lançamento.', tone: 'positive' },
                    { label: 'Regra aprendida', detail: '2 decisões anteriores parecidas.', tone: 'positive' }
                  ]
                }
              ]
            }
          ]
        },
        { key: 'today', label: 'Importados', count: 0, amount_cents: 0, entries: [] },
        { key: 'review', label: 'Matches recentes', count: 0, amount_cents: 0, entries: [] }
      ],
      insights: [
        { id: 'coverage', label: 'Cobertura de sugestão', value: '100%', tone: 'neutral' },
        { id: 'manual-review', label: 'Sem sugestão', value: '0', tone: 'neutral' },
        { id: 'stale', label: 'Aging crítico', value: '1', tone: 'critical' }
      ],
      learned_rules: [
        {
          id: 'rule-atlas',
          label: 'Atlas',
          pattern: 'fornecedor atlas',
          usage_count: 2,
          confidence_boost: 0.16,
          financial_entity_name: 'Atlas',
          financial_category_name: 'Software',
          financial_cost_center_name: 'Operações'
        }
      ],
      inbox: [
        {
          id: 'stmt-1',
          organization_id: 'org-holand',
          company_id: 'company-holand',
          financial_account_id: 'acc-1',
          financial_account_name: 'Banco principal',
          financial_import_job_id: 'job-1',
          statement_date: '2026-04-22',
          posted_at: '2026-04-22',
          amount_cents: -124500,
          description: 'Fornecedor Atlas',
          reference_code: null,
          balance_cents: 1000000,
          source: 'ofx',
          source_ref: null,
          created_at: '2026-04-22T10:00:00.000Z',
          updated_at: '2026-04-22T10:00:00.000Z',
          matched_transaction_id: null,
          matched_at: null,
          queue_bucket: 'urgent',
          age_days: 4,
          suggestion_count: 1,
          suggested_matches: [
            {
              financial_transaction_id: 'ftxn-1',
              description: 'Mensalidade Atlas',
              amount_cents: 124500,
              kind: 'expense',
              status: 'open',
              due_date: '2026-04-22',
              competence_date: '2026-04-22',
              financial_entity_name: 'Atlas',
              confidence_score: 0.92,
              source: 'learned_rule',
              amount_gap_cents: 0,
              date_gap_days: 0,
              description_score: 0.75,
              learned_rule_id: 'rule-atlas',
              learned_rule_label: 'Atlas',
              reasons: [
                { label: 'Valor exato', detail: 'O valor do extrato bate com o lançamento.', tone: 'positive' },
                { label: 'Regra aprendida', detail: '2 decisões anteriores parecidas.', tone: 'positive' }
              ]
            }
          ]
        }
      ],
      recent_matches: [
        {
          id: 'match-1',
          organization_id: 'org-holand',
          company_id: 'company-holand',
          financial_bank_statement_entry_id: 'stmt-2',
          financial_transaction_id: 'ftxn-2',
          confidence_score: 0.98,
          match_status: 'matched',
          source: 'rule',
          reviewed_by: 'financeiro',
          reviewed_at: '2026-04-22T11:00:00.000Z',
          created_at: '2026-04-22T11:00:00.000Z',
          updated_at: '2026-04-22T11:00:00.000Z'
        }
      ],
      imported_jobs: [
        {
          id: 'job-1',
          organization_id: 'org-holand',
          company_id: 'company-holand',
          import_type: 'ofx',
          source_file_name: 'extrato-2026-04.ofx',
          source_file_mime_type: 'application/ofx',
          source_file_size_bytes: 2048,
          status: 'completed',
          total_rows: 54,
          processed_rows: 54,
          error_rows: 0,
          error_summary: null,
          created_by: 'financeiro',
          created_at: '2026-04-22T09:00:00.000Z',
          updated_at: '2026-04-22T09:10:00.000Z',
          finished_at: '2026-04-22T09:10:00.000Z'
        }
      ]
    }),
    getQualityInbox: vi.fn().mockResolvedValue({
      organization_id: 'org-holand',
      generated_at: '2026-04-22T15:00:00.000Z',
      summary: {
        total_count: 1,
        critical_count: 1,
        warning_count: 0,
        suggestion_count: 0
      },
      issues: [
        {
          id: 'issue-pay-1',
          organization_id: 'org-holand',
          resource_type: 'payable',
          resource_id: 'pay-1',
          severity: 'critical',
          missing_fields: ['financial_category_id', 'financial_cost_center_id'],
          title: 'Conta a pagar incompleta',
          detail: 'Licença de software precisa de categoria e centro de custo.',
          amount_cents: 98000,
          reference_date: '2026-04-25',
          entity_name: 'Vendor',
          suggestions: [
            { field: 'financial_category_id', value: 'cat-1', label: 'Software', confidence: 0.91 },
            { field: 'financial_cost_center_id', value: 'cc-1', label: 'Operações', confidence: 0.88 }
          ]
        }
      ]
    }),
    applyQualityCorrection: vi.fn().mockResolvedValue({
      resource_type: 'payable',
      resource_id: 'pay-1',
      remaining_issue_count: 0
    }),
    listAccounts: vi.fn().mockResolvedValue({ company_id: null, company_name: null, accounts: [] }),
    listTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
    listImportJobs: vi.fn().mockResolvedValue({ company_id: null, company_name: null, jobs: [] }),
    listStatementEntries: vi.fn().mockResolvedValue({ company_id: null, company_name: null, entries: [] }),
    listReconciliations: vi.fn().mockResolvedValue({ company_id: null, company_name: null, matches: [] }),
    createImportJob: vi.fn(),
    createStatementEntry: vi.fn(),
    createReconciliation: vi.fn().mockResolvedValue({
      id: 'match-created',
      organization_id: 'org-holand',
      company_id: 'company-holand',
      financial_bank_statement_entry_id: 'stmt-1',
      financial_transaction_id: 'ftxn-1',
      confidence_score: 0.92,
      match_status: 'matched',
      source: 'manual',
      reviewed_by: 'financeiro',
      reviewed_at: '2026-04-22T12:00:00.000Z',
      created_at: '2026-04-22T12:00:00.000Z',
      updated_at: '2026-04-22T12:00:00.000Z'
    }),
    createTransactionFromStatement: vi.fn().mockResolvedValue({
      transaction: {
        id: 'ftxn-created',
        organization_id: 'org-holand',
        financial_entity_id: null,
        financial_entity_name: null,
        financial_account_id: 'acc-1',
        financial_account_name: 'Banco principal',
        financial_category_id: null,
        financial_category_name: null,
        financial_cost_center_id: null,
        financial_cost_center_name: null,
        financial_payment_method_id: null,
        financial_payment_method_name: null,
        kind: 'expense',
        status: 'settled',
        amount_cents: 124500,
        issue_date: '2026-04-22',
        due_date: '2026-04-22',
        settlement_date: '2026-04-22',
        competence_date: '2026-04-22',
        source: 'manual',
        source_ref: null,
        note: 'Fornecedor Atlas',
        created_by: 'financeiro',
        created_at: '2026-04-22T12:05:00.000Z',
        updated_at: '2026-04-22T12:05:00.000Z',
        is_deleted: false,
        views: {
          signed_amount_cents: -124500,
          cash_amount_cents: -124500,
          competence_amount_cents: -124500,
          projected_amount_cents: 0,
          confirmed_amount_cents: -124500,
          competence_anchor_date: '2026-04-22',
          cash_anchor_date: '2026-04-22',
          projected_anchor_date: null
        }
      },
      match: {
        id: 'match-created-from-statement',
        organization_id: 'org-holand',
        company_id: 'company-holand',
        financial_bank_statement_entry_id: 'stmt-1',
        financial_transaction_id: 'ftxn-created',
        confidence_score: 1,
        match_status: 'matched',
        source: 'statement_create',
        reviewed_by: 'financeiro',
        reviewed_at: '2026-04-22T12:05:00.000Z',
        created_at: '2026-04-22T12:05:00.000Z',
        updated_at: '2026-04-22T12:05:00.000Z'
      }
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
      permissions: ['finance.read', 'finance.write', 'finance.reconcile']
    }
  });
});

test('reconciliation page highlights pending statement matches as an inbox', async () => {
  render(<FinanceReconciliationPage />);

  expect(await screen.findByText('Pendências de conciliação')).toBeInTheDocument();
  expect(screen.queryByText('Radar')).not.toBeInTheDocument();
  expect(screen.getByText('Sugestões de match')).toBeInTheDocument();
  expect(screen.getByText('Extratos importados')).toBeInTheDocument();
  expect(screen.getAllByText('Na fila').length).toBeGreaterThan(0);
  expect(screen.getByRole('tab', { name: /Na fila/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Dados incompletos/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Importados/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Matches recentes/i })).toBeInTheDocument();
  expect(screen.getByText('Fornecedor Atlas')).toBeInTheDocument();
  expect(screen.getAllByText('Regra aprendida').length).toBeGreaterThan(0);
  expect(screen.getByText('Regras aprendidas')).toBeInTheDocument();
  expect(screen.queryByText(/contraparte/i)).not.toBeInTheDocument();
});

test('reconciliation page switches tabs and applies a suggested match', async () => {
  const user = userEvent.setup();
  render(<FinanceReconciliationPage />);

  expect(await screen.findByText('Pendências de conciliação')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: /Importados/i }));
  expect((await screen.findAllByText('extrato-2026-04.ofx')).length).toBeGreaterThan(0);

  await user.click(screen.getByRole('tab', { name: /Matches recentes/i }));
  expect((await screen.findAllByText(/Transação vinculada: ftxn-2/i)).length).toBeGreaterThan(0);

  await user.click(screen.getByRole('tab', { name: /Dados incompletos/i }));
  expect(await screen.findByText('Conta a pagar incompleta')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Revisar pendência' }));
  expect(await screen.findByRole('dialog', { name: 'Revisar pendência' })).toBeInTheDocument();
  expect(screen.getByLabelText('Correção financial_category_id')).toHaveValue('cat-1');
  await user.click(screen.getByRole('button', { name: 'Aplicar correção' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.applyQualityCorrection).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_type: 'payable',
        resource_id: 'pay-1',
        financial_category_id: 'cat-1',
        financial_cost_center_id: 'cc-1',
        save_as_default: true
      })
    );
  });

  await user.click(screen.getByRole('tab', { name: /Na fila/i }));
  await user.click(screen.getByRole('button', { name: 'Match' }));

  await waitFor(() => {
    expect(financeApi.createReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        financial_bank_statement_entry_id: 'stmt-1',
        financial_transaction_id: 'ftxn-1',
        match_status: 'matched',
        source: 'manual'
      })
    );
  });

  expect(await screen.findByText('Match aplicado com sucesso.')).toBeInTheDocument();
});

test('reconciliation page creates a settled transaction from a statement entry', async () => {
  const user = userEvent.setup();
  render(<FinanceReconciliationPage />);

  expect(await screen.findByText('Pendências de conciliação')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Criar lançamento conciliado' }));

  const { financeApi } = await import('../api');
  await waitFor(() => {
    expect(financeApi.createTransactionFromStatement).toHaveBeenCalledWith('stmt-1', {
      note: 'Fornecedor Atlas'
    });
  });

  expect(await screen.findByText('Lançamento criado e conciliado com sucesso.')).toBeInTheDocument();
});
