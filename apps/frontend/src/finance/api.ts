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

export type FinanceCategory = {
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

export type FinancePayableStatus = 'planned' | 'open' | 'partial' | 'paid' | 'overdue' | 'canceled';
export type FinanceReceivableStatus = 'planned' | 'open' | 'partial' | 'received' | 'overdue' | 'canceled';
export type FinanceRecurringRuleResourceType = 'payable' | 'receivable';
export type FinanceRecurringRuleStatus = 'active' | 'paused' | 'ended';

export type FinancePayable = {
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
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  supplier_name: string | null;
  description: string;
  amount_cents: number;
  paid_amount_cents: number;
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

export type FinancePayablesSummary = {
  open_cents: number;
  overdue_cents: number;
  due_today_cents: number;
};

export type FinancePayablesGroups = {
  overdue: FinancePayable[];
  due_today: FinancePayable[];
  upcoming: FinancePayable[];
  settled: FinancePayable[];
};

export type FinancePayablesList = {
  company_id: string | null;
  company_name: string | null;
  payables: FinancePayable[];
  summary: FinancePayablesSummary;
  groups: FinancePayablesGroups;
};

export type FinanceReceivable = {
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
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  customer_name: string | null;
  description: string;
  amount_cents: number;
  received_amount_cents: number;
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

export type FinanceReceivablesSummary = {
  open_cents: number;
  overdue_cents: number;
  due_today_cents: number;
};

export type FinanceReceivablesGroups = {
  overdue: FinanceReceivable[];
  due_today: FinanceReceivable[];
  upcoming: FinanceReceivable[];
  settled: FinanceReceivable[];
};

export type FinanceReceivablesList = {
  company_id: string | null;
  company_name: string | null;
  receivables: FinanceReceivable[];
  summary: FinanceReceivablesSummary;
  groups: FinanceReceivablesGroups;
};

export type FinanceRecurringRule = {
  id: string;
  organization_id: string;
  company_id: string | null;
  resource_type: FinanceRecurringRuleResourceType;
  template_resource_id: string;
  name: string;
  frequency: 'monthly';
  day_of_month: number;
  start_date: string;
  end_date: string | null;
  materialization_months: number;
  status: FinanceRecurringRuleStatus;
  last_materialized_until: string | null;
  next_due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceImportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type FinanceReconciliationStatus = 'unmatched' | 'matched' | 'ignored';
export type FinanceDebtStatus = 'open' | 'partial' | 'settled' | 'canceled';

export type FinanceImportJob = {
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

export type FinanceStatementEntry = {
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

export type FinanceReconciliationMatch = {
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

export type FinanceReconciliationSuggestionSource = 'value_date' | 'description' | 'learned_rule';

export type FinanceReconciliationSuggestionReason = {
  label: string;
  detail: string;
  tone: 'neutral' | 'positive' | 'warning';
};

export type FinanceReconciliationSuggestion = {
  financial_transaction_id: string;
  description: string;
  amount_cents: number;
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  due_date: string | null;
  competence_date: string | null;
  financial_entity_name: string | null;
  confidence_score: number;
  source: FinanceReconciliationSuggestionSource;
  amount_gap_cents: number;
  date_gap_days: number | null;
  description_score: number;
  learned_rule_id: string | null;
  learned_rule_label: string | null;
  reasons: FinanceReconciliationSuggestionReason[];
};

export type FinanceReconciliationBucketKey = 'urgent' | 'today' | 'review';

export type FinanceReconciliationInboxEntry = FinanceStatementEntry & {
  matched_transaction_id: string | null;
  matched_at: string | null;
  queue_bucket: FinanceReconciliationBucketKey;
  age_days: number;
  suggestion_count: number;
  suggested_matches: FinanceReconciliationSuggestion[];
};

export type FinanceReconciliationBucket = {
  key: FinanceReconciliationBucketKey;
  label: string;
  count: number;
  amount_cents: number;
  entries: FinanceReconciliationInboxEntry[];
};

export type FinanceReconciliationInsight = {
  id: string;
  label: string;
  value: string;
  tone: 'neutral' | 'warning' | 'critical';
};

export type FinanceReconciliationLearnedRule = {
  id: string;
  label: string;
  pattern: string;
  usage_count: number;
  confidence_boost: number;
  financial_entity_name: string | null;
  financial_category_name: string | null;
  financial_cost_center_name: string | null;
};

export type FinanceReconciliationInbox = {
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
  buckets: FinanceReconciliationBucket[];
  insights: FinanceReconciliationInsight[];
  learned_rules: FinanceReconciliationLearnedRule[];
  inbox: FinanceReconciliationInboxEntry[];
  recent_matches: FinanceReconciliationMatch[];
  imported_jobs: FinanceImportJob[];
};

export type FinanceQualitySeverity = 'critical' | 'warning' | 'suggestion';

export type FinanceQualityIssue = {
  id: string;
  organization_id: string;
  resource_type: 'payable' | 'receivable' | 'transaction';
  resource_id: string;
  severity: FinanceQualitySeverity;
  missing_fields: string[];
  title: string;
  detail: string;
  amount_cents: number;
  reference_date: string | null;
  entity_name: string | null;
  suggestions: Array<{ field: string; value: string; label: string; confidence: number }>;
};

export type FinanceQualityInbox = {
  organization_id: string;
  generated_at: string;
  summary: {
    total_count: number;
    critical_count: number;
    warning_count: number;
    suggestion_count: number;
  };
  issues: FinanceQualityIssue[];
};

export type ApplyFinanceQualityCorrectionPayload = {
  resource_type: 'payable' | 'receivable' | 'transaction';
  resource_id: string;
  financial_entity_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  due_date?: string | null;
  competence_date?: string | null;
  save_as_default?: boolean;
};

export type FinanceCashflowHorizon = 30 | 60 | 90;

export type FinanceCashflowPoint = {
  date: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  balance_cents: number;
};

export type FinanceCashflowWindow = {
  horizon_days: FinanceCashflowHorizon;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  starting_balance_cents: number;
  ending_balance_cents: number;
  lowest_balance_cents: number;
  risk_level: 'healthy' | 'attention' | 'critical';
};

export type FinanceCashflowAlert = {
  id: string;
  tone: 'neutral' | 'warning' | 'critical';
  title: string;
  detail: string;
};

export type FinanceCashflow = {
  organization_id: string;
  organization_name: string | null;
  generated_at: string;
  horizon_days: FinanceCashflowHorizon;
  points: FinanceCashflowPoint[];
  windows: FinanceCashflowWindow[];
  alerts: FinanceCashflowAlert[];
  totals: {
    inflow_cents: number;
    outflow_cents: number;
    ending_balance_cents: number;
    starting_balance_cents: number;
  };
};

export type FinanceReportComparisonRow = {
  period: string;
  realized_cents: number;
  projected_cents: number;
  variance_cents: number;
};

export type FinanceCategoryBreakdownRow = {
  category_name: string;
  amount_cents: number;
  transaction_count: number;
};

export type FinanceAgingRow = {
  entity_name: string;
  due_date: string | null;
  amount_cents: number;
  description: string;
};

export type FinanceConsolidatedCashflowRow = {
  period: string;
  inflow_cents: number;
  outflow_cents: number;
  balance_cents: number;
};

export type FinanceDrePeriodRow = {
  period: string;
  gross_revenue_cents: number;
  deductions_cents: number;
  net_revenue_cents: number;
  operating_expenses_cents: number;
  operating_result_cents: number;
  transaction_count: number;
};

export type FinanceCostCenterResultRow = {
  cost_center_name: string;
  revenue_cents: number;
  expense_cents: number;
  result_cents: number;
  transaction_count: number;
};

export type FinanceCashflowBasisRow = {
  period: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  transaction_count: number;
};

export type FinanceDreGerencial = {
  gross_revenue_cents: number;
  deductions_cents: number;
  net_revenue_cents: number;
  operating_expenses_cents: number;
  operating_result_cents: number;
};

export type FinanceReports = {
  organization_id: string;
  organization_name: string | null;
  generated_at: string;
  realized_vs_projected: FinanceReportComparisonRow[];
  income_by_category: FinanceCategoryBreakdownRow[];
  expense_by_category: FinanceCategoryBreakdownRow[];
  overdue_receivables: FinanceAgingRow[];
  overdue_payables: FinanceAgingRow[];
  consolidated_cashflow: FinanceConsolidatedCashflowRow[];
  dre_by_period: FinanceDrePeriodRow[];
  dre_cash_by_period: FinanceDrePeriodRow[];
  cost_center_results: FinanceCostCenterResultRow[];
  cashflow_by_due: FinanceCashflowBasisRow[];
  cashflow_by_settlement: FinanceCashflowBasisRow[];
  dre: FinanceDreGerencial;
  dre_cash: FinanceDreGerencial;
};

export type FinanceDebt = {
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

export type FinanceTransaction = {
  id: string;
  organization_id: string;
  financial_entity_id: string | null;
  financial_entity_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
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

export type FinanceAutomationRule = {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  trigger_type: string;
  conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
  human_trigger: string;
  human_conditions: string[];
  human_action: string;
  last_run_at: string | null;
  execution_count: number;
  recommended_action: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceAdvancedApproval = {
  id: string;
  payable_id: string;
  description: string;
  amount_cents: number;
  due_date: string | null;
  supplier_name: string | null;
  severity: 'normal' | 'high';
};

export type FinanceAttachment = {
  id: string;
  organization_id: string;
  company_id: string | null;
  resource_type: 'payable' | 'receivable' | 'transaction' | 'reconciliation';
  resource_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_ref: string;
  created_by: string | null;
  created_at: string;
};

export type FinanceAuditEntry = {
  id: string;
  organization_id: string;
  company_id: string | null;
  resource_type: string;
  resource_id: string;
  action: string;
  amount_cents: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type FinanceBankIntegration = {
  id: string;
  organization_id: string;
  company_id: string | null;
  provider: string;
  status: 'sandbox' | 'connected' | 'error' | 'disabled';
  account_name: string | null;
  last_sync_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancePermissionMatrixRow = {
  permission: string;
  label: string;
  scope: string;
  enabled_for_current_user: boolean;
};

export type FinanceExportOption = {
  dataset: 'transactions' | 'payables' | 'receivables' | 'audit';
  label: string;
  csv_url: string;
  pdf_url: string;
};

export type FinanceAdvancedSeverity = 'neutral' | 'warning' | 'critical';

export type FinanceAdvancedCockpitSection = {
  label: string;
  count: number;
  severity: FinanceAdvancedSeverity;
};

export type FinanceAdvancedRecommendation = {
  id: string;
  label: string;
  description: string;
  target: 'approvals' | 'rules' | 'audit' | 'integrations';
};

export type FinanceAssistedRuleTemplate = {
  id: string;
  label: string;
  description: string;
  trigger_type: string;
  default_conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
};

export type FinanceAdvancedDashboard = {
  organization_id: string;
  generated_at: string;
  cockpit: {
    sections: {
      decisions: FinanceAdvancedCockpitSection;
      risks: FinanceAdvancedCockpitSection;
      rules: FinanceAdvancedCockpitSection;
      audit: FinanceAdvancedCockpitSection;
    };
    recommended_actions: FinanceAdvancedRecommendation[];
  };
  assisted_rule_templates: FinanceAssistedRuleTemplate[];
  automation_rules: FinanceAutomationRule[];
  approval_queue: FinanceAdvancedApproval[];
  attachments: FinanceAttachment[];
  audit_entries: FinanceAuditEntry[];
  bank_integrations: FinanceBankIntegration[];
  permission_matrix: FinancePermissionMatrixRow[];
  export_options: FinanceExportOption[];
  summary: {
    active_rule_count: number;
    pending_approval_count: number;
    attachment_count: number;
    integration_count: number;
  };
};

export type FinanceSimulationItemKind =
  | 'manual_inflow'
  | 'manual_outflow'
  | 'expected_inflow'
  | 'scheduled_outflow'
  | 'partial_payment';

export type FinanceSimulationItemSource = 'manual' | 'payable' | 'receivable' | 'transaction';
export type FinanceSimulationSourceKind = FinanceSimulationItemKind | 'starting_balance';

export type FinanceSimulationItem = {
  id: string;
  organization_id: string;
  company_id: string | null;
  financial_simulation_scenario_id: string;
  source_type: FinanceSimulationItemSource;
  source_id: string | null;
  kind: FinanceSimulationItemKind;
  label: string;
  amount_cents: number;
  event_date: string;
  probability_percent: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceSimulationTimelinePoint = {
  date: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  balance_cents: number;
};

export type FinanceSimulationResult = {
  starting_balance_cents: number;
  total_inflow_cents: number;
  total_outflow_cents: number;
  ending_balance_cents: number;
  minimum_balance_cents: number;
  first_negative_date: string | null;
  item_count: number;
  timeline: FinanceSimulationTimelinePoint[];
};

export type FinanceSimulationScenario = {
  id: string;
  organization_id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  starting_balance_cents: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  result: FinanceSimulationResult;
};

export type FinanceSimulationDetail = FinanceSimulationScenario & {
  items: FinanceSimulationItem[];
};

export type FinanceSimulationList = {
  scenarios: FinanceSimulationScenario[];
};

export type FinanceSimulationSource = {
  id: string;
  label: string;
  detail: string;
  amount_cents: number;
  event_date: string;
  kind: FinanceSimulationSourceKind;
  source_type: FinanceSimulationItemSource | 'balance';
  source_id: string | null;
  tone: 'balance' | 'inflow' | 'outflow';
  cadence: 'one_time' | 'recurring';
};

export type FinanceSimulationSources = {
  balance: FinanceSimulationSource;
  sources: FinanceSimulationSource[];
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
  tags?: FinanceEntityTag[];
  created_at: string;
  updated_at: string;
};

export type FinanceEntityDefaultContext = 'payable' | 'receivable' | 'transaction';

export type FinanceEntityTag = {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceEntityDefaultProfile = {
  id: string;
  organization_id: string;
  financial_entity_id: string;
  context: FinanceEntityDefaultContext;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  due_rule: string | null;
  competence_rule: string | null;
  recurrence_rule: string | null;
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

export type FinanceEntityDuplicateGroup = {
  id: string;
  reason: 'document_number' | 'legal_name' | 'trade_name';
  label: string;
  entities: FinanceEntity[];
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

export type FinanceFavoriteCombinationContext = FinanceEntityDefaultContext | 'any';

export type FinanceFavoriteCombination = {
  id: string;
  organization_id: string;
  name: string;
  context: FinanceFavoriteCombinationContext;
  financial_category_id: string | null;
  financial_category_name: string | null;
  financial_cost_center_id: string | null;
  financial_cost_center_name: string | null;
  financial_account_id: string | null;
  financial_account_name: string | null;
  financial_payment_method_id: string | null;
  financial_payment_method_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinanceFavoriteCombinationPayload = {
  name: string;
  context?: FinanceFavoriteCombinationContext;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  is_active?: boolean;
};

export type FinanceExecutiveKpiTone = 'neutral' | 'positive' | 'warning' | 'critical';

export type FinanceKpiSeriesPoint = {
  period: string;
  amount_cents: number;
};

export type FinanceExecutiveKpi = {
  id: string;
  label: string;
  amount_cents: number;
  hint: string;
  tone: FinanceExecutiveKpiTone;
  value_kind: 'currency' | 'number';
  series?: FinanceKpiSeriesPoint[];
  chart_kind?: 'sparkline' | 'bars' | 'progress';
  scope?: 'global' | 'period';
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
    quality_issue_count: number;
    quality_critical_count: number;
    quality_warning_count: number;
    overdue_count: number;
    monthly_income_cents: number;
    monthly_expense_cents: number;
  };
};

export type CreateFinanceTransactionPayload = {
  financial_entity_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_payment_method_id?: string | null;
  kind: FinanceTransactionKind;
  status?: FinanceTransactionStatus;
  amount_cents: number;
  issue_date?: string | null;
  due_date?: string | null;
  settlement_date?: string | null;
  competence_date?: string | null;
  note?: string | null;
};

export type CreateFinanceAutomationRulePayload = {
  name: string;
  trigger_type: string;
  conditions?: Record<string, unknown>;
  action_type: string;
  action_payload?: Record<string, unknown>;
  is_active?: boolean;
};

export type CreateFinanceSimulationScenarioPayload = {
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  starting_balance_cents?: number | null;
};

export type UpdateFinanceSimulationScenarioPayload = Partial<CreateFinanceSimulationScenarioPayload>;

export type CreateFinanceSimulationItemPayload = {
  source_type?: FinanceSimulationItemSource;
  source_id?: string | null;
  kind: FinanceSimulationItemKind;
  label: string;
  amount_cents: number;
  event_date: string;
  probability_percent?: number | null;
  note?: string | null;
};

export type UpdateFinanceSimulationItemPayload = Partial<CreateFinanceSimulationItemPayload>;

export type CreateFinanceAttachmentPayload = {
  resource_type: FinanceAttachment['resource_type'];
  resource_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes?: number;
  storage_ref?: string | null;
};

export type CreateFinanceBankIntegrationPayload = {
  provider: string;
  status?: FinanceBankIntegration['status'];
  account_name?: string | null;
};

export type CreateFinanceAccountPayload = {
  name: string;
  kind: FinanceAccountKind;
  currency?: string;
  account_number?: string | null;
  branch_number?: string | null;
  is_active?: boolean;
};

export type CreateFinanceCategoryPayload = {
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id?: string | null;
  is_active?: boolean;
};

export type CreateFinancePayablePayload = {
  financial_entity_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_payment_method_id?: string | null;
  supplier_name?: string | null;
  description: string;
  amount_cents: number;
  paid_amount_cents?: number | null;
  status: FinancePayableStatus;
  issue_date?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  note?: string | null;
};

export type CreateFinanceReceivablePayload = {
  financial_entity_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_payment_method_id?: string | null;
  customer_name?: string | null;
  description: string;
  amount_cents: number;
  received_amount_cents?: number | null;
  status: FinanceReceivableStatus;
  issue_date?: string | null;
  due_date?: string | null;
  received_at?: string | null;
  note?: string | null;
};

export type CreateFinanceRecurringRulePayload = {
  resource_type: FinanceRecurringRuleResourceType;
  resource_id: string;
  day_of_month: number;
  start_date?: string | null;
  end_date?: string | null;
  materialization_months?: number | null;
};

export type UpdateFinanceRecurringRulePayload = {
  status?: FinanceRecurringRuleStatus;
  end_date?: string | null;
  materialization_months?: number | null;
};

export type CreateFinanceImportJobPayload = {
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
  financial_bank_statement_entry_id: string;
  financial_transaction_id: string;
  confidence_score?: number | null;
  match_status: FinanceReconciliationStatus;
  source?: string;
  reviewed_at?: string | null;
};

export type CreateFinanceTransactionFromStatementPayload = {
  financial_entity_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_payment_method_id?: string | null;
  note?: string | null;
};

export type CreateFinanceDebtPayload = {
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

export type FinanceOperationPayload = {
  note?: string | null;
  settled_at?: string | null;
};

export type FinancePartialSettlementPayload = FinanceOperationPayload & {
  amount_cents: number;
};

export type FinanceScheduleOperationPayload = {
  count: number;
  first_due_date?: string | null;
  note?: string | null;
};

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
      const parsed = JSON.parse(raw) as {
        message?: string;
        formErrors?: string[];
        fieldErrors?: Record<string, string[] | undefined>;
      };
      const fieldErrorEntry = Object.entries(parsed.fieldErrors ?? {}).find(([, messages]) => Array.isArray(messages) && messages.length > 0);
      const fieldMessage = fieldErrorEntry?.[1]?.[0];
      const formMessage = parsed.formErrors?.[0];
      throw new Error(fieldMessage || formMessage || parsed.message || raw || 'Erro na API');
    } catch {
      throw new Error(raw || 'Erro na API');
    }
  }

  return response.json() as Promise<T>;
}

export function financeApiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export const financeApi = {
  getAdvancedDashboard: () =>
    req<FinanceAdvancedDashboard>('/finance/advanced'),
  createAutomationRule: (payload: CreateFinanceAutomationRulePayload) =>
    req<FinanceAutomationRule>('/finance/advanced/automation-rules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  toggleAutomationRule: (ruleId: string, isActive: boolean) =>
    req<FinanceAutomationRule>(`/finance/advanced/automation-rules/${encodeURIComponent(ruleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive })
    }),
  approvePayable: (payableId: string, note?: string | null) =>
    req<FinanceAuditEntry>(`/finance/advanced/payables/${encodeURIComponent(payableId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null })
    }),
  createAttachment: (payload: CreateFinanceAttachmentPayload) =>
    req<FinanceAttachment>('/finance/advanced/attachments', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createBankIntegration: (payload: CreateFinanceBankIntegrationPayload) =>
    req<FinanceBankIntegration>('/finance/advanced/bank-integrations', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listSimulations: () =>
    req<FinanceSimulationList>('/finance/simulations'),
  listSimulationSources: (scenarioId?: string | null) =>
    req<FinanceSimulationSources>(`/finance/simulations/sources${scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : ''}`),
  createSimulation: (payload: CreateFinanceSimulationScenarioPayload) =>
    req<FinanceSimulationDetail>('/finance/simulations', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getSimulation: (scenarioId: string) =>
    req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}`),
  updateSimulation: (scenarioId: string, payload: UpdateFinanceSimulationScenarioPayload) =>
    req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteSimulation: (scenarioId: string) =>
    req<{ ok: true; scenario_id: string }>(`/finance/simulations/${encodeURIComponent(scenarioId)}`, {
      method: 'DELETE'
    }),
  createSimulationItem: (scenarioId: string, payload: CreateFinanceSimulationItemPayload) =>
    req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateSimulationItem: (scenarioId: string, itemId: string, payload: UpdateFinanceSimulationItemPayload) =>
    req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteSimulationItem: (scenarioId: string, itemId: string) =>
    req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE'
    }),
  duplicateSimulation: (scenarioId: string) =>
    req<FinanceSimulationDetail>(`/finance/simulations/${encodeURIComponent(scenarioId)}/duplicate`, {
      method: 'POST'
    }),
  getContext: () =>
    req<FinanceContext>('/finance/context'),
  listEntities: () =>
    req<FinanceEntity[]>('/finance/entities'),
  createEntity: (payload: CreateFinanceEntityPayload) =>
    req<FinanceEntity>('/finance/entities', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateEntity: (entityId: string, payload: Partial<CreateFinanceEntityPayload>) =>
    req<FinanceEntity>(`/finance/entities/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  listEntityDuplicates: () =>
    req<FinanceEntityDuplicateGroup[]>('/finance/entities/duplicates'),
  listEntityTags: () =>
    req<FinanceEntityTag[]>('/finance/entities/tags'),
  createEntityTag: (payload: { name: string; is_active?: boolean }) =>
    req<FinanceEntityTag>('/finance/entities/tags', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  setEntityTags: (entityId: string, tagIds: string[]) =>
    req<FinanceEntity & { tags: FinanceEntityTag[] }>(`/finance/entities/${entityId}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tag_ids: tagIds })
    }),
  getEntityDefaultProfile: (entityId: string, context: FinanceEntityDefaultContext) =>
    req<FinanceEntityDefaultProfile | null>(`/finance/entities/${entityId}/defaults/${context}`),
  upsertEntityDefaultProfile: (
    entityId: string,
    context: FinanceEntityDefaultContext,
    payload: Partial<FinanceEntityDefaultProfile>
  ) =>
    req<FinanceEntityDefaultProfile>(`/finance/entities/${entityId}/defaults/${context}`, {
      method: 'PUT',
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
  updateCostCenter: (costCenterId: string, payload: Partial<{ name: string; code: string | null; is_active: boolean }>) =>
    req<FinanceCostCenter>(`/finance/catalog/cost-centers/${costCenterId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteCostCenter: (costCenterId: string) =>
    req<FinanceCostCenter>(`/finance/catalog/cost-centers/${costCenterId}`, {
      method: 'DELETE'
    }),
  listPaymentMethods: () =>
    req<FinancePaymentMethod[]>('/finance/catalog/payment-methods'),
  createPaymentMethod: (payload: { name: string; kind: FinancePaymentMethodKind; is_active?: boolean }) =>
    req<FinancePaymentMethod>('/finance/catalog/payment-methods', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updatePaymentMethod: (paymentMethodId: string, payload: Partial<{ name: string; kind: FinancePaymentMethodKind; is_active: boolean }>) =>
    req<FinancePaymentMethod>(`/finance/catalog/payment-methods/${paymentMethodId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deletePaymentMethod: (paymentMethodId: string) =>
    req<FinancePaymentMethod>(`/finance/catalog/payment-methods/${paymentMethodId}`, {
      method: 'DELETE'
    }),
  listFavoriteCombinations: () =>
    req<FinanceFavoriteCombination[]>('/finance/catalog/favorite-combinations'),
  createFavoriteCombination: (payload: CreateFinanceFavoriteCombinationPayload) =>
    req<FinanceFavoriteCombination>('/finance/catalog/favorite-combinations', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateFavoriteCombination: (combinationId: string, payload: Partial<CreateFinanceFavoriteCombinationPayload>) =>
    req<FinanceFavoriteCombination>(`/finance/catalog/favorite-combinations/${combinationId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteFavoriteCombination: (combinationId: string) =>
    req<FinanceFavoriteCombination>(`/finance/catalog/favorite-combinations/${combinationId}`, {
      method: 'DELETE'
    }),
  getExecutiveOverview: (filters?: { preset?: string; from?: string | null; to?: string | null }) => {
    const params = new URLSearchParams();
    if (filters?.preset) {
      params.set('preset', filters.preset);
    }
    if (filters?.from) {
      params.set('from', filters.from);
    }
    if (filters?.to) {
      params.set('to', filters.to);
    }
    const queryString = params.toString();
    return req<FinanceExecutiveOverview>(
      queryString.length > 0 ? `/finance/overview/executive?${queryString}` : '/finance/overview/executive'
    );
  },
  getOverview: () =>
    req<FinanceOverview>('/finance/overview'),
  listTransactions: (filters?: FinanceTransactionLedgerFilters) => {
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
  listAccounts: () =>
    req<{ company_id: string | null; company_name: string | null; accounts: FinanceAccount[] }>('/finance/accounts'),
  createAccount: (payload: CreateFinanceAccountPayload) =>
    req<FinanceAccount>('/finance/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateAccount: (accountId: string, payload: Partial<CreateFinanceAccountPayload>) =>
    req<FinanceAccount>(`/finance/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteAccount: (accountId: string) =>
    req<FinanceAccount>(`/finance/accounts/${accountId}`, {
      method: 'DELETE'
    }),
  listCategories: () =>
    req<{ company_id: string | null; company_name: string | null; categories: FinanceCategory[] }>('/finance/categories'),
  createCategory: (payload: CreateFinanceCategoryPayload) =>
    req<FinanceCategory>('/finance/categories', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateCategory: (categoryId: string, payload: Partial<CreateFinanceCategoryPayload>) =>
    req<FinanceCategory>(`/finance/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteCategory: (categoryId: string) =>
    req<FinanceCategory>(`/finance/categories/${categoryId}`, {
      method: 'DELETE'
    }),
  listPayables: () =>
    req<FinancePayablesList>('/finance/payables'),
  createPayable: (payload: CreateFinancePayablePayload) =>
    req<FinancePayable>('/finance/payables', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  settlePayable: (payableId: string, payload: FinanceOperationPayload = {}) =>
    req<FinancePayable>(`/finance/payables/${payableId}/settle`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  partiallySettlePayable: (payableId: string, payload: FinancePartialSettlementPayload) =>
    req<FinancePayable>(`/finance/payables/${payableId}/partial`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  duplicatePayable: (payableId: string, payload: Pick<FinanceOperationPayload, 'note'> = {}) =>
    req<FinancePayable>(`/finance/payables/${payableId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  cancelPayable: (payableId: string, payload: Pick<FinanceOperationPayload, 'note'> = {}) =>
    req<FinancePayable>(`/finance/payables/${payableId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createPayableInstallments: (payableId: string, payload: FinanceScheduleOperationPayload) =>
    req<{ payables: FinancePayable[] }>(`/finance/payables/${payableId}/installments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createPayableRecurrences: (payableId: string, payload: FinanceScheduleOperationPayload) =>
    req<{ payables: FinancePayable[] }>(`/finance/payables/${payableId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listRecurringRules: () =>
    req<{ rules: FinanceRecurringRule[] }>('/finance/recurring-rules'),
  createRecurringRuleFromResource: (payload: CreateFinanceRecurringRulePayload) =>
    req<{ rule: FinanceRecurringRule; payables: FinancePayable[]; receivables: FinanceReceivable[] }>('/finance/recurring-rules/from-resource', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateRecurringRule: (ruleId: string, payload: UpdateFinanceRecurringRulePayload) =>
    req<FinanceRecurringRule>(`/finance/recurring-rules/${encodeURIComponent(ruleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  listReceivables: () =>
    req<FinanceReceivablesList>('/finance/receivables'),
  createReceivable: (payload: CreateFinanceReceivablePayload) =>
    req<FinanceReceivable>('/finance/receivables', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  settleReceivable: (receivableId: string, payload: FinanceOperationPayload = {}) =>
    req<FinanceReceivable>(`/finance/receivables/${receivableId}/settle`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  partiallySettleReceivable: (receivableId: string, payload: FinancePartialSettlementPayload) =>
    req<FinanceReceivable>(`/finance/receivables/${receivableId}/partial`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  duplicateReceivable: (receivableId: string, payload: Pick<FinanceOperationPayload, 'note'> = {}) =>
    req<FinanceReceivable>(`/finance/receivables/${receivableId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  cancelReceivable: (receivableId: string, payload: Pick<FinanceOperationPayload, 'note'> = {}) =>
    req<FinanceReceivable>(`/finance/receivables/${receivableId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createReceivableInstallments: (receivableId: string, payload: FinanceScheduleOperationPayload) =>
    req<{ receivables: FinanceReceivable[] }>(`/finance/receivables/${receivableId}/installments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createReceivableRecurrences: (receivableId: string, payload: FinanceScheduleOperationPayload) =>
    req<{ receivables: FinanceReceivable[] }>(`/finance/receivables/${receivableId}/recurrences`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listImportJobs: () =>
    req<{ company_id: string | null; company_name: string | null; jobs: FinanceImportJob[] }>('/finance/import-jobs'),
  createImportJob: (payload: CreateFinanceImportJobPayload) =>
    req<FinanceImportJob>('/finance/import-jobs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listStatementEntries: () =>
    req<{ company_id: string | null; company_name: string | null; entries: FinanceStatementEntry[] }>('/finance/statement-entries'),
  createStatementEntry: (payload: CreateFinanceStatementEntryPayload) =>
    req<FinanceStatementEntry>('/finance/statement-entries', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  listReconciliations: () =>
    req<{ company_id: string | null; company_name: string | null; matches: FinanceReconciliationMatch[] }>('/finance/reconciliations'),
  createReconciliation: (payload: CreateFinanceReconciliationPayload) =>
    req<FinanceReconciliationMatch>('/finance/reconciliations', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createTransactionFromStatement: (statementEntryId: string, payload: CreateFinanceTransactionFromStatementPayload = {}) =>
    req<{ transaction: FinanceTransaction; match: FinanceReconciliationMatch }>(`/finance/reconciliation/statement-entries/${encodeURIComponent(statementEntryId)}/transaction`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getReconciliationInbox: () =>
    req<FinanceReconciliationInbox>('/finance/reconciliation/inbox'),
  getQualityInbox: () =>
    req<FinanceQualityInbox>('/finance/quality/inbox'),
  applyQualityCorrection: (payload: ApplyFinanceQualityCorrectionPayload) =>
    req<{ resource_type: string; resource_id: string; remaining_issue_count: number }>('/finance/quality/issues/apply', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getCashflow: (horizon: FinanceCashflowHorizon = 90) =>
    req<FinanceCashflow>(`/finance/cashflow?horizon=${encodeURIComponent(String(horizon))}`),
  getReports: (filters?: { preset?: string; from?: string | null; to?: string | null }) => {
    const params = new URLSearchParams();
    if (filters?.preset) {
      params.set('preset', filters.preset);
    }
    if (filters?.from) {
      params.set('from', filters.from);
    }
    if (filters?.to) {
      params.set('to', filters.to);
    }
    const queryString = params.toString();
    return req<FinanceReports>(
      queryString.length > 0 ? `/finance/reports?${queryString}` : '/finance/reports'
    );
  },
  listDebts: () =>
    req<{ company_id: string | null; company_name: string | null; debts: FinanceDebt[] }>('/finance/debts'),
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
