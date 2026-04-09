import path from 'node:path';
import { tmpdir } from 'node:os';

function toFileSafeTestName(testName: string) {
  return testName.replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export function assignTestDbPath(testName: string) {
  const safeTestName = toFileSafeTestName(testName);
  const dbPath = path.join(tmpdir(), `orq-${safeTestName}-${Date.now()}.db`);
  process.env.APP_DB_PATH = dbPath;
  return dbPath;
}

export async function importAppWithTestDb(testName: string) {
  assignTestDbPath(testName);
  const { resetDbConnection } = await import('../db.js');
  resetDbConnection();
  return import('../app.js');
}
