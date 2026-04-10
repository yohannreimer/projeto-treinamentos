import type {
  CreatePortalTicketPayload,
  PortalAuthedApi,
  PortalLoginPayload,
  PortalLoginResponse,
  PortalMe,
  PortalOverview
} from './types';

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const BASE_URL = env?.VITE_API_BASE_URL ?? `http://${window.location.hostname}:4000`;

async function portalReq<T>(
  path: string,
  init: RequestInit = {},
  options?: {
    token?: string;
    onUnauthorized?: () => void;
  }
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options?.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Timeout ao conectar com a API (10s).'
      : 'Falha de conexão com a API.';
    throw new Error(message);
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (response.status === 401 && options?.onUnauthorized) {
    options.onUnauthorized();
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

export const portalApi = {
  login: (payload: PortalLoginPayload) =>
    portalReq<PortalLoginResponse>('/portal/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createAuthedClient: (token: string, onUnauthorized?: () => void): PortalAuthedApi => ({
    me: () => portalReq<PortalMe>('/portal/api/me', {}, { token, onUnauthorized }),
    overview: () => portalReq<PortalOverview>('/portal/api/overview', {}, { token, onUnauthorized }),
    planning: () => portalReq('/portal/api/planning', {}, { token, onUnauthorized }),
    agenda: () => portalReq('/portal/api/agenda', {}, { token, onUnauthorized }),
    tickets: () => portalReq('/portal/api/tickets', {}, { token, onUnauthorized }),
    createTicket: (payload: CreatePortalTicketPayload) =>
      portalReq('/portal/api/tickets', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, { token, onUnauthorized })
  })
};
