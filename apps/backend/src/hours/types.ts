export type HoursEventType =
  | 'module_scope_defined'
  | 'hours_adjustment_suggested'
  | 'hours_adjustment_confirmed'
  | 'hours_adjustment_rejected'
  | 'hours_manual_adjustment_added'
  | 'training_encounter_completed'
  | 'deliverable_worklog_logged';

export type HoursActorType = 'system' | 'operator' | 'portal_client';

export type HoursAggregateType =
  | 'company_hours_account'
  | 'module_scope'
  | 'deliverable_worklog';

export type ModuleScopeDefinedPayload = {
  available_hours: number;
  reason?: string | null;
};

export type HoursAdjustmentPayload = {
  delta_hours: number;
  consumed_delta?: number;
  module_id?: string | null;
  reason?: string | null;
  source_event_id?: string | null;
  deleted_ledger_id?: string | null;
};

export type TrainingEncounterCompletedPayload = {
  hours_consumed: number;
  module_id?: string | null;
  encounter_id?: string | null;
  reason?: string | null;
};

export type DeliverableWorklogLoggedPayload = {
  minutes_logged: number;
  module_id: string;
  activity_id?: string | null;
  reason?: string | null;
};

export type HoursEventPayloadByType = {
  module_scope_defined: ModuleScopeDefinedPayload;
  hours_adjustment_suggested: HoursAdjustmentPayload;
  hours_adjustment_confirmed: HoursAdjustmentPayload;
  hours_adjustment_rejected: HoursAdjustmentPayload;
  hours_manual_adjustment_added: HoursAdjustmentPayload;
  training_encounter_completed: TrainingEncounterCompletedPayload;
  deliverable_worklog_logged: DeliverableWorklogLoggedPayload;
};

export type HoursEventPayload<TType extends HoursEventType> = HoursEventPayloadByType[TType];

export type AppendHoursEventInput<TType extends HoursEventType = HoursEventType> = {
  id?: string;
  aggregate_type: HoursAggregateType;
  aggregate_id: string;
  company_id: string;
  event_type: TType;
  payload: HoursEventPayload<TType>;
  idempotency_key: string;
  actor_type: HoursActorType;
  actor_id?: string | null;
  correlation_id?: string | null;
  occurred_at?: string;
  created_at?: string;
};

export type HoursEventRow = {
  id: string;
  aggregate_type: HoursAggregateType;
  aggregate_id: string;
  company_id: string;
  event_type: HoursEventType;
  payload_json: string;
  idempotency_key: string;
  actor_type: HoursActorType;
  actor_id: string | null;
  correlation_id: string | null;
  occurred_at: string;
  created_at: string;
};

export type HoursBalanceRow = {
  company_id: string;
  available_hours: number;
  consumed_hours: number;
  balance_hours: number;
  remaining_diarias: number;
  updated_at: string;
};

export type HoursLedgerRow = {
  id: string;
  company_id: string;
  event_id: string;
  event_type: HoursEventType;
  delta_hours: number;
  balance_after: number;
  payload_json: string;
  created_at: string;
};

export type HoursPendingRow = {
  id: string;
  company_id: string;
  event_id: string;
  event_type: HoursEventType;
  delta_hours: number;
  reason: string | null;
  status: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
};
