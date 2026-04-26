import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { hasAnyPermission, internalSessionStore } from '../../auth/session';
import {
  financeApi,
  type FinanceCatalogSnapshot,
  type FinanceEntity,
  type FinancePayable,
  type FinancePayableStatus,
  type FinancePayablesList
} from '../api';
import { FinanceEntityCombobox } from '../components/FinanceEntityCombobox';
import { FINANCE_QUICK_LAUNCH_CREATED_EVENT, type FinanceQuickLaunchCreatedDetail } from '../components/financeFloatingEvents';
import { FinancePeriodFilter } from '../components/FinancePeriodFilter';
import { FinanceMono } from '../components/FinancePrimitives';
import { resolveFinancePeriodWindow, useFinancePeriod } from '../hooks/useFinancePeriod';
import { formatCurrency, formatDate, parseAmountToCents, todayIso } from '../utils/financeFormatters';

type PayableForm = {
  desc: string;
  entity: string;
  financial_entity_id: string;
  financial_category_id: string;
  financial_cost_center_id: string;
  financial_account_id: string;
  financial_payment_method_id: string;
  value: string;
  status: 'pendente' | 'pago' | 'atrasado';
  due: string;
  obs: string;
};

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type StatusTone = Exclude<Tone, 'info'>;
type DailyOperation = 'settle' | 'partial' | 'duplicate' | 'cancel' | 'installments' | 'recurrences';
type DraftOperation = Exclude<DailyOperation, 'settle' | 'duplicate'>;

const initialForm: PayableForm = {
  desc: '',
  entity: '',
  financial_entity_id: '',
  financial_category_id: '',
  financial_cost_center_id: '',
  financial_account_id: '',
  financial_payment_method_id: '',
  value: '',
  status: 'pendente',
  due: '',
  obs: ''
};

const emptyGroups = {
  overdue: [] as FinancePayable[],
  due_today: [] as FinancePayable[],
  upcoming: [] as FinancePayable[],
  settled: [] as FinancePayable[]
};

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodThatShowsDate(dateIso: string) {
  const today = todayIso();
  const next30 = addDaysIso(29);
  if (dateIso >= today && dateIso <= next30) {
    return { preset: 'next_30' as const, from: '', to: '' };
  }

  const [year, month] = dateIso.split('-');
  if (!year || !month) {
    return { preset: 'all' as const, from: '', to: '' };
  }
  const endDate = new Date(Number(year), Number(month), 0);
  return {
    preset: 'custom' as const,
    from: `${year}-${month}-01`,
    to: `${year}-${month}-${String(endDate.getDate()).padStart(2, '0')}`
  };
}

function isDateInsideWindow(dateIso: string | null | undefined, windowRange: { from: string | null; to: string | null }) {
  if (!dateIso || !windowRange.from || !windowRange.to) return true;
  return dateIso >= windowRange.from && dateIso <= windowRange.to;
}

const pageStyle = {
  display: 'grid',
  gap: 20
} as const;

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '320px 1fr',
  gap: 20,
  alignItems: 'start'
} as const;

const cardStyle = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 20
} as const;

const titleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
  letterSpacing: '-0.01em',
  marginBottom: 14
} as const;

const pageHeaderStyle = {
  marginBottom: 28,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 24
} as const;

const pageHeaderCopyStyle = {
  minWidth: 0
} as const;

const eyebrowStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  marginBottom: 6
} as const;

const pageTitleStyle = {
  fontSize: 26,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 6,
  lineHeight: 1.2
} as const;

const pageDescriptionStyle = {
  fontSize: 13,
  color: '#64748b',
  maxWidth: 560,
  textWrap: 'pretty'
} as const;

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: 4
} as const;

const controlStyle = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: 12,
  color: '#0f172a',
  background: 'white',
  fontFamily: 'inherit',
  outline: 'none'
} as const;

const fieldStyle = {
  marginBottom: 11
} as const;

const twoColStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
  marginBottom: 11
} as const;

const actionRowStyle = {
  display: 'flex',
  gap: 8
} as const;

const primaryButtonStyle = {
  flex: 1,
  padding: '8px 0',
  background: 'var(--accent)',
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

const successBannerStyle = {
  background: '#d1fae5',
  border: '1px solid #6ee7b7',
  borderRadius: 7,
  padding: '8px 12px',
  fontSize: 12,
  color: '#065f46',
  marginBottom: 12
} as const;

const errorBannerStyle = {
  background: '#fee2e2',
  border: '1px solid #fca5a5',
  borderRadius: 7,
  padding: '8px 12px',
  fontSize: 12,
  color: '#991b1b',
  marginBottom: 12
} as const;

const pulseCopyStyle = {
  fontSize: 12,
  color: '#64748b',
  marginBottom: 12,
  lineHeight: 1.6
} as const;

const pulseGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 8,
  marginBottom: 4
} as const;

const pulseChipStyle = {
  borderRadius: 8,
  padding: '10px 12px',
  textAlign: 'center'
} as const;

const dividerStyle = {
  height: 1,
  background: '#e2e8f0',
  margin: '16px 0'
} as const;

const totalRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '5px 0',
  borderBottom: '1px solid #f1f5f9'
} as const;

const listGroupStyle = {
  marginBottom: 20
} as const;

const listHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10
} as const;

const accentBarStyle = {
  width: 3,
  height: 16,
  borderRadius: 2
} as const;

const countBadgeBaseStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 20,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.7,
  whiteSpace: 'nowrap'
} as const;

const listCardStyle = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
  marginBottom: 8,
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
  alignItems: 'center'
} as const;

const listTitleStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#0f172a',
  marginBottom: 2
} as const;

const listMetaStyle = {
  fontSize: 11,
  color: '#64748b',
  marginBottom: 4,
  lineHeight: 1.4
} as const;

const listBadgeRowStyle = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap'
} as const;

const rowValueStyle = {
  textAlign: 'right'
} as const;

const rowAmountStyle = {
  fontSize: 15,
  fontWeight: 600,
  fontFamily: "'DM Mono', monospace",
  color: '#0f172a'
} as const;

const compactActionStyle = {
  height: 26,
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  background: 'white',
  color: '#475569',
  padding: '0 8px',
  fontSize: 11,
  fontWeight: 650,
  cursor: 'pointer',
  fontFamily: 'inherit'
} as const;

const compactPrimaryActionStyle = {
  ...compactActionStyle,
  background: '#0f172a',
  borderColor: '#0f172a',
  color: 'white'
} as const;

const operationDraftStyle = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  alignItems: 'center',
  marginTop: 8
} as const;

const operationInputStyle = {
  height: 26,
  minWidth: 140,
  maxWidth: 220,
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  padding: '0 8px',
  fontSize: 11,
  color: '#0f172a',
  fontFamily: 'inherit',
  background: '#f8fafc'
} as const;

const toneStyles: Record<StatusTone, { bg: string; color: string; label: string }> = {
  neutral: { bg: '#f1f5f9', color: '#64748b', label: 'Pendente' },
  success: { bg: '#d1fae5', color: '#059669', label: 'Pago' },
  warning: { bg: '#ffedd5', color: '#ea580c', label: 'Vence hoje' },
  danger: { bg: '#fee2e2', color: '#ef4444', label: 'Atrasado' }
};

function PageHeader({ action }: { action?: ReactNode }) {
  return (
    <header style={pageHeaderStyle}>
      <div style={pageHeaderCopyStyle}>
        <div style={eyebrowStyle}>Contas a Pagar</div>
        <h1 style={pageTitleStyle}>Rotina operacional de obrigações</h1>
        <p style={pageDescriptionStyle}>Acompanhe atrasos, vencimentos do dia, próximos desembolsos e baixas.</p>
      </div>
      {action ? <div style={{ marginTop: 2, flexShrink: 0 }}>{action}</div> : null}
    </header>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section style={cardStyle}>{children}</section>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 style={titleStyle}>{children}</h2>;
}

function Badge({ children, color = '#64748b', bg = '#f1f5f9' }: { children: ReactNode; color?: string; bg?: string }) {
  return <span style={{ ...countBadgeBaseStyle, background: bg, color }}>{children}</span>;
}

function StatusBadge({ status }: { status: FinancePayableStatus }) {
  const map: Record<FinancePayableStatus, { bg: string; color: string; label: string }> = {
    planned: { bg: '#f1f5f9', color: '#64748b', label: 'Planejado' },
    open: { bg: '#fef3c7', color: '#d97706', label: 'Pendente' },
    partial: { bg: '#ffedd5', color: '#ea580c', label: 'Parcial' },
    paid: { bg: '#d1fae5', color: '#059669', label: 'Pago' },
    overdue: { bg: '#fee2e2', color: '#dc2626', label: 'Atrasado' },
    canceled: { bg: '#f1f5f9', color: '#94a3b8', label: 'Cancelado' }
  };

  const tone = map[status] ?? map.open;
  return <Badge color={tone.color} bg={tone.bg}>{tone.label}</Badge>;
}

function entityName(entity: FinanceEntity) {
  return entity.trade_name || entity.legal_name;
}

function normalizeEntitySearch(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function Divider() {
  return <div style={dividerStyle} />;
}

function PulseChip({ label, count, tone }: { label: string; count: number; tone: Exclude<Tone, 'info'> }) {
  const colors = toneStyles[tone];
  return (
    <article style={{ ...pulseChipStyle, background: colors.bg }}>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: colors.color }}>{count}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: colors.color }}>{label}</div>
    </article>
  );
}

function draftDefaultValue(operation: DraftOperation) {
  if (operation === 'cancel') return 'Cancelado pela rotina operacional.';
  if (operation === 'installments') return '3';
  if (operation === 'recurrences') return '6';
  return '';
}

function draftLabel(operation: DraftOperation) {
  if (operation === 'partial') return 'Valor parcial';
  if (operation === 'cancel') return 'Motivo do cancelamento';
  if (operation === 'installments') return 'Quantidade de parcelas';
  return 'Quantidade de recorrências';
}

function PayablesListGroup({
  title,
  items,
  emptyText,
  accentColor,
  canWrite,
  onOperation
}: {
  title: string;
  items: FinancePayable[];
  emptyText: string;
  accentColor: string;
  canWrite: boolean;
  onOperation: (operation: DailyOperation, item: FinancePayable, value?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ itemId: string; operation: DraftOperation; value: string } | null>(null);

  return (
    <section style={listGroupStyle}>
      <header style={listHeaderStyle}>
        <div style={{ ...accentBarStyle, background: accentColor }} aria-hidden="true" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{title}</span>
        <Badge color={accentColor} bg={`${accentColor}18`}>{items.length}</Badge>
      </header>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>{emptyText}</div>
      ) : (
        items.map((item) => (
          <article key={item.id} style={listCardStyle}>
            <div>
              <div style={listTitleStyle}>{item.description}</div>
              <div style={listMetaStyle}>
                {item.supplier_name ?? 'Sem fornecedor'}
                {item.financial_account_name ? ` · ${item.financial_account_name}` : ''}
                {item.financial_category_name ? ` · ${item.financial_category_name}` : ''}
              </div>
              <div style={listBadgeRowStyle}>
                <StatusBadge status={item.status} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Vence {formatDate(item.due_date)}</span>
                {item.paid_amount_cents > 0 && item.status !== 'paid' ? <span style={{ fontSize: 11, color: '#ea580c' }}>Pago parcial {formatCurrency(item.paid_amount_cents)}</span> : null}
                {item.paid_at ? <span style={{ fontSize: 11, color: '#059669' }}>Pago em {formatDate(item.paid_at)}</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" style={compactActionStyle} disabled={!canWrite || item.status === 'paid' || item.status === 'canceled'} onClick={() => onOperation('settle', item)}>Baixar</button>
                <button type="button" style={compactActionStyle} disabled={!canWrite || item.status === 'paid' || item.status === 'canceled'} onClick={() => setDraft({ itemId: item.id, operation: 'partial', value: draftDefaultValue('partial') })}>Parcial</button>
                <button type="button" style={compactActionStyle} disabled={!canWrite} onClick={() => onOperation('duplicate', item)}>Duplicar</button>
                <button type="button" style={compactActionStyle} disabled={!canWrite} onClick={() => setDraft({ itemId: item.id, operation: 'installments', value: draftDefaultValue('installments') })}>Parcelar</button>
                <button type="button" style={compactActionStyle} disabled={!canWrite} onClick={() => setDraft({ itemId: item.id, operation: 'recurrences', value: draftDefaultValue('recurrences') })}>Recorrência</button>
                <button type="button" style={{ ...compactActionStyle, color: '#be123c', borderColor: '#fecdd3' }} disabled={!canWrite || item.status === 'canceled'} onClick={() => setDraft({ itemId: item.id, operation: 'cancel', value: draftDefaultValue('cancel') })}>Cancelar</button>
              </div>
              {draft?.itemId === item.id ? (
                <form
                  style={operationDraftStyle}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onOperation(draft.operation, item, draft.value).then(() => setDraft(null));
                  }}
                >
                  <input
                    aria-label={draftLabel(draft.operation)}
                    style={operationInputStyle}
                    value={draft.value}
                    onChange={(event) => setDraft({ ...draft, value: event.target.value })}
                  />
                  <button type="submit" style={compactPrimaryActionStyle}>Aplicar</button>
                  <button type="button" style={compactActionStyle} onClick={() => setDraft(null)}>Fechar</button>
                </form>
              ) : null}
            </div>
            <div style={rowValueStyle}>
              <div style={rowAmountStyle}>
                <FinanceMono>{formatCurrency(item.amount_cents)}</FinanceMono>
              </div>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

export function FinancePayablesPage() {
  const { period, setPeriod } = useFinancePeriod();
  const [dataState, setDataState] = useState<FinancePayablesList | null>(null);
  const [entities, setEntities] = useState<FinanceEntity[]>([]);
  const [catalog, setCatalog] = useState<FinanceCatalogSnapshot | null>(null);
  const [form, setForm] = useState<PayableForm>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingEntity, setCreatingEntity] = useState(false);
  const [error, setError] = useState('');
  const [smartHint, setSmartHint] = useState('');
  const [success, setSuccess] = useState(false);

  const session = internalSessionStore.read();
  const canWrite = hasAnyPermission(session?.user, ['finance.write']);
  const periodWindow = useMemo(() => resolveFinancePeriodWindow(period), [period]);

  async function reload() {
    setLoading(true);
    setError('');
    try {
      const nextPayables = await financeApi.listPayables();
      setDataState(nextPayables);
    } catch (loadError) {
      setError((loadError as Error).message || 'Falha ao carregar contas a pagar.');
      setDataState(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch(() => undefined);
    Promise.allSettled([financeApi.listEntities(), financeApi.getCatalogSnapshot()])
      .then(([entityResult, catalogResult]) => {
        if (entityResult.status === 'fulfilled') {
          setEntities(entityResult.value.filter((entity) => entity.kind === 'supplier' || entity.kind === 'both'));
        }

        if (catalogResult.status === 'fulfilled') {
          setCatalog(catalogResult.value);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function handleQuickLaunchCreated(event: Event) {
      const detail = (event as CustomEvent<FinanceQuickLaunchCreatedDetail>).detail;
      if (detail?.type !== 'payable') return;
      setSuccess(true);
      if (detail.due_date && !isDateInsideWindow(detail.due_date, resolveFinancePeriodWindow(period))) {
        setPeriod(periodThatShowsDate(detail.due_date));
      }
      reload().catch(() => undefined);
    }

    window.addEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, handleQuickLaunchCreated);
    return () => window.removeEventListener(FINANCE_QUICK_LAUNCH_CREATED_EVENT, handleQuickLaunchCreated);
  }, [period, setPeriod]);

  const groups = dataState?.groups ?? emptyGroups;
  const statusQuery = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('status');
  const isInsidePeriod = (dateIso?: string | null) => {
    if (!periodWindow.from || !periodWindow.to) return true;
    if (!dateIso) return false;
    return dateIso >= periodWindow.from && dateIso <= periodWindow.to;
  };
  const filteredGroups = useMemo(() => {
    const next = {
      overdue: groups.overdue.filter((item) => isInsidePeriod(item.due_date)),
      due_today: groups.due_today.filter((item) => isInsidePeriod(item.due_date)),
      upcoming: groups.upcoming.filter((item) => isInsidePeriod(item.due_date)),
      settled: groups.settled.filter((item) => isInsidePeriod(item.due_date))
    };
    if (statusQuery === 'overdue') {
      return { ...next, due_today: [], upcoming: [], settled: [] };
    }
    return next;
  }, [groups, periodWindow.from, periodWindow.to, statusQuery]);
  const today = filteredGroups.due_today;
  const upcoming = filteredGroups.upcoming;
  const paid = filteredGroups.settled;
  const overdueFiltered = filteredGroups.overdue;
  const visibleItems = [...overdueFiltered, ...today, ...upcoming, ...paid];
  const openTotal = visibleItems.filter((item) => item.status !== 'paid').reduce((total, item) => total + item.amount_cents, 0);
  const overdueTotal = overdueFiltered.reduce((total, item) => total + item.amount_cents, 0);
  const todayTotal = today.reduce((total, item) => total + item.amount_cents, 0);
  const pulse = `${visibleItems.length} obrigações no filtro · ${visibleItems.filter((item) => item.status !== 'paid').length} em acompanhamento · ${paid.length} liquidadas`;
  const typedEntityName = form.entity.trim();
  const hasExactEntityMatch = typedEntityName.length > 0 && entities.some((entity) => normalizeEntitySearch(entityName(entity)) === normalizeEntitySearch(typedEntityName));
  const hasVisibleEntityMatch = typedEntityName.length > 0 && entities.some((entity) => normalizeEntitySearch(entityName(entity)).includes(normalizeEntitySearch(typedEntityName)));
  const shouldOfferEntityCreation = typedEntityName.length > 0 && !form.financial_entity_id && !hasExactEntityMatch && !hasVisibleEntityMatch;

  async function handleSelectEntity(entity: FinanceEntity) {
    setForm((current) => ({
      ...current,
      entity: entityName(entity),
      financial_entity_id: entity.id
    }));
    setSmartHint('');

    try {
      const profile = await financeApi.getEntityDefaultProfile(entity.id, 'payable');
      if (!profile) {
        setSmartHint('Entidade vinculada. Sem perfil padrão para conta a pagar ainda.');
        return;
      }

      setForm((current) => ({
        ...current,
        financial_category_id: profile.financial_category_id ?? current.financial_category_id,
        financial_cost_center_id: profile.financial_cost_center_id ?? current.financial_cost_center_id,
        financial_account_id: profile.financial_account_id ?? current.financial_account_id,
        financial_payment_method_id: profile.financial_payment_method_id ?? current.financial_payment_method_id
      }));
      setSmartHint('Perfil padrão aplicado ao lançamento.');
    } catch {
      setSmartHint('Entidade vinculada. Não foi possível carregar os defaults agora.');
    }
  }

  async function handleCreateAndUseEntity() {
    const legalName = form.entity.trim();
    if (!legalName) return;

    setCreatingEntity(true);
    setError('');
    try {
      const created = await financeApi.createEntity({
        legal_name: legalName,
        trade_name: null,
        document_number: null,
        kind: 'supplier',
        email: null,
        phone: null,
        is_active: true
      });
      setEntities((current) => [created, ...current]);
      await handleSelectEntity(created);
      setSmartHint('Fornecedor cadastrado e vinculado ao lançamento.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Falha ao cadastrar fornecedor.');
    } finally {
      setCreatingEntity(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseAmountToCents(form.value);
    if (amountCents <= 0) {
      setError('Informe um valor monetário válido.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess(false);
    try {
      await financeApi.createPayable({
        financial_account_id: form.financial_account_id || null,
        financial_category_id: form.financial_category_id || null,
        financial_cost_center_id: form.financial_cost_center_id || null,
        financial_payment_method_id: form.financial_payment_method_id || null,
        financial_entity_id: form.financial_entity_id || null,
        supplier_name: form.entity.trim() || null,
        description: form.desc.trim(),
        amount_cents: amountCents,
        status: form.status === 'pago' ? 'paid' : form.status === 'atrasado' ? 'overdue' : 'open',
        issue_date: todayIso(),
        due_date: form.due || null,
        paid_at: form.status === 'pago' ? todayIso() : null,
        note: form.obs.trim() || null
      });
      setForm(initialForm);
      setSmartHint('');
      setSuccess(true);
      await reload();
    } catch (submitError) {
      setError((submitError as Error).message || 'Falha ao cadastrar conta a pagar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOperation(
    operation: DailyOperation,
    item: FinancePayable,
    value?: string
  ) {
    setError('');
    setSuccess(false);
    try {
      if (operation === 'settle') {
        await financeApi.settlePayable(item.id, { settled_at: todayIso() });
      } else if (operation === 'partial') {
        const amountCents = parseAmountToCents(value ?? '');
        if (amountCents <= 0) return;
        await financeApi.partiallySettlePayable(item.id, { amount_cents: amountCents, settled_at: todayIso() });
      } else if (operation === 'duplicate') {
        await financeApi.duplicatePayable(item.id, { note: 'Duplicado pela rotina operacional.' });
      } else if (operation === 'cancel') {
        await financeApi.cancelPayable(item.id, { note: value?.trim() || 'Cancelado pela rotina operacional.' });
      } else if (operation === 'installments') {
        const count = Number.parseInt(value ?? '', 10);
        if (!Number.isFinite(count) || count < 2) return;
        await financeApi.createPayableInstallments(item.id, { count, first_due_date: item.due_date ?? todayIso() });
      } else {
        const count = Number.parseInt(value ?? '', 10);
        if (!Number.isFinite(count) || count < 1) return;
        await financeApi.createPayableRecurrences(item.id, { count, first_due_date: item.due_date ?? todayIso() });
      }
      setSuccess(true);
      await reload();
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'Falha ao executar operação.');
    }
  }

  return (
    <section className="page finance-page finance-ops-page">
      <div style={pageStyle}>
        <PageHeader action={<FinancePeriodFilter value={period} onChange={setPeriod} scopeLabel="Filtro local da rotina" />} />

        <div style={gridStyle}>
          <div>
            <Card>
              <SectionTitle>Nova conta a pagar</SectionTitle>
              {success ? <div style={successBannerStyle}>✓ Conta registrada com sucesso!</div> : null}
              {error ? <div style={errorBannerStyle}>{error}</div> : null}
              <form onSubmit={handleSubmit} aria-busy={loading}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Descrição</span>
                  <input
                    type="text"
                    placeholder="Ex: Cachê orquestral"
                    style={controlStyle}
                    value={form.desc}
                    onChange={(event) => setForm((current) => ({ ...current, desc: event.target.value }))}
                    disabled={!canWrite || submitting}
                  />
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Fornecedor</span>
                  <FinanceEntityCombobox
                    ariaLabel="Fornecedor"
                    placeholder="Buscar cadastro ou digitar fornecedor"
                    entities={entities}
                    value={form.financial_entity_id}
                    inputValue={form.entity}
                    onSelect={handleSelectEntity}
                    onInputChange={(value) => {
                      setSmartHint('');
                      setForm((current) => ({ ...current, entity: value, financial_entity_id: '' }));
                    }}
                    disabled={!canWrite || submitting}
                  />
                </label>
                {smartHint ? (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '7px 10px', fontSize: 11, color: '#1d4ed8', marginBottom: 11 }}>
                    {smartHint}
                  </div>
                ) : null}
                {shouldOfferEntityCreation ? (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 7, padding: '7px 10px', fontSize: 11, color: '#9a3412', marginBottom: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Esta entidade não existe no cadastro.</div>
                    <div style={{ marginBottom: 8 }}>O lançamento pode seguir solto ou você pode cadastrar e já usar o vínculo inteligente.</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleCreateAndUseEntity}
                        disabled={!canWrite || submitting || creatingEntity}
                        style={{ height: 26, border: 'none', borderRadius: 7, background: '#ea580c', color: 'white', padding: '0 10px', fontSize: 11, fontWeight: 700, cursor: creatingEntity ? 'default' : 'pointer', fontFamily: 'inherit' }}
                      >
                        {creatingEntity ? 'Cadastrando...' : 'Cadastrar e usar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSmartHint('Fornecedor será usado só neste lançamento.')}
                        disabled={submitting || creatingEntity}
                        style={{ height: 26, border: '1px solid #fed7aa', borderRadius: 7, background: 'white', color: '#9a3412', padding: '0 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Usar só neste lançamento
                      </button>
                    </div>
                  </div>
                ) : null}
                <div style={twoColStyle}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Categoria</span>
                    <select
                      style={{ ...controlStyle, cursor: 'pointer' }}
                      value={form.financial_category_id}
                      onChange={(event) => setForm((current) => ({ ...current, financial_category_id: event.target.value }))}
                      disabled={!canWrite || submitting}
                    >
                      <option value="">Sem categoria</option>
                      {(catalog?.categories ?? []).map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Centro de custo</span>
                    <select
                      style={{ ...controlStyle, cursor: 'pointer' }}
                      value={form.financial_cost_center_id}
                      onChange={(event) => setForm((current) => ({ ...current, financial_cost_center_id: event.target.value }))}
                      disabled={!canWrite || submitting}
                    >
                      <option value="">Sem centro</option>
                      {(catalog?.cost_centers ?? []).map((costCenter) => (
                        <option key={costCenter.id} value={costCenter.id}>{costCenter.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Conta</span>
                    <select
                      style={{ ...controlStyle, cursor: 'pointer' }}
                      value={form.financial_account_id}
                      onChange={(event) => setForm((current) => ({ ...current, financial_account_id: event.target.value }))}
                      disabled={!canWrite || submitting}
                    >
                      <option value="">Sem conta</option>
                      {(catalog?.accounts ?? []).map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Forma</span>
                    <select
                      style={{ ...controlStyle, cursor: 'pointer' }}
                      value={form.financial_payment_method_id}
                      onChange={(event) => setForm((current) => ({ ...current, financial_payment_method_id: event.target.value }))}
                      disabled={!canWrite || submitting}
                    >
                      <option value="">Sem forma</option>
                      {(catalog?.payment_methods ?? []).map((paymentMethod) => (
                        <option key={paymentMethod.id} value={paymentMethod.id}>{paymentMethod.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Valor (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    style={controlStyle}
                    value={form.value}
                    onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                    disabled={!canWrite || submitting}
                  />
                </label>
                <div style={twoColStyle}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Vencimento</span>
                    <input
                      type="date"
                      style={controlStyle}
                      value={form.due}
                      onChange={(event) => setForm((current) => ({ ...current, due: event.target.value }))}
                      disabled={!canWrite || submitting}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Status</span>
                    <select
                      style={{ ...controlStyle, cursor: 'pointer' }}
                      value={form.status}
                      onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PayableForm['status'] }))}
                      disabled={!canWrite || submitting}
                    >
                      <option value="pendente">Pendente</option>
                      <option value="pago">Pago</option>
                      <option value="atrasado">Atrasado</option>
                    </select>
                  </label>
                </div>
                <div style={fieldStyle}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Observação</span>
                  <textarea
                    style={{ ...controlStyle, resize: 'vertical', minHeight: 56 }}
                    placeholder="Observações opcionais..."
                    value={form.obs}
                    onChange={(event) => setForm((current) => ({ ...current, obs: event.target.value }))}
                    disabled={!canWrite || submitting}
                  />
                  </label>
                </div>
                <div style={actionRowStyle}>
                  <button type="submit" style={primaryButtonStyle} disabled={!canWrite || submitting}>
                    Registrar conta a pagar
                  </button>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => {
                      setForm(initialForm);
                      setSuccess(false);
                      setError('');
                      setSmartHint('');
                    }}
                    disabled={submitting}
                  >
                    Limpar
                  </button>
                </div>
              </form>
            </Card>

            <Card>
              <SectionTitle>Pulso operacional</SectionTitle>
              <p style={pulseCopyStyle}>{pulse}</p>
              <div style={pulseGridStyle}>
                <PulseChip label="Atrasados" count={overdueFiltered.length} tone="danger" />
                <PulseChip label="Vence hoje" count={today.length} tone="warning" />
                <PulseChip label="Próximos" count={upcoming.length} tone="neutral" />
                <PulseChip label="Pagos" count={paid.length} tone="success" />
              </div>
              <Divider />
              <div style={totalRowStyle}>
                <span style={{ fontSize: 11, color: '#64748b' }}>Carteira em aberto</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#0f172a' }}>
                  <FinanceMono>{formatCurrency(openTotal)}</FinanceMono>
                </span>
              </div>
              <div style={totalRowStyle}>
                <span style={{ fontSize: 11, color: '#64748b' }}>Atrasado</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#ef4444' }}>
                  <FinanceMono>{formatCurrency(overdueTotal)}</FinanceMono>
                </span>
              </div>
              <div style={{ ...totalRowStyle, borderBottom: 'none' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>Vence hoje</span>
                <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#ea580c' }}>
                  <FinanceMono>{formatCurrency(todayTotal)}</FinanceMono>
                </span>
              </div>
            </Card>
          </div>

          <div>
            <PayablesListGroup title="Atrasados" items={overdueFiltered} emptyText="Nenhuma obrigação em atraso." accentColor="#ef4444" canWrite={canWrite} onOperation={handleOperation} />
            <PayablesListGroup title="Vencendo hoje" items={today} emptyText="Nenhum vencimento hoje." accentColor="#ea580c" canWrite={canWrite} onOperation={handleOperation} />
            <PayablesListGroup title="Próximos vencimentos" items={upcoming} emptyText="Nenhuma obrigação próxima." accentColor="#2563eb" canWrite={canWrite} onOperation={handleOperation} />
            <PayablesListGroup title="Liquidados" items={paid} emptyText="Nenhuma baixa registrada." accentColor="#059669" canWrite={canWrite} onOperation={handleOperation} />
          </div>
        </div>
      </div>
    </section>
  );
}
