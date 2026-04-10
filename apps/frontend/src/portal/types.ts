export type PortalLoginPayload = {
  slug: string;
  username: string;
  password: string;
};

export type PortalLoginResponse = {
  token: string;
  expires_at: string;
};

export type PortalSessionData = {
  token: string;
  expires_at: string;
};

export type PortalMe = {
  company_id: string;
  company_name: string;
  username: string;
  slug: string;
};

export type PortalOverview = {
  company_id: string;
  company_name: string;
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

export type PortalPlanningItem = {
  company_id: string;
  module_code: string;
  module_name: string;
  status: string;
  completed_at: string | null;
};

export type PortalAgendaItem = {
  id: string;
  company_id: string | null;
  title: string;
  activity_type: string;
  start_date: string;
  end_date: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
};

export type PortalTicketPriority = 'Baixa' | 'Normal' | 'Alta' | 'Critica';

export type PortalTicket = {
  id: string;
  title: string;
  description: string | null;
  priority: PortalTicketPriority;
  created_at: string;
  updated_at: string;
  client_status: string;
};

export type CreatePortalTicketPayload = {
  title: string;
  description?: string | null;
  priority?: PortalTicketPriority;
};

export type PortalAuthedApi = {
  me: () => Promise<PortalMe>;
  overview: () => Promise<PortalOverview>;
  planning: () => Promise<{ items: PortalPlanningItem[] }>;
  agenda: () => Promise<{ items: PortalAgendaItem[] }>;
  tickets: () => Promise<{ items: PortalTicket[] }>;
  createTicket: (payload: CreatePortalTicketPayload) => Promise<{ id: string }>;
};
