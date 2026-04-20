import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import { api } from '../../services/api';
import {
  financeApi,
  type FinanceAccount,
  type FinanceImportJob,
  type FinanceReconciliationMatch,
  type FinanceStatementEntry,
  type FinanceTransaction
} from '../api';

type CompanyOption = {
  id: string;
  name: string;
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '-';
  const [year, month, day] = dateIso.split('-').map(Number);
  if (!year || !month || !day) return dateIso;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function FinanceReconciliationPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [jobs, setJobs] = useState<FinanceImportJob[]>([]);
  const [entries, setEntries] = useState<FinanceStatementEntry[]>([]);
  const [matches, setMatches] = useState<FinanceReconciliationMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [importForm, setImportForm] = useState({
    import_type: 'ofx',
    source_file_name: 'extrato-manual.ofx'
  });
  const [entryForm, setEntryForm] = useState({
    financial_account_id: '',
    financial_import_job_id: '',
    statement_date: todayIso(),
    amount: '',
    description: ''
  });
  const [matchForm, setMatchForm] = useState({
    financial_bank_statement_entry_id: '',
    financial_transaction_id: '',
    match_status: 'matched' as 'matched' | 'unmatched' | 'ignored',
    confidence_score: '1.0'
  });

  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write', 'finance.reconcile']);

  useEffect(() => {
    let cancelled = false;
    api.companies()
      .then((rows) => {
        if (cancelled) return;
        const normalized = (rows as CompanyOption[]).map((item) => ({ id: item.id, name: item.name }));
        setCompanies(normalized);
        if (normalized.length > 0) setSelectedCompanyId((current) => current || normalized[0]!.id);
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
      const [accountsRes, transactionsRes, jobsRes, entriesRes, matchesRes] = await Promise.all([
        financeApi.listAccounts(companyId),
        financeApi.listTransactions(companyId),
        financeApi.listImportJobs(companyId),
        financeApi.listStatementEntries(companyId),
        financeApi.listReconciliations(companyId)
      ]);
      setAccounts(accountsRes.accounts);
      setTransactions(transactionsRes.transactions);
      setJobs(jobsRes.jobs);
      setEntries(entriesRes.entries);
      setMatches(matchesRes.matches);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar dados de conciliação.');
      setAccounts([]);
      setTransactions([]);
      setJobs([]);
      setEntries([]);
      setMatches([]);
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

  async function handleCreateImportJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createImportJob({
        company_id: selectedCompanyId,
        import_type: importForm.import_type,
        source_file_name: importForm.source_file_name,
        status: 'completed',
        total_rows: 0,
        processed_rows: 0
      });
      setMessage('Job de importação registrado.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao criar job de importação.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateStatementEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) return;
    const amount = Number(entryForm.amount.trim().replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0) {
      setError('Informe um valor válido para o extrato.');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createStatementEntry({
        company_id: selectedCompanyId,
        financial_account_id: entryForm.financial_account_id,
        financial_import_job_id: entryForm.financial_import_job_id || null,
        statement_date: entryForm.statement_date,
        amount_cents: Math.round(amount * 100),
        description: entryForm.description.trim() || 'Lançamento manual de extrato',
        source: 'manual'
      });
      setEntryForm((current) => ({ ...current, amount: '', description: '' }));
      setMessage('Lançamento de extrato registrado.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao registrar extrato.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId) return;
    if (!matchForm.financial_bank_statement_entry_id || !matchForm.financial_transaction_id) {
      setError('Selecione o extrato e o lançamento financeiro para conciliar.');
      return;
    }
    const confidence = Number(matchForm.confidence_score);
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await financeApi.createReconciliation({
        company_id: selectedCompanyId,
        financial_bank_statement_entry_id: matchForm.financial_bank_statement_entry_id,
        financial_transaction_id: matchForm.financial_transaction_id,
        match_status: matchForm.match_status,
        confidence_score: Number.isFinite(confidence) ? confidence : null,
        source: 'manual'
      });
      setMessage('Conciliação registrada.');
      await reload(selectedCompanyId);
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao registrar conciliação.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Conciliação
          </small>
          <h1>Importação e matching inicial</h1>
          <p>Fluxo operacional para job de importação, extrato e conciliação manual de lançamentos.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: '16px' }}>
        <div className="panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2>{selectedCompanyName}</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>
                Base inicial para conciliação financeira com rastreabilidade.
              </p>
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
        </div>

        <div className="panel">
          <div className="panel-header"><h2>1) Job de importação</h2></div>
          <div className="panel-content">
            <form className="form" onSubmit={handleCreateImportJob} style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Tipo</span>
                <input value={importForm.import_type} onChange={(event) => setImportForm((current) => ({ ...current, import_type: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Arquivo</span>
                <input value={importForm.source_file_name} onChange={(event) => setImportForm((current) => ({ ...current, source_file_name: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button type="submit" disabled={!canWrite || submitting || !selectedCompanyId}>Criar job</button>
              </div>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><h2>2) Lançamento no extrato</h2></div>
          <div className="panel-content">
            <form className="form" onSubmit={handleCreateStatementEntry} style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Conta</span>
                <select value={entryForm.financial_account_id} onChange={(event) => setEntryForm((current) => ({ ...current, financial_account_id: event.target.value }))} disabled={!canWrite || submitting}>
                  <option value="">Selecione</option>
                  {accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Job (opcional)</span>
                <select value={entryForm.financial_import_job_id} onChange={(event) => setEntryForm((current) => ({ ...current, financial_import_job_id: event.target.value }))} disabled={!canWrite || submitting}>
                  <option value="">Sem vínculo</option>
                  {jobs.map((item) => <option key={item.id} value={item.id}>{item.source_file_name}</option>)}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Data</span>
                <input type="date" value={entryForm.statement_date} onChange={(event) => setEntryForm((current) => ({ ...current, statement_date: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Valor (R$)</span>
                <input value={entryForm.amount} onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))} placeholder="-120,00" disabled={!canWrite || submitting} />
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Descrição</span>
                <input value={entryForm.description} onChange={(event) => setEntryForm((current) => ({ ...current, description: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button type="submit" disabled={!canWrite || submitting || !entryForm.financial_account_id}>Adicionar extrato</button>
              </div>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><h2>3) Conciliação manual</h2></div>
          <div className="panel-content">
            <form className="form" onSubmit={handleCreateMatch} style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Extrato</span>
                <select value={matchForm.financial_bank_statement_entry_id} onChange={(event) => setMatchForm((current) => ({ ...current, financial_bank_statement_entry_id: event.target.value }))} disabled={!canWrite || submitting}>
                  <option value="">Selecione</option>
                  {entries.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatDate(item.statement_date)} • {formatCurrency(item.amount_cents)} • {item.description}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Lançamento financeiro</span>
                <select value={matchForm.financial_transaction_id} onChange={(event) => setMatchForm((current) => ({ ...current, financial_transaction_id: event.target.value }))} disabled={!canWrite || submitting}>
                  <option value="">Selecione</option>
                  {transactions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatDate(item.due_date ?? item.issue_date)} • {formatCurrency(item.amount_cents)} • {item.note ?? 'Lançamento manual'}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Status</span>
                <select
                  value={matchForm.match_status}
                  onChange={(event) => setMatchForm((current) => ({
                    ...current,
                    match_status: event.target.value as 'matched' | 'unmatched' | 'ignored'
                  }))}
                  disabled={!canWrite || submitting}
                >
                  <option value="matched">Conciliado</option>
                  <option value="unmatched">Sem match</option>
                  <option value="ignored">Ignorado</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span>Confiança (0-1)</span>
                <input value={matchForm.confidence_score} onChange={(event) => setMatchForm((current) => ({ ...current, confidence_score: event.target.value }))} disabled={!canWrite || submitting} />
              </label>
              <div style={{ display: 'flex', alignItems: 'end' }}>
                <button type="submit" disabled={!canWrite || submitting}>Conciliar</button>
              </div>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Rastreio rápido</h2>
          </div>
          <div className="panel-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="panel" style={{ padding: '10px' }}>
              <strong>{jobs.length}</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>jobs de importação</p>
            </div>
            <div className="panel" style={{ padding: '10px' }}>
              <strong>{entries.length}</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>itens de extrato</p>
            </div>
            <div className="panel" style={{ padding: '10px' }}>
              <strong>{matches.length}</strong>
              <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>conciliações registradas</p>
            </div>
          </div>
        </div>

        {error ? <p style={{ margin: 0, color: '#9f3a38' }}>{error}</p> : null}
        {message ? <p style={{ margin: 0, color: '#1c8b61' }}>{message}</p> : null}
        {loading ? <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Carregando dados de conciliação...</p> : null}
      </div>
    </section>
  );
}
