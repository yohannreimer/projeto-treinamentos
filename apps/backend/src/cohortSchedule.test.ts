import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from './app.js';
import { db } from './db.js';
import { assignTestDbPath } from './test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('cohort update keeps start date equal to first scheduled day', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('cohort-schedule-start-date');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory
      ) values (?, ?, ?, ?, null, ?, null, 1)
    `).run('mod-schedule-start', 'SCH-001', 'Treinamento', 'Fresamento 2D', 2);

    const created = await request(app)
      .post('/cohorts')
      .send({
        code: 'TUR-SCH',
        name: 'Turma com agenda móvel',
        start_date: '2026-06-01',
        status: 'Planejada',
        capacity_companies: 8,
        period: 'Integral',
        delivery_mode: 'Online',
        blocks: [
          { module_id: 'mod-schedule-start', order_in_cohort: 1, start_day_offset: 1, duration_days: 2 }
        ],
        schedule_days: [
          { day_index: 1, day_date: '2026-06-01' },
          { day_index: 2, day_date: '2026-06-02' }
        ]
      });

    assert.equal(created.status, 201);

    const updated = await request(app)
      .patch(`/cohorts/${created.body.id}`)
      .send({
        schedule_days: [
          { day_index: 1, day_date: '2026-06-22' },
          { day_index: 2, day_date: '2026-06-23' }
        ]
      });

    assert.equal(updated.status, 200);

    const cohort = db.prepare('select start_date from cohort where id = ?').get(created.body.id) as { start_date: string };
    assert.equal(cohort.start_date, '2026-06-22');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('cohort reads derive start date from first scheduled day for existing stale records', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('cohort-schedule-derived-start-date');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, status, capacity_companies, period, delivery_mode
      )
      values (?, ?, ?, ?, null, 'Planejada', 8, 'Integral', 'Online')
    `).run('coh-derived-start', 'TUR-DER', 'Turma com início legado', '2026-06-01');

    db.prepare(`
      insert into cohort_schedule_day (id, cohort_id, day_index, day_date, start_time, end_time)
      values (?, ?, 1, ?, null, null), (?, ?, 2, ?, null, null), (?, ?, 3, ?, null, null), (?, ?, 4, ?, null, null)
    `).run(
      'csd-derived-start-1',
      'coh-derived-start',
      '2026-06-27',
      'csd-derived-start-2',
      'coh-derived-start',
      '2026-06-26',
      'csd-derived-start-3',
      'coh-derived-start',
      '2026-06-20',
      'csd-derived-start-4',
      'coh-derived-start',
      '2026-06-23'
    );

    const detail = await request(app).get('/cohorts/coh-derived-start');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.start_date, '2026-06-20');
    assert.deepEqual(
      detail.body.schedule_days.map((day: { day_index: number; day_date: string }) => ({
        day_index: day.day_index,
        day_date: day.day_date
      })),
      [
        { day_index: 1, day_date: '2026-06-20' },
        { day_index: 2, day_date: '2026-06-23' },
        { day_index: 3, day_date: '2026-06-26' },
        { day_index: 4, day_date: '2026-06-27' }
      ]
    );

    const list = await request(app).get('/cohorts');
    assert.equal(list.status, 200);
    const listed = list.body.find((row: { id: string }) => row.id === 'coh-derived-start');
    assert.equal(listed.start_date, '2026-06-20');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('cohort half-day blocks persist schedule technicians and validate conflicts per encounter', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('cohort-half-day-schedule-technician');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory
      ) values (?, ?, ?, ?, null, ?, null, 1)
    `).run('mod-half-day', 'HALF-001', 'Treinamento', 'Meio período avançado', 1);

    db.prepare('insert into technician (id, name, availability_notes) values (?, ?, null)')
      .run('tech-main-half', 'Técnico principal');
    db.prepare('insert into technician (id, name, availability_notes) values (?, ?, null)')
      .run('tech-override-half', 'Técnico do encontro');

    const created = await request(app)
      .post('/cohorts')
      .send({
        code: 'TUR-HALF',
        name: 'Turma com meia diária',
        start_date: '2026-06-01',
        technician_id: 'tech-main-half',
        status: 'Planejada',
        capacity_companies: 8,
        period: 'Meio_periodo',
        start_time: '13:30',
        end_time: '17:00',
        delivery_mode: 'Online',
        blocks: [
          { module_id: 'mod-half-day', order_in_cohort: 1, start_day_offset: 1, duration_days: 1.5 }
        ],
        schedule_days: [
          { day_index: 1, day_date: '2026-06-01', start_time: '13:30', end_time: '17:00' },
          { day_index: 2, day_date: '2026-06-02', start_time: '08:00', end_time: '12:00' },
          { day_index: 3, day_date: '2026-06-02', start_time: '13:30', end_time: '17:00', technician_id: 'tech-override-half' }
        ]
      });

    assert.equal(created.status, 201);

    const detail = await request(app).get(`/cohorts/${created.body.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.blocks[0].duration_days, 1.5);
    assert.equal(detail.body.schedule_days.length, 3);
    assert.equal(detail.body.schedule_days[2].technician_id, 'tech-override-half');

    const fallbackTechnicianActivity = await request(app)
      .post('/calendar/activities')
      .send({
        title: 'Visita conflitante com técnico principal',
        activity_type: 'Visita_cliente',
        start_date: '2026-06-02',
        end_date: '2026-06-02',
        selected_dates: ['2026-06-02'],
        all_day: false,
        start_time: '09:00',
        end_time: '11:00',
        technician_ids: ['tech-main-half'],
        status: 'Planejada'
      });

    assert.equal(fallbackTechnicianActivity.status, 409);
    assert.match(fallbackTechnicianActivity.body.message, /Conflito de agenda do técnico/);

    const overrideTechnicianActivity = await request(app)
      .post('/calendar/activities')
      .send({
        title: 'Visita conflitante com técnico do encontro',
        activity_type: 'Visita_cliente',
        start_date: '2026-06-02',
        end_date: '2026-06-02',
        selected_dates: ['2026-06-02'],
        all_day: false,
        start_time: '14:00',
        end_time: '16:00',
        technician_ids: ['tech-override-half'],
        status: 'Planejada'
      });

    assert.equal(overrideTechnicianActivity.status, 409);
    assert.match(overrideTechnicianActivity.body.message, /Conflito de agenda do técnico/);

    const conflicting = await request(app)
      .post('/cohorts')
      .send({
        code: 'TUR-HALF-CONFLICT',
        name: 'Turma conflitante',
        start_date: '2026-06-02',
        technician_id: 'tech-main-half',
        status: 'Planejada',
        capacity_companies: 8,
        period: 'Meio_periodo',
        start_time: '14:00',
        end_time: '16:00',
        delivery_mode: 'Online',
        blocks: [
          { module_id: 'mod-half-day', order_in_cohort: 1, start_day_offset: 1, duration_days: 0.5 }
        ],
        schedule_days: [
          {
            day_index: 1,
            day_date: '2026-06-02',
            start_time: '14:00',
            end_time: '16:00',
            technician_id: 'tech-override-half'
          }
        ]
      });

    assert.equal(conflicting.status, 400);
    assert.match(conflicting.body.message, /Técnico já está alocado/);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
