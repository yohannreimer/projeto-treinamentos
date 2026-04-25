import { db } from '../db.js';
import { upsertFinanceEntityDefaultProfile } from './entities.js';
import type {
  ApplyFinanceQualityCorrectionInput,
  FinanceQualityInboxDto,
  FinanceQualityIssueDto,
  FinanceQualityResourceType
} from './types.js';

const DEFAULT_ORGANIZATION_ID = 'org-holand';

function resolveOrganizationId(organizationId?: string | null) {
  const normalized = organizationId?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_ORGANIZATION_ID;
}

function readOrganizationRow(organizationId: string) {
  const row = db.prepare('select id, name from organization where id = ? limit 1').get(organizationId);
  if (!row) {
    throw new Error('Organização não encontrada.');
  }
}

function severityForMissingFields(missingFields: string[]) {
  const criticalFields = ['financial_entity_id', 'financial_category_id', 'financial_cost_center_id'];
  if (missingFields.some((field) => criticalFields.includes(field))) {
    return 'critical' as const;
  }
  return 'warning' as const;
}

const FIELD_LABELS: Record<string, string> = {
  financial_entity_id: 'cliente ou fornecedor',
  financial_category_id: 'categoria',
  financial_cost_center_id: 'centro de custo',
  financial_account_id: 'conta financeira',
  due_date: 'data de vencimento',
  competence_date: 'competência'
};

function humanFieldList(fields: string[]) {
  const labels = fields.map((field) => FIELD_LABELS[field] ?? field);
  if (labels.length <= 1) return labels[0] ?? 'classificação';
  if (labels.length === 2) return `${labels[0]} e ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

function buildIssue(params: {
  organization_id: string;
  resource_type: FinanceQualityResourceType;
  resource_id: string;
  description: string;
  amount_cents: number;
  reference_date: string | null;
  entity_name: string | null;
  financial_entity_id: string | null;
  financial_category_id: string | null;
  financial_cost_center_id: string | null;
  financial_account_id: string | null;
  due_date: string | null;
  competence_date?: string | null;
}): FinanceQualityIssueDto | null {
  const missingFields: string[] = [];
  if (!params.financial_entity_id) missingFields.push('financial_entity_id');
  if (!params.financial_category_id) missingFields.push('financial_category_id');
  if (!params.financial_cost_center_id) missingFields.push('financial_cost_center_id');
  if (!params.financial_account_id) missingFields.push('financial_account_id');
  if (!params.due_date) missingFields.push('due_date');
  if ('competence_date' in params && !params.competence_date) missingFields.push('competence_date');

  if (missingFields.length === 0) {
    return null;
  }

  const severity = severityForMissingFields(missingFields);
  return {
    id: `${params.resource_type}:${params.resource_id}`,
    organization_id: params.organization_id,
    resource_type: params.resource_type,
    resource_id: params.resource_id,
    severity,
    missing_fields: missingFields,
    title: severity === 'critical' ? 'Classificação importante pendente' : 'Dados do lançamento incompletos',
    detail: `${params.description} está sem ${humanFieldList(missingFields)}.`,
    amount_cents: params.amount_cents,
    reference_date: params.reference_date,
    entity_name: params.entity_name,
    suggestions: []
  };
}

export function getFinanceQualityInbox(organizationId: string): FinanceQualityInboxDto {
  const normalizedOrganizationId = resolveOrganizationId(organizationId);
  readOrganizationRow(normalizedOrganizationId);

  const payableRows = db.prepare(`
    select
      fp.id,
      fp.organization_id,
      fp.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name, fp.supplier_name) as entity_name,
      fp.financial_category_id,
      fp.financial_cost_center_id,
      fp.financial_account_id,
      fp.financial_payment_method_id,
      fp.description,
      fp.amount_cents,
      fp.due_date
    from financial_payable fp
    left join financial_entity fe
      on fe.organization_id = fp.organization_id and fe.id = fp.financial_entity_id
    where fp.organization_id = ?
      and fp.status <> 'canceled'
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    financial_entity_id: string | null;
    entity_name: string | null;
    financial_category_id: string | null;
    financial_cost_center_id: string | null;
    financial_account_id: string | null;
    financial_payment_method_id: string | null;
    description: string;
    amount_cents: number;
    due_date: string | null;
  }>;

  const issues = payableRows
    .map((row) => buildIssue({
      organization_id: row.organization_id,
      resource_type: 'payable',
      resource_id: row.id,
      description: row.description,
      amount_cents: row.amount_cents,
      reference_date: row.due_date,
      entity_name: row.entity_name,
      financial_entity_id: row.financial_entity_id,
      financial_category_id: row.financial_category_id,
      financial_cost_center_id: row.financial_cost_center_id,
      financial_account_id: row.financial_account_id,
      due_date: row.due_date
    }))
    .filter((issue): issue is FinanceQualityIssueDto => Boolean(issue));

  const receivableRows = db.prepare(`
    select
      fr.id,
      fr.organization_id,
      fr.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name, fr.customer_name) as entity_name,
      fr.financial_category_id,
      fr.financial_cost_center_id,
      fr.financial_account_id,
      fr.financial_payment_method_id,
      fr.description,
      fr.amount_cents,
      fr.due_date
    from financial_receivable fr
    left join financial_entity fe
      on fe.organization_id = fr.organization_id and fe.id = fr.financial_entity_id
    where fr.organization_id = ?
      and fr.status <> 'canceled'
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    financial_entity_id: string | null;
    entity_name: string | null;
    financial_category_id: string | null;
    financial_cost_center_id: string | null;
    financial_account_id: string | null;
    financial_payment_method_id: string | null;
    description: string;
    amount_cents: number;
    due_date: string | null;
  }>;

  const receivableIssues = receivableRows
    .map((row) => buildIssue({
      organization_id: row.organization_id,
      resource_type: 'receivable',
      resource_id: row.id,
      description: row.description,
      amount_cents: row.amount_cents,
      reference_date: row.due_date,
      entity_name: row.entity_name,
      financial_entity_id: row.financial_entity_id,
      financial_category_id: row.financial_category_id,
      financial_cost_center_id: row.financial_cost_center_id,
      financial_account_id: row.financial_account_id,
      due_date: row.due_date
    }))
    .filter((issue): issue is FinanceQualityIssueDto => Boolean(issue));

  const transactionRows = db.prepare(`
    select
      ft.id,
      ft.organization_id,
      ft.financial_entity_id,
      coalesce(fe.trade_name, fe.legal_name) as entity_name,
      ft.financial_category_id,
      ft.financial_cost_center_id,
      ft.financial_account_id,
      ft.financial_payment_method_id,
      coalesce(ft.note, 'Movimentação financeira') as description,
      ft.amount_cents,
      ft.due_date,
      ft.competence_date
    from financial_transaction ft
    left join financial_entity fe
      on fe.organization_id = ft.organization_id and fe.id = ft.financial_entity_id
    where ft.organization_id = ?
      and ft.status <> 'canceled'
      and coalesce(ft.is_deleted, 0) = 0
  `).all(normalizedOrganizationId) as Array<{
    id: string;
    organization_id: string;
    financial_entity_id: string | null;
    entity_name: string | null;
    financial_category_id: string | null;
    financial_cost_center_id: string | null;
    financial_account_id: string | null;
    financial_payment_method_id: string | null;
    description: string;
    amount_cents: number;
    due_date: string | null;
    competence_date: string | null;
  }>;

  const transactionIssues = transactionRows
    .map((row) => buildIssue({
      organization_id: row.organization_id,
      resource_type: 'transaction',
      resource_id: row.id,
      description: row.description,
      amount_cents: row.amount_cents,
      reference_date: row.competence_date ?? row.due_date,
      entity_name: row.entity_name,
      financial_entity_id: row.financial_entity_id,
      financial_category_id: row.financial_category_id,
      financial_cost_center_id: row.financial_cost_center_id,
      financial_account_id: row.financial_account_id,
      due_date: row.due_date,
      competence_date: row.competence_date
    }))
    .filter((issue): issue is FinanceQualityIssueDto => Boolean(issue));

  const allIssues = [...issues, ...receivableIssues, ...transactionIssues];

  return {
    organization_id: normalizedOrganizationId,
    generated_at: new Date().toISOString(),
    summary: {
      total_count: allIssues.length,
      critical_count: allIssues.filter((issue) => issue.severity === 'critical').length,
      warning_count: allIssues.filter((issue) => issue.severity === 'warning').length,
      suggestion_count: allIssues.filter((issue) => issue.severity === 'suggestion').length
    },
    issues: allIssues
  };
}

export function applyFinanceQualityCorrection(input: ApplyFinanceQualityCorrectionInput) {
  const normalizedOrganizationId = resolveOrganizationId(input.organization_id);
  readOrganizationRow(normalizedOrganizationId);

  const nowIso = new Date().toISOString();
  if (input.resource_type === 'payable') {
    db.prepare(`
      update financial_payable
      set financial_entity_id = coalesce(?, financial_entity_id),
          financial_category_id = coalesce(?, financial_category_id),
          financial_cost_center_id = coalesce(?, financial_cost_center_id),
          financial_account_id = coalesce(?, financial_account_id),
          financial_payment_method_id = coalesce(?, financial_payment_method_id),
          due_date = coalesce(?, due_date),
          updated_at = ?
      where organization_id = ? and id = ?
    `).run(
      input.financial_entity_id ?? null,
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_date ?? null,
      nowIso,
      normalizedOrganizationId,
      input.resource_id
    );
  } else if (input.resource_type === 'receivable') {
    db.prepare(`
      update financial_receivable
      set financial_entity_id = coalesce(?, financial_entity_id),
          financial_category_id = coalesce(?, financial_category_id),
          financial_cost_center_id = coalesce(?, financial_cost_center_id),
          financial_account_id = coalesce(?, financial_account_id),
          financial_payment_method_id = coalesce(?, financial_payment_method_id),
          due_date = coalesce(?, due_date),
          updated_at = ?
      where organization_id = ? and id = ?
    `).run(
      input.financial_entity_id ?? null,
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_date ?? null,
      nowIso,
      normalizedOrganizationId,
      input.resource_id
    );
  } else {
    db.prepare(`
      update financial_transaction
      set financial_entity_id = coalesce(?, financial_entity_id),
          financial_category_id = coalesce(?, financial_category_id),
          financial_cost_center_id = coalesce(?, financial_cost_center_id),
          financial_account_id = coalesce(?, financial_account_id),
          financial_payment_method_id = coalesce(?, financial_payment_method_id),
          due_date = coalesce(?, due_date),
          competence_date = coalesce(?, competence_date),
          updated_at = ?
      where organization_id = ? and id = ?
    `).run(
      input.financial_entity_id ?? null,
      input.financial_category_id ?? null,
      input.financial_cost_center_id ?? null,
      input.financial_account_id ?? null,
      input.financial_payment_method_id ?? null,
      input.due_date ?? null,
      input.competence_date ?? null,
      nowIso,
      normalizedOrganizationId,
      input.resource_id
    );
  }

  if (input.save_as_default && input.financial_entity_id) {
    upsertFinanceEntityDefaultProfile({
      organization_id: normalizedOrganizationId,
      financial_entity_id: input.financial_entity_id,
      context: input.resource_type === 'payable' ? 'payable' : input.resource_type === 'receivable' ? 'receivable' : 'transaction',
      financial_category_id: input.financial_category_id ?? null,
      financial_cost_center_id: input.financial_cost_center_id ?? null,
      financial_account_id: input.financial_account_id ?? null,
      financial_payment_method_id: input.financial_payment_method_id ?? null
    });
  }

  const remainingIssues = getFinanceQualityInbox(normalizedOrganizationId).issues
    .filter((issue) => issue.resource_type === input.resource_type && issue.resource_id === input.resource_id);

  return {
    resource_type: input.resource_type,
    resource_id: input.resource_id,
    remaining_issue_count: remainingIssues.length
  };
}
