import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { initDb, resetDbConnection, seedDb } from './db.js';
import { registerCoreRoutes } from './coreRoutes.js';
import { registerPortalRoutes } from './portal/routes.js';

export type CreateAppOptions = {
  forceDbRefresh?: boolean;
  initDb?: boolean;
  seedDb?: boolean;
  enforceInternalAuth?: boolean;
};

export function createApp(options: CreateAppOptions = {}) {
  const {
    forceDbRefresh = false,
    initDb: shouldInitDb = true,
    seedDb: shouldSeedDb = true,
    enforceInternalAuth = false
  } = options;

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
  app.set('trust proxy', process.env.TRUST_PROXY?.trim() || 'loopback, linklocal, uniquelocal');
  app.use(cors());
  app.use(express.json({ limit: '35mb' }));
  registerCoreRoutes(app, { enforceInternalAuth });
  registerPortalRoutes(app);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[api] unexpected error:', message);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ message: 'Erro interno do servidor.' });
  });

  return app;
}
