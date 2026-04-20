import { internalSessionStore } from '../auth/session';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

export type FinanceTransactionKind = 'income' | 'expense' | 'transfer' | 'adjustment';
export type FinanceTransactionStatus = 'planned' | 'open' | 'partial' | 'settled' | 'overdue' | 'canceled';

export type FinanceTransaction = {
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

export type FinanceOverview = {
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

export type CreateFinanceTransactionPayload = {
  company_id: string;
  kind: FinanceTransactionKind;
  status?: FinanceTransactionStatus;
  amount_cents: number;
  issue_date?: string | null;
  due_date?: string | null;
  settlement_date?: string | null;
  competence_date?: string | null;
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
  getOverview: (companyId?: string | null) =>
    req<FinanceOverview>(withCompanyId('/finance/overview', companyId)),
  listTransactions: (companyId?: string | null) =>
    req<{ company_id: string | null; company_name: string | null; transactions: FinanceTransaction[] }>(
      withCompanyId('/finance/transactions', companyId)
    ),
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
