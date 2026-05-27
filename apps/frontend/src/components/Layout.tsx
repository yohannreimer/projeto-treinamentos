import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import holandHorizontalLogo from '../assets/holand-horizontal.svg';
import type { AppNavItem } from '../auth/navigation';

type LayoutProps = PropsWithChildren<{
  loggedUser?: string;
  navItems: AppNavItem[];
  onLogout?: () => void;
}>;

const VIEW_MODE_STORAGE_KEY = 'orquestrador_view_mode_v1';
const DENSITY_MODE_STORAGE_KEY = 'orquestrador_density_mode_v1';
const viewModes = ['operational', 'management'] as const;
const densityModes = ['compact', 'comfortable'] as const;

function readStorageItem(key: string) {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') return null;
  return window.localStorage.getItem(key);
}

function writeStorageItem(key: string, value: string) {
  if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') return;
  window.localStorage.setItem(key, value);
}

function topbarContext(pathname: string) {
  if (pathname.startsWith('/planejar')) {
    return {
      title: 'Planejamento de Agenda',
      subtitle: 'Monte turmas por cliente, módulo, técnico e horário real antes de publicar.',
      badge: 'Rascunhos e capacidade'
    };
  }
  if (pathname.startsWith('/calendario')) {
    return {
      title: 'Calendário de Execução',
      subtitle: 'Capacidade, conflitos e disponibilidade por dia.',
      badge: 'Foco do dia'
    };
  }
  if (pathname.startsWith('/turmas')) {
    return {
      title: 'Orquestração de Turmas',
      subtitle: 'Jornada modular com confirmação, alocação e governança.',
      badge: 'Fluxo de execução'
    };
  }
  if (pathname.startsWith('/clientes')) {
    return {
      title: 'Carteira de Clientes',
      subtitle: 'Priorização comercial e evolução da jornada em um só painel.',
      badge: 'Acompanhamento'
    };
  }
  if (pathname.startsWith('/tecnicos')) {
    return {
      title: 'Capacidade Técnica',
      subtitle: 'Carga, custo e disponibilidade para decisões de alocação.',
      badge: 'Risco operacional'
    };
  }
  if (pathname.startsWith('/financeiro')) {
    return {
      title: 'Gestão Financeira',
      subtitle: 'Caixa, competência, projeção e governança.',
      badge: 'Financeiro'
    };
  }
  if (pathname.startsWith('/admin')) {
    return {
      title: 'Governança da Jornada',
      subtitle: 'Catálogo, regras e ações críticas com rastreabilidade.',
      badge: 'Ambiente sensível'
    };
  }
  return {
    title: 'Operação de Treinamentos',
    subtitle: 'Planejamento visual, execução modular e gestão de capacidade.',
    badge: 'Visão geral'
  };
}

export function Layout({ children, loggedUser, navItems, onLogout }: LayoutProps) {
  const location = useLocation();
  const context = topbarContext(location.pathname);
  const isPlanningRoute = location.pathname.startsWith('/planejar');
  const [isPlanningNavExpanded, setIsPlanningNavExpanded] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [viewMode, setViewMode] = useState<(typeof viewModes)[number]>(() => {
    const saved = readStorageItem(VIEW_MODE_STORAGE_KEY);
    return saved === 'management' ? 'management' : 'operational';
  });
  const [densityMode, setDensityMode] = useState<(typeof densityModes)[number]>(() => {
    const saved = readStorageItem(DENSITY_MODE_STORAGE_KEY);
    return saved === 'comfortable' ? 'comfortable' : 'compact';
  });
  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  useEffect(() => {
    writeStorageItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);
  useEffect(() => {
    writeStorageItem(DENSITY_MODE_STORAGE_KEY, densityMode);
  }, [densityMode]);

  useEffect(() => {
    if (isPlanningRoute) {
      setIsPlanningNavExpanded(false);
    }
  }, [isPlanningRoute]);

  useEffect(() => {
    function onGlobalError(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = detail?.message?.trim();
      if (message) {
        setGlobalError(message);
      }
    }
    window.addEventListener('orquestrador:global-error', onGlobalError);
    return () => window.removeEventListener('orquestrador:global-error', onGlobalError);
  }, []);

  useEffect(() => {
    if (!globalError) return undefined;
    const timeoutId = window.setTimeout(() => setGlobalError(''), 15000);
    return () => window.clearTimeout(timeoutId);
  }, [globalError]);

  const isNavCollapsed = isPlanningRoute && !isPlanningNavExpanded;

  return (
    <div className={`app-shell ${isPlanningRoute ? 'is-planning-focus' : ''} ${isNavCollapsed ? 'is-nav-collapsed' : ''}`.trim()}>
      {globalError ? (
        <div className="global-error-toast" role="alert" aria-live="assertive">
          <span>{globalError}</span>
          <button type="button" aria-label="Fechar erro" onClick={() => setGlobalError('')}>×</button>
        </div>
      ) : null}
      {isPlanningRoute ? (
        <button
          className="planning-nav-toggle"
          type="button"
          aria-label={isPlanningNavExpanded ? 'Minimizar navegação' : 'Expandir navegação'}
          onClick={() => setIsPlanningNavExpanded((current) => !current)}
        >
          {isPlanningNavExpanded ? '‹' : '☰'}
        </button>
      ) : null}
      <aside className="sidebar">
        <Link to="/calendario" className="logo">
          <img className="logo-brand-image" src={holandHorizontalLogo} alt="Holand" />
          <small>Orquestrador de Jornadas</small>
        </Link>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span>{item.label}</span>
              {item.badgeCount && item.badgeCount > 0 ? (
                <strong className="nav-item-alert-badge" aria-label={`${item.badgeCount} pendência(s)`}>
                  {item.badgeCount > 99 ? '99+' : item.badgeCount}
                </strong>
              ) : null}
            </NavLink>
          ))}
        </nav>
        {onLogout ? (
          <div className="sidebar-auth">
            <small>Usuário: {loggedUser ?? 'logado'}</small>
            <button type="button" onClick={onLogout}>Sair</button>
          </div>
        ) : null}
      </aside>
      <div className="workspace" data-view-mode={viewMode} data-density-mode={densityMode}>
        <header className="workspace-topbar">
          <div className="workspace-topbar-copy">
            <strong>{context.title}</strong>
            <span>{context.subtitle}</span>
          </div>
          <div className="workspace-topbar-meta">
            <div className="workspace-topbar-toggles">
              <div className="view-mode-toggle" role="group" aria-label="Modo de visualização">
                <button
                  type="button"
                  className={viewMode === 'operational' ? 'is-active' : ''}
                  onClick={() => setViewMode('operational')}
                >
                  Operacional
                </button>
                <button
                  type="button"
                  className={viewMode === 'management' ? 'is-active' : ''}
                  onClick={() => setViewMode('management')}
                >
                  Gestão
                </button>
              </div>
              <div className="density-toggle" role="group" aria-label="Densidade das tabelas">
                <button
                  type="button"
                  className={densityMode === 'compact' ? 'is-active' : ''}
                  onClick={() => setDensityMode('compact')}
                >
                  Compacto
                </button>
                <button
                  type="button"
                  className={densityMode === 'comfortable' ? 'is-active' : ''}
                  onClick={() => setDensityMode('comfortable')}
                >
                  Confortável
                </button>
              </div>
            </div>
            <div className="workspace-topbar-badges">
              <small>{context.badge}</small>
              <small>{todayLabel}</small>
            </div>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
