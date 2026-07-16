#!/bin/sh
set -e

# When RUN_MIGRATIONS=true (set only on the api service), bring the database
# schema up to date and create the initial admin user before starting.
# Safe to run on every boot: `migrate deploy` only applies pending migrations,
# and the seed script skips itself if the admin already exists.
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "==> Applying database migrations..."
  npx prisma migrate deploy --config prisma.config.ts

  echo "==> Seeding initial data..."
  node dist/prisma/seed.js || echo "==> Seed step finished (admin user may already exist)"
fi

exec "$@"
