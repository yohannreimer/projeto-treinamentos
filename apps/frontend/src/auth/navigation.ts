import { type InternalPermission, type InternalRole, type InternalSessionUser } from './session';

export type AppNavItem = {
  to: string;
  label: string;
  permissions: InternalPermission[];
  roles?: InternalRole[];
  badgeCount?: number;
};

type NavigationSessionUser = Omit<InternalSessionUser, 'permissions'> & {
  permissions: readonly InternalPermission[];
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { to: '/calendario', label: 'Calendário', permissions: ['calendar'] },
  { to: '/planejar', label: 'Planejar', permissions: ['calendar', 'cohorts'] },
  { to: '/turmas', label: 'Turmas', permissions: ['cohorts'] },
  { to: '/clientes', label: 'Clientes', permissions: ['clients'] },
  { to: '/tecnicos', label: 'Técnicos', permissions: ['technicians'] },
  { to: '/implementacao', label: 'Implementação', permissions: ['implementation'] },
  { to: '/suporte', label: 'Suporte', permissions: ['support', 'implementation'] },
  { to: '/processos-seletivos', label: 'Processos Seletivos', permissions: ['recruitment'] },
  { to: '/licencas', label: 'Licenças', permissions: ['licenses'] },
  { to: '/licencas/programas', label: 'Programas Licença', permissions: ['license_programs'] },
  {
    to: '/financeiro',
    label: 'Financeiro',
    roles: ['supremo'],
    permissions: [
      'finance.read',
      'finance.write',
      'finance.approve',
      'finance.reconcile',
      'finance.close',
      'finance.billing'
    ]
  },
  { to: '/documentacao', label: 'Documentação', permissions: ['docs'] },
  { to: '/admin', label: 'Administração', permissions: ['admin'] }
];

export function canAccessPermissions(
  user: NavigationSessionUser | null | undefined,
  permissions: InternalPermission[]
): boolean {
  if (!user) return false;
  return permissions.some((permission) => user.permissions.includes(permission));
}

export function canAccessPath(user: NavigationSessionUser | null | undefined, pathname: string): boolean {
  if (pathname === '/dashboard') {
    return canAccessPermissions(user, ['dashboard']);
  }

  const route = APP_NAV_ITEMS.find((item) => (
    pathname === item.to || pathname.startsWith(`${item.to}/`)
  ));
  if (!route) {
    return false;
  }
  if (route.roles && (!user || !route.roles.includes(user.role))) {
    return false;
  }
  return canAccessPermissions(user, route.permissions);
}

export function defaultRouteForUser(user: NavigationSessionUser | null | undefined): string {
  if (!user) return '/calendario';
  const visible = APP_NAV_ITEMS.find((item) => {
    if (item.roles && !item.roles.includes(user.role)) return false;
    return canAccessPermissions(user, item.permissions);
  });
  return visible?.to ?? '/calendario';
}

export function visibleNavItemsForUser(user: NavigationSessionUser | null | undefined): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => {
    if (item.roles && (!user || !item.roles.includes(user.role))) return false;
    return canAccessPermissions(user, item.permissions);
  });
}
