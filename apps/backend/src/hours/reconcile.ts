import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { appendAndProject, getHoursBalance } from './service.js';

type JourneySnapshot = {
  totalEncounters: number;
  completedEncounters: number;
};

type ReconcileSnapshot = {
  company_id: string;
  module_scope_id: string;
  contracted_hours: number;
  consumed_hours: number;
  target_balance_hours: number;
  current_balance_hours: number;
  delta_hours: number;
};

export type CompanyHoursSummary = {
  available_hours: number;
  consumed_hours: number;
  balance_hours: number;
  remaining_diarias: number;
};

export type ReconcileCompanyHoursResult = CompanyHoursSummary & {
  snapshot: ReconcileSnapshot;
  suggested_event_inserted: boolean;
};

export type CompanyHoursModuleInsight = {
  module_id: string;
  code: string;
  name: string;
  status: string;
  delivery_mode: 'ministrado' | 'entregavel';
  client_hours_policy: 'consome' | 'nao_consume';
  planned_diarias: number;
  planned_hours: number;
  projected_client_consumed_hours: number;
  projected_client_remaining_hours: number;
  actual_client_consumed_hours: number;
  internal_effort_hours: number;
  internal_variance_hours: number | null;
};

type ModuleHoursScopeRow = {
  module_id: string;
  code: string;
  name: string;
  delivery_mode: 'ministrado' | 'entregavel';
  client_hours_policy: 'consome' | 'nao_consume';
  status: string;
  duration_days: number;
};

type AllocationHoursScopeRow = {
  allocation_id: string;
  module_id: string;
  status: string;
  cohort_id: string;
  entry_day: number;
  start_date: string;
  period: 'Integral' | 'Meio_periodo' | null;
  start_time: string | null;
  end_time: string | null;
  duration_days: number;
};

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function isoDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function addBusinessDays(dateIso: string, offset: number): string {
  const date = parseIsoDate(dateIso);
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
  }
  let moved = 0;
  while (moved < offset) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend(date)) moved += 1;
  }
  return isoDate(date);
}

function currentLocalSnapshot() {
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [hourLabel, minuteLabel] = now.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }).split(':');
  const hour = Number(hourLabel ?? '0');
  const minute = Number(minuteLabel ?? '0');
  return {
    dateIso: dateLabel,
    minutes: (hour * 60) + minute
  };
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

function deriveJourneySlotStatus(
  slotDateIso: string,
  slotStartTime: string | null,
  slotEndTime: string | null,
  snapshot: { dateIso: string; minutes: number }
) {
  if (slotDateIso < snapshot.dateIso) return 'Concluida';
  if (slotDateIso > snapshot.dateIso) return 'Planejada';

  const startMinutes = timeToMinutes(slotStartTime);
  const endMinutes = timeToMinutes(slotEndTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return 'Em_andamento';
  }

  if (snapshot.minutes < startMinutes) return 'Planejada';
  if (snapshot.minutes >= endMinutes) return 'Concluida';
  return 'Em_andamento';
}

function readJourneyProgressByModule(companyId: string) {
  const summaryByModule = new Map<string, JourneySnapshot>();
  try {
    const snapshot = currentLocalSnapshot();
    const allocationRows = db.prepare(`
      select
        a.module_id,
        a.entry_day,
        c.id as cohort_id,
        c.start_date,
        c.start_time,
        c.end_time,
        c.period,
        coalesce(cmb.duration_days, 1) as duration_days
      from cohort_allocation a
      join cohort c on c.id = a.cohort_id
      left join cohort_module_block cmb on cmb.cohort_id = a.cohort_id and cmb.module_id = a.module_id
      where a.company_id = ?
        and a.status <> 'Cancelado'
        and c.status in ('Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida')
      order by date(c.start_date) asc, a.entry_day asc
    `).all(companyId) as Array<{
      module_id: string;
      entry_day: number;
      cohort_id: string;
      start_date: string;
      start_time: string | null;
      end_time: string | null;
      period: 'Integral' | 'Meio_periodo' | null;
      duration_days: number;
    }>;

    if (allocationRows.length === 0) return summaryByModule;

    const cohortIds = Array.from(new Set(allocationRows.map((row) => row.cohort_id)));
    const placeholders = cohortIds.map(() => '?').join(',');
    const scheduleRows = db.prepare(`
      select cohort_id, day_index, day_date, start_time, end_time
      from cohort_schedule_day
      where cohort_id in (${placeholders})
    `).all(...cohortIds) as Array<{
      cohort_id: string;
      day_index: number;
      day_date: string;
      start_time: string | null;
      end_time: string | null;
    }>;

    const scheduleByKey = new Map<string, { day_date: string; start_time: string | null; end_time: string | null }>();
    scheduleRows.forEach((row) => {
      scheduleByKey.set(`${row.cohort_id}:${row.day_index}`, {
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    });

    allocationRows.forEach((row) => {
      const period = row.period ?? 'Integral';
      const durationDays = Math.max(1, Number(row.duration_days || 1));
      const totalEncounters = durationDays * (period === 'Meio_periodo' ? 2 : 1);
      const startSlot = period === 'Meio_periodo'
        ? (Math.max(1, Number(row.entry_day || 1)) * 2) - 1
        : Math.max(1, Number(row.entry_day || 1));

      let completedEncounters = 0;
      for (let offset = 0; offset < totalEncounters; offset += 1) {
        const dayIndex = startSlot + offset;
        const scheduled = scheduleByKey.get(`${row.cohort_id}:${dayIndex}`);
        const dayDate = scheduled?.day_date ?? addBusinessDays(row.start_date, Math.max(0, dayIndex - 1));
        const startTime = period === 'Meio_periodo' ? (scheduled?.start_time ?? row.start_time ?? null) : null;
        const endTime = period === 'Meio_periodo' ? (scheduled?.end_time ?? row.end_time ?? null) : null;
        const slotStatus = deriveJourneySlotStatus(dayDate, startTime, endTime, snapshot);
        if (slotStatus === 'Concluida') completedEncounters += 1;
      }

      const current = summaryByModule.get(row.module_id) ?? { totalEncounters: 0, completedEncounters: 0 };
      summaryByModule.set(row.module_id, {
        totalEncounters: current.totalEncounters + totalEncounters,
        completedEncounters: current.completedEncounters + completedEncounters
      });
    });
  } catch {
    return summaryByModule;
  }
  return summaryByModule;
}

function readActiveModuleHoursScope(companyId: string): ModuleHoursScopeRow[] {
  return db.prepare(`
    select
      mt.id as module_id,
      mt.code,
      mt.name,
      coalesce(mt.delivery_mode, 'ministrado') as delivery_mode,
      coalesce(mt.client_hours_policy, 'consome') as client_hours_policy,
      coalesce(cmp.status, 'Nao_iniciado') as status,
      coalesce(cmp.custom_duration_days, mt.duration_days, 0) as duration_days
    from module_template mt
    left join company_module_progress cmp
      on cmp.company_id = ?
      and cmp.module_id = mt.id
    left join company_module_activation cma
      on cma.company_id = ?
      and cma.module_id = mt.id
    where coalesce(cma.is_enabled, 1) = 1
    order by mt.code asc
  `).all(companyId, companyId) as ModuleHoursScopeRow[];
}

function projectedClientConsumedHoursForModule(row: ModuleHoursScopeRow, journeyByModule: Map<string, JourneySnapshot>) {
  if (row.delivery_mode !== 'ministrado' || row.client_hours_policy !== 'consome') return 0;
  const moduleHours = roundHours(Math.max(0, Number(row.duration_days || 0)) * 8);
  const journey = journeyByModule.get(row.module_id);
  if (journey && journey.totalEncounters > 0) {
    const ratio = clampRatio(journey.completedEncounters / journey.totalEncounters);
    if (row.status === 'Concluido') return moduleHours;
    return roundHours(moduleHours * ratio);
  }
  if (row.status === 'Concluido') return moduleHours;
  if (row.status === 'Em_execucao') {
    return roundHours(moduleHours * 0.5);
  }
  return 0;
}

function allocationStatusCountsInConfirmedHours(status: string): boolean {
  return status === 'Confirmado' || status === 'Executado';
}

function allocationTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

function allocationTimeRangeMinutes(startTime: string | null | undefined, endTime: string | null | undefined): number | null {
  const startMinutes = allocationTimeToMinutes(startTime);
  const endMinutes = allocationTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  return endMinutes - startMinutes;
}

function readAllocationHoursScope(companyId: string): AllocationHoursScopeRow[] {
  return db.prepare(`
    select
      a.id as allocation_id,
      a.module_id,
      a.status,
      a.cohort_id,
      a.entry_day,
      c.start_date,
      c.period,
      c.start_time,
      c.end_time,
      coalesce(cmb.duration_days, mt.duration_days, 1) as duration_days
    from cohort_allocation a
    join cohort c on c.id = a.cohort_id
    join module_template mt on mt.id = a.module_id
    left join cohort_module_block cmb on cmb.cohort_id = a.cohort_id and cmb.module_id = a.module_id
    where a.company_id = ?
      and coalesce(mt.delivery_mode, 'ministrado') = 'ministrado'
      and coalesce(mt.client_hours_policy, 'consome') = 'consome'
  `).all(companyId) as AllocationHoursScopeRow[];
}

function allocationConfirmedHours(row: AllocationHoursScopeRow): number {
  if (!allocationStatusCountsInConfirmedHours(row.status)) return 0;
  const durationDays = Math.max(1, Number(row.duration_days || 1));
  const startDay = Math.max(1, Number(row.entry_day || 1));

  if ((row.period ?? 'Integral') !== 'Meio_periodo') {
    return roundHours(durationDays * 8);
  }

  const scheduleRows = db.prepare(`
    select day_index, start_time, end_time
    from cohort_schedule_day
    where cohort_id = ?
      and day_index between ? and ?
    order by day_index asc
  `).all(row.cohort_id, startDay, startDay + durationDays - 1) as Array<{
    day_index: number;
    start_time: string | null;
    end_time: string | null;
  }>;
  const scheduleByDay = new Map<number, { start_time: string | null; end_time: string | null }>();
  scheduleRows.forEach((scheduleRow) => {
    scheduleByDay.set(Number(scheduleRow.day_index), {
      start_time: scheduleRow.start_time,
      end_time: scheduleRow.end_time
    });
  });

  let totalMinutes = 0;
  for (let offset = 0; offset < durationDays; offset += 1) {
    const dayIndex = startDay + offset;
    const scheduled = scheduleByDay.get(dayIndex);
    const slotStart = scheduled?.start_time ?? row.start_time ?? null;
    const slotEnd = scheduled?.end_time ?? row.end_time ?? null;
    const slotMinutes = allocationTimeRangeMinutes(slotStart, slotEnd);
    totalMinutes += slotMinutes ?? (4 * 60);
  }

  return roundHours(totalMinutes / 60);
}

function readAllocationCurrentConfirmedHours(companyId: string, allocationId: string): number {
  const events = db.prepare(`
    select event_type, payload_json
    from hours_event_store
    where company_id = ?
      and aggregate_type = 'company_hours_account'
      and aggregate_id = ?
      and event_type in ('training_encounter_completed', 'hours_manual_adjustment_added')
    order by created_at asc
  `).all(companyId, allocationId) as Array<{ event_type: string; payload_json: string }>;

  let total = 0;
  events.forEach((eventRow) => {
    try {
      const payload = JSON.parse(eventRow.payload_json) as { hours_consumed?: number; consumed_delta?: number };
      if (eventRow.event_type === 'training_encounter_completed') {
        total += Math.abs(Number(payload.hours_consumed ?? 0));
      } else {
        total += Number(payload.consumed_delta ?? 0);
      }
    } catch {
      // ignore malformed payload
    }
  });

  return roundHours(total);
}

function readHistoricalAllocationAggregateIds(companyId: string): string[] {
  const rows = db.prepare(`
    select distinct aggregate_id
    from hours_event_store
    where company_id = ?
      and aggregate_type = 'company_hours_account'
      and (
        idempotency_key like 'allocation-client-consumption:%'
        or idempotency_key like 'allocation-hours-sync:%'
      )
  `).all(companyId) as Array<{ aggregate_id: string }>;

  return rows
    .map((row) => row.aggregate_id?.trim())
    .filter((value): value is string => Boolean(value));
}

function readHistoricalAllocationModuleIds(companyId: string): Map<string, string> {
  const rows = db.prepare(`
    select aggregate_id, payload_json
    from hours_event_store
    where company_id = ?
      and aggregate_type = 'company_hours_account'
      and (
        idempotency_key like 'allocation-client-consumption:%'
        or idempotency_key like 'allocation-hours-sync:%'
      )
    order by created_at asc
  `).all(companyId) as Array<{ aggregate_id: string; payload_json: string }>;

  const moduleByAllocation = new Map<string, string>();
  rows.forEach((row) => {
    const allocationId = row.aggregate_id?.trim();
    if (!allocationId || moduleByAllocation.has(allocationId)) return;
    try {
      const payload = JSON.parse(row.payload_json) as { module_id?: string | null };
      const moduleId = payload.module_id?.trim();
      if (!moduleId) return;
      moduleByAllocation.set(allocationId, moduleId);
    } catch {
      // ignore malformed payload
    }
  });

  return moduleByAllocation;
}

export function syncConfirmedHoursFromAllocations(companyId: string) {
  const allocationRows = readAllocationHoursScope(companyId);
  const targetByAllocation = new Map<string, number>();
  const moduleByAllocation = new Map<string, string>();
  allocationRows.forEach((row) => {
    targetByAllocation.set(row.allocation_id, allocationConfirmedHours(row));
    if (row.module_id?.trim()) {
      moduleByAllocation.set(row.allocation_id, row.module_id.trim());
    }
  });
  const historicalModuleByAllocation = readHistoricalAllocationModuleIds(companyId);

  const candidateAllocationIds = new Set<string>([
    ...targetByAllocation.keys(),
    ...readHistoricalAllocationAggregateIds(companyId)
  ]);

  candidateAllocationIds.forEach((allocationId) => {
    const targetHours = roundHours(targetByAllocation.get(allocationId) ?? 0);
    const currentHours = readAllocationCurrentConfirmedHours(companyId, allocationId);
    const deltaHours = roundHours(targetHours - currentHours);
    if (Math.abs(deltaHours) < 0.01) return;

    if (deltaHours > 0) {
      const moduleId = moduleByAllocation.get(allocationId) ?? historicalModuleByAllocation.get(allocationId) ?? null;
      appendAndProject({
        aggregate_type: 'company_hours_account',
        aggregate_id: allocationId,
        company_id: companyId,
        event_type: 'training_encounter_completed',
        payload: {
          hours_consumed: deltaHours,
          module_id: moduleId,
          encounter_id: `allocation:${allocationId}`,
          reason: 'Sincronização automática de alocação confirmada/executada.'
        },
        idempotency_key: `allocation-hours-sync:${allocationId}:target-${targetHours}:debit`,
        actor_type: 'system'
      });
      return;
    }

    const creditHours = Math.abs(deltaHours);
    const moduleId = moduleByAllocation.get(allocationId) ?? historicalModuleByAllocation.get(allocationId) ?? null;
    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: allocationId,
      company_id: companyId,
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: creditHours,
        consumed_delta: -creditHours,
        module_id: moduleId,
        reason: 'Estorno automático de sincronização por alocação removida ou fora do fluxo confirmado.'
      },
      idempotency_key: `allocation-hours-sync:${allocationId}:target-${targetHours}:credit`,
      actor_type: 'system'
    });
  });
}

function buildReconcileSnapshot(companyId: string): ReconcileSnapshot {
  const progressRows = readActiveModuleHoursScope(companyId);
  const journeyByModule = readJourneyProgressByModule(companyId);

  let contractedHours = 0;
  let consumedHours = 0;
  const scopedRows = progressRows.filter((row) => row.delivery_mode === 'ministrado' && row.client_hours_policy === 'consome');
  const moduleScopeId = scopedRows.map((row) => row.module_id).sort((a, b) => a.localeCompare(b)).join('|') || 'none';

  scopedRows.forEach((row) => {
    const moduleHours = roundHours(Math.max(0, Number(row.duration_days || 0)) * 8);
    contractedHours += moduleHours;
    consumedHours += projectedClientConsumedHoursForModule(row, journeyByModule);
  });

  contractedHours = roundHours(contractedHours);
  consumedHours = roundHours(consumedHours);
  const targetBalanceHours = roundHours(contractedHours - consumedHours);
  const currentBalanceHours = roundHours(getHoursBalance(companyId)?.balance_hours ?? 0);
  const deltaHours = roundHours(targetBalanceHours - currentBalanceHours);

  return {
    company_id: companyId,
    module_scope_id: moduleScopeId,
    contracted_hours: contractedHours,
    consumed_hours: consumedHours,
    target_balance_hours: targetBalanceHours,
    current_balance_hours: currentBalanceHours,
    delta_hours: deltaHours
  };
}

export function readProjectedCompanyHoursSummary(companyId: string): CompanyHoursSummary & { snapshot: ReconcileSnapshot } {
  const snapshot = buildReconcileSnapshot(companyId);
  return {
    available_hours: snapshot.contracted_hours,
    consumed_hours: snapshot.consumed_hours,
    balance_hours: snapshot.target_balance_hours,
    remaining_diarias: roundHours(snapshot.target_balance_hours / 8),
    snapshot
  };
}

export function readCompanyHoursModuleInsights(companyId: string): CompanyHoursModuleInsight[] {
  const scopedRows = readActiveModuleHoursScope(companyId);
  const journeyByModule = readJourneyProgressByModule(companyId);

  const internalEffortByModule = new Map<string, number>();
  const actualClientConsumptionByModule = new Map<string, number>();
  const aggregateModuleFallback = readHistoricalAllocationModuleIds(companyId);

  const worklogEvents = db.prepare(`
    select payload_json
    from hours_event_store
    where company_id = ?
      and event_type = 'deliverable_worklog_logged'
    order by created_at asc
  `).all(companyId) as Array<{ payload_json: string }>;
  worklogEvents.forEach((row) => {
    try {
      const payload = JSON.parse(row.payload_json) as { module_id?: string; minutes_logged?: number };
      const moduleId = payload.module_id?.trim();
      if (!moduleId) return;
      const minutesLogged = Number(payload.minutes_logged ?? 0);
      if (!Number.isFinite(minutesLogged) || minutesLogged <= 0) return;
      internalEffortByModule.set(moduleId, roundHours((internalEffortByModule.get(moduleId) ?? 0) + (minutesLogged / 60)));
    } catch {
      // ignore malformed payload
    }
  });

  const clientConsumptionEvents = db.prepare(`
    select aggregate_id, event_type, payload_json
    from hours_event_store
    where company_id = ?
      and event_type in ('training_encounter_completed', 'hours_manual_adjustment_added')
    order by created_at asc
  `).all(companyId) as Array<{ aggregate_id: string; event_type: string; payload_json: string }>;
  clientConsumptionEvents.forEach((row) => {
    try {
      const payload = JSON.parse(row.payload_json) as {
        module_id?: string;
        hours_consumed?: number;
        consumed_delta?: number;
      };
      const moduleId = payload.module_id?.trim() || aggregateModuleFallback.get(row.aggregate_id) || '';
      if (!moduleId) return;

      if (row.event_type === 'training_encounter_completed') {
        const hoursConsumed = Number(payload.hours_consumed ?? 0);
        if (!Number.isFinite(hoursConsumed) || hoursConsumed === 0) return;
        actualClientConsumptionByModule.set(
          moduleId,
          roundHours((actualClientConsumptionByModule.get(moduleId) ?? 0) + Math.abs(hoursConsumed))
        );
        return;
      }

      if (row.event_type === 'hours_manual_adjustment_added') {
        const consumedDelta = Number(payload.consumed_delta ?? 0);
        if (!Number.isFinite(consumedDelta) || consumedDelta === 0) return;
        actualClientConsumptionByModule.set(
          moduleId,
          roundHours((actualClientConsumptionByModule.get(moduleId) ?? 0) + consumedDelta)
        );
      }
    } catch {
      // ignore malformed payload
    }
  });

  return scopedRows.map((row) => {
    const plannedHours = roundHours(Math.max(0, Number(row.duration_days || 0)) * 8);
    const internalEffortHours = roundHours(internalEffortByModule.get(row.module_id) ?? 0);
    const projectedClientConsumed = plannedHours;
    const actualFromTraining = Math.max(0, roundHours(actualClientConsumptionByModule.get(row.module_id) ?? 0));
    const actualClientConsumed = row.delivery_mode === 'entregavel' ? internalEffortHours : actualFromTraining;
    const remainingHours = roundHours(projectedClientConsumed - actualClientConsumed);
    const varianceHours = roundHours(actualClientConsumed - projectedClientConsumed);

    return {
      module_id: row.module_id,
      code: row.code,
      name: row.name,
      status: row.status,
      delivery_mode: row.delivery_mode,
      client_hours_policy: row.client_hours_policy,
      planned_diarias: roundHours(plannedHours / 8),
      planned_hours: plannedHours,
      projected_client_consumed_hours: projectedClientConsumed,
      projected_client_remaining_hours: remainingHours,
      actual_client_consumed_hours: actualClientConsumed,
      internal_effort_hours: internalEffortHours,
      internal_variance_hours: varianceHours
    };
  });
}

function buildSnapshotHash(snapshot: ReconcileSnapshot) {
  return createHash('sha1').update(JSON.stringify(snapshot)).digest('hex').slice(0, 20);
}

export function reconcileCompanyHours(companyId: string): ReconcileCompanyHoursResult {
  const projected = readProjectedCompanyHoursSummary(companyId);
  const snapshot = projected.snapshot;
  let inserted = false;

  if (Math.abs(snapshot.delta_hours) >= 0.01) {
    const idempotencyKey = `suggested:${companyId}:${snapshot.module_scope_id}:${buildSnapshotHash(snapshot)}`;
    const result = appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: companyId,
      company_id: companyId,
      event_type: 'hours_adjustment_suggested',
      payload: {
        delta_hours: snapshot.delta_hours,
        reason: `Reconciliacao automatica: contrato ${snapshot.contracted_hours}h, consumo ${snapshot.consumed_hours}h, alvo ${snapshot.target_balance_hours}h, atual ${snapshot.current_balance_hours}h.`
      },
      idempotency_key: idempotencyKey,
      actor_type: 'system'
    });
    inserted = result.inserted;
  }

  return {
    available_hours: projected.available_hours,
    consumed_hours: projected.consumed_hours,
    balance_hours: projected.balance_hours,
    remaining_diarias: projected.remaining_diarias,
    snapshot,
    suggested_event_inserted: inserted
  };
}
