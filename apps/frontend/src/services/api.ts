import type {
  CompanyHoursLedgerItem,
  CompanyHoursPendingItem,
  CompanyHoursSummary
} from '../types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

type CalendarActivityHoursScope = 'none' | 'client_consumption' | 'internal_effort';
type CalendarActivityDateSchedulePayload = {
  day_date: string;
  all_day?: boolean;
  start_time?: string | null;
  end_time?: string | null;
};
type CalendarActivityUpsertPayload = {
  title: string;
  activity_type: 'Visita_cliente' | 'Pre_vendas' | 'Pos_vendas' | 'Suporte' | 'Implementacao' | 'Reuniao' | 'Outro';
  start_date: string;
  end_date: string;
  selected_dates: string[];
  date_schedules: CalendarActivityDateSchedulePayload[];
  all_day: boolean;
  start_time?: string | null;
  end_time?: string | null;
  company_id?: string | null;
  technician_ids?: string[];
  status: 'Planejada' | 'Em_andamento' | 'Concluida' | 'Cancelada';
  notes?: string | null;
  linked_module_id?: string | null;
  hours_scope?: CalendarActivityHoursScope;
};

function withConfirmation(path: string, confirmationPhrase?: string): string {
  const normalized = confirmationPhrase?.trim();
  if (!normalized) {
    return path;
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}confirmation_phrase=${encodeURIComponent(normalized)}`;
}

async function req<T = any>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      ...init
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Timeout ao conectar com a API (10s).'
      : 'Falha de conexao com a API.';
    throw new Error(message);
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as { message?: string };
      throw new Error(parsed.message || body || 'Erro na API');
    } catch {
      throw new Error(body || 'Erro na API');
    }
  }

  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => req('/dashboard'),
  calendar: () => req('/calendar/cohorts'),
  calendarActivities: () => req('/calendar/activities'),
  createCalendarActivity: (payload: CalendarActivityUpsertPayload) =>
    req('/calendar/activities', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateCalendarActivity: (id: string, payload: Partial<CalendarActivityUpsertPayload>) =>
    req(`/calendar/activities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteCalendarActivity: (id: string) =>
    req(`/calendar/activities/${id}`, { method: 'DELETE' }),
  cohorts: () => req('/cohorts'),
  cohortById: (id: string) => req(`/cohorts/${id}`),
  createCohort: (payload: unknown) =>
    req('/cohorts', { method: 'POST', body: JSON.stringify(payload) }),
  checkTechnicianConflict: (payload: {
    technician_id: string;
    start_date: string;
    status: string;
    period?: 'Integral' | 'Meio_periodo';
    start_time?: string | null;
    end_time?: string | null;
    schedule_days?: Array<{
      day_index: number;
      day_date: string;
      start_time?: string | null;
      end_time?: string | null;
    }>;
    blocks: Array<{
      module_id: string;
      order_in_cohort: number;
      start_day_offset: number;
      duration_days: number;
    }>;
    exclude_cohort_id?: string;
  }) =>
    req('/cohorts/check-technician-conflict', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateCohort: (id: string, payload: unknown) =>
    req(`/cohorts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCohort: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/cohorts/${id}`, confirmation_phrase), { method: 'DELETE' }),
  addCohortParticipant: (cohortId: string, payload: { company_id: string; participant_name: string }) =>
    req(`/cohorts/${cohortId}/participants`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  deleteCohortParticipant: (cohortId: string, participantId: string) =>
    req(`/cohorts/${cohortId}/participants/${participantId}`, { method: 'DELETE' }),
  updateCohortParticipantModules: async (cohortId: string, participantId: string, payload: { module_ids: string[] }) => {
    const path = `/cohorts/${cohortId}/participants/${participantId}/modules`;
    try {
      return await req(path, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('Cannot PATCH')) {
        throw error;
      }
      return req(path, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
  },
  cohortCertificateUrl: (
    cohortId: string,
    companyId: string,
    options?: { download?: boolean; format?: 'pdf' | 'html'; moduleId?: string }
  ) => {
    const params = new URLSearchParams();
    params.set('company_id', companyId);
    params.set('format', options?.format ?? 'pdf');
    if (options?.moduleId) {
      params.set('module_id', options.moduleId);
    }
    if (options?.download) {
      params.set('download', '1');
    }
    return `${BASE_URL}/cohorts/${cohortId}/certificate?${params.toString()}`;
  },
  allocationSuggestions: (cohortId: string, moduleId: string) =>
    req(`/cohorts/${cohortId}/suggestions/${moduleId}`),
  createAllocation: (payload: unknown) =>
    req('/allocations', { method: 'POST', body: JSON.stringify(payload) }),
  allocateCompanyByEntryModule: (
    cohortId: string,
    payload: {
      company_id: string;
      entry_module_id: string;
      module_ids: string[];
      notes?: string | null;
    }
  ) =>
    req(`/cohorts/${cohortId}/allocate-company`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateAllocationStatus: (id: string, payload: unknown) =>
    req(`/allocations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  companies: () => req('/companies'),
  createCompany: (payload: unknown) =>
    req('/companies', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateCompany: (id: string, payload: unknown) =>
    req(`/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteCompany: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/companies/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  companyById: (id: string) => req(`/companies/${id}`),
  portalAccessByCompany: (companyId: string) =>
    req<{
      slug: string | null;
      username: string | null;
      is_active: boolean;
      support_intro_text: string | null;
      hidden_module_ids: string[];
      module_date_overrides: Array<{ module_id: string; next_date: string }>;
    }>(`/companies/${companyId}/portal-access`),
  upsertPortalAccessByCompany: (
    companyId: string,
    payload: {
      slug: string;
      username: string;
      password?: string;
      is_active: boolean;
      support_intro_text?: string | null;
      hidden_module_ids?: string[];
      module_date_overrides?: Array<{ module_id: string; next_date: string }>;
    }
  ) =>
    req<{ ok: boolean; portal_client_id: string }>(`/companies/${companyId}/portal-access`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  licensePrograms: () => req('/license-programs'),
  createLicenseProgram: (payload: unknown) =>
    req('/license-programs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateLicenseProgram: (id: string, payload: unknown) =>
    req(`/license-programs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteLicenseProgram: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/license-programs/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  internalDocuments: () => req('/internal-documents'),
  createInternalDocument: (payload: unknown) =>
    req('/internal-documents', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  deleteInternalDocument: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/internal-documents/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  internalDocumentDownloadUrl: (id: string) => `${BASE_URL}/internal-documents/${id}/download`,
  licenses: () => req('/licenses'),
  createLicense: (payload: unknown) =>
    req('/licenses', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateLicense: (id: string, payload: unknown) =>
    req(`/licenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteLicense: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/licenses/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  renewLicense: (id: string) =>
    req(`/licenses/${id}/renew`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  updateCompanyModuleActivation: (companyId: string, moduleId: string, payload: { is_enabled: boolean }) =>
    req(`/companies/${companyId}/modules/${moduleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  updateCompanyPriority: (id: string, payload: { priority?: number; priority_level?: string }) =>
    req(`/companies/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  updateCompanyProgress: (companyId: string, moduleId: string, payload: unknown) =>
    req(`/companies/${companyId}/progress/${moduleId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  companyHoursSummary: (companyId: string) =>
    req<CompanyHoursSummary>(`/companies/${companyId}/hours/summary`),
  companyHoursLedger: (companyId: string) =>
    req<{ items: CompanyHoursLedgerItem[] }>(`/companies/${companyId}/hours/ledger`),
  companyHoursPending: (companyId: string) =>
    req<{ items: CompanyHoursPendingItem[] }>(`/companies/${companyId}/hours/pending`),
  confirmCompanyHoursPending: (companyId: string, pendingId: string, payload?: { reason?: string }) =>
    req<{ ok: boolean; inserted: boolean; event_id: string }>(`/companies/${companyId}/hours/pending/${pendingId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {})
    }),
  rejectCompanyHoursPending: (companyId: string, pendingId: string, payload?: { reason?: string }) =>
    req<{ ok: boolean; inserted: boolean; event_id: string }>(`/companies/${companyId}/hours/pending/${pendingId}/reject`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {})
    }),
  createCompanyHoursAdjustment: (
    companyId: string,
    payload: { delta_hours: number; reason: string; idempotency_key?: string }
  ) =>
    req<{ ok: boolean; inserted: boolean; event_id: string }>(`/companies/${companyId}/hours/adjustments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  technicians: () => req('/technicians'),
  createTechnician: (payload: unknown) =>
    req('/technicians', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateTechnician: (id: string, payload: unknown) =>
    req(`/technicians/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteTechnician: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/technicians/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  technicianCalendar: (id: string, params?: { date_from?: string; date_to?: string }) => {
    const query = new URLSearchParams();
    if (params?.date_from) query.set('date_from', params.date_from);
    if (params?.date_to) query.set('date_to', params.date_to);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return req(`/technicians/${id}/calendar${suffix}`);
  },
  updateTechnicianSkills: (id: string, payload: unknown) =>
    req(`/technicians/${id}/skills`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  implementationKanban: () => req('/implementation/kanban'),
  implementationKanbanConversation: (cardId: string) =>
    req<{
      linked: boolean;
      ticket_id: string | null;
      unread_count: number;
      note?: string;
      messages: Array<{
        id: string;
        author_type: 'Cliente' | 'Holand';
        author_label: string | null;
        body: string | null;
        created_at: string;
        attachments: Array<{
          id: string;
          file_name: string;
          mime_type: string;
          file_size_bytes: number;
          created_at: string;
          download_url: string;
        }>;
      }>;
    }>(`/implementation/kanban/cards/${cardId}/conversation`),
  createImplementationKanbanConversationMessage: (
    cardId: string,
    payload: {
      body?: string | null;
      attachments?: Array<{ file_name: string; file_data_base64: string }>;
    }
  ) =>
    req<{ id: string }>(`/implementation/kanban/cards/${cardId}/conversation/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  markImplementationKanbanConversationRead: (cardId: string) =>
    req<{ ok: boolean; linked: boolean; ticket_id: string | null; read_at?: string }>(
      `/implementation/kanban/cards/${cardId}/conversation/read`,
      { method: 'POST' }
    ),
  implementationKanbanConversationRealtimeSession: (cardId: string) =>
    req<{ linked: boolean; ticket_id: string | null; realtime_token: string; expires_at: string }>(
      `/implementation/kanban/cards/${cardId}/conversation/realtime-session`,
      { method: 'POST' }
    ),
  implementationKanbanConversationRealtimeHeartbeat: (
    cardId: string,
    payload?: { active?: boolean; is_typing?: boolean }
  ) =>
    req<{
      ticket_id: string;
      presence: {
        client_online?: boolean | null;
        holand_online?: boolean | null;
      };
      typing: {
        side?: 'cliente' | 'holand' | null;
        is_typing?: boolean | null;
        created_at?: string | null;
      };
    }>(
      `/implementation/kanban/cards/${cardId}/conversation/realtime-heartbeat`,
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
      }
    ),
  implementationKanbanConversationAttachmentUrl: (cardId: string, attachmentId: string) =>
    `${BASE_URL}/implementation/kanban/cards/${cardId}/conversation/attachments/${attachmentId}/download`,
  createImplementationKanbanCard: (payload: {
    title: string;
    description?: string | null;
    column_id: string;
    client_name?: string | null;
    license_name?: string | null;
    module_name?: string | null;
    technician_id?: string | null;
    subcategory?: 'Pre_vendas' | 'Pos_vendas' | 'Suporte' | 'Implementacao' | null;
    support_resolution?: string | null;
    support_third_party_notes?: string | null;
    support_handoff_target?: 'Conosco' | 'Sao_Paulo' | null;
    support_handoff_date?: string | null;
    priority?: 'Alta' | 'Normal' | 'Baixa' | 'Critica';
    due_date?: string | null;
    attachment_image_data_url?: string | null;
    attachment_file_name?: string | null;
    attachment_file_data_base64?: string | null;
  }) =>
    req('/implementation/kanban/cards', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateImplementationKanbanCard: (id: string, payload: {
    title?: string;
    description?: string | null;
    column_id?: string;
    position?: number;
    client_name?: string | null;
    license_name?: string | null;
    module_name?: string | null;
    technician_id?: string | null;
    subcategory?: 'Pre_vendas' | 'Pos_vendas' | 'Suporte' | 'Implementacao' | null;
    support_resolution?: string | null;
    support_third_party_notes?: string | null;
    support_handoff_target?: 'Conosco' | 'Sao_Paulo' | null;
    support_handoff_date?: string | null;
    priority?: 'Alta' | 'Normal' | 'Baixa' | 'Critica';
    due_date?: string | null;
    attachment_image_data_url?: string | null;
    attachment_file_name?: string | null;
    attachment_file_data_base64?: string | null;
  }) =>
    req(`/implementation/kanban/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  reorderImplementationKanban: (payload: {
    columns: Array<{ column_id: string; card_ids: string[] }>;
  }) =>
    req('/implementation/kanban/reorder', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createImplementationKanbanColumn: (payload: { title: string; color?: string }) =>
    req('/implementation/kanban/columns', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateImplementationKanbanColumn: (id: string, payload: { title?: string; color?: string; position?: number }) =>
    req(`/implementation/kanban/columns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  reorderImplementationKanbanColumns: (payload: { column_ids: string[] }) =>
    req('/implementation/kanban/columns/reorder', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  deleteImplementationKanbanColumn: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/implementation/kanban/columns/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  deleteImplementationKanbanCard: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/implementation/kanban/cards/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  recruitmentCandidates: () => req('/recruitment/candidates'),
  createRecruitmentCandidate: (payload: unknown) =>
    req('/recruitment/candidates', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateRecruitmentCandidate: (id: string, payload: unknown) =>
    req(`/recruitment/candidates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  deleteRecruitmentCandidate: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/recruitment/candidates/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  modules: () => req('/modules'),
  catalog: () => req('/admin/catalog'),
  portalOperatorAccess: () =>
    req<{ username: string | null; is_configured: boolean }>('/admin/portal-operator-access'),
  upsertPortalOperatorAccess: (payload: { username: string; password: string }) =>
    req<{ ok: boolean; username: string }>('/admin/portal-operator-access', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  createAdminModule: (payload: unknown) =>
    req('/admin/modules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateAdminModule: (id: string, payload: unknown) =>
    req(`/admin/modules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  updateAdminModulePrerequisites: (id: string, payload: { prerequisite_module_ids: string[] }) =>
    req(`/admin/modules/${id}/prerequisites`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteAdminModule: (id: string, confirmation_phrase?: string) =>
    req(withConfirmation(`/admin/modules/${id}`, confirmation_phrase), {
      method: 'DELETE'
    }),
  bootstrapCurrentData: (payload: {
    confirmation_phrase?: string;
    clients: string[];
    modules: Array<{
      code: string;
      name: string;
      category?: string;
      duration_days?: number;
      profile?: string | null;
      is_mandatory?: number;
    }>;
  }) =>
    req('/admin/bootstrap-current-data', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  bootstrapRealScenario: (payload?: { confirmation_phrase?: string }) =>
    req('/admin/bootstrap-real-scenario', {
      method: 'POST',
      body: JSON.stringify(payload ?? {})
    }),
  importWorkbook: (payload: { file_path?: string; reset_data?: boolean; confirmation_phrase?: string }) =>
    req('/admin/import-workbook', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
