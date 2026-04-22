import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type CreateFinanceTransactionPayload,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceEntity,
  type FinanceTransaction,
} from '../api';
import { FinanceLedgerTable } from '../components/FinanceLedgerTable';
import {
  FinanceErrorState,
  FinanceKpiCard,
  FinanceLoadingState,
  FinanceMono,
  FinancePanel,
  FinancePageHeader,
  FinanceTableShell
} from '../components/FinancePrimitives';
import {
  FinanceTransactionDetailPanel,
  FinanceTransactionEditorPanel,
  type FinanceTransactionFormState
} from '../components/FinanceTransactionPanels';
import {
  FinanceTransactionFilters,
  buildLedgerFilters,
  type LedgerFilterState,
  type LedgerPeriod
} from '../components/FinanceTransactionFilters';
import {
  formatAmountInput,
  formatCurrency,
  parseAmountToCents
} from '../utils/financeFormatters';

type TransactionEditorMode = 'create' | 'edit';

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

const initialTransactionForm: FinanceTransactionFormState = {
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

const kindOptions: Array<{ value: LedgerFilterState['kind']; label: string }> = [
  { value: '', label: 'Todos' },
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

function buildTransactionForm(transaction: FinanceTransaction): FinanceTransactionFormState {
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
  const [form, setForm] = useState<FinanceTransactionFormState>(initialTransactionForm);
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

    financeApi.listTransactions(ledgerFilters)
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

  const editorDisabled = submitting || catalogLoading || (editorMode === 'edit' && Boolean(selectedTransaction?.is_deleted));

  function updateFilter<K extends keyof LedgerFilterState>(key: K, value: LedgerFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateForm<K extends keyof FinanceTransactionFormState>(key: K, value: FinanceTransactionFormState[K]) {
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
      <FinancePageHeader
        eyebrow="Movimentações"
        title="Ledger financeiro"
        description="Base única para leitura auditável, operação manual e drill-down por linha do ERP financeiro."
        meta={(
          <>
            <span>{catalogLoading ? 'Carregando catálogos...' : `${accounts.length} contas · ${categories.length} categorias · ${entities.length} entidades`}</span>
            <span>
              {loading
                ? 'Atualizando ledger...'
                : <FinanceMono>{`${summary.count} lançamentos${filters.include_deleted ? ` · ${summary.deleted} excluídos visíveis` : ''}`}</FinanceMono>}
            </span>
          </>
        )}
      />

      {error ? (
        <FinanceErrorState title="Não foi possível carregar o ledger." description={error} />
      ) : null}

      {message ? (
        <FinancePanel ariaLabel="Mensagem do ledger" title="Status da operação">
          <p>{message}</p>
        </FinancePanel>
      ) : null}

      {loading && transactions.length === 0 ? (
        <FinanceLoadingState
          title="Carregando ledger financeiro..."
          description="Buscando movimentações, catálogos e a linha operacional do período."
        />
      ) : null}

      <div className="finance-ledger-layout">
        <FinanceTransactionFilters
          filters={filters}
          periodOptions={periodOptions}
          statusOptions={statusOptions}
          kindOptions={kindOptions}
          accountOptions={accountOptions}
          categoryOptions={categoryOptions}
          entityOptions={entityOptions}
          onUpdateFilter={updateFilter}
        />

        <section className="finance-ledger-main">
          <div className="finance-ledger-summary" aria-label="Resumo do ledger">
            <FinanceKpiCard label="Lançamentos" value={<FinanceMono>{summary.count}</FinanceMono>} description="no recorte atual" tone="neutral" accentLabel="Ledger" />
            <FinanceKpiCard label="Entradas" value={<FinanceMono>{formatCurrency(summary.inflow)}</FinanceMono>} description="valor bruto acumulado" tone="success" accentLabel="Ledger" />
            <FinanceKpiCard label="Saídas" value={<FinanceMono>{formatCurrency(summary.outflow)}</FinanceMono>} description="valor bruto acumulado" tone="warning" accentLabel="Ledger" />
            <FinanceKpiCard label="Saldo líquido" value={<FinanceMono>{formatCurrency(summary.net)}</FinanceMono>} description="visão contábil do recorte" tone={summary.net >= 0 ? 'success' : 'danger'} accentLabel="Ledger" />
          </div>

          <div className="finance-ledger-split">
            <FinanceTableShell
              className="finance-ledger-table-panel"
              title="Ledger financeiro"
              description={loading
                ? 'Carregando movimentações...'
                : `${formatCurrency(summary.cash)} em caixa · ${formatCurrency(summary.competence)} em competência · ${formatCurrency(summary.projected)} projetado · ${formatCurrency(summary.confirmed)} confirmado`}
            >
              <FinanceLedgerTable
                rows={transactions}
                selectedTransactionId={selectedTransactionId}
                onSelectTransaction={setSelectedTransactionId}
              />
            </FinanceTableShell>

            <div className="finance-section-stack">
              <FinanceTransactionDetailPanel
                transaction={selectedTransaction}
                canWrite={canWrite}
                canApprove={canApprove}
                submitting={submitting}
                onCreate={startCreateMode}
                onEdit={startEditMode}
                onDelete={handleDelete}
              />

              <FinanceTransactionEditorPanel
                form={form}
                accounts={accountOptions}
                categories={categoryOptions}
                entities={entityOptions}
                editorMode={editorMode}
                editorDisabled={editorDisabled}
                submitting={submitting}
                onUpdateForm={updateForm}
                onStartCreate={startCreateMode}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
