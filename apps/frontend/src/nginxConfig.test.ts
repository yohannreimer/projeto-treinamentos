import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('frontend nginx configuration', () => {
  test('accepts the 1.5 GB Base64 request required by a 1 GB internal document', () => {
    const config = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

    expect(config).toMatch(/client_max_body_size\s+1500m;/);
  });
});
