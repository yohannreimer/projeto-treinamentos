# Design: Financeiro Operação Diária (Fase 3)

## Status de Implementação
Atualizado em 2026-04-23.

Implementado no workspace principal, sem commit/push por decisão do usuário.

Verificações executadas:

- `npm run test -w apps/backend -- finance`: 71 testes passando.
- `npm run test -w apps/frontend -- FinanceCadastrosPage FinancePayablesPage FinanceReceivablesPage FinanceReconciliationPage FinanceOverviewPage`: 21 testes passando.
- `npm run build`: backend e frontend compilando; permanece apenas o aviso conhecido de chunk grande do Vite.
- `git diff --check`: sem problemas de whitespace.
- Verificação visual automatizada em `http://localhost:5173/financeiro/payables`: página renderizou, filtro funcionou e a ação `Parcial` abriu o campo inline `Valor parcial` com botão `Aplicar`.

## 1. Objetivo
A Fase 3 torna `Contas a pagar` e `Contas a receber` úteis no dia a dia.

O foco é reduzir atrito operacional:

- lançar uma conta;
- baixar rapidamente;
- registrar pagamento/recebimento parcial;
- duplicar lançamento;
- cancelar sem apagar histórico;
- parcelar;
- gerar recorrências simples.

## 2. Decisões
### 2.1 Baixas e parciais
Baixa total marca a conta como `paid` ou `received`, preenche a data e considera 100% do valor como liquidado.

Baixa parcial soma o valor informado em um campo de liquidado:

- `paid_amount_cents` para contas a pagar;
- `received_amount_cents` para contas a receber.

Quando o total liquidado alcança o valor da conta, o status vira liquidado. Antes disso, fica `partial`.

### 2.2 Cancelamento
Cancelar não exclui registro. O status vira `canceled`, e o evento fica registrado em auditoria operacional.

### 2.3 Duplicação
Duplicar cria uma nova conta copiando entidade, classificações, valor e observação, mantendo status `open` e origem vinculada ao registro original.

### 2.4 Parcelamento e recorrência
Parcelamento cria N contas futuras dividindo o valor original.

Recorrência simples cria N contas futuras com o mesmo valor mensal.

Nesta fase, isso é uma ação assistida simples, não um motor de recorrência permanente.

### 2.5 Auditoria
Toda ação operacional escreve em `financial_operation_audit`:

- recurso;
- ação;
- valor envolvido;
- motivo/observação;
- usuário;
- data.

## 3. Interface
As ações aparecem nos cards existentes de contas a pagar/receber:

- `Baixar`;
- `Parcial`;
- `Duplicar`;
- `Parcelar`;
- `Recorrência`;
- `Cancelar`.

O visual continua compacto, com botões pequenos e entrada inline apenas quando necessário. Baixa total e duplicação são ações diretas; baixa parcial, parcelamento, recorrência e cancelamento abrem uma linha curta dentro do próprio card.

## 4. Critérios de Aceite
- Baixa total atualiza status, data e valor liquidado.
- Baixa parcial atualiza status e valor liquidado acumulado.
- Duplicação cria nova conta aberta.
- Cancelamento deixa histórico e remove do aberto.
- Parcelamento cria parcelas futuras com valor distribuído.
- Recorrência simples cria lançamentos mensais futuros.
- Testes backend e frontend cobrem os fluxos principais.
