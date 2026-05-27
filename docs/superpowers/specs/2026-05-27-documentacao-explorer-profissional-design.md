# Documentação Explorer Profissional

Data: 2026-05-27
Status: Aprovado para planejamento

## Contexto

A aba `Documentação` precisa funcionar como um acervo operacional, não apenas como uma lista de arquivos. Ela deve atender dois usos principais:

- Documentação vinculada a clientes, módulos, certificados e pesquisas de satisfação.
- Materiais internos livres, com pastas criadas pela equipe conforme a operação evoluir.

O problema observado na tela atual é que a navegação e a busca perdem contexto. Por exemplo, ao buscar `satis`, a tela pode listar várias pastas chamadas `Pesquisa de satisfação`, sem deixar claro a qual cliente ou módulo cada resultado pertence.

## Direção Escolhida

Usar o modelo `Explorer Profissional`, inspirado em Finder/Windows Explorer:

- Árvore de pastas à esquerda.
- Área central para conteúdo da pasta ou resultados da busca.
- Painel de detalhes à direita no desktop.
- Busca com escopo alternável entre `Nesta pasta` e `Tudo`.
- Resultados separados por grupos.

Essa direção foi escolhida porque preserva a ideia de pastas livres para materiais internos, mas melhora a legibilidade e o contexto operacional dos documentos de clientes.

## Estrutura Da Tela

### Coluna Esquerda: Árvore Progressiva

A árvore lateral deve ser progressiva, sem abrir tudo de uma vez.

Raiz:

- `Clientes`
- `Interna`

Dentro de `Clientes`:

- Lista de clientes.

Dentro de um cliente:

- `Documentos do cliente`
- `Módulos`
- `Pesquisa de satisfação`

Dentro de `Módulos`:

- Lista dos módulos daquele cliente.

Dentro de cada módulo:

- Pastas automáticas relevantes, como certificados, quando existirem.
- Pastas manuais criadas pela equipe, quando existirem.

Dentro de `Interna`:

- Estrutura livre. Não haverá pastas padrão obrigatórias por enquanto.

### Área Central: Conteúdo E Resultados

Sem busca ativa, a área central mostra o conteúdo da pasta selecionada.

Com busca ativa, a área central mostra resultados separados por grupos:

- `Pastas`
- `Pesquisas`
- `Certificados`
- `Arquivos`

Todo resultado deve exibir caminho completo ou contexto equivalente. Exemplos:

- `Clientes > Magui Dispositivos > Pesquisa de satisfação > Treinamento TopSolid'Cam 7 - Fresamento 2D`
- `Clientes > Holand Automação > Módulos > TopSolid Design 7 > Certificados`
- `Interna > Materiais comerciais > Apresentação institucional`

A busca deve ter dois modos:

- `Nesta pasta`: busca limitada à pasta atual e seus descendentes.
- `Tudo`: busca global em `Clientes` e `Interna`.

O modo deve ser visível como um controle simples, semelhante ao comportamento de busca em Finder.

### Coluna Direita: Detalhes E Ações

No desktop, o painel direito fica visível.

Quando nenhum item está selecionado:

- Mostra resumo da pasta atual.
- Mostra contadores relevantes.
- Mostra atalhos de ação.

Quando um item está selecionado:

- Tipo do item.
- Cliente, se houver.
- Módulo, se houver.
- Caminho completo.
- Data de criação/atualização.
- Nome do arquivo, se houver.
- Tamanho do arquivo, se houver.
- Ações disponíveis, como `Abrir`, `Visualizar`, `Baixar`, `Excluir`.

Em telas menores, o painel de detalhes pode virar drawer/modal para preservar espaço.

## Botão Novo

O botão principal deve ser `+ Novo`.

Ao clicar, abre um menu rápido:

- `Nova pasta`
- `Enviar arquivo`

Ao escolher uma ação, o painel direito troca temporariamente para o formulário correspondente.

Após salvar ou cancelar:

- O painel direito volta para os detalhes.
- A pasta atual é recarregada.
- A mensagem de sucesso ou erro aparece sem deslocar a navegação.

## Pesquisas De Satisfação

Pesquisas devem ser tratadas como conteúdo estruturado, não como arquivo genérico.

Na listagem:

- Mostrar tipo `Pesquisa`.
- Mostrar cliente.
- Mostrar módulo ou contexto.
- Mostrar respondente, quando houver.
- Mostrar nota/status, quando houver.

Ao abrir:

- Exibir relatório legível com perguntas e respostas.
- Não mostrar JSON cru.
- Manter opção de baixar o arquivo original quando fizer sentido.

Pesquisas antigas detectadas por chave `PESQUISA_CERTIFICADO...` devem aparecer no grupo `Pesquisas` e no caminho de satisfação do cliente.

## Certificados

Certificados devem aparecer no grupo `Certificados` durante busca.

Na listagem:

- Mostrar cliente.
- Mostrar módulo.
- Mostrar contexto da emissão.
- Mostrar ação principal de visualizar/baixar.

Certificados vinculados a cliente/módulo devem aparecer no caminho correspondente.

## Materiais Internos

`Interna` será livre nesta primeira versão.

Não serão criadas categorias padrão obrigatórias. A equipe poderá criar pastas conforme necessidade, por exemplo:

- Materiais internos.
- Modelos.
- Comercial.
- Processos.
- Treinamentos internos.

Esses nomes são exemplos, não estrutura automática.

## Comportamento De Busca

A busca deve procurar em:

- Nome da pasta.
- Nome do arquivo.
- Título do documento.
- Categoria.
- Cliente.
- Módulo.
- Tipo do documento.
- Texto estruturado conhecido, como nome de respondente em pesquisa.

Quando a busca estiver ativa:

- A árvore lateral permanece disponível.
- O breadcrumb pode indicar o escopo atual.
- Os resultados mostram grupos e contexto completo.

## Estados

A interface deve cobrir:

- Pasta vazia.
- Busca sem resultados.
- Carregando documentos.
- Erro ao carregar.
- Erro ao baixar/visualizar.
- Upload em andamento.
- Criação de pasta em andamento.
- Item selecionado.
- Nenhum item selecionado.

## Testes E Verificação

Verificações recomendadas:

- Busca por `satis` mostra resultados agrupados e com cliente/contexto.
- Busca em `Nesta pasta` não retorna itens fora da pasta atual.
- Busca em `Tudo` retorna itens de `Clientes` e `Interna`.
- Árvore lateral não expande todos os módulos automaticamente.
- `+ Novo > Nova pasta` cria pasta no local selecionado.
- `+ Novo > Enviar arquivo` salva arquivo na pasta selecionada.
- Pesquisa de satisfação abre como relatório legível.
- Certificado continua abrindo/baixando corretamente.
- Layout não quebra em desktop largo, notebook e mobile.

## Fora De Escopo Nesta Etapa

- Permissões específicas por pasta.
- Drag-and-drop de arquivos entre pastas.
- Renomear/mover pastas existentes.
- Versionamento de documentos.
- Pastas padrão obrigatórias dentro de `Interna`.

