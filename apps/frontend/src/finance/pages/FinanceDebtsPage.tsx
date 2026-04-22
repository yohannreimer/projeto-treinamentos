import { useEffect, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import { financeApi, type FinanceDebt, type FinanceDebtStatus } from '../api';
import {
  FinanceEmptyState,
  FinanceErrorState,
  FinanceLoadingState,
  FinanceMono,
  FinancePageHeader,
  FinancePanel,
  FinanceTableShell
} from '../components/FinancePrimitives';
import { formatCurrency, formatDate, parseAmountToCents } from '../utils/financeFormatters';

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
      <FinancePageHeader
        eyebrow="Dívidas e parcelamentos"
        title="Passivos controlados"
        description="Registro de obrigações financeiras para rastrear principal, saldo pendente e liquidação."
      />

      <div className="finance-page-stack">
        <FinancePanel title="Passivos da empresa logada" description="Controle de obrigações financeiras da empresa logada, com leitura direta do passivo em aberto." eyebrow="Base passiva">
          <form className="form form-spacious finance-form-shell" onSubmit={handleSubmit}>
            <div className="finance-form-grid finance-form-grid--compact">
              <label>
                <span>Tipo da dívida</span>
                <input value={form.debt_type} onChange={(event) => setForm((current) => ({ ...current, debt_type: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <label>
                <span>Status</span>
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FinanceDebtStatus }))} disabled={!canWrite || submitting}>
                  <option value="open">Em aberto</option>
                  <option value="partial">Parcial</option>
                  <option value="settled">Liquidada</option>
                  <option value="canceled">Cancelada</option>
                </select>
              </label>
              <label>
                <span>Principal (R$)</span>
                <input value={form.principal} onChange={(event) => setForm((current) => ({ ...current, principal: event.target.value }))} placeholder="0,00" disabled={!canWrite || submitting} />
              </label>
              <label>
                <span>Saldo pendente (R$)</span>
                <input value={form.outstanding} onChange={(event) => setForm((current) => ({ ...current, outstanding: event.target.value }))} placeholder="0,00" disabled={!canWrite || submitting} />
              </label>
            </div>
            <div className="finance-form-grid finance-form-grid--compact">
              <label>
                <span>Vencimento</span>
                <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <label>
                <span>Liquidada em</span>
                <input type="date" value={form.settled_at} onChange={(event) => setForm((current) => ({ ...current, settled_at: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
            </div>
            <label>
              <span>Observação</span>
              <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={2} disabled={!canWrite || submitting} />
            </label>
            <div className="actions">
              <button type="submit" disabled={!canWrite || submitting}>
                {submitting ? 'Salvando...' : 'Registrar dívida'}
              </button>
              <button type="button" onClick={() => setForm(initialForm)} disabled={submitting}>Limpar</button>
            </div>
          </form>
        </FinancePanel>

        <FinanceTableShell title="Passivos registrados" description={`${debts.length} dívida(s) no controle.`}>
          {error ? <FinanceErrorState title="Falha ao carregar dívidas." description={error} /> : null}
          {message ? <p className="finance-inline-message finance-inline-message--success">{message}</p> : null}
          {loading ? (
            <FinanceLoadingState title="Carregando dívidas..." />
          ) : debts.length === 0 ? (
            <FinanceEmptyState title="Nenhuma dívida cadastrada." />
          ) : (
            <table aria-label="Dívidas registradas">
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
                      {item.note ? <div className="finance-note-muted">{item.note}</div> : null}
                    </td>
                    <td>{statusLabel(item.status)}</td>
                    <td><FinanceMono>{formatCurrency(item.principal_amount_cents)}</FinanceMono></td>
                    <td><FinanceMono>{formatCurrency(item.outstanding_amount_cents)}</FinanceMono></td>
                    <td><FinanceMono>{formatDate(item.due_date)}</FinanceMono></td>
                    <td><FinanceMono>{formatDate(item.settled_at)}</FinanceMono></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FinanceTableShell>
      </div>
    </section>
  );
}
