import { db } from '../db.js';
import { projectHoursEvent, listHoursLedger, listHoursPending, readHoursBalance } from './projector.js';
import {
  appendHoursEvent,
  listHoursEventsByAggregate,
  listHoursEventsByCompany,
  readHoursEventByIdempotencyKey
} from './store.js';
import type { AppendHoursEventInput, HoursBalanceRow, HoursEventRow, HoursLedgerRow, HoursPendingRow } from './types.js';

export type AppendAndProjectResult = {
  inserted: boolean;
  event: HoursEventRow;
};

export function appendAndProject(input: AppendHoursEventInput): AppendAndProjectResult {
  const tx = db.transaction(() => {
    const result = appendHoursEvent(input);
    if (result.inserted) {
      projectHoursEvent(result.event);
    }
    return result;
  });

  return tx();
}

export function getHoursBalance(companyId: string): HoursBalanceRow | null {
  return readHoursBalance(companyId);
}

export function getHoursLedger(companyId: string): HoursLedgerRow[] {
  return listHoursLedger(companyId);
}

export function getHoursPending(companyId: string): HoursPendingRow[] {
  return listHoursPending(companyId);
}

export function getHoursEventByIdempotencyKey(idempotencyKey: string): HoursEventRow | null {
  return readHoursEventByIdempotencyKey(idempotencyKey);
}

export function getHoursEventsByCompany(companyId: string): HoursEventRow[] {
  return listHoursEventsByCompany(companyId);
}

export function getHoursEventsByAggregate(
  aggregateType: AppendHoursEventInput['aggregate_type'],
  aggregateId: string
): HoursEventRow[] {
  return listHoursEventsByAggregate(aggregateType, aggregateId);
}
