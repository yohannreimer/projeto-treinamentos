import { Link, NavLink } from 'react-router-dom';
import type { PropsWithChildren } from 'react';

const items = [
  { to: '/', label: 'Dashboard' },
  { to: '/calendario', label: 'Calendário' },
  { to: '/turmas', label: 'Turmas' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/tecnicos', label: 'Técnicos' },
  { to: '/licencas', label: 'Licenças' },
  { to: '/licencas/programas', label: 'Programas Licença' },
  { to: '/admin', label: 'Administração' }
];

type LayoutProps = PropsWithChildren<{
  loggedUser?: string;
  onLogout?: () => void;
}>;

export function Layout({ children, loggedUser, onLogout }: LayoutProps) {
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
      <main className="main-content">{children}</main>
    </div>
  );
}
