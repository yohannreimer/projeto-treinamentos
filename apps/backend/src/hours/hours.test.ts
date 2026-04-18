import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from '../app.js';
import { db, initDb, resetDbConnection } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';
import {
  appendAndProject,
  getHoursBalance,
  getHoursEventsByAggregate,
  getHoursLedger,
  getHoursPending
} from './service.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function readTableColumns(table: string) {
  return db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
}

function prepareHoursDb(testName: string) {
  const dbPath = assignTestDbPath(testName);
  cleanupDbFiles(dbPath);
  resetDbConnection();
  initDb();
  return dbPath;
}

test('initDb creates hour-bank schema base', () => {
  const dbPath = assignTestDbPath('hours-schema-base');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();

    const moduleColumns = readTableColumns('module_template').map((row) => row.name);
    assert.ok(moduleColumns.includes('delivery_mode'));
    assert.ok(moduleColumns.includes('client_hours_policy'));

    const activityColumns = readTableColumns('calendar_activity').map((row) => row.name);
    assert.ok(activityColumns.includes('linked_module_id'));
    assert.ok(activityColumns.includes('hours_scope'));
    assert.ok(activityColumns.includes('hours_consumed_snapshot'));

    const eventStore = db.prepare(`
      select name
      from sqlite_master
      where type = 'table'
        and name in (
          'hours_event_store',
          'hours_projection_balance',
          'hours_projection_ledger',
          'hours_projection_pending'
        )
      order by name asc
    `).all() as Array<{ name: string }>;
    assert.equal(eventStore.length, 4);

    const eventIndexes = db.prepare(`
      select name
      from sqlite_master
      where type = 'index'
        and tbl_name = 'hours_event_store'
        and name = 'idx_hours_event_store_idempotency_key'
    `).all() as Array<{ name: string }>;
    assert.equal(eventIndexes.length, 1);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('POST /companies/:id/hours/adjustments creates manual event and updates ledger', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-api-manual-adjustment');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-01', 'Cliente Horas API 01', 'Ativo', null, 0)
    `).run();

    const createRes = await request(app)
      .post('/companies/comp-hours-api-01/hours/adjustments')
      .send({
        delta_hours: 3.5,
        reason: 'Credito manual para ajuste comercial'
      });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.ok, true);
    assert.equal(createRes.body.inserted, true);

    const duplicateRes = await request(app)
      .post('/companies/comp-hours-api-01/hours/adjustments')
      .send({
        delta_hours: 3.5,
        reason: 'Credito manual para ajuste comercial'
      });
    assert.equal(duplicateRes.status, 201);
    assert.equal(duplicateRes.body.ok, true);
    assert.equal(duplicateRes.body.inserted, false);

    const ledgerRes = await request(app).get('/companies/comp-hours-api-01/hours/ledger');
    assert.equal(ledgerRes.status, 200);
    assert.equal(Array.isArray(ledgerRes.body.items), true);
    assert.equal(ledgerRes.body.items.length, 1);
    assert.equal(ledgerRes.body.items[0]?.event_type, 'hours_manual_adjustment_added');
    assert.equal(ledgerRes.body.items[0]?.delta_hours, 3.5);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /companies/:id/hours/pending/:pendingId/confirm resolves pending adjustment', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-api-confirm-pending');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-02', 'Cliente Horas API 02', 'Ativo', null, 0)
    `).run();

    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'comp-hours-api-02',
      company_id: 'comp-hours-api-02',
      event_type: 'hours_adjustment_suggested',
      payload: {
        delta_hours: 8,
        reason: 'Sugestao automatica de saldo.'
      },
      idempotency_key: 'hours-api-pending-01',
      actor_type: 'system'
    });

    const pendingRes = await request(app).get('/companies/comp-hours-api-02/hours/pending');
    assert.equal(pendingRes.status, 200);
    assert.equal(Array.isArray(pendingRes.body.items), true);
    assert.equal(pendingRes.body.items.length, 1);
    const pendingId = pendingRes.body.items[0]?.id as string;
    assert.equal(typeof pendingId, 'string');

    const confirmRes = await request(app)
      .post(`/companies/comp-hours-api-02/hours/pending/${pendingId}/confirm`)
      .send({ reason: 'Confirmado pela operacao.' });
    assert.equal(confirmRes.status, 200);
    assert.equal(confirmRes.body.ok, true);

    const confirmRetryRes = await request(app)
      .post(`/companies/comp-hours-api-02/hours/pending/${pendingId}/confirm`)
      .send({ reason: 'Confirmado pela operacao.' });
    assert.equal(confirmRetryRes.status, 200);
    assert.equal(confirmRetryRes.body.ok, true);
    assert.equal(confirmRetryRes.body.inserted, false);

    const pendingAfter = await request(app).get('/companies/comp-hours-api-02/hours/pending');
    assert.equal(pendingAfter.status, 200);
    assert.equal(pendingAfter.body.items[0]?.status, 'Confirmado');

    const summaryRes = await request(app).get('/companies/comp-hours-api-02/hours/summary');
    assert.equal(summaryRes.status, 200);
    assert.equal(typeof summaryRes.body.balance_hours, 'number');
    assert.equal(summaryRes.body.balance_hours, 8);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /companies/:id/hours/summary is read-only for projections', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-api-summary-read-only');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-03', 'Cliente Horas API 03', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-proj-01',
      'HRS-PROJ-01',
      'CAD',
      'Módulo projetado',
      null,
      3,
      null,
      1,
      'ministrado',
      'consome'
    );
    db.prepare(`
      insert into company_module_progress (company_id, module_id, status, notes, custom_duration_days)
      values (?, ?, ?, null, ?)
    `).run('comp-hours-api-03', 'mod-hours-proj-01', 'Nao_iniciado', 3);

    const before = db.prepare(`
      select count(*) as total
      from hours_event_store
      where company_id = 'comp-hours-api-03'
    `).get() as { total: number };

    const summaryRes = await request(app).get('/companies/comp-hours-api-03/hours/summary');
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.balance_hours, 0);
    assert.equal(summaryRes.body.projection.available_hours, 24);
    assert.equal(summaryRes.body.projection.consumed_hours, 0);
    assert.equal(summaryRes.body.projection.balance_hours, 24);
    assert.equal(summaryRes.body.projection.remaining_diarias, 3);

    const after = db.prepare(`
      select count(*) as total
      from hours_event_store
      where company_id = 'comp-hours-api-03'
    `).get() as { total: number };
    assert.equal(after.total, before.total);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /companies/:id/hours/modules returns module-level insights for internal follow-up', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-api-module-insights');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-09', 'Cliente Horas API 09', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-insights-01',
      'HRS-INS-01',
      'Implementacao',
      'Entregável Insights',
      null,
      2,
      null,
      1,
      'entregavel',
      'nao_consume'
    );
    db.prepare(`
      insert into company_module_progress (company_id, module_id, status, notes, custom_duration_days)
      values (?, ?, ?, null, ?)
    `).run('comp-hours-api-09', 'mod-hours-insights-01', 'Em_execucao', 2);

    appendAndProject({
      aggregate_type: 'deliverable_worklog',
      aggregate_id: 'activity-hours-insights-01',
      company_id: 'comp-hours-api-09',
      event_type: 'deliverable_worklog_logged',
      payload: {
        minutes_logged: 300,
        module_id: 'mod-hours-insights-01',
        activity_id: 'activity-hours-insights-01'
      },
      idempotency_key: 'hours-insights-worklog-01',
      actor_type: 'operator'
    });

    const res = await request(app).get('/companies/comp-hours-api-09/hours/modules');
    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.items), true);
    const row = (res.body.items as Array<Record<string, unknown>>).find((item) => item.module_id === 'mod-hours-insights-01');
    assert.ok(row);
    assert.equal(row?.delivery_mode, 'entregavel');
    assert.equal(row?.client_hours_policy, 'nao_consume');
    assert.equal(row?.planned_hours, 16);
    assert.equal(row?.internal_effort_hours, 5);
    assert.equal(row?.internal_variance_hours, -11);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /calendar/activities logs deliverable worklog for internal effort scope', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-calendar-worklog-create');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-04', 'Cliente Horas API 04', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-deliverable-01',
      'HRS-DL-01',
      'Implementacao',
      'Entregável de Horas',
      null,
      1,
      null,
      0,
      'entregavel',
      'nao_consume'
    );

    const createRes = await request(app)
      .post('/calendar/activities')
      .send({
        title: 'Execução entregável',
        activity_type: 'Implementacao',
        start_date: '2026-04-16',
        end_date: '2026-04-16',
        selected_dates: ['2026-04-16'],
        date_schedules: [
          {
            day_date: '2026-04-16',
            all_day: false,
            start_time: '08:00',
            end_time: '12:30'
          }
        ],
        all_day: false,
        start_time: '08:00',
        end_time: '12:30',
        company_id: 'comp-hours-api-04',
        linked_module_id: 'mod-hours-deliverable-01',
        hours_scope: 'internal_effort',
        status: 'Planejada',
        notes: 'Registro de horas internas'
      });

    assert.equal(createRes.status, 201);
    const ledgerRes = await request(app).get('/companies/comp-hours-api-04/hours/ledger');
    assert.equal(ledgerRes.status, 200);
    assert.equal(Array.isArray(ledgerRes.body.items), true);
    const worklogEntry = (ledgerRes.body.items as Array<{ event_type: string; payload_json: string }>).find(
      (item) => item.event_type === 'deliverable_worklog_logged'
    );
    assert.ok(worklogEntry);
    const payload = JSON.parse(worklogEntry?.payload_json ?? '{}') as { minutes_logged?: number; module_id?: string };
    assert.equal(payload.minutes_logged, 270);
    assert.equal(payload.module_id, 'mod-hours-deliverable-01');
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /calendar/activities rejects internal effort scope for non-deliverable module', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-calendar-worklog-validation');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-05', 'Cliente Horas API 05', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-training-01',
      'HRS-TR-01',
      'Treinamento',
      'Treinamento ministrado',
      null,
      2,
      null,
      1,
      'ministrado',
      'consome'
    );

    const createRes = await request(app)
      .post('/calendar/activities')
      .send({
        title: 'Tentativa inválida',
        activity_type: 'Implementacao',
        start_date: '2026-04-17',
        end_date: '2026-04-17',
        selected_dates: ['2026-04-17'],
        date_schedules: [
          {
            day_date: '2026-04-17',
            all_day: false,
            start_time: '13:30',
            end_time: '17:00'
          }
        ],
        company_id: 'comp-hours-api-05',
        linked_module_id: 'mod-hours-training-01',
        hours_scope: 'internal_effort',
        status: 'Planejada'
      });

    assert.equal(createRes.status, 400);
    assert.equal(typeof createRes.body.message, 'string');
    assert.match(createRes.body.message, /entregável/i);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('calendar client_consumption keeps hours snapshot in sync on create, patch and delete', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-calendar-client-consumption-sync');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-06', 'Cliente Horas API 06', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-training-02',
      'HRS-TR-02',
      'Treinamento',
      'Treinamento com consumo',
      null,
      2,
      null,
      1,
      'ministrado',
      'consome'
    );

    await request(app)
      .post('/companies/comp-hours-api-06/hours/adjustments')
      .send({
        delta_hours: 16,
        reason: 'Crédito inicial para testes de consumo.'
      })
      .expect(201);

    const createRes = await request(app)
      .post('/calendar/activities')
      .send({
        title: 'Consumo cliente',
        activity_type: 'Suporte',
        start_date: '2026-04-20',
        end_date: '2026-04-20',
        selected_dates: ['2026-04-20'],
        date_schedules: [
          {
            day_date: '2026-04-20',
            all_day: false,
            start_time: '08:00',
            end_time: '12:00'
          }
        ],
        company_id: 'comp-hours-api-06',
        linked_module_id: 'mod-hours-training-02',
        hours_scope: 'client_consumption',
        status: 'Planejada'
      });
    assert.equal(createRes.status, 201);
    const activityId = createRes.body.id as string;
    assert.equal(typeof activityId, 'string');

    const summaryAfterCreate = await request(app).get('/companies/comp-hours-api-06/hours/summary');
    assert.equal(summaryAfterCreate.status, 200);
    assert.equal(summaryAfterCreate.body.available_hours, 16);
    assert.equal(summaryAfterCreate.body.consumed_hours, 4);
    assert.equal(summaryAfterCreate.body.balance_hours, 12);

    const patchRes = await request(app)
      .patch(`/calendar/activities/${activityId}`)
      .send({
        date_schedules: [
          {
            day_date: '2026-04-20',
            all_day: false,
            start_time: '08:00',
            end_time: '10:00'
          }
        ],
        all_day: false,
        start_time: '08:00',
        end_time: '10:00'
      });
    assert.equal(patchRes.status, 200);

    const summaryAfterPatch = await request(app).get('/companies/comp-hours-api-06/hours/summary');
    assert.equal(summaryAfterPatch.status, 200);
    assert.equal(summaryAfterPatch.body.available_hours, 16);
    assert.equal(summaryAfterPatch.body.consumed_hours, 2);
    assert.equal(summaryAfterPatch.body.balance_hours, 14);

    const deleteRes = await request(app).delete(`/calendar/activities/${activityId}`);
    assert.equal(deleteRes.status, 200);

    const summaryAfterDelete = await request(app).get('/companies/comp-hours-api-06/hours/summary');
    assert.equal(summaryAfterDelete.status, 200);
    assert.equal(summaryAfterDelete.body.available_hours, 16);
    assert.equal(summaryAfterDelete.body.consumed_hours, 0);
    assert.equal(summaryAfterDelete.body.balance_hours, 16);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('allocation status Confirmado/Executado debits once and estorna when leaves confirmed flow', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-allocation-status-debit');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-10', 'Cliente Horas API 10', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into technician (id, name)
      values ('tech-hours-10', 'Tecnico Horas 10')
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-training-03',
      'HRS-TR-03',
      'Treinamento',
      'Treinamento meio período',
      null,
      3,
      null,
      1,
      'ministrado',
      'consome'
    );
    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies, notes, period, start_time, end_time, delivery_mode
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'coh-hours-10',
      'TUR-HRS-10',
      'Turma horas 10',
      '2026-04-14',
      'tech-hours-10',
      'Planejada',
      2,
      null,
      'Meio_periodo',
      '13:30',
      '17:00',
      'Online'
    );
    db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, ?, ?, ?)
    `).run('cmb-hours-10', 'coh-hours-10', 'mod-hours-training-03', 1, 1, 3);
    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run('all-hours-10', 'coh-hours-10', 'comp-hours-api-10', 'mod-hours-training-03', 1, 'Previsto', null);

    await request(app)
      .post('/companies/comp-hours-api-10/hours/adjustments')
      .send({
        delta_hours: 24,
        reason: 'Crédito inicial para teste da alocação executada.'
      })
      .expect(201);

    const confirmRes = await request(app)
      .patch('/allocations/all-hours-10/status')
      .send({
        status: 'Confirmado',
        override_installation_prereq: true,
        override_reason: 'Teste automatizado'
      });
    assert.equal(confirmRes.status, 200);

    const summaryAfterConfirm = await request(app).get('/companies/comp-hours-api-10/hours/summary');
    assert.equal(summaryAfterConfirm.status, 200);
    assert.equal(summaryAfterConfirm.body.available_hours, 24);
    assert.equal(summaryAfterConfirm.body.consumed_hours, 10.5);
    assert.equal(summaryAfterConfirm.body.balance_hours, 13.5);

    await request(app)
      .patch('/allocations/all-hours-10/status')
      .send({
        status: 'Executado',
        override_installation_prereq: true,
        override_reason: 'Teste automatizado'
      })
      .expect(200);

    const summaryAfterExecute = await request(app).get('/companies/comp-hours-api-10/hours/summary');
    assert.equal(summaryAfterExecute.body.consumed_hours, 10.5);
    assert.equal(summaryAfterExecute.body.balance_hours, 13.5);

    const ledgerAfterExecute = await request(app).get('/companies/comp-hours-api-10/hours/ledger');
    assert.equal(ledgerAfterExecute.status, 200);
    const trainingEntries = (ledgerAfterExecute.body.items as Array<{ event_type: string; payload_json: string }>).filter(
      (item) => item.event_type === 'training_encounter_completed'
    );
    assert.equal(trainingEntries.length, 1);
    const trainingPayload = JSON.parse(trainingEntries[0]?.payload_json ?? '{}') as { hours_consumed?: number };
    assert.equal(trainingPayload.hours_consumed, 10.5);

    await request(app)
      .patch('/allocations/all-hours-10/status')
      .send({
        status: 'Cancelado',
        override_installation_prereq: true,
        override_reason: 'Teste automatizado'
      })
      .expect(200);
    const summaryAfterCancel = await request(app).get('/companies/comp-hours-api-10/hours/summary');
    assert.equal(summaryAfterCancel.body.consumed_hours, 0);
    assert.equal(summaryAfterCancel.body.balance_hours, 24);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('hours summary backfills confirmed allocations into ledger even without status transition', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-allocation-backfill-confirmed');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-11', 'Cliente Horas API 11', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into technician (id, name)
      values ('tech-hours-11', 'Tecnico Horas 11')
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-training-04',
      'HRS-TR-04',
      'Treinamento',
      'Treinamento confirmado legado',
      null,
      2,
      null,
      1,
      'ministrado',
      'consome'
    );
    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies, notes, period, start_time, end_time, delivery_mode
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'coh-hours-11',
      'TUR-HRS-11',
      'Turma horas 11',
      '2026-04-14',
      'tech-hours-11',
      'Confirmada',
      2,
      null,
      'Integral',
      null,
      null,
      'Online'
    );
    db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, ?, ?, ?)
    `).run('cmb-hours-11', 'coh-hours-11', 'mod-hours-training-04', 1, 1, 2);
    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run('all-hours-11', 'coh-hours-11', 'comp-hours-api-11', 'mod-hours-training-04', 1, 'Confirmado', null);

    await request(app)
      .post('/companies/comp-hours-api-11/hours/adjustments')
      .send({
        delta_hours: 16,
        reason: 'Crédito inicial para backfill de confirmado.'
      })
      .expect(201);

    const summaryRes = await request(app).get('/companies/comp-hours-api-11/hours/summary');
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.available_hours, 16);
    assert.equal(summaryRes.body.consumed_hours, 16);
    assert.equal(summaryRes.body.balance_hours, 0);

    const modulesRes = await request(app).get('/companies/comp-hours-api-11/hours/modules');
    assert.equal(modulesRes.status, 200);
    const trainingModule = (modulesRes.body.items as Array<{ code: string; actual_client_consumed_hours: number }>)
      .find((item) => item.code === 'HRS-TR-04');
    assert.ok(trainingModule);
    assert.equal(trainingModule?.actual_client_consumed_hours, 16);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('hours summary estorna consumo confirmado quando turma/alocação é excluída', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('hours-allocation-delete-backfill-reversal');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-12', 'Cliente Horas API 12', 'Ativo', null, 0)
    `).run();
    db.prepare(`
      insert into technician (id, name)
      values ('tech-hours-12', 'Tecnico Horas 12')
    `).run();
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'mod-hours-training-05',
      'HRS-TR-05',
      'Treinamento',
      'Treinamento reversão por exclusão',
      null,
      2,
      null,
      1,
      'ministrado',
      'consome'
    );
    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies, notes, period, start_time, end_time, delivery_mode
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'coh-hours-12',
      'TUR-HRS-12',
      'Turma horas 12',
      '2026-04-14',
      'tech-hours-12',
      'Concluida',
      2,
      null,
      'Integral',
      null,
      null,
      'Online'
    );
    db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, ?, ?, ?)
    `).run('cmb-hours-12', 'coh-hours-12', 'mod-hours-training-05', 1, 1, 2);
    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes)
      values (?, ?, ?, ?, ?, ?, ?)
    `).run('all-hours-12', 'coh-hours-12', 'comp-hours-api-12', 'mod-hours-training-05', 1, 'Executado', null);

    await request(app)
      .post('/companies/comp-hours-api-12/hours/adjustments')
      .send({
        delta_hours: 16,
        reason: 'Crédito inicial para teste de exclusão de turma.'
      })
      .expect(201);

    const summaryBeforeDelete = await request(app).get('/companies/comp-hours-api-12/hours/summary');
    assert.equal(summaryBeforeDelete.status, 200);
    assert.equal(summaryBeforeDelete.body.consumed_hours, 16);
    assert.equal(summaryBeforeDelete.body.balance_hours, 0);

    db.prepare('delete from cohort where id = ?').run('coh-hours-12');

    const summaryAfterDelete = await request(app).get('/companies/comp-hours-api-12/hours/summary');
    assert.equal(summaryAfterDelete.status, 200);
    assert.equal(summaryAfterDelete.body.consumed_hours, 0);
    assert.equal(summaryAfterDelete.body.balance_hours, 16);

    const modulesAfterDelete = await request(app).get('/companies/comp-hours-api-12/hours/modules');
    assert.equal(modulesAfterDelete.status, 200);
    const deletedModule = (modulesAfterDelete.body.items as Array<{ code: string; actual_client_consumed_hours: number }>)
      .find((item) => item.code === 'HRS-TR-05');
    assert.ok(deletedModule);
    assert.equal(deletedModule?.actual_client_consumed_hours, 0);

    const ledgerAfterDelete = await request(app).get('/companies/comp-hours-api-12/hours/ledger');
    assert.equal(ledgerAfterDelete.status, 200);
    const reversalEntries = (ledgerAfterDelete.body.items as Array<{ event_type: string; payload_json: string }>)
      .filter((item) => {
        if (item.event_type !== 'hours_manual_adjustment_added') return false;
        const payload = JSON.parse(item.payload_json) as { reason?: string };
        return (payload.reason ?? '').includes('alocação removida');
      });
    assert.equal(reversalEntries.length, 1);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('hours_adjustment_suggested creates pending row without altering balance', () => {
  const dbPath = prepareHoursDb('hours-suggested-pending');

  try {
    const result = appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'comp-hours-01',
      company_id: 'comp-hours-01',
      event_type: 'hours_adjustment_suggested',
      payload: {
        delta_hours: 8,
        reason: 'Credito sugerido por reducao de escopo.'
      },
      idempotency_key: 'hours-suggested-01',
      actor_type: 'system'
    });

    assert.equal(result.inserted, true);

    const balance = getHoursBalance('comp-hours-01');
    assert.equal(balance, null);

    const pending = getHoursPending('comp-hours-01');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.delta_hours, 8);
    assert.equal(pending[0]?.status, 'Pendente');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('hours_adjustment_confirmed updates balance and ledger', () => {
  const dbPath = prepareHoursDb('hours-confirmed-balance');

  try {
    const suggested = appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'comp-hours-02',
      company_id: 'comp-hours-02',
      event_type: 'hours_adjustment_suggested',
      payload: {
        delta_hours: 16,
        reason: 'Credito sugerido.',
        source_event_id: null
      },
      idempotency_key: 'hours-suggested-02',
      actor_type: 'system'
    });

    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'comp-hours-02',
      company_id: 'comp-hours-02',
      event_type: 'hours_adjustment_confirmed',
      payload: {
        delta_hours: 16,
        reason: 'Credito confirmado.',
        source_event_id: suggested.event.id
      },
      idempotency_key: 'hours-confirmed-02',
      actor_type: 'operator'
    });

    const balance = getHoursBalance('comp-hours-02');
    assert.ok(balance);
    assert.equal(balance.available_hours, 16);
    assert.equal(balance.consumed_hours, 0);
    assert.equal(balance.balance_hours, 16);
    assert.equal(balance.remaining_diarias, 2);

    const pending = getHoursPending('comp-hours-02');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.status, 'Confirmado');

    const ledger = getHoursLedger('comp-hours-02');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.event_type, 'hours_adjustment_confirmed');
    assert.equal(ledger[0]?.delta_hours, 16);
    assert.equal(ledger[0]?.balance_after, 16);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('hours_manual_adjustment_added updates balance and creates ledger row', () => {
  const dbPath = prepareHoursDb('hours-manual-adjustment');

  try {
    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'comp-hours-03',
      company_id: 'comp-hours-03',
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: 4,
        reason: 'Credito manual.'
      },
      idempotency_key: 'hours-manual-03',
      actor_type: 'operator'
    });

    const balance = getHoursBalance('comp-hours-03');
    assert.ok(balance);
    assert.equal(balance.available_hours, 4);
    assert.equal(balance.balance_hours, 4);
    assert.equal(balance.remaining_diarias, 0.5);

    const ledger = getHoursLedger('comp-hours-03');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.event_type, 'hours_manual_adjustment_added');
    assert.equal(ledger[0]?.delta_hours, 4);
    assert.equal(ledger[0]?.balance_after, 4);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('store supports event query by aggregate', () => {
  const dbPath = prepareHoursDb('hours-query-aggregate');

  try {
    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-01',
      company_id: 'comp-hours-04',
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: 2,
        reason: 'Credito para teste aggregate.'
      },
      idempotency_key: 'hours-aggregate-01',
      actor_type: 'operator'
    });

    const byAggregate = getHoursEventsByAggregate('company_hours_account', 'agg-hours-01');
    assert.equal(byAggregate.length, 1);
    assert.equal(byAggregate[0]?.event_type, 'hours_manual_adjustment_added');
    assert.equal(byAggregate[0]?.company_id, 'comp-hours-04');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('idempotent append does not duplicate balance or ledger', () => {
  const dbPath = prepareHoursDb('hours-idempotent-append');

  try {
    const first = appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-02',
      company_id: 'comp-hours-05',
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: 8,
        reason: 'Credito inicial.'
      },
      idempotency_key: 'hours-idempotent-01',
      actor_type: 'operator'
    });
    const second = appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-02',
      company_id: 'comp-hours-05',
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: 8,
        reason: 'Credito inicial duplicado.'
      },
      idempotency_key: 'hours-idempotent-01',
      actor_type: 'operator'
    });

    assert.equal(first.inserted, true);
    assert.equal(second.inserted, false);

    const balance = getHoursBalance('comp-hours-05');
    assert.ok(balance);
    assert.equal(balance.balance_hours, 8);

    const ledger = getHoursLedger('comp-hours-05');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.delta_hours, 8);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('hours_adjustment_rejected marks pending as rejected without changing balance', () => {
  const dbPath = prepareHoursDb('hours-rejected-flow');

  try {
    const suggested = appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-03',
      company_id: 'comp-hours-06',
      event_type: 'hours_adjustment_suggested',
      payload: {
        delta_hours: 6,
        reason: 'Sugestao para rejeicao.'
      },
      idempotency_key: 'hours-suggested-reject-01',
      actor_type: 'system'
    });

    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-03',
      company_id: 'comp-hours-06',
      event_type: 'hours_adjustment_rejected',
      payload: {
        delta_hours: 0,
        reason: 'Rejeitado manualmente.',
        source_event_id: suggested.event.id
      },
      idempotency_key: 'hours-rejected-01',
      actor_type: 'operator'
    });

    const pending = getHoursPending('comp-hours-06');
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.status, 'Rejeitado');

    const balance = getHoursBalance('comp-hours-06');
    assert.equal(balance, null);

    const ledger = getHoursLedger('comp-hours-06');
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.event_type, 'hours_adjustment_rejected');
    assert.equal(ledger[0]?.delta_hours, 0);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('training encounter consumes hours and updates consumed/balance fields', () => {
  const dbPath = prepareHoursDb('hours-training-encounter');

  try {
    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-04',
      company_id: 'comp-hours-07',
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: 8,
        reason: 'Credito inicial.'
      },
      idempotency_key: 'hours-training-credit-01',
      actor_type: 'operator'
    });

    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-04',
      company_id: 'comp-hours-07',
      event_type: 'training_encounter_completed',
      payload: {
        hours_consumed: 4,
        module_id: 'mod-020102020',
        encounter_id: 'enc-01'
      },
      idempotency_key: 'hours-training-consume-01',
      actor_type: 'operator'
    });

    const balance = getHoursBalance('comp-hours-07');
    assert.ok(balance);
    assert.equal(balance.available_hours, 8);
    assert.equal(balance.consumed_hours, 4);
    assert.equal(balance.balance_hours, 4);
    assert.equal(balance.remaining_diarias, 0.5);

    const ledger = getHoursLedger('comp-hours-07');
    assert.equal(ledger.length, 2);
    const trainingEntry = ledger.find((entry) => entry.event_type === 'training_encounter_completed');
    assert.ok(trainingEntry);
    assert.equal(trainingEntry.delta_hours, -4);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('deliverable worklog logs ledger entry without consuming client balance', () => {
  const dbPath = prepareHoursDb('hours-deliverable-worklog');

  try {
    appendAndProject({
      aggregate_type: 'company_hours_account',
      aggregate_id: 'agg-hours-05',
      company_id: 'comp-hours-08',
      event_type: 'hours_manual_adjustment_added',
      payload: {
        delta_hours: 8,
        reason: 'Credito inicial.'
      },
      idempotency_key: 'hours-deliverable-credit-01',
      actor_type: 'operator'
    });

    appendAndProject({
      aggregate_type: 'deliverable_worklog',
      aggregate_id: 'worklog-01',
      company_id: 'comp-hours-08',
      event_type: 'deliverable_worklog_logged',
      payload: {
        minutes_logged: 90,
        module_id: 'mod-020102080',
        activity_id: 'cal-activity-01'
      },
      idempotency_key: 'hours-deliverable-01',
      actor_type: 'operator'
    });

    const balance = getHoursBalance('comp-hours-08');
    assert.ok(balance);
    assert.equal(balance.balance_hours, 8);
    assert.equal(balance.consumed_hours, 0);

    const ledger = getHoursLedger('comp-hours-08');
    assert.equal(ledger.length, 2);
    const deliverableEntry = ledger.find((entry) => entry.event_type === 'deliverable_worklog_logged');
    assert.ok(deliverableEntry);
    assert.equal(deliverableEntry.delta_hours, 0);
    assert.equal(deliverableEntry.balance_after, 8);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
