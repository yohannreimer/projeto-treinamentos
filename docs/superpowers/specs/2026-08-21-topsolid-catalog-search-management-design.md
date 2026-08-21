# Busca, hierarquia e administração compartilhada do catálogo TopSolid

**Data:** 2026-08-21  
**Status:** desenho aprovado

## Relação com o desenho anterior

Esta especificação complementa `2026-08-21-topsolid-software-catalog-design.md`.
Ela preserva o catálogo de 450 produtos, a prévia lateral, os serviços e
treinamentos separados, o salvamento manual e a reabertura de propostas.

Esta aprovação substitui especificamente a decisão anterior que deixava o
editor administrativo da lista oficial de preços fora de escopo. O catálogo de
software passa a aceitar criação, edição e arquivamento compartilhados.

## Objetivos

- fazer pesquisas por termos naturais, mesmo quando nomes contêm apóstrofos,
  acentos, hífens ou palavras separadas;
- apresentar os resultados sem perder a relação entre família, subfamília e
  produto;
- colocar os produtos principais antes de extensões e itens complementares em
  todas as famílias;
- permitir que qualquer usuário da organização crie, edite e arquive produtos
  diretamente no aplicativo;
- preservar integralmente o conteúdo e os valores das propostas já salvas.

## Decisões aprovadas

- A pesquisa será global e os resultados serão agrupados por família e
  subfamília.
- Todas as famílias terão a ordem **Todos**, **Produtos principais** e depois as
  demais subfamílias.
- Em Design, os quatro produtos-base identificados na lista de preços serão
  tratados como produtos principais:
  - `TopSolid'Design 7 Standard - Módulo (0010 + 0011)`;
  - `TopSolid'Design 7 Standard Pro Módulo (0010 + 0011 + 0012)`;
  - `TopSolid’Design Standard 7 - Módulo - 0020`;
  - `TopSolid’Design Pro 7 - Módulo - 0030`.
- A seleção de extensões não produzirá aviso, bloqueio ou inclusão automática
  de produto-base. A hierarquia será informativa.
- Todos os usuários autenticados da organização poderão criar, editar e
  arquivar produtos.
- Mudanças no catálogo serão compartilhadas com todos os usuários da mesma
  organização.
- A exclusão será lógica: o item deixará de aparecer para novas propostas, mas
  continuará preservado em propostas antigas.
- Mudanças de cadastro ou preço valerão para novas inclusões. Propostas já
  salvas e itens já incluídos no rascunho continuarão usando seus snapshots.

## Hierarquia do catálogo

### Produtos principais

Cada família terá uma classificação explícita e versionada dos produtos
principais. A classificação será feita por identificadores estáveis, não por
inferência do texto do produto. Isso evita que uma extensão seja promovida por
conter palavras como “Design”, “Mold” ou “Pro”.

No explorador, a navegação de cada família seguirá esta ordem:

1. **Todos**;
2. **Produtos principais**;
3. demais subfamílias em sua ordem comercial definida;
4. pastas de terceiro nível, quando existirem.

Produtos principais que hoje estejam classificados como PDM ou em outra
subfamília serão apresentados em **Produtos principais**, sem duplicação. O
arquivo original importado continua imutável; uma camada de classificação do
aplicativo corrige a apresentação.

Se uma família receber produtos novos sem classificação explícita, eles
permanecerão na subfamília cadastrada. A ausência de classificação nunca deverá
promover um item automaticamente.

## Comportamento da pesquisa

### Normalização

Consulta e conteúdo serão normalizados da mesma maneira:

- conversão para minúsculas;
- remoção de acentos;
- apóstrofos retos ou tipográficos tratados como separadores;
- hífens, barras, parênteses e demais pontuação tratados como separadores;
- espaços repetidos reduzidos a um;
- consulta dividida em termos independentes.

Um item corresponderá quando todos os termos pesquisados estiverem presentes no
conjunto formado por código, nome, descrição, família, subfamília e pasta,
independentemente de estarem lado a lado. Por isso, `TopSolid Design Standard`
encontrará nomes escritos como `TopSolid’Design Standard`.

### Relevância

Os resultados serão ordenados de forma determinística nesta prioridade:

1. código exato;
2. nome exato normalizado;
3. nome começando pelos termos pesquisados;
4. todos os termos presentes no nome;
5. termos presentes em caminho ou descrição;
6. nome em ordem alfabética como desempate.

Um produto principal deve aparecer antes de extensões quando ambos tiverem a
mesma relevância dentro do mesmo grupo.

### Apresentação dos resultados

Enquanto houver texto na busca, os filtros de família e subfamília deixam de
limitar a consulta, mas a hierarquia continua visível. A tela mostra blocos na
ordem:

- família;
- subfamília, com **Produtos principais** primeiro;
- cards ordenados por relevância.

Cada card mantém o caminho do produto, seu código, nome, descrição, preço e
estado de seleção. O limite progressivo de resultados continua existindo para
evitar renderizar centenas de cards de uma só vez, sem cortar silenciosamente o
conteúdo: a interface informa a contagem total e oferece **Mostrar mais**.

## Administração dentro do aplicativo

### Ações no catálogo

O cabeçalho do explorador terá o botão **+ Novo produto**. Cada card terá um
botão de três pontos (`⋯`) com a ação **Editar**. Os controles devem continuar
acessíveis por teclado e possuir rótulos explícitos para leitores de tela.

O modal de criação e edição conterá:

- nome, obrigatório;
- código;
- descrição ou informações;
- família, obrigatória;
- subfamília, obrigatória;
- pasta ou terceiro nível, opcional;
- valor unitário em USD, numérico e não negativo;
- classificação como produto principal ou produto comum.

Na edição, o modal terá a ação destrutiva **Excluir produto**. Antes de confirmar,
a interface explicará que o produto será removido apenas do catálogo ativo e
continuará nas propostas antigas. O botão final será **Ocultar produto** para
descrever corretamente o efeito.

O modal só fechará depois da confirmação do servidor. Durante a operação, as
ações ficarão desabilitadas para evitar envios duplicados. Em caso de erro, os
campos digitados permanecerão preenchidos e uma mensagem clara será exibida.

### Escopo e concorrência

O catálogo será compartilhado por `organization_id`, seguindo o isolamento já
usado pelas propostas e pelos módulos de serviço. “Todos os usuários” significa
todos os usuários autenticados da mesma organização, não usuários de outras
organizações.

Não haverá uma permissão administrativa adicional nesta fase. Em edições
simultâneas, a última gravação aceita pelo servidor prevalece. Após criar,
editar ou arquivar, o frontend substituirá seu estado pelo registro retornado
pela API.

## Persistência

### Fonte oficial e sobreposições

Os 450 registros gerados da planilha continuam sendo a base versionada do
catálogo. Uma tabela compartilhada no backend armazenará:

- produtos criados dentro do aplicativo;
- valores e metadados que sobrepõem um produto oficial;
- o estado arquivado de produtos oficiais ou criados;
- autoria e datas de criação e atualização.

Para um produto oficial sem registro compartilhado, o frontend usa o valor da
base versionada. Quando houver uma sobreposição compartilhada, ela prevalece.
Um produto arquivado não entra na navegação nem na pesquisa de novas propostas.

Essa estratégia evita editar o arquivo gerado da planilha durante a execução e
faz as mudanças sobreviverem a novas imagens Docker e novos deploys.

### Contrato da API

A API autenticada do catálogo de produtos oferecerá operações equivalentes a:

- listar produtos criados, sobreposições e arquivamentos da organização;
- criar um produto compartilhado;
- criar ou atualizar a sobreposição de um produto oficial;
- atualizar um produto criado;
- arquivar um produto oficial ou criado.

Todas as escritas validarão os campos no servidor. Identificadores oficiais
permanecerão estáveis; novos produtos receberão identificadores gerados pelo
backend.

### Compatibilidade com propostas

A proposta salva continua armazenando snapshots dos produtos selecionados. Ao
reabrir uma proposta:

- nome, descrição, quantidade, preço e manutenção vêm do snapshot salvo;
- um produto arquivado ainda aparece normalmente naquela proposta;
- editar o catálogo não altera o total de uma proposta histórica;
- voltar ao catálogo e adicionar novamente um produto usa a versão compartilhada
  vigente naquele momento.

O snapshot começa no momento da inclusão no rascunho, não apenas no salvamento.
Se alguém editar o catálogo enquanto outra pessoa prepara uma proposta, os itens
que já estavam selecionados não mudam silenciosamente. Remover o item do rascunho
e adicioná-lo novamente captura a versão compartilhada mais recente.

As edições específicas de uma proposta continuam separadas das edições globais
do catálogo.

## Estados da interface

- **Carregando:** o catálogo oficial pode ser mostrado com indicação de que as
  alterações compartilhadas ainda estão sendo carregadas.
- **Falha ao carregar sobreposições:** mantém a base oficial disponível e avisa
  que edições compartilhadas podem estar desatualizadas; ações de administração
  ficam desabilitadas até recuperar a conexão.
- **Busca vazia:** mostra a família e a subfamília escolhidas.
- **Busca sem resultado:** informa que nenhum software foi encontrado e oferece
  limpar a pesquisa.
- **Produto arquivado enquanto selecionado no rascunho atual:** continua no
  rascunho até ser removido manualmente; não reaparece no catálogo.
- **Falha ao salvar:** preserva o modal aberto e permite tentar novamente.

## Migração do comportamento local

O `localStorage` deixa de ser a fonte oficial para edições padrão e produtos
personalizados do catálogo de software. Dados históricos locais não serão
apagados automaticamente. A implementação deverá tratá-los como compatibilidade
temporária e impedir que sobreponham silenciosamente dados compartilhados do
servidor.

Produtos exclusivos de uma proposta continuam permitidos e permanecem dentro
do documento da proposta até que o usuário escolha salvá-los no catálogo
compartilhado.

## Testes e critérios de aceite

### Busca e hierarquia

- `design` encontra todos os produtos relacionados a Design;
- `TopSolid Design` encontra nomes com `TopSolid'Design` e `TopSolid’Design`;
- `TopSolid Design Standard` encontra as opções Standard esperadas;
- código exato aparece antes de correspondências apenas descritivas;
- resultados ficam agrupados por família e subfamília;
- **Produtos principais** é a primeira subfamília depois de **Todos** em todas as
  famílias;
- os quatro itens aprovados de Design aparecem uma única vez em **Produtos
  principais**;
- extensões continuam selecionáveis sem aviso ou bloqueio.

### Administração e compartilhamento

- um usuário cria um produto e outro usuário da mesma organização o visualiza;
- editar nome, código, descrição, classificação ou valor atualiza o catálogo
  compartilhado;
- um usuário de outra organização não recebe nem altera esses dados;
- arquivar exige confirmação e remove o item de navegação e busca;
- atualizar a aplicação ou fazer novo deploy não perde as mudanças;
- erro do servidor não fecha o modal nem perde os dados digitados.

### Histórico

- proposta salva antes de uma mudança conserva nome e preço anteriores;
- item já incluído em um rascunho conserva os dados capturados na seleção;
- produto arquivado continua aparecendo em proposta já salva;
- abrir uma proposta antiga não recria o item no catálogo ativo;
- nova inclusão usa os dados atuais do catálogo;
- a separação entre Software, Serviços e Treinamentos permanece inalterada;
- salvar e reabrir propostas continua sendo uma ação manual.

## Fora de escopo

- permissões diferentes entre administradores e usuários comuns;
- avisos ou bloqueios de dependência entre produto-base e extensão;
- inclusão automática de produtos-base;
- restauração de produtos arquivados pela interface;
- importação ou atualização da planilha pela interface;
- alteração retroativa de propostas salvas;
- edição das fórmulas de câmbio, desconto, impostos, manutenção ou totalização.
