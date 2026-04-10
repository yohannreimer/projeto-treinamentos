import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import { db, uuid } from '../db.js';
import type { PortalAuthContext } from './types.js';

const scryptAsync = promisify(scrypt);
const PASSWORD_HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const DIGEST_BYTES = 64;
const HASH_PART_COUNT = 3;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TTL_HOURS = 12;
const HEX_PATTERN = /^[0-9a-f]+$/i;

function parseFixedHex(value: string, expectedHexLength: number): Buffer | null {
  if (value.length !== expectedHexLength || value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    return null;
  }

  return Buffer.from(value, 'hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const digest = await scryptAsync(password, salt, DIGEST_BYTES) as Buffer;

  return `${PASSWORD_HASH_PREFIX}:${salt}:${digest.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
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

  // Keep the same salt representation used by hashPassword (hex string text).
  const digest = await scryptAsync(password, saltHex, DIGEST_BYTES) as Buffer;
  return timingSafeEqual(digest, expectedDigest);
}

type PortalLoginUser = Omit<PortalAuthContext, 'is_internal'> & {
  company_name: string;
  password_hash: string;
  portal_user_active: number;
  portal_client_active: number;
};

export type PortalSessionContext = PortalAuthContext & {
  company_name: string;
};

type PortalSessionRow = Omit<PortalSessionContext, 'is_internal'> & {
  is_internal: number;
  session_id: string;
  expires_at: string;
};

export type PortalLoginResult = {
  token: string;
  expires_at: string;
  is_internal: boolean;
};

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function computeSessionExpiry(nowMs: number) {
  return new Date(nowMs + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function findPortalUserBySlugAndUsername(slug: string, username: string): PortalLoginUser | null {
  const normalizedSlug = slug.trim();
  const normalizedUsername = username.trim();
  const row = db.prepare(`
    select
      pu.id as portal_user_id,
      pu.portal_client_id,
      pu.username,
      pu.password_hash,
      pu.is_active as portal_user_active,
      pc.company_id,
      pc.slug,
      pc.is_active as portal_client_active,
      c.name as company_name
    from portal_user pu
    join portal_client pc on pc.id = pu.portal_client_id
    join company c on c.id = pc.company_id
    where pc.slug = ?
      and pu.username = ?
    limit 1
  `).get(normalizedSlug, normalizedUsername) as PortalLoginUser | undefined;

  return row ?? null;
}

export async function createPortalSession(
  user: Omit<PortalAuthContext, 'is_internal'>,
  options?: { isInternal?: boolean }
): Promise<PortalLoginResult> {
  const nowIso = new Date().toISOString();
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const expiresAt = computeSessionExpiry(Date.now());
  const isInternal = options?.isInternal === true;

  db.prepare(`
    insert into portal_session (
      id, portal_user_id, portal_client_id, company_id, token_hash, is_internal, expires_at, created_at, last_seen_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid('psess'),
    user.portal_user_id,
    user.portal_client_id,
    user.company_id,
    tokenHash,
    isInternal ? 1 : 0,
    expiresAt,
    nowIso,
    nowIso
  );

  db.prepare(`
    update portal_user
    set last_login_at = ?, updated_at = ?
    where id = ?
  `).run(nowIso, nowIso, user.portal_user_id);

  return { token, expires_at: expiresAt, is_internal: isInternal };
}

function findPortalSessionByToken(token: string): PortalSessionRow | null {
  const tokenHash = hashSessionToken(token);
  const row = db.prepare(`
    select
      ps.id as session_id,
      ps.expires_at,
      ps.is_internal,
      ps.company_id,
      ps.portal_client_id,
      ps.portal_user_id,
      pc.slug,
      pu.username,
      c.name as company_name
    from portal_session ps
    join portal_user pu on pu.id = ps.portal_user_id and pu.portal_client_id = ps.portal_client_id
    join portal_client pc on pc.id = ps.portal_client_id and pc.company_id = ps.company_id
    join company c on c.id = ps.company_id
    where ps.token_hash = ?
      and (ps.is_internal = 1 or pu.is_active = 1)
      and (ps.is_internal = 1 or pc.is_active = 1)
      and datetime(ps.expires_at) > datetime('now')
    limit 1
  `).get(tokenHash) as PortalSessionRow | undefined;

  return row ?? null;
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  if (!token) return null;
  return token;
}

export function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.header('authorization'));
  if (!token) {
    return res.status(401).json({ message: 'Token de autenticação obrigatório.' });
  }

  const session = findPortalSessionByToken(token);
  if (!session) {
    return res.status(401).json({ message: 'Sessão inválida ou expirada.' });
  }

  const nowIso = new Date().toISOString();
  db.prepare('update portal_session set last_seen_at = ? where id = ?').run(nowIso, session.session_id);

  res.locals.portal = {
    company_id: session.company_id,
    portal_client_id: session.portal_client_id,
    portal_user_id: session.portal_user_id,
    slug: session.slug,
    username: session.username,
    company_name: session.company_name,
    is_internal: Number(session.is_internal) === 1
  } satisfies PortalSessionContext;

  return next();
}

export function readPortalAuthContext(res: Response): PortalSessionContext | null {
  const context = (res.locals as { portal?: PortalSessionContext }).portal;
  return context ?? null;
}
