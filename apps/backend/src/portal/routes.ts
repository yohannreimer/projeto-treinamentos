import express, { type Express } from 'express';
import { z } from 'zod';
import { db, nowDateIso, uuid } from '../db.js';
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

function normalizePortalTicketPriority(priority: string | null | undefined) {
  if (priority === 'Baixa' || priority === 'Normal' || priority === 'Alta' || priority === 'Critica') {
    return priority;
  }
  return 'Normal';
}

function parseIsoDate(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function isoDate(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function addBusinessDays(dateIso: string, offset: number): string {
  const date = parseIsoDate(dateIso);
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
  }
  let moved = 0;
  while (moved < offset) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend(date)) {
      moved += 1;
    }
  }
  return isoDate(date);
}

type JourneyModuleSummary = {
  module_id: string;
  module_code: string;
  module_name: string;
  status: 'Planejado' | 'Em_execucao' | 'Concluido';
  completed_at: string | null;
  total_encounters: number;
  completed_encounters: number;
  remaining_encounters: number;
  next_dates: string[];
  current_cohort: string | null;
};

type JourneyAgendaItem = {
  id: string;
  company_id: string;
  title: string;
  activity_type: string;
  start_date: string;
  end_date: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  status: string;
  notes: string | null;
  source: 'jornada';
  module_name: string;
  encounter_index: number;
  total_encounters: number;
};

function journeyStageRank(stage: JourneyModuleSummary['status']) {
  if (stage === 'Concluido') return 3;
  if (stage === 'Em_execucao') return 2;
  return 1;
}

function mergeJourneySummary(
  current: JourneyModuleSummary,
  next: JourneyModuleSummary
): JourneyModuleSummary {
  const currentRank = journeyStageRank(current.status);
  const nextRank = journeyStageRank(next.status);
  if (nextRank > currentRank) return next;
  if (nextRank < currentRank) return current;

  if (next.status === 'Concluido') {
    const currentDate = current.completed_at ?? '';
    const nextDate = next.completed_at ?? '';
    return nextDate > currentDate ? next : current;
  }

  const currentNextDate = current.next_dates[0] ?? '9999-12-31';
  const nextNextDate = next.next_dates[0] ?? '9999-12-31';
  return nextNextDate < currentNextDate ? next : current;
}

function buildPortalJourneyReadModel(companyId: string) {
  const todayIso = nowDateIso();
  const allocationRows = db.prepare(`
    select
      a.id as allocation_id,
      a.company_id,
      a.module_id,
      a.entry_day,
      c.id as cohort_id,
      c.code as cohort_code,
      c.name as cohort_name,
      c.start_date,
      c.start_time,
      c.end_time,
      c.period,
      mt.code as module_code,
      mt.name as module_name,
      coalesce(cmb.duration_days, 1) as duration_days
    from cohort_allocation a
    join cohort c on c.id = a.cohort_id
    join module_template mt on mt.id = a.module_id
    left join cohort_module_block cmb on cmb.cohort_id = a.cohort_id and cmb.module_id = a.module_id
    where a.company_id = ?
      and a.status <> 'Cancelado'
      and c.status in ('Planejada', 'Aguardando_quorum', 'Confirmada', 'Concluida')
    order by date(c.start_date) asc, a.entry_day asc
  `).all(companyId) as Array<{
    allocation_id: string;
    company_id: string;
    module_id: string;
    entry_day: number;
    cohort_id: string;
    cohort_code: string | null;
    cohort_name: string;
    start_date: string;
    start_time: string | null;
    end_time: string | null;
    period: 'Integral' | 'Meio_periodo' | null;
    module_code: string;
    module_name: string;
    duration_days: number;
  }>;

  if (allocationRows.length === 0) {
    return {
      moduleById: new Map<string, JourneyModuleSummary>(),
      agendaItems: [] as JourneyAgendaItem[]
    };
  }

  const cohortIds = Array.from(new Set(allocationRows.map((row) => row.cohort_id)));
  const placeholders = cohortIds.map(() => '?').join(',');
  const scheduleRows = db.prepare(`
    select cohort_id, day_index, day_date, start_time, end_time
    from cohort_schedule_day
    where cohort_id in (${placeholders})
  `).all(...cohortIds) as Array<{
    cohort_id: string;
    day_index: number;
    day_date: string;
    start_time: string | null;
    end_time: string | null;
  }>;
  const scheduleByKey = new Map<string, {
    day_date: string;
    start_time: string | null;
    end_time: string | null;
  }>();
  scheduleRows.forEach((row) => {
    scheduleByKey.set(`${row.cohort_id}:${row.day_index}`, {
      day_date: row.day_date,
      start_time: row.start_time,
      end_time: row.end_time
    });
  });

  const moduleById = new Map<string, JourneyModuleSummary>();
  const agendaItems: JourneyAgendaItem[] = [];

  allocationRows.forEach((row) => {
    const normalizedPeriod = row.period ?? 'Integral';
    const startSlot = normalizedPeriod === 'Meio_periodo'
      ? Math.max(1, Number(row.entry_day || 1)) * 2 - 1
      : Math.max(1, Number(row.entry_day || 1));
    const totalEncounters = Math.max(1, Number(row.duration_days || 1)) * (normalizedPeriod === 'Meio_periodo' ? 2 : 1);

    const slotRows = Array.from({ length: totalEncounters }).map((_, offset) => {
      const dayIndex = startSlot + offset;
      const scheduled = scheduleByKey.get(`${row.cohort_id}:${dayIndex}`);
      const dayDate = scheduled?.day_date ?? addBusinessDays(row.start_date, Math.max(0, dayIndex - 1));
      const startTime = normalizedPeriod === 'Meio_periodo'
        ? (scheduled?.start_time ?? row.start_time ?? null)
        : null;
      const endTime = normalizedPeriod === 'Meio_periodo'
        ? (scheduled?.end_time ?? row.end_time ?? null)
        : null;
      return {
        day_index: dayIndex,
        day_date: dayDate,
        start_time: startTime,
        end_time: endTime,
        encounter_index: offset + 1
      };
    });

    const completedEncounters = slotRows.filter((slot) => slot.day_date <= todayIso).length;
    const remainingEncounters = Math.max(0, totalEncounters - completedEncounters);
    const nextDates = Array.from(new Set(
      slotRows
        .filter((slot) => slot.day_date >= todayIso)
        .map((slot) => slot.day_date)
    )).slice(0, 3);

    const stage: JourneyModuleSummary['status'] = completedEncounters <= 0
      ? 'Planejado'
      : completedEncounters >= totalEncounters
        ? 'Concluido'
        : 'Em_execucao';
    const completedAt = stage === 'Concluido' ? slotRows[totalEncounters - 1]?.day_date ?? null : null;

    const summary: JourneyModuleSummary = {
      module_id: row.module_id,
      module_code: row.module_code,
      module_name: row.module_name,
      status: stage,
      completed_at: completedAt,
      total_encounters: totalEncounters,
      completed_encounters: Math.min(completedEncounters, totalEncounters),
      remaining_encounters: remainingEncounters,
      next_dates: nextDates,
      current_cohort: row.cohort_code ? `${row.cohort_code} · ${row.cohort_name}` : row.cohort_name
    };

    const currentSummary = moduleById.get(row.module_id);
    moduleById.set(row.module_id, currentSummary ? mergeJourneySummary(currentSummary, summary) : summary);

    slotRows
      .filter((slot) => slot.day_date >= todayIso)
      .slice(0, 8)
      .forEach((slot) => {
        agendaItems.push({
          id: `journey-${row.allocation_id}-${slot.day_index}`,
          company_id: row.company_id,
          title: `${row.module_name} · Encontro ${slot.encounter_index}/${totalEncounters}`,
          activity_type: 'Implementacao',
          start_date: slot.day_date,
          end_date: slot.day_date,
          all_day: normalizedPeriod === 'Integral' ? 1 : 0,
          start_time: slot.start_time,
          end_time: slot.end_time,
          status: slot.day_date === todayIso ? 'Em_andamento' : 'Planejada',
          notes: row.cohort_code ? `Turma ${row.cohort_code} · ${row.cohort_name}` : `Turma ${row.cohort_name}`,
          source: 'jornada',
          module_name: row.module_name,
          encounter_index: slot.encounter_index,
          total_encounters: totalEncounters
        });
      });
  });

  agendaItems.sort((a, b) => {
    const dateCmp = a.start_date.localeCompare(b.start_date);
    if (dateCmp !== 0) return dateCmp;
    const leftTime = a.start_time ?? '23:59';
    const rightTime = b.start_time ?? '23:59';
    return leftTime.localeCompare(rightTime);
  });

  return { moduleById, agendaItems };
}

function derivePlanningStatus(
  baseStatus: string,
  journeyStatus?: JourneyModuleSummary['status']
) {
  if (!journeyStatus) return baseStatus;
  if (journeyStatus === 'Em_execucao') return 'Em_execucao';
  if (journeyStatus === 'Concluido') return 'Concluido';
  if (baseStatus !== 'Concluido') return 'Planejado';
  return baseStatus;
}

function buildPortalPlanningItems(companyId: string, journeyModuleById: Map<string, JourneyModuleSummary>) {
  const progressRows = db.prepare(`
    select
      cmp.company_id,
      cmp.module_id,
      mt.code as module_code,
      mt.name as module_name,
      cmp.status,
      cmp.completed_at
    from company_module_progress cmp
    join module_template mt on mt.id = cmp.module_id
    where cmp.company_id = ?
  `).all(companyId) as Array<{
    company_id: string;
    module_id: string;
    module_code: string;
    module_name: string;
    status: string;
    completed_at: string | null;
  }>;

  const seenModuleIds = new Set<string>();
  const items = progressRows.map((row) => {
    seenModuleIds.add(row.module_id);
    const journey = journeyModuleById.get(row.module_id);
    const status = derivePlanningStatus(row.status, journey?.status);
    const completedAt = status === 'Concluido'
      ? (journey?.completed_at ?? row.completed_at)
      : null;
    return {
      company_id: row.company_id,
      module_id: row.module_id,
      module_code: row.module_code,
      module_name: row.module_name,
      status,
      completed_at: completedAt,
      total_encounters: journey?.total_encounters ?? null,
      completed_encounters: journey?.completed_encounters ?? null,
      remaining_encounters: journey?.remaining_encounters ?? null,
      next_dates: journey?.next_dates ?? [],
      current_cohort: journey?.current_cohort ?? null
    };
  });

  journeyModuleById.forEach((journey, moduleId) => {
    if (seenModuleIds.has(moduleId)) return;
    items.push({
      company_id: companyId,
      module_id: moduleId,
      module_code: journey.module_code,
      module_name: journey.module_name,
      status: journey.status,
      completed_at: journey.completed_at,
      total_encounters: journey.total_encounters,
      completed_encounters: journey.completed_encounters,
      remaining_encounters: journey.remaining_encounters,
      next_dates: journey.next_dates,
      current_cohort: journey.current_cohort
    });
  });

  return items.sort((a, b) => a.module_code.localeCompare(b.module_code));
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

    const journeyReadModel = buildPortalJourneyReadModel(context.company_id);
    const planningItems = buildPortalPlanningItems(context.company_id, journeyReadModel.moduleById);
    const planning = {
      total: planningItems.length,
      completed: planningItems.filter((item) => item.status === 'Concluido').length,
      in_progress: planningItems.filter((item) => item.status === 'Em_execucao').length,
      planned: planningItems.filter((item) => item.status === 'Planejado').length
    };

    const calendar = db.prepare(`
      select
        start_date
      from calendar_activity
      where company_id = ?
        and date(end_date) >= date('now')
      order by date(start_date) asc
    `).all(context.company_id) as Array<{ start_date: string }>;
    const journeyNextDate = journeyReadModel.agendaItems[0]?.start_date ?? null;
    const calendarNextDate = calendar[0]?.start_date ?? null;
    const nextDateCandidates = [journeyNextDate, calendarNextDate].filter(Boolean) as string[];
    const nextDate = nextDateCandidates.length > 0
      ? nextDateCandidates.sort((a, b) => a.localeCompare(b))[0]
      : null;

    return res.status(200).json({
      company_id: context.company_id,
      company_name: context.company_name,
      planning: {
        total: planning.total,
        completed: planning.completed,
        in_progress: planning.in_progress,
        planned: planning.planned
      },
      agenda: {
        total: calendar.length + journeyReadModel.agendaItems.length,
        next_date: nextDate
      }
    });
  });

  router.get('/planning', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const journeyReadModel = buildPortalJourneyReadModel(context.company_id);
    const items = buildPortalPlanningItems(context.company_id, journeyReadModel.moduleById);

    return res.status(200).json({ items });
  });

  router.get('/agenda', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const calendarItems = db.prepare(`
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

    const journeyReadModel = buildPortalJourneyReadModel(context.company_id);
    const items = [
      ...calendarItems.map((item) => ({ ...item, source: 'agenda' as const })),
      ...journeyReadModel.agendaItems
    ].sort((left, right) => {
      const dateCmp = left.start_date.localeCompare(right.start_date);
      if (dateCmp !== 0) return dateCmp;
      const leftTime = left.start_time ?? '23:59';
      const rightTime = right.start_time ?? '23:59';
      return leftTime.localeCompare(rightTime);
    });

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
      with linked_kanban_cards as (
        select kanban_card_id
        from portal_ticket
        where company_id = ?
          and kanban_card_id is not null
      )
      select
        pt.id,
        pt.title,
        pt.description,
        pt.priority,
        pt.status,
        pt.created_at,
        pt.updated_at,
        c.title as column_title,
        'Portal' as source
      from portal_ticket pt
      left join implementation_kanban_card kc on kc.id = pt.kanban_card_id
      left join implementation_kanban_column c on c.id = kc.column_id
      where pt.company_id = ?

      union all

      select
        'kcard-' || kc.id as id,
        kc.title as title,
        kc.description as description,
        kc.priority as priority,
        kc.status as status,
        kc.created_at as created_at,
        kc.updated_at as updated_at,
        c.title as column_title,
        'Operacao' as source
      from implementation_kanban_card kc
      left join implementation_kanban_column c on c.id = kc.column_id
      where lower(trim(coalesce(kc.client_name, ''))) = lower(trim(?))
        and (
          lower(trim(coalesce(kc.subcategory, ''))) = 'suporte'
          or lower(trim(coalesce(c.title, ''))) like '%suporte%'
        )
        and not exists (
          select 1
          from linked_kanban_cards lk
          where lk.kanban_card_id = kc.id
        )
      order by created_at desc
    `).all(context.company_id, context.company_id, context.company_name) as Array<{
      id: string;
      title: string;
      description: string | null;
      priority: string;
      status: string;
      created_at: string;
      updated_at: string;
      column_title: string | null;
      source: 'Portal' | 'Operacao';
    }>;

    const items = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: normalizePortalTicketPriority(row.priority),
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: row.source,
      client_status: toClientFacingStatus({
        ticketStatus: row.status,
        columnTitle: row.column_title
      })
    }));
    return res.status(200).json({ items });
  });

  app.use('/portal/api', router);
}
