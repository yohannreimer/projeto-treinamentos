# Propostas salvas e catálogo compartilhado

## Objetivo

Permitir que usuários autenticados com acesso à área de Propostas salvem uma proposta no servidor, reabram-na depois e continuem a edição. As propostas salvas e os módulos personalizados do catálogo devem ser compartilhados entre todos os usuários com acesso à área.

## Escopo

### Propostas salvas

- A tela terá uma área "Propostas salvas" com busca e uma lista resumida.
- Cada item exibirá, no mínimo, número da proposta, razão social do cliente e data da última atualização.
- "Nova proposta" iniciará um formulário limpo sem remover registros existentes.
- "Salvar proposta" criará um registro quando o formulário ainda não tiver identificador persistido.
- Depois da primeira gravação, "Salvar proposta" atualizará o mesmo registro.
- Uma proposta salva poderá ser aberta, editada e salva novamente.
- A exclusão exigirá confirmação explícita.
- A lista será compartilhada entre todos os usuários autenticados com permissão `proposals`.

### Conteúdo persistido

O documento salvo deverá restaurar o estado editável completo da proposta:

- dados do cliente;
- número, data, validade e modalidade;
- serviços e produtos selecionados;
- módulos e produtos personalizados exclusivos daquela proposta;
- edições específicas de nome, preço, quantidade, duração e descrição;
- cotação, descontos, imposto e total alvo;
- representante selecionado;
- observações;
- inclusão ou não do termo de requisitos.

Valores calculados poderão ser refeitos no cliente a partir do estado persistido. O servidor armazenará o documento como JSON validado e manterá metadados relacionais para listagem e auditoria.

### Catálogo compartilhado de módulos

- Módulos criados pela ação "Salvar módulo no catálogo" serão persistidos no servidor.
- Ao entrar na página, todos os usuários autorizados carregarão o mesmo catálogo.
- Edições salvas como padrão e exclusões de módulos do catálogo também serão compartilhadas.
- Módulos adicionados somente à proposta continuarão pertencendo apenas ao documento daquela proposta.
- Produtos personalizados permanecem fora desta mudança de catálogo compartilhado; apenas seus dados dentro de uma proposta salva serão persistidos.

## Arquitetura

### Banco de dados

Uma tabela `proposal` armazenará:

- `id`;
- `organization_id`;
- `number`;
- `client_company_name`;
- `document_json`;
- `created_by`;
- `updated_by`;
- `created_at`;
- `updated_at`.

Uma tabela `proposal_catalog_service` armazenará:

- `id`;
- `organization_id`;
- `code`;
- `name`;
- `value_per_day`;
- `default_duration_days`;
- `description`;
- `created_by`;
- `updated_by`;
- `created_at`;
- `updated_at`.

Os registros serão isolados por `organization_id`, ainda que a instalação atual utilize uma única organização. Índices cobrirão organização, atualização e os campos usados pela busca.

### API

Rotas autenticadas sob `/proposals` fornecerão:

- listagem e busca das propostas;
- leitura de uma proposta completa;
- criação;
- atualização;
- exclusão;
- listagem do catálogo de módulos;
- criação, atualização e exclusão de módulos do catálogo.

Todas as rotas exigirão autenticação interna e permissão `proposals`. As mutações entrarão no mecanismo de auditoria já existente.

### Frontend

A tela carregará de forma independente:

- resumos de propostas salvas;
- catálogo compartilhado de módulos.

O estado do formulário continuará local enquanto o usuário edita. A gravação será exclusivamente manual. Após criar uma proposta, o identificador devolvido pela API ficará associado ao formulário aberto, fazendo com que gravações seguintes atualizem o mesmo registro.

Abrir outra proposta substituirá o formulário atual pelo documento carregado. Quando houver alterações ainda não salvas, a troca para "Nova proposta", abertura de outro registro ou saída por uma ação interna da tela exigirá confirmação.

## Experiência de uso

Na lateral haverá uma seção "Propostas salvas" com:

- campo de busca por número ou razão social;
- lista ordenada pela atualização mais recente;
- ação para abrir;
- ação para excluir;
- estado vazio e estados de carregamento/erro.

As ações principais serão "Nova proposta" e "Salvar proposta". Durante a gravação, o botão ficará desabilitado e exibirá "Salvando...". Depois do sucesso, a tela confirmará a gravação e atualizará a lista. Erros manterão intacto o conteúdo do formulário e permitirão nova tentativa.

## Concorrência

A primeira versão usará a última gravação confirmada no servidor. O campo `updated_at` permitirá mostrar quando o registro foi alterado. Não haverá edição colaborativa em tempo real nem mesclagem de alterações nesta entrega.

## Validação e limites

- O servidor validará o envelope e a estrutura do documento antes de persistir.
- Número e razão social poderão estar vazios durante a edição, mas a interface deverá mostrar um rótulo substituto coerente na lista.
- O tamanho do JSON terá um limite suficiente para texto e itens de uma proposta, sem aceitar anexos binários.
- Exclusões retornarão `404` quando o registro não existir e não apagarão dados de outra organização.

## Tratamento de dados locais existentes

O `localStorage` deixará de ser a fonte do catálogo compartilhado. Não haverá migração automática de módulos locais antigos, pois dados de navegadores diferentes podem gerar duplicidades. Itens importantes poderão ser recriados uma única vez no catálogo compartilhado.

Preferências pessoais já armazenadas localmente e que não fazem parte do pedido poderão continuar locais. O documento de cada proposta sempre registrará os valores efetivamente usados nela.

## Testes e aceite

### Backend

- criar, listar, buscar, ler, atualizar e excluir propostas;
- rejeitar documentos inválidos;
- isolar registros por organização;
- criar, editar, listar e excluir módulos compartilhados;
- exigir autenticação e permissão de Propostas.

### Frontend

- serializar todo o estado editável;
- restaurar uma proposta salva sem alterar seus valores;
- criar na primeira gravação e atualizar nas seguintes;
- manter o formulário quando uma gravação falhar;
- carregar e refletir módulos compartilhados;
- confirmar descarte de alterações e exclusões.

### Critérios de aceite

1. Um usuário salva uma proposta e outro usuário autorizado consegue encontrá-la, abri-la, editá-la e salvá-la novamente.
2. Reabrir uma proposta restaura os mesmos dados, seleções, ajustes comerciais e opções do documento salvo.
3. Um módulo salvo no catálogo por um usuário aparece para outro usuário ao abrir ou atualizar a aba.
4. Um módulo adicionado somente à proposta não aparece no catálogo compartilhado.
5. Uma falha de rede não limpa nem substitui o formulário em edição.

## Fora do escopo

- geração e armazenamento do PDF no servidor;
- histórico de versões ou restauração de revisões;
- edição colaborativa em tempo real;
- permissões diferentes para visualizar e editar propostas;
- migração automática de dados antigos do navegador;
- compartilhamento do catálogo de produtos personalizados.
