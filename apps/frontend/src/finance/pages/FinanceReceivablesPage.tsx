import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceReceivable,
  type FinanceReceivableStatus,
  type FinanceReceivablesGroups,
  type FinanceReceivablesList,
  type FinanceReceivablesSummary
} from '../api';

type ReceivableForm = {
  description: string;
  customer_name: string;
  amount: string;
  status: FinanceReceivableStatus;
  due_date: string;
  issue_date: string;
  received_at: string;
  financial_account_id: string;
  financial_category_id: string;
  note: string;
};

const initialForm: ReceivableForm = {
  description: '',
  customer_name: '',
  amount: '',
  status: 'open',
  due_date: '',
  issue_date: '',
  received_at: '',
  financial_account_id: '',
  financial_category_id: '',
  note: ''
};

const emptySummary: FinanceReceivablesSummary = {
  open_cents: 0,
  overdue_cents: 0,
  due_today_cents: 0
};

const emptyGroups: FinanceReceivablesGroups = {
  overdue: [],
  due_today: [],
  upcoming: [],
  settled: []
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

function statusLabel(status: FinanceReceivableStatus): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'received') return 'Recebido';
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

function SummaryCard(props: {
  label: string;
  amount: number;
  detail: string;
  tone: 'default' | 'warning' | 'critical';
}) {
  const toneStyles = {
    default: {
      border: '1px solid rgba(18, 31, 53, 0.12)',
      background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,252,0.96))'
    },
    warning: {
      border: '1px solid rgba(180, 110, 0, 0.18)',
      background: 'linear-gradient(180deg, rgba(255,248,233,0.98), rgba(255,243,214,0.94))'
    },
    critical: {
      border: '1px solid rgba(159, 58, 56, 0.18)',
      background: 'linear-gradient(180deg, rgba(255,241,240,0.98), rgba(252,228,226,0.94))'
    }
  } as const;

  return (
    <article style={{ borderRadius: '18px', padding: '18px', display: 'grid', gap: '8px', ...toneStyles[props.tone] }}>
      <span style={{ fontSize: '0.78rem', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 700 }}>
        {props.label}
      </span>
      <strong style={{ fontSize: '1.5rem', lineHeight: 1.1 }}>{formatCurrency(props.amount)}</strong>
      <span style={{ color: 'var(--ink-soft)', fontSize: '0.9rem' }}>{props.detail}</span>
    </article>
  );
}

function GroupedReceivablesList(props: {
  title: string;
  caption: string;
  rows: FinanceReceivable[];
  emptyMessage: string;
}) {
  return (
    <section className="panel" style={{ borderRadius: '20px' }}>
      <div className="panel-header">
        <h2>{props.title}</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>{props.caption}</p>
      </div>
      <div className="panel-content" style={{ display: 'grid', gap: '10px' }}>
        {props.rows.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{props.emptyMessage}</p>
        ) : (
          props.rows.map((item) => (
            <article
              key={item.id}
              style={{
                display: 'grid',
                gap: '8px',
                padding: '14px 16px',
                borderRadius: '16px',
                border: '1px solid rgba(18, 31, 53, 0.1)',
                background: 'rgba(255, 255, 255, 0.82)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: '4px' }}>
                  <strong>{item.description}</strong>
                  <span style={{ color: 'var(--ink-soft)', fontSize: '0.88rem' }}>
                    {item.customer_name || 'Cliente não informado'}
                    {(item.financial_account_name || item.financial_category_name)
                      ? ` • ${item.financial_account_name ?? 'Sem conta'} • ${item.financial_category_name ?? 'Sem categoria'}`
                      : ''}
                  </span>
                </div>
                <strong style={{ fontSize: '1rem' }}>{formatCurrency(item.amount_cents)}</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', color: 'var(--ink-soft)', fontSize: '0.84rem' }}>
                <span>Vencimento: {formatDate(item.due_date)}</span>
                <span>Recebido em: {formatDate(item.received_at)}</span>
                <span>Status: {statusLabel(item.status)}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CountBadge(props: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        borderRadius: '999px',
        padding: '7px 12px',
        background: 'rgba(18, 31, 53, 0.06)',
        color: 'var(--ink-soft)',
        fontSize: '0.84rem',
        fontWeight: 600
      }}
    >
      {props.children}
    </span>
  );
}

export function FinanceReceivablesPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [receivablesData, setReceivablesData] = useState<FinanceReceivablesList | null>(null);
  const [form, setForm] = useState<ReceivableForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const [accountsRes, categoriesRes, nextReceivables] = await Promise.all([
        financeApi.listAccounts(),
        financeApi.listCategories(),
        financeApi.listReceivables()
      ]);
      setAccounts(accountsRes.accounts);
      setCategories(categoriesRes.categories);
      setReceivablesData(nextReceivables);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar contas a receber.');
      setAccounts([]);
      setCategories([]);
      setReceivablesData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  const summary = receivablesData?.summary ?? emptySummary;
  const groups = receivablesData?.groups ?? emptyGroups;
  const operationalCount = groups.overdue.length + groups.due_today.length + groups.upcoming.length;
  const settledCount = groups.settled.length;
  const registeredCount = receivablesData?.receivables.length ?? 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseAmountToCents(form.amount);
    if (amountCents <= 0) {
      setError('Informe um valor monetário válido.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createReceivable({
        financial_account_id: form.financial_account_id || null,
        financial_category_id: form.financial_category_id || null,
        customer_name: form.customer_name.trim() || null,
        description: form.description.trim(),
        amount_cents: amountCents,
        status: form.received_at ? 'received' : form.status,
        issue_date: form.issue_date || todayIso(),
        due_date: form.due_date || null,
        received_at: form.received_at || null,
        note: form.note.trim() || null
      });
      setForm(initialForm);
      setMessage('Conta a receber cadastrada com sucesso.');
      await reload();
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao cadastrar conta a receber.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Contas a receber
          </small>
          <h1>Rotina operacional de recebíveis</h1>
          <p>Organize o dia entre atrasos, vencimentos do dia, próximos recebimentos e baixas já realizadas.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '6px' }}>
              <h2>Operação da empresa logada</h2>
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                Cadastre novos títulos, acompanhe o que exige ação hoje e mantenha a carteira de recebíveis previsível.
              </p>
            </div>
          </div>
          <div className="panel-content">
            <form className="form form-spacious" onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Descrição</span>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Ex.: parcela contrato mensal"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Cliente</span>
                  <input
                    value={form.customer_name}
                    onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))}
                    placeholder="Nome do cliente"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Valor (R$)</span>
                  <input
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0,00"
                    disabled={!canWrite || submitting}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FinanceReceivableStatus }))} disabled={!canWrite || submitting}>
                    <option value="planned">Planejado</option>
                    <option value="open">Em aberto</option>
                    <option value="partial">Parcial</option>
                    <option value="received">Recebido</option>
                    <option value="overdue">Atrasado</option>
                    <option value="canceled">Cancelado</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Vencimento</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Recebido em</span>
                  <input type="date" value={form.received_at} onChange={(event) => setForm((current) => ({ ...current, received_at: event.target.value }))} disabled={!canWrite || submitting} />
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
                <button type="submit" disabled={!canWrite || submitting}>
                  {submitting ? 'Salvando...' : 'Registrar conta a receber'}
                </button>
                <button type="button" onClick={() => setForm(initialForm)} disabled={submitting}>Limpar</button>
              </div>
            </form>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          <div className="panel">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2>Pulso operacional</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>
                  {registeredCount} título(s) na base, {operationalCount} exigindo acompanhamento e {settledCount} já liquidado(s).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <CountBadge>{groups.overdue.length} atrasado(s)</CountBadge>
                <CountBadge>{groups.due_today.length} vencendo hoje</CountBadge>
                <CountBadge>{groups.upcoming.length} próximo(s)</CountBadge>
                <CountBadge>{groups.settled.length} recebido(s)</CountBadge>
              </div>
            </div>
            <div className="panel-content" style={{ display: 'grid', gap: '14px' }}>
              {error ? <p style={{ marginTop: 0, color: '#9f3a38' }}>{error}</p> : null}
              {message ? <p style={{ marginTop: 0, color: '#1c8b61' }}>{message}</p> : null}
              {loading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Carregando contas a receber...</p>
              ) : (
                <>
                  <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <SummaryCard
                      label="Carteira em aberto"
                      amount={summary.open_cents}
                      detail="Total ainda em rotina operacional."
                      tone="default"
                    />
                    <SummaryCard
                      label="Atrasado"
                      amount={summary.overdue_cents}
                      detail="Valores já fora da data-alvo."
                      tone="critical"
                    />
                    <SummaryCard
                      label="Vence hoje"
                      amount={summary.due_today_cents}
                      detail="Entradas que precisam de contato imediato."
                      tone="warning"
                    />
                  </section>

                  <div style={{ display: 'grid', gap: '12px' }}>
                    <GroupedReceivablesList
                      title="Atrasados"
                      caption="Prioridade máxima para cobrança e renegociação."
                      rows={groups.overdue}
                      emptyMessage="Nenhum recebível atrasado neste recorte."
                    />
                    <GroupedReceivablesList
                      title="Vencendo hoje"
                      caption="Entradas que precisam de acompanhamento ainda hoje."
                      rows={groups.due_today}
                      emptyMessage="Nada vencendo hoje."
                    />
                    <GroupedReceivablesList
                      title="Próximos vencimentos"
                      caption="Pipeline de caixa para os próximos dias."
                      rows={groups.upcoming}
                      emptyMessage="Sem próximos recebimentos no momento."
                    />
                    <GroupedReceivablesList
                      title="Liquidados"
                      caption="Histórico recente de baixas concluídas."
                      rows={groups.settled}
                      emptyMessage="Nenhum título liquidado neste recorte."
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
