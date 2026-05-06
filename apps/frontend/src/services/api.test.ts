import { beforeEach, describe, expect, test, vi } from 'vitest';

import { internalSessionStore } from '../auth/session';
import { api, createInternalAuthHeaders } from './api';

beforeEach(() => {
  const storage = {
    clear: vi.fn(),
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: storage, configurable: true });
});

describe('createInternalAuthHeaders', () => {
  test('adds bearer token from the internal session', () => {
    vi.spyOn(internalSessionStore, 'read').mockReturnValue({
      token: 'token-certificado',
      expires_at: '2099-01-01T00:00:00.000Z',
      user: {
        id: 'user-1',
        username: 'tester',
        display_name: 'Tester',
        role: 'supremo',
        permissions: ['cohorts']
      }
    });

    const headers = createInternalAuthHeaders();

    expect(headers.get('Authorization')).toBe('Bearer token-certificado');
  });
});

describe('companyModuleCertificateUrl', () => {
  test('builds the journey certificate URL for a company module', () => {
    const url = api.companyModuleCertificateUrl('company-1', 'module-7', {
      download: true,
      format: 'pdf'
    });

    expect(url).toBe('http://localhost:4000/companies/company-1/modules/module-7/certificate?format=pdf&download=1');
  });
});
