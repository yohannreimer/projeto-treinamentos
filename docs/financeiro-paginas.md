# Mapa de páginas do app financeiro

Este documento descreve as páginas que hoje existem no módulo `Financeiro` do frontend, com base na implementação real em `apps/frontend/src/finance`.

## Visão geral do módulo

O financeiro hoje funciona como um workspace próprio dentro do app interno, publicado em `/financeiro/*`.

### Shell compartilhado do módulo

Todas as páginas do financeiro usam a mesma estrutura base:

- Sidebar financeira fixa
- Área principal com o conteúdo da página selecionada

### Elementos da sidebar

A sidebar contém:

- Título do módulo: `Financeiro ERP`
- Nome da organização logada
- Texto de apoio explicando que o módulo é um ERP financeiro da empresa autenticada
- Bloco de contexto com:
  - nome da organização
  - moeda
  - timezone
  - mensagem de erro, se o contexto falhar ao carregar
- Navegação principal com 8 páginas:
  - `Visão Geral`
  - `Movimentações`
  - `Contas a Receber`
  - `Contas a Pagar`
  - `Conciliação`
  - `Fluxo de Caixa`
  - `Relatórios`
  - `Cadastros`
- Rodapé com link para voltar ao restante do sistema, quando existir outra área acessível ao usuário

## Rotas publicadas hoje

As rotas ativas do módulo são:

- `/financeiro/overview`
- `/financeiro/transactions`
- `/financeiro/receivables`
- `/financeiro/payables`
- `/financeiro/reconciliation`
- `/financeiro/cashflow`
- `/financeiro/reports`
- `/financeiro/cadastros`

`/financeiro` redireciona para `/financeiro/overview`.

## 1. Visão Geral

**Rota:** `/financeiro/overview`

**Objetivo:** ser a home executiva do módulo, misturando leitura de saúde financeira com atalhos operacionais.

### O que existe na página

- Hero da página com:
  - eyebrow `Executive Overview`
  - título `Executive Overview`
  - texto com o nome da empresa logada
  - bloco de meta com moeda, timezone, data/hora da última atualização e indicação de que esta é a home principal do módulo
- Grid de KPIs executivos
  - cada card mostra rótulo, valor principal e dica contextual
  - os KPIs podem ser monetários ou numéricos
- Painel principal de fluxo de caixa
  - título `Fluxo de caixa 90 dias`
  - resumo do saldo projetado
  - indicação da janela atual
  - gráfico em bandas por período
  - para cada banda, exibe:
    - label do período
    - saldo
    - barras de entradas e saídas
    - totais de entradas e saídas
- Fila operacional
  - cards com status, valor, título, detalhe e CTA
  - cada card leva para uma área do módulo
- Ações rápidas
  - atalhos navegáveis para rotinas importantes
  - cada ação mostra título e descrição curta

### Estados da página

- Loading: mostra bloco simples com `Carregando visão executiva do financeiro...`
- Erro: mostra mensagem de falha dentro da própria página

## 2. Movimentações

**Rota:** `/financeiro/transactions`

**Objetivo:** ser o ledger central do ERP financeiro, com leitura auditável, filtros, drill-down e edição manual.

### O que existe na página

- Header com:
  - eyebrow `Movimentações`
  - título `Ledger financeiro`
  - descrição da página
  - meta lateral mostrando:
    - quantidade de contas
    - quantidade de categorias
    - quantidade de entidades
    - total de lançamentos do recorte atual
    - total de excluídos visíveis, quando o filtro de histórico está ativo
- Painel de erro, quando necessário
- Painel de mensagem de sucesso, quando necessário
- Painel de filtros do ledger com:
  - período
  - status
  - tipo
  - conta
  - categoria
  - entidade
  - busca textual
  - checkbox para incluir lançamentos excluídos no histórico
- Cards de resumo do ledger:
  - total de lançamentos
  - entradas
  - saídas
  - saldo líquido
- Bloco principal com tabela do ledger
  - colunas:
    - lançamento
    - entidade
    - conta
    - categoria
    - tipo
    - status
    - data-base
    - valor
    - drill-down
  - cada linha é clicável para seleção
  - mostra indicador visual para linha selecionada
  - mostra estado especial para lançamento excluído
  - o drill-down da linha exibe:
    - valor assinado
    - caixa
    - competência
- Painel lateral de detalhes do lançamento selecionado
  - headline com descrição e valor
  - ações:
    - `Novo lançamento`
    - `Editar linha`
    - `Excluir`
  - aviso auditável quando a linha já foi excluída
  - lista de detalhes:
    - entidade
    - conta
    - categoria
    - tipo
    - status
    - data de emissão
    - data de vencimento
    - data de competência
    - liquidação
    - fonte
    - referência
    - criado por
  - visão consolidada da linha:
    - caixa
    - competência
    - projetado
    - confirmado
  - observação sobre a origem do lançamento
- Formulário manual de criação/edição
  - entidade
  - conta
  - categoria
  - tipo
  - status
  - valor
  - emissão
  - vencimento
  - competência
  - liquidação
  - observação
  - botão principal para salvar
  - botão para limpar editor no modo de edição
  - aviso quando o usuário só pode ler e não editar

### Comportamentos importantes

- Se não houver lançamento selecionado, a lateral pede para o usuário escolher uma linha
- O modo pode alternar entre `create` e `edit`
- Excluir não apaga o histórico: o item continua visível se o filtro de excluídos estiver ligado

## 3. Contas a Receber

**Rota:** `/financeiro/receivables`

**Objetivo:** concentrar a rotina operacional de recebíveis da empresa.

### O que existe na página

- Header com:
  - eyebrow `Contas a receber`
  - título `Rotina operacional de recebíveis`
  - texto explicando atrasos, vencimentos do dia, próximos recebimentos e baixas
- Painel de cadastro de nova conta a receber
  - descrição
  - cliente
  - valor
  - status
  - vencimento
  - recebido em
  - conta
  - categoria
  - emissão
  - observação
  - botão `Registrar conta a receber`
  - botão `Limpar`
- Painel `Pulso operacional`
  - texto com total de títulos cadastrados, em acompanhamento e liquidados
  - badges com contagem:
    - atrasados
    - vencendo hoje
    - próximos
    - recebidos
- Cards de resumo:
  - carteira em aberto
  - atrasado
  - vence hoje
- Listas agrupadas:
  - `Atrasados`
  - `Vencendo hoje`
  - `Próximos vencimentos`
  - `Liquidados`
- Cada item das listas mostra:
  - descrição
  - cliente
  - conta e categoria, quando houver
  - valor
  - vencimento
  - data de recebimento
  - status

### Estados da página

- Loading: `Carregando contas a receber...`
- Erro: mensagem inline no painel operacional
- Sucesso: mensagem após cadastro

## 4. Contas a Pagar

**Rota:** `/financeiro/payables`

**Objetivo:** concentrar a rotina operacional de obrigações e desembolsos.

### O que existe na página

- Header com:
  - eyebrow `Contas a pagar`
  - título `Rotina operacional de obrigações`
  - texto sobre atrasos, vencimentos do dia, próximos desembolsos e baixas
- Painel de cadastro de nova conta a pagar
  - descrição
  - fornecedor
  - valor
  - status
  - vencimento
  - pago em
  - conta
  - categoria
  - emissão
  - observação
  - botão `Registrar conta a pagar`
  - botão `Limpar`
- Painel `Pulso operacional`
  - texto com total de obrigações cadastradas, em acompanhamento e liquidadas
  - badges com contagem:
    - atrasados
    - vencendo hoje
    - próximos
    - pagos
- Cards de resumo:
  - carteira em aberto
  - atrasado
  - vence hoje
- Listas agrupadas:
  - `Atrasados`
  - `Vencendo hoje`
  - `Próximos vencimentos`
  - `Liquidados`
- Cada item das listas mostra:
  - descrição
  - fornecedor
  - conta e categoria, quando houver
  - valor
  - vencimento
  - data de pagamento
  - status

### Estados da página

- Loading: `Carregando contas a pagar...`
- Erro: mensagem inline no painel operacional
- Sucesso: mensagem após cadastro

## 5. Conciliação

**Rota:** `/financeiro/reconciliation`

**Objetivo:** operar a inbox de extratos e a leitura de matches sugeridos.

### O que existe na página

- Header com:
  - eyebrow `Conciliação`
  - título `Inbox operacional de extratos`
  - texto explicando pendências bancárias, sugestões de match e rastreio de importações
- Painel `Radar da fila`
  - `Na fila`
  - `Match hoje`
  - `Cobertura`
  - `Sem sugestão`
- Bloco principal `Pendências de conciliação`
  - resumo da inbox:
    - na fila
    - importados
    - stale
    - cobertura
  - insights em formato de cards
  - seletor por buckets da inbox
  - cabeçalho da seção ativa com valor total e número de itens
  - lista de pendências do bucket selecionado
- Cada pendência da inbox mostra:
  - descrição
  - conta financeira
  - data do lançamento/extrato
  - valor
  - quantidade de sugestões
  - dias em fila
  - saldo do extrato
  - lista de matches sugeridos
- Cada sugestão mostra:
  - descrição da transação sugerida
  - entidade
  - vencimento
  - score de confiança
- Coluna lateral com 3 painéis:
  - `Sugestões de match`
  - `Extratos importados`
  - `Matches recentes`

### O que existe em cada painel lateral

- `Sugestões de match`
  - cards com descrição, percentual de confiança, descrição do extrato, data, entidade, valor e vencimento
- `Extratos importados`
  - nome do arquivo
  - status do job
  - tipo de importação
  - linhas processadas
  - data de finalização
- `Matches recentes`
  - tipo da conciliação
  - status do match
  - transação vinculada
  - data de revisão

### Estados da página

- Loading: `Carregando painel de conciliação...`
- Erro: mensagem em painel simples

## 6. Fluxo de Caixa

**Rota:** `/financeiro/cashflow`

**Objetivo:** dar leitura projetada do caixa em janelas de 30, 60 e 90 dias.

### O que existe na página

- Header com:
  - eyebrow `Fluxo de Caixa`
  - título `Fluxo de caixa projetado`
  - descrição da tela
- Painel `Horizonte temporal`
  - seletor de horizonte com botões:
    - `30 dias`
    - `60 dias`
    - `90 dias`
  - cards por janela com:
    - horizonte
    - nível de risco
    - saldo final
    - entradas e saídas
- Resumo principal com:
  - saldo inicial
  - entradas projetadas
  - saídas projetadas
  - saldo final
  - pior ponto
- Área de alertas
  - cards com título e detalhe
  - visual varia conforme o tom do alerta
- Gráfico textual da curva projetada
  - pontos destacados por data
  - saldo por data
  - barras de entradas e saídas
  - estatísticas por ponto:
    - entradas
    - saídas
    - net
- Comparativo entre janelas 30/60/90 dias
  - mini barras verticais por janela
  - saldo final de cada período

### Estados da página

- Loading: `Carregando projeção...`
- Erro: mensagem inline de falha

## 7. Relatórios

**Rota:** `/financeiro/reports`

**Objetivo:** entregar a camada gerencial do módulo, baseada no ledger e nas projeções.

### O que existe na página

- Header com:
  - eyebrow `Relatórios`
  - título `Leituras gerenciais`
  - texto explicando DRE gerencial, comparativos e análises
- Painel `Visão executiva dos relatórios`
  - cards com:
    - receita líquida
    - despesas operacionais
    - resultado operacional
    - recebíveis vencidos
    - pagáveis vencidos
    - períodos rastreados
- Lista de cards de relatórios

### Relatórios presentes hoje

- `DRE gerencial`
  - receita bruta
  - deduções
  - receita líquida
  - despesas operacionais
  - resultado operacional
- `Realizado vs projetado`
  - lista por período com realizado, projetado e variação
- `Receitas por categoria`
  - categorias com quantidade de movimentações e valor
- `Despesas por categoria`
  - categorias com quantidade de movimentações e valor
- `Contas a receber vencidas`
  - aging com entidade, descrição, vencimento e valor
- `Contas a pagar vencidas`
  - aging com entidade, descrição, vencimento e valor
- `Fluxo consolidado por período`
  - período
  - entradas
  - saídas
  - saldo

### Estados da página

- Loading: `Carregando relatórios gerenciais...`
- Erro: mensagem inline

## 8. Cadastros

**Rota:** `/financeiro/cadastros`

**Objetivo:** manter a base de entidades financeiras e exibir o snapshot do catálogo financeiro.

### O que existe na página

- Header com:
  - eyebrow `Cadastros`
  - título `Cadastros híbridos`
  - descrição da base única para clientes e fornecedores
- Painel `Filtro de leitura`
  - tabs:
    - `Todos`
    - `Clientes`
    - `Fornecedores`
  - contador de entidades exibidas
- Formulário `Nova entidade financeira`
  - razão social
  - nome fantasia
  - documento
  - tipo:
    - cliente
    - fornecedor
    - ambos
  - e-mail
  - telefone
  - checkbox `Entidade ativa`
  - botão `Cadastrar entidade`
  - feedback de sucesso/erro
- Painel `Entidades cadastradas`
  - tabela com colunas:
    - razão social
    - fantasia
    - tipo
    - documento
    - status
- Painel `Contas, categorias e referências`
  - cards de snapshot do catálogo para:
    - contas financeiras
    - categorias
    - centros de custo
    - formas de pagamento
  - cada card mostra:
    - quantidade de registros
    - nome do bloco
    - descrição
    - preview textual dos primeiros itens

### Estados da página

- Loading: textos como `Carregando a base única...` e `Carregando entidades...`
- Erro: painel com mensagem de falha

## Tela existente no código, mas fora da navegação

Existe uma página chamada `FinanceDebtsPage.tsx`, mas ela **não está publicada nas rotas atuais** e **não aparece na sidebar**.

### O que essa tela contém

- Header de dívidas e parcelamentos
- Formulário de cadastro de passivos
- Lista de dívidas com:
  - tipo da dívida
  - principal
  - saldo em aberto
  - vencimento
  - liquidação
  - status
  - observação

Hoje ela deve ser tratada como uma tela legada ou em espera, não como parte do fluxo principal do app financeiro.

## Resumo rápido

Hoje o app financeiro publicado tem 8 páginas principais, todas dentro do workspace `/financeiro`, com 3 camadas bem claras:

- home executiva: `Visão Geral`
- operação: `Movimentações`, `Contas a Receber`, `Contas a Pagar`, `Conciliação`
- gestão e estrutura: `Fluxo de Caixa`, `Relatórios`, `Cadastros`
