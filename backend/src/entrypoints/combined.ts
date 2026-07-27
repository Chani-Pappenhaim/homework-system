import 'dotenv/config';
import { prisma } from '../config/prisma';
import { closeQueues } from '../infrastructure/queues/queues';
import { closeSharedConnection } from '../infrastructure/redis/connection';
import { registerGracefulShutdown } from '../infrastructure/shutdown';
import { startWorkers, stopWorkers } from '../workers/start-workers';
import { startApiServer } from './api';

/**
 * Combined entry for the free Render deployment: the single web service runs
 * the HTTP API AND every BullMQ worker in one process. Choosing this entry is
 * itself the signal to run both — no env flag needed. The workers are created
 * exactly once via startWorkers() (the same call the standalone worker uses),
 * so nothing is processed twice.
 *
 * To split into two Render services later, point the "web" service at
 * entrypoints/api and the "worker" service at entrypoints/worker — no code
 * changes required.
 */
async function main(): Promise<void> {
  const server = startApiServer();
  const workers = await startWorkers();

  // Graceful shutdown on redeploy/SIGTERM: stop accepting HTTP first, then let
  // the workers finish and tear down BullMQ, Redis and Prisma.
  registerGracefulShutdown(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await stopWorkers(workers);
    await closeQueues();
    await closeSharedConnection();
    await prisma.$disconnect();
  });
}

main().catch((err) => {
  console.error('[combined] fatal startup error:', err);
  process.exit(1);
});
