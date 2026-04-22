import type { FinanceAccount, FinanceCategory, FinanceEntity, FinanceTransactionKind, FinanceTransactionLedgerFilters, FinanceTransactionStatus } from '../api';
import { todayIso } from '../utils/financeFormatters';
import { FinanceFilterBlock } from './FinancePrimitives';

export type LedgerPeriod = '30d' | '90d' | 'all';

type FilterState = {
  period: LedgerPeriod;
  status: '' | FinanceTransactionStatus;
  kind: '' | FinanceTransactionKind;
  financial_account_id: string;
  financial_category_id: string;
  financial_entity_id: string;
  search: string;
  include_deleted: boolean;
};

export type LedgerFilterState = FilterState;

export function buildLedgerFilters(filters: FilterState): FinanceTransactionLedgerFilters {
  const period = resolveLedgerPeriod(filters.period);
  return {
    status: filters.status || null,
    kind: filters.kind || null,
    financial_account_id: filters.financial_account_id || null,
    financial_category_id: filters.financial_category_id || null,
    financial_entity_id: filters.financial_entity_id || null,
    from: period.from,
    to: period.to,
    search: filters.search.trim() || null,
    include_deleted: filters.include_deleted
  };
}

export function resolveLedgerPeriod(period: LedgerPeriod): { from: string | null; to: string | null } {
  if (period === 'all') {
    return { from: null, to: null };
  }

  const date = new Date();
  date.setDate(date.getDate() - (period === '90d' ? 89 : 29));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return {
    from: `${year}-${month}-${day}`,
    to: todayIso()
  };
}

export function FinanceTransactionFilters({
  filters,
  periodOptions,
  statusOptions,
  kindOptions,
  accountOptions,
  categoryOptions,
  entityOptions,
  onUpdateFilter
}: {
  filters: FilterState;
  periodOptions: Array<{ value: LedgerPeriod; label: string }>;
  statusOptions: Array<{ value: FilterState['status']; label: string }>;
  kindOptions: Array<{ value: FilterState['kind']; label: string }>;
  accountOptions: FinanceAccount[];
  categoryOptions: FinanceCategory[];
  entityOptions: FinanceEntity[];
  onUpdateFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
}) {
  return (
    <FinanceFilterBlock
      className="finance-ledger-filters"
      title="Filtros"
      description="Recorte analítico para leitura do ledger por período, status, tipo, conta, categoria, entidade e busca."
      ariaLabel="Filtros do ledger"
    >
      <div className="finance-ledger-filters__grid">
        <label className="finance-ledger-field" htmlFor="ledger-period">
          <span>Período</span>
          <select id="ledger-period" value={filters.period} onChange={(event) => onUpdateFilter('period', event.target.value as LedgerPeriod)}>
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field" htmlFor="ledger-status">
          <span>Status</span>
          <select id="ledger-status" value={filters.status} onChange={(event) => onUpdateFilter('status', event.target.value as FilterState['status'])}>
            {statusOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field" htmlFor="ledger-kind">
          <span>Tipo</span>
          <select id="ledger-kind" value={filters.kind} onChange={(event) => onUpdateFilter('kind', event.target.value as FilterState['kind'])}>
            {kindOptions.map((option) => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field" htmlFor="ledger-account">
          <span>Conta</span>
          <select id="ledger-account" value={filters.financial_account_id} onChange={(event) => onUpdateFilter('financial_account_id', event.target.value)}>
            <option value="">Todas</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field" htmlFor="ledger-category">
          <span>Categoria</span>
          <select id="ledger-category" value={filters.financial_category_id} onChange={(event) => onUpdateFilter('financial_category_id', event.target.value)}>
            <option value="">Todas</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field" htmlFor="ledger-entity">
          <span>Entidade</span>
          <select id="ledger-entity" value={filters.financial_entity_id} onChange={(event) => onUpdateFilter('financial_entity_id', event.target.value)}>
            <option value="">Todas</option>
            {entityOptions.map((entity) => (
              <option key={entity.id} value={entity.id}>{entity.trade_name || entity.legal_name}</option>
            ))}
          </select>
        </label>

        <label className="finance-ledger-field finance-ledger-field--wide" htmlFor="ledger-search">
          <span>Busca</span>
          <input
            id="ledger-search"
            value={filters.search}
            onChange={(event) => onUpdateFilter('search', event.target.value)}
            placeholder="Descrição, conta, categoria ou fonte"
          />
        </label>

        <label className="finance-ledger-toggle">
          <input
            type="checkbox"
            checked={filters.include_deleted}
            onChange={(event) => onUpdateFilter('include_deleted', event.target.checked)}
          />
          <span>Incluir lançamentos excluídos no histórico</span>
        </label>
      </div>
    </FinanceFilterBlock>
  );
}
