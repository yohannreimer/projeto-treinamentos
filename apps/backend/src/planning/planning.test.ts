import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';
import { validatePlanningEncounterPayload, findPlanningEncounterConflicts } from './service.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
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
