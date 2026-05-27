# Ajustes operacionais - 2026-05-27

## Certificados na documentação interna

- Certificados gerados pelo sistema continuam sendo salvos em `internal_document` na categoria `Certificados`.
- A tela de Documentação Interna agora diferencia certificados visualmente.
- PDFs e imagens têm ação `Visualizar`, que abre uma prévia em modal sem expor o conteúdo bruto do arquivo.
- `Download` continua disponível para baixar o arquivo original.

## Erros visíveis

- Erros de API disparados por `services/api.ts` emitem um aviso global.
- O aviso aparece fixo no topo da tela, sobre modais e páginas, e desaparece após 15 segundos.
- A modal de criação/edição de turmas também mostra o erro no topo da própria modal, para evitar precisar fechar a modal e rolar a página.

## Turmas: cancelar e excluir alocação

- `Cancelar` mantém a alocação como histórico, com status `Cancelado`.
- Depois de cancelar, a lista de sugestões de cliente é recarregada para permitir selecionar novamente quando fizer sentido.
- `Excluir` remove a alocação da turma.
- Ao excluir, vínculos de participante com aquele módulo são limpos quando não existe mais alocação ativa para o mesmo cliente/módulo.

## Calendário

- Na visão mensal do mês atual, a primeira linha da grade começa na semana atual.
- Ao navegar para outros meses, a grade segue começando pela semana do primeiro dia do mês.

## Avaliação de acompanhamento

- No detalhe do cliente, a seção `Avaliação de acompanhamento` permite gerar um link público.
- O link usa a rota `/acompanhamento/:token`.
- O cliente responde nome, nota de 1 a 5 e três campos abertos:
  - o que funcionou bem;
  - o que pode melhorar;
  - próxima prioridade.
- A resposta fica salva em `client_followup_evaluation` e aparece na lista do cliente.

## Planejar mobile

- Em telas menores, a aba Planejar empilha a lista de clientes e o quadro.
- A navegação lateral vira gaveta.
- Quadros com muitas colunas continuam acessíveis por rolagem horizontal.
