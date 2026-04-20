export function FinanceOverviewPage() {
  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Visão Geral
          </small>
          <h1>Painel financeiro</h1>
          <p>Resumo inicial do workspace financeiro com espaço para caixa, projeção e governança.</p>
        </div>
      </header>

      <div className="panel">
        <div className="panel-header">
          <h2>Resumo do workspace</h2>
        </div>
        <div className="panel-content">
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
            Os módulos financeiros ainda estão sendo ligados. As próximas telas entram aqui sem quebrar o fluxo.
          </p>
        </div>
      </div>
    </section>
  );
}
