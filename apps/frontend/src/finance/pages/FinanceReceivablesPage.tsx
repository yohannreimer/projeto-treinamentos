import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceReceivableStatus,
  type FinanceReceivablesGroups,
  type FinanceReceivablesList,
  type FinanceReceivablesSummary
} from '../api';
import {
  FinanceErrorState,
  FinancePanel,
  FinancePageHeader,
  FinanceLoadingState,
  FinanceStatusPill
} from '../components/FinancePrimitives';
import {
  FinanceOperationalListGroup,
  FinanceOperationalRow,
  FinanceOperationalSummaryCard
} from '../components/FinanceOperationalBlocks';
import { formatCurrency, parseAmountToCents, todayIso } from '../utils/financeFormatters';

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

function statusLabel(status: FinanceReceivableStatus): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'received') return 'Recebido';
  if (status === 'overdue') return 'Atrasado';
  return 'Cancelado';
}

function CountBadge(props: { children: ReactNode }) {
  return (
    <FinanceStatusPill tone="neutral">{props.children}</FinanceStatusPill>
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
      <FinancePageHeader
        eyebrow="Contas a receber"
        title="Rotina operacional de recebíveis"
        description="Organize o dia entre atrasos, vencimentos do dia, próximos recebimentos e baixas já realizadas."
      />

      <div className="finance-page-stack">
        <FinancePanel title="Operação da empresa logada" description="Cadastre novos títulos, acompanhe o que exige ação hoje e mantenha a carteira de recebíveis previsível." eyebrow="Base única">
            <form className="form form-spacious finance-form-shell" onSubmit={handleSubmit}>
              <div className="finance-form-grid">
                <label className="finance-form-field">
                  <span>Descrição</span>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Ex.: parcela contrato mensal"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label className="finance-form-field">
                  <span>Cliente</span>
                  <input
                    value={form.customer_name}
                    onChange={(event) => setForm((current) => ({ ...current, customer_name: event.target.value }))}
                    placeholder="Nome do cliente"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label className="finance-form-field">
                  <span>Valor (R$)</span>
                  <input
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0,00"
                    disabled={!canWrite || submitting}
                  />
                </label>
              </div>
              <div className="finance-form-grid finance-form-grid--compact">
                <label className="finance-form-field">
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
                <label className="finance-form-field">
                  <span>Vencimento</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label className="finance-form-field">
                  <span>Recebido em</span>
                  <input type="date" value={form.received_at} onChange={(event) => setForm((current) => ({ ...current, received_at: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
              </div>
              <div className="finance-form-grid finance-form-grid--compact">
                <label className="finance-form-field">
                  <span>Conta</span>
                  <select value={form.financial_account_id} onChange={(event) => setForm((current) => ({ ...current, financial_account_id: event.target.value }))} disabled={!canWrite || submitting}>
                    <option value="">Sem conta vinculada</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
                <label className="finance-form-field">
                  <span>Categoria</span>
                  <select value={form.financial_category_id} onChange={(event) => setForm((current) => ({ ...current, financial_category_id: event.target.value }))} disabled={!canWrite || submitting}>
                    <option value="">Sem categoria vinculada</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="finance-form-field">
                  <span>Emissão</span>
                  <input type="date" value={form.issue_date} onChange={(event) => setForm((current) => ({ ...current, issue_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
              </div>
              <label className="finance-form-field">
                <span>Observação</span>
                <textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} rows={2} disabled={!canWrite || submitting} />
              </label>
              <div className="actions finance-inline-actions">
                <button type="submit" disabled={!canWrite || submitting}>
                  {submitting ? 'Salvando...' : 'Registrar conta a receber'}
                </button>
                <button type="button" onClick={() => setForm(initialForm)} disabled={submitting}>Limpar</button>
              </div>
            </form>
        </FinancePanel>

        <div className="finance-section-stack">
          <FinancePanel
            title="Pulso operacional"
            description={`${registeredCount} título(s) na base, ${operationalCount} exigindo acompanhamento e ${settledCount} já liquidado(s).`}
            eyebrow="Leitura operacional"
            action={(
              <div className="finance-inline-badges">
                <CountBadge>{groups.overdue.length} atrasado(s)</CountBadge>
                <CountBadge>{groups.due_today.length} vencendo hoje</CountBadge>
                <CountBadge>{groups.upcoming.length} próximo(s)</CountBadge>
                <CountBadge>{groups.settled.length} recebido(s)</CountBadge>
              </div>
            )}
          >
            {error ? <FinanceErrorState title="Falha ao carregar contas a receber." description={error} /> : null}
            {message ? <p className="finance-inline-message finance-inline-message--success">{message}</p> : null}
            {loading ? (
              <FinanceLoadingState title="Carregando contas a receber..." />
            ) : (
                <>
                  <section className="finance-kpi-grid finance-kpi-grid--three">
                    <FinanceOperationalSummaryCard
                      label="Carteira em aberto"
                      amount={summary.open_cents}
                      detail="Total ainda em rotina operacional."
                      tone="default"
                      accentLabel="Recebíveis"
                      formatCurrency={formatCurrency}
                    />
                    <FinanceOperationalSummaryCard
                      label="Atrasado"
                      amount={summary.overdue_cents}
                      detail="Valores já fora da data-alvo."
                      tone="critical"
                      accentLabel="Recebíveis"
                      formatCurrency={formatCurrency}
                    />
                    <FinanceOperationalSummaryCard
                      label="Vence hoje"
                      amount={summary.due_today_cents}
                      detail="Entradas que precisam de contato imediato."
                      tone="warning"
                      accentLabel="Recebíveis"
                      formatCurrency={formatCurrency}
                    />
                  </section>

                  <div className="finance-section-stack">
                    <FinanceOperationalListGroup
                      title="Atrasados"
                      caption="Prioridade máxima para cobrança e renegociação."
                      rows={groups.overdue}
                      emptyMessage="Nenhum recebível atrasado neste recorte."
                      rowKey={(item) => item.id}
                      renderRow={(item) => (
                        <FinanceOperationalRow
                          description={item.description}
                          counterpartyLabel="Cliente"
                          counterpartyValue={item.customer_name}
                          accountName={item.financial_account_name}
                          categoryName={item.financial_category_name}
                          amountCents={item.amount_cents}
                          primaryDateLabel="Vencimento"
                          primaryDate={item.due_date}
                          secondaryDateLabel="Recebido em"
                          secondaryDate={item.received_at}
                          statusLabel={statusLabel(item.status)}
                          statusTone={item.status === 'received' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                        />
                      )}
                    />
                    <FinanceOperationalListGroup
                      title="Vencendo hoje"
                      caption="Entradas que precisam de acompanhamento ainda hoje."
                      rows={groups.due_today}
                      emptyMessage="Nada vencendo hoje."
                      rowKey={(item) => item.id}
                      renderRow={(item) => (
                        <FinanceOperationalRow
                          description={item.description}
                          counterpartyLabel="Cliente"
                          counterpartyValue={item.customer_name}
                          accountName={item.financial_account_name}
                          categoryName={item.financial_category_name}
                          amountCents={item.amount_cents}
                          primaryDateLabel="Vencimento"
                          primaryDate={item.due_date}
                          secondaryDateLabel="Recebido em"
                          secondaryDate={item.received_at}
                          statusLabel={statusLabel(item.status)}
                          statusTone={item.status === 'received' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                        />
                      )}
                    />
                    <FinanceOperationalListGroup
                      title="Próximos vencimentos"
                      caption="Pipeline de caixa para os próximos dias."
                      rows={groups.upcoming}
                      emptyMessage="Sem próximos recebimentos no momento."
                      rowKey={(item) => item.id}
                      renderRow={(item) => (
                        <FinanceOperationalRow
                          description={item.description}
                          counterpartyLabel="Cliente"
                          counterpartyValue={item.customer_name}
                          accountName={item.financial_account_name}
                          categoryName={item.financial_category_name}
                          amountCents={item.amount_cents}
                          primaryDateLabel="Vencimento"
                          primaryDate={item.due_date}
                          secondaryDateLabel="Recebido em"
                          secondaryDate={item.received_at}
                          statusLabel={statusLabel(item.status)}
                          statusTone={item.status === 'received' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                        />
                      )}
                    />
                    <FinanceOperationalListGroup
                      title="Liquidados"
                      caption="Histórico recente de baixas concluídas."
                      rows={groups.settled}
                      emptyMessage="Nenhum título liquidado neste recorte."
                      rowKey={(item) => item.id}
                      renderRow={(item) => (
                        <FinanceOperationalRow
                          description={item.description}
                          counterpartyLabel="Cliente"
                          counterpartyValue={item.customer_name}
                          accountName={item.financial_account_name}
                          categoryName={item.financial_category_name}
                          amountCents={item.amount_cents}
                          primaryDateLabel="Vencimento"
                          primaryDate={item.due_date}
                          secondaryDateLabel="Recebido em"
                          secondaryDate={item.received_at}
                          statusLabel={statusLabel(item.status)}
                          statusTone={item.status === 'received' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                        />
                      )}
                    />
                  </div>
                </>
              )}
          </FinancePanel>
        </div>
      </div>
    </section>
  );
}
