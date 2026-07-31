# Homework Submission System

A system for managing courses, lessons, assignments, and submissions, with automatic AI grading, quizzes, and grade reports. Built for a single teacher (ADMIN) and multiple students (STUDENT).

---

## Prerequisites

- **Docker Desktop** installed and running (includes Docker Compose)
- **Node.js 22** — only needed if the automatic migration fails and you need to run it manually from your machine (see Step 3)
- An `.env` file in the project root (obtained from the project owner, or assembled from `.env.example`)

---

## Architecture (Docker Compose)

| Service | Role | Port |
|---|---|---|
| `nginx` | Entry gateway — serves the frontend and proxies API calls | 80, 443 |
| `frontend` | React (built to static files, served via nginx) | internal |
| `api` | Node/Express server | 4000 |
| `worker` | Background processing (AI grading, quizzes, emails, deadline reports) | internal |
| `postgres` | Primary database | 5432 |
| `redis` | Task queue (BullMQ) and cache | internal |

---

## First run — step by step

> All commands run in **PowerShell** from the project root.

### Step 1 — Environment file `.env`

An `.env` file is required in the project root. **It is not committed to Git** (it contains secrets).

- **If you received the file from the project owner** — just place it in the root (next to `docker-compose.yml`). Nothing else to fill in.
- **If you're assembling it yourself** — copy the template and fill in values:

  ```powershell
  Copy-Item .env.example .env
  ```

  Key values:
  - `JWT_SECRET`, `JWT_REFRESH_SECRET` — long random strings (dev defaults are provided in `.env.example`)
  - `GEMINI_API_KEY` — for AI grading (Google Gemini)
  - `CLOUDINARY_*` — for submission file storage
  - `GITHUB_*` / `GOOGLE_*` — OAuth login (optional)
  - `SMTP_*` — sending emails (if left empty, the system runs but doesn't send emails)

> ⚠️ Never commit `.env` to Git.

### Step 2 — Build and start

```powershell
docker compose -p homework-app up -d --build
```

The first build takes a few minutes (pulling images and installing packages). Check that all containers are up:

```powershell
docker ps
```

### Step 3 — Database (migrations + seed)

The first time the API starts, it **should automatically run** the migrations (building the database schema) and the seed (creating the teacher user). Watch the logs:

```powershell
docker compose -p homework-app logs -f api
```

If you see `==> Applying database migrations...` followed by `==> Seeding initial data...` in the logs, everything is fine — skip to Step 4.

#### If the automatic run fails

If migrations fail to run automatically (for example, due to a network-level SSL interception from a local firewall/proxy), you can run them manually from your machine instead:

```powershell
cd backend
npm install

# Build the database schema (localhost since we're running from the host, not inside Docker)
$env:DATABASE_URL = "postgresql://user:pass@localhost:5432/homework_db"
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
npx prisma migrate deploy --config prisma.config.ts

# Create the initial teacher user
npm run db:seed

cd ..
```

Then restart the API so it picks up the new schema:

```powershell
docker compose -p homework-app restart api worker
```

### Step 4 — Log in

Open in your browser: **http://localhost**

Teacher login (created by the seed):

| Field | Value |
|---|---|
| Email | `admin@school.com` |
| Password | `admin123` |

A student added to a group receives the default password `12345678` and is prompted to change it on first login.

---

## Useful commands

| Action | Command |
|---|---|
| Start | `docker compose -p homework-app up -d` |
| Stop | `docker compose -p homework-app down` |
| Stop + delete data | `docker compose -p homework-app down -v` |
| API logs | `docker compose -p homework-app logs -f api` |
| Worker logs | `docker compose -p homework-app logs -f worker` |
| Rebuild (after code changes) | `docker compose -p homework-app build api frontend` then `up -d` |
| Clean rebuild (when changes don't load) | `docker compose -p homework-app build --no-cache api frontend` |

---

## Local development (without Docker, optional)

Run only Postgres and Redis in Docker, and run the API and frontend locally:

```powershell
# Terminal 1 — Backend
cd backend
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

> In local development, `DATABASE_URL` should point to `localhost:5432` (not `postgres:5432`).

---

## Known issues

- **SSL certificate errors during `docker build`:** if a local network filter or corporate proxy intercepts SSL traffic, you may see `unable to get local issuer certificate` when Docker/Prisma/npm try to download packages. `NODE_TLS_REJECT_UNAUTHORIZED=0` is already set in the Dockerfile as a workaround. Migrations run automatically inside the container through the driver adapter (a direct Postgres connection, no external downloads), so they aren't affected by this.

- **"read-only file system" during build:** run `docker builder prune -f` and rebuild.

- **Code changes not taking effect:** rebuild with `--no-cache` and start with `--force-recreate`.

- **`/bin/sh: bad interpreter: ...^M` when running the api:** happens if the entrypoint was saved with Windows line endings (CRLF). The project's `.gitattributes` enforces LF, so this shouldn't happen; if it does, make sure `git clone` ran after `.gitattributes` was already in place.
