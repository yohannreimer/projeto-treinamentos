import { describe, expect, test, vi } from 'vitest';

import { internalSessionStore } from '../auth/session';
import { createInternalAuthHeaders } from './api';

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
