# Licenças: importação de arquivo TopSolid

## Contexto

A tela de licenças já permite cadastrar, editar, excluir e renovar licenças, usando o catálogo de Programas de Licença como base para padronizar nomes. O problema atual é operacional: ao receber um arquivo TopSolid, o usuário precisa abrir o texto no bloco de notas e marcar manualmente muitos módulos ou grupos no cadastro. Além disso, o duplo clique em uma licença abre apenas uma visualização, o que deixa a edição pouco evidente.

O arquivo TopSolid contém uma linha por módulo ou grupo. Cada linha informa o tipo (`Module` ou `Group`), o código, o nome comercial e a data de validade, como `30-6-2026`. O cadastro desejado não deve criar uma licença para cada linha; deve criar um pacote por cliente e usuário, separando somente quando houver datas de vencimento diferentes.

## Objetivos

- Permitir colar o texto TopSolid no cadastro de licença e obter uma prévia antes de salvar.
- Extrair módulos/grupos e vencimentos do texto com regra testável no backend.
- Agrupar a prévia por vencimento.
- Pré-selecionar apenas Programas de Licença já cadastrados.
- Mostrar itens não encontrados como pendências, sem criar programas automaticamente.
- Permitir revisar e alterar a seleção antes de salvar.
- Tornar edição, exclusão e renovação mais evidentes, inclusive para licenças expiradas.

## Fora de escopo

- Criar Programas de Licença automaticamente a partir do texto importado.
- Salvar o arquivo bruto como anexo.
- Criar várias licenças automaticamente sem revisão do usuário.
- Alterar a modelagem principal de clientes, usuários ou Programas de Licença.

## Abordagem recomendada

Criar uma etapa de prévia no backend e usar a tela de Licenças para aplicar o resultado no formulário atual.

O backend terá um endpoint de análise, por exemplo `POST /licenses/import-preview`, que recebe `{ raw_text: string }` e devolve:

- `groups`: lista agrupada por `expires_at`;
- `matched_programs`: programas encontrados no catálogo para cada grupo;
- `unmatched_items`: itens do arquivo sem correspondência no catálogo;
- `summary`: totais de linhas válidas, linhas ignoradas, datas encontradas e pendências.

A tela de Licenças adicionará um bloco "Importar texto TopSolid" no formulário. O usuário cola o texto e clica em "Analisar". Se houver uma data, a tela aplica a data e marca os programas encontrados. Se houver mais de uma data, a tela mostra os grupos e permite aplicar um grupo por vez ao cadastro atual. O usuário continua preenchendo cliente, usuário, ID da licença, ciclo de renovação e observações.

## Parser TopSolid

O parser deve ler linha por linha e aceitar linhas no formato geral:

`TOPSOLID/"Fornecedor"/.../7.19/Module:1207/"Nome"/30-6-2026/Professional/...`

ou:

`TOPSOLID/"Fornecedor"/.../7.19/Group:817/"Nome"/30-6-2026/Professional/...`

Campos extraídos:

- `kind`: `Module` ou `Group`;
- `code`: número após `Module:` ou `Group:`;
- `name`: conteúdo entre aspas logo após o token de módulo/grupo;
- `expires_at`: data normalizada para `YYYY-MM-DD`;
- `raw_line`: linha original, apenas na resposta de prévia se útil para depuração.

Linhas sem `Module:` ou `Group:` válidos serão ignoradas e contabilizadas. Datas inválidas também entram como ignoradas, com motivo.

## Correspondência com catálogo

A correspondência deve usar o catálogo existente de `license_program`.

Regra inicial:

- comparar nome normalizado do arquivo com nome normalizado do programa;
- normalização remove acentos, reduz espaços, ignora maiúsculas/minúsculas e trata apóstrofos de forma tolerante;
- não criar novos programas;
- se não houver correspondência exata normalizada, marcar como não encontrado.

Essa regra evita poluir o catálogo. Em uma melhoria futura, pode haver aliases por programa, mas isso não entra nesta etapa.

## Fluxo de criação

1. Usuário abre "Cadastrar licença".
2. Seleciona cliente e informa usuário.
3. Cola o texto TopSolid e clica em "Analisar".
4. Sistema mostra grupos por vencimento.
5. Usuário aplica o grupo desejado.
6. Formulário marca os programas encontrados e preenche o vencimento.
7. Pendências ficam visíveis para conferência.
8. Usuário informa ID da licença, ciclo e observações.
9. Usuário salva a licença.

Se o texto tiver duas datas de vencimento, a tela não salva as duas automaticamente. Ela permite aplicar uma data ao formulário atual; o usuário pode salvar a primeira licença, depois aplicar o segundo grupo e salvar a segunda com o mesmo cliente/usuário se fizer sentido.

## Fluxo de edição

A tabela mantém ações explícitas de editar, renovar e excluir. O painel aberto por duplo clique também passa a exibir botões:

- Editar;
- Renovar conforme ciclo;
- Excluir.

Ao clicar em Editar no painel, o painel fecha e o formulário abre preenchido. A edição permite alterar programas selecionados, vencimento, ID, usuário, ciclo e observações. A importação TopSolid também pode ser usada durante a edição para substituir ou ajustar a seleção.

## Renovação de expiradas

O backend já calcula renovação usando a data atual quando a licença está expirada, e usando o vencimento atual quando ela ainda está válida. A interface deve deixar esse comportamento acessível nos avisos e no painel de detalhes, não apenas na tabela principal.

Mensagens devem deixar claro o novo vencimento após renovar.

## Dados e APIs

Não há necessidade de nova tabela nesta etapa.

Endpoints envolvidos:

- `GET /licenses`: continua retornando licenças com `module_ids`, `module_list`, status e aviso.
- `POST /licenses`: continua criando a licença revisada.
- `PATCH /licenses/:id`: continua atualizando seleção, data e metadados.
- `DELETE /licenses/:id`: continua excluindo com confirmação destrutiva.
- `POST /licenses/:id/renew`: continua renovando conforme ciclo.
- `POST /licenses/import-preview`: novo endpoint para analisar o texto TopSolid.

## UI

O formulário de licença terá:

- bloco compacto de importação com textarea;
- botão "Analisar";
- resumo da prévia;
- cards ou linhas por vencimento com contagem de programas encontrados e pendências;
- ação "Aplicar este grupo";
- lista de "Não encontrados" para o grupo aplicado.

O grid de Programas da licença continua editável. Aplicar uma prévia não bloqueia o usuário: ele pode marcar ou desmarcar programas manualmente.

## Testes

Backend:

- parser extrai `Module`, `Group`, código, nome e data;
- parser agrupa linhas por vencimento;
- endpoint retorna programas encontrados e não encontrados sem criar catálogo;
- datas `30-6-2026` viram `2026-06-30`;
- linhas inválidas são ignoradas e contabilizadas;
- renovação de licença expirada segue funcionando.

Frontend:

- usuário cola texto, analisa e aplica grupo;
- programas encontrados são marcados;
- vencimento é preenchido;
- pendências aparecem;
- painel de detalhes oferece Editar, Renovar e Excluir.

## Critérios de aceite

- Colar o arquivo TopSolid permite preencher rapidamente uma licença com todos os programas já cadastrados que foram encontrados.
- Itens sem correspondência aparecem claramente e não criam registros automáticos.
- Textos com múltiplas datas são separados por grupo de vencimento.
- O usuário consegue editar a seleção antes de salvar.
- Licenças existentes podem ser editadas por botão explícito e pelo painel de detalhes.
- Licenças expiradas podem ser renovadas pelo mesmo ciclo com novo vencimento visível.
