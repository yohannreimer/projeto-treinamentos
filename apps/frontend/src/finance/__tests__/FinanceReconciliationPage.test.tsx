import { render, screen } from '@testing-library/react';
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
          label: 'Urgentes',
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
                  confidence_score: 0.92
                }
              ]
            }
          ]
        },
        { key: 'today', label: 'Movimento de hoje', count: 0, amount_cents: 0, entries: [] },
        { key: 'review', label: 'Fila geral', count: 0, amount_cents: 0, entries: [] }
      ],
      insights: [
        { id: 'coverage', label: 'Cobertura de sugestão', value: '100%', tone: 'neutral' },
        { id: 'manual-review', label: 'Sem sugestão', value: '0', tone: 'neutral' },
        { id: 'stale', label: 'Aging crítico', value: '1', tone: 'critical' }
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
              confidence_score: 0.92
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
    listAccounts: vi.fn().mockResolvedValue({ company_id: null, company_name: null, accounts: [] }),
    listTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
    listImportJobs: vi.fn().mockResolvedValue({ company_id: null, company_name: null, jobs: [] }),
    listStatementEntries: vi.fn().mockResolvedValue({ company_id: null, company_name: null, entries: [] }),
    listReconciliations: vi.fn().mockResolvedValue({ company_id: null, company_name: null, matches: [] }),
    createImportJob: vi.fn(),
    createStatementEntry: vi.fn(),
    createReconciliation: vi.fn()
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
      permissions: ['finance.read', 'finance.write', 'finance.reconcile']
    }
  });
});

test('reconciliation page highlights pending statement matches as an inbox', async () => {
  render(<FinanceReconciliationPage />);

  expect(await screen.findByText('Pendências de conciliação')).toBeInTheDocument();
  expect(screen.getByText('Sugestões de match')).toBeInTheDocument();
  expect(screen.getByText('Extratos importados')).toBeInTheDocument();
  expect(screen.getByText('Radar da fila')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Urgentes/i })).toBeInTheDocument();
  expect(screen.getByText('Fornecedor Atlas')).toBeInTheDocument();
  expect(screen.queryByText(/contraparte/i)).not.toBeInTheDocument();
});
