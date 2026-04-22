const cashflowHighlights = [
  {
    label: '30 dias',
    title: 'Visão imediata',
    copy: 'Leitura do saldo previsto, das entradas esperadas e das saídas já assumidas.'
  },
  {
    label: '60 dias',
    title: 'Tendência próxima',
    copy: 'Comparação entre o que está confirmado e o que ainda depende de execução.'
  },
  {
    label: '90 dias',
    title: 'Horizonte ampliado',
    copy: 'Janela de planejamento para antecipar pressão de caixa e necessidades de ajuste.'
  }
] as const;

export function FinanceCashflowPage() {
  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Fluxo de Caixa
          </small>
          <h1>Projeção do caixa</h1>
          <p>Espaço para leitura temporal do saldo, com foco em previsibilidade e decisão operacional.</p>
        </div>
      </header>

      <div className="panel">
        <div className="panel-header">
          <h2>Horizontes do plano</h2>
        </div>
        <div className="panel-content">
          <div className="finance-placeholder-grid">
            {cashflowHighlights.map((item) => (
              <article key={item.label} className="finance-placeholder-card">
                <small>{item.label}</small>
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
