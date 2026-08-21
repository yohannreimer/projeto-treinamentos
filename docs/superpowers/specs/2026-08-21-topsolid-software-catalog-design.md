# Catálogo estruturado de software TopSolid nas propostas

**Data:** 2026-08-21  
**Status:** desenho aprovado

## Objetivo

Substituir a lista plana de software da tela de propostas por um catálogo pesquisável e hierárquico, sem remover os serviços, treinamentos, condições comerciais, dados do cliente ou a prévia da proposta já existentes.

O catálogo oficial será formado pelos 450 produtos da planilha `TopSolid7_Estruturado_App.xlsx`. A interface começa diretamente nas famílias de produto; não haverá uma etapa redundante chamada “TopSolid 7”.

## Decisões aprovadas

- O catálogo será aberto a partir do bloco **Software** da proposta.
- A prévia da proposta continuará fixa à direita no desktop e será atualizada enquanto os itens forem selecionados.
- O catálogo ocupará somente a área de edição, sem substituir a prévia.
- **CAM** continuará como família principal. Dentro dela ficarão Milling, Turning, Mill-Turn, Extensões, Integrações e demais subfamílias.
- Serviços e treinamentos continuarão em uma seção própria, abaixo de Software.
- O salvamento continuará manual por meio de **Salvar proposta**.
- Propostas salvas continuarão compartilhadas e poderão ser reabertas para edição.

## Estrutura da tela

### Página principal da proposta

A página mantém duas áreas no desktop:

1. **Editor da proposta**, com dados do cliente, software, serviços e treinamentos, condições comerciais e observações.
2. **Prévia da proposta**, fixa à direita, contendo exatamente os dados que comporão o documento comercial.

O bloco Software não exibirá os 450 produtos. Ele mostrará apenas os produtos selecionados, seus valores e o comando **Adicionar software do catálogo**.

O bloco Serviços e treinamentos manterá o comportamento atual, inclusive edição, módulos personalizados e valores por dia. Ele não será misturado ao catálogo de software.

### Catálogo de software

Ao selecionar **Adicionar software do catálogo**, um explorador ocupará a área do editor. A prévia permanecerá visível à direita.

O explorador terá:

- busca global por referência, código de módulo, nome e descrição;
- famílias no topo, com quantidade de produtos;
- subfamílias na lateral no desktop e em faixa horizontal no celular;
- terceiro nível exibido apenas quando necessário, como pastas compactas;
- linhas compactas de produto com referência, descrição, preço e ação de adicionar/remover;
- rodapé com quantidade selecionada, subtotal de software e **Concluir seleção**.

As famílias principais serão Design, Mold, Progress, Electrode, CAM, Wire, Inspection, PartCosting, Interfaces e Pós-processadores. Famílias sem produtos não serão exibidas.

Para evitar excesso visual, categorias grandes não renderizarão todos os itens de uma vez. A lista começa com até 50 resultados e oferece **Mostrar mais**. A busca pesquisa o catálogo inteiro, independentemente da família atualmente aberta, e apresenta o caminho de cada resultado.

### Seleção e retorno

Adicionar ou remover um produto altera imediatamente o rascunho da proposta e a prévia lateral. **Concluir seleção** fecha o catálogo e retorna ao editor. O botão não salva a proposta no servidor; a persistência só ocorre quando o usuário aciona **Salvar proposta**.

Os produtos selecionados permanecem escolhidos ao trocar de família, subfamília ou termo de busca.

No celular, o catálogo ocupa a largura disponível. A prévia passa para baixo do editor e mantém o conteúdo completo da proposta.

## Dados do catálogo

O catálogo oficial será convertido da planilha para um arquivo de dados versionado no frontend. A importação será reproduzível por um script do repositório, evitando a manutenção manual de 450 objetos TypeScript.

Cada produto oficial terá:

- identificador estável e determinístico;
- família;
- subfamília;
- pasta ou agrupamento de terceiro nível;
- referência comercial completa;
- código de módulo extraído quando disponível;
- descrição;
- moeda;
- valor unitário em USD;
- estado de revisão proveniente da planilha.

Todos os 450 registros de `Catalogo_App` serão importados. Os dois registros marcados como `REVISAR` continuarão disponíveis, mas receberão um indicador visual discreto para evitar que a pendência cadastral passe despercebida.

O catálogo oficial e os produtos personalizados compartilhados continuarão sendo fontes separadas:

- **oficiais:** arquivo versionado gerado da planilha;
- **personalizados compartilhados:** API e armazenamento já existentes;
- **personalizados somente da proposta:** snapshots mantidos dentro do documento salvo.

Na interface, as três fontes serão combinadas em um único modelo de leitura. Produtos personalizados aparecerão em **Personalizados** e também nos resultados da busca.

## Persistência e compatibilidade

Os identificadores oficiais atuais usados por propostas existentes serão preservados por um mapa de compatibilidade para os 11 produtos já cadastrados. Assim, reabrir uma proposta antiga continuará encontrando o produto correto no novo catálogo.

Ao salvar, a proposta continuará armazenando:

- identificadores selecionados;
- snapshots de nome, descrição, quantidade, preço e manutenção;
- edições específicas daquela proposta.

O snapshot garante que uma proposta já salva mantenha o conteúdo comercial original mesmo se uma futura versão da lista de preços alterar nome, classificação ou valor do catálogo.

Nenhuma alteração será feita no fluxo manual de salvar, reabrir ou excluir propostas compartilhadas.

## Organização de componentes

O arquivo atual da página de propostas já concentra várias responsabilidades. A implementação separará apenas as unidades necessárias para esta funcionalidade:

- `softwareCatalogData`: dados oficiais gerados da planilha;
- `softwareCatalogModel`: tipos, normalização de busca e construção da árvore;
- `SoftwareSelectionSummary`: produtos selecionados no editor;
- `SoftwareCatalogExplorer`: navegação, busca, paginação e seleção;
- `SoftwareCatalogCategories`: famílias e subfamílias;
- `SoftwareCatalogResults`: resultados compactos;
- `ProposalPreview`: continuará consumindo a seleção calculada pela página.

`ProposalsPage` continuará dona do estado do rascunho e da integração com salvamento. Os componentes do catálogo receberão dados e callbacks, sem acessar diretamente a API de propostas.

## Estados e falhas

- Busca vazia: mostra a família e subfamília atuais.
- Busca sem resultado: mostra mensagem clara e preserva os produtos selecionados.
- Falha ao carregar personalizados compartilhados: mantém o catálogo oficial disponível e mostra o erro já usado pelo fluxo de personalizados.
- Falha ao criar ou editar personalizado: preserva os campos digitados e não fecha o formulário.
- Item `REVISAR`: mostra o indicador cadastral sem impedir a seleção.
- Proposta antiga com snapshot ausente no catálogo: continua reconstruída a partir do snapshot, como produto específico daquela proposta.

## Acessibilidade e uso por teclado

- Busca recebe foco ao abrir o catálogo.
- Famílias, subfamílias, filtros e ações serão botões reais.
- O estado selecionado será exposto com `aria-pressed` ou checkbox.
- O catálogo poderá ser fechado com `Escape`, retornando o foco ao botão que o abriu.
- Contagens e subtotais usarão regiões anunciáveis sem interromper a digitação.
- Nenhum significado dependerá apenas da cor.

## Testes e critérios de aceite

### Dados

- a importação gera exatamente 450 produtos;
- nenhum produto fica sem referência, descrição ou preço numérico;
- as contagens por família conferem com a planilha;
- os dois registros `REVISAR` preservam essa marcação;
- os 11 identificadores legados resolvem para os produtos correspondentes.

### Interface

- abrir o catálogo não remove nem substitui a prévia;
- CAM exibe Milling, Turning e suas demais subfamílias;
- a busca encontra por nome, referência, descrição e código;
- busca global encontra itens de outra família e mostra seu caminho;
- selecionar um produto atualiza resumo, subtotal e prévia;
- trocar filtros não perde a seleção;
- concluir retorna ao editor com Software e Serviços em blocos separados;
- categorias grandes usam carregamento incremental;
- desktop e celular não apresentam rolagem horizontal da página.

### Persistência

- salvar e reabrir mantém os produtos oficiais e personalizados selecionados;
- propostas antigas continuam abrindo sem alteração de valores ou textos salvos;
- adicionar itens no catálogo não persiste nada até o usuário salvar manualmente;
- serviços, treinamentos, descontos, impostos, câmbio, manutenção e geração do documento continuam funcionando.

## Fora de escopo

- editor administrativo da lista oficial de preços;
- upload da planilha pela interface;
- alteração automática de propostas salvas quando o catálogo mudar;
- mudança no formato do documento comercial ou PDF;
- alteração das fórmulas atuais de preço, câmbio, desconto, impostos ou manutenção;
- criação de novas famílias vazias, como “Outros Aplicativos”, antes de existirem produtos classificados nelas.
