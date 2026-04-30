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

async function loginWithLicensesPermission(app: ReturnType<typeof createApp>) {
  createInternalUser({
    username: 'license-user',
    password: 'senha-segura',
    role: 'custom',
    permissions: ['licenses']
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

test('licenses support intermediate renewal cycles with matching renewal duration', async () => {
  const dbPath = assignTestDbPath('licenses-renewal-cycles');
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true, seedDb: false });
  const authHeader = await loginWithLicensesPermission(app);
  seedLicenseFixtures();

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
      expires_at: '2026-05-07'
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
  assert.equal(renew.body.expires_at, '2026-07-06');

  cleanupDbFiles(dbPath);
});
