export const INTERNAL_AUTH_STORAGE_KEY = 'orquestrador_internal_auth_v2';
export const INTERNAL_AUTH_CHANGED_EVENT = 'orquestrador_internal_auth_changed';

export const INTERNAL_PERMISSION_KEYS = [
  'dashboard',
  'calendar',
  'cohorts',
  'clients',
  'technicians',
  'implementation',
  'support',
  'recruitment',
  'licenses',
  'license_programs',
  'docs',
  'finance.read',
  'finance.write',
  'finance.approve',
  'finance.reconcile',
  'finance.close',
  'finance.billing',
  'admin'
] as const;

export type InternalPermission = (typeof INTERNAL_PERMISSION_KEYS)[number];
export type InternalRole = 'supremo' | 'intermediario' | 'junior' | 'custom';

export type InternalSessionUser = {
  id: string;
  username: string;
  display_name: string | null;
  role: InternalRole;
  permissions: InternalPermission[];
};

export type InternalSessionData = {
  token: string;
  expires_at: string;
  user: InternalSessionUser;
};

function normalizePermissions(raw: unknown): InternalPermission[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<InternalPermission>(INTERNAL_PERMISSION_KEYS);
  const output = new Set<InternalPermission>();
  raw.forEach((item) => {
    if (typeof item !== 'string') return;
    if (!valid.has(item as InternalPermission)) return;
    output.add(item as InternalPermission);
  });
  return [...output];
}

function normalizeRole(raw: unknown): InternalRole {
  if (raw === 'supremo' || raw === 'intermediario' || raw === 'junior' || raw === 'custom') {
    return raw;
  }
  return 'custom';
}

function normalizeUser(raw: unknown): InternalSessionUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id : '';
  const username = typeof source.username === 'string' ? source.username : '';
  if (!id || !username) return null;

  return {
    id,
    username,
    display_name: typeof source.display_name === 'string' ? source.display_name : null,
    role: normalizeRole(source.role),
    permissions: normalizePermissions(source.permissions)
  };
}

function normalizeSession(raw: unknown): InternalSessionData | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const token = typeof source.token === 'string' ? source.token : '';
  const expiresAt = typeof source.expires_at === 'string' ? source.expires_at : '';
  const user = normalizeUser(source.user);
  if (!token || !expiresAt || !user) return null;

  return {
    token,
    expires_at: expiresAt,
    user
  };
}

export function emitInternalAuthChanged() {
  window.dispatchEvent(new Event(INTERNAL_AUTH_CHANGED_EVENT));
}

export const internalSessionStore = {
  read(): InternalSessionData | null {
    const raw = window.localStorage.getItem(INTERNAL_AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
      return normalizeSession(JSON.parse(raw));
    } catch {
      return null;
    }
  },
  save(session: InternalSessionData) {
    window.localStorage.setItem(INTERNAL_AUTH_STORAGE_KEY, JSON.stringify(session));
    emitInternalAuthChanged();
  },
  clear() {
    window.localStorage.removeItem(INTERNAL_AUTH_STORAGE_KEY);
    emitInternalAuthChanged();
  }
};

export function hasPermission(user: InternalSessionUser | null | undefined, permission: InternalPermission): boolean {
  if (!user) return false;
  return user.permissions.includes(permission);
}

export function hasAnyPermission(user: InternalSessionUser | null | undefined, permissions: InternalPermission[]): boolean {
  if (!user) return false;
  return permissions.some((permission) => hasPermission(user, permission));
}
