import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  financeApi,
  type FinanceCatalogSnapshot,
  type FinanceCategory,
  type FinanceEntity,
  type FinanceTransactionKind
} from '../api';
import { parseAmountToCents, todayIso } from '../utils/financeFormatters';

export const FINANCE_QUICK_LAUNCH_CREATED_EVENT = 'finance:quick-launch-created';

export type FinanceQuickLaunchType = 'receivable' | 'payable' | 'transaction';
type QuickLaunchScheduleMode = 'single' | 'installments' | 'recurring';
type QuickLaunchInstallmentBasis = 'total' | 'installment';

type QuickLaunchCreatedDetail = {
  type: FinanceQuickLaunchType;
  id: string;
};

type QuickLaunchForm = {
  description: string;
  counterparty: string;
  amount: string;
  date: string;
  categoryId: string;
  accountId: string;
  immediate: boolean;
  scheduleMode: QuickLaunchScheduleMode;
  installmentCount: string;
  installmentStart: string;
  installmentBasis: QuickLaunchInstallmentBasis;
  transactionKind: Exclude<FinanceTransactionKind, 'transfer' | 'adjustment'>;
};

const emptyCatalog: FinanceCatalogSnapshot = {
  accounts: [],
  categories: [],
  cost_centers: [],
  payment_methods: []
};

const initialForm: QuickLaunchForm = {
  description: '',
  counterparty: '',
  amount: '',
  date: todayIso(),
  categoryId: '',
  accountId: '',
  immediate: false,
  scheduleMode: 'single',
  installmentCount: '10',
  installmentStart: '1',
  installmentBasis: 'total',
  transactionKind: 'expense'
};

const modeOptions: Array<{ mode: FinanceQuickLaunchType; label: string; hint: string }> = [
  { mode: 'receivable', label: 'Vou receber', hint: 'Cria uma conta a receber.' },
  { mode: 'payable', label: 'Vou pagar', hint: 'Cria uma conta a pagar.' },
  { mode: 'transaction', label: 'Movimento direto', hint: 'Lança no ledger.' }
];

function entityName(entity: FinanceEntity) {
  return entity.trade_name || entity.legal_name;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function findEntityId(entities: FinanceEntity[], counterparty: string) {
  const normalized = normalizeSearch(counterparty);
  if (!normalized) return null;
  const entity = entities.find((candidate) =>
    [candidate.legal_name, candidate.trade_name].some((name) => name && normalizeSearch(name) === normalized)
  );
  return entity?.id ?? null;
}

function suggestedModeFromPath(pathname: string): FinanceQuickLaunchType {
  if (pathname.includes('/receivables')) return 'receivable';
  if (pathname.includes('/payables')) return 'payable';
  if (pathname.includes('/transactions')) return 'transaction';
  return 'payable';
}

function categoryAllowed(category: FinanceCategory, mode: FinanceQuickLaunchType, transactionKind: QuickLaunchForm['transactionKind']) {
  if (category.kind === 'neutral') return true;
  if (mode === 'receivable') return category.kind === 'income';
  if (mode === 'payable') return category.kind === 'expense';
  return category.kind === transactionKind;
}

function dispatchCreated(detail: QuickLaunchCreatedDetail) {
  window.dispatchEvent(new CustomEvent<QuickLaunchCreatedDetail>(FINANCE_QUICK_LAUNCH_CREATED_EVENT, { detail }));
}

function dayOfMonthFromIso(dateIso: string) {
  const day = Number.parseInt(dateIso.split('-')[2] ?? '', 10);
  return Number.isFinite(day) ? Math.max(1, Math.min(31, day)) : 1;
}

function addMonthsIso(dateIso: string, months: number) {
  const [year, month, day] = dateIso.split('-').map((part) => Number.parseInt(part, 10));
  const target = new Date(Date.UTC(year, month - 1 + months, day));
  return target.toISOString().slice(0, 10);
}

function installmentAmounts(amountCents: number, count: number, basis: QuickLaunchInstallmentBasis) {
  if (basis === 'installment') {
    return Array.from({ length: count }, () => amountCents);
  }
  const baseAmount = Math.floor(amountCents / count);
  const remainder = amountCents - (baseAmount * count);
  return Array.from({ length: count }, (_item, index) => baseAmount + (index === 0 ? remainder : 0));
}

export function FinanceFloatingQuickLauncher() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FinanceQuickLaunchType>(() => suggestedModeFromPath(location.pathname));
  const [form, setForm] = useState<QuickLaunchForm>(initialForm);
  const [catalog, setCatalog] = useState<FinanceCatalogSnapshot>(emptyCatalog);
  const [entities, setEntities] = useState<FinanceEntity[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const datalistId = useId();

  useEffect(() => {
    if (!open) return;
    setMode(suggestedModeFromPath(location.pathname));
  }, [location.pathname, open]);

  useEffect(() => {
    if (!open || catalogLoaded) return;
    let cancelled = false;

    setLoadingCatalog(true);
    Promise.all([financeApi.getCatalogSnapshot(), financeApi.listEntities()])
      .then(([nextCatalog, nextEntities]) => {
        if (cancelled) return;
        setCatalog(nextCatalog);
        setEntities(nextEntities.filter((entity) => entity.is_active));
        setLoadingCatalog(false);
        setCatalogLoaded(true);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar atalhos financeiros.');
        setLoadingCatalog(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalogLoaded, open]);

  const visibleCategories = useMemo(
    () => catalog.categories.filter((category) => category.is_active && categoryAllowed(category, mode, form.transactionKind)),
    [catalog.categories, form.transactionKind, mode]
  );
  const installmentCount = Math.max(2, Math.min(36, Number.parseInt(form.installmentCount, 10) || 2));
  const installmentStart = Math.max(1, Math.min(installmentCount, Number.parseInt(form.installmentStart, 10) || 1));
  const amountCentsForPreview = parseAmountToCents(form.amount);
  const installmentPreviewTotal = form.installmentBasis === 'installment'
    ? amountCentsForPreview * installmentCount
    : amountCentsForPreview;
  const installmentPreviewAmounts = installmentAmounts(amountCentsForPreview, installmentCount, form.installmentBasis);
  const installmentPreviewRemaining = installmentPreviewAmounts
    .slice(installmentStart - 1)
    .reduce((total, amount) => total + amount, 0);

  function updateForm(field: keyof QuickLaunchForm, value: string | boolean) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setSuccess('');
  }

  function resetForNextEntry() {
    setForm((current) => ({
      ...initialForm,
      date: current.date || todayIso(),
      accountId: current.accountId,
      categoryId: '',
      transactionKind: current.transactionKind
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseAmountToCents(form.amount);
    const description = form.description.trim();
    const counterparty = form.counterparty.trim();
    const date = form.date || todayIso();
    const entityId = findEntityId(entities, counterparty);

    if (!description) {
      setError('Descreva o lançamento para ele aparecer claro nos relatórios.');
      return;
    }

    if (amountCents <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    const isScheduledAccount = mode === 'payable' || mode === 'receivable';
    const scheduleMode = isScheduledAccount ? form.scheduleMode : 'single';
    const installments = scheduleMode === 'installments'
      ? Math.max(2, Math.min(36, Number.parseInt(form.installmentCount, 10) || 0))
      : 1;
    const firstInstallment = scheduleMode === 'installments'
      ? Math.max(1, Math.min(installments, Number.parseInt(form.installmentStart, 10) || 1))
      : 1;

    if (scheduleMode === 'installments' && installments < 2) {
      setError('Informe pelo menos 2 parcelas.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      if (mode === 'payable') {
        if (scheduleMode === 'installments') {
          const amounts = installmentAmounts(amountCents, installments, form.installmentBasis);
          let firstId = '';
          for (let index = firstInstallment - 1; index < amounts.length; index += 1) {
            const payable = await financeApi.createPayable({
              financial_entity_id: entityId,
              financial_account_id: form.accountId || null,
              financial_category_id: form.categoryId || null,
              financial_cost_center_id: null,
              financial_payment_method_id: null,
              supplier_name: entityId ? null : counterparty || null,
              description: `${description} ${index + 1}/${installments}`,
              amount_cents: amounts[index],
              paid_amount_cents: 0,
              status: 'open',
              issue_date: todayIso(),
              due_date: addMonthsIso(date, index - (firstInstallment - 1)),
              paid_at: null,
              note: `Parcelamento: ${installments} parcelas`
            });
            firstId = firstId || payable.id;
          }
          dispatchCreated({ type: 'payable', id: firstId });
          setSuccess(`${installments - firstInstallment + 1} contas a pagar parceladas lançadas.`);
        } else {
          const payable = await financeApi.createPayable({
            financial_entity_id: entityId,
            financial_account_id: form.accountId || null,
            financial_category_id: form.categoryId || null,
            financial_cost_center_id: null,
            financial_payment_method_id: null,
            supplier_name: entityId ? null : counterparty || null,
            description,
            amount_cents: amountCents,
            paid_amount_cents: form.immediate ? amountCents : 0,
            status: form.immediate ? 'paid' : 'open',
            issue_date: todayIso(),
            due_date: date,
            paid_at: form.immediate ? date : null,
            note: null
          });
          if (scheduleMode === 'recurring') {
            await financeApi.createRecurringRuleFromResource({
              resource_type: 'payable',
              resource_id: payable.id,
              day_of_month: dayOfMonthFromIso(date),
              start_date: date,
              materialization_months: 3
            });
          }
          dispatchCreated({ type: 'payable', id: payable.id });
          setSuccess(scheduleMode === 'recurring' ? 'Conta a pagar mensal fixa lançada.' : 'Conta a pagar lançada.');
        }
      } else if (mode === 'receivable') {
        if (scheduleMode === 'installments') {
          const amounts = installmentAmounts(amountCents, installments, form.installmentBasis);
          let firstId = '';
          for (let index = firstInstallment - 1; index < amounts.length; index += 1) {
            const receivable = await financeApi.createReceivable({
              financial_entity_id: entityId,
              financial_account_id: form.accountId || null,
              financial_category_id: form.categoryId || null,
              financial_cost_center_id: null,
              financial_payment_method_id: null,
              customer_name: entityId ? null : counterparty || null,
              description: `${description} ${index + 1}/${installments}`,
              amount_cents: amounts[index],
              received_amount_cents: 0,
              status: 'open',
              issue_date: todayIso(),
              due_date: addMonthsIso(date, index - (firstInstallment - 1)),
              received_at: null,
              note: `Parcelamento: ${installments} parcelas`
            });
            firstId = firstId || receivable.id;
          }
          dispatchCreated({ type: 'receivable', id: firstId });
          setSuccess(`${installments - firstInstallment + 1} contas a receber parceladas lançadas.`);
        } else {
          const receivable = await financeApi.createReceivable({
            financial_entity_id: entityId,
            financial_account_id: form.accountId || null,
            financial_category_id: form.categoryId || null,
            financial_cost_center_id: null,
            financial_payment_method_id: null,
            customer_name: entityId ? null : counterparty || null,
            description,
            amount_cents: amountCents,
            received_amount_cents: form.immediate ? amountCents : 0,
            status: form.immediate ? 'received' : 'open',
            issue_date: todayIso(),
            due_date: date,
            received_at: form.immediate ? date : null,
            note: null
          });
          if (scheduleMode === 'recurring') {
            await financeApi.createRecurringRuleFromResource({
              resource_type: 'receivable',
              resource_id: receivable.id,
              day_of_month: dayOfMonthFromIso(date),
              start_date: date,
              materialization_months: 3
            });
          }
          dispatchCreated({ type: 'receivable', id: receivable.id });
          setSuccess(scheduleMode === 'recurring' ? 'Conta a receber mensal fixa lançada.' : 'Conta a receber lançada.');
        }
      } else {
        const transaction = await financeApi.createTransaction({
          financial_entity_id: entityId,
          financial_account_id: form.accountId || null,
          financial_category_id: form.categoryId || null,
          financial_cost_center_id: null,
          financial_payment_method_id: null,
          kind: form.transactionKind,
          status: 'settled',
          amount_cents: amountCents,
          issue_date: date,
          due_date: null,
          settlement_date: date,
          competence_date: date,
          note: counterparty ? `${description} · ${counterparty}` : description
        });
        dispatchCreated({ type: 'transaction', id: transaction.id });
        setSuccess('Movimento direto lançado.');
      }

      resetForNextEntry();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível lançar agora.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`finance-floating-launcher${open ? ' finance-floating-launcher--open' : ''}`}>
      {open ? (
        <section className="finance-floating-launcher__panel" aria-label="Lançamento rápido">
          <header className="finance-floating-launcher__header">
            <div>
              <small>Lançador rápido</small>
              <h2>Novo lançamento</h2>
            </div>
            <button type="button" aria-label="Fechar lançamento rápido" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          <div className="finance-floating-launcher__modes" role="tablist" aria-label="Tipo de lançamento rápido">
            {modeOptions.map((option) => (
              <button
                key={option.mode}
                type="button"
                className={mode === option.mode ? 'finance-floating-launcher__mode is-active' : 'finance-floating-launcher__mode'}
                onClick={() => {
                  setMode(option.mode);
                  setForm((current) => ({
                    ...current,
                    immediate: option.mode === 'transaction' ? true : current.immediate,
                    scheduleMode: option.mode === 'transaction' ? 'single' : current.scheduleMode,
                    categoryId: ''
                  }));
                  setError('');
                  setSuccess('');
                }}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form className="finance-floating-launcher__form" onSubmit={handleSubmit}>
            {mode === 'transaction' ? (
              <div className="finance-floating-launcher__choice">
                <button
                  type="button"
                  className={form.transactionKind === 'income' ? 'is-active' : ''}
                  onClick={() => {
                    updateForm('transactionKind', 'income');
                    updateForm('categoryId', '');
                  }}
                >
                  Entrada
                </button>
                <button
                  type="button"
                  className={form.transactionKind === 'expense' ? 'is-active' : ''}
                  onClick={() => {
                    updateForm('transactionKind', 'expense');
                    updateForm('categoryId', '');
                  }}
                >
                  Saída
                </button>
              </div>
            ) : null}

            <label>
              <span>Descrição</span>
              <input
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                placeholder={mode === 'payable' ? 'Ex.: aluguel da sala' : mode === 'receivable' ? 'Ex.: mensalidade cliente' : 'Ex.: taxa bancária'}
              />
            </label>

            <label>
              <span>{mode === 'receivable' ? 'Cliente' : mode === 'payable' ? 'Fornecedor' : 'Pessoa ou empresa'}</span>
              <input
                value={form.counterparty}
                onChange={(event) => updateForm('counterparty', event.target.value)}
                placeholder="Digite ou escolha uma entidade"
                list={datalistId}
              />
              <datalist id={datalistId}>
                {entities.map((entity) => (
                  <option key={entity.id} value={entityName(entity)} />
                ))}
              </datalist>
            </label>

            <div className="finance-floating-launcher__split">
              <label>
                <span>Valor</span>
                <input
                  value={form.amount}
                  onChange={(event) => updateForm('amount', event.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                />
              </label>
              <label>
                <span>{mode === 'transaction' ? 'Data' : 'Vencimento'}</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => updateForm('date', event.target.value)}
                />
              </label>
            </div>

            <div className="finance-floating-launcher__split">
              <label>
                <span>Categoria</span>
                <select value={form.categoryId} onChange={(event) => updateForm('categoryId', event.target.value)} disabled={loadingCatalog}>
                  <option value="">Sem categoria</option>
                  {visibleCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Conta</span>
                <select value={form.accountId} onChange={(event) => updateForm('accountId', event.target.value)} disabled={loadingCatalog}>
                  <option value="">Sem conta</option>
                  {catalog.accounts.filter((account) => account.is_active).map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {mode !== 'transaction' ? (
              <div className="finance-floating-launcher__schedule">
                <div className="finance-floating-launcher__schedule-tabs" role="tablist" aria-label="Natureza do lançamento">
                  {[
                    { value: 'single' as const, label: 'Único' },
                    { value: 'installments' as const, label: 'Parcelado' },
                    { value: 'recurring' as const, label: 'Mensal fixo' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={form.scheduleMode === option.value ? 'is-active' : ''}
                      onClick={() => {
                        updateForm('scheduleMode', option.value);
                        if (option.value !== 'single') updateForm('immediate', false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {form.scheduleMode === 'single' ? (
                  <label className="finance-floating-launcher__checkbox">
                    <input
                      type="checkbox"
                      checked={form.immediate}
                      onChange={(event) => updateForm('immediate', event.target.checked)}
                    />
                    <span>{mode === 'payable' ? 'Já foi pago agora' : 'Já foi recebido agora'}</span>
                  </label>
                ) : null}

                {form.scheduleMode === 'installments' ? (
                  <div className="finance-floating-launcher__installments">
                    <div className="finance-floating-launcher__split">
                      <label>
                        <span>Parcelas</span>
                        <input
                          value={form.installmentCount}
                          onChange={(event) => updateForm('installmentCount', event.target.value)}
                          inputMode="numeric"
                          placeholder="10"
                        />
                      </label>
                      <label>
                        <span>Valor informado</span>
                        <select
                          value={form.installmentBasis}
                          onChange={(event) => updateForm('installmentBasis', event.target.value as QuickLaunchInstallmentBasis)}
                        >
                          <option value="total">Total da compra</option>
                          <option value="installment">Valor da parcela</option>
                        </select>
                      </label>
                    </div>
                    <div className="finance-floating-launcher__installment-start">
                      <span>Começar pela parcela</span>
                      <div className="finance-floating-launcher__installment-dots" role="radiogroup" aria-label="Parcela inicial">
                        {Array.from({ length: installmentCount }, (_item, index) => {
                          const installmentNumber = index + 1;
                          const active = installmentNumber === installmentStart;
                          const skipped = installmentNumber < installmentStart;
                          return (
                            <button
                              key={installmentNumber}
                              type="button"
                              className={`${active ? 'is-active' : ''}${skipped ? ' is-skipped' : ''}`}
                              onClick={() => updateForm('installmentStart', String(installmentNumber))}
                              aria-checked={active}
                              role="radio"
                              title={`Começar pela parcela ${installmentNumber}`}
                            >
                              {installmentNumber}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="finance-floating-launcher__recurring-note">
                      Criando da {installmentStart}/{installmentCount} até {installmentCount}/{installmentCount} · total original R$ {(installmentPreviewTotal / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · restante R$ {(installmentPreviewRemaining / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.
                    </p>
                  </div>
                ) : null}

                {form.scheduleMode === 'recurring' ? (
                  <p className="finance-floating-launcher__recurring-note">
                    Cria uma regra mensal sem data final, mantém 3 meses à frente e projeta no DRE pelo período.
                  </p>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="finance-floating-launcher__message finance-floating-launcher__message--error">{error}</p> : null}
            {success ? <p className="finance-floating-launcher__message finance-floating-launcher__message--success">{success}</p> : null}

            <button className="finance-floating-launcher__submit" type="submit" disabled={submitting || loadingCatalog}>
              {submitting ? 'Lançando...' : 'Concluir lançamento'}
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="finance-floating-launcher__fab"
        aria-label={open ? 'Fechar lançamento rápido' : 'Abrir lançamento rápido'}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{open ? '×' : '+'}</span>
      </button>
    </div>
  );
}
