type Cleanup = () => Promise<void>;

// Wire SIGTERM/SIGINT to a single cleanup routine that runs exactly once, so a
// redeploy (Render/Docker send SIGTERM) closes sockets and connections cleanly
// instead of leaving them dangling.
export function registerGracefulShutdown(cleanup: Cleanup): void {
  let shuttingDown = false;

  const handler = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing connections`);
    try {
      await cleanup();
    } catch (err) {
      console.error('[shutdown] cleanup error:', err);
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGTERM', handler);
  process.once('SIGINT', handler);
}
