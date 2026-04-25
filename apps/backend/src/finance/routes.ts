import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  hasAnyInternalPermission,
  readInternalAuthContext,
  requireInternalAuth,
  type InternalPermissionKey
} from '../internalAuth.js';
import {
  approveFinancePayable,
  buildFinanceExport,
  createFinanceAccount,
  createFinanceAccountBalanceAdjustment,
  createFinanceAttachment,
  createFinanceAutomationRule,
  createFinanceBankIntegration,
  createFinanceCategory,
  createFinanceDebt,
  createFinanceImportJob,
  cancelFinancePayable,
  cancelFinanceReceivable,
  deactivateFinanceAccount,
  deactivateFinanceCategory,
  deleteFinanceRecurringRule,
  duplicateFinancePayable,
  duplicateFinanceReceivable,
  ensureFinanceRecurringWindow,
  getFinanceReconciliationInbox,
  createFinancePayableInstallments,
  createFinancePayableRecurrences,
  createFinancePayable,
  createFinanceReceivableInstallments,
  createFinanceReceivableRecurrences,
  createFinanceReconciliationMatch,
  createFinanceReceivable,
  createFinanceRecurringRuleFromResource,
  createFinanceSimulationItem,
  createFinanceSimulationScenario,
  createFinanceStatementEntry,
  createFinanceTransaction,
  createFinanceTransactionFromStatement,
  duplicateFinanceSimulationScenario,
  deleteFinanceSimulationItem,
  deleteFinanceSimulationScenario,
  getFinanceAdvancedDashboard,
  getFinanceContext,
  getFinanceOverview,
  getFinanceSimulationScenario,
  hardDeleteFinanceAccount,
  hardDeleteFinanceCategory,
  listFinanceSimulationSources,
  listFinanceAccounts,
  listFinanceDebts,
  listFinanceImportJobs,
  listFinancePayables,
  listFinanceReconciliationMatches,
  listFinanceReceivables,
  listFinanceRecurringRules,
  listFinanceSimulationScenarios,
  listFinanceStatementEntries,
  listFinanceCategories,
  listFinanceTransactions,
  partiallySettleFinancePayable,
  partiallySettleFinanceReceivable,
  resetFinanceOperationalData,
  settleFinancePayable,
  settleFinanceReceivable,
  softDeleteFinanceTransaction,
  toggleFinanceAutomationRule,
  updateFinanceAccount,
  updateFinanceCategory,
  updateFinanceRecurringRule,
  updateFinanceSimulationItem,
  updateFinanceSimulationScenario,
  updateFinanceTransaction
} from './service.js';
import { getFinanceCashflow } from './cashflow.js';
import { getFinanceExecutiveOverview } from './context.js';
import {
  createFinanceEntity,
  createFinanceEntityTag,
  getFinanceEntityDefaultProfile,
  hardDeleteFinanceEntity,
  listFinanceEntityDuplicateGroups,
  listFinanceEntities,
  listFinanceEntityTags,
  setFinanceEntityTags,
  updateFinanceEntity,
  upsertFinanceEntityDefaultProfile
} from './entities.js';
import { getFinanceReports } from './reports.js';
import {
  createFinanceCostCenter,
  createFinanceFavoriteCombination,
  createFinancePaymentMethod,
  deactivateFinanceCostCenter,
  deactivateFinanceFavoriteCombination,
  deactivateFinancePaymentMethod,
  hardDeleteFinanceCostCenter,
  hardDeleteFinanceFavoriteCombination,
  hardDeleteFinancePaymentMethod,
  getFinanceCatalogSnapshot,
  listFinanceFavoriteCombinations,
  listFinanceCatalogAccounts,
  listFinanceCatalogCategories,
  listFinanceCostCenters,
  listFinancePaymentMethods,
  updateFinanceCostCenter,
  updateFinanceFavoriteCombination,
  updateFinancePaymentMethod
} from './catalog.js';
import { applyFinanceQualityCorrection, getFinanceQualityInbox } from './quality.js';
import {
  type FinanceEntityKind,
  type FinanceAccountKind,
  type FinanceCategoryKind,
  type FinanceEntityDefaultContext,
  type FinancePaymentMethodKind,
  type FinancePeriodPreset,
  FINANCE_TRANSACTION_KIND_VALUES,
  FINANCE_TRANSACTION_STATUS_VALUES
} from './types.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const financeAccountKindValues = ['bank', 'cash', 'wallet', 'other'] as const satisfies readonly FinanceAccountKind[];
const financeCategoryKindValues = ['income', 'expense', 'neutral'] as const satisfies readonly FinanceCategoryKind[];
const financeEntityKindValues = ['customer', 'supplier', 'both'] as const satisfies readonly FinanceEntityKind[];
const financeEntityDefaultContextValues = ['payable', 'receivable', 'transaction'] as const satisfies readonly FinanceEntityDefaultContext[];
const financeFavoriteCombinationContextValues = ['any', 'payable', 'receivable', 'transaction'] as const;
const financePaymentMethodKindValues = ['cash', 'pix', 'boleto', 'card', 'transfer', 'other'] as const satisfies readonly FinancePaymentMethodKind[];
const payableStatusValues = ['planned', 'open', 'partial', 'paid', 'overdue', 'canceled'] as const;
const receivableStatusValues = ['planned', 'open', 'partial', 'received', 'overdue', 'canceled'] as const;
const importJobStatusValues = ['queued', 'processing', 'completed', 'failed'] as const;
const reconciliationStatusValues = ['unmatched', 'matched', 'ignored'] as const;
const debtStatusValues = ['open', 'partial', 'settled', 'canceled'] as const;
const qualityResourceTypeValues = ['payable', 'receivable', 'transaction'] as const;
const financePeriodPresetValues = ['last_7', 'last_30', 'today', 'next_7', 'next_30', 'month', 'all', 'custom'] as const satisfies readonly FinancePeriodPreset[];
const financeAdvancedExportDatasets = ['transactions', 'payables', 'receivables', 'audit'] as const;
const financeAdvancedExportFormats = ['csv', 'pdf'] as const;
const financeAttachmentResourceTypes = ['payable', 'receivable', 'transaction', 'reconciliation'] as const;
const financeBankIntegrationStatuses = ['sandbox', 'connected', 'error', 'disabled'] as const;
const financeSimulationItemKinds = ['manual_inflow', 'manual_outflow', 'expected_inflow', 'scheduled_outflow', 'partial_payment'] as const;
const financeSimulationItemSources = ['manual', 'payable', 'receivable', 'transaction'] as const;

const entityCreateSchema = z.object({
  legal_name: z.string().trim().min(2).max(160),
  trade_name: z.string().trim().max(160).nullable().optional(),
  document_number: z.string().trim().max(32).nullable().optional(),
  kind: z.enum(financeEntityKindValues),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  is_active: z.boolean().optional()
});

const entityUpdateSchema = entityCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
});

const entityTagCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  is_active: z.boolean().optional()
});

const entityDefaultProfileSchema = z.object({
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  due_rule: z.string().trim().max(80).nullable().optional(),
  competence_rule: z.string().trim().max(80).nullable().optional(),
  recurrence_rule: z.string().trim().max(80).nullable().optional(),
  is_active: z.boolean().optional()
});

const entityTagsSetSchema = z.object({
  tag_ids: z.array(z.string().trim().min(1)).max(20)
});

const costCenterCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  is_active: z.boolean().optional()
});

const costCenterUpdateSchema = costCenterCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
});

const paymentMethodCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financePaymentMethodKindValues),
  is_active: z.boolean().optional()
});

const paymentMethodUpdateSchema = paymentMethodCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
});

const accountCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financeAccountKindValues),
  currency: z.string().trim().min(3).max(8).optional(),
  account_number: z.string().trim().max(64).nullable().optional(),
  branch_number: z.string().trim().max(64).nullable().optional(),
  is_active: z.boolean().optional()
});

const accountUpdateSchema = accountCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
});

const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financeCategoryKindValues),
  parent_category_id: z.string().trim().min(1).nullable().optional(),
  is_active: z.boolean().optional()
});

const categoryUpdateSchema = categoryCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
});

const favoriteCombinationCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  context: z.enum(financeFavoriteCombinationContextValues).optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  is_active: z.boolean().optional()
});

const favoriteCombinationUpdateSchema = favoriteCombinationCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
});

const payableCreateSchema = z.object({
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  supplier_name: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(2).max(240),
  amount_cents: z.number().int().positive(),
  status: z.enum(payableStatusValues),
  issue_date: isoDateSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  paid_at: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
}).superRefine((payload, ctx) => {
  if (payload.status === 'paid' && !payload.paid_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['paid_at'],
      message: 'Informe paid_at para status paid.'
    });
  }
});

const receivableCreateSchema = z.object({
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  customer_name: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(2).max(240),
  amount_cents: z.number().int().positive(),
  status: z.enum(receivableStatusValues),
  issue_date: isoDateSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  received_at: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
}).superRefine((payload, ctx) => {
  if (payload.status === 'received' && !payload.received_at) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['received_at'],
      message: 'Informe received_at para status received.'
    });
  }
});

const operationNoteSchema = z.object({
  note: z.string().trim().max(2_000).nullable().optional(),
  settled_at: isoDateSchema.nullable().optional()
});

const partialSettlementSchema = operationNoteSchema.extend({
  amount_cents: z.number().int().positive()
});

const scheduleOperationSchema = z.object({
  count: z.number().int().min(1).max(36),
  first_due_date: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
});

const recurringRuleCreateSchema = z.object({
  resource_type: z.enum(['payable', 'receivable']),
  resource_id: z.string().trim().min(1),
  day_of_month: z.number().int().min(1).max(31),
  start_date: isoDateSchema.nullable().optional(),
  end_date: isoDateSchema.nullable().optional(),
  materialization_months: z.number().int().min(1).max(24).nullable().optional()
});

const recurringRuleUpdateSchema = z.object({
  status: z.enum(['active', 'paused', 'ended']).optional(),
  end_date: isoDateSchema.nullable().optional(),
  materialization_months: z.number().int().min(1).max(24).nullable().optional()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualizar a recorrência.'
});

const importJobCreateSchema = z.object({
  import_type: z.string().trim().min(2).max(64),
  source_file_name: z.string().trim().min(2).max(255),
  source_file_mime_type: z.string().trim().max(120).nullable().optional(),
  source_file_size_bytes: z.number().int().min(0).optional(),
  status: z.enum(importJobStatusValues).optional(),
  total_rows: z.number().int().min(0).optional(),
  processed_rows: z.number().int().min(0).optional(),
  error_rows: z.number().int().min(0).optional(),
  error_summary: z.string().trim().max(2_000).nullable().optional(),
  finished_at: z.string().trim().max(40).nullable().optional()
});

const statementEntryCreateSchema = z.object({
  financial_account_id: z.string().trim().min(1),
  financial_import_job_id: z.string().trim().min(1).nullable().optional(),
  statement_date: isoDateSchema,
  posted_at: isoDateSchema.nullable().optional(),
  amount_cents: z.number().int(),
  description: z.string().trim().min(2).max(320),
  reference_code: z.string().trim().max(120).nullable().optional(),
  balance_cents: z.number().int().nullable().optional(),
  source: z.string().trim().min(2).max(40).optional(),
  source_ref: z.string().trim().max(120).nullable().optional()
});

const reconciliationCreateSchema = z.object({
  financial_bank_statement_entry_id: z.string().trim().min(1),
  financial_transaction_id: z.string().trim().min(1),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
  match_status: z.enum(reconciliationStatusValues),
  source: z.string().trim().min(2).max(40).optional(),
  reviewed_at: z.string().trim().max(40).nullable().optional()
});

const statementTransactionCreateSchema = z.object({
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
});

const debtCreateSchema = z.object({
  financial_payable_id: z.string().trim().min(1).nullable().optional(),
  financial_receivable_id: z.string().trim().min(1).nullable().optional(),
  financial_transaction_id: z.string().trim().min(1).nullable().optional(),
  debt_type: z.string().trim().min(2).max(80),
  status: z.enum(debtStatusValues),
  principal_amount_cents: z.number().int().positive(),
  outstanding_amount_cents: z.number().int().min(0),
  due_date: isoDateSchema.nullable().optional(),
  settled_at: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
});

const qualityCorrectionSchema = z.object({
  resource_type: z.enum(qualityResourceTypeValues),
  resource_id: z.string().trim().min(1),
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  competence_date: isoDateSchema.nullable().optional(),
  save_as_default: z.boolean().optional()
});

const automationRuleCreateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  trigger_type: z.string().trim().min(2).max(80),
  conditions: z.record(z.string(), z.unknown()).optional(),
  action_type: z.string().trim().min(2).max(80),
  action_payload: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional()
});

const automationRuleToggleSchema = z.object({
  is_active: z.boolean()
});

const attachmentCreateSchema = z.object({
  resource_type: z.enum(financeAttachmentResourceTypes),
  resource_id: z.string().trim().min(1),
  file_name: z.string().trim().min(2).max(220),
  mime_type: z.string().trim().min(3).max(120),
  file_size_bytes: z.number().int().min(0).optional(),
  storage_ref: z.string().trim().max(500).nullable().optional()
});

const bankIntegrationCreateSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  status: z.enum(financeBankIntegrationStatuses).optional(),
  account_name: z.string().trim().max(140).nullable().optional()
});

const simulationScenarioCreateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(500).nullable().optional(),
  start_date: isoDateSchema.nullable().optional(),
  end_date: isoDateSchema.nullable().optional(),
  starting_balance_cents: z.number().int().nullable().optional()
});

const simulationScenarioUpdateSchema = simulationScenarioCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualizar o cenário.'
});

const simulationItemCreateSchema = z.object({
  source_type: z.enum(financeSimulationItemSources).optional(),
  source_id: z.string().trim().max(120).nullable().optional(),
  kind: z.enum(financeSimulationItemKinds),
  label: z.string().trim().min(2).max(160),
  amount_cents: z.number().int().positive(),
  event_date: isoDateSchema,
  probability_percent: z.number().int().min(0).max(100).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional()
});

const simulationItemUpdateSchema = simulationItemCreateSchema.partial().refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualizar o bloco.'
});

const transactionCreateSchema = z.object({
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(FINANCE_TRANSACTION_KIND_VALUES),
  status: z.enum(FINANCE_TRANSACTION_STATUS_VALUES).optional(),
  amount_cents: z.number().int().positive(),
  issue_date: isoDateSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  settlement_date: isoDateSchema.nullable().optional(),
  competence_date: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
}).superRefine((payload, ctx) => {
  if (payload.status === 'settled' && !payload.settlement_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['settlement_date'],
      message: 'Informe settlement_date para status settled.'
    });
  }
});

const accountBalanceAdjustmentSchema = z.object({
  amount_cents: z.number().int().refine((value) => value !== 0, {
    message: 'Informe um saldo diferente de zero.'
  }),
  settlement_date: isoDateSchema,
  note: z.string().trim().max(2_000).nullable().optional()
});

const transactionUpdateSchema = z.object({
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
  financial_cost_center_id: z.string().trim().min(1).nullable().optional(),
  financial_payment_method_id: z.string().trim().min(1).nullable().optional(),
  kind: z.enum(FINANCE_TRANSACTION_KIND_VALUES).optional(),
  status: z.enum(FINANCE_TRANSACTION_STATUS_VALUES).optional(),
  amount_cents: z.number().int().positive().optional(),
  issue_date: isoDateSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  settlement_date: isoDateSchema.nullable().optional(),
  competence_date: isoDateSchema.nullable().optional(),
  note: z.string().trim().max(2_000).nullable().optional()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: 'Informe ao menos um campo para atualização.'
}).superRefine((payload, ctx) => {
  if (payload.status === 'settled'
    && Object.prototype.hasOwnProperty.call(payload, 'settlement_date')
    && !payload.settlement_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['settlement_date'],
      message: 'Informe settlement_date para status settled.'
    });
  }
});

function requireFinancePermission(permissions: InternalPermissionKey[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const context = readInternalAuthContext(res);
    if (!context) {
      return res.status(401).json({ message: 'Token de autenticação obrigatório.' });
    }
    if (context.role !== 'supremo') {
      return res.status(403).json({ message: 'Acesso negado para esta área.' });
    }
    if (!hasAnyInternalPermission(context, permissions)) {
      return res.status(403).json({ message: 'Acesso negado para esta área.' });
    }
    return next();
  };
}

function readFinanceOrganizationId(res: Response) {
  const context = readInternalAuthContext(res);
  if (!context) {
    throw new Error('Token de autenticação obrigatório.');
  }
  return context.organization_id ?? 'org-holand';
}

function resolveFinancialEntityId(payload: {
  financial_entity_id?: string | null;
}) {
  return payload.financial_entity_id?.trim() || null;
}

function readQueryText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readQueryEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const normalized = readQueryText(value);
  if (!normalized) {
    return null;
  }
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : null;
}

function readQueryDate(value: unknown): string | null {
  const normalized = readQueryText(value);
  if (!normalized) {
    return null;
  }
  return isoDateSchema.safeParse(normalized).success ? normalized : null;
}

function readQueryBoolean(value: unknown): boolean | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'sim'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'nao', 'não'].includes(normalized)) {
    return false;
  }
  return null;
}

function readCashflowHorizon(value: unknown) {
  if (typeof value !== 'string') {
    return 90;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (Number.isNaN(parsed)) {
    return 90;
  }
  if (parsed <= 30) {
    return 30;
  }
  if (parsed <= 60) {
    return 60;
  }
  return 90;
}

function readAdvancedExportQuery(query: Request['query']) {
  const dataset = typeof query.dataset === 'string' && financeAdvancedExportDatasets.includes(query.dataset as typeof financeAdvancedExportDatasets[number])
    ? query.dataset as typeof financeAdvancedExportDatasets[number]
    : 'transactions';
  const format = typeof query.format === 'string' && financeAdvancedExportFormats.includes(query.format as typeof financeAdvancedExportFormats[number])
    ? query.format as typeof financeAdvancedExportFormats[number]
    : 'csv';
  return { dataset, format };
}

function readFinancePeriodFilter(req: Request) {
  const preset = readQueryEnum(req.query.preset, financePeriodPresetValues);
  return {
    preset,
    from: readQueryDate(req.query.from),
    to: readQueryDate(req.query.to)
  };
}

function readTransactionLedgerFilters(req: Request) {
  return {
    status: readQueryEnum(req.query.status, FINANCE_TRANSACTION_STATUS_VALUES),
    kind: readQueryEnum(req.query.kind, FINANCE_TRANSACTION_KIND_VALUES),
    financial_account_id: readQueryText(req.query.financial_account_id),
    financial_category_id: readQueryText(req.query.financial_category_id),
    financial_entity_id: readQueryText(req.query.financial_entity_id),
    from: readQueryDate(req.query.from),
    to: readQueryDate(req.query.to),
    search: readQueryText(req.query.search),
    include_deleted: readQueryBoolean(req.query.include_deleted)
  };
}

function respondFinanceError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('não encontrado') ? 404 : 400;
  return res.status(status).json({ message });
}

export function registerFinanceRoutes(app: Express) {
  const router = express.Router();

  router.use(requireInternalAuth);

  router.get('/context', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(getFinanceContext(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/quality/inbox', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(getFinanceQualityInbox(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/quality/issues/apply', requireFinancePermission(['finance.write', 'finance.reconcile']), (req, res) => {
    const parsed = qualityCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(applyFinanceQualityCorrection({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/entities', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      const kind = typeof req.query.kind === 'string' ? req.query.kind : null;
      if (kind && !financeEntityKindValues.includes(kind as FinanceEntityKind)) {
        return res.status(400).json({ message: 'kind inválido.' });
      }
      return res.json(listFinanceEntities(readFinanceOrganizationId(res), kind as FinanceEntityKind | null));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/entities', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = entityCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinanceEntity({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/entities/duplicates', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinanceEntityDuplicateGroups(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/entities/:entityId', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = entityUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinanceEntity({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: req.params.entityId
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/entities/:entityId', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      if (req.query.mode === 'hard') {
        return res.json(hardDeleteFinanceEntity(readFinanceOrganizationId(res), req.params.entityId));
      }

      return res.json(updateFinanceEntity({
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: req.params.entityId,
        is_active: false
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/entities/tags', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinanceEntityTags(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/entities/tags', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = entityTagCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinanceEntityTag({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.put('/entities/:entityId/tags', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = entityTagsSetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(setFinanceEntityTags({
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: req.params.entityId,
        tag_ids: parsed.data.tag_ids
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/entities/:entityId/defaults/:context', requireFinancePermission(['finance.read']), (req, res) => {
    const context = z.enum(financeEntityDefaultContextValues).safeParse(req.params.context);
    if (!context.success) {
      return res.status(400).json(context.error.flatten());
    }

    try {
      const profile = getFinanceEntityDefaultProfile(readFinanceOrganizationId(res), req.params.entityId, context.data);
      return res.json(profile);
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.put('/entities/:entityId/defaults/:context', requireFinancePermission(['finance.write']), (req, res) => {
    const context = z.enum(financeEntityDefaultContextValues).safeParse(req.params.context);
    const parsed = entityDefaultProfileSchema.safeParse(req.body);
    if (!context.success) {
      return res.status(400).json(context.error.flatten());
    }
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(upsertFinanceEntityDefaultProfile({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: req.params.entityId,
        context: context.data
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/catalog', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(getFinanceCatalogSnapshot(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/catalog/favorite-combinations', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinanceFavoriteCombinations(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/catalog/favorite-combinations', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = favoriteCombinationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinanceFavoriteCombination({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/catalog/favorite-combinations/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = favoriteCombinationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinanceFavoriteCombination({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_favorite_combination_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/catalog/favorite-combinations/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      if (req.query.mode === 'hard') {
        return res.json(hardDeleteFinanceFavoriteCombination(readFinanceOrganizationId(res), req.params.id));
      }

      return res.json(deactivateFinanceFavoriteCombination(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/catalog/accounts', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinanceCatalogAccounts(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/catalog/categories', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinanceCatalogCategories(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/catalog/cost-centers', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinanceCostCenters(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/catalog/cost-centers', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = costCenterCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinanceCostCenter({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/catalog/cost-centers/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = costCenterUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinanceCostCenter({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_cost_center_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/catalog/cost-centers/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      if (req.query.mode === 'hard') {
        return res.json(hardDeleteFinanceCostCenter(readFinanceOrganizationId(res), req.params.id));
      }

      return res.json(deactivateFinanceCostCenter(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/catalog/payment-methods', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(listFinancePaymentMethods(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/catalog/payment-methods', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = paymentMethodCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinancePaymentMethod({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/catalog/payment-methods/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = paymentMethodUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinancePaymentMethod({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_payment_method_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/catalog/payment-methods/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      if (req.query.mode === 'hard') {
        return res.json(hardDeleteFinancePaymentMethod(readFinanceOrganizationId(res), req.params.id));
      }

      return res.json(deactivateFinancePaymentMethod(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/overview', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      ensureFinanceRecurringWindow(readFinanceOrganizationId(res));
      return res.json(getFinanceOverview(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/overview/executive', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      ensureFinanceRecurringWindow(readFinanceOrganizationId(res));
      return res.json(getFinanceExecutiveOverview(readFinanceOrganizationId(res), readFinancePeriodFilter(req)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/advanced', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      const context = readInternalAuthContext(res);
      return res.json(getFinanceAdvancedDashboard(readFinanceOrganizationId(res), context?.permissions ?? []));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/advanced/automation-rules', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = automationRuleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceAutomationRule({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/advanced/automation-rules/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = automationRuleToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.json(toggleFinanceAutomationRule(readFinanceOrganizationId(res), req.params.id, parsed.data.is_active));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/advanced/payables/:id/approve', requireFinancePermission(['finance.approve', 'finance.write']), (req, res) => {
    const parsed = operationNoteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(approveFinancePayable({
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        note: parsed.data.note,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/advanced/attachments', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = attachmentCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceAttachment({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/advanced/bank-integrations', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = bankIntegrationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceBankIntegration({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/advanced/operational-data', requireFinancePermission(['finance.approve']), (_req, res) => {
    try {
      return res.json(resetFinanceOperationalData(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/simulations', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json({ scenarios: listFinanceSimulationScenarios(readFinanceOrganizationId(res)) });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/simulations', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = simulationScenarioCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceSimulationScenario({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/simulations/sources', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      const scenarioId = typeof req.query.scenario_id === 'string' ? req.query.scenario_id : null;
      return res.json(listFinanceSimulationSources(readFinanceOrganizationId(res), scenarioId));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/simulations/:id', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(getFinanceSimulationScenario(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/simulations/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = simulationScenarioUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.json(updateFinanceSimulationScenario({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        scenario_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/simulations/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      return res.json(deleteFinanceSimulationScenario(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/simulations/:id/items', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = simulationItemCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.status(201).json(createFinanceSimulationItem({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        scenario_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/simulations/:id/items/:itemId', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = simulationItemUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.json(updateFinanceSimulationItem({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        scenario_id: req.params.id,
        item_id: req.params.itemId
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/simulations/:id/items/:itemId', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      return res.json(deleteFinanceSimulationItem(readFinanceOrganizationId(res), req.params.id, req.params.itemId));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/simulations/:id/duplicate', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(duplicateFinanceSimulationScenario(
        readFinanceOrganizationId(res),
        req.params.id,
        context?.username ?? null
      ));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/exports', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      const { dataset, format } = readAdvancedExportQuery(req.query);
      const output = buildFinanceExport(readFinanceOrganizationId(res), dataset, format);
      res.setHeader('Content-Type', output.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${output.fileName}"`);
      return res.send(output.body);
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/transactions', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceTransactions(readFinanceOrganizationId(res), readTransactionLedgerFilters(req)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/accounts', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceAccounts(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/accounts', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = accountCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinanceAccount({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/accounts/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = accountUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinanceAccount({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_account_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/accounts/:id/balance-adjustments', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = accountBalanceAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceAccountBalanceAdjustment({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_account_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/accounts/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      if (req.query.mode === 'hard') {
        return res.json(hardDeleteFinanceAccount(readFinanceOrganizationId(res), req.params.id));
      }

      return res.json(deactivateFinanceAccount(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/categories', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceCategories(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/categories', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = categoryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.status(201).json(createFinanceCategory({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/categories/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = categoryUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinanceCategory({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_category_id: req.params.id
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/categories/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      if (req.query.mode === 'hard') {
        return res.json(hardDeleteFinanceCategory(readFinanceOrganizationId(res), req.params.id));
      }

      return res.json(deactivateFinanceCategory(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/payables', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      ensureFinanceRecurringWindow(readFinanceOrganizationId(res));
      return res.json(listFinancePayables(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/recurring-rules', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      ensureFinanceRecurringWindow(readFinanceOrganizationId(res));
      return res.json({ rules: listFinanceRecurringRules(readFinanceOrganizationId(res)) });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/recurring-rules/from-resource', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = recurringRuleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceRecurringRuleFromResource({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/recurring-rules/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = recurringRuleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(updateFinanceRecurringRule({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        recurring_rule_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/recurring-rules/:id', requireFinancePermission(['finance.write']), (req, res) => {
    try {
      return res.json(deleteFinanceRecurringRule(readFinanceOrganizationId(res), req.params.id));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = payableCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.status(201).json(createFinancePayable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: resolveFinancialEntityId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables/:id/settle', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = operationNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(settleFinancePayable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables/:id/partial', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = partialSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(partiallySettleFinancePayable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables/:id/duplicate', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = operationNoteSchema.pick({ note: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(duplicateFinancePayable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables/:id/cancel', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = operationNoteSchema.pick({ note: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(cancelFinancePayable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables/:id/installments', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = scheduleOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json({
        payables: createFinancePayableInstallments({
          ...parsed.data,
          organization_id: readFinanceOrganizationId(res),
          resource_id: req.params.id,
          created_by: context?.username ?? null
        })
      });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/payables/:id/recurrences', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = scheduleOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json({
        payables: createFinancePayableRecurrences({
          ...parsed.data,
          organization_id: readFinanceOrganizationId(res),
          resource_id: req.params.id,
          created_by: context?.username ?? null
        })
      });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/receivables', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      ensureFinanceRecurringWindow(readFinanceOrganizationId(res));
      return res.json(listFinanceReceivables(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = receivableCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.status(201).json(createFinanceReceivable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: resolveFinancialEntityId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables/:id/settle', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = operationNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(settleFinanceReceivable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables/:id/partial', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = partialSettlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(partiallySettleFinanceReceivable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables/:id/duplicate', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = operationNoteSchema.pick({ note: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(duplicateFinanceReceivable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables/:id/cancel', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = operationNoteSchema.pick({ note: true }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.json(cancelFinanceReceivable({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        resource_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables/:id/installments', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = scheduleOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json({
        receivables: createFinanceReceivableInstallments({
          ...parsed.data,
          organization_id: readFinanceOrganizationId(res),
          resource_id: req.params.id,
          created_by: context?.username ?? null
        })
      });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/receivables/:id/recurrences', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = scheduleOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json({
        receivables: createFinanceReceivableRecurrences({
          ...parsed.data,
          organization_id: readFinanceOrganizationId(res),
          resource_id: req.params.id,
          created_by: context?.username ?? null
        })
      });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/import-jobs', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceImportJobs(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/import-jobs', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = importJobCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceImportJob({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/statement-entries', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceStatementEntries(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/statement-entries', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = statementEntryCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.status(201).json(createFinanceStatementEntry({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/reconciliations', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceReconciliationMatches(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/reconciliations', requireFinancePermission(['finance.reconcile', 'finance.write']), (req, res) => {
    const parsed = reconciliationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceReconciliationMatch({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        reviewed_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/reconciliation/inbox', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(getFinanceReconciliationInbox(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/reconciliation/statement-entries/:id/transaction', requireFinancePermission(['finance.reconcile', 'finance.write']), (req, res) => {
    const parsed = statementTransactionCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      const context = readInternalAuthContext(res);
      return res.status(201).json(createFinanceTransactionFromStatement({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_bank_statement_entry_id: req.params.id,
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/cashflow', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(getFinanceCashflow(readFinanceOrganizationId(res), readCashflowHorizon(req.query.horizon)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/reports', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      const hasPeriodQuery = Boolean(req.query.preset || req.query.from || req.query.to);
      ensureFinanceRecurringWindow(readFinanceOrganizationId(res));
      return res.json(getFinanceReports(
        readFinanceOrganizationId(res),
        hasPeriodQuery ? readFinancePeriodFilter(req) : { preset: 'all' }
      ));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/debts', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceDebts(readFinanceOrganizationId(res)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/debts', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = debtCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    try {
      return res.status(201).json(createFinanceDebt({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.post('/transactions', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = transactionCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      const context = readInternalAuthContext(res);
      const created = createFinanceTransaction({
        ...parsed.data,
        organization_id: readFinanceOrganizationId(res),
        financial_entity_id: resolveFinancialEntityId(parsed.data),
        created_by: context?.username ?? null
      });
      return res.status(201).json(created);
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.patch('/transactions/:id', requireFinancePermission(['finance.write']), (req, res) => {
    const parsed = transactionUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    try {
      return res.json(updateFinanceTransaction(readFinanceOrganizationId(res), req.params.id, parsed.data));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/transactions/:id', requireFinancePermission(['finance.approve']), (req, res) => {
    try {
      return res.json({
        ok: true,
        transaction: softDeleteFinanceTransaction(readFinanceOrganizationId(res), req.params.id)
      });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  app.use('/finance', router);
}
