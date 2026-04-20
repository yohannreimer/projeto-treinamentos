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
  company_id: string;
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
  company_name?: string | null;
  financial_account_name?: string | null;
  financial_category_name?: string | null;
};

export type FinanceTransactionDto = {
  id: string;
  company_id: string;
  company_name: string | null;
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

export type FinanceOverviewDto = {
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

export type FinanceAccountKind = 'bank' | 'cash' | 'wallet' | 'other';

export type FinanceAccountDto = {
  id: string;
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

export type FinanceCategoryKind = 'income' | 'expense' | 'neutral';

export type FinanceCategoryDto = {
  id: string;
  company_id: string;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateFinanceAccountInput = {
  company_id: string;
  name: string;
  kind: FinanceAccountKind;
  currency?: string;
  account_number?: string | null;
  branch_number?: string | null;
  is_active?: boolean;
};

export type CreateFinanceCategoryInput = {
  company_id: string;
  name: string;
  kind: FinanceCategoryKind;
  parent_category_id?: string | null;
  is_active?: boolean;
};

export type FinancePayableStatus = 'planned' | 'open' | 'partial' | 'paid' | 'overdue' | 'canceled';
export type FinanceReceivableStatus = 'planned' | 'open' | 'partial' | 'received' | 'overdue' | 'canceled';

export type FinancePayableDto = {
  id: string;
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

export type FinanceReceivableDto = {
  id: string;
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

export type CreateFinancePayableInput = {
  company_id: string;
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
  company_id: string;
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

export type CreateFinanceTransactionInput = {
  company_id: string;
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
