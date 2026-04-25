# Design: Financeiro Avançado Cockpit + Simulação

## Contexto

O módulo financeiro já tem uma base operacional forte, mas duas áreas precisam de desenho melhor antes de implementação:

1. `Avançado` hoje parece uma tela técnica, solta e pouco confiável.
2. `Simulação` ainda não existe e deve permitir testar cenários financeiros sem afetar lançamentos reais.

O objetivo deste design é transformar essas duas áreas em produto de verdade, preservando o estilo visual atual do financeiro: limpo, denso, empresarial e sem poluição.

## Decisões Fechadas

### Avançado

- Papel: `Central de controle + automações`.
- Layout: `Cockpit primeiro`.
- Escopo inicial: `Controle + regras assistidas`.
- Evolução posterior: `Automação avançada completa`.

### Simulação

- Modelo mental: `Blocos de cenário`.
- Layout: `Mesa de simulação`.
- Escopo inicial: `Pacote gestor`.

## Avançado: Cockpit de Controle

### Problema

A aba `Avançado` não pode ser uma coleção de abas técnicas. O usuário precisa abrir a tela e entender:

- o que exige decisão;
- quais regras estão ativas;
- o que foi aprovado ou auditado;
- onde há risco operacional;
- quais integrações e permissões estão impactando o financeiro.

### Experiência Proposta

A primeira tela deve ser um cockpit com:

- cards de status no topo;
- fila de decisões pendentes;
- regras assistidas em linguagem operacional;
- trilha recente de auditoria;
- atalhos para anexos, exportações, integrações e permissões.

O usuário comum vê uma central de controle. O usuário avançado consegue abrir o construtor de regras.

### Linguagem

Nenhum termo técnico deve aparecer na interface final.

Trocar exemplos como:

- `payable.created` por `Quando uma conta a pagar for criada`;
- `min_amount_cents` por `Valor mínimo`;
- `request_approval` por `Pedir aprovação`;
- `finance.approval` por `Fila de aprovação financeira`.

### Regras Assistidas

No pacote inicial, o sistema deve oferecer regras em português por templates:

- quando valor passar de um limite;
- quando fornecedor pertencer a uma classificação;
- quando conta vencer em poucos dias;
- quando lançamento estiver sem categoria ou centro de custo;
- quando uma entrada importante atrasar;
- quando uma conciliação ficar pendente.

Cada regra deve ter:

- nome amigável;
- gatilho em linguagem humana;
- condições editáveis;
- ação clara;
- status ativo/pausado;
- último uso ou indicação de que ainda não rodou.

### Ações Iniciais

O pacote `Controle + regras assistidas` deve cobrir:

- aprovar pagamentos;
- revisar pendências;
- registrar anexos/comprovantes;
- exportar dados;
- consultar auditoria;
- visualizar permissões;
- criar/pausar regras assistidas;
- registrar integrações sandbox de forma compreensível.

### Fase Posterior: Automação Avançada Completa

Deixar documentado como próxima fase:

- construtor no-code completo;
- gatilhos compostos;
- condições com `E/OU`;
- múltiplas ações por regra;
- histórico de execuções;
- teste de regra antes de ativar;
- regras por centro de custo, conta bancária e classificação;
- integração bancária/API profunda;
- alertas externos;
- aprovação em múltiplos níveis.

## Simulação: Mesa de Cenários

### Problema

O usuário precisa responder perguntas como:

- se essa entrada não cair, consigo pagar isso?
- se eu pagar 30% desta conta agora, quanto sobra?
- se antecipar esse recebível e jogar esse pagamento para outro dia, qual o menor saldo?
- se eu criar uma despesa hipotética, o caixa fica negativo?

A simulação não deve afetar ledger, contas a pagar, contas a receber, DRE ou fluxo real.

### Experiência Proposta

A tela deve ser uma mesa com três áreas:

1. Biblioteca de blocos.
2. Cenário montado.
3. Resultado financeiro.

### Biblioteca de Blocos

Blocos iniciais:

- saldo atual em conta;
- entradas previstas;
- contas a pagar;
- lançamento manual de entrada;
- lançamento manual de saída;
- ajuste de data;
- ajuste de valor;
- pagamento parcial por valor;
- pagamento parcial por percentual.

Os blocos reais vêm do financeiro, mas entram na simulação como cópias. Alterar um bloco simulado não altera o lançamento original.

### Cenário Montado

O usuário deve conseguir:

- adicionar blocos ao cenário;
- remover blocos;
- alterar data simulada;
- alterar valor simulado;
- pagar percentual de uma conta;
- pagar valor parcial;
- marcar entrada como recebida ou não recebida no cenário;
- duplicar cenário;
- comparar pelo menos dois cenários.

### Resultado

O painel de resultado deve mostrar:

- saldo inicial;
- total de entradas simuladas;
- total de saídas simuladas;
- saldo final;
- menor saldo do período;
- primeiro dia de caixa negativo, se houver;
- linha do tempo de saldo por dia;
- lista dos principais eventos que mudam o caixa.

### Segurança Conceitual

Toda a tela deve deixar claro que é simulação:

- nenhum bloco simulado altera dado real;
- cenários são salvos separadamente;
- só uma ação explícita futura poderia transformar cenário em lançamento real;
- essa conversão fica fora do pacote inicial.

## Dados e Persistência

### Avançado

Reaproveitar tabelas atuais de regras, auditoria, anexos, integrações e permissões, mas melhorar os contratos para a UI receber labels amigáveis prontos.

O backend deve retornar:

- `label`;
- `description`;
- `human_trigger`;
- `human_conditions`;
- `human_action`;
- `last_run_at`;
- `execution_count`;
- `severity`;
- `recommended_action`.

### Simulação

Criar entidades próprias para cenários:

- `finance_simulation_scenario`;
- `finance_simulation_item`;
- `finance_simulation_result_snapshot` opcional.

Um cenário pertence ao tenant financeiro e pode guardar:

- nome;
- descrição;
- horizonte de datas;
- cenário base ou cenário duplicado;
- status rascunho/salvo/arquivado;
- itens simulados;
- resultado calculado.

### Cálculo

O cálculo pode ser determinístico no backend:

1. carregar saldo inicial;
2. aplicar eventos por data;
3. somar entradas e saídas;
4. calcular saldo diário;
5. detectar menor saldo e caixa negativo;
6. retornar série temporal para a UI.

## Interface

### Avançado

Não usar abas técnicas como estrutura principal. Preferir:

- topo com indicadores;
- seção `Decisões pendentes`;
- seção `Regras em operação`;
- seção `Auditoria recente`;
- seção `Conexões e permissões`;
- modais ou painéis laterais para criar regra, anexar comprovante e ver detalhes.

### Simulação

Layout desktop:

- esquerda: biblioteca de blocos;
- centro: cenário;
- direita: resultado.

Layout mobile/tablet:

- alternar por abas internas: `Blocos`, `Cenário`, `Resultado`.

## Fora do Escopo Inicial

- integração bancária real;
- upload real para storage externo;
- automação avançada com condições compostas;
- converter simulação em lançamentos reais;
- aprovação multinível;
- notificações externas;
- colaboração multiusuário em tempo real.

Esses itens ficam documentados para fases posteriores.

## Testes

### Backend

- regras assistidas retornam labels humanos;
- aprovações/auditoria/anexos seguem tenant;
- cenários de simulação não alteram lançamentos reais;
- cálculo detecta saldo final, menor saldo e caixa negativo;
- duplicar cenário preserva itens e gera novo id;
- comparação retorna resultados independentes.

### Frontend

- Avançado não mostra termos técnicos;
- usuário cria/pausa regra assistida;
- cockpit mostra decisões pendentes;
- Simulação adiciona blocos reais e manuais;
- alteração de data/valor recalcula resultado;
- pagamento parcial por percentual recalcula corretamente;
- duplicar/comparar cenário funciona;
- estado vazio é claro e útil.

## Critério de Pronto

- `Avançado` parece uma central de controle, não uma tela técnica.
- `Simulação` permite montar ao menos dois cenários sem afetar dados reais.
- O usuário consegue responder “quanto sobra se eu fizer isso?” sem abrir planilha.
- A fase posterior de automação avançada completa está claramente mapeada.
