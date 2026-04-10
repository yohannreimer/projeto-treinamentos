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

test('GET /companies/:id/portal-access returns default payload when portal is not provisioned', async () => {
  const dbPath = assignTestDbPath('portal-access-get-default');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true });

  try {
    const res = await request(app).get('/companies/comp-01/portal-access');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      slug: null,
      username: null,
      is_active: false,
      support_intro_text: null,
      hidden_module_ids: [],
      module_date_overrides: []
    });
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('PUT /companies/:id/portal-access upserts slug, username and password', async () => {
  const dbPath = assignTestDbPath('portal-access-upsert');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true });

  try {
    const upsertRes = await request(app)
      .put('/companies/comp-01/portal-access')
      .send({
        slug: 'Metal-Forte-Portal',
        username: 'cliente',
        password: 'NovaSenha#123',
        is_active: true,
        support_intro_text: 'Use este canal para registrar impedimentos e dúvidas.',
        hidden_module_ids: ['mod-03'],
        module_date_overrides: [{ module_id: 'mod-02', next_date: '2026-05-23' }]
      });

    assert.equal(upsertRes.status, 200);
    assert.equal(upsertRes.body.ok, true);
    assert.equal(typeof upsertRes.body.portal_client_id, 'string');

    const clientRows = db.prepare(`
      select count(*) as count
      from portal_client
      where company_id = ?
    `).get('comp-01') as { count: number };
    assert.equal(clientRows.count, 1);

    const getProvisioned = await request(app).get('/companies/comp-01/portal-access');
    assert.equal(getProvisioned.status, 200);
    assert.deepEqual(getProvisioned.body, {
      slug: 'metal-forte-portal',
      username: 'cliente',
      is_active: true,
      support_intro_text: 'Use este canal para registrar impedimentos e dúvidas.',
      hidden_module_ids: ['mod-03'],
      module_date_overrides: [{ module_id: 'mod-02', next_date: '2026-05-23' }]
    });

    const loginOk = await request(app)
      .post('/portal/api/auth/login')
      .send({ slug: 'metal-forte-portal', username: 'cliente', password: 'NovaSenha#123' });
    assert.equal(loginOk.status, 200);

    const legacyPasswordHash = await hashPassword('SenhaLegado#123');
    const nowIso = new Date().toISOString();
    db.prepare(`
      insert into portal_user (
        id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
      ) values (?, ?, ?, ?, 1, null, ?, ?)
    `).run('portal-user-legacy', upsertRes.body.portal_client_id, 'legado', legacyPasswordHash, nowIso, nowIso);

    const secondUpsert = await request(app)
      .put('/companies/comp-01/portal-access')
      .send({
        slug: 'metal-forte-inativo',
        username: 'cliente2',
        password: 'OutraSenha#123',
        is_active: false,
        support_intro_text: 'Texto atualizado de suporte.',
        hidden_module_ids: ['mod-01', 'mod-03'],
        module_date_overrides: [{ module_id: 'mod-01', next_date: '2026-06-01' }]
      });

    assert.equal(secondUpsert.status, 200);
    assert.equal(secondUpsert.body.ok, true);

    const userRows = db.prepare(`
      select pu.username, pu.is_active
      from portal_user pu
      join portal_client pc on pc.id = pu.portal_client_id
      where pc.company_id = ?
    `).all('comp-01') as Array<{ username: string; is_active: number }>;
    assert.equal(userRows.some((row) => row.username === 'cliente2' && row.is_active === 1), true);
    assert.equal(userRows.some((row) => row.username === 'cliente' && row.is_active === 0), true);
    assert.equal(userRows.some((row) => row.username === 'legado' && row.is_active === 0), true);
    assert.equal(userRows.filter((row) => row.is_active === 1).length, 1);

    const getUpdated = await request(app).get('/companies/comp-01/portal-access');
    assert.equal(getUpdated.status, 200);
    assert.deepEqual(getUpdated.body, {
      slug: 'metal-forte-inativo',
      username: 'cliente2',
      is_active: false,
      support_intro_text: 'Texto atualizado de suporte.',
      hidden_module_ids: ['mod-01', 'mod-03'],
      module_date_overrides: [{ module_id: 'mod-01', next_date: '2026-06-01' }]
    });

    const loginBlocked = await request(app)
      .post('/portal/api/auth/login')
      .send({ slug: 'metal-forte-inativo', username: 'cliente2', password: 'OutraSenha#123' });
    assert.equal(loginBlocked.status, 401);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('PUT /companies/:id/portal-access keeps current password when omitted on update', async () => {
  const dbPath = assignTestDbPath('portal-access-update-without-password');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true });

  try {
    const firstUpsert = await request(app)
      .put('/companies/comp-01/portal-access')
      .send({
        slug: 'sem-senha',
        username: 'cliente',
        password: 'SenhaInicial#123',
        is_active: true
      });
    assert.equal(firstUpsert.status, 200);

    const secondUpsert = await request(app)
      .put('/companies/comp-01/portal-access')
      .send({
        slug: 'sem-senha-ajuste',
        username: 'cliente',
        is_active: true,
        support_intro_text: 'Canal oficial de suporte.'
      });
    assert.equal(secondUpsert.status, 200);

    const loginRes = await request(app)
      .post('/portal/api/auth/login')
      .send({
        slug: 'sem-senha-ajuste',
        username: 'cliente',
        password: 'SenhaInicial#123'
      });
    assert.equal(loginRes.status, 200);
  } finally {
    cleanupDbFiles(dbPath);
  }
});
