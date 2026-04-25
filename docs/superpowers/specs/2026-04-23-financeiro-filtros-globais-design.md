# Design: Financeiro Filtros Globais (Fase 4)

## Status de Implementação
Atualizado em 2026-04-23.

Implementado no workspace principal, sem commit/push por decisão do usuário.

Verificações executadas:

- `npm run test -w apps/backend -- finance`: 71 testes passando.
- `npm run test -w apps/frontend -- FinanceCadastrosPage FinancePayablesPage FinanceReceivablesPage FinanceReconciliationPage FinanceOverviewPage FinanceReportsPage FinanceTransactionsPage FinanceCashflowPage FinanceDebtsPage`: 29 testes passando.
- `npm run build`: backend e frontend compilando; permanece apenas o aviso conhecido de chunk grande do Vite.
- `git diff --check`: sem problemas de whitespace.

## 1. Objetivo
A Fase 4 faz o período financeiro deixar de ser uma configuração isolada por tela e virar uma lente global do módulo.

O usuário escolhe o período uma vez e a escolha passa a orientar:

- visão geral;
- movimentações;
- contas a pagar;
- contas a receber;
- relatórios;
- drill-down dos KPIs para listas operacionais.

## 2. Decisões
### 2.1 Período global persistente
O período global fica no frontend, persistido em `localStorage` por usuário interno.

A escolha é leve e rápida:

- últimos 7 dias;
- últimos 30 dias;
- hoje;
- próximos 7 dias;
- próximos 30 dias;
- mês atual;
- todos;
- customizado.

Quando o usuário troca o período em uma tela, as outras telas do financeiro herdam essa escolha.

### 2.2 Filtros salvos por usuário
O próprio controle de período terá uma área compacta para salvar e recuperar filtros.

Filtros salvos ficam no navegador, separados por `username`, e guardam:

- nome;
- preset;
- data inicial;
- data final.

Nesta fase, filtros salvos são de período. Filtros avançados por conta, categoria e entidade continuam locais nas telas onde já existem.

### 2.3 Relatórios obedecendo filtro
`GET /finance/reports` passa a aceitar os mesmos parâmetros de período usados pela visão geral.

O backend usa a janela resolvida para:

- DRE;
- categorias de receita/despesa;
- realizado vs projetado;
- aging de contas vencidas;
- fluxo consolidado.

### 2.4 Drill-down
Cards executivos viram atalhos para a lista mais útil:

- `A receber` abre contas a receber;
- `A pagar` abre contas a pagar;
- `Faturamento` abre movimentações filtradas como entrada;
- `Despesas` abre movimentações filtradas como saída;
- `Resultado` abre movimentações;
- `Atrasos` abre contas a receber em atraso;
- `Conciliação` abre conciliação.

A navegação usa o período global persistido, evitando query strings longas.

## 3. Interface
O filtro continua no topo direito das telas, no mesmo estilo visual atual.

O bloco de filtros salvos é compacto:

- um seletor pequeno de filtros salvos;
- botão `Salvar`;
- ao salvar, aparece uma linha curta com `Nome do filtro`, `Confirmar`, `Fechar`;
- botão `Excluir` só aparece quando há filtro salvo selecionado.

Não deve haver banners, cards grandes ou explicações permanentes.

## 4. Critérios de Aceite
- Alterar o período em uma tela altera o período usado nas demais telas financeiras.
- O período sobrevive a reload do navegador.
- Filtros salvos são separados por usuário.
- Relatórios mudam quando o período muda.
- Movimentações carregam do backend respeitando o período global.
- Contas a pagar/receber filtram seus grupos pelo período global.
- KPIs principais da visão geral levam para a lista correspondente.
- Testes cobrem persistência, relatórios filtrados e drill-down básico.
