# Area Propostas - Design

## Contexto

Hoje a Holand usa um arquivo HTML avulso chamado `Gerador de Proposta Holand oficial.html` para gerar propostas de treinamento, implantacao e consultoria. Esse gerador funciona fora do aplicativo principal.

O objetivo desta primeira entrega e trazer o gerador para dentro do aplicativo existente, criando uma area propria chamada **Propostas**, sem alterar as regras, textos, campos ou comportamento do HTML atual.

## Escopo Da Primeira Entrega

A primeira versao deve criar uma nova area **Propostas** no menu principal do app, com rota propria, por exemplo `/propostas`.

Essa area deve conter uma pagina dedicada ao gerador de propostas, preservando a experiencia atual:

- painel lateral escuro para preenchimento dos dados;
- preview da proposta ao lado;
- dados do cliente;
- numero, data, validade e modalidade da proposta;
- lista de servicos predefinidos;
- selecao de servicos;
- edicao de nome, duracao, valor e descricao dos servicos;
- criacao, edicao e exclusao de modulos personalizados;
- percentual de imposto;
- percentual de desconto;
- botao de desconto para fechar em R$ 54.000,00;
- observacoes abaixo da tabela;
- totais no painel lateral;
- preview da proposta;
- impressao/salvar como PDF pelo navegador;
- persistencia local ja existente via `localStorage`.

## Fora De Escopo

Esta primeira entrega nao deve adicionar:

- salvamento de propostas no banco de dados;
- historico de propostas;
- integracao com clientes cadastrados;
- permissao especifica por perfil;
- geracao de PDF no backend;
- mudancas nos textos comerciais;
- mudancas nos calculos;
- redesenho visual do gerador;
- novos tipos de proposta.

Esses pontos podem ser evoluidos depois que a versao atual estiver dentro do app.

## Arquitetura

O gerador deve ser migrado para uma pagina React do frontend, mantendo o comportamento do HTML atual.

Componentes sugeridos:

- `ProposalsPage`: pagina da rota **Propostas**.
- Dados de servicos: lista inicial equivalente ao array `SERVICES` do HTML atual.
- Estado local da pagina: selecao de servicos, duracao, valor, descricao, nome editado, desconto, imposto, observacoes e modulos personalizados.
- Funcoes auxiliares equivalentes as atuais: formatacao monetaria, formatacao de data, calculo de validade e renderizacao dos totais.

Nesta etapa, a implementacao pode manter a logica dentro da pagina se isso ajudar a preservar fidelidade e reduzir risco. A extracao para componentes menores pode acontecer quando novas funcoes forem adicionadas.

## Fluxo De Dados

1. O usuario abre a area **Propostas**.
2. A pagina carrega a data atual, observacoes padrao, configuracao de imposto, modulos personalizados e edicoes salvas no navegador.
3. O usuario preenche dados do cliente e da proposta.
4. O usuario seleciona e ajusta servicos.
5. A pagina recalcula subtotal, desconto, imposto, total com imposto e total de diarias.
6. O preview e atualizado automaticamente.
7. O usuario imprime ou salva como PDF pelo dialogo do navegador.

## Tratamento De Erros

Por ser uma primeira versao local, o tratamento de erros deve preservar o comportamento atual:

- falhas de `localStorage` nao devem quebrar a pagina;
- modulo personalizado sem nome deve mostrar alerta simples;
- exclusao de modulo personalizado deve pedir confirmacao;
- servico sem selecao deve manter o preview com orientacao para selecionar servicos.

## Testes

A implementacao deve ter verificacao suficiente para garantir que a migracao nao quebrou o funcionamento basico:

- a rota **Propostas** aparece no app e renderiza a pagina;
- os servicos predefinidos aparecem;
- selecionar um servico atualiza totais e preview;
- editar duracao ou valor recalcula totais;
- desconto e imposto impactam o total;
- modulo personalizado pode ser criado e selecionado;
- botao de imprimir chama o fluxo de impressao do navegador.

Se houver testes automatizados existentes para paginas React, adicionar testes focados nesses comportamentos principais. Caso contrario, validar manualmente no navegador durante a implementacao.

## Criterios De Aceite

- Existe uma area **Propostas** no app.
- O gerador atual esta acessivel dentro dessa area.
- A primeira versao preserva visual, textos, campos, calculos e comportamento do HTML original.
- Nenhuma integracao nova e introduzida nesta etapa.
- O app continua compilando e a nova tela pode ser usada para gerar/imprimir propostas.
