import cors from 'cors';
import express from 'express';
import { initDb, resetDbConnection, seedDb } from './db.js';
import { registerCoreRoutes } from './coreRoutes.js';

export type CreateAppOptions = {
  forceDbRefresh?: boolean;
  initDb?: boolean;
  seedDb?: boolean;
};

export function createApp(options: CreateAppOptions = {}) {
  const { forceDbRefresh = false, initDb: shouldInitDb = true, seedDb: shouldSeedDb = true } = options;

  if (forceDbRefresh) {
    resetDbConnection();
  }

  if (shouldInitDb) {
    initDb();
  }
  if (shouldSeedDb) {
    seedDb();
  }

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  registerCoreRoutes(app);

  return app;
}
