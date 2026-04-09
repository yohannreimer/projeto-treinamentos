import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import holandHorizontalLogo from '../assets/holand-horizontal.svg';

const items = [
  { to: '/', label: 'Dashboard' },
  { to: '/calendario', label: 'Calendário' },
  { to: '/turmas', label: 'Turmas' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/tecnicos', label: 'Técnicos' },
  { to: '/implementacao', label: 'Implementação' },
  { to: '/suporte', label: 'Suporte' },
  { to: '/processos-seletivos', label: 'Processos Seletivos' },
  { to: '/licencas', label: 'Licenças' },
  { to: '/licencas/programas', label: 'Programas Licença' },
  { to: '/documentacao', label: 'Documentação' },
  { to: '/admin', label: 'Administração' }
];

type LayoutProps = PropsWithChildren<{
  loggedUser?: string;
  onLogout?: () => void;
}>;

const VIEW_MODE_STORAGE_KEY = 'orquestrador_view_mode_v1';
const DENSITY_MODE_STORAGE_KEY = 'orquestrador_density_mode_v1';
const viewModes = ['operational', 'management'] as const;
const densityModes = ['compact', 'comfortable'] as const;

function topbarContext(pathname: string) {
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

export function Layout({ children, loggedUser, onLogout }: LayoutProps) {
  const location = useLocation();
  const context = topbarContext(location.pathname);
  const [viewMode, setViewMode] = useState<(typeof viewModes)[number]>(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === 'management' ? 'management' : 'operational';
  });
  const [densityMode, setDensityMode] = useState<(typeof densityModes)[number]>(() => {
    const saved = window.localStorage.getItem(DENSITY_MODE_STORAGE_KEY);
    return saved === 'comfortable' ? 'comfortable' : 'compact';
  });
  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);
  useEffect(() => {
    window.localStorage.setItem(DENSITY_MODE_STORAGE_KEY, densityMode);
  }, [densityMode]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="logo">
          <img className="logo-brand-image" src={holandHorizontalLogo} alt="Holand" />
          <small>Orquestrador de Jornadas</small>
        </Link>
        <nav>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              {item.label}
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
