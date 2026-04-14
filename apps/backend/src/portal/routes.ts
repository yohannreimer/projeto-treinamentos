import express, { type Express } from 'express';
import { z } from 'zod';
import { db, uuid } from '../db.js';
import { reconcileCompanyHours } from '../hours/reconcile.js';
import {
  createPortalSession,
  findPortalUserBySlugAndUsername,
  readPortalAuthContext,
  requirePortalAuth,
  verifyPassword
} from './auth.js';
import { portalRealtimeHub } from './realtime.js';
import { readPortalRealtimeSnapshot, setPortalTypingState, touchPortalPresence } from './realtimeState.js';
import { toClientFacingStatus, toWorkflowStage } from './status.js';

const DUMMY_PASSWORD_HASH = 'scrypt:00112233445566778899aabbccddeeff:5232aa4cb8582e8f374f25579c6f9ad17d5a9af5ba6d42d4c44df702d20c9d4faef25ea0fca6a5aa69b8bb25439ee4c45cb8e173ceb7f0972b0a8f7fbf2bbd99';
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_BLOCK_MS = 5 * 60_000;
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_MAX_TRACKED_KEYS = 3_000;
const PORTAL_OPERATOR_USERNAME_SETTING_KEY = 'portal_operator_username';
const PORTAL_OPERATOR_PASSWORD_HASH_SETTING_KEY = 'portal_operator_password_hash';
const INTERNAL_PORTAL_USER_USERNAME = '__holand_internal_operator__';
const WEBHOOK_QUEUE_COOLDOWN_MS = 10 * 60_000;

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
  priority: z.enum(['Alta', 'Normal', 'Baixa', 'Critica']).default('Normal'),
  whatsapp_number: z.string().trim().max(40).nullable().optional(),
  attachments: z.array(z.object({
    file_name: z.string().trim().min(1).max(200),
    file_data_base64: z.string().max(12_000_000)
  })).max(8).optional().default([])
});

const ticketMessageSchema = z.object({
  body: z.string().trim().max(4_000).nullable().optional(),
  attachments: z.array(z.object({
    file_name: z.string().trim().min(1).max(200),
    file_data_base64: z.string().max(12_000_000)
  })).max(8).optional().default([])
});

const operatorPlanningSettingsSchema = z.object({
  support_intro_text: z.string().trim().max(2_000).nullable().optional(),
  hidden_module_ids: z.array(z.string().trim().min(1)).max(500).optional().default([]),
  module_date_overrides: z.array(z.object({
    module_id: z.string().trim().min(1),
    next_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })).max(500).optional().default([]),
  module_status_overrides: z.array(z.object({
    module_id: z.string().trim().min(1),
    status: z.enum(['Planejado', 'Em_execucao', 'Concluido'])
  })).max(500).optional().default([])
});

const operatorAgendaItemSchema = z.object({
  title: z.string().trim().min(2).max(160),
  activity_type: z.string().trim().min(2).max(60).optional().default('Outro'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  all_day: z.boolean().optional().default(true),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  status: z.enum(['Planejada', 'Em_andamento', 'Concluida', 'Cancelada']).optional().default('Planejada'),
  notes: z.string().trim().max(2_000).nullable().optional()
});

const operatorTicketWorkflowSchema = z.object({
  workflow_stage: z.enum(['Backlog', 'A_fazer', 'Em_andamento', 'Concluido'])
});

const realtimeHeartbeatSchema = z.object({
  active: z.boolean().optional(),
  is_typing: z.boolean().optional()
});

function buildLoginThrottleKey(ip: string, userAgent: string, slug: string, username: string) {
  return `${ip}::${userAgent}::${slug.trim().toLowerCase()}::${username.trim().toLowerCase()}`;
}

function readPortalOperatorCredentials() {
  const rows = db.prepare(`
    select key, value
    from app_setting
    where key in (?, ?)
  `).all(
    PORTAL_OPERATOR_USERNAME_SETTING_KEY,
    PORTAL_OPERATOR_PASSWORD_HASH_SETTING_KEY
  ) as Array<{ key: string; value: string }>;
  const settingMap = new Map(rows.map((row) => [row.key, row.value]));
  return {
    username: settingMap.get(PORTAL_OPERATOR_USERNAME_SETTING_KEY)?.trim() || null,
    password_hash: settingMap.get(PORTAL_OPERATOR_PASSWORD_HASH_SETTING_KEY)?.trim() || null
  };
}

function findPortalClientBySlug(slug: string) {
  return db.prepare(`
    select
      pc.id as portal_client_id,
      pc.company_id,
      pc.slug,
      pc.is_active,
      c.name as company_name
    from portal_client pc
    join company c on c.id = pc.company_id
    where pc.slug = ?
    limit 1
  `).get(slug.trim()) as
    | { portal_client_id: string; company_id: string; slug: string; is_active: number; company_name: string }
    | undefined;
}

function ensureInternalPortalUser(portalClientId: string) {
  const nowIso = new Date().toISOString();
  const existing = db.prepare(`
    select id
    from portal_user
    where portal_client_id = ?
      and username = ?
    limit 1
  `).get(portalClientId, INTERNAL_PORTAL_USER_USERNAME) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      update portal_user
      set is_active = 1, updated_at = ?
      where id = ?
    `).run(nowIso, existing.id);
    return existing.id;
  }

  const portalUserId = uuid('pusr');
  db.prepare(`
    insert into portal_user (
      id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
    ) values (?, ?, ?, ?, 1, null, ?, ?)
  `).run(
    portalUserId,
    portalClientId,
    INTERNAL_PORTAL_USER_USERNAME,
    DUMMY_PASSWORD_HASH,
    nowIso,
    nowIso
  );
  return portalUserId;
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

function getInternalPortalContextOrFail(res: express.Response) {
  const context = getPortalContextOrNull(res);
  if (!context) {
    res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    return null;
  }
  if (!context.is_internal) {
    res.status(403).json({ message: 'Acesso restrito ao operador interno Holand.' });
    return null;
  }
  return context;
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

function resolveWorkflowColumnByStage(stage: 'Backlog' | 'A_fazer' | 'Em_andamento' | 'Concluido') {
  const columns = db.prepare(`
    select id, title, position, created_at
    from implementation_kanban_column
    order by position asc, created_at asc
  `).all() as Array<{ id: string; title: string; position: number; created_at: string }>;

  if (columns.length === 0) return null;

  const normalized = columns.map((column) => ({
    ...column,
    titleNormalized: column.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }));

  const findByIncludes = (patterns: string[]) => (
    normalized.find((column) => patterns.some((pattern) => column.titleNormalized.includes(pattern)))
  );

  if (stage === 'Backlog') {
    return findByIncludes(['backlog']) ?? normalized[0];
  }
  if (stage === 'A_fazer') {
    return findByIncludes(['a fazer', 'todo', 'to do']) ?? normalized[0];
  }
  if (stage === 'Em_andamento') {
    return findByIncludes(['andamento', 'doing', 'progresso', 'execucao']) ?? normalized[0];
  }
  return findByIncludes(['conclu', 'done', 'finalizado']) ?? normalized[normalized.length - 1] ?? normalized[0];
}

function normalizePortalTicketPriority(priority: string | null | undefined) {
  if (priority === 'Baixa' || priority === 'Normal' || priority === 'Alta' || priority === 'Critica') {
    return priority;
  }
  return 'Normal';
}

function decodeAttachmentDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new Error('Arquivo inválido. Envie em data URL base64.');
  }

  const mimeType = match[1] ?? '';
  const base64Content = (match[2] ?? '').replace(/\s+/g, '');
  const binary = Buffer.from(base64Content, 'base64');
  if (!binary.length) {
    throw new Error('Arquivo vazio.');
  }

  if (binary.length > 8_000_000) {
    throw new Error('Arquivo excede 8 MB.');
  }

  return {
    mimeType,
    fileSizeBytes: binary.length
  };
}

type PortalClientDisplaySettings = {
  supportIntroText: string | null;
  hiddenModuleIds: Set<string>;
  moduleDateOverrides: Map<string, string>;
  moduleStatusOverrides: Map<string, 'Planejado' | 'Em_execucao' | 'Concluido'>;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseModuleIdList(raw: string | null | undefined) {
  if (!raw?.trim()) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [] as string[];
    const ids = parsed
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter((value) => value.length > 0);
    return Array.from(new Set(ids));
  } catch {
    return [] as string[];
  }
}

function parseModuleDateOverrides(raw: string | null | undefined) {
  const overrides = new Map<string, string>();
  if (!raw?.trim()) return overrides;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return overrides;
    }
    Object.entries(parsed as Record<string, unknown>).forEach(([moduleId, nextDate]) => {
      const normalizedModuleId = moduleId.trim();
      if (!normalizedModuleId) return;
      if (typeof nextDate !== 'string' || !ISO_DATE_PATTERN.test(nextDate)) return;
      overrides.set(normalizedModuleId, nextDate);
    });
  } catch {
    return overrides;
  }
  return overrides;
}

function parseModuleStatusOverrides(raw: string | null | undefined) {
  const overrides = new Map<string, 'Planejado' | 'Em_execucao' | 'Concluido'>();
  if (!raw?.trim()) return overrides;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return overrides;
    }
    Object.entries(parsed as Record<string, unknown>).forEach(([moduleId, status]) => {
      const normalizedModuleId = moduleId.trim();
      if (!normalizedModuleId) return;
      if (status !== 'Planejado' && status !== 'Em_execucao' && status !== 'Concluido') return;
      overrides.set(normalizedModuleId, status);
    });
  } catch {
    return overrides;
  }
  return overrides;
}

function readPortalClientDisplaySettings(portalClientId: string): PortalClientDisplaySettings {
  const row = db.prepare(`
    select support_intro_text, hidden_module_ids_json, module_date_overrides_json, module_status_overrides_json
    from portal_client
    where id = ?
    limit 1
  `).get(portalClientId) as
    | {
      support_intro_text: string | null;
      hidden_module_ids_json: string | null;
      module_date_overrides_json: string | null;
      module_status_overrides_json: string | null;
    }
    | undefined;
  if (!row) {
    return {
      supportIntroText: null,
      hiddenModuleIds: new Set<string>(),
      moduleDateOverrides: new Map<string, string>(),
      moduleStatusOverrides: new Map<string, 'Planejado' | 'Em_execucao' | 'Concluido'>()
    };
  }
  return {
    supportIntroText: row.support_intro_text?.trim() || null,
    hiddenModuleIds: new Set(parseModuleIdList(row.hidden_module_ids_json)),
    moduleDateOverrides: parseModuleDateOverrides(row.module_date_overrides_json),
    moduleStatusOverrides: parseModuleStatusOverrides(row.module_status_overrides_json)
  };
}

function writePortalClientDisplaySettings(
  portalClientId: string,
  payload: {
    supportIntroText: string | null;
    hiddenModuleIds: string[];
    moduleDateOverrides: Array<{ module_id: string; next_date: string }>;
    moduleStatusOverrides: Array<{ module_id: string; status: 'Planejado' | 'Em_execucao' | 'Concluido' }>;
  }
) {
  const hiddenModuleIds = Array.from(new Set(payload.hiddenModuleIds.map((value) => value.trim()).filter(Boolean)));
  const dateOverridesEntries = payload.moduleDateOverrides
    .map((entry) => ({ module_id: entry.module_id.trim(), next_date: entry.next_date }))
    .filter((entry) => entry.module_id && ISO_DATE_PATTERN.test(entry.next_date));
  const statusOverridesEntries = payload.moduleStatusOverrides
    .map((entry) => ({ module_id: entry.module_id.trim(), status: entry.status }))
    .filter((entry) => entry.module_id);

  const moduleDateOverridesObject = Object.fromEntries(dateOverridesEntries.map((entry) => [entry.module_id, entry.next_date]));
  const moduleStatusOverridesObject = Object.fromEntries(statusOverridesEntries.map((entry) => [entry.module_id, entry.status]));
  const nowIso = new Date().toISOString();
  db.prepare(`
    update portal_client
    set
      support_intro_text = ?,
      hidden_module_ids_json = ?,
      module_date_overrides_json = ?,
      module_status_overrides_json = ?,
      updated_at = ?
    where id = ?
  `).run(
    payload.supportIntroText,
    JSON.stringify(hiddenModuleIds),
    JSON.stringify(moduleDateOverridesObject),
    JSON.stringify(moduleStatusOverridesObject),
    nowIso,
    portalClientId
  );
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

function currentLocalSnapshot() {
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [hourLabel, minuteLabel] = now
    .toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    })
    .split(':');
  const hour = Number(hourLabel ?? '0');
  const minute = Number(minuteLabel ?? '0');
  return {
    dateIso: dateLabel,
    minutes: (hour * 60) + minute
  };
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

function deriveJourneySlotStatus(
  slotDateIso: string,
  slotStartTime: string | null,
  slotEndTime: string | null,
  snapshot: { dateIso: string; minutes: number }
) {
  if (slotDateIso < snapshot.dateIso) return 'Concluida';
  if (slotDateIso > snapshot.dateIso) return 'Planejada';

  const startMinutes = timeToMinutes(slotStartTime);
  const endMinutes = timeToMinutes(slotEndTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return 'Em_andamento';
  }

  if (snapshot.minutes < startMinutes) return 'Planejada';
  if (snapshot.minutes >= endMinutes) return 'Concluida';
  return 'Em_andamento';
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
  module_id: string;
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
  const snapshot = currentLocalSnapshot();
  const todayIso = snapshot.dateIso;
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

    const slotRowsWithStatus = slotRows.map((slot) => ({
      ...slot,
      status: deriveJourneySlotStatus(slot.day_date, slot.start_time, slot.end_time, snapshot)
    }));

    const completedEncounters = slotRowsWithStatus.filter((slot) => slot.status === 'Concluida').length;
    const remainingEncounters = Math.max(0, totalEncounters - completedEncounters);
    const nextDates = Array.from(new Set(
      slotRowsWithStatus
        .filter((slot) => slot.status !== 'Concluida')
        .map((slot) => slot.day_date)
    )).slice(0, 3);

    const stage: JourneyModuleSummary['status'] = completedEncounters <= 0
      ? 'Planejado'
      : completedEncounters >= totalEncounters
        ? 'Concluido'
        : 'Em_execucao';
    const completedAt = stage === 'Concluido' ? slotRowsWithStatus[totalEncounters - 1]?.day_date ?? null : null;

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

    const pastSlots = slotRowsWithStatus
      .filter((slot) => slot.status === 'Concluida')
      .slice(-6);
    const upcomingSlots = slotRowsWithStatus
      .filter((slot) => slot.status !== 'Concluida')
      .slice(0, 8);

    [...pastSlots, ...upcomingSlots].forEach((slot) => {
        agendaItems.push({
          id: `journey-${row.allocation_id}-${slot.day_index}`,
          company_id: row.company_id,
          module_id: row.module_id,
          title: `${row.module_name} · Encontro ${slot.encounter_index}/${totalEncounters}`,
          activity_type: 'Implementacao',
          start_date: slot.day_date,
          end_date: slot.day_date,
          all_day: normalizedPeriod === 'Integral' ? 1 : 0,
          start_time: slot.start_time,
          end_time: slot.end_time,
          status: slot.status,
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

function applyPlanningDisplaySettings(
  items: ReturnType<typeof buildPortalPlanningItems>,
  settings: PortalClientDisplaySettings
) {
  return items
    .filter((item) => !settings.hiddenModuleIds.has(item.module_id))
    .map((item) => {
      const overrideStatus = settings.moduleStatusOverrides.get(item.module_id);
      const overrideDate = settings.moduleDateOverrides.get(item.module_id);
      let nextItem = item;
      if (overrideStatus) {
        nextItem = {
          ...nextItem,
          status: overrideStatus
        };
      }
      if (!overrideDate || nextItem.status === 'Concluido') {
        return nextItem;
      }
      const nextDates = [overrideDate, ...(nextItem.next_dates ?? []).filter((value) => value !== overrideDate)].slice(0, 3);
      return {
        ...nextItem,
        next_dates: nextDates
      };
    });
}

function applyJourneyAgendaDisplaySettings(items: JourneyAgendaItem[], settings: PortalClientDisplaySettings) {
  const visibleItems = items.filter((item) => !settings.hiddenModuleIds.has(item.module_id));
  const adjustedItems = visibleItems.map((item) => ({ ...item }));

  const upcomingByModule = new Map<string, number>();
  adjustedItems.forEach((item, index) => {
    if (item.status === 'Concluida') return;
    if (upcomingByModule.has(item.module_id)) return;
    upcomingByModule.set(item.module_id, index);
  });

  settings.moduleDateOverrides.forEach((overrideDate, moduleId) => {
    const targetIndex = upcomingByModule.get(moduleId);
    if (typeof targetIndex === 'undefined') return;
    const target = adjustedItems[targetIndex];
    if (!target) return;
    adjustedItems[targetIndex] = {
      ...target,
      start_date: overrideDate,
      end_date: overrideDate
    };
  });

  return adjustedItems;
}

type TicketAttachmentInput = {
  file_name: string;
  file_data_base64: string;
};

type PortalTicketSide = 'cliente' | 'holand';
type PortalTicketTriggerEvent = 'message_created' | 'workflow_changed';

type PortalTicketRecord = {
  id: string;
  company_id: string;
  portal_user_id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  origin: string;
  whatsapp_number: string | null;
  last_read_cliente_at: string | null;
  last_read_holand_at: string | null;
  kanban_card_id: string | null;
  created_at: string;
  updated_at: string;
  company_name: string;
  column_title: string | null;
  last_message_at: string | null;
  last_message_author_type: 'Cliente' | 'Holand' | null;
};

type PortalTicketReadState = {
  last_message_at: string | null;
  last_message_author_side: PortalTicketSide | null;
  last_read_cliente_at: string | null;
  last_read_holand_at: string | null;
  unread_for_cliente: boolean;
  unread_for_holand: boolean;
};

type PortalWebhookPayload = {
  version: 'portal_ticket_webhook_v1';
  provider: 'evolution';
  channel: 'whatsapp';
  recipient: {
    side: 'cliente';
    whatsapp_number: string;
  };
  ticket: {
    id: string;
    company_id: string;
    company_name: string;
    title: string;
    description: string | null;
    priority: string;
    source: 'Portal' | 'Operacao';
    workflow_stage: string;
    client_status: string;
    whatsapp_number: string;
  };
  thread: PortalTicketReadState;
  trigger: {
    type: PortalTicketTriggerEvent;
    created_at: string;
    message_id: string | null;
    workflow_stage: string | null;
  };
};

function readContextSide(context: ReturnType<typeof getPortalContextOrNull>): PortalTicketSide {
  return context?.is_internal ? 'holand' : 'cliente';
}

function readAuthorTypeForContext(context: NonNullable<ReturnType<typeof getPortalContextOrNull>>) {
  return context.is_internal ? 'Holand' as const : 'Cliente' as const;
}

function readAuthorLabelForContext(context: NonNullable<ReturnType<typeof getPortalContextOrNull>>) {
  return context.is_internal ? 'Equipe Holand' : context.company_name;
}

function readTicketReadColumn(side: PortalTicketSide) {
  return side === 'cliente' ? 'last_read_cliente_at' : 'last_read_holand_at';
}

function normalizeWhatsappNumber(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length >= 8 ? digits : null;
}

function portalTicketSideFromAuthorType(authorType: string | null | undefined): PortalTicketSide | null {
  if (authorType === 'Cliente') return 'cliente';
  if (authorType === 'Holand') return 'holand';
  return null;
}

function readRecipientSide(authorSide: PortalTicketSide): PortalTicketSide {
  return authorSide === 'holand' ? 'cliente' : 'holand';
}

function computeWebhookAvailableAt(eventCreatedAt: string) {
  return new Date(new Date(eventCreatedAt).getTime() + WEBHOOK_QUEUE_COOLDOWN_MS).toISOString();
}

function readPortalTicketRecord(ticketId: string, companyId: string) {
  return db.prepare(`
    select
      pt.id,
      pt.company_id,
      pt.portal_user_id,
      pt.title,
      pt.description,
      pt.priority,
      pt.status,
      pt.origin,
      pt.whatsapp_number,
      pt.last_read_cliente_at,
      pt.last_read_holand_at,
      pt.kanban_card_id,
      pt.created_at,
      pt.updated_at,
      c.name as company_name,
      kc_col.title as column_title,
      (
        select m.created_at
        from portal_ticket_message m
        where m.ticket_id = pt.id
        order by datetime(m.created_at) desc, m.id desc
        limit 1
      ) as last_message_at,
      (
        select m.author_type
        from portal_ticket_message m
        where m.ticket_id = pt.id
        order by datetime(m.created_at) desc, m.id desc
        limit 1
      ) as last_message_author_type
    from portal_ticket pt
    join company c on c.id = pt.company_id
    left join implementation_kanban_card kc on kc.id = pt.kanban_card_id
    left join implementation_kanban_column kc_col on kc_col.id = kc.column_id
    where pt.id = ?
      and pt.company_id = ?
    limit 1
  `).get(ticketId, companyId) as PortalTicketRecord | undefined;
}

function readOperationalSupportCard(cardId: string, companyName: string) {
  return db.prepare(`
    select
      kc.id,
      kc.title,
      kc.description,
      kc.priority,
      kc.status,
      kc.created_at,
      kc.updated_at
    from implementation_kanban_card kc
    left join implementation_kanban_column c on c.id = kc.column_id
    where kc.id = ?
      and lower(trim(coalesce(kc.client_name, ''))) = lower(trim(?))
      and (
        lower(trim(coalesce(kc.subcategory, ''))) = 'suporte'
        or lower(trim(coalesce(c.title, ''))) like '%suporte%'
      )
    limit 1
  `).get(cardId, companyName) as
    | {
      id: string;
      title: string;
      description: string | null;
      priority: string;
      status: string;
      created_at: string;
      updated_at: string;
    }
    | undefined;
}

function materializeOperationalPortalTicket(
  ticketRef: string,
  context: NonNullable<ReturnType<typeof getPortalContextOrNull>>
) {
  const cardId = ticketRef.slice('kcard-'.length);
  const card = readOperationalSupportCard(cardId, context.company_name);
  if (!card) return null;

  const nowIso = new Date().toISOString();
  db.prepare(`
    insert into portal_ticket (
      id, company_id, portal_user_id, title, description, priority, status, origin,
      whatsapp_number, last_read_cliente_at, last_read_holand_at, kanban_card_id, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, 'operacao_interna', null, null, ?, ?, ?, ?)
  `).run(
    ticketRef,
    context.company_id,
    context.portal_user_id,
    card.title,
    card.description,
    normalizePortalTicketPriority(card.priority),
    card.status,
    context.is_internal ? nowIso : null,
    card.id,
    card.created_at,
    card.updated_at
  );

  return readPortalTicketRecord(ticketRef, context.company_id) ?? null;
}

function resolvePortalTicketForContext(
  ticketRef: string,
  context: NonNullable<ReturnType<typeof getPortalContextOrNull>>,
  options?: { materializeOperationalForInternal?: boolean }
) {
  const existing = readPortalTicketRecord(ticketRef, context.company_id);
  if (existing) return existing;

  if (!ticketRef.startsWith('kcard-')) {
    return null;
  }
  if (options?.materializeOperationalForInternal !== true) {
    return null;
  }
  return materializeOperationalPortalTicket(ticketRef, context);
}

function buildPortalTicketReadState(ticket: PortalTicketRecord): PortalTicketReadState {
  const lastMessageSide = portalTicketSideFromAuthorType(ticket.last_message_author_type);
  const unreadForCliente = Boolean(
    ticket.last_message_at
    && lastMessageSide === 'holand'
    && (!ticket.last_read_cliente_at || ticket.last_read_cliente_at < ticket.last_message_at)
  );
  const unreadForHoland = Boolean(
    ticket.last_message_at
    && lastMessageSide === 'cliente'
    && (!ticket.last_read_holand_at || ticket.last_read_holand_at < ticket.last_message_at)
  );

  return {
    last_message_at: ticket.last_message_at,
    last_message_author_side: lastMessageSide,
    last_read_cliente_at: ticket.last_read_cliente_at,
    last_read_holand_at: ticket.last_read_holand_at,
    unread_for_cliente: unreadForCliente,
    unread_for_holand: unreadForHoland
  };
}

function buildPortalTicketRealtimeSnapshot(ticket: Pick<PortalTicketRecord, 'id' | 'company_id'>) {
  const snapshot = readPortalRealtimeSnapshot({
    companyId: ticket.company_id,
    ticketId: ticket.id
  });

  return {
    presence: {
      client_online: snapshot.presence.client_online,
      holand_online: snapshot.presence.holand_online
    },
    typing: {
      side: snapshot.typing.side,
      is_typing: snapshot.typing.is_typing,
      created_at: snapshot.typing.created_at
    }
  };
}

function buildPortalTicketMetadata(
  ticket: PortalTicketRecord,
  viewerSide?: PortalTicketSide
) {
  const readState = buildPortalTicketReadState(ticket);
  const realtime = buildPortalTicketRealtimeSnapshot(ticket);
  return {
    whatsapp_number: ticket.whatsapp_number,
    source: (ticket.origin === 'operacao_interna' || ticket.id.startsWith('kcard-'))
      ? 'Operacao' as const
      : 'Portal' as const,
    workflow_stage: toWorkflowStage({
      ticketStatus: ticket.status,
      columnTitle: ticket.column_title
    }),
    client_status: toClientFacingStatus({
      ticketStatus: ticket.status,
      columnTitle: ticket.column_title
    }),
    last_message_at: readState.last_message_at,
    last_message_author_side: readState.last_message_author_side,
    last_read_cliente_at: readState.last_read_cliente_at,
    last_read_holand_at: readState.last_read_holand_at,
    unread_for_cliente: readState.unread_for_cliente,
    unread_for_holand: readState.unread_for_holand,
    has_unread: viewerSide
      ? (viewerSide === 'cliente' ? readState.unread_for_cliente : readState.unread_for_holand)
      : false,
    presence: realtime.presence,
    typing: realtime.typing
  };
}

function updateTicketReadMarker(ticketId: string, side: PortalTicketSide, readAt: string) {
  const readColumn = readTicketReadColumn(side);
  db.prepare(`
    update portal_ticket
    set ${readColumn} = ?, updated_at = ?
    where id = ?
  `).run(readAt, readAt, ticketId);
}

function suppressPendingWebhookQueueForRead(ticketId: string, side: PortalTicketSide, readAt: string) {
  db.prepare(`
    update portal_ticket_webhook_queue
    set suppressed_at = ?, suppression_reason = 'read_before_send', updated_at = ?
    where ticket_id = ?
      and recipient_side = ?
      and sent_at is null
      and suppressed_at is null
      and datetime(event_created_at) <= datetime(?)
  `).run(readAt, readAt, ticketId, side, readAt);
}

function buildPortalWebhookPayload(ticket: PortalTicketRecord, trigger: {
  type: PortalTicketTriggerEvent;
  createdAt: string;
  messageId?: string | null;
  workflowStage?: string | null;
}) {
  const recipientWhatsapp = normalizeWhatsappNumber(ticket.whatsapp_number);
  if (!recipientWhatsapp) return null;

  const metadata = buildPortalTicketMetadata(ticket);
  return {
    version: 'portal_ticket_webhook_v1',
    provider: 'evolution',
    channel: 'whatsapp',
    recipient: {
      side: 'cliente',
      whatsapp_number: recipientWhatsapp
    },
    ticket: {
      id: ticket.id,
      company_id: ticket.company_id,
      company_name: ticket.company_name,
      title: ticket.title,
      description: ticket.description,
      priority: normalizePortalTicketPriority(ticket.priority),
      source: metadata.source,
      workflow_stage: metadata.workflow_stage,
      client_status: metadata.client_status,
      whatsapp_number: recipientWhatsapp
    },
    thread: buildPortalTicketReadState(ticket),
    trigger: {
      type: trigger.type,
      created_at: trigger.createdAt,
      message_id: trigger.messageId ?? null,
      workflow_stage: trigger.workflowStage ?? null
    }
  } satisfies PortalWebhookPayload;
}

function enqueueWebhookForTicketActivity(params: {
  ticketId: string;
  companyId: string;
  authorSide: PortalTicketSide;
  triggerEvent: PortalTicketTriggerEvent;
  eventCreatedAt: string;
  messageId?: string | null;
  workflowStage?: string | null;
}) {
  const recipientSide = readRecipientSide(params.authorSide);
  if (recipientSide !== 'cliente') return null;

  const ticket = readPortalTicketRecord(params.ticketId, params.companyId);
  if (!ticket) return null;

  const recipientWhatsapp = normalizeWhatsappNumber(ticket.whatsapp_number);
  if (!recipientWhatsapp) return null;

  if (ticket.last_read_cliente_at && ticket.last_read_cliente_at >= params.eventCreatedAt) {
    return null;
  }

  const payload = buildPortalWebhookPayload(ticket, {
    type: params.triggerEvent,
    createdAt: params.eventCreatedAt,
    messageId: params.messageId,
    workflowStage: params.workflowStage
  });
  if (!payload) return null;

  const nowIso = new Date().toISOString();
  const availableAt = computeWebhookAvailableAt(params.eventCreatedAt);
  const existing = db.prepare(`
    select id
    from portal_ticket_webhook_queue
    where ticket_id = ?
      and recipient_side = ?
      and sent_at is null
      and suppressed_at is null
    order by datetime(created_at) desc, id desc
    limit 1
  `).get(params.ticketId, recipientSide) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      update portal_ticket_webhook_queue
      set
        recipient_whatsapp = ?,
        trigger_event = ?,
        event_created_at = ?,
        available_at = ?,
        payload_json = ?,
        updated_at = ?
      where id = ?
    `).run(
      recipientWhatsapp,
      params.triggerEvent,
      params.eventCreatedAt,
      availableAt,
      JSON.stringify(payload),
      nowIso,
      existing.id
    );
    return existing.id;
  }

  const queueId = uuid('ptwq');
  db.prepare(`
    insert into portal_ticket_webhook_queue (
      id, ticket_id, company_id, recipient_side, recipient_whatsapp, trigger_event,
      event_created_at, available_at, payload_json, sent_at, suppressed_at, suppression_reason,
      last_error, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, null, null, ?, ?)
  `).run(
    queueId,
    params.ticketId,
    params.companyId,
    recipientSide,
    recipientWhatsapp,
    params.triggerEvent,
    params.eventCreatedAt,
    availableAt,
    JSON.stringify(payload),
    nowIso,
    nowIso
  );
  return queueId;
}

function parseWebhookPayload(raw: string) {
  try {
    return JSON.parse(raw) as PortalWebhookPayload;
  } catch {
    return null;
  }
}

function insertTicketMessageWithAttachments(params: {
  ticketId: string;
  authorType: 'Cliente' | 'Holand';
  authorLabel: string | null;
  body: string | null;
  attachments: TicketAttachmentInput[];
  nowIso: string;
}) {
  const messageId = uuid('ptmsg');
  db.prepare(`
    insert into portal_ticket_message (
      id, ticket_id, author_type, author_label, body, created_at
    ) values (?, ?, ?, ?, ?, ?)
  `).run(
    messageId,
    params.ticketId,
    params.authorType,
    params.authorLabel,
    params.body,
    params.nowIso
  );

  if (params.attachments.length === 0) return messageId;
  const insertAttachment = db.prepare(`
    insert into portal_ticket_attachment (
      id, ticket_message_id, file_name, mime_type, file_data_base64, file_size_bytes, created_at
    ) values (?, ?, ?, ?, ?, ?, ?)
  `);
  params.attachments.forEach((attachment) => {
    const normalizedFileName = attachment.file_name.trim();
    if (!normalizedFileName) return;
    const decoded = decodeAttachmentDataUrl(attachment.file_data_base64);
    insertAttachment.run(
      uuid('ptatt'),
      messageId,
      normalizedFileName,
      decoded.mimeType,
      attachment.file_data_base64,
      decoded.fileSizeBytes,
      params.nowIso
    );
  });

  return messageId;
}

export function registerPortalRoutes(app: Express) {
  const router = express.Router();

  router.get('/auth/branding/:slug', (req, res) => {
    const slug = req.params.slug?.trim();
    if (!slug) {
      return res.status(400).json({ message: 'Slug do portal não informado.' });
    }
    const portalClient = findPortalClientBySlug(slug);
    if (!portalClient || portalClient.is_active !== 1) {
      return res.status(404).json({ message: 'Portal não encontrado ou inativo.' });
    }
    return res.status(200).json({
      slug: portalClient.slug,
      company_name: portalClient.company_name
    });
  });

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

      const operatorCredentials = readPortalOperatorCredentials();
      const portalClient = findPortalClientBySlug(slug);
      const canAttemptInternalAuth = Boolean(
        portalClient
        && operatorCredentials.username
        && operatorCredentials.password_hash
        && username.trim() === operatorCredentials.username
      );
      const operatorPasswordHash = canAttemptInternalAuth
        ? (operatorCredentials.password_hash as string)
        : DUMMY_PASSWORD_HASH;
      const internalPasswordOk = await verifyPassword(password, operatorPasswordHash);

      if (canAttemptInternalAuth && internalPasswordOk && portalClient) {
        const portalUserId = ensureInternalPortalUser(portalClient.portal_client_id);
        const session = await createPortalSession({
          company_id: portalClient.company_id,
          portal_client_id: portalClient.portal_client_id,
          portal_user_id: portalUserId,
          slug: portalClient.slug,
          username: INTERNAL_PORTAL_USER_USERNAME
        }, { isInternal: true });
        clearLoginAttempts(throttleKey);
        return res.status(200).json(session);
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
      }, { isInternal: false });
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
      slug: context.slug,
      is_internal: context.is_internal
    });
  });

  router.get('/overview', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const displaySettings = readPortalClientDisplaySettings(context.portal_client_id);
    const hoursSummary = reconcileCompanyHours(context.company_id);
    const journeyReadModel = buildPortalJourneyReadModel(context.company_id);
    const planningItems = applyPlanningDisplaySettings(
      buildPortalPlanningItems(context.company_id, journeyReadModel.moduleById),
      displaySettings
    );
    const journeyAgendaItems = applyJourneyAgendaDisplaySettings(journeyReadModel.agendaItems, displaySettings);
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
    const manualAgenda = db.prepare(`
      select
        start_date
      from portal_agenda_item
      where portal_client_id = ?
        and date(end_date) >= date('now')
      order by date(start_date) asc
    `).all(context.portal_client_id) as Array<{ start_date: string }>;
    const journeyNextDate = journeyAgendaItems[0]?.start_date ?? null;
    const calendarNextDate = calendar[0]?.start_date ?? null;
    const manualNextDate = manualAgenda[0]?.start_date ?? null;
    const nextDateCandidates = [journeyNextDate, calendarNextDate, manualNextDate].filter(Boolean) as string[];
    const nextDate = nextDateCandidates.length > 0
      ? nextDateCandidates.sort((a, b) => a.localeCompare(b))[0]
      : null;

    return res.status(200).json({
      company_id: context.company_id,
      company_name: context.company_name,
      hours_summary: {
        available_hours: hoursSummary.available_hours,
        consumed_hours: hoursSummary.consumed_hours,
        balance_hours: hoursSummary.balance_hours,
        remaining_diarias: hoursSummary.remaining_diarias
      },
      planning: {
        total: planning.total,
        completed: planning.completed,
        in_progress: planning.in_progress,
        planned: planning.planned
      },
      agenda: {
        total: calendar.length + manualAgenda.length + journeyAgendaItems.length,
        next_date: nextDate
      }
    });
  });

  router.get('/planning', requirePortalAuth, (_req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const displaySettings = readPortalClientDisplaySettings(context.portal_client_id);
    const hoursSummary = reconcileCompanyHours(context.company_id);
    const journeyReadModel = buildPortalJourneyReadModel(context.company_id);
    const effectiveSettings = context.is_internal
      ? { ...displaySettings, hiddenModuleIds: new Set<string>() }
      : displaySettings;
    const items = applyPlanningDisplaySettings(
      buildPortalPlanningItems(context.company_id, journeyReadModel.moduleById),
      effectiveSettings
    );

    return res.status(200).json({
      items,
      hours_summary: {
        available_hours: hoursSummary.available_hours,
        consumed_hours: hoursSummary.consumed_hours,
        balance_hours: hoursSummary.balance_hours,
        remaining_diarias: hoursSummary.remaining_diarias
      }
    });
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
        null as module_id,
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
      module_id: string | null;
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

    const displaySettings = readPortalClientDisplaySettings(context.portal_client_id);
    const journeyReadModel = buildPortalJourneyReadModel(context.company_id);
    const journeyAgendaItems = applyJourneyAgendaDisplaySettings(journeyReadModel.agendaItems, displaySettings);
    const manualAgendaItems = db.prepare(`
      select
        id,
        null as company_id,
        null as module_id,
        title,
        activity_type,
        start_date,
        end_date,
        all_day,
        start_time,
        end_time,
        status,
        notes
      from portal_agenda_item
      where portal_client_id = ?
      order by date(start_date) asc, coalesce(start_time, '00:00') asc
    `).all(context.portal_client_id) as Array<{
      id: string;
      company_id: string | null;
      module_id: string | null;
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
    const items = [
      ...calendarItems.map((item) => ({ ...item, source: 'agenda' as const })),
      ...manualAgendaItems.map((item) => ({ ...item, source: 'manual' as const })),
      ...journeyAgendaItems
    ].sort((left, right) => {
      const dateCmp = left.start_date.localeCompare(right.start_date);
      if (dateCmp !== 0) return dateCmp;
      const leftTime = left.start_time ?? '23:59';
      const rightTime = right.start_time ?? '23:59';
      return leftTime.localeCompare(rightTime);
    });

    return res.status(200).json({ items });
  });

  router.get('/operator/display-settings', requirePortalAuth, (_req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const settings = readPortalClientDisplaySettings(context.portal_client_id);
    return res.status(200).json({
      support_intro_text: settings.supportIntroText,
      hidden_module_ids: Array.from(settings.hiddenModuleIds),
      module_date_overrides: Array.from(settings.moduleDateOverrides.entries()).map(([module_id, next_date]) => ({
        module_id,
        next_date
      })),
      module_status_overrides: Array.from(settings.moduleStatusOverrides.entries()).map(([module_id, status]) => ({
        module_id,
        status
      }))
    });
  });

  router.put('/operator/display-settings', requirePortalAuth, (req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const parsed = operatorPlanningSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const payload = parsed.data;
    writePortalClientDisplaySettings(context.portal_client_id, {
      supportIntroText: payload.support_intro_text?.trim() || null,
      hiddenModuleIds: payload.hidden_module_ids ?? [],
      moduleDateOverrides: payload.module_date_overrides ?? [],
      moduleStatusOverrides: payload.module_status_overrides ?? []
    });
    return res.status(200).json({ ok: true });
  });

  router.get('/operator/agenda-items', requirePortalAuth, (_req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const items = db.prepare(`
      select
        id,
        title,
        activity_type,
        start_date,
        end_date,
        all_day,
        start_time,
        end_time,
        status,
        notes,
        created_at,
        updated_at
      from portal_agenda_item
      where portal_client_id = ?
      order by date(start_date) asc, coalesce(start_time, '00:00') asc, datetime(created_at) asc
    `).all(context.portal_client_id);
    return res.status(200).json({ items });
  });

  router.post('/operator/agenda-items', requirePortalAuth, (req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const parsed = operatorAgendaItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const payload = parsed.data;
    const nowIso = new Date().toISOString();
    const id = uuid('pagi');
    const allDay = payload.all_day ? 1 : 0;
    const endDate = payload.end_date ?? payload.start_date;
    db.prepare(`
      insert into portal_agenda_item (
        id, portal_client_id, title, activity_type, start_date, end_date,
        all_day, start_time, end_time, status, notes, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      context.portal_client_id,
      payload.title.trim(),
      payload.activity_type.trim() || 'Outro',
      payload.start_date,
      endDate,
      allDay,
      allDay === 1 ? null : (payload.start_time ?? null),
      allDay === 1 ? null : (payload.end_time ?? null),
      payload.status,
      payload.notes?.trim() || null,
      nowIso,
      nowIso
    );
    return res.status(201).json({ id });
  });

  router.patch('/operator/agenda-items/:id', requirePortalAuth, (req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const parsed = operatorAgendaItemSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const payload = parsed.data;
    const exists = db.prepare(`
      select id
      from portal_agenda_item
      where id = ?
        and portal_client_id = ?
      limit 1
    `).get(req.params.id, context.portal_client_id) as { id: string } | undefined;
    if (!exists) {
      return res.status(404).json({ message: 'Evento manual não encontrado.' });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof payload.title === 'string') {
      fields.push('title = ?');
      values.push(payload.title.trim());
    }
    if (typeof payload.activity_type === 'string') {
      fields.push('activity_type = ?');
      values.push(payload.activity_type.trim() || 'Outro');
    }
    if (typeof payload.start_date === 'string') {
      fields.push('start_date = ?');
      values.push(payload.start_date);
    }
    if (typeof payload.end_date === 'string') {
      fields.push('end_date = ?');
      values.push(payload.end_date);
    }
    if (typeof payload.all_day === 'boolean') {
      fields.push('all_day = ?');
      values.push(payload.all_day ? 1 : 0);
      if (payload.all_day) {
        fields.push('start_time = ?');
        values.push(null);
        fields.push('end_time = ?');
        values.push(null);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'start_time')) {
      fields.push('start_time = ?');
      values.push(payload.start_time ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'end_time')) {
      fields.push('end_time = ?');
      values.push(payload.end_time ?? null);
    }
    if (typeof payload.status === 'string') {
      fields.push('status = ?');
      values.push(payload.status);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
      fields.push('notes = ?');
      values.push(payload.notes?.trim() || null);
    }
    if (fields.length === 0) {
      return res.status(200).json({ ok: true });
    }
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(req.params.id);
    db.prepare(`update portal_agenda_item set ${fields.join(', ')} where id = ?`).run(...values);
    return res.status(200).json({ ok: true });
  });

  router.delete('/operator/agenda-items/:id', requirePortalAuth, (req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const deleted = db.prepare(`
      delete from portal_agenda_item
      where id = ?
        and portal_client_id = ?
    `).run(req.params.id, context.portal_client_id);
    if (deleted.changes === 0) {
      return res.status(404).json({ message: 'Evento manual não encontrado.' });
    }
    return res.status(200).json({ ok: true });
  });

  router.get('/operator/webhook-queue', requirePortalAuth, (_req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;

    const rows = db.prepare(`
      select
        q.id,
        q.ticket_id,
        q.company_id,
        q.recipient_side,
        q.recipient_whatsapp,
        q.trigger_event,
        q.event_created_at,
        q.available_at,
        q.payload_json,
        q.created_at,
        q.updated_at
      from portal_ticket_webhook_queue q
      where q.company_id = ?
        and q.sent_at is null
        and q.suppressed_at is null
      order by datetime(q.available_at) asc, datetime(q.created_at) asc, q.id asc
    `).all(context.company_id) as Array<{
      id: string;
      ticket_id: string;
      company_id: string;
      recipient_side: string;
      recipient_whatsapp: string;
      trigger_event: string;
      event_created_at: string;
      available_at: string;
      payload_json: string;
      created_at: string;
      updated_at: string;
    }>;

    return res.status(200).json({
      items: rows.map((row) => ({
        id: row.id,
        ticket_id: row.ticket_id,
        company_id: row.company_id,
        recipient_side: row.recipient_side,
        recipient_whatsapp: row.recipient_whatsapp,
        trigger_event: row.trigger_event,
        event_created_at: row.event_created_at,
        available_at: row.available_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        payload: parseWebhookPayload(row.payload_json)
      }))
    });
  });

  router.patch('/operator/tickets/:id/workflow', requirePortalAuth, (req, res) => {
    const context = getInternalPortalContextOrFail(res);
    if (!context) return;
    const parsed = operatorTicketWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const targetColumn = resolveWorkflowColumnByStage(parsed.data.workflow_stage);
    if (!targetColumn) {
      return res.status(400).json({ message: 'Nenhuma coluna de workflow disponível para atualização.' });
    }

    const ticket = resolvePortalTicketForContext(req.params.id, context, {
      materializeOperationalForInternal: true
    });
    if (!ticket && !req.params.id.startsWith('kcard-')) {
      return res.status(404).json({ message: 'Chamado não encontrado para este cliente.' });
    }

    const kanbanCardId = req.params.id.startsWith('kcard-')
      ? (ticket?.kanban_card_id ?? req.params.id.slice('kcard-'.length))
      : (ticket?.kanban_card_id ?? null);

    if (!kanbanCardId) {
      return res.status(400).json({ message: 'Chamado sem vínculo de card no workflow.' });
    }

    const card = db.prepare(`
      select id
      from implementation_kanban_card
      where id = ?
      limit 1
    `).get(kanbanCardId) as { id: string } | undefined;
    if (!card) {
      return res.status(404).json({ message: 'Card de workflow não encontrado.' });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`
      update implementation_kanban_card
      set column_id = ?, updated_at = ?
      where id = ?
    `).run(targetColumn.id, nowIso, kanbanCardId);

    const normalizedStatus = parsed.data.workflow_stage === 'Concluido' ? 'Resolvido' : 'Em análise';
    const linkedTickets = db.prepare(`
      select id
      from portal_ticket
      where company_id = ?
        and kanban_card_id = ?
    `).all(context.company_id, kanbanCardId) as Array<{ id: string }>;
    db.prepare(`
      update portal_ticket
      set status = ?, updated_at = ?
      where company_id = ?
        and kanban_card_id = ?
    `).run(normalizedStatus, nowIso, context.company_id, kanbanCardId);

    linkedTickets.forEach((linkedTicket) => {
      enqueueWebhookForTicketActivity({
        ticketId: linkedTicket.id,
        companyId: context.company_id,
        authorSide: 'holand',
        triggerEvent: 'workflow_changed',
        eventCreatedAt: nowIso,
        workflowStage: parsed.data.workflow_stage
      });
      portalRealtimeHub.emitWorkflowChanged({
        companyId: context.company_id,
        ticketId: linkedTicket.id,
        workflowStage: parsed.data.workflow_stage,
        updatedAt: nowIso
      });
    });

    return res.status(200).json({
      ok: true,
      workflow_stage: parsed.data.workflow_stage
    });
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
      const whatsappNumber = normalizeWhatsappNumber(payload.whatsapp_number);
      const attachments = payload.attachments ?? [];
      const authorSide = readContextSide(context);

      const tx = db.transaction(() => {
        const ticketId = uuid('ptk');
        const column = resolveSupportInboxColumn();
        const nextPosition = resolveNextCardPosition(column.id);
        const cardId = uuid('kcard');

        db.prepare(`
          insert into portal_ticket (
            id, company_id, portal_user_id, title, description, priority, status, origin,
            whatsapp_number, last_read_cliente_at, last_read_holand_at, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, 'Aberto', 'portal_cliente', ?, ?, ?, ?, ?)
        `).run(
          ticketId,
          context.company_id,
          context.portal_user_id,
          payload.title,
          description,
          payload.priority,
          whatsappNumber,
          authorSide === 'cliente' ? nowIso : null,
          authorSide === 'holand' ? nowIso : null,
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

        const messageId = insertTicketMessageWithAttachments({
          ticketId,
          authorType: readAuthorTypeForContext(context),
          authorLabel: readAuthorLabelForContext(context),
          body: description || 'Solicitação aberta.',
          attachments,
          nowIso
        });

        return { ticketId, messageId };
      });

      const { ticketId, messageId } = tx();
      enqueueWebhookForTicketActivity({
        ticketId,
        companyId: context.company_id,
        authorSide,
        triggerEvent: 'message_created',
        eventCreatedAt: nowIso,
        messageId
      });
      portalRealtimeHub.emitMessageCreated({
        companyId: context.company_id,
        ticketId,
        messageId,
        authorSide,
        createdAt: nowIso
      });
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
    const displaySettings = readPortalClientDisplaySettings(context.portal_client_id);

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
        pt.origin,
        pt.whatsapp_number,
        pt.last_read_cliente_at,
        pt.last_read_holand_at,
        pt.created_at,
        pt.updated_at,
        c.title as column_title,
        (
          select m.created_at
          from portal_ticket_message m
          where m.ticket_id = pt.id
          order by datetime(m.created_at) desc, m.id desc
          limit 1
        ) as last_message_at,
        (
          select m.author_type
          from portal_ticket_message m
          where m.ticket_id = pt.id
          order by datetime(m.created_at) desc, m.id desc
          limit 1
        ) as last_message_author_type
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
        'operacao_interna' as origin,
        null as whatsapp_number,
        null as last_read_cliente_at,
        null as last_read_holand_at,
        kc.created_at as created_at,
        kc.updated_at as updated_at,
        c.title as column_title,
        null as last_message_at,
        null as last_message_author_type
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
      origin: string;
      whatsapp_number: string | null;
      last_read_cliente_at: string | null;
      last_read_holand_at: string | null;
      created_at: string;
      updated_at: string;
      column_title: string | null;
      last_message_at: string | null;
      last_message_author_type: 'Cliente' | 'Holand' | null;
    }>;

    const viewerSide = readContextSide(context);
    const items = rows.map((row) => {
      const lastMessageAuthorSide = portalTicketSideFromAuthorType(row.last_message_author_type);
      const unreadForCliente = Boolean(
        row.last_message_at
        && lastMessageAuthorSide === 'holand'
        && (!row.last_read_cliente_at || row.last_read_cliente_at < row.last_message_at)
      );
      const unreadForHoland = Boolean(
        row.last_message_at
        && lastMessageAuthorSide === 'cliente'
        && (!row.last_read_holand_at || row.last_read_holand_at < row.last_message_at)
      );
      const realtime = buildPortalTicketRealtimeSnapshot({
        id: row.id,
        company_id: context.company_id
      });
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        priority: normalizePortalTicketPriority(row.priority),
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: (row.origin === 'operacao_interna' || row.id.startsWith('kcard-'))
          ? 'Operacao' as const
          : 'Portal' as const,
        whatsapp_number: row.whatsapp_number,
        workflow_stage: toWorkflowStage({
          ticketStatus: row.status,
          columnTitle: row.column_title
        }),
        client_status: toClientFacingStatus({
          ticketStatus: row.status,
          columnTitle: row.column_title
        }),
        last_message_at: row.last_message_at,
        last_message_author_side: lastMessageAuthorSide,
        last_read_cliente_at: row.last_read_cliente_at,
        last_read_holand_at: row.last_read_holand_at,
        unread_for_cliente: unreadForCliente,
        unread_for_holand: unreadForHoland,
        has_unread: viewerSide === 'cliente' ? unreadForCliente : unreadForHoland,
        realtime: {
          unread_count: viewerSide === 'cliente' ? (unreadForCliente ? 1 : 0) : (unreadForHoland ? 1 : 0),
          client_online: realtime.presence.client_online,
          holand_online: realtime.presence.holand_online,
          typing_side: realtime.typing.is_typing ? realtime.typing.side : null,
          typing_at: realtime.typing.created_at,
          last_message_preview: row.description
        }
      };
    });
    return res.status(200).json({
      items,
      support_intro_text: displaySettings.supportIntroText
    });
  });

  router.get('/tickets/:id/thread', requirePortalAuth, (req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const ticket = resolvePortalTicketForContext(req.params.id, context, {
      materializeOperationalForInternal: true
    });
    if (!ticket && req.params.id.startsWith('kcard-')) {
      return res.status(200).json({
        ticket_id: req.params.id,
        messages: [],
        note: 'Este item veio da operação interna e ainda não possui thread no portal.'
      });
    }

    if (!ticket) {
      return res.status(404).json({ message: 'Chamado não encontrado para este cliente.' });
    }

    const messages = db.prepare(`
      select id, author_type, author_label, body, created_at
      from portal_ticket_message
      where ticket_id = ?
      order by datetime(created_at) asc, id asc
    `).all(ticket.id) as Array<{
      id: string;
      author_type: 'Cliente' | 'Holand';
      author_label: string | null;
      body: string | null;
      created_at: string;
    }>;

    const attachments = db.prepare(`
      select id, ticket_message_id, file_name, mime_type, file_size_bytes, created_at
      from portal_ticket_attachment
      where ticket_message_id in (
        select id from portal_ticket_message where ticket_id = ?
      )
      order by datetime(created_at) asc, id asc
    `).all(ticket.id) as Array<{
      id: string;
      ticket_message_id: string;
      file_name: string;
      mime_type: string;
      file_size_bytes: number;
      created_at: string;
    }>;

    const attachmentsByMessage = new Map<string, Array<{
      id: string;
      file_name: string;
      mime_type: string;
      file_size_bytes: number;
      created_at: string;
      download_url: string;
    }>>();
    attachments.forEach((item) => {
      const list = attachmentsByMessage.get(item.ticket_message_id) ?? [];
      list.push({
        id: item.id,
        file_name: item.file_name,
        mime_type: item.mime_type,
        file_size_bytes: item.file_size_bytes,
        created_at: item.created_at,
        download_url: `/portal/api/tickets/${ticket.id}/attachments/${item.id}/download`
      });
      attachmentsByMessage.set(item.ticket_message_id, list);
    });

    return res.status(200).json({
      ticket_id: ticket.id,
      ...buildPortalTicketMetadata(ticket, readContextSide(context)),
      messages: messages.map((message) => ({
        id: message.id,
        author_type: message.author_type,
        author_label: message.author_label,
        body: message.body,
        created_at: message.created_at,
        attachments: attachmentsByMessage.get(message.id) ?? []
      }))
    });
  });

  router.get('/tickets/:id/realtime-state', requirePortalAuth, (req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const ticket = resolvePortalTicketForContext(req.params.id, context, {
      materializeOperationalForInternal: true
    });
    if (!ticket) {
      return res.status(404).json({ message: 'Chamado não encontrado para este cliente.' });
    }

    return res.status(200).json(buildPortalTicketRealtimeSnapshot(ticket));
  });

  router.post('/tickets/:id/realtime-heartbeat', requirePortalAuth, (req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const parsed = realtimeHeartbeatSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const ticket = resolvePortalTicketForContext(req.params.id, context, {
      materializeOperationalForInternal: true
    });
    if (!ticket) {
      return res.status(404).json({ message: 'Chamado não encontrado para este cliente.' });
    }

    const side = readContextSide(context);
    const active = parsed.data.active !== false;
    touchPortalPresence({
      companyId: context.company_id,
      ticketId: ticket.id,
      side,
      active
    });

    if (!active) {
      setPortalTypingState({
        companyId: context.company_id,
        ticketId: ticket.id,
        side,
        isTyping: false
      });
    } else if (typeof parsed.data.is_typing === 'boolean') {
      setPortalTypingState({
        companyId: context.company_id,
        ticketId: ticket.id,
        side,
        isTyping: parsed.data.is_typing
      });
    }

    return res.status(200).json(buildPortalTicketRealtimeSnapshot(ticket));
  });

  router.post('/tickets/:id/messages', requirePortalAuth, (req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const parsed = ticketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const ticket = resolvePortalTicketForContext(req.params.id, context, {
      materializeOperationalForInternal: true
    });
    if (!ticket) {
      return res.status(404).json({ message: 'Chamado não encontrado para este cliente.' });
    }

    const payload = parsed.data;
    const body = payload.body?.trim() || null;
    const attachments = payload.attachments ?? [];
    if (!body && attachments.length === 0) {
      return res.status(400).json({ message: 'Informe uma mensagem ou anexo.' });
    }

    const nowIso = new Date().toISOString();
    const authorSide = readContextSide(context);
    const messageId = insertTicketMessageWithAttachments({
      ticketId: ticket.id,
      authorType: readAuthorTypeForContext(context),
      authorLabel: readAuthorLabelForContext(context),
      body,
      attachments,
      nowIso
    });

    updateTicketReadMarker(ticket.id, authorSide, nowIso);
    enqueueWebhookForTicketActivity({
      ticketId: ticket.id,
      companyId: context.company_id,
      authorSide,
      triggerEvent: 'message_created',
      eventCreatedAt: nowIso,
      messageId
    });
    portalRealtimeHub.emitMessageCreated({
      companyId: context.company_id,
      ticketId: ticket.id,
      messageId,
      authorSide,
      createdAt: nowIso
    });

    return res.status(201).json({ id: messageId });
  });

  router.post('/tickets/:id/read', requirePortalAuth, (req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const ticket = resolvePortalTicketForContext(req.params.id, context, {
      materializeOperationalForInternal: true
    });
    if (!ticket) {
      return res.status(404).json({ message: 'Chamado não encontrado para este cliente.' });
    }

    const side = readContextSide(context);
    const readAt = new Date().toISOString();
    updateTicketReadMarker(ticket.id, side, readAt);
    suppressPendingWebhookQueueForRead(ticket.id, side, readAt);
    portalRealtimeHub.emitRead({
      companyId: context.company_id,
      ticketId: ticket.id,
      side,
      readAt
    });

    const updatedTicket = readPortalTicketRecord(ticket.id, context.company_id) ?? ticket;
    return res.status(200).json({
      ok: true,
      ticket_id: ticket.id,
      side,
      read_at: readAt,
      ...buildPortalTicketMetadata(updatedTicket, side)
    });
  });

  router.get('/tickets/:ticketId/attachments/:attachmentId/download', requirePortalAuth, (req, res) => {
    const context = getPortalContextOrNull(res);
    if (!context) {
      return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
    }

    const row = db.prepare(`
      select
        a.file_name,
        a.mime_type,
        a.file_data_base64
      from portal_ticket_attachment a
      join portal_ticket_message m on m.id = a.ticket_message_id
      join portal_ticket t on t.id = m.ticket_id
      where a.id = ?
        and t.id = ?
        and t.company_id = ?
      limit 1
    `).get(
      req.params.attachmentId,
      req.params.ticketId,
      context.company_id
    ) as
      | { file_name: string; mime_type: string; file_data_base64: string }
      | undefined;

    if (!row) {
      return res.status(404).json({ message: 'Anexo não encontrado.' });
    }

    const decoded = decodeAttachmentDataUrl(row.file_data_base64);
    const dataPart = row.file_data_base64.split(',')[1] ?? '';
    const buffer = Buffer.from(dataPart, 'base64');
    const fileName = encodeURIComponent(row.file_name);
    res.setHeader('Content-Type', row.mime_type || decoded.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
    return res.status(200).send(buffer);
  });

  app.use('/portal/api', router);
}
