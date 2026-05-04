import { db } from '../db.js';

type FinanceAiInteractionResultRow = {
  result_json: string;
};

type FinanceAgentObjectType = 'recurring_rule' | 'payable' | 'receivable' | 'entity' | 'simulation';

export type FinanceAgentObjectReference = {
  type: FinanceAgentObjectType;
  id: string;
  label: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectReferenceFromResult(result: Record<string, unknown>, type: FinanceAgentObjectType): FinanceAgentObjectReference | null {
  const payload = isRecord(result.payload) ? result.payload : {};
  const directResourceId = readString(result, 'resource_id');

  if (type === 'recurring_rule') {
    const recurringRule = isRecord(payload.recurring_rule) ? payload.recurring_rule : null;
    if (!recurringRule) return null;
    const id = readString(recurringRule, 'id');
    if (!id) return null;
    return {
      type,
      id,
      label: readString(recurringRule, 'name')
    };
  }

  const nested = isRecord(payload[type]) ? payload[type] : null;
  const id = nested ? readString(nested, 'id') : directResourceId;
  if (!id) return null;
  return {
    type,
    id,
    label: nested ? readString(nested, 'description') ?? readString(nested, 'legal_name') ?? readString(nested, 'name') : null
  };
}

export function getLastFinanceAgentObject(input: {
  organization_id: string;
  created_by?: string | null;
  type: FinanceAgentObjectType;
}) {
  const rows = db.prepare(`
    select result_json
    from financial_ai_interaction
    where organization_id = ?
      and status = 'executed'
      and (? is null or created_by = ?)
    order by confirmed_at desc, created_at desc
    limit 25
  `).all(
    input.organization_id,
    input.created_by?.trim() || null,
    input.created_by?.trim() || null
  ) as FinanceAiInteractionResultRow[];

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.result_json) as unknown;
      const results = isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results : [];
      for (const result of results.filter(isRecord)) {
        const reference = objectReferenceFromResult(result, input.type);
        if (reference) {
          return reference;
        }
      }
    } catch {
      // Ignore malformed old interaction rows; they should not block newer context.
    }
  }

  return null;
}
