import { Link, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';

const items = [
  { to: '/', label: 'Dashboard' },
  { to: '/calendario', label: 'Calendário' },
  { to: '/turmas', label: 'Turmas' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/tecnicos', label: 'Técnicos' },
  { to: '/processos-seletivos', label: 'Processos Seletivos' },
  { to: '/licencas', label: 'Licenças' },
  { to: '/licencas/programas', label: 'Programas Licença' },
  { to: '/admin', label: 'Administração' }
];

type LayoutProps = PropsWithChildren<{
  loggedUser?: string;
  onLogout?: () => void;
}>;

const VIEW_MODE_STORAGE_KEY = 'orquestrador_view_mode_v1';
const viewModes = ['operational', 'management'] as const;

export function Layout({ children, loggedUser, onLogout }: LayoutProps) {
  const [viewMode, setViewMode] = useState<(typeof viewModes)[number]>(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === 'management' ? 'management' : 'operational';
  });

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="logo">Orquestrador de Jornadas</Link>
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
      <div className="workspace" data-view-mode={viewMode}>
        <header className="workspace-topbar">
          <div className="workspace-topbar-copy">
            <strong>Operação de Treinamentos</strong>
            <span>Planejamento visual, execução modular e gestão de capacidade.</span>
          </div>
          <div className="workspace-topbar-meta">
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
            <small>Ambiente interno</small>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
