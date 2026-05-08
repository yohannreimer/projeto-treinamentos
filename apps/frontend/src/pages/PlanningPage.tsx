import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../services/api';
import type { Module, PlanningCohort, PlanningEncounter, PlanningEncounterStatus, PlanningMode, PlanningWorkspaceDetail } from '../types';

type WorkspaceSummary = {
  id: string;
  name: string;
  status: string;
  client_count: number;
  encounter_count: number;
};

type CatalogCompany = {
  id: string;
  name: string;
  status?: string;
};

type CatalogTechnician = {
  id: string;
  name: string;
};

type PlanningPageProps = {
  detailReloadKey?: number;
};

type SavingEncounterState = {
  workspaceId: string;
  encounterId: string;
} | null;

type PlanningViewMode = 'week' | 'month' | 'range' | 'list';

type CohortDraft = {
  companyId: string;
  moduleId: string;
  technicianId: string;
  startDate: string;
  startTime: string;
  endTime: string;
  encounterCount: number;
  cadence: 'daily' | 'twice_week' | 'weekly';
  deliveryMode: 'Online' | 'Presencial' | 'Hibrida';
  notes: string;
};

const emptyEncounterDraft = {
  technician_id: '',
  day_date: '',
  start_time: '',
  end_time: '',
  status: 'Rascunho' as PlanningEncounterStatus,
  notes: ''
};

const encounterStatuses: PlanningEncounterStatus[] = ['Rascunho', 'Confirmacao_cliente', 'Confirmado', 'Publicado', 'Cancelado'];
const planningModes: PlanningMode[] = ['Manual', 'Assistido', 'Automatico'];
const viewModes: Array<{ id: PlanningViewMode; label: string; days: number }> = [
  { id: 'week', label: 'Semana', days: 7 },
  { id: 'month', label: '30 dias', days: 30 },
  { id: 'range', label: '60 dias', days: 60 },
  { id: 'list', label: 'Lista', days: 60 }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateIso: string, amount: number) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function shortDateLabel(dateIso: string) {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function weekdayLabel(dateIso: string) {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day))).replace('.', '');
}

function buildDateRange(startDate: string, days: number) {
  return Array.from({ length: days }, (_, index) => addDaysIso(startDate, index));
}

function sortEncounterPairs(pairs: Array<{ cohort: PlanningCohort; encounter: PlanningEncounter }>) {
  return [...pairs].sort((left, right) => (
    `${left.encounter.day_date} ${left.encounter.start_time} ${left.cohort.company_name}`.localeCompare(
      `${right.encounter.day_date} ${right.encounter.start_time} ${right.cohort.company_name}`
    )
  ));
}

function nextCadenceDate(currentDate: string, cadence: CohortDraft['cadence'], index: number) {
  if (cadence === 'weekly') return addDaysIso(currentDate, 7);
  if (cadence === 'twice_week') return addDaysIso(currentDate, index % 2 === 0 ? 2 : 5);
  return addDaysIso(currentDate, 1);
}

export function encounterGridStyle(startTime: string, endTime: string): { top: string; height: string } {
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  const total = dayEnd - dayStart;
  const start = Math.max(dayStart, Math.min(dayEnd, minutes(startTime)));
  const end = Math.max(start + 15, Math.min(dayEnd, minutes(endTime)));

  return {
    top: `${Math.round(((start - dayStart) / total) * 100)}%`,
    height: `${Math.round(((end - start) / total) * 100)}%`
  };
}

export function PlanningPage({ detailReloadKey = 0 }: PlanningPageProps = {}) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [planningDetail, setPlanningDetail] = useState<PlanningWorkspaceDetail | null>(null);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [encounterDraft, setEncounterDraft] = useState(emptyEncounterDraft);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [savingEncounters, setSavingEncounters] = useState<NonNullable<SavingEncounterState>[]>([]);
  const [publishingWorkspaceId, setPublishingWorkspaceId] = useState<string | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isCreatingCohort, setIsCreatingCohort] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<CatalogCompany[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [technicians, setTechnicians] = useState<CatalogTechnician[]>([]);
  const [viewMode, setViewMode] = useState<PlanningViewMode>('week');
  const [rangeStartDate, setRangeStartDate] = useState(todayIso());
  const [technicianFilterId, setTechnicianFilterId] = useState('');
  const [clientFilterId, setClientFilterId] = useState('');
  const [technicianPoolIds, setTechnicianPoolIds] = useState<string[]>([]);
  const [workspaceDraft, setWorkspaceDraft] = useState({
    name: `Planejamento ${shortDateLabel(todayIso())}`,
    mode: 'Manual' as PlanningMode,
    horizonDays: 60,
    notes: ''
  });
  const [cohortDraft, setCohortDraft] = useState<CohortDraft>({
    companyId: '',
    moduleId: '',
    technicianId: '',
    startDate: todayIso(),
    startTime: '08:00',
    endTime: '12:00',
    encounterCount: 2,
    cadence: 'daily',
    deliveryMode: 'Online',
    notes: ''
  });
  const selectedEncounterIdRef = useRef<string | null>(null);
  const selectedWorkspaceIdRef = useRef('');
  const detailWorkspaceIdRef = useRef('');

  useEffect(() => {
    selectedEncounterIdRef.current = selectedEncounterId;
  }, [selectedEncounterId]);

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId;
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let isCurrent = true;

    async function loadCatalogs() {
      try {
        const [companyRows, moduleRows, technicianRows] = await Promise.all([
          api.companies() as Promise<CatalogCompany[]>,
          api.modules() as Promise<Module[]>,
          api.technicians() as Promise<CatalogTechnician[]>
        ]);
        if (!isCurrent) return;
        setCompanies(companyRows ?? []);
        setModules((moduleRows ?? []).filter((module) => module.delivery_mode !== 'entregavel'));
        setTechnicians(technicianRows ?? []);
      } catch {
        if (!isCurrent) return;
        setCompanies([]);
        setModules([]);
        setTechnicians([]);
      }
    }

    loadCatalogs();

    return () => {
      isCurrent = false;
    };
  }, []);

  async function reloadWorkspaceList(preferredWorkspaceId?: string) {
    const payload = await api.planningWorkspaces();
    setWorkspaces(payload.workspaces);
    setSelectedWorkspaceId((currentId) => {
      const nextWorkspaceId =
        preferredWorkspaceId ||
        (currentId && payload.workspaces.some((workspace) => workspace.id === currentId) ? currentId : '') ||
        payload.workspaces[0]?.id ||
        '';
      selectedWorkspaceIdRef.current = nextWorkspaceId;
      return nextWorkspaceId;
    });
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadWorkspaces() {
      try {
        setError('');
        const payload = await api.planningWorkspaces();
        if (!isCurrent) return;
        setWorkspaces(payload.workspaces);
        setSelectedWorkspaceId((currentId) => {
          const nextWorkspaceId = currentId || payload.workspaces[0]?.id || '';
          selectedWorkspaceIdRef.current = nextWorkspaceId;
          return nextWorkspaceId;
        });
      } catch (requestError) {
        if (!isCurrent) return;
        setError((requestError as Error).message);
      }
    }

    loadWorkspaces();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setPlanningDetail(null);
      setSelectedEncounterId(null);
      setIsLoadingDetail(false);
      return;
    }

    let isCurrent = true;
    const isSameWorkspaceReload = detailWorkspaceIdRef.current === selectedWorkspaceId;
    const encounterIdToPreserve = isSameWorkspaceReload ? selectedEncounterIdRef.current : null;
    detailWorkspaceIdRef.current = selectedWorkspaceId;
    if (!isSameWorkspaceReload) {
      setSelectedEncounterId(null);
      selectedEncounterIdRef.current = null;
    }

    async function loadWorkspace() {
      try {
        setError('');
        setPlanningDetail(null);
        setIsLoadingDetail(true);
        const payload = await api.planningWorkspace(selectedWorkspaceId);
        if (!isCurrent) return;
        const encounters = payload.cohorts.flatMap((cohort) => cohort.encounters);
        const nextSelectedEncounter = encounters.find((encounter) => encounter.id === encounterIdToPreserve) ?? encounters[0] ?? null;
        setPlanningDetail(payload);
        setSelectedEncounterId(nextSelectedEncounter?.id ?? null);
        if (encounters.length > 0 && !encounterIdToPreserve) {
          setRangeStartDate(encounters[0].day_date);
        }
      } catch (requestError) {
        if (!isCurrent) return;
        setPlanningDetail(null);
        setSelectedEncounterId(null);
        setError((requestError as Error).message);
      } finally {
        if (isCurrent) {
          setIsLoadingDetail(false);
        }
      }
    }

    loadWorkspace();

    return () => {
      isCurrent = false;
    };
  }, [selectedWorkspaceId, detailReloadKey]);

  const selectedEncounter = useMemo(() => {
    if (!planningDetail || !selectedEncounterId) return null;
    return planningDetail.cohorts.flatMap((cohort) => cohort.encounters).find((encounter) => encounter.id === selectedEncounterId) ?? null;
  }, [planningDetail, selectedEncounterId]);

  useEffect(() => {
    if (!selectedEncounter) {
      setEncounterDraft(emptyEncounterDraft);
      return;
    }

    setEncounterDraft({
      technician_id: selectedEncounter.technician_id ?? '',
      day_date: selectedEncounter.day_date,
      start_time: selectedEncounter.start_time,
      end_time: selectedEncounter.end_time,
      status: selectedEncounter.status,
      notes: selectedEncounter.notes ?? ''
    });
  }, [selectedEncounter]);

  const selectedCohort = useMemo(() => {
    if (!planningDetail || !selectedEncounter) return null;
    return planningDetail.cohorts.find((cohort) => cohort.id === selectedEncounter.planning_cohort_id) ?? null;
  }, [planningDetail, selectedEncounter]);

  const selectedWorkspace = planningDetail?.workspace ?? null;
  const clients = planningDetail?.clients ?? [];
  const cohorts = planningDetail?.cohorts ?? [];
  const plannedEncounters = useMemo(
    () => sortEncounterPairs(cohorts.flatMap((cohort) => cohort.encounters
      .filter((encounter) => encounter.status !== 'Cancelado')
      .map((encounter) => ({ cohort, encounter })))),
    [cohorts]
  );
  const activeView = viewModes.find((mode) => mode.id === viewMode) ?? viewModes[0];
  const visibleDates = useMemo(() => buildDateRange(rangeStartDate, activeView.days), [activeView.days, rangeStartDate]);
  const visibleEncounterPairs = useMemo(() => {
    const endDate = addDaysIso(rangeStartDate, activeView.days - 1);
    return plannedEncounters.filter(({ cohort, encounter }) => (
      encounter.day_date >= rangeStartDate &&
      encounter.day_date <= endDate &&
      (!technicianFilterId || encounter.technician_id === technicianFilterId || cohort.technician_id === technicianFilterId) &&
      (!clientFilterId || cohort.company_id === clientFilterId)
    ));
  }, [activeView.days, clientFilterId, plannedEncounters, rangeStartDate, technicianFilterId]);
  const hasPendingWorkspaceEncounterSave = Boolean(
    planningDetail && savingEncounters.some((encounter) => encounter.workspaceId === planningDetail.workspace.id)
  );
  const isPublishingWorkspace = publishingWorkspaceId !== null;
  const isPublishBlocked = isPublishingWorkspace || hasPendingWorkspaceEncounterSave || !planningDetail;
  const isSavingSelectedEncounter = Boolean(
    savingEncounters.some((savingEncounter) => (
      planningDetail &&
      selectedEncounter &&
      savingEncounter.workspaceId === planningDetail.workspace.id &&
      savingEncounter.encounterId === selectedEncounter.id
    ))
  );
  const selectedCompany = companies.find((company) => company.id === cohortDraft.companyId);
  const selectedModule = modules.find((module) => module.id === cohortDraft.moduleId);
  const chosenTechnicianIds = technicianPoolIds.length > 0 ? technicianPoolIds : technicians.map((technician) => technician.id);
  const canCreateCohort = Boolean(
    selectedWorkspace &&
    cohortDraft.companyId &&
    cohortDraft.moduleId &&
    cohortDraft.startDate &&
    cohortDraft.startTime &&
    cohortDraft.endTime &&
    minutes(cohortDraft.endTime) > minutes(cohortDraft.startTime) &&
    cohortDraft.encounterCount > 0
  );

  function buildDraftEncounters() {
    const encounters: Array<{ day_date: string; start_time: string; end_time: string; status: PlanningEncounterStatus; notes: string | null }> = [];
    let date = cohortDraft.startDate;

    for (let index = 0; index < cohortDraft.encounterCount; index += 1) {
      encounters.push({
        day_date: date,
        start_time: cohortDraft.startTime,
        end_time: cohortDraft.endTime,
        status: 'Rascunho',
        notes: cohortDraft.notes || null
      });
      date = nextCadenceDate(date, cohortDraft.cadence, index);
    }

    return encounters;
  }

  async function createWorkspace() {
    if (!workspaceDraft.name.trim()) return;

    try {
      setIsCreatingWorkspace(true);
      setError('');
      setMessage('');
      const detail = await api.createPlanningWorkspace({
        name: workspaceDraft.name.trim(),
        mode: workspaceDraft.mode,
        horizon_days: workspaceDraft.horizonDays,
        notes: workspaceDraft.notes || null,
        company_ids: cohortDraft.companyId ? [cohortDraft.companyId] : []
      });
      await reloadWorkspaceList(detail.workspace.id);
      setPlanningDetail(detail);
      setSelectedWorkspaceId(detail.workspace.id);
      setSelectedEncounterId(detail.cohorts[0]?.encounters[0]?.id ?? null);
      setMessage('Planejamento criado. Agora adicione clientes, módulos e encontros.');
    } catch (requestError) {
      setMessage('');
      setError((requestError as Error).message || 'Falha ao criar planejamento.');
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function suggestFirstWindow() {
    if (!cohortDraft.moduleId || technicians.length === 0) return;

    try {
      setIsSuggesting(true);
      setError('');
      setMessage('');
      const duration = minutes(cohortDraft.endTime) > minutes(cohortDraft.startTime)
        ? minutes(cohortDraft.endTime) - minutes(cohortDraft.startTime)
        : 240;
      const suggestions = await api.planningSuggestions({
        module_id: cohortDraft.moduleId,
        technician_ids: chosenTechnicianIds,
        date_from: cohortDraft.startDate,
        date_to: addDaysIso(cohortDraft.startDate, selectedWorkspace?.horizon_days ?? 60),
        duration_minutes: duration,
        max_results: 1
      });
      const suggestion = suggestions.suggestions[0];
      if (!suggestion) {
        setError('Nenhuma janela livre encontrada para os técnicos escolhidos.');
        return;
      }
      setCohortDraft((draft) => ({
        ...draft,
        technicianId: suggestion.technician_id,
        startDate: suggestion.day_date,
        startTime: suggestion.start_time,
        endTime: suggestion.end_time
      }));
      setRangeStartDate(suggestion.day_date);
      setMessage('Sistema encontrou a primeira janela livre para este módulo.');
    } catch (requestError) {
      setMessage('');
      setError((requestError as Error).message || 'Falha ao buscar encaixe.');
    } finally {
      setIsSuggesting(false);
    }
  }

  async function createPlannedCohort() {
    if (!planningDetail || !canCreateCohort || !selectedCompany || !selectedModule) return;

    const workspaceId = planningDetail.workspace.id;
    try {
      setIsCreatingCohort(true);
      setError('');
      setMessage('');
      const created = await api.createPlanningCohort(workspaceId, {
        company_id: cohortDraft.companyId,
        module_id: cohortDraft.moduleId,
        technician_id: cohortDraft.technicianId || null,
        name: `${selectedCompany.name} · ${selectedModule.code}`,
        delivery_mode: cohortDraft.deliveryMode,
        period: minutes(cohortDraft.endTime) - minutes(cohortDraft.startTime) >= 420 ? 'Integral' : 'Meio_periodo',
        notes: cohortDraft.notes || null,
        encounters: buildDraftEncounters()
      });
      const refreshed = await api.planningWorkspace(workspaceId);
      await reloadWorkspaceList(workspaceId);
      setPlanningDetail(refreshed);
      const nextEncounterId = created.encounters[0]?.id ?? refreshed.cohorts.at(-1)?.encounters[0]?.id ?? null;
      selectEncounter(nextEncounterId ?? '');
      setRangeStartDate(cohortDraft.startDate);
      setMessage('Turma planejada criada. Revise bloco por bloco antes de publicar.');
    } catch (requestError) {
      setMessage('');
      setError((requestError as Error).message || 'Falha ao criar turma planejada.');
    } finally {
      setIsCreatingCohort(false);
    }
  }

  async function saveSelectedEncounter() {
    if (hasPendingWorkspaceEncounterSave || !planningDetail || !selectedEncounter) return;

    const savingWorkspaceId = planningDetail.workspace.id;
    const savingEncounterId = selectedEncounter.id;
    try {
      setSavingEncounters((currentSavingEncounters) => [
        ...currentSavingEncounters,
        { workspaceId: savingWorkspaceId, encounterId: savingEncounterId }
      ]);
      setError('');
      setMessage('');
      const updatedDetail = await api.updatePlanningEncounter(planningDetail.workspace.id, selectedEncounter.id, {
        technician_id: encounterDraft.technician_id || null,
        day_date: encounterDraft.day_date,
        start_time: encounterDraft.start_time,
        end_time: encounterDraft.end_time,
        status: encounterDraft.status,
        notes: encounterDraft.notes || null
      });
      const updatedEncounter = updatedDetail.cohorts
        .flatMap((cohort) => cohort.encounters)
        .find((encounter) => encounter.id === savingEncounterId);

      if (selectedWorkspaceIdRef.current !== savingWorkspaceId || selectedEncounterIdRef.current !== savingEncounterId) return;
      setPlanningDetail(updatedDetail);
      setSelectedEncounterId(updatedEncounter?.id ?? null);
      setRangeStartDate(updatedEncounter?.day_date ?? rangeStartDate);
      setMessage('Encontro atualizado. Publique para sincronizar turmas e calendário.');
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId || selectedEncounterIdRef.current !== savingEncounterId) return;
      setMessage('');
      setError((requestError as Error).message || 'Falha ao atualizar encontro.');
    } finally {
      setSavingEncounters((currentSavingEncounters) => currentSavingEncounters.filter((currentSavingEncounter) => (
        currentSavingEncounter.workspaceId !== savingWorkspaceId ||
        currentSavingEncounter.encounterId !== savingEncounterId
      )));
    }
  }

  async function publishCurrentWorkspace() {
    if (!planningDetail || isPublishBlocked) return;

    const workspaceId = planningDetail.workspace.id;
    try {
      setPublishingWorkspaceId(workspaceId);
      setError('');
      setMessage('');
      const validation = await api.validatePlanningWorkspace(workspaceId);
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      if (!validation.ok) {
        setError(`Planejamento possui ${validation.conflicts.length} conflito(s).`);
        return;
      }

      const result = await api.publishPlanningWorkspace(workspaceId);
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      const refreshed = await api.planningWorkspace(workspaceId);
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      const refreshedEncounters = refreshed.cohorts.flatMap((cohort) => cohort.encounters);
      const nextSelectedEncounter =
        refreshedEncounters.find((encounter) => encounter.id === selectedEncounterIdRef.current) ?? refreshedEncounters[0] ?? null;
      setPlanningDetail(refreshed);
      selectEncounter(nextSelectedEncounter?.id ?? '');
      setMessage(
        `Publicado: ${result.created_cohorts} criada(s), ${result.updated_cohorts} atualizada(s), ${result.encounter_count} encontro(s).`
      );
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      setMessage('');
      setError((requestError as Error).message || 'Falha ao publicar planejamento.');
    } finally {
      setPublishingWorkspaceId((currentWorkspaceId) => (currentWorkspaceId === workspaceId ? null : currentWorkspaceId));
    }
  }

  function renderEncounter(cohort: PlanningCohort, encounter: PlanningEncounter, compact = false) {
    const isSelected = selectedEncounter?.id === encounter.id;

    return (
      <button
        className={`planning-encounter planning-encounter--${encounter.status.toLowerCase()} ${compact ? 'planning-encounter--compact' : ''} ${isSelected ? 'is-selected' : ''}`.trim()}
        key={encounter.id}
        onClick={() => selectEncounter(encounter.id)}
        style={compact ? undefined : encounterGridStyle(encounter.start_time, encounter.end_time)}
        type="button"
      >
        <strong>{encounter.start_time} - {encounter.end_time}</strong>
        <span>{cohort.company_name} · {cohort.module_code}</span>
        <small>{encounter.technician_name ?? cohort.technician_name ?? 'Sem técnico'}</small>
      </button>
    );
  }

  function selectWorkspace(workspaceId: string) {
    selectedWorkspaceIdRef.current = workspaceId;
    setSelectedWorkspaceId(workspaceId);
  }

  function selectEncounter(encounterId: string) {
    selectedEncounterIdRef.current = encounterId || null;
    setSelectedEncounterId(encounterId || null);
  }

  function moveRange(amount: number) {
    setRangeStartDate((currentDate) => addDaysIso(currentDate, amount));
  }

  function toggleTechnicianPool(technicianId: string) {
    setTechnicianPoolIds((currentIds) => (
      currentIds.includes(technicianId)
        ? currentIds.filter((id) => id !== technicianId)
        : [...currentIds, technicianId]
    ));
  }

  function renderCalendarBody() {
    if (isLoadingDetail) return <p>Carregando encontros do planejamento.</p>;
    if (visibleEncounterPairs.length === 0) return <p>Nenhum encontro neste recorte. Ajuste período, técnico ou cliente.</p>;

    if (viewMode === 'list') {
      return (
        <div className="planning-list-table">
          {visibleEncounterPairs.map(({ cohort, encounter }) => (
            <button
              className={`planning-list-row ${selectedEncounter?.id === encounter.id ? 'is-selected' : ''}`.trim()}
              key={encounter.id}
              onClick={() => selectEncounter(encounter.id)}
              type="button"
            >
              <span>{shortDateLabel(encounter.day_date)}</span>
              <strong>{encounter.start_time} - {encounter.end_time}</strong>
              <span>{cohort.company_name}</span>
              <span>{cohort.module_code}</span>
              <span>{encounter.technician_name ?? cohort.technician_name ?? 'Sem técnico'}</span>
              <small>{encounter.status}</small>
            </button>
          ))}
        </div>
      );
    }

    if (viewMode === 'week') {
      return (
        <div className="planning-week-board">
          {visibleDates.map((date) => {
            const dayPairs = visibleEncounterPairs.filter(({ encounter }) => encounter.day_date === date);

            return (
              <section className="planning-day-lane" key={date}>
                <header>
                  <strong>{weekdayLabel(date)}</strong>
                  <span>{shortDateLabel(date)}</span>
                </header>
                <div className="planning-day-hours">
                  {dayPairs.map(({ cohort, encounter }) => renderEncounter(cohort, encounter))}
                </div>
              </section>
            );
          })}
        </div>
      );
    }

    return (
      <div className="planning-range-board" style={{ gridTemplateColumns: `repeat(${visibleDates.length}, minmax(104px, 1fr))` }}>
        {visibleDates.map((date) => {
          const dayPairs = visibleEncounterPairs.filter(({ encounter }) => encounter.day_date === date);

          return (
            <section className="planning-range-day" key={date}>
              <header>
                <strong>{shortDateLabel(date)}</strong>
                <span>{weekdayLabel(date)}</span>
              </header>
              {dayPairs.length === 0 ? <small className="planning-empty-day">Livre</small> : null}
              {dayPairs.map(({ cohort, encounter }) => renderEncounter(cohort, encounter, true))}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="page planning-page">
      <header className="page-header planning-page-header">
        <div>
          <h1>Planejar</h1>
          <p>Monte clientes, módulos, técnicos e horários reais antes de publicar turmas na agenda.</p>
        </div>

        <div className="planning-workspace-switcher">
          <label>
            Workspace
            <select value={selectedWorkspaceId} onChange={(event) => selectWorkspace(event.target.value)}>
              {workspaces.length === 0 ? <option value="">Nenhum workspace</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {message ? <p className="success" role="status" aria-live="polite">{message}</p> : null}
      {error ? <p className="error" role="alert" aria-live="assertive">{error}</p> : null}

      <section className="planning-control-strip" aria-label="Criacao de planejamento e turmas">
        <div className="planning-control-card planning-control-card--workspace">
          <div className="planning-control-title">
            <strong>Novo planejamento</strong>
            <span>{workspaces.length} salvo(s)</span>
          </div>
          <label>
            Nome
            <input
              value={workspaceDraft.name}
              onChange={(event) => setWorkspaceDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
          </label>
          <label>
            Modo
            <select
              value={workspaceDraft.mode}
              onChange={(event) => setWorkspaceDraft((draft) => ({ ...draft, mode: event.target.value as PlanningMode }))}
            >
              {planningModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label>
            Horizonte
            <input
              min={7}
              max={120}
              type="number"
              value={workspaceDraft.horizonDays}
              onChange={(event) => setWorkspaceDraft((draft) => ({ ...draft, horizonDays: Number(event.target.value) }))}
            />
          </label>
          <button type="button" disabled={isCreatingWorkspace || !workspaceDraft.name.trim()} onClick={createWorkspace}>
            {isCreatingWorkspace ? 'Criando...' : 'Criar'}
          </button>
        </div>

        <div className="planning-control-card planning-control-card--cohort">
          <div className="planning-control-title">
            <strong>Montar turma</strong>
            <span>{selectedWorkspace ? selectedWorkspace.mode : 'Escolha um workspace'}</span>
          </div>
          <label>
            Cliente
            <select
              value={cohortDraft.companyId}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, companyId: event.target.value }))}
            >
              <option value="">Selecionar</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label>
            Módulo
            <select
              value={cohortDraft.moduleId}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, moduleId: event.target.value }))}
            >
              <option value="">Selecionar</option>
              {modules.map((module) => <option key={module.id} value={module.id}>{module.code} · {module.name}</option>)}
            </select>
          </label>
          <label>
            Técnico final
            <select
              value={cohortDraft.technicianId}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, technicianId: event.target.value }))}
            >
              <option value="">Sistema escolhe/manual depois</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
            </select>
          </label>
          <label>
            Data inicial
            <input
              type="date"
              value={cohortDraft.startDate}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, startDate: event.target.value }))}
            />
          </label>
          <label>
            Hora
            <span className="planning-time-pair">
              <input
                aria-label="Início da turma"
                type="time"
                value={cohortDraft.startTime}
                onChange={(event) => setCohortDraft((draft) => ({ ...draft, startTime: event.target.value }))}
              />
              <input
                aria-label="Fim da turma"
                type="time"
                value={cohortDraft.endTime}
                onChange={(event) => setCohortDraft((draft) => ({ ...draft, endTime: event.target.value }))}
              />
            </span>
          </label>
          <label>
            Encontros
            <input
              min={1}
              max={80}
              type="number"
              value={cohortDraft.encounterCount}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, encounterCount: Number(event.target.value) }))}
            />
          </label>
          <label>
            Ritmo
            <select
              value={cohortDraft.cadence}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, cadence: event.target.value as CohortDraft['cadence'] }))}
            >
              <option value="daily">Dias seguidos</option>
              <option value="twice_week">2x por semana</option>
              <option value="weekly">1x por semana</option>
            </select>
          </label>
          <label>
            Modalidade
            <select
              value={cohortDraft.deliveryMode}
              onChange={(event) => setCohortDraft((draft) => ({ ...draft, deliveryMode: event.target.value as CohortDraft['deliveryMode'] }))}
            >
              <option value="Online">Online</option>
              <option value="Presencial">Presencial</option>
              <option value="Hibrida">Híbrida</option>
            </select>
          </label>
          <div className="planning-technician-pool">
            <span>Técnicos candidatos</span>
            <button type="button" onClick={() => setTechnicianPoolIds([])}>Todos</button>
            {technicians.slice(0, 6).map((technician) => (
              <label key={technician.id}>
                <input
                  checked={technicianPoolIds.includes(technician.id)}
                  type="checkbox"
                  onChange={() => toggleTechnicianPool(technician.id)}
                />
                {technician.name}
              </label>
            ))}
          </div>
          <button type="button" disabled={isSuggesting || !cohortDraft.moduleId || technicians.length === 0} onClick={suggestFirstWindow}>
            {isSuggesting ? 'Buscando...' : 'Sistema alocar'}
          </button>
          <button type="button" disabled={isCreatingCohort || !canCreateCohort} onClick={createPlannedCohort}>
            {isCreatingCohort ? 'Adicionando...' : 'Adicionar turma'}
          </button>
        </div>
      </section>

      <div className="planning-workbench">
        <aside className="planning-queue">
          <div className="planning-panel-header">
            <div>
              <h2>Fila de planejamento</h2>
              <p>{selectedWorkspace ? `${selectedWorkspace.status} · ${selectedWorkspace.mode}` : 'Crie ou selecione um workspace'}</p>
            </div>
          </div>

          <div className="planning-filter-row">
            <span>{clients.length} clientes</span>
            <span>{cohorts.length} turmas</span>
          </div>

          <div className="planning-client-list">
            {isLoadingDetail ? <p>Carregando carteira de planejamento.</p> : null}
            {!isLoadingDetail && clients.length === 0 ? <p>Nenhum cliente neste planejamento. Use "Montar turma" para adicionar o primeiro módulo.</p> : null}
            {!isLoadingDetail && clients.map((client) => {
              const clientCohorts = cohorts.filter((cohort) => cohort.company_id === client.company_id);

              return (
                <section className="planning-client-block" key={client.company_id}>
                  <div className="planning-client-title">
                    <strong>{client.company_name}</strong>
                    <small>{clientCohorts.length} turma(s)</small>
                  </div>

                  {clientCohorts.length === 0 ? <p>Nenhuma turma rascunhada.</p> : null}
                  {clientCohorts.map((cohort) => (
                    <button
                      className="planning-module-row"
                      key={cohort.id}
                      onClick={() => selectEncounter(cohort.encounters[0]?.id ?? '')}
                      type="button"
                    >
                      <strong>{cohort.module_code}</strong>
                      <span>{cohort.module_name}</span>
                      <small>{cohort.encounters.filter((encounter) => encounter.status !== 'Cancelado').length} encontros · {cohort.technician_name ?? 'sem técnico'}</small>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        </aside>

        <section className="planning-calendar" aria-labelledby="planning-calendar-title">
          <div className="planning-panel-header">
            <div>
              <h2 id="planning-calendar-title">Agenda por horário</h2>
              <p>{isLoadingDetail ? 'Carregando grade' : selectedWorkspace ? `${selectedWorkspace.horizon_days} dias de horizonte` : 'Crie um planejamento'}</p>
            </div>
            <button type="button" disabled={isPublishBlocked} onClick={publishCurrentWorkspace}>
              {isPublishingWorkspace ? 'Publicando...' : hasPendingWorkspaceEncounterSave ? 'Aguardando salvamento' : 'Publicar alterações válidas'}
            </button>
          </div>

          <div className="planning-calendar-tools">
            <div className="planning-zoom-tabs" role="group" aria-label="Escala da agenda">
              {viewModes.map((mode) => (
                <button
                  aria-pressed={viewMode === mode.id}
                  className={viewMode === mode.id ? 'is-selected' : ''}
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="planning-range-controls">
              <button type="button" onClick={() => moveRange(-activeView.days)}>Anterior</button>
              <input
                aria-label="Data inicial da agenda"
                type="date"
                value={rangeStartDate}
                onChange={(event) => setRangeStartDate(event.target.value)}
              />
              <button type="button" onClick={() => moveRange(activeView.days)}>Próximo</button>
            </div>
            <label>
              Cliente
              <select value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
                <option value="">Todos</option>
                {clients.map((client) => <option key={client.company_id} value={client.company_id}>{client.company_name}</option>)}
              </select>
            </label>
            <label>
              Técnico
              <select value={technicianFilterId} onChange={(event) => setTechnicianFilterId(event.target.value)}>
                <option value="">Todos</option>
                {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
              </select>
            </label>
          </div>

          <div className="planning-time-grid">
            {renderCalendarBody()}
          </div>
        </section>

        <aside className="planning-context-panel">
          <div className="planning-panel-header">
            <div>
              <h2>Painel contextual</h2>
              <p>Edite somente o bloco selecionado</p>
            </div>
          </div>

          <div className="planning-editor-summary">
            {isLoadingDetail ? (
              <p>Carregando painel contextual.</p>
            ) : selectedEncounter && selectedCohort ? (
              <>
                <dl>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{selectedCohort.company_name}</dd>
                  </div>
                  <div>
                    <dt>Módulo</dt>
                    <dd>{selectedCohort.module_code} · {selectedCohort.module_name}</dd>
                  </div>
                  <div>
                    <dt>Agenda</dt>
                    <dd>{selectedEncounter.day_date}, {selectedEncounter.start_time} - {selectedEncounter.end_time}</dd>
                  </div>
                  <div>
                    <dt>Técnico</dt>
                    <dd>{selectedEncounter.technician_name || selectedCohort.technician_name || 'Não definido'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{selectedEncounter.status}</dd>
                  </div>
                </dl>
                <div className="planning-editor-grid">
                  <label>
                    Data
                    <input
                      disabled={isSavingSelectedEncounter}
                      type="date"
                      value={encounterDraft.day_date}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, day_date: event.target.value }))}
                    />
                  </label>
                  <label>
                    Início
                    <input
                      disabled={isSavingSelectedEncounter}
                      type="time"
                      value={encounterDraft.start_time}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, start_time: event.target.value }))}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      disabled={isSavingSelectedEncounter}
                      type="time"
                      value={encounterDraft.end_time}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, end_time: event.target.value }))}
                    />
                  </label>
                  <label>
                    Técnico
                    <select
                      disabled={isSavingSelectedEncounter}
                      value={encounterDraft.technician_id}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, technician_id: event.target.value }))}
                    >
                      <option value="">Sem técnico</option>
                      {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      disabled={isSavingSelectedEncounter}
                      value={encounterDraft.status}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, status: event.target.value as PlanningEncounterStatus }))}
                    >
                      {encounterStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Observações
                    <textarea
                      disabled={isSavingSelectedEncounter}
                      value={encounterDraft.notes}
                      onChange={(event) => setEncounterDraft((draft) => ({ ...draft, notes: event.target.value }))}
                    />
                  </label>
                </div>
                <button type="button" disabled={hasPendingWorkspaceEncounterSave} onClick={saveSelectedEncounter}>
                  {isSavingSelectedEncounter ? 'Salvando...' : hasPendingWorkspaceEncounterSave ? 'Aguardando salvamento' : 'Salvar encontro'}
                </button>
              </>
            ) : (
              <p>Selecione um encontro para revisar cliente, módulo, técnico e horário antes da publicação.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
