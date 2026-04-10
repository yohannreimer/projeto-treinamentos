# Design Spec — Portal Cliente Premium Holand (Abordagem B)

Data: 2026-04-08  
Status: Aprovado em brainstorming, pronto para planejamento de implementação  
Direção visual: Precision Premium (modo claro)

## 1. Contexto e Objetivo
Criar uma área cliente premium em `/portal/{slug}` para que cada empresa acompanhe planejamento, agenda e suporte da própria operação, com autenticação dedicada e integração automática com o Kanban interno de suporte.

Objetivos de negócio:
- aumentar transparência para clientes sem expor complexidade interna;
- reduzir atrito no contato de suporte;
- manter consistência da identidade visual Holand em experiência externa de alto padrão.

## 2. Escopo Aprovado (V1)
Incluído:
- URL por cliente: `/portal/{slug}`;
- login por `usuário + senha` (1 usuário por cliente na v1);
- home com foco operacional;
- visão de planejamento nível 2 (status + previsão por serviço/módulo);
- agenda do cliente;
- abertura e acompanhamento de chamados;
- criação automática de card no Kanban interno de suporte.

Excluído da v1:
- múltiplos usuários por cliente;
- perfis de permissão por cliente;
- login mágico/SSO;
- planejamento nível 3 completo;
- app separado (abordagem C).

## 3. Decisões de Produto
- abordagem escolhida: **B** (portal isolado logicamente no mesmo produto);
- fluxo de valor: **Consulta + Suporte**;
- URL padrão: **`/portal/{slug}`**;
- autenticação v1: **usuário + senha**;
- home do cliente: **Planejamento + Agenda + Chamados**;
- planejamento v1: **nível 2**, preparado para evolução ao nível 3.

## 4. Abordagens Consideradas
### 4.1 A) Portal dentro do app atual (rápida)
Prós:
- menor esforço inicial.

Contras:
- maior risco de acoplamento entre interno e externo.

### 4.2 B) Portal lógico isolado no mesmo backend (escolhida)
Prós:
- bom equilíbrio entre velocidade e governança;
- fronteiras claras para evolução;
- reduz risco de exposição indevida de contexto interno.

Contras:
- exige disciplina de separação de rotas/sessão/permissões.

### 4.3 C) Produto cliente separado
Prós:
- isolamento máximo e melhor autonomia para escalar.

Contras:
- maior custo e prazo para v1.

## 5. Arquitetura de Solução (B)
### 5.1 Frontend
- rotas exclusivas do portal sob `/portal/*`;
- layout e componentes dedicados à experiência cliente;
- sessão do portal independente da sessão interna.

### 5.2 Backend
- namespace dedicado para portal: `/portal/api/*`;
- endpoints internos existentes não são expostos diretamente no portal;
- cada endpoint do portal resolve escopo de tenant a partir da sessão autenticada.

### 5.3 Multi-tenant lógico
- identidade do cliente resolvida por `slug`;
- sessão carrega `company_id` autorizado;
- todas consultas do portal filtram obrigatoriamente por `company_id`.

### 5.4 Integração Suporte
- chamado aberto no portal gera card automático no Kanban interno;
- card nasce com metadados de origem portal e vínculo com cliente;
- portal consome status externo simplificado sem campos internos sensíveis.

## 6. Modelo de Dados (V1)
### 6.1 Tabela `portal_client`
- `id`
- `company_id` (1:1 com cliente)
- `slug` (único)
- `is_active`
- `created_at`, `updated_at`

### 6.2 Tabela `portal_user`
- `id`
- `portal_client_id`
- `username` (único por cliente)
- `password_hash`
- `last_login_at`
- `is_active`
- `created_at`, `updated_at`

### 6.3 Tabela `portal_ticket`
- `id`
- `company_id`
- `portal_user_id`
- `title`
- `description`
- `priority` (`Baixa|Normal|Alta|Critica`)
- `status` (`Aberto|Em_andamento|Resolvido|Fechado`)
- `origin` (`portal_cliente`)
- `kanban_card_id`
- `created_at`, `updated_at`, `closed_at`

## 7. Autenticação e Permissões
Fluxo:
1. usuário entra em `/portal/{slug}/login`;
2. backend valida `slug` ativo e credencial;
3. senha é validada por hash seguro (`bcrypt` ou `argon2`);
4. sessão/token é emitido com escopo `portal_client`.

Regras:
- sessão interna e sessão portal são separadas;
- portal nunca confia em `company_id` enviado pelo frontend;
- todo acesso de dados usa `company_id` da sessão;
- endpoints internos não atendem sessão de portal.

## 8. UX/UI Premium
### 8.1 Direção visual
- tipografia: `Inter` (Bold/ExtraBold em títulos, Regular/Medium em conteúdo);
- paleta principal:
  - `brand-ink`: `#1D2830`
  - `brand-accent`: `#EF2F0F`
  - `neutral-100`: `#FFFFFF`
  - `neutral-300`: `#D7D7D7`
  - `neutral-900`: `#000000`
- base clara premium; vermelho apenas para ação primária e urgência real;
- elementos de seta como acentos pontuais de seção/progresso.

### 8.2 Princípios de experiência
- visual sofisticado, porém silencioso e operacional;
- lógica centrada em “o que aconteceu / o que falta / o que fazer agora”;
- microcopy orientado a decisão e próxima ação;
- consistência total entre estados e padrões de interface.

## 9. Arquitetura de Informação (Portal)
Navegação:
1. `Visão Geral`
2. `Planejamento`
3. `Agenda`
4. `Chamados`

### 9.1 Visão Geral
- KPIs operacionais do cliente;
- próximos marcos;
- resumo de chamados ativos;
- CTA prioritário “Abrir chamado”.

### 9.2 Planejamento (nível 2)
- lista/timeline de serviços ou módulos;
- status e previsão por item;
- progresso global e filtros simples;
- preparado para expansão ao nível 3.

### 9.3 Agenda
- modo lista e calendário;
- foco em próximos eventos;
- ação “Solicitar ajuste” abre chamado contextual.

### 9.4 Chamados
- lista com filtros essenciais;
- abertura de chamado com baixa fricção;
- detalhe com timeline de atualizações.

## 10. Fluxo de Suporte Ponta a Ponta
1. cliente abre chamado no portal;
2. sistema cria card automático no Kanban interno (coluna inicial `A fazer`);
3. metadados automáticos: origem portal, cliente, prioridade, timestamp;
4. operação atualiza card internamente;
5. portal exibe status externo simplificado.

Estados externos ao cliente:
- `Recebido`
- `Em análise`
- `Em execução`
- `Aguardando cliente`
- `Resolvido`

Mapeamento interno-externo (fixo na v1):
- `Aberto` -> `Recebido`
- `Em_andamento` -> `Em análise` ou `Em execução` (definido por regra de coluna no Kanban)
- `Resolvido` -> `Resolvido`
- `Fechado` -> `Resolvido`

Regra: o cliente nunca visualiza nomenclatura técnica interna; sempre recebe o estado externo padronizado.

## 11. Segurança e Confiabilidade (V1)
- hash de senha robusto;
- rate limit de login por slug;
- bloqueio temporário após tentativas inválidas;
- auditoria de eventos críticos (login, abertura de chamado, mudanças de status);
- validações de autorização em todos endpoints do portal.

## 12. Métricas de Sucesso
- adoção: percentual de clientes ativos no portal;
- eficiência: tempo para abrir chamado (<2 minutos);
- atendimento: tempo para primeira resposta e resolução;
- consistência: percentual de chamados com status sincronizado;
- percepção: teste de primeira impressão “premium + confiável”.

## 13. Riscos e Mitigações
- risco: vazamento entre clientes.  
  mitigação: filtro obrigatório por `company_id` via sessão + testes de autorização.

- risco: interface bonita, mas confusa.  
  mitigação: IA enxuta e priorização de ação principal por tela.

- risco: desalinhamento entre status interno e status exibido ao cliente.  
  mitigação: tabela de mapeamento única de estados e transições válidas.

- risco: evolução futura custosa.  
  mitigação: manter fronteiras de extração para futura abordagem C.

## 14. Roadmap
1. v1: portal com login, visão geral, planejamento nível 2, agenda e chamados integrados ao Kanban.
2. v1.1: refinamento premium de microinterações, mobile e performance percebida.
3. v2: planejamento nível 3 e múltiplos usuários por cliente.
4. v3: avaliar extração para abordagem C (app cliente separado), se necessário.

## 15. Critérios de Aceite
1. cliente acessa somente `/portal/{slug}` do próprio tenant.
2. cliente vê apenas seus dados.
3. abertura de chamado cria card interno automaticamente.
4. mudanças de status internas refletem no portal.
5. planejamento e agenda possuem leitura premium em desktop e mobile.
6. contraste e acessibilidade em padrão AA.
7. fluxos críticos validados: login, abertura de chamado, acompanhamento de status.

## 16. Próximo Passo
Com este design aprovado e documentado, o próximo passo é elaborar o plano de implementação detalhado com o skill `writing-plans`.

## 17. Notas de Implementação (2026-04-09)
Status da execução nesta branch:
- backend:
  - auth portal com hash `scrypt`, sessão própria, middleware tenant e rate limit de login;
  - rotas `/portal/api/me`, `/portal/api/overview`, `/portal/api/planning`, `/portal/api/agenda`;
  - bridge de chamados: `POST/GET /portal/api/tickets` com criação atômica de card no Kanban interno;
  - provisionamento interno por cliente:
    - `GET /companies/:id/portal-access`
    - `PUT /companies/:id/portal-access`
  - garantias de isolamento:
    - triggers de consistência tenant em `portal_session` e `portal_ticket`;
    - testes cobrindo escopo por `company_id`.
- frontend:
  - área cliente em `/portal/:slug/*` com shell dedicado;
  - páginas:
    - `Visão Geral`
    - `Planejamento`
    - `Agenda`
    - `Chamados`
  - login do portal com sessão local separada da sessão interna;
  - seção de provisionamento no detalhe do cliente para slug/usuário/senha/status;
  - polimento visual premium no tema claro, seguindo paleta Holand.
- testes:
  - backend e frontend com suites automatizadas verdes na data de execução.
