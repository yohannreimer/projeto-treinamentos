import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import request from 'supertest';
import {
  INTERNAL_DOCUMENT_DATA_URL_MAX_CHARS,
  INTERNAL_DOCUMENT_MAX_BYTES
} from './coreRoutes.js';
import { createApp } from './app.js';
import { db } from './db.js';
import { assignTestDbPath } from './test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

test('documents internos usam teto de 1 GB e data URL compatível com Base64', () => {
  assert.equal(INTERNAL_DOCUMENT_MAX_BYTES, 1_000_000_000);
  assert.equal(INTERNAL_DOCUMENT_DATA_URL_MAX_CHARS, 1_333_334_000);
});

test('POST /internal-documents ainda aceita um documento interno válido', async () => {
  const dbPath = assignTestDbPath('internal-documents-upload-limit');
  cleanupDbFiles(dbPath);
  try {
    const app = createApp({ forceDbRefresh: true, seedDb: false });

    const response = await request(app)
      .post('/internal-documents')
      .send({
        title: 'Manual de instalação',
        file_name: 'manual.txt',
        mime_type: 'text/plain',
        file_data_base64: 'data:text/plain;base64,b2s='
      });

    assert.equal(response.status, 201);
    assert.match(response.body.id, /^doc_/);
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
