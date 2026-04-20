import { Link, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { FinanceOverviewPage } from './pages/FinanceOverviewPage';

function FinancePlaceholderPage({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            {title}
          </small>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>

      <div className="panel">
        <div className="panel-header">
          <h2>Em construção</h2>
        </div>
        <div className="panel-content">
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
            Esta área vai receber a funcionalidade completa do financeiro no próximo passo.
          </p>
        </div>
      </div>
    </section>
  );
}

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
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<FinanceOverviewPage />} />
          <Route
            path="transactions"
            element={(
              <FinancePlaceholderPage
                title="Movimentações"
                description="Lançamentos manuais, ajustes, transferências e conciliações operacionais."
              />
            )}
          />
          <Route
            path="receivables"
            element={(
              <FinancePlaceholderPage
                title="Contas a Receber"
                description="Gestão de títulos, vencimentos, baixas e acompanhamento de cobrança."
              />
            )}
          />
          <Route
            path="payables"
            element={(
              <FinancePlaceholderPage
                title="Contas a Pagar"
                description="Compromissos, aprovações, programações e previsibilidade de saída."
              />
            )}
          />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
        <Outlet />
      </main>
    </div>
  );
}
