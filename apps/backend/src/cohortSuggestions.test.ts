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

test('cohort suggestions include completed customers as blocked options', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('cohort-suggestions-completed-customer');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    db.prepare(`
      insert into company (id, name, status, notes, priority)
      values (?, ?, ?, null, 0)
    `).run('comp-completed-module', 'Cliente que já concluiu', 'Ativo');
    db.prepare(`
      insert into module_template (
        id, code, category, name, description, duration_days, profile, is_mandatory, delivery_mode, client_hours_policy
      )
      values (?, ?, ?, ?, null, ?, null, ?, ?, ?)
    `).run('mod-2d', '2D', 'CAM', 'Fresamento 2D', 2, 1, 'ministrado', 'consome');
    db.prepare(`
      insert into company_module_progress (id, company_id, module_id, status, completed_at)
      values (?, ?, ?, ?, ?)
    `).run('prog-completed-2d', 'comp-completed-module', 'mod-2d', 'Concluido', '2026-04-10');
    db.prepare(`
      insert into cohort (
        id, code, name, start_date, technician_id, capacity_companies, status, notes, period, delivery_mode
      )
      values (?, ?, ?, ?, null, ?, ?, null, ?, ?)
    `).run('cohort-2d', 'T-2D', 'Turma Fresamento 2D', '2026-05-10', 8, 'Planejada', 'Integral', 'Online');
    db.prepare(`
      insert into cohort_module_block (
        id, cohort_id, module_id, order_in_cohort, start_day_offset, duration_days
      )
      values (?, ?, ?, ?, ?, ?)
    `).run('block-2d', 'cohort-2d', 'mod-2d', 1, 1, 2);

    const response = await request(app).get('/cohorts/cohort-2d/suggestions/mod-2d');

    assert.equal(response.status, 200);
    const completedCustomer = response.body.companies.find((company: any) => company.id === 'comp-completed-module');
    assert.ok(completedCustomer);
    assert.equal(completedCustomer.block_reason, 'Já concluiu este módulo');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
