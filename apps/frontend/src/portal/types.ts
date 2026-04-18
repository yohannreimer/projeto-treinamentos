export type PortalLoginPayload = {
  slug: string;
  username: string;
  password: string;
};

export type PortalLoginResponse = {
  token: string;
  expires_at: string;
  is_internal: boolean;
};

export type PortalAuthBranding = {
  slug: string;
  company_name: string;
};

export type PortalSessionData = {
  token: string;
  expires_at: string;
  is_internal?: boolean;
};

export type PortalMe = {
  company_id: string;
  company_name: string;
  username: string;
  slug: string;
  is_internal?: boolean;
};

export type PortalOverview = {
  company_id: string;
  company_name: string;
  hours_summary?: PortalHoursSummary | null;
  planning: {
    total: number;
    completed: number;
    in_progress: number;
    planned: number;
  };
  agenda: {
    total: number;
    next_date: string | null;
  };
};

export type PortalHoursSummary = {
  available_hours: number;
  consumed_hours: number;
  balance_hours: number;
  remaining_diarias: number;
  updated_at?: string;
};

export type PortalPlanningItem = {
  company_id: string;
  module_id: string;
  module_code: string;
  module_name: string;
  status: string;
  completed_at: string | null;
  delivery_mode?: 'ministrado' | 'entregavel';
  planned_diarias?: number;
  planned_hours?: number;
  actual_client_consumed_hours?: number;
  total_encounters?: number | null;
  completed_encounters?: number | null;
  remaining_encounters?: number | null;
  next_dates?: string[];
  current_cohort?: string | null;
};

export type PortalAgendaItem = {
  id: string;
  company_id: string | null;
  module_id?: string | null;
  title: string;
  activity_type: string;
  start_date: string;
  end_date: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  source?: 'agenda' | 'jornada' | 'manual';
  module_name?: string;
  encounter_index?: number;
  total_encounters?: number;
};

export type PortalOperatorDisplaySettings = {
  support_intro_text: string | null;
  hidden_module_ids: string[];
  module_date_overrides: Array<{ module_id: string; next_date: string }>;
  module_status_overrides: Array<{ module_id: string; status: 'Planejado' | 'Em_execucao' | 'Concluido' }>;
};

export type PortalOperatorAgendaItem = {
  id: string;
  title: string;
  activity_type: string;
  start_date: string;
  end_date: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  status: 'Planejada' | 'Em_andamento' | 'Concluida' | 'Cancelada';
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PortalTicketPriority = 'Baixa' | 'Normal' | 'Alta' | 'Critica';
export type PortalTicketSource = 'Portal' | 'Operacao';
export type PortalRealtimeSide = 'cliente' | 'holand';

export type PortalTicketRealtimeSummary = {
  unread_count?: number | null;
  client_online?: boolean | null;
  holand_online?: boolean | null;
  typing_side?: PortalRealtimeSide | null;
  typing_at?: string | null;
  last_message_preview?: string | null;
};

export type PortalTicket = {
  id: string;
  title: string;
  description: string | null;
  priority: PortalTicketPriority;
  created_at: string;
  updated_at: string;
  workflow_stage?: string;
  client_status: string;
  source: PortalTicketSource;
  realtime?: PortalTicketRealtimeSummary | null;
};

export type PortalTicketsResponse = {
  items: PortalTicket[];
  support_intro_text?: string | null;
};

export type CreatePortalTicketPayload = {
  title: string;
  description?: string | null;
  whatsapp_number?: string | null;
  priority?: PortalTicketPriority;
  attachments?: Array<{
    file_name: string;
    file_data_base64: string;
  }>;
};

export type PortalTicketMessageAttachment = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  download_url: string;
};

export type PortalTicketMessage = {
  id: string;
  author_type: 'Cliente' | 'Holand';
  author_label: string | null;
  body: string | null;
  created_at: string;
  attachments: PortalTicketMessageAttachment[];
};

export type PortalTicketThreadResponse = {
  ticket_id: string;
  messages: PortalTicketMessage[];
  note?: string;
  has_unread?: boolean;
  unread_for_cliente?: boolean;
  unread_for_holand?: boolean;
  last_message_at?: string | null;
  last_read_cliente_at?: string | null;
  last_read_holand_at?: string | null;
  whatsapp_number?: string | null;
  unread_count?: number | null;
  last_read_at?: string | null;
  presence?: {
    client_online?: boolean | null;
    holand_online?: boolean | null;
  } | null;
  typing?: {
    side?: PortalRealtimeSide | null;
    is_typing?: boolean | null;
    created_at?: string | null;
  } | null;
};

export type PortalAuthedApi = {
  me: () => Promise<PortalMe>;
  overview: () => Promise<PortalOverview>;
  planning: () => Promise<{ items: PortalPlanningItem[]; hours_summary?: PortalHoursSummary | null }>;
  agenda: () => Promise<{ items: PortalAgendaItem[] }>;
  operatorDisplaySettings: () => Promise<PortalOperatorDisplaySettings>;
  updateOperatorDisplaySettings: (payload: PortalOperatorDisplaySettings) => Promise<{ ok: boolean }>;
  operatorAgendaItems: () => Promise<{ items: PortalOperatorAgendaItem[] }>;
  createOperatorAgendaItem: (payload: {
    title: string;
    activity_type?: string;
    start_date: string;
    end_date?: string;
    all_day?: boolean;
    start_time?: string | null;
    end_time?: string | null;
    status?: 'Planejada' | 'Em_andamento' | 'Concluida' | 'Cancelada';
    notes?: string | null;
  }) => Promise<{ id: string }>;
  deleteOperatorAgendaItem: (id: string) => Promise<{ ok: boolean }>;
  updateTicketWorkflow: (
    ticketId: string,
    payload: { workflow_stage: 'Backlog' | 'A_fazer' | 'Em_andamento' | 'Concluido' }
  ) => Promise<{ ok: boolean; workflow_stage: string }>;
  tickets: () => Promise<PortalTicketsResponse>;
  ticketThread: (ticketId: string) => Promise<PortalTicketThreadResponse>;
  createTicket: (payload: CreatePortalTicketPayload) => Promise<{ id: string }>;
  createTicketMessage: (
    ticketId: string,
    payload: {
      body?: string | null;
      attachments?: Array<{ file_name: string; file_data_base64: string }>;
    }
  ) => Promise<{ id: string }>;
  markTicketRead: (ticketId: string) => Promise<{
    ok: boolean;
    ticket_id: string;
    read_at: string;
    has_unread?: boolean;
    unread_for_cliente?: boolean;
    unread_for_holand?: boolean;
  }>;
  ticketRealtimeHeartbeat: (
    ticketId: string,
    payload?: { active?: boolean; is_typing?: boolean }
  ) => Promise<{
    presence: {
      client_online?: boolean | null;
      holand_online?: boolean | null;
    };
    typing: {
      side?: PortalRealtimeSide | null;
      is_typing?: boolean | null;
      created_at?: string | null;
    };
  }>;
};
