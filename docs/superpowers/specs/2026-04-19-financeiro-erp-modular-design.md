# Design: ERP Financeiro Modular (V1 Completo, Multiempresa, Pronto para Escala Brasil)

## 1. Resumo Executivo
Este design define a evolução do Orquestrador para um **ERP modular** com um novo **workspace de Financeiro** integrado ao produto atual.

Objetivo do V1:
- entregar um financeiro completo e operacional (sem depender de planilha);
- suportar **multiempresa real** (tenant isolado);
- incluir **Billing SaaS opcional por empresa**;
- operar em modelo **híbrido (Caixa + Competência)**;
- manter UX premium e consistência visual da marca Holand.

Objetivo estratégico:
- construir base sólida para comercialização futura em escala;
- preparar o caminho para integração fiscal brasileira (NF/tributário/SPED) em fases posteriores, sem retrabalho estrutural.

## 2. Contexto e Visão de Produto
O sistema atual já resolve operação técnica (calendário, turmas, clientes, suporte, banco de horas). O próximo salto é um módulo financeiro robusto, integrado ao mesmo produto, com mesma identidade visual e governança.

Diretriz aprovada:
- no menu atual, entrada por `Administração > Financeiro`;
- ao entrar, abre um **workspace financeiro dedicado** (sidebar própria de financeiro);
- botão claro de navegação cruzada: `Voltar para Operações`.

## 3. Escopo V1 (Aprovado)
### 3.1 Incluído
- Multiempresa real (isolamento por tenant).
- Finance Core completo:
  - Movimentações manuais (entradas, saídas, transferências, ajustes).
  - Contas a pagar/receber (incl. recorrência e parcelas).
  - Conciliação com importação **OFX**.
  - Importação manual **CSV/Excel**.
  - Orçamento vs realizado.
  - DRE gerencial.
  - Projeção de caixa 90 dias.
  - Gestão de dívidas.
  - Anexos e trilha de auditoria.
- Billing SaaS opcional por tenant.
- RBAC e auditoria natural-language.

### 3.2 Fora de escopo V1
- integração bancária via API direta;
- emissão de NF (NFS-e/NF-e);
- apuração fiscal automatizada avançada e SPED;
- CRM e pipeline comercial (entrará em V1.1/V2).

## 4. Abordagens Consideradas
### A) Operacional puro (rápida)
Prós: entrega acelerada.
Contras: risco alto de dívida técnica para fiscal e escala de produto.

### B) Híbrida orientada a ledgers (**escolhida**)
Prós: equilíbrio ideal entre velocidade e robustez; auditável; modular por tenant.
Contras: modelagem inicial maior que a abordagem A.

### C) Contábil-first extremo
Prós: máxima formalidade desde o dia 1.
Contras: prazo/custo altos para alcançar valor prático rápido.

## 5. Arquitetura de Produto e Navegação
## 5.1 Estrutura de navegação
Novo workspace com sidebar financeira:
1. Visão Geral
2. Movimentações
3. Contas a Receber
4. Contas a Pagar
5. Conciliação
6. Orçamento vs Realizado
7. DRE
8. Projeção 90 dias
9. Dívidas
10. Billing SaaS (se módulo ativo)
11. Configurações Financeiras

No topo:
- Empresa ativa
- Período
- Visão (Caixa | Competência | Híbrida)
- CTA `Voltar para Operações`

## 5.2 Plataforma modular por tenant
- `module_registry`: catálogo de módulos da plataforma.
- `company_module_activation`: ativa/desativa por empresa.
- Billing SaaS será módulo opcional, sem obrigar uso para empresas que não operam por assinatura.

## 6. Modelo de Domínio e Dados
## 6.1 Entidades de plataforma
- `companies`
- `users`, `roles`, `permissions`, `user_company_access`
- `module_registry`, `company_module_activation`
- `audit_log`

## 6.2 Entidades Finance Core
- `chart_of_accounts`
- `cost_centers`
- `financial_categories`
- `bank_accounts` / `cash_accounts`
- `financial_transactions`
- `receivables`
- `payables`
- `recurrence_rules`
- `attachments`
- `debts`
- `budget_lines`
- `cashflow_projection_snapshots`
- `import_jobs`, `import_rows_staging`, `bank_statement_entries`, `reconciliation_matches`

## 6.3 Entidades Billing SaaS (opcional)
- `billing_plans`
- `subscriptions`
- `invoices`
- `invoice_items`
- `billing_events`

## 6.4 Princípio contábil-operacional
Sem edição direta de saldo. Toda alteração é via lançamento/evento auditável com origem.

## 7. Regras de Cálculo (Canônicas)
## 7.1 Caixa x Competência x Híbrida
- **Caixa**: contabiliza no `settlement_date` (pagamento/recebimento).
- **Competência**: contabiliza no `due_date`/período econômico.
- **Híbrida**: mostra ambos em paralelo (controle executivo).

Cada título/lançamento deve suportar:
- `issue_date`
- `due_date`
- `settlement_date`
- `status`: `planned | open | partial | settled | overdue | canceled`

## 7.2 Projetado x Confirmado
- **Projetado** = confirmados + obrigações/recebimentos futuros válidos.
- **Confirmado** = somente realizado/efetivado.
- Ajuste manual estrutural de saldo impacta leitura projetada e confirmada conforme regra de negócio configurável por tenant (padrão: ambos).

## 7.3 Conciliação
- OFX gera staging de extrato.
- Motor sugere match por valor/data/contraparte.
- Operador confirma, corrige ou cria lançamento faltante.
- Idempotência para evitar duplicidade em reimportações.

## 8. Fluxos Críticos End-to-End
1. **Lançamento manual rápido**
   - criar -> classificar -> salvar -> refletir nos cards e relatórios.
2. **Ciclo de título (pagar/receber)**
   - emitir -> vencer -> liquidar (total/parcial) -> atualizar caixa/competência.
3. **Import OFX + conciliação**
   - upload -> staging -> sugestão -> confirmação.
4. **Fechamento gerencial mensal**
   - snapshot de DRE/KPIs, período com governança e exportação.
5. **Projeção e cenário**
   - cenários sem sujar dado real; possibilidade de converter cenário em ação real.
6. **Billing por tenant ativo**
   - ciclo assinatura/fatura/status alimenta financeiro automaticamente.

## 9. UX/UI Premium (Diretrizes)
- Fonte única: **Inter**.
- Tokens de marca Holand (ink/accent/neutros) e sem excesso de gradiente.
- Densidade compacta/confortável reaproveitada do app atual.
- Tabelas com filtros persistentes, ações estáveis e drill-down de origem.
- Estados vazios orientados por ação.
- Feedback confiável: última conciliação, último fechamento, pendências críticas.
- Vermelho apenas para risco/ação crítica; verde apenas para confirmação positiva.

## 10. Segurança, Permissões e Auditoria
Permissões granulares:
- `finance.read`
- `finance.write`
- `finance.approve`
- `finance.reconcile`
- `finance.close`
- `finance.billing`

Auditoria obrigatória para ações críticas:
- criar/editar/excluir lançamento
- baixar título
- conciliar/desconciliar
- ajuste manual
- fechamento de período
- ativação/desativação de módulo financeiro/billing

Formato de auditoria:
- linguagem natural para gestão
- detalhe técnico para investigação
- retenção operacional 30 dias + export CSV

## 11. Performance e Confiabilidade
- Read models/materializações para dashboards e DRE.
- Jobs assíncronos para importações/reprocessos pesados.
- Chaves de idempotência em importações e eventos sensíveis.
- Timezone e calendário financeiro consistentes por tenant.

## 12. Rollout e Migração da Planilha
Fase de transição recomendada:
1. Mapeamento de abas da planilha para entidades do sistema.
2. Import assistido de histórico essencial (12-24 meses).
3. Operação paralela 2-4 semanas (planilha vs sistema).
4. Go-live: sistema vira fonte oficial.
5. Pós-go-live: ajuste fino de categorias/contas/permissões.

## 13. Roadmap de Entrega
### Fase 1 — Fundação Finance Core
- modelos de dados base, permissões, auditoria, navegação financeira.

### Fase 2 — Operação diária
- movimentações, pagar/receber, recorrências, anexos.

### Fase 3 — Conciliação e imports
- CSV/Excel/OFX + fluxo de conciliação.

### Fase 4 — Controladoria
- DRE, orçamento vs realizado, KPIs.

### Fase 5 — Projeção e dívida
- projeção 90 dias, cenários e gestão de dívidas.

### Fase 6 — Billing opcional
- planos, assinaturas, faturas e eventos para tenants com módulo ativo.

### Fase 7 — Hardening
- observabilidade, smoke tests, validação de consistência e tuning de performance.

## 14. Critérios de Sucesso do V1
- operação financeira diária sem planilha como fonte principal;
- DRE e fluxo de caixa confiáveis em modo híbrido;
- conciliação OFX funcional e auditável;
- multiempresa real com isolamento e módulos por tenant;
- Billing SaaS opcional funcionando em tenants ativados;
- UX premium consistente com o restante do produto.

## 15. Riscos e Mitigações
- **Risco**: complexidade de regras financeiras por tenant.
  - Mitigação: convenções canônicas + validações centrais.
- **Risco**: divergência entre importação e lançamentos manuais.
  - Mitigação: idempotência + tela de reconciliação explícita.
- **Risco**: escopo excessivo no V1.
  - Mitigação: fases fechadas e critérios de aceite por fase.

## 16. Evolução Pós-V1 (Estratégica)
- integração bancária por API (Open Finance/bancos parceiros);
- emissão fiscal (NFS-e/NF-e);
- SPED e apuração tributária avançada;
- integração com módulo CRM/pipeline comercial;
- expansão de módulos por vertical (software, serviços, varejo).
