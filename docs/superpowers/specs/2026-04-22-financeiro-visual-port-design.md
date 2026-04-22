# Design: Port Visual Completo do Financeiro (`finance 2` como fonte de verdade)

## 1. Resumo
Este design define o **port visual completo** do módulo `Financeiro` para a linguagem do material em `/Users/yohannreimer/Downloads/finance 2`, tratado como **fonte de verdade visual** para todas as páginas do módulo.

O objetivo não é “se inspirar” no arquivo. O objetivo é:
- portar o design system visual dele;
- reproduzir a hierarquia, densidade, tipografia, ritmo e composição;
- aplicar essa linguagem a todas as páginas reais do financeiro;
- preservar os dados, permissões, rotas e estados reais do sistema.

Em outras palavras:
- **fidelidade visual alta** ao material enviado;
- **fidelidade funcional** ao backend já existente.

## 2. Regra principal
O arquivo `finance 2` passa a ser a referência oficial de:
- shell do módulo financeiro;
- tipografia;
- paleta base;
- sistema de cards;
- tabelas;
- painéis laterais;
- filtros;
- espaçamento;
- badges;
- linguagem visual das páginas.

Ele **não** será fonte de verdade para:
- mock data;
- textos de exemplo específicos;
- modelo de navegação entre produtos fora do financeiro;
- lógica fake de criação/edição;
- painel de tweaks/debug presente no protótipo.

## 3. Interpretação de “quero que fique realmente igual”
“Igual” significa:
- mesma sensação visual;
- mesma arquitetura de composição;
- mesma família tipográfica;
- mesma relação entre fundo, superfície, borda e destaque;
- mesma hierarquia de títulos, eyebrow, meta e conteúdo;
- mesma cadência de cards e tabelas;
- mesma sobriedade premium de ERP financeiro.

“Igual” **não** significa:
- copiar literais do mock;
- forçar comportamentos inexistentes no sistema real;
- esconder estados reais de loading/erro/vazio;
- introduzir dados falsos;
- colar o protótipo por cima sem integrar ao domínio real.

## 4. Fonte visual oficial extraída do material

### 4.1 Tipografia
O módulo financeiro passa a usar:
- `DM Sans` como tipografia principal;
- `DM Mono` para:
  - valores monetários;
  - datas operacionais;
  - identificadores e números de referência.

Isso vale para o módulo financeiro inteiro, sem depender da tipografia do orquestrador.

### 4.2 Paleta base
Base aprovada:
- fundo do módulo: `#f1f5f9`
- superfícies: `#ffffff`
- borda estrutural: `#e2e8f0`
- texto forte: `#0f172a`
- texto médio: `#64748b`
- texto suave: `#94a3b8`

Accent principal do port:
- `#ea580c`

Uso do accent:
- eyebrow;
- CTAs principais;
- estado ativo de navegação;
- pequenos indicadores de destaque.

O accent não deve contaminar a tela inteira.

### 4.3 Borda, raio e sombra
Sistema visual:
- raio padrão dos painéis: `10px`
- raio de controles pequenos: `7px`
- borda padrão: `1px solid #e2e8f0`
- sombra mínima ou inexistente

O módulo deve parecer:
- limpo;
- preciso;
- editorial;
- executivo.

Não deve parecer:
- glassmorphism;
- gradiente decorativo;
- card inflado;
- dashboard “AI slop”.

### 4.4 Densidade e respiro
O material `finance 2` usa densidade média controlada.

O financeiro real deve seguir:
- padding externo confortável no workspace;
- espaçamento consistente de `10–12–16–20–28`;
- cabeçalhos com respiração maior;
- tabelas compactas, mas não esmagadas;
- sidebar enxuta e estável.

## 5. Shell do módulo

### 5.1 Estrutura aprovada
O módulo financeiro terá:
- sidebar própria do financeiro;
- área principal com fundo `slate` claro;
- container central largo com respiro;
- páginas independentes do shell do orquestrador.

### 5.2 Sidebar
O shell deve ficar visualmente igual ao protótipo em:
- largura;
- hierarquia;
- agrupamento;
- espaçamento;
- estilo dos itens;
- rodapé de retorno.

Estrutura:
- rótulo pequeno do módulo;
- nome da empresa logada;
- texto curto de contexto;
- bloco de contexto da organização;
- navegação vertical principal;
- ação de voltar ao sistema no rodapé.

### 5.3 Estado ativo da sidebar
Itens ativos devem seguir o padrão do protótipo:
- fundo sutil;
- acento controlado;
- peso tipográfico maior;
- sem efeito chamativo excessivo.

## 6. Componentes visuais que serão portados

### 6.1 PageHeader
Padrão obrigatório:
- eyebrow pequena uppercase com accent;
- título forte;
- descrição curta;
- meta box à direita quando fizer sentido.

Esse padrão deve ser consistente entre:
- visão geral;
- movimentações;
- receber;
- pagar;
- conciliação;
- fluxo;
- relatórios;
- cadastros.

### 6.2 KPI cards
Características obrigatórias:
- fundo branco;
- borda leve;
- número forte em `DM Mono`;
- rótulo pequeno em uppercase;
- descrição curta;
- detalhe/accent mínimo no canto ou base.

### 6.3 Cards e painéis
Padrão:
- painéis brancos;
- borda leve;
- radius de `10px`;
- sem decoração infantil;
- sem gradientes vistosos;
- sem sombras pesadas.

### 6.4 Tabelas
Padrão:
- cabeçalho pequeno uppercase;
- linhas limpas;
- hover sutil;
- seleção clara;
- números alinhados e em mono quando necessário.

### 6.5 Badges e status
Padrão:
- badges menores;
- secos;
- tipografia consistente;
- cor usada com moderação;
- status visualmente informativo sem parecer chip de app mobile.

### 6.6 Filtros e formulários
Padrão:
- inputs claros, compactos e com raio pequeno;
- labels discretas;
- agrupamento limpo;
- grid racional;
- sem excesso de caixas dentro de caixas.

## 7. Tradução por página

### 7.1 Visão Geral
Será a página com maior fidelidade direta ao protótipo.

Deve reproduzir:
- grid de KPIs;
- split principal entre fluxo e fila operacional;
- ações rápidas;
- page header no mesmo tom.

Mudança necessária:
- trocar mock data por dados reais do módulo.

### 7.2 Movimentações
Manterá o ledger real já existente, mas com casca visual do protótipo.

Portar:
- filtros no topo;
- cards resumo;
- tabela principal;
- painel lateral de detalhe;
- CTA de novo lançamento.

### 7.3 Contas a Receber
Deve seguir o padrão do protótipo para leitura operacional:
- resumo superior;
- filtros leves;
- lista/tabela principal;
- painel lateral de ação e detalhe.

### 7.4 Contas a Pagar
Mesmo sistema visual de Receber, mudando apenas o domínio da tela.

### 7.5 Conciliação
Deve ficar visualmente o mais próximo possível da página `reconciliation.jsx` do material:
- radar superior;
- inbox principal;
- buckets/tabs;
- cards laterais de apoio;
- linguagem de “inbox operacional”.

### 7.6 Fluxo de Caixa
Deve herdar:
- page header;
- cards executivos;
- gráficos compactos;
- painéis de leitura por janela;
- padrão visual dos números do protótipo.

### 7.7 Relatórios
Deve subir de nível visual para o mesmo padrão:
- header editorial;
- cards de leitura;
- blocos claros por relatório;
- `DRE gerencial` como bloco nobre;
- restante dos relatórios no mesmo sistema visual.

### 7.8 Cadastros
Deve abandonar qualquer visual administrativo genérico.

Deve adotar:
- header igual ao sistema novo;
- listas/tabelas limpas;
- filtros discretos;
- formulários com o mesmo design system;
- leitura separada por `Todos / Clientes / Fornecedores` mantendo a base híbrida por trás.

## 8. O que será adaptado e o que será preservado

### 8.1 Preservado do sistema real
- rotas reais;
- permissões;
- endpoints;
- estados reais;
- dados reais;
- loading;
- erro;
- vazio;
- contratos do backend;
- organização logada como tenant.

### 8.2 Adaptado do protótipo
- layout;
- estilo dos componentes;
- distribuição espacial;
- linguagem de cards;
- composição visual;
- ritmo da navegação;
- acabamento tipográfico.

## 9. Regras de implementação

### 9.1 Não misturar com o orquestrador
O financeiro deve parecer:
- um módulo premium próprio;
- quase outro produto dentro do mesmo SaaS.

Não deve parecer:
- uma área reaproveitada do orquestrador;
- uma tela interna adaptada com sidebar ao lado.

### 9.2 Não inventar nova linguagem
Durante esse port, a equipe não deve:
- criar um terceiro estilo;
- misturar o protótipo com padrões antigos do financeiro;
- manter metade da interface antiga por conveniência.

A prioridade é coerência visual do módulo inteiro.

### 9.3 Fidelidade visual
Quando houver dúvida entre:
- “ficar mais parecido com o protótipo”
- “manter detalhe visual antigo do app”

A decisão deve favorecer:
- o protótipo enviado pelo usuário

desde que:
- não quebre o domínio;
- não mascare estados reais;
- não exija lógica inexistente.

## 10. Critério de sucesso
O port estará correto quando:
- o módulo financeiro parecer visualmente o mesmo produto do material `finance 2`;
- todas as páginas do financeiro compartilharem a mesma linguagem;
- o usuário olhar para `Visão Geral`, `Movimentações`, `Receber`, `Pagar`, `Conciliação`, `Fluxo`, `Relatórios` e `Cadastros` e reconhecer um único design system;
- o módulo deixar de parecer um apêndice do orquestrador;
- a fidelidade visual estar alta o suficiente para o usuário dizer “ficou realmente igual”.

## 11. Escopo imediato de execução
O port visual será aplicado nesta ordem:
1. shell e tokens do módulo;
2. `Visão Geral`;
3. `Movimentações`;
4. `Contas a Receber`;
5. `Contas a Pagar`;
6. `Conciliação`;
7. `Fluxo de Caixa`;
8. `Relatórios`;
9. `Cadastros`;
10. passe final de consistência visual.

## 12. Fora de escopo neste passo
Não faz parte deste design:
- redesenhar o domínio do financeiro novamente;
- mudar a navegação aprovada do módulo;
- reabrir discussão de arquitetura funcional;
- integrar novos módulos;
- adicionar novas features só porque o protótipo mostra uma versão simplificada.

O foco aqui é:
- **port visual fiel**
- sobre o **financeiro real**
- já existente.
