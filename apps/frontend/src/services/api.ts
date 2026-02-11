const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

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
  cohorts: () => req('/cohorts'),
  cohortById: (id: string) => req(`/cohorts/${id}`),
  createCohort: (payload: unknown) =>
    req('/cohorts', { method: 'POST', body: JSON.stringify(payload) }),
  checkTechnicianConflict: (payload: {
    technician_id: string;
    start_date: string;
    status: string;
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
  deleteCohort: (id: string) =>
    req(`/cohorts/${id}`, { method: 'DELETE' }),
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
  deleteCompany: (id: string) =>
    req(`/companies/${id}`, {
      method: 'DELETE'
    }),
  companyById: (id: string) => req(`/companies/${id}`),
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
  deleteLicenseProgram: (id: string) =>
    req(`/license-programs/${id}`, {
      method: 'DELETE'
    }),
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
  deleteLicense: (id: string) =>
    req(`/licenses/${id}`, {
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
  updateCompanyPriority: (id: string, payload: { priority: number }) =>
    req(`/companies/${id}/priority`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  updateCompanyProgress: (companyId: string, moduleId: string, payload: unknown) =>
    req(`/companies/${companyId}/progress/${moduleId}`, {
      method: 'PATCH',
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
  deleteTechnician: (id: string) =>
    req(`/technicians/${id}`, {
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
  modules: () => req('/modules'),
  catalog: () => req('/admin/catalog'),
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
  deleteAdminModule: (id: string) =>
    req(`/admin/modules/${id}`, {
      method: 'DELETE'
    }),
  bootstrapCurrentData: (payload: {
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
  bootstrapRealScenario: () =>
    req('/admin/bootstrap-real-scenario', {
      method: 'POST',
      body: JSON.stringify({})
    }),
  importWorkbook: (payload: { file_path?: string; reset_data?: boolean }) =>
    req('/admin/import-workbook', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};
