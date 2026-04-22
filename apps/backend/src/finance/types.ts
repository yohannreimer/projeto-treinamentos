export const FINANCE_TRANSACTION_KIND_VALUES = [
  'income',
  'expense',
  'transfer',
  'adjustment'
] as const;
export type FinanceTransactionKind = (typeof FINANCE_TRANSACTION_KIND_VALUES)[number];

export const FINANCE_TRANSACTION_STATUS_VALUES = [
  'planned',
  'open',
  'partial',
  'settled',
  'overdue',
  'canceled'
] as const;
export type FinanceTransactionStatus = (typeof FINANCE_TRANSACTION_STATUS_VALUES)[number];

export type FinanceComputeViewsInput = {
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  amountCents: number;
  issueDate?: string | null;
  dueDate?: string | null;
  settlementDate?: string | null;
  competenceDate?: string | null;
  isDeleted?: boolean;
};

export type FinanceLedgerViews = {
  signed_amount_cents: number;
  cash_amount_cents: number;
  competence_amount_cents: number;
  projected_amount_cents: number;
  confirmed_amount_cents: number;
  competence_anchor_date: string | null;
  cash_anchor_date: string | null;
  projected_anchor_date: string | null;
};

export type FinanceTransactionRow = {
  id: string;
  organization_id: string;
  company_id: string | null;
  financial_entity_id: string | null;
  financial_account_id: string | null;
  financial_category_id: string | null;
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
  is_deleted: number;
  financial_entity_name?: string | null;
  financial_account_name?: string | null;
  financial_category_name?: string | null;
};

export type FinanceTransactionDto = {
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
  views: FinanceLedgerViews;
};

export type FinanceTransactionListFilters = {
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

export type FinanceOverviewDto = {
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

export type FinanceContextDto = {
  organization_id: string;
  organization_name: string | null;
  currency: string;
  timezone: string;
};

export type FinanceEntityKind = 'customer' | 'supplier' | 'both';

export type FinanceEntityDto = {
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

export type CreateFinanceEntityInput = {
  organization_id: string;
  legal_name: string;
  trade_name?: string | null;
  document_number?: string | null;
  kind: FinanceEntityKind;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean;
};

export type FinanceCostCenterDto = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinanceCostCenterInput = {
  organization_id: string;
  name: string;
  code?: string | null;
  is_active?: boolean;
};

export type FinancePaymentMethodKind = 'cash' | 'pix' | 'boleto' | 'card' | 'transfer' | 'other';

export type FinancePaymentMethodDto = {
  id: string;
  organization_id: string;
  name: string;
  kind: FinancePaymentMethodKind;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinancePaymentMethodInput = {
  organization_id: string;
  name: string;
  kind: FinancePaymentMethodKind;
  is_active?: boolean;
};

export type FinanceCatalogSnapshotDto = {
  accounts: FinanceAccountDto[];
  categories: FinanceCategoryDto[];
  cost_centers: FinanceCostCenterDto[];
  payment_methods: FinancePaymentMethodDto[];
};

export type FinanceExecutiveKpiTone = 'neutral' | 'positive' | 'warning' | 'critical';

export type FinanceExecutiveKpiDto = {
  id: string;
  label: string;
  amount_cents: number;
  hint: string;
  tone: FinanceExecutiveKpiTone;
  value_kind: 'currency' | 'number';
};

export type FinanceExecutiveQueueTone = 'critical' | 'warning' | 'neutral';

export type FinanceExecutiveQueueItemDto = {
  id: string;
  status: string;
  title: string;
  detail: string;
  amount_cents: number;
  tone: FinanceExecutiveQueueTone;
  href: string;
  cta: string;
};

export type FinanceExecutiveCashflowBandDto = {
  label: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  balance_cents: number;
  balance_label: string;
  inflow_share: number;
  outflow_share: number;
};

export type FinanceExecutiveQuickActionDto = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

export type FinanceExecutiveOverviewDto = {
  organization_id: string;
  organization_name: string | null;
  currency: string;
  timezone: string;
  generated_at: string;
  kpis: FinanceExecutiveKpiDto[];
  queue: FinanceExecutiveQueueItemDto[];
  cashflow_bands: FinanceExecutiveCashflowBandDto[];
  quick_actions: FinanceExecutiveQuickActionDto[];
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

export type FinanceAccountKind = 'bank' | 'cash' | 'wallet' | 'other';

export type FinanceAccountDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  kind: FinanceAccountKind;
  currency: string;
  account_number: string | null;
  branch_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceCategoryKind = 'income' | 'expense' | 'neutral';

export type FinanceCategoryDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinanceAccountInput = {
  organization_id: string;
  company_id?: string | null;
  name: string;
  kind: FinanceAccountKind;
  currency?: string;
  account_number?: string | null;
  branch_number?: string | null;
  is_active?: boolean;
};

export type CreateFinanceCategoryInput = {
  organization_id: string;
  company_id?: string | null;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id?: string | null;
  is_active?: boolean;
};

export type FinancePayableStatus = 'planned' | 'open' | 'partial' | 'paid' | 'overdue' | 'canceled';
export type FinanceReceivableStatus = 'planned' | 'open' | 'partial' | 'received' | 'overdue' | 'canceled';

export type FinancePayableDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
  financial_transaction_id: string | null;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
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

export type FinancePayablesSummaryDto = {
  open_cents: number;
  overdue_cents: number;
  due_today_cents: number;
};

export type FinancePayablesGroupsDto = {
  overdue: FinancePayableDto[];
  due_today: FinancePayableDto[];
  upcoming: FinancePayableDto[];
  settled: FinancePayableDto[];
};

export type FinancePayablesListDto = {
  company_id: string | null;
  company_name: string | null;
  payables: FinancePayableDto[];
  summary: FinancePayablesSummaryDto;
  groups: FinancePayablesGroupsDto;
};

export type FinanceReceivableDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
  financial_transaction_id: string | null;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
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

export type FinanceReceivablesSummaryDto = {
  open_cents: number;
  overdue_cents: number;
  due_today_cents: number;
};

export type FinanceReceivablesGroupsDto = {
  overdue: FinanceReceivableDto[];
  due_today: FinanceReceivableDto[];
  upcoming: FinanceReceivableDto[];
  settled: FinanceReceivableDto[];
};

export type FinanceReceivablesListDto = {
  company_id: string | null;
  company_name: string | null;
  receivables: FinanceReceivableDto[];
  summary: FinanceReceivablesSummaryDto;
  groups: FinanceReceivablesGroupsDto;
};

export type CreateFinancePayableInput = {
  organization_id: string;
  company_id?: string | null;
  financial_entity_id?: string | null;
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

export type CreateFinanceReceivableInput = {
  organization_id: string;
  company_id?: string | null;
  financial_entity_id?: string | null;
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

export type FinanceImportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type FinanceReconciliationStatus = 'unmatched' | 'matched' | 'ignored';

export type FinanceImportJobDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
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

export type FinanceStatementEntryDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
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

export type FinanceReconciliationMatchDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
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

export type FinanceReconciliationSuggestionDto = {
  financial_transaction_id: string;
  description: string;
  amount_cents: number;
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  due_date: string | null;
  competence_date: string | null;
  financial_entity_name: string | null;
  confidence_score: number;
};

export type FinanceReconciliationBucketKey = 'urgent' | 'today' | 'review';

export type FinanceReconciliationInboxEntryDto = FinanceStatementEntryDto & {
  matched_transaction_id: string | null;
  matched_at: string | null;
  queue_bucket: FinanceReconciliationBucketKey;
  age_days: number;
  suggestion_count: number;
  suggested_matches: FinanceReconciliationSuggestionDto[];
};

export type FinanceReconciliationBucketDto = {
  key: FinanceReconciliationBucketKey;
  label: string;
  count: number;
  amount_cents: number;
  entries: FinanceReconciliationInboxEntryDto[];
};

export type FinanceReconciliationInsightDto = {
  id: string;
  label: string;
  value: string;
  tone: 'neutral' | 'warning' | 'critical';
};

export type FinanceReconciliationInboxDto = {
  organization_id: string;
  organization_name: string | null;
  generated_at: string;
  summary: {
    pending_count: number;
    pending_amount_cents: number;
    matched_today_count: number;
    imported_jobs_count: number;
    stale_count: number;
    with_suggestion_count: number;
    without_suggestion_count: number;
  };
  buckets: FinanceReconciliationBucketDto[];
  insights: FinanceReconciliationInsightDto[];
  inbox: FinanceReconciliationInboxEntryDto[];
  recent_matches: FinanceReconciliationMatchDto[];
  imported_jobs: FinanceImportJobDto[];
};

export type CreateFinanceImportJobInput = {
  organization_id: string;
  company_id?: string | null;
  import_type: string;
  source_file_name: string;
  source_file_mime_type?: string | null;
  source_file_size_bytes?: number;
  status?: FinanceImportJobStatus;
  total_rows?: number;
  processed_rows?: number;
  error_rows?: number;
  error_summary?: string | null;
  created_by?: string | null;
  finished_at?: string | null;
};

export type CreateFinanceStatementEntryInput = {
  organization_id: string;
  company_id?: string | null;
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

export type CreateFinanceReconciliationMatchInput = {
  organization_id: string;
  company_id?: string | null;
  financial_bank_statement_entry_id: string;
  financial_transaction_id: string;
  confidence_score?: number | null;
  match_status: FinanceReconciliationStatus;
  source?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type FinanceCashflowHorizon = 30 | 60 | 90;

export type FinanceCashflowPointDto = {
  date: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  balance_cents: number;
};

export type FinanceCashflowWindowDto = {
  horizon_days: FinanceCashflowHorizon;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  starting_balance_cents: number;
  ending_balance_cents: number;
  lowest_balance_cents: number;
  risk_level: 'healthy' | 'attention' | 'critical';
};

export type FinanceCashflowAlertDto = {
  id: string;
  tone: 'neutral' | 'warning' | 'critical';
  title: string;
  detail: string;
};

export type FinanceCashflowDto = {
  organization_id: string;
  organization_name: string | null;
  generated_at: string;
  horizon_days: FinanceCashflowHorizon;
  points: FinanceCashflowPointDto[];
  windows: FinanceCashflowWindowDto[];
  alerts: FinanceCashflowAlertDto[];
  totals: {
    inflow_cents: number;
    outflow_cents: number;
    ending_balance_cents: number;
    starting_balance_cents: number;
  };
};

export type FinanceReportComparisonRowDto = {
  period: string;
  realized_cents: number;
  projected_cents: number;
  variance_cents: number;
};

export type FinanceCategoryBreakdownRowDto = {
  category_name: string;
  amount_cents: number;
  transaction_count: number;
};

export type FinanceAgingRowDto = {
  entity_name: string;
  due_date: string | null;
  amount_cents: number;
  description: string;
};

export type FinanceConsolidatedCashflowRowDto = {
  period: string;
  inflow_cents: number;
  outflow_cents: number;
  balance_cents: number;
};

export type FinanceDreGerencialDto = {
  gross_revenue_cents: number;
  deductions_cents: number;
  net_revenue_cents: number;
  operating_expenses_cents: number;
  operating_result_cents: number;
};

export type FinanceReportsDto = {
  organization_id: string;
  organization_name: string | null;
  generated_at: string;
  realized_vs_projected: FinanceReportComparisonRowDto[];
  income_by_category: FinanceCategoryBreakdownRowDto[];
  expense_by_category: FinanceCategoryBreakdownRowDto[];
  overdue_receivables: FinanceAgingRowDto[];
  overdue_payables: FinanceAgingRowDto[];
  consolidated_cashflow: FinanceConsolidatedCashflowRowDto[];
  dre: FinanceDreGerencialDto;
};

export type FinanceDebtStatus = 'open' | 'partial' | 'settled' | 'canceled';

export type FinanceDebtDto = {
  id: string;
  organization_id: string;
  company_id: string | null;
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

export type CreateFinanceDebtInput = {
  organization_id: string;
  company_id?: string | null;
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

export type CreateFinanceTransactionInput = {
  organization_id: string;
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
  created_by?: string | null;
};

export type UpdateFinanceTransactionInput = {
  financial_entity_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  kind?: FinanceTransactionKind;
  status?: FinanceTransactionStatus;
  amount_cents?: number;
  issue_date?: string | null;
  due_date?: string | null;
  settlement_date?: string | null;
  competence_date?: string | null;
  note?: string | null;
};
