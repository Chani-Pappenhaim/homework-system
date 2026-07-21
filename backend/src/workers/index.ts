import 'dotenv/config';
import { prisma } from '../config/prisma';
import { closeQueues } from '../infrastructure/queues/queues';
import { closeSharedConnection } from '../infrastructure/redis/connection';
import { registerGracefulShutdown } from '../infrastructure/shutdown';
import { startWorkers, stopWorkers } from './start-workers';

// Standalone worker process entry (the docker-compose `worker` service runs
// `node dist/src/workers/index.js`). On a single-service deploy the API process
// starts the workers inline instead — see src/index.ts.
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
  console.error('[workers] fatal startup error:', err);
  process.exit(1);
});
