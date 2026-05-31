# Licencas: alertas de vencimento na sidebar

## Contexto

A tela de Licencas ja cadastra, edita, renova, exclui e importa licencas TopSolid. O backend tambem calcula status de alerta, mas a visibilidade atual fica concentrada dentro da propria tela de licencas. Como vencimentos exigem acao operacional antes da expiracao, o app precisa sinalizar pendencias ainda na navegacao lateral.

## Objetivos

- Considerar qualquer licenca vencida ou vencendo em ate 15 dias como item de atencao.
- Mostrar uma sinalizacao clara no item `Licencas` da sidebar quando houver pendencias.
- Diferenciar vencidas de licencas proximas do vencimento sem obrigar o usuario a abrir a tela.
- Manter a tela de Licencas completa ao abrir, com um painel superior mais explicito para os alertas.
- Reaproveitar a linguagem visual de badges ja usada na sidebar para Implementacao e Suporte.

## Fora de escopo

- Criar uma central global de alertas para todo o sistema.
- Enviar notificacoes por e-mail, WhatsApp ou push.
- Criar automacoes de renovacao sem acao humana.
- Alterar o fluxo de cadastro/importacao TopSolid.
- Alterar ciclos de renovacao ou regras de calculo do novo vencimento ao renovar.

## Regra de negocio

Uma licenca entra em atencao quando:

- `expires_at` for anterior a hoje: status `Expirada`;
- `expires_at` estiver entre hoje e hoje + 15 dias, inclusive: status `Atencao`;
- `expires_at` estiver depois de hoje + 15 dias: status `Ok`.

A janela de alerta passa a ser 15 dias para todos os ciclos (`Mensal`, `Bimestral`, `Trimestral`, `Semestral` e `Anual`). A ordenacao de urgencia deve colocar licencas expiradas primeiro e, em seguida, vencimentos mais proximos.

## Abordagem recomendada

Criar um resumo operacional de licencas para alimentar a sidebar e o topo da tela de Licencas. O resumo deve conter, no minimo:

- `expired_count`;
- `due_soon_count`;
- `total_attention`;
- `next_expiration_at`, quando existir uma licenca em atencao;
- `urgent_items`, uma lista curta das licencas mais urgentes, limitada a 5 itens e ordenada por vencidas primeiro, depois menor `expires_at`.

O endpoint atual `GET /licenses` pode continuar retornando as linhas completas com `alert_level`, `days_until_expiration`, `warning_message` e `alerts`. Para a sidebar, a preferencia e usar um endpoint leve, por exemplo `GET /licenses/alerts-summary`, ou uma funcao compartilhada no backend que permita retornar o mesmo resumo sem carregar dados desnecessarios no frontend.

## Sidebar

Quando `total_attention` for zero, o item `Licencas` permanece como esta hoje.

Quando houver atencao:

- o item `Licencas` exibe o badge numerico com `total_attention`;
- abaixo do label, aparece uma segunda linha curta no padrao escolhido:
  - `2 vencidas - 6 ate 15 dias`;
  - `2 vencidas`, quando nao houver proximas;
  - `6 ate 15 dias`, quando nao houver expiradas.

O visual segue a direcao B aprovada: badge com resumo. Ele deve ser mais expressivo que um item normal, mas menos agressivo que um bloco critico vermelho preenchido. A sidebar deve continuar escaneavel e consistente com Implementacao/Suporte.

## Tela de Licencas

Ao clicar em `Licencas`, a tela abre normalmente, sem aplicar filtro automatico e sem esconder as licencas `Ok`.

O topo da tela ganha um painel de resumo mais claro que o atual, com cards para:

- `Vencidas`;
- `Vencem em ate 15 dias`;
- `Total em atencao`;
- `Proximo vencimento`, quando houver.

A secao `Avisos de renovacao` permanece abaixo do painel e mostra a lista acionavel, ordenada por urgencia. A base completa de licencas continua disponivel na mesma pagina, com busca, ordenacao, renovacao, edicao e exclusao.

## Dados e API

Backend:

- Atualizar a regra de alerta para usar 15 dias em todos os ciclos.
- Centralizar o calculo de status/resumo para evitar divergencia entre `GET /licenses` e o resumo da sidebar.
- Expor um resumo leve para a navegacao ou garantir que o frontend consiga obter esse resumo sem depender de carregar a tabela completa.

Frontend:

- Estender `AppNavItem` para suportar uma linha secundaria opcional no nav, por exemplo `badgeDetail`.
- Buscar o resumo de licencas quando o usuario logado tiver permissao `licenses`.
- Combinar o resumo de licencas com os badges ja existentes de Implementacao/Suporte.
- Atualizar o polling da sidebar no mesmo ritmo dos alertas atuais, hoje a cada 60 segundos.
- Atualizar a tela de Licencas para refletir a janela unica de 15 dias e o novo painel superior.

## Estados de exibicao

- Sem pendencias: `Licencas` sem badge e sem linha secundaria.
- Somente proximas: badge com total e texto `N ate 15 dias`.
- Somente vencidas: badge com total e texto `N vencida(s)`.
- Vencidas e proximas: badge com total e texto `X vencidas - Y ate 15 dias`.
- Erro ao buscar resumo: sidebar nao mostra badge de licencas e nao bloqueia a navegacao; a tela de Licencas continua tentando carregar normalmente.

## Testes

Backend:

- Licenca vencida entra em `Expirada`.
- Licenca vencendo hoje entra em `Atencao`.
- Licenca vencendo em 15 dias entra em `Atencao`.
- Licenca vencendo em 16 dias entra em `Ok`.
- Ciclo anual tambem usa 15 dias, nao 30.
- Resumo retorna contagens corretas para expiradas, proximas e total.

Frontend:

- Sidebar mostra badge e linha secundaria para vencidas e proximas.
- Sidebar nao mostra alerta quando `total_attention` e zero.
- Tela de Licencas mostra painel superior com contagens corretas.
- Clique em `Licencas` abre a tela completa, sem filtro automatico.
- Falha ao carregar resumo nao quebra a navegacao.

## Criterios de aceite

- A janela de alerta de vencimento e 15 dias para todas as licencas.
- A sidebar sinaliza claramente quando existem licencas vencidas ou vencendo em ate 15 dias.
- A sidebar diferencia vencidas de proximas com texto curto.
- A tela de Licencas continua mostrando a base completa, mas com resumo superior mais evidente.
- Os dados exibidos na sidebar e na tela de Licencas usam a mesma regra de alerta.
