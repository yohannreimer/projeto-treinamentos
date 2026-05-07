import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from '../app.js';
import { db } from '../db.js';
import { createInternalUser } from '../internalAuth.js';
import { assignTestDbPath } from '../test/testDb.js';
import { validatePlanningEncounterPayload, findPlanningEncounterConflicts } from './service.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function loginInternalUser(app: ReturnType<typeof createApp>, username: string, password: string) {
  const login = await request(app).post('/auth/login').send({ username, password });
  assert.equal(login.status, 200);
  return { Authorization: `Bearer ${login.body.token as string}` };
}

test('initDb creates planning tables and cohort planning link columns', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('planning-schema');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    const tables = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name like 'planning_%'
      order by name asc
    `).all() as Array<{ name: string }>;

    assert.deepEqual(tables.map((row) => row.name), [
      'planning_cohort',
      'planning_encounter',
      'planning_version',
      'planning_workspace',
      'planning_workspace_client'
    ]);

    const cohortColumns = db.prepare('pragma table_info(cohort)').all() as Array<{ name: string }>;
    assert.ok(cohortColumns.some((column) => column.name === 'planning_cohort_id'));
    assert.ok(cohortColumns.some((column) => column.name === 'planning_workspace_id'));
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning encounter validation rejects invalid time windows', () => {
  const result = validatePlanningEncounterPayload({
    day_date: '2026-05-11',
    start_time: '14:00',
    end_time: '10:00'
  });

  assert.equal(result.ok, false);
  assert.equal(result.message, 'Horário final deve ser maior que horário inicial.');
});

test('planning conflict check detects overlap with calendar activity', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('planning-calendar-conflict');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');
    db.prepare(`
      insert into calendar_activity (
        id, title, activity_type, start_date, end_date, selected_dates, hours_scope, all_day,
        start_time, end_time, technician_id, status, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'act-ana-1',
      'Suporte Alfa',
      'Suporte',
      '2026-05-11',
      '2026-05-11',
      '2026-05-11',
      'none',
      0,
      '10:00',
      '12:00',
      'tech-ana',
      'Planejada',
      '2026-05-07T10:00:00.000Z',
      '2026-05-07T10:00:00.000Z'
    );
    db.prepare('insert into calendar_activity_technician (activity_id, technician_id) values (?, ?)')
      .run('act-ana-1', 'tech-ana');
    db.prepare(`
      insert into calendar_activity_day (activity_id, day_date, all_day, start_time, end_time)
      values (?, ?, ?, ?, ?)
    `).run('act-ana-1', '2026-05-11', 0, '10:00', '12:00');

    const conflicts = findPlanningEncounterConflicts({
      technician_id: 'tech-ana',
      day_date: '2026-05-11',
      start_time: '11:00',
      end_time: '13:00'
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].source_type, 'calendar_activity');
    assert.equal(conflicts[0].source_id, 'act-ana-1');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API creates workspace with clients, planned cohort and encounters', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-create');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 2, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({
        name: 'Carteira Maio',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });

    assert.equal(created.status, 201);
    assert.equal(created.body.workspace.name, 'Carteira Maio');
    assert.equal(created.body.clients.length, 1);

    const workspaceId = created.body.workspace.id as string;
    const cohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação',
        delivery_mode: 'Online',
        period: 'Meio_periodo',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmacao_cliente' },
          { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmacao_cliente' }
        ]
      });

    assert.equal(cohort.status, 201);
    assert.equal(cohort.body.cohort.company_id, 'comp-delta');
    assert.equal(cohort.body.encounters.length, 2);

    const detail = await request(app).get(`/planning/workspaces/${workspaceId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.cohorts.length, 1);
    assert.equal(detail.body.cohorts[0].encounters.length, 2);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API requires calendar or cohorts internal permission when auth is enforced', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-permissions');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false, enforceInternalAuth: true });

    createInternalUser({
      username: 'planning-docs-user',
      password: 'senha-segura',
      role: 'custom',
      permissions: ['docs']
    });
    const docsAuthHeader = await loginInternalUser(app, 'planning-docs-user', 'senha-segura');

    const denied = await request(app).get('/planning/workspaces').set(docsAuthHeader);

    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body.required_permissions, ['calendar', 'cohorts']);

    createInternalUser({
      username: 'planning-calendar-user',
      password: 'senha-segura',
      role: 'custom',
      permissions: ['calendar']
    });
    const calendarAuthHeader = await loginInternalUser(app, 'planning-calendar-user', 'senha-segura');

    const allowed = await request(app).get('/planning/workspaces').set(calendarAuthHeader);

    assert.equal(allowed.status, 200);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API rejects whitespace-only workspace names', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-whitespace-name');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    const response = await request(app)
      .post('/planning/workspaces')
      .send({ name: '   ', company_ids: [] });

    assert.equal(response.status, 400);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish creates real cohort with module block, schedule days and allocation', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 2, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({
        name: 'Carteira Publicação',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });

    assert.equal(created.status, 201);
    const workspaceId = created.body.workspace.id as string;

    const plannedCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação',
        delivery_mode: 'Online',
        period: 'Meio_periodo',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' },
          { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });

    assert.equal(plannedCohort.status, 201);

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);

    assert.equal(published.status, 200);
    assert.equal(published.body.created_cohorts, 1);
    assert.equal(published.body.updated_cohorts, 0);

    const cohort = db.prepare('select * from cohort where planning_workspace_id = ?').get(workspaceId) as {
      id: string;
      technician_id: string | null;
      period: string;
    } | undefined;
    assert.ok(cohort);
    assert.equal(cohort.technician_id, 'tech-ana');
    assert.equal(cohort.period, 'Meio_periodo');

    const blocks = db.prepare('select * from cohort_module_block where cohort_id = ?').all(cohort.id) as Array<{
      module_id: string;
      duration_days: number;
    }>;
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].module_id, 'mod-install');
    assert.equal(blocks[0].duration_days, 2);

    const scheduleDays = db.prepare(`
      select * from cohort_schedule_day where cohort_id = ? order by day_index asc
    `).all(cohort.id) as Array<{
      day_date: string;
      start_time: string | null;
      end_time: string | null;
    }>;
    assert.equal(scheduleDays.length, 2);
    assert.equal(scheduleDays[0].day_date, '2026-05-11');
    assert.equal(scheduleDays[0].start_time, '10:00');

    const allocation = db.prepare('select * from cohort_allocation where cohort_id = ?').get(cohort.id) as {
      company_id: string;
      module_id: string;
    } | undefined;
    assert.ok(allocation);
    assert.equal(allocation.company_id, 'comp-delta');
    assert.equal(allocation.module_id, 'mod-install');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
