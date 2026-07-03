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

test('planning API exposes only client modules that still need planning', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-client-pending-modules');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-basic', 'MOD-01', 'Base', 'Básico', 1, 1, 'ministrado', 'consome');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-mount', 'MOD-02', 'Base', 'Montagem', 1, 1, 'ministrado', 'consome');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-cam', 'MOD-03', 'Base', 'Fresamento 2D', 1, 1, 'ministrado', 'consome');
    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Concluido', ?)
    `).run('prog-basic', 'comp-delta', 'mod-basic', '2026-05-01');
    db.prepare(`
      insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, period, delivery_mode)
      values (?, ?, ?, ?, null, 'Planejada', 1, 'Meio_periodo', 'Online')
    `).run('coh-mount', 'TUR-MOUNT', 'Turma Montagem', '2026-05-20');
    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, 1, 'Previsto', null)
    `).run('all-mount', 'coh-mount', 'comp-delta', 'mod-mount');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Pendências', company_ids: ['comp-delta'] });

    assert.equal(created.status, 201);
    assert.deepEqual(created.body.clients[0].available_module_ids, ['mod-cam']);

    const blocked = await request(app)
      .post(`/planning/workspaces/${created.body.workspace.id}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-basic',
        name: 'Delta · Básico',
        encounters: [
          { day_date: '2026-05-11', start_time: '08:00', end_time: '12:00' }
        ]
      });

    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.message, 'Este cliente já tem esse módulo concluído ou vinculado a outra turma. Escolha outro módulo pendente.');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API can add clients to an existing empty workspace', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-add-clients');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Vazia', company_ids: [] });

    assert.equal(created.status, 201);
    assert.equal(created.body.clients.length, 0);

    const workspaceId = created.body.workspace.id as string;
    const updated = await request(app)
      .post(`/planning/workspaces/${workspaceId}/clients`)
      .send({ company_ids: ['comp-delta'] });

    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.clients.map((client: { company_id: string }) => client.company_id), ['comp-delta']);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API can remove a client without deleting other workspace clients', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-remove-client');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-omega', 'Omega Moldes', 'Ativo');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Clientes', company_ids: ['comp-delta', 'comp-omega'] });

    assert.equal(created.status, 201);
    assert.equal(created.body.clients.length, 2);

    const workspaceId = created.body.workspace.id as string;
    const updated = await request(app)
      .delete(`/planning/workspaces/${workspaceId}/clients/comp-delta`);

    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.clients.map((client: { company_id: string }) => client.company_id), ['comp-omega']);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API rejects creating overlapping planned encounters for the same technician', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-api-create-conflict');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 1, 1, 'ministrado', 'consome');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-advanced', 'MOD-02', 'Base', 'Avançado', 1, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Conflito', company_ids: ['comp-delta'] });
    const workspaceId = created.body.workspace.id as string;

    const first = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação',
        encounters: [
          { day_date: '2026-05-11', start_time: '08:00', end_time: '12:00' }
        ]
      });
    assert.equal(first.status, 201);

    const conflicting = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-advanced',
        technician_id: 'tech-ana',
        name: 'Delta · Avançado',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '17:00' }
        ]
      });

    assert.equal(conflicting.status, 409);
    assert.equal(conflicting.body.message, 'Turma planejada possui conflito.');
    assert.equal(conflicting.body.conflicts[0].source_type, 'planning_encounter');
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

test('planning workspace delete archives the plan without deleting published cohorts', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-delete-workspace');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 1, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Planejamento para apagar', company_ids: ['comp-delta'] });

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
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });
    assert.equal(plannedCohort.status, 201);
    assert.equal((await request(app).post(`/planning/workspaces/${workspaceId}/publish`)).status, 200);

    const deleted = await request(app).delete(`/planning/workspaces/${workspaceId}`);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.ok, true);

    const archived = db.prepare('select status from planning_workspace where id = ?').get(workspaceId) as { status: string };
    assert.equal(archived.status, 'Arquivado');

    const list = await request(app).get('/planning/workspaces');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.workspaces.map((workspace: { id: string }) => workspace.id), []);

    const publishedCohort = db.prepare('select id from cohort where planning_workspace_id = ?').get(workspaceId);
    assert.ok(publishedCohort);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning suggestions respect a requested fixed time window', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-suggestions-fixed-time');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const response = await request(app)
      .post('/planning/suggestions')
      .send({
        module_id: 'mod-install',
        technician_ids: ['tech-ana'],
        date_from: '2026-05-11',
        date_to: '2026-05-15',
        duration_minutes: 240,
        start_time: '13:00',
        end_time: '17:00',
        max_results: 2
      });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.suggestions.map((suggestion: { start_time: string; end_time: string }) => ({
        start_time: suggestion.start_time,
        end_time: suggestion.end_time
      })),
      [
        { start_time: '13:00', end_time: '17:00' },
        { start_time: '13:00', end_time: '17:00' }
      ]
    );
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
    assert.equal(blocks[0].duration_days, 1);

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

test('planning publish uses active planned encounters instead of default module duration', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-shorter-than-template');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-basic', 'MOD-03', 'Base', 'Básico', 3, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Encurtada', company_ids: ['comp-delta'] });

    const workspaceId = created.body.workspace.id as string;
    const plannedCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-basic',
        technician_id: 'tech-ana',
        name: 'Delta · Básico ajustado',
        period: 'Integral',
        encounters: [
          { day_date: '2026-05-11', start_time: '08:00', end_time: '17:00', status: 'Confirmado' },
          { day_date: '2026-05-12', start_time: '08:00', end_time: '17:00', status: 'Confirmado' }
        ]
      });
    assert.equal(plannedCohort.status, 201);

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);

    assert.equal(published.status, 200);
    const cohort = db.prepare('select id from cohort where planning_workspace_id = ?').get(workspaceId) as { id: string };
    const block = db.prepare('select duration_days from cohort_module_block where cohort_id = ?').get(cohort.id) as {
      duration_days: number;
    };
    assert.equal(block.duration_days, 2);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish supports mixed full-day and half-day encounters in one cohort', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-mixed-duration');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-cam', 'MOD-04', 'Base', 'CAM', 3, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Mista', company_ids: ['comp-delta'] });

    const workspaceId = created.body.workspace.id as string;
    const plannedCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-cam',
        technician_id: 'tech-ana',
        name: 'Delta · CAM misto',
        period: 'Integral',
        encounters: [
          { day_date: '2026-05-11', start_time: '08:00', end_time: '17:00', status: 'Confirmado' },
          { day_date: '2026-05-12', start_time: '08:00', end_time: '17:00', status: 'Confirmado' },
          { day_date: '2026-05-13', start_time: '08:00', end_time: '12:00', status: 'Confirmado' }
        ]
      });
    assert.equal(plannedCohort.status, 201);

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);

    assert.equal(published.status, 200);
    const cohort = db.prepare('select id from cohort where planning_workspace_id = ?').get(workspaceId) as { id: string };
    const block = db.prepare('select duration_days from cohort_module_block where cohort_id = ?').get(cohort.id) as {
      duration_days: number;
    };
    assert.equal(block.duration_days, 2.5);

    const scheduleDays = db.prepare(`
      select day_date, start_time, end_time
      from cohort_schedule_day
      where cohort_id = ?
      order by day_index asc
    `).all(cohort.id) as Array<{ day_date: string; start_time: string; end_time: string }>;
    assert.deepEqual(scheduleDays, [
      { day_date: '2026-05-11', start_time: '08:00', end_time: '17:00' },
      { day_date: '2026-05-12', start_time: '08:00', end_time: '17:00' },
      { day_date: '2026-05-13', start_time: '08:00', end_time: '12:00' }
    ]);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish orders schedule days by real date', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-chronological-days');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 3, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({ name: 'Carteira Ordem Cronológica', company_ids: ['comp-delta'] });
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
          { day_date: '2026-05-27', start_time: '13:00', end_time: '17:00', status: 'Confirmado' },
          { day_date: '2026-05-26', start_time: '13:00', end_time: '17:00', status: 'Confirmado' },
          { day_date: '2026-05-20', start_time: '13:00', end_time: '17:00', status: 'Confirmado' }
        ]
      });

    assert.equal(plannedCohort.status, 201);
    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(published.status, 200);

    const cohort = db.prepare('select id, start_date from cohort where planning_workspace_id = ?').get(workspaceId) as {
      id: string;
      start_date: string;
    };
    assert.equal(cohort.start_date, '2026-05-20');

    const scheduleDays = db.prepare(`
      select day_index, day_date from cohort_schedule_day where cohort_id = ? order by day_index asc
    `).all(cohort.id) as Array<{ day_index: number; day_date: string }>;

    assert.deepEqual(scheduleDays, [
      { day_index: 1, day_date: '2026-05-20' },
      { day_index: 2, day_date: '2026-05-26' },
      { day_index: 3, day_date: '2026-05-27' }
    ]);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish uses a free code when the default planning code already exists', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-code-collision');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 1, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({
        name: 'Carteira Código Livre',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });

    assert.equal(created.status, 201);
    const workspaceId = created.body.workspace.id as string;
    const defaultCode = `PLAN-${workspaceId.slice(-5).toUpperCase()}-01`;
    db.prepare(`
      insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, period, delivery_mode)
      values (?, ?, ?, ?, null, 'Planejada', 1, 'Meio_periodo', 'Online')
    `).run('coh-existing-code', defaultCode, 'Turma antiga com código igual', '2026-05-01');

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
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });

    assert.equal(plannedCohort.status, 201);

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);

    assert.equal(published.status, 200);
    assert.equal(published.body.created_cohorts, 1);

    const cohort = db.prepare('select code from cohort where planning_workspace_id = ?').get(workspaceId) as { code: string } | undefined;
    assert.ok(cohort);
    assert.equal(cohort.code, `${defaultCode}-2`);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish relinks legacy published cohort for the same client module', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-relink-legacy');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 1, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app)
      .post('/planning/workspaces')
      .send({
        name: 'Carteira Legada',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });

    assert.equal(created.status, 201);
    const workspaceId = created.body.workspace.id as string;
    const defaultCode = `PLAN-${workspaceId.slice(-5).toUpperCase()}-01`;

    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies,
        period, delivery_mode, planning_workspace_id, planning_cohort_id
      ) values (?, ?, ?, ?, ?, 'Planejada', 1, 'Meio_periodo', 'Online', ?, null)
    `).run('coh-legacy-plan', defaultCode, 'Turma criada antes do vínculo completo', '2026-05-01', 'tech-ana', workspaceId);
    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, 1, 'Previsto', null)
    `).run('all-legacy-plan', 'coh-legacy-plan', 'comp-delta', 'mod-install');

    const planningCohortId = 'plc-relink-plan';
    db.prepare(`
      insert into planning_cohort (
        id, workspace_id, company_id, module_id, technician_id, published_cohort_id, name, status,
        delivery_mode, period, notes, created_at, updated_at
      ) values (?, ?, ?, ?, ?, null, ?, 'Rascunho', 'Online', 'Meio_periodo', null, ?, ?)
    `).run(planningCohortId, workspaceId, 'comp-delta', 'mod-install', 'tech-ana', 'Delta · Instalação', '2026-05-10', '2026-05-10');
    db.prepare(`
      insert into planning_encounter (
        id, workspace_id, planning_cohort_id, company_id, module_id, technician_id,
        encounter_index, day_date, start_time, end_time, status, notes, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'Confirmado', null, ?, ?)
    `).run(
      'ple-relink-plan-1',
      workspaceId,
      planningCohortId,
      'comp-delta',
      'mod-install',
      'tech-ana',
      '2026-05-11',
      '10:00',
      '14:00',
      '2026-05-10',
      '2026-05-10'
    );

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);

    assert.equal(published.status, 200);
    assert.equal(published.body.created_cohorts, 0);
    assert.equal(published.body.updated_cohorts, 1);

    const cohorts = db.prepare('select id, code, name, planning_cohort_id from cohort where planning_workspace_id = ?').all(workspaceId) as Array<{
      id: string;
      code: string;
      name: string;
      planning_cohort_id: string | null;
    }>;
    assert.equal(cohorts.length, 1);
    assert.equal(cohorts[0].id, 'coh-legacy-plan');
    assert.equal(cohorts[0].code, defaultCode);
    assert.equal(cohorts[0].name, 'Delta · Instalação');
    assert.equal(cohorts[0].planning_cohort_id, planningCohortId);

    const planned = db.prepare('select published_cohort_id from planning_cohort where id = ?').get(planningCohortId) as {
      published_cohort_id: string | null;
    };
    assert.equal(planned.published_cohort_id, 'coh-legacy-plan');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('replanning updates a single published encounter and republishes cohort schedule', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-replan');
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
        name: 'Carteira Replanejamento',
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
    const encounterId = plannedCohort.body.encounters[1].id as string;

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(published.status, 200);

    const updated = await request(app)
      .patch(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`)
      .send({
        day_date: '2026-05-15',
        start_time: '11:00',
        end_time: '14:00',
        status: 'Confirmado'
      });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.workspace.status, 'Alteracao_pendente');

    const republished = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(republished.status, 200);
    assert.equal(republished.body.updated_cohorts, 1);

    const cohort = db.prepare('select id from cohort where planning_workspace_id = ?').get(workspaceId) as {
      id: string;
    } | undefined;
    assert.ok(cohort);

    const scheduleDays = db.prepare(`
      select * from cohort_schedule_day where cohort_id = ? order by day_index asc
    `).all(cohort.id) as Array<{
      day_date: string;
      start_time: string | null;
    }>;
    assert.equal(scheduleDays[1].day_date, '2026-05-15');
    assert.equal(scheduleDays[1].start_time, '11:00');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('replanning rejects unknown technician with controlled response', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-replan-invalid-technician');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 1, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const created = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Técnico Inválido',
      company_ids: ['comp-delta']
    });
    const workspaceId = created.body.workspace.id as string;

    const plannedCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });
    const encounterId = plannedCohort.body.encounters[0].id as string;

    const updated = await request(app)
      .patch(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`)
      .send({ technician_id: 'tech-inexistente' });

    assert.equal(updated.status, 404);
    assert.equal(updated.body.message, 'Técnico não encontrado.');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('replanning can cancel an encounter that currently has a conflict', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-replan-cancel-conflict');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare('insert into company (id, name, status, notes, priority) values (?, ?, ?, null, 0)')
      .run('comp-delta', 'Delta Ferramentaria', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      ) values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-install', 'MOD-01', 'Base', 'Instalação', 1, 1, 'ministrado', 'consome');
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');
    const created = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Cancelamento',
      company_ids: ['comp-delta']
    });
    const workspaceId = created.body.workspace.id as string;

    const plannedCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });
    const encounterId = plannedCohort.body.encounters[0].id as string;

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

    const updated = await request(app)
      .patch(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`)
      .send({ status: 'Cancelado' });

    assert.equal(updated.status, 200);
    assert.equal(updated.body.cohorts[0].encounters[0].status, 'Cancelado');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning API can cancel an entire planned cohort before publishing', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-cancel-planned-cohort');
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

    const created = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Excluir Módulo',
      company_ids: ['comp-delta']
    });
    const workspaceId = created.body.workspace.id as string;

    const plannedCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação errada',
        encounters: [
          { day_date: '2026-05-11', start_time: '10:00', end_time: '14:00', status: 'Confirmado' },
          { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });
    assert.equal(plannedCohort.status, 201);
    const cohortId = plannedCohort.body.cohort.id as string;

    const canceled = await request(app).delete(`/planning/workspaces/${workspaceId}/cohorts/${cohortId}`);

    assert.equal(canceled.status, 200);
    assert.equal(canceled.body.ok, true);
    const detail = await request(app).get(`/planning/workspaces/${workspaceId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.cohorts[0].status, 'Cancelado');
    assert.equal(detail.body.cohorts[0].encounters.every((encounter: { status: string }) => encounter.status === 'Cancelado'), true);

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(published.status, 200);
    assert.equal(published.body.created_cohorts, 0);
    const createdCohortCount = db.prepare('select count(*) as count from cohort where planning_workspace_id = ?')
      .get(workspaceId) as { count: number };
    assert.equal(createdCohortCount.count, 0);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('replanning technician change updates only one planning encounter before republish', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-replan-technician-cohort');
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
    db.prepare('insert into technician (id, name) values (?, ?), (?, ?)')
      .run('tech-ana', 'Ana Técnica', 'tech-bruno', 'Bruno Técnico');

    const created = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Técnico Cohort',
      company_ids: ['comp-delta']
    });
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
    const encounterId = plannedCohort.body.encounters[0].id as string;

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(published.status, 200);

    const updated = await request(app)
      .patch(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`)
      .send({ technician_id: 'tech-bruno' });
    assert.equal(updated.status, 200);

    const planningCohort = db.prepare('select technician_id from planning_cohort where workspace_id = ?').get(workspaceId) as {
      technician_id: string | null;
    };
    assert.equal(planningCohort.technician_id, null);

    const encounterTechnicians = db.prepare(`
      select technician_id
      from planning_encounter
      where planning_cohort_id = ?
      order by encounter_index asc
    `).all(plannedCohort.body.cohort.id) as Array<{ technician_id: string | null }>;
    assert.deepEqual(encounterTechnicians.map((encounter) => encounter.technician_id), ['tech-bruno', 'tech-ana']);

    const republished = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(republished.status, 200);

    const cohort = db.prepare('select technician_id from cohort where planning_workspace_id = ?').get(workspaceId) as {
      technician_id: string | null;
    };
    assert.equal(cohort.technician_id, 'tech-bruno');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('replanning technician change rejects same-cohort future overlap', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-replan-technician-overlap');
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
    db.prepare('insert into technician (id, name) values (?, ?), (?, ?)')
      .run('tech-ana', 'Ana Técnica', 'tech-bruno', 'Bruno Técnico');

    const created = await request(app).post('/planning/workspaces').send({
      name: 'Carteira Sobreposição',
      company_ids: ['comp-delta']
    });
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
    const encounterId = plannedCohort.body.encounters[0].id as string;

    const blockerCohort = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-bruno',
        name: 'Delta · Instalação Bruno',
        delivery_mode: 'Online',
        period: 'Meio_periodo',
        encounters: [
          { day_date: '2026-05-12', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });
    assert.equal(blockerCohort.status, 201);

    const updated = await request(app)
      .patch(`/planning/workspaces/${workspaceId}/encounters/${encounterId}`)
      .send({
        technician_id: 'tech-bruno',
        day_date: '2026-05-12',
        start_time: '11:00',
        end_time: '13:00'
      });

    assert.equal(updated.status, 409);
    assert.equal(updated.body.message, 'Encontro possui conflito.');

    const planningCohort = db.prepare('select technician_id from planning_cohort where workspace_id = ?').get(workspaceId) as {
      technician_id: string | null;
    };
    assert.equal(planningCohort.technician_id, 'tech-ana');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish preserves operational status on republish', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-republish-status');
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
        name: 'Carteira Republicação',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });
    const workspaceId = created.body.workspace.id as string;

    await request(app)
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

    const firstPublish = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(firstPublish.status, 200);

    const cohort = db.prepare('select id from cohort where planning_workspace_id = ?').get(workspaceId) as { id: string };
    db.prepare("update cohort set status = 'Aguardando_quorum' where id = ?").run(cohort.id);
    db.prepare("update cohort_allocation set status = 'Executado', executed_at = ? where cohort_id = ?")
      .run('2026-05-12T18:00:00.000Z', cohort.id);

    const secondPublish = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(secondPublish.status, 200);
    assert.equal(secondPublish.body.created_cohorts, 0);
    assert.equal(secondPublish.body.updated_cohorts, 1);

    const republishedCohort = db.prepare('select status from cohort where id = ?').get(cohort.id) as { status: string };
    assert.equal(republishedCohort.status, 'Aguardando_quorum');

    const allocation = db.prepare('select status, executed_at from cohort_allocation where cohort_id = ?').get(cohort.id) as {
      status: string;
      executed_at: string | null;
    };
    assert.equal(allocation.status, 'Executado');
    assert.equal(allocation.executed_at, '2026-05-12T18:00:00.000Z');

    db.prepare("update cohort_allocation set status = 'Cancelado', executed_at = ? where cohort_id = ?")
      .run('2026-05-12T18:00:00.000Z', cohort.id);

    const thirdPublish = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);
    assert.equal(thirdPublish.status, 200);

    const revivedAllocation = db.prepare('select status, executed_at from cohort_allocation where cohort_id = ?').get(cohort.id) as {
      status: string;
      executed_at: string | null;
    };
    assert.equal(revivedAllocation.status, 'Previsto');
    assert.equal(revivedAllocation.executed_at, null);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning publish ignores canceled cohort conflicts', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-publish-canceled-conflict');
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
        name: 'Carteira Cancelados',
        mode: 'Manual',
        horizon_days: 60,
        company_ids: ['comp-delta']
      });
    const workspaceId = created.body.workspace.id as string;

    const active = await request(app)
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
    assert.equal(active.status, 201);

    const canceled = await request(app)
      .post(`/planning/workspaces/${workspaceId}/cohorts`)
      .send({
        company_id: 'comp-delta',
        module_id: 'mod-install',
        technician_id: 'tech-ana',
        name: 'Delta · Instalação cancelada',
        delivery_mode: 'Online',
        period: 'Meio_periodo',
        encounters: [
          { day_date: '2026-05-13', start_time: '10:00', end_time: '14:00', status: 'Confirmado' }
        ]
      });
    assert.equal(canceled.status, 201);

    db.prepare("update planning_cohort set status = 'Cancelado' where id = ?").run(canceled.body.cohort.id);
    db.prepare("update planning_encounter set day_date = '2026-05-11' where planning_cohort_id = ?").run(canceled.body.cohort.id);

    const published = await request(app).post(`/planning/workspaces/${workspaceId}/publish`);

    assert.equal(published.status, 200);
    assert.equal(published.body.created_cohorts, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning suggestions return conflict-free technician windows', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-suggestions');
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

    const response = await request(app)
      .post('/planning/suggestions')
      .send({
        module_id: 'mod-install',
        technician_ids: ['tech-ana'],
        date_from: '2026-05-11',
        date_to: '2026-05-15',
        duration_minutes: 240
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.suggestions[0].technician_id, 'tech-ana');
    assert.equal(response.body.suggestions[0].day_date, '2026-05-11');
    assert.equal(response.body.suggestions[0].start_time, '08:00');
    assert.equal(response.body.suggestions[0].end_time, '12:00');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('planning suggestions skip weekends by default', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('planning-suggestions-weekdays');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare('insert into technician (id, name) values (?, ?)')
      .run('tech-ana', 'Ana Técnica');

    const response = await request(app)
      .post('/planning/suggestions')
      .send({
        module_id: 'mod-install',
        technician_ids: ['tech-ana'],
        date_from: '2026-05-09',
        date_to: '2026-05-12',
        duration_minutes: 240,
        max_results: 2
      });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.suggestions.map((suggestion: { day_date: string }) => suggestion.day_date),
      ['2026-05-11', '2026-05-12']
    );
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
