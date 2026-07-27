import 'dotenv/config';
import type { Server } from 'http';
import { createApp } from '../app';
import { prisma } from '../config/prisma';
import { closeQueues } from '../infrastructure/queues/queues';
import { closeSharedConnection } from '../infrastructure/redis/connection';
import { registerGracefulShutdown } from '../infrastructure/shutdown';

const PORT = process.env.PORT || 4000;

/**
 * Start the HTTP API and return the server handle. Exported so the combined
 * entry (Render Free) can run the API in the same process as the workers
 * without duplicating the listen logic. No workers are started here.
 */
export function startApiServer(): Server {
  const app = createApp();
  return app.listen(PORT, () => console.log(`[api] Server running on port ${PORT}`));
}

// Standalone API process: HTTP server plus the shared producer connection that
// backs the queues — but no workers. This is the entry a dedicated Render
// "web" service would run once the API and Worker are split into two services.
if (require.main === module) {
  const server = startApiServer();

  registerGracefulShutdown(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeQueues();
    await closeSharedConnection();
    await prisma.$disconnect();
  });
}
