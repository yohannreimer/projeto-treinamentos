import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const PASSWORD_HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const DIGEST_BYTES = 64;
const HASH_PART_COUNT = 3;
const HEX_PATTERN = /^[0-9a-f]+$/i;

function parseFixedHex(value: string, expectedHexLength: number): Buffer | null {
  if (value.length !== expectedHexLength || value.length % 2 !== 0 || !HEX_PATTERN.test(value)) {
    return null;
  }

  return Buffer.from(value, 'hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const digest = await scryptAsync(password, salt, DIGEST_BYTES) as Buffer;

  return `${PASSWORD_HASH_PREFIX}:${salt}:${digest.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== HASH_PART_COUNT) {
    return false;
  }

  const [algorithm, saltHex, expectedDigestHex] = parts;
  if (algorithm !== PASSWORD_HASH_PREFIX) {
    return false;
  }

  const salt = parseFixedHex(saltHex, SALT_BYTES * 2);
  const expectedDigest = parseFixedHex(expectedDigestHex, DIGEST_BYTES * 2);
  if (!salt || !expectedDigest) {
    return false;
  }

  // Keep the same salt representation used by hashPassword (hex string text).
  const digest = await scryptAsync(password, saltHex, DIGEST_BYTES) as Buffer;
  return timingSafeEqual(digest, expectedDigest);
}
