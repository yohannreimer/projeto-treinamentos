# Design: Visão Compacta da Jornada de Módulos no Perfil do Cliente

Data: 2026-04-06  
Status: Proposto e validado em brainstorming

## 1. Objetivo

Melhorar a leitura da seção `Clientes > Perfil > Jornada de módulos` com uma visão de topo compacta, clara e acionável, mostrando:

- O que já foi concluído
- O que está em andamento
- O que está planejado
- O que está em stand-by

Sem aumentar ruído visual nem ocupar espaço excessivo.

## 2. Regra de negócio consolidada

Classificação de cada módulo ativo do cliente:

- `Concluído`: `status = Concluido`
- `Em andamento`: `status = Em_execucao`
- `Planejado`: `status = Planejado`
- `Stand-by`: `status = Nao_iniciado` e `is_enabled = true`

Módulos desativados:

- Não entram nos quatro KPIs principais
- Aparecem separadamente apenas como contador auxiliar (`Desativados: X`)

## 3. Solução UX aprovada

Adicionar uma faixa compacta no topo da seção `Jornada de módulos` com chips KPI clicáveis:

- `Concluído N`
- `Em andamento N`
- `Planejado N`
- `Stand-by N`
- `Todos N` (reset de filtro)

Comportamento:

- Clique em um chip aplica filtro na lista de módulos abaixo
- Clique no mesmo chip remove filtro
- Clique em `Todos` limpa qualquer filtro
- Exibir texto de apoio: `Exibindo X de Y módulos ativos`

Diretriz de espaço:

- Chips em uma única linha no desktop
- Em telas menores, quebra para múltiplas linhas mantendo legibilidade
- Sem inserir novos painéis altos ou blocos pesados acima da lista

## 4. Estrutura de componentes (frontend)

### 4.1 Novo estado de filtro na tela

Na página `ClientDetailPage`:

- Estado local para filtro de jornada (ex.: `all`, `Concluido`, `Em_execucao`, `Planejado`, `Nao_iniciado`)
- Estado derivado para contadores por status
- Lista filtrada derivada da timeline ativa

### 4.2 Novo bloco visual no topo da seção

Dentro da seção `Jornada de módulos`, antes da `<ul className="timeline">`:

- Linha de chips KPI
- Contador de módulos desativados
- Texto `Exibindo X de Y módulos ativos`

### 4.3 Lista de módulos

Manter componente atual de itens, mas renderizando a coleção filtrada.

## 5. Fluxo de dados

1. API já retorna `timeline` com `status` e `is_enabled`.
2. Front calcula subconjunto `ativos` (`is_enabled = true`).
3. Front agrega contadores para os quatro grupos.
4. Usuário clica em chip.
5. Front aplica filtro somente na renderização da lista.
6. Ações existentes de módulo (salvar, concluir admin, desfazer, ativar/desativar) permanecem.
7. Ao atualizar dados (`load()`), contadores e filtro são recalculados.

## 6. Estados e tratamento de erro

- Sem módulos ativos: chips exibem zero e lista vazia com mensagem clara.
- Todos módulos desativados: mostrar `Desativados: X` e mensagem de sem ativos.
- Erro de carregamento já existente permanece como estado principal da página.
- Se módulo mudar de status após ação, contagem e filtragem devem refletir imediatamente após `load()`.

## 7. Critérios de aceitação

- Em até 3 segundos, usuário identifica distribuição da jornada por status.
- Filtro por chip funciona em 1 clique e é reversível sem recarregar página.
- `Stand-by` segue regra automática: ativo + `Nao_iniciado`.
- Módulos desativados não contaminam os quatro KPIs.
- Layout continua compacto, sem crescimento vertical significativo da seção.

## 8. Testes recomendados

### 8.1 Frontend (comportamento)

- Contagens corretas para datasets mistos (ativos/desativados).
- Filtro `Stand-by` mostra apenas `Nao_iniciado` ativos.
- `Todos` restaura lista completa de ativos.
- Após mudar status de um módulo, KPIs atualizam.

### 8.2 Regressão visual

- Desktop: chips em linha e sem overflow.
- Tablet/mobile: quebra de linha sem sobreposição.
- Sem impacto negativo nas ações atuais dos cards de módulo.

## 9. Fora de escopo deste incremento

- Novo status persistido em banco chamado `Stand-by`.
- Alteração do modelo de dados de progresso.
- Reestruturação completa dos cards de módulo.
