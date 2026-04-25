# Design: Financeiro Conciliação Inteligente (Fase 6)

## Status de Implementação
Atualizado em 2026-04-23.

Concluída no workspace principal, sem commit/push por decisão do usuário.

## 1. Objetivo
A Fase 6 transforma a conciliação de uma fila com sugestões simples em uma inbox mais inteligente.

O foco é:

- sugerir matches por valor, data, direção, descrição e entidade;
- explicar por que uma sugestão recebeu determinada confiança;
- criar lançamento financeiro diretamente a partir de um extrato;
- aprender padrões a partir de decisões repetidas;
- deixar o histórico recente útil para auditoria operacional.

## 2. Backend
O endpoint `GET /finance/reconciliation/inbox` continua sendo a fonte principal da tela.

As sugestões passam a carregar:

- motivos de confiança;
- origem da sugestão (`value_date`, `description`, `learned_rule`);
- lacunas de data e valor;
- indicação de regra aprendida quando houver padrão repetido.

O aprendizado nesta fase é derivado dos matches já confirmados. Quando descrições de extrato parecidas aparecem repetidamente ligadas a lançamentos com a mesma entidade/categoria/centro de custo, o backend usa esse padrão para aumentar a confiança de novos matches.

Também entra uma ação transacional para criar lançamento a partir de um extrato e, no mesmo fluxo, registrar o match. O lançamento nasce liquidado, com data de emissão/vencimento/competência/baixa ancorada no extrato.

## 3. Interface
A tela preserva a estrutura atual:

- abas principais continuam no painel esquerdo;
- cards de pendência continuam compactos;
- coluna direita continua com sugestões/importados/matches.

Entram melhorias discretas:

- cada sugestão mostra os motivos do score;
- pendência sem match pode virar lançamento conciliado em um clique;
- matches recentes mostram origem, confiança e histórico da decisão de forma mais legível.

## 4. Regras de Cálculo
Uma sugestão combina sinais:

- valor igual ou muito próximo;
- direção compatível entre extrato e lançamento;
- distância de data;
- tokens relevantes em comum na descrição;
- nome da entidade encontrado na descrição do extrato;
- regra aprendida por repetição histórica.

O score final fica limitado entre 0 e 0,99 e sempre vem acompanhado dos sinais usados.

## 5. Critérios de Aceite
- A inbox continua listando pendências não conciliadas.
- Sugestões incluem motivos e origem.
- Sugestões melhoram quando há histórico repetido.
- É possível criar lançamento a partir de extrato e conciliar automaticamente.
- O histórico recente exibe confiança/origem da decisão.
- Testes cobrem o contrato backend e a experiência principal da UI.
