import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import { api } from '../../services/api';
import {
  financeApi,
  type FinanceAccount,
  type FinanceCategory,
  type FinancePayable,
  type FinancePayableStatus
} from '../api';

type CompanyOption = {
  id: string;
  name: string;
};

type PayableForm = {
  description: string;
  supplier_name: string;
  amount: string;
  status: FinancePayableStatus;
  due_date: string;
  issue_date: string;
  paid_at: string;
  financial_account_id: string;
  financial_category_id: string;
  note: string;
};

const initialForm: PayableForm = {
  description: '',
  supplier_name: '',
  amount: '',
  status: 'open',
  due_date: '',
  issue_date: '',
  paid_at: '',
  financial_account_id: '',
  financial_category_id: '',
  note: ''
};

function parseAmountToCents(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function statusLabel(status: FinancePayableStatus): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'paid') return 'Pago';
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

export function FinancePayablesPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [payables, setPayables] = useState<FinancePayable[]>([]);
  const [form, setForm] = useState<PayableForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);

  useEffect(() => {
    let cancelled = false;
    api.companies()
      .then((rows) => {
        if (cancelled) return;
        const normalized = (rows as CompanyOption[]).map((item) => ({ id: item.id, name: item.name }));
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
      const [accountsRes, categoriesRes, payablesRes] = await Promise.all([
        financeApi.listAccounts(companyId),
        financeApi.listCategories(companyId),
        financeApi.listPayables(companyId)
      ]);
      setAccounts(accountsRes.accounts);
      setCategories(categoriesRes.categories);
      setPayables(payablesRes.payables);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar contas a pagar.');
      setAccounts([]);
      setCategories([]);
      setPayables([]);
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
    () => companies.find((company) => company.id === selectedCompanyId)?.name ?? 'Empresa',
    [companies, selectedCompanyId]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) {
      setError('Selecione uma empresa antes de cadastrar conta a pagar.');
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
    try {
      await financeApi.createPayable({
        company_id: selectedCompanyId,
        financial_account_id: form.financial_account_id || null,
        financial_category_id: form.financial_category_id || null,
        supplier_name: form.supplier_name.trim() || null,
        description: form.description.trim(),
        amount_cents: amountCents,
        status: form.paid_at ? 'paid' : form.status,
        issue_date: form.issue_date || todayIso(),
        due_date: form.due_date || null,
        paid_at: form.paid_at || null,
        note: form.note.trim() || null
      });
      setForm(initialForm);
      setMessage('Conta a pagar cadastrada com sucesso.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao cadastrar conta a pagar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Contas a pagar
          </small>
          <h1>Saídas programadas</h1>
          <p>Gestão operacional de obrigações com vencimento, baixa e rastreio por conta/categoria.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2>{selectedCompanyName}</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>Cadastre e acompanhe compromissos financeiros.</p>
            </div>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Empresa</span>
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="panel-content">
            <form className="form form-spacious" onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Descrição</span>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Ex.: mensalidade plataforma"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Fornecedor</span>
                  <input
                    value={form.supplier_name}
                    onChange={(event) => setForm((current) => ({ ...current, supplier_name: event.target.value }))}
                    placeholder="Nome do fornecedor"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Valor (R$)</span>
                  <input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0,00" disabled={!canWrite || submitting} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FinancePayableStatus }))} disabled={!canWrite || submitting}>
                    <option value="planned">Planejado</option>
                    <option value="open">Em aberto</option>
                    <option value="partial">Parcial</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Atrasado</option>
                    <option value="canceled">Cancelado</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Vencimento</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Pago em</span>
                  <input type="date" value={form.paid_at} onChange={(event) => setForm((current) => ({ ...current, paid_at: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Conta</span>
                  <select value={form.financial_account_id} onChange={(event) => setForm((current) => ({ ...current, financial_account_id: event.target.value }))} disabled={!canWrite || submitting}>
                    <option value="">Sem conta vinculada</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Categoria</span>
                  <select value={form.financial_category_id} onChange={(event) => setForm((current) => ({ ...current, financial_category_id: event.target.value }))} disabled={!canWrite || submitting}>
                    <option value="">Sem categoria vinculada</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Emissão</span>
                  <input type="date" value={form.issue_date} onChange={(event) => setForm((current) => ({ ...current, issue_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Observação</span>
                <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={2} disabled={!canWrite || submitting} />
              </label>
              <div className="actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="submit" disabled={!canWrite || submitting || !selectedCompanyId}>
                  {submitting ? 'Salvando...' : 'Registrar conta a pagar'}
                </button>
                <button type="button" onClick={() => setForm(initialForm)} disabled={submitting}>Limpar</button>
              </div>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Lista operacional</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>{payables.length} conta(s) a pagar registradas.</p>
          </div>
          <div className="panel-content" style={{ overflowX: 'auto' }}>
            {error ? <p style={{ marginTop: 0, color: '#9f3a38' }}>{error}</p> : null}
            {message ? <p style={{ marginTop: 0, color: '#1c8b61' }}>{message}</p> : null}
            {loading ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Carregando contas a pagar...</p>
            ) : payables.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Nenhuma conta a pagar cadastrada.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Status</th>
                    <th>Vencimento</th>
                    <th>Pago em</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {payables.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.description}</strong>
                        <div style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: '4px' }}>
                          {item.supplier_name || 'Fornecedor não informado'}
                          {(item.financial_account_name || item.financial_category_name)
                            ? ` • ${item.financial_account_name ?? 'Sem conta'} • ${item.financial_category_name ?? 'Sem categoria'}`
                            : ''}
                        </div>
                      </td>
                      <td>{statusLabel(item.status)}</td>
                      <td>{formatDate(item.due_date)}</td>
                      <td>{formatDate(item.paid_at)}</td>
                      <td>{formatCurrency(item.amount_cents)}</td>
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
