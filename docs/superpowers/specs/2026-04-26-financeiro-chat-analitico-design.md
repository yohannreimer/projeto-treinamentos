# Design: Chat Financeiro Analítico

## Objetivo

Evoluir o Whisper Flow para um assistente financeiro conversável, capaz de responder perguntas, analisar dados reais do financeiro e executar ações dentro do próprio fluxo.

O diferencial não é ser um chat genérico. O diferencial é ser um analista financeiro embutido no ERP: ele consulta o sistema, explica os números, mostra composição, sugere próximos passos e permite agir sobre cada item sem sair da conversa.

## Direção Visual

A direção aprovada é a **A: Cockpit Escuro Premium**, refinada com:

- painel lateral escuro, contrastando com o restante do app;
- cápsula de voz conectada ao estilo Wispr Flow;
- linguagem visual mais premium e menos "card genérico de IA";
- resumo executivo em card forte;
- composição em linhas densas/profissionais;
- sugestões do analista integradas ao final da resposta;
- barra pequena de chat/voz no rodapé do painel.

O painel deve parecer a parte mais vendável do aplicativo. Ele precisa ser mais sofisticado que uma janela comum de chat e mais operacional que um chatbot tradicional.

## Princípio De Produto

O usuário deve conseguir controlar majoritariamente o financeiro pelo Whisper:

- perguntar;
- analisar;
- filtrar;
- abrir composições;
- baixar contas;
- registrar parcial;
- postergar;
- classificar;
- simular;
- continuar a conversa usando os itens que acabaram de aparecer.

Exemplo:

1. Usuário pergunta: "ver as próximas três contas que tenho a pagar".
2. O Chat Financeiro mostra total, leitura e três itens acionáveis.
3. Usuário clica `Baixar` no aluguel.
4. O item é baixado diretamente e aparece ação `Desfazer`.
5. Usuário fala: "o imposto joga para dia 10".
6. O assistente resolve "imposto" pelo card recém-renderizado e monta/executa a alteração.

## Modos De Resposta

### 1. Resposta Compacta

Usada dentro do Whisper Flow pequeno quando a pergunta é simples e curta.

Mesmo compacta, a resposta deve ter:

- número principal;
- composição resumida;
- uma leitura curta;
- botão para expandir no Chat Financeiro.

### 2. Chat Financeiro Lateral

Usado para perguntas analíticas, conversas encadeadas e respostas com itens acionáveis.

Deve abrir automaticamente quando:

- a pergunta tiver composição;
- o usuário pedir lista;
- houver ações possíveis por item;
- a conversa continuar depois de uma resposta;
- a IA precisar mostrar análise, alerta ou sugestão.

## Tipos De Pergunta

O agente deve reconhecer perguntas como:

- "quanto tenho para pagar nos próximos 7 dias?";
- "quais são as próximas 3 contas a pagar?";
- "quanto tenho para receber esse mês?";
- "quanto tenho para pagar no centro de custo Comercial?";
- "o que está vencendo hoje?";
- "qual centro de custo mais pesa esse mês?";
- "me mostra as contas sem classificação";
- "analisa meu caixa dos próximos 30 dias";
- "o que pode apertar meu caixa essa semana?".

## Estrutura De Resposta Analítica

Toda resposta analítica deve ter:

1. **Número principal**
   - total a pagar, total a receber, saldo projetado, quantidade de itens ou valor por centro.

2. **Composição resumida**
   - lista dos principais itens ou grupos;
   - sempre com valor, data, status e dimensão relevante.

3. **Leitura de analista**
   - interpretação curta: concentração, risco, impacto, comparação ou ausência de dados.

4. **Alertas**
   - itens sem categoria;
   - itens sem centro de custo;
   - vencimentos críticos;
   - baixa parcial;
   - recorrências relevantes.

5. **Ações sugeridas**
   - abrir lista;
   - simular caixa;
   - baixar selecionados;
   - classificar pendências;
   - postergar;
   - renegociar;
   - criar regra.

## Componentes Do Chat

### Cabeçalho

- marca: `Whisper Finance` ou `Analista financeiro`;
- cápsula de voz;
- estado atual: ouvindo, analisando, pronto, executando.

### Pergunta Do Usuário

Mostra a fala transcrita em um bloco compacto.

### Card Executivo

Mostra o número principal e a leitura curta.

Exemplo:

> Total previsto: R$ 18.400,00
> 4 obrigações abertas nos próximos 7 dias. Aluguel representa 43% do período.

### Composição Em Linhas Densas

Cada item deve parecer parte de uma mesa financeira profissional, não um card genérico.

Cada linha tem:

- título;
- valor;
- vencimento;
- centro/categoria/status;
- indicador visual de prioridade;
- ações em pílulas.

Ações iniciais por conta a pagar:

- baixar;
- parcial;
- postergar;
- simular;
- classificar;
- detalhes.

Ações iniciais por conta a receber:

- receber;
- parcial;
- postergar;
- simular;
- detalhes.

### Sugestão Do Analista

Bloco pequeno com uma recomendação contextual.

Exemplos:

- "Antes de baixar tudo, simule o caixa considerando aluguel + software."
- "Dois itens estão sem centro de custo; classificar melhora o DRE."
- "Esse período concentra 62% das saídas em recorrências."

### Barra De Continuação

Barra pequena no rodapé:

- campo de texto;
- botão de voz;
- atalho para anexar/extrato no futuro;
- placeholder contextual.

Exemplo:

> Continue por voz ou digite uma ação...

## Ações Diretas E Desfazer

Ações individuais simples podem executar direto pelo clique, sem confirmação modal.

Exemplos:

- baixar uma conta individual;
- marcar recebida;
- aplicar classificação simples;
- postergar uma conta individual quando a nova data já foi escolhida.

Depois de executar:

- o item muda de estado no chat;
- aparece uma linha de confirmação;
- aparece botão `Desfazer`.

Ações sensíveis ou em massa continuam pedindo confirmação:

- baixar múltiplas contas;
- cancelar;
- excluir;
- limpar dados;
- aplicar regra automática ampla;
- alterar muitas recorrências.

## Conversa Com Referência Aos Itens

O chat deve salvar o contexto da última resposta:

- cards renderizados;
- IDs reais;
- labels;
- valores;
- ações disponíveis;
- filtros usados.

Assim o usuário pode dizer:

- "baixa o aluguel";
- "joga o imposto para dia 10";
- "classifica o software como tecnologia";
- "simula com esses três";
- "recebe só metade desse cliente".

O agente deve resolver esses termos pelos itens que estão visíveis no chat antes de buscar no banco inteiro.

## Backend

Adicionar um tipo de plano de resposta analítica, além dos planos executáveis atuais.

Formato sugerido:

```ts
type FinanceAssistantPlanDto = {
  id: string;
  status: 'draft' | 'answered' | 'executed' | 'failed';
  mode: 'command' | 'analysis' | 'hybrid';
  answer?: {
    title: string;
    summary: string;
    primary_metric: {
      label: string;
      amount_cents?: number;
      count?: number;
    };
    breakdown: Array<{
      id: string;
      resource_type: 'payable' | 'receivable' | 'transaction' | 'recurring_rule';
      title: string;
      amount_cents: number;
      due_date?: string | null;
      status?: string | null;
      meta: string[];
      available_actions: string[];
    }>;
    insights: string[];
    suggested_actions: string[];
  };
  actions: FinanceAssistantActionDto[];
};
```

## Ferramentas Analíticas Iniciais

Criar capabilities de leitura/análise:

- `finance_answer_payables_due`;
- `finance_answer_receivables_due`;
- `finance_answer_payables_by_cost_center`;
- `finance_answer_cash_projection`;
- `finance_answer_quality_pending`;
- `finance_answer_month_summary`.

Essas ferramentas devem buscar dados reais e retornar payload estruturado. A IA pode escrever a leitura de analista, mas os totais e itens vêm do backend.

## Roteador De Intenção

O roteador deve separar:

- **pergunta/análise**: quanto, quais, me mostra, analisa, compara, o que vence;
- **execução**: crie, baixe, altere, inative, exclua, classifique;
- **híbrido**: mostre X e baixe Y; analise e simule; liste e classifique.

Perguntas não devem cair em `query_quality` genérico.

## Frontend

Adicionar um painel lateral `FinanceAnalystChat`.

Responsabilidades:

- abrir a partir do Whisper Flow;
- renderizar histórico curto;
- renderizar resposta analítica;
- renderizar composição acionável;
- executar ações inline;
- mostrar estado `Desfazer`;
- manter a tela financeira atual visível.

O Whisper Flow compacto continua sendo o ponto de entrada.

## Critérios De Sucesso

- "Quanto tenho para pagar nos próximos 7 dias?" responde com total, composição e leitura.
- "Quais são as próximas 3 contas a pagar?" mostra três itens acionáveis.
- Clicar em `Baixar` em um item baixa a conta e mostra `Desfazer`.
- Depois de uma resposta, "joga o imposto para dia 10" resolve o item visível no chat.
- A UI parece premium, especialmente no painel escuro.
- Perguntas de leitura não pedem confirmação.
- Ações individuais simples executam direto com `Desfazer`.
- Ações em massa pedem confirmação.

## Fora Do Escopo Inicial

- anexos/extratos pelo chat;
- comparação com meses anteriores em profundidade;
- renegociação real com fornecedor;
- permissões granulares por ação;
- treinamento de modelo próprio;
- streaming token a token.

Esses itens ficam para fases posteriores.
