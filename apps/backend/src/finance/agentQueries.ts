import {
  listFinanceAccounts,
  listFinanceCategories,
  listFinancePayables,
  listFinanceReceivables,
  listFinanceRecurringRules,
  listFinanceTransactions
} from './service.js';
import {
  listFinanceCostCenters,
  listFinancePaymentMethods
} from './catalog.js';
import { listFinanceEntities } from './entities.js';
import { filterFinanceAgentMatches, type FinanceAgentLookupItem } from './agentResolvers.js';

export type FinanceAgentQueryName =
  | 'finance_list_categories'
  | 'finance_list_cost_centers'
  | 'finance_list_accounts'
  | 'finance_list_payment_methods'
  | 'finance_list_entities'
  | 'finance_list_recurring_rules'
  | 'finance_list_payables'
  | 'finance_list_receivables'
  | 'finance_list_transactions';

export type FinanceAgentQueryInput = {
  organization_id: string;
  tool_name: FinanceAgentQueryName;
  search?: string | null;
  limit?: number | null;
  status?: string | null;
  horizon_days?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  financial_cost_center_id?: string | null;
  financial_cost_center_name?: string | null;
  financial_category_id?: string | null;
  financial_category_name?: string | null;
  financial_entity_id?: string | null;
  financial_entity_name?: string | null;
  kind?: string | null;
};

function normalizeLimit(limit: number | null | undefined) {
  return Math.max(1, Math.min(30, Math.trunc(limit ?? 10)));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(startDate: string, days: number) {
  const [yearText, monthText, dayText] = startDate.split('-');
  const date = new Date(
    Number.parseInt(yearText, 10),
    Number.parseInt(monthText, 10) - 1,
    Number.parseInt(dayText, 10)
  );
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isWithinHorizon(dueDate: string | null | undefined, horizonDays: number | null | undefined) {
  if (!horizonDays || !dueDate) return true;
  const startDate = todayIsoDate();
  const endDate = addDaysIso(startDate, Math.max(1, Math.min(365, Math.trunc(horizonDays))));
  return dueDate >= startDate && dueDate <= endDate;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function containsFilterValue(value: string | null | undefined, filter: string | null | undefined) {
  const normalizedFilter = normalizeText(filter);
  if (!normalizedFilter) return true;
  return normalizeText(value).includes(normalizedFilter);
}

function isWithinDateRange(date: string | null | undefined, from: string | null | undefined, to: string | null | undefined) {
  if (!date) return !from && !to;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function runFinanceAgentQueryTool(input: FinanceAgentQueryInput) {
  const limit = normalizeLimit(input.limit);
  const items = getFinanceAgentQueryItems(input);
  return {
    tool_name: input.tool_name,
    count: items.length,
    items: filterFinanceAgentMatches(input.search, items, limit)
  };
}

function getFinanceAgentQueryItems(input: FinanceAgentQueryInput): FinanceAgentLookupItem[] {
  if (input.tool_name === 'finance_list_categories') {
    return listFinanceCategories(input.organization_id).categories.map((category) => ({
      id: category.id,
      label: category.name,
      detail: category.kind,
      kind: category.kind,
      status: category.is_active ? 'active' : 'inactive'
    }));
  }

  if (input.tool_name === 'finance_list_cost_centers') {
    return listFinanceCostCenters(input.organization_id).map((costCenter) => ({
      id: costCenter.id,
      label: costCenter.name,
      detail: costCenter.code,
      kind: 'cost_center',
      status: costCenter.is_active ? 'active' : 'inactive'
    }));
  }

  if (input.tool_name === 'finance_list_accounts') {
    return listFinanceAccounts(input.organization_id).accounts.map((account) => ({
      id: account.id,
      label: account.name,
      detail: account.kind,
      kind: account.kind,
      status: account.is_active ? 'active' : 'inactive'
    }));
  }

  if (input.tool_name === 'finance_list_payment_methods') {
    return listFinancePaymentMethods(input.organization_id).map((paymentMethod) => ({
      id: paymentMethod.id,
      label: paymentMethod.name,
      detail: paymentMethod.kind,
      kind: paymentMethod.kind,
      status: paymentMethod.is_active ? 'active' : 'inactive'
    }));
  }

  if (input.tool_name === 'finance_list_entities') {
    return listFinanceEntities(input.organization_id).map((entity) => ({
      id: entity.id,
      label: entity.trade_name || entity.legal_name,
      detail: [entity.legal_name, entity.kind].filter(Boolean).join(' · '),
      kind: entity.kind,
      status: entity.is_active ? 'active' : 'inactive'
    }));
  }

  if (input.tool_name === 'finance_list_recurring_rules') {
    return listFinanceRecurringRules(input.organization_id).map((rule) => ({
      id: rule.id,
      label: rule.name,
      detail: `${rule.resource_type} · todo dia ${rule.day_of_month}`,
      kind: rule.resource_type,
      status: rule.status
    }));
  }

  if (input.tool_name === 'finance_list_payables') {
    return listFinancePayables(input.organization_id).payables
      .filter((payable) => !input.status || payable.status === input.status)
      .filter((payable) => isWithinHorizon(payable.due_date, input.horizon_days))
      .filter((payable) => isWithinDateRange(payable.due_date, input.date_from, input.date_to))
      .filter((payable) => !input.financial_cost_center_id || payable.financial_cost_center_id === input.financial_cost_center_id)
      .filter((payable) => containsFilterValue(payable.financial_cost_center_name, input.financial_cost_center_name))
      .filter((payable) => !input.financial_category_id || payable.financial_category_id === input.financial_category_id)
      .filter((payable) => containsFilterValue(payable.financial_category_name, input.financial_category_name))
      .filter((payable) => !input.financial_entity_id || payable.financial_entity_id === input.financial_entity_id)
      .filter((payable) => containsFilterValue(payable.financial_entity_name ?? payable.supplier_name, input.financial_entity_name))
      .map((payable) => ({
        id: payable.id,
        label: payable.description,
        detail: [
          payable.supplier_name ?? payable.financial_entity_name,
          payable.due_date,
          payable.status,
          payable.amount_cents ? `R$ ${(payable.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
          payable.financial_cost_center_name ? `Centro: ${payable.financial_cost_center_name}` : null,
          payable.financial_category_name ? `Categoria: ${payable.financial_category_name}` : null
        ].filter(Boolean).join(' · '),
        kind: 'payable',
        status: payable.status
      }));
  }

  if (input.tool_name === 'finance_list_receivables') {
    return listFinanceReceivables(input.organization_id).receivables
      .filter((receivable) => !input.status || receivable.status === input.status)
      .filter((receivable) => isWithinHorizon(receivable.due_date, input.horizon_days))
      .filter((receivable) => isWithinDateRange(receivable.due_date, input.date_from, input.date_to))
      .filter((receivable) => !input.financial_cost_center_id || receivable.financial_cost_center_id === input.financial_cost_center_id)
      .filter((receivable) => containsFilterValue(receivable.financial_cost_center_name, input.financial_cost_center_name))
      .filter((receivable) => !input.financial_category_id || receivable.financial_category_id === input.financial_category_id)
      .filter((receivable) => containsFilterValue(receivable.financial_category_name, input.financial_category_name))
      .filter((receivable) => !input.financial_entity_id || receivable.financial_entity_id === input.financial_entity_id)
      .filter((receivable) => containsFilterValue(receivable.financial_entity_name ?? receivable.customer_name, input.financial_entity_name))
      .map((receivable) => ({
        id: receivable.id,
        label: receivable.description,
        detail: [
          receivable.customer_name ?? receivable.financial_entity_name,
          receivable.due_date,
          receivable.status,
          receivable.amount_cents ? `R$ ${(receivable.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
          receivable.financial_cost_center_name ? `Centro: ${receivable.financial_cost_center_name}` : null,
          receivable.financial_category_name ? `Categoria: ${receivable.financial_category_name}` : null
        ].filter(Boolean).join(' · '),
        kind: 'receivable',
        status: receivable.status
      }));
  }

  if (input.tool_name === 'finance_list_transactions') {
    return listFinanceTransactions(input.organization_id, {
      search: input.search ?? undefined
    }).transactions
      .filter((transaction) => !input.status || transaction.status === input.status)
      .filter((transaction) => !input.kind || transaction.kind === input.kind)
      .filter((transaction) => isWithinHorizon(transaction.settlement_date ?? transaction.due_date, input.horizon_days))
      .filter((transaction) => isWithinDateRange(transaction.settlement_date ?? transaction.due_date ?? transaction.competence_date, input.date_from, input.date_to))
      .filter((transaction) => !input.financial_cost_center_id || transaction.financial_cost_center_id === input.financial_cost_center_id)
      .filter((transaction) => containsFilterValue(transaction.financial_cost_center_name, input.financial_cost_center_name))
      .filter((transaction) => !input.financial_category_id || transaction.financial_category_id === input.financial_category_id)
      .filter((transaction) => containsFilterValue(transaction.financial_category_name, input.financial_category_name))
      .filter((transaction) => !input.financial_entity_id || transaction.financial_entity_id === input.financial_entity_id)
      .filter((transaction) => containsFilterValue(transaction.financial_entity_name, input.financial_entity_name))
      .map((transaction) => ({
        id: transaction.id,
        label: transaction.note || transaction.source || transaction.kind,
        detail: [
          transaction.kind,
          transaction.status,
          transaction.settlement_date ?? transaction.due_date ?? transaction.competence_date,
          transaction.amount_cents ? `R$ ${(transaction.amount_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null,
          transaction.financial_entity_name ? `Entidade: ${transaction.financial_entity_name}` : null,
          transaction.financial_account_name ? `Conta: ${transaction.financial_account_name}` : null,
          transaction.financial_cost_center_name ? `Centro: ${transaction.financial_cost_center_name}` : null,
          transaction.financial_category_name ? `Categoria: ${transaction.financial_category_name}` : null
        ].filter(Boolean).join(' · '),
        kind: transaction.kind,
        status: transaction.status
      }));
  }

  return [];
}
