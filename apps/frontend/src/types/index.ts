export type DashboardResponse = {
  cards: {
    open_cohorts: number;
    cohorts_without_quorum: number;
    next_7_days: number;
    blocked_by_installation: number;
  };
  pending_by_module: Array<{ code: string; name: string; pending: number; ready: number }>;
  load_by_technician: Array<{ id: string; name: string; cohorts_in_month: number }>;
};

export type Cohort = {
  id: string;
  code: string;
  name: string;
  start_date: string;
  technician_id: string | null;
  technician_name?: string;
  technician_calendar_color?: string | null;
  status: string;
  capacity_companies: number;
  period?: 'Integral' | 'Meio_periodo';
  start_time?: string | null;
  end_time?: string | null;
  delivery_mode?: 'Online' | 'Presencial' | 'Hibrida';
  notes: string | null;
  occupancy?: number;
  participant_names?: string;
  company_names?: string;
  module_codes?: string;
  module_names?: string;
  total_duration_days?: number;
  schedule_days_raw?: string;
};

export type Module = {
  id: string;
  code: string;
  category: string;
  name: string;
  duration_days: number;
  profile: string;
  is_mandatory: number;
  delivery_mode?: 'ministrado' | 'entregavel';
  client_hours_policy?: 'consome' | 'nao_consume';
};

export type CompanyHoursSummary = {
  available_hours: number;
  consumed_hours: number;
  balance_hours: number;
  remaining_diarias: number;
  projection?: {
    available_hours: number;
    consumed_hours: number;
    balance_hours: number;
    remaining_diarias: number;
  };
};

export type CompanyHoursLedgerItem = {
  id: string;
  company_id: string;
  event_id: string;
  event_type: string;
  delta_hours: number;
  balance_after: number;
  payload_json: string;
  created_at: string;
  source_detail?: string | null;
};

export type CompanyHoursPendingItem = {
  id: string;
  company_id: string;
  event_id: string;
  event_type: string;
  delta_hours: number;
  reason: string | null;
  status: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
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

export type LicenseRow = {
  id: string;
  company_id: string;
  company_name: string;
  program_id: string | null;
  program_name: string;
  user_name: string;
  module_ids: string[];
  module_list: string;
  license_identifier: string;
  renewal_cycle: 'Mensal' | 'Bimestral' | 'Trimestral' | 'Semestral' | 'Anual';
  expires_at: string;
  notes: string | null;
  last_renewed_at: string | null;
  created_at: string;
  updated_at: string;
  alert_window_days: number;
  days_until_expiration: number;
  alert_level: 'Ok' | 'Atenção' | 'Expirada';
  warning_message: string | null;
};

export type LicenseAlertSummaryItem = {
  id: string;
  company_name: string;
  user_name: string;
  license_identifier: string;
  renewal_cycle: LicenseRow['renewal_cycle'];
  expires_at: string;
  alert_level: LicenseRow['alert_level'];
  days_until_expiration: number;
  warning_message: string | null;
};

export type LicenseAlertSummary = {
  expired_count: number;
  due_soon_count: number;
  total_attention: number;
  next_expiration_at: string | null;
  urgent_items: LicenseAlertSummaryItem[];
};

export type LicenseProgram = {
  id: string;
  name: string;
  topsolid_kind: 'Module' | 'Group' | null;
  topsolid_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
};

export type LicenseImportPreviewItem = {
  kind: 'Module' | 'Group';
  code: string;
  name: string;
  raw_line?: string;
};

export type LicenseImportPreviewMatchedProgram = {
  id: string;
  name: string;
  topsolid_kind: 'Module' | 'Group' | null;
  topsolid_code: string | null;
  imported_kind: 'Module' | 'Group';
  imported_code: string;
  imported_name: string;
};

export type LicenseImportPreviewGroup = {
  expires_at: string;
  item_count: number;
  matched_count: number;
  unmatched_count: number;
  matched_programs: LicenseImportPreviewMatchedProgram[];
  unmatched_items: LicenseImportPreviewItem[];
};

export type LicenseImportPreviewResponse = {
  groups: LicenseImportPreviewGroup[];
  summary: {
    parsed_lines: number;
    ignored_lines: number;
    group_count: number;
    matched_programs: number;
    unmatched_items: number;
  };
};

export type PlanningWorkspaceStatus = 'Rascunho' | 'Publicado' | 'Alteracao_pendente' | 'Arquivado';
export type PlanningMode = 'Manual' | 'Assistido' | 'Automatico';
export type PlanningEncounterStatus = 'Rascunho' | 'Confirmacao_cliente' | 'Confirmado' | 'Publicado' | 'Cancelado';

export type PlanningEncounter = {
  id: string;
  workspace_id: string;
  planning_cohort_id: string;
  company_id: string;
  module_id: string;
  technician_id: string | null;
  technician_name?: string | null;
  encounter_index: number;
  day_date: string;
  start_time: string;
  end_time: string;
  status: PlanningEncounterStatus;
  notes: string | null;
  published_cohort_id: string | null;
};

export type PlanningCohort = {
  id: string;
  workspace_id: string;
  company_id: string;
  company_name: string;
  module_id: string;
  module_code: string;
  module_name: string;
  technician_id: string | null;
  technician_name?: string | null;
  published_cohort_id: string | null;
  name: string;
  status: string;
  delivery_mode: 'Online' | 'Presencial' | 'Hibrida';
  period: 'Integral' | 'Meio_periodo';
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  encounters: PlanningEncounter[];
};

export type PlanningWorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    status: PlanningWorkspaceStatus;
    mode: PlanningMode;
    horizon_days: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
  };
  clients: Array<{
    company_id: string;
    company_name: string;
    priority: number;
    available_module_ids?: string[];
  }>;
  cohorts: PlanningCohort[];
};
