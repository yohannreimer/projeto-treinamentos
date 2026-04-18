import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { Section } from '../components/Section';
import { StatusChip } from '../components/StatusChip';
import { statusLabel } from '../utils/labels';
import type {
  CompanyHoursLedgerItem,
  CompanyHoursModuleInsight,
  CompanyHoursPendingItem,
  CompanyHoursSummary
} from '../types';

type ModuleEdit = {
  status: 'Nao_iniciado' | 'Planejado' | 'Em_execucao' | 'Concluido';
  notes: string;
  custom_duration_days: string;
};

type JourneyFilter = 'all' | 'Concluido' | 'Em_execucao' | 'Planejado' | 'Nao_iniciado';
type HoursPendingAction = 'confirm' | 'reject';

const statusOptions = ['Em_treinamento', 'Finalizado', 'Ativo', 'Inativo'] as const;
const priorityOptions = ['Alta', 'Normal', 'Baixa', 'Parado', 'Aguardando_liberacao'] as const;
const modalityOptions = ['Turma_Online', 'Exclusivo_Online', 'Presencial'] as const;
const relationshipOptions = ['Nosso', 'Terceiro'] as const;
const progressStatusOptions = ['Nao_iniciado', 'Planejado', 'Em_execucao', 'Concluido'] as const;
type HistorySortKey = 'cohort_code' | 'start_date' | 'module_code' | 'entry_day' | 'status' | 'cohort_status' | 'executed_at';

function formatDateTimeBr(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

function formatHoursValue(value: number | null | undefined) {
  const safe = Number(value ?? 0);
  if (!Number.isFinite(safe)) return '0';
  return safe.toLocaleString('pt-BR', {
    minimumFractionDigits: Number.isInteger(safe) ? 0 : 1,
    maximumFractionDigits: 2
  });
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function hoursEventLabel(eventType: string) {
  if (eventType === 'hours_adjustment_suggested') return 'Sugestão automática';
  if (eventType === 'hours_adjustment_confirmed') return 'Sugestão confirmada';
  if (eventType === 'hours_adjustment_rejected') return 'Sugestão rejeitada';
  if (eventType === 'hours_manual_adjustment_added') return 'Ajuste manual';
  if (eventType === 'training_encounter_completed') return 'Encontro de treinamento';
  if (eventType === 'deliverable_worklog_logged') return 'Worklog de entregável';
  if (eventType === 'module_scope_defined') return 'Escopo de horas definido';
  return eventType;
}

function moduleDeliveryLabel(value: string | null | undefined) {
  if (value === 'entregavel') return 'Entregável interno';
  return 'Treinamento ministrado';
}

function modulePolicyLabel(value: string | null | undefined) {
  if (value === 'nao_consume') return 'Não consome banco do cliente';
  return 'Consome banco de horas do cliente';
}

function extractHoursPayloadReason(payloadJson: string) {
  if (!payloadJson?.trim()) return '';
  try {
    const parsed = JSON.parse(payloadJson) as { reason?: string | null };
    return parsed.reason?.trim() ?? '';
  } catch {
    return '';
  }
}

function extractWorklogHours(payloadJson: string): number | null {
  if (!payloadJson?.trim()) return null;
  try {
    const parsed = JSON.parse(payloadJson) as { minutes_logged?: number };
    const minutesLogged = Number(parsed.minutes_logged ?? 0);
    if (!Number.isFinite(minutesLogged) || minutesLogged <= 0) return null;
    return roundHours(minutesLogged / 60);
  } catch {
    return null;
  }
}

function canRevertLedgerEntry(eventType: string) {
  return eventType === 'training_encounter_completed' || eventType === 'hours_manual_adjustment_added';
}

export function ClientDetailPage() {
  const { id } = useParams();
  const disabledModulesPanelId = 'client-detail-disabled-modules';
  const [data, setData] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [companyNotes, setCompanyNotes] = useState('');
  const [companyStatus, setCompanyStatus] = useState<(typeof statusOptions)[number]>('Em_treinamento');
  const [companyPriority, setCompanyPriority] = useState<(typeof priorityOptions)[number]>('Normal');
  const [companyModality, setCompanyModality] = useState<(typeof modalityOptions)[number]>('Turma_Online');
  const [companyRelationshipType, setCompanyRelationshipType] = useState<(typeof relationshipOptions)[number]>('Nosso');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [portalSlug, setPortalSlug] = useState('');
  const [portalUsername, setPortalUsername] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [portalActive, setPortalActive] = useState(true);
  const [portalSupportIntroText, setPortalSupportIntroText] = useState('');
  const [portalHiddenModuleIds, setPortalHiddenModuleIds] = useState<string[]>([]);
  const [portalDateOverrides, setPortalDateOverrides] = useState<Record<string, string>>({});
  const [savingPortalAccess, setSavingPortalAccess] = useState(false);

  const [hoursSummary, setHoursSummary] = useState<CompanyHoursSummary | null>(null);
  const [hoursPending, setHoursPending] = useState<CompanyHoursPendingItem[]>([]);
  const [hoursLedger, setHoursLedger] = useState<CompanyHoursLedgerItem[]>([]);
  const [hoursModuleInsights, setHoursModuleInsights] = useState<CompanyHoursModuleInsight[]>([]);
  const [hoursActionLoadingId, setHoursActionLoadingId] = useState<string | null>(null);
  const [hoursAdjustmentDelta, setHoursAdjustmentDelta] = useState('');
  const [hoursAdjustmentReason, setHoursAdjustmentReason] = useState('');
  const [savingHoursAdjustment, setSavingHoursAdjustment] = useState(false);

  const [moduleEdits, setModuleEdits] = useState<Record<string, ModuleEdit>>({});
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null);
  const [historySortKey, setHistorySortKey] = useState<HistorySortKey>('start_date');
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc');
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>('all');
  const [showDisabledModules, setShowDisabledModules] = useState(false);
  const [showClientDataSection, setShowClientDataSection] = useState(false);
  const [showPortalAccessSection, setShowPortalAccessSection] = useState(false);
  const [showHoursBankSection, setShowHoursBankSection] = useState(false);
  const [showJourneySection, setShowJourneySection] = useState(true);
  const [showOptionalsSection, setShowOptionalsSection] = useState(true);
  const [showHistorySection, setShowHistorySection] = useState(true);
  const [moduleToActivate, setModuleToActivate] = useState('');
  const [activatingModule, setActivatingModule] = useState(false);

  async function loadCompanyHours(companyId: string) {
    const [summary, moduleResponse, ledgerResponse, pendingResponse] = await Promise.all([
      api.companyHoursSummary(companyId),
      api.companyHoursModules(companyId),
      api.companyHoursLedger(companyId),
      api.companyHoursPending(companyId)
    ]);
    setHoursSummary(summary);
    setHoursModuleInsights(moduleResponse.items ?? []);
    setHoursLedger(ledgerResponse.items ?? []);
    setHoursPending(pendingResponse.items ?? []);
  }

  function load() {
    if (!id) return;
    Promise.all([
      api.companyById(id),
      api.portalAccessByCompany(id),
      api.companyHoursSummary(id),
      api.companyHoursModules(id),
      api.companyHoursLedger(id),
      api.companyHoursPending(id)
    ])
      .then(([response, portalAccess, summaryResponse, moduleResponse, ledgerResponse, pendingResponse]) => {
        setData(response);
        setPortalSlug(portalAccess.slug ?? '');
        setPortalUsername(portalAccess.username ?? '');
        setPortalActive(Boolean(portalAccess.is_active));
        setPortalSupportIntroText(portalAccess.support_intro_text ?? '');
        setPortalHiddenModuleIds(portalAccess.hidden_module_ids ?? []);
        setPortalDateOverrides((portalAccess.module_date_overrides ?? []).reduce((acc, row) => {
          if (!row.module_id || !row.next_date) return acc;
          acc[row.module_id] = row.next_date;
          return acc;
        }, {} as Record<string, string>));
        setHoursSummary(summaryResponse ?? null);
        setHoursModuleInsights(moduleResponse.items ?? []);
        setHoursLedger(ledgerResponse.items ?? []);
        setHoursPending(pendingResponse.items ?? []);
        setPortalPassword('');
        setError('');
      })
      .catch((err: Error) => {
        setData(null);
        setHoursSummary(null);
        setHoursModuleInsights([]);
        setHoursLedger([]);
        setHoursPending([]);
        setError(err.message);
      });
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    setJourneyFilter('all');
    setShowDisabledModules(false);
    setShowClientDataSection(false);
    setShowPortalAccessSection(false);
    setShowHoursBankSection(false);
    setShowJourneySection(true);
    setShowOptionalsSection(true);
    setShowHistorySection(true);
  }, [id]);

  useEffect(() => {
    if (!data?.company) return;
    setCompanyName(data.company.name ?? '');
    setCompanyNotes(data.company.notes ?? '');
    setCompanyStatus((data.company.status ?? 'Em_treinamento') as (typeof statusOptions)[number]);
    setCompanyPriority((data.company.priority_level ?? 'Normal') as (typeof priorityOptions)[number]);
    setCompanyModality((data.company.modality ?? 'Turma_Online') as (typeof modalityOptions)[number]);
    setCompanyRelationshipType((data.company.relationship_type ?? (data.company.is_third_party ? 'Terceiro' : 'Nosso')) as (typeof relationshipOptions)[number]);
    setContactName(data.company.contact_name ?? '');
    setContactPhone(data.company.contact_phone ?? '');
    setContactEmail(data.company.contact_email ?? '');

    const nextEdits: Record<string, ModuleEdit> = {};
    (data.timeline ?? []).forEach((item: any) => {
      nextEdits[item.module_id] = {
        status: (item.status ?? 'Nao_iniciado') as ModuleEdit['status'],
        notes: item.progress_notes ?? '',
        custom_duration_days: item.custom_duration_days == null ? '' : String(item.custom_duration_days)
      };
    });
    setModuleEdits(nextEdits);
  }, [data]);

  const timeline = useMemo(() => data?.timeline ?? [], [data]);
  const totalAvailableHoursAcrossModules = useMemo(
    () => roundHours(hoursModuleInsights.reduce((total, item) => total + Number(item.planned_hours ?? 0), 0)),
    [hoursModuleInsights]
  );
  const projectedHoursSummary = useMemo(() => ({
    available_hours: totalAvailableHoursAcrossModules > 0
      ? totalAvailableHoursAcrossModules
      : (hoursSummary?.projection?.available_hours ?? hoursSummary?.available_hours ?? 0),
    consumed_hours: hoursSummary?.projection?.consumed_hours ?? hoursSummary?.consumed_hours ?? 0,
    balance_hours: roundHours(
      (totalAvailableHoursAcrossModules > 0
        ? totalAvailableHoursAcrossModules
        : (hoursSummary?.projection?.available_hours ?? hoursSummary?.available_hours ?? 0))
      - (hoursSummary?.projection?.consumed_hours ?? hoursSummary?.consumed_hours ?? 0)
    ),
    remaining_diarias: roundHours(
      (
        (totalAvailableHoursAcrossModules > 0
          ? totalAvailableHoursAcrossModules
          : (hoursSummary?.projection?.available_hours ?? hoursSummary?.available_hours ?? 0))
        - (hoursSummary?.projection?.consumed_hours ?? hoursSummary?.consumed_hours ?? 0)
      ) / 8
    )
  }), [hoursSummary, totalAvailableHoursAcrossModules]);
  const confirmedHoursSummary = useMemo(() => {
    const availableHours = projectedHoursSummary.available_hours;
    const consumedHours = hoursSummary?.consumed_hours ?? 0;
    const balanceHours = roundHours(availableHours - consumedHours);
    return {
      available_hours: availableHours,
      consumed_hours: consumedHours,
      balance_hours: balanceHours,
      remaining_diarias: roundHours(balanceHours / 8)
    };
  }, [hoursSummary, projectedHoursSummary.available_hours]);
  const ledgerRowsLatestFirst = useMemo(
    () => [...hoursLedger].reverse(),
    [hoursLedger]
  );
  const activeTimeline = useMemo(
    () => timeline.filter((item: any) => Boolean(item.is_enabled)),
    [timeline]
  );
  const disabledCount = useMemo(
    () => timeline.filter((item: any) => !item.is_enabled).length,
    [timeline]
  );
  const disabledTimeline = useMemo(
    () => timeline.filter((item: any) => !item.is_enabled),
    [timeline]
  );
  const journeyKpis = useMemo(() => {
    const counts = {
      Concluido: 0,
      Em_execucao: 0,
      Planejado: 0,
      Nao_iniciado: 0
    };

    activeTimeline.forEach((item: any) => {
      if (item.status === 'Concluido') counts.Concluido += 1;
      else if (item.status === 'Em_execucao') counts.Em_execucao += 1;
      else if (item.status === 'Planejado') counts.Planejado += 1;
      else if (item.status === 'Nao_iniciado') counts.Nao_iniciado += 1;
    });

    return counts;
  }, [activeTimeline]);
  const filteredTimeline = useMemo(() => {
    if (journeyFilter === 'all') return activeTimeline;
    return activeTimeline.filter((item: any) => item.status === journeyFilter);
  }, [activeTimeline, journeyFilter]);
  const moduleHoursInsights = useMemo(
    () => [...hoursModuleInsights].sort((left, right) => left.code.localeCompare(right.code)),
    [hoursModuleInsights]
  );

  useEffect(() => {
    if (disabledCount === 0 && showDisabledModules) {
      setShowDisabledModules(false);
    }
  }, [disabledCount, showDisabledModules]);

  useEffect(() => {
    if (disabledTimeline.length === 0) {
      setModuleToActivate('');
      return;
    }
    if (!disabledTimeline.some((item: any) => item.module_id === moduleToActivate)) {
      setModuleToActivate(disabledTimeline[0].module_id);
    }
  }, [disabledTimeline, moduleToActivate]);

  const sortedHistory = useMemo(() => {
    const rows = [...(data?.history ?? [])];
    rows.sort((a: any, b: any) => {
      const direction = historySortDirection === 'asc' ? 1 : -1;
      if (historySortKey === 'entry_day') {
        return (Number(a.entry_day ?? 0) - Number(b.entry_day ?? 0)) * direction;
      }
      const left = String(a[historySortKey] ?? '');
      const right = String(b[historySortKey] ?? '');
      return left.localeCompare(right) * direction;
    });
    return rows;
  }, [data, historySortDirection, historySortKey]);

  function toggleHistorySort(nextKey: HistorySortKey) {
    if (historySortKey === nextKey) {
      setHistorySortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setHistorySortKey(nextKey);
    setHistorySortDirection(nextKey === 'entry_day' ? 'asc' : 'desc');
  }

  function historySortIndicator(nextKey: HistorySortKey) {
    if (historySortKey !== nextKey) return '';
    return historySortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  async function saveCompanyProfile() {
    if (!id) return;
    if (!companyName.trim()) {
      setError('Nome da empresa é obrigatório.');
      return;
    }

    setSavingCompany(true);
    setError('');
    setMessage('');
    try {
      await api.updateCompany(id, {
        name: companyName.trim(),
        status: companyStatus,
        priority_level: companyPriority,
        modality: companyModality,
        notes: companyNotes.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_email: contactEmail.trim() || null
        ,
        relationship_type: companyRelationshipType,
        is_third_party: companyRelationshipType === 'Terceiro'
      });
      setMessage('Dados do cliente atualizados.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingCompany(false);
    }
  }

  function moduleHiddenInPortal(moduleId: string) {
    return portalHiddenModuleIds.includes(moduleId);
  }

  function toggleModuleVisibilityInPortal(moduleId: string, visible: boolean) {
    setPortalHiddenModuleIds((prev) => {
      if (visible) {
        return prev.filter((id) => id !== moduleId);
      }
      if (prev.includes(moduleId)) return prev;
      return [...prev, moduleId];
    });
  }

  function updatePortalModuleDateOverride(moduleId: string, nextDate: string) {
    setPortalDateOverrides((prev) => {
      if (!nextDate.trim()) {
        if (!(moduleId in prev)) return prev;
        const next = { ...prev };
        delete next[moduleId];
        return next;
      }
      return {
        ...prev,
        [moduleId]: nextDate
      };
    });
  }

  async function savePortalAccess() {
    if (!id) return;
    if (!portalSlug.trim()) {
      setError('Informe o slug do portal.');
      return;
    }
    if (!portalUsername.trim()) {
      setError('Informe o usuário do portal.');
      return;
    }

    setSavingPortalAccess(true);
    setError('');
    setMessage('');
    try {
      await api.upsertPortalAccessByCompany(id, {
        slug: portalSlug.trim(),
        username: portalUsername.trim(),
        password: portalPassword.trim() || undefined,
        is_active: portalActive,
        support_intro_text: portalSupportIntroText.trim() || null,
        hidden_module_ids: Array.from(new Set(portalHiddenModuleIds)),
        module_date_overrides: Object.entries(portalDateOverrides)
          .filter(([, nextDate]) => nextDate.trim().length > 0)
          .map(([module_id, next_date]) => ({ module_id, next_date }))
      });
      setPortalPassword('');
      setMessage('Acesso do portal atualizado.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPortalAccess(false);
    }
  }

  async function resolveHoursPending(pendingId: string, action: HoursPendingAction) {
    if (!id) return;
    setHoursActionLoadingId(`${action}:${pendingId}`);
    setError('');
    setMessage('');
    try {
      if (action === 'confirm') {
        await api.confirmCompanyHoursPending(id, pendingId);
      } else {
        await api.rejectCompanyHoursPending(id, pendingId);
      }
      await loadCompanyHours(id);
      setMessage(action === 'confirm' ? 'Pendência confirmada no banco de horas.' : 'Pendência rejeitada no banco de horas.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHoursActionLoadingId(null);
    }
  }

  async function createManualHoursAdjustment() {
    if (!id) return;
    const delta = Number(hoursAdjustmentDelta);
    const reason = hoursAdjustmentReason.trim();
    if (!Number.isFinite(delta) || delta === 0) {
      setError('Informe um ajuste de horas diferente de zero.');
      return;
    }
    if (reason.length < 5) {
      setError('Descreva o motivo do ajuste com pelo menos 5 caracteres.');
      return;
    }

    setSavingHoursAdjustment(true);
    setError('');
    setMessage('');
    try {
      await api.createCompanyHoursAdjustment(id, {
        delta_hours: delta,
        reason
      });
      setHoursAdjustmentDelta('');
      setHoursAdjustmentReason('');
      await loadCompanyHours(id);
      setMessage('Ajuste manual registrado no banco de horas.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingHoursAdjustment(false);
    }
  }

  async function revertHoursLedgerEntry(ledgerId: string) {
    if (!id) return;
    setHoursActionLoadingId(`revert:${ledgerId}`);
    setError('');
    setMessage('');
    try {
      await api.revertCompanyHoursLedgerEntry(id, ledgerId);
      await loadCompanyHours(id);
      setMessage('Lançamento estornado com sucesso.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setHoursActionLoadingId(null);
    }
  }

  function updateModuleEdit(moduleId: string, patch: Partial<ModuleEdit>) {
    setModuleEdits((prev) => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] ?? {
          status: 'Nao_iniciado',
          notes: '',
          custom_duration_days: ''
        }),
        ...patch
      }
    }));
  }

  async function saveModuleProgress(moduleId: string) {
    if (!id) return;
    const edit = moduleEdits[moduleId];
    if (!edit) return;

    setSavingModuleId(moduleId);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyProgress(id, moduleId, {
        status: edit.status,
        notes: edit.notes.trim() || null,
        custom_duration_days: edit.custom_duration_days.trim() ? Number(edit.custom_duration_days) : null
      });
      setMessage('Módulo atualizado.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModuleId(null);
    }
  }

  async function markDone(moduleId: string) {
    if (!id) return;
    setSavingModuleId(moduleId);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyProgress(id, moduleId, { status: 'Concluido' });
      setMessage('Módulo concluído manualmente.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModuleId(null);
    }
  }

  async function undoDone(moduleId: string) {
    if (!id) return;
    setSavingModuleId(moduleId);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyProgress(id, moduleId, { status: 'Nao_iniciado', completed_at: null });
      setMessage('Conclusão desfeita com sucesso.');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingModuleId(null);
    }
  }

  async function toggleModule(moduleId: string, currentEnabled: boolean) {
    if (!id) return;
    try {
      await api.updateCompanyModuleActivation(id, moduleId, { is_enabled: !currentEnabled });
      setMessage(currentEnabled ? 'Módulo desativado para este cliente.' : 'Módulo ativado para este cliente.');
      setError('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function activateModuleFromPicker() {
    if (!id || !moduleToActivate) return;
    setActivatingModule(true);
    setError('');
    setMessage('');
    try {
      await api.updateCompanyModuleActivation(id, moduleToActivate, { is_enabled: true });
      setMessage('Módulo adicionado à jornada do cliente.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActivatingModule(false);
    }
  }

  if (!data && !error) return <p>Carregando cliente...</p>;

  return (
    <div className="page client-detail-page">
      <header className="page-header">
        <h1>{data?.company?.name ?? 'Cliente'}</h1>
        <p>Perfil operacional do cliente, ajustes de planejamento e histórico da jornada.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="info">{message}</p> : null}

      {!data ? null : (
        <>
          <Section
            title="Dados do cliente"
            action={(
              <button
                type="button"
                className="section-collapse-btn"
                onClick={() => setShowClientDataSection((prev) => !prev)}
                aria-expanded={showClientDataSection}
                aria-label={showClientDataSection ? 'Minimizar dados do cliente' : 'Expandir dados do cliente'}
              >
                {showClientDataSection ? '−' : '+'}
              </button>
            )}
          >
            {showClientDataSection ? (
              <div className="form form-spacious">
              <p className="form-hint">Perfil comercial e operacional do cliente para planejamento de agenda e progresso da jornada.</p>
              <div className="three-col">
                <label>
                  Empresa
                  <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                </label>
                <label>
                  Contato responsável
                  <input value={contactName} onChange={(event) => setContactName(event.target.value)} />
                </label>
                <label>
                  Contato (telefone/WhatsApp)
                  <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                </label>
              </div>
              <div className="three-col">
                <label>
                  E-mail
                  <input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
                </label>
                <label>
                  Modalidade
                  <select value={companyModality} onChange={(event) => setCompanyModality(event.target.value as (typeof modalityOptions)[number])}>
                    {modalityOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prioridade
                  <select value={companyPriority} onChange={(event) => setCompanyPriority(event.target.value as (typeof priorityOptions)[number])}>
                    {priorityOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="three-col">
                <label>
                  Status
                  <select value={companyStatus} onChange={(event) => setCompanyStatus(event.target.value as (typeof statusOptions)[number])}>
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo de cliente
                  <select
                    value={companyRelationshipType}
                    onChange={(event) => setCompanyRelationshipType(event.target.value as (typeof relationshipOptions)[number])}
                  >
                    {relationshipOptions.map((option) => (
                      <option key={option} value={option}>{statusLabel(option)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Observações
                <textarea rows={2} value={companyNotes} onChange={(event) => setCompanyNotes(event.target.value)} />
              </label>
              <div className="actions actions-compact">
                <button type="button" onClick={saveCompanyProfile} disabled={savingCompany}>
                  {savingCompany ? 'Salvando...' : 'Salvar dados do cliente'}
                </button>
              </div>
              </div>
            ) : null}
          </Section>

          <Section
            title="Acesso ao portal do cliente"
            action={(
              <button
                type="button"
                className="section-collapse-btn"
                onClick={() => setShowPortalAccessSection((prev) => !prev)}
                aria-expanded={showPortalAccessSection}
                aria-label={showPortalAccessSection ? 'Minimizar acesso ao portal do cliente' : 'Expandir acesso ao portal do cliente'}
              >
                {showPortalAccessSection ? '−' : '+'}
              </button>
            )}
          >
            {showPortalAccessSection ? (
              <div className="form form-spacious">
              <p className="form-hint">
                Defina URL, usuário e status do acesso externo para o cliente acompanhar planejamento, agenda e suporte.
                As configurações abaixo são mão única: apenas seu time altera, o cliente só visualiza.
              </p>
              <div className="three-col">
                <label>
                  Slug da URL
                  <input
                    value={portalSlug}
                    onChange={(event) => setPortalSlug(event.target.value)}
                    placeholder="ex: cliente-metal-forte"
                  />
                </label>
                <label>
                  Usuário
                  <input
                    value={portalUsername}
                    onChange={(event) => setPortalUsername(event.target.value)}
                    placeholder="Usuário de acesso"
                  />
                </label>
                <label>
                  Status
                  <select value={portalActive ? 'ativo' : 'inativo'} onChange={(event) => setPortalActive(event.target.value === 'ativo')}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </label>
              </div>
              <label>
                Nova senha
                <input
                  type="password"
                  value={portalPassword}
                  onChange={(event) => setPortalPassword(event.target.value)}
                  placeholder="Opcional: preencha somente para trocar a senha"
                />
              </label>

              <label>
                Texto de apoio da aba Suporte
                <textarea
                  rows={2}
                  value={portalSupportIntroText}
                  onChange={(event) => setPortalSupportIntroText(event.target.value)}
                  placeholder="Ex: Registre a solicitação com contexto e impacto para acelerar o atendimento."
                />
              </label>

              <div className="table-wrap portal-curation-table-wrap">
                <table className="table portal-curation-table">
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      <th>Visível no portal</th>
                      <th>Data exibida (opcional)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTimeline.map((moduleItem: any) => (
                      <tr key={`portal-curation-${moduleItem.module_id}`}>
                        <td>
                          <strong>{moduleItem.code} - {moduleItem.name}</strong>
                        </td>
                        <td>
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!moduleHiddenInPortal(moduleItem.module_id)}
                              onChange={(event) => toggleModuleVisibilityInPortal(moduleItem.module_id, event.target.checked)}
                            />
                            {moduleHiddenInPortal(moduleItem.module_id) ? 'Oculto no portal' : 'Exibido no portal'}
                          </label>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={portalDateOverrides[moduleItem.module_id] ?? ''}
                            onChange={(event) => updatePortalModuleDateOverride(moduleItem.module_id, event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="actions actions-compact">
                <button type="button" onClick={savePortalAccess} disabled={savingPortalAccess}>
                  {savingPortalAccess ? 'Salvando acesso...' : 'Salvar acesso do portal'}
                </button>
              </div>
              </div>
            ) : null}
          </Section>

          <Section
            title="Banco de horas (interno)"
            action={(
              <button
                type="button"
                className="section-collapse-btn"
                onClick={() => setShowHoursBankSection((prev) => !prev)}
                aria-expanded={showHoursBankSection}
                aria-label={showHoursBankSection ? 'Minimizar banco de horas interno' : 'Expandir banco de horas interno'}
              >
                {showHoursBankSection ? '−' : '+'}
              </button>
            )}
          >
            {showHoursBankSection ? (
              <>
                <div className="hours-bank-headline">
              <div>
                <strong>Visão operacional projetada</strong>
                <p>
                  Planejado x realizado por módulo, com saldo operacional e trilha auditável no extrato.
                  {hoursSummary?.projection ? ' O ledger confirmado aparece logo abaixo para conciliação/estorno.' : ''}
                </p>
              </div>
                </div>

            <div className="hours-bank-summary-grid">
              <article className="mini-stat">
                <span>Disponível (projetado)</span>
                <strong>{formatHoursValue(projectedHoursSummary.available_hours)} h</strong>
              </article>
              <article className="mini-stat">
                <span>Consumido (projetado)</span>
                <strong>{formatHoursValue(projectedHoursSummary.consumed_hours)} h</strong>
              </article>
              <article className="mini-stat mini-stat-accent">
                <span>Saldo (projetado)</span>
                <strong>{formatHoursValue(projectedHoursSummary.balance_hours)} h</strong>
              </article>
              <article className="mini-stat">
                <span>Diárias restantes (proj.)</span>
                <strong>{formatHoursValue(projectedHoursSummary.remaining_diarias)}</strong>
              </article>
            </div>

            <div className="hours-bank-summary-grid hours-bank-summary-grid-secondary">
              <article className="mini-stat mini-stat-muted">
                <span>Disponível (confirmado)</span>
                <strong>{formatHoursValue(confirmedHoursSummary.available_hours)} h</strong>
              </article>
              <article className="mini-stat mini-stat-muted">
                <span>Consumido (confirmado)</span>
                <strong>{formatHoursValue(confirmedHoursSummary.consumed_hours)} h</strong>
              </article>
              <article className="mini-stat mini-stat-muted">
                <span>Saldo (confirmado)</span>
                <strong>{formatHoursValue(confirmedHoursSummary.balance_hours)} h</strong>
              </article>
              <article className="mini-stat mini-stat-muted">
                <span>Diárias restantes (conf.)</span>
                <strong>{formatHoursValue(confirmedHoursSummary.remaining_diarias)}</strong>
              </article>
            </div>

            <div className="two-col hours-bank-grid">
              <div className="form-subcard hours-bank-panel">
                <h3>Pendências de conciliação</h3>
                <p className="form-hint">Sugestões automáticas aguardando decisão manual para refletir no saldo.</p>
                {hoursPending.length === 0 ? (
                  <p className="muted">Sem pendências no momento.</p>
                ) : (
                  <div className="table-wrap hours-bank-table-wrap">
                    <table className="table table-tight">
                      <thead>
                        <tr>
                          <th>Evento</th>
                          <th>Δ horas</th>
                          <th>Status</th>
                          <th>Motivo</th>
                          <th>Criado em</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hoursPending.map((pending) => (
                          <tr key={pending.id}>
                            <td>{hoursEventLabel(pending.event_type)}</td>
                            <td>{pending.delta_hours > 0 ? '+' : ''}{formatHoursValue(pending.delta_hours)} h</td>
                            <td><StatusChip value={pending.status} /></td>
                            <td>{pending.reason || extractHoursPayloadReason(pending.payload_json) || '-'}</td>
                            <td>{formatDateTimeBr(pending.created_at)}</td>
                            <td className="actions">
                              <button
                                type="button"
                                onClick={() => resolveHoursPending(pending.id, 'confirm')}
                                disabled={hoursActionLoadingId === `confirm:${pending.id}` || pending.status !== 'Pendente'}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => resolveHoursPending(pending.id, 'reject')}
                                disabled={hoursActionLoadingId === `reject:${pending.id}` || pending.status !== 'Pendente'}
                              >
                                Rejeitar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="form-subcard hours-bank-panel">
                <h3>Ajuste manual</h3>
                <p className="form-hint">Use para crédito/débito pontual no saldo com trilha auditável no extrato.</p>
                <div className="form form-spacious">
                  <label>
                    Δ horas (positivo ou negativo)
                    <input
                      type="number"
                      step="0.5"
                      value={hoursAdjustmentDelta}
                      onChange={(event) => setHoursAdjustmentDelta(event.target.value)}
                      placeholder="Ex: 8 ou -4"
                    />
                  </label>
                  <label>
                    Motivo do ajuste
                    <textarea
                      rows={3}
                      value={hoursAdjustmentReason}
                      onChange={(event) => setHoursAdjustmentReason(event.target.value)}
                      placeholder="Explique o contexto operacional/comercial do ajuste."
                    />
                  </label>
                  <div className="actions actions-compact">
                    <button type="button" onClick={createManualHoursAdjustment} disabled={savingHoursAdjustment}>
                      {savingHoursAdjustment ? 'Registrando...' : 'Registrar ajuste manual'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

                <div className="table-wrap hours-bank-table-wrap">
              <table className="table table-hover table-tight">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Evento</th>
                    <th>Δ saldo cliente</th>
                    <th>Esforço interno</th>
                    <th>Saldo após</th>
                    <th>Motivo</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRowsLatestFirst.length === 0 ? (
                    <tr>
                      <td colSpan={7}>Sem movimentações no extrato de horas.</td>
                    </tr>
                  ) : (
                    ledgerRowsLatestFirst.map((entry) => {
                      const worklogHours = entry.event_type === 'deliverable_worklog_logged'
                        ? extractWorklogHours(entry.payload_json)
                        : null;
                      return (
                        <tr key={entry.id}>
                          <td>{formatDateTimeBr(entry.created_at)}</td>
                          <td>{hoursEventLabel(entry.event_type)}</td>
                          <td>{entry.delta_hours > 0 ? '+' : ''}{formatHoursValue(entry.delta_hours)} h</td>
                          <td>{worklogHours === null ? '-' : `${formatHoursValue(worklogHours)} h`}</td>
                          <td>{formatHoursValue(entry.balance_after)} h</td>
                          <td>{extractHoursPayloadReason(entry.payload_json) || '-'}</td>
                          <td className="actions">
                            {canRevertLedgerEntry(entry.event_type) ? (
                              <button
                                type="button"
                                onClick={() => revertHoursLedgerEntry(entry.id)}
                                disabled={hoursActionLoadingId === `revert:${entry.id}`}
                              >
                                {hoursActionLoadingId === `revert:${entry.id}` ? 'Estornando...' : 'Estornar'}
                              </button>
                            ) : (
                              <span className="muted">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
                </div>

                <div className="table-wrap hours-bank-table-wrap">
              <table className="table table-hover table-tight">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Tipo de entrega</th>
                    <th>Planejado</th>
                    <th>Consumo cliente (proj.)</th>
                    <th>Consumo cliente (real)</th>
                    <th>Saldo (proj. - real)</th>
                    <th>Variação (real - proj.)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {moduleHoursInsights.length === 0 ? (
                    <tr>
                      <td colSpan={8}>Sem módulos ativos para apuração interna de horas.</td>
                    </tr>
                  ) : (
                    moduleHoursInsights.map((insight) => (
                      <tr key={`module-hours-${insight.module_id}`}>
                        <td>
                          <strong>{insight.code}</strong>
                          <p className="muted">{insight.name}</p>
                        </td>
                        <td>{moduleDeliveryLabel(insight.delivery_mode)}</td>
                        <td>{formatHoursValue(insight.planned_diarias)} diária(s) · {formatHoursValue(insight.planned_hours)} h</td>
                        <td>{formatHoursValue(insight.projected_client_consumed_hours)} h</td>
                        <td>{formatHoursValue(insight.actual_client_consumed_hours)} h</td>
                        <td>{formatHoursValue(insight.projected_client_remaining_hours)} h</td>
                        <td>
                          {insight.internal_variance_hours === null
                            ? '-'
                            : `${insight.internal_variance_hours > 0 ? '+' : ''}${formatHoursValue(insight.internal_variance_hours)} h`}
                        </td>
                        <td><StatusChip value={insight.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
                </div>
              </>
            ) : null}
          </Section>

          <Section
            title="Jornada de módulos"
            action={(
              <button
                type="button"
                className="section-collapse-btn"
                onClick={() => setShowJourneySection((prev) => !prev)}
                aria-expanded={showJourneySection}
                aria-label={showJourneySection ? 'Minimizar jornada de módulos' : 'Expandir jornada de módulos'}
              >
                {showJourneySection ? '−' : '+'}
              </button>
            )}
          >
            {showJourneySection ? (
              <>
                <div className="journey-kpi-strip" role="group" aria-label="Filtro da jornada de módulos">
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Concluido' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Concluido'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Concluido' ? 'all' : 'Concluido'))}
                >
                  Concluído {journeyKpis.Concluido}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Em_execucao' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Em_execucao'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Em_execucao' ? 'all' : 'Em_execucao'))}
                >
                  Em andamento {journeyKpis.Em_execucao}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Planejado' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Planejado'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Planejado' ? 'all' : 'Planejado'))}
                >
                  Planejado {journeyKpis.Planejado}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'Nao_iniciado' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'Nao_iniciado'}
                  onClick={() => setJourneyFilter((prev) => (prev === 'Nao_iniciado' ? 'all' : 'Nao_iniciado'))}
                >
                  Stand-by {journeyKpis.Nao_iniciado}
                </button>
                <button
                  type="button"
                  className={`journey-kpi-btn ${journeyFilter === 'all' ? 'is-active' : ''}`}
                  aria-pressed={journeyFilter === 'all'}
                  onClick={() => setJourneyFilter('all')}
                >
                  Todos {activeTimeline.length}
                </button>
                </div>
                <div className="journey-kpi-meta-row">
                  <p className="journey-kpi-meta">
                    Exibindo {filteredTimeline.length} de {activeTimeline.length} módulos ativos.
                    {disabledCount > 0 ? ` Desativados: ${disabledCount}.` : ''}
                  </p>
                  <div className="journey-kpi-tools">
                    {disabledCount > 0 ? (
                      <div className="journey-module-add-cluster">
                        <label className="journey-module-add-control">
                          <span>Módulo desativado</span>
                          <select
                            value={moduleToActivate}
                            onChange={(event) => setModuleToActivate(event.target.value)}
                          >
                            {disabledTimeline.map((moduleItem: any) => (
                              <option key={`activate-${moduleItem.module_id}`} value={moduleItem.module_id}>
                                {moduleItem.code} - {moduleItem.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="journey-kpi-toggle journey-kpi-toggle-add"
                          onClick={activateModuleFromPicker}
                          disabled={!moduleToActivate || activatingModule}
                        >
                          {activatingModule ? 'Adicionando...' : 'Adicionar'}
                        </button>
                        <button
                          type="button"
                          className="journey-kpi-toggle journey-kpi-toggle-muted"
                          aria-expanded={showDisabledModules}
                          aria-controls={disabledModulesPanelId}
                          onClick={() => setShowDisabledModules((prev) => !prev)}
                        >
                          {showDisabledModules ? 'Ocultar desativados' : 'Ver desativados'}
                        </button>
                      </div>
                    ) : (
                      <span className="journey-kpi-empty-add">Sem módulos desativados para adicionar.</span>
                    )}
                  </div>
                </div>
                <ul className="timeline">
                {filteredTimeline.length === 0 ? (
                  <li className="timeline-item">
                    <div className="timeline-copy">
                      {activeTimeline.length === 0 ? (
                        <>
                          <strong>Não há módulos ativos nesta jornada.</strong>
                          <p>
                            {disabledCount > 0
                              ? 'Todos os módulos estão desativados para este cliente.'
                              : 'Esta jornada ainda não possui módulos carregados.'}
                          </p>
                        </>
                      ) : (
                        <>
                          <strong>Sem módulos neste filtro.</strong>
                          <p>Altere o chip para visualizar outros módulos ativos nesta jornada.</p>
                        </>
                      )}
                    </div>
                  </li>
                ) : (
                  filteredTimeline.map((moduleItem: any) => {
                    const edit = moduleEdits[moduleItem.module_id] ?? {
                      status: 'Nao_iniciado',
                      notes: '',
                      custom_duration_days: ''
                    };
                    return (
                      <li key={moduleItem.module_id} className="timeline-item journey-module-card">
                        <div className="journey-module-head">
                          <div className="journey-module-title">
                            <strong>{moduleItem.code} - {moduleItem.name}</strong>
                            <p>{moduleItem.category} · padrão {moduleItem.duration_days} diárias</p>
                          </div>
                          <div className="journey-module-badges">
                            {moduleItem.is_enabled ? <StatusChip value={moduleItem.status} /> : <span className="chip">Desativado</span>}
                            <span
                              className={`chip journey-module-chip journey-module-chip-mode ${moduleItem.delivery_mode === 'entregavel' ? 'is-deliverable' : 'is-training'}`}
                            >
                              {moduleDeliveryLabel(moduleItem.delivery_mode)}
                            </span>
                            <span className="chip journey-module-chip journey-module-chip-policy">{modulePolicyLabel(moduleItem.client_hours_policy)}</span>
                          </div>
                        </div>
                        <div className="journey-module-body">
                          <div className="journey-module-facts-wrap">
                            <h4 className="journey-module-block-title">Resumo do módulo</h4>
                            <div className="journey-module-facts">
                            <div>
                              <span>Planejado para este cliente</span>
                              <strong>{moduleItem.effective_duration_days} diárias</strong>
                            </div>
                            <div>
                              <span>Concluído em</span>
                              <strong>{moduleItem.completed_at ?? '-'}</strong>
                            </div>
                            <div>
                              <span>Turma vinculada</span>
                              <strong>
                                {moduleItem.last_cohort_code
                                  ? `${moduleItem.last_cohort_code} - ${moduleItem.last_cohort_name ?? ''} (${statusLabel(moduleItem.last_cohort_status ?? 'Planejada')})`
                                  : '-'}
                              </strong>
                            </div>
                            <div>
                              <span>Módulo neste cliente</span>
                              <strong>{moduleItem.is_enabled ? 'Ativo' : 'Desativado'}</strong>
                            </div>
                          </div>
                          </div>

                          <div className="journey-module-editor-wrap">
                            <h4 className="journey-module-block-title">Ações do módulo</h4>
                            <div className="journey-module-editor">
                            <div className="journey-module-editor-grid">
                              <label>
                                Status do módulo
                                <select
                                  value={edit.status}
                                  onChange={(event) => updateModuleEdit(moduleItem.module_id, {
                                    status: event.target.value as ModuleEdit['status']
                                  })}
                                  disabled={!moduleItem.is_enabled}
                                >
                                  {progressStatusOptions.map((option) => (
                                    <option key={option} value={option}>{statusLabel(option)}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Diárias customizadas
                                <input
                                  type="number"
                                  min={1}
                                  placeholder="Ex: 3"
                                  value={edit.custom_duration_days}
                                  onChange={(event) => updateModuleEdit(moduleItem.module_id, { custom_duration_days: event.target.value })}
                                  disabled={!moduleItem.is_enabled}
                                  className="timeline-days-input"
                                />
                              </label>
                              <label className="journey-module-notes">
                                Observação do módulo
                                <textarea
                                  rows={2}
                                  placeholder="Contexto interno deste módulo para o cliente."
                                  value={edit.notes}
                                  onChange={(event) => updateModuleEdit(moduleItem.module_id, { notes: event.target.value })}
                                  disabled={!moduleItem.is_enabled}
                                  className="timeline-notes-input"
                                />
                              </label>
                            </div>
                            <div className="actions timeline-actions journey-module-actions journey-module-actions-primary">
                              <button
                                type="button"
                                onClick={() => saveModuleProgress(moduleItem.module_id)}
                                disabled={!moduleItem.is_enabled || savingModuleId === moduleItem.module_id}
                              >
                                Salvar módulo
                              </button>
                            </div>
                            <div className="actions timeline-actions journey-module-actions journey-module-actions-secondary">
                              <button
                                type="button"
                                onClick={() => markDone(moduleItem.module_id)}
                                disabled={!moduleItem.is_enabled || savingModuleId === moduleItem.module_id}
                              >
                                Concluir (Admin)
                              </button>
                              <button
                                type="button"
                                onClick={() => undoDone(moduleItem.module_id)}
                                disabled={!moduleItem.is_enabled || moduleItem.status !== 'Concluido' || savingModuleId === moduleItem.module_id}
                              >
                                Desfazer conclusão
                              </button>
                              <button type="button" onClick={() => toggleModule(moduleItem.module_id, Boolean(moduleItem.is_enabled))}>
                                {moduleItem.is_enabled ? 'Desativar módulo' : 'Ativar módulo'}
                              </button>
                            </div>
                          </div>
                          </div>
                        </div>
                      </li>
                    );
                  })
                )}
                </ul>
                {disabledCount > 0 && showDisabledModules ? (
                  <div className="journey-disabled-block" id={disabledModulesPanelId}>
                    <div className="journey-disabled-list">
                      {disabledTimeline.map((moduleItem: any) => (
                        <div key={moduleItem.module_id} className="journey-disabled-item">
                          <div className="timeline-copy">
                            <strong>{moduleItem.code} - {moduleItem.name}</strong>
                            <p>{moduleItem.category} | padrão: {moduleItem.duration_days} diárias</p>
                          </div>
                          <div className="actions timeline-actions">
                            <button type="button" onClick={() => toggleModule(moduleItem.module_id, Boolean(moduleItem.is_enabled))}>
                              Ativar módulo
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </Section>

          <Section
            title="Opcionais"
            action={(
              <button
                type="button"
                className="section-collapse-btn"
                onClick={() => setShowOptionalsSection((prev) => !prev)}
                aria-expanded={showOptionalsSection}
                aria-label={showOptionalsSection ? 'Minimizar opcionais' : 'Expandir opcionais'}
              >
                {showOptionalsSection ? '−' : '+'}
              </button>
            )}
          >
            {showOptionalsSection ? (
              <div className="table-wrap">
                <table className="table table-hover table-tight">
                  <thead><tr><th>Código</th><th>Nome</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.optionals.map((optionalItem: any) => (
                      <tr key={optionalItem.id}>
                        <td>{optionalItem.code}</td>
                        <td>{optionalItem.name}</td>
                        <td><StatusChip value={optionalItem.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Section>

          <Section
            title="Histórico de turmas"
            action={(
              <button
                type="button"
                className="section-collapse-btn"
                onClick={() => setShowHistorySection((prev) => !prev)}
                aria-expanded={showHistorySection}
                aria-label={showHistorySection ? 'Minimizar histórico de turmas' : 'Expandir histórico de turmas'}
              >
                {showHistorySection ? '−' : '+'}
              </button>
            )}
          >
            {showHistorySection ? (
              <div className="table-wrap">
                <table className="table table-hover table-tight">
                  <thead><tr>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('cohort_code')}>Turma{historySortIndicator('cohort_code')}</button></th>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('start_date')}>Data{historySortIndicator('start_date')}</button></th>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('module_code')}>Módulo{historySortIndicator('module_code')}</button></th>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('entry_day')}>Dia de entrada{historySortIndicator('entry_day')}</button></th>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('status')}>Status alocação{historySortIndicator('status')}</button></th>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('cohort_status')}>Status turma{historySortIndicator('cohort_status')}</button></th>
                    <th><button type="button" className="table-sort-btn" onClick={() => toggleHistorySort('executed_at')}>Executado em{historySortIndicator('executed_at')}</button></th>
                  </tr></thead>
                  <tbody>
                    {sortedHistory.map((historyItem: any) => (
                      <tr key={historyItem.allocation_id}>
                        <td>{historyItem.cohort_code} - {historyItem.cohort_name}</td>
                        <td>{historyItem.start_date}</td>
                        <td>{historyItem.module_code} - {historyItem.module_name}</td>
                        <td>{historyItem.entry_day}</td>
                        <td><StatusChip value={historyItem.status} /></td>
                        <td><StatusChip value={historyItem.cohort_status} /></td>
                        <td>{historyItem.executed_at ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Section>
        </>
      )}
    </div>
  );
}
