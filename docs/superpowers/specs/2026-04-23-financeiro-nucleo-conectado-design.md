# Design: Financeiro Núcleo Conectado (Fase 1)

## Status de Implementação
Atualizado em 2026-04-23.

A Fase 1 está implementada no workspace principal, ainda sem commit/push por decisão do usuário.

Itens concluídos:

- schema do núcleo conectado com tags, defaults por contexto, centro de custo e forma de pagamento nos lançamentos;
- APIs de tags, perfis padrão, qualidade de dados, correção e filtros de período;
- cadastro inteligente com classificações e defaults por contexto;
- contas a pagar/receber com busca de entidade, criação assistida, defaults, campos de classificação e filtros locais compactos;
- inbox `Conciliação & Revisão` com aba de dados incompletos e painel lateral de correção;
- correção com opção de salvar padrão para a entidade;
- Visão Geral com filtro de período, mini-gráficos reais e resumo de qualidade;
- qualidade de dados computada para contas a pagar, contas a receber e movimentações;
- testes principais de backend/frontend e build passando.

Verificações executadas:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend -- finance
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/frontend -- FinanceCadastrosPage FinancePayablesPage FinanceReceivablesPage FinanceReconciliationPage FinanceOverviewPage
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
git diff --check
```

Resultado:

- backend: 69 testes passando;
- frontend financeiro alvo: 18 testes passando;
- build backend/frontend passando;
- `git diff --check` limpo;
- aviso restante apenas do Vite sobre chunk acima de 500 kB.

Pendente antes de encerramento definitivo:

- QA visual/manual em localhost pelo usuário;
- ajustes finos após análise visual;
- commit/push somente depois da validação.

## 1. Resumo Executivo
Este design define a primeira fase funcional do módulo financeiro após a validação visual inicial.

O objetivo da Fase 1 é transformar o financeiro de um conjunto de telas bonitas em uma jornada operacional conectada:

- cadastro inteligente;
- lançamento assistido;
- qualidade de dados visível;
- revisão operacional;
- filtros por período;
- KPIs com mini-gráficos reais.

O princípio central aprovado é: **fácil para lançar no dia a dia, poderoso para quem quer controlar bem**.

O sistema não deve bloquear o usuário comum, mas também não deve esconder dado incompleto. Quando faltar informação importante, o lançamento pode ser salvo, mas entra em revisão com severidade clara.

## 2. Decisões Aprovadas
### 2.1 Estratégia de construção
A sequência aprovada é:

1. implementar primeiro a **Opção A: Núcleo Conectado**;
2. assim que a Fase 1 estiver sólida, avançar para cadastro completo, filtros globais mais profundos, regras avançadas, relatórios melhores, recorrências fortes e conciliação inteligente.

### 2.2 Perfil de entidade
O cadastro de entidade será **híbrido progressivo**.

Isso significa:

- pode começar simples;
- pode virar inteligente com defaults e regras;
- não exige configuração pesada para lançar;
- fica poderoso para quem quer DRE, centro de custo e automação corretos.

### 2.3 Tipo e classificação operacional
Entidade terá:

- **tipo principal**: papel financeiro básico;
- **classificações/tags operacionais**: o que a entidade representa na prática.

Exemplo:

- André Becker:
  - tipo principal: `supplier`;
  - tags/classificações: `Funcionário`;
  - defaults de conta a pagar: `Folha + Comercial + PIX + recorrente mensal`.

As tags serão uma **lista sugerida + tags customizadas**.

Tags iniciais sugeridas:

- `Funcionário`;
- `Banco`;
- `Imposto`;
- `Software`;
- `Aluguel`;
- `Prestador`;
- `Cliente recorrente`;
- `Fornecedor crítico`;
- `Comissão`;
- `Marketing`;
- `Jurídico`.

### 2.4 Categoria e centro de custo
Categoria e centro de custo serão separados.

- **Categoria** responde a linguagem do DRE: o que é este lançamento.
- **Centro de custo** responde a alocação interna: onde isso bate na empresa.

Exemplo:

- categoria: `Folha`;
- centro de custo: `Comercial`.

O sistema terá **combinações favoritas** entre categoria e centro de custo para acelerar lançamentos sem misturar os conceitos.

### 2.5 Defaults por contexto
Defaults de entidade serão por tipo de lançamento.

Na Fase 1, os contextos mínimos são:

- `payable`: conta a pagar;
- `receivable`: conta a receber;
- `transaction`: movimentação avulsa.

Uma mesma entidade pode ter defaults diferentes em cada contexto.

Exemplo:

- André Becker em `payable`:
  - categoria: `Folha`;
  - centro de custo: `Comercial`;
  - conta: `Banco Principal`;
  - forma de pagamento: `PIX`;
  - recorrência: mensal.

- André Becker em `transaction`:
  - categoria: `Reembolso`;
  - centro de custo: `Comercial`.

### 2.6 Criação assistida de entidade
Ao lançar uma conta a pagar ou receber, se o usuário digitar uma entidade inexistente, o sistema deve perguntar:

> Esta entidade não existe no cadastro. Quer cadastrar agora com essas informações?

Ações:

- `Cadastrar e usar`;
- `Usar só neste lançamento`.

O comportamento aprovado é criar a entidade somente com confirmação explícita.

### 2.7 Conciliação & Revisão
A aba atual de `Conciliação` evolui para **Conciliação & Revisão**.

Ela passa a concentrar duas responsabilidades:

1. conciliação bancária;
2. revisão de qualidade de dados.

Na Fase 1, essa tela deve funcionar como uma inbox financeira operacional.

### 2.8 Correção em painel lateral
Ao clicar em uma pendência, a correção deve abrir em painel lateral.

O painel mostra:

- lançamento original;
- problemas detectados;
- sugestões do sistema;
- campos editáveis;
- ação para aplicar correção;
- opção para salvar a combinação como padrão da entidade.

### 2.9 Aprendizado controlado
Quando o usuário corrige um lançamento, o sistema pergunta:

> Quer usar esta combinação como padrão para esta entidade nas próximas contas a pagar/receber?

Ações:

- `Salvar padrão`;
- `Só desta vez`.

O sistema não aprende automaticamente na Fase 1.

### 2.10 Filtros
Os filtros serão completos, mas compactos.

Opções de período:

- `Últimos 7 dias`;
- `Últimos 30 dias`;
- `Hoje`;
- `Próximos 7 dias`;
- `Próximos 30 dias`;
- `Mês atual`;
- `Todos`;
- `Customizado`.

O modelo será híbrido:

- existe um período global do financeiro;
- cada tela pode sobrescrever localmente;
- a interface deve indicar se a tela usa filtro global ou filtro local.

### 2.11 Visão Geral e filtros
Na Visão Geral, alguns cards respeitam o filtro e outros permanecem globais.

Globais:

- saldo em conta;
- contas bancárias ativas;
- itens estruturais que representam estado atual.

Filtráveis:

- faturamento;
- despesas;
- resultado projetado;
- contas a pagar no período;
- contas a receber no período;
- pendências no período, quando aplicável.

### 2.12 Mini-gráficos nos cards
Os cards da Visão Geral terão mini-gráficos baseados em dados reais agregados pelo backend.

Padrão visual aprovado:

- receita/despesa: tendência;
- a pagar/a receber: barras por vencimento/período;
- resultado: progresso, meta ou projeção;
- saldo em conta: linha simples ou nenhum gráfico se ficar poluído.

Fallback visual:

- se o híbrido ficar visualmente pesado, voltar para sparkline discreto em todos os cards.

## 3. Escopo da Fase 1
### 3.1 Dentro do escopo
A Fase 1 inclui:

- evolução do modelo de entidade para suportar tags/classificações;
- defaults por entidade e contexto;
- centro de custo vinculado aos lançamentos;
- forma de pagamento vinculada aos lançamentos quando aplicável;
- criação assistida de entidade em contas a pagar/receber;
- preenchimento automático de defaults;
- detecção de lançamentos incompletos;
- severidade de qualidade de dados;
- inbox de revisão dentro de `Conciliação & Revisão`;
- painel lateral de correção;
- salvar correção como default opcional;
- filtros compactos por período;
- base de filtro global e sobrescrita local;
- agregados mínimos de KPIs para mini-gráficos reais;
- testes cobrindo backend, frontend e fluxos principais.

### 3.2 Fora do escopo da Fase 1
Ficam para fases posteriores:

- motor avançado de regras por descrição;
- aprendizado automático baseado em histórico;
- aprovação de pagamentos;
- anexos/comprovantes;
- importação bancária real via API;
- recorrência avançada com calendário complexo;
- parcelamento completo;
- exportações oficiais;
- relatórios fiscais;
- permissões granulares por ação financeira;
- aba própria de revisão separada da conciliação.

## 4. Modelo de Domínio
### 4.1 Entidade financeira
Entidade financeira representa qualquer pessoa ou organização relacionada ao financeiro.

Campos atuais continuam:

- nome legal;
- nome fantasia;
- documento;
- tipo principal;
- e-mail;
- telefone;
- ativo/inativo.

Campos novos propostos:

- classificações/tags operacionais;
- observação interna simples;
- indicador de perfil inteligente configurado;
- metadados de criação automática quando vier de lançamento assistido.

### 4.2 Tags/classificações
Tags operacionais devem ser configuráveis por organização.

Elas servem para:

- filtros;
- automações futuras;
- leitura operacional;
- sugestões;
- segmentação de entidades.

Na Fase 1, uma entidade pode ter uma ou mais tags.

### 4.3 Defaults de entidade
Defaults devem ser separados por contexto.

Campos mínimos por contexto:

- categoria padrão;
- centro de custo padrão;
- conta financeira padrão;
- forma de pagamento padrão;
- vencimento padrão simples;
- competência padrão simples;
- recorrência simples.

Representação conceitual:

```text
entity_default_profile
- organization_id
- entity_id
- context: payable | receivable | transaction
- financial_category_id
- financial_cost_center_id
- financial_account_id
- financial_payment_method_id
- due_rule
- competence_rule
- recurrence_rule
- is_active
```

As regras podem começar simples como campos de texto/enums controlados e evoluir depois.

### 4.4 Centro de custo nos lançamentos
Hoje o cadastro de centro de custo existe, mas os lançamentos não carregam essa dimensão de forma central.

A Fase 1 deve permitir vínculo de centro de custo em:

- `financial_transaction`;
- `financial_payable`;
- `financial_receivable`.

Isso é necessário para:

- DRE por centro de custo;
- filtros;
- pendências de qualidade;
- defaults de entidade;
- relatórios futuros.

### 4.5 Forma de pagamento nos lançamentos
Forma de pagamento também deve ser carregada nos lançamentos quando aplicável.

Ela é relevante para:

- operação diária;
- conciliação;
- automação;
- filtro;
- análise de fluxo.

### 4.6 Qualidade de dados
Cada lançamento deve poder gerar uma leitura de qualidade.

Na Fase 1, a qualidade pode ser computada, não necessariamente armazenada em todas as tabelas.

Severidades:

#### Crítico
Afeta DRE e análise principal:

- sem entidade;
- sem categoria;
- sem centro de custo.

#### Atenção
Afeta operação e previsibilidade:

- sem conta financeira;
- sem forma de pagamento;
- sem vencimento;
- sem competência.

#### Sugestão
Melhora automação, mas não impede leitura:

- entidade parece nova;
- categoria provável;
- centro de custo provável;
- possível duplicidade;
- regra sugerida.

## 5. Fluxos de Produto
### 5.1 Criar entidade inteligente
Fluxo:

1. usuário entra em `Cadastros`;
2. escolhe nova entidade;
3. informa tipo principal;
4. adiciona tags sugeridas ou customizadas;
5. configura defaults por contexto;
6. salva.

Resultado:

- entidade aparece no cadastro;
- próximos lançamentos podem puxar defaults;
- entidade fica disponível para filtros e revisão.

### 5.2 Criar conta a pagar com entidade existente
Fluxo:

1. usuário abre `Contas a Pagar`;
2. digita ou seleciona entidade;
3. sistema identifica defaults do contexto `payable`;
4. preenche categoria, centro de custo, conta, forma de pagamento e regras simples;
5. usuário pode editar manualmente;
6. salva.

Resultado:

- conta a pagar é criada;
- lançamento financeiro relacionado mantém dimensões consistentes;
- se faltar algo, pendência é gerada.

### 5.3 Criar conta a pagar com entidade nova
Fluxo:

1. usuário digita um nome não encontrado;
2. sistema abre confirmação discreta;
3. usuário escolhe `Cadastrar e usar` ou `Usar só neste lançamento`;
4. se cadastrar, entidade básica é criada;
5. usuário pode completar defaults agora ou depois;
6. conta é criada.

Resultado:

- o fluxo rápido continua possível;
- o cadastro fica mais fidedigno quando o usuário confirma;
- entidades incompletas podem entrar em revisão/sugestão.

### 5.4 Revisar pendência
Fluxo:

1. usuário abre `Conciliação & Revisão`;
2. escolhe aba/filtro `Dados incompletos`;
3. clica em uma pendência;
4. painel lateral abre;
5. usuário escolhe entidade, categoria, centro, conta ou forma de pagamento;
6. aplica correção;
7. sistema pergunta se quer salvar padrão na entidade.

Resultado:

- lançamento é corrigido;
- fila de pendências diminui;
- se o usuário aceitar, default futuro é atualizado.

### 5.5 Filtro global e local
Fluxo:

1. usuário escolhe período global no módulo financeiro;
2. Visão Geral reflete os cards filtráveis;
3. ao abrir uma tela, ela usa o filtro global por padrão;
4. usuário pode sobrescrever localmente;
5. a tela mostra indicação de filtro local ativo.

Resultado:

- leitura fica consistente;
- usuário não perde liberdade operacional;
- relatórios e listas ficam mais previsíveis.

## 6. Interface e Experiência
### 6.1 Preservação visual
A interface atual deve ser preservada.

Regras:

- não criar telas visualmente pesadas;
- não adicionar cards mortos;
- usar filtros compactos;
- preservar densidade premium;
- manter a sensação de ERP moderno, não planilha decorada.

### 6.2 Cadastros
A aba `Cadastros` passa a ser o cérebro do financeiro.

Ela deve organizar:

- entidades;
- contas financeiras;
- categorias;
- centros de custo;
- formas de pagamento;
- tags/classificações;
- defaults de entidade.

Na Fase 1, o foco visual é entidade inteligente e catálogo essencial. CRUD completo de todos os cadastros pode ser expandido na Fase 2.

### 6.3 Contas a Pagar e Receber
As telas devem continuar rápidas.

Mudanças esperadas:

- campo de entidade com busca/autocomplete;
- confirmação para entidade nova;
- campos de categoria, centro de custo, conta e forma de pagamento;
- preenchimento automático por defaults;
- indicação discreta quando o lançamento ficará incompleto;
- filtro local compacto.

### 6.4 Conciliação & Revisão
A tela vira inbox operacional.

Estrutura inicial:

- resumo superior compacto;
- abas ou filtros:
  - `Extratos`;
  - `Dados incompletos`;
  - `Entidades sugeridas`;
- lista de pendências;
- painel lateral de correção.

O nome da navegação passa de `Conciliação` para `Conciliação & Revisão`.

### 6.5 Visão Geral
Cards devem mostrar:

- valor principal;
- hint claro;
- mini-gráfico real quando aplicável;
- indicação do período quando o card for filtrável.

Mini-gráficos devem ser componentes pequenos e substituíveis, para permitir voltar ao modo sparkline sem reescrever a tela.

## 7. Backend e APIs
### 7.1 Novos contratos esperados
Contratos conceituais para a Fase 1:

- listar/criar tags operacionais;
- vincular tags a entidade;
- ler/salvar defaults por entidade e contexto;
- resolver sugestões/defaults ao selecionar entidade;
- listar pendências de qualidade;
- aplicar correção de pendência;
- salvar correção como default;
- retornar KPIs com séries agregadas.

### 7.2 Qualidade de dados
O backend deve fornecer uma leitura unificada de pendências para `Conciliação & Revisão`.

Cada pendência deve ter:

- id;
- tipo de recurso;
- id do recurso;
- severidade;
- campos ausentes;
- descrição humana;
- sugestões;
- data de referência;
- link/contexto de origem.

### 7.3 Aggregates para mini-gráficos
O endpoint da Visão Geral deve evoluir para entregar séries mínimas por card.

Exemplos:

- receita por dia/semana no período;
- despesa por dia/semana no período;
- a pagar por vencimento;
- a receber por vencimento;
- resultado acumulado;
- saldo projetado.

As séries devem respeitar o filtro quando o card for filtrável.

## 8. Erros e Estados Vazios
### 8.1 Cadastro incompleto
Se o usuário salvar sem dados importantes, o sistema deve:

- permitir salvar quando possível;
- avisar com texto curto;
- criar pendência de revisão;
- não mostrar erro assustador se for uma escolha consciente.

### 8.2 Defaults conflitantes
Se uma entidade tiver defaults que não fazem sentido para o contexto, o sistema deve:

- ignorar defaults inválidos;
- manter o campo editável;
- mostrar aviso discreto;
- não quebrar o lançamento.

### 8.3 Tags duplicadas
Tags customizadas devem evitar duplicidade por nome normalizado.

Exemplo:

- `Funcionário`;
- `funcionario`;
- `Funcionarios`.

Na Fase 1, pelo menos normalização simples por caixa e espaços deve existir.

### 8.4 Correção concorrente
Se uma pendência já foi corrigida em outra aba, o painel deve:

- recarregar o item;
- indicar que a pendência não existe mais;
- permitir voltar para a lista.

## 9. Testes
### 9.1 Backend
Testes mínimos:

- criar entidade com tags;
- criar defaults por contexto;
- buscar defaults por entidade/contexto;
- criar conta a pagar puxando defaults;
- criar conta a receber puxando defaults;
- detectar pendência crítica sem entidade/categoria/centro;
- detectar pendência de atenção sem conta/forma/vencimento/competência;
- aplicar correção;
- salvar correção como default;
- gerar agregados de KPIs respeitando filtro.

### 9.2 Frontend
Testes mínimos:

- cadastro de entidade inteligente;
- seleção de entidade preenche defaults;
- entidade inexistente mostra confirmação;
- conta a pagar salva com defaults;
- conta a receber salva com defaults;
- lançamento incompleto mostra aviso;
- `Conciliação & Revisão` lista pendências;
- painel lateral aplica correção;
- opção de salvar default aparece após correção;
- filtro global/local muda listas e cards filtráveis;
- mini-gráficos renderizam sem quebrar layout.

### 9.3 E2E/visual
Verificações:

- fluxo completo entidade -> conta a pagar -> pendência -> revisão;
- fluxo entidade nova -> cadastrar e usar;
- Visão Geral com período global;
- tela sem overflow horizontal;
- cards com gráficos não sobrepõem texto;
- mobile/tablet não quebra filtros compactos.

## 10. Roadmap Pós-Fase 1
### Fase 2: Cadastros completos
- CRUD completo de contas financeiras;
- CRUD completo de categorias;
- CRUD completo de centros de custo;
- CRUD completo de formas de pagamento;
- tela melhor para combinações favoritas;
- detecção de entidades duplicadas;
- edição completa de perfis inteligentes.

### Fase 3: Operação diária
- conta única e recorrente;
- baixa rápida;
- baixa parcial;
- duplicar lançamento;
- parcelamento;
- cancelamento auditável;
- status mais claros e consistentes.

### Fase 4: Filtros globais completos
- filtros em todas as telas;
- filtros salvos por usuário;
- período global persistente;
- relatórios obedecendo filtro;
- drill-down de número para lista.

### Fase 5: Relatórios e DRE
- DRE por competência;
- resultado por centro de custo;
- fluxo de caixa por vencimento/baixa;
- realizado vs projetado;
- relatórios filtráveis;
- drill-down em todas as linhas importantes.

### Fase 6: Conciliação inteligente
- sugestões por descrição;
- criar lançamento a partir de extrato;
- aprender regras depois de repetições;
- match por valor/data/entidade;
- histórico de decisões.

### Fase 7: Poder avançado
- regras automáticas;
- aprovação de pagamentos;
- anexos/comprovantes;
- auditoria detalhada;
- permissões granulares;
- exportação CSV/PDF;
- integrações bancárias/API.

## 11. Critérios de Sucesso da Fase 1
A Fase 1 está pronta quando:

- uma entidade pode ser cadastrada com tags e defaults por contexto;
- contas a pagar/receber conseguem puxar defaults;
- entidade nova pode ser cadastrada durante o lançamento;
- lançamentos incompletos aparecem em revisão;
- pendência pode ser corrigida em painel lateral;
- correção pode virar default futuro;
- filtros compactos funcionam global/localmente;
- Visão Geral reflete período nos cards filtráveis;
- mini-gráficos usam dados reais agregados;
- todos os fluxos principais têm testes;
- a interface continua limpa e coerente com o visual atual.
