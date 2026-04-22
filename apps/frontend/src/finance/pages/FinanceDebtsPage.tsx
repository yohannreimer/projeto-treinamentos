import { useEffect, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type FinanceDebt,
  type FinanceDebtStatus
} from '../api';

type DebtForm = {
  debt_type: string;
  status: FinanceDebtStatus;
  principal: string;
  outstanding: string;
  due_date: string;
  settled_at: string;
  note: string;
};

const initialForm: DebtForm = {
  debt_type: 'operacional',
  status: 'open',
  principal: '',
  outstanding: '',
  due_date: '',
  settled_at: '',
  note: ''
};

function parseAmountToCents(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
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

function statusLabel(status: FinanceDebtStatus): string {
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'settled') return 'Liquidada';
  return 'Cancelada';
}

export function FinanceDebtsPage() {
  const [debts, setDebts] = useState<FinanceDebt[]>([]);
  const [form, setForm] = useState<DebtForm>(initialForm);
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
      const response = await financeApi.listDebts();
      setDebts(response.debts);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar dívidas.');
      setDebts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const principal = parseAmountToCents(form.principal);
    const outstanding = parseAmountToCents(form.outstanding || form.principal);
    if (principal <= 0) {
      setError('Informe um principal válido.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createDebt({
        debt_type: form.debt_type.trim() || 'operacional',
        status: form.status,
        principal_amount_cents: principal,
        outstanding_amount_cents: outstanding,
        due_date: form.due_date || null,
        settled_at: form.settled_at || null,
        note: form.note.trim() || null
      });
      setForm(initialForm);
      setMessage('Dívida registrada com sucesso.');
      await reload();
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao registrar dívida.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Dívidas e parcelamentos
          </small>
          <h1>Passivos controlados</h1>
          <p>Registro de obrigações financeiras para rastrear principal, saldo pendente e liquidação.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2>Passivos da empresa logada</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>Controle de obrigações financeiras da empresa logada, com leitura direta do passivo em aberto.</p>
            </div>
          </div>
          <div className="panel-content">
            <form className="form form-spacious" onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Tipo da dívida</span>
                  <input value={form.debt_type} onChange={(event) => setForm((current) => ({ ...current, debt_type: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Status</span>
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FinanceDebtStatus }))} disabled={!canWrite || submitting}>
                    <option value="open">Em aberto</option>
                    <option value="partial">Parcial</option>
                    <option value="settled">Liquidada</option>
                    <option value="canceled">Cancelada</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Principal (R$)</span>
                  <input value={form.principal} onChange={(event) => setForm((current) => ({ ...current, principal: event.target.value }))} placeholder="0,00" disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Saldo pendente (R$)</span>
                  <input value={form.outstanding} onChange={(event) => setForm((current) => ({ ...current, outstanding: event.target.value }))} placeholder="0,00" disabled={!canWrite || submitting} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Vencimento</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span>Liquidada em</span>
                  <input type="date" value={form.settled_at} onChange={(event) => setForm((current) => ({ ...current, settled_at: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
              </div>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Observação</span>
                <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={2} disabled={!canWrite || submitting} />
              </label>
              <div className="actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="submit" disabled={!canWrite || submitting}>
                  {submitting ? 'Salvando...' : 'Registrar dívida'}
                </button>
                <button type="button" onClick={() => setForm(initialForm)} disabled={submitting}>Limpar</button>
              </div>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Passivos registrados</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>{debts.length} dívida(s) no controle.</p>
          </div>
          <div className="panel-content" style={{ overflowX: 'auto' }}>
            {error ? <p style={{ marginTop: 0, color: '#9f3a38' }}>{error}</p> : null}
            {message ? <p style={{ marginTop: 0, color: '#1c8b61' }}>{message}</p> : null}
            {loading ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Carregando dívidas...</p>
            ) : debts.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Nenhuma dívida cadastrada.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Principal</th>
                    <th>Saldo</th>
                    <th>Vencimento</th>
                    <th>Liquidada em</th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.debt_type}</strong>
                        {item.note ? <div style={{ color: 'var(--ink-soft)', fontSize: '0.82rem' }}>{item.note}</div> : null}
                      </td>
                      <td>{statusLabel(item.status)}</td>
                      <td>{formatCurrency(item.principal_amount_cents)}</td>
                      <td>{formatCurrency(item.outstanding_amount_cents)}</td>
                      <td>{formatDate(item.due_date)}</td>
                      <td>{formatDate(item.settled_at)}</td>
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
