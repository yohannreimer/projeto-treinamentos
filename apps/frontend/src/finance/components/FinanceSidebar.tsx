import { Link, NavLink } from 'react-router-dom';
import { defaultRouteForUser, visibleNavItemsForUser } from '../../auth/navigation';
import { internalSessionStore } from '../../auth/session';
import type { FinanceContext } from '../api';

type FinanceSidebarProps = {
  context: FinanceContext | null;
  loading: boolean;
  error: string | null;
};

const navigationItems = [
  { to: 'overview', label: 'Visão Geral', icon: 'overview' },
  { to: 'transactions', label: 'Movimentações', icon: 'transactions' },
  { to: 'receivables', label: 'Contas a Receber', icon: 'receivables' },
  { to: 'payables', label: 'Contas a Pagar', icon: 'payables' },
  { to: 'reconciliation', label: 'Conciliação & Revisão', icon: 'reconciliation' },
  { to: 'cashflow', label: 'Fluxo de Caixa', icon: 'cashflow' },
  { to: 'reports', label: 'Relatórios', icon: 'reports' },
  { to: 'cadastros', label: 'Cadastros', icon: 'cadastros' },
  { to: 'simulation', label: 'Simulação', icon: 'simulation' },
  { to: 'advanced', label: 'Avançado', icon: 'advanced' }
] as const;

function NavigationGlyph({ name }: { name: typeof navigationItems[number]['icon'] }) {
  switch (name) {
    case 'overview':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="1.5" width="5.2" height="5.2" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9.3" y="1.5" width="5.2" height="5.2" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="1.5" y="9.3" width="5.2" height="5.2" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <rect x="9.3" y="9.3" width="5.2" height="5.2" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case 'transactions':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.2 4h11.6M2.2 8h8.4M2.2 12h5.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'receivables':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.2v11.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4.2 9.2 8 13l3.8-3.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'payables':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 13.8V2.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4.2 6.8 8 3l3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'reconciliation':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.2 8h11.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9.2 5.2 12 8l-2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.8 10.8 4 8l2.8-2.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'cashflow':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.8 11.5 5.2 7.6 8.5 9.4 12.2 4.6 14.2 6.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'reports':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 1.8h10v12.4H3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M5 5h6M5 8h6M5 11h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'cadastros':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.2a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.2 13.8c0-3.2 2.5-5.8 5.8-5.8s5.8 2.6 5.8 5.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'advanced':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.8 9.1 5l3.3-1.1-1.1 3.3 3.1 1.2-3.1 1.2 1.1 3.3-3.3-1.1L8 14.2l-1.1-3.4-3.3 1.1 1.1-3.3-3.1-1.2 3.1-1.2-1.1-3.3L6.9 5 8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
          <circle cx="8" cy="8" r="1.7" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      );
    case 'simulation':
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.2 12.8h11.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M3.2 10.8 6.4 6.9l2.8 1.8 3.6-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6.4" cy="6.9" r="1.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12.8" cy="3.7" r="1.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
    default:
      return null;
  }
}

export function FinanceSidebar({ context, loading, error }: FinanceSidebarProps) {
  const organizationName = context?.organization_name || 'Empresa logada';
  const currentUser = internalSessionStore.read()?.user ?? null;
  const nonFinanceNavItems = visibleNavItemsForUser(currentUser).filter((item) => item.to !== '/financeiro');
  const backLink = nonFinanceNavItems[0]?.to ?? null;
  const fallbackRoute = defaultRouteForUser(currentUser);
  const timezone = context?.timezone || 'America/Sao_Paulo';
  const currency = context?.currency || 'BRL';

  return (
    <aside className="finance-sidebar" aria-label="Navegação financeira">
      <div className="finance-sidebar__intro">
        <small className="finance-sidebar__eyebrow">Financeiro ERP</small>
        <strong className="finance-sidebar__title">{organizationName}</strong>
        <p className="finance-sidebar__copy">ERP financeiro da empresa logada, com navegação para rotina de caixa, contas, conciliação e relatórios.</p>
      </div>

      <div className="finance-sidebar__org-card">
        <small className="finance-sidebar__label">Contexto da organização</small>
        <strong className="finance-sidebar__org-name">{organizationName}</strong>
        <p className="finance-sidebar__microcopy">{currency} · {timezone}</p>
        {loading ? <p className="finance-sidebar__microcopy">Carregando contexto...</p> : null}
        {error ? <p className="finance-sidebar__error">{error}</p> : null}
      </div>

      <nav className="finance-sidebar__nav" aria-label="Sitemap financeiro">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {({ isActive }) => (
              <>
                <span className="finance-sidebar__nav-icon" aria-hidden="true" style={{ opacity: isActive ? 1 : 0.7 }}>
                  <NavigationGlyph name={item.icon} />
                </span>
                <span className="finance-sidebar__nav-label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="finance-sidebar__footer">
        {backLink ? (
          <Link to={backLink} className="finance-sidebar__back-link">
            <span className="finance-sidebar__back-icon" aria-hidden="true">↩</span>
            Voltar ao sistema
          </Link>
        ) : (
          <span className="finance-sidebar__footer-note" aria-label="Módulo financeiro principal">
            {fallbackRoute === '/financeiro'
              ? 'Você está no módulo principal disponível para este usuário.'
              : 'Navegação principal disponível neste contexto.'}
          </span>
        )}
      </div>
    </aside>
  );
}
