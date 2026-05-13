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
