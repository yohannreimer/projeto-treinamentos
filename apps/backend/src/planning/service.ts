import { db, nowDateIso, uuid } from '../db.js';
import type { PlanningConflict, PlanningEncounterPayload } from './types.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

type PlanningCohortPublishRow = {
  id: string;
  workspace_id: string;
  company_id: string;
  module_id: string;
  technician_id: string | null;
  published_cohort_id: string | null;
  name: string;
  delivery_mode: string;
  period: string;
  notes: string | null;
};

type PlanningEncounterPublishRow = {
  id: string;
  planning_cohort_id: string;
  company_id: string;
  module_id: string;
  technician_id: string | null;
  encounter_index: number;
  day_date: string;
  start_time: string;
  end_time: string;
};

type PublishedCohortLink = {
  id: string;
};

function publishedEncounterDurationDays(encounter: PlanningEncounterPublishRow): number {
  const start = timeToMinutes(encounter.start_time);
  const end = timeToMinutes(encounter.end_time);
  if (start === null || end === null || end <= start) return 0.5;
  return end - start >= 6 * 60 ? 1 : 0.5;
}

function publishedBlockDurationDays(encounters: PlanningEncounterPublishRow[]): number {
  const durationDays = encounters.reduce((total, encounter) => total + publishedEncounterDurationDays(encounter), 0);
  return Math.max(0.5, durationDays);
}

function cohortCodeExists(code: string, excludeCohortId?: string): boolean {
  const row = db.prepare(`
    select 1 as ok
    from cohort
    where upper(code) = upper(?)
      and (? is null or id <> ?)
    limit 1
  `).get(code.trim(), excludeCohortId ?? null, excludeCohortId ?? null) as { ok: number } | undefined;
  return Boolean(row?.ok);
}

function nextPlanningCohortCode(workspaceId: string, cohortIndex: number, excludeCohortId?: string): string {
  const baseCode = `PLAN-${workspaceId.slice(-5).toUpperCase()}-${String(cohortIndex).padStart(2, '0')}`;
  if (!cohortCodeExists(baseCode, excludeCohortId)) return baseCode;

  let suffix = 2;
  let candidate = `${baseCode}-${suffix}`;
  while (cohortCodeExists(candidate, excludeCohortId)) {
    suffix += 1;
    candidate = `${baseCode}-${suffix}`;
  }
  return candidate;
}

function isCohortCodeCollision(error: unknown): boolean {
  return /UNIQUE constraint failed: cohort\.code/i.test(error instanceof Error ? error.message : String(error));
}

function findPublishedCohortForPlanning(cohort: PlanningCohortPublishRow, workspaceId: string): PublishedCohortLink | undefined {
  if (cohort.published_cohort_id) {
    const explicit = db.prepare('select id from cohort where id = ?').get(cohort.published_cohort_id) as PublishedCohortLink | undefined;
    if (explicit) return explicit;
  }

  const exactLink = db.prepare(`
    select id
    from cohort
    where planning_workspace_id = ? and planning_cohort_id = ?
    limit 1
  `).get(workspaceId, cohort.id) as PublishedCohortLink | undefined;
  if (exactLink) return exactLink;

  return db.prepare(`
    select c.id
    from cohort c
    join cohort_allocation ca on ca.cohort_id = c.id
    where c.planning_workspace_id = ?
      and c.planning_cohort_id is null
      and ca.company_id = ?
      and ca.module_id = ?
      and c.status <> 'Cancelada'
    order by c.start_date desc, c.id asc
    limit 1
  `).get(workspaceId, cohort.company_id, cohort.module_id) as PublishedCohortLink | undefined;
}

function isModuleAlreadyCoveredOutsidePlanning(cohort: PlanningCohortPublishRow, workspaceId: string): boolean {
  const completed = db.prepare(`
    select 1 as ok
    from company_module_progress
    where company_id = ?
      and module_id = ?
      and status = 'Concluido'
    limit 1
  `).get(cohort.company_id, cohort.module_id) as { ok: number } | undefined;
  if (completed?.ok) return true;

  const existingAllocation = db.prepare(`
    select 1 as ok
    from cohort_allocation ca
    join cohort c on c.id = ca.cohort_id
    where ca.company_id = ?
      and ca.module_id = ?
      and ca.status <> 'Cancelado'
      and c.status <> 'Cancelada'
      and (? is null or c.id <> ?)
      and not (
        c.planning_workspace_id = ?
        and coalesce(c.planning_cohort_id, '') = ?
      )
    limit 1
  `).get(
    cohort.company_id,
    cohort.module_id,
    cohort.published_cohort_id,
    cohort.published_cohort_id,
    workspaceId,
    cohort.id
  ) as { ok: number } | undefined;

  return Boolean(existingAllocation?.ok);
}

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value || !TIME_REGEX.test(value)) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function slotsOverlap(
  leftStart: string | null,
  leftEnd: string | null,
  rightStart: string | null,
  rightEnd: string | null
): boolean {
  const leftStartMinutes = timeToMinutes(leftStart);
  const leftEndMinutes = timeToMinutes(leftEnd);
  const rightStartMinutes = timeToMinutes(rightStart);
  const rightEndMinutes = timeToMinutes(rightEnd);
  if (
    leftStartMinutes === null ||
    leftEndMinutes === null ||
    rightStartMinutes === null ||
    rightEndMinutes === null
  ) {
    return true;
  }
  if (leftEndMinutes <= leftStartMinutes || rightEndMinutes <= rightStartMinutes) {
    return true;
  }
  return leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
}

export function validatePlanningEncounterPayload(payload: PlanningEncounterPayload): { ok: true } | { ok: false; message: string } {
  if (!ISO_DATE_REGEX.test(payload.day_date)) {
    return { ok: false, message: 'Data inválida.' };
  }
  if (!TIME_REGEX.test(payload.start_time) || !TIME_REGEX.test(payload.end_time)) {
    return { ok: false, message: 'Informe horário inicial e final no formato HH:MM.' };
  }
  const start = timeToMinutes(payload.start_time);
  const end = timeToMinutes(payload.end_time);
  if (start === null || end === null || end <= start) {
    return { ok: false, message: 'Horário final deve ser maior que horário inicial.' };
  }
  return { ok: true };
}

export function findPlanningEncounterConflicts(args: {
  technician_id: string | null | undefined;
  day_date: string;
  start_time: string;
  end_time: string;
  exclude_planning_encounter_id?: string;
  exclude_published_cohort_id?: string;
}): PlanningConflict[] {
  if (!args.technician_id) return [];
  const conflicts: PlanningConflict[] = [];

  const activityRows = db.prepare(`
    select ca.id, ca.title, cad.day_date, cad.all_day, cad.start_time, cad.end_time
    from calendar_activity ca
    join calendar_activity_day cad on cad.activity_id = ca.id
    join calendar_activity_technician cat on cat.activity_id = ca.id
    where cat.technician_id = ?
      and cad.day_date = ?
      and ca.status <> 'Cancelada'
  `).all(args.technician_id, args.day_date) as Array<{
    id: string;
    title: string;
    day_date: string;
    all_day: number;
    start_time: string | null;
    end_time: string | null;
  }>;

  activityRows.forEach((row) => {
    if (Number(row.all_day) === 1 || slotsOverlap(args.start_time, args.end_time, row.start_time, row.end_time)) {
      conflicts.push({
        source_type: 'calendar_activity',
        source_id: row.id,
        title: row.title,
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
  });

  const planningRows = db.prepare(`
    select pe.id, pc.name as title, pe.day_date, pe.start_time, pe.end_time
    from planning_encounter pe
    join planning_cohort pc on pc.id = pe.planning_cohort_id
    where pe.technician_id = ?
      and pe.day_date = ?
      and pe.status <> 'Cancelado'
      and pc.status <> 'Cancelado'
      and (? is null or pe.id <> ?)
  `).all(
    args.technician_id,
    args.day_date,
    args.exclude_planning_encounter_id ?? null,
    args.exclude_planning_encounter_id ?? null
  ) as Array<{ id: string; title: string; day_date: string; start_time: string; end_time: string }>;

  planningRows.forEach((row) => {
    if (slotsOverlap(args.start_time, args.end_time, row.start_time, row.end_time)) {
      conflicts.push({
        source_type: 'planning_encounter',
        source_id: row.id,
        title: row.title,
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
  });

  const cohortRows = db.prepare(`
    select c.id, c.code || ' - ' || c.name as title, csd.day_date, csd.start_time, csd.end_time
    from cohort c
    join cohort_schedule_day csd on csd.cohort_id = c.id
    where c.technician_id = ?
      and csd.day_date = ?
      and c.status <> 'Cancelada'
      and (? is null or c.id <> ?)
  `).all(
    args.technician_id,
    args.day_date,
    args.exclude_published_cohort_id ?? null,
    args.exclude_published_cohort_id ?? null
  ) as Array<{ id: string; title: string; day_date: string; start_time: string | null; end_time: string | null }>;

  cohortRows.forEach((row) => {
    if (slotsOverlap(args.start_time, args.end_time, row.start_time, row.end_time)) {
      conflicts.push({
        source_type: 'cohort',
        source_id: row.id,
        title: row.title,
        day_date: row.day_date,
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
  });

  return conflicts;
}

export function publishPlanningWorkspace(workspaceId: string): {
  created_cohorts: number;
  updated_cohorts: number;
  encounter_count: number;
  version_number: number;
} {
  const workspace = db.prepare('select id from planning_workspace where id = ?').get(workspaceId);
  if (!workspace) {
    throw new Error('Planejamento não encontrado.');
  }

  const planningCohorts = db.prepare(`
    select *
    from planning_cohort
    where workspace_id = ? and status <> 'Cancelado'
    order by created_at asc, id asc
  `).all(workspaceId) as PlanningCohortPublishRow[];

  const planningEncounters = db.prepare(`
    select pe.*
    from planning_encounter pe
    join planning_cohort pc on pc.id = pe.planning_cohort_id
    where pe.workspace_id = ?
      and pe.status <> 'Cancelado'
      and pc.status <> 'Cancelado'
    order by pe.planning_cohort_id asc, pe.encounter_index asc
  `).all(workspaceId) as PlanningEncounterPublishRow[];

  const encountersByCohort = new Map<string, PlanningEncounterPublishRow[]>();
  planningEncounters.forEach((encounter) => {
    const cohortEncounters = encountersByCohort.get(encounter.planning_cohort_id) ?? [];
    cohortEncounters.push(encounter);
    encountersByCohort.set(encounter.planning_cohort_id, cohortEncounters);
  });

  const versionRow = db.prepare(`
    select coalesce(max(version_number), 0) + 1 as version_number
    from planning_version
    where workspace_id = ?
  `).get(workspaceId) as { version_number: number };
  const versionNumber = versionRow.version_number;

  let createdCohorts = 0;
  let updatedCohorts = 0;
  let publishedEncounterCount = 0;
  const now = nowDateIso();

  const tx = db.transaction(() => {
    planningCohorts.forEach((cohort, cohortIndex) => {
      const encounters = [...(encountersByCohort.get(cohort.id) ?? [])].sort((left, right) => (
        left.day_date.localeCompare(right.day_date) ||
        left.start_time.localeCompare(right.start_time) ||
        left.end_time.localeCompare(right.end_time) ||
        left.encounter_index - right.encounter_index ||
        left.id.localeCompare(right.id)
      ));
      if (encounters.length === 0) {
        throw new Error(`Turma planejada ${cohort.name} não possui encontros para publicar.`);
      }

      const firstEncounter = encounters[0];
      const linkedPublishedCohort = findPublishedCohortForPlanning(cohort, workspaceId);
      if (!linkedPublishedCohort && isModuleAlreadyCoveredOutsidePlanning(cohort, workspaceId)) {
        db.prepare(`
          update planning_encounter
          set status = 'Cancelado',
              updated_at = ?
          where workspace_id = ?
            and planning_cohort_id = ?
            and status <> 'Cancelado'
        `).run(now, workspaceId, cohort.id);
        db.prepare(`
          update planning_cohort
          set status = 'Cancelado',
              updated_at = ?
          where id = ?
        `).run(now, cohort.id);
        return;
      }

      const cohortId = linkedPublishedCohort?.id ?? uuid('coh');
      const shouldUpdateExistingCohort = Boolean(linkedPublishedCohort);
      const publishedTechnicianId = firstEncounter.technician_id;
      const startTime = cohort.period === 'Meio_periodo' ? firstEncounter.start_time : null;
      const endTime = cohort.period === 'Meio_periodo' ? firstEncounter.end_time : null;

      if (shouldUpdateExistingCohort) {
        db.prepare(`
          update cohort
          set name = ?,
              start_date = ?,
              technician_id = ?,
              capacity_companies = 1,
              period = ?,
              start_time = ?,
              end_time = ?,
              delivery_mode = ?,
              notes = ?,
              planning_workspace_id = ?,
              planning_cohort_id = ?
          where id = ?
        `).run(
          cohort.name,
          firstEncounter.day_date,
          publishedTechnicianId,
          cohort.period,
          startTime,
          endTime,
          cohort.delivery_mode,
          cohort.notes,
          workspaceId,
          cohort.id,
          cohortId
        );
        updatedCohorts += 1;
        if (cohort.published_cohort_id !== cohortId) {
          db.prepare('update planning_cohort set published_cohort_id = ? where id = ?').run(cohortId, cohort.id);
        }
      } else {
        let inserted = false;
        let attempts = 0;
        while (!inserted && attempts < 20) {
          attempts += 1;
          const cohortCode = nextPlanningCohortCode(workspaceId, cohortIndex + 1);
          try {
            db.prepare(`
              insert into cohort (
                id, code, name, start_date, technician_id, status, capacity_companies,
                period, start_time, end_time, delivery_mode, notes, planning_workspace_id, planning_cohort_id
              ) values (?, ?, ?, ?, ?, 'Planejada', 1, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              cohortId,
              cohortCode,
              cohort.name,
              firstEncounter.day_date,
              publishedTechnicianId,
              cohort.period,
              startTime,
              endTime,
              cohort.delivery_mode,
              cohort.notes,
              workspaceId,
              cohort.id
            );
            inserted = true;
          } catch (error) {
            if (!isCohortCodeCollision(error) || attempts >= 20) {
              throw error;
            }
          }
        }
        db.prepare('update planning_cohort set published_cohort_id = ? where id = ?').run(cohortId, cohort.id);
        createdCohorts += 1;
      }

      db.prepare('delete from cohort_module_block where cohort_id = ?').run(cohortId);
      db.prepare(`
        insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
        values (?, ?, ?, 1, 1, ?)
      `).run(uuid('blk'), cohortId, cohort.module_id, publishedBlockDurationDays(encounters));

      db.prepare('delete from cohort_schedule_day where cohort_id = ?').run(cohortId);
      const insertScheduleDay = db.prepare(`
        insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
        values (?, ?, ?, ?, ?, ?)
      `);
      encounters.forEach((encounter, encounterIndex) => {
        insertScheduleDay.run(
          uuid('csd'),
          cohortId,
          encounterIndex + 1,
          encounter.day_date,
          encounter.start_time,
          encounter.end_time
        );
      });

      const updateEncounter = db.prepare(`
        update planning_encounter
        set status = 'Publicado', published_cohort_id = ?, updated_at = ?
        where id = ?
      `);
      encounters.forEach((encounter) => updateEncounter.run(cohortId, now, encounter.id));

      db.prepare(`
        insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
        values (?, ?, ?, ?, 1, 'Previsto', 'Criado via aba Planejar.')
        on conflict(cohort_id, company_id, module_id)
        do update set
          entry_day = excluded.entry_day,
          status = case
            when cohort_allocation.status = 'Cancelado' then 'Previsto'
            else cohort_allocation.status
          end,
          executed_at = case
            when cohort_allocation.status = 'Cancelado' then null
            else cohort_allocation.executed_at
          end,
          notes = excluded.notes
      `).run(uuid('all'), cohortId, cohort.company_id, cohort.module_id);

      db.prepare(`
        update planning_cohort
        set status = 'Publicado', updated_at = ?
        where id = ?
      `).run(now, cohort.id);
      publishedEncounterCount += encounters.length;
    });

    db.prepare(`
      update planning_workspace
      set status = 'Publicado', published_at = ?, updated_at = ?
      where id = ?
    `).run(now, now, workspaceId);

    db.prepare(`
      insert into planning_version (id, workspace_id, version_number, action, summary_json, created_at)
      values (?, ?, ?, 'publish', ?, ?)
    `).run(uuid('plv'), workspaceId, versionNumber, JSON.stringify({
      created_cohorts: createdCohorts,
      updated_cohorts: updatedCohorts,
      encounter_count: publishedEncounterCount
    }), now);
  });

  tx();

  return {
    created_cohorts: createdCohorts,
    updated_cohorts: updatedCohorts,
    encounter_count: publishedEncounterCount,
    version_number: versionNumber
  };
}

function addDays(dateIso: string, diff: number): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isWeekend(dateIso: string): boolean {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

function formatTime(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`;
}

export function suggestPlanningWindows(args: {
  technician_ids: string[];
  date_from: string;
  date_to: string;
  start_time?: string;
  end_time?: string;
  duration_minutes: number;
  max_results?: number;
}) {
  const suggestions: Array<{ technician_id: string; day_date: string; start_time: string; end_time: string }> = [];
  const startMinute = 8 * 60;
  const endMinute = 18 * 60;
  const maxResults = args.max_results ?? 10;
  const fixedStart = args.start_time && args.end_time ? timeToMinutes(args.start_time) : null;
  const fixedEnd = args.start_time && args.end_time ? timeToMinutes(args.end_time) : null;

  let cursor = args.date_from;
  while (cursor <= args.date_to && suggestions.length < maxResults) {
    if (isWeekend(cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    for (const technicianId of args.technician_ids) {
      const candidateMinutes = fixedStart !== null && fixedEnd !== null && fixedEnd > fixedStart
        ? [fixedStart]
        : Array.from(
          { length: Math.max(0, Math.floor((endMinute - startMinute - args.duration_minutes) / 30) + 1) },
          (_value, index) => startMinute + index * 30
        );

      for (const minute of candidateMinutes) {
        const startTime = fixedStart !== null && fixedEnd !== null ? args.start_time! : formatTime(minute);
        const endTime = fixedStart !== null && fixedEnd !== null ? args.end_time! : formatTime(minute + args.duration_minutes);
        const conflicts = findPlanningEncounterConflicts({
          technician_id: technicianId,
          day_date: cursor,
          start_time: startTime,
          end_time: endTime
        });

        if (conflicts.length === 0) {
          suggestions.push({ technician_id: technicianId, day_date: cursor, start_time: startTime, end_time: endTime });
          break;
        }
      }

      if (suggestions.length >= maxResults) break;
    }

    cursor = addDays(cursor, 1);
  }

  return suggestions;
}
