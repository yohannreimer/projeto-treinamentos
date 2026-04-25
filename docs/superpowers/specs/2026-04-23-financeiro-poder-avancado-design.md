# Design: Financeiro Poder Avancado (Fase 7)

## Status de Implementacao
Atualizado em 2026-04-23.

Concluida no workspace principal, sem commit/push por decisao do usuario.

## 1. Objetivo
A Fase 7 adiciona a camada de poder para usuarios mais maduros, sem transformar a interface em um painel pesado.

O foco e entregar:

- regras automaticas;
- aprovacao de pagamentos;
- anexos e comprovantes;
- auditoria detalhada;
- permissoes granulares visiveis;
- exportacao CSV/PDF;
- preparacao para integracoes bancarias/API.

## 2. Backend
Entra um contrato agregado em `GET /finance/advanced` para alimentar uma tela unica.

Novos blocos:

- `automation_rules`;
- `approval_queue`;
- `attachments`;
- `audit_entries`;
- `permission_matrix`;
- `bank_integrations`;
- `export_options`.

Aprovacoes usam a auditoria operacional existente. Um pagamento aberto acima do limite operacional entra na fila se ainda nao tiver uma auditoria de aprovacao.

## 3. Interface
A nova aba `Avancado` usa o mesmo estilo visual atual:

- abas internas compactas;
- cards brancos com borda leve;
- tabelas densas;
- botoes pequenos e objetivos.

O objetivo nao e vender a funcionalidade dentro da tela, mas permitir operar: criar regra padrao, aprovar pagamento, registrar comprovante, exportar e configurar uma integracao sandbox.

## 4. Exportacoes e Integracoes
As exportacoes ficam em endpoints diretos:

- CSV para operacao e auditoria;
- PDF simples para conferencia/compartilhamento.

As integracoes bancarias entram como cadastros sandbox/API-ready. A conexao real com banco externo fica preparada por provider/status/ultima sincronizacao, sem depender de credenciais reais nesta fase.

## 5. Criterios de Aceite
- A aba Avancado aparece na navegacao financeira.
- Regras automaticas podem ser criadas/listadas.
- Pagamentos pendentes podem ser aprovados com auditoria.
- Comprovantes podem ser registrados como anexos.
- Auditoria mostra decisoes recentes.
- Exportacoes CSV/PDF respondem por endpoint.
- Integracoes bancarias sandbox podem ser registradas.
- Testes cobrem contrato backend e fluxo principal da UI.
