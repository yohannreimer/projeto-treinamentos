import { db, uuid } from '../db.js';
import type {
  DeliverableWorklogLoggedPayload,
  HoursBalanceRow,
  HoursEventRow,
  HoursLedgerRow,
  HoursPendingRow,
  HoursAdjustmentPayload,
  ModuleScopeDefinedPayload,
  TrainingEncounterCompletedPayload
} from './types.js';

function parsePayload<T>(row: HoursEventRow): T {
  return JSON.parse(row.payload_json) as T;
}

function readBalance(companyId: string): HoursBalanceRow {
  const row = db.prepare(`
    select
      company_id,
      available_hours,
      consumed_hours,
      balance_hours,
      remaining_diarias,
      updated_at
    from hours_projection_balance
    where company_id = ?
    limit 1
  `).get(companyId) as HoursBalanceRow | undefined;

  return row ?? {
    company_id: companyId,
    available_hours: 0,
    consumed_hours: 0,
    balance_hours: 0,
    remaining_diarias: 0,
    updated_at: ''
  };
}

function writeBalance(balance: HoursBalanceRow) {
  db.prepare(`
    insert into hours_projection_balance (
      company_id,
      available_hours,
      consumed_hours,
      balance_hours,
      remaining_diarias,
      updated_at
    ) values (?, ?, ?, ?, ?, ?)
    on conflict(company_id) do update set
      available_hours = excluded.available_hours,
      consumed_hours = excluded.consumed_hours,
      balance_hours = excluded.balance_hours,
      remaining_diarias = excluded.remaining_diarias,
      updated_at = excluded.updated_at
  `).run(
    balance.company_id,
    balance.available_hours,
    balance.consumed_hours,
    balance.balance_hours,
    balance.remaining_diarias,
    balance.updated_at
  );
}

function appendLedger(event: HoursEventRow, deltaHours: number, balanceAfter: number) {
  const exists = readLedgerByEventId(event.id);
  if (exists) return;

  db.prepare(`
    insert into hours_projection_ledger (
      id,
      company_id,
      event_id,
      event_type,
      delta_hours,
      balance_after,
      payload_json,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid('hled'),
    event.company_id,
    event.id,
    event.event_type,
    deltaHours,
    balanceAfter,
    event.payload_json,
    event.occurred_at
  );
}

function readLedgerByEventId(eventId: string): { id: string } | null {
  const row = db.prepare(`
    select id
    from hours_projection_ledger
    where event_id = ?
    limit 1
  `).get(eventId) as { id: string } | undefined;
  return row ?? null;
}

function readPendingByEventId(eventId: string): { id: string } | null {
  const row = db.prepare(`
    select id
    from hours_projection_pending
    where event_id = ?
    limit 1
  `).get(eventId) as { id: string } | undefined;
  return row ?? null;
}

function upsertPending(event: HoursEventRow, payload: HoursAdjustmentPayload) {
  const existing = db.prepare(`
    select id
    from hours_projection_pending
    where event_id = ?
    limit 1
  `).get(event.id) as { id: string } | undefined;

  if (existing) return;

  db.prepare(`
    insert into hours_projection_pending (
      id,
      company_id,
      event_id,
      event_type,
      delta_hours,
      reason,
      status,
      payload_json,
      created_at,
      updated_at
    ) values (?, ?, ?, ?, ?, ?, 'Pendente', ?, ?, ?)
  `).run(
    uuid('hpen'),
    event.company_id,
    event.id,
    event.event_type,
    payload.delta_hours,
    payload.reason ?? null,
    event.payload_json,
    event.occurred_at,
    event.occurred_at
  );
}

function markPendingStatus(sourceEventId: string | null | undefined, status: 'Confirmado' | 'Rejeitado', updatedAt: string) {
  if (!sourceEventId) return;
  db.prepare(`
    update hours_projection_pending
    set status = ?, updated_at = ?
    where event_id = ?
  `).run(status, updatedAt, sourceEventId);
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function applyDelta(balance: HoursBalanceRow, deltaHours: number, occurredAt: string): HoursBalanceRow {
  const nextAvailable = roundHours(balance.available_hours + Math.max(deltaHours, 0));
  const nextConsumed = roundHours(balance.consumed_hours + Math.abs(Math.min(deltaHours, 0)));
  const nextBalance = roundHours(balance.balance_hours + deltaHours);
  return {
    ...balance,
    available_hours: nextAvailable,
    consumed_hours: nextConsumed,
    balance_hours: nextBalance,
    remaining_diarias: roundHours(nextBalance / 8),
    updated_at: occurredAt
  };
}

export function projectHoursEvent(event: HoursEventRow) {
  const tx = db.transaction(() => {
    // Projection-level dedupe protects replay/rebuild flows from double-applying
    // balance mutations if this same event is projected more than once.
    if (event.event_type === 'hours_adjustment_suggested') {
      if (readPendingByEventId(event.id)) return;
    } else if (readLedgerByEventId(event.id)) {
      return;
    }

    const balance = readBalance(event.company_id);

    if (event.event_type === 'module_scope_defined') {
      const payload = parsePayload<ModuleScopeDefinedPayload>(event);
      const nextBalance: HoursBalanceRow = {
        ...balance,
        available_hours: roundHours(payload.available_hours),
        balance_hours: roundHours(payload.available_hours - balance.consumed_hours),
        remaining_diarias: roundHours((payload.available_hours - balance.consumed_hours) / 8),
        updated_at: event.occurred_at
      };
      writeBalance(nextBalance);
      appendLedger(event, 0, nextBalance.balance_hours);
      return;
    }

    if (event.event_type === 'hours_adjustment_suggested') {
      const payload = parsePayload<HoursAdjustmentPayload>(event);
      upsertPending(event, payload);
      return;
    }

    if (event.event_type === 'hours_adjustment_rejected') {
      const payload = parsePayload<HoursAdjustmentPayload>(event);
      markPendingStatus(payload.source_event_id, 'Rejeitado', event.occurred_at);
      appendLedger(event, 0, balance.balance_hours);
      return;
    }

    if (event.event_type === 'hours_adjustment_confirmed' || event.event_type === 'hours_manual_adjustment_added') {
      const payload = parsePayload<HoursAdjustmentPayload>(event);
      const nextBalance = applyDelta(balance, payload.delta_hours, event.occurred_at);
      writeBalance(nextBalance);
      if (event.event_type === 'hours_adjustment_confirmed') {
        markPendingStatus(payload.source_event_id, 'Confirmado', event.occurred_at);
      }
      appendLedger(event, payload.delta_hours, nextBalance.balance_hours);
      return;
    }

    if (event.event_type === 'training_encounter_completed') {
      const payload = parsePayload<TrainingEncounterCompletedPayload>(event);
      const nextBalance = applyDelta(balance, -Math.abs(payload.hours_consumed), event.occurred_at);
      writeBalance(nextBalance);
      appendLedger(event, -Math.abs(payload.hours_consumed), nextBalance.balance_hours);
      return;
    }

    if (event.event_type === 'deliverable_worklog_logged') {
      const payload = parsePayload<DeliverableWorklogLoggedPayload>(event);
      if (!Number.isFinite(payload.minutes_logged) || payload.minutes_logged < 0) {
        throw new Error('minutes_logged invalido para deliverable_worklog_logged');
      }
      appendLedger(event, 0, balance.balance_hours);
    }
  });

  tx();
}

export function readHoursBalance(companyId: string): HoursBalanceRow | null {
  const row = db.prepare(`
    select
      company_id,
      available_hours,
      consumed_hours,
      balance_hours,
      remaining_diarias,
      updated_at
    from hours_projection_balance
    where company_id = ?
    limit 1
  `).get(companyId) as HoursBalanceRow | undefined;

  return row ?? null;
}

export function listHoursLedger(companyId: string): HoursLedgerRow[] {
  return db.prepare(`
    select
      id,
      company_id,
      event_id,
      event_type,
      delta_hours,
      balance_after,
      payload_json,
      created_at
    from hours_projection_ledger
    where company_id = ?
    order by created_at asc, id asc
  `).all(companyId) as HoursLedgerRow[];
}

export function listHoursPending(companyId: string): HoursPendingRow[] {
  return db.prepare(`
    select
      id,
      company_id,
      event_id,
      event_type,
      delta_hours,
      reason,
      status,
      payload_json,
      created_at,
      updated_at
    from hours_projection_pending
    where company_id = ?
    order by created_at asc, id asc
  `).all(companyId) as HoursPendingRow[];
}
