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
        priority: 'Alta',
        attachments: [
          {
            file_name: 'evidencia.txt',
            file_data_base64: 'data:text/plain;base64,SG9sYW5kIHRlc3Rl'
          }
        ]
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

    const messageCount = db.prepare(`
      select count(*) as count
      from portal_ticket_message
      where ticket_id = ?
    `).get(createRes.body.id) as { count: number };
    assert.equal(messageCount.count, 1);

    const attachmentCount = db.prepare(`
      select count(*) as count
      from portal_ticket_attachment
      where ticket_message_id in (
        select id from portal_ticket_message where ticket_id = ?
      )
    `).get(createRes.body.id) as { count: number };
    assert.equal(attachmentCount.count, 1);

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

    db.prepare(`
      update portal_client
      set support_intro_text = ?
      where id = ?
    `).run('Canal oficial para dúvidas e impedimentos do seu time.', 'portal-client-tickets');

    const listRes = await request(app)
      .get('/portal/api/tickets')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(listRes.status, 200);
    assert.equal(Array.isArray(listRes.body.items), true);
    assert.equal(listRes.body.support_intro_text, 'Canal oficial para dúvidas e impedimentos do seu time.');
    const createdItem = listRes.body.items.find((item: { title: string }) => item.title === 'Erro no acesso') as
      | { title: string; client_status: string; workflow_stage?: string; status?: string; column_title?: string }
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
    assert.equal(createdItem.workflow_stage, 'A fazer');
    assert.equal(
      listRes.body.items.some((item: { title: string; source: string; client_status: string; workflow_stage: string }) =>
        item.title === 'Suporte aberto pelo time interno'
        && item.source === 'Operacao'
        && item.client_status === 'Em execução'
        && item.workflow_stage === 'Em andamento'),
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

    const threadRes = await request(app)
      .get(`/portal/api/tickets/${createRes.body.id as string}/thread`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(threadRes.status, 200);
    assert.equal(Array.isArray(threadRes.body.messages), true);
    assert.equal(threadRes.body.messages.length, 1);
    assert.equal(threadRes.body.messages[0].attachments.length, 1);

    const messageRes = await request(app)
      .post(`/portal/api/tickets/${createRes.body.id as string}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        body: 'Enviei mais contexto.',
        attachments: [
          {
            file_name: 'print.png',
            file_data_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4V0AAAAASUVORK5CYII='
          }
        ]
      });
    assert.equal(messageRes.status, 201);

    assert.ok(ticket.kanban_card_id);
    const internalMirrorRes = await request(app)
      .patch(`/implementation/kanban/cards/${ticket.kanban_card_id}`)
      .send({
        support_resolution: 'Aplicamos ajuste no perfil e validamos com o time do cliente.',
        attachment_file_name: 'checklist-final.pdf',
        attachment_file_data_base64: 'data:application/pdf;base64,JVBERi0xLjQKJQ=='
      });
    assert.equal(internalMirrorRes.status, 200);

    const mirroredThreadRes = await request(app)
      .get(`/portal/api/tickets/${createRes.body.id as string}/thread`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(mirroredThreadRes.status, 200);
    assert.equal(mirroredThreadRes.body.messages.length, 3);
    const mirroredMessage = mirroredThreadRes.body.messages.find((message: {
      author_type: string;
      author_label: string | null;
      body: string | null;
      attachments: Array<{ file_name: string }>;
    }) => message.body === 'Aplicamos ajuste no perfil e validamos com o time do cliente.') as
      | {
        author_type: string;
        author_label: string | null;
        body: string | null;
        attachments: Array<{ file_name: string }>;
      }
      | undefined;
    assert.ok(mirroredMessage);
    assert.equal(mirroredMessage.author_type, 'Holand');
    assert.equal(mirroredMessage.author_label, 'Equipe Holand');
    assert.equal(mirroredMessage.body, 'Aplicamos ajuste no perfil e validamos com o time do cliente.');
    assert.equal(mirroredMessage.attachments.length, 1);
    assert.equal(mirroredMessage.attachments[0].file_name, 'checklist-final.pdf');
  } finally {
    cleanupDbFiles(dbPath);
  }
});
