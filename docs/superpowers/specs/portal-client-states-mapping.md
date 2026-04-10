# Mapeamento de Estados Portal Cliente

## Chamados
- `Aberto` -> `Recebido`
- `Em_andamento` + coluna com "anál"/"anal" -> `Em análise`
- `Em_andamento` + coluna com "andamento" -> `Em execução`
- `Em_andamento` + coluna com "aguard" -> `Aguardando cliente`
- `Resolvido` ou `Fechado` -> `Resolvido`

## Observações
- O portal sempre exibe o estado externo (`client_status`) para preservar clareza ao cliente.
- O estado interno do Kanban permanece restrito ao ambiente operacional interno.
