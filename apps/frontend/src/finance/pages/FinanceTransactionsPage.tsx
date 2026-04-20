import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import { api } from '../../services/api';
import {
  financeApi,
  type CreateFinanceAccountPayload,
  type CreateFinanceCategoryPayload,
  type CreateFinanceTransactionPayload,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceOverview,
  type FinanceTransaction,
  type FinanceTransactionKind,
  type FinanceTransactionStatus
} from '../api';

type CompanyOption = {
  id: string;
  name: string;
};

type TransactionFormState = {
  financial_account_id: string;
  financial_category_id: string;
  kind: FinanceTransactionKind;
  status: FinanceTransactionStatus;
  amount: string;
  due_date: string;
  competence_date: string;
  settlement_date: string;
  note: string;
};

const initialFormState: TransactionFormState = {
  financial_account_id: '',
  financial_category_id: '',
  kind: 'expense',
  status: 'open',
  amount: '',
  due_date: '',
  competence_date: '',
  settlement_date: '',
  note: ''
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) {
    return '-';
  }

  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) {
    return dateIso;
  }

  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function parseAmountToCents(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed * 100);
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

export function FinanceTransactionsPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [form, setForm] = useState<TransactionFormState>(initialFormState);
  const [accountForm, setAccountForm] = useState<{ name: string; kind: CreateFinanceAccountPayload['kind'] }>({
    name: '',
    kind: 'bank'
  });
  const [categoryForm, setCategoryForm] = useState<{ name: string; kind: CreateFinanceCategoryPayload['kind']; parent_category_id: string }>({
    name: '',
    kind: 'expense',
    parent_category_id: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [catalogSubmitting, setCatalogSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);

  useEffect(() => {
    let cancelled = false;

    api.companies()
      .then((rows) => {
        if (cancelled) return;
        const normalized = (rows as CompanyOption[]).map((row) => ({ id: row.id, name: row.name }));
        setCompanies(normalized);
        if (normalized.length > 0) {
          setSelectedCompanyId((current) => current || normalized[0]!.id);
        }
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError((loadError as Error).message || 'Falha ao carregar empresas.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function reload(companyId: string) {
    setLoading(true);
    setError('');

    try {
      const [overviewResponse, transactionsResponse, accountsResponse, categoriesResponse] = await Promise.all([
        financeApi.getOverview(companyId),
        financeApi.listTransactions(companyId),
        financeApi.listAccounts(companyId),
        financeApi.listCategories(companyId)
      ]);
      setOverview(overviewResponse);
      setTransactions(transactionsResponse.transactions);
      setAccounts(accountsResponse.accounts);
      setCategories(categoriesResponse.categories);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar movimentações.');
      setOverview(null);
      setTransactions([]);
      setAccounts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedCompanyId) {
      setLoading(false);
      return;
    }

    reload(selectedCompanyId).catch(() => undefined);
  }, [selectedCompanyId]);

  const selectedCompanyName = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId)?.name ?? overview?.company_name ?? 'Empresa',
    [companies, overview?.company_name, selectedCompanyId]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setError('Selecione uma empresa antes de lançar a movimentação.');
      return;
    }

    const amountCents = parseAmountToCents(form.amount);
    if (amountCents <= 0) {
      setError('Informe um valor monetário válido.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    const settlementDate = form.settlement_date || (form.status === 'settled' ? todayIso() : '');

    const payload: CreateFinanceTransactionPayload = {
      company_id: selectedCompanyId,
      financial_account_id: form.financial_account_id || null,
      financial_category_id: form.financial_category_id || null,
      kind: form.kind,
      status: settlementDate ? 'settled' : form.status,
      amount_cents: amountCents,
      issue_date: todayIso(),
      due_date: form.due_date || null,
      competence_date: form.competence_date || null,
      settlement_date: settlementDate || null,
      note: form.note.trim() || null
    };

    try {
      await financeApi.createTransaction(payload);
      setForm((current) => ({
        ...initialFormState,
        kind: current.kind,
        status: current.status
      }));
      setMessage('Lançamento criado com sucesso. Lista recarregada.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao criar lançamento.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setError('Selecione uma empresa antes de cadastrar conta.');
      return;
    }
    if (!accountForm.name.trim()) {
      setError('Informe o nome da conta.');
      return;
    }

    setCatalogSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createAccount({
        company_id: selectedCompanyId,
        name: accountForm.name.trim(),
        kind: accountForm.kind
      });
      setAccountForm({ name: '', kind: accountForm.kind });
      setMessage('Conta financeira cadastrada com sucesso.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao cadastrar conta financeira.');
    } finally {
      setCatalogSubmitting(false);
    }
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setError('Selecione uma empresa antes de cadastrar categoria.');
      return;
    }
    if (!categoryForm.name.trim()) {
      setError('Informe o nome da categoria.');
      return;
    }

    setCatalogSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createCategory({
        company_id: selectedCompanyId,
        name: categoryForm.name.trim(),
        kind: categoryForm.kind,
        parent_category_id: categoryForm.parent_category_id || null
      });
      setCategoryForm((current) => ({ ...current, name: '', parent_category_id: '' }));
      setMessage('Categoria financeira cadastrada com sucesso.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao cadastrar categoria financeira.');
    } finally {
      setCatalogSubmitting(false);
    }
  }

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Movimentações
          </small>
          <h1>Lançamentos manuais</h1>
          <p>Registre entradas e saídas com visão híbrida de caixa, competência, projetado e confirmado.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2>{selectedCompanyName}</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>Escolha a empresa e acompanhe os saldos do ledger híbrido.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Empresa</span>
                <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => selectedCompanyId && reload(selectedCompanyId)} disabled={!selectedCompanyId || loading}>
                Recarregar
              </button>
            </div>
          </div>
          <div className="panel-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
            <div className="panel" style={{ padding: '12px' }}>
              <small style={{ color: 'var(--ink-soft)' }}>Caixa</small>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: '4px' }}>{formatCurrency(overview?.totals.cash_cents ?? 0)}</strong>
            </div>
            <div className="panel" style={{ padding: '12px' }}>
              <small style={{ color: 'var(--ink-soft)' }}>Competência</small>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: '4px' }}>{formatCurrency(overview?.totals.competence_cents ?? 0)}</strong>
            </div>
            <div className="panel" style={{ padding: '12px' }}>
              <small style={{ color: 'var(--ink-soft)' }}>Projetado</small>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: '4px' }}>{formatCurrency(overview?.totals.projected_cents ?? 0)}</strong>
            </div>
            <div className="panel" style={{ padding: '12px' }}>
              <small style={{ color: 'var(--ink-soft)' }}>Confirmado</small>
              <strong style={{ display: 'block', fontSize: '1.15rem', marginTop: '4px' }}>{formatCurrency(overview?.totals.confirmed_cents ?? 0)}</strong>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Catálogo financeiro base</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>
              Cadastre contas e categorias para padronizar os lançamentos manuais por empresa.
            </p>
          </div>
          <div className="panel-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            <form className="form" onSubmit={handleCreateAccount} style={{ display: 'grid', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Nova conta</h3>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Nome da conta</span>
                <input
                  value={accountForm.name}
                  onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Itaú operacional"
                  disabled={!canWrite || catalogSubmitting}
                />
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Tipo</span>
                <select
                  value={accountForm.kind}
                  onChange={(event) => setAccountForm((current) => ({ ...current, kind: event.target.value as CreateFinanceAccountPayload['kind'] }))}
                  disabled={!canWrite || catalogSubmitting}
                >
                  <option value="bank">Banco</option>
                  <option value="cash">Caixa</option>
                  <option value="wallet">Carteira</option>
                  <option value="other">Outro</option>
                </select>
              </label>
              <button type="submit" disabled={!canWrite || catalogSubmitting || !selectedCompanyId}>
                {catalogSubmitting ? 'Salvando...' : 'Criar conta'}
              </button>
            </form>

            <form className="form" onSubmit={handleCreateCategory} style={{ display: 'grid', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Nova categoria</h3>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Nome da categoria</span>
                <input
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: Serviços técnicos"
                  disabled={!canWrite || catalogSubmitting}
                />
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Tipo</span>
                <select
                  value={categoryForm.kind}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, kind: event.target.value as CreateFinanceCategoryPayload['kind'] }))}
                  disabled={!canWrite || catalogSubmitting}
                >
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                  <option value="neutral">Neutro</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Categoria pai (opcional)</span>
                <select
                  value={categoryForm.parent_category_id}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, parent_category_id: event.target.value }))}
                  disabled={!canWrite || catalogSubmitting}
                >
                  <option value="">Sem categoria pai</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={!canWrite || catalogSubmitting || !selectedCompanyId}>
                {catalogSubmitting ? 'Salvando...' : 'Criar categoria'}
              </button>
            </form>
          </div>
          <div className="panel-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', borderTop: '1px solid var(--line)' }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Contas cadastradas ({accounts.length})</h3>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-soft)' }}>
                {accounts.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <strong style={{ color: 'var(--ink)' }}>{item.name}</strong> • {item.kind.toUpperCase()}
                  </li>
                ))}
                {accounts.length === 0 ? <li>Nenhuma conta cadastrada.</li> : null}
              </ul>
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Categorias cadastradas ({categories.length})</h3>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--ink-soft)' }}>
                {categories.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <strong style={{ color: 'var(--ink)' }}>{item.name}</strong> • {item.kind.toUpperCase()}
                  </li>
                ))}
                {categories.length === 0 ? <li>Nenhuma categoria cadastrada.</li> : null}
              </ul>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Novo lançamento manual</h2>
          </div>
          <div className="panel-content">
            <form className="form form-spacious" onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Conta (opcional)</span>
                  <select
                    value={form.financial_account_id}
                    onChange={(event) => setForm((current) => ({ ...current, financial_account_id: event.target.value }))}
                    disabled={!canWrite || submitting}
                  >
                    <option value="">Sem conta vinculada</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Categoria (opcional)</span>
                  <select
                    value={form.financial_category_id}
                    onChange={(event) => setForm((current) => ({ ...current, financial_category_id: event.target.value }))}
                    disabled={!canWrite || submitting}
                  >
                    <option value="">Sem categoria vinculada</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Tipo</span>
                  <select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as FinanceTransactionKind }))} disabled={!canWrite || submitting}>
                    <option value="expense">Saída</option>
                    <option value="income">Entrada</option>
                    <option value="adjustment">Ajuste</option>
                    <option value="transfer">Transferência</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FinanceTransactionStatus }))} disabled={!canWrite || submitting}>
                    <option value="planned">Planejado</option>
                    <option value="open">Em aberto</option>
                    <option value="partial">Parcial</option>
                    <option value="settled">Liquidado</option>
                    <option value="overdue">Atrasado</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Valor (R$)</span>
                  <input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" disabled={!canWrite || submitting} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Vencimento</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Competência</span>
                  <input type="date" value={form.competence_date} onChange={(event) => setForm((current) => ({ ...current, competence_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '6px' }}>
                  <span>Liquidação</span>
                  <input type="date" value={form.settlement_date} onChange={(event) => setForm((current) => ({ ...current, settlement_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span>Descrição operacional</span>
                <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={3} placeholder="Ex.: mensalidade, taxa bancária, recebimento recorrente..." disabled={!canWrite || submitting} />
              </label>
              {!canWrite ? (
                <p className="form-hint" style={{ margin: 0 }}>Sua sessão tem acesso de leitura. Peça a permissão `finance.write` para lançar manualmente.</p>
              ) : null}
              <div className="actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="submit" disabled={!canWrite || submitting || !selectedCompanyId}>
                  {submitting ? 'Salvando...' : 'Criar lançamento'}
                </button>
                <button type="button" onClick={() => setForm(initialFormState)} disabled={submitting}>
                  Limpar
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2>Ledger operacional</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>
                {overview ? `${overview.transaction_count} lançamentos • ${overview.open_count} abertos • ${overview.settled_count} liquidados` : 'Sem visão consolidada ainda.'}
              </p>
            </div>
          </div>
          <div className="panel-content" style={{ overflowX: 'auto' }}>
            {error ? <p style={{ marginTop: 0, color: '#9f3a38' }}>{error}</p> : null}
            {message ? <p style={{ marginTop: 0, color: '#1c8b61' }}>{message}</p> : null}
            {loading ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Carregando movimentações...</p>
            ) : transactions.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Nenhum lançamento ativo para a empresa selecionada.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Vencimento</th>
                    <th>Competência</th>
                    <th>Liquidação</th>
                    <th>Valor</th>
                    <th>Visão híbrida</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <strong>{transaction.note?.trim() || 'Lançamento manual'}</strong>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: '4px' }}>
                          Criado por {transaction.created_by ?? 'sistema'} em {formatDate(transaction.issue_date ?? transaction.created_at.slice(0, 10))}
                        </div>
                        {transaction.financial_account_name || transaction.financial_category_name ? (
                          <div style={{ color: 'var(--ink-soft)', fontSize: '0.8rem', marginTop: '4px' }}>
                            {transaction.financial_account_name ? `Conta: ${transaction.financial_account_name}` : 'Conta: —'}
                            {' • '}
                            {transaction.financial_category_name ? `Categoria: ${transaction.financial_category_name}` : 'Categoria: —'}
                          </div>
                        ) : null}
                      </td>
                      <td>{kindLabel(transaction.kind)}</td>
                      <td>{statusLabel(transaction.status)}</td>
                      <td>{formatDate(transaction.due_date)}</td>
                      <td>{formatDate(transaction.competence_date)}</td>
                      <td>{formatDate(transaction.settlement_date)}</td>
                      <td>{formatCurrency(transaction.amount_cents)}</td>
                      <td>
                        <div style={{ display: 'grid', gap: '4px', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>
                          <span>Caixa: {formatCurrency(transaction.views.cash_amount_cents)}</span>
                          <span>Competência: {formatCurrency(transaction.views.competence_amount_cents)}</span>
                          <span>Projetado: {formatCurrency(transaction.views.projected_amount_cents)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
