import { render, screen } from '@testing-library/react';
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
      permissions: ['finance.read']
    }
  } satisfies InternalSessionData
}));

vi.mock('../../services/api', () => ({
  api: {
    internalMe: vi.fn().mockResolvedValue({ user: mockAuth.session.user }),
    internalLogin: vi.fn(),
    internalLogout: vi.fn().mockResolvedValue({ ok: true })
  }
}));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.localStorage.setItem(INTERNAL_AUTH_STORAGE_KEY, JSON.stringify(mockAuth.session));
  window.sessionStorage.setItem('orquestrador_internal_tab_initialized_v1', '1');
});

test('abre workspace financeiro e mostra botão voltar para operações', async () => {
  render(
    <MemoryRouter initialEntries={['/financeiro']}>
      <App />
    </MemoryRouter>
  );

  expect(await screen.findByText('Voltar para Operações')).toBeInTheDocument();
});
