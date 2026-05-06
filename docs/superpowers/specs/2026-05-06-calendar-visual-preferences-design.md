# Preferencia visual chamativa do calendario por usuario

## Objetivo

Permitir que alguns usuarios internos ativem uma visualizacao de calendario mais chamativa sem alterar o padrao do sistema para todos. A configuracao deve ficar na Administracao, acessivel apenas para usuarios com permissao `admin`.

## Escopo

- Adicionar uma preferencia por usuario interno chamada `Calendario chamativo`.
- Manter a preferencia desligada por padrao para preservar o calendario atual.
- Adicionar na Administracao uma configuracao de cor por tecnico.
- Aplicar a cor do tecnico tanto em turmas/treinamentos quanto em atividades normais quando o usuario atual estiver com `Calendario chamativo` ligado.
- Manter a visualizacao atual intacta quando a preferencia estiver desligada.

## Comportamento visual

Com `Calendario chamativo` desligado:

- Calendario segue exatamente o estilo atual.

Com `Calendario chamativo` ligado:

- Cards de turmas/treinamentos recebem preenchimento laranja mais forte.
- Cards de atividades normais tambem recebem preenchimento mais evidente.
- A cor configurada do tecnico aparece como destaque visual do card, aplicavel a turmas e atividades.
- Se uma atividade tiver mais de um tecnico, o card usa a cor do primeiro tecnico associado e continua mostrando os nomes no texto.
- Se o tecnico nao tiver cor configurada, o card usa uma cor neutra de fallback.

## Dados

- Preferencia do usuario: armazenada em `internal_user`, em JSON de preferencias ou coluna equivalente.
- Cor do tecnico: armazenada no cadastro do tecnico ou em configuracao administrativa relacionada ao tecnico.
- O payload de sessao/me deve expor a preferencia do usuario atual para o frontend decidir a classe visual.
- As listagens de tecnicos/calendario devem expor a cor configurada para renderizacao dos cards.

## Interface de administracao

- Na secao de Usuarios internos:
  - checkbox `Calendario chamativo` para criar/editar usuario.
- Na secao administrativa de tecnicos/calendario:
  - lista simples com tecnico e seletor de cor.
  - salvar cor por tecnico.

## Testes

- Backend: validar persistencia da preferencia do usuario e da cor do tecnico.
- Backend: validar que `/internal/me` ou payload equivalente retorna a preferencia.
- Frontend build: garantir tipos e renderizacao sem quebrar.
- Verificacao manual no localhost: com preferencia desligada, calendario igual; com preferencia ligada, turmas e atividades coloridas.
