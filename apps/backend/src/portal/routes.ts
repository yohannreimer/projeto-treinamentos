import express, { type Express } from 'express';
import { z } from 'zod';
import { db, uuid } from '../db.js';
import {
  createPortalSession,
  findPortalUserBySlugAndUsername,
  readPortalAuthContext,
  requirePortalAuth,
  verifyPassword
} from './auth.js';
import { toClientFacingStatus } from './status.js';

const DUMMY_PASSWORD_HASH = 'scrypt:00112233445566778899aabbccddeeff:5232aa4cb8582e8f374f25579c6f9ad17d5a9af5ba6d42d4c44df702d20c9d4faef25ea0fca6a5aa69b8bb25439ee4c45cb8e173ceb7f0972b0a8f7fbf2bbd99';
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_BLOCK_MS = 5 * 60_000;
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_MAX_TRACKED_KEYS = 3_000;

type LoginAttemptState = {
  startedAtMs: number;
  lastAttemptAtMs: number;
  attempts: number;
  blockedUntilMs: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();

const loginSchema = z.object({
  slug: z.string().trim().min(2).max(120),
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200)
});

const createTicketSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2_000).nullable().optional(),
  priority: z.enum(['Alta', 'Normal', 'Baixa', 'Critica']).default('Normal')
});

function buildLoginThrottleKey(ip: string, userAgent: string, slug: string, username: string) {
  return `${ip}::${userAgent}::${slug.trim().toLowerCase()}::${username.trim().toLowerCase()}`;
}

function pruneLoginAttempts(nowMs: number) {
  for (const [key, state] of loginAttempts.entries()) {
    const staleWindowExpired = nowMs - state.lastAttemptAtMs > (LOGIN_WINDOW_MS + LOGIN_BLOCK_MS);
    const blockExpired = state.blockedUntilMs <= nowMs;
    if (staleWindowExpired && blockExpired) {
      loginAttempts.delete(key);
    }
  }

  if (loginAttempts.size <= LOGIN_MAX_TRACKED_KEYS) {
    return;
  }

  const oldestEntries = Array.from(loginAttempts.entries())
    .sort((a, b) => a[1].lastAttemptAtMs - b[1].lastAttemptAtMs);
  const overflowCount = oldestEntries.length - LOGIN_MAX_TRACKED_KEYS;
  for (let index = 0; index < overflowCount; index += 1) {
    const entry = oldestEntries[index];
    if (!entry) continue;
    loginAttempts.delete(entry[0]);
  }
}

function consumeLoginAttempt(key: string, nowMs: number) {
  pruneLoginAttempts(nowMs);

  const existing = loginAttempts.get(key);
  if (!existing) {
    const initial: LoginAttemptState = {
      startedAtMs: nowMs,
      lastAttemptAtMs: nowMs,
      attempts: 1,
      blockedUntilMs: 0
    };
    loginAttempts.set(key, initial);
    return { allowed: true as const, retryAfterSeconds: 0 };
  }

  if (existing.blockedUntilMs > nowMs) {
    existing.lastAttemptAtMs = nowMs;
    loginAttempts.set(key, existing);
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.blockedUntilMs - nowMs) / 1000));
    return { allowed: false as const, retryAfterSeconds };
  }

  if (nowMs - existing.startedAtMs > LOGIN_WINDOW_MS) {
    existing.startedAtMs = nowMs;
    existing.lastAttemptAtMs = nowMs;
    existing.attempts = 1;
    existing.blockedUntilMs = 0;
    loginAttempts.set(key, existing);
    return { allowed: true as const, retryAfterSeconds: 0 };
  }

  existing.lastAttemptAtMs = nowMs;
  existing.attempts += 1;
  if (existing.attempts > LOGIN_ATTEMPT_LIMIT) {
    existing.blockedUntilMs = nowMs + LOGIN_BLOCK_MS;
    loginAttempts.set(key, existing);
    return { allowed: false as const, retryAfterSeconds: Math.ceil(LOGIN_BLOCK_MS / 1000) };
  }

  loginAttempts.set(key, existing);
  return { allowed: true as const, retryAfterSeconds: 0 };
}

function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}

function getPortalContextOrNull(res: express.Response) {
  return readPortalAuthContext(res);
}

function resolveSupportInboxColumn() {
  const supportColumn = db.prepare(`
    select id, title
    from implementation_kanban_column
    where lower(title) like '%suporte%'
    order by position asc
    limit 1
  `).get() as { id: string; title: string } | undefined;
  if (supportColumn) {
    return supportColumn;
  }

  const firstColumn = db.prepare(`
    select id, title
    from implementation_kanban_column
    order by position asc
    limit 1
  `).get() as { id: string; title: string } | undefined;
  if (firstColumn) {
    return firstColumn;
  }

  const nowIso = new Date().toISOString();
  const fallbackColumn = { id: uuid('kcol'), title: 'Suporte' };
  db.prepare(`
    insert into implementation_kanban_column (id, title, color, position, created_at, updated_at)
    values (?, ?, ?, 0, ?, ?)
  `).run(fallbackColumn.id, fallbackColumn.title, '#7b8ea8', nowIso, nowIso);
  return fallbackColumn;
}

function resolveNextCardPosition(columnId: string) {
  const row = db.prepare(`
    select coalesce(max(position), -1) + 1 as next_position
    from implementation_kanban_card
    where column_id = ?
  `).get(columnId) as { next_position: number | null };
  return row.next_position ?? 0;
}

export function registerPortalRoutes(app: Express) {
  const router = express.Router();

  router.post('/auth/login', async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const { slug, username, password } = parsed.data;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = (req.header('user-agent') || 'unknown').slice(0, 120);
      const throttleKey = buildLoginThrottleKey(ip, userAgent, slug, username);
      const throttle = consumeLoginAttempt(throttleKey, Date.now());
      if (!throttle.allowed) {
        res.set('Retry-After', String(throttle.retryAfterSeconds));
        return res.status(429).json({ message: 'Muitas tentativas. Tente novamente em instantes.' });
      }

      const portalUser = findPortalUserBySlugAndUsername(slug, username);
      const passwordHash = portalUser?.password_hash ?? DUMMY_PASSWORD_HASH;
      const passwordIsValid = await verifyPassword(password, passwordHash);
      const validUser = Boolean(
        portalUser
        && portalUser.portal_client_active === 1
        && portalUser.portal_user_active === 1
      );

      if (!validUser || !passwordIsValid || !portalUser) {
        return res.status(401).json({ message: 'Credenciais inválidas.' });
      }

      const session = await createPortalSession({
        company_id: portalUser.company_id,
        portal_client_id: portalUser.portal_client_id,
        portal_user_id: portalUser.portal_user_id,
        slug: portalUser.slug,
        username: portalUser.username
      });
      clearLoginAttempts(throttleKey);

      return res.status(200).json(session);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    return res.status(200).json({
      company_id: context.company_id,
      company_name: context.company_name,
      username: context.username,
      slug: context.slug
    });
  });

  router.get('/overview', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const planning = db.prepare(`
      select
        count(*) as total,
        sum(case when cmp.status = 'Concluido' then 1 else 0 end) as completed,
        sum(case when cmp.status = 'Em_execucao' then 1 else 0 end) as in_progress,
        sum(case when cmp.status = 'Planejado' then 1 else 0 end) as planned
      from company_module_progress cmp
      where cmp.company_id = ?
    `).get(context.company_id) as {
      total: number;
      completed: number | null;
      in_progress: number | null;
      planned: number | null;
    };

    const agenda = db.prepare(`
      select
        count(*) as total,
        min(start_date) as next_date
      from calendar_activity
      where company_id = ?
        and date(end_date) >= date('now')
    `).get(context.company_id) as { total: number; next_date: string | null };

    return res.status(200).json({
      company_id: context.company_id,
      company_name: context.company_name,
      planning: {
        total: planning.total ?? 0,
        completed: planning.completed ?? 0,
        in_progress: planning.in_progress ?? 0,
        planned: planning.planned ?? 0
      },
      agenda: {
        total: agenda.total ?? 0,
        next_date: agenda.next_date
      }
    });
  });

  router.get('/planning', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const items = db.prepare(`
      select
        cmp.company_id,
        mt.code as module_code,
        mt.name as module_name,
        cmp.status,
        cmp.completed_at
      from company_module_progress cmp
      join module_template mt on mt.id = cmp.module_id
      where cmp.company_id = ?
      order by mt.code asc
    `).all(context.company_id) as Array<{
      company_id: string;
      module_code: string;
      module_name: string;
      status: string;
      completed_at: string | null;
    }>;

    return res.status(200).json({ items });
  });

  router.get('/agenda', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const items = db.prepare(`
      select
        id,
        company_id,
        title,
        activity_type,
        start_date,
        end_date,
        all_day,
        start_time,
        end_time,
        status,
        notes
      from calendar_activity
      where company_id = ?
      order by date(start_date) asc, coalesce(start_time, '00:00') asc
    `).all(context.company_id) as Array<{
      id: string;
      company_id: string | null;
      title: string;
      activity_type: string;
      start_date: string;
      end_date: string;
      all_day: number;
      start_time: string | null;
      end_time: string | null;
      status: string;
      notes: string | null;
    }>;

    return res.status(200).json({ items });
  });

  router.post('/tickets', requirePortalAuth, (req, res, next) => {
    try {
      const context = getPortalContextOrNull(res);
      if (!context) {
        return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
      }

      const parsed = createTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json(parsed.error.flatten());
      }

      const payload = parsed.data;
      const nowIso = new Date().toISOString();
      const description = payload.description?.trim() || null;

      const tx = db.transaction(() => {
        const ticketId = uuid('ptk');
        const column = resolveSupportInboxColumn();
        const nextPosition = resolveNextCardPosition(column.id);
        const cardId = uuid('kcard');

        db.prepare(`
          insert into portal_ticket (
            id, company_id, portal_user_id, title, description, priority, status, origin, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, 'Aberto', 'portal_cliente', ?, ?)
        `).run(
          ticketId,
          context.company_id,
          context.portal_user_id,
          payload.title,
          description,
          payload.priority,
          nowIso,
          nowIso
        );

        db.prepare(`
          insert into implementation_kanban_card (
            id, title, description, column_id, client_name, subcategory, priority, position, created_at, updated_at
          ) values (?, ?, ?, ?, ?, 'Suporte', ?, ?, ?, ?)
        `).run(
          cardId,
          payload.title,
          description,
          column.id,
          context.company_name,
          payload.priority,
          nextPosition,
          nowIso,
          nowIso
        );

        db.prepare(`
          update portal_ticket
          set kanban_card_id = ?, updated_at = ?
          where id = ?
        `).run(cardId, nowIso, ticketId);

        return { ticketId };
      });

      const { ticketId } = tx();
      return res.status(201).json({ id: ticketId });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/tickets', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const rows = db.prepare(`
      select
        pt.id,
        pt.title,
        pt.description,
        pt.priority,
        pt.status,
        pt.created_at,
        pt.updated_at,
        c.title as column_title
      from portal_ticket pt
      left join implementation_kanban_card kc on kc.id = pt.kanban_card_id
      left join implementation_kanban_column c on c.id = kc.column_id
      where pt.company_id = ?
      order by datetime(pt.created_at) desc
    `).all(context.company_id) as Array<{
      id: string;
      title: string;
      description: string | null;
      priority: string;
      status: string;
      created_at: string;
      updated_at: string;
      column_title: string | null;
    }>;

    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      created_at: row.created_at,
      updated_at: row.updated_at,
      client_status: toClientFacingStatus({
        ticketStatus: row.status,
        columnTitle: row.column_title
      })
    }));
    return res.status(200).json({ items });
  });

  app.use('/portal/api', router);
}
