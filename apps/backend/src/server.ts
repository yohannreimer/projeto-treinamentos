import http from 'node:http';
import { loadLocalEnv } from './localEnv.js';
import { createApp } from './app.js';
import { portalRealtimeHub } from './portal/realtime.js';

loadLocalEnv();

const PORT = Number(process.env.PORT ?? 4000);
const app = createApp({ enforceInternalAuth: true });
const server = http.createServer(app);
portalRealtimeHub.attach(server);

server.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
