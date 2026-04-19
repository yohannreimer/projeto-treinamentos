import { hasAnyPermission, type InternalPermission, type InternalSessionUser } from './session';

export type AppNavItem = {
  to: string;
  label: string;
  permissions: InternalPermission[];
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  { to: '/calendario', label: 'Calendário', permissions: ['calendar'] },
  { to: '/turmas', label: 'Turmas', permissions: ['cohorts'] },
  { to: '/clientes', label: 'Clientes', permissions: ['clients'] },
  { to: '/tecnicos', label: 'Técnicos', permissions: ['technicians'] },
  { to: '/implementacao', label: 'Implementação', permissions: ['implementation'] },
  { to: '/suporte', label: 'Suporte', permissions: ['support', 'implementation'] },
  { to: '/processos-seletivos', label: 'Processos Seletivos', permissions: ['recruitment'] },
  { to: '/licencas', label: 'Licenças', permissions: ['licenses'] },
  { to: '/licencas/programas', label: 'Programas Licença', permissions: ['license_programs'] },
  { to: '/financeiro', label: 'Financeiro', permissions: ['finance.read'] },
  { to: '/documentacao', label: 'Documentação', permissions: ['docs'] },
  { to: '/admin', label: 'Administração', permissions: ['admin'] }
];

export function canAccessPermissions(
  user: InternalSessionUser | null | undefined,
  permissions: InternalPermission[]
): boolean {
  return hasAnyPermission(user, permissions);
}

export function canAccessPath(user: InternalSessionUser | null | undefined, pathname: string): boolean {
  if (pathname === '/dashboard') {
    return canAccessPermissions(user, ['dashboard']);
  }

  const route = APP_NAV_ITEMS.find((item) => (
    pathname === item.to || pathname.startsWith(`${item.to}/`)
  ));
  if (!route) {
    return false;
  }
  return canAccessPermissions(user, route.permissions);
}

export function defaultRouteForUser(user: InternalSessionUser | null | undefined): string {
  if (!user) return '/calendario';
  const visible = APP_NAV_ITEMS.find((item) => canAccessPermissions(user, item.permissions));
  return visible?.to ?? '/calendario';
}

export function visibleNavItemsForUser(user: InternalSessionUser | null | undefined): AppNavItem[] {
  return APP_NAV_ITEMS.filter((item) => canAccessPermissions(user, item.permissions));
}
