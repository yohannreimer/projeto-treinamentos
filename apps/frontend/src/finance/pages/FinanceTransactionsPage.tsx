import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type CreateFinanceTransactionPayload,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceEntity,
  type FinanceTransaction,
  type FinanceTransactionKind,
  type FinanceTransactionLedgerFilters,
  type FinanceTransactionStatus
} from '../api';
import { FinanceLedgerTable } from '../components/FinanceLedgerTable';

type LedgerPeriod = '30d' | '90d' | 'all';
type TransactionEditorMode = 'create' | 'edit';

type LedgerFilterState = {
  period: LedgerPeriod;
  status: '' | FinanceTransactionStatus;
  kind: '' | FinanceTransactionKind;
  financial_account_id: string;
  financial_category_id: string;
  financial_entity_id: string;
  search: string;
  include_deleted: boolean;
};

type TransactionFormState = {
  financial_entity_id: string;
  financial_account_id: string;
  financial_category_id: string;
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  amount: string;
  issue_date: string;
  due_date: string;
  competence_date: string;
  settlement_date: string;
  note: string;
};

const initialFilters: LedgerFilterState = {
  period: '30d',
  status: '',
  kind: '',
  financial_account_id: '',
  financial_category_id: '',
  financial_entity_id: '',
  search: '',
  include_deleted: false
};

const initialTransactionForm: TransactionFormState = {
  financial_entity_id: '',
  financial_account_id: '',
  financial_category_id: '',
  kind: 'expense',
  status: 'open',
  amount: '',
  issue_date: '',
  due_date: '',
  competence_date: '',
  settlement_date: '',
  note: ''
};

const statusOptions: Array<{ value: LedgerFilterState['status']; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'planned', label: 'Planejado' },
  { value: 'open', label: 'Em aberto' },
  { value: 'partial', label: 'Parcial' },
  { value: 'settled', label: 'Liquidado' },
  { value: 'overdue', label: 'Atrasado' },
  { value: 'canceled', label: 'Cancelado' }
];

const transactionStatusOptions: Array<{ value: FinanceTransactionStatus; label: string }> = [
  { value: 'planned', label: 'Planejado' },
  { value: 'open', label: 'Em aberto' },
  { value: 'partial', label: 'Parcial' },
  { value: 'settled', label: 'Liquidado' },
  { value: 'overdue', label: 'Atrasado' },
  { value: 'canceled', label: 'Cancelado' }
];

const kindOptions: Array<{ value: LedgerFilterState['kind']; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'adjustment', label: 'Ajuste' }
];

const transactionKindOptions: Array<{ value: FinanceTransactionKind; label: string }> = [
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'adjustment', label: 'Ajuste' }
];

const periodOptions: Array<{ value: LedgerPeriod; label: string }> = [
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o histórico' }
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) {
    return '—';
  }

  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) {
    return dateIso;
  }

  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function kindLabel(kind: FinanceTransactionKind): string {
  if (kind === 'income') return 'Entrada';
  if (kind === 'expense') return 'Saída';
  if (kind === 'transfer') return 'Transferência';
  return 'Ajuste';
}

function statusLabel(status: FinanceTransactionStatus): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'settled') return 'Liquidado';
  if (status === 'overdue') return 'Atrasado';
  return 'Cancelado';
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveLedgerPeriod(period: LedgerPeriod): { from: string | null; to: string | null } {
  if (period === 'all') {
    return { from: null, to: null };
  }

  const range = period === '90d' ? 89 : 29;
  return {
    from: shiftDaysIso(range),
    to: todayIso()
  };
}

function buildLedgerFilters(filters: LedgerFilterState): FinanceTransactionLedgerFilters {
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

function parseAmountToCents(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

function formatAmountInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function buildTransactionForm(transaction: FinanceTransaction): TransactionFormState {
  return {
    financial_entity_id: transaction.financial_entity_id ?? '',
    financial_account_id: transaction.financial_account_id ?? '',
    financial_category_id: transaction.financial_category_id ?? '',
    kind: transaction.kind,
    status: transaction.status,
    amount: formatAmountInput(transaction.amount_cents),
    issue_date: transaction.issue_date ?? '',
    due_date: transaction.due_date ?? '',
    competence_date: transaction.competence_date ?? '',
    settlement_date: transaction.settlement_date ?? '',
    note: transaction.note ?? ''
  };
}

export function FinanceTransactionsPage() {
  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);
  const canApprove = hasAnyPermission(session?.user, ['finance.approve']);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [entities, setEntities] = useState<FinanceEntity[]>([]);
  const [filters, setFilters] = useState<LedgerFilterState>(initialFilters);
  const [editorMode, setEditorMode] = useState<TransactionEditorMode>('create');
  const [form, setForm] = useState<TransactionFormState>(initialTransactionForm);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setCatalogLoading(true);
    Promise.all([
      financeApi.listAccounts(),
      financeApi.listCategories(),
      financeApi.listEntities()
    ])
      .then(([accountsResponse, categoriesResponse, entitiesResponse]) => {
        if (cancelled) return;
        setAccounts(accountsResponse.accounts);
        setCategories(categoriesResponse.categories);
        setEntities(entitiesResponse);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar os catálogos financeiros.');
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ledgerFilters = buildLedgerFilters(filters);

    setLoading(true);
    setError('');

    financeApi.listTransactions(undefined, ledgerFilters)
      .then((response) => {
        if (cancelled) return;
        setTransactions(response.transactions);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setTransactions([]);
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar o ledger financeiro.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filters, reloadNonce]);

  useEffect(() => {
    if (transactions.length === 0) {
      setSelectedTransactionId(null);
      return;
    }

    const stillVisible = selectedTransactionId
      ? transactions.some((transaction) => transaction.id === selectedTransactionId)
      : false;

    if (!stillVisible) {
      setSelectedTransactionId(transactions[0].id);
    }
  }, [selectedTransactionId, transactions]);

  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions]
  );

  const summary = useMemo(() => {
    return transactions.reduce(
      (accumulator, transaction) => {
        accumulator.count += 1;
        accumulator.net += transaction.views.signed_amount_cents;
        accumulator.cash += transaction.views.cash_amount_cents;
        accumulator.competence += transaction.views.competence_amount_cents;
        accumulator.projected += transaction.views.projected_amount_cents;
        accumulator.confirmed += transaction.views.confirmed_amount_cents;
        if (transaction.is_deleted) {
          accumulator.deleted += 1;
        }
        if (transaction.views.signed_amount_cents >= 0) {
          accumulator.inflow += transaction.views.signed_amount_cents;
        } else {
          accumulator.outflow += Math.abs(transaction.views.signed_amount_cents);
        }
        return accumulator;
      },
      {
        count: 0,
        inflow: 0,
        outflow: 0,
        net: 0,
        cash: 0,
        competence: 0,
        projected: 0,
        confirmed: 0,
        deleted: 0
      }
    );
  }, [transactions]);

  const accountOptions = useMemo(
    () => [...accounts].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    [accounts]
  );

  const categoryOptions = useMemo(
    () => [...categories].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    [categories]
  );

  const entityOptions = useMemo(
    () => [...entities].sort((left, right) => {
      const leftName = left.trade_name || left.legal_name;
      const rightName = right.trade_name || right.legal_name;
      return leftName.localeCompare(rightName, 'pt-BR');
    }),
    [entities]
  );

  const selectedTransactionDetails = selectedTransaction
    ? [
        { label: 'Entidade', value: selectedTransaction.financial_entity_name || '—' },
        { label: 'Conta', value: selectedTransaction.financial_account_name || '—' },
        { label: 'Categoria', value: selectedTransaction.financial_category_name || '—' },
        { label: 'Tipo', value: kindLabel(selectedTransaction.kind) },
        { label: 'Status', value: statusLabel(selectedTransaction.status) },
        { label: 'Data de emissão', value: formatDate(selectedTransaction.issue_date) },
        { label: 'Data de vencimento', value: formatDate(selectedTransaction.due_date) },
        { label: 'Data de competência', value: formatDate(selectedTransaction.competence_date) },
        { label: 'Liquidação', value: formatDate(selectedTransaction.settlement_date) },
        { label: 'Fonte', value: selectedTransaction.source },
        { label: 'Referência', value: selectedTransaction.source_ref || '—' },
        { label: 'Criado por', value: selectedTransaction.created_by || 'sistema' }
      ]
    : [];

  const editorDisabled = submitting || catalogLoading || (editorMode === 'edit' && Boolean(selectedTransaction?.is_deleted));

  function updateFilter<K extends keyof LedgerFilterState>(key: K, value: LedgerFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateForm<K extends keyof TransactionFormState>(key: K, value: TransactionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreateMode() {
    setEditorMode('create');
    setForm(initialTransactionForm);
    setMessage('');
  }

  function startEditMode() {
    if (!selectedTransaction) {
      return;
    }
    setEditorMode('edit');
    setForm(buildTransactionForm(selectedTransaction));
    setMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) {
      setError('Você não tem permissão para alterar movimentações.');
      return;
    }

    const payload: CreateFinanceTransactionPayload = {
      financial_entity_id: form.financial_entity_id || null,
      financial_account_id: form.financial_account_id || null,
      financial_category_id: form.financial_category_id || null,
      kind: form.kind,
      status: form.status,
      amount_cents: parseAmountToCents(form.amount),
      issue_date: form.issue_date || null,
      due_date: form.due_date || null,
      settlement_date: form.settlement_date || null,
      competence_date: form.competence_date || null,
      note: form.note.trim() || null
    };

    if (payload.amount_cents <= 0) {
      setError('Informe um valor maior que zero para o lançamento.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');

      if (editorMode === 'edit' && selectedTransaction) {
        const updated = await financeApi.updateTransaction(selectedTransaction.id, payload);
        setSelectedTransactionId(updated.id);
        setMessage('Lançamento atualizado no ledger central.');
      } else {
        const created = await financeApi.createTransaction(payload);
        setSelectedTransactionId(created.id);
        setEditorMode('edit');
        setForm(buildTransactionForm(created));
        setMessage('Novo lançamento manual registrado com sucesso.');
      }

      setReloadNonce((current) => current + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha ao salvar movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!selectedTransaction || !canApprove || selectedTransaction.is_deleted) {
      return;
    }

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm('Excluir esta movimentação do ledger ativo? Ela continuará visível no histórico de excluídos.');

    if (!confirmed) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setMessage('');
      const deleted = await financeApi.deleteTransaction(selectedTransaction.id);
      setFilters((current) => current.include_deleted ? current : { ...current, include_deleted: true });
      setSelectedTransactionId(deleted.transaction.id);
      setEditorMode('create');
      setForm(initialTransactionForm);
      setReloadNonce((current) => current + 1);
      setMessage('Lançamento removido do ledger ativo. O histórico auditável agora inclui itens excluídos.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao excluir movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page finance-page finance-ledger-page">
      <header className="page-header finance-ledger-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Movimentações
          </small>
          <h1>Ledger financeiro</h1>
          <p>Base única para leitura auditável, operação manual e drill-down por linha do ERP financeiro.</p>
        </div>
        <div className="finance-ledger-header__meta">
          <span>{catalogLoading ? 'Carregando catálogos...' : `${accounts.length} contas · ${categories.length} categorias · ${entities.length} entidades`}</span>
          <span>
            {loading
              ? 'Atualizando ledger...'
              : `${summary.count} lançamentos${filters.include_deleted ? ` · ${summary.deleted} excluídos visíveis` : ''}`}
          </span>
        </div>
      </header>

      {error ? (
        <div className="panel" aria-live="polite">
          <div className="panel-content">
            <p role="alert">{error}</p>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="panel" aria-live="polite">
          <div className="panel-content">
            <p>{message}</p>
          </div>
        </div>
      ) : null}

      <div className="finance-ledger-layout">
        <section className="panel finance-ledger-filters" aria-label="Filtros do ledger">
          <div className="panel-header">
            <div>
              <small className="finance-panel-eyebrow">Recorte analítico</small>
              <h2>Filtros</h2>
            </div>
          </div>
          <div className="panel-content finance-ledger-filters__grid">
            <label className="finance-ledger-field" htmlFor="ledger-period">
              <span>Período</span>
              <select id="ledger-period" value={filters.period} onChange={(event) => updateFilter('period', event.target.value as LedgerPeriod)}>
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="finance-ledger-field" htmlFor="ledger-status">
              <span>Status</span>
              <select id="ledger-status" value={filters.status} onChange={(event) => updateFilter('status', event.target.value as LedgerFilterState['status'])}>
                {statusOptions.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="finance-ledger-field" htmlFor="ledger-kind">
              <span>Tipo</span>
              <select id="ledger-kind" value={filters.kind} onChange={(event) => updateFilter('kind', event.target.value as LedgerFilterState['kind'])}>
                {kindOptions.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="finance-ledger-field" htmlFor="ledger-account">
              <span>Conta</span>
              <select id="ledger-account" value={filters.financial_account_id} onChange={(event) => updateFilter('financial_account_id', event.target.value)}>
                <option value="">Todas</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>

            <label className="finance-ledger-field" htmlFor="ledger-category">
              <span>Categoria</span>
              <select id="ledger-category" value={filters.financial_category_id} onChange={(event) => updateFilter('financial_category_id', event.target.value)}>
                <option value="">Todas</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>

            <label className="finance-ledger-field" htmlFor="ledger-entity">
              <span>Entidade</span>
              <select id="ledger-entity" value={filters.financial_entity_id} onChange={(event) => updateFilter('financial_entity_id', event.target.value)}>
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
                onChange={(event) => updateFilter('search', event.target.value)}
                placeholder="Descrição, conta, categoria ou fonte"
              />
            </label>

            <label className="finance-ledger-toggle">
              <input
                type="checkbox"
                checked={filters.include_deleted}
                onChange={(event) => updateFilter('include_deleted', event.target.checked)}
              />
              <span>Incluir lançamentos excluídos no histórico</span>
            </label>
          </div>
        </section>

        <section className="finance-ledger-main">
          <div className="finance-ledger-summary" aria-label="Resumo do ledger">
            <article className="panel finance-ledger-summary-card">
              <small>Lançamentos</small>
              <strong>{summary.count}</strong>
              <span>no recorte atual</span>
            </article>
            <article className="panel finance-ledger-summary-card">
              <small>Entradas</small>
              <strong>{formatCurrency(summary.inflow)}</strong>
              <span>valor bruto acumulado</span>
            </article>
            <article className="panel finance-ledger-summary-card">
              <small>Saídas</small>
              <strong>{formatCurrency(summary.outflow)}</strong>
              <span>valor bruto acumulado</span>
            </article>
            <article className="panel finance-ledger-summary-card">
              <small>Saldo líquido</small>
              <strong>{formatCurrency(summary.net)}</strong>
              <span>visão contábil do recorte</span>
            </article>
          </div>

          <div className="finance-ledger-split">
            <div className="panel finance-ledger-table-panel">
              <div className="panel-header finance-ledger-table-panel__header">
                <div>
                  <small className="finance-panel-eyebrow">Leitura central</small>
                  <h2>Ledger financeiro</h2>
                </div>
                <p>
                  {loading
                    ? 'Carregando movimentações...'
                    : `${formatCurrency(summary.cash)} em caixa · ${formatCurrency(summary.competence)} em competência · ${formatCurrency(summary.projected)} projetado · ${formatCurrency(summary.confirmed)} confirmado`}
                </p>
              </div>
              <div className="panel-content finance-ledger-table-panel__content">
                <FinanceLedgerTable
                  rows={transactions}
                  selectedTransactionId={selectedTransactionId}
                  onSelectTransaction={setSelectedTransactionId}
                />
              </div>
            </div>

            <aside className="panel finance-ledger-detail" role="region" aria-label="Detalhes do lançamento">
              <div className="panel-header">
                <div>
                  <small className="finance-panel-eyebrow">Drill-down</small>
                  <h2>Detalhes da linha</h2>
                </div>
              </div>
              <div className="panel-content">
                {!selectedTransaction ? (
                  <p className="finance-ledger-detail__empty">
                    Selecione uma movimentação para ver a rastreabilidade completa aqui.
                  </p>
                ) : (
                  <div className="finance-ledger-detail__body">
                    <div className="finance-ledger-detail__headline">
                      <strong>{selectedTransaction.note || 'Movimentação financeira'}</strong>
                      <span>{formatCurrency(selectedTransaction.amount_cents)}</span>
                    </div>
                    <div className="finance-ledger-detail__actions">
                      <button type="button" className="secondary-button" onClick={startCreateMode}>
                        Novo lançamento
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={startEditMode}
                        disabled={!canWrite || selectedTransaction.is_deleted}
                      >
                        Editar linha
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={handleDelete}
                        disabled={!canApprove || selectedTransaction.is_deleted || submitting}
                      >
                        Excluir
                      </button>
                    </div>
                    {selectedTransaction.is_deleted ? (
                      <p className="finance-ledger-detail__audit-note">
                        Este lançamento já foi excluído do ledger ativo e permanece visível aqui apenas para rastreabilidade.
                      </p>
                    ) : null}
                    <dl className="finance-ledger-detail__list">
                      {selectedTransactionDetails.map((item) => (
                        <div key={item.label}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="finance-ledger-detail__views">
                      <div>
                        <small>Caixa</small>
                        <strong>{formatCurrency(selectedTransaction.views.cash_amount_cents)}</strong>
                      </div>
                      <div>
                        <small>Competência</small>
                        <strong>{formatCurrency(selectedTransaction.views.competence_amount_cents)}</strong>
                      </div>
                      <div>
                        <small>Projetado</small>
                        <strong>{formatCurrency(selectedTransaction.views.projected_amount_cents)}</strong>
                      </div>
                      <div>
                        <small>Confirmado</small>
                        <strong>{formatCurrency(selectedTransaction.views.confirmed_amount_cents)}</strong>
                      </div>
                    </div>
                    <p className="finance-ledger-detail__note">
                      {selectedTransaction.source === 'manual'
                        ? 'Lançamento manual registrado no ledger central.'
                        : 'Lançamento originado por processo operacional do ERP.'}
                    </p>
                  </div>
                )}

                <form className="finance-ledger-editor" onSubmit={handleSubmit}>
                  <div className="finance-ledger-editor__header">
                    <div>
                      <small className="finance-panel-eyebrow">Operação manual</small>
                      <h3>{editorMode === 'edit' ? 'Editar lançamento' : 'Novo lançamento'}</h3>
                    </div>
                    {editorMode === 'edit' ? (
                      <button type="button" className="secondary-button" onClick={startCreateMode}>
                        Limpar editor
                      </button>
                    ) : null}
                  </div>

                  <div className="finance-ledger-editor__grid">
                    <label className="finance-ledger-field">
                      <span>Entidade</span>
                      <select
                        value={form.financial_entity_id}
                        onChange={(event) => updateForm('financial_entity_id', event.target.value)}
                        disabled={editorDisabled}
                      >
                        <option value="">Sem vínculo</option>
                        {entityOptions.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.trade_name || entity.legal_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="finance-ledger-field">
                      <span>Conta</span>
                      <select
                        value={form.financial_account_id}
                        onChange={(event) => updateForm('financial_account_id', event.target.value)}
                        disabled={editorDisabled}
                      >
                        <option value="">Sem vínculo</option>
                        {accountOptions.map((account) => (
                          <option key={account.id} value={account.id}>{account.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="finance-ledger-field">
                      <span>Categoria</span>
                      <select
                        value={form.financial_category_id}
                        onChange={(event) => updateForm('financial_category_id', event.target.value)}
                        disabled={editorDisabled}
                      >
                        <option value="">Sem vínculo</option>
                        {categoryOptions.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="finance-ledger-field">
                      <span>Tipo</span>
                      <select value={form.kind} onChange={(event) => updateForm('kind', event.target.value as FinanceTransactionKind)} disabled={editorDisabled}>
                        {transactionKindOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="finance-ledger-field">
                      <span>Status</span>
                      <select value={form.status} onChange={(event) => updateForm('status', event.target.value as FinanceTransactionStatus)} disabled={editorDisabled}>
                        {transactionStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="finance-ledger-field">
                      <span>Valor</span>
                      <input
                        value={form.amount}
                        onChange={(event) => updateForm('amount', event.target.value)}
                        placeholder="0,00"
                        disabled={editorDisabled}
                      />
                    </label>

                    <label className="finance-ledger-field">
                      <span>Emissão</span>
                      <input type="date" value={form.issue_date} onChange={(event) => updateForm('issue_date', event.target.value)} disabled={editorDisabled} />
                    </label>

                    <label className="finance-ledger-field">
                      <span>Vencimento</span>
                      <input type="date" value={form.due_date} onChange={(event) => updateForm('due_date', event.target.value)} disabled={editorDisabled} />
                    </label>

                    <label className="finance-ledger-field">
                      <span>Competência</span>
                      <input type="date" value={form.competence_date} onChange={(event) => updateForm('competence_date', event.target.value)} disabled={editorDisabled} />
                    </label>

                    <label className="finance-ledger-field">
                      <span>Liquidação</span>
                      <input type="date" value={form.settlement_date} onChange={(event) => updateForm('settlement_date', event.target.value)} disabled={editorDisabled} />
                    </label>

                    <label className="finance-ledger-field finance-ledger-field--wide">
                      <span>Observação</span>
                      <textarea
                        value={form.note}
                        onChange={(event) => updateForm('note', event.target.value)}
                        placeholder="Descreva o contexto financeiro desta movimentação."
                        disabled={editorDisabled}
                        rows={4}
                      />
                    </label>
                  </div>

                  <div className="finance-ledger-editor__footer">
                    <button type="submit" className="primary-button" disabled={editorDisabled}>
                      {submitting ? 'Salvando...' : editorMode === 'edit' ? 'Salvar alteração' : 'Registrar lançamento'}
                    </button>
                    {!canWrite ? <span>Seu perfil atual pode ler, mas não alterar lançamentos.</span> : null}
                  </div>
                </form>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </section>
  );
}
