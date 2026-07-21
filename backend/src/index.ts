import 'dotenv/config';
import { createApp } from './app';
import { prisma } from './config/prisma';
import { closeQueues } from './infrastructure/queues/queues';
import { closeSharedConnection } from './infrastructure/redis/connection';
import { registerGracefulShutdown } from './infrastructure/shutdown';
import { startWorkers, stopWorkers, WorkerHandles } from './workers/start-workers';

const PORT = process.env.PORT || 4000;

const app = createApp();
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Single free-tier web service (Render): run the workers inside the API process.
// Opt in with RUN_WORKERS_INLINE=true so a deployment that also runs a dedicated
// worker process (e.g. the docker-compose `worker` service) does not process
// every job twice. Never start workers under test.
let workerHandles: WorkerHandles | null = null;
if (process.env.NODE_ENV !== 'test' && process.env.RUN_WORKERS_INLINE === 'true') {
  startWorkers()
    .then((handles) => { workerHandles = handles; })
    .catch((err) => console.error('[workers] inline start failed:', err));
}

registerGracefulShutdown(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (workerHandles) await stopWorkers(workerHandles);
  await closeQueues();
  await closeSharedConnection();
  await prisma.$disconnect();
});
