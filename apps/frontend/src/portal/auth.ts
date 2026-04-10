import type { PortalSessionData } from './types';

function storageKey(slug: string) {
  return `portal_auth_${slug}`;
}

export const portalSessionStore = {
  key: storageKey,
  save(slug: string, session: PortalSessionData) {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(session));
  },
  read(slug: string): PortalSessionData | null {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PortalSessionData;
      if (!parsed?.token || !parsed?.expires_at) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  clear(slug: string) {
    window.localStorage.removeItem(storageKey(slug));
  }
};
