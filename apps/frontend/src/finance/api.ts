import { internalSessionStore } from '../auth/session';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

export type FinanceTransactionKind = 'income' | 'expense' | 'transfer' | 'adjustment';
export type FinanceTransactionStatus = 'planned' | 'open' | 'partial' | 'settled' | 'overdue' | 'canceled';
export type FinanceAccountKind = 'bank' | 'cash' | 'wallet' | 'other';
export type FinanceCategoryKind = 'income' | 'expense' | 'neutral';

export type FinanceAccount = {
  id: string;
  organization_id: string;
  company_id: string;
  name: string;
  kind: FinanceAccountKind;
  currency: string;
  account_number: string | null;
  branch_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCategory = {
  id: string;
  organization_id: string;
  company_id: string;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinancePayableStatus = 'planned' | 'open' | 'partial' | 'paid' | 'overdue' | 'canceled';
export type FinanceReceivableStatus = 'planned' | 'open' | 'partial' | 'received' | 'overdue' | 'canceled';

export type FinancePayable = {
  id: string;
  organization_id: string;
  company_id: string;
  financial_transaction_id: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  supplier_name: string | null;
  description: string;
  amount_cents: number;
  status: FinancePayableStatus;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  source: string;
  source_ref: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceReceivable = {
  id: string;
  organization_id: string;
  company_id: string;
  financial_transaction_id: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  customer_name: string | null;
  description: string;
  amount_cents: number;
  status: FinanceReceivableStatus;
  issue_date: string | null;
  due_date: string | null;
  received_at: string | null;
  source: string;
  source_ref: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceImportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type FinanceReconciliationStatus = 'unmatched' | 'matched' | 'ignored';
export type FinanceDebtStatus = 'open' | 'partial' | 'settled' | 'canceled';

export type FinanceImportJob = {
  id: string;
  organization_id: string;
  company_id: string;
  import_type: string;
  source_file_name: string;
  source_file_mime_type: string | null;
  source_file_size_bytes: number;
  status: FinanceImportJobStatus;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  error_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

export type FinanceStatementEntry = {
  id: string;
  organization_id: string;
  company_id: string;
  financial_account_id: string;
  financial_account_name: string | null;
  financial_import_job_id: string | null;
  statement_date: string;
  posted_at: string | null;
  amount_cents: number;
  description: string;
  reference_code: string | null;
  balance_cents: number | null;
  source: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceReconciliationMatch = {
  id: string;
  organization_id: string;
  company_id: string;
  financial_bank_statement_entry_id: string;
  financial_transaction_id: string | null;
  confidence_score: number | null;
  match_status: FinanceReconciliationStatus;
  source: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceDebt = {
  id: string;
  organization_id: string;
  company_id: string;
  financial_payable_id: string | null;
  financial_receivable_id: string | null;
  financial_transaction_id: string | null;
  debt_type: string;
  status: FinanceDebtStatus;
  principal_amount_cents: number;
  outstanding_amount_cents: number;
  due_date: string | null;
  settled_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceTransaction = {
  id: string;
  organization_id: string;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  amount_cents: number;
  issue_date: string | null;
  due_date: string | null;
  settlement_date: string | null;
  competence_date: string | null;
  source: string;
  source_ref: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  views: {
    signed_amount_cents: number;
    cash_amount_cents: number;
    competence_amount_cents: number;
    projected_amount_cents: number;
    confirmed_amount_cents: number;
    competence_anchor_date: string | null;
    cash_anchor_date: string | null;
    projected_anchor_date: string | null;
  };
};

export type FinanceTransactionLedgerFilters = {
  status?: FinanceTransactionStatus | null;
  kind?: FinanceTransactionKind | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  financial_entity_id?: string | null;
  from?: string | null;
  to?: string | null;
  search?: string | null;
  include_deleted?: boolean | null;
};

export type FinanceOverview = {
  organization_id: string;
  organization_name: string | null;
  company_id: string | null;
  company_name: string | null;
  transaction_count: number;
  open_count: number;
  settled_count: number;
  totals: {
    cash_cents: number;
    competence_cents: number;
    projected_cents: number;
    confirmed_cents: number;
  };
};

export type FinanceContext = {
  organization_id: string;
  organization_name: string | null;
  currency: string;
  timezone: string;
};

export type FinanceEntityKind = 'customer' | 'supplier' | 'both';

export type FinanceEntity = {
  id: string;
  organization_id: string;
  legal_name: string;
  trade_name: string | null;
  document_number: string | null;
  kind: FinanceEntityKind;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinanceEntityPayload = {
  legal_name: string;
  trade_name?: string | null;
  document_number?: string | null;
  kind: FinanceEntityKind;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean;
};

export type FinanceCostCenter = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinancePaymentMethodKind = 'cash' | 'pix' | 'boleto' | 'card' | 'transfer' | 'other';

export type FinancePaymentMethod = {
  id: string;
  organization_id: string;
  name: string;
  kind: FinancePaymentMethodKind;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCatalogSnapshot = {
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  cost_centers: FinanceCostCenter[];
  payment_methods: FinancePaymentMethod[];
};

export type FinanceExecutiveKpiTone = 'neutral' | 'positive' | 'warning' | 'critical';

export type FinanceExecutiveKpi = {
  id: string;
  label: string;
  amount_cents: number;
  hint: string;
  tone: FinanceExecutiveKpiTone;
  value_kind: 'currency' | 'number';
};

export type FinanceExecutiveQueueTone = 'critical' | 'warning' | 'neutral';

export type FinanceExecutiveQueueItem = {
  id: string;
  status: string;
  title: string;
  detail: string;
  amount_cents: number;
  tone: FinanceExecutiveQueueTone;
  href: string;
  cta: string;
};

export type FinanceExecutiveCashflowBand = {
  label: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  balance_cents: number;
  balance_label: string;
  inflow_share: number;
  outflow_share: number;
};

export type FinanceExecutiveQuickAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

export type FinanceExecutiveOverview = {
  organization_id: string;
  organization_name: string | null;
  currency: string;
  timezone: string;
  generated_at: string;
  kpis: FinanceExecutiveKpi[];
  queue: FinanceExecutiveQueueItem[];
  cashflow_bands: FinanceExecutiveCashflowBand[];
  quick_actions: FinanceExecutiveQuickAction[];
  summary: {
    cash_balance_cents: number;
    receivables_open_cents: number;
    payables_open_cents: number;
    projected_result_cents: number;
    reconciliation_pending_count: number;
    uncategorized_count: number;
    overdue_count: number;
    monthly_income_cents: number;
    monthly_expense_cents: number;
  };
};

export type CreateFinanceTransactionPayload = {
  financial_entity_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  kind: FinanceTransactionKind;
  status?: FinanceTransactionStatus;
  amount_cents: number;
  issue_date?: string | null;
  due_date?: string | null;
  settlement_date?: string | null;
  competence_date?: string | null;
  note?: string | null;
};

export type CreateFinanceAccountPayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  name: string;
  kind: FinanceAccountKind;
  currency?: string;
  account_number?: string | null;
  branch_number?: string | null;
  is_active?: boolean;
};

export type CreateFinanceCategoryPayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id?: string | null;
  is_active?: boolean;
};

export type CreateFinancePayablePayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  supplier_name?: string | null;
  description: string;
  amount_cents: number;
  status: FinancePayableStatus;
  issue_date?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  note?: string | null;
};

export type CreateFinanceReceivablePayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  customer_name?: string | null;
  description: string;
  amount_cents: number;
  status: FinanceReceivableStatus;
  issue_date?: string | null;
  due_date?: string | null;
  received_at?: string | null;
  note?: string | null;
};

export type CreateFinanceImportJobPayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  import_type: string;
  source_file_name: string;
  source_file_mime_type?: string | null;
  source_file_size_bytes?: number;
  status?: FinanceImportJobStatus;
  total_rows?: number;
  processed_rows?: number;
  error_rows?: number;
  error_summary?: string | null;
  finished_at?: string | null;
};

export type CreateFinanceStatementEntryPayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  financial_account_id: string;
  financial_import_job_id?: string | null;
  statement_date: string;
  posted_at?: string | null;
  amount_cents: number;
  description: string;
  reference_code?: string | null;
  balance_cents?: number | null;
  source?: string;
  source_ref?: string | null;
};

export type CreateFinanceReconciliationPayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  financial_bank_statement_entry_id: string;
  financial_transaction_id: string;
  confidence_score?: number | null;
  match_status: FinanceReconciliationStatus;
  source?: string;
  reviewed_at?: string | null;
};

export type CreateFinanceDebtPayload = {
  company_id?: string | null;
  counterparty_company_id?: string | null;
  financial_payable_id?: string | null;
  financial_receivable_id?: string | null;
  financial_transaction_id?: string | null;
  debt_type: string;
  status: FinanceDebtStatus;
  principal_amount_cents: number;
  outstanding_amount_cents: number;
  due_date?: string | null;
  settled_at?: string | null;
  note?: string | null;
};

function withCompanyId(path: string, companyId?: string | null): string {
  const normalized = companyId?.trim();
  if (!normalized) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}company_id=${encodeURIComponent(normalized)}`;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const currentSession = internalSessionStore.read();
  const authToken = currentSession?.token ?? null;
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const raw = await response.text();
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      throw new Error(parsed.message || raw || 'Erro na API');
    } catch {
      throw new Error(raw || 'Erro na API');
    }
  }

  return response.json() as Promise<T>;
}

export const financeApi = {
  getContext: () =>
    req<FinanceContext>('/finance/context'),
  listEntities: () =>
    req<FinanceEntity[]>('/finance/entities'),
  createEntity: (payload: CreateFinanceEntityPayload) =>
    req<FinanceEntity>('/finance/entities', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getCatalogSnapshot: () =>
    req<FinanceCatalogSnapshot>('/finance/catalog'),
  listCatalogAccounts: () =>
    req<FinanceAccount[]>('/finance/catalog/accounts'),
  listCatalogCategories: () =>
    req<FinanceCategory[]>('/finance/catalog/categories'),
  listCostCenters: () =>
    req<FinanceCostCenter[]>('/finance/catalog/cost-centers'),
  createCostCenter: (payload: { name: string; code?: string | null; is_active?: boolean }) =>
    req<FinanceCostCenter>('/finance/catalog/cost-centers', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listPaymentMethods: () =>
    req<FinancePaymentMethod[]>('/finance/catalog/payment-methods'),
  createPaymentMethod: (payload: { name: string; kind: FinancePaymentMethodKind; is_active?: boolean }) =>
    req<FinancePaymentMethod>('/finance/catalog/payment-methods', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getExecutiveOverview: () =>
    req<FinanceExecutiveOverview>('/finance/overview/executive'),
  getOverview: (companyId?: string | null) =>
    req<FinanceOverview>(withCompanyId('/finance/overview', companyId)),
  listTransactions: (_companyId?: string | null, filters?: FinanceTransactionLedgerFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) {
      params.set('status', filters.status);
    }
    if (filters?.kind) {
      params.set('kind', filters.kind);
    }
    if (filters?.financial_account_id) {
      params.set('financial_account_id', filters.financial_account_id);
    }
    if (filters?.financial_category_id) {
      params.set('financial_category_id', filters.financial_category_id);
    }
    if (filters?.financial_entity_id) {
      params.set('financial_entity_id', filters.financial_entity_id);
    }
    if (filters?.from) {
      params.set('from', filters.from);
    }
    if (filters?.to) {
      params.set('to', filters.to);
    }
    if (filters?.search) {
      params.set('search', filters.search);
    }
    if (filters?.include_deleted) {
      params.set('include_deleted', '1');
    }

    const queryString = params.toString();
    return req<{ transactions: FinanceTransaction[] }>(
      queryString.length > 0 ? `/finance/transactions?${queryString}` : '/finance/transactions'
    );
  },
  listAccounts: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; accounts: FinanceAccount[] }>(
      withCompanyId('/finance/accounts', companyId)
    ),
  createAccount: (payload: CreateFinanceAccountPayload) =>
    req<FinanceAccount>('/finance/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listCategories: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; categories: FinanceCategory[] }>(
      withCompanyId('/finance/categories', companyId)
    ),
  createCategory: (payload: CreateFinanceCategoryPayload) =>
    req<FinanceCategory>('/finance/categories', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listPayables: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; payables: FinancePayable[] }>(
      withCompanyId('/finance/payables', companyId)
    ),
  createPayable: (payload: CreateFinancePayablePayload) =>
    req<FinancePayable>('/finance/payables', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listReceivables: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; receivables: FinanceReceivable[] }>(
      withCompanyId('/finance/receivables', companyId)
    ),
  createReceivable: (payload: CreateFinanceReceivablePayload) =>
    req<FinanceReceivable>('/finance/receivables', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listImportJobs: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; jobs: FinanceImportJob[] }>(
      withCompanyId('/finance/import-jobs', companyId)
    ),
  createImportJob: (payload: CreateFinanceImportJobPayload) =>
    req<FinanceImportJob>('/finance/import-jobs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listStatementEntries: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; entries: FinanceStatementEntry[] }>(
      withCompanyId('/finance/statement-entries', companyId)
    ),
  createStatementEntry: (payload: CreateFinanceStatementEntryPayload) =>
    req<FinanceStatementEntry>('/finance/statement-entries', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listReconciliations: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; matches: FinanceReconciliationMatch[] }>(
      withCompanyId('/finance/reconciliations', companyId)
    ),
  createReconciliation: (payload: CreateFinanceReconciliationPayload) =>
    req<FinanceReconciliationMatch>('/finance/reconciliations', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listDebts: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; debts: FinanceDebt[] }>(
      withCompanyId('/finance/debts', companyId)
    ),
  createDebt: (payload: CreateFinanceDebtPayload) =>
    req<FinanceDebt>('/finance/debts', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createTransaction: (payload: CreateFinanceTransactionPayload) =>
    req<FinanceTransaction>('/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateTransaction: (transactionId: string, payload: Partial<CreateFinanceTransactionPayload>) =>
    req<FinanceTransaction>(`/finance/transactions/${transactionId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteTransaction: (transactionId: string) =>
    req<{ ok: boolean; transaction: FinanceTransaction }>(`/finance/transactions/${transactionId}`, {
      method: 'DELETE'
    })
};
