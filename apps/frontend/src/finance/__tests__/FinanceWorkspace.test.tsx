import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../App';
import { INTERNAL_AUTH_STORAGE_KEY, type InternalSessionData } from '../../auth/session';

const mockAuth = vi.hoisted(() => ({
  session: {
    token: 'token-finance',
    expires_at: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'user-finance',
      username: 'financeiro',
      display_name: 'Financeiro',
      role: 'custom',
      permissions: ['calendar', 'finance.read']
    }
  } satisfies InternalSessionData
}));

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    }
  } as Storage;
}

Object.defineProperty(window, 'localStorage', {
  value: createStorage(),
  configurable: true
});

Object.defineProperty(window, 'sessionStorage', {
  value: createStorage(),
  configurable: true
});

vi.mock('../../services/api', () => ({
  api: {
    internalMe: vi.fn().mockImplementation(async () => {
      const raw = window.localStorage.getItem(INTERNAL_AUTH_STORAGE_KEY);
      const storedSession = raw ? (JSON.parse(raw) as InternalSessionData) : mockAuth.session;
      return { user: storedSession.user };
    }),
    internalLogin: vi.fn(),
    internalLogout: vi.fn().mockResolvedValue({ ok: true }),
    companies: vi.fn().mockResolvedValue([])
  }
}));

vi.mock('../../finance/api', () => ({
  financeApi: {
    getContext: vi.fn().mockResolvedValue({
      organization_id: 'org-holand',
      organization_name: 'Holand',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo'
    })
  }
}));

beforeEach(() => {
  window.localStorage.setItem(INTERNAL_AUTH_STORAGE_KEY, JSON.stringify(mockAuth.session));
  window.sessionStorage.setItem('orquestrador_internal_tab_initialized_v1', '1');
});

test('finance workspace shows the approved ERP sitemap and no counterparty copy in the shell', async () => {
  render(
    <MemoryRouter initialEntries={['/financeiro']}>
      <App />
    </MemoryRouter>
  );

  const sidebar = await screen.findByRole('complementary', { name: 'Navegação financeira' });

  expect(within(sidebar).getByRole('link', { name: 'Visão Geral' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Movimentações' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Contas a Receber' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Contas a Pagar' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Conciliação' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Fluxo de Caixa' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Relatórios' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Cadastros' })).toBeInTheDocument();
  expect(within(sidebar).getByRole('link', { name: 'Voltar ao sistema' })).toBeInTheDocument();
  expect(within(sidebar).queryByText(/contraparte/i)).not.toBeInTheDocument();
  await waitFor(() => {
    expect(within(sidebar).queryAllByText('Holand').length).toBeGreaterThan(0);
  });
  expect(screen.queryByRole('link', { name: 'Dívidas' })).not.toBeInTheDocument();
});

test('finance workspace keeps footer informative for finance-only users', async () => {
  const financeOnlySession: InternalSessionData = {
    ...mockAuth.session,
    user: {
      ...mockAuth.session.user,
      permissions: ['finance.read']
    }
  };

  window.localStorage.setItem(INTERNAL_AUTH_STORAGE_KEY, JSON.stringify(financeOnlySession));

  render(
    <MemoryRouter initialEntries={['/financeiro']}>
      <App />
    </MemoryRouter>
  );

  const sidebar = await screen.findByRole('complementary', { name: 'Navegação financeira' });
  expect(within(sidebar).queryByRole('link', { name: 'Voltar ao sistema' })).not.toBeInTheDocument();
  expect(within(sidebar).getByLabelText('Módulo financeiro principal')).toBeInTheDocument();
});
