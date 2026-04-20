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
