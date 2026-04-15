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
    const app = createApp({ forceDbRefresh: true });
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
    const app = createApp({ forceDbRefresh: true });
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
    const app = createApp({ forceDbRefresh: true });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values ('comp-hours-api-03', 'Cliente Horas API 03', 'Ativo', null, 0)
    `).run();

    const before = db.prepare(`
      select count(*) as total
      from hours_event_store
      where company_id = 'comp-hours-api-03'
    `).get() as { total: number };

    const summaryRes = await request(app).get('/companies/comp-hours-api-03/hours/summary');
    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.balance_hours, 0);

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
