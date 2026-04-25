# PricingOS - Plano de Produto para Modulo Independente

## 1. Intencao

PricingOS deve ser pensado como um modulo/produto independente, com potencial de venda propria, conectado ao Financeiro, mas sem depender dele como uma simples aba.

A promessa central e:

> Descobrir lucro escondido nos precos, descontos, clientes, produtos e contratos antes de mexer no mercado.

Ele nao e apenas uma calculadora de preco. E um motor de decisao de margem, precificacao e rentabilidade.

## 2. Posicionamento

Financeiro responde:

- quanto entrou;
- quanto saiu;
- quanto existe em caixa;
- o que esta projetado;
- como esta o resultado.

PricingOS responde:

- se o preco praticado faz sentido;
- onde a empresa esta perdendo margem;
- qual cliente/produto/contrato e lucrativo;
- qual desconto destruiu lucro;
- qual ajuste de preco melhora EBITDA sem vender mais;
- qual preco minimo nao deve ser furado.

Frase de produto:

> PricingOS mostra onde o lucro esta vazando e quais precos devem mudar primeiro.

## 3. Publicos Possiveis

### 3.1 Empresas de servico B2B

Exemplos:

- agencias;
- consultorias;
- empresas de treinamento;
- software houses;
- prestadores de servico recorrente;
- operacoes tecnicas;
- servicos profissionais com contratos mensais.

Dores principais:

- precificam por feeling;
- nao sabem margem por cliente;
- cliente grande parece bom, mas pode consumir muita operacao;
- escopo cresce sem reajuste;
- desconto comercial vira perda invisivel;
- nao existe clareza de preco minimo por projeto, contrato ou hora.

Funcionalidades mais importantes:

- margem por cliente;
- margem por contrato;
- custo/hora real;
- preco minimo por servico;
- simulador de reajuste;
- vazamento por desconto, escopo e horas nao cobradas;
- ranking de clientes bons e ruins.

### 3.2 Empresas com produtos, SKUs ou catalogo

Exemplos:

- e-commerce;
- distribuidores;
- varejo especializado;
- pequenas industrias;
- sellers de marketplace;
- negocios com catalogo de produtos.

Dores principais:

- muitos produtos com margens diferentes;
- custo muda e preco fica parado;
- desconto come margem;
- taxas de canal/cartao/frete distorcem o lucro;
- concorrencia pressiona preco;
- produtos vendem muito, mas deixam pouco resultado.

Funcionalidades mais importantes:

- margem por SKU;
- preco tabela vs preco vendido;
- custo por produto;
- price waterfall;
- desconto por produto, cliente e vendedor;
- monitoramento de concorrencia;
- simulacao de aumento/reducao;
- recomendacao de reajuste.

## 4. Estrategia Recomendada de Go-To-Market

Apesar de suportar servicos e produtos, o go-to-market inicial deve focar uma dor mais especifica para evitar posicionamento generico.

Recomendacao inicial:

> PricingOS para empresas de servico que querem saber quais clientes, contratos e precos realmente dao lucro.

Motivos:

- mercado de pricing para e-commerce/SKU ja tem players fortes e muito especificos;
- empresas de servico B2B sofrem muito com margem invisivel;
- a plataforma ja tem base operacional e financeira para cruzar horas, contratos, clientes, contas e resultado;
- fica mais facil criar um diferencial proprio, em vez de disputar apenas monitoramento de concorrencia.

Depois, o modulo expande para SKUs, concorrencia e repricing sugerido.

## 5. Proposta de Valor por Segmento

### Para o dono da pequena empresa

- entender se esta cobrando certo;
- saber quanto precisa vender para empatar;
- ver quais clientes deixam dinheiro;
- testar reajustes antes de aplicar;
- parar de dar desconto que nao precisa.

### Para financeiro/gestor

- enxergar margem por cliente, contrato, produto e categoria;
- conectar custo fixo, custo variavel, impostos e comissoes;
- projetar impacto no DRE e no caixa;
- criar regras de preco minimo e margem minima.

### Para comercial

- saber ate onde pode dar desconto;
- justificar excecoes;
- entender quais clientes aceitam reajuste;
- ver impacto de preco no resultado.

### Para empresas mais maduras

- governanca de desconto;
- experimentos de preco;
- recomendacoes por segmento;
- elasticidade estimada;
- comparacao com concorrencia;
- simulacoes de margem e EBITDA.

## 6. Pilares Funcionais

### 6.1 Mapa de Rentabilidade

Objetivo: mostrar onde a empresa ganha e perde dinheiro.

Funcionalidades:

- margem por cliente;
- margem por contrato/projeto;
- margem por produto/SKU;
- margem por categoria;
- margem por canal;
- receita vs lucro;
- ranking dos mais lucrativos;
- ranking dos que mais faturam mas menos deixam lucro;
- status: saudavel, atencao, critico.

Leituras esperadas:

- "Cliente A fatura muito, mas tem margem baixa."
- "Servico B deveria ter reajuste."
- "Produto C vende bem, mas quase nao deixa margem."

### 6.2 Calculadora de Preco

Objetivo: permitir calcular preco minimo, preco alvo e margem real rapidamente.

Entradas:

- custo direto;
- impostos;
- taxa de cartao/gateway;
- comissao;
- frete/entrega;
- custo de producao;
- horas estimadas;
- custo/hora;
- margem desejada;
- desconto pretendido.

Saidas:

- preco minimo;
- preco recomendado;
- preco premium;
- margem bruta;
- margem liquida estimada;
- lucro por unidade/contrato;
- alerta de preco abaixo do minimo.

### 6.3 Price Waterfall

Objetivo: mostrar visualmente onde a margem some.

Estrutura:

```text
Preco tabela
- desconto comercial
- imposto
- comissao
- taxa de pagamento
- frete/custo operacional
- bonificacao/credito
= margem final
```

Uso:

- identificar desconto destrutivo;
- comparar preco tabela vs preco praticado;
- explicar perda de margem de forma simples;
- orientar reajustes.

### 6.4 Vazamento de Valor

Objetivo: detectar lucro perdido por preco, desconto, escopo e excecoes.

Funcionalidades:

- desconto total concedido no periodo;
- margem perdida por desconto;
- clientes que recebem desconto demais;
- vendedores que mais cedem margem;
- produtos vendidos abaixo da margem minima;
- contratos com escopo acima do contratado;
- horas nao cobradas;
- servicos com retrabalho recorrente;
- comparacao entre preco ideal e preco praticado.

Alertas:

- "R$ X de margem foi perdida por desconto este mes."
- "Cliente Y recebeu desconto acima da politica em 4 vendas."
- "Contrato Z consumiu 32% mais operacao do que o previsto."

### 6.5 Simulador de Preco e Crescimento

Objetivo: testar decisoes antes de aplicar.

Cenarios:

- aumentar preco em X%;
- reduzir desconto;
- mudar margem alvo;
- alterar custo;
- alterar imposto/taxa;
- perder volume;
- contratar mais uma pessoa;
- reajustar apenas clientes com margem baixa;
- reajustar apenas uma categoria;
- simular preco por segmento.

Saidas:

- impacto em receita;
- impacto em margem;
- impacto em lucro;
- impacto em caixa;
- impacto no ponto de equilibrio;
- comparacao cenario atual vs cenario simulado.

### 6.6 Clientes e Segmentos

Objetivo: entender quem paga bem, quem consome margem e quem aceita reajuste.

Funcionalidades:

- margem por cliente;
- ticket medio;
- desconto medio;
- frequencia de compra;
- historico de reajustes;
- sensibilidade estimada a preco;
- classificacao de cliente: premium, padrao, sensivel a preco, margem ruim;
- recomendacao de reajuste por cliente;
- lista de clientes que devem ser renegociados.

### 6.7 Produtos, Servicos e SKUs

Objetivo: dar estrutura para precificar produtos fisicos e servicos.

Campos base:

- nome;
- tipo: produto, servico, contrato, assinatura, SKU;
- categoria;
- preco de tabela;
- preco praticado;
- custo direto;
- custo variavel;
- impostos;
- taxas;
- comissao;
- margem minima;
- margem alvo;
- volume medio;
- canal;
- status.

Para servicos:

- horas estimadas;
- custo/hora;
- senioridade/time envolvido;
- escopo;
- recorrencia;
- capacidade operacional.

Para produtos:

- custo de compra/producao;
- frete;
- embalagem;
- taxa de canal;
- estoque ou disponibilidade;
- concorrentes relacionados.

### 6.8 Recomendacoes

Objetivo: transformar analise em acao.

Tipos de recomendacao:

- aumentar preco;
- reduzir desconto;
- revisar contrato;
- renegociar cliente;
- subir preco de categoria;
- parar de vender item de baixa margem;
- proteger preco minimo;
- testar reajuste com grupo pequeno;
- revisar custo ou fornecedor.

Exemplos:

- "Suba 6% no servico X. A margem esta 11 pontos abaixo da meta."
- "Cliente Y tem receita alta, mas margem baixa. Recomendado renegociar."
- "Produto Z vende muito, mas esta abaixo do preco minimo."
- "Desconto medio do vendedor A esta 2x acima do time."

### 6.9 Governanca Comercial

Objetivo: evitar que margem seja destruida por excecoes.

Funcionalidades:

- preco piso;
- preco alvo;
- desconto maximo;
- margem minima por produto/servico;
- aprovacao para excecao;
- justificativa obrigatoria;
- historico de aprovacoes;
- regras por vendedor, cliente, canal ou categoria;
- alçadas por valor ou margem.

### 6.10 Experimentos de Preco

Objetivo: testar preco com metodo antes de aplicar para todos.

Funcionalidades:

- criar experimento;
- escolher produtos/clientes/canais;
- definir preco antigo e novo;
- acompanhar volume, receita e margem;
- comparar com grupo de controle;
- decidir manter, reverter ou expandir;
- registrar aprendizado.

### 6.11 Concorrencia e Mercado

Objetivo: entender posicao competitiva sem virar apenas ferramenta de monitoramento.

Funcionalidades futuras:

- cadastro de concorrentes;
- preco concorrente manual ou importado;
- posicao: abaixo, igual, acima;
- historico de alteracao;
- alerta de mudanca;
- recomendacao de preservar margem ou competir por preco;
- monitoramento automatizado em fase avancada.

## 7. Estrutura do Produto

### Navegacao sugerida

```text
PricingOS
├─ Visao Geral
├─ Rentabilidade
├─ Calculadora
├─ Produtos e Servicos
├─ Clientes
├─ Descontos
├─ Simulador
├─ Recomendacoes
├─ Politicas de Preco
└─ Experimentos
```

### Visao Geral

Deve ter leitura executiva:

- margem media;
- lucro estimado;
- vazamento de valor do mes;
- itens abaixo da margem minima;
- clientes com margem critica;
- recomendacoes abertas;
- impacto potencial das recomendacoes.

### Rentabilidade

Tabela e graficos por:

- cliente;
- produto/servico;
- categoria;
- canal;
- vendedor;
- periodo.

### Calculadora

Fluxo rapido, sem obrigar cadastro.

Modos:

- calcular preco por margem desejada;
- calcular margem do preco atual;
- simular desconto;
- simular custo/taxa;
- transformar calculo em item cadastrado.

### Simulador

Experiencia semelhante a mesa de simulacao financeira, mas voltada para preco:

- cenario atual;
- cenario proposto;
- impacto em receita;
- impacto em margem;
- volume necessario;
- risco de perda de volume;
- recomendacao final.

## 8. Dados Necessarios

### Dados minimos para MVP

- cliente;
- produto/servico;
- preco praticado;
- custo direto ou estimado;
- imposto/taxa;
- desconto;
- volume ou quantidade;
- data;
- categoria.

### Dados desejaveis

- vendedor;
- canal;
- preco tabela;
- contrato;
- horas consumidas;
- custo/hora;
- historico de vendas;
- concorrente;
- motivo do desconto;
- aprovador.

### Fontes possiveis

- modulo financeiro;
- modulo operacional;
- importacao CSV/Excel;
- CRM;
- ERP;
- e-commerce;
- marketplace;
- nota fiscal;
- gateway de pagamento;
- planilhas manuais.

## 9. Relacao com Outros Modulos

### Financeiro

Fornece:

- despesas fixas;
- DRE;
- centro de custo;
- categorias;
- recebimentos;
- pagamentos;
- recorrencias;
- fluxo de caixa.

PricingOS usa isso para:

- ponto de equilibrio;
- rateio de custo fixo;
- impacto em caixa;
- simulacao de margem real.

### Operacoes

Fornece:

- horas;
- equipe;
- agenda;
- atividades;
- clientes;
- contratos/projetos;
- consumo operacional.

PricingOS usa isso para:

- custo real por cliente;
- margem por contrato;
- escopo excedido;
- hora nao cobrada;
- cliente que consome demais.

## 10. MVP Vendavel

Objetivo do MVP:

> Permitir que uma pequena empresa veja margem real por cliente/produto/servico, calcule preco recomendado e identifique vazamento de desconto.

Escopo recomendado:

- cadastro/importacao simples de produtos e servicos;
- cadastro de clientes ou vinculacao aos clientes existentes;
- preco atual, custo, imposto, taxa e desconto;
- margem atual e margem alvo;
- calculadora de preco;
- mapa de rentabilidade;
- ranking de margem;
- vazamento de valor por desconto;
- simulador de reajuste simples;
- recomendacoes basicas;
- exportacao CSV.

Fora do MVP:

- monitoramento automatico de concorrencia;
- elasticidade avancada;
- experimentos com grupo de controle;
- aprovacao complexa;
- API publica;
- repricing automatico.

## 11. Roadmap

### Fase 1 - Fundacao de Margem

- produtos e servicos;
- custos, taxas e impostos;
- margem atual e margem alvo;
- calculadora de preco;
- preco minimo e recomendado;
- mapa de rentabilidade inicial.

### Fase 2 - Clientes e Contratos

- margem por cliente;
- margem por contrato/projeto;
- custo/hora para servicos;
- escopo consumido vs contratado;
- clientes com baixa margem;
- recomendacoes de renegociacao.

### Fase 3 - Vazamento de Valor

- desconto por cliente;
- desconto por vendedor;
- desconto por produto;
- margem perdida;
- price waterfall;
- alerta de preco abaixo do minimo;
- regras de margem minima.

### Fase 4 - Simulacoes e Recomendacoes

- aumento de preco;
- reducao de desconto;
- perda de volume simulada;
- impacto no lucro;
- impacto no caixa;
- ranking de acoes com maior impacto;
- recomendacoes priorizadas.

### Fase 5 - Governanca

- preco piso, alvo e premium;
- aprovacao de desconto;
- justificativa obrigatoria;
- trilha de auditoria;
- regras por cliente, produto, categoria, canal e vendedor.

### Fase 6 - Produtos/SKUs Avancado

- catalogo robusto;
- margem por SKU;
- custos variaveis por canal;
- concorrentes;
- importacao de vendas;
- monitoramento de preco concorrente manual/importado.

### Fase 7 - Pricing Intelligence

- elasticidade estimada;
- experimentos de preco;
- recomendacao por segmento;
- deteccao de oportunidade de aumento;
- simulacao de mix de produtos;
- AI para leitura de padroes.

## 12. Metricas de Sucesso

### Para o usuario

- margem media aumentou;
- desconto medio caiu;
- preco abaixo do minimo reduziu;
- contratos ruins foram renegociados;
- lucro subiu sem aumento proporcional de vendas;
- tempo para calcular preco caiu.

### Para o produto

- usuarios que cadastram itens;
- usuarios que usam calculadora;
- recomendacoes aceitas;
- cenarios simulados;
- itens com margem configurada;
- empresas que conectam dados reais;
- expansao para plano Growth/Pro.

## 13. Packaging Comercial

### PricingOS Starter

Para pequena empresa que quer precificar melhor.

Inclui:

- calculadora;
- produtos e servicos;
- margem;
- preco minimo;
- ponto de equilibrio;
- simulador simples.

### PricingOS Growth

Para empresa em crescimento que precisa ver lucro por cliente e contrato.

Inclui:

- clientes;
- contratos;
- vazamento de desconto;
- mapa de rentabilidade;
- recomendacoes;
- simulador de reajuste.

### PricingOS Pro

Para empresa com operacao comercial mais madura.

Inclui:

- SKUs;
- price waterfall avancado;
- governanca de desconto;
- politicas de preco;
- experimentos;
- concorrencia;
- integracoes.

## 14. Diferenciais Potenciais

- linguagem simples para dono de empresa;
- conexao com financeiro e operacoes;
- margem por cliente/contrato, nao apenas por SKU;
- foco em lucro escondido;
- simulacao antes da decisao;
- recomendacoes praticas;
- caminho de pequena empresa ate empresa madura;
- produto independente, mas com mais poder quando usado junto aos outros modulos.

## 15. Riscos

- virar cadastro pesado demais;
- depender de dados que pequena empresa nao tem;
- prometer elasticidade antes de ter historico suficiente;
- competir cedo demais com ferramentas de e-commerce/repricing;
- misturar contabilidade, financeiro e pricing em uma tela confusa;
- gerar recomendacoes sem explicar a logica.

Mitigacoes:

- MVP com entrada manual/importacao simples;
- explicar cada recomendacao;
- comecar por margem e vazamento, nao por AI;
- deixar SKU/concorrencia para fases posteriores;
- manter fluxos rapidos e visuais;
- permitir uso separado do Financeiro, mas potencializar integracao.

## 16. Perguntas para Aprofundar

1. O go-to-market inicial sera servicos B2B, produtos/SKUs ou um nicho hibrido?
2. PricingOS deve usar dados do Financeiro automaticamente ou permitir operacao 100% independente por importacao?
3. O MVP deve focar em margem por cliente ou margem por item?
4. Como tratar custo fixo rateado sem gerar complexidade demais?
5. Quais integracoes seriam mais importantes primeiro: planilha, CRM, e-commerce, ERP ou nota fiscal?
6. O produto deve recomendar preco automaticamente ou apenas mostrar oportunidade?
7. A primeira versao deve incluir governanca de desconto ou deixar para Growth/Pro?
8. Qual nome comercial final: PricingOS, Rentabilidade, Preco Inteligente ou outro?

## 17. Decisao Atual

PricingOS fica registrado como modulo/produto independente em exploracao.

Direcao recomendada neste momento:

- manter o Financeiro focado em caixa, contas, DRE, simulacao e controle;
- criar dentro do Financeiro apenas funcionalidades simples de rentabilidade se necessario;
- desenhar PricingOS como modulo proprio, com potencial de venda separada;
- iniciar aprofundamento pelo ICP de empresas de servico B2B, sem excluir produtos/SKUs do roadmap.

