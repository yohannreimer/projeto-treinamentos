const cadastroItems = [
  ['Contas financeiras', 'Caixa, bancos, carteiras e outros locais de liquidez.'],
  ['Categorias', 'Classificação de receitas, despesas e neutralidades.'],
  ['Clientes', 'Entidades que participam das contas a receber.'],
  ['Fornecedores', 'Entidades que participam das contas a pagar.'],
  ['Centros de custo', 'Dimensão gerencial para leitura interna e segmentação.'],
  ['Formas de pagamento', 'Cartões, boletos, PIX, transferência e variações futuras.']
] as const;

export function FinanceCadastrosPage() {
  return (
    <section className="page finance-page">
      <header className="page-header">
        <div className="page-header-copy">
          <small style={{ color: 'var(--ink-soft)', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
            Cadastros
          </small>
          <h1>Base cadastral financeira</h1>
          <p>Área para organizar os registros-base que sustentam lançamentos, conciliação e relatórios.</p>
        </div>
      </header>

      <div className="panel">
        <div className="panel-header">
          <h2>Entidades e referências</h2>
        </div>
        <div className="panel-content">
          <div className="finance-report-list">
            {cadastroItems.map(([title, copy]) => (
              <article key={title} className="finance-report-card">
                <small>Cadastro-base</small>
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
