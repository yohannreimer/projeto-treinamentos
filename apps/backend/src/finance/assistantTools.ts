import { financeAgentCapabilitiesAsOpenRouterTools } from './agentCapabilities.js';

export type FinanceAssistantToolName =
  | 'finance_list_payables'
  | 'finance_list_receivables'
  | 'finance_list_transactions'
  | 'finance_create_entity'
  | 'finance_create_payable'
  | 'finance_create_recurring_payable'
  | 'finance_create_receivable'
  | 'finance_create_recurring_receivable'
  | 'finance_settle_payable'
  | 'finance_settle_receivable'
  | 'finance_create_simulation'
  | 'finance_query_due'
  | 'finance_query_quality';

type JsonSchema = Record<string, unknown>;

function objectSchema(properties: JsonSchema, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false
  };
}

const amountCents = {
  type: 'integer',
  minimum: 1,
  description: 'Valor em centavos. Exemplo: R$ 12.553,00 = 1255300.'
};

const cleanDescription = {
  type: 'string',
  minLength: 2,
  maxLength: 120,
  description: 'Nome curto e limpo do item financeiro, nunca a frase inteira do usuário.'
};

const dayOfMonth = {
  type: 'integer',
  minimum: 1,
  maximum: 31,
  description: 'Dia recorrente ou vencimento mensal.'
};

const isoDate = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Data ISO yyyy-mm-dd.'
};

const simulationItem = objectSchema({
  label: cleanDescription,
  kind: {
    type: 'string',
    enum: ['manual_inflow', 'manual_outflow', 'expected_inflow', 'scheduled_outflow', 'partial_payment']
  },
  amount_cents: amountCents,
  event_date: isoDate,
  probability_percent: { type: 'integer', minimum: 0, maximum: 100 },
  note: { type: 'string', maxLength: 300 }
}, ['label', 'kind', 'amount_cents', 'event_date']);

export const FINANCE_ASSISTANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'finance_list_payables' satisfies FinanceAssistantToolName,
      description: 'Consultar contas a pagar para encontrar títulos, atrasos, vencimentos ou IDs antes de baixar/alterar.',
      parameters: objectSchema({
        search: { type: 'string', maxLength: 120 },
        status: { type: 'string', enum: ['open', 'overdue', 'partial', 'paid', 'canceled'] },
        horizon_days: { type: 'integer', minimum: 1, maximum: 365 }
      })
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_create_entity' satisfies FinanceAssistantToolName,
      description: 'Cadastrar uma entidade financeira como cliente, fornecedor ou ambos.',
      parameters: objectSchema({
        legal_name: { type: 'string', minLength: 2, maxLength: 160 },
        trade_name: { type: 'string', maxLength: 160 },
        document_number: { type: 'string', maxLength: 40 },
        kind: { type: 'string', enum: ['customer', 'supplier', 'both'] },
        email: { type: 'string', maxLength: 160 },
        phone: { type: 'string', maxLength: 40 }
      }, ['legal_name', 'kind'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_list_receivables' satisfies FinanceAssistantToolName,
      description: 'Consultar contas a receber para encontrar títulos, atrasos, vencimentos ou IDs antes de baixar/alterar.',
      parameters: objectSchema({
        search: { type: 'string', maxLength: 120 },
        status: { type: 'string', enum: ['open', 'overdue', 'partial', 'received', 'canceled'] },
        horizon_days: { type: 'integer', minimum: 1, maximum: 365 }
      })
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_create_payable' satisfies FinanceAssistantToolName,
      description: 'Criar uma conta a pagar pontual.',
      parameters: objectSchema({
        description: cleanDescription,
        amount_cents: amountCents,
        due_day: dayOfMonth,
        due_date: isoDate,
        supplier_name: { type: 'string', maxLength: 140 }
      }, ['description', 'amount_cents'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_create_recurring_payable' satisfies FinanceAssistantToolName,
      description: 'Criar uma conta a pagar mensal fixa/recorrente.',
      parameters: objectSchema({
        description: cleanDescription,
        amount_cents: amountCents,
        day_of_month: dayOfMonth,
        supplier_name: { type: 'string', maxLength: 140 }
      }, ['description', 'amount_cents', 'day_of_month'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_create_receivable' satisfies FinanceAssistantToolName,
      description: 'Criar uma conta a receber pontual.',
      parameters: objectSchema({
        description: cleanDescription,
        amount_cents: amountCents,
        due_day: dayOfMonth,
        due_date: isoDate,
        customer_name: { type: 'string', maxLength: 140 }
      }, ['description', 'amount_cents'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_create_recurring_receivable' satisfies FinanceAssistantToolName,
      description: 'Criar uma conta a receber mensal fixa/recorrente.',
      parameters: objectSchema({
        description: cleanDescription,
        amount_cents: amountCents,
        day_of_month: dayOfMonth,
        customer_name: { type: 'string', maxLength: 140 }
      }, ['description', 'amount_cents', 'day_of_month'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_settle_payable' satisfies FinanceAssistantToolName,
      description: 'Baixar uma conta a pagar já existente. Use somente quando tiver o ID do título.',
      parameters: objectSchema({
        payable_id: { type: 'string', minLength: 2 },
        settled_at: isoDate,
        note: { type: 'string', maxLength: 300 }
      }, ['payable_id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_settle_receivable' satisfies FinanceAssistantToolName,
      description: 'Baixar uma conta a receber já existente. Use somente quando tiver o ID do título.',
      parameters: objectSchema({
        receivable_id: { type: 'string', minLength: 2 },
        settled_at: isoDate,
        note: { type: 'string', maxLength: 300 }
      }, ['receivable_id'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_create_simulation' satisfies FinanceAssistantToolName,
      description: 'Criar uma mesa/cenário de simulação financeira sem alterar dados reais.',
      parameters: objectSchema({
        name: { type: 'string', minLength: 2, maxLength: 140 },
        starting_balance_cents: { type: 'integer' },
        horizon_days: { type: 'integer', minimum: 1, maximum: 365 },
        items: {
          type: 'array',
          maxItems: 80,
          items: simulationItem
        }
      }, ['name'])
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_query_due' satisfies FinanceAssistantToolName,
      description: 'Consultar vencimentos próximos, vencendo hoje, atrasos e rotina operacional. Use para perguntas como "tenho algo vencendo hoje?", "o que tenho para pagar?", "quais vencimentos?".',
      parameters: objectSchema({
        horizon_days: { type: 'integer', minimum: 1, maximum: 365 }
      })
    }
  },
  {
    type: 'function',
    function: {
      name: 'finance_query_quality' satisfies FinanceAssistantToolName,
      description: 'Consultar pendências de qualidade, classificação, DRE, centro de custo ou conciliação.',
      parameters: objectSchema({})
    }
  }
] as const;

export function getFinanceAssistantTools() {
  return [
    ...FINANCE_ASSISTANT_TOOLS,
    ...financeAgentCapabilitiesAsOpenRouterTools()
  ];
}
