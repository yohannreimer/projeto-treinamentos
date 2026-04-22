const reportItems = [
  ['Realizado vs projetado', 'Comparativo executivo entre o que ocorreu e o que ainda está previsto.'],
  ['Receitas por categoria', 'Quebra gerencial das entradas por natureza financeira.'],
  ['Despesas por categoria', 'Leitura das saídas por agrupamento e disciplina de gasto.'],
  ['Contas a receber vencidas', 'Aging simples para apoiar cobrança e priorização.'],
  ['Contas a pagar vencidas', 'Fila de obrigações que exigem atenção imediata.'],
  ['DRE gerencial', 'Visão resumida de resultado para uso executivo.']
] as const;

export function FinanceReportsPage() {
  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Relatórios
          </small>
          <h1>Leituras gerenciais</h1>
          <p>Relatórios aprovados para o V1, com foco em clareza, gestão e explicação rápida do número.</p>
        </div>
      </header>

      <div className="panel">
        <div className="panel-header">
          <h2>Biblioteca inicial</h2>
        </div>
        <div className="panel-content">
          <div className="finance-report-list">
            {reportItems.map(([title, copy]) => (
              <article key={title} className="finance-report-card">
                <small>V1 aprovado</small>
                <strong>{title}</strong>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
