import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from './app.js';
import { db } from './db.js';
import { createInternalUser } from './internalAuth.js';
import { assignTestDbPath } from './test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function loginAsAdmin(app: ReturnType<typeof createApp>) {
  createInternalUser({
    username: 'admin-calendar',
    password: 'senha-segura',
    role: 'supremo'
  });

  const login = await request(app).post('/auth/login').send({
    username: 'admin-calendar',
    password: 'senha-segura'
  });

  assert.equal(login.status, 200);
  return { Authorization: `Bearer ${login.body.token as string}` };
}

test('internal user preferences and technician colors feed calendar visual mode', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('calendar-visual-preferences');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    const authHeader = await loginAsAdmin(app);

    const createdUser = await request(app)
      .post('/admin/internal-users')
      .set(authHeader)
      .send({
        username: 'calendar-vivid-user',
        display_name: 'Calendário Chamativo',
        password: 'senha-segura',
        role: 'custom',
        permissions: ['calendar'],
        preferences: { calendar_vivid_mode: true }
      });

    assert.equal(createdUser.status, 201);
    assert.equal(createdUser.body.preferences.calendar_vivid_mode, true);

    const createdTechnician = await request(app)
      .post('/technicians')
      .set(authHeader)
      .send({
        name: 'Técnico Laranja',
        calendar_color: '#f97316'
      });

    assert.equal(createdTechnician.status, 201);
    const technicianId = createdTechnician.body.id as string;

    const technicians = await request(app).get('/technicians').set(authHeader);
    assert.equal(technicians.status, 200);
    assert.equal(
      technicians.body.find((item: any) => item.id === technicianId)?.calendar_color,
      '#f97316'
    );

    db.prepare(`
      insert into cohort (id, code, name, start_date, technician_id, status, capacity_companies, period, delivery_mode)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('cohort-calendar-color', 'T-COR', 'Turma com cor', '2026-05-06', technicianId, 'Confirmada', 6, 'Integral', 'Online');

    db.prepare(`
      insert into calendar_activity (
        id, title, activity_type, start_date, end_date, hours_scope, all_day, technician_id, status, created_at, updated_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'activity-calendar-color',
      'Atividade comum com cor',
      'Outro',
      '2026-05-06',
      '2026-05-06',
      'none',
      1,
      technicianId,
      'Planejada',
      '2026-05-06T12:00:00.000Z',
      '2026-05-06T12:00:00.000Z'
    );
    db.prepare(`
      insert into calendar_activity_technician (activity_id, technician_id)
      values (?, ?)
    `).run('activity-calendar-color', technicianId);

    const cohorts = await request(app).get('/calendar/cohorts').set(authHeader);
    assert.equal(cohorts.status, 200);
    assert.equal(
      cohorts.body.find((item: any) => item.id === 'cohort-calendar-color')?.technician_calendar_color,
      '#f97316'
    );

    const activities = await request(app).get('/calendar/activities').set(authHeader);
    assert.equal(activities.status, 200);
    const activity = activities.body.find((item: any) => item.id === 'activity-calendar-color');
    assert.equal(activity?.primary_technician_calendar_color, '#f97316');
    assert.equal(activity?.technician_colors, '#f97316');
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
