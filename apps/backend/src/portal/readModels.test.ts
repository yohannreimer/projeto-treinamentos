import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { appendAndProject } from '../hours/service.js';
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
  const todayIso = nowIso.slice(0, 10);
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
  `).run(
    'cal-comp-readmodels-a',
    'Kickoff Planejamento',
    'Implementacao',
    shiftIsoDate(todayIso, 1),
    shiftIsoDate(todayIso, 1),
    'comp-readmodels',
    'Planejada',
    null,
    nowIso,
    nowIso
  );

  db.prepare(`
    insert into calendar_activity (
      id, title, activity_type, start_date, end_date, all_day, company_id, status, notes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    'cal-comp-readmodels-b',
    'Revisão Técnica',
    'Suporte',
    shiftIsoDate(todayIso, 3),
    shiftIsoDate(todayIso, 3),
    'comp-readmodels',
    'Planejada',
    null,
    nowIso,
    nowIso
  );

  db.prepare(`
    insert into calendar_activity (
      id, title, activity_type, start_date, end_date, all_day, company_id, status, notes, created_at, updated_at
    ) values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(
    'cal-comp-02',
    'Atividade Outro Tenant',
    'Suporte',
    shiftIsoDate(todayIso, 2),
    shiftIsoDate(todayIso, 2),
    'comp-02',
    'Planejada',
    null,
    nowIso,
    nowIso
  );

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
    assert.equal(typeof res.body.hours_summary?.available_hours, 'number');
    assert.equal(typeof res.body.hours_summary?.consumed_hours, 'number');
    assert.equal(typeof res.body.hours_summary?.balance_hours, 'number');
    assert.equal(typeof res.body.hours_summary?.remaining_diarias, 'number');
    const expectedRemainingDiarias = Math.round((res.body.hours_summary.balance_hours / 8) * 100) / 100;
    assert.equal(res.body.hours_summary.remaining_diarias, expectedRemainingDiarias);
    assert.equal(res.body.hours_summary.available_hours >= 0, true);
    assert.equal(res.body.hours_summary.consumed_hours >= 0, true);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /portal/api/files returns only published internal documents for the authenticated company', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-files');

  try {
    const nowIso = new Date().toISOString();
    db.prepare(`
      insert into internal_document (
        id, title, category, notes, folder_path, file_name, mime_type, file_data_base64,
        file_size_bytes, portal_visible, portal_published_at, created_at, updated_at
      )
      values
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, ?, ?)
    `).run(
      'doc-portal-visible',
      'Digital Twin Linha A',
      'Digital Twin',
      'Modelo liberado',
      '/Clientes/comp-readmodels/modulos/mod-01',
      'digital-twin.step',
      'text/plain',
      `data:text/plain;base64,${Buffer.from('arquivo do cliente').toString('base64')}`,
      17,
      nowIso,
      nowIso,
      nowIso,
      'doc-other-company',
      'Arquivo de outro cliente',
      'Digital Twin',
      null,
      '/Clientes/comp-other/modulos/mod-01',
      'outro.step',
      'text/plain',
      `data:text/plain;base64,${Buffer.from('outro cliente').toString('base64')}`,
      13,
      nowIso,
      nowIso,
      nowIso,
      'doc-hidden',
      'Arquivo oculto',
      'Digital Twin',
      null,
      '/Clientes/comp-readmodels/modulos/mod-01',
      'oculto.step',
      'text/plain',
      `data:text/plain;base64,${Buffer.from('oculto').toString('base64')}`,
      6,
      nowIso,
      nowIso
    );

    const token = await loginPortal(app);
    const listRes = await request(app)
      .get('/portal/api/files')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listRes.status, 200);
    assert.deepEqual(listRes.body.items.map((item: { id: string }) => item.id), ['doc-portal-visible']);
    assert.equal(listRes.body.items[0].download_url, '/portal/api/files/doc-portal-visible/download');

    const downloadRes = await request(app)
      .get('/portal/api/files/doc-portal-visible/download')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(downloadRes.text, 'arquivo do cliente');
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('portal planning applies admin curation (hidden modules + date override)', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-admin-curation');

  try {
    db.prepare(`
      update portal_client
      set hidden_module_ids_json = ?, module_date_overrides_json = ?
      where id = ?
    `).run(
      JSON.stringify(['mod-03']),
      JSON.stringify({ 'mod-01': '2026-03-18', 'mod-02': '2026-06-20' }),
      'portal-client-readmodels'
    );

    const token = await loginPortal(app);
    const planningRes = await request(app)
      .get('/portal/api/planning')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(planningRes.status, 200);
    const moduleIds = planningRes.body.items.map((item: { module_id: string }) => item.module_id);
    assert.equal(moduleIds.includes('mod-03'), false);
    const overridden = planningRes.body.items.find((item: { module_id: string }) => item.module_id === 'mod-02') as
      | { module_id: string; next_dates?: string[] }
      | undefined;
    assert.ok(overridden);
    assert.deepEqual(overridden.next_dates, ['2026-06-20']);
    const completedOverride = planningRes.body.items.find((item: { module_id: string }) => item.module_id === 'mod-01') as
      | { module_id: string; completed_at?: string }
      | undefined;
    assert.ok(completedOverride);
    assert.equal(completedOverride.completed_at, '2026-03-18');
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('portal planning hours summary uses only real training consumption', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-training-hours-summary');

  try {
    db.prepare(`delete from company_module_progress where company_id = ?`).run('comp-readmodels');

    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, null, 1, ?, ?)
    `).run(
      'mod-portal-training-summary',
      'PTR-001',
      'Treinamento',
      'Treinamento Portal Resumo',
      null,
      2,
      'ministrado',
      'consome'
    );
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, null, 1, ?, ?)
    `).run(
      'mod-portal-deliverable-summary',
      'PDL-001',
      'Entregavel',
      'Entregavel Interno Portal',
      null,
      3,
      'entregavel',
      'nao_consume'
    );

    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Concluido', ?)
    `).run(
      'prog-portal-training-summary',
      'comp-readmodels',
      'mod-portal-training-summary',
      '2026-05-01'
    );
    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Concluido', ?)
    `).run(
      'prog-portal-deliverable-summary',
      'comp-readmodels',
      'mod-portal-deliverable-summary',
      '2026-05-02'
    );

    appendAndProject({
      aggregate_type: 'module_scope',
      aggregate_id: 'alloc-portal-training-summary',
      company_id: 'comp-readmodels',
      event_type: 'training_encounter_completed',
      payload: {
        module_id: 'mod-portal-training-summary',
        hours_consumed: 8,
        reason: 'Encontro realizado para validação do resumo do portal.'
      },
      idempotency_key: 'portal-training-summary-training-8h',
      actor_type: 'system'
    });
    appendAndProject({
      aggregate_type: 'deliverable_worklog',
      aggregate_id: 'worklog-portal-deliverable-summary',
      company_id: 'comp-readmodels',
      event_type: 'deliverable_worklog_logged',
      payload: {
        module_id: 'mod-portal-deliverable-summary',
        minutes_logged: 1440,
        reason: 'Horas internas de entregavel não devem entrar no portal.'
      },
      idempotency_key: 'portal-training-summary-deliverable-24h',
      actor_type: 'operator'
    });

    const token = await loginPortal(app);
    const planningRes = await request(app)
      .get('/portal/api/planning')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(planningRes.status, 200);
    assert.equal(planningRes.body.items.length, 2);
    assert.deepEqual(planningRes.body.hours_summary, {
      available_hours: 16,
      consumed_hours: 8,
      balance_hours: 8,
      remaining_diarias: 1
    });

    const overviewRes = await request(app)
      .get('/portal/api/overview')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(overviewRes.status, 200);
    assert.deepEqual(overviewRes.body.hours_summary, planningRes.body.hours_summary);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('portal planning applies client delivery mode override to hours summary', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-delivery-mode-override');

  try {
    db.prepare(`delete from company_module_progress where company_id = ?`).run('comp-readmodels');

    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, null, 1, ?, ?)
    `).run(
      'mod-portal-override-training',
      'PTO-001',
      'Treinamento',
      'Treinamento Mantido',
      null,
      2,
      'ministrado',
      'consome'
    );
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, ?, ?, null, 1, ?, ?)
    `).run(
      'mod-portal-override-deliverable',
      'PTO-002',
      'Entregavel',
      'Entregável feito como treinamento',
      null,
      3,
      'entregavel',
      'nao_consume'
    );

    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Concluido', ?)
    `).run('prog-portal-override-training', 'comp-readmodels', 'mod-portal-override-training', '2026-05-01');
    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Planejado', null)
    `).run('prog-portal-override-deliverable', 'comp-readmodels', 'mod-portal-override-deliverable');
    db.prepare(`
      update portal_client
      set module_delivery_mode_overrides_json = ?
      where id = ?
    `).run(
      JSON.stringify({ 'mod-portal-override-deliverable': 'ministrado' }),
      'portal-client-readmodels'
    );

    appendAndProject({
      aggregate_type: 'module_scope',
      aggregate_id: 'alloc-portal-override-training',
      company_id: 'comp-readmodels',
      event_type: 'training_encounter_completed',
      payload: {
        module_id: 'mod-portal-override-training',
        hours_consumed: 8,
        reason: 'Encontro realizado para validação do resumo com sobrescrita.'
      },
      idempotency_key: 'portal-override-training-8h',
      actor_type: 'system'
    });

    const token = await loginPortal(app);
    const planningRes = await request(app)
      .get('/portal/api/planning')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(planningRes.status, 200);
    const overridden = planningRes.body.items.find((item: { module_id: string }) => (
      item.module_id === 'mod-portal-override-deliverable'
    )) as { delivery_mode: string; client_hours_policy: string } | undefined;
    assert.ok(overridden);
    assert.equal(overridden.delivery_mode, 'ministrado');
    assert.equal(overridden.client_hours_policy, 'consome');
    assert.deepEqual(planningRes.body.hours_summary, {
      available_hours: 40,
      consumed_hours: 8,
      balance_hours: 32,
      remaining_diarias: 4
    });
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
    assert.equal(typeof res.body.hours_summary?.available_hours, 'number');
    assert.equal(typeof res.body.hours_summary?.consumed_hours, 'number');
    assert.equal(typeof res.body.hours_summary?.balance_hours, 'number');
    assert.equal(typeof res.body.hours_summary?.remaining_diarias, 'number');
    assert.equal(res.body.agenda.total, 2);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('portal overview reconciliation is deterministic and does not duplicate suggested events', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-hours-reconcile-deterministic');

  try {
    const token = await loginPortal(app);
    const firstRes = await request(app)
      .get('/portal/api/overview')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(firstRes.status, 200);

    const eventCountAfterFirst = db.prepare(`
      select count(*) as total
      from hours_event_store
      where company_id = ?
        and event_type = 'hours_adjustment_suggested'
    `).get('comp-readmodels') as { total: number };
    const pendingCountAfterFirst = db.prepare(`
      select count(*) as total
      from hours_projection_pending
      where company_id = ?
    `).get('comp-readmodels') as { total: number };

    const secondRes = await request(app)
      .get('/portal/api/overview')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(secondRes.status, 200);
    const planningRes = await request(app)
      .get('/portal/api/planning')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(planningRes.status, 200);

    const eventCountAfterSecond = db.prepare(`
      select count(*) as total
      from hours_event_store
      where company_id = ?
        and event_type = 'hours_adjustment_suggested'
    `).get('comp-readmodels') as { total: number };
    const pendingCountAfterSecond = db.prepare(`
      select count(*) as total
      from hours_projection_pending
      where company_id = ?
    `).get('comp-readmodels') as { total: number };

    assert.equal(eventCountAfterSecond.total, eventCountAfterFirst.total);
    assert.equal(pendingCountAfterSecond.total, pendingCountAfterFirst.total);
    assert.equal(firstRes.body.hours_summary.balance_hours, secondRes.body.hours_summary.balance_hours);
    assert.deepEqual(planningRes.body.hours_summary, secondRes.body.hours_summary);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('portal planning and agenda derive encounter progress for meio período', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-readmodels-journey-progress');

  try {
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
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
    assert.equal(planningItem.completed_encounters >= 2, true);
    assert.equal(planningItem.remaining_encounters <= 4, true);
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

test('portal certificate evaluations are collected per cohort participant', async () => {
  const { app, dbPath } = await createPortalReadModelsFixture('portal-certificate-participant-evaluations');

  try {
    const nowIso = new Date().toISOString();
    const moduleId = 'mod-certificate-participants';
    const cohortId = 'coh-certificate-participants';

    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode
      ) values (?, ?, ?, ?, null, ?, null, 1, 'ministrado')
    `).run(moduleId, 'CERT-001', 'Treinamento', 'Treinamento Certificado', 1);

    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, 'Concluido', ?)
    `).run('prog-certificate-participants', 'comp-readmodels', moduleId, '2026-05-12');

    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies, period, start_time, end_time, delivery_mode, notes
      ) values (?, ?, ?, ?, null, 'Concluida', 8, 'Integral', null, null, 'Online', null)
    `).run(cohortId, 'TUR-CERT-001', 'Turma Certificado', '2026-05-12');

    db.prepare(`
      insert into cohort_module_block (id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days)
      values (?, ?, ?, 1, 1, 1)
    `).run('cmb-certificate-participants', cohortId, moduleId);

    db.prepare(`
      insert into cohort_allocation (id, cohort_id, company_id, module_id, entry_day, status, notes, executed_at)
      values (?, ?, ?, ?, 1, 'Executado', null, ?)
    `).run('alloc-certificate-participants', cohortId, 'comp-readmodels', moduleId, nowIso);

    db.prepare(`
      insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
      values (?, ?, 1, ?, null, null)
    `).run('csd-certificate-participants', cohortId, '2026-05-01');

    db.prepare(`
      insert into cohort_participant (id, cohort_id, company_id, participant_name, created_at)
      values (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
    `).run(
      'participant-ana',
      cohortId,
      'comp-readmodels',
      'Ana Cliente',
      nowIso,
      'participant-bruno',
      cohortId,
      'comp-readmodels',
      'Bruno Cliente',
      nowIso
    );
    db.prepare(`
      insert into cohort_participant_module (participant_id, module_id)
      values (?, ?), (?, ?)
    `).run('participant-ana', moduleId, 'participant-bruno', moduleId);

    const token = await loginPortal(app);
    const listBefore = await request(app)
      .get('/portal/api/certificates')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listBefore.status, 200);
    const certificate = listBefore.body.items.find((item: { module_id: string }) => item.module_id === moduleId) as {
      certificate_id: string;
      download_available: boolean;
      evaluation_total: number;
      evaluation_submitted_count: number;
      participants: Array<{ participant_id: string; participant_name: string; evaluation_submitted: boolean }>;
    };
    assert.ok(certificate, JSON.stringify(listBefore.body.items));
    assert.equal(certificate.download_available, false);
    assert.equal(certificate.evaluation_total, 2);
    assert.equal(certificate.evaluation_submitted_count, 0);
    assert.deepEqual(certificate.participants.map((participant) => participant.participant_name), [
      'Ana Cliente',
      'Bruno Cliente'
    ]);

    const firstSubmit = await request(app)
      .post(`/portal/api/certificates/${encodeURIComponent(certificate.certificate_id)}/evaluation`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        participant_id: 'participant-ana',
        answers: { q1: 5, q2: 5 }
      });
    assert.equal(firstSubmit.status, 201);

    const listAfterOne = await request(app)
      .get('/portal/api/certificates')
      .set('Authorization', `Bearer ${token}`);
    const afterOne = listAfterOne.body.items.find((item: { module_id: string }) => item.module_id === moduleId);
    assert.equal(afterOne.download_available, false);
    assert.equal(afterOne.evaluation_submitted_count, 1);

    const secondSubmit = await request(app)
      .post(`/portal/api/certificates/${encodeURIComponent(certificate.certificate_id)}/evaluation`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        participant_id: 'participant-bruno',
        answers: { q1: 4, q2: 5 }
      });
    assert.equal(secondSubmit.status, 201);

    const listAfterAll = await request(app)
      .get('/portal/api/certificates')
      .set('Authorization', `Bearer ${token}`);
    const afterAll = listAfterAll.body.items.find((item: { module_id: string }) => item.module_id === moduleId);
    assert.equal(afterAll.download_available, true);
    assert.equal(afterAll.evaluation_submitted_count, 2);
  } finally {
    cleanupDbFiles(dbPath);
  }
});
