# Financeiro Chat Continuo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Whisper Finance de painel de resposta única em uma conversa contínua, com memória visual e follow-ups assertivos.

**Architecture:** A UI passa a manter uma thread local de mensagens visíveis. Cada chamada ao assistente recebe um resumo estruturado da thread anterior, incluindo sugestões e ações prontas, para resolver referências como "então crie", "faz isso" e "sim".

**Tech Stack:** React, TypeScript, Vitest, backend financeiro existente.

---

### Task 1: Thread Local do Whisper

**Files:**
- Modify: `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`

- [ ] Criar um tipo local `ThreadMessage` com mensagens de usuário, resposta do assistente, execução e erro.
- [ ] Substituir a visão baseada só em `plan` por uma lista `threadMessages`.
- [ ] Manter `plan` para execução do plano atual, mas renderizar histórico completo.

### Task 2: Contexto Assertivo

**Files:**
- Modify: `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`

- [ ] Alimentar `conversation_context` a partir das últimas mensagens visíveis.
- [ ] Incluir sugestões, breakdown e ações prontas no resumo da mensagem do assistente.
- [ ] Quando uma sugestão for clicada, enviar uma frase contextual, não apenas o rótulo seco.

### Task 3: UX de Conversa

**Files:**
- Modify: `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`
- Modify: `apps/frontend/src/finance/finance-whisper.css`

- [ ] Mostrar perguntas e respostas em ordem.
- [ ] O input inferior deve continuar a conversa sem limpar respostas anteriores.
- [ ] A resposta mais recente pode continuar com hero, composição, insights e botões.
- [ ] Execuções de ações devem aparecer como evento na thread.

### Task 4: Testes

**Files:**
- Modify: `apps/frontend/src/finance/__tests__/FinanceWhisperFlow.test.tsx`

- [ ] Testar que uma pergunta seguida de follow-up mantém as duas perguntas na tela.
- [ ] Testar que o follow-up envia `conversation_context` com resposta anterior.
- [ ] Testar clique em sugestão enviando texto contextual.

### Task 5: Verificação

**Commands:**
- `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/frontend -- FinanceWhisperFlow.test.tsx`
- `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build -w apps/frontend`
- `git diff --check`
