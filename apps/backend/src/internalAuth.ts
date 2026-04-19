import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, uuid } from './db.js';

export const INTERNAL_ROLE_VALUES = ['supremo', 'intermediario', 'junior', 'custom'] as const;
export type InternalRole = (typeof INTERNAL_ROLE_VALUES)[number];

export const INTERNAL_PERMISSION_KEYS = [
  'dashboard',
  'calendar',
  'cohorts',
  'clients',
  'technicians',
  'implementation',
  'support',
  'recruitment',
  'licenses',
  'license_programs',
  'docs',
  'finance.read',
  'finance.write',
  'finance.approve',
  'finance.reconcile',
  'finance.close',
  'finance.billing',
  'admin'
] as const;
export type InternalPermissionKey = (typeof INTERNAL_PERMISSION_KEYS)[number];

export type InternalAuthContext = {
  internal_user_id: string;
  username: string;
  display_name: string | null;
  role: InternalRole;
  permissions: InternalPermissionKey[];
};

export type InternalUserDto = {
  id: string;
  username: string;
  display_name: string | null;
  role: InternalRole;
  permissions: InternalPermissionKey[];
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InternalAuditLogDto = {
  id: string;
  internal_user_id: string | null;
  username: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload_json: string;
  created_at: string;
};

export type InternalAuditLogViewDto = InternalAuditLogDto & {
  summary_text: string;
  detail_text: string;
  method: string | null;
  path: string | null;
  status: number | null;
  duration_ms: number | null;
};

type InternalSessionRow = {
  session_id: string;
  expires_at: string;
  internal_user_id: string;
  username: string;
  display_name: string | null;
  role: InternalRole;
  permissions_json: string | null;
};

type InternalUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  role: InternalRole;
  permissions_json: string | null;
  password_hash: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_HOURS = 24;
const PASSWORD_HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const DIGEST_BYTES = 64;
const HASH_PART_COUNT = 3;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const INTERNAL_AUDIT_RETENTION_DAYS = 30;

const ROLE_PERMISSION_PRESETS: Record<InternalRole, InternalPermissionKey[]> = {
  supremo: [...INTERNAL_PERMISSION_KEYS],
  intermediario: INTERNAL_PERMISSION_KEYS.filter((item) => item !== 'admin'),
  junior: ['calendar', 'cohorts', 'implementation', 'support', 'licenses', 'docs'],
  custom: []
};

function parseFixedHex(value: string, expectedHexLength: number): Buffer | null {
  if (value.length !== expectedHexLength || value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    return null;
  }
  return Buffer.from(value, 'hex');
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function computeSessionExpiry(nowMs: number): string {
  return new Date(nowMs + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

function parsePermissionsJson(raw: string | null | undefined): InternalPermissionKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizePermissions(parsed);
  } catch {
    return [];
  }
}

function readRolePreset(role: InternalRole): InternalPermissionKey[] {
  return [...(ROLE_PERMISSION_PRESETS[role] ?? [])];
}

function normalizeRole(value: string | null | undefined): InternalRole {
  if (value === 'supremo' || value === 'intermediario' || value === 'junior' || value === 'custom') {
    return value;
  }
  return 'custom';
}

function rowToDto(row: InternalUserRow): InternalUserDto {
  const role = normalizeRole(row.role);
  const explicit = parsePermissionsJson(row.permissions_json);
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role,
    permissions: resolvePermissionsForRole(role, explicit),
    is_active: Number(row.is_active) === 1,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function hashInternalPassword(password: string): string {
  const saltHex = randomBytes(SALT_BYTES).toString('hex');
  const digest = scryptSync(password, saltHex, DIGEST_BYTES);
  return `${PASSWORD_HASH_PREFIX}:${saltHex}:${digest.toString('hex')}`;
}

export function verifyInternalPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== HASH_PART_COUNT) {
    return false;
  }

  const [algorithm, saltHex, expectedDigestHex] = parts;
  if (algorithm !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const salt = parseFixedHex(saltHex, SALT_BYTES * 2);
  const expectedDigest = parseFixedHex(expectedDigestHex, DIGEST_BYTES * 2);
  if (!salt || !expectedDigest) {
    return false;
  }

  const digest = scryptSync(password, saltHex, DIGEST_BYTES);
  return timingSafeEqual(digest, expectedDigest);
}

export function normalizePermissions(raw: unknown): InternalPermissionKey[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<InternalPermissionKey>(INTERNAL_PERMISSION_KEYS);
  const output = new Set<InternalPermissionKey>();
  raw.forEach((item) => {
    if (typeof item !== 'string') return;
    if (!allowed.has(item as InternalPermissionKey)) return;
    output.add(item as InternalPermissionKey);
  });
  return [...output];
}

export function resolvePermissionsForRole(role: InternalRole, explicit?: unknown): InternalPermissionKey[] {
  if (role === 'supremo') {
    return [...INTERNAL_PERMISSION_KEYS];
  }

  const normalizedExplicit = normalizePermissions(explicit);
  if (normalizedExplicit.length > 0) {
    return normalizedExplicit;
  }
  return readRolePreset(role);
}

function readInternalUserByUsername(username: string): InternalUserRow | null {
  const row = db.prepare(`
    select id, username, display_name, role, permissions_json, password_hash, is_active, last_login_at, created_at, updated_at
    from internal_user
    where username = ?
    limit 1
  `).get(username) as InternalUserRow | undefined;
  return row ?? null;
}

function readInternalUserById(userId: string): InternalUserRow | null {
  const row = db.prepare(`
    select id, username, display_name, role, permissions_json, password_hash, is_active, last_login_at, created_at, updated_at
    from internal_user
    where id = ?
    limit 1
  `).get(userId) as InternalUserRow | undefined;
  return row ?? null;
}

function readInternalSessionByToken(token: string): InternalSessionRow | null {
  const tokenHash = hashSessionToken(token);
  const row = db.prepare(`
    select
      s.id as session_id,
      s.expires_at,
      u.id as internal_user_id,
      u.username,
      u.display_name,
      u.role,
      u.permissions_json
    from internal_session s
    join internal_user u on u.id = s.internal_user_id
    where s.token_hash = ?
      and u.is_active = 1
      and datetime(s.expires_at) > datetime('now')
    limit 1
  `).get(tokenHash) as InternalSessionRow | undefined;
  return row ?? null;
}

function buildAuthContextFromSessionRow(row: InternalSessionRow): InternalAuthContext {
  const role = normalizeRole(row.role);
  const explicit = parsePermissionsJson(row.permissions_json);
  return {
    internal_user_id: row.internal_user_id,
    username: row.username,
    display_name: row.display_name,
    role,
    permissions: resolvePermissionsForRole(role, explicit)
  };
}

type InternalAuditPayload = {
  method?: unknown;
  path?: unknown;
  status?: unknown;
  duration_ms?: unknown;
  body?: unknown;
};

function parseAuditPayload(payloadJson: string): {
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  body: Record<string, unknown>;
} {
  let parsed: InternalAuditPayload = {};
  try {
    parsed = JSON.parse(payloadJson) as InternalAuditPayload;
  } catch {
    parsed = {};
  }

  const method = typeof parsed.method === 'string' ? parsed.method.toUpperCase() : null;
  const path = typeof parsed.path === 'string' ? parsed.path : null;
  const status = typeof parsed.status === 'number' && Number.isFinite(parsed.status) ? parsed.status : null;
  const durationMs = typeof parsed.duration_ms === 'number' && Number.isFinite(parsed.duration_ms)
    ? Math.max(0, Math.trunc(parsed.duration_ms))
    : null;
  const body = parsed.body && typeof parsed.body === 'object' && !Array.isArray(parsed.body)
    ? parsed.body as Record<string, unknown>
    : {};

  return { method, path, status, durationMs, body };
}

function toSentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function roleLabel(value: unknown): string {
  if (value === 'supremo') return 'Supremo';
  if (value === 'intermediario') return 'Intermediário';
  if (value === 'junior') return 'Júnior';
  return 'Custom';
}

function permissionLabel(value: string): string {
  const labels: Record<string, string> = {
    dashboard: 'Dashboard',
    calendar: 'Calendário',
    cohorts: 'Turmas',
    clients: 'Clientes',
    technicians: 'Técnicos',
    implementation: 'Implementação',
    support: 'Suporte',
    recruitment: 'Processos seletivos',
    licenses: 'Licenças',
    license_programs: 'Programas de licença',
    docs: 'Documentação',
    'finance.read': 'Financeiro',
    'finance.write': 'Financeiro (edição)',
    'finance.approve': 'Financeiro (aprovação)',
    'finance.reconcile': 'Financeiro (conciliação)',
    'finance.close': 'Financeiro (fechamento)',
    'finance.billing': 'Financeiro (billing)',
    admin: 'Administração'
  };
  return labels[value] ?? value;
}

function resourceLabel(resourceType: string): string {
  const labels: Record<string, string> = {
    companies: 'cliente',
    cohorts: 'turma',
    allocations: 'alocação',
    calendar: 'atividade de calendário',
    technicians: 'técnico',
    licenses: 'licença',
    'license-programs': 'programa de licença',
    recruitment: 'candidato',
    implementation_kanban: 'item de implementação/suporte',
    implementation: 'item de implementação/suporte',
    finance: 'financeiro',
    company_hours: 'banco de horas',
    internal_documents: 'documento interno',
    admin: 'configuração administrativa'
  };
  return labels[resourceType] ?? resourceType;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBodyPathValue(body: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = body;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function pickBodyString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readBodyPathValue(body, key);
    const text = toNonEmptyString(value);
    if (text) return text;
  }
  return null;
}

function entityWithName(entityLabel: string, preferredName: string | null, fallbackId: string | null): string {
  if (preferredName) return `${entityLabel} "${preferredName}"`;
  if (fallbackId) return `${entityLabel} ${fallbackId}`;
  return entityLabel;
}

function buildSummaryText(row: InternalAuditLogDto, parsed: ReturnType<typeof parseAuditPayload>): string {
  const actor = `Usuário ${row.username}`;
  const method = parsed.method;
  const path = parsed.path ?? '';
  const body = parsed.body;
  const changedKeys = Object.keys(body);
  const changedKeysText = changedKeys.length > 0 ? ` Campos alterados: ${changedKeys.join(', ')}.` : '';
  const target = row.resource_id ? ` (${row.resource_id})` : '';

  const calendarMatch = path.match(/^\/calendar\/activities\/([^/]+)$/);
  const cohortMatch = path.match(/^\/cohorts\/([^/]+)$/);
  const cohortParticipantMatch = path.match(/^\/cohorts\/([^/]+)\/participants\/([^/]+)$/);
  const cohortParticipantModulesMatch = path.match(/^\/cohorts\/([^/]+)\/participants\/([^/]+)\/modules$/);
  const allocationStatusMatch = path.match(/^\/allocations\/([^/]+)\/status$/);
  const companyMatch = path.match(/^\/companies\/([^/]+)$/);
  const companyPriorityMatch = path.match(/^\/companies\/([^/]+)\/priority$/);
  const companyModuleMatch = path.match(/^\/companies\/([^/]+)\/modules\/([^/]+)$/);
  const companyHoursPendingConfirmMatch = path.match(/^\/companies\/([^/]+)\/hours\/pending\/([^/]+)\/confirm$/);
  const companyHoursPendingRejectMatch = path.match(/^\/companies\/([^/]+)\/hours\/pending\/([^/]+)\/reject$/);
  const companyHoursAdjustmentMatch = path.match(/^\/companies\/([^/]+)\/hours\/adjustments$/);
  const companyHoursLedgerRevertMatch = path.match(/^\/companies\/([^/]+)\/hours\/ledger\/([^/]+)\/revert$/);
  const companyPortalAccessMatch = path.match(/^\/companies\/([^/]+)\/portal-access$/);
  const companyProgressMatch = path.match(/^\/companies\/([^/]+)\/progress\/([^/]+)$/);
  const licenseProgramMatch = path.match(/^\/license-programs\/([^/]+)$/);
  const internalDocumentMatch = path.match(/^\/internal-documents\/([^/]+)$/);
  const licenseMatch = path.match(/^\/licenses\/([^/]+)$/);
  const licenseRenewMatch = path.match(/^\/licenses\/([^/]+)\/renew$/);
  const financePathMatch = path.match(/^\/finance(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?$/);
  const technicianMatch = path.match(/^\/technicians\/([^/]+)$/);
  const technicianSkillsMatch = path.match(/^\/technicians\/([^/]+)\/skills$/);
  const kanbanCardMatch = path.match(/^\/implementation\/kanban\/cards\/([^/]+)$/);
  const kanbanColumnMatch = path.match(/^\/implementation\/kanban\/columns\/([^/]+)$/);
  const recruitmentCandidateMatch = path.match(/^\/recruitment\/candidates\/([^/]+)$/);
  const adminInternalUserMatch = path.match(/^\/admin\/internal-users\/([^/]+)$/);
  const adminModuleMatch = path.match(/^\/admin\/modules\/([^/]+)$/);
  const adminModulePrereqMatch = path.match(/^\/admin\/modules\/([^/]+)\/prerequisites$/);
  const companyNameFromBody = pickBodyString(body, ['company_name', 'company.name', 'name']);
  const technicianNameFromBody = pickBodyString(body, ['technician_name', 'technician.name', 'name']);
  const cohortNameFromBody = pickBodyString(body, ['cohort_name', 'cohort.name', 'name']);
  const moduleNameFromBody = pickBodyString(body, ['module_name', 'module.name', 'title', 'name']);

  if (method === 'POST' && path === '/admin/internal-users') {
    const targetUser = toNonEmptyString(body.username) ?? 'novo usuário interno';
    const role = roleLabel(body.role);
    const permissions = Array.isArray(body.permissions)
      ? (body.permissions as unknown[])
        .filter((item) => typeof item === 'string')
        .map((item) => permissionLabel(item as string))
      : [];
    const permissionText = permissions.length > 0
      ? ` com permissões: ${permissions.join(', ')}`
      : '';
    return `${actor} criou o usuário interno ${targetUser} (perfil ${role})${permissionText}.`;
  }

  if (method === 'PATCH' && adminInternalUserMatch) {
    return `${actor} atualizou um usuário interno${target}.${changedKeysText}`;
  }

  if (method === 'POST' && path === '/calendar/activities') {
    const title = toNonEmptyString(body.title) ?? 'atividade';
    return `${actor} registrou uma atividade no calendário: "${title}".`;
  }

  if (method === 'PATCH' && calendarMatch) {
    const activityTitle = pickBodyString(body, ['title']);
    const activityRef = entityWithName('atividade de calendário', activityTitle, calendarMatch[1]);
    return `${actor} atualizou ${activityRef}.${changedKeysText}`;
  }

  if (method === 'DELETE' && calendarMatch) {
    return `${actor} excluiu a atividade de calendário ${calendarMatch[1]}.`;
  }

  if (method === 'POST' && path === '/cohorts') {
    const code = toNonEmptyString(body.code);
    const name = toNonEmptyString(body.name);
    if (code && name) {
      return `${actor} criou a turma ${code} - ${name}.`;
    }
    return `${actor} criou uma nova turma.`;
  }

  if (method === 'PATCH' && cohortMatch) {
    const cohortRef = entityWithName('turma', cohortNameFromBody, cohortMatch[1]);
    return `${actor} atualizou ${cohortRef}.${changedKeysText}`;
  }

  if (method === 'DELETE' && cohortMatch) {
    return `${actor} excluiu a turma ${cohortMatch[1]}.`;
  }

  if (method === 'POST' && path.match(/^\/cohorts\/[^/]+\/participants$/)) {
    const participantName = toNonEmptyString(body.participant_name);
    const companyId = toNonEmptyString(body.company_id);
    const cohortId = path.split('/')[2];
    const cohortRef = entityWithName('turma', cohortNameFromBody, cohortId);
    if (participantName) {
      return `${actor} adicionou o participante "${participantName}" na ${cohortRef}.`;
    }
    if (companyId) {
      return `${actor} adicionou um participante da empresa ${companyId} na ${cohortRef}.`;
    }
    return `${actor} adicionou um participante na ${cohortRef}.`;
  }

  if (method === 'DELETE' && cohortParticipantMatch) {
    return `${actor} removeu o participante ${cohortParticipantMatch[2]} da turma ${cohortParticipantMatch[1]}.`;
  }

  if ((method === 'POST' || method === 'PATCH') && cohortParticipantModulesMatch) {
    const moduleIds = Array.isArray(body.module_ids) ? body.module_ids.length : null;
    const moduleText = typeof moduleIds === 'number' ? ` com ${moduleIds} módulo(s)` : '';
    return `${actor} atualizou os módulos do participante ${cohortParticipantModulesMatch[2]} na turma ${cohortParticipantModulesMatch[1]}${moduleText}.`;
  }

  if (method === 'POST' && path === '/allocations') {
    return `${actor} criou uma alocação de empresa em turma.`;
  }

  if (method === 'POST' && path.match(/^\/cohorts\/[^/]+\/allocate-company$/)) {
    const cohortId = path.split('/')[2];
    const companyId = toNonEmptyString(body.company_id);
    const companyRef = entityWithName('empresa', companyNameFromBody, companyId);
    const cohortRef = entityWithName('turma', cohortNameFromBody, cohortId);
    return `${actor} vinculou a ${companyRef} na ${cohortRef}.`;
  }

  if (method === 'PATCH' && allocationStatusMatch) {
    const status = toNonEmptyString(body.status);
    if (status) {
      return `${actor} mudou o status da alocação ${allocationStatusMatch[1]} para ${status}.`;
    }
    return `${actor} atualizou o status da alocação ${allocationStatusMatch[1]}.`;
  }

  if (method === 'POST' && path === '/companies') {
    const companyRef = entityWithName('cliente', companyNameFromBody, null);
    return `${actor} cadastrou ${companyRef}.`;
  }

  if (method === 'PATCH' && companyPriorityMatch) {
    const companyRef = entityWithName('cliente', companyNameFromBody, companyPriorityMatch[1]);
    return `${actor} alterou a prioridade comercial do ${companyRef}.${changedKeysText}`;
  }

  if (method === 'PATCH' && companyModuleMatch) {
    return `${actor} ajustou a ativação do módulo ${companyModuleMatch[2]} no cliente ${companyModuleMatch[1]}.${changedKeysText}`;
  }

  if (method === 'PATCH' && companyProgressMatch) {
    const status = toNonEmptyString(body.status);
    const statusText = status ? ` para ${status}` : '';
    const companyRef = entityWithName('cliente', companyNameFromBody, companyProgressMatch[1]);
    const moduleRef = entityWithName('módulo', moduleNameFromBody, companyProgressMatch[2]);
    return `${actor} atualizou o progresso do ${moduleRef} no ${companyRef}${statusText}.`;
  }

  if (method === 'PUT' && companyPortalAccessMatch) {
    const slug = toNonEmptyString(body.slug);
    const username = toNonEmptyString(body.username);
    const extra = [slug ? `slug ${slug}` : null, username ? `usuário ${username}` : null]
      .filter(Boolean)
      .join(', ');
    const companyRef = entityWithName('cliente', companyNameFromBody, companyPortalAccessMatch[1]);
    return `${actor} atualizou o acesso ao portal do ${companyRef}${extra ? ` (${extra})` : ''}.`;
  }

  if (method === 'PATCH' && companyMatch) {
    const companyRef = entityWithName('cliente', companyNameFromBody, companyMatch[1]);
    return `${actor} atualizou os dados do ${companyRef}.${changedKeysText}`;
  }

  if (method === 'DELETE' && companyMatch) {
    return `${actor} excluiu o cliente ${companyMatch[1]}.`;
  }

  if (method === 'POST' && companyHoursPendingConfirmMatch) {
    const companyRef = entityWithName('cliente', companyNameFromBody, companyHoursPendingConfirmMatch[1]);
    return `${actor} confirmou a pendência de horas ${companyHoursPendingConfirmMatch[2]} do ${companyRef}.`;
  }

  if (method === 'POST' && companyHoursPendingRejectMatch) {
    const companyRef = entityWithName('cliente', companyNameFromBody, companyHoursPendingRejectMatch[1]);
    return `${actor} rejeitou a pendência de horas ${companyHoursPendingRejectMatch[2]} do ${companyRef}.`;
  }

  if (method === 'POST' && companyHoursAdjustmentMatch) {
    const delta = typeof body.delta_hours === 'number' ? body.delta_hours : null;
    const deltaText = typeof delta === 'number' ? `${delta >= 0 ? '+' : ''}${delta}h` : 'ajuste manual';
    const companyRef = entityWithName('cliente', companyNameFromBody, companyHoursAdjustmentMatch[1]);
    return `${actor} registrou ${deltaText} no banco de horas do ${companyRef}.`;
  }

  if (method === 'POST' && companyHoursLedgerRevertMatch) {
    const companyRef = entityWithName('cliente', companyNameFromBody, companyHoursLedgerRevertMatch[1]);
    return `${actor} estornou o lançamento ${companyHoursLedgerRevertMatch[2]} no banco de horas do ${companyRef}.`;
  }

  if (method === 'POST' && path === '/license-programs') {
    const programName = toNonEmptyString(body.name) ?? 'programa de licença';
    return `${actor} criou o programa de licença "${programName}".`;
  }

  if (method === 'PATCH' && licenseProgramMatch) {
    return `${actor} atualizou o programa de licença ${licenseProgramMatch[1]}.${changedKeysText}`;
  }

  if (method === 'DELETE' && licenseProgramMatch) {
    return `${actor} excluiu o programa de licença ${licenseProgramMatch[1]}.`;
  }

  if (method === 'POST' && path === '/internal-documents') {
    const title = toNonEmptyString(body.title) ?? 'documento interno';
    return `${actor} publicou o documento interno "${title}".`;
  }

  if (method === 'DELETE' && internalDocumentMatch) {
    return `${actor} removeu o documento interno ${internalDocumentMatch[1]}.`;
  }

  if (method === 'POST' && path === '/licenses') {
    return `${actor} criou um registro de licença para cliente.`;
  }

  if (method === 'POST' && financePathMatch) {
    const financeSection = financePathMatch[1] ?? '';
    const financeSubsection = financePathMatch[2] ?? '';
    const financeLabel = (() => {
      if (financeSection === 'accounts') return 'uma conta financeira';
      if (financeSection === 'categories') return 'uma categoria financeira';
      if (financeSection === 'transactions') return 'uma movimentação financeira';
      if (financeSection === 'payables') return 'uma conta a pagar';
      if (financeSection === 'receivables') return 'uma conta a receber';
      if (financeSection === 'reconciliation' || financeSection === 'reconciliations' || financeSection === 'matches') {
        return 'uma conciliação financeira';
      }
      if (financeSection === 'debts') return 'uma dívida financeira';
      if (financeSection === 'billing' && financeSubsection === 'plans') return 'um plano de billing';
      if (financeSection === 'billing' && financeSubsection === 'subscriptions') return 'uma assinatura de billing';
      if (financeSection === 'billing' && financeSubsection === 'invoices') return 'uma fatura de billing';
      if (financeSection === 'imports') return 'uma importação financeira';
      return 'um registro financeiro';
    })();
    const financeVerb = financeLabel.includes('movimentação')
      || financeLabel.includes('conciliação')
      || financeLabel.includes('importação')
      ? 'registrou'
      : 'criou';
    return `${actor} ${financeVerb} ${financeLabel}.`;
  }

  if (method === 'PATCH' && licenseMatch) {
    return `${actor} atualizou a licença ${licenseMatch[1]}.${changedKeysText}`;
  }

  if (method === 'DELETE' && licenseMatch) {
    return `${actor} excluiu a licença ${licenseMatch[1]}.`;
  }

  if (method === 'POST' && licenseRenewMatch) {
    return `${actor} renovou a licença ${licenseRenewMatch[1]}.`;
  }

  if (method === 'POST' && path === '/technicians') {
    const technicianName = toNonEmptyString(body.name) ?? 'técnico';
    return `${actor} cadastrou o técnico "${technicianName}".`;
  }

  if (method === 'PATCH' && technicianSkillsMatch) {
    const count = Array.isArray(body.module_ids) ? body.module_ids.length : null;
    const technicianRef = entityWithName('técnico', technicianNameFromBody, technicianSkillsMatch[1]);
    return `${actor} atualizou as habilidades do ${technicianRef}${typeof count === 'number' ? ` (${count} módulo(s))` : ''}.`;
  }

  if (method === 'PATCH' && technicianMatch) {
    const technicianRef = entityWithName('técnico', technicianNameFromBody, technicianMatch[1]);
    return `${actor} atualizou os dados do ${technicianRef}.${changedKeysText}`;
  }

  if (method === 'DELETE' && technicianMatch) {
    return `${actor} excluiu o técnico ${technicianMatch[1]}.`;
  }

  if (method === 'POST' && path === '/implementation/kanban/cards') {
    const title = toNonEmptyString(body.title) ?? 'card';
    return `${actor} criou o card "${title}" no Kanban de implementação/suporte.`;
  }

  if (method === 'PATCH' && kanbanCardMatch) {
    const cardRef = entityWithName('card', moduleNameFromBody, kanbanCardMatch[1]);
    return `${actor} atualizou o ${cardRef} no Kanban.${changedKeysText}`;
  }

  if (method === 'DELETE' && kanbanCardMatch) {
    return `${actor} excluiu o card ${kanbanCardMatch[1]} do Kanban.`;
  }

  if (method === 'POST' && path === '/implementation/kanban/reorder') {
    return `${actor} reorganizou cards no Kanban.`;
  }

  if (method === 'POST' && path === '/implementation/kanban/columns') {
    const title = toNonEmptyString(body.title) ?? 'coluna';
    return `${actor} criou a coluna "${title}" no Kanban.`;
  }

  if (method === 'PATCH' && kanbanColumnMatch) {
    return `${actor} atualizou a coluna ${kanbanColumnMatch[1]} do Kanban.${changedKeysText}`;
  }

  if (method === 'DELETE' && kanbanColumnMatch) {
    return `${actor} excluiu a coluna ${kanbanColumnMatch[1]} do Kanban.`;
  }

  if (method === 'POST' && path === '/implementation/kanban/columns/reorder') {
    return `${actor} reorganizou colunas no Kanban.`;
  }

  if (method === 'POST' && path === '/recruitment/candidates') {
    const name = toNonEmptyString(body.name) ?? 'candidato';
    return `${actor} cadastrou o candidato "${name}".`;
  }

  if (method === 'PATCH' && recruitmentCandidateMatch) {
    const candidateRef = entityWithName('candidato', pickBodyString(body, ['name']), recruitmentCandidateMatch[1]);
    return `${actor} atualizou o ${candidateRef}.${changedKeysText}`;
  }

  if (method === 'DELETE' && recruitmentCandidateMatch) {
    return `${actor} excluiu o candidato ${recruitmentCandidateMatch[1]}.`;
  }

  if (method === 'POST' && path === '/admin/modules') {
    const name = toNonEmptyString(body.name) ?? 'módulo';
    return `${actor} criou o módulo "${name}".`;
  }

  if (method === 'PATCH' && adminModuleMatch) {
    return `${actor} atualizou o módulo ${adminModuleMatch[1]}.${changedKeysText}`;
  }

  if (method === 'PUT' && adminModulePrereqMatch) {
    const count = Array.isArray(body.prerequisite_module_ids) ? body.prerequisite_module_ids.length : null;
    return `${actor} atualizou os pré-requisitos do módulo ${adminModulePrereqMatch[1]}${typeof count === 'number' ? ` (${count} vínculo(s))` : ''}.`;
  }

  if (method === 'DELETE' && adminModuleMatch) {
    return `${actor} excluiu o módulo ${adminModuleMatch[1]}.`;
  }

  if (method === 'POST' && path === '/admin/bootstrap-current-data') {
    return `${actor} executou a carga inicial de dados atuais (bootstrap).`;
  }

  if (method === 'POST' && path === '/admin/bootstrap-real-scenario') {
    return `${actor} executou o cenário real de bootstrap administrativo.`;
  }

  if (method === 'POST' && path === '/admin/import-workbook') {
    const filePath = toNonEmptyString(body.file_path);
    return `${actor} importou uma planilha administrativa${filePath ? ` (${filePath})` : ''}.`;
  }

  if (method === 'PUT' && path === '/admin/portal-operator-access') {
    return `${actor} atualizou a credencial global de operador do portal.`;
  }

  if (method === 'DELETE') {
    return `${actor} excluiu ${resourceLabel(row.resource_type)}${target}.`;
  }

  if (method === 'POST') {
    return `${actor} criou/registrou ${resourceLabel(row.resource_type)}${target}.`;
  }

  if (method === 'PATCH' || method === 'PUT') {
    return `${actor} atualizou ${resourceLabel(row.resource_type)}${target}.`;
  }

  return `${actor} executou ${toSentenceCase(row.action.toLowerCase())}.`;
}

function buildDetailText(row: InternalAuditLogDto, parsed: ReturnType<typeof parseAuditPayload>): string {
  const method = parsed.method ?? row.action.split(' ')[0] ?? 'AÇÃO';
  const path = parsed.path ?? (row.action.split(' ').slice(1).join(' ') || '-');
  const status = typeof parsed.status === 'number' ? `HTTP ${parsed.status}` : 'sem status';
  const duration = typeof parsed.durationMs === 'number' ? `${parsed.durationMs} ms` : 'sem duração';
  const bodyKeys = Object.keys(parsed.body ?? {});
  const fields = bodyKeys.length > 0 ? `Campos enviados: ${bodyKeys.join(', ')}.` : 'Sem campos enviados.';
  return `${method} ${path} · ${status} · ${duration}. ${fields}`;
}

function readBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  if (!token) return null;
  return token;
}

export function extractInternalBearerToken(req: Request): string | null {
  return readBearerToken(req.header('authorization'));
}

export function attachInternalAuthIfPresent(req: Request, res: Response, next: NextFunction) {
  const token = extractInternalBearerToken(req);
  if (!token) {
    return next();
  }

  const session = readInternalSessionByToken(token);
  if (!session) {
    return next();
  }

  const nowIso = new Date().toISOString();
  db.prepare('update internal_session set last_seen_at = ? where id = ?').run(nowIso, session.session_id);
  (res.locals as { internal?: InternalAuthContext }).internal = buildAuthContextFromSessionRow(session);
  return next();
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractInternalBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Token de autenticação obrigatório.' });
  }

  const session = readInternalSessionByToken(token);
  if (!session) {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }

  const nowIso = new Date().toISOString();
  db.prepare('update internal_session set last_seen_at = ? where id = ?').run(nowIso, session.session_id);
  (res.locals as { internal?: InternalAuthContext }).internal = buildAuthContextFromSessionRow(session);
  return next();
}

export function readInternalAuthContext(res: Response): InternalAuthContext | null {
  const context = (res.locals as { internal?: InternalAuthContext }).internal;
  return context ?? null;
}

export function hasInternalPermission(
  context: InternalAuthContext,
  permission: InternalPermissionKey
): boolean {
  return context.permissions.includes(permission);
}

export function hasAnyInternalPermission(
  context: InternalAuthContext,
  permissions: InternalPermissionKey[]
): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((permission) => hasInternalPermission(context, permission));
}

export function createInternalSessionForCredentials(username: string, password: string): {
  token: string;
  expires_at: string;
  user: InternalAuthContext;
} | null {
  const user = readInternalUserByUsername(username.trim());
  if (!user || Number(user.is_active) !== 1) {
    return null;
  }
  if (!verifyInternalPassword(password, user.password_hash)) {
    return null;
  }

  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const nowIso = new Date().toISOString();
  const expiresAt = computeSessionExpiry(Date.now());

  db.prepare(`
    insert into internal_session (
      id, internal_user_id, token_hash, expires_at, created_at, last_seen_at
    ) values (?, ?, ?, ?, ?, ?)
  `).run(uuid('isess'), user.id, tokenHash, expiresAt, nowIso, nowIso);

  db.prepare(`
    update internal_user
    set last_login_at = ?, updated_at = ?
    where id = ?
  `).run(nowIso, nowIso, user.id);

  const context: InternalAuthContext = {
    internal_user_id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: normalizeRole(user.role),
    permissions: resolvePermissionsForRole(normalizeRole(user.role), parsePermissionsJson(user.permissions_json))
  };

  return {
    token,
    expires_at: expiresAt,
    user: context
  };
}

export function logoutInternalSessionByToken(token: string): void {
  const tokenHash = hashSessionToken(token);
  db.prepare('delete from internal_session where token_hash = ?').run(tokenHash);
}

export function listInternalUsers(): InternalUserDto[] {
  const rows = db.prepare(`
    select id, username, display_name, role, permissions_json, password_hash, is_active, last_login_at, created_at, updated_at
    from internal_user
    order by username collate nocase asc
  `).all() as InternalUserRow[];
  return rows.map(rowToDto);
}

function assertSupremoStillExistsAfterUpdate(nextRole: InternalRole, nextActive: boolean, userId: string) {
  if (nextRole === 'supremo' && nextActive) {
    return;
  }
  const supremoCount = db.prepare(`
    select count(*) as count
    from internal_user
    where role = 'supremo'
      and is_active = 1
      and id <> ?
  `).get(userId) as { count: number };

  if (supremoCount.count === 0) {
    throw new Error('Deixe ao menos um usuário supremo ativo no sistema.');
  }
}

export function createInternalUser(payload: {
  username: string;
  display_name?: string | null;
  password: string;
  role: InternalRole;
  permissions?: unknown;
  is_active?: boolean;
}): InternalUserDto {
  const username = payload.username.trim();
  if (!username) {
    throw new Error('Login é obrigatório.');
  }

  const role = normalizeRole(payload.role);
  const permissions = resolvePermissionsForRole(role, payload.permissions);
  const nowIso = new Date().toISOString();
  const id = uuid('iuser');

  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json, is_active, last_login_at, created_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, null, ?, ?)
  `).run(
    id,
    username,
    payload.display_name?.trim() || null,
    hashInternalPassword(payload.password),
    role,
    JSON.stringify(permissions),
    payload.is_active === false ? 0 : 1,
    nowIso,
    nowIso
  );

  const inserted = readInternalUserById(id);
  if (!inserted) {
    throw new Error('Não foi possível criar usuário interno.');
  }
  return rowToDto(inserted);
}

export function updateInternalUser(
  userId: string,
  payload: {
    username?: string;
    display_name?: string | null;
    password?: string;
    role?: InternalRole;
    permissions?: unknown;
    is_active?: boolean;
  }
): InternalUserDto {
  const current = readInternalUserById(userId);
  if (!current) {
    throw new Error('Usuário não encontrado.');
  }

  const nextRole = payload.role ? normalizeRole(payload.role) : normalizeRole(current.role);
  const nextActive = typeof payload.is_active === 'boolean' ? payload.is_active : Number(current.is_active) === 1;
  assertSupremoStillExistsAfterUpdate(nextRole, nextActive, userId);

  const fields: string[] = [];
  const values: unknown[] = [];

  if (typeof payload.username === 'string') {
    fields.push('username = ?');
    values.push(payload.username.trim());
  }
  if (typeof payload.display_name !== 'undefined') {
    fields.push('display_name = ?');
    values.push(payload.display_name?.trim() || null);
  }
  if (typeof payload.password === 'string' && payload.password.trim().length > 0) {
    fields.push('password_hash = ?');
    values.push(hashInternalPassword(payload.password));
  }
  if (typeof payload.role === 'string') {
    fields.push('role = ?');
    values.push(nextRole);
  }
  if (typeof payload.permissions !== 'undefined' || typeof payload.role !== 'undefined') {
    const nextPermissions = resolvePermissionsForRole(nextRole, payload.permissions);
    fields.push('permissions_json = ?');
    values.push(JSON.stringify(nextPermissions));
  }
  if (typeof payload.is_active === 'boolean') {
    fields.push('is_active = ?');
    values.push(payload.is_active ? 1 : 0);
  }

  if (fields.length === 0) {
    return rowToDto(current);
  }

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(userId);

  db.prepare(`update internal_user set ${fields.join(', ')} where id = ?`).run(...values);
  const updated = readInternalUserById(userId);
  if (!updated) {
    throw new Error('Usuário não encontrado.');
  }
  return rowToDto(updated);
}

export function createInternalAuditLog(payload: {
  internal_user_id: string | null;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  data?: unknown;
}) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    insert into internal_audit_log (
      id, internal_user_id, username, action, resource_type, resource_id, payload_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid('iaudit'),
    payload.internal_user_id,
    payload.username,
    payload.action,
    payload.resource_type,
    payload.resource_id ?? null,
    JSON.stringify(payload.data ?? {}),
    nowIso
  );

  db.prepare(`
    delete from internal_audit_log
    where datetime(created_at) < datetime('now', ?)
  `).run(`-${INTERNAL_AUDIT_RETENTION_DAYS} day`);
}

export function listInternalAuditLogs(limit = 120): InternalAuditLogViewDto[] {
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 500) : 120;
  const rows = db.prepare(`
    select id, internal_user_id, username, action, resource_type, resource_id, payload_json, created_at
    from internal_audit_log
    order by datetime(created_at) desc, id desc
    limit ?
  `).all(safeLimit) as InternalAuditLogDto[];
  return rows.map((row) => {
    const parsed = parseAuditPayload(row.payload_json);
    return {
      ...row,
      summary_text: buildSummaryText(row, parsed),
      detail_text: buildDetailText(row, parsed),
      method: parsed.method,
      path: parsed.path,
      status: parsed.status,
      duration_ms: parsed.durationMs
    };
  });
}
