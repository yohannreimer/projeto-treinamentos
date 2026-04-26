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
  financial_cost_center_id: string | null;
  financial_payment_method_id: string | null;
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
  financial_cost_center_name?: string | null;
  financial_payment_method_name?: string | null;
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
  views: FinanceLedgerViews;
};

export type FinanceAutomationRuleDto = {
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

export type FinanceAdvancedApprovalDto = {
  id: string;
  payable_id: string;
  description: string;
  amount_cents: number;
  due_date: string | null;
  supplier_name: string | null;
  severity: 'normal' | 'high';
};

export type FinanceAttachmentDto = {
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

export type FinanceAuditEntryDto = {
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

export type FinanceBankIntegrationDto = {
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

export type FinancePermissionMatrixRowDto = {
  permission: string;
  label: string;
  scope: string;
  enabled_for_current_user: boolean;
};

export type FinanceExportOptionDto = {
  dataset: 'transactions' | 'payables' | 'receivables' | 'audit';
  label: string;
  csv_url: string;
  pdf_url: string;
};

export type FinanceAssistedRuleTemplateDto = {
  id: string;
  label: string;
  description: string;
  trigger_type: string;
  default_conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
};

export type FinanceAdvancedDashboardDto = {
  organization_id: string;
  generated_at: string;
  cockpit: {
    sections: {
      decisions: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
      risks: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
      rules: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
      audit: { label: string; count: number; severity: 'neutral' | 'warning' | 'critical' };
    };
    recommended_actions: Array<{
      id: string;
      label: string;
      description: string;
      target: 'approvals' | 'rules' | 'audit' | 'attachments' | 'integrations';
    }>;
  };
  automation_rules: FinanceAutomationRuleDto[];
  assisted_rule_templates: FinanceAssistedRuleTemplateDto[];
  approval_queue: FinanceAdvancedApprovalDto[];
  attachments: FinanceAttachmentDto[];
  audit_entries: FinanceAuditEntryDto[];
  bank_integrations: FinanceBankIntegrationDto[];
  permission_matrix: FinancePermissionMatrixRowDto[];
  export_options: FinanceExportOptionDto[];
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

export type FinanceSimulationItemDto = {
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

export type FinanceSimulationTimelinePointDto = {
  date: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  balance_cents: number;
};

export type FinanceSimulationResultDto = {
  starting_balance_cents: number;
  total_inflow_cents: number;
  total_outflow_cents: number;
  ending_balance_cents: number;
  minimum_balance_cents: number;
  first_negative_date: string | null;
  item_count: number;
  timeline: FinanceSimulationTimelinePointDto[];
};

export type FinanceSimulationScenarioDto = {
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
  result: FinanceSimulationResultDto;
};

export type FinanceSimulationDetailDto = FinanceSimulationScenarioDto & {
  items: FinanceSimulationItemDto[];
};

export type FinanceSimulationSourceDto = {
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

export type CreateFinanceSimulationScenarioInput = {
  organization_id: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  starting_balance_cents?: number | null;
  created_by?: string | null;
};

export type UpdateFinanceSimulationScenarioInput = Partial<Omit<CreateFinanceSimulationScenarioInput, 'organization_id' | 'created_by'>> & {
  organization_id: string;
  scenario_id: string;
};

export type CreateFinanceSimulationItemInput = {
  organization_id: string;
  scenario_id: string;
  source_type?: FinanceSimulationItemSource;
  source_id?: string | null;
  kind: FinanceSimulationItemKind;
  label: string;
  amount_cents: number;
  event_date: string;
  probability_percent?: number | null;
  note?: string | null;
};

export type UpdateFinanceSimulationItemInput = Partial<Omit<CreateFinanceSimulationItemInput, 'organization_id' | 'scenario_id'>> & {
  organization_id: string;
  scenario_id: string;
  item_id: string;
};

export type CreateFinanceAutomationRuleInput = {
  organization_id: string;
  name: string;
  trigger_type: string;
  conditions?: Record<string, unknown>;
  action_type: string;
  action_payload?: Record<string, unknown>;
  is_active?: boolean;
  created_by?: string | null;
};

export type CreateFinanceAttachmentInput = {
  organization_id: string;
  resource_type: FinanceAttachmentDto['resource_type'];
  resource_id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes?: number;
  storage_ref?: string | null;
  created_by?: string | null;
};

export type CreateFinanceBankIntegrationInput = {
  organization_id: string;
  provider: string;
  status?: FinanceBankIntegrationDto['status'];
  account_name?: string | null;
  created_by?: string | null;
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

export type UpdateFinanceEntityInput = Partial<Omit<CreateFinanceEntityInput, 'organization_id'>> & {
  organization_id: string;
  financial_entity_id: string;
};

export type FinanceEntityDuplicateGroupDto = {
  id: string;
  reason: 'document_number' | 'legal_name' | 'trade_name';
  label: string;
  entities: FinanceEntityWithTagsDto[];
};

export type FinanceEntityDefaultContext = 'payable' | 'receivable' | 'transaction';
export type FinanceFavoriteCombinationContext = FinanceEntityDefaultContext | 'any';

export type FinanceEntityTagDto = {
  id: string;
  organization_id: string;
  name: string;
  normalized_name: string;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FinanceEntityWithTagsDto = FinanceEntityDto & {
  tags: FinanceEntityTagDto[];
};

export type FinanceEntityDefaultProfileDto = {
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

export type CreateFinanceEntityTagInput = {
  organization_id: string;
  name: string;
  is_active?: boolean;
};

export type UpsertFinanceEntityDefaultProfileInput = {
  organization_id: string;
  financial_entity_id: string;
  context: FinanceEntityDefaultContext;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  due_rule?: string | null;
  competence_rule?: string | null;
  recurrence_rule?: string | null;
  is_active?: boolean;
};

export type SetFinanceEntityTagsInput = {
  organization_id: string;
  financial_entity_id: string;
  tag_ids: string[];
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

export type UpdateFinanceCostCenterInput = {
  organization_id: string;
  financial_cost_center_id: string;
  name?: string;
  code?: string | null;
  is_active?: boolean;
};

export type UpdateFinancePaymentMethodInput = {
  organization_id: string;
  financial_payment_method_id: string;
  name?: string;
  kind?: FinancePaymentMethodKind;
  is_active?: boolean;
};

export type FinanceFavoriteCombinationDto = {
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

export type CreateFinanceFavoriteCombinationInput = {
  organization_id: string;
  name: string;
  context?: FinanceFavoriteCombinationContext;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_account_id?: string | null;
  financial_payment_method_id?: string | null;
  is_active?: boolean;
};

export type UpdateFinanceFavoriteCombinationInput = Partial<Omit<CreateFinanceFavoriteCombinationInput, 'organization_id'>> & {
  organization_id: string;
  financial_favorite_combination_id: string;
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
  series?: Array<{
    period: string;
    amount_cents: number;
  }>;
  chart_kind?: 'sparkline' | 'bars' | 'progress';
  scope?: 'global' | 'period';
};

export type FinancePeriodPreset =
  | 'last_7'
  | 'last_30'
  | 'today'
  | 'next_7'
  | 'next_30'
  | 'month'
  | 'all'
  | 'custom';

export type FinancePeriodFilterInput = {
  preset?: FinancePeriodPreset | null;
  from?: string | null;
  to?: string | null;
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
    quality_issue_count: number;
    quality_critical_count: number;
    quality_warning_count: number;
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

export type UpdateFinanceAccountInput = Partial<Omit<CreateFinanceAccountInput, 'organization_id' | 'company_id'>> & {
  organization_id: string;
  financial_account_id: string;
};

export type CreateFinanceCategoryInput = {
  organization_id: string;
  company_id?: string | null;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id?: string | null;
  is_active?: boolean;
};

export type UpdateFinanceCategoryInput = Partial<Omit<CreateFinanceCategoryInput, 'organization_id' | 'company_id'>> & {
  organization_id: string;
  financial_category_id: string;
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
  source?: string | null;
  source_ref?: string | null;
  note?: string | null;
};

export type CreateFinanceReceivableInput = {
  organization_id: string;
  company_id?: string | null;
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
  source?: string | null;
  source_ref?: string | null;
  note?: string | null;
};

export type FinanceRecurringRuleResourceType = 'payable' | 'receivable';
export type FinanceRecurringRuleStatus = 'active' | 'paused' | 'ended';

export type FinanceRecurringRuleDto = {
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

export type CreateFinanceRecurringRuleInput = FinanceOperationActorInput & {
  organization_id: string;
  resource_type: FinanceRecurringRuleResourceType;
  resource_id: string;
  day_of_month: number;
  start_date?: string | null;
  end_date?: string | null;
  materialization_months?: number | null;
};

export type UpdateFinanceRecurringRuleInput = FinanceOperationActorInput & {
  organization_id: string;
  recurring_rule_id: string;
  status?: FinanceRecurringRuleStatus;
  end_date?: string | null;
  materialization_months?: number | null;
};

export type FinanceOperationActorInput = {
  created_by?: string | null;
};

export type FinancePartialSettlementInput = FinanceOperationActorInput & {
  organization_id: string;
  resource_id: string;
  amount_cents: number;
  note?: string | null;
  settled_at?: string | null;
};

export type FinanceOperationInput = FinanceOperationActorInput & {
  organization_id: string;
  resource_id: string;
  note?: string | null;
  settled_at?: string | null;
};

export type FinanceScheduleOperationInput = FinanceOperationActorInput & {
  organization_id: string;
  resource_id: string;
  count: number;
  first_due_date?: string | null;
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

export type FinanceReconciliationSuggestionSource = 'value_date' | 'description' | 'learned_rule';

export type FinanceReconciliationSuggestionReasonDto = {
  label: string;
  detail: string;
  tone: 'neutral' | 'positive' | 'warning';
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
  source: FinanceReconciliationSuggestionSource;
  amount_gap_cents: number;
  date_gap_days: number | null;
  description_score: number;
  learned_rule_id: string | null;
  learned_rule_label: string | null;
  reasons: FinanceReconciliationSuggestionReasonDto[];
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

export type FinanceReconciliationLearnedRuleDto = {
  id: string;
  label: string;
  pattern: string;
  usage_count: number;
  confidence_boost: number;
  financial_entity_name: string | null;
  financial_category_name: string | null;
  financial_cost_center_name: string | null;
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
  learned_rules: FinanceReconciliationLearnedRuleDto[];
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

export type CreateFinanceTransactionFromStatementInput = {
  organization_id: string;
  financial_bank_statement_entry_id: string;
  financial_entity_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_payment_method_id?: string | null;
  note?: string | null;
  created_by?: string | null;
};

export type FinanceStatementTransactionResultDto = {
  transaction: FinanceTransactionDto;
  match: FinanceReconciliationMatchDto;
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

export type FinanceDrePeriodRowDto = {
  period: string;
  gross_revenue_cents: number;
  deductions_cents: number;
  net_revenue_cents: number;
  operating_expenses_cents: number;
  operating_result_cents: number;
  transaction_count: number;
};

export type FinanceCostCenterResultRowDto = {
  cost_center_name: string;
  revenue_cents: number;
  expense_cents: number;
  result_cents: number;
  transaction_count: number;
};

export type FinanceCashflowBasisRowDto = {
  period: string;
  inflow_cents: number;
  outflow_cents: number;
  net_cents: number;
  transaction_count: number;
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
  dre_by_period: FinanceDrePeriodRowDto[];
  dre_cash_by_period: FinanceDrePeriodRowDto[];
  cost_center_results: FinanceCostCenterResultRowDto[];
  cashflow_by_due: FinanceCashflowBasisRowDto[];
  cashflow_by_settlement: FinanceCashflowBasisRowDto[];
  dre: FinanceDreGerencialDto;
  dre_cash: FinanceDreGerencialDto;
};

export type FinanceQualitySeverity = 'critical' | 'warning' | 'suggestion';
export type FinanceQualityResourceType = 'payable' | 'receivable' | 'transaction';

export type FinanceQualityIssueDto = {
  id: string;
  organization_id: string;
  resource_type: FinanceQualityResourceType;
  resource_id: string;
  severity: FinanceQualitySeverity;
  missing_fields: string[];
  title: string;
  detail: string;
  amount_cents: number;
  reference_date: string | null;
  entity_name: string | null;
  suggestions: Array<{
    field: string;
    value: string;
    label: string;
    confidence: number;
  }>;
};

export type FinanceQualityInboxDto = {
  organization_id: string;
  generated_at: string;
  summary: {
    total_count: number;
    critical_count: number;
    warning_count: number;
    suggestion_count: number;
  };
  issues: FinanceQualityIssueDto[];
};

export type ApplyFinanceQualityCorrectionInput = {
  organization_id: string;
  resource_type: FinanceQualityResourceType;
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
  company_id?: string | null;
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
  source?: string | null;
  source_ref?: string | null;
  note?: string | null;
  created_by?: string | null;
};

export type CreateFinanceAccountBalanceAdjustmentInput = {
  organization_id: string;
  financial_account_id: string;
  amount_cents: number;
  settlement_date: string;
  note?: string | null;
  created_by?: string | null;
};

export type UpdateFinanceTransactionInput = {
  financial_entity_id?: string | null;
  financial_account_id?: string | null;
  financial_category_id?: string | null;
  financial_cost_center_id?: string | null;
  financial_payment_method_id?: string | null;
  kind?: FinanceTransactionKind;
  status?: FinanceTransactionStatus;
  amount_cents?: number;
  issue_date?: string | null;
  due_date?: string | null;
  settlement_date?: string | null;
  competence_date?: string | null;
  note?: string | null;
};

export type FinanceAssistantRiskLevel = 'low' | 'medium' | 'high';
export type FinanceAssistantInteractionStatus = 'draft' | 'executed' | 'canceled' | 'failed';
export type FinanceAssistantIntent =
  | 'create_payable'
  | 'create_receivable'
  | 'settle_payable'
  | 'settle_receivable'
  | 'query_due'
  | 'query_quality'
  | 'create_simulation';

export type FinanceAssistantActionDto = {
  id: string;
  intent: FinanceAssistantIntent;
  confidence: number;
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  requires_permission: string;
  human_summary: string;
  payload: Record<string, unknown>;
};

export type FinanceAssistantPlanDto = {
  id: string;
  transcript: string;
  surface_path: string | null;
  status: FinanceAssistantInteractionStatus;
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  human_summary: string;
  actions: FinanceAssistantActionDto[];
};

export type FinanceAssistantInterpretInput = {
  organization_id: string;
  created_by?: string | null;
  transcript: string;
  surface_path?: string | null;
};
