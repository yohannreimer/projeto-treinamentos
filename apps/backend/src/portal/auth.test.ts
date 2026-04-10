import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';
import { hashPassword, verifyPassword } from './auth.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function createPortalAuthFixture(testName: string) {
  const dbPath = assignTestDbPath(testName);
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true });
  const nowIso = new Date().toISOString();
  const passwordHash = await hashPassword('123456');

  db.prepare(`
    insert into company (id, name, status, notes, priority)
    values (?, ?, 'Ativo', null, 0)
  `).run('comp-portal-auth', 'Grupo Portal Auth');

  db.prepare(`
    insert into portal_client (id, company_id, slug, is_active, created_at, updated_at)
    values (?, ?, ?, 1, ?, ?)
  `).run('portal-client-auth', 'comp-portal-auth', 'grupo-cbm', nowIso, nowIso);

  db.prepare(`
    insert into portal_user (
      id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
    ) values (?, ?, ?, ?, 1, null, ?, ?)
  `).run('portal-user-auth', 'portal-client-auth', 'cliente', passwordHash, nowIso, nowIso);

  return { app, dbPath };
}

test('hashPassword/verifyPassword validates correct secret', async () => {
  const hash = await hashPassword('Holand#123');

  assert.match(hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('Holand#123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('verifyPassword rejects malformed hashes', async () => {
  const malformedHashes = [
    '',
    'scrypt',
    'scrypt:abcd',
    'scrypt:abcd:1234:extra',
    'argon2:00112233445566778899aabbccddeeff:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'scrypt:xyzxyzxyzxyzxyzxyzxyzxyzxyzxyzxy:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'scrypt:00112233445566778899aabbccddeeff:xyz',
    'scrypt:00112233445566778899aabbccddeeff:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde'
  ];

  for (const hash of malformedHashes) {
    assert.equal(await verifyPassword('Holand#123', hash), false, `expected malformed hash to be rejected: ${hash}`);
  }
});

test('hashPassword uses a unique salt for the same password', async () => {
  const firstHash = await hashPassword('Holand#123');
  const secondHash = await hashPassword('Holand#123');

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword('Holand#123', firstHash), true);
  assert.equal(await verifyPassword('Holand#123', secondHash), true);
});

test('POST /portal/api/auth/login returns token for valid slug/user', async () => {
  const { app, dbPath } = await createPortalAuthFixture('portal-api-login-success');

  try {
    const res = await request(app)
      .post('/portal/api/auth/login')
      .send({ slug: 'grupo-cbm', username: 'cliente', password: '123456' });

    assert.equal(res.status, 200);
    assert.equal(typeof res.body.token, 'string');
    assert.equal(typeof res.body.expires_at, 'string');

    const sessions = db.prepare(`
      select count(*) as count
      from portal_session
      where portal_user_id = ?
    `).get('portal-user-auth') as { count: number };
    assert.equal(sessions.count, 1);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /portal/api/me rejects missing bearer token', async () => {
  const dbPath = assignTestDbPath('portal-api-me-missing-token');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, initDb: false, seedDb: false });

  try {
    const res = await request(app).get('/portal/api/me');
    assert.equal(res.status, 401);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /portal/api/me returns profile for authenticated portal user', async () => {
  const { app, dbPath } = await createPortalAuthFixture('portal-api-me-authenticated');

  try {
    const loginRes = await request(app)
      .post('/portal/api/auth/login')
      .send({ slug: 'grupo-cbm', username: 'cliente', password: '123456' });

    assert.equal(loginRes.status, 200);
    const token = loginRes.body.token as string;
    assert.equal(typeof token, 'string');

    const meRes = await request(app)
      .get('/portal/api/me')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.company_id, 'comp-portal-auth');
    assert.equal(meRes.body.company_name, 'Grupo Portal Auth');
    assert.equal(meRes.body.username, 'cliente');
    assert.equal(meRes.body.slug, 'grupo-cbm');
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /portal/api/auth/login applies rate limit after repeated invalid attempts', async () => {
  const { app, dbPath } = await createPortalAuthFixture('portal-api-login-rate-limit');

  try {
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const res = await request(app)
        .post('/portal/api/auth/login')
        .send({ slug: 'grupo-cbm', username: 'cliente', password: 'senha-errada' });
      assert.equal(res.status, 401, `expected 401 on attempt ${attempt}`);
    }

    const blocked = await request(app)
      .post('/portal/api/auth/login')
      .send({ slug: 'grupo-cbm', username: 'cliente', password: 'senha-errada' });

    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers['retry-after'] !== undefined, true);
  } finally {
    cleanupDbFiles(dbPath);
  }
});
