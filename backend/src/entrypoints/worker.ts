import 'dotenv/config';
import { prisma } from '../config/prisma';
import { closeQueues } from '../infrastructure/queues/queues';
import { closeSharedConnection } from '../infrastructure/redis/connection';
import { registerGracefulShutdown } from '../infrastructure/shutdown';
import { startWorkers, stopWorkers } from '../workers/start-workers';

/**
 * Standalone worker process: every BullMQ worker, no HTTP server. This is the
 * entry a dedicated Render "background worker" service would run once the API
 * and Worker are split into two services. Until then, the combined entry
 * (Render Free) starts the exact same workers inline — see combined.ts.
 */
async function main(): Promise<void> {
  const handles = await startWorkers();

  registerGracefulShutdown(async () => {
    await stopWorkers(handles);
    await closeQueues();
    await closeSharedConnection();
    await prisma.$disconnect();
  });
}

main().catch((err) => {
  console.error('[worker] fatal startup error:', err);
  process.exit(1);
});
