# Design: Financeiro Relatórios e DRE (Fase 5)

## Status de Implementação
Atualizado em 2026-04-23.

Concluída no workspace principal, sem commit/push por decisão do usuário.

## 1. Objetivo
A Fase 5 transforma a aba de relatórios em uma leitura gerencial mais útil para decisão.

O foco é responder rápido:

- qual é o resultado por competência;
- onde o resultado nasce por centro de custo;
- o que é realizado versus projetado;
- como o caixa se comporta por vencimento e por baixa;
- quais linhas explicam cada número importante.

## 2. Backend
`GET /finance/reports` continua aceitando o filtro global de período e passa a devolver novos blocos:

- `dre_by_period`: DRE mensal por competência;
- `cost_center_results`: receitas, despesas e resultado por centro de custo;
- `cashflow_by_due`: fluxo por vencimento;
- `cashflow_by_settlement`: fluxo por baixa/liquidação.

Os cálculos usam o ledger central:

- competência usa `views.competence_amount_cents`;
- realizado usa `views.confirmed_amount_cents`;
- projetado usa `views.projected_amount_cents`;
- fluxo por vencimento usa `due_date`;
- fluxo por baixa usa `settlement_date` ou âncora de caixa.

## 3. Interface
A tela mantém o desenho atual de abas laterais e área principal.

Entram três melhorias:

- abas novas para `DRE por competência`, `Centros de custo` e `Caixa vencimento/baixa`;
- linhas importantes viram links discretos para `Movimentações`, já com filtros por tipo e busca;
- o texto dos relatórios deixa claro quando a leitura é por competência, vencimento ou baixa.

## 4. Drill-down
O drill-down usa navegação simples para `/financeiro/transactions`.

Exemplos:

- receita líquida: `kind=income`;
- despesas operacionais: `kind=expense`;
- categoria específica: busca pelo nome da categoria;
- centro de custo específico: busca pelo nome do centro de custo;
- período de realizado/projetado: busca pelo período exibido.

Nesta fase, o objetivo é levar o usuário para a lista operacional correspondente. Uma Fase posterior pode criar uma tela detalhada dedicada.

## 5. Critérios de Aceite
- Relatórios continuam obedecendo o período global.
- DRE consolidada permanece compatível com o contrato atual.
- DRE por competência mostra receita bruta, receita líquida, despesas e resultado por período.
- Resultado por centro de custo mostra receita, despesa, resultado e quantidade de lançamentos.
- Fluxo por vencimento e por baixa aparecem separados.
- Linhas principais têm drill-down para movimentações.
- Testes cobrem o novo contrato backend e a navegação básica da UI.
