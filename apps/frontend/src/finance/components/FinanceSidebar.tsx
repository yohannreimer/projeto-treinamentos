import { Link, NavLink } from 'react-router-dom';
import { defaultRouteForUser, visibleNavItemsForUser } from '../../auth/navigation';
import { internalSessionStore } from '../../auth/session';
import type { FinanceContext } from '../api';
import { FinanceMono } from './FinancePrimitives';

type FinanceSidebarProps = {
  context: FinanceContext | null;
  loading: boolean;
  error: string | null;
};

const navigationItems = [
  { to: 'overview', label: 'Visão Geral' },
  { to: 'transactions', label: 'Movimentações' },
  { to: 'receivables', label: 'Contas a Receber' },
  { to: 'payables', label: 'Contas a Pagar' },
  { to: 'reconciliation', label: 'Conciliação' },
  { to: 'cashflow', label: 'Fluxo de Caixa' },
  { to: 'reports', label: 'Relatórios' },
  { to: 'cadastros', label: 'Cadastros' }
] as const;

export function FinanceSidebar({ context, loading, error }: FinanceSidebarProps) {
  const organizationName = context?.organization_name || 'Empresa logada';
  const currentUser = internalSessionStore.read()?.user ?? null;
  const nonFinanceNavItems = visibleNavItemsForUser(currentUser).filter((item) => item.to !== '/financeiro');
  const backLink = nonFinanceNavItems[0]?.to ?? null;
  const fallbackRoute = defaultRouteForUser(currentUser);
  const exitLabel = backLink ? 'Voltar ao sistema' : 'Módulo financeiro principal';

  return (
    <aside className="finance-sidebar" aria-label="Navegação financeira">
      <div className="finance-sidebar__intro">
        <small className="finance-sidebar__eyebrow">Financeiro ERP</small>
        <strong className="finance-sidebar__title">{organizationName}</strong>
        <p className="finance-sidebar__copy">
          ERP financeiro da empresa logada, com navegação própria para rotina de caixa, contas, conciliação e relatórios.
        </p>
      </div>

      <div className="finance-sidebar__context">
        <small className="finance-sidebar__label">Contexto da organização</small>
        <strong>{loading ? 'Carregando...' : organizationName}</strong>
        <span>
          {context ? <FinanceMono>{`${context.currency} • ${context.timezone}`}</FinanceMono> : 'Tenant financeiro da empresa autenticada'}
        </span>
        {error ? <small className="finance-sidebar__error">{error}</small> : null}
      </div>

      <nav className="finance-sidebar__nav" aria-label="Sitemap financeiro">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="finance-sidebar__footer">
        {backLink ? (
          <Link to={backLink} className="finance-sidebar__back-link">
            Voltar ao sistema
          </Link>
        ) : (
          <span className="finance-sidebar__footer-note" aria-label={exitLabel}>
            {fallbackRoute === '/financeiro' ? 'Você está no módulo principal disponível para este usuário.' : 'Navegação principal disponível neste contexto.'}
          </span>
        )}
      </div>
    </aside>
  );
}
