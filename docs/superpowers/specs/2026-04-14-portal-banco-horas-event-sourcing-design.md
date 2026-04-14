# Design: Banco de Horas Event-Driven (Portal do Cliente + Operação Interna)

## 1. Resumo
Este design implementa um modelo state-of-the-art para banco de horas com Event Sourcing no ecossistema do portal Holand, mantendo UX premium e lógica auditável.

A solução separa claramente:
- visão do cliente (simples, objetiva e sem ruído);
- operação interna (controle completo, ajustes, confirmação de sugestões e análise de eficiência);
- trilha de auditoria imutável (sem sobrescrever histórico).

## 2. Contexto e Objetivo
Objetivo principal: permitir controle de saldo operacional por cliente com base contratual automática, consumo por execução real e ajustes internos seguros.

Regras de negócio já validadas:
- Banco de horas em modo híbrido: contrato automático + ajuste manual por lançamento.
- Ajuste manual sempre por crédito/débito (sem edição direta de saldo).
- Classificação de módulo no cadastro (`ministrado` ou `entregavel`).
- Treinamentos (`ministrado`) consumem banco do cliente.
- Entregáveis não consomem banco do cliente no portal, mas geram horas internas reais.
- Sugestões automáticas de crédito/débito exigem confirmação manual antes de impactar saldo.

## 3. Abordagens Consideradas
### A) Runtime sem trilha formal
Prós: entrega rápida.
Contras: frágil, pouca auditabilidade, alto risco de inconsistência.

### B) Ledger tradicional com sugestões
Prós: bom equilíbrio.
Contras: menos flexível para evolução futura complexa.

### C) Event Sourcing + Projeções (escolhida)
Prós: máxima rastreabilidade, idempotência, replay e evolução sem retrabalho estrutural.
Contras: modelagem inicial maior.

## 4. Escopo e Decomposição
Este trabalho será executado em subfases independentes, dentro de um único eixo funcional (banco de horas + execução + projeções):
- Subprojeto 1: fundação de eventos e projeções de saldo.
- Subprojeto 2: UX no portal (card de horas + planejamento coerente).
- Subprojeto 3: UX interna (sugestões, confirmações, ajustes manuais, extrato).
- Subprojeto 4: calendário com vínculo a módulo/entregável e worklog interno.
- Subprojeto 5: indicadores internos de eficiência.

## 5. Arquitetura (C)
### 5.1 Event Store
Novo armazenamento imutável de eventos de domínio:
- cada fato é append-only;
- cada evento tem autor, data, origem e correlação;
- nenhuma alteração de saldo por update direto.

Campos mínimos:
- `id`
- `aggregate_type` (`company_hours_account`, `module_scope`, `deliverable_worklog`)
- `aggregate_id`
- `company_id`
- `event_type`
- `payload_json`
- `idempotency_key`
- `actor_type` (`system`, `operator`, `portal_client`)
- `actor_id`
- `correlation_id`
- `occurred_at`
- `created_at`

### 5.2 Processador de eventos
Um processador aplica regras de domínio e escreve projeções de leitura.

Responsabilidades:
- aplicar eventos em ordem;
- garantir idempotência por `idempotency_key`;
- reprocessar projeções quando necessário (replay controlado).

### 5.3 Read Models
Projeções denormalizadas para resposta rápida na UI:
- `client_hours_balance_view`
- `client_hours_ledger_view`
- `client_hours_pending_adjustments_view`
- `portal_planning_view` (compatível com regras atuais + novos campos)
- `internal_efficiency_hours_view`

## 6. Modelo de Domínio
### 6.1 Tipos de módulo
No `module_template`:
- `delivery_mode`: `ministrado | entregavel`
- `client_hours_policy`: `consome | nao_consume`

Política padrão:
- `ministrado` => `consome`
- `entregavel` => `nao_consume`

### 6.2 Eventos de domínio
Eventos centrais:
- `module_scope_defined`
- `module_scope_adjusted`
- `training_encounter_planned`
- `training_encounter_completed`
- `hours_adjustment_suggested`
- `hours_adjustment_confirmed`
- `hours_adjustment_rejected`
- `hours_manual_adjustment_added`
- `deliverable_worklog_logged`
- `deliverable_status_changed`

## 7. Regras de Cálculo
### 7.1 Banco de horas do cliente
- Saldo base contratado nasce automaticamente por escopo.
- Consumo oficial por treinamento concluído:
  - turma `Integral` => 8h por encontro/diária;
  - turma `Meio_periodo` => 4h por encontro.

### 7.2 Sugestões automáticas (híbrido)
Quando houver redução de escopo/plano, sistema gera `hours_adjustment_suggested`.

Comportamento:
- fica pendente;
- não altera saldo imediatamente;
- saldo só muda após `hours_adjustment_confirmed` por operador;
- `hours_adjustment_rejected` mantém saldo inalterado.

### 7.3 Ajuste manual
- sempre via lançamento (`+/- horas`, motivo obrigatório);
- gera `hours_manual_adjustment_added`;
- compõe saldo com trilha completa.

### 7.4 Entregáveis
- não consomem banco de horas no portal do cliente;
- horas reais registradas no calendário geram `deliverable_worklog_logged`;
- impactam apenas visão interna de eficiência.

## 8. Fluxos UX/UI
### 8.1 Portal cliente (premium e objetivo)
Na aba Planejamento:
- Card de banco de horas com:
  - `Disponível (h)`
  - `Consumido (h)`
  - `Saldo (h)`
  - `Diárias restantes`
- microcopy curta e clara;
- status de entregáveis sem expor horas internas;
- tipografia Inter, tokens oficiais (`#1D2830`, `#EF2F0F`, neutros), consistência com agenda/suporte.

### 8.2 Operação interna
Nova seção de gestão de horas:
- saldo consolidado por cliente;
- sugestões pendentes (confirmar/rejeitar);
- lançamentos manuais de ajuste;
- extrato/ledger cronológico;
- comparação previsto vs real.

### 8.3 Calendário (fonte oficial para entregáveis)
Ao criar atividade com cliente:
- campo opcional de vínculo a módulo/entregável;
- captura de início/fim real;
- prévia de horas calculadas;
- grava evento de worklog interno.

## 9. Data Flow
1. Mudança de escopo/planejamento/execução gera evento.
2. Engine processa e cria sugestão pendente quando aplicável.
3. Projeções atualizam painel interno e portal.
4. Operador confirma/rejeita sugestão.
5. Confirmação gera novo evento e atualiza saldo final.

## 10. Erros e Resiliência
- Duplicidade: bloqueio por `idempotency_key`.
- Ordem de eventos: processamento sequencial por aggregate.
- Falha em projeção: replay disponível sem perda de eventos.
- Regra de validação:
  - motivo obrigatório em ajustes manuais;
  - rejeição de payload inválido;
  - proteção para não quebrar UX em ausência parcial de projeção.

## 11. Estratégia de Testes
### 11.1 Unidade
- cálculo integral/meio período;
- geração de sugestão;
- confirmação/rejeição;
- cálculo de saldo final.

### 11.2 Integração
- append de evento -> projeção correta;
- replay total -> mesmo saldo final;
- calendário vinculado -> worklog interno sem consumir cliente.

### 11.3 E2E
- cliente vê card e números corretos;
- operador confirma sugestão e UI reflete imediatamente;
- entregáveis exibem status cliente + horas internas no painel interno.

### 11.4 Visual/UI
- consistência tipográfica e de componentes entre Planejamento, Agenda e Suporte;
- regressão visual dos cards/chips/tabelas.

## 12. Seção 5 — Roadmap de Execução (MVP -> Estado da Arte)
### Fase 1: Fundação de eventos
- criar event store, contratos de evento e processador idempotente.

### Fase 2: Projeções de saldo
- materializar saldo do cliente, extrato e pendências.

### Fase 3: Planejamento + card no portal
- publicar card de banco de horas no portal com linguagem premium e leitura simples.

### Fase 4: Painel interno de decisão
- tela para confirmar/rejeitar sugestões e lançar créditos/débitos manuais com motivo.

### Fase 5: Calendário vinculado a entregáveis
- registrar tempo real interno com vínculo opcional por cliente/módulo.

### Fase 6: Eficiência interna
- visões por cliente, módulo e tipo de atividade.

### Fase 7: Hardening
- replay tooling, observabilidade, smoke tests automatizados e verificação de consistência.

## 13. Critérios de Sucesso
- saldo do cliente auditável de ponta a ponta (100% por eventos);
- zero edição direta de saldo;
- cliente enxerga visão simples e confiável;
- operação interna consegue confirmar sugestões e ajustar com histórico;
- horas de entregáveis disponíveis para análise interna sem poluir visão do cliente.

## 14. Fora de Escopo (nesta entrega de design)
- faturamento/financeiro automático;
- integrações externas de cobrança;
- reprecificação de contrato.

