import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { db, initDb, resetDbConnection } from '../db.js';
import { assignTestDbPath } from '../test/testDb.js';

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function seedPortalTenantGraph() {
  const now = '2026-04-09T12:00:00.000Z';

  db.prepare(`
    insert into company (id, name)
    values (?, ?), (?, ?)
  `).run(
    'company-a',
    'Company A',
    'company-b',
    'Company B'
  );

  db.prepare(`
    insert into portal_client (id, company_id, slug, is_active, created_at, updated_at)
    values (?, ?, ?, 1, ?, ?), (?, ?, ?, 1, ?, ?)
  `).run(
    'portal-client-a',
    'company-a',
    'company-a',
    now,
    now,
    'portal-client-b',
    'company-b',
    'company-b',
    now,
    now
  );

  db.prepare(`
    insert into portal_user (
      id, portal_client_id, username, password_hash, is_active, last_login_at, created_at, updated_at
    )
    values (?, ?, ?, ?, 1, null, ?, ?), (?, ?, ?, ?, 1, null, ?, ?)
  `).run(
    'portal-user-a',
    'portal-client-a',
    'alice',
    'scrypt:00112233445566778899aabbccddeeff:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    now,
    now,
    'portal-user-b',
    'portal-client-b',
    'bob',
    'scrypt:ffeeddccbbaa99887766554433221100:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    now,
    now
  );
}

test('portal_session accepts a fully consistent tenant insert', () => {
  const dbPath = assignTestDbPath('portal-schema-valid-session');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();
    seedPortalTenantGraph();

    assert.doesNotThrow(() => {
      db.prepare(`
        insert into portal_session (
          id, portal_user_id, portal_client_id, company_id, token_hash, expires_at, created_at, last_seen_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'portal-session-valid',
        'portal-user-a',
        'portal-client-a',
        'company-a',
        'token-valid',
        '2026-04-10T12:00:00.000Z',
        '2026-04-09T12:00:00.000Z',
        '2026-04-09T12:00:00.000Z'
      );
    });

    const session = db.prepare(`
      select id, portal_user_id, portal_client_id, company_id
      from portal_session
      where id = ?
    `).get('portal-session-valid') as
      | { id: string; portal_user_id: string; portal_client_id: string; company_id: string }
      | undefined;

    assert.deepEqual(session, {
      id: 'portal-session-valid',
      portal_user_id: 'portal-user-a',
      portal_client_id: 'portal-client-a',
      company_id: 'company-a'
    });
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});

test('portal_session rejects tenant mismatches across company, client, and user', () => {
  const dbPath = assignTestDbPath('portal-schema-invalid-session');
  cleanupDbFiles(dbPath);
  resetDbConnection();

  try {
    initDb();
    seedPortalTenantGraph();

    assert.throws(
      () => {
        db.prepare(`
          insert into portal_session (
            id, portal_user_id, portal_client_id, company_id, token_hash, expires_at, created_at, last_seen_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'portal-session-invalid',
          'portal-user-a',
          'portal-client-b',
          'company-b',
          'token-invalid',
          '2026-04-10T12:00:00.000Z',
          '2026-04-09T12:00:00.000Z',
          '2026-04-09T12:00:00.000Z'
        );
      },
      /foreign key constraint failed|portal_session tenant mismatch/i
    );
  } finally {
    db.close();
    cleanupDbFiles(dbPath);
  }
});
