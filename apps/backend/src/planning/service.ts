import { db } from '../db.js';
import type { PlanningConflict, PlanningEncounterPayload } from './types.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

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
