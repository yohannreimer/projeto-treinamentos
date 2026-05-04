type JsonSchema = Record<string, unknown>;

export type FinanceAgentCapability = {
  id: string;
  tool_name: string;
  title: string;
  description: string;
  mode: 'query' | 'command';
  risk_level: 'low' | 'medium' | 'high';
  requires_confirmation: boolean;
  parameters: JsonSchema;
};

function objectSchema(properties: JsonSchema, required: string[] = []): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false
  };
}

const searchSchema = objectSchema({
  search: { type: 'string', maxLength: 120 },
  limit: { type: 'integer', minimum: 1, maximum: 30 },
  status: { type: 'string', maxLength: 40 },
  horizon_days: { type: 'integer', minimum: 1, maximum: 365 },
  date_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  date_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  financial_cost_center_id: { type: 'string', maxLength: 80 },
  financial_cost_center_name: { type: 'string', maxLength: 120 },
  financial_category_id: { type: 'string', maxLength: 80 },
  financial_category_name: { type: 'string', maxLength: 120 },
  financial_entity_id: { type: 'string', maxLength: 80 },
  financial_entity_name: { type: 'string', maxLength: 120 },
  kind: { type: 'string', maxLength: 40 }
});

export const FINANCE_AGENT_CAPABILITIES: FinanceAgentCapability[] = [
  {
    id: 'finance.list_categories',
    tool_name: 'finance_list_categories',
    title: 'Listar categorias',
    description: 'Consulta categorias financeiras disponíveis antes de classificar, editar, inativar ou excluir.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.list_cost_centers',
    tool_name: 'finance_list_cost_centers',
    title: 'Listar centros de custo',
    description: 'Consulta centros de custo disponíveis antes de classificar lançamentos ou alterar cadastros.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.list_accounts',
    tool_name: 'finance_list_accounts',
    title: 'Listar contas financeiras',
    description: 'Consulta contas financeiras cadastradas antes de lançar, ajustar saldo ou classificar.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.list_payment_methods',
    tool_name: 'finance_list_payment_methods',
    title: 'Listar formas de pagamento',
    description: 'Consulta formas de pagamento antes de classificar ou criar lançamentos.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.list_entities',
    tool_name: 'finance_list_entities',
    title: 'Listar entidades',
    description: 'Consulta clientes, fornecedores e entidades antes de cadastrar duplicado ou vincular lançamentos.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.list_recurring_rules',
    tool_name: 'finance_list_recurring_rules',
    title: 'Listar recorrências',
    description: 'Consulta contas recorrentes antes de renomear, pausar, encerrar ou alterar dia.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.list_transactions',
    tool_name: 'finance_list_transactions',
    title: 'Listar movimentações',
    description: 'Consulta movimentações de caixa/extrato realizado para análise financeira e composição do realizado.',
    mode: 'query',
    risk_level: 'low',
    requires_confirmation: false,
    parameters: searchSchema
  },
  {
    id: 'finance.update_recurring_rule',
    tool_name: 'finance_update_recurring_rule',
    title: 'Alterar recorrência',
    description: 'Altera nome, dia, status ou janela de uma recorrência já existente.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      recurring_rule_id: { type: 'string', minLength: 2 },
      name: { type: 'string', minLength: 2, maxLength: 160 },
      day_of_month: { type: 'integer', minimum: 1, maximum: 31 },
      status: { type: 'string', enum: ['active', 'paused', 'ended'] },
      end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    }, ['recurring_rule_id'])
  },
  {
    id: 'finance.create_cost_center',
    tool_name: 'finance_create_cost_center',
    title: 'Criar centro de custo',
    description: 'Cria um centro de custo operacional.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      name: { type: 'string', minLength: 2, maxLength: 120 },
      code: { type: 'string', maxLength: 40 }
    }, ['name'])
  },
  {
    id: 'finance.update_cost_center',
    tool_name: 'finance_update_cost_center',
    title: 'Editar centro de custo',
    description: 'Edita nome, código ou status de um centro de custo já existente.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      financial_cost_center_id: { type: 'string', minLength: 2 },
      name: { type: 'string', minLength: 2, maxLength: 120 },
      code: { type: 'string', maxLength: 40 },
      is_active: { type: 'boolean' }
    }, ['financial_cost_center_id'])
  },
  {
    id: 'finance.inactivate_cost_center',
    tool_name: 'finance_inactivate_cost_center',
    title: 'Inativar centro de custo',
    description: 'Inativa um centro de custo sem apagar histórico.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      financial_cost_center_id: { type: 'string', minLength: 2 }
    }, ['financial_cost_center_id'])
  },
  {
    id: 'finance.create_category',
    tool_name: 'finance_create_category',
    title: 'Criar categoria',
    description: 'Cria uma categoria de receita, despesa ou neutra.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      name: { type: 'string', minLength: 2, maxLength: 120 },
      kind: { type: 'string', enum: ['income', 'expense', 'neutral'] }
    }, ['name', 'kind'])
  },
  {
    id: 'finance.update_category',
    tool_name: 'finance_update_category',
    title: 'Editar categoria',
    description: 'Edita nome, tipo ou status de uma categoria financeira já existente.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      financial_category_id: { type: 'string', minLength: 2 },
      name: { type: 'string', minLength: 2, maxLength: 120 },
      kind: { type: 'string', enum: ['income', 'expense', 'neutral'] },
      is_active: { type: 'boolean' }
    }, ['financial_category_id'])
  },
  {
    id: 'finance.inactivate_category',
    tool_name: 'finance_inactivate_category',
    title: 'Inativar categoria',
    description: 'Inativa uma categoria financeira sem apagar histórico.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      financial_category_id: { type: 'string', minLength: 2 }
    }, ['financial_category_id'])
  },
  {
    id: 'finance.classify_payable',
    tool_name: 'finance_classify_payable',
    title: 'Classificar conta a pagar',
    description: 'Atualiza categoria, centro de custo, conta ou forma de pagamento de uma conta a pagar.',
    mode: 'command',
    risk_level: 'medium',
    requires_confirmation: true,
    parameters: objectSchema({
      payable_id: { type: 'string', minLength: 2 },
      financial_category_id: { type: 'string', minLength: 2 },
      financial_cost_center_id: { type: 'string', minLength: 2 },
      financial_account_id: { type: 'string', minLength: 2 },
      financial_payment_method_id: { type: 'string', minLength: 2 },
      save_as_default: { type: 'boolean' }
    }, ['payable_id'])
  }
];

export function getFinanceAgentCapabilities() {
  return FINANCE_AGENT_CAPABILITIES.map((capability) => ({ ...capability }));
}

export function financeAgentCapabilitiesAsOpenRouterTools() {
  return FINANCE_AGENT_CAPABILITIES.map((capability) => ({
    type: 'function',
    function: {
      name: capability.tool_name,
      description: capability.description,
      parameters: capability.parameters
    }
  }));
}
