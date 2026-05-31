import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';

import { createApp } from './app.js';
import { db, nowDateIso } from './db.js';
import { createInternalUser } from './internalAuth.js';
import { assignTestDbPath } from './test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function loginWithLicensesPermission(app: ReturnType<typeof createApp>) {
  createInternalUser({
    username: 'license-user',
    password: 'senha-segura',
    role: 'custom',
    permissions: ['licenses', 'license_programs']
  });

  const login = await request(app).post('/auth/login').send({
    username: 'license-user',
    password: 'senha-segura'
  });

  assert.equal(login.status, 200);
  return { Authorization: `Bearer ${login.body.token as string}` };
}

function seedLicenseFixtures() {
  const nowIso = '2026-04-30';
  db.prepare(`
    insert into company (id, name, status)
    values (?, ?, ?)
  `).run('company-license-test', 'Cliente Licença Teste', 'Ativo');

  db.prepare(`
    insert into license_program (id, name, notes, created_at, updated_at)
    values (?, ?, null, ?, ?)
  `).run('program-license-test', 'TopSolid Teste', nowIso, nowIso);
}

function addDaysIso(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

test('licenses support intermediate renewal cycles with matching renewal duration', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-05-31T12:00:00.000Z') });
  const dbPath = assignTestDbPath('licenses-renewal-cycles');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);
  seedLicenseFixtures();
  const expiresAt = addDaysIso(nowDateIso(), 7);

  const create = await request(app)
    .post('/licenses')
    .set(authHeader)
    .send({
      company_id: 'company-license-test',
      program_id: 'program-license-test',
      user_name: 'Operador',
      module_list: 'TopSolid Teste',
      license_identifier: 'LIC-BIM-001',
      renewal_cycle: 'Bimestral',
      expires_at: expiresAt
    });

  assert.equal(create.status, 201);

  const list = await request(app).get('/licenses').set(authHeader);
  assert.equal(list.status, 200);
  assert.equal(list.body.rows[0].renewal_cycle, 'Bimestral');
  assert.equal(list.body.rows[0].alert_window_days, 15);
  assert.equal(list.body.rows[0].warning_message, 'Renovação bimestral em 7 dia(s).');

  const renew = await request(app)
    .post(`/licenses/${create.body.id as string}/renew`)
    .set(authHeader);

  assert.equal(renew.status, 200);
  assert.equal(renew.body.renewal_cycle, 'Bimestral');
  assert.equal(renew.body.expires_at, addDaysIso(expiresAt, 60));

  cleanupDbFiles(dbPath);
});

test('license alert summary uses a 15 day window for every renewal cycle', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-05-31T12:00:00.000Z') });
  const dbPath = assignTestDbPath('licenses-alert-summary-15-days');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);
  seedLicenseFixtures();

  const today = nowDateIso();
  const insertLicense = db.prepare(`
    insert into company_license (
      id, company_id, name, program_id, user_name, module_list, license_identifier,
      renewal_cycle, expires_at, notes, last_renewed_at, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, null, null, ?, ?)
  `);

  insertLicense.run(
    'license-expired',
    'company-license-test',
    'TopSolid Teste',
    'program-license-test',
    'Usuario Expirado',
    'TopSolid Teste',
    'LIC-EXP',
    'Mensal',
    addDaysIso(today, -1),
    today,
    today
  );
  insertLicense.run(
    'license-annual-15',
    'company-license-test',
    'TopSolid Teste',
    'program-license-test',
    'Usuario Anual',
    'TopSolid Teste',
    'LIC-ANUAL-15',
    'Anual',
    addDaysIso(today, 15),
    today,
    today
  );
  insertLicense.run(
    'license-monthly-16',
    'company-license-test',
    'TopSolid Teste',
    'program-license-test',
    'Usuario Mensal',
    'TopSolid Teste',
    'LIC-MENSAL-16',
    'Mensal',
    addDaysIso(today, 16),
    today,
    today
  );

  const list = await request(app).get('/licenses').set(authHeader);
  assert.equal(list.status, 200);
  const annual = list.body.rows.find((row: any) => row.id === 'license-annual-15');
  const monthly = list.body.rows.find((row: any) => row.id === 'license-monthly-16');
  assert.equal(annual.alert_window_days, 15);
  assert.equal(annual.alert_level, 'Atenção');
  assert.equal(monthly.alert_window_days, 15);
  assert.equal(monthly.alert_level, 'Ok');

  const summary = await request(app).get('/licenses/alerts-summary').set(authHeader);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.expired_count, 1);
  assert.equal(summary.body.due_soon_count, 1);
  assert.equal(summary.body.total_attention, 2);
  assert.equal(summary.body.next_expiration_at, addDaysIso(today, -1));
  assert.deepEqual(
    summary.body.urgent_items.map((item: any) => item.id),
    ['license-expired', 'license-annual-15']
  );

  cleanupDbFiles(dbPath);
});

test('license programs persist TopSolid metadata and reject duplicate TopSolid codes', async () => {
  const dbPath = assignTestDbPath('license-program-topsolid-metadata');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);

  const create = await request(app)
    .post('/license-programs')
    .set(authHeader)
    .send({
      name: 'TopSolid Cam Essential Milling',
      notes: 'Criado pelo teste',
      topsolid_kind: 'Group',
      topsolid_code: '600'
    });

  assert.equal(create.status, 201);

  const list = await request(app).get('/license-programs').set(authHeader);
  assert.equal(list.status, 200);
  const createdProgram = list.body.find((program: any) => program.id === create.body.id);
  assert.equal(createdProgram.topsolid_kind, 'Group');
  assert.equal(createdProgram.topsolid_code, '600');

  const duplicate = await request(app)
    .post('/license-programs')
    .set(authHeader)
    .send({
      name: 'Outro nome para o mesmo código',
      topsolid_kind: 'Group',
      topsolid_code: '600'
    });

  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.message, /código TopSolid/i);

  cleanupDbFiles(dbPath);
});

test('TopSolid import preview groups by expiration and matches programs by TopSolid code', async () => {
  const dbPath = assignTestDbPath('license-topsolid-import-preview');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);
  const nowIso = nowDateIso();

  db.prepare(`
    insert into license_program (id, name, topsolid_kind, topsolid_code, notes, created_at, updated_at)
    values (?, ?, ?, ?, null, ?, ?)
  `).run('program-group-600', 'Nome cadastrado diferente', 'Group', '600', nowIso, nowIso);

  db.prepare(`
    insert into license_program (id, name, topsolid_kind, topsolid_code, notes, created_at, updated_at)
    values (?, ?, ?, ?, null, ?, ?)
  `).run('program-module-1207', 'TopSolid Image', 'Module', '1207', nowIso, nowIso);

  const preview = await request(a