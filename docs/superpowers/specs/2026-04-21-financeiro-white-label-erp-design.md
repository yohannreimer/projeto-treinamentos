# Design: Financeiro White-Label ERP (V1 PME, SaaS Modular, Premium)

## 1. Resumo executivo
Este design redefine o módulo financeiro como um **ERP financeiro white-label** dentro do produto, pensado desde o dia 1 para **qualquer PME**, e não como uma extensão do contexto operacional da Holand.

O produto passa a ser entendido como um **SaaS modular** com múltiplos workspaces:
- `Orquestrador`: gestão operacional de equipes e entregas técnicas.
- `Financeiro`: ERP financeiro da empresa logada.

O módulo financeiro deve funcionar como **quase outro aplicativo dentro do mesmo produto**:
- com navegação própria;
- com vocabulário próprio;
- com prioridades próprias;
- com UX própria;
- sem depender mentalmente do orquestrador.

Objetivo do V1:
- entregar um financeiro usável por qualquer PME sem depender de planilha;
- ter profundidade suficiente para parecer produto sério desde a primeira impressão;
- manter estrutura pronta para evoluir para fiscal Brasil, integrações e comercialização futura.

## 2. Visão de produto
O módulo financeiro será vendido e percebido como um produto SaaS de ERP financeiro.

Modelo mental aprovado:
- a empresa logada entra no **financeiro dela**;
- não existe “selecionar qual empresa financeira ver” dentro do mesmo workspace;
- clientes, fornecedores e demais partes são **cadastros internos do financeiro**, não contexto estrutural do módulo;
- Holand é somente o primeiro uso real, não a linguagem-base do produto.

Em termos de mercado, a referência é:
- simplicidade operacional de **Conta Azul**;
- disciplina estrutural de **ERPNext** / **BigCapital**;
- acabamento visual e clareza de uso em nível premium.

## 3. Princípios de domínio
### 3.1 Tenant
- O tenant principal é a **empresa logada**.
- O financeiro sempre opera no contexto dessa empresa.
- O usuário não escolhe “qual empresa está vendo” ao navegar internamente no módulo.

### 3.2 Entidades externas
Clientes, fornecedores e similares são entidades internas do financeiro.

Essas entidades:
- participam de lançamentos;
- aparecem em contas a pagar/receber;
- aparecem em filtros e relatórios;
- não definem a arquitetura principal do módulo.

### 3.3 Separação entre módulos
O `Financeiro` e o `Orquestrador` são módulos separados do mesmo SaaS.

Eles compartilham:
- autenticação;
- empresa logada;
- usuários;
- permissões;
- shell global do produto.

Eles não compartilham:
- navegação interna;
- modelo mental;
- prioridades de uso;
- linguagem operacional.

Integrações entre eles são futuras vantagens do ecossistema, não dependências do núcleo.

## 4. Benchmark e posicionamento
### 4.1 Conta Azul
Pontos a absorver:
- foco no dia a dia;
- clareza para PME;
- rotinas de pagar/receber/conciliação bem evidentes;
- leitura rápida de saúde financeira.

### 4.2 ERPNext
Pontos a absorver:
- modelagem séria;
- estrutura robusta de cadastros e processos;
- profundidade para crescer sem retrabalho.

### 4.3 BigCapital
Pontos a absorver:
- disciplina de arquitetura financeira;
- separação limpa de camadas;
- visão de produto que não mistura UI com modelagem do domínio.

### 4.4 Diferencial do nosso produto
O diferencial não será “mais um ERP genérico”.

O diferencial será:
- UX mais clara;
- produto mais bonito;
- navegação mais leve;
- números sempre explicáveis por drill-down;
- modularidade real;
- base pronta para integrar com outros workspaces depois.

## 5. Navegação principal aprovada
Sidebar do módulo financeiro V1:
1. `Visão Geral`
2. `Movimentações`
3. `Contas a Receber`
4. `Contas a Pagar`
5. `Conciliação`
6. `Fluxo de Caixa`
7. `Relatórios`
8. `Cadastros`

Esta navegação segue a lógica de um ERP financeiro clássico e neutro para PME.

## 6. Home do módulo: Executive Overview
### 6.1 Direção aprovada
Home com estrutura:
- `Executive Overview`
- layout `Split control`

Isso significa:
- leitura executiva e operação convivendo na mesma primeira tela;
- sem parecer dashboard vazio;
- sem parecer painel operacional caótico.

### 6.2 Estrutura da home
#### Bloco 1: Leitura executiva
Faixa de KPIs puros, sem narrativa longa.

KPIs principais:
- saldo em conta;
- a receber;
- a pagar;
- resultado projetado do período.

KPIs secundários:
- faturamento do mês;
- despesas do mês;
- atrasos;
- pendências de conciliação.

#### Bloco 2: Fila operacional
Bloco dedicado a ação imediata:
- vencendo hoje;
- atrasados;
- sem conciliar;
- sem categoria;
- pendências críticas com CTA.

#### Bloco 3: Fluxo principal
Gráfico principal com visão temporal:
- 30 dias;
- 60 dias;
- 90 dias;
- entradas vs saídas;
- saldo acumulado.

#### Bloco 4: Ações rápidas
Atalhos para:
- nova receita;
- nova despesa;
- importar extrato;
- conciliar;
- abrir vencimentos.

### 6.3 Filosofia da home
A home precisa parecer:
- executiva na leitura;
- operacional na ação;
- confiável no número;
- premium no acabamento.

Ela não deve parecer:
- um clone literal de Conta Azul;
- uma tela improvisada do orquestrador;
- um dashboard genérico de template.

## 7. Papel de cada tela
### 7.1 Visão Geral
Tela inicial do módulo.

Objetivo:
- mostrar saúde financeira;
- apontar o que exige ação;
- servir de ponte entre gestão e operação.

### 7.2 Movimentações
Ledger central do módulo.

Objetivo:
- concentrar toda entrada, saída, ajuste, transferência e baixa;
- funcionar como a base operacional e auditável do sistema.

Capacidades:
- filtros por período, status, tipo, conta, categoria e entidade;
- criação manual de lançamentos;
- edição controlada;
- exclusão auditável;
- drill-down por impacto.

### 7.3 Contas a Receber
Objetivo:
- controlar cobrança, recebimento, vencimentos e inadimplência.

Capacidades:
- títulos abertos;
- vencendo hoje;
- próximos vencimentos;
- vencidos;
- recebidos;
- baixa parcial;
- renegociação;
- desconto, multa e juros;
- vínculo com cliente.

### 7.4 Contas a Pagar
Objetivo:
- controlar obrigações e previsibilidade de saída.

Capacidades:
- vencendo;
- atrasados;
- pagos;
- pagamento parcial;
- reagendamento;
- observações internas;
- vínculo com fornecedor.

### 7.5 Conciliação
Objetivo:
- transformar extrato bancário em operação confiável.

Capacidades:
- importação de extrato;
- staging de itens;
- sugestões de match;
- confirmação/rejeição/ignorar;
- fila de pendências;
- trilha auditável.

### 7.6 Fluxo de Caixa
Objetivo:
- dar visão temporal da saúde financeira.

Capacidades:
- visão 30/60/90 dias;
- saldo acumulado;
- entradas previstas;
- saídas previstas;
- leitura por conta;
- leitura por categoria;
- comparação entre cenário atual e confirmado.

### 7.7 Relatórios
Objetivo:
- entregar leitura gerencial útil sem inflar o produto com excesso de relatórios pouco usados.

Relatórios V1 aprovados:
- realizado vs projetado;
- receitas por categoria;
- despesas por categoria;
- contas a receber vencidas;
- contas a pagar vencidas;
- fluxo consolidado por período;
- DRE gerencial.

### 7.8 Cadastros
Objetivo:
- sustentar a operação sem disputar protagonismo com o núcleo financeiro.

Itens:
- entidades;
- contas financeiras;
- categorias;
- centros de custo;
- formas de pagamento;
- preferências e regras do módulo.

## 8. Modelo de cadastro de entidades
Decisão aprovada: **modelo híbrido**.

### 8.1 Camada de dados
Base única de entidades, com tipo:
- cliente;
- fornecedor;
- ambos;
- extensível no futuro.

### 8.2 Camada de interface
Na UI, o usuário pode visualizar por recortes:
- clientes;
- fornecedores;
- todos.

### 8.3 Motivo da decisão
Esse modelo:
- evita duplicação;
- suporta empresas que são cliente e fornecedor ao mesmo tempo;
- escala melhor;
- mantém UX simples e base sólida.

## 9. Arquitetura funcional do V1
### 9.1 Núcleo
`Movimentações` é o núcleo do módulo.

Toda lógica estrutural deve conversar com esse centro:
- contas a pagar;
- contas a receber;
- conciliação;
- fluxo de caixa;
- relatórios.

### 9.2 Relatórios derivados, não paralelos
Relatórios não devem nascer como tabelas manuais paralelas.

Eles precisam ser derivados de:
- lançamentos;
- títulos;
- categorias;
- contas;
- períodos;
- baixas;
- conciliações.

### 9.3 DRE gerencial
O DRE gerencial nasce da classificação correta de receitas e despesas.

Ele depende de:
- categorias bem modeladas;
- estrutura consistente de competência;
- distinção clara entre entradas/saídas reais e projeções.

### 9.4 Conciliação
Conciliação é camada operacional sobre:
- extrato importado;
- lançamentos existentes;
- ações manuais do usuário.

### 9.5 Fluxo de caixa
Fluxo de caixa é leitura temporal derivada de:
- títulos;
- baixas;
- datas de vencimento;
- projeções;
- status confirmados.

## 10. Direção de UX/UI
### 10.1 Premissa visual
O financeiro deve parecer um produto premium de ERP SaaS.

Não deve parecer:
- painel interno adaptado;
- extensão da carteira de clientes;
- reaproveitamento visual do orquestrador técnico.

### 10.2 Tom visual
Direção aprovada:
- limpa;
- executiva;
- precisa;
- mais próxima de um SaaS financeiro maduro do que de um dashboard experimental.

### 10.3 Comportamento esperado da interface
- leitura rápida de números;
- poucas distrações;
- navegação previsível;
- densidade profissional;
- filtros fortes nas telas operacionais;
- home muito clara e vendedora.

### 10.4 Regra de confiança
Todo número importante deve ter drill-down.

Se o usuário vê:
- saldo;
- faturamento;
- valor projetado;
- despesa;
- resultado;

ele precisa conseguir abrir a origem daquele número.

## 11. Escopo V1 e não-objetivos
### 11.1 V1 inclui
- visão geral executiva;
- movimentações;
- contas a pagar;
- contas a receber;
- conciliação;
- fluxo de caixa;
- relatórios listados;
- DRE gerencial;
- cadastros-base.

### 11.2 V1 não inclui como protagonismo
- fiscal Brasil ativo;
- SPED;
- emissão fiscal nativa;
- automações muito avançadas;
- contabilidade pesada completa;
- dependência do módulo operacional.

## 12. Critérios de sucesso do V1
O V1 será considerado certo se:
- uma PME conseguir operar sem planilha como fonte principal;
- o módulo fizer sentido sem conhecer a Holand;
- a experiência parecer SaaS financeiro de verdade;
- o usuário conseguir lançar, pagar, receber, conciliar e analisar;
- o DRE gerencial for confiável;
- o fluxo de caixa for útil;
- o módulo existir autonomamente em relação ao orquestrador.

## 13. Estratégia de evolução
### 13.1 Depois do V1
Possíveis extensões:
- fiscal Brasil;
- emissão de nota;
- automações;
- integrações bancárias;
- integrações com módulos do ecossistema;
- integrações comerciais;
- expansões por vertical.

### 13.2 Regra para evolução
O núcleo do financeiro deve permanecer:
- neutro;
- white-label;
- ERP-first;
- independente do orquestrador.

## 14. Decisões aprovadas nesta rodada
1. O financeiro é um app quase separado dentro do SaaS.
2. O produto deve ser neutro para qualquer PME desde o dia 1.
3. A navegação principal será:
   - Visão Geral
   - Movimentações
   - Contas a Receber
   - Contas a Pagar
   - Conciliação
   - Fluxo de Caixa
   - Relatórios
   - Cadastros
4. A home será:
   - `Executive Overview`
   - layout `Split control`
5. A leitura executiva da home será baseada em KPIs, não em texto narrativo.
6. O cadastro de entidades será híbrido:
   - base única;
   - leitura separada por cliente/fornecedor na UI.
7. Relatórios do V1 incluem:
   - realizado vs projetado
   - receitas por categoria
   - despesas por categoria
   - contas a receber vencidas
   - contas a pagar vencidas
   - fluxo consolidado por período
   - DRE gerencial
