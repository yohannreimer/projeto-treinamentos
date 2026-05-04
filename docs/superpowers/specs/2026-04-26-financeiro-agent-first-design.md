# Design: Financeiro Agent-First

## Objetivo

Evoluir o Whisper Flow de um interpretador de comandos para um agente financeiro do aplicativo.

O objetivo não é criar um chat genérico. O objetivo é criar uma camada de operação por voz que entende o módulo financeiro, consulta o estado real do app, resolve alvos com segurança e executa ações oficiais do sistema com confirmação.

Esse desenho segue a opção B como base: `agente com registry de capacidades`. Ele já nasce com partes importantes da opção C: memória operacional, loop de consulta, sugestões assistidas, ações em lote, aprendizado de padrões e postura proativa controlada.

## Problema Atual

A primeira versão do Whisper Flow funciona bem para comandos diretos:

- criar conta a pagar;
- criar conta recorrente;
- criar simulação;
- baixar próximos recebíveis;
- consultar vencimentos.

Mas ela trava ou cai em fallback quando o comando depende de contexto, edição ou resolução de alvo:

- "altere o nome dessa conta recorrente";
- "esse centro de custo aqui deve ser Comercial";
- "crie duas categorias e depois aplique nessa conta";
- "salve esse padrão para as próximas conciliações";
- "mude essa despesa para outro centro de custo";
- "apague aquelas categorias que eu acabei de criar".

O motivo é estrutural: hoje a IA tenta transformar texto em um plano quase direto. Para virar produto forte, ela precisa operar em loop e consultar ferramentas antes de decidir.

## Princípio Central

O agente nunca deve agir no escuro.

Quando o usuário pede algo que depende de um dado existente, o agente deve primeiro consultar o domínio correto:

- se falou em categoria, listar/buscar categorias;
- se falou em centro de custo, listar/buscar centros de custo;
- se falou em conta recorrente, listar/buscar recorrências;
- se falou em "essa conta", olhar memória, página atual, último item criado e seleção atual;
- se falou em conciliação, buscar pendências e regras aprendidas;
- se falou em "os próximos dois", buscar a lista real ordenada.

Depois disso ele resolve o alvo, monta o plano, mostra a prévia e só executa após confirmação quando houver escrita.

## Arquitetura Recomendada

### 1. Agent Core

Motor central do agente financeiro.

Responsável por:

- receber comando por voz ou texto;
- montar o contexto da sessão;
- chamar o planejador;
- executar loops curtos de consulta;
- criar o plano final;
- persistir interação e auditoria;
- devolver prévia clara para o usuário.

Fluxo base:

1. Receber comando.
2. Classificar intenção inicial.
3. Identificar domínios envolvidos.
4. Consultar ferramentas de leitura necessárias.
5. Resolver alvos.
6. Gerar plano estruturado.
7. Validar permissões e riscos.
8. Pedir confirmação quando necessário.
9. Executar ferramentas oficiais.
10. Salvar resultado e memória.

### 2. Capability Registry

Catálogo formal do que o agente sabe fazer.

Cada capability deve declarar:

- nome técnico;
- nome humano;
- domínio;
- tipo de ação: leitura, escrita, simulação, classificação, exclusão;
- schema de entrada;
- schema de saída;
- risco;
- permissão necessária;
- se precisa confirmação;
- exemplos de fala;
- ferramentas de leitura que normalmente vêm antes dela.

Domínios iniciais:

- entidades;
- contas financeiras;
- categorias;
- centros de custo;
- formas de pagamento;
- contas a pagar;
- contas a receber;
- recorrências;
- movimentações;
- conciliação;
- simulação;
- relatórios;
- automações;
- anexos;
- auditoria.

### 3. Query Tools

Ferramentas de leitura são o que permitem o agente não ficar no escuro.

Ferramentas iniciais:

- `list_categories`;
- `search_categories`;
- `list_cost_centers`;
- `search_cost_centers`;
- `list_payment_methods`;
- `list_financial_accounts`;
- `list_entities`;
- `search_entities`;
- `list_recurring_rules`;
- `search_recurring_rules`;
- `list_payables`;
- `list_receivables`;
- `list_reconciliation_pending`;
- `list_simulation_scenarios`;
- `get_recent_context`;
- `get_last_created_objects`.

Essas ferramentas devem ser baratas, rápidas e retornar payloads compactos. O agente não precisa receber o banco inteiro. Ele precisa receber listas filtradas e resumidas.

### 4. Resolver De Alvos

Camada que transforma linguagem em IDs reais.

Exemplos:

- "essa conta recorrente" -> última recorrência criada ou selecionada;
- "o aluguel" -> recorrência ou conta com descrição parecida;
- "os próximos dois recebíveis" -> dois primeiros recebíveis abertos ordenados por vencimento;
- "centro comercial" -> centro de custo mais parecido com "Comercial";
- "a categoria que eu acabei de criar" -> último objeto `category` da memória;
- "esse lançamento sem centro" -> item selecionado ou pendência de qualidade mais recente.

Quando a confiança for baixa, o agente deve perguntar ou mostrar opções.

Critério sugerido:

- confiança alta: pode montar plano direto;
- confiança média: mostrar prévia com alvo destacado;
- confiança baixa: pedir escolha entre opções.

### 5. Conversation Memory

Memória operacional curta por usuário/sessão.

Guardar:

- último comando;
- último plano;
- últimas ações executadas;
- últimos objetos criados;
- objetos citados;
- página atual;
- filtros atuais;
- seleção atual, quando a UI enviar;
- últimos erros e correções.

Exemplo:

1. Usuário: "Cria uma conta recorrente de aluguel de 12 mil todo dia 10."
2. Sistema cria a recorrência e salva na memória: `last_created.recurring_rule`.
3. Usuário: "Agora altera o nome dessa conta recorrente para Aluguel Sala Centro."
4. Agente resolve "dessa conta recorrente" pela memória e monta ação de edição.

### 6. Planner Com Loop Curto

O planejador não deve ser uma única chamada cega.

Loop recomendado:

1. LLM recebe comando, contexto leve e registry.
2. LLM escolhe ferramentas de leitura necessárias.
3. Backend executa leituras.
4. LLM recebe os resultados compactos.
5. LLM monta plano de ações.
6. Backend valida plano.

Limite inicial:

- máximo de 3 rodadas por comando;
- máximo de 8 tools por comando;
- timeout curto por tool;
- fallback para pergunta de desambiguação.

Isso controla custo e latência sem bloquear comandos básicos.

### 7. Executor Seguro

A LLM nunca executa banco diretamente.

Ela só propõe chamadas de capabilities. O backend:

- valida schema;
- valida permissões;
- valida tenant;
- valida risco;
- valida existência dos IDs;
- valida impacto contábil;
- grava auditoria;
- executa via serviços oficiais.

Toda ação de escrita precisa gerar plano com linguagem humana.

### 8. Política De Confirmação

Sem confirmação:

- consultas;
- explicações;
- leitura de listas;
- prévias;
- simulações em rascunho não persistidas.

Com confirmação:

- criar lançamentos;
- editar cadastros;
- editar recorrências;
- baixar contas;
- classificar lançamentos;
- salvar padrão;
- criar simulação persistente.

Confirmação forte:

- exclusões;
- ações em massa;
- limpeza de dados;
- alterações em itens já liquidados;
- qualquer coisa que mude caixa realizado;
- qualquer regra automática permanente.

Bloqueado:

- ação sem permissão;
- alvo ambíguo demais;
- comando que mistura dados sensíveis sem confirmação;
- exclusão de registros com vínculos sem estratégia clara.

## Capabilities Prioritárias

### Recorrências

- listar recorrências;
- buscar recorrência por descrição;
- criar recorrência;
- editar nome;
- editar valor;
- editar dia;
- pausar;
- reativar;
- encerrar a partir de uma data;
- materializar próximos meses;
- alterar uma parcela sem mexer na regra.

### Cadastros

- criar entidade;
- editar entidade;
- inativar entidade;
- excluir entidade quando permitido;
- criar categoria;
- editar categoria;
- inativar categoria;
- excluir categoria quando permitido;
- criar centro de custo;
- editar centro de custo;
- inativar centro de custo;
- excluir centro de custo quando permitido;
- criar forma de pagamento;
- editar forma de pagamento;
- inativar forma de pagamento;
- excluir forma de pagamento quando permitido;
- criar conta financeira;
- editar saldo inicial;
- inativar conta;
- excluir conta quando permitido.

### Classificação

- listar pendências sem categoria;
- listar pendências sem centro;
- classificar item;
- classificar em lote;
- salvar padrão para entidade;
- salvar padrão por descrição;
- sugerir regra depois de repetição.

### Conciliação

- listar pendências;
- explicar por que não conciliou;
- aplicar match sugerido;
- criar lançamento a partir de extrato;
- salvar regra de conciliação;
- ignorar item com motivo;
- anexar comprovante.

### Operação

- criar conta a pagar;
- criar conta a receber;
- baixar conta;
- baixar parcialmente;
- duplicar;
- parcelar;
- cancelar;
- alterar vencimento;
- alterar competência quando habilitado;
- localizar próximos vencimentos;
- localizar atrasos.

### Simulação

- criar mesa;
- adicionar blocos reais;
- adicionar blocos manuais;
- alterar datas simuladas;
- alterar valores simulados;
- comparar cenários;
- explicar impacto;
- gerar sugestão de pagamento.

## Custo E Latência

O agente deve ter dois caminhos.

### Caminho Rápido

Para comandos simples e determinísticos:

- criar conta;
- criar recorrência;
- consultar vencimentos;
- baixar próximo item claro;
- alterar último item criado.

Esse caminho pode usar heurística local ou uma única chamada de LLM barata.

### Caminho Agêntico

Para comandos que dependem de consulta:

- editar algo existente;
- resolver "essa";
- mexer em categorias/centros;
- classificar pendências;
- operar em lote;
- salvar padrões;
- conciliar.

Esse caminho usa loop curto com ferramentas.

### Cache De Contexto

Para reduzir custo:

- cachear listas pequenas por alguns segundos;
- manter memória da página atual;
- enviar apenas dados resumidos para a LLM;
- executar matching local antes de chamar a LLM quando possível.

## Experiência De Usuário

A prévia do plano deve mostrar:

- o que será feito;
- quais registros foram encontrados;
- por que esses registros foram escolhidos;
- campos antes e depois;
- impacto em caixa ou DRE;
- se a ação será permanente;
- botão de confirmar;
- botão de editar plano;
- botão de cancelar.

Exemplo:

Usuário: "Altere o centro de custo dessa despesa para Comercial e salve isso como padrão."

Prévia:

- Lançamento encontrado: Seguro mensal, R$ 6.800, vence 07/05/2026.
- Centro atual: Sem centro.
- Novo centro: Comercial.
- Também será salvo padrão para próximos lançamentos parecidos.
- Precisa confirmação.

## Auditoria

Cada interação deve registrar:

- transcrição original;
- contexto usado;
- tools de leitura chamadas;
- resultados resumidos;
- plano proposto;
- confirmação;
- tools de escrita executadas;
- resultado;
- usuário;
- data/hora.

Isso é obrigatório para vender o produto para empresas.

## Fases De Implementação

### Fase 1: Núcleo Agent-First

- capability registry;
- query tools base;
- planner com loop curto;
- memória curta;
- executor seguro;
- prévia multi-ação;
- auditoria ampliada.

### Fase 2: Recorrências E Cadastros

- editar último item criado;
- editar recorrência por memória ou busca;
- CRUD por voz de categorias, centros, formas, contas e entidades;
- inativar/excluir com confirmação forte.

### Fase 3: Classificação E Padrões

- classificar pendências;
- salvar defaults inteligentes;
- classificar por entidade;
- classificar por descrição;
- sugerir regras após repetição.

### Fase 4: Conciliação Assistida

- consultar pendências;
- explicar matches;
- criar lançamento a partir de extrato;
- aprender regras de conciliação;
- anexar comprovantes.

### Fase 5: Proatividade Controlada

- alertas;
- sugestões de automação;
- anomalias;
- revisões periódicas;
- planos sugeridos;
- aprovações.

## Critérios De Sucesso

- O agente entende comandos sequenciais com "essa", "aquele", "último" e "os próximos".
- O agente consulta dados antes de editar registros existentes.
- A prévia mostra o alvo certo antes de executar.
- Edições comuns não exigem navegação manual.
- O usuário consegue criar, editar, inativar e excluir cadastros por voz.
- O usuário consegue corrigir classificação e salvar padrões por voz.
- O custo fica controlado por cache, heurística local e loop curto.
- Nenhuma ação sensível ocorre sem confirmação.

## Fora Do Escopo Inicial

- Execução automática sem usuário presente.
- Autonomia para pagar dinheiro real.
- Integração bancária real via Open Finance.
- Leitura completa de qualquer PDF ou XML.
- Chat livre fora do contexto financeiro.
