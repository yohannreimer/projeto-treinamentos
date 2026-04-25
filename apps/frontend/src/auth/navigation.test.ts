import { expect, test } from 'vitest';
import { canAccessPath, visibleNavItemsForUser } from './navigation';
import type { InternalSessionUser } from './session';

function user(role: InternalSessionUser['role'], permissions: InternalSessionUser['permissions']): InternalSessionUser {
  return {
    id: `user-${role}`,
    username: role,
    display_name: role,
    role,
    permissions
  };
}

test('finance navigation is visible only for supremo users', () => {
  const financeCustom = user('custom', ['calendar', 'finance.read']);
  const financeIntermediario = user('intermediario', ['calendar', 'finance.read']);
  const financeSupremo = user('supremo', ['calendar', 'finance.read']);

  expect(visibleNavItemsForUser(financeCustom).map((item) => item.label)).not.toContain('Financeiro');
  expect(visibleNavItemsForUser(financeIntermediario).map((item) => item.label)).not.toContain('Financeiro');
  expect(visibleNavItemsForUser(financeSupremo).map((item) => item.label)).toContain('Financeiro');

  expect(canAccessPath(financeCustom, '/financeiro')).toBe(false);
  expect(canAccessPath(financeIntermediario, '/financeiro/reports')).toBe(false);
  expect(canAccessPath(financeSupremo, '/financeiro/reports')).toBe(true);
});
