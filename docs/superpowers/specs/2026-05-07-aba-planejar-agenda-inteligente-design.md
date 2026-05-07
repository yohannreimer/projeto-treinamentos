# Aba Planejar: agenda inteligente por cliente, modulo e tecnico

## Objetivo

Criar uma aba operacional de planejamento para montar, revisar, publicar e replanejar turmas antes que elas virem agenda definitiva. A tela deve resolver o gargalo atual de alternar entre turmas, calendario, tecnicos e clientes para descobrir se um plano cabe.

A aba Planejar deve permitir trabalhar com varios clientes, varios modulos e varios tecnicos no mesmo rascunho, mantendo liberdade total para editar data e horario de cada encontro. O planejamento publicado sincroniza turmas, calendario e progresso esperado da jornada.

## Problema atual

Hoje a criacao de turma funciona, mas o planejamento amplo fica moroso:

- o operador precisa lembrar se o tecnico tem conflito em cada data;
- a validacao acontece durante a criacao/edicao de uma turma, nao em uma mesa de planejamento de carteira;
- treinamentos longos exigem visao de 30/60 dias, mas ajustes finos exigem horario real por dia;
- atividades comuns do calendario tambem bloqueiam agenda, mas precisam ser comparadas junto com turmas;
- quando um cliente pede troca de data, o operador precisa replanejar sem perder o vinculo com turma e calendario;
- modulos ja concluidos poluem a decisao se aparecerem como pendencia normal.

## Principios de UX

1. A agenda central e a ferramenta principal. Laterais existem para alimentar, filtrar, editar e validar.
2. O operador deve conseguir agir sem trocar de pagina para tarefas comuns.
3. Clicar em cliente/modulo filtra a agenda, nao abre uma navegacao profunda.
4. Clicar em encontro abre edicao contextual no painel lateral, nao modal.
5. Arrastar deve resolver movimentos comuns de data, horario e tecnico.
6. Toda alteracao deve ter escopo explicito: so este encontro, todos do modulo, ou turma inteira.
7. O sistema deve sugerir sem esconder a decisao: manual, assistido e automatico sao modos do mesmo fluxo.
8. Separar clientes por padrao. Juntar clientes na mesma turma apenas com confirmacao manual.

## Modelo mental

O planejamento e um agrupador temporario e versionado.

Hierarquia:

- Planejamento
- Cliente
- Modulo pendente
- Turma planejada por modulo
- Encontro individual

Cada cliente pode ter varias turmas planejadas por modulo. Cada turma contem encontros editaveis com data, horario inicial, horario final, tecnico, status de confirmacao e origem do planejamento.

Por padrao, modulos concluidos ficam ocultos. O usuario pode ativar um filtro para mostrar concluidos quando precisar auditar a jornada.

## Modos de alocacao

### Manual

O operador monta tudo:

- escolhe cliente;
- escolhe modulo;
- escolhe tecnico;
- cria ou arrasta encontros;
- define data, horario inicial e horario final;
- publica quando a validacao estiver correta.

### Assistido

O sistema destaca melhores janelas, mas o operador confirma cada encaixe.

Sugestoes devem considerar:

- habilidade do tecnico para o modulo;
- turmas ja existentes;
- atividades comuns ja registradas;
- horarios reais, nao apenas manha/tarde;
- restricoes do cliente;
- duracao e tipo do treinamento;
- necessidade de sequencia entre encontros;
- carga do tecnico nos proximos 30/60 dias.

### Automatico

O sistema monta um plano completo em rascunho. Nada e publicado sem revisao.

O modo automatico deve gerar encontros, turmas planejadas e alertas de risco. O operador pode editar qualquer item antes de publicar.

## Regra de turmas por cliente

Por padrao, cada cliente mantem sua propria turma por modulo.

Exemplo:

- Delta Ferramentaria, MOD-01, turma Delta MOD-01;
- Delta Ferramentaria, TopSolid, turma Delta TopSolid;
- Omega Moldes, Fresamento, turma Omega Fresamento.

Se dois clientes tiverem o mesmo modulo, tecnico compativel e janela parecida, o sistema pode sugerir uma juncao. A juncao nunca acontece automaticamente. O operador precisa abrir a sugestao, comparar impacto e confirmar.

## Escalas de visualizacao

### Visao 60 dias

Serve para estrategia de capacidade.

Deve mostrar:

- tecnicos x semanas;
- carga percentual por semana;
- janelas boas;
- semanas saturadas;
- riscos de conflito;
- quantidade de encontros planejados;
- clientes/modulos principais em cada semana;
- onde o sistema recomenda distribuir treinamentos longos.

A visao 60 dias nao tenta mostrar cada hora. Ela orienta onde vale abrir o detalhe.

### Visao 30 dias

Serve para planejamento mensal mais concreto.

Deve mostrar:

- distribuicao por tecnico;
- blocos planejados por cliente/modulo;
- semanas com folga;
- semanas com excesso;
- encontros sem data;
- turmas prontas para publicacao.

### Visao semanal

Serve para montagem operacional.

Deve mostrar agenda por tecnico com horario real. Eventos devem ocupar a altura proporcional ao horario, por exemplo 10:00-14:00, deixando visivel o espaco livre antes e depois.

### Visao diaria

Serve para ajuste fino.

Deve permitir:

- editar horario exato;
- trocar tecnico;
- mover encontro para outro dia;
- ver atividades comuns e turmas oficiais no mesmo eixo;
- validar conflito imediatamente.

## Unidade de planejamento: encontro

Um encontro e a menor unidade editavel.

Campos principais:

- cliente;
- modulo;
- turma planejada;
- tecnico;
- data;
- horario inicial;
- horario final;
- status de confirmacao;
- origem: rascunho, publicado, replanejado;
- observacao operacional.

Treinamentos integrais, meio periodo, encontros em horarios especiais e sequencias quebradas devem virar encontros individuais.

Exemplos suportados:

- um treinamento das 10:00 as 14:00;
- dois dias em uma semana e tres dias na semana seguinte;
- um modulo com horarios diferentes por encontro;
- um cliente com restricao em dias especificos;
- uma troca pontual de apenas um encontro apos retorno do cliente.

## Edicao contextual

Ao selecionar um encontro, o painel lateral deve permitir editar:

- data;
- tecnico;
- horario inicial;
- horario final;
- cliente;
- modulo;
- observacao;
- escopo da alteracao.

Escopos:

- so este encontro;
- todos os encontros deste modulo;
- toda a turma planejada.

O painel tambem mostra validacao ao vivo:

- sem conflito ou conflito encontrado;
- tecnico habilitado ou nao habilitado;
- restricao do cliente;
- impacto em turma publicada;
- status de confirmacao com cliente.

## Publicacao e sincronizacao

Publicar um planejamento transforma rascunhos em registros reais.

Ao publicar uma turma nova:

- cria turma;
- cria blocos de modulo;
- cria encontros personalizados;
- aloca cliente nos modulos planejados;
- mostra eventos no calendario;
- preserva vinculo com o planejamento de origem.

Ao publicar alteracao de uma turma existente:

- atualiza turma;
- atualiza encontros do calendario;
- registra nova versao do planejamento;
- mantem historico suficiente para entender o que mudou.

## Replanejamento

Um planejamento publicado pode ser reaberto.

Fluxo esperado:

1. O operador abre o planejamento original.
2. Seleciona um encontro ou uma turma.
3. Move para outra data/horario/tecnico.
4. O sistema valida conflitos e impacto.
5. O operador salva como rascunho ou publica alteracao.
6. Ao publicar, turmas e calendario sao atualizados juntos.

O sistema deve diferenciar:

- rascunho nao publicado;
- publicado;
- alteracao pendente;
- alteracao publicada.

## Interface proposta

### Coluna esquerda: carteira e fila

Conteudo:

- busca rapida por cliente, modulo ou tecnico;
- filtros compactos: pendentes, risco, sem data, mostrar concluidos;
- clientes selecionados;
- modulos pendentes por cliente;
- progresso do planejamento por cliente;
- botao para adicionar cliente;
- botao para criar turma por modulo.

Comportamento:

- clicar em cliente filtra agenda;
- clicar em modulo seleciona turma planejada;
- itens concluidos ficam ocultos por padrao;
- itens sem data ficam destacados.

### Centro: agenda

Conteudo:

- seletor Dia, Semana, 30 dias, 60 dias;
- tecnicos selecionados;
- turmas oficiais;
- atividades comuns;
- encontros planejados;
- sugestoes do sistema;
- espacos livres reais.

Comportamento:

- arrastar encontro muda data, horario ou tecnico;
- redimensionar encontro muda horario inicial/final;
- clicar seleciona e abre painel contextual;
- sugestoes aparecem como blocos tracejados;
- zoom macro abre detalhe semanal/diario sem perder contexto.

### Coluna direita: painel contextual

Conteudo:

- editor do encontro selecionado;
- escopo da alteracao;
- validacao ao vivo;
- sugestoes pendentes;
- botoes de publicacao;
- status de confirmacao do cliente.

Comportamento:

- nao deve virar painel generico lotado;
- quando nada estiver selecionado, mostra resumo do planejamento;
- quando ha sugestoes, mostra aceitar, editar ou ignorar;
- publicacao deve listar quantas turmas e encontros serao criados/alterados.

## Estados importantes

- vazio: nenhum cliente selecionado;
- carregando agenda;
- planejamento com conflitos;
- planejamento pronto para publicar;
- planejamento publicado;
- replanejamento com alteracoes pendentes;
- erro de validacao;
- tecnico sem habilidade para modulo;
- atividade comum bloqueando horario;
- cliente com restricao de disponibilidade;
- modulo concluido oculto;
- modulo concluido exibido por filtro.

## Dados necessarios

Novas entidades provaveis:

- planning_workspace;
- planning_workspace_client;
- planning_cohort;
- planning_encounter;
- planning_version.

Dados a reutilizar:

- company;
- module_template;
- company_module_progress;
- technician;
- technician skills;
- cohort;
- cohort_module_block;
- cohort_schedule_day;
- cohort_allocation;
- calendar_activity;
- calendar_activity_day.

## Regras de validacao

O motor de validacao deve checar:

- conflito de tecnico por horario real;
- conflito com turma oficial;
- conflito com atividade comum;
- tecnico habilitado para modulo;
- modulo concluido pelo cliente;
- modulo desativado para cliente;
- pre-requisitos obrigatorios;
- horario final maior que horario inicial;
- encontro fora de janela permitida do cliente;
- tentativa de juntar clientes sem confirmacao manual.

## Criterios de sucesso

- Planejar uma carteira de 3 clientes e 3 tecnicos sem sair da aba Planejar.
- Criar turmas por modulo a partir do planejamento.
- Visualizar 30/60 dias sem perder leitura de capacidade.
- Ajustar um encontro individual com horario real.
- Reabrir planejamento publicado e mover um encontro, atualizando turma e calendario ao publicar.
- Evitar que modulos concluidos aparecam por padrao.
- Reduzir dependencia de memoria do operador para conflitos de agenda.

## Fora do escopo inicial

- envio automatico para cliente;
- aceite formal do cliente por portal;
- otimizacao avancada com custo financeiro;
- inteligencia artificial conversacional;
- integracao externa com Google Calendar ou Outlook.

## Testes esperados

Backend:

- criar planejamento com varios clientes;
- gerar turmas por modulo;
- validar conflito por horario real;
- validar conflito com atividades comuns;
- publicar planejamento novo;
- publicar replanejamento;
- manter modulos concluidos ocultos por padrao na consulta de planejamento.

Frontend:

- renderizar carteira lateral;
- alternar zoom Dia/Semana/30 dias/60 dias;
- selecionar encontro e editar no painel contextual;
- aplicar alteracao por escopo;
- mostrar sugestoes sem publicar automaticamente;
- validar estados de conflito e pronto para publicar.

Verificacao manual:

- montar planejamento com 3 clientes e 3 tecnicos;
- criar turmas separadas por cliente/modulo;
- mover encontro de 10:00-14:00 e confirmar que espacos 08:00-10:00 e 14:00-18:00 continuam visiveis;
- reabrir planejamento publicado e publicar uma alteracao pontual.
