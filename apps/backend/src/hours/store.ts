import { db, uuid } from '../db.js';
import type { AppendHoursEventInput, HoursEventRow } from './types.js';

type AppendHoursEventResult = {
  inserted: boolean;
  event: HoursEventRow;
};

function mapHoursEventRow(row: {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  company_id: string;
  event_type: string;
  payload_json: string;
  idempotency_key: string;
  actor_type: string;
  actor_id: string | null;
  correlation_id: string | null;
  occurred_at: string;
  created_at: string;
}): HoursEventRow {
  return row as HoursEventRow;
}

export function readHoursEventByIdempotencyKey(idempotencyKey: string): HoursEventRow | null {
  const row = db.prepare(`
    select
      id,
      aggregate_type,
      aggregate_id,
      company_id,
      event_type,
      payload_json,
      idempotency_key,
      actor_type,
      actor_id,
      correlation_id,
      occurred_at,
      created_at
    from hours_event_store
    where idempotency_key = ?
    limit 1
  `).get(idempotencyKey) as HoursEventRow | undefined;

  return row ?? null;
}

export function appendHoursEvent(input: AppendHoursEventInput): AppendHoursEventResult {
  const eventId = input.id ?? uuid('hevt');
  const occurredAt = input.occurred_at ?? new Date().toISOString();
  const createdAt = input.created_at ?? occurredAt;
  const payloadJson = JSON.stringify(input.payload);

  const result = db.prepare(`
    insert or ignore into hours_event_store (
      id,
      aggregate_type,
      aggregate_id,
      company_id,
      event_type,
      payload_json,
      idempotency_key,
      actor_type,
      actor_id,
      correlation_id,
      occurred_at,
      created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    input.aggregate_type,
    input.aggregate_id,
    input.company_id,
    input.event_type,
    payloadJson,
    input.idempotency_key,
    input.actor_type,
    input.actor_id ?? null,
    input.correlation_id ?? null,
    occurredAt,
    createdAt
  );

  const event = readHoursEventByIdempotencyKey(input.idempotency_key);
  if (!event) {
    throw new Error(`Nao foi possivel localizar evento apos append: ${input.idempotency_key}`);
  }

  return {
    inserted: result.changes > 0,
    event
  };
}

export function listHoursEventsByCompany(companyId: string): HoursEventRow[] {
  const rows = db.prepare(`
    select
      id,
      aggregate_type,
      aggregate_id,
      company_id,
      event_type,
      payload_json,
      idempotency_key,
      actor_type,
      actor_id,
      correlation_id,
      occurred_at,
      created_at
    from hours_event_store
    where company_id = ?
    order by occurred_at asc, created_at asc, id asc
  `).all(companyId) as HoursEventRow[];

  return rows.map(mapHoursEventRow);
}

export function listHoursEventsByAggregate(
  aggregateType: AppendHoursEventInput['aggregate_type'],
  aggregateId: string
): HoursEventRow[] {
  const rows = db.prepare(`
    select
      id,
      aggregate_type,
      aggregate_id,
      company_id,
      event_type,
      payload_json,
      idempotency_key,
      actor_type,
      actor_id,
      correlation_id,
      occurred_at,
      created_at
    from hours_event_store
    where aggregate_type = ?
      and aggregate_id = ?
    order by occurred_at asc, created_at asc, id asc
  `).all(aggregateType, aggregateId) as HoursEventRow[];

  return rows.map(mapHoursEventRow);
}
