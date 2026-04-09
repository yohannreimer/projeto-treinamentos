import cors from 'cors';
import express from 'express';
import { initDb, seedDb } from './db.js';
import { registerCoreRoutes } from './coreRoutes.js';

export function createApp() {
  initDb();
  seedDb();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '15mb' }));
  registerCoreRoutes(app);

  return app;
}
