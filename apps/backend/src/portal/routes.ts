import express, { type Express } from 'express';
import { z } from 'zod';
import {
  createPortalSession,
  findPortalUserBySlugAndUsername,
  readPortalAuthContext,
  requirePortalAuth,
  verifyPassword
} from './auth.js';

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
    const context = readPortalAuthContext(res);
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

  app.use('/portal/api', router);
}
