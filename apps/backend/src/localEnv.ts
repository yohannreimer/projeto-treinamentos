import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(separatorIndex + 1));
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
  }
}

export function loadLocalEnv() {
  const roots = new Set<string>();
  let current = resolve(process.cwd());
  for (let depth = 0; depth < 4; depth += 1) {
    roots.add(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const root of roots) {
    loadEnvFile(resolve(root, '.env'));
    loadEnvFile(resolve(root, '.env.local'));
  }
}
