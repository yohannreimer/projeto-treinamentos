import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  financeApi,
  type CreateFinanceFavoriteCombinationPayload,
  type FinanceAccount,
  type FinanceAccountKind,
  type FinanceCatalogSnapshot,
  type FinanceCategory,
  type FinanceCategoryKind,
  type FinanceCostCenter,
  type FinanceEntity,
  type FinanceEntityDefaultContext,
  type FinanceEntityDuplicateGroup,
  type FinanceEntityKind,
  type FinanceEntityTag,
  type FinanceFavoriteCombination,
  type FinanceFavoriteCombinationContext,
  type FinancePaymentMethod,
  type FinancePaymentMethodKind,
  type FinanceRecurringRule
} from '../api';
import { FinanceErrorState, FinancePageHeader } from '../components/FinancePrimitives';
import { formatDate } from '../utils/financeFormatters';

type EntityFilter = 'todos' | 'clientes' | 'fornecedores';
type CadastroArea = 'entidades' | 'contas' | 'categorias' | 'centros' | 'formas' | 'combinacoes' | 'recorrencias' | 'duplicidades';
type ManageableCadastroArea = Exclude<CadastroArea, 'duplicidades'>;

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 7,
  fontSize: 12,
  color: '#0f172a',
  background: 'white',
  fontFamily: 'inherit',
  outline: 'none'
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: 4
};

function entityKindLabel(kind: FinanceEntityKind) {
  if (kind === 'customer') return 'Cliente';
  if (kind === 'supplier') return 'Fornecedor';
  return 'Ambos';
}

function contextLabel(context: FinanceFavoriteCombinationContext | FinanceEntityDefaultContext) {
  if (context === 'payable') return 'Conta a pagar';
  if (context === 'receivable') return 'Conta a receber';
  if (context === 'transaction') return 'Movimentação';
  return 'Qualquer';
}

function Card({
  children,
  style,
  padding = 20
}: {
  children: ReactNode;
  style?: CSSProperties;
  padding?: number;
}) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding, ...style }}>
      {children}
    </div>
  );
}

function Badge({
  children,
  color = '#64748b',
  bg = '#f1f5f9'
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: bg, color, lineHeight: 1.7, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  tone = 'neutral',
  type = 'button',
  disabled = false
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'neutral' | 'primary' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const primary = tone === 'primary';
  const danger = tone === 'danger';
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '7px 10px',
        background: primary ? '#ea580c' : danger ? '#fff1f2' : 'white',
        color: primary ? 'white' : danger ? '#be123c' : '#475569',
        border: primary ? '1px solid #ea580c' : danger ? '1px solid #fecdd3' : '1px solid #e2e8f0',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 650,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        fontFamily: 'inherit'
      }}
    >
      {children}
    </button>
  );
}

function CatalogTable({
  headers,
  children
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {headers.map((header) => (
              <th key={header} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function rowStyle(): CSSProperties {
  return { borderBottom: '1px solid #f1f5f9' };
}

export function FinanceCadastrosPage() {
  const [area, setArea] = useState<CadastroArea>('entidades');
  const [tab, setTab] = useState<EntityFilter>('todos');
  const [entities, setEntities] = useState<FinanceEntity[]>([]);
  const [catalog, setCatalog] = useState<FinanceCatalogSnapshot | null>(null);
  const [entityTags, setEntityTags] = useState<FinanceEntityTag[]>([]);
  const [favoriteCombinations, setFavoriteCombinations] = useState<FinanceFavoriteCombination[]>([]);
  const [recurringRules, setRecurringRules] = useState<FinanceRecurringRule[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<FinanceEntityDuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [form, setForm] = useState({
    legalName: '',
    tradeName: '',
    documentNumber: '',
    kind: 'customer' as FinanceEntityKind,
    email: '',
    phone: '',
    isActive: true
  });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [profileContext, setProfileContext] = useState<FinanceEntityDefaultContext>('payable');
  const [profileDefaults, setProfileDefaults] = useState({
    financial_category_id: '',
    financial_cost_center_id: '',
    financial_account_id: '',
    financial_payment_method_id: ''
  });

  const [accountForm, setAccountForm] = useState({
    id: '',
    name: '',
    kind: 'bank' as FinanceAccountKind,
    currency: 'BRL',
    account_number: '',
    branch_number: '',
    is_active: true
  });
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    name: '',
    kind: 'expense' as FinanceCategoryKind,
    parent_category_id: '',
    is_active: true
  });
  const [costCenterForm, setCostCenterForm] = useState({
    id: '',
    name: '',
    code: '',
    is_active: true
  });
  const [paymentForm, setPaymentForm] = useState({
    id: '',
    name: '',
    kind: 'pix' as FinancePaymentMethodKind,
    is_active: true
  });
  const [combinationForm, setCombinationForm] = useState({
    id: '',
    name: '',
    context: 'any' as FinanceFavoriteCombinationContext,
    financial_category_id: '',
    financial_cost_center_id: '',
    financial_account_id: '',
    financial_payment_method_id: '',
    is_active: true
  });

  const typeBadge = {
    customer: { color: '#2563eb', bg: '#dbeafe' },
    supplier: { color: '#7c3aed', bg: '#ede9fe' },
    both: { color: '#059669', bg: '#d1fae5' }
  } as const;

  async function loadCadastros() {
    setLoading(true);
    setError('');
    const [entityResult, catalogResult, tagResult, favoriteResult, recurringResult, duplicateResult] = await Promise.allSettled([
      financeApi.listEntities(),
      financeApi.getCatalogSnapshot(),
      financeApi.listEntityTags(),
      financeApi.listFavoriteCombinations(),
      financeApi.listRecurringRules(),
      financeApi.listEntityDuplicates()
    ]);

    if (entityResult.status === 'fulfilled') {
      setEntities(entityResult.value);
    } else {
      setError(entityResult.reason instanceof Error ? entityResult.reason.message : 'Falha ao carregar as entidades.');
    }
    if (catalogResult.status === 'fulfilled') {
      setCatalog(catalogResult.value);
    } else {
      setError(catalogResult.reason instanceof Error ? catalogResult.reason.message : 'Falha ao carregar o catálogo financeiro.');
    }
    if (tagResult.status === 'fulfilled') {
      setEntityTags(tagResult.value);
    }
    if (favoriteResult.status === 'fulfilled') {
      setFavoriteCombinations(favoriteResult.value);
    }
    if (recurringResult.status === 'fulfilled') {
      setRecurringRules(recurringResult.value.rules);
    }
    if (duplicateResult.status === 'fulfilled') {
      setDuplicateGroups(duplicateResult.value);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadCadastros();
  }, []);

  useEffect(() => {
    if (!editingEntityId) return;
    let cancelled = false;
    financeApi.getEntityDefaultProfile(editingEntityId, profileContext)
      .then((profile) => {
        if (cancelled) return;
        setProfileDefaults({
          financial_category_id: profile?.financial_category_id ?? '',
          financial_cost_center_id: profile?.financial_cost_center_id ?? '',
          financial_account_id: profile?.financial_account_id ?? '',
          financial_payment_method_id: profile?.financial_payment_method_id ?? ''
        });
      })
      .catch(() => {
        if (!cancelled) {
          setProfileDefaults({
            financial_category_id: '',
            financial_cost_center_id: '',
            financial_account_id: '',
            financial_payment_method_id: ''
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editingEntityId, profileContext]);

  const filteredEntities = useMemo(() => {
    if (tab === 'todos') return entities;
    if (tab === 'clientes') return entities.filter((entity) => entity.kind === 'customer' || entity.kind === 'both');
    return entities.filter((entity) => entity.kind === 'supplier' || entity.kind === 'both');
  }, [entities, tab]);

  const catalogCounts = {
    contas: catalog?.accounts.length ?? 0,
    categorias: catalog?.categories.length ?? 0,
    centros: catalog?.cost_centers.length ?? 0,
    formas: catalog?.payment_methods.length ?? 0,
    combinacoes: favoriteCombinations.length,
    recorrencias: recurringRules.length,
    duplicidades: duplicateGroups.length
  };

  const sections = [
    { id: 'entidades' as const, label: 'Entidades', count: entities.length },
    { id: 'contas' as const, label: 'Contas', count: catalogCounts.contas },
    { id: 'categorias' as const, label: 'Categorias', count: catalogCounts.categorias },
    { id: 'centros' as const, label: 'Centros', count: catalogCounts.centros },
    { id: 'formas' as const, label: 'Formas', count: catalogCounts.formas },
    { id: 'combinacoes' as const, label: 'Combinações', count: catalogCounts.combinacoes },
    { id: 'recorrencias' as const, label: 'Recorrências', count: catalogCounts.recorrencias },
    { id: 'duplicidades' as const, label: 'Duplicidades', count: catalogCounts.duplicidades }
  ];

  const profileHasDefaults = Object.values(profileDefaults).some(Boolean);

  function resetEntityForm() {
    setEditingEntityId(null);
    setForm({
      legalName: '',
      tradeName: '',
      documentNumber: '',
      kind: 'customer',
      email: '',
      phone: '',
      isActive: true
    });
    setSelectedTagIds([]);
    setProfileContext('payable');
    setProfileDefaults({
      financial_category_id: '',
      financial_cost_center_id: '',
      financial_account_id: '',
      financial_payment_method_id: ''
    });
  }

  function editEntity(entity: FinanceEntity) {
    setArea('entidades');
    setEditingEntityId(entity.id);
    setForm({
      legalName: entity.legal_name,
      tradeName: entity.trade_name ?? '',
      documentNumber: entity.document_number ?? '',
      kind: entity.kind,
      email: entity.email ?? '',
      phone: entity.phone ?? '',
      isActive: entity.is_active
    });
    setSelectedTagIds((entity.tags ?? []).map((tag) => tag.id));
    setSuccessMessage('');
  }

  async function handleSaveEntity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const payload = {
        legal_name: form.legalName.trim(),
        trade_name: form.tradeName.trim() || null,
        document_number: form.documentNumber.trim() || null,
        kind: form.kind,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        is_active: form.isActive
      };
      const saved = editingEntityId
        ? await financeApi.updateEntity(editingEntityId, payload)
        : await financeApi.createEntity(payload);
      const taggedEntity = await financeApi.setEntityTags(saved.id, selectedTagIds);

      if (profileHasDefaults) {
        await financeApi.upsertEntityDefaultProfile(saved.id, profileContext, {
          financial_category_id: profileDefaults.financial_category_id || null,
          financial_cost_center_id: profileDefaults.financial_cost_center_id || null,
          financial_account_id: profileDefaults.financial_account_id || null,
          financial_payment_method_id: profileDefaults.financial_payment_method_id || null,
          is_active: true
        });
      }

      setEntities((current) => {
        const withoutSaved = current.filter((entity) => entity.id !== taggedEntity.id);
        return [taggedEntity, ...withoutSaved];
      });
      setDuplicateGroups(await financeApi.listEntityDuplicates());
      resetEntityForm();
      setSuccessMessage(editingEntityId ? 'Entidade atualizada.' : '✓ Entidade cadastrada com sucesso!');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao salvar a entidade.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEntityTag() {
    const name = newTagName.trim();
    if (!name) return;
    setCreatingTag(true);
    setError('');
    setSuccessMessage('');

    try {
      const createdTag = await financeApi.createEntityTag({ name, is_active: true });
      setEntityTags((current) => {
        const withoutTag = current.filter((tag) => tag.id !== createdTag.id);
        return [...withoutTag, createdTag].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
      });
      setSelectedTagIds((current) => current.includes(createdTag.id) ? current : [...current, createdTag.id]);
      setNewTagName('');
      setSuccessMessage(`Classificação "${createdTag.name}" adicionada.`);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao criar classificação.');
    } finally {
      setCreatingTag(false);
    }
  }

  async function refreshCatalog() {
    setCatalog(await financeApi.getCatalogSnapshot());
  }

  async function handleSaveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (accountForm.id) {
        await financeApi.updateAccount(accountForm.id, {
          name: accountForm.name.trim(),
          kind: accountForm.kind,
          currency: accountForm.currency.trim() || 'BRL',
          account_number: accountForm.account_number.trim() || null,
          branch_number: accountForm.branch_number.trim() || null,
          is_active: accountForm.is_active
        });
      } else {
        await financeApi.createAccount({
          name: accountForm.name.trim(),
          kind: accountForm.kind,
          currency: accountForm.currency.trim() || 'BRL',
          account_number: accountForm.account_number.trim() || null,
          branch_number: accountForm.branch_number.trim() || null,
          is_active: accountForm.is_active
        });
      }
      setAccountForm({ id: '', name: '', kind: 'bank', currency: 'BRL', account_number: '', branch_number: '', is_active: true });
      await refreshCatalog();
      setSuccessMessage('Conta financeira salva.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao salvar conta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: categoryForm.name.trim(),
        kind: categoryForm.kind,
        parent_category_id: categoryForm.parent_category_id || null,
        is_active: categoryForm.is_active
      };
      if (categoryForm.id) {
        await financeApi.updateCategory(categoryForm.id, payload);
      } else {
        await financeApi.createCategory(payload);
      }
      setCategoryForm({ id: '', name: '', kind: 'expense', parent_category_id: '', is_active: true });
      await refreshCatalog();
      setSuccessMessage('Categoria salva.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao salvar categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCostCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { name: costCenterForm.name.trim(), code: costCenterForm.code.trim() || null, is_active: costCenterForm.is_active };
      if (costCenterForm.id) {
        await financeApi.updateCostCenter(costCenterForm.id, payload);
      } else {
        await financeApi.createCostCenter(payload);
      }
      setCostCenterForm({ id: '', name: '', code: '', is_active: true });
      await refreshCatalog();
      setSuccessMessage('Centro de custo salvo.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao salvar centro de custo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePaymentMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { name: paymentForm.name.trim(), kind: paymentForm.kind, is_active: paymentForm.is_active };
      if (paymentForm.id) {
        await financeApi.updatePaymentMethod(paymentForm.id, payload);
      } else {
        await financeApi.createPaymentMethod(payload);
      }
      setPaymentForm({ id: '', name: '', kind: 'pix', is_active: true });
      await refreshCatalog();
      setSuccessMessage('Forma de pagamento salva.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao salvar forma de pagamento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCombination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload: CreateFinanceFavoriteCombinationPayload = {
        name: combinationForm.name.trim(),
        context: combinationForm.context,
        financial_category_id: combinationForm.financial_category_id || null,
        financial_cost_center_id: combinationForm.financial_cost_center_id || null,
        financial_account_id: combinationForm.financial_account_id || null,
        financial_payment_method_id: combinationForm.financial_payment_method_id || null,
        is_active: combinationForm.is_active
      };
      const saved = combinationForm.id
        ? await financeApi.updateFavoriteCombination(combinationForm.id, payload)
        : await financeApi.createFavoriteCombination(payload);
      setFavoriteCombinations((current) => {
        const withoutSaved = current.filter((item) => item.id !== saved.id);
        return [saved, ...withoutSaved].sort((left, right) => Number(right.is_active) - Number(left.is_active) || left.name.localeCompare(right.name));
      });
      setCombinationForm({
        id: '',
        name: '',
        context: 'any',
        financial_category_id: '',
        financial_cost_center_id: '',
        financial_account_id: '',
        financial_payment_method_id: '',
        is_active: true
      });
      setSuccessMessage('Combinação favorita salva.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao salvar combinação.');
    } finally {
      setSaving(false);
    }
  }

  async function setCadastroActive(kind: ManageableCadastroArea, id: string, isActive: boolean) {
    setSaving(true);
    setError('');
    try {
      if (kind === 'entidades') {
        const updated = isActive
          ? await financeApi.updateEntity(id, { is_active: true })
          : await financeApi.deleteEntity(id);
        setEntities((current) => current.map((entity) => (entity.id === id ? updated : entity)));
      }
      if (kind === 'contas') {
        if (isActive) await financeApi.updateAccount(id, { is_active: true });
        else await financeApi.deleteAccount(id);
        await refreshCatalog();
      }
      if (kind === 'categorias') {
        if (isActive) await financeApi.updateCategory(id, { is_active: true });
        else await financeApi.deleteCategory(id);
        await refreshCatalog();
      }
      if (kind === 'centros') {
        if (isActive) await financeApi.updateCostCenter(id, { is_active: true });
        else await financeApi.deleteCostCenter(id);
        await refreshCatalog();
      }
      if (kind === 'formas') {
        if (isActive) await financeApi.updatePaymentMethod(id, { is_active: true });
        else await financeApi.deletePaymentMethod(id);
        await refreshCatalog();
      }
      if (kind === 'combinacoes') {
        const updated = isActive
          ? await financeApi.updateFavoriteCombination(id, { is_active: true })
          : await financeApi.deleteFavoriteCombination(id);
        setFavoriteCombinations((current) => current.map((item) => (item.id === id ? updated : item)));
      }
      setSuccessMessage(isActive ? 'Cadastro reativado.' : 'Cadastro inativado.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao atualizar cadastro.');
    } finally {
      setSaving(false);
    }
  }

  async function hardDelete(kind: ManageableCadastroArea, id: string) {
    const labels: Record<ManageableCadastroArea, string> = {
      entidades: 'entidade',
      contas: 'conta',
      categorias: 'categoria',
      centros: 'centro de custo',
      formas: 'forma de pagamento',
      combinacoes: 'combinação',
      recorrencias: 'recorrência'
    };
    const confirmed = window.confirm(`Excluir ${labels[kind]} de forma definitiva? Essa ação não volta. Se houver lançamentos usando este cadastro, o sistema vai bloquear a exclusão.`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    try {
      if (kind === 'entidades') {
        await financeApi.hardDeleteEntity(id);
        setEntities((current) => current.filter((entity) => entity.id !== id));
      }
      if (kind === 'contas') {
        await financeApi.hardDeleteAccount(id);
        await refreshCatalog();
      }
      if (kind === 'categorias') {
        await financeApi.hardDeleteCategory(id);
        await refreshCatalog();
      }
      if (kind === 'centros') {
        await financeApi.hardDeleteCostCenter(id);
        await refreshCatalog();
      }
      if (kind === 'formas') {
        await financeApi.hardDeletePaymentMethod(id);
        await refreshCatalog();
      }
      if (kind === 'combinacoes') {
        await financeApi.hardDeleteFavoriteCombination(id);
        setFavoriteCombinations((current) => current.filter((item) => item.id !== id));
      }
      if (kind === 'recorrencias') {
        await financeApi.deleteRecurringRule(id);
        setRecurringRules((current) => current.filter((item) => item.id !== id));
      }
      setSuccessMessage('Cadastro excluído definitivamente.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao excluir cadastro.');
    } finally {
      setSaving(false);
    }
  }

  async function updateRecurringRuleStatus(rule: FinanceRecurringRule, status: FinanceRecurringRule['status']) {
    setSaving(true);
    setError('');
    try {
      const updated = await financeApi.updateRecurringRule(rule.id, {
        status,
        end_date: status === 'ended' ? rule.last_materialized_until ?? rule.next_due_date ?? null : rule.end_date
      });
      setRecurringRules((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSuccessMessage(status === 'active' ? 'Recorrência reativada.' : status === 'paused' ? 'Recorrência pausada.' : 'Recorrência encerrada.');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao atualizar recorrência.');
    } finally {
      setSaving(false);
    }
  }

  if (error && loading) {
    return (
      <section className="page finance-page">
        <FinancePageHeader
          eyebrow="Cadastros"
          title="Cadastros híbridos"
          description="Base única de clientes, fornecedores, contas, categorias, centros de custo e formas de pagamento."
        />
        <FinanceErrorState title="Falha ao carregar cadastros." description={error} />
      </section>
    );
  }

  return (
    <section className="page finance-page">
      <FinancePageHeader
        eyebrow="Cadastros"
        title="Cadastros híbridos"
        description="Base única de clientes, fornecedores, contas, categorias, centros de custo e formas de pagamento."
      />

      <Card padding={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 4, padding: '0 14px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }} role="tablist" aria-label="Seções de cadastro financeiro">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setArea(item.id);
                setError('');
                setSuccessMessage('');
              }}
              role="tab"
              aria-selected={area === item.id}
              style={{
                padding: '11px 10px',
                fontSize: 12,
                fontWeight: area === item.id ? 750 : 500,
                color: area === item.id ? '#1d4ed8' : '#64748b',
                background: 'none',
                border: 'none',
                borderBottom: area === item.id ? '2px solid #2563eb' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap'
              }}
            >
              {item.label}
              <Badge color={area === item.id ? '#1d4ed8' : '#94a3b8'} bg={area === item.id ? '#dbeafe' : '#f1f5f9'}>
                {item.count}
              </Badge>
            </button>
          ))}
        </div>
      </Card>

      {successMessage ? (
        <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065f46', marginBottom: 12 }}>
          {successMessage}
        </div>
      ) : null}
      {error ? (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#9f1239', marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: area === 'duplicidades' || area === 'recorrencias' ? '1fr' : 'minmax(300px, 360px) minmax(0, 1fr)', gap: 20 }}>
        {area !== 'duplicidades' && area !== 'recorrencias' ? (
          <div>
            {area === 'entidades' ? (
              <Card>
                <SectionTitle>{editingEntityId ? 'Editar entidade' : 'Nova entidade financeira'}</SectionTitle>
                <form onSubmit={handleSaveEntity} style={{ display: 'grid' }} aria-label="Cadastro de entidade financeira">
                  <Field label="Razão social">
                    <input aria-label="Razão social" style={inputStyle} value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} required />
                  </Field>
                  <Field label="Nome fantasia">
                    <input aria-label="Nome fantasia" style={inputStyle} value={form.tradeName} onChange={(event) => setForm((current) => ({ ...current, tradeName: event.target.value }))} />
                  </Field>
                  <Field label="CNPJ / CPF">
                    <input aria-label="CNPJ / CPF" style={inputStyle} value={form.documentNumber} onChange={(event) => setForm((current) => ({ ...current, documentNumber: event.target.value }))} />
                  </Field>
                  <Field label="Tipo">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { value: 'customer' as const, label: 'Cliente' },
                        { value: 'supplier' as const, label: 'Fornecedor' },
                        { value: 'both' as const, label: 'Ambos' }
                      ].map((option) => {
                        const active = form.kind === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setForm((current) => ({ ...current, kind: option.value }))}
                            style={{
                              flex: 1,
                              padding: '6px 0',
                              borderRadius: 6,
                              border: '1px solid',
                              fontSize: 11,
                              fontWeight: 650,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              borderColor: active ? '#2563eb' : '#e2e8f0',
                              background: active ? '#eff6ff' : 'white',
                              color: active ? '#1d4ed8' : '#64748b'
                            }}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 750, color: '#0f172a' }}>Defaults inteligentes</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Preenche categoria, centro, conta e forma quando esta entidade for usada.</div>
                      </div>
                      <Badge color="#1d4ed8" bg="#dbeafe">Automático</Badge>
                    </div>

                    <Field label="Classificações">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {entityTags.slice(0, 12).map((tag) => {
                          const active = selectedTagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => setSelectedTagIds((current) => (
                                active ? current.filter((id) => id !== tag.id) : [...current, tag.id]
                              ))}
                              aria-pressed={active}
                              style={{
                                border: '1px solid',
                                borderColor: active ? '#2563eb' : '#cbd5e1',
                                background: active ? '#dbeafe' : 'white',
                                color: active ? '#1d4ed8' : '#475569',
                                borderRadius: 999,
                                padding: '4px 9px',
                                fontSize: 11,
                                fontWeight: 650,
                                cursor: 'pointer',
                                fontFamily: 'inherit'
                              }}
                            >
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 6, marginTop: 8 }}>
                        <input
                          aria-label="Nova classificação"
                          value={newTagName}
                          onChange={(event) => setNewTagName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void handleCreateEntityTag();
                            }
                          }}
                          placeholder="Adicionar classificação"
                          style={{ ...inputStyle, height: 30, fontSize: 11 }}
                        />
                        <ActionButton onClick={handleCreateEntityTag} disabled={creatingTag || !newTagName.trim()}>
                          {creatingTag ? 'Adicionando...' : '+ Adicionar'}
                        </ActionButton>
                      </div>
                    </Field>

                    <Field label="Usar estes defaults em">
                      <select aria-label="Defaults por contexto" style={inputStyle} value={profileContext} onChange={(event) => setProfileContext(event.target.value as FinanceEntityDefaultContext)}>
                        <option value="payable">Conta a pagar</option>
                        <option value="receivable">Conta a receber</option>
                        <option value="transaction">Movimentação</option>
                      </select>
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <select aria-label="Categoria padrão" style={inputStyle} value={profileDefaults.financial_category_id} onChange={(event) => setProfileDefaults((current) => ({ ...current, financial_category_id: event.target.value }))}>
                        <option value="">Categoria</option>
                        {(catalog?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <select aria-label="Centro de custo padrão" style={inputStyle} value={profileDefaults.financial_cost_center_id} onChange={(event) => setProfileDefaults((current) => ({ ...current, financial_cost_center_id: event.target.value }))}>
                        <option value="">Centro</option>
                        {(catalog?.cost_centers ?? []).map((costCenter) => <option key={costCenter.id} value={costCenter.id}>{costCenter.name}</option>)}
                      </select>
                      <select aria-label="Conta padrão" style={inputStyle} value={profileDefaults.financial_account_id} onChange={(event) => setProfileDefaults((current) => ({ ...current, financial_account_id: event.target.value }))}>
                        <option value="">Conta</option>
                        {(catalog?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                      </select>
                      <select aria-label="Forma de pagamento padrão" style={inputStyle} value={profileDefaults.financial_payment_method_id} onChange={(event) => setProfileDefaults((current) => ({ ...current, financial_payment_method_id: event.target.value }))}>
                        <option value="">Forma</option>
                        {(catalog?.payment_methods ?? []).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="E-mail">
                      <input aria-label="E-mail" type="email" style={inputStyle} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                    </Field>
                    <Field label="Telefone">
                      <input aria-label="Telefone" style={inputStyle} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                    </Field>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: '#475569' }}>
                    <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
                    Entidade ativa
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <ActionButton type="submit" tone="primary" disabled={saving}>{saving ? 'Salvando...' : editingEntityId ? 'Salvar entidade' : 'Cadastrar entidade'}</ActionButton>
                    <ActionButton onClick={resetEntityForm}>Limpar</ActionButton>
                  </div>
                </form>
              </Card>
            ) : null}

            {area === 'contas' ? (
              <Card>
                <SectionTitle>{accountForm.id ? 'Editar conta' : 'Nova conta financeira'}</SectionTitle>
                <form onSubmit={handleSaveAccount}>
                  <Field label="Nome"><input aria-label="Nome da conta" style={inputStyle} value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Tipo"><select aria-label="Tipo da conta" style={inputStyle} value={accountForm.kind} onChange={(event) => setAccountForm((current) => ({ ...current, kind: event.target.value as FinanceAccountKind }))}><option value="bank">Banco</option><option value="cash">Caixa</option><option value="wallet">Carteira</option><option value="other">Outro</option></select></Field>
                    <Field label="Moeda"><input aria-label="Moeda da conta" style={inputStyle} value={accountForm.currency} onChange={(event) => setAccountForm((current) => ({ ...current, currency: event.target.value }))} /></Field>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Agência"><input aria-label="Agência da conta" style={inputStyle} value={accountForm.branch_number} onChange={(event) => setAccountForm((current) => ({ ...current, branch_number: event.target.value }))} /></Field>
                    <Field label="Conta"><input aria-label="Número da conta" style={inputStyle} value={accountForm.account_number} onChange={(event) => setAccountForm((current) => ({ ...current, account_number: event.target.value }))} /></Field>
                  </div>
                  <ActiveToggle checked={accountForm.is_active} onChange={(value) => setAccountForm((current) => ({ ...current, is_active: value }))} />
                  <FormActions saving={saving} editing={Boolean(accountForm.id)} onClear={() => setAccountForm({ id: '', name: '', kind: 'bank', currency: 'BRL', account_number: '', branch_number: '', is_active: true })} />
                </form>
              </Card>
            ) : null}

            {area === 'categorias' ? (
              <Card>
                <SectionTitle>{categoryForm.id ? 'Editar categoria' : 'Nova categoria'}</SectionTitle>
                <form onSubmit={handleSaveCategory}>
                  <Field label="Nome"><input aria-label="Nome da categoria" style={inputStyle} value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                  <Field label="Tipo"><select aria-label="Tipo da categoria" style={inputStyle} value={categoryForm.kind} onChange={(event) => setCategoryForm((current) => ({ ...current, kind: event.target.value as FinanceCategoryKind }))}><option value="income">Receita</option><option value="expense">Despesa</option><option value="neutral">Neutra</option></select></Field>
                  <Field label="Categoria pai"><select aria-label="Categoria pai" style={inputStyle} value={categoryForm.parent_category_id} onChange={(event) => setCategoryForm((current) => ({ ...current, parent_category_id: event.target.value }))}><option value="">Sem pai</option>{(catalog?.categories ?? []).filter((category) => category.id !== categoryForm.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                  <ActiveToggle checked={categoryForm.is_active} onChange={(value) => setCategoryForm((current) => ({ ...current, is_active: value }))} />
                  <FormActions saving={saving} editing={Boolean(categoryForm.id)} onClear={() => setCategoryForm({ id: '', name: '', kind: 'expense', parent_category_id: '', is_active: true })} />
                </form>
              </Card>
            ) : null}

            {area === 'centros' ? (
              <Card>
                <SectionTitle>{costCenterForm.id ? 'Editar centro' : 'Novo centro de custo'}</SectionTitle>
                <form onSubmit={handleSaveCostCenter}>
                  <Field label="Nome"><input aria-label="Nome do centro" style={inputStyle} value={costCenterForm.name} onChange={(event) => setCostCenterForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                  <Field label="Código"><input aria-label="Código do centro" style={inputStyle} value={costCenterForm.code} onChange={(event) => setCostCenterForm((current) => ({ ...current, code: event.target.value }))} /></Field>
                  <ActiveToggle checked={costCenterForm.is_active} onChange={(value) => setCostCenterForm((current) => ({ ...current, is_active: value }))} />
                  <FormActions saving={saving} editing={Boolean(costCenterForm.id)} onClear={() => setCostCenterForm({ id: '', name: '', code: '', is_active: true })} />
                </form>
              </Card>
            ) : null}

            {area === 'formas' ? (
              <Card>
                <SectionTitle>{paymentForm.id ? 'Editar forma' : 'Nova forma de pagamento'}</SectionTitle>
                <form onSubmit={handleSavePaymentMethod}>
                  <Field label="Nome"><input aria-label="Nome da forma" style={inputStyle} value={paymentForm.name} onChange={(event) => setPaymentForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                  <Field label="Tipo"><select aria-label="Tipo da forma" style={inputStyle} value={paymentForm.kind} onChange={(event) => setPaymentForm((current) => ({ ...current, kind: event.target.value as FinancePaymentMethodKind }))}><option value="pix">PIX</option><option value="boleto">Boleto</option><option value="card">Cartão</option><option value="transfer">Transferência</option><option value="cash">Dinheiro</option><option value="other">Outro</option></select></Field>
                  <ActiveToggle checked={paymentForm.is_active} onChange={(value) => setPaymentForm((current) => ({ ...current, is_active: value }))} />
                  <FormActions saving={saving} editing={Boolean(paymentForm.id)} onClear={() => setPaymentForm({ id: '', name: '', kind: 'pix', is_active: true })} />
                </form>
              </Card>
            ) : null}

            {area === 'combinacoes' ? (
              <Card>
                <SectionTitle>{combinationForm.id ? 'Editar combinação' : 'Nova combinação favorita'}</SectionTitle>
                <form onSubmit={handleSaveCombination}>
                  <Field label="Nome"><input aria-label="Nome da combinação" style={inputStyle} value={combinationForm.name} onChange={(event) => setCombinationForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
                  <Field label="Contexto"><select aria-label="Contexto da combinação" style={inputStyle} value={combinationForm.context} onChange={(event) => setCombinationForm((current) => ({ ...current, context: event.target.value as FinanceFavoriteCombinationContext }))}><option value="any">Qualquer</option><option value="payable">Conta a pagar</option><option value="receivable">Conta a receber</option><option value="transaction">Movimentação</option></select></Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select aria-label="Categoria da combinação" style={inputStyle} value={combinationForm.financial_category_id} onChange={(event) => setCombinationForm((current) => ({ ...current, financial_category_id: event.target.value }))}><option value="">Categoria</option>{(catalog?.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                    <select aria-label="Centro da combinação" style={inputStyle} value={combinationForm.financial_cost_center_id} onChange={(event) => setCombinationForm((current) => ({ ...current, financial_cost_center_id: event.target.value }))}><option value="">Centro</option>{(catalog?.cost_centers ?? []).map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}</select>
                    <select aria-label="Conta da combinação" style={inputStyle} value={combinationForm.financial_account_id} onChange={(event) => setCombinationForm((current) => ({ ...current, financial_account_id: event.target.value }))}><option value="">Conta</option>{(catalog?.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>
                    <select aria-label="Forma da combinação" style={inputStyle} value={combinationForm.financial_payment_method_id} onChange={(event) => setCombinationForm((current) => ({ ...current, financial_payment_method_id: event.target.value }))}><option value="">Forma</option>{(catalog?.payment_methods ?? []).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select>
                  </div>
                  <div style={{ height: 12 }} />
                  <ActiveToggle checked={combinationForm.is_active} onChange={(value) => setCombinationForm((current) => ({ ...current, is_active: value }))} />
                  <FormActions saving={saving} editing={Boolean(combinationForm.id)} onClear={() => setCombinationForm({ id: '', name: '', context: 'any', financial_category_id: '', financial_cost_center_id: '', financial_account_id: '', financial_payment_method_id: '', is_active: true })} />
                </form>
              </Card>
            ) : null}
          </div>
        ) : null}

        <div>
          {renderRightPanel()}
        </div>
      </div>
    </section>
  );

  function renderRightPanel() {
    if (loading) {
      return <Card><div style={{ fontSize: 12, color: '#64748b' }}>Carregando cadastros...</div></Card>;
    }

    if (area === 'entidades') {
      return (
        <Card padding={0}>
          <div style={{ padding: '16px 20px 0' }}>
            <SectionTitle>Entidades cadastradas</SectionTitle>
            <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }} role="tablist" aria-label="Filtros de entidades">
              {[
                { id: 'todos' as const, label: 'Todos', count: entities.length },
                { id: 'clientes' as const, label: 'Clientes', count: entities.filter((entity) => entity.kind === 'customer' || entity.kind === 'both').length },
                { id: 'fornecedores' as const, label: 'Fornecedores', count: entities.filter((entity) => entity.kind === 'supplier' || entity.kind === 'both').length }
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  role="tab"
                  aria-selected={tab === item.id}
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: tab === item.id ? 700 : 400,
                    color: tab === item.id ? '#1d4ed8' : '#64748b',
                    background: 'none',
                    border: 'none',
                    borderBottom: tab === item.id ? '2px solid #2563eb' : '2px solid transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    marginBottom: -1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {item.label}
                  <Badge color={tab === item.id ? '#1d4ed8' : '#94a3b8'} bg={tab === item.id ? '#dbeafe' : '#f1f5f9'}>{item.count}</Badge>
                </button>
              ))}
            </div>
          </div>
          <CatalogTable headers={['Razão Social', 'Tipo', 'Classificações', 'Documento', 'Status', 'Ações']}>
            {filteredEntities.map((entity) => (
              <tr key={entity.id} style={rowStyle()}>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>
                  {entity.legal_name}
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{entity.trade_name || 'Sem fantasia'}</div>
                </td>
                <td style={{ padding: '10px 14px' }}><Badge color={typeBadge[entity.kind].color} bg={typeBadge[entity.kind].bg}>{entityKindLabel(entity.kind)}</Badge></td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 210 }}>
                    {(entity.tags ?? []).slice(0, 3).map((tag) => <Badge key={tag.id} color="#1d4ed8" bg="#dbeafe">{tag.name}</Badge>)}
                    {(entity.tags ?? []).length === 0 ? <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span> : null}
                  </div>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#64748b' }}>{entity.document_number || '—'}</td>
                <td style={{ padding: '10px 14px' }}><Badge color={entity.is_active ? '#059669' : '#94a3b8'} bg={entity.is_active ? '#d1fae5' : '#f1f5f9'}>{entity.is_active ? 'Ativo' : 'Inativo'}</Badge></td>
                <td style={{ padding: '10px 14px' }}>
                  <InlineActions
                    onEdit={() => editEntity(entity)}
                    onToggleActive={() => void setCadastroActive('entidades', entity.id, !entity.is_active)}
                    onDelete={() => void hardDelete('entidades', entity.id)}
                    isActive={entity.is_active}
                    disabled={saving}
                  />
                </td>
              </tr>
            ))}
          </CatalogTable>
        </Card>
      );
    }

    if (area === 'contas') {
      return renderAccounts();
    }
    if (area === 'categorias') {
      return renderCategories();
    }
    if (area === 'centros') {
      return renderCostCenters();
    }
    if (area === 'formas') {
      return renderPaymentMethods();
    }
    if (area === 'combinacoes') {
      return renderCombinations();
    }
    if (area === 'recorrencias') {
      return renderRecurringRules();
    }
    return renderDuplicates();
  }

  function renderAccounts() {
    return (
      <Card padding={0}>
        <div style={{ padding: '16px 20px 0' }}><SectionTitle>Contas financeiras</SectionTitle></div>
        <CatalogTable headers={['Nome', 'Tipo', 'Moeda', 'Agência/Conta', 'Status', 'Ações']}>
          {(catalog?.accounts ?? []).map((account) => (
            <tr key={account.id} style={rowStyle()}>
              <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>{account.name}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{account.kind}</td>
              <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#64748b' }}>{account.currency}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{[account.branch_number, account.account_number].filter(Boolean).join(' / ') || '—'}</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge active={account.is_active} /></td>
              <td style={{ padding: '10px 14px' }}>
                <InlineActions
                  onEdit={() => setAccountFormFrom(account)}
                  onToggleActive={() => void setCadastroActive('contas', account.id, !account.is_active)}
                  onDelete={() => void hardDelete('contas', account.id)}
                  isActive={account.is_active}
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </CatalogTable>
      </Card>
    );
  }

  function renderCategories() {
    const categoriesById = new Map((catalog?.categories ?? []).map((category) => [category.id, category.name]));
    return (
      <Card padding={0}>
        <div style={{ padding: '16px 20px 0' }}><SectionTitle>Categorias</SectionTitle></div>
        <CatalogTable headers={['Nome', 'Tipo', 'Pai', 'Status', 'Ações']}>
          {(catalog?.categories ?? []).map((category) => (
            <tr key={category.id} style={rowStyle()}>
              <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>{category.name}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{category.kind}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{category.parent_category_id ? categoriesById.get(category.parent_category_id) ?? '—' : '—'}</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge active={category.is_active} /></td>
              <td style={{ padding: '10px 14px' }}>
                <InlineActions
                  onEdit={() => setCategoryFormFrom(category)}
                  onToggleActive={() => void setCadastroActive('categorias', category.id, !category.is_active)}
                  onDelete={() => void hardDelete('categorias', category.id)}
                  isActive={category.is_active}
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </CatalogTable>
      </Card>
    );
  }

  function renderCostCenters() {
    return (
      <Card padding={0}>
        <div style={{ padding: '16px 20px 0' }}><SectionTitle>Centros de custo</SectionTitle></div>
        <CatalogTable headers={['Nome', 'Código', 'Status', 'Ações']}>
          {(catalog?.cost_centers ?? []).map((center) => (
            <tr key={center.id} style={rowStyle()}>
              <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>{center.name}</td>
              <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#64748b' }}>{center.code || '—'}</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge active={center.is_active} /></td>
              <td style={{ padding: '10px 14px' }}>
                <InlineActions
                  onEdit={() => setCostCenterFormFrom(center)}
                  onToggleActive={() => void setCadastroActive('centros', center.id, !center.is_active)}
                  onDelete={() => void hardDelete('centros', center.id)}
                  isActive={center.is_active}
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </CatalogTable>
      </Card>
    );
  }

  function renderPaymentMethods() {
    return (
      <Card padding={0}>
        <div style={{ padding: '16px 20px 0' }}><SectionTitle>Formas de pagamento</SectionTitle></div>
        <CatalogTable headers={['Nome', 'Tipo', 'Status', 'Ações']}>
          {(catalog?.payment_methods ?? []).map((method) => (
            <tr key={method.id} style={rowStyle()}>
              <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>{method.name}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569' }}>{method.kind}</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge active={method.is_active} /></td>
              <td style={{ padding: '10px 14px' }}>
                <InlineActions
                  onEdit={() => setPaymentFormFrom(method)}
                  onToggleActive={() => void setCadastroActive('formas', method.id, !method.is_active)}
                  onDelete={() => void hardDelete('formas', method.id)}
                  isActive={method.is_active}
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </CatalogTable>
      </Card>
    );
  }

  function renderCombinations() {
    return (
      <Card padding={0}>
        <div style={{ padding: '16px 20px 0' }}><SectionTitle>Combinações favoritas</SectionTitle></div>
        <CatalogTable headers={['Nome', 'Contexto', 'Classificação', 'Conta/Forma', 'Status', 'Ações']}>
          {favoriteCombinations.map((combination) => (
            <tr key={combination.id} style={rowStyle()}>
              <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>{combination.name}</td>
              <td style={{ padding: '10px 14px' }}><Badge color="#475569" bg="#f1f5f9">{contextLabel(combination.context)}</Badge></td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{[combination.financial_category_name, combination.financial_cost_center_name].filter(Boolean).join(' · ') || '—'}</td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{[combination.financial_account_name, combination.financial_payment_method_name].filter(Boolean).join(' · ') || '—'}</td>
              <td style={{ padding: '10px 14px' }}><StatusBadge active={combination.is_active} /></td>
              <td style={{ padding: '10px 14px' }}>
                <InlineActions
                  onEdit={() => setCombinationFormFrom(combination)}
                  onToggleActive={() => void setCadastroActive('combinacoes', combination.id, !combination.is_active)}
                  onDelete={() => void hardDelete('combinacoes', combination.id)}
                  isActive={combination.is_active}
                  disabled={saving}
                />
              </td>
            </tr>
          ))}
        </CatalogTable>
      </Card>
    );
  }

  function renderRecurringRules() {
    return (
      <Card padding={0}>
        <div style={{ padding: '16px 20px 0', display: 'grid', gap: 6 }}>
          <SectionTitle>Compromissos recorrentes</SectionTitle>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
            Regras criadas pelo lançador rápido. Elas mantêm aluguel, salários, softwares e receitas mensais vivos no financeiro.
          </div>
        </div>
        <CatalogTable headers={['Recorrência', 'Tipo', 'Regra', 'Janela', 'Status', 'Ações']}>
          {recurringRules.map((rule) => (
            <tr key={rule.id} style={rowStyle()}>
              <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 650, color: '#0f172a' }}>
                {rule.name}
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginTop: 2 }}>
                  Próxima: {formatDate(rule.next_due_date)} · desde {formatDate(rule.start_date)}
                </div>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <Badge color={rule.resource_type === 'payable' ? '#dc2626' : '#059669'} bg={rule.resource_type === 'payable' ? '#fee2e2' : '#d1fae5'}>
                  {rule.resource_type === 'payable' ? 'A pagar' : 'A receber'}
                </Badge>
              </td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                Todo mês, dia {rule.day_of_month}
              </td>
              <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>
                {rule.last_materialized_until ? `Lançado até ${formatDate(rule.last_materialized_until)}` : `${rule.materialization_months} meses`}
              </td>
              <td style={{ padding: '10px 14px' }}>
                <Badge color={rule.status === 'active' ? '#059669' : rule.status === 'paused' ? '#92400e' : '#64748b'} bg={rule.status === 'active' ? '#d1fae5' : rule.status === 'paused' ? '#fef3c7' : '#f1f5f9'}>
                  {rule.status === 'active' ? 'Ativa' : rule.status === 'paused' ? 'Pausada' : 'Encerrada'}
                </Badge>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {rule.status === 'active' ? (
                    <>
                      <ActionButton onClick={() => void updateRecurringRuleStatus(rule, 'paused')} disabled={saving}>Pausar</ActionButton>
                      <ActionButton onClick={() => void updateRecurringRuleStatus(rule, 'ended')} disabled={saving}>Encerrar</ActionButton>
                    </>
                  ) : (
                    <ActionButton onClick={() => void updateRecurringRuleStatus(rule, 'active')} disabled={saving}>Reativar</ActionButton>
                  )}
                  <ActionButton onClick={() => void hardDelete('recorrencias', rule.id)} tone="danger" disabled={saving}>Excluir</ActionButton>
                </div>
              </td>
            </tr>
          ))}
        </CatalogTable>
        {recurringRules.length === 0 ? (
          <div style={{ padding: 20, fontSize: 12, color: '#64748b' }}>
            Nenhuma recorrência criada ainda. No lançador rápido, marque “Repetir todo mês” ao lançar aluguel, salário ou contrato mensal.
          </div>
        ) : null}
      </Card>
    );
  }

  function renderDuplicates() {
    return (
      <Card>
        <SectionTitle action={<ActionButton onClick={() => void loadCadastros()}>Reanalisar</ActionButton>}>Possíveis duplicidades</SectionTitle>
        {duplicateGroups.length === 0 ? (
          <div style={{ fontSize: 12, color: '#64748b' }}>Nenhuma duplicidade provável encontrada agora.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {duplicateGroups.map((group) => (
              <div key={group.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 750, color: '#0f172a' }}>{group.label || 'Sem rótulo'}</div>
                  <Badge color="#92400e" bg="#fef3c7">{group.entities.length} entidades</Badge>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {group.entities.map((entity) => (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() => editEntity(entity)}
                      style={{ textAlign: 'left', border: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 650, color: '#0f172a' }}>{entity.legal_name}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{entity.document_number || entity.trade_name || 'Sem documento'}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  function setAccountFormFrom(account: FinanceAccount) {
    setAccountForm({
      id: account.id,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      account_number: account.account_number ?? '',
      branch_number: account.branch_number ?? '',
      is_active: account.is_active
    });
  }

  function setCategoryFormFrom(category: FinanceCategory) {
    setCategoryForm({
      id: category.id,
      name: category.name,
      kind: category.kind,
      parent_category_id: category.parent_category_id ?? '',
      is_active: category.is_active
    });
  }

  function setCostCenterFormFrom(center: FinanceCostCenter) {
    setCostCenterForm({
      id: center.id,
      name: center.name,
      code: center.code ?? '',
      is_active: center.is_active
    });
  }

  function setPaymentFormFrom(method: FinancePaymentMethod) {
    setPaymentForm({
      id: method.id,
      name: method.name,
      kind: method.kind,
      is_active: method.is_active
    });
  }

  function setCombinationFormFrom(combination: FinanceFavoriteCombination) {
    setCombinationForm({
      id: combination.id,
      name: combination.name,
      context: combination.context,
      financial_category_id: combination.financial_category_id ?? '',
      financial_cost_center_id: combination.financial_cost_center_id ?? '',
      financial_account_id: combination.financial_account_id ?? '',
      financial_payment_method_id: combination.financial_payment_method_id ?? '',
      is_active: combination.is_active
    });
  }
}

function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: '#475569' }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
      Cadastro ativo
    </label>
  );
}

function FormActions({ saving, editing, onClear }: { saving: boolean; editing: boolean; onClear: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <ActionButton type="submit" tone="primary" disabled={saving}>{saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar'}</ActionButton>
      <ActionButton onClick={onClear}>Limpar</ActionButton>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return <Badge color={active ? '#059669' : '#94a3b8'} bg={active ? '#d1fae5' : '#f1f5f9'}>{active ? 'Ativo' : 'Inativo'}</Badge>;
}

function InlineActions({
  onEdit,
  onToggleActive,
  onDelete,
  isActive,
  disabled
}: {
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  isActive: boolean;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <ActionButton onClick={onEdit}>Editar</ActionButton>
      <ActionButton onClick={onToggleActive} disabled={disabled}>{isActive ? 'Inativar' : 'Reativar'}</ActionButton>
      <ActionButton onClick={onDelete} tone="danger" disabled={disabled}>Excluir</ActionButton>
    </div>
  );
}
