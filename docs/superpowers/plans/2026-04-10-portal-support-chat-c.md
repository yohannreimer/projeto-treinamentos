# Portal Support Chat C (State of the Art) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar suporte portal com experiência premium de chat em popup, realtime bidirecional, trilha de status operacional visível e disparo webhook inteligente com cooldown/unread.

**Architecture:** Expandir o backend portal com modelo de conversa por ticket (read state por lado, log de eventos e fila de notificação) e integrar WebSocket nativo para presença, typing, novas mensagens, leitura e mudança de workflow. No frontend, transformar a seção de suporte em inbox + modal overlay estilo mensageria, com UX de alto nível para cliente e operador interno.

**Tech Stack:** Node.js + Express + better-sqlite3 + Zod + ws (backend), React + Vite + CSS (frontend), node:test + Vitest.

---

## File Structure and Responsibilities

### Backend
- Modify: `apps/backend/src/db.ts`
  Responsabilidade: schema novo de conversa/notificação (read state, webhook queue/log, contato WhatsApp por ticket).
- Modify: `apps/backend/src/portal/routes.ts`
  Responsabilidade: endpoints de thread/read/workflow com eventos realtime + webhook queue + edição operador.
- Modify: `apps/backend/src/portal/realtime.ts`
  Responsabilidade: eventos de presença/typing/mensagem/read/workflow com rooms por ticket.
- Modify: `apps/backend/src/portal/types.ts` (se necessário)
  Responsabilidade: contratos de thread/ticket estendidos.
- Modify: `apps/backend/src/portal/*.test.ts`
  Responsabilidade: cobrir conversa ticket, status workflow e leitura.

### Frontend
- Modify: `apps/frontend/src/portal/types.ts`
  Responsabilidade: tipos de chat/read/workflow/whatsapp.
- Modify: `apps/frontend/src/portal/api.ts`
  Responsabilidade: endpoints novos (read, update ticket details, thread metadata).
- Modify: `apps/frontend/src/portal/pages/PortalTicketsPage.tsx`
  Responsabilidade: inbox + popup modal de conversa + realtime + UX premium.
- Modify: `apps/frontend/src/styles.css`
  Responsabilidade: visual premium da experiência de suporte/chat.
- Modify: `apps/frontend/src/portal/__tests__/PortalTicketsPage.test.tsx`
  Responsabilidade: validação de render principal e interação básica do novo fluxo.

---

### Task 1: Foundation de Dados e Contratos

**Files:**
- Modify: `apps/backend/src/db.ts`
- Modify: `apps/frontend/src/portal/types.ts`
- Modify: `apps/frontend/src/portal/api.ts`

- [ ] **Step 1: Adicionar colunas/tabelas de C no banco**
- [ ] **Step 2: Expor contratos de ticket/thread com campos novos (workflow, unread, contato WhatsApp, read markers)**
- [ ] **Step 3: Ajustar client API para novos endpoints**
- [ ] **Step 4: Build backend/frontend**
Run: `npm run build -w apps/backend && npm run build -w apps/frontend`
Expected: PASS.

### Task 2: Backend de Conversa Realtime + Webhook Cooldown

**Files:**
- Modify: `apps/backend/src/portal/routes.ts`
- Modify: `apps/backend/src/portal/realtime.ts`
- Modify: `apps/backend/src/portal/auth.ts` (se necessário)

- [ ] **Step 1: Implementar leitura/não lido por lado no ticket**
- [ ] **Step 2: Transformar `kcard-*` em thread virtual editável pelo operador (sem quebrar legado)**
- [ ] **Step 3: Emitir eventos WS em mensagem/read/workflow**
- [ ] **Step 4: Criar fila webhook com regra anti-spam (cooldown 10 min e supressão quando lido)**
- [ ] **Step 5: Expor payload webhook para integração Evolution API**
- [ ] **Step 6: Rodar testes backend**
Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend`
Expected: PASS.

### Task 3: Modo Operador Completo no Portal

**Files:**
- Modify: `apps/backend/src/portal/routes.ts`
- Modify: `apps/frontend/src/portal/pages/PortalPlanningPage.tsx`
- Modify: `apps/frontend/src/portal/pages/PortalAgendaPage.tsx`
- Modify: `apps/frontend/src/portal/pages/PortalTicketsPage.tsx`

- [ ] **Step 1: Garantir edição operador para módulos/status/data e agenda manual**
- [ ] **Step 2: Permitir ações de suporte no operador (workflow + mensagens + anexos + metadados ticket)**
- [ ] **Step 3: Garantir mão única de curadoria visual (não reescrever fonte operacional por acidente)**
- [ ] **Step 4: Build e smoke local**
Run: `npm run build -w apps/backend && npm run build -w apps/frontend`
Expected: PASS.

### Task 4: UX Premium de Chat (Popup Overlay)

**Files:**
- Modify: `apps/frontend/src/portal/pages/PortalTicketsPage.tsx`
- Modify: `apps/frontend/src/styles.css`

- [ ] **Step 1: Trocar seção de thread por modal overlay estilo mensageria**
- [ ] **Step 2: Implementar indicadores de presença, typing e unread na lista**
- [ ] **Step 3: Adicionar campo WhatsApp opcional no fluxo de abertura do suporte**
- [ ] **Step 4: Ajustar estados vazios, loading e erro com microcopy premium**
- [ ] **Step 5: Rodar testes frontend**
Run: `npm run test -w apps/frontend`
Expected: PASS.

### Task 5: Validação Final e Entrega

**Files:**
- Modify: `apps/backend/src/portal/auth.test.ts`
- Modify: `apps/backend/src/portal/tickets.test.ts`
- Modify: `apps/frontend/src/portal/__tests__/PortalTicketsPage.test.tsx`

- [ ] **Step 1: Cobrir cenários críticos (mensagem, anexo, workflow, read/unread, webhook enqueue)**
- [ ] **Step 2: Rodar validação completa**
Run: `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run test -w apps/backend && npm run test -w apps/frontend && npm run build -w apps/backend && npm run build -w apps/frontend`
Expected: PASS.
- [ ] **Step 3: Commit com escopo C completo**
Run: `git add ... && git commit -m "feat(portal): suporte realtime premium com webhook inteligente"`

---

## Self-Review (Plan)
- Cobertura do spec: inclui popup conversa, realtime, workflow visível, webhook com cooldown/unread, WhatsApp opcional e operação interna.
- Sem placeholders críticos: todas as tasks têm saída objetiva e validação associada.
- Consistência: backend e frontend usam o mesmo núcleo semântico (ticket/thread/workflow/read).
