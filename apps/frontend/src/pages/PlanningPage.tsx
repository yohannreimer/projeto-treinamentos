import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';

import { ApiRequestError, api } from '../services/api';
import type { Module, PlanningCohort, PlanningEncounter, PlanningEncounterStatus, PlanningWorkspaceDetail } from '../types';

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

type PlanningViewMode = 'week' | 'month' | 'range' | 'quarter' | 'list';

type ModuleComposer = {
  encounterCount: number;
  period: 'Meio_periodo' | 'Integral';
  technicianId: string;
  startDate: string;
  startTime: string;
  endTime: string;
  cadence: 'daily' | 'twice_week' | 'weekly';
  deliveryMode: 'Online' | 'Presencial' | 'Hibrida';
};

type PlanningActivity = {
  id: string;
  title: string;
  activity_type: string;
  status: string;
  company_id: string | null;
  company_name: string | null;
  technician_ids: string[];
  technician_names: string[];
  occurrences: Array<{
    day_date: string;
    all_day: boolean;
    start_time: string | null;
    end_time: string | null;
  }>;
};

type PlanningCalendarCohort = {
  id: string;
  code: string;
  name: string;
  status: string;
  technician_id: string | null;
  technician_name: string | null;
  company_ids: string[];
  company_names: string[];
  module_names: string[];
  occurrences: Array<{
    day_index: number;
    day_date: string;
    start_time: string | null;
    end_time: string | null;
    technician_id: string | null;
  }>;
};

type PlanningDragItem =
  | { type: 'planning'; encounterId: string }
  | { type: 'cohort'; cohortId: string; dayIndex: number; dayDate: string }
  | { type: 'activity'; activityId: string; dayDate: string };

type PublishIssue = {
  cohortId: string;
  message: string;
};

type CohortVisual = {
  index: number;
  color: string;
  softColor: string;
};

type PlanningConflictPayload = {
  source_type?: string;
  title?: string;
  day_date?: string;
  start_time?: string | null;
  end_time?: string | null;
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
const viewModes: Array<{ id: PlanningViewMode; label: string; days: number }> = [
  { id: 'week', label: 'Semana', days: 7 },
  { id: 'month', label: '30 dias', days: 30 },
  { id: 'range', label: '60 dias', days: 60 },
  { id: 'quarter', label: '90 dias', days: 90 },
  { id: 'list', label: 'Lista', days: 60 }
];
const cohortPalette: Array<{ color: string; softColor: string }> = [
  { color: '#ef2f0f', softColor: '#fff0ec' },
  { color: '#1f8a5b', softColor: '#eaf8f0' },
  { color: '#2458d3', softColor: '#edf3ff' },
  { color: '#b56b00', softColor: '#fff5df' },
  { color: '#7a4cc2', softColor: '#f4efff' },
  { color: '#087b8f', softColor: '#e8f8fb' },
  { color: '#bf2f65', softColor: '#fff0f6' },
  { color: '#59611f', softColor: '#f5f7df' }
];
const PLANNING_DRAG_TYPE = 'text/planning-item-type';
const PLANNING_DRAG_ENCOUNTER_ID = 'text/planning-encounter-id';
const PLANNING_DRAG_COHORT_ID = 'text/planning-cohort-id';
const PLANNING_DRAG_COHORT_DAY_INDEX = 'text/planning-cohort-day-index';
const PLANNING_DRAG_DAY_DATE = 'text/planning-day-date';
const PLANNING_DRAG_ACTIVITY_ID = 'text/planning-activity-id';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function currentWeekMondayIso() {
  const today = new Date();
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(dateIso: string, amount: number) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function sortIsoDates(dates: string[]) {
  return [...dates].sort((left, right) => left.localeCompare(right));
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

function splitPipeList(value: string) {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function externalCohortOccurrenceTechnicianId(externalCohort: PlanningCalendarCohort, occurrence: PlanningCalendarCohort['occurrences'][number]) {
  return occurrence.technician_id ?? externalCohort.technician_id ?? null;
}

function normalizeActivityRows(rows: Array<Record<string, unknown>>): PlanningActivity[] {
  return rows.map((row) => {
    const selectedDates = splitPipeList(String(row.selected_dates_raw ?? ''));
    const daySchedules = String(row.day_schedules_raw ?? '').split(' || ').map((schedule) => schedule.trim()).filter(Boolean).map((schedule) => {
      const parts = schedule.includes('::') ? schedule.split('::') : schedule.split('|');
      const [dayDate, allDayRaw, startTime, endTime] = parts;
      return {
        day_date: dayDate,
        all_day: allDayRaw === '1',
        start_time: startTime || null,
        end_time: endTime || null
      };
    }).filter((schedule) => schedule.day_date);
    const fallbackDates = selectedDates.length > 0
      ? selectedDates
      : buildDateRange(String(row.start_date), Math.max(1, Math.floor((Date.parse(String(row.end_date || row.start_date)) - Date.parse(String(row.start_date))) / 86400000) + 1));

    return {
      id: String(row.id),
      title: String(row.title ?? 'Atividade'),
      activity_type: String(row.activity_type ?? 'Outro'),
      status: String(row.status ?? 'Planejada'),
      company_id: String(row.company_id ?? '').trim() || null,
      company_name: String(row.company_name ?? '').trim() || null,
      technician_ids: splitPipeList(String(row.technician_ids_raw ?? '')),
      technician_names: splitPipeList(String(row.technician_names ?? '')),
      occurrences: fallbackDates.map((date) => {
        const daySchedule = daySchedules.find((schedule) => schedule.day_date === date);
        return {
          day_date: date,
          all_day: daySchedule?.all_day ?? Number(row.all_day) === 1,
          start_time: daySchedule?.start_time ?? (String(row.start_time ?? '').trim() || null),
          end_time: daySchedule?.end_time ?? (String(row.end_time ?? '').trim() || null)
        };
      })
    };
  }).filter((activity) => activity.status !== 'Cancelada');
}

function normalizeCalendarCohortRows(rows: Array<Record<string, unknown>>): PlanningCalendarCohort[] {
  return rows.map((row) => {
    const rawSchedule = String(row.schedule_days_raw ?? '');
    const scheduleOccurrences = rawSchedule.split(' || ').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const parts = entry.includes('::') ? entry.split('::') : entry.split('|');
      const [dayIndexRaw, dayDate, startTime, endTime, technicianId] = parts;
      return {
        day_index: Number(dayIndexRaw) || 0,
        day_date: dayDate,
        start_time: startTime || String(row.start_time ?? '').trim() || null,
        end_time: endTime || String(row.end_time ?? '').trim() || null,
        technician_id: technicianId || null
      };
    }).filter((occurrence) => occurrence.day_date);
    const fallbackDuration = Math.max(1, Number(row.total_duration_days ?? 1) || 1);
    const fallbackOccurrences = buildDateRange(String(row.start_date), fallbackDuration).map((dayDate, index) => ({
      day_index: index,
      day_date: dayDate,
      start_time: String(row.start_time ?? '').trim() || null,
      end_time: String(row.end_time ?? '').trim() || null,
      technician_id: null
    }));

    return {
      id: String(row.id),
      code: String(row.code ?? ''),
      name: String(row.name ?? 'Turma'),
      status: String(row.status ?? ''),
      technician_id: String(row.technician_id ?? '').trim() || null,
      technician_name: String(row.technician_name ?? '').trim() || null,
      company_ids: splitPipeList(String(row.company_ids ?? '')),
      company_names: splitPipeList(String(row.company_names ?? row.participant_names ?? '')),
      module_names: splitPipeList(String(row.module_names ?? '')),
      occurrences: scheduleOccurrences.length > 0 ? scheduleOccurrences : fallbackOccurrences
    };
  }).filter((cohort) => !['Cancelado', 'Cancelada'].includes(cohort.status));
}

function sortEncounterPairs(pairs: Array<{ cohort: PlanningCohort; encounter: PlanningEncounter }>) {
  return [...pairs].sort((left, right) => (
    `${left.encounter.day_date} ${left.encounter.start_time} ${left.cohort.company_name}`.localeCompare(
      `${right.encounter.day_date} ${right.encounter.start_time} ${right.cohort.company_name}`
    )
  ));
}

function defaultEncounterCount(module: Module | undefined, period: ModuleComposer['period']) {
  const days = Math.max(1, module?.duration_days ?? 1);
  return period === 'Meio_periodo' ? days * 2 : days;
}

function moduleDisplayLabel(moduleName: string) {
  const afterDash = moduleName.split(' - ').pop()?.trim();
  if (afterDash && afterDash !== moduleName) return afterDash;
  const normalized = moduleName.trim();
  if (/^implantação/i.test(normalized)) return 'Implantação';
  if (/^acompanhamento/i.test(normalized)) return 'Acompanhamento';
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.slice(Math.max(0, words.length - 2)).join(' ') || normalized;
}

function formatConflictTime(conflict: PlanningConflictPayload) {
  const dateLabel = conflict.day_date ? shortDateLabel(conflict.day_date) : 'data selecionada';
  if (!conflict.start_time || !conflict.end_time) return `${dateLabel}, dia inteiro`;
  return `${dateLabel}, das ${conflict.start_time} às ${conflict.end_time}`;
}

function conflictMessage(conflict: PlanningConflictPayload) {
  const title = conflict.title?.trim();
  const timeLabel = formatConflictTime(conflict);
  if (conflict.source_type === 'calendar_activity') {
    return `Esse técnico já tem a atividade "${title || 'atividade do calendário'}" em ${timeLabel}.`;
  }
  if (conflict.source_type === 'cohort') {
    return `Esse técnico já tem a turma "${title || 'turma publicada'}" em ${timeLabel}.`;
  }
  if (conflict.source_type === 'planning_encounter') {
    return `Esse técnico já tem outro encontro planejado em ${timeLabel}.`;
  }
  return `Esse horário já está ocupado em ${timeLabel}.`;
}

function planningErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    const body = error.body as {
      message?: string;
      detail?: string;
      conflicts?: PlanningConflictPayload[];
      unallocated?: unknown[];
    };
    const conflicts = Array.isArray(body.conflicts) ? body.conflicts : [];
    if (conflicts.length > 0) {
      const firstConflict = conflictMessage(conflicts[0]);
      return conflicts.length === 1
        ? firstConflict
        : `${firstConflict} Há mais ${conflicts.length - 1} conflito(s) nesse planejamento.`;
    }
    if (Array.isArray(body.unallocated) && body.unallocated.length > 0) {
      return body.unallocated.length === 1
        ? 'Ainda existe um encontro sem técnico. Encaixe no mapa ou escolha um técnico antes de publicar.'
        : `Ainda existem ${body.unallocated.length} encontros sem técnico. Encaixe todos no mapa antes de publicar.`;
    }
    const detail = body.detail ?? error.message;
    if (/UNIQUE constraint failed: cohort\.code/i.test(detail)) {
      return 'Já existe uma turma publicada com uma identificação igual. Publique novamente para gerar uma identificação livre.';
    }
    if (body.message === 'Não foi possível publicar planejamento.') {
      return body.detail ? `Não foi possível criar as turmas agora. ${body.detail}` : 'Não foi possível criar as turmas agora.';
    }
    return body.message || fallback;
  }

  if (error instanceof Error) {
    if (/^\s*\{/.test(error.message)) return fallback;
    return error.message || fallback;
  }
  return fallback;
}

function encounterHasAllocation(cohort: PlanningCohort, encounter: PlanningEncounter) {
  void cohort;
  return Boolean(encounter.technician_id);
}

function cohortStyle(visual: CohortVisual): CSSProperties {
  return {
    '--planning-accent': visual.color,
    '--planning-accent-soft': visual.softColor
  } as CSSProperties;
}

function emptyComposer(module?: Module): ModuleComposer {
  return {
    encounterCount: defaultEncounterCount(module, 'Meio_periodo'),
    period: 'Meio_periodo',
    technicianId: '',
    startDate: todayIso(),
    startTime: '08:00',
    endTime: '12:00',
    cadence: 'daily',
    deliveryMode: 'Online'
  };
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
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [isCreatingCohort, setIsCreatingCohort] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [movingCalendarItem, setMovingCalendarItem] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<CatalogCompany[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [technicians, setTechnicians] = useState<CatalogTechnician[]>([]);
  const [activities, setActivities] = useState<PlanningActivity[]>([]);
  const [externalCohorts, setExternalCohorts] = useState<PlanningCalendarCohort[]>([]);
  const [viewMode, setViewMode] = useState<PlanningViewMode>('range');
  const [rangeStartDate, setRangeStartDate] = useState(currentWeekMondayIso());
  const [technicianFilterId, setTechnicianFilterId] = useState('');
  const [clientFilterId, setClientFilterId] = useState('');
  const [expandedClientId, setExpandedClientId] = useState('');
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false);
  const [addingClientIds, setAddingClientIds] = useState<string[]>([]);
  const [removingClientIds, setRemovingClientIds] = useState<string[]>([]);
  const [activeModule, setActiveModule] = useState<{ companyId: string; moduleId: string } | null>(null);
  const [composer, setComposer] = useState<ModuleComposer>(() => emptyComposer());
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [workspaceDraftName, setWorkspaceDraftName] = useState(`Planejamento ${shortDateLabel(todayIso())}`);
  const selectedEncounterIdRef = useRef<string | null>(null);
  const selectedWorkspaceIdRef = useRef('');
  const detailWorkspaceIdRef = useRef('');
  const autoExpandedWorkspaceIdRef = useRef('');

  useEffect(() => {
    selectedEncounterIdRef.current = selectedEncounterId;
  }, [selectedEncounterId]);

  useEffect(() => {
    selectedWorkspaceIdRef.current = selectedWorkspaceId;
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!message && !error) return undefined;
    const timeoutId = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, error ? 9000 : 5000);
    return () => window.clearTimeout(timeoutId);
  }, [error, message]);

  async function reloadCalendarSources() {
    const [activityRows, calendarCohortRows] = await Promise.all([
      api.calendarActivities() as Promise<Array<Record<string, unknown>>>,
      api.calendar() as Promise<Array<Record<string, unknown>>>
    ]);
    setActivities(normalizeActivityRows(activityRows ?? []));
    setExternalCohorts(normalizeCalendarCohortRows(calendarCohortRows ?? []));
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadCatalogs() {
      try {
        const [companyRows, moduleRows, technicianRows, activityRows, calendarCohortRows] = await Promise.all([
          api.companies() as Promise<CatalogCompany[]>,
          api.modules() as Promise<Module[]>,
          api.technicians() as Promise<CatalogTechnician[]>,
          api.calendarActivities() as Promise<Array<Record<string, unknown>>>,
          api.calendar() as Promise<Array<Record<string, unknown>>>
        ]);
        if (!isCurrent) return;
        setCompanies(companyRows ?? []);
        setModules((moduleRows ?? []).filter((module) => module.delivery_mode !== 'entregavel'));
        setTechnicians(technicianRows ?? []);
        setActivities(normalizeActivityRows(activityRows ?? []));
        setExternalCohorts(normalizeCalendarCohortRows(calendarCohortRows ?? []));
      } catch {
        if (!isCurrent) return;
        setCompanies([]);
        setModules([]);
        setTechnicians([]);
        setActivities([]);
        setExternalCohorts([]);
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
        setError(planningErrorMessage(requestError, 'Falha ao carregar planejamentos.'));
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
      setExpandedClientId('');
      setActiveModule(null);
      setIsPublishConfirmOpen(false);
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
      } catch (requestError) {
        if (!isCurrent) return;
        setPlanningDetail(null);
        setSelectedEncounterId(null);
        setError(planningErrorMessage(requestError, 'Falha ao carregar o planejamento.'));
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

  useEffect(() => {
    if (!planningDetail || expandedClientId || autoExpandedWorkspaceIdRef.current === planningDetail.workspace.id) return;
    const firstClientId = planningDetail.clients[0]?.company_id || '';
    autoExpandedWorkspaceIdRef.current = planningDetail.workspace.id;
    if (firstClientId) setExpandedClientId(firstClientId);
  }, [expandedClientId, planningDetail]);

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
  const clientRows = useMemo(() => {
    const byId = new Map<string, CatalogCompany>();
    clients.forEach((client) => {
      const catalogCompany = companies.find((company) => company.id === client.company_id);
      byId.set(client.company_id, catalogCompany ?? { id: client.company_id, name: client.company_name });
    });
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [clients, companies]);
  const availableClientRows = useMemo(() => {
    const selectedClientIds = new Set(clients.map((client) => client.company_id));
    return companies
      .filter((company) => !selectedClientIds.has(company.id))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [clients, companies]);
  const plannedEncounters = useMemo(
    () => sortEncounterPairs(cohorts.flatMap((cohort) => cohort.encounters
      .filter((encounter) => encounter.status !== 'Cancelado')
      .map((encounter) => ({ cohort, encounter })))),
    [cohorts]
  );
  const allocatedEncounterPairs = useMemo(
    () => plannedEncounters.filter(({ cohort, encounter }) => encounterHasAllocation(cohort, encounter)),
    [plannedEncounters]
  );
  const pendingEncounterPairs = useMemo(
    () => plannedEncounters.filter(({ cohort, encounter }) => !encounterHasAllocation(cohort, encounter)),
    [plannedEncounters]
  );
  const cohortVisuals = useMemo(() => {
    const visuals = new Map<string, CohortVisual>();
    const stableCohorts = [...cohorts].sort((left, right) => (
      (left.created_at ?? '').localeCompare(right.created_at ?? '') ||
      left.id.localeCompare(right.id)
    ));
    stableCohorts.forEach((cohort, index) => {
      const palette = cohortPalette[index % cohortPalette.length];
      visuals.set(cohort.id, {
        index: index + 1,
        color: palette.color,
        softColor: palette.softColor
      });
    });
    return visuals;
  }, [cohorts]);
  const linkedPublishedCohortIds = useMemo(() => new Set(cohorts
    .map((cohort) => cohort.published_cohort_id)
    .filter((publishedCohortId): publishedCohortId is string => Boolean(publishedCohortId))
  ), [cohorts]);
  const activeView = viewModes.find((mode) => mode.id === viewMode) ?? viewModes[0];
  const visibleDates = useMemo(() => buildDateRange(rangeStartDate, activeView.days), [activeView.days, rangeStartDate]);
  const visibleEncounterPairs = useMemo(() => {
    const endDate = addDaysIso(rangeStartDate, activeView.days - 1);
    return allocatedEncounterPairs.filter(({ cohort, encounter }) => (
      encounter.day_date >= rangeStartDate &&
      encounter.day_date <= endDate &&
      (!technicianFilterId || encounter.technician_id === technicianFilterId) &&
      (!clientFilterId || cohort.company_id === clientFilterId)
    ));
  }, [activeView.days, allocatedEncounterPairs, clientFilterId, rangeStartDate, technicianFilterId]);
  const visibleActivityOccurrences = useMemo(() => {
    const endDate = addDaysIso(rangeStartDate, activeView.days - 1);
    return activities.flatMap((activity) => activity.occurrences.map((occurrence) => ({ activity, occurrence }))).filter(({ activity, occurrence }) => (
      occurrence.day_date >= rangeStartDate &&
      occurrence.day_date <= endDate &&
      (!technicianFilterId || activity.technician_ids.includes(technicianFilterId)) &&
      (!clientFilterId || !activity.company_id || activity.company_id === clientFilterId)
    ));
  }, [activeView.days, activities, clientFilterId, rangeStartDate, technicianFilterId]);
  const visibleExternalCohortOccurrences = useMemo(() => {
    const endDate = addDaysIso(rangeStartDate, activeView.days - 1);
    return externalCohorts
      .filter((externalCohort) => !linkedPublishedCohortIds.has(externalCohort.id))
      .flatMap((externalCohort) => externalCohort.occurrences.map((occurrence) => ({ externalCohort, occurrence })))
      .filter(({ externalCohort, occurrence }) => (
        occurrence.day_date >= rangeStartDate &&
        occurrence.day_date <= endDate &&
        (!technicianFilterId || externalCohortOccurrenceTechnicianId(externalCohort, occurrence) === technicianFilterId) &&
        (!clientFilterId || externalCohort.company_ids.includes(clientFilterId))
      ));
  }, [activeView.days, clientFilterId, externalCohorts, linkedPublishedCohortIds, rangeStartDate, technicianFilterId]);
  const hasPendingWorkspaceEncounterSave = Boolean(
    planningDetail && savingEncounters.some((encounter) => encounter.workspaceId === planningDetail.workspace.id)
  );
  const workspaceConflictCount = allocatedEncounterPairs.filter(({ cohort, encounter }) => hasEncounterConflict(cohort, encounter)).length;
  const isPublishingWorkspace = publishingWorkspaceId !== null;
  const isPublishBlocked = isPublishingWorkspace || hasPendingWorkspaceEncounterSave || workspaceConflictCount > 0 || !planningDetail;
  const isSavingSelectedEncounter = Boolean(
    savingEncounters.some((savingEncounter) => (
      planningDetail &&
      selectedEncounter &&
      savingEncounter.workspaceId === planningDetail.workspace.id &&
      savingEncounter.encounterId === selectedEncounter.id
    ))
  );
  const activeModuleTemplate = activeModule ? modules.find((module) => module.id === activeModule.moduleId) : undefined;
  const activeCompany = activeModule ? clientRows.find((company) => company.id === activeModule.companyId) : undefined;
  const selectedTechnician = technicians.find((technician) => technician.id === technicianFilterId);

  function externalCohortOccurrenceTechnicianName(
    externalCohort: PlanningCalendarCohort,
    occurrence: PlanningCalendarCohort['occurrences'][number]
  ) {
    const technicianId = externalCohortOccurrenceTechnicianId(externalCohort, occurrence);
    if (!technicianId) return 'Sem técnico';
    return technicians.find((technician) => technician.id === technicianId)?.name
      ?? externalCohort.technician_name
      ?? 'Sem técnico';
  }
  const isSelectedEncounterAllocated = Boolean(
    selectedEncounter && selectedCohort && encounterHasAllocation(selectedCohort, selectedEncounter)
  );

  useEffect(() => {
    function handleDeleteSelectedEncounter(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditingText = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable;
      if (isEditingText || (event.key !== 'Delete' && event.key !== 'Backspace') || !isSelectedEncounterAllocated) return;
      event.preventDefault();
      void unassignSelectedEncounter();
    }

    window.addEventListener('keydown', handleDeleteSelectedEncounter);
    return () => window.removeEventListener('keydown', handleDeleteSelectedEncounter);
  }, [isSelectedEncounterAllocated, planningDetail, selectedEncounter, selectedCohort, hasPendingWorkspaceEncounterSave]);

  function expectedEncounterCountForCohort(cohort: PlanningCohort) {
    const module = modules.find((item) => item.id === cohort.module_id);
    return defaultEncounterCount(module, cohort.period);
  }

  const publishIssues = useMemo<PublishIssue[]>(() => {
    return cohorts.flatMap((cohort) => {
      if (cohort.status === 'Cancelado') return [];
      const expectedCount = expectedEncounterCountForCohort(cohort);
      const activeEncounters = cohort.encounters.filter((encounter) => encounter.status !== 'Cancelado');
      const actualCount = activeEncounters.length;
      if (actualCount >= expectedCount) return [];
      return [{
        cohortId: cohort.id,
        message: `${cohort.company_name} · ${moduleDisplayLabel(cohort.module_name)}: falta ${expectedCount - actualCount} encontro(s)`
      }];
    }).concat(cohorts.flatMap((cohort) => {
      if (cohort.status === 'Cancelado') return [];
      const pendingCount = cohort.encounters.filter((encounter) => (
        encounter.status !== 'Cancelado' && !encounterHasAllocation(cohort, encounter)
      )).length;
      if (pendingCount === 0) return [];
      return [{
        cohortId: `${cohort.id}-pending`,
        message: `${cohort.company_name} · ${moduleDisplayLabel(cohort.module_name)}: ${pendingCount} encontro(s) sem encaixe no calendário`
      }];
    }));
  }, [cohorts, modules]);
  const publishReadyCohorts = cohorts.filter((cohort) => cohort.status !== 'Cancelado' && cohort.encounters.some((encounter) => encounter.status !== 'Cancelado'));

  function buildPendingDraftEncounters(source = composer) {
    return Array.from({ length: source.encounterCount }, () => ({
      day_date: rangeStartDate,
      start_time: source.startTime,
      end_time: source.endTime,
      status: 'Rascunho' as PlanningEncounterStatus,
      notes: null
    }));
  }

  function selectModule(companyId: string, moduleId: string) {
    const module = modules.find((item) => item.id === moduleId);
    setExpandedClientId(companyId);
    setActiveModule({ companyId, moduleId });
    setComposer(emptyComposer(module));
    const plannedCohort = cohorts.find((cohort) => cohort.company_id === companyId && cohort.module_id === moduleId);
    const firstEncounter = plannedCohort?.encounters.find((encounter) => encounter.status !== 'Cancelado');
    if (firstEncounter) selectEncounter(firstEncounter.id);
  }

  function updateComposerPeriod(period: ModuleComposer['period']) {
    setComposer((current) => ({
      ...current,
      period,
      encounterCount: defaultEncounterCount(activeModuleTemplate, period),
      startTime: period === 'Integral' ? '08:00' : current.startTime,
      endTime: period === 'Integral' ? '17:00' : current.endTime
    }));
  }

  async function createWorkspace() {
    if (!workspaceDraftName.trim()) return;

    try {
      setIsCreatingWorkspace(true);
      setError('');
      setMessage('');
      const detail = await api.createPlanningWorkspace({
        name: workspaceDraftName.trim(),
        mode: 'Manual',
        horizon_days: 60,
        notes: null,
        company_ids: []
      });
      await reloadWorkspaceList(detail.workspace.id);
      setPlanningDetail(detail);
      setSelectedWorkspaceId(detail.workspace.id);
      setSelectedEncounterId(detail.cohorts[0]?.encounters[0]?.id ?? null);
      setMessage('Planejamento criado.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao criar planejamento.'));
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function deleteSelectedWorkspace() {
    if (!selectedWorkspaceId || !selectedWorkspace) return;
    if (!window.confirm('Excluir este planejamento? As turmas já publicadas continuam no calendário.')) return;

    const workspaceId = selectedWorkspaceId;
    try {
      setDeletingWorkspaceId(workspaceId);
      setError('');
      setMessage('');
      await api.deletePlanningWorkspace(workspaceId);
      const payload = await api.planningWorkspaces();
      const nextWorkspaceId = payload.workspaces[0]?.id ?? '';
      setWorkspaces(payload.workspaces);
      selectedWorkspaceIdRef.current = nextWorkspaceId;
      setSelectedWorkspaceId(nextWorkspaceId);
      setActiveModule(null);
      setExpandedClientId('');
      selectEncounter('');

      if (nextWorkspaceId) {
        const detail = await api.planningWorkspace(nextWorkspaceId);
        if (selectedWorkspaceIdRef.current !== nextWorkspaceId) return;
        setPlanningDetail(detail);
      } else {
        setPlanningDetail(null);
      }
      setMessage('Planejamento excluído.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao excluir planejamento.'));
    } finally {
      setDeletingWorkspaceId((currentWorkspaceId) => (currentWorkspaceId === workspaceId ? null : currentWorkspaceId));
    }
  }

  async function addClientToWorkspace(companyId: string) {
    if (!planningDetail) return;

    const workspaceId = planningDetail.workspace.id;
    try {
      setAddingClientIds((current) => [...current, companyId]);
      setError('');
      setMessage('');
      const detail = await api.addPlanningWorkspaceClients(workspaceId, [companyId]);
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      await reloadWorkspaceList(workspaceId);
      setPlanningDetail(detail);
      setExpandedClientId(companyId);
      setIsClientPickerOpen(false);
      setMessage('Cliente adicionado ao planejamento.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao adicionar cliente.'));
    } finally {
      setAddingClientIds((current) => current.filter((id) => id !== companyId));
    }
  }

  async function removeClientFromWorkspace(companyId: string) {
    if (!planningDetail) return;

    const workspaceId = planningDetail.workspace.id;
    const companyName = clients.find((client) => client.company_id === companyId)?.company_name ?? 'cliente';
    try {
      setRemovingClientIds((current) => [...current, companyId]);
      setError('');
      setMessage('');
      const detail = await api.removePlanningWorkspaceClient(workspaceId, companyId);
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      await reloadWorkspaceList(workspaceId);
      setPlanningDetail(detail);
      if (expandedClientId === companyId) setExpandedClientId('');
      if (activeModule?.companyId === companyId) setActiveModule(null);
      const nextSelectedEncounterStillExists = detail.cohorts.some((cohort) => (
        cohort.encounters.some((encounter) => encounter.id === selectedEncounterIdRef.current)
      ));
      if (!nextSelectedEncounterStillExists) selectEncounter(detail.cohorts[0]?.encounters[0]?.id ?? '');
      setMessage('Cliente removido do planejamento.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, `Falha ao remover ${companyName}.`));
    } finally {
      setRemovingClientIds((current) => current.filter((id) => id !== companyId));
    }
  }

  async function autoAllocateAndCreateModule() {
    if (!activeModule || !activeCompany || !activeModuleTemplate || technicians.length === 0) return;

    try {
      setIsSuggesting(true);
      setError('');
      setMessage('');
      const candidateTechnicianIds = composer.technicianId ? [composer.technicianId] : technicians.map((technician) => technician.id);
      const duration = minutes(composer.endTime) > minutes(composer.startTime)
        ? minutes(composer.endTime) - minutes(composer.startTime)
        : 240;
      const suggestions = await api.planningSuggestions({
        module_id: activeModule.moduleId,
        technician_ids: candidateTechnicianIds,
        date_from: rangeStartDate,
        date_to: addDaysIso(rangeStartDate, selectedWorkspace?.horizon_days ?? 60),
        start_time: composer.startTime,
        end_time: composer.endTime,
        duration_minutes: duration,
        max_results: composer.encounterCount
      });
      const selectedSuggestions = suggestions.suggestions.slice(0, composer.encounterCount);
      if (selectedSuggestions.length < composer.encounterCount) {
        setError(`Sistema encontrou ${selectedSuggestions.length} janela(s), mas este módulo precisa de ${composer.encounterCount}.`);
        return;
      }
      const firstSuggestion = selectedSuggestions[0];
      const nextComposer = {
        ...composer,
        technicianId: firstSuggestion.technician_id,
        startDate: firstSuggestion.day_date,
        startTime: firstSuggestion.start_time,
        endTime: firstSuggestion.end_time
      };
      setComposer(nextComposer);
      setTechnicianFilterId(firstSuggestion.technician_id);
      await createPlannedCohort(nextComposer, selectedSuggestions.map((suggestion) => ({
        day_date: suggestion.day_date,
        start_time: suggestion.start_time,
        end_time: suggestion.end_time,
        status: 'Rascunho' as PlanningEncounterStatus,
        notes: null
      })), true);
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao autoalocar módulo.'));
    } finally {
      setIsSuggesting(false);
    }
  }

  async function createPlannedCohort(source = composer, encounters = buildPendingDraftEncounters(source), allocateOnCalendar = false) {
    if (!planningDetail || !activeModule || !activeCompany || !activeModuleTemplate) return;

    const workspaceId = planningDetail.workspace.id;
    try {
      setIsCreatingCohort(true);
      setError('');
      setMessage('');
      const created = await api.createPlanningCohort(workspaceId, {
        company_id: activeModule.companyId,
        module_id: activeModule.moduleId,
        technician_id: allocateOnCalendar ? source.technicianId || null : null,
        name: `${activeCompany.name} · ${activeModuleTemplate.code}`,
        delivery_mode: source.deliveryMode,
        period: source.period,
        notes: null,
        encounters
      });
      const refreshed = await api.planningWorkspace(workspaceId);
      await reloadWorkspaceList(workspaceId);
      setPlanningDetail(refreshed);
      const nextEncounterId = created.encounters[0]?.id ?? refreshed.cohorts[refreshed.cohorts.length - 1]?.encounters[0]?.id ?? null;
      selectEncounter(nextEncounterId ?? '');
      setMessage(allocateOnCalendar
        ? 'Encontros autoalocados. Ajuste algum bloco se precisar.'
        : 'Encontros pendentes gerados. Arraste cada bloco para o calendário.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao criar turma planejada.'));
    } finally {
      setIsCreatingCohort(false);
    }
  }

  async function addMissingPendingEncounters(cohort: PlanningCohort) {
    if (!planningDetail) return;

    const missingCount = Math.max(0, expectedEncounterCountForCohort(cohort) - cohort.encounters.filter((encounter) => encounter.status !== 'Cancelado').length);
    if (missingCount === 0) return;

    const workspaceId = planningDetail.workspace.id;
    try {
      setIsCreatingCohort(true);
      setError('');
      setMessage('');
      const detail = await api.addPlanningCohortEncounters(workspaceId, cohort.id, {
        technician_id: null,
        encounters: buildPendingDraftEncounters({ ...composer, encounterCount: missingCount })
      });
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      await reloadWorkspaceList(workspaceId);
      setPlanningDetail(detail);
      const nextPending = detail.cohorts
        .find((item) => item.id === cohort.id)
        ?.encounters.find((encounter) => encounter.status !== 'Cancelado' && !encounter.technician_id);
      selectEncounter(nextPending?.id ?? selectedEncounterIdRef.current ?? '');
      setMessage(`${missingCount} encontro(s) pendente(s) gerado(s).`);
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao gerar encontros pendentes.'));
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
      setMessage('Encontro atualizado.');
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId || selectedEncounterIdRef.current !== savingEncounterId) return;
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao atualizar encontro.'));
    } finally {
      setSavingEncounters((currentSavingEncounters) => currentSavingEncounters.filter((currentSavingEncounter) => (
        currentSavingEncounter.workspaceId !== savingWorkspaceId ||
        currentSavingEncounter.encounterId !== savingEncounterId
      )));
    }
  }

  function technicianForDroppedEncounter(cohort: PlanningCohort, encounter: PlanningEncounter, technicianId?: string | null) {
    if (technicianId !== undefined) return technicianId;
    if (encounter.technician_id) return encounter.technician_id;
    if (
      activeModule &&
      activeModule.companyId === cohort.company_id &&
      activeModule.moduleId === cohort.module_id &&
      composer.technicianId
    ) {
      return composer.technicianId;
    }
    return null;
  }

  async function moveEncounterToDate(encounterId: string, dayDate: string, technicianId?: string | null) {
    if (hasPendingWorkspaceEncounterSave || !planningDetail) return;

    const cohort = planningDetail.cohorts.find((item) => item.encounters.some((encounter) => encounter.id === encounterId));
    const encounter = cohort?.encounters.find((item) => item.id === encounterId);
    if (!cohort || !encounter) return;
    const nextTechnicianId = technicianForDroppedEncounter(cohort, encounter, technicianId);
    if (encounter.day_date === dayDate && encounter.technician_id === nextTechnicianId) return;

    const savingWorkspaceId = planningDetail.workspace.id;
    try {
      selectEncounter(encounter.id);
      setSavingEncounters((currentSavingEncounters) => [
        ...currentSavingEncounters,
        { workspaceId: savingWorkspaceId, encounterId: encounter.id }
      ]);
      setError('');
      setMessage('');
      const updatedDetail = await api.updatePlanningEncounter(savingWorkspaceId, encounter.id, {
        technician_id: nextTechnicianId,
        day_date: dayDate,
        start_time: encounter.start_time,
        end_time: encounter.end_time,
        status: encounter.status,
        notes: encounter.notes ?? null
      });
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId) return;
      setPlanningDetail(updatedDetail);
      selectEncounter(encounter.id);
      setMessage('Encontro encaixado no calendário.');
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId) return;
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao mover encontro.'));
    } finally {
      setSavingEncounters((currentSavingEncounters) => currentSavingEncounters.filter((currentSavingEncounter) => (
        currentSavingEncounter.workspaceId !== savingWorkspaceId ||
        currentSavingEncounter.encounterId !== encounter.id
      )));
    }
  }

  function calendarMoveKey(type: 'cohort' | 'activity', id: string, sourceDate: string) {
    return `${type}:${id}:${sourceDate}`;
  }

  async function moveExternalCohortOccurrence(cohortId: string, dayIndex: number, sourceDate: string, targetDate: string) {
    if (movingCalendarItem || sourceDate === targetDate) return;

    const externalCohort = externalCohorts.find((item) => item.id === cohortId);
    if (!externalCohort) return;
    const occurrenceIndex = externalCohort.occurrences.findIndex((occurrence) => (
      occurrence.day_date === sourceDate &&
      (dayIndex > 0 ? occurrence.day_index === dayIndex : true)
    ));
    if (occurrenceIndex < 0) return;

    const moveKey = calendarMoveKey('cohort', cohortId, sourceDate);
    const nextScheduleDays = externalCohort.occurrences
      .map((occurrence, index) => ({
        day_index: occurrence.day_index,
        day_date: index === occurrenceIndex ? targetDate : occurrence.day_date,
        start_time: occurrence.start_time,
        end_time: occurrence.end_time,
        technician_id: occurrence.technician_id
      }))
      .sort((left, right) => (
        left.day_date.localeCompare(right.day_date) ||
        (left.start_time ?? '').localeCompare(right.start_time ?? '') ||
        left.day_index - right.day_index
      ))
      .map((occurrence, index) => ({
        ...occurrence,
        day_index: index + 1
      }));

    try {
      setMovingCalendarItem(moveKey);
      setError('');
      setMessage('');
      await api.updateCohort(cohortId, { schedule_days: nextScheduleDays });
      await reloadCalendarSources();
      setMessage('Dia da turma movido e ordem recalculada.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao mover dia da turma.'));
    } finally {
      setMovingCalendarItem((current) => (current === moveKey ? null : current));
    }
  }

  async function moveActivityOccurrence(activityId: string, sourceDate: string, targetDate: string) {
    if (movingCalendarItem || sourceDate === targetDate) return;

    const activity = activities.find((item) => item.id === activityId);
    if (!activity) return;
    const occurrenceIndex = activity.occurrences.findIndex((occurrence) => occurrence.day_date === sourceDate);
    if (occurrenceIndex < 0) return;
    const targetAlreadyExists = activity.occurrences.some((occurrence, index) => (
      index !== occurrenceIndex && occurrence.day_date === targetDate
    ));
    if (targetAlreadyExists) {
      setMessage('');
      setError('Essa atividade já possui um quadradinho nessa data.');
      return;
    }

    const moveKey = calendarMoveKey('activity', activityId, sourceDate);
    const dateSchedules = activity.occurrences
      .map((occurrence, index) => ({
        day_date: index === occurrenceIndex ? targetDate : occurrence.day_date,
        all_day: occurrence.all_day,
        start_time: occurrence.start_time,
        end_time: occurrence.end_time
      }))
      .sort((left, right) => (
        left.day_date.localeCompare(right.day_date) ||
        (left.start_time ?? '').localeCompare(right.start_time ?? '')
      ));
    const selectedDates = sortIsoDates(dateSchedules.map((occurrence) => occurrence.day_date));

    try {
      setMovingCalendarItem(moveKey);
      setError('');
      setMessage('');
      await api.updateCalendarActivity(activityId, {
        start_date: selectedDates[0] ?? targetDate,
        end_date: selectedDates[selectedDates.length - 1] ?? targetDate,
        selected_dates: selectedDates,
        date_schedules: dateSchedules
      });
      await reloadCalendarSources();
      setMessage('Data da atividade movida no calendário.');
    } catch (requestError) {
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao mover atividade do calendário.'));
    } finally {
      setMovingCalendarItem((current) => (current === moveKey ? null : current));
    }
  }

  async function unassignSelectedEncounter() {
    if (hasPendingWorkspaceEncounterSave || !planningDetail || !selectedEncounter || !selectedCohort) return;

    const savingWorkspaceId = planningDetail.workspace.id;
    const savingEncounterId = selectedEncounter.id;
    try {
      setSavingEncounters((currentSavingEncounters) => [
        ...currentSavingEncounters,
        { workspaceId: savingWorkspaceId, encounterId: savingEncounterId }
      ]);
      setError('');
      setMessage('');
      const updatedDetail = await api.updatePlanningEncounter(savingWorkspaceId, savingEncounterId, {
        technician_id: null,
        day_date: selectedEncounter.day_date,
        start_time: selectedEncounter.start_time,
        end_time: selectedEncounter.end_time,
        status: 'Rascunho',
        notes: selectedEncounter.notes ?? null
      });
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId) return;
      setPlanningDetail(updatedDetail);
      selectEncounter(savingEncounterId);
      setMessage('Encontro voltou para pendentes.');
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== savingWorkspaceId) return;
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao tirar encontro do mapa.'));
    } finally {
      setSavingEncounters((currentSavingEncounters) => currentSavingEncounters.filter((currentSavingEncounter) => (
        currentSavingEncounter.workspaceId !== savingWorkspaceId ||
        currentSavingEncounter.encounterId !== savingEncounterId
      )));
    }
  }

  function openPublishConfirmation() {
    if (!planningDetail || hasPendingWorkspaceEncounterSave || workspaceConflictCount > 0) return;
    setMessage('');
    setError('');
    setIsPublishConfirmOpen(true);
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
        setError(planningErrorMessage(new ApiRequestError('Planejamento possui conflitos.', 409, validation), 'Planejamento possui conflitos.'));
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
      setIsPublishConfirmOpen(false);
      setMessage(
        `Publicado: ${result.created_cohorts} criada(s), ${result.updated_cohorts} atualizada(s), ${result.encounter_count} encontro(s).`
      );
    } catch (requestError) {
      if (selectedWorkspaceIdRef.current !== workspaceId) return;
      setMessage('');
      setError(planningErrorMessage(requestError, 'Falha ao publicar planejamento.'));
    } finally {
      setPublishingWorkspaceId((currentWorkspaceId) => (currentWorkspaceId === workspaceId ? null : currentWorkspaceId));
    }
  }

  function selectWorkspace(workspaceId: string) {
    selectedWorkspaceIdRef.current = workspaceId;
    setSelectedWorkspaceId(workspaceId);
  }

  function selectEncounter(encounterId: string) {
    selectedEncounterIdRef.current = encounterId || null;
    setSelectedEncounterId(encounterId || null);
  }

  function writeDragItem(event: DragEvent<HTMLElement>, item: PlanningDragItem) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(PLANNING_DRAG_TYPE, item.type);

    if (item.type === 'planning') {
      event.dataTransfer.setData(PLANNING_DRAG_ENCOUNTER_ID, item.encounterId);
      return;
    }

    event.dataTransfer.setData(PLANNING_DRAG_DAY_DATE, item.dayDate);
    if (item.type === 'cohort') {
      event.dataTransfer.setData(PLANNING_DRAG_COHORT_ID, item.cohortId);
      event.dataTransfer.setData(PLANNING_DRAG_COHORT_DAY_INDEX, String(item.dayIndex));
      return;
    }

    event.dataTransfer.setData(PLANNING_DRAG_ACTIVITY_ID, item.activityId);
  }

  function readDragItem(event: DragEvent<HTMLElement>): PlanningDragItem | null {
    const type = event.dataTransfer.getData(PLANNING_DRAG_TYPE);
    if (type === 'planning') {
      const encounterId = event.dataTransfer.getData(PLANNING_DRAG_ENCOUNTER_ID);
      return encounterId ? { type, encounterId } : null;
    }
    if (type === 'cohort') {
      const cohortId = event.dataTransfer.getData(PLANNING_DRAG_COHORT_ID);
      const dayIndex = Number(event.dataTransfer.getData(PLANNING_DRAG_COHORT_DAY_INDEX));
      const dayDate = event.dataTransfer.getData(PLANNING_DRAG_DAY_DATE);
      return cohortId && dayDate ? { type, cohortId, dayIndex, dayDate } : null;
    }
    if (type === 'activity') {
      const activityId = event.dataTransfer.getData(PLANNING_DRAG_ACTIVITY_ID);
      const dayDate = event.dataTransfer.getData(PLANNING_DRAG_DAY_DATE);
      return activityId && dayDate ? { type, activityId, dayDate } : null;
    }

    const legacyEncounterId = event.dataTransfer.getData(PLANNING_DRAG_ENCOUNTER_ID);
    return legacyEncounterId ? { type: 'planning', encounterId: legacyEncounterId } : null;
  }

  function handlePlanningDrop(event: DragEvent<HTMLElement>, dayDate: string, technicianId?: string | null) {
    event.preventDefault();
    const item = readDragItem(event);
    if (!item) return;

    if (item.type === 'planning') {
      void moveEncounterToDate(item.encounterId, dayDate, technicianId);
      return;
    }
    if (item.type === 'cohort') {
      void moveExternalCohortOccurrence(item.cohortId, item.dayIndex, item.dayDate, dayDate);
      return;
    }
    void moveActivityOccurrence(item.activityId, item.dayDate, dayDate);
  }

  function moveRange(amount: number) {
    setRangeStartDate((currentDate) => addDaysIso(currentDate, amount));
  }

  function timeSlotsOverlap(leftStart: string, leftEnd: string, rightStart: string | null, rightEnd: string | null) {
    if (!rightStart || !rightEnd) return true;
    return minutes(leftStart) < minutes(rightEnd) && minutes(rightStart) < minutes(leftEnd);
  }

  function hasEncounterConflict(cohort: PlanningCohort, encounter: PlanningEncounter) {
    const technicianId = encounter.technician_id;
    if (!technicianId || encounter.status === 'Cancelado') return false;

    const planningConflict = plannedEncounters.some(({ cohort: otherCohort, encounter: otherEncounter }) => {
      if (otherEncounter.id === encounter.id || otherEncounter.status === 'Cancelado') return false;
      void otherCohort;
      const otherTechnicianId = otherEncounter.technician_id;
      return (
        otherTechnicianId === technicianId &&
        otherEncounter.day_date === encounter.day_date &&
        timeSlotsOverlap(encounter.start_time, encounter.end_time, otherEncounter.start_time, otherEncounter.end_time)
      );
    });
    if (planningConflict) return true;

    const externalCohortConflict = externalCohorts.some((externalCohort) => (
      externalCohort.id !== cohort.published_cohort_id &&
      externalCohort.occurrences.some((occurrence) => (
        externalCohortOccurrenceTechnicianId(externalCohort, occurrence) === technicianId &&
        occurrence.day_date === encounter.day_date &&
        timeSlotsOverlap(encounter.start_time, encounter.end_time, occurrence.start_time, occurrence.end_time)
      ))
    ));
    if (externalCohortConflict) return true;

    return activities.some((activity) => (
      activity.technician_ids.includes(technicianId) &&
      activity.occurrences.some((occurrence) => (
        occurrence.day_date === encounter.day_date &&
        (occurrence.all_day || timeSlotsOverlap(encounter.start_time, encounter.end_time, occurrence.start_time, occurrence.end_time))
      ))
    ));
  }

  function renderActivity(activity: PlanningActivity, occurrence: PlanningActivity['occurrences'][number], compact = false) {
    const startTime = occurrence.all_day ? '08:00' : occurrence.start_time ?? '08:00';
    const endTime = occurrence.all_day ? '18:00' : occurrence.end_time ?? '18:00';

    return (
      <button
        className={`planning-blocker ${compact ? 'planning-blocker--compact' : ''}`.trim()}
        draggable
        key={`${activity.id}-${occurrence.day_date}`}
        onDragStart={(event) => writeDragItem(event, {
          type: 'activity',
          activityId: activity.id,
          dayDate: occurrence.day_date
        })}
        style={compact ? undefined : encounterGridStyle(startTime, endTime)}
        type="button"
      >
        <strong>Atividade · {startTime} - {endTime}</strong>
        <span>{activity.title}</span>
        <small>{activity.technician_names.join(', ') || 'técnico vinculado'}</small>
      </button>
    );
  }

  function renderExternalCohort(
    externalCohort: PlanningCalendarCohort,
    occurrence: PlanningCalendarCohort['occurrences'][number],
    compact = false
  ) {
    const startTime = occurrence.start_time ?? '08:00';
    const endTime = occurrence.end_time ?? '18:00';
    const companyLabel = externalCohort.company_names.join(', ') || 'cliente vinculado';
    const moduleLabel = externalCohort.module_names[0] ? moduleDisplayLabel(externalCohort.module_names[0]) : externalCohort.name || 'Turma publicada';

    return (
      <button
        className={`planning-external-blocker ${compact ? 'planning-external-blocker--compact' : ''}`.trim()}
        draggable
        key={`${externalCohort.id}-${occurrence.day_index}-${occurrence.day_date}`}
        onClick={() => setMessage(`Turma já criada: ${companyLabel} · ${moduleLabel} · ${shortDateLabel(occurrence.day_date)} ${startTime}-${endTime}`)}
        onDragStart={(event) => writeDragItem(event, {
          type: 'cohort',
          cohortId: externalCohort.id,
          dayIndex: occurrence.day_index,
          dayDate: occurrence.day_date
        })}
        style={compact ? undefined : encounterGridStyle(startTime, endTime)}
        type="button"
      >
        <strong>Turma · {startTime} - {endTime}</strong>
        <span>{companyLabel}</span>
        <small>{moduleLabel} · {externalCohortOccurrenceTechnicianName(externalCohort, occurrence)}</small>
      </button>
    );
  }

  function renderEncounter(cohort: PlanningCohort, encounter: PlanningEncounter, compact = false) {
    const isSelected = selectedEncounter?.id === encounter.id;
    const isInSelectedCohort = selectedCohort?.id === cohort.id;
    const isConflicted = hasEncounterConflict(cohort, encounter);
    const moduleLabel = moduleDisplayLabel(cohort.module_name);
    const visual = cohortVisuals.get(cohort.id) ?? { index: 0, color: '#ef2f0f', softColor: '#fff0ec' };

    return (
      <button
        className={`planning-piece planning-piece--${encounter.status.toLowerCase()} ${compact ? 'planning-piece--compact' : ''} ${isSelected ? 'is-selected' : ''} ${isInSelectedCohort ? 'is-cohort-selected' : ''} ${isConflicted ? 'is-conflicted' : ''}`.trim()}
        draggable
        key={encounter.id}
        onClick={() => selectEncounter(encounter.id)}
        onDragStart={(event) => {
          writeDragItem(event, { type: 'planning', encounterId: encounter.id });
        }}
        style={compact ? cohortStyle(visual) : { ...encounterGridStyle(encounter.start_time, encounter.end_time), ...cohortStyle(visual) }}
        type="button"
      >
        <em>{visual.index}</em>
        <strong>{encounter.start_time} - {encounter.end_time}</strong>
        <span>{cohort.company_name}</span>
        <small>{moduleLabel} · {encounter.technician_name ?? 'sem técnico'}</small>
      </button>
    );
  }

  function renderClientModuleList(company: CatalogCompany) {
    const client = planningDetail?.clients.find((item) => item.company_id === company.id);
    const availableModuleIds = new Set(client?.available_module_ids ?? modules.map((module) => module.id));
    const plannedByModule = new Map(cohorts
      .filter((cohort) => cohort.company_id === company.id)
      .map((cohort) => [cohort.module_id, cohort]));
    const visibleModules = modules.filter((module) => {
      const plannedCohort = plannedByModule.get(module.id);
      return availableModuleIds.has(module.id) || Boolean(plannedCohort?.published_cohort_id);
    });

    return (
      <div className="planning-module-stack">
        {visibleModules.length === 0 ? (
          <p className="planning-empty-modules">Sem módulos pendentes para este cliente.</p>
        ) : null}
        {visibleModules.map((module) => {
          const plannedCohort = plannedByModule.get(module.id);
          const isActive = activeModule?.companyId === company.id && activeModule.moduleId === module.id;
          const visual = plannedCohort
            ? cohortVisuals.get(plannedCohort.id) ?? { index: 0, color: '#ef2f0f', softColor: '#fff0ec' }
            : null;
          const pendingCount = plannedCohort?.encounters.filter((encounter) => (
            encounter.status !== 'Cancelado' && !encounterHasAllocation(plannedCohort, encounter)
          )).length ?? 0;

          return (
            <section
              className={`planning-module-card ${plannedCohort ? 'is-planned' : ''} ${pendingCount > 0 ? 'has-pending' : ''} ${isActive ? 'is-active' : ''}`.trim()}
              key={module.id}
              style={visual ? cohortStyle(visual) : undefined}
            >
              <button
                className={`planning-module-card-main ${visual ? 'has-badge' : ''}`.trim()}
                type="button"
                onClick={() => selectModule(company.id, module.id)}
              >
                {visual ? <em>{visual.index}</em> : null}
                <span className="planning-module-copy">
                  <span>{moduleDisplayLabel(module.name)}</span>
                  <small>
                    {plannedCohort
                      ? `${plannedCohort.encounters.filter((encounter) => encounter.status !== 'Cancelado').length} encontro(s) · ${pendingCount} pendente(s)`
                      : `${defaultEncounterCount(module, 'Meio_periodo')} meio-periodos sugeridos`}
                  </small>
                </span>
              </button>
            </section>
          );
        })}
      </div>
    );
  }

  function renderModuleWorkbench() {
    if (!activeModule || !activeCompany || !activeModuleTemplate) return null;

    const plannedCohort = cohorts.find((cohort) => (
      cohort.company_id === activeModule.companyId &&
      cohort.module_id === activeModule.moduleId
    ));
    const validEncounters = plannedCohort?.encounters.filter((encounter) => encounter.status !== 'Cancelado') ?? [];
    const missingEncounterCount = plannedCohort ? Math.max(0, expectedEncounterCountForCohort(plannedCohort) - validEncounters.length) : 0;
    const visual = plannedCohort
      ? cohortVisuals.get(plannedCohort.id) ?? { index: 0, color: '#ef2f0f', softColor: '#fff0ec' }
      : null;

    return (
      <section className="planning-module-workbench" role="dialog" aria-label="Configurar módulo" style={visual ? cohortStyle(visual) : undefined}>
        <header className="planning-module-workbench-header">
          <div>
            <strong>Montar encontros</strong>
            <span>{activeCompany.name} · {activeModuleTemplate.name}</span>
          </div>
          <button type="button" aria-label="Fechar configuração do módulo" onClick={() => setActiveModule(null)}>
            Fechar
          </button>
        </header>

        <div className="planning-module-workbench-body">
          <label>
            Período
            <select value={composer.period} onChange={(event) => updateComposerPeriod(event.target.value as ModuleComposer['period'])}>
              <option value="Meio_periodo">Meio período</option>
              <option value="Integral">Integral</option>
            </select>
          </label>
          <label>
            Encontros
            <input
              min={1}
              max={80}
              type="number"
              value={composer.encounterCount}
              onChange={(event) => setComposer((current) => ({ ...current, encounterCount: Number(event.target.value) }))}
            />
          </label>
          <label>
            Técnico
            <select value={composer.technicianId} onChange={(event) => setComposer((current) => ({ ...current, technicianId: event.target.value }))}>
              <option value="">Escolher depois</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
            </select>
          </label>
          <label>
            Data
            <input
              type="date"
              value={composer.startDate}
              onChange={(event) => setComposer((current) => ({ ...current, startDate: event.target.value }))}
            />
          </label>
          <label>
            Início
            <input
              type="time"
              value={composer.startTime}
              onChange={(event) => setComposer((current) => ({ ...current, startTime: event.target.value }))}
            />
          </label>
          <label>
            Fim
            <input
              type="time"
              value={composer.endTime}
              onChange={(event) => setComposer((current) => ({ ...current, endTime: event.target.value }))}
            />
          </label>
          <label>
            Ritmo
            <select value={composer.cadence} onChange={(event) => setComposer((current) => ({ ...current, cadence: event.target.value as ModuleComposer['cadence'] }))}>
              <option value="daily">Dias seguidos</option>
              <option value="twice_week">2x por semana</option>
              <option value="weekly">1x por semana</option>
            </select>
          </label>
          <label>
            Formato
            <select value={composer.deliveryMode} onChange={(event) => setComposer((current) => ({ ...current, deliveryMode: event.target.value as ModuleComposer['deliveryMode'] }))}>
              <option value="Online">Online</option>
              <option value="Presencial">Presencial</option>
              <option value="Hibrida">Híbrida</option>
            </select>
          </label>
        </div>

        <div className="planning-module-actions planning-module-workbench-actions">
          <button type="button" disabled={isSuggesting || isCreatingCohort || technicians.length === 0 || !planningDetail} onClick={autoAllocateAndCreateModule}>
            {isSuggesting ? 'Autoalocando...' : 'Autoalocar e gerar'}
          </button>
          <button
            type="button"
            disabled={isCreatingCohort || !planningDetail}
            onClick={() => plannedCohort && missingEncounterCount > 0 ? void addMissingPendingEncounters(plannedCohort) : void createPlannedCohort()}
          >
            {isCreatingCohort ? 'Gerando...' : plannedCohort && missingEncounterCount > 0 ? `Gerar ${missingEncounterCount} pendente(s)` : plannedCohort ? 'Gerar outra turma' : 'Gerar encontros'}
          </button>
        </div>

        {validEncounters.length > 0 ? (
          <div className="planning-module-encounters">
            <strong>Encontros deste módulo</strong>
            {validEncounters.map((encounter) => {
              const isAllocated = plannedCohort ? encounterHasAllocation(plannedCohort, encounter) : false;
              return (
              <button
                className={isAllocated ? 'is-allocated' : 'is-pending'}
                draggable
                type="button"
                key={encounter.id}
                onClick={() => selectEncounter(encounter.id)}
                onDragStart={(event) => {
                  writeDragItem(event, { type: 'planning', encounterId: encounter.id });
                }}
              >
                {isAllocated ? `${shortDateLabel(encounter.day_date)} · ` : 'Pendente · '}
                {encounter.start_time}-{encounter.end_time}
              </button>
              );
            })}
          </div>
        ) : null}
      </section>
    );
  }

  function renderWeekBoard() {
    return (
      <div className="planning-week-board planning-week-board--studio">
        {visibleDates.map((date) => {
          const dayPairs = visibleEncounterPairs.filter(({ encounter }) => encounter.day_date === date);
          const dayActivities = visibleActivityOccurrences.filter(({ occurrence }) => occurrence.day_date === date);
          const dayExternalCohorts = visibleExternalCohortOccurrences.filter(({ occurrence }) => occurrence.day_date === date);

          return (
            <section
              aria-label={`Dia ${weekdayLabel(date)} ${shortDateLabel(date)}`}
              className={`planning-day-lane ${date === todayIso() ? 'is-today' : ''}`.trim()}
              key={date}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handlePlanningDrop(event, date, technicianFilterId || undefined)}
            >
              <header>
                <strong>{weekdayLabel(date)}</strong>
                <span>{shortDateLabel(date)}</span>
              </header>
              <div className="planning-day-hours">
                {dayActivities.map(({ activity, occurrence }) => renderActivity(activity, occurrence))}
                {dayExternalCohorts.map(({ externalCohort, occurrence }) => renderExternalCohort(externalCohort, occurrence))}
                {dayPairs.map(({ cohort, encounter }) => renderEncounter(cohort, encounter))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  function renderMacroBoard() {
    if (!technicianFilterId) {
      return (
        <div className="planning-range-board">
          <section className="planning-range-tech-section planning-range-tech-section--unified">
            <header>
              <strong>Equipe toda</strong>
              <span>{activeView.days} dias · turmas e atividades de todos os técnicos</span>
            </header>
            <div className="planning-range-days">
              {visibleDates.map((date) => {
                const dayPairs = visibleEncounterPairs.filter(({ encounter }) => encounter.day_date === date);
                const dayActivities = visibleActivityOccurrences.filter(({ occurrence }) => occurrence.day_date === date);
                const dayExternalCohorts = visibleExternalCohortOccurrences.filter(({ occurrence }) => occurrence.day_date === date);

                return (
                  <section
                    aria-label={`Dia ${weekdayLabel(date)} ${shortDateLabel(date)}`}
                    className={`planning-range-day ${dayPairs.length || dayActivities.length || dayExternalCohorts.length ? 'has-events' : ''} ${date === todayIso() ? 'is-today' : ''}`.trim()}
                    key={`team-${date}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handlePlanningDrop(event, date)}
                  >
                    <button
                      className="planning-range-day-header"
                      type="button"
                      onClick={() => {
                        setViewMode('week');
                        setRangeStartDate(date);
                        setTechnicianFilterId('');
                      }}
                    >
                      <strong>{shortDateLabel(date)}</strong>
                      <span>{weekdayLabel(date)}</span>
                    </button>
                    <div className="planning-range-day-events">
                      {dayActivities.map(({ activity, occurrence }) => renderActivity(activity, occurrence, true))}
                      {dayExternalCohorts.map(({ externalCohort, occurrence }) => renderExternalCohort(externalCohort, occurrence, true))}
                      {dayPairs.map(({ cohort, encounter }) => renderEncounter(cohort, encounter, true))}
                      {dayPairs.length === 0 && dayActivities.length === 0 && dayExternalCohorts.length === 0 ? <span>Livre</span> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        </div>
      );
    }

    const rowMap = new Map<string, { id: string; name: string }>();
    technicians.forEach((technician) => {
      if (!technicianFilterId || technician.id === technicianFilterId) {
        rowMap.set(technician.id, technician);
      }
    });
    visibleEncounterPairs.forEach(({ cohort, encounter }) => {
      const id = encounter.technician_id ?? '__none__';
      if (technicianFilterId && id !== technicianFilterId) return;
      if (!rowMap.has(id)) {
        rowMap.set(id, {
          id,
          name: encounter.technician_name ?? 'Sem técnico'
        });
      }
    });
    visibleActivityOccurrences.forEach(({ activity }) => {
      activity.technician_ids.forEach((id, index) => {
        if (technicianFilterId && id !== technicianFilterId) return;
        if (!rowMap.has(id)) {
          rowMap.set(id, {
            id,
            name: activity.technician_names[index] ?? 'Técnico'
          });
        }
      });
    });
    visibleExternalCohortOccurrences.forEach(({ externalCohort, occurrence }) => {
      const id = externalCohortOccurrenceTechnicianId(externalCohort, occurrence) ?? '__none__';
      if (technicianFilterId && id !== technicianFilterId) return;
      if (!rowMap.has(id)) {
        rowMap.set(id, {
          id,
          name: externalCohortOccurrenceTechnicianName(externalCohort, occurrence)
        });
      }
    });
    if (rowMap.size === 0) {
      rowMap.set('__none__', { id: '__none__', name: 'Sem técnico' });
    }
    const technicianRows = [...rowMap.values()];

    return (
      <div className="planning-range-board">
        {technicianRows.map((technician) => (
          <section className="planning-range-tech-section" key={technician.id}>
            <header>
              <strong>{technician.name}</strong>
              <span>{activeView.days} dias</span>
            </header>
            <div className="planning-range-days">
              {visibleDates.map((date) => {
                const dayPairs = visibleEncounterPairs.filter(({ encounter, cohort }) => (
                  encounter.day_date === date &&
                  (technician.id === '__none__'
                    ? !encounter.technician_id
                    : encounter.technician_id === technician.id)
                ));
                const dayActivities = visibleActivityOccurrences.filter(({ activity, occurrence }) => (
                  occurrence.day_date === date &&
                  activity.technician_ids.includes(technician.id)
                ));
                const dayExternalCohorts = visibleExternalCohortOccurrences.filter(({ externalCohort, occurrence }) => (
                  occurrence.day_date === date &&
                  (technician.id === '__none__'
                    ? !externalCohortOccurrenceTechnicianId(externalCohort, occurrence)
                    : externalCohortOccurrenceTechnicianId(externalCohort, occurrence) === technician.id)
                ));

                return (
                  <section
                    aria-label={`Dia ${weekdayLabel(date)} ${shortDateLabel(date)}`}
                    className={`planning-range-day ${dayPairs.length || dayActivities.length || dayExternalCohorts.length ? 'has-events' : ''} ${date === todayIso() ? 'is-today' : ''}`.trim()}
                    key={`${technician.id}-${date}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handlePlanningDrop(event, date, technician.id === '__none__' ? null : technician.id)}
                  >
                    <button
                      className="planning-range-day-header"
                      type="button"
                      onClick={() => {
                        setViewMode('week');
                        setRangeStartDate(date);
                        setTechnicianFilterId(technician.id === '__none__' ? '' : technician.id);
                      }}
                    >
                      <strong>{shortDateLabel(date)}</strong>
                      <span>{weekdayLabel(date)}</span>
                    </button>
                    <div className="planning-range-day-events">
                      {dayActivities.map(({ activity, occurrence }) => renderActivity(activity, occurrence, true))}
                      {dayExternalCohorts.map(({ externalCohort, occurrence }) => renderExternalCohort(externalCohort, occurrence, true))}
                      {dayPairs.map(({ cohort, encounter }) => renderEncounter(cohort, encounter, true))}
                      {dayPairs.length === 0 && dayActivities.length === 0 && dayExternalCohorts.length === 0 ? <span>Livre</span> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }
  function renderListBoard() {
    return (
      <div className="planning-list-table">
        {visibleActivityOccurrences.map(({ activity, occurrence }) => (
          <button
            className="planning-list-row planning-list-row--activity"
            draggable
            key={`${activity.id}-${occurrence.day_date}`}
            onDragStart={(event) => writeDragItem(event, {
              type: 'activity',
              activityId: activity.id,
              dayDate: occurrence.day_date
            })}
            type="button"
          >
            <span>{shortDateLabel(occurrence.day_date)}</span>
            <strong>{occurrence.all_day ? 'Dia inteiro' : `${occurrence.start_time ?? '08:00'} - ${occurrence.end_time ?? '18:00'}`}</strong>
            <span>{activity.company_name ?? 'Atividade interna'}</span>
            <span>{activity.title}</span>
            <span>{activity.technician_names.join(', ') || 'Sem técnico'}</span>
            <small>Calendário</small>
          </button>
        ))}
        {visibleExternalCohortOccurrences.map(({ externalCohort, occurrence }) => (
          <button
            className="planning-list-row planning-list-row--external"
            draggable
            key={`${externalCohort.id}-${occurrence.day_index}-${occurrence.day_date}`}
            onClick={() => setMessage(`Turma já criada: ${externalCohort.company_names.join(', ') || 'Cliente'} · ${shortDateLabel(occurrence.day_date)}`)}
            onDragStart={(event) => writeDragItem(event, {
              type: 'cohort',
              cohortId: externalCohort.id,
              dayIndex: occurrence.day_index,
              dayDate: occurrence.day_date
            })}
            type="button"
          >
            <span>{shortDateLabel(occurrence.day_date)}</span>
            <strong>{occurrence.start_time ?? '08:00'} - {occurrence.end_time ?? '18:00'}</strong>
            <span>{externalCohort.company_names.join(', ') || 'Cliente'}</span>
            <span>{externalCohort.module_names[0] ? moduleDisplayLabel(externalCohort.module_names[0]) : externalCohort.name || 'Turma publicada'}</span>
            <span>{externalCohortOccurrenceTechnicianName(externalCohort, occurrence)}</span>
            <small>Turma já criada</small>
          </button>
        ))}
        {visibleEncounterPairs.map(({ cohort, encounter }) => (
          <button
            className={`planning-list-row ${selectedEncounter?.id === encounter.id ? 'is-selected' : ''}`.trim()}
            draggable
            key={encounter.id}
            onClick={() => selectEncounter(encounter.id)}
            onDragStart={(event) => writeDragItem(event, { type: 'planning', encounterId: encounter.id })}
            type="button"
          >
            <span>{shortDateLabel(encounter.day_date)}</span>
            <strong>{encounter.start_time} - {encounter.end_time}</strong>
            <span>{cohort.company_name}</span>
            <span>{moduleDisplayLabel(cohort.module_name)}</span>
            <span>{encounter.technician_name ?? 'Sem técnico'}</span>
            <small>{encounter.status}</small>
          </button>
        ))}
      </div>
    );
  }

  function renderCalendarBody() {
    if (isLoadingDetail) return <p>Carregando encontros do planejamento.</p>;
    if (visibleEncounterPairs.length === 0 && visibleExternalCohortOccurrences.length === 0 && visibleActivityOccurrences.length === 0 && viewMode === 'list') {
      return <p>Nenhum encontro neste recorte. Selecione um módulo à esquerda e gere encontros.</p>;
    }
    if (viewMode === 'list') return renderListBoard();
    if (viewMode === 'week') return renderWeekBoard();
    return renderMacroBoard();
  }

  return (
    <div className="planning-studio">
      {message ? (
        <p className="success planning-toast" role="status" aria-live="polite">
          <span>{message}</span>
          <button type="button" aria-label="Fechar mensagem" onClick={() => setMessage('')}>×</button>
        </p>
      ) : null}
      {error ? (
        <p className="error planning-toast" role="alert" aria-live="assertive">
          <span>{error}</span>
          <button type="button" aria-label="Fechar erro" onClick={() => setError('')}>×</button>
        </p>
      ) : null}

      <aside className="planning-client-rail" aria-label="Clientes e módulos">
        <div className="planning-rail-header">
          <div>
            <strong>Clientes</strong>
            <span>{clientRows.length} na carteira · {cohorts.length} turma(s)</span>
          </div>
          <label>
            Planejamento
            <select value={selectedWorkspaceId} onChange={(event) => selectWorkspace(event.target.value)}>
              {workspaces.length === 0 ? <option value="">Nenhum planejamento</option> : null}
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <div className="planning-new-workspace">
            <input
              aria-label="Nome do novo planejamento"
              value={workspaceDraftName}
              onChange={(event) => setWorkspaceDraftName(event.target.value)}
            />
            <button type="button" disabled={isCreatingWorkspace || !workspaceDraftName.trim()} onClick={createWorkspace}>
              {isCreatingWorkspace ? 'Criando...' : 'Novo'}
            </button>
          </div>
          <button
            className="planning-delete-workspace-button"
            type="button"
            aria-label={`Excluir planejamento ${selectedWorkspace?.name ?? ''}`.trim()}
            disabled={!selectedWorkspaceId || deletingWorkspaceId === selectedWorkspaceId}
            onClick={() => void deleteSelectedWorkspace()}
          >
            {deletingWorkspaceId === selectedWorkspaceId ? 'Excluindo...' : 'Excluir planejamento'}
          </button>
          <button
            className="planning-add-client-button"
            type="button"
            disabled={!planningDetail || availableClientRows.length === 0}
            onClick={() => setIsClientPickerOpen(true)}
          >
            Adicionar cliente
          </button>
        </div>

        <div className="planning-rail-body">
          <div className="planning-client-stack">
            {clientRows.length === 0 ? (
              <p className="planning-empty-clients">Nenhum cliente neste planejamento. Use Adicionar cliente para montar a carteira.</p>
            ) : null}
            {clientRows.map((company) => {
              const isExpanded = expandedClientId === company.id;
              const clientCohorts = cohorts.filter((cohort) => cohort.company_id === company.id);

              return (
                <section className={`planning-client-dossier ${isExpanded ? 'is-expanded' : ''}`.trim()} key={company.id}>
                  <div className="planning-client-dossier-header">
                    <button
                      type="button"
                      className="planning-client-dossier-toggle"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${company.name}`}
                      onClick={() => {
                        setExpandedClientId(isExpanded ? '' : company.id);
                        if (isExpanded && activeModule?.companyId === company.id) setActiveModule(null);
                      }}
                    >
                      <strong>{company.name}</strong>
                      <span>{clientCohorts.length} turma(s)</span>
                    </button>
                    <button
                      type="button"
                      className="planning-client-remove"
                      aria-label={`Remover ${company.name} do planejamento`}
                      disabled={removingClientIds.includes(company.id)}
                      onClick={() => void removeClientFromWorkspace(company.id)}
                    >
                      ×
                    </button>
                  </div>
                  {isExpanded ? renderClientModuleList(company) : null}
                </section>
              );
            })}
          </div>
          {isClientPickerOpen ? (
            <section className="planning-client-picker" role="dialog" aria-label="Selecionar clientes">
              <header>
                <strong>Selecionar clientes</strong>
                <button type="button" onClick={() => setIsClientPickerOpen(false)}>Fechar</button>
              </header>
              <div className="planning-client-picker-list">
                {availableClientRows.length === 0 ? <p>Todos os clientes já estão no planejamento.</p> : null}
                {availableClientRows.map((company) => (
                  <button
                    type="button"
                    key={company.id}
                    disabled={addingClientIds.includes(company.id)}
                    onClick={() => void addClientToWorkspace(company.id)}
                  >
                    {addingClientIds.includes(company.id) ? 'Adicionando...' : `Adicionar ${company.name}`}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          {activeModule ? renderModuleWorkbench() : null}
        </div>
      </aside>

      <section className="planning-board" aria-label="Calendário de planejamento">
        <header className="planning-board-toolbar">
          <div>
            <strong>{viewMode === 'quarter' ? 'Mapa 90 dias' : viewMode === 'range' ? 'Mapa 60 dias' : viewMode === 'month' ? 'Mapa 30 dias' : 'Agenda por horário'}</strong>
            <span>
              {selectedTechnician ? selectedTechnician.name : 'Equipe toda'} · {shortDateLabel(rangeStartDate)} a {shortDateLabel(addDaysIso(rangeStartDate, activeView.days - 1))}
            </span>
          </div>
          <div className="planning-board-actions">
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
            <button type="button" onClick={() => moveRange(-activeView.days)}>Anterior</button>
            <input
              aria-label="Data inicial da agenda"
              type="date"
              value={rangeStartDate}
              onChange={(event) => setRangeStartDate(event.target.value)}
            />
            <button type="button" onClick={() => moveRange(activeView.days)}>Próximo</button>
            <select aria-label="Filtrar cliente" value={clientFilterId} onChange={(event) => setClientFilterId(event.target.value)}>
              <option value="">Todos os clientes</option>
              {clients.map((client) => <option key={client.company_id} value={client.company_id}>{client.company_name}</option>)}
            </select>
            <select aria-label="Filtrar técnico" value={technicianFilterId} onChange={(event) => setTechnicianFilterId(event.target.value)}>
              <option value="">Equipe toda</option>
              {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
            </select>
            <button
              aria-label={
                isPublishingWorkspace
                  ? 'Publicando...'
                  : hasPendingWorkspaceEncounterSave
                    ? 'Aguardando salvamento'
                    : workspaceConflictCount > 0
                      ? `Resolva ${workspaceConflictCount} conflito(s) antes de publicar as turmas`
                      : 'Publicar turmas'
              }
              type="button"
              disabled={isPublishBlocked}
              onClick={openPublishConfirmation}
            >
              {isPublishingWorkspace
                ? 'Publicando...'
                : hasPendingWorkspaceEncounterSave
                  ? 'Aguardando'
                  : workspaceConflictCount > 0
                    ? `${workspaceConflictCount} conflito(s)`
                    : 'Publicar turmas'}
            </button>
          </div>
        </header>

        <div className="planning-board-canvas">
          {renderCalendarBody()}
        </div>

        {selectedEncounter && selectedCohort ? (
          <div className={`planning-quick-editor ${isSelectedEncounterAllocated ? '' : 'is-pending'}`.trim()} aria-label="Editor rápido do encontro">
            <strong>
              {selectedCohort.company_name} · {moduleDisplayLabel(selectedCohort.module_name)}
              <span>
                {isSelectedEncounterAllocated
                  ? `${selectedEncounter.start_time}-${selectedEncounter.end_time}`
                  : 'Pendente: arraste para um dia do calendário'}
              </span>
            </strong>
            {isSelectedEncounterAllocated ? (
              <label>
                Data
                <input
                  disabled={isSavingSelectedEncounter}
                  type="date"
                  value={encounterDraft.day_date}
                  onChange={(event) => setEncounterDraft((draft) => ({ ...draft, day_date: event.target.value }))}
                />
              </label>
            ) : (
              <label className="planning-quick-editor-pending">
                Data
                <span>sem encaixe</span>
              </label>
            )}
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
                <option value="">Escolher técnico</option>
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
            <label className="planning-quick-editor-notes">
              Observações
              <textarea
                disabled={isSavingSelectedEncounter}
                value={encounterDraft.notes}
                onChange={(event) => setEncounterDraft((draft) => ({ ...draft, notes: event.target.value }))}
              />
            </label>
            {isSelectedEncounterAllocated ? (
              <button type="button" disabled={hasPendingWorkspaceEncounterSave} onClick={() => void unassignSelectedEncounter()}>
                Tirar do mapa
              </button>
            ) : null}
            <button type="button" disabled={hasPendingWorkspaceEncounterSave} onClick={saveSelectedEncounter}>
              {isSavingSelectedEncounter ? 'Salvando...' : hasPendingWorkspaceEncounterSave ? 'Aguardando salvamento' : 'Salvar encontro'}
            </button>
          </div>
        ) : null}
        {isPublishConfirmOpen && planningDetail ? (
          <section className="planning-publish-dialog" role="dialog" aria-label="Confirmar publicação do planejamento">
            <div className="planning-publish-card">
              <header>
                <div>
                  <strong>Confirmar publicação</strong>
                  <span>{publishReadyCohorts.length} turma(s) · {plannedEncounters.length} encontro(s)</span>
                </div>
                <button type="button" onClick={() => setIsPublishConfirmOpen(false)}>Fechar</button>
              </header>
              {publishIssues.length > 0 ? (
                <div className="planning-publish-issues">
                  <strong>Antes de confirmar</strong>
                  {publishIssues.map((issue) => <p key={issue.cohortId}>{issue.message}</p>)}
                </div>
              ) : (
                <div className="planning-publish-summary">
                  {publishReadyCohorts.map((cohort) => (
                    <p key={cohort.id}>
                      {cohort.company_name} · {moduleDisplayLabel(cohort.module_name)} · {cohort.encounters.filter((encounter) => encounter.status !== 'Cancelado').length} encontro(s)
                    </p>
                  ))}
                </div>
              )}
              <button
                type="button"
                disabled={publishIssues.length > 0 || isPublishBlocked}
                onClick={publishCurrentWorkspace}
              >
                Confirmar publicação
              </button>
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
