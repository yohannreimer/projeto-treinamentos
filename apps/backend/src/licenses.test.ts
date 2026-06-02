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

test('licenses support intermediate renewal cycles with matching renewal duration', async () => {
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
  assert.equal(list.body.rows[0].alert_window_days, 7);
  assert.equal(list.body.rows[0].warning_message, 'Renovação bimestral em 7 dia(s).');

  const renew = await request(app)
    .post(`/licenses/${create.body.id as string}/renew`)
    .set(authHeader);

  assert.equal(renew.status, 200);
  assert.equal(renew.body.renewal_cycle, 'Bimestral');
  assert.equal(renew.body.expires_at, addDaysIso(expiresAt, 60));

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

  const preview = await request(app)
    .post('/licenses/import-preview')
    .set(authHeader)
    .send({
      raw_text: [
        `TOPSOLID/"Missler"/3/hash/7.19/Group:600/"TopSolid'Cam Essential Milling"/30-6-2026/Professional/token`,
        `TOPSOLID/"Missler"/3/hash/7.19/Module:1207/"Ext/TopSolid'Image"/30-6-2026/Professional/token`,
        'TOPSOLID/"Missler"/3/hash/7.19/Group:817/"Ext/Cut 2d Essential"/15-7-2026/Professional/token',
        'linha sem módulo'
      ].join('\n')
    });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.summary.parsed_lines, 3);
  assert.equal(preview.body.summary.ignored_lines, 1);
  assert.equal(preview.body.groups.length, 2);

  const juneGroup = preview.body.groups.find((group: any) => group.expires_at === '2026-06-30');
  assert.ok(juneGroup);
  assert.deepEqual(
    juneGroup.matched_programs.map((program: any) => program.id).sort(),
    ['program-group-600', 'program-module-1207']
  );
  assert.equal(juneGroup.unmatched_items.length, 0);

  const julyGroup = preview.body.groups.find((group: any) => group.expires_at === '2026-07-15');
  assert.ok(julyGroup);
  assert.equal(julyGroup.matched_programs.length, 0);
  assert.equal(julyGroup.unmatched_items[0].kind, 'Group');
  assert.equal(julyGroup.unmatched_items[0].code, '817');
  assert.equal(julyGroup.unmatched_items[0].name, 'Ext/Cut 2d Essential');

  cleanupDbFiles(dbPath);
});

test('TopSolid import preview matches legacy program codes stored in program names', async () => {
  const dbPath = assignTestDbPath('license-topsolid-import-preview-legacy-name-code');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);
  const nowIso = nowDateIso();

  db.prepare(`
    insert into license_program (id, name, notes, created_at, updated_at)
    values (?, ?, null, ?, ?)
  `).run('program-legacy-600', "(600) Ext/TopSolid'Cam Essential Milling", nowIso, nowIso);

  const preview = await request(app)
    .post('/licenses/import-preview')
    .set(authHeader)
    .send({
      raw_text: `TOPSOLID/"Missler"/3/hash/7.19/Group:600/"TopSolid'Cam Essential Milling"/30-6-2026/Professional/token`
    });

  assert.equal(preview.status, 200);
  const juneGroup = preview.body.groups.find((group: any) => group.expires_at === '2026-06-30');
  assert.ok(juneGroup);
  assert.equal(juneGroup.unmatched_items.length, 0);
  assert.deepEqual(
    juneGroup.matched_programs.map((program: any) => program.id),
    ['program-legacy-600']
  );

  cleanupDbFiles(dbPath);
});
