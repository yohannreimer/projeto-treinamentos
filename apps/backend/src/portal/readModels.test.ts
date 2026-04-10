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

function shiftIsoDate(baseIso: string, offsetDays: number) {
  const base = new Date(`${baseIso}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
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

test('portal planning and agenda derive encounter progress for meio período', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-journey-progress');

  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const moduleId = 'mod-readmodels-journey';
    const cohortId = 'coh-readmodels-journey';

    db.prepare(`
      insert into module_template (id, code, category, name, description, duration_days, profile, is_mandatory)
      values (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      moduleId,
      'JRN-999001',
      'Treinamento',
      'Fresamento 2D Journey',
      'Módulo para validação de encontros no portal.',
      3,
      null
    );

    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Nao_iniciado', null)
    `).run('prog-readmodels-journey', 'comp-readmodels', moduleId);

    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies, period, start_time, end_time, delivery_mode, notes
      ) values (?, ?, ?, ?, null, 'Confirmada', 8, 'Meio_periodo', '08:00', '12:00', 'Online', null)
    `).run(cohortId, 'TUR-JOR-001', 'Turma Jornada Portal', shiftIsoDate(todayIso, -2));

    db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, 1, 1, 3)
    `).run('cmb-readmodels-journey', cohortId, moduleId);

    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, 1, 'Confirmado', null)
    `).run('all-readmodels-journey', cohortId, 'comp-readmodels', moduleId);

    const insertScheduleDay = db.prepare(`
      insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
      values (?, ?, ?, ?, ?, ?)
    `);
    for (let dayIndex = 1; dayIndex <= 6; dayIndex += 1) {
      const offset = dayIndex - 3;
      insertScheduleDay.run(
        `csd-readmodels-journey-${dayIndex}`,
        cohortId,
        dayIndex,
        shiftIsoDate(todayIso, offset),
        dayIndex % 2 === 0 ? '13:30' : '08:00',
        dayIndex % 2 === 0 ? '17:00' : '12:00'
      );
    }

    const token = await loginPortal(app);
    const planningRes = await request(app)
      .get('/portal/api/planning')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(planningRes.status, 200);
    const planningItem = planningRes.body.items.find((item: { module_id: string }) => item.module_id === moduleId) as
      | {
        module_id: string;
        status: string;
        total_encounters: number;
        completed_encounters: number;
        remaining_encounters: number;
        next_dates: string[];
      }
      | undefined;
    assert.ok(planningItem);
    assert.equal(planningItem.status, 'Em_execucao');
    assert.equal(planningItem.total_encounters, 6);
    assert.equal(planningItem.completed_encounters >= 3, true);
    assert.equal(planningItem.remaining_encounters <= 3, true);
    assert.equal(Array.isArray(planningItem.next_dates), true);
    assert.equal(planningItem.next_dates.length > 0, true);

    const syncedProgress = db.prepare(`
      select status, completed_at
      from company_module_progress
      where company_id = ? and module_id = ?
    `).get('comp-readmodels', moduleId) as { status: string; completed_at: string | null } | undefined;
    assert.ok(syncedProgress);
    assert.equal(syncedProgress.status, 'Em_execucao');
    assert.equal(syncedProgress.completed_at, null);

    const agendaRes = await request(app)
      .get('/portal/api/agenda')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(agendaRes.status, 200);
    assert.equal(Array.isArray(agendaRes.body.items), true);
    const journeyItem = agendaRes.body.items.find((item: { source?: string; module_name?: string }) =>
      item.source === 'jornada' && item.module_name === 'Fresamento 2D Journey'
    ) as
      | { source?: string; module_name?: string; encounter_index?: number; total_encounters?: number }
      | undefined;
    assert.ok(journeyItem);
    assert.equal(journeyItem.total_encounters, 6);
  } finally {
    cleanupDbFiles(dbPath);
  }
});
