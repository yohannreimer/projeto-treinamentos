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

function buildReconcileSnapshot(companyId: string): ReconcileSnapshot {
  const progressRows = db.prepare(`
    select
      cmp.module_id,
      cmp.status,
      coalesce(cmp.custom_duration_days, mt.duration_days, 0) as duration_days
    from company_module_progress cmp
    join module_template mt on mt.id = cmp.module_id
    left join company_module_activation cma
      on cma.company_id = cmp.company_id
      and cma.module_id = cmp.module_id
    where cmp.company_id = ?
      and coalesce(cma.is_enabled, 1) = 1
      and coalesce(mt.delivery_mode, 'ministrado') = 'ministrado'
      and coalesce(mt.client_hours_policy, 'consome') = 'consome'
  `).all(companyId) as Array<{
    module_id: string;
    status: string;
    duration_days: number;
  }>;

  const journeyByModule = readJourneyProgressByModule(companyId);

  let contractedHours = 0;
  let consumedHours = 0;
  const moduleScopeId = progressRows.map((row) => row.module_id).sort((a, b) => a.localeCompare(b)).join('|') || 'none';

  progressRows.forEach((row) => {
    const moduleHours = roundHours(Math.max(0, Number(row.duration_days || 0)) * 8);
    contractedHours += moduleHours;

    if (row.status === 'Concluido') {
      consumedHours += moduleHours;
      return;
    }

    if (row.status === 'Em_execucao') {
      const journey = journeyByModule.get(row.module_id);
      const ratioFromJourney = journey && journey.totalEncounters > 0
        ? clampRatio(journey.completedEncounters / journey.totalEncounters)
        : 0.5;
      consumedHours += roundHours(moduleHours * ratioFromJourney);
    }
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

function buildSnapshotHash(snapshot: ReconcileSnapshot) {
  return createHash('sha1').update(JSON.stringify(snapshot)).digest('hex').slice(0, 20);
}

export function reconcileCompanyHours(companyId: string): ReconcileCompanyHoursResult {
  const snapshot = buildReconcileSnapshot(companyId);
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
    available_hours: snapshot.contracted_hours,
    consumed_hours: snapshot.consumed_hours,
    balance_hours: snapshot.target_balance_hours,
    remaining_diarias: roundHours(snapshot.target_balance_hours / 8),
    snapshot,
    suggested_event_inserted: inserted
  };
}
