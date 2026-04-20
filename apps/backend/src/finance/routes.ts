import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  hasAnyInternalPermission,
  readInternalAuthContext,
  requireInternalAuth,
  type InternalPermissionKey
} from '../internalAuth.js';
import {
  createFinanceTransaction,
  getFinanceOverview,
  listFinanceTransactions,
  softDeleteFinanceTransaction,
  updateFinanceTransaction
} from './service.js';
import {
  FINANCE_TRANSACTION_KIND_VALUES,
  FINANCE_TRANSACTION_STATUS_VALUES
} from './types.js';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const transactionCreateSchema = z.object({
  company_id: z.string().trim().min(1),
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
});

const transactionUpdateSchema = z.object({
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

function parseCompanyId(req: Request) {
  const raw = typeof req.query.company_id === 'string' ? req.query.company_id.trim() : '';
  return raw || null;
}

function respondFinanceError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('não encontrado') ? 404 : 400;
  return res.status(status).json({ message });
}

export function registerFinanceRoutes(app: Express) {
  const router = express.Router();

  router.use(requireInternalAuth);

  router.get('/overview', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(getFinanceOverview(parseCompanyId(req)));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.get('/transactions', requireFinancePermission(['finance.read']), (req, res) => {
    try {
      return res.json(listFinanceTransactions(parseCompanyId(req)));
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
      return res.json(updateFinanceTransaction(req.params.id, parsed.data));
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  router.delete('/transactions/:id', requireFinancePermission(['finance.approve']), (req, res) => {
    try {
      return res.json({ ok: true, transaction: softDeleteFinanceTransaction(req.params.id) });
    } catch (error) {
      return respondFinanceError(res, error);
    }
  });

  app.use('/finance', router);
}
