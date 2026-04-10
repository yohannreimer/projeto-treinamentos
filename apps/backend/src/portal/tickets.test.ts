import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';
import { hashPassword } from './auth.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function createPortalTicketsFixture(testName: string) {
  const dbPath = assignTestDbPath(testName);
  cleanupDbFiles(dbPath);

  const app = createApp({ forceDbRefresh: true });
  const nowIso = new Date().toISOString();
  const passwordHash = await hashPassword('123456');

  db.prepare(`
    insert into company (id, name, status, notes, priority)
    values (?, ?, 'Ativo', null, 0)
  `).run('comp-portal-tickets', 'Cliente Portal Tickets');

  db.prepare(`
    insert into portal_client (id, company_id, slug, is_active, created_at, updated_at)
    values (?, ?, ?, 1, ?, ?)
  `).run('portal-client-tickets', 'comp-portal-tickets', 'cliente-tickets', nowIso, nowIso);

  db.prepare(`
    insert into portal_user (
      id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
    ) values (?, ?, ?, ?, 1, null, ?, ?)
  `).run('portal-user-tickets', 'portal-client-tickets', 'cliente', passwordHash, nowIso, nowIso);

  db.prepare(`
    insert into company (id, name, status, notes, priority)
    values (?, ?, 'Ativo', null, 0)
  `).run('comp-portal-tickets-other', 'Cliente Portal Outro Tenant');

  db.prepare(`
    insert into portal_client (id, company_id, slug, is_active, created_at, updated_at)
    values (?, ?, ?, 1, ?, ?)
  `).run('portal-client-tickets-other', 'comp-portal-tickets-other', 'cliente-outro-tenant', nowIso, nowIso);

  db.prepare(`
    insert into portal_user (
      id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
    ) values (?, ?, ?, ?, 1, null, ?, ?)
  `).run('portal-user-tickets-other', 'portal-client-tickets-other', 'cliente', passwordHash, nowIso, nowIso);

  return { app, dbPath };
}

async function loginPortal(app: ReturnType<typeof createApp>) {
  const loginRes = await request(app)
    .post('/portal/api/auth/login')
    .send({ slug: 'cliente-tickets', username: 'cliente', password: '123456' });

  assert.equal(loginRes.status, 200);
  const token = loginRes.body.token as string;
  assert.equal(typeof token, 'string');
  return token;
}

test('POST /portal/api/tickets creates portal_ticket and implementation_kanban_card', async () => {
  const { app, dbPath } = await createPortalTicketsFixture('portal-tickets-create-bridge');

  try {
    const token = await loginPortal(app);
    const createRes = await request(app)
      .post('/portal/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Erro no acesso',
        description: 'Detalhes do problema no login do usuário final.',
        priority: 'Alta'
      });

    assert.equal(createRes.status, 201);
    assert.equal(typeof createRes.body.id, 'string');

    const ticket = db.prepare(`
      select id, company_id, portal_user_id, title, priority, status, origin, kanban_card_id
      from portal_ticket
      where id = ?
    `).get(createRes.body.id) as
      | {
        id: string;
        company_id: string;
        portal_user_id: string;
        title: string;
        priority: string;
        status: string;
        origin: string;
        kanban_card_id: string | null;
      }
      | undefined;
    assert.ok(ticket);
    assert.equal(ticket.company_id, 'comp-portal-tickets');
    assert.equal(ticket.portal_user_id, 'portal-user-tickets');
    assert.equal(ticket.title, 'Erro no acesso');
    assert.equal(ticket.priority, 'Alta');
    assert.equal(ticket.status, 'Aberto');
    assert.equal(ticket.origin, 'portal_cliente');
    assert.equal(typeof ticket.kanban_card_id, 'string');

    const card = db.prepare(`
      select id, title, client_name, subcategory, priority
      from implementation_kanban_card
      where id = ?
    `).get(ticket.kanban_card_id) as
      | { id: string; title: string; client_name: string | null; subcategory: string | null; priority: string }
      | undefined;
    assert.ok(card);
    assert.equal(card.title, 'Erro no acesso');
    assert.equal(card.client_name, 'Cliente Portal Tickets');
    assert.equal(card.subcategory, 'Suporte');
    assert.equal(card.priority, 'Alta');

    db.prepare(`
      insert into portal_ticket (
        id, company_id, portal_user_id, title, description, priority, status, origin, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, 'Aberto', 'portal_cliente', ?, ?)
    `).run(
      'ptk-other-tenant',
      'comp-portal-tickets-other',
      'portal-user-tickets-other',
      'Ticket outro tenant',
      'Esse chamado nao deve aparecer para o cliente autenticado.',
      'Normal',
      new Date().toISOString(),
      new Date().toISOString()
    );

    db.prepare(`
      insert into implementation_kanban_column (id, title, color, position, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run(
      'kcol-support-running',
      'Suporte em andamento',
      '#ef2f0f',
      90,
      new Date().toISOString(),
      new Date().toISOString()
    );

    db.prepare(`
      insert into implementation_kanban_card (
        id, title, description, status, column_id, client_name, subcategory, priority, position, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'kcard-support-internal',
      'Suporte aberto pelo time interno',
      'Card criado internamente e que deve aparecer para o cliente.',
      'Todo',
      'kcol-support-running',
      'Cliente Portal Tickets',
      'Suporte',
      'Alta',
      2,
      new Date().toISOString(),
      new Date().toISOString()
    );

    db.prepare(`
      insert into implementation_kanban_card (
        id, title, description, status, column_id, client_name, subcategory, priority, position, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'kcard-support-other-client',
      'Suporte de outro cliente',
      'Nao deve aparecer para o cliente autenticado.',
      'Todo',
      'kcol-support-running',
      'Cliente Portal Outro Tenant',
      'Suporte',
      'Alta',
      3,
      new Date().toISOString(),
      new Date().toISOString()
    );

    const listRes = await request(app)
      .get('/portal/api/tickets')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listRes.status, 200);
    assert.equal(Array.isArray(listRes.body.items), true);
    const createdItem = listRes.body.items.find((item: { title: string }) => item.title === 'Erro no acesso') as
      | { title: string; client_status: string; status?: string; column_title?: string }
      | undefined;
    assert.ok(createdItem);
    assert.equal(
      listRes.body.items.some((item: { title: string; client_status: string }) =>
        item.title === 'Erro no acesso' && typeof item.client_status === 'string'),
      true
    );
    assert.equal(
      listRes.body.items.some((item: { title: string; source: string }) =>
        item.title === 'Erro no acesso' && item.source === 'Portal'),
      true
    );
    assert.equal(
      listRes.body.items.some((item: { title: string; source: string; client_status: string }) =>
        item.title === 'Suporte aberto pelo time interno'
        && item.source === 'Operacao'
        && item.client_status === 'Em execução'),
      true
    );
    assert.equal('status' in createdItem, false);
    assert.equal('column_title' in createdItem, false);
    assert.equal(
      listRes.body.items.some((item: { title: string }) => item.title === 'Ticket outro tenant'),
      false
    );
    assert.equal(
      listRes.body.items.some((item: { title: string }) => item.title === 'Suporte de outro cliente'),
      false
    );
  } finally {
    cleanupDbFiles(dbPath);
  }
});
