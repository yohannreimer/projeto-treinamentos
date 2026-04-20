import { Link, NavLink, Outlet } from 'react-router-dom';

export function FinanceWorkspace() {
  return (
    <div
      className="finance-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
        gap: '16px',
        alignItems: 'start'
      }}
    >
      <aside
        className="panel"
        style={{
          position: 'sticky',
          top: '16px',
          display: 'grid',
          gap: '12px',
          padding: '16px'
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Workspace financeiro
          </small>
          <strong style={{ fontSize: '1rem' }}>Operação e controle</strong>
        </div>
        <nav style={{ display: 'grid', gap: '4px' }}>
          <NavLink to="overview" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Visão Geral
          </NavLink>
          <NavLink to="transactions" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Movimentações
          </NavLink>
          <NavLink to="receivables" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Contas a Receber
          </NavLink>
          <NavLink to="payables" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Contas a Pagar
          </NavLink>
        </nav>
        <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
          <Link to="/calendario" className="nav-item" style={{ marginBottom: 0 }}>
            Voltar para Operações
          </Link>
        </div>
      </aside>
      <main style={{ minWidth: 0, display: 'grid', gap: '16px' }}>
        <Outlet />
      </main>
    </div>
  );
}
