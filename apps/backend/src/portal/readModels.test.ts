import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';
import { hashPassword } from './auth.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function createPortalReadModelsFixture(testName: string) {
  const dbPath = assignTestDbPath(testName);
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true });
  const nowIso = new Date().toISOString();
  const passwordHash = await hashPassword('123456');

  db.prepare(`
    insert into company (id, name, status, notes, priority)
    values (?, ?, 'Ativo', null, 0)
  `).run('comp-readmodels', 'Cliente Read Models');

  db.prepare(`
    insert into portal_client (id, company_id, slug, is_active, created_at, updated_at)
    values (?, ?, ?, 1, ?, ?)
  `).run('portal-client-readmodels', 'comp-readmodels', 'cliente-readmodels', nowIso, nowIso);

  db.prepare(`
    insert into portal_user (
      id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
    ) values (?, ?, ?, ?, 1, null, ?, ?)
  `).run('portal-user-readmodels', 'portal-client-readmodels', 'cliente', passwordHash, nowIso, nowIso);

  db.prepare(`
    insert into company_module_progress (id, company_id, module_id, status, completed_at)
    values (?, ?, ?, ?, ?)
  `).run('prog-readmodels-done', 'comp-readmodels', 'mod-01', 'Concluido', '2026-05-01');

  db.prepare(`
    insert into company_module_progress (id, company_id, module_id, status, completed_at)
    values (?, ?, ?, ?, ?)
  `).run('prog-readmodels-inprogress', 'comp-readmodels', 'mod-02', 'Em_execucao', null);

  db.prepare(`
    insert into company_module_progress (id, company_id, module_id, status, completed_at)
    values (?, ?, ?, ?, ?)
  `).run('prog-readmodels-planned', 'comp-readmodels', 'mod-03', 'Planejado', null);

  db.prepare(`
    insert into calendar_activity (
      id, title, activity_type, start_date, end_date, all_day, company_id, status, notes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run('cal-comp-readmodels-a', 'Kickoff Planejamento', 'Implementacao', '2026-05-10', '2026-05-10', 'comp-readmodels', 'Planejada', null, nowIso, nowIso);

  db.prepare(`
    insert into calendar_activity (
      id, title, activity_type, start_date, end_date, all_day, company_id, status, notes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run('cal-comp-readmodels-b', 'Revisão Técnica', 'Suporte', '2026-05-12', '2026-05-12', 'comp-readmodels', 'Planejada', null, nowIso, nowIso);

  db.prepare(`
    insert into calendar_activity (
      id, title, activity_type, start_date, end_date, all_day, company_id, status, notes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run('cal-comp-02', 'Atividade Outro Tenant', 'Suporte', '2026-05-11', '2026-05-11', 'comp-02', 'Planejada', null, nowIso, nowIso);

  return { app, dbPath };
}

async function loginPortal(app: ReturnType<typeof createApp>) {
  const loginRes = await request(app)
    .post('/portal/api/auth/login')
    .send({ slug: 'cliente-readmodels', username: 'cliente', password: '123456' });

  assert.equal(loginRes.status, 200);
  const token = loginRes.body.token as string;
  assert.equal(typeof token, 'string');
  return token;
}

test('GET /portal/api/planning returns only authenticated company modules', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-planning');

  try {
    const token = await loginPortal(app);
    const res = await request(app)
      .get('/portal/api/planning')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.items), true);
    assert.equal(res.body.items.length, 3);
    assert.equal(res.body.items.every((row: { company_id: string }) => row.company_id === 'comp-readmodels'), true);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /portal/api/agenda returns only company activities', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-agenda');

  try {
    const token = await loginPortal(app);
    const res = await request(app)
      .get('/portal/api/agenda')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.items), true);
    assert.equal(res.body.items.length, 2);
    assert.equal(res.body.items.every((row: { company_id: string }) => row.company_id === 'comp-readmodels'), true);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /portal/api/overview returns tenant summary data', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-overview');

  try {
    const token = await loginPortal(app);
    const res = await request(app)
      .get('/portal/api/overview')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.company_id, 'comp-readmodels');
    assert.deepEqual(res.body.planning, {
      total: 3,
      completed: 1,
      in_progress: 1,
      planned: 1
    });
    assert.equal(res.body.agenda.total, 2);
  } finally {
    cleanupDbFiles(dbPath);
  }
});
