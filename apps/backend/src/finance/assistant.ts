import { db, uuid } from '../db.js';
import {
  createFinancePayable,
  createFinanceReceivable,
  listFinancePayables,
  listFinanceReceivables
} from './service.js';
import type {
  FinanceAssistantActionDto,
  FinanceAssistantIntent,
  FinanceAssistantInterpretInput,
  FinanceAssistantPlanDto,
  FinanceAssistantRiskLevel
} from './types.js';

type FinanceAssistantExecutionResult = {
  action_id: string;
  intent: FinanceAssistantIntent;
  resource_type: 'payable' | 'receivable' | 'due_summary' | 'none';
  resource_id: string | null;
  payload: Record<string, unknown>;
};

type FinanceAssistantInteractionRow = {
  id: string;
  status: string;
  plan_json: string;
};

type ValidatedCreateResourcePayload = {
  description: string;
  amount_cents: number;
  due_date: string | null;
};

type ValidatedFinanceAssistantAction = {
  action: FinanceAssistantActionDto;
  createPayload: ValidatedCreateResourcePayload | null;
};

function normalizeAssistantText(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractAmountCents(text: string) {
  const candidates = [...text.matchAll(/\d+(?:\.\d{3})*(?:,\d{1,2})?/g)]
    .filter((match) => match.index !== undefined)
    .map((match) => {
      const index = match.index ?? 0;
      const prefix = text.slice(Math.max(0, index - 24), index);
      return {
        raw: match[0],
        index,
        isDay: /\bdia\s+$/.test(prefix),
        hasMoneyContext: /(?:r\$\s*|(?:valor\s+)?(?:de|por)\s+)$/.test(prefix)
      };
    })
    .filter((candidate) => !candidate.isDay);

  const amountMatch = candidates.find((candidate) => candidate.hasMoneyContext) ?? candidates.at(-1);
  if (!amountMatch) {
    return null;
  }

  const raw = amountMatch.raw;
  const [integerPart, decimalPart = ''] = raw.split(',');
  const amountReais = Number.parseInt(integerPart.replace(/\./g, ''), 10);
  const amountDecimals = decimalPart ? Number.parseInt(decimalPart.padEnd(2, '0').slice(0, 2), 10) : 0;
  const cents = amountReais * 100 + amountDecimals;
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

function extractDueDate(text: string) {
  const dayMatch = text.match(/\bdia\s+(\d{1,2})\b/);
  if (!dayMatch?.[1]) {
    return null;
  }

  const day = Number.parseInt(dayMatch[1], 10);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let offset = 0; offset <= 12; offset += 1) {
    const monthIndex = now.getMonth() + offset;
    const candidate = new Date(now.getFullYear(), monthIndex, day);
    const expectedYear = now.getFullYear() + Math.floor(monthIndex / 12);
    const expectedMonth = ((monthIndex % 12) + 12) % 12;

    if (
      candidate.getFullYear() === expectedYear
      && candidate.getMonth() === expectedMonth
      && candidate.getDate() === day
      && candidate >= today
    ) {
      const year = candidate.getFullYear();
      const month = String(candidate.getMonth() + 1).padStart(2, '0');
      const dateDay = String(candidate.getDate()).padStart(2, '0');
      return `${year}-${month}-${dateDay}`;
    }
  }

  return null;
}

function defaultOperationalDateForSurface(surfacePath: string | null) {
  if (!surfacePath) {
    return null;
  }
  return surfacePath.includes('/payables') || surfacePath.includes('/receivables')
    ? todayIsoDate()
    : null;
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function buildAction(input: {
  intent: FinanceAssistantIntent;
  confidence: number;
  riskLevel: FinanceAssistantRiskLevel;
  requiresConfirmation: boolean;
  requiresPermission: string;
  humanSummary: string;
  payload: Record<string, unknown>;
}): FinanceAssistantActionDto {
  return {
    id: uuid('faact'),
    intent: input.intent,
    confidence: input.confidence,
    risk_level: input.riskLevel,
    requires_confirmation: input.requiresConfirmation,
    requires_permission: input.requiresPermission,
    human_summary: input.humanSummary,
    payload: input.payload
  };
}

function persistPlan(input: FinanceAssistantInterpretInput, plan: FinanceAssistantPlanDto) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    insert into financial_ai_interaction (
      id,
      organization_id,
      company_id,
      created_by,
      surface_path,
      transcript,
      status,
      risk_level,
      plan_json,
      result_json,
      error_message,
      confirmed_at,
      created_at,
      updated_at
    ) values (?, ?, null, ?, ?, ?, ?, ?, ?, ?, null, null, ?, ?)
  `).run(
    plan.id,
    input.organization_id,
    input.created_by?.trim() || null,
    plan.surface_path,
    plan.transcript,
    plan.status,
    plan.risk_level,
    JSON.stringify(plan),
    JSON.stringify({}),
    nowIso,
    nowIso
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStoredPlan(planJson: string): FinanceAssistantPlanDto {
  const parsed = JSON.parse(planJson) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.actions)) {
    throw new Error('Plano do Whisper Flow inválido.');
  }
  return parsed as FinanceAssistantPlanDto;
}

function readPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readPayloadOptionalDate(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('Data de vencimento inválida no plano do Whisper Flow.');
  }
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('Data de vencimento inválida no plano do Whisper Flow.');
  }

  const [yearText, monthText, dayText] = normalized.split('-');
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Data de vencimento inválida no plano do Whisper Flow.');
  }

  return normalized;
}

function readPayloadPositiveInteger(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('Plano do Whisper Flow inválido.');
  }
  return value;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function validateAction(action: FinanceAssistantActionDto): ValidatedFinanceAssistantAction {
  if (!isRecord(action.payload)) {
    throw new Error('Plano do Whisper Flow inválido.');
  }

  if (action.intent === 'create_payable' || action.intent === 'create_receivable') {
    const description = readPayloadString(action.payload, 'description');
    const amountCents = readPayloadPositiveInteger(action.payload, 'amount_cents');
    if (description.length < 2 || description.length > 240) {
      throw new Error('Plano do Whisper Flow inválido.');
    }

    return {
      action,
      createPayload: {
        description,
        amount_cents: amountCents,
        due_date: readPayloadOptionalDate(action.payload, 'due_date')
      }
    };
  }

  return { action, createPayload: null };
}

function executeAction(organizationId: string, validated: ValidatedFinanceAssistantAction): FinanceAssistantExecutionResult {
  const { action } = validated;

  if (action.intent === 'create_payable') {
    if (!validated.createPayload) {
      throw new Error('Plano do Whisper Flow inválido.');
    }

    const payable = createFinancePayable({
      organization_id: organizationId,
      description: validated.createPayload.description,
      amount_cents: validated.createPayload.amount_cents,
      status: 'open',
      issue_date: todayIsoDate(),
      due_date: validated.createPayload.due_date,
      source: 'whisper_flow'
    });

    return {
      action_id: action.id,
      intent: action.intent,
      resource_type: 'payable',
      resource_id: payable.id,
      payload: { payable }
    };
  }

  if (action.intent === 'create_receivable') {
    if (!validated.createPayload) {
      throw new Error('Plano do Whisper Flow inválido.');
    }

    const receivable = createFinanceReceivable({
      organization_id: organizationId,
      description: validated.createPayload.description,
      amount_cents: validated.createPayload.amount_cents,
      status: 'open',
      issue_date: todayIsoDate(),
      due_date: validated.createPayload.due_date,
      source: 'whisper_flow'
    });

    return {
      action_id: action.id,
      intent: action.intent,
      resource_type: 'receivable',
      resource_id: receivable.id,
      payload: { receivable }
    };
  }

  if (action.intent === 'query_due') {
    return {
      action_id: action.id,
      intent: action.intent,
      resource_type: 'due_summary',
      resource_id: null,
      payload: {
        payables: listFinancePayables(organizationId).groups.upcoming.slice(0, 5),
        receivables: listFinanceReceivables(organizationId).groups.upcoming.slice(0, 5)
      }
    };
  }

  return {
    action_id: action.id,
    intent: action.intent,
    resource_type: 'none',
    resource_id: null,
    payload: {}
  };
}

export function executeFinanceAssistantPlan(organizationId: string, planId: string, confirmed: boolean) {
  if (!confirmed) {
    throw new Error('Confirme o plano antes de executar.');
  }

  const executeTransaction = db.transaction(() => {
    const row = db.prepare(`
      select id, status, plan_json
      from financial_ai_interaction
      where organization_id = ?
        and id = ?
      limit 1
    `).get(organizationId, planId) as FinanceAssistantInteractionRow | undefined;

    if (!row) {
      throw new Error('Plano do Whisper Flow não encontrado.');
    }
    if (row.status !== 'draft') {
      throw new Error('Este plano não está mais disponível para execução.');
    }

    const plan = parseStoredPlan(row.plan_json);
    const validatedActions = plan.actions.map((action) => validateAction(action));
    const results = validatedActions.map((action) => executeAction(organizationId, action));
    const nowIso = new Date().toISOString();

    db.prepare(`
      update financial_ai_interaction
      set status = 'executed',
          result_json = ?,
          confirmed_at = ?,
          updated_at = ?
      where organization_id = ?
        and id = ?
    `).run(JSON.stringify({ results }), nowIso, nowIso, organizationId, planId);

    return {
      id: planId,
      status: 'executed',
      results
    };
  });

  return executeTransaction();
}

export function interpretFinanceAssistantCommand(input: FinanceAssistantInterpretInput): FinanceAssistantPlanDto {
  const transcript = input.transcript.trim();
  const surfacePath = input.surface_path?.trim() || null;
  const normalized = normalizeAssistantText(transcript);
  const planId = uuid('faint');
  const amountCents = extractAmountCents(normalized);
  const dueDate = extractDueDate(normalized) ?? defaultOperationalDateForSurface(surfacePath);
  const actions: FinanceAssistantActionDto[] = [];

  const payableSignal = includesAny(normalized, ['pagamento', 'pagar', 'despesa', 'aluguel', 'fornecedor', 'saida', 'conta a pagar']);
  const receivableSignal = includesAny(normalized, ['receber', 'receita', 'cliente', 'entrada', 'conta a receber']);
  const dueSignal = includesAny(normalized, ['vencimento', 'vencimentos', 'semana']);
  const qualitySignal = includesAny(normalized, ['sem classificacao', 'sem categoria', 'sem centro']);

  if (payableSignal && amountCents) {
    actions.push(buildAction({
      intent: 'create_payable',
      confidence: 0.82,
      riskLevel: 'medium',
      requiresConfirmation: true,
      requiresPermission: 'finance.write',
      humanSummary: `Criar conta a pagar para ${transcript}.`,
      payload: {
        description: transcript,
        amount_cents: amountCents,
        due_date: dueDate,
        status: 'open'
      }
    }));
  } else if (receivableSignal && amountCents) {
    actions.push(buildAction({
      intent: 'create_receivable',
      confidence: 0.82,
      riskLevel: 'medium',
      requiresConfirmation: true,
      requiresPermission: 'finance.write',
      humanSummary: `Criar conta a receber para ${transcript}.`,
      payload: {
        description: transcript,
        amount_cents: amountCents,
        due_date: dueDate,
        status: 'open'
      }
    }));
  } else if (dueSignal) {
    actions.push(buildAction({
      intent: 'query_due',
      confidence: 0.74,
      riskLevel: 'low',
      requiresConfirmation: false,
      requiresPermission: 'finance.read',
      humanSummary: 'Consultar vencimentos dos próximos 7 dias.',
      payload: { horizon_days: 7 }
    }));
  } else if (qualitySignal) {
    actions.push(buildAction({
      intent: 'query_quality',
      confidence: 0.72,
      riskLevel: 'low',
      requiresConfirmation: false,
      requiresPermission: 'finance.read',
      humanSummary: 'Consultar itens financeiros sem classificação completa.',
      payload: {}
    }));
  }

  if (actions.length === 0) {
    actions.push(buildAction({
      intent: 'query_quality',
      confidence: 0.35,
      riskLevel: 'low',
      requiresConfirmation: false,
      requiresPermission: 'finance.read',
      humanSummary: 'Não entendi uma ação financeira segura; vou mostrar pendências de qualidade para revisão.',
      payload: {}
    }));
  }

  const requiresConfirmation = actions.some((action) => action.requires_confirmation);
  const riskLevel: FinanceAssistantRiskLevel = actions.some((action) => action.risk_level === 'high')
    ? 'high'
    : actions.some((action) => action.risk_level === 'medium')
      ? 'medium'
      : 'low';
  const humanSummary = actions.map((action) => action.human_summary).join(' ');

  const plan: FinanceAssistantPlanDto = {
    id: planId,
    transcript,
    surface_path: surfacePath,
    status: 'draft',
    risk_level: riskLevel,
    requires_confirmation: requiresConfirmation,
    human_summary: humanSummary,
    actions
  };

  persistPlan(input, plan);
  return plan;
}
