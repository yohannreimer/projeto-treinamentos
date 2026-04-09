import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.js';

test('hashPassword/verifyPassword validates correct secret', async () => {
  const hash = await hashPassword('Holand#123');

  assert.match(hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(await verifyPassword('Holand#123', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('verifyPassword rejects malformed hashes', async () => {
  const malformedHashes = [
    '',
    'scrypt',
    'scrypt:abcd',
    'scrypt:abcd:1234:extra',
    'argon2:00112233445566778899aabbccddeeff:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'scrypt:xyzxyzxyzxyzxyzxyzxyzxyzxyzxyzxy:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'scrypt:00112233445566778899aabbccddeeff:xyz',
    'scrypt:00112233445566778899aabbccddeeff:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde'
  ];

  for (const hash of malformedHashes) {
    assert.equal(await verifyPassword('Holand#123', hash), false, `expected malformed hash to be rejected: ${hash}`);
  }
});

test('hashPassword uses a unique salt for the same password', async () => {
  const firstHash = await hashPassword('Holand#123');
  const secondHash = await hashPassword('Holand#123');

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword('Holand#123', firstHash), true);
  assert.equal(await verifyPassword('Holand#123', secondHash), true);
});
