import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { createInternalUser } from '../internalAuth.js';
import { assignTestDbPath } from '../test/testDb.js';


function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function loginInternalUser(app: ReturnType<typeof createApp>, username: string, password: string) {
  const login = await request(app).post('/auth/login').send({ username, password });
  assert.equal(login.status, 200);
  return { Authorization: `Bearer ${login.body.token as string}` };
}

test('initDb cria tabelas de task', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('tasks-schema');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });

    const tables = db.prepare(`
      select name from sqlite_master
      where type = 'table' and name like 'task%'
      order by name asc
    `).all() as Array<{ name: string }>;

    assert.deepEqual(tables.map((r) => r.name), [
      'task',
      'task_area',
      'task_checklist_item',
      'task_comment'
    ]);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('initDb seed cria 5 áreas padrão', { concurrency: false }, () => {
  const dbPath = assignTestDbPath('tasks-seed-areas');
  cleanupDbFiles(dbPath);

  try {
    createApp({ forceDbRefresh: true, seedDb: false });
    const areas = db.prepare('select name from task_area order by position asc').all() as Array<{ name: string }>;
    assert.deepEqual(areas.map((r) => r.name), ['Técnico', 'Comercial', 'Financeiro', 'Interno', 'RH']);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /task-areas cria nova área', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-post-area');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser({ username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const res = await request(app)
      .post('/task-areas')
      .set(headers)
      .send({ name: 'Marketing', color: '#ef4444' });

    assert.equal(res.status, 201);
    assert.ok(res.body.id);

    const area = db.prepare('select name, color from task_area where id = ?').get(res.body.id) as { name: string; color: string } | undefined;
    assert.equal(area?.name, 'Marketing');
    assert.equal(area?.color, '#ef4444');
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /tasks cria tarefa e GET /tasks retorna na lista', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-crud');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser({ username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaRes = await request(app).get('/task-areas').set(headers);
    const areaId = (areaRes.body as Array<{ id: string; name: string }>)[0].id;

    const createRes = await request(app)
      .post('/tasks')
      .set(headers)
      .send({
        title: 'Terminar módulo RH',
        area_id: areaId,
        assignee_id: 'user-1',
        assignee_name: 'João',
        due_date: '2026-07-01',
        priority: 'Alta'
      });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.id);

    const listRes = await request(app).get('/tasks').set(headers);
    assert.equal(listRes.status, 200);
    const tasks = listRes.body as Array<{ id: string; title: string }>;
    assert.ok(tasks.some((t) => t.title === 'Terminar módulo RH'));
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('GET /tasks?overdue=true retorna só tarefas atrasadas', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-overdue');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser({ username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaRes = await request(app).get('/task-areas').set(headers);
    const areaId = (areaRes.body as Array<{ id: string }>)[0].id;

    await request(app).post('/tasks').set(headers).send({
      title: 'Atrasada',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2020-01-01',
      priority: 'Normal'
    });
    await request(app).post('/tasks').set(headers).send({
      title: 'No prazo',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2099-12-31',
      priority: 'Normal'
    });

    const res = await request(app).get('/tasks?overdue=true').set(headers);
    assert.equal(res.status, 200);
    const tasks = res.body as Array<{ title: string }>;
    assert.ok(tasks.some((t) => t.title === 'Atrasada'));
    assert.ok(!tasks.some((t) => t.title === 'No prazo'));
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /tasks/:id/checklist e PATCH toggle', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-checklist');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser({ username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaId = ((await request(app).get('/task-areas').set(headers)).body as Array<{ id: string }>)[0].id;
    const taskId = ((await request(app).post('/tasks').set(headers).send({
      title: 'Task com checklist',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2026-12-31',
      priority: 'Normal'
    })).body as { id: string }).id;

    const itemRes = await request(app)
      .post(`/tasks/${taskId}/checklist`)
      .set(headers)
      .send({ label: 'Passo 1' });
    assert.equal(itemRes.status, 201);
    const itemId = (itemRes.body as { id: string }).id;

    const toggleRes = await request(app)
      .patch(`/tasks/${taskId}/checklist/${itemId}`)
      .set(headers)
      .send({ completed: true });
    assert.equal(toggleRes.status, 200);

    const detail = await request(app).get(`/tasks/${taskId}`).set(headers);
    const checklist = (detail.body as { checklist: Array<{ id: string; completed: number }> }).checklist;
    const item = checklist.find((c) => c.id === itemId);
    assert.equal(item?.completed, 1);
  } finally {
    cleanupDbFiles(dbPath);
  }
});

test('POST /tasks/:id/comments adiciona comentário', { concurrency: false }, async () => {
  const dbPath = assignTestDbPath('tasks-comments');
  cleanupDbFiles(dbPath);

  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });
    createInternalUser({ username: 'admin', password: 'senha123', role: 'supremo' });
    const headers = await loginInternalUser(app, 'admin', 'senha123');

    const areaId = ((await request(app).get('/task-areas').set(headers)).body as Array<{ id: string }>)[0].id;
    const taskId = ((await request(app).post('/tasks').set(headers).send({
      title: 'Task com comment',
      area_id: areaId,
      assignee_id: 'u1',
      assignee_name: 'Ana',
      due_date: '2026-12-31',
      priority: 'Normal'
    })).body as { id: string }).id;

    const commentRes = await request(app)
      .post(`/tasks/${taskId}/comments`)
      .set(headers)
      .send({ body: 'Atualizando progresso!' });
    assert.equal(commentRes.status, 201);

    const commentsRes = await request(app).get(`/tasks/${taskId}/comments`).set(headers);
    assert.equal(commentsRes.status, 200);
    const comments = commentsRes.body as Array<{ body: string }>;
    assert.ok(comments.some((c) => c.body === 'Atualizando progresso!'));
  } finally {
    cleanupDbFiles(dbPath);
  }
});
