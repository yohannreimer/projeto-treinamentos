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
  status: string;
  capacity_companies: number;
  period?: 'Integral' | 'Meio_periodo';
  start_time?: string | null;
  end_time?: string | null;
  delivery_mode?: 'Online' | 'Presencial' | 'Hibrida';
  notes: string | null;
  occupancy?: number;
  participant_names?: string;
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
  renewal_cycle: 'Mensal' | 'Anual';
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

export type LicenseProgram = {
  id: string;
  name: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  usage_count: number;
};
