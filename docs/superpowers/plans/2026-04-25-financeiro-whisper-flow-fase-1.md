# Financeiro Whisper Flow Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Whisper Flow layer: a voice-first floating assistant that interprets financial commands, shows a confirmable action preview, and executes safe actions through existing finance APIs.

**Architecture:** Add a backend assistant layer that turns transcript text into structured, auditable plans, stores pending plans, and executes only confirmed plans. Add a frontend floating voice layer mounted inside `FinanceWorkspace`, using browser speech recognition for the first MVP with text fallback, then calling the backend `interpret` and `execute` endpoints.

**Tech Stack:** Express + Zod + SQLite/better-sqlite3 on backend, React + TypeScript + Vitest on frontend, browser `SpeechRecognition` for MVP voice capture, existing finance APIs for execution.

---

## File Structure

- Create `apps/backend/src/finance/assistant.ts`
  - Owns assistant plan types, deterministic MVP interpretation, plan persistence, and action execution.
- Modify `apps/backend/src/db.ts`
  - Adds `financial_ai_interaction` table for pending/executed/canceled plans.
- Modify `apps/backend/src/finance/routes.ts`
  - Adds `POST /finance/assistant/interpret`, `POST /finance/assistant/plans/:id/execute`, and `POST /finance/assistant/plans/:id/cancel`.
- Modify `apps/backend/src/finance/types.ts`
  - Adds DTO/input types for assistant plans.
- Modify `apps/backend/src/finance/finance.test.ts`
  - Covers interpretation, confirmation execution, permission/risk behavior, and audit persistence.
- Modify `apps/frontend/src/finance/api.ts`
  - Adds assistant API methods and types.
- Create `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`
  - Floating voice-first UI: idle orb, listening orb, transcript fallback, preview, confirmation.
- Create `apps/frontend/src/finance/hooks/useFinanceSpeechRecognition.ts`
  - Thin browser speech-recognition wrapper with graceful fallback.
- Modify `apps/frontend/src/finance/FinanceWorkspace.tsx`
  - Mounts Whisper Flow for finance users.
- Modify `apps/frontend/src/finance/finance.css`
  - Imports Whisper Flow CSS.
- Create `apps/frontend/src/finance/finance-whisper.css`
  - Premium orb/waveform/panel styling.
- Create `apps/frontend/src/finance/__tests__/FinanceWhisperFlow.test.tsx`
  - UI tests for shortcut, text fallback, preview, execute and cancel.

## Out Of Scope For Fase 1

- OpenAI Realtime production voice session.
- File parsing/extratos/boletos.
- Background proactive agent.
- Fully autonomous execution without user confirmation.

## Task 1: Backend Audit Table

**Files:**
- Modify: `apps/backend/src/db.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Write failing schema test**

Add this test near the other finance schema tests in `apps/backend/src/finance/finance.test.ts`:

```ts
test('initDb cria tabela de interações do Whisper Flow financeiro', () => {
  const dbPath = assignTestDbPath('finance-whisper-schema');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb({ force: true, seed: false });

    const columns = db.prepare('pragma table_info(financial_ai_interaction)').all() as Array<{ name: string }>;
    const names = columns.map((column) => column.name);

    assert.ok(names.includes('id'));
    assert.ok(names.includes('organization_id'));
    assert.ok(names.includes('created_by'));
    assert.ok(names.includes('surface_path'));
    assert.ok(names.includes('transcript'));
    assert.ok(names.includes('status'));
    assert.ok(names.includes('plan_json'));
    assert.ok(names.includes('result_json'));
    assert.ok(names.includes('confirmed_at'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run failing backend test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "Whisper Flow"
```

Expected: fails because `financial_ai_interaction` does not exist.

- [ ] **Step 3: Add table in db init**

In `apps/backend/src/db.ts`, inside the finance schema block near other `financial_*` tables, add:

```ts
    create table if not exists financial_ai_interaction (
      id text primary key,
      organization_id text not null,
      company_id text,
      created_by text,
      surface_path text,
      transcript text not null,
      status text not null check(status in ('draft', 'executed', 'canceled', 'failed')),
      risk_level text not null check(risk_level in ('low', 'medium', 'high')),
      plan_json text not null default '{}',
      result_json text not null default '{}',
      error_message text,
      confirmed_at text,
      created_at text not null,
      updated_at text not null,
      unique(organization_id, id),
      foreign key(organization_id) references organization(id) on delete cascade,
      foreign key(company_id) references company(id) on delete cascade
    );
```

Also add index creation near finance indexes:

```ts
    create index if not exists idx_financial_ai_interaction_org_status
      on financial_ai_interaction(organization_id, status, created_at);
```

- [ ] **Step 4: Run schema test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "Whisper Flow"
```

Expected: the schema test passes.

## Task 2: Backend Assistant Plan Types And Interpreter

**Files:**
- Modify: `apps/backend/src/finance/types.ts`
- Create: `apps/backend/src/finance/assistant.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add backend route test for interpretation**

Add this test to `apps/backend/src/finance/finance.test.ts`:

```ts
test('POST /finance/assistant/interpret cria plano confirmável para lançamento por voz', async () => {
  const dbPath = assignTestDbPath('finance-whisper-interpret');
  cleanupDbFiles(dbPath);
  resetDbConnection();
  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceAccountAndCategory();
    createInternalUser({
      username: 'finance.whisper',
      display_name: 'Finance Whisper',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({ username: 'finance.whisper', password: 'Senha#123' });
    assert.equal(loginRes.status, 200);

    const res = await request(app)
      .post('/finance/assistant/interpret')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        transcript: 'lança aluguel de 8000 para dia 15',
        surface_path: '/financeiro/payables'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'draft');
    assert.equal(res.body.plan.actions[0].intent, 'create_payable');
    assert.equal(res.body.plan.actions[0].payload.amount_cents, 800000);
    assert.equal(res.body.plan.requires_confirmation, true);
    assert.match(res.body.plan.human_summary, /aluguel/i);

    const row = db.prepare('select status, transcript from financial_ai_interaction where id = ?').get(res.body.id) as { status: string; transcript: string };
    assert.equal(row.status, 'draft');
    assert.equal(row.transcript, 'lança aluguel de 8000 para dia 15');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "interpret"
```

Expected: fails because `/finance/assistant/interpret` is missing.

- [ ] **Step 3: Add assistant types**

In `apps/backend/src/finance/types.ts`, add:

```ts
export type FinanceAssistantRiskLevel = 'low' | 'medium' | 'high';
export type FinanceAssistantInteractionStatus = 'draft' | 'executed' | 'canceled' | 'failed';
export type FinanceAssistantIntent =
  | 'create_payable'
  | 'create_receivable'
  | 'settle_payable'
  | 'settle_receivable'
  | 'query_due'
  | 'query_quality'
  | 'create_simulation';

export type FinanceAssistantActionDto = {
  id: string;
  intent: FinanceAssistantIntent;
  confidence: number;
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  requires_permission: string;
  human_summary: string;
  payload: Record<string, unknown>;
};

export type FinanceAssistantPlanDto = {
  id: string;
  transcript: string;
  surface_path: string | null;
  status: FinanceAssistantInteractionStatus;
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  human_summary: string;
  actions: FinanceAssistantActionDto[];
};

export type FinanceAssistantInterpretInput = {
  organization_id: string;
  created_by?: string | null;
  transcript: string;
  surface_path?: string | null;
};
```

- [ ] **Step 4: Create interpreter implementation**

Create `apps/backend/src/finance/assistant.ts`:

```ts
import { db, uuid } from '../db.js';
import type {
  FinanceAssistantActionDto,
  FinanceAssistantInterpretInput,
  FinanceAssistantPlanDto,
  FinanceAssistantRiskLevel
} from './types.js';

function normalizeTranscript(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function amountFromTranscript(value: string): number | null {
  const match = value.match(/(?:r\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*|\\d+)(?:,(\\d{1,2}))?/);
  if (!match) return null;
  const whole = match[1].replace(/\\./g, '');
  const cents = (match[2] ?? '00').padEnd(2, '0').slice(0, 2);
  return Number(`${whole}${cents}`);
}

function dayFromTranscript(value: string): string | null {
  const match = value.match(/dia\\s+(\\d{1,2})/);
  if (!match) return null;
  const today = new Date();
  const day = String(Math.max(1, Math.min(31, Number(match[1])))).padStart(2, '0');
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${day}`;
}

function riskFromActions(actions: FinanceAssistantActionDto[]): FinanceAssistantRiskLevel {
  if (actions.some((action) => action.risk_level === 'high')) return 'high';
  if (actions.some((action) => action.risk_level === 'medium')) return 'medium';
  return 'low';
}

function buildPlan(input: FinanceAssistantInterpretInput): Omit<FinanceAssistantPlanDto, 'id' | 'status'> {
  const transcript = input.transcript.trim();
  const normalized = normalizeTranscript(transcript);
  const amountCents = amountFromTranscript(normalized);
  const dueDate = dayFromTranscript(normalized);
  const isReceivable = /receber|receita|cliente|entrada/.test(normalized);
  const isPayable = /pagar|pagamento|aluguel|fornecedor|saida|despesa/.test(normalized);
  const actions: FinanceAssistantActionDto[] = [];

  if (amountCents && isPayable) {
    actions.push({
      id: uuid('fai_action'),
      intent: 'create_payable',
      confidence: 0.72,
      risk_level: 'medium',
      requires_confirmation: true,
      requires_permission: 'finance.write',
      human_summary: `Criar conta a pagar de R$ ${(amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      payload: {
        description: transcript,
        amount_cents: amountCents,
        due_date: dueDate,
        status: 'open'
      }
    });
  } else if (amountCents && isReceivable) {
    actions.push({
      id: uuid('fai_action'),
      intent: 'create_receivable',
      confidence: 0.72,
      risk_level: 'medium',
      requires_confirmation: true,
      requires_permission: 'finance.write',
      human_summary: `Criar conta a receber de R$ ${(amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
      payload: {
        description: transcript,
        amount_cents: amountCents,
        due_date: dueDate,
        status: 'open'
      }
    });
  } else if (/vence|vencem|semana/.test(normalized)) {
    actions.push({
      id: uuid('fai_action'),
      intent: 'query_due',
      confidence: 0.78,
      risk_level: 'low',
      requires_confirmation: false,
      requires_permission: 'finance.read',
      human_summary: 'Consultar vencimentos próximos.',
      payload: { horizon_days: 7 }
    });
  } else if (/sem classificacao|sem categoria|sem centro/.test(normalized)) {
    actions.push({
      id: uuid('fai_action'),
      intent: 'query_quality',
      confidence: 0.78,
      risk_level: 'low',
      requires_confirmation: false,
      requires_permission: 'finance.read',
      human_summary: 'Listar pendências de classificação.',
      payload: {}
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: uuid('fai_action'),
      intent: 'query_quality',
      confidence: 0.35,
      risk_level: 'low',
      requires_confirmation: false,
      requires_permission: 'finance.read',
      human_summary: 'Não entendi uma ação financeira segura. Posso listar pendências para começarmos.',
      payload: {}
    });
  }

  const risk = riskFromActions(actions);
  return {
    transcript,
    surface_path: input.surface_path ?? null,
    risk_level: risk,
    requires_confirmation: actions.some((action) => action.requires_confirmation),
    human_summary: actions.map((action) => action.human_summary).join(' '),
    actions
  };
}

export function interpretFinanceAssistantCommand(input: FinanceAssistantInterpretInput): FinanceAssistantPlanDto {
  const nowIso = new Date().toISOString();
  const id = uuid('fai');
  const plan = buildPlan(input);
  const dto: FinanceAssistantPlanDto = {
    id,
    status: 'draft',
    ...plan
  };

  db.prepare(`
    insert into financial_ai_interaction (
      id, organization_id, created_by, surface_path, transcript, status,
      risk_level, plan_json, result_json, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 'draft', ?, ?, '{}', ?, ?)
  `).run(
    id,
    input.organization_id,
    input.created_by ?? null,
    dto.surface_path,
    dto.transcript,
    dto.risk_level,
    JSON.stringify(dto),
    nowIso,
    nowIso
  );

  return dto;
}
```

- [ ] **Step 5: Wire route**

In `apps/backend/src/finance/routes.ts`, import `interpretFinanceAssistantCommand` and add:

```ts
const assistantInterpretSchema = z.object({
  transcript: z.string().trim().min(2).max(4_000),
  surface_path: z.string().trim().max(240).nullable().optional()
});
```

Inside `registerFinanceRoutes`, add:

```ts
  router.post('/assistant/interpret', requireFinancePermission(['finance.read']), (req, res) => {
    const parsed = assistantInterpretSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(interpretFinanceAssistantCommand({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });
```

- [ ] **Step 6: Run test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "interpret"
```

Expected: test passes.

## Task 3: Backend Confirmed Execution

**Files:**
- Modify: `apps/backend/src/finance/assistant.ts`
- Modify: `apps/backend/src/finance/routes.ts`
- Test: `apps/backend/src/finance/finance.test.ts`

- [ ] **Step 1: Add execution test**

Add this backend test:

```ts
test('POST /finance/assistant/plans/:id/execute executa plano confirmado e audita resultado', async () => {
  const dbPath = assignTestDbPath('finance-whisper-execute');
  cleanupDbFiles(dbPath);
  resetDbConnection();
  const app = createApp({ forceDbRefresh: true, seedDb: false });

  try {
    seedFinanceCompanies();
    seedFinanceAccountAndCategory();
    createInternalUser({
      username: 'finance.whisper.execute',
      display_name: 'Finance Whisper Execute',
      password: 'Senha#123',
      role: 'supremo',
      permissions: ['finance.read', 'finance.write']
    });

    const loginRes = await request(app).post('/auth/login').send({ username: 'finance.whisper.execute', password: 'Senha#123' });
    const token = loginRes.body.token as string;

    const interpretRes = await request(app)
      .post('/finance/assistant/interpret')
      .set('Authorization', `Bearer ${token}`)
      .send({ transcript: 'lança aluguel de 8000 para dia 15', surface_path: '/financeiro/payables' });

    const executeRes = await request(app)
      .post(`/finance/assistant/plans/${interpretRes.body.id}/execute`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true });

    assert.equal(executeRes.status, 200);
    assert.equal(executeRes.body.status, 'executed');
    assert.equal(executeRes.body.results[0].intent, 'create_payable');
    assert.ok(executeRes.body.results[0].resource_id);

    const payable = db.prepare('select description, amount_cents from financial_payable where id = ?').get(executeRes.body.results[0].resource_id) as { description: string; amount_cents: number };
    assert.match(payable.description, /aluguel/i);
    assert.equal(payable.amount_cents, 800000);

    const interaction = db.prepare('select status, confirmed_at, result_json from financial_ai_interaction where id = ?').get(interpretRes.body.id) as { status: string; confirmed_at: string | null; result_json: string };
    assert.equal(interaction.status, 'executed');
    assert.ok(interaction.confirmed_at);
    assert.match(interaction.result_json, /create_payable/);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
```

- [ ] **Step 2: Run failing execution test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "executa plano confirmado"
```

Expected: fails because execute endpoint is missing.

- [ ] **Step 3: Implement execution function**

In `apps/backend/src/finance/assistant.ts`, import `createFinancePayable`, `createFinanceReceivable`, `listFinancePayables`, `listFinanceReceivables`, and add:

```ts
export function executeFinanceAssistantPlan(organizationId: string, planId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Confirme o plano antes de executar.');
  }

  const row = db.prepare(`
    select id, organization_id, status, plan_json
    from financial_ai_interaction
    where organization_id = ? and id = ?
    limit 1
  `).get(organizationId, planId) as { id: string; organization_id: string; status: string; plan_json: string } | undefined;

  if (!row) throw new Error('Plano do Whisper Flow não encontrado.');
  if (row.status !== 'draft') throw new Error('Este plano não está mais disponível para execução.');

  const plan = JSON.parse(row.plan_json) as FinanceAssistantPlanDto;
  const results = plan.actions.map((action) => {
    if (action.intent === 'create_payable') {
      const payload = action.payload as { description: string; amount_cents: number; due_date?: string | null; status?: string };
      const created = createFinancePayable({
        organization_id: organizationId,
        description: payload.description,
        amount_cents: payload.amount_cents,
        status: 'open',
        due_date: payload.due_date ?? null,
        issue_date: new Date().toISOString().slice(0, 10),
        source: 'whisper_flow'
      });
      return { action_id: action.id, intent: action.intent, resource_type: 'payable', resource_id: created.id };
    }

    if (action.intent === 'create_receivable') {
      const payload = action.payload as { description: string; amount_cents: number; due_date?: string | null; status?: string };
      const created = createFinanceReceivable({
        organization_id: organizationId,
        description: payload.description,
        amount_cents: payload.amount_cents,
        status: 'open',
        due_date: payload.due_date ?? null,
        issue_date: new Date().toISOString().slice(0, 10),
        source: 'whisper_flow'
      });
      return { action_id: action.id, intent: action.intent, resource_type: 'receivable', resource_id: created.id };
    }

    if (action.intent === 'query_due') {
      return {
        action_id: action.id,
        intent: action.intent,
        resource_type: 'query',
        resource_id: null,
        payload: {
          payables: listFinancePayables(organizationId).groups.upcoming.slice(0, 5),
          receivables: listFinanceReceivables(organizationId).groups.upcoming.slice(0, 5)
        }
      };
    }

    return { action_id: action.id, intent: action.intent, resource_type: 'none', resource_id: null };
  });

  const nowIso = new Date().toISOString();
  db.prepare(`
    update financial_ai_interaction
    set status = 'executed', result_json = ?, confirmed_at = ?, updated_at = ?
    where organization_id = ? and id = ?
  `).run(JSON.stringify({ results }), nowIso, nowIso, organizationId, planId);

  return { id: planId, status: 'executed', results };
}
```

- [ ] **Step 4: Wire execute route**

In `apps/backend/src/finance/routes.ts`, add:

```ts
const assistantExecuteSchema = z.object({
  confirmed: z.boolean()
});
```

Import `executeFinanceAssistantPlan`, then add:

```ts
  router.post('/assistant/plans/:id/execute', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = assistantExecuteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(executeFinanceAssistantPlan(readFinanceOrganizationId(res), req.params.id, parsed.data.confirmed));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });
```

- [ ] **Step 5: Run execution test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend -- --test-name-pattern "executa plano confirmado"
```

Expected: passes.

## Task 4: Frontend API Contract

**Files:**
- Modify: `apps/frontend/src/finance/api.ts`
- Test: covered by component tests in Task 6

- [ ] **Step 1: Add assistant types and methods**

In `apps/frontend/src/finance/api.ts`, add:

```ts
export type FinanceAssistantRiskLevel = 'low' | 'medium' | 'high';
export type FinanceAssistantStatus = 'draft' | 'executed' | 'canceled' | 'failed';
export type FinanceAssistantAction = {
  id: string;
  intent: string;
  confidence: number;
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  requires_permission: string;
  human_summary: string;
  payload: Record<string, unknown>;
};
export type FinanceAssistantPlan = {
  id: string;
  transcript: string;
  surface_path: string | null;
  status: FinanceAssistantStatus;
  risk_level: FinanceAssistantRiskLevel;
  requires_confirmation: boolean;
  human_summary: string;
  actions: FinanceAssistantAction[];
};
export type FinanceAssistantExecutionResult = {
  id: string;
  status: 'executed';
  results: Array<{ action_id: string; intent: string; resource_type: string; resource_id: string | null; payload?: unknown }>;
};
```

Inside `financeApi`, add:

```ts
  interpretAssistantCommand: (payload: { transcript: string; surface_path?: string | null }) =>
    req<FinanceAssistantPlan>('/finance/assistant/interpret', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  executeAssistantPlan: (planId: string) =>
    req<FinanceAssistantExecutionResult>(`/finance/assistant/plans/${encodeURIComponent(planId)}/execute`, {
      method: 'POST',
      body: JSON.stringify({ confirmed: true })
    }),
```

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build -w apps/frontend
```

Expected: frontend build passes.

## Task 5: Speech Hook

**Files:**
- Create: `apps/frontend/src/finance/hooks/useFinanceSpeechRecognition.ts`
- Test: `apps/frontend/src/finance/__tests__/FinanceWhisperFlow.test.tsx`

- [ ] **Step 1: Create hook**

Create `apps/frontend/src/finance/hooks/useFinanceSpeechRecognition.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
 .onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function useFinanceSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    const win = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    setSupported(Boolean(Constructor));
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const next = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      setTranscript(next);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  function start() {
    setTranscript('');
    setListening(true);
    recognitionRef.current?.start();
  }

  function stop() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function reset() {
    setTranscript('');
    setListening(false);
  }

  return { supported, listening, transcript, setTranscript, start, stop, reset };
}
```

- [ ] **Step 2: Build to verify hook types**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build -w apps/frontend
```

Expected: build passes.

## Task 6: Whisper Flow UI

**Files:**
- Create: `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`
- Create: `apps/frontend/src/finance/__tests__/FinanceWhisperFlow.test.tsx`
- Create: `apps/frontend/src/finance/finance-whisper.css`
- Modify: `apps/frontend/src/finance/finance.css`
- Modify: `apps/frontend/src/finance/FinanceWorkspace.tsx`

- [ ] **Step 1: Write component tests**

Create `apps/frontend/src/finance/__tests__/FinanceWhisperFlow.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { FinanceWhisperFlow } from '../components/FinanceWhisperFlow';

const mocks = vi.hoisted(() => ({
  interpretAssistantCommand: vi.fn(),
  executeAssistantPlan: vi.fn()
}));

vi.mock('../api', () => ({
  financeApi: {
    interpretAssistantCommand: mocks.interpretAssistantCommand,
    executeAssistantPlan: mocks.executeAssistantPlan
  }
}));

beforeEach(() => {
  mocks.interpretAssistantCommand.mockReset();
  mocks.executeAssistantPlan.mockReset();
  mocks.interpretAssistantCommand.mockResolvedValue({
    id: 'fai-1',
    transcript: 'lança aluguel de 8000',
    surface_path: '/financeiro/payables',
    status: 'draft',
    risk_level: 'medium',
    requires_confirmation: true,
    human_summary: 'Criar conta a pagar de R$ 8.000,00.',
    actions: [
      {
        id: 'action-1',
        intent: 'create_payable',
        confidence: 0.72,
        risk_level: 'medium',
        requires_confirmation: true,
        requires_permission: 'finance.write',
        human_summary: 'Criar conta a pagar de R$ 8.000,00.',
        payload: { amount_cents: 800000 }
      }
    ]
  });
  mocks.executeAssistantPlan.mockResolvedValue({
    id: 'fai-1',
    status: 'executed',
    results: [{ action_id: 'action-1', intent: 'create_payable', resource_type: 'payable', resource_id: 'pay-1' }]
  });
});

test('FinanceWhisperFlow opens, interprets text fallback and executes confirmed plan', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/financeiro/payables']}>
      <FinanceWhisperFlow />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: 'Abrir Whisper Flow' }));
  await user.type(screen.getByLabelText('Comando do Whisper Flow'), 'lança aluguel de 8000');
  await user.click(screen.getByRole('button', { name: 'Interpretar comando' }));

  await waitFor(() => expect(mocks.interpretAssistantCommand).toHaveBeenCalledWith({
    transcript: 'lança aluguel de 8000',
    surface_path: '/financeiro/payables'
  }));
  expect(await screen.findByText('Criar conta a pagar de R$ 8.000,00.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirmar e executar' }));
  await waitFor(() => expect(mocks.executeAssistantPlan).toHaveBeenCalledWith('fai-1'));
  expect(await screen.findByText('Plano executado.')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/frontend -- FinanceWhisperFlow
```

Expected: fails because component is missing.

- [ ] **Step 3: Create component**

Create `apps/frontend/src/finance/components/FinanceWhisperFlow.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { financeApi, type FinanceAssistantPlan } from '../api';
import { useFinanceSpeechRecognition } from '../hooks/useFinanceSpeechRecognition';

type WhisperState = 'idle' | 'listening' | 'preview' | 'done';

export function FinanceWhisperFlow() {
  const location = useLocation();
  const speech = useFinanceSpeechRecognition();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WhisperState>('idle');
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<FinanceAssistantPlan | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        setOpen(true);
        setState('listening');
        speech.start();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [speech]);

  useEffect(() => {
    if (speech.transcript) {
      setText(speech.transcript);
    }
  }, [speech.transcript]);

  async function interpret() {
    const transcript = text.trim();
    if (!transcript) {
      setError('Fale ou escreva um comando financeiro.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const nextPlan = await financeApi.interpretAssistantCommand({
        transcript,
        surface_path: location.pathname
      });
      setPlan(nextPlan);
      setState('preview');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao interpretar comando.');
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      await financeApi.executeAssistantPlan(plan.id);
      setMessage('Plano executado.');
      setState('done');
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Falha ao executar plano.');
    } finally {
      setBusy(false);
    }
  }

  function openListening() {
    setOpen(true);
    setState('listening');
    setText('');
    setPlan(null);
    setMessage('');
    setError('');
    speech.start();
  }

  return (
    <div className={`finance-whisper-flow finance-whisper-flow--${open ? 'open' : 'closed'} finance-whisper-flow--${state}`}>
      {open ? (
        <section className="finance-whisper-flow__panel" aria-label="Whisper Flow financeiro">
          <div className="finance-whisper-flow__header">
            <div>
              <span>Whisper Flow</span>
              <strong>{state === 'listening' ? 'Estou ouvindo' : state === 'preview' ? 'Prévia da ação' : 'Copiloto financeiro'}</strong>
            </div>
            <button type="button" onClick={() => { speech.stop(); setOpen(false); }} aria-label="Fechar Whisper Flow">×</button>
          </div>

          {state === 'listening' ? (
            <div className="finance-whisper-flow__listen">
              <div className="finance-whisper-flow__orb" aria-hidden="true"><span /><span /><span /></div>
              <textarea
                aria-label="Comando do Whisper Flow"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={speech.supported ? 'Fale ou ajuste o texto transcrito...' : 'Digite o comando financeiro...'}
              />
              <div className="finance-whisper-flow__actions">
                <button type="button" onClick={() => { speech.stop(); void interpret(); }} disabled={busy} aria-label="Interpretar comando">
                  {busy ? 'Interpretando...' : 'Interpretar comando'}
                </button>
              </div>
            </div>
          ) : null}

          {state === 'preview' && plan ? (
            <div className="finance-whisper-flow__preview">
              <p>{plan.human_summary}</p>
              <div className="finance-whisper-flow__plan-list">
                {plan.actions.map((action) => <span key={action.id}>{action.human_summary}</span>)}
              </div>
              <div className="finance-whisper-flow__actions">
                <button type="button" onClick={execute} disabled={busy} aria-label="Confirmar e executar">
                  {busy ? 'Executando...' : 'Confirmar e executar'}
                </button>
                <button type="button" onClick={() => setState('listening')}>Editar</button>
              </div>
            </div>
          ) : null}

          {message ? <p className="finance-whisper-flow__success">{message}</p> : null}
          {error ? <p className="finance-whisper-flow__error">{error}</p> : null}
        </section>
      ) : null}

      <button type="button" className="finance-whisper-flow__fab" onClick={openListening} aria-label="Abrir Whisper Flow">
        <span aria-hidden="true">✦</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS and import**

Create `apps/frontend/src/finance/finance-whisper.css` with:

```css
.finance-whisper-flow {
  position: fixed;
  right: 84px;
  bottom: 24px;
  z-index: 90;
  display: grid;
  justify-items: end;
  gap: 12px;
  pointer-events: none;
}

.finance-whisper-flow * {
  box-sizing: border-box;
}

.finance-whisper-flow__fab,
.finance-whisper-flow__panel {
  pointer-events: auto;
}

.finance-whisper-flow__fab {
  width: 46px;
  height: 46px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 999px;
  background: #0f172a;
  color: #ffffff;
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.22);
  cursor: pointer;
}

.finance-whisper-flow__panel {
  width: min(430px, calc(100vw - 32px));
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.22);
  overflow: hidden;
}

.finance-whisper-flow__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.finance-whisper-flow__header span {
  display: block;
  color: #ea580c;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.finance-whisper-flow__header strong {
  color: #0f172a;
  font-size: 14px;
}

.finance-whisper-flow__header button {
  width: 30px;
  height: 30px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #ffffff;
  color: #64748b;
  font-size: 18px;
  cursor: pointer;
}

.finance-whisper-flow__listen,
.finance-whisper-flow__preview {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.finance-whisper-flow__orb {
  display: flex;
  justify-content: center;
  gap: 5px;
  padding: 18px 0 8px;
}

.finance-whisper-flow__orb span {
  width: 6px;
  height: 26px;
  border-radius: 99px;
  background: #2563eb;
  animation: finance-whisper-wave 900ms ease-in-out infinite;
}

.finance-whisper-flow__orb span:nth-child(2) { animation-delay: 120ms; }
.finance-whisper-flow__orb span:nth-child(3) { animation-delay: 240ms; }

@keyframes finance-whisper-wave {
  0%, 100% { transform: scaleY(0.55); opacity: 0.55; }
  50% { transform: scaleY(1.2); opacity: 1; }
}

.finance-whisper-flow textarea {
  min-height: 90px;
  resize: vertical;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  padding: 12px;
  color: #0f172a;
  font: inherit;
}

.finance-whisper-flow__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.finance-whisper-flow__actions button {
  min-height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  color: #334155;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.finance-whisper-flow__actions button:first-child {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.finance-whisper-flow__plan-list {
  display: grid;
  gap: 8px;
}

.finance-whisper-flow__plan-list span {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
}

.finance-whisper-flow__success,
.finance-whisper-flow__error {
  margin: 0 16px 16px;
  font-size: 12px;
  font-weight: 700;
}

.finance-whisper-flow__success { color: #047857; }
.finance-whisper-flow__error { color: #be123c; }
```

Modify `apps/frontend/src/finance/finance.css`:

```css
@import './finance-shell.css';
@import './finance-pages.css';
@import './finance-whisper.css';
```

- [ ] **Step 5: Mount component**

In `apps/frontend/src/finance/FinanceWorkspace.tsx`, import and mount:

```tsx
import { FinanceWhisperFlow } from './components/FinanceWhisperFlow';
```

Then render:

```tsx
      {canWrite ? <FinanceFloatingQuickLauncher /> : null}
      <FinanceWhisperFlow />
```

- [ ] **Step 6: Run frontend Whisper test**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/frontend -- FinanceWhisperFlow
```

Expected: test passes.

## Task 7: Verification And Commit

**Files:**
- All changed files

- [ ] **Step 1: Full build**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build
```

Expected: backend and frontend builds pass.

- [ ] **Step 2: Full test suite**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/backend
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm test -w apps/frontend
```

Expected: all backend and frontend tests pass.

- [ ] **Step 3: Manual browser check**

Start or use existing dev server, then check:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run dev:frontend
```

Manual checks:

- Open `/financeiro/overview`.
- Click Whisper Flow orb.
- Type "lança aluguel de 8000 para dia 15".
- Confirm that preview appears.
- Confirm execution creates a payable.
- Confirm the UI does not cover the quick launcher awkwardly.
- Confirm `Ctrl+Shift+V` or `Cmd+Shift+V` opens listening state.

- [ ] **Step 4: Commit**

Run:

```bash
git add apps/backend/src/db.ts apps/backend/src/finance/types.ts apps/backend/src/finance/assistant.ts apps/backend/src/finance/routes.ts apps/backend/src/finance/finance.test.ts apps/frontend/src/finance/api.ts apps/frontend/src/finance/hooks/useFinanceSpeechRecognition.ts apps/frontend/src/finance/components/FinanceWhisperFlow.tsx apps/frontend/src/finance/__tests__/FinanceWhisperFlow.test.tsx apps/frontend/src/finance/finance.css apps/frontend/src/finance/finance-whisper.css apps/frontend/src/finance/FinanceWorkspace.tsx docs/superpowers/specs/2026-04-25-financeiro-whisper-flow-design.md docs/superpowers/plans/2026-04-25-financeiro-whisper-flow-fase-1.md
git commit -m "feat: add finance whisper flow"
```

## Self-Review

- Spec coverage: Fase 1 covers voice-first floating UI, transcript fallback, action preview, confirmation, audit persistence and safe execution. Fases 2-5 remain documented in the design spec and deliberately out of this first implementation.
- Placeholder scan: no task uses unspecified placeholders; later OpenAI Realtime, files and proactive agent are intentionally out of scope.
- Type consistency: backend `FinanceAssistantPlanDto` maps to frontend `FinanceAssistantPlan`; route names match API methods; plan status values match table check constraint.

