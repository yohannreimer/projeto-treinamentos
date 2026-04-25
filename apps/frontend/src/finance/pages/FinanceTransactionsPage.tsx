import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type CreateFinanceTransactionPayload,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceEntity,
  type FinanceTransaction
} from '../api';
import { FINANCE_QUICK_LAUNCH_CREATED_EVENT } from '../components/FinanceFloatingQuickLauncher';
import { FinancePeriodFilter } from '../components/FinancePeriodFilter';
import { resolveFinancePeriodWindow, useFinancePeriod } from '../hooks/useFinancePeriod';
import { formatAmountInput, formatCurrency, formatDate, parseAmountToCents, todayIso } from '../utils/financeFormatters';

type TransactionEditorMode = 'view' | 'create';

type TransactionFormState = {
  financial_entity_id: string;
  financial_account_id: string;
  financial_category_id: string;
  kind: FinanceTransaction['kind'];
  status: FinanceTransaction['status'];
  amount: string;
  issue_date: string;
  due_date: string;
  competence_date: string;
  settlement_date: string;
  note: string;
};

type FilterState = {
  type: 'todos' | 'income' | 'expense';
  status: 'todos' | FinanceTransaction['status'];
  search: string;
};

const initialFilters: FilterState = {
  type: 'todos',
  status: 'todos',
  search: ''
};

const initialForm: TransactionFormState = {
  financial_entity_id: '',
  financial_account_id: '',
  financial_category_id: '',
  kind: 'expense',
  status: 'open',
  amount: '',
  issue_date: todayIso(),
  due_date: '',
  competence_date: '',
  settlement_date: '',
  note: ''
};

const statusOptions: Array<{ value: FilterState['status']; label: string }> = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'planned', label: 'Planejado' },
  { value: 'open', label: 'Em aberto' },
  { value: 'partial', label: 'Parcial' },
  { value: 'settled', label: 'Liquidado' },
  { value: 'overdue', label: 'Atrasado' },
  { value: 'canceled', label: 'Cancelado' }
];

const kindOptions: Array<{ value: FilterState['type']; label: string }> = [
  { value: 'todos', label: 'Todos os tipos' },
  { value: 'income', label: 'Entrada' },
  { value: 'expense', label: 'Saída' }
];

function entityName(entity?: FinanceEntity | null) {
  if (!entity) return '—';
  return entity.trade_name || entity.legal_name || '—';
}

function kindLabel(kind: FinanceTransaction['kind']) {
  if (kind === 'income') return 'Entrada';
  if (kind === 'expense') return 'Saída';
  if (kind === 'transfer') return 'Transferência';
  return 'Ajuste';
}

function statusLabel(status: FinanceTransaction['status']) {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'settled') return 'Liquidado';
  if (status === 'overdue') return 'Atrasado';
  return 'Cancelado';
}

function statusTone(status: FinanceTransaction['status']) {
  if (status === 'settled') return '#059669';
  if (status === 'overdue' || status === 'canceled') return '#ef4444';
  if (status === 'planned') return '#2563eb';
  if (status === 'partial') return '#d97706';
  return '#64748b';
}

function matchesSearch(transaction: FinanceTransaction, search: string) {
  if (!search.trim()) return true;
  const normalized = search.trim().toLowerCase();
  return [
    transaction.note,
    transaction.financial_entity_name,
    transaction.financial_account_name,
    transaction.financial_category_name,
    transaction.financial_cost_center_name,
    transaction.source_ref,
    transaction.issue_date,
    transaction.due_date,
    transaction.settlement_date,
    transaction.competence_date,
    transaction.id
  ].some((value) => value?.toLowerCase().includes(normalized));
}

function buildFormFromTransaction(transaction: FinanceTransaction): TransactionFormState {
  return {
    financial_entity_id: transaction.financial_entity_id ?? '',
    financial_account_id: transaction.financial_account_id ?? '',
    financial_category_id: transaction.financial_category_id ?? '',
    kind: transaction.kind,
    status: transaction.status,
    amount: formatAmountInput(transaction.amount_cents),
    issue_date: transaction.issue_date ?? todayIso(),
    due_date: transaction.due_date ?? '',
    competence_date: transaction.competence_date ?? '',
    settlement_date: transaction.settlement_date ?? '',
    note: transaction.note ?? ''
  };
}

function getRowLabel(transaction: FinanceTransaction) {
  return transaction.note?.trim() || transaction.financial_entity_name || 'Movimentação financeira';
}

function SummaryCard({
  label,
  value,
  description,
  accent,
  spark
}: {
  label: string;
  value: string;
  description: string;
  accent: string;
  spark?: number[];
}) {
  const points =
    spark?.map((height, index) => {
      const x = (index / Math.max(spark.length - 1, 1)) * 100;
      const y = 100 - height;
      return `${x},${y}`;
    }) ?? [];
  const areaPoints = points.length > 0 ? `0,100 ${points.join(' ')} 100,100` : '';

  return (
    <article style={summaryCardStyle}>
      <div style={{ ...summaryDotStyle, background: accent }} aria-hidden="true" />
      {spark ? (
        <div style={sparkWrapStyle} aria-hidden="true">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={sparkSvgStyle}>
            <polygon points={areaPoints} fill={`${accent}14`} />
            <polyline points={points.join(' ')} fill="none" stroke={accent} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      ) : null}
      <h3 style={summaryLabelStyle}>{label}</h3>
      <strong style={summaryValueStyle}>{value}</strong>
      <p style={summaryDescriptionStyle}>{description}</p>
    </article>
  );
}

function StatusBadge({ status, text }: { status: FinanceTransaction['status']; text: string }) {
  return <span style={{ ...statusBadgeStyle, color: statusTone(status), borderColor: `${statusTone(status)}33`, background: `${statusTone(status)}10` }}>{text}</span>;
}

function InputLabel({ children }: { children: string }) {
  return <label style={fieldLabelStyle}>{children}</label>;
}

function TransactionCard({
  title,
  children,
  padding = 20,
  style
}: {
  title?: string;
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <section style={{ ...cardStyle, padding, ...style }} aria-label={title}>
      {children}
    </section>
  );
}

export function FinanceTransactionsPage() {
  const { period, setPeriod } = useFinancePeriod();
  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);
  const canApprove = hasAnyPermission(session?.user, ['finance.approve']);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [entities, setEntities] = useState<FinanceEntity[]>([]);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [mode, setMode] = useState<TransactionEditorMode>('view');
  const [draftTransactionId, setDraftTransactionId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionFormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const periodWindow = useMemo(() => resolveFinancePeriodWindow(period), [period]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    const kind = params.get('kind');
    const status = params.get('status');
    setFilters((current) => ({
      ...current,
      type: kind === 'income' || kind === 'expense' ? kind : current.type,
      status: statusOptions.some((option) => option.value === status) ? status as FilterState['status'] : current.status
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    setCatalogLoading(true);
    Promise.all([financeApi.listAccounts(), financeApi.listCategories(), financeApi.listEntities()])
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

    setLoading(true);
    setError('');

    financeApi
      .listTransactions({
        kind: filters.type === 'todos' ? null : filters.type,
        status: filters.status === 'todos' ? null : filters.status,
        from: periodWindow.from,
        to: periodWindow.to,
        search: filters.search.trim() || null
      })
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
  }, [filters.search, filters.status, filters.type, periodWindow.from, periodWindow.to, reloadNonce]);

  useEffect(() => {
    function handleQuickLaunchCreated() {
      setMessage('Lançamento rápido registrado.');
      setReloadNonce((current) => current + 1);
    }

    window.addEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, handleQuickLaunchCreated);
    return () => window.removeEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, handleQuickLaunchCreated);
  }, []);

  useEffect(() => {
    if (selectedTransactionId && !transactions.some((transaction) => transaction.id === selectedTransactionId)) {
      setSelectedTransactionId(null);
    }
  }, [selectedTransactionId, transactions]);

  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions]
  );

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      if (filters.type !== 'todos' && transaction.kind !== filters.type) {
        return false;
      }

      if (filters.status !== 'todos' && transaction.status !== filters.status) {
        return false;
      }

      return matchesSearch(transaction, filters.search);
    });
  }, [filters.search, filters.status, filters.type, transactions]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (accumulator, transaction) => {
        if (transaction.kind === 'income') {
          accumulator.in += transaction.amount_cents;
        } else {
          accumulator.out += transaction.amount_cents;
        }
        return accumulator;
      },
      { in: 0, out: 0 }
    );
  }, [filteredTransactions]);

  const filteredCount = filteredTransactions.length;
  const selectedIsEditing = mode === 'create' && Boolean(draftTransactionId);
  const submitLabel = selectedIsEditing ? 'Salvar alteração' : 'Salvar lançamento';
  const currentDraftSource = draftTransactionId ? transactions.find((transaction) => transaction.id === draftTransactionId) ?? null : null;
  const detailTransaction = selectedTransaction;

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateForm<K extends keyof TransactionFormState>(key: K, value: TransactionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreateMode() {
    setMode('create');
    setDraftTransactionId(null);
    setSelectedTransactionId(null);
    setForm(initialForm);
    setMessage('');
  }

  function startEditMode() {
    if (!selectedTransaction) {
      return;
    }

    setMode('create');
    setDraftTransactionId(selectedTransaction.id);
    setForm(buildFormFromTransaction(selectedTransaction));
    setMessage('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canWrite) {
      setError('Você não tem permissão para alterar movimentações.');
      return;
    }

    const baseTransaction = currentDraftSource;
    const nextSettlementDate =
      form.status === 'settled'
        ? (form.settlement_date || baseTransaction?.settlement_date || form.issue_date || todayIso())
        : null;

    const payload: CreateFinanceTransactionPayload = {
      financial_entity_id: form.financial_entity_id || null,
      financial_account_id: form.financial_account_id || null,
      financial_category_id: form.financial_category_id || null,
      kind: form.kind,
      status: form.status,
      amount_cents: parseAmountToCents(form.amount),
      issue_date: form.issue_date || null,
      due_date: (baseTransaction?.due_date ?? form.due_date) || null,
      settlement_date: nextSettlementDate,
      competence_date: (baseTransaction?.competence_date ?? form.competence_date) || null,
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

      if (selectedIsEditing && draftTransactionId) {
        const updated = await financeApi.updateTransaction(draftTransactionId, payload);
        setSelectedTransactionId(updated.id);
        setDraftTransactionId(null);
        setMode('view');
        setMessage('Lançamento atualizado no ledger central.');
      } else {
        const created = await financeApi.createTransaction(payload);
        setSelectedTransactionId(created.id);
        setDraftTransactionId(null);
        setMode('view');
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

    const confirmed =
      typeof window === 'undefined'
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
      setSelectedTransactionId(deleted.transaction.id);
      setDraftTransactionId(null);
      setMode('view');
      setReloadNonce((current) => current + 1);
      setMessage('Lançamento removido do ledger ativo. O histórico auditável agora inclui itens excluídos.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Falha ao excluir movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

const pageStyles = {
  background: '#f8fafc',
  minHeight: '100%',
  padding: '0 0 32px'
} as const;

const mainGridStyles = {
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: 16,
  alignItems: 'start'
} as const;

  return (
    <section className="page finance-page finance-ledger-page" style={pageStyles}>
      <header style={pageHeaderStyle}>
        <div>
          <small style={eyebrowStyle}>Movimentações</small>
          <h1 style={titleStyle}>Ledger financeiro</h1>
          <p style={descriptionStyle}>Registro auditável de todas as movimentações financeiras da organização.</p>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          <FinancePeriodFilter value={period} onChange={setPeriod} />
          <div style={metaCardStyle}>
            <strong style={metaPrimaryStyle}>{`${filteredCount} lançamentos`}</strong>
            <span style={metaSecondaryStyle}>{`${transactions.length} total no ledger`}</span>
          </div>
        </div>
      </header>

      {error ? <div style={errorStyle}>{error}</div> : null}
      {message ? <div style={messageStyle}>{message}</div> : null}

      <div style={summaryGridStyle} aria-label="Resumo do ledger">
        <SummaryCard label="Total de lançamentos" value={String(filteredCount)} description="no filtro atual" accent="#2563eb" />
        <SummaryCard
          label="Entradas"
          value={formatCurrency(totals.in)}
          description="soma das entradas"
          accent="#059669"
          spark={[40, 60, 55, 80, 70, 95, 85, 90, 100]}
        />
        <SummaryCard
          label="Saídas"
          value={formatCurrency(totals.out)}
          description="soma das saídas"
          accent="#ef4444"
          spark={[30, 50, 45, 60, 55, 75, 65, 70, 80]}
        />
        <SummaryCard
          label="Saldo líquido"
          value={formatCurrency(totals.in - totals.out)}
          description="entradas − saídas"
          accent="#7c3aed"
        />
      </div>

      {loading && transactions.length === 0 ? (
        <div style={loadingCardStyle}>Carregando ledger financeiro...</div>
      ) : null}

      <div style={mainGridStyles}>
        <div>
          <TransactionCard title="Filtros do ledger" padding={14}>
            <div style={filtersGridStyle}>
              <div style={{ ...searchFieldStyle, gridColumn: '1 / 2' }}>
                <div style={searchWrapStyle}>
                  <span style={searchIconStyle} aria-hidden="true">
                    ⌕
                  </span>
                  <input
                    aria-label="Busca"
                    style={{ ...inputStyle, paddingLeft: 30 }}
                    placeholder="Buscar lançamento ou entidade..."
                    value={filters.search}
                    onChange={(event) => updateFilter('search', event.target.value)}
                  />
                </div>
              </div>

              <div style={fieldStyle}>
                <select
                  aria-label="Tipo"
                  style={selectStyle}
                  value={filters.type}
                  onChange={(event) => updateFilter('type', event.target.value as FilterState['type'])}
                >
                  {kindOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldStyle}>
                <select
                  aria-label="Status"
                  style={selectStyle}
                  value={filters.status}
                  onChange={(event) => updateFilter('status', event.target.value as FilterState['status'])}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                aria-label="Novo lançamento"
                onClick={startCreateMode}
                disabled={!canWrite}
                style={primaryButtonStyle}
              >
                <span style={primaryButtonIconStyle} aria-hidden="true">
                  +
                </span>
                Novo
              </button>
            </div>
          </TransactionCard>

          <TransactionCard title="Ledger financeiro" padding={0}>
            {loading ? (
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Carregando movimentações...</div>
            ) : null}
            {filteredTransactions.length === 0 ? (
              <div style={emptyStateStyle}>Nenhum lançamento encontrado para este filtro.</div>
            ) : (
              <table style={tableStyle} aria-label="Ledger financeiro">
                <thead>
                  <tr style={tableHeadRowStyle}>
                    {['Lançamento', 'Entidade', 'Categoria', 'Status', 'Data', 'Valor'].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          ...thStyle,
                          textAlign: heading === 'Valor' ? 'right' : 'left'
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => {
                    const isSelected = selectedTransactionId === transaction.id;
                    const rowText = getRowLabel(transaction);

                    return (
                      <tr
                        key={transaction.id}
                        onClick={() => {
                          setSelectedTransactionId(transaction.id);
                          setMode('view');
                          setDraftTransactionId(null);
                        }}
                        style={{
                          ...trStyle,
                          background: isSelected ? '#f0f7ff' : 'white'
                        }}
                        onMouseEnter={(event) => {
                          if (!isSelected) {
                            event.currentTarget.style.background = '#f8fafc';
                          }
                        }}
                        onMouseLeave={(event) => {
                          if (!isSelected) {
                            event.currentTarget.style.background = 'white';
                          }
                        }}
                      >
                        <td style={tdStyle}>
                          <button
                            type="button"
                            aria-label={rowText}
                            onClick={() => {
                              setSelectedTransactionId(transaction.id);
                              setMode('view');
                              setDraftTransactionId(null);
                            }}
                            style={rowButtonStyle}
                          >
                            <div style={rowPrimaryTextStyle}>{rowText}</div>
                            <div style={rowSecondaryTextStyle}>{transaction.id}</div>
                          </button>
                        </td>
                        <td style={tdTextStyle}>{transaction.financial_entity_name || '—'}</td>
                        <td style={tdTextStyle}>{transaction.financial_category_name || '—'}</td>
                        <td style={tdStatusCellStyle}>
                          <StatusBadge status={transaction.status} text={statusLabel(transaction.status)} />
                        </td>
                        <td style={{ ...tdTextStyle, fontFamily: 'monospace' }}>{formatDate(transaction.competence_date ?? transaction.issue_date)}</td>
                        <td style={{ ...tdAmountStyle, color: transaction.kind === 'income' ? '#059669' : '#ef4444' }}>
                          {transaction.kind === 'income' ? '+' : '−'} {formatCurrency(transaction.amount_cents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </TransactionCard>
        </div>

        <div>
          {mode === 'create' ? (
            <TransactionCard title="Novo lançamento">
              <form onSubmit={handleSubmit}>
                <div style={formStackStyle}>
                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Descrição</span>
                    <input
                      aria-label="Descrição"
                      type="text"
                      placeholder="Ex: Cachê artístico"
                      value={form.note}
                      onChange={(event) => updateForm('note', event.target.value)}
                      disabled={!canWrite || submitting}
                      style={inputStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Entidade</span>
                    <select
                      aria-label="Entidade"
                      value={form.financial_entity_id}
                      onChange={(event) => updateForm('financial_entity_id', event.target.value)}
                      disabled={!canWrite || submitting || catalogLoading}
                      style={selectStyle}
                    >
                      <option value="">Ex: João Silva</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entityName(entity)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Valor (R$)</span>
                    <input
                      aria-label="Valor"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={form.amount}
                      onChange={(event) => updateForm('amount', event.target.value)}
                      disabled={!canWrite || submitting}
                      style={inputStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Tipo</span>
                    <select
                      aria-label="Tipo do lançamento"
                      value={form.kind}
                      onChange={(event) => updateForm('kind', event.target.value as TransactionFormState['kind'])}
                      disabled={!canWrite || submitting}
                      style={selectStyle}
                    >
                      <option value="income">Entrada</option>
                      <option value="expense">Saída</option>
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Status</span>
                    <select
                      aria-label="Status do lançamento"
                      value={form.status}
                      onChange={(event) => {
                        const nextStatus = event.target.value as TransactionFormState['status'];
                        setForm((current) => ({
                          ...current,
                          status: nextStatus,
                          settlement_date:
                            nextStatus === 'settled'
                              ? current.settlement_date || current.issue_date || todayIso()
                              : current.settlement_date
                        }));
                      }}
                      disabled={!canWrite || submitting}
                      style={selectStyle}
                    >
                      <option value="planned">Planejado</option>
                      <option value="open">Em aberto</option>
                      <option value="partial">Parcial</option>
                      <option value="settled">Liquidado</option>
                      <option value="overdue">Atrasado</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Conta</span>
                    <select
                      aria-label="Conta"
                      value={form.financial_account_id}
                      onChange={(event) => updateForm('financial_account_id', event.target.value)}
                      disabled={!canWrite || submitting || catalogLoading}
                      style={selectStyle}
                    >
                      <option value="">Conta Principal</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelInlineStyle}>Data de emissão</span>
                    <input
                      aria-label="Data de emissão"
                      type="date"
                      value={form.issue_date}
                      onChange={(event) => updateForm('issue_date', event.target.value)}
                      disabled={!canWrite || submitting}
                      style={inputStyle}
                    />
                  </label>

                  <div style={formActionsStyle}>
                    <button
                      type="submit"
                      disabled={!canWrite || submitting}
                      aria-label={submitLabel}
                      style={primaryButtonWideStyle}
                    >
                      {submitLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('view');
                        setDraftTransactionId(null);
                        setForm(initialForm);
                      }}
                      style={secondaryButtonStyle}
                      aria-label="Fechar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </form>
            </TransactionCard>
          ) : detailTransaction ? (
            <TransactionCard title="Detalhes do lançamento">
              <div style={detailHeaderStyle}>
                <div>
                  <div style={detailTitleStyle}>{getRowLabel(detailTransaction)}</div>
                  <div style={detailAmountStyle}>
                    {detailTransaction.kind === 'income' ? '+' : '−'} {formatCurrency(detailTransaction.amount_cents)}
                  </div>
                </div>
                <StatusBadge status={detailTransaction.status} text={statusLabel(detailTransaction.status)} />
              </div>

              <div style={dividerStyle} />

              <div style={detailListStyle}>
                {[
                  ['Entidade', detailTransaction.financial_entity_name || '—'],
                  ['Conta', detailTransaction.financial_account_name || '—'],
                  ['Categoria', detailTransaction.financial_category_name || '—'],
                  ['Tipo', kindLabel(detailTransaction.kind)],
                  ['Data-base', formatDate(detailTransaction.competence_date ?? detailTransaction.issue_date)],
                  ['Referência', detailTransaction.id]
                ].map(([label, value]) => (
                  <div key={label} style={detailRowStyle}>
                    <span style={detailLabelStyle}>{label}</span>
                    <span style={detailValueStyle}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={detailActionsStyle}>
                <button
                  type="button"
                  onClick={startEditMode}
                  disabled={!canWrite || submitting || detailTransaction.is_deleted}
                  aria-label="Editar linha"
                  style={primaryButtonWideStyle}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canApprove || submitting || detailTransaction.is_deleted}
                  style={destructiveButtonStyle}
                >
                  Excluir
                </button>
              </div>
            </TransactionCard>
          ) : (
            <TransactionCard title="Detalhes do lançamento">
              <div style={emptyDetailStyle}>
                Selecione um lançamento para ver os detalhes, ou clique em Novo para criar.
              </div>
            </TransactionCard>
          )}
        </div>
      </div>
    </section>
  );
}

const pageHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 24,
  marginBottom: 28
} as const;

const eyebrowStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#ea6a21'
} as const;

const titleStyle = {
  margin: 0,
  fontSize: 26,
  lineHeight: 1.2,
  color: '#0f172a',
  fontWeight: 700
} as const;

const descriptionStyle = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: '#64748b',
  maxWidth: 560
} as const;

const metaCardStyle = {
  minWidth: 200,
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  flexShrink: 0
} as const;

const metaPrimaryStyle = {
  fontSize: 12,
  lineHeight: 1.2,
  color: '#0f172a',
  fontWeight: 600
} as const;

const metaSecondaryStyle = {
  fontSize: 12,
  lineHeight: 1.45,
  color: '#64748b'
} as const;

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
  marginBottom: 16
} as const;

const summaryCardStyle = {
  position: 'relative',
  overflow: 'hidden',
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '16px 20px',
  minHeight: 109
} as const;

const summaryDotStyle = {
  position: 'absolute',
  top: 14,
  right: 16,
  width: 7,
  height: 7,
  borderRadius: 4
} as const;

const summaryLabelStyle = {
  margin: '0 0 4px',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  fontWeight: 700
} as const;

const summaryValueStyle = {
  display: 'block',
  marginBottom: 4,
  fontSize: 22,
  lineHeight: 1.2,
  color: '#0f172a',
  fontFamily: "'DM Mono', monospace",
  fontWeight: 600
} as const;

const summaryDescriptionStyle = {
  margin: 0,
  fontSize: 11,
  color: '#94a3b8'
} as const;

const sparkWrapStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 36,
  opacity: 0.6
} as const;

const sparkSvgStyle = {
  display: 'block',
  width: '100%',
  height: '100%'
} as const;

const cardStyle = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20,
  marginBottom: 12,
  boxShadow: 'none'
} as const;

const filtersGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto auto',
  gap: 10,
  alignItems: 'center'
} as const;

const fieldStyle = {
  display: 'block'
} as const;

const searchFieldStyle = {
  display: 'block'
} as const;

const fieldLabelInlineStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b'
} as const;

const fieldLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: 4
} as const;

const searchWrapStyle = {
  position: 'relative'
} as const;

const searchIconStyle = {
  position: 'absolute',
  left: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#94a3b8',
  pointerEvents: 'none',
  fontSize: 13
} as const;

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '7px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: 12,
  color: '#0f172a',
  background: 'white',
  fontFamily: 'inherit',
  outline: 'none'
} as const;

const selectStyle = {
  ...inputStyle,
  width: 'auto',
  cursor: 'pointer'
} as const;

const primaryButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 14px',
  background: '#ea6a21',
  color: 'white',
  border: 'none',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap'
} as const;

const primaryButtonIconStyle = {
  fontSize: 16,
  lineHeight: 1
} as const;

const primaryButtonWideStyle = {
  flex: 1,
  padding: '8px 0',
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit'
} as const;

const secondaryButtonStyle = {
  padding: '8px 12px',
  background: 'white',
  color: '#64748b',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit'
} as const;

const destructiveButtonStyle = {
  flex: 1,
  padding: '8px 0',
  background: 'white',
  color: '#ef4444',
  border: '1px solid #fecaca',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit'
} as const;

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse'
} as const;

const tableHeadRowStyle = {
  borderBottom: '1px solid #e2e8f0'
} as const;

const thStyle = {
  padding: '10px 14px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  whiteSpace: 'nowrap'
} as const;

const trStyle = {
  borderBottom: '1px solid #f1f5f9',
  cursor: 'pointer',
  transition: 'background 0.1s'
} as const;

const tdStyle = {
  padding: '10px 14px',
  verticalAlign: 'top'
} as const;

const tdTextStyle = {
  ...tdStyle,
  fontSize: 12,
  color: '#475569'
} as const;

const tdStatusCellStyle = {
  ...tdStyle
} as const;

const tdAmountStyle = {
  ...tdStyle,
  textAlign: 'right',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'DM Mono', monospace",
  whiteSpace: 'nowrap'
} as const;

const rowButtonStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit'
} as const;

const rowPrimaryTextStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#0f172a'
} as const;

const rowSecondaryTextStyle = {
  fontSize: 10,
  color: '#94a3b8',
  fontFamily: "'DM Mono', monospace",
  marginTop: 2
} as const;

const emptyStateStyle = {
  padding: '32px 0',
  textAlign: 'center',
  color: '#94a3b8',
  fontSize: 13
} as const;

const statusBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid transparent',
  background: '#fff',
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap'
} as const;

const loadingCardStyle = {
  ...cardStyle,
  marginBottom: 20,
  color: '#64748b',
  fontSize: 13
} as const;

const errorStyle = {
  ...cardStyle,
  marginBottom: 12,
  color: '#b91c1c',
  borderColor: '#fecaca',
  background: '#fef2f2'
} as const;

const messageStyle = {
  ...cardStyle,
  marginBottom: 12,
  color: '#065f46',
  borderColor: '#bbf7d0',
  background: '#f0fdf4'
} as const;

const formStackStyle = {
  display: 'block'
} as const;

const formActionsStyle = {
  display: 'flex',
  gap: 8,
  marginTop: 16
} as const;

const detailHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: 14,
  gap: 12
} as const;

const detailTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 4
} as const;

const detailAmountStyle = {
  fontSize: 18,
  fontWeight: 600,
  fontFamily: "'DM Mono', monospace",
  color: '#0f172a'
} as const;

const dividerStyle = {
  height: 1,
  background: '#f1f5f9',
  margin: '12px 0'
} as const;

const detailListStyle = {
  display: 'block'
} as const;

const detailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: '6px 0',
  borderBottom: '1px solid #f1f5f9'
} as const;

const detailLabelStyle = {
  fontSize: 11,
  color: '#94a3b8',
  fontWeight: 600
} as const;

const detailValueStyle = {
  fontSize: 12,
  color: '#0f172a',
  fontWeight: 500,
  textAlign: 'right'
} as const;

const detailActionsStyle = {
  display: 'flex',
  gap: 8,
  marginTop: 16
} as const;

const emptyDetailStyle = {
  minHeight: 160,
  padding: '32px 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  color: '#64748b',
  fontSize: 13,
  lineHeight: 1.5
} as const;
