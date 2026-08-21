import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createApp } from '../app.js';
import { db } from '../db.js';
import { hashInternalPassword } from '../internalAuth.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

async function loginAsSupremo(app: ReturnType<typeof createApp>) {
  const response = await request(app)
    .post('/auth/login')
    .send({ username: 'holand', password: 'Holand2026!@#' });
  assert.equal(response.status, 200);
  return response.body.token as string;
}

const proposalDocument = {
  version: 1,
  client: { companyName: 'Cliente A', address: '', cep: '', cnpj: '', contact: '', email: '' },
  proposal: { number: 'P-001', date: '2026-08-17', validityDays: '11', modality: 'Presencial' },
  selectedServiceIds: [],
  selectedProductIds: [],
  serviceSnapshots: [],
  productSnapshots: [],
  proposalCustomServices: [],
  proposalCustomProducts: [],
  proposalServiceEdits: {},
  proposalProductEdits: {},
  taxPercent: '12',
  exchangeRate: '5.80',
  softwareDiscountPercent: '0',
  discountPercent: '0',
  targetTotal: '54000',
  selectedRepresentative: null,
  includeRequirementsTerm: false,
  snapToTarget: false,
  serviceTargetTotal: null,
  observations: ''
};

test('initializes proposal persistence tables', () => {
  const dbPath = assignTestDbPath('proposal-schema');
  cleanupDbFiles(dbPath);
  createApp({ forceDbRefresh: true });

  const tables = db.prepare(`
    select name from sqlite_master
    where type = 'table' and name in (
      'proposal', 'proposal_catalog_product', 'proposal_catalog_service'
    )
    order by name
  `).all() as Array<{ name: string }>;

  assert.deepEqual(tables.map((row) => row.name), [
    'proposal',
    'proposal_catalog_product',
    'proposal_catalog_service'
  ]);

  const columns = db.prepare('pragma table_info(proposal_catalog_product)')
    .all() as Array<{ name: string }>;
  assert.deepEqual(columns.map((row) => row.name), [
    'id',
    'organization_id',
    'product_id',
    'source',
    'product_json',
    'is_archived',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at'
  ]);
  cleanupDbFiles(dbPath);
});

test('rejects proposal routes for a user without proposals permission', async () => {
  const dbPath = assignTestDbPath('proposal-permission');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const now = new Date().toISOString();
  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json,
      organization_id, is_active, created_at, updated_at
    ) select 'iuser-no-proposals', 'no-proposals', 'Sem propostas', ?,
      'custom', '["clients"]', organization_id, 1, ?, ?
    from internal_user where username = 'holand'
  `).run(hashInternalPassword('Senha123!'), now, now);

  const login = await request(app).post('/auth/login').send({ username: 'no-proposals', password: 'Senha123!' });
  const response = await request(app)
    .get('/proposals')
    .set('Authorization', `Bearer ${login.body.token}`);

  assert.equal(response.status, 403);
  cleanupDbFiles(dbPath);
});

test('creates, lists, reads, updates and deletes a shared proposal', async () => {
  const dbPath = assignTestDbPath('proposal-crud');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };

  const created = await request(app).post('/proposals').set(auth).send({
    number: 'P-001',
    client_company_name: 'Cliente A',
    document: proposalDocument
  });
  assert.equal(created.status, 201);

  const now = new Date().toISOString();
  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json,
      organization_id, is_active, created_at, updated_at
    ) select 'iuser-proposals-reader', 'proposals-reader', 'Leitor comercial', ?,
      'custom', '["proposals"]', organization_id, 1, ?, ?
    from internal_user where username = 'holand'
  `).run(hashInternalPassword('Senha123!'), now, now);
  const readerLogin = await request(app)
    .post('/auth/login')
    .send({ username: 'proposals-reader', password: 'Senha123!' });
  const readerAuth = { Authorization: `Bearer ${readerLogin.body.token}` };

  const listed = await request(app).get('/proposals?q=Cliente').set(readerAuth);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.body.items[0].client_company_name, 'Cliente A');

  const read = await request(app).get(`/proposals/${created.body.id}`).set(readerAuth);
  assert.deepEqual(read.body.document, proposalDocument);

  const updated = await request(app).put(`/proposals/${created.body.id}`).set(auth).send({
    number: 'P-001-R1',
    client_company_name: 'Cliente B',
    document: {
      ...proposalDocument,
      client: { ...proposalDocument.client, companyName: 'Cliente B' }
    }
  });
  assert.equal(updated.status, 200);

  const removed = await request(app).delete(`/proposals/${created.body.id}`).set(auth);
  assert.equal(removed.status, 200);
  assert.equal((await request(app).get(`/proposals/${created.body.id}`).set(auth)).status, 404);
  cleanupDbFiles(dbPath);
});

test('shares catalog services and validates proposal documents', async () => {
  const dbPath = assignTestDbPath('proposal-catalog');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };

  const invalid = await request(app).post('/proposals').set(auth).send({
    number: 'inválida', client_company_name: '', document: { version: 99 }
  });
  assert.equal(invalid.status, 400);

  const service = await request(app).post('/proposals/catalog/services').set(auth).send({
    code: 'MOD-X',
    name: 'Módulo X',
    valuePerDay: 1500,
    defaultDurationDays: 2,
    description: 'Sob medida'
  });
  assert.equal(service.status, 201);

  const now = new Date().toISOString();
  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json,
      organization_id, is_active, created_at, updated_at
    ) select 'iuser-proposals-peer', 'proposals-peer', 'Colega comercial', ?,
      'custom', '["proposals"]', organization_id, 1, ?, ?
    from internal_user where username = 'holand'
  `).run(hashInternalPassword('Senha123!'), now, now);
  const peerLogin = await request(app)
    .post('/auth/login')
    .send({ username: 'proposals-peer', password: 'Senha123!' });
  const peerAuth = { Authorization: `Bearer ${peerLogin.body.token}` };

  const list = await request(app).get('/proposals/catalog/services').set(peerAuth);
  assert.equal(list.body.items[0].name, 'Módulo X');

  const edit = await request(app).put(`/proposals/catalog/services/${service.body.id}`).set(auth).send({
    code: 'MOD-X',
    name: 'Módulo X revisado',
    valuePerDay: 1700,
    defaultDurationDays: 3,
    description: 'Revisado'
  });
  assert.equal(edit.body.name, 'Módulo X revisado');

  const removed = await request(app).delete(`/proposals/catalog/services/${service.body.id}`).set(auth);
  assert.equal(removed.status, 200);
  cleanupDbFiles(dbPath);
});

test('shares catalog products and archives without deleting history', async () => {
  const dbPath = assignTestDbPath('proposal-product-catalog');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };
  const product = {
    code: 'CUSTOM-1',
    name: 'Produto compartilhado',
    unitValueUsd: 1200,
    defaultQuantity: 1,
    description: 'Criado no aplicativo',
    catalog: {
      family: 'Design',
      subfamily: 'Extensões',
      folder: 'Customizados',
      reviewStatus: '',
      isPrimary: false
    }
  };

  const created = await request(app).post('/proposals/catalog/products').set(auth).send(product);
  assert.equal(created.status, 201);
  assert.equal(created.body.source, 'custom');
  assert.equal(created.body.product.custom, true);

  const now = new Date().toISOString();
  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json,
      organization_id, is_active, created_at, updated_at
    ) select 'iuser-products-peer', 'products-peer', 'Colega de produtos', ?,
      'custom', '["proposals"]', organization_id, 1, ?, ?
    from internal_user where username = 'holand'
  `).run(hashInternalPassword('Senha123!'), now, now);
  const peerLogin = await request(app)
    .post('/auth/login')
    .send({ username: 'products-peer', password: 'Senha123!' });
  const peerAuth = { Authorization: `Bearer ${peerLogin.body.token}` };
  const peerList = await request(app).get('/proposals/catalog/products').set(peerAuth);
  assert.equal(peerList.body.items[0].product.name, 'Produto compartilhado');

  const official = await request(app).put('/proposals/catalog/products/p3').set(auth).send({
    source: 'official',
    product: {
      id: 'p3',
      ...product,
      name: 'TopSolid Design Pro revisado',
      unitValueUsd: 9900
    }
  });
  assert.equal(official.status, 200);
  assert.equal(official.body.product.id, 'p3');
  assert.equal(official.body.product.custom, false);

  const listed = await request(app).get('/proposals/catalog/products').set(auth);
  assert.equal(listed.body.items.length, 2);

  const archived = await request(app)
    .delete('/proposals/catalog/products/p3')
    .set(auth)
    .send({ source: 'official', product: official.body.product });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.archived, true);
  assert.equal((db.prepare(`
    select count(*) as count from proposal_catalog_product where product_id = 'p3'
  `).get() as { count: number }).count, 1);
  cleanupDbFiles(dbPath);
});

test('isolates proposals by organization', async () => {
  const dbPath = assignTestDbPath('proposal-tenant');
  cleanupDbFiles(dbPath);
  const app = createApp({ forceDbRefresh: true, enforceInternalAuth: true });
  const token = await loginAsSupremo(app);
  const auth = { Authorization: `Bearer ${token}` };
  const created = await request(app).post('/proposals').set(auth).send({
    number: 'P-ORG-1', client_company_name: 'Organização 1', document: proposalDocument
  });
  const sharedProduct = {
    id: 'p3',
    code: '0030',
    name: 'Design Pro Organização 1',
    unitValueUsd: 9000,
    defaultQuantity: 1,
    description: '',
    custom: false,
    catalog: {
      family: 'Design',
      subfamily: "TopSolid'Design",
      folder: 'Pacotes Design',
      reviewStatus: '',
      isPrimary: true
    }
  };
  assert.equal((await request(app)
    .put('/proposals/catalog/products/p3')
    .set(auth)
    .send({ source: 'official', product: sharedProduct })).status, 200);

  const now = new Date().toISOString();
  db.prepare(`
    insert into organization (id, name, slug, is_active, created_at, updated_at)
    values ('org-2', 'Outra organização', 'outra-organizacao', 1, ?, ?)
  `).run(now, now);
  db.prepare(`
    insert into internal_user (
      id, username, display_name, password_hash, role, permissions_json,
      organization_id, is_active, created_at, updated_at
    ) values (?, ?, ?, ?, 'custom', '["proposals"]', 'org-2', 1, ?, ?)
  `).run('iuser-org-2', 'org-2-user', 'Usuário org 2', hashInternalPassword('Senha123!'), now, now);
  const login = await request(app).post('/auth/login').send({ username: 'org-2-user', password: 'Senha123!' });
  const otherAuth = { Authorization: `Bearer ${login.body.token}` };

  const otherList = await request(app).get('/proposals').set(otherAuth);
  assert.equal(otherList.body.items.length, 0);
  assert.equal((await request(app).get(`/proposals/${created.body.id}`).set(otherAuth)).status, 404);
  const otherCatalog = await request(app).get('/proposals/catalog/products').set(otherAuth);
  assert.deepEqual(otherCatalog.body.items, []);
  assert.equal((await request(app)
    .put('/proposals/catalog/products/p3')
    .set(otherAuth)
    .send({
      source: 'official',
      product: { ...sharedProduct, name: 'Design Pro Organização 2' }
    })).status, 200);
  assert.equal((db.prepare(`
    select count(*) as count from proposal_catalog_product where product_id = 'p3'
  `).get() as { count: number }).count, 2);
  cleanupDbFiles(dbPath);
});
