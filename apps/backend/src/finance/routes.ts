import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  hasAnyInternalPermission,
  readInternalAuthContext,
  requireInternalAuth,
  type InternalPermissionKey
} from '../internalAuth.js';
import {
  createFinanceAccount,
  createFinanceCategory,
  createFinanceDebt,
  createFinanceImportJob,
  createFinancePayable,
  createFinanceReconciliationMatch,
  createFinanceReceivable,
  createFinanceStatementEntry,
  createFinanceTransaction,
  getFinanceContext,
  getFinanceOverview,
  listFinanceAccounts,
  listFinanceDebts,
  listFinanceImportJobs,
  listFinancePayables,
  listFinanceReconciliationMatches,
  listFinanceReceivables,
  listFinanceStatementEntries,
  listFinanceCategories,
  listFinanceTransactions,
  softDeleteFinanceTransaction,
  updateFinanceTransaction
} from './service.js';
import { getFinanceExecutiveOverview } from './context.js';
import { createFinanceEntity, listFinanceEntities } from './entities.js';
import {
  createFinanceCostCenter,
  createFinancePaymentMethod,
  getFinanceCatalogSnapshot,
  listFinanceCatalogAccounts,
  listFinanceCatalogCategories,
  listFinanceCostCenters,
  listFinancePaymentMethods
} from './catalog.js';
import {
  type FinanceEntityKind,
  type FinanceAccountKind,
  type FinanceCategoryKind,
  type FinancePaymentMethodKind,
  FINANCE_TRANSACTION_KIND_VALUES,
  FINANCE_TRANSACTION_STATUS_VALUES
} from './types.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const financeAccountKindValues = ['bank', 'cash', 'wallet', 'other'] as const satisfies readonly FinanceAccountKind[];
const financeCategoryKindValues = ['income', 'expense', 'neutral'] as const satisfies readonly FinanceCategoryKind[];
const financeEntityKindValues = ['customer', 'supplier', 'both'] as const satisfies readonly FinanceEntityKind[];
const financePaymentMethodKindValues = ['cash', 'pix', 'boleto', 'card', 'transfer', 'other'] as const satisfies readonly FinancePaymentMethodKind[];
const payableStatusValues = ['planned', 'open', 'partial', 'paid', 'overdue', 'canceled'] as const;
const receivableStatusValues = ['planned', 'open', 'partial', 'received', 'overdue', 'canceled'] as const;
const importJobStatusValues = ['queued', 'processing', 'completed', 'failed'] as const;
const reconciliationStatusValues = ['unmatched', 'matched', 'ignored'] as const;
const debtStatusValues = ['open', 'partial', 'settled', 'canceled'] as const;

const entityCreateSchema = z.object({
  legal_name: z.string().trim().min(2).max(160),
  trade_name: z.string().trim().max(160).nullable().optional(),
  document_number: z.string().trim().max(32).nullable().optional(),
  kind: z.enum(financeEntityKindValues),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  is_active: z.boolean().optional()
});

const costCenterCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  is_active: z.boolean().optional()
});

const paymentMethodCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financePaymentMethodKindValues),
  is_active: z.boolean().optional()
});

const accountCreateSchema = z.object({
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financeAccountKindValues),
  currency: z.string().trim().min(3).max(8).optional(),
  account_number: z.string().trim().max(64).nullable().optional(),
  branch_number: z.string().trim().max(64).nullable().optional(),
  is_active: z.boolean().optional()
});

const categoryCreateSchema = z.object({
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(financeCategoryKindValues),
  parent_category_id: z.string().trim().min(1).nullable().optional(),
  is_active: z.boolean().optional()
});

const payableCreateSchema = z.object({
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
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
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
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

const importJobCreateSchema = z.object({
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
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
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
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
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
  financial_bank_statement_entry_id: z.string().trim().min(1),
  financial_transaction_id: z.string().trim().min(1),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
  match_status: z.enum(reconciliationStatusValues),
  source: z.string().trim().min(2).max(40).optional(),
  reviewed_at: z.string().trim().max(40).nullable().optional()
});

const debtCreateSchema = z.object({
  company_id: z.string().trim().min(1).nullable().optional(),
  counterparty_company_id: z.string().trim().min(1).nullable().optional(),
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

const transactionCreateSchema = z.object({
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
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

const transactionUpdateSchema = z.object({
  financial_entity_id: z.string().trim().min(1).nullable().optional(),
  financial_account_id: z.string().trim().min(1).nullable().optional(),
  financial_category_id: z.string().trim().min(1).nullable().optional(),
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
    if (!hasAnyInternalPermission(context, permissions)) {
      return res.status(403).json({ message: 'Acesso negado para esta área.' });
    }
    return next();
  };
}

function parseCounterpartyCompanyId(req: Request) {
  const rawCompany = typeof req.query.company_id === 'string' ? req.query.company_id.trim() : '';
  const rawCounterparty = typeof req.query.counterparty_company_id === 'string'
    ? req.query.counterparty_company_id.trim()
    : '';
  const raw = rawCounterparty || rawCompany;
  return raw || null;
}

function readFinanceOrganizationId(res: Response) {
  const context = readInternalAuthContext(res);
  if (!context) {
    throw new Error('Token de autenticação obrigatório.');
  }
  return context.organization_id ?? 'org-holand';
}

function resolveCounterpartyCompanyId(payload: {
  company_id?: string | null;
  counterparty_company_id?: string | null;
}) {
  const normalized = payload.counterparty_company_id?.trim() || payload.company_id?.trim() || '';
  return normalized || null;
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

  router.get('/catalog', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(getFinanceCatalogSnapshot(readFinanceOrganizationId(res)));
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

  router.get('/overview', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(getFinanceOverview(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/overview/executive', requireFinancePermission(['finance.read']), (_req, res) => {
    try {
      return res.json(getFinanceExecutiveOverview(readFinanceOrganizationId(res)));
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
      return res.json(listFinanceAccounts(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        organization_id: readFinanceOrganizationId(res),
        company_id: resolveCounterpartyCompanyId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/categories', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceCategories(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        organization_id: readFinanceOrganizationId(res),
        company_id: resolveCounterpartyCompanyId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/payables', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinancePayables(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        company_id: resolveCounterpartyCompanyId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/receivables', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceReceivables(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        company_id: resolveCounterpartyCompanyId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/import-jobs', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceImportJobs(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        company_id: resolveCounterpartyCompanyId(parsed.data),
        created_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/statement-entries', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceStatementEntries(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        organization_id: readFinanceOrganizationId(res),
        company_id: resolveCounterpartyCompanyId(parsed.data)
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/reconciliations', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceReconciliationMatches(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        company_id: resolveCounterpartyCompanyId(parsed.data),
        reviewed_by: context?.username ?? null
      }));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/debts', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceDebts(readFinanceOrganizationId(res), parseCounterpartyCompanyId(req)));
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
        organization_id: readFinanceOrganizationId(res),
        company_id: resolveCounterpartyCompanyId(parsed.data)
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
