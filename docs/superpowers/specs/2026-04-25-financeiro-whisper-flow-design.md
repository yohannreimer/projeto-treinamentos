# Financeiro Whisper Flow Design

## Objetivo

Criar uma camada de IA ambiente dentro do módulo financeiro, inspirada na fluidez de interação do Wispr Flow, mas voltada ao objetivo do nosso produto: transformar voz em ações financeiras seguras, auditáveis e contextuais.

O foco principal é voz. Texto existe como alternativa, mas o gesto nobre é falar. A experiência deve parecer integrada ao aplicativo inteiro, não uma nova página.

## Experiência

O usuário aciona o Whisper Flow por um atalho de teclado ou botão flutuante. Em vez de abrir um formulário, o app abre um modo de voz compacto: uma orbe flutuante com estado de gravação, feedback visual de áudio e transcrição discreta.

Ao finalizar a fala, o sistema interpreta o comando e abre uma prévia da ação. A prévia mostra o que será feito, quais registros serão alterados, valores, datas, impacto esperado e se precisa de permissão adicional.

Exemplos de comandos:

- "Lança aluguel de 8 mil todo dia 15."
- "Baixa essa conta hoje."
- "Muda Seguro mensal para centro Administrativo."
- "Simula saldo atual mais entrada de 20 mil amanhã e pagando aluguel, ECAD e seguro."
- "Mostra o que vence essa semana."
- "O que está sem classificação?"

## Formato Visual

O Whisper Flow tem três estados principais:

1. **Idle**
   - Ícone discreto no canto inferior.
   - Atalho visível em tooltip ou estado inicial.
   - Não compete visualmente com o botão de lançamento rápido.

2. **Listening**
   - Orbe compacta, com waveform ou pulso de áudio.
   - Mostra que está gravando.
   - Pode exibir transcrição parcial de forma discreta.
   - O usuário consegue cancelar rapidamente.

3. **Action Preview**
   - Painel flutuante compacto.
   - Mostra plano de ação.
   - Permite confirmar, editar ou cancelar.
   - Para comandos complexos, vira conversa curta sem sair da tela atual.

## Contexto

A IA deve entender a página atual e, quando possível, a seleção atual.

Exemplos:

- Em contas a pagar, "essa conta" referencia o item selecionado ou mais provável.
- Em simulação, "faz um cenário" cria ou edita a mesa atual.
- Em cadastros, "ajusta o saldo dessa conta" usa a conta em edição.
- Em relatórios, "por que a receita caiu?" responde a partir do período selecionado.

Quando houver ambiguidade, a IA não deve adivinhar silenciosamente. Ela deve pedir confirmação ou apresentar opções.

## Autonomia E Segurança

O sistema trabalha em níveis:

1. **Pode executar sem confirmação**
   - Consultas.
   - Explicações.
   - Montar rascunhos.
   - Criar simulações não persistentes ou rascunhos.

2. **Precisa de confirmação**
   - Lançar conta.
   - Baixar conta.
   - Reclassificar categoria, centro, conta ou forma.
   - Criar recorrência.
   - Criar simulação persistente.

3. **Precisa de permissão/aprovação**
   - Excluir dados.
   - Limpar lançamentos.
   - Baixar valores altos.
   - Executar ações em lote.
   - Alterar itens já liquidados quando houver impacto em caixa.

4. **Bloqueado**
   - Qualquer ação fora das permissões do usuário.
   - Qualquer ação em que a IA não consiga identificar registros com confiança suficiente.

## Motor De Ações

O Whisper Flow não deve manipular banco diretamente. Ele gera um plano estruturado e executa ferramentas internas do financeiro.

Cada ação deve ter:

- `intent`: tipo de intenção.
- `confidence`: confiança da interpretação.
- `targets`: registros envolvidos.
- `payload`: dados que serão enviados para a API.
- `risk_level`: baixo, médio, alto.
- `requires_confirmation`: booleano.
- `requires_permission`: permissão necessária.
- `human_summary`: explicação clara para o usuário.

## Fases

### Fase 1: Voice Command MVP

Entregar a experiência base:

- botão/atalho do Whisper Flow;
- modo de gravação com feedback visual;
- transcrição;
- interpretação de comandos operacionais;
- prévia de ação;
- confirmação antes de executar;
- auditoria mínima.

Comandos iniciais:

- criar conta a pagar;
- criar conta a receber;
- baixar conta;
- reclassificar lançamento;
- consultar vencimentos;
- listar pendências de classificação;
- criar simulação simples com saldo, entrada e pagamentos.

### Fase 2: Conversa E Edição De Plano

- painel flutuante conversacional;
- edição de plano antes de executar;
- suporte a múltiplas ações em uma fala;
- memória curta da conversa atual;
- perguntas de desambiguação.

### Fase 3: Arquivos

- anexar extrato, boleto, nota ou comprovante no painel;
- criar lançamento sugerido a partir de documento;
- sugerir conciliação a partir de extrato;
- registrar comprovante em entidade, conta ou movimentação.

### Fase 4: IA Proativa

- alertas de caixa;
- alertas de vencimento;
- sugestões de automação;
- sugestões de classificação;
- revisão de anomalias;
- pedidos de aprovação automáticos.

### Fase 5: Agente Avançado

- execução em lote com aprovação;
- regras aprendidas por repetição;
- rotinas recorrentes assistidas;
- relatórios explicativos por voz;
- análise gerencial orientada a decisão.

## Auditoria

Toda execução precisa registrar:

- usuário;
- transcrição original;
- intenção interpretada;
- plano apresentado;
- confirmação do usuário;
- APIs chamadas;
- resultado;
- data/hora.

Isso é essencial para vender para empresas.

## Critérios De Sucesso

- Usuário consegue operar tarefas comuns falando, sem sair da tela atual.
- Nenhuma ação financeira sensível acontece sem confirmação.
- A IA entende o contexto da tela.
- A prévia de ação é clara para usuário não técnico.
- Erros são recuperáveis: editar plano, cancelar ou pedir esclarecimento.
- DRE e caixa não são contaminados por interpretações erradas.

## Fora Do Primeiro MVP

- Autonomia completa sem confirmação.
- Integração bancária real via Open Finance.
- Leitura robusta de todos os formatos de PDF.
- Agente rodando em background com execução automática.
- Aprendizado permanente de preferências.

