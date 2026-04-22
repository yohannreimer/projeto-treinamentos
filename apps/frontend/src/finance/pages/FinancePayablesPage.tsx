import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type FinanceAccount,
  type FinanceCategory,
  type FinancePayableStatus,
  type FinancePayablesGroups,
  type FinancePayablesList,
  type FinancePayablesSummary
} from '../api';
import {
  FinanceErrorState,
  FinanceKpiCard,
  FinancePanel,
  FinancePageHeader,
  FinanceLoadingState,
  FinanceMono,
  FinanceStatusPill
} from '../components/FinancePrimitives';
import { formatCurrency, parseAmountToCents, todayIso } from '../utils/financeFormatters';
import {
  FinanceOperationalListGroup,
  FinanceOperationalRow
} from '../components/FinanceOperationalBlocks';

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

const emptySummary: FinancePayablesSummary = {
  open_cents: 0,
  overdue_cents: 0,
  due_today_cents: 0
};

const emptyGroups: FinancePayablesGroups = {
  overdue: [],
  due_today: [],
  upcoming: [],
  settled: []
};

function statusLabel(status: FinancePayableStatus): string {
  if (status === 'planned') return 'Planejado';
  if (status === 'open') return 'Em aberto';
  if (status === 'partial') return 'Parcial';
  if (status === 'paid') return 'Pago';
  if (status === 'overdue') return 'Atrasado';
  return 'Cancelado';
}

function SummaryCard(props: {
  label: string;
  amount: number;
  detail: string;
  tone: 'default' | 'warning' | 'critical';
}) {
  return (
    <FinanceKpiCard
      label={props.label}
      value={<FinanceMono>{formatCurrency(props.amount)}</FinanceMono>}
      description={props.detail}
      tone={props.tone === 'critical' ? 'danger' : props.tone === 'warning' ? 'warning' : 'neutral'}
      accentLabel="Obrigações"
    />
  );
}

function CountBadge(props: { children: ReactNode }) {
  return (
    <FinanceStatusPill tone="neutral">{props.children}</FinanceStatusPill>
  );
}

export function FinancePayablesPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [payablesData, setPayablesData] = useState<FinancePayablesList | null>(null);
  const [form, setForm] = useState<PayableForm>(initialForm);
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
      const [accountsRes, categoriesRes, nextPayables] = await Promise.all([
        financeApi.listAccounts(),
        financeApi.listCategories(),
        financeApi.listPayables()
      ]);
      setAccounts(accountsRes.accounts);
      setCategories(categoriesRes.categories);
      setPayablesData(nextPayables);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar contas a pagar.');
      setAccounts([]);
      setCategories([]);
      setPayablesData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => undefined);
  }, []);

  const summary = payablesData?.summary ?? emptySummary;
  const groups = payablesData?.groups ?? emptyGroups;
  const operationalCount = groups.overdue.length + groups.due_today.length + groups.upcoming.length;
  const settledCount = groups.settled.length;
  const registeredCount = payablesData?.payables.length ?? 0;

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
      await financeApi.createPayable({
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
      await reload();
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao cadastrar conta a pagar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page finance-page">
      <FinancePageHeader
        eyebrow="Contas a pagar"
        title="Rotina operacional de obrigações"
        description="Priorize atrasos, organize o que vence hoje, antecipe desembolsos e acompanhe as baixas concluídas."
      />

      <div className="finance-page-stack">
        <FinancePanel title="Operação da empresa logada" description="Registre compromissos, distribua o caixa com antecedência e trate rapidamente o que já saiu da janela combinada." eyebrow="Base única">
            <form className="form form-spacious finance-form-shell" onSubmit={handleSubmit}>
              <div className="finance-form-grid">
                <label className="finance-form-field">
                  <span>Descrição</span>
                  <input
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Ex.: mensalidade plataforma"
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label className="finance-form-field">
                  <span>Fornecedor</span>
                  <input
                    value={form.supplier_name}
                    onChange={(event) => setForm((current) => ({ ...current, supplier_name: event.target.value }))}
                    placeholder="Nome do fornecedor"
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
                  <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FinancePayableStatus }))} disabled={!canWrite || submitting}>
                    <option value="planned">Planejado</option>
                    <option value="open">Em aberto</option>
                    <option value="partial">Parcial</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Atrasado</option>
                    <option value="canceled">Cancelado</option>
                  </select>
                </label>
                <label className="finance-form-field">
                  <span>Vencimento</span>
                  <input type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} disabled={!canWrite || submitting} />
                </label>
                <label className="finance-form-field">
                  <span>Pago em</span>
                  <input type="date" value={form.paid_at} onChange={(event) => setForm((current) => ({ ...current, paid_at: event.target.value }))} disabled={!canWrite || submitting} />
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
                  {submitting ? 'Salvando...' : 'Registrar conta a pagar'}
                </button>
                <button type="button" onClick={() => setForm(initialForm)} disabled={submitting}>Limpar</button>
              </div>
            </form>
        </FinancePanel>

        <FinancePanel
          title="Pulso operacional"
          description={`${registeredCount} obrigação(ões) na base, ${operationalCount} em acompanhamento e ${settledCount} já quitada(s).`}
          eyebrow="Leitura operacional"
          action={(
            <div className="finance-inline-badges">
              <CountBadge>{groups.overdue.length} atrasado(s)</CountBadge>
              <CountBadge>{groups.due_today.length} vencendo hoje</CountBadge>
              <CountBadge>{groups.upcoming.length} próximo(s)</CountBadge>
              <CountBadge>{groups.settled.length} pago(s)</CountBadge>
            </div>
          )}
        >
            {error ? <FinanceErrorState title="Falha ao carregar contas a pagar." description={error} /> : null}
            {message ? <p className="finance-inline-message finance-inline-message--success">{message}</p> : null}
            {loading ? (
              <FinanceLoadingState title="Carregando contas a pagar..." />
            ) : (
              <>
                <section className="finance-kpi-grid finance-kpi-grid--three">
                  <SummaryCard
                    label="Carteira em aberto"
                    amount={summary.open_cents}
                    detail="Compromissos ainda em rotina operacional."
                    tone="default"
                  />
                  <SummaryCard
                    label="Atrasado"
                    amount={summary.overdue_cents}
                    detail="Valores já fora da janela de pagamento."
                    tone="critical"
                  />
                  <SummaryCard
                    label="Vence hoje"
                    amount={summary.due_today_cents}
                    detail="Saídas que pedem decisão de caixa hoje."
                    tone="warning"
                  />
                </section>

                <div className="finance-section-stack">
                  <FinanceOperationalListGroup
                    title="Atrasados"
                    caption="Débitos que exigem renegociação ou pagamento imediato."
                    rows={groups.overdue}
                    emptyMessage="Nenhuma obrigação atrasada neste recorte."
                    rowKey={(item) => item.id}
                    renderRow={(item) => (
                      <FinanceOperationalRow
                        description={item.description}
                        counterpartyLabel="Fornecedor"
                        counterpartyValue={item.supplier_name}
                        accountName={item.financial_account_name}
                        categoryName={item.financial_category_name}
                        amountCents={item.amount_cents}
                        primaryDateLabel="Vencimento"
                        primaryDate={item.due_date}
                        secondaryDateLabel="Pago em"
                        secondaryDate={item.paid_at}
                        statusLabel={statusLabel(item.status)}
                        statusTone={item.status === 'paid' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                      />
                    )}
                  />
                  <FinanceOperationalListGroup
                    title="Vencendo hoje"
                    caption="Pagamentos que precisam de aprovação ou baixa ainda hoje."
                    rows={groups.due_today}
                    emptyMessage="Nada vencendo hoje."
                    rowKey={(item) => item.id}
                    renderRow={(item) => (
                      <FinanceOperationalRow
                        description={item.description}
                        counterpartyLabel="Fornecedor"
                        counterpartyValue={item.supplier_name}
                        accountName={item.financial_account_name}
                        categoryName={item.financial_category_name}
                        amountCents={item.amount_cents}
                        primaryDateLabel="Vencimento"
                        primaryDate={item.due_date}
                        secondaryDateLabel="Pago em"
                        secondaryDate={item.paid_at}
                        statusLabel={statusLabel(item.status)}
                        statusTone={item.status === 'paid' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                      />
                    )}
                  />
                  <FinanceOperationalListGroup
                    title="Próximos vencimentos"
                    caption="Planejamento dos próximos desembolsos."
                    rows={groups.upcoming}
                    emptyMessage="Sem próximos pagamentos no momento."
                    rowKey={(item) => item.id}
                    renderRow={(item) => (
                      <FinanceOperationalRow
                        description={item.description}
                        counterpartyLabel="Fornecedor"
                        counterpartyValue={item.supplier_name}
                        accountName={item.financial_account_name}
                        categoryName={item.financial_category_name}
                        amountCents={item.amount_cents}
                        primaryDateLabel="Vencimento"
                        primaryDate={item.due_date}
                        secondaryDateLabel="Pago em"
                        secondaryDate={item.paid_at}
                        statusLabel={statusLabel(item.status)}
                        statusTone={item.status === 'paid' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                      />
                    )}
                  />
                  <FinanceOperationalListGroup
                    title="Liquidados"
                    caption="Histórico recente das baixas concluídas."
                    rows={groups.settled}
                    emptyMessage="Nenhuma obrigação liquidada neste recorte."
                    rowKey={(item) => item.id}
                    renderRow={(item) => (
                      <FinanceOperationalRow
                        description={item.description}
                        counterpartyLabel="Fornecedor"
                        counterpartyValue={item.supplier_name}
                        accountName={item.financial_account_name}
                        categoryName={item.financial_category_name}
                        amountCents={item.amount_cents}
                        primaryDateLabel="Vencimento"
                        primaryDate={item.due_date}
                        secondaryDateLabel="Pago em"
                        secondaryDate={item.paid_at}
                        statusLabel={statusLabel(item.status)}
                        statusTone={item.status === 'paid' ? 'success' : item.status === 'overdue' ? 'danger' : item.status === 'partial' ? 'warning' : 'neutral'}
                      />
                    )}
                  />
                </div>
              </>
            )}
        </FinancePanel>
      </div>
    </section>
  );
}
