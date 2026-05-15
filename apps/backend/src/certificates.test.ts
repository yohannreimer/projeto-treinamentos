import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCompanyModuleCertificate } from './coreRoutes.js';
import { db, initDb, resetDbConnection, seedDb } from './db.js';
import { assignTestDbPath } from './test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function createCertificateFixture(testName: string) {
  const dbPath = assignTestDbPath(testName);
  cleanupDbFiles(dbPath);
  resetDbConnection();
  initDb();
  seedDb();

  return { dbPath };
}

test('company journey certificate can be generated for a completed training module without a cohort allocation', async () => {
  const { dbPath } = createCertificateFixture('certificate-company-module-without-cohort');

  const certificate = await buildCompanyModuleCertificate({
    companyId: 'comp-01',
    moduleId: 'mod-01',
    format: 'html',
    shouldDownload: true
  });

  assert.equal(certificate.contentType, 'text/html; charset=utf-8');
  assert.equal(certificate.disposition, 'attachment');
  assert.equal(certificate.fileName, 'Certificado - Metal Forte - Instalacao TopSolid.html');
  assert.match(String(certificate.body), /Metal Forte/);
  assert.match(String(certificate.body), /Instalacao TopSolid/);

  cleanupDbFiles(dbPath);
});

test('company journey certificate can be generated for a completed training module when the cohort has no participants', async () => {
  const { dbPath } = createCertificateFixture('certificate-company-module-with-empty-cohort');

  db.prepare(`
    insert into company_module_progress (id, company_id, module_id, status, completed_at)
    values (?, ?, ?, ?, ?)
  `).run('prog-certificate-empty-cohort', 'comp-01', 'mod-03', 'Concluido', '2026-05-15');

  const certificate = await buildCompanyModuleCertificate({
    companyId: 'comp-01',
    moduleId: 'mod-03',
    format: 'html',
    shouldDownload: true
  });

  assert.equal(certificate.contentType, 'text/html; charset=utf-8');
  assert.equal(certificate.disposition, 'attachment');
  assert.equal(certificate.fileName, 'Certificado - Metal Forte - TopSolid Montagem.html');
  assert.match(String(certificate.body), /Metal Forte/);
  assert.match(String(certificate.body), /TopSolid Montagem/);

  cleanupDbFiles(dbPath);
});
