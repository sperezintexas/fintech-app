# Development

Setup, build, CI, and architecture for myInvestments.

## Tech stack

| Layer        | Technology |
|-------------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| **Backend API** | Kotlin 2, Spring Boot 3, Arrow-KT, Spring Data MongoDB (optional; see [Backend](#backend-kotlin-api)) |
| **Database** | MongoDB |
| **Scheduler** | Spring (Kotlin backend): reads `reportJobs` from MongoDB, triggers Next.js `/api/internal/run-task`. Legacy: Agenda.js in `apps/smart-scheduler` (deprecated). |
| **Market data** | Yahoo Finance (via Next.js API or backend when migrated) |

The app can run in two modes:

- **Current (default):** Next.js serves both UI and API routes; no Kotlin backend required.
- **With backend:** Next.js frontend + Kotlin API; set `NEXT_PUBLIC_API_URL` to point at the backend for migrated endpoints.

## Prerequisites

- **Node.js 22+** (yahoo-finance2; see `engines` in package.json)
- **pnpm** (recommended; or npm)
- **MongoDB** (local, Atlas, or via Docker)
- **Java 21** (only if running the Kotlin backend)

## Installation

From repo root:

```bash
pnpm install
# or: npm install
```

## Environment variables

**Best practice: single source of truth.** Keep one file at repo root: **`.env.local`**. Both frontend and backend can use it.

- **Next.js:** Loads **repo root `.env.local`** first (from `next.config.ts`), then overlays `apps/frontend/.env` and `apps/frontend/.env.local`. So you can put all vars in root **`.env.local`** and the frontend will see them. Any var in `apps/frontend/.env.local` overrides the root.
- **Backend** `bootRun` automatically loads `.env.local` or `.env` from the project dir or repo root. Run from repo root or `apps/backend`; it will find the file.

No need to sync to `~/.gradle/gradle.properties` unless you want backend vars available for other Gradle runs (e.g. from a different working directory). Then run **`pnpm run sync-env-gradle`** to copy backend-related vars from `.env.local` into `~/.gradle/gradle.properties` (optional; see script `scripts/sync-env-gradle.ts`).

Create `.env.local` from `.env.example`. Minimum for local dev:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=myinvestments
AUTH_SECRET=<generate with: npx auth secret>
```

**Required:** `AUTH_SECRET` — Auth.js needs this or you'll see `MissingSecret`. Generate one: `npx auth secret` (or use any random string ≥32 chars). Put it in root **`.env.local`** (the frontend loads it from there).

**Access key (bootstrap) login:** Set `ACCESS_KEY_SEED=<your-one-time-key>` in root **`.env.local`**. Restart the dev server, then on the contact page use "Or sign in with access key" and paste that exact value. After signing in, create a real key in Setup → Access keys and you can remove `ACCESS_KEY_SEED`. If login still fails, set `AUTH_DEBUG=true` in root `.env.local` and check the terminal for `[auth] validate-credentials` (e.g. `hasACCESS_KEY_SEED: false` means the app didn't load it — wrong file or restart needed).

**Where auth logs appear:** All `[auth]` logs are printed in the **terminal where you run `pnpm dev`** (the Next.js server). They do not appear in the browser console or in the Kotlin backend. Put `AUTH_DEBUG=true` in root `.env.local`, restart `pnpm dev`, then open `/contact` or try to sign in — you should see `[auth] AUTH_DEBUG env: "true" -> debug enabled: true` when the auth module loads. If you see nothing, the app isn't reading that file (wrong path or no restart).

**Optional (Kotlin backend):** Set `NEXT_PUBLIC_API_URL=http://localhost:8080` so the frontend calls the backend for migrated APIs. For the **backend scheduler** to trigger report tasks and built-in jobs, set on the backend: `NEXTJS_URL=http://localhost:3000` (or `http://app:3000` in Docker) and `CRON_SECRET` (same value as in Next.js optional `CRON_SECRET` for `/api/internal/run-task`). Set `CRON_SECRET` in Next.js when you want to restrict internal run-task to the backend.

**Production (Sign in with X):** Set `NEXTAUTH_URL` to your production URL; in X Developer Portal set callback URL to `{NEXTAUTH_URL}/api/auth/callback/twitter`. Also set `AUTH_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`.

**Health:** `/api/health/live` is public for liveness. Full `/api/health` returns detailed checks only when authenticated. See `docs/security-and-auth.md`.

## Development

### Frontend (Next.js)

From repo root (or `cd apps/frontend` and `pnpm dev`):

```bash
pnpm dev
```

Open http://localhost:3000. The app lives in `apps/frontend/`; root `pnpm dev` delegates to it via the pnpm workspace.

### Backend (Kotlin API)

Optional. From repo root or `apps/backend`:

```bash
cd apps/backend
./gradlew bootRun
```

Backend runs on http://localhost:8080. Requires Java 21 and MongoDB. See `apps/backend/README.md` and `api-spec/openapi.yaml`.

### Scheduler (recommended: Kotlin backend)

When running the Kotlin backend with `NEXTJS_URL` and `CRON_SECRET` set, the backend runs the scheduler:

- **Report tasks:** Every minute it loads active tasks from MongoDB (`reportJobs` with `status=active` and `scheduleCron`), evaluates cron (UTC), and POSTs to Next.js `POST /api/internal/run-task` with `taskId` for any due task.
- **Refresh holdings:** Every 15 minutes it triggers `refreshHoldingsPrices` via the same internal endpoint.

No separate Node process is required. The Next.js app does not start Agenda; "Run now" in the UI calls the same job logic directly.

**Legacy (deprecated):** `pnpm run start:scheduler` runs the standalone Agenda worker (`apps/smart-scheduler`). Use only if you are not using the Kotlin backend scheduler.

### Full stack with Docker

With Docker and Docker Compose you can run MongoDB + backend + frontend:

```bash
# Optional: use Compose MongoDB for backend and app
export MONGODB_URI=mongodb://mongo:27017
docker compose up -d mongo    # start MongoDB only
docker compose up -d backend  # Kotlin API on 8080
pnpm dev                      # frontend on 3000 (uses host MONGODB_URI for Next.js)
# Or run app in Docker too:
docker compose up -d          # mongo + backend + app (app on 3000)
```

See [Docker](#docker) below for service details.

## Build

**Frontend:**

```bash
pnpm run build
pnpm start
# or: npm run build && npm start
```

**Backend:**

```bash
cd apps/backend && ./gradlew build -x test
# JAR: apps/backend/build/libs/*.jar
```

## Docker

The repo includes Docker Compose and Dockerfiles for the full stack.

### Services

| Service   | Image / build        | Port | Description |
|-----------|----------------------|------|-------------|
| **mongo** | `mongo:7`            | 27017 | MongoDB (optional; use for local stack) |
| **backend** | `apps/backend/Dockerfile` | 8080 | Kotlin Spring Boot API |
| **app**   | Root `Dockerfile`    | 3000 | Next.js (web + optional pm2 scheduler for legacy mode) |

### Compose

- **Start everything (MongoDB + backend + app):**

  ```bash
  docker compose up -d
  ```

  Frontend: http://localhost:3000. Backend: http://localhost:8080. MongoDB: localhost:27017.

- **Start only MongoDB** (run frontend/backend on host):

  ```bash
  docker compose up -d mongo
  export MONGODB_URI=mongodb://localhost:27017
  pnpm dev
  cd apps/backend && ./gradlew bootRun
  ```

- **Start backend + app** (use existing MongoDB):

  ```bash
  export MONGODB_URI=mongodb://localhost:27017   # or Atlas
  docker compose up -d backend app
  ```

### Root Dockerfile (app)

Multi-stage: Node 22, pnpm, build Next.js; runtime runs **web** and **scheduler** via pm2 (see `ecosystem.config.js`). Non-root user, production env.

```bash
docker build -t myinvestments .
docker run -e MONGODB_URI=... -e MONGODB_DB=myinvestments -p 3000:3000 myinvestments
```

### Backend Dockerfile

`apps/backend/Dockerfile`: Eclipse Temurin 21 JDK (build) → JRE (run), Gradle bootJar, non-root user. No MongoDB in image; pass `MONGODB_URI` at run time.

```bash
docker build -f apps/backend/Dockerfile -t myinvestments-backend apps/backend
docker run -e MONGODB_URI=... -e MONGODB_DB=myinvestments -p 8080:8080 myinvestments-backend
```

## Project structure

```
api-spec/
└── openapi.yaml              # OpenAPI 3 spec (health, accounts, market, etc.)

apps/
├── backend/                  # Kotlin Spring Boot API (see apps/backend/README.md)
│   ├── src/main/kotlin/...   # domain, application, adapter, infrastructure
│   ├── build.gradle.kts
│   └── Dockerfile
├── frontend/                 # Next.js app (see pnpm-workspace.yaml)
│   ├── src/
│   │   ├── app/              # App Router (page.tsx, accounts, holdings, positions, api, etc.)
│   │   ├── components/
│   │   ├── lib/
│   │   └── types/
│   ├── public/
│   ├── package.json
│   ├── next.config.ts
│   └── tests/                # Playwright e2e
└── smart-scheduler/          # (Deprecated) Standalone Agenda worker; use backend scheduler instead
    └── src/index.ts

scripts/                      # CLI scripts (broker-import, seed-local-db, etc.); run from root
config/                       # alert-templates, report-templates
ecosystem.config.js           # pm2: web (apps/frontend) + scheduler (Docker app)
docker-compose.yml            # mongo, backend, app
Dockerfile                    # Builds apps/frontend; pm2 runs web + scheduler
pnpm-workspace.yaml           # packages: apps/frontend, apps/smart-scheduler
```

## Architecture

- **Frontend:** Next.js App Router, React Server + Client Components. Calls its own API routes by default; can call Kotlin backend when `NEXT_PUBLIC_API_URL` is set for migrated endpoints.
- **API (Next.js):** Routes under `apps/frontend/src/app/api/` for backend logic, Yahoo integration, MongoDB. Auth via proxy + `requireSession()` in mutating handlers (see `docs/security-and-auth.md`).
- **API (Kotlin):** Optional. OpenAPI-first, hexagonal layout, Arrow-KT. Same MongoDB. Used when migrating off Next.js API route-by-route.
- **Data flow:** UI → Next.js API (or Backend API) → MongoDB; Yahoo data and recommendations in Next.js or backend.
- **Scheduler:** **Kotlin backend** (recommended): Spring `@Scheduled` runs every minute (report tasks from `reportJobs` by cron) and every 15 min (refreshHoldingsPrices). Backend POSTs to Next.js `POST /api/internal/run-task` (taskId or jobName); job logic remains in Next.js. **Legacy:** Agenda.js in `apps/smart-scheduler`; web enqueues via `apps/frontend/src/lib/agenda-client.ts` when that process is used.

## Scheduled alerts & options scanner

Watchlist alerts and the **Unified Options Scanner** (Option, Covered Call, Protective Put, Straddle/Strangle) produce HOLD/CLOSE/BTC recommendations. **Scheduling** is driven by the Kotlin backend: it reads `reportJobs` (cron + status) and triggers the Next.js run-task endpoint at the right times.

**Default (Unified Options Scanner):** Weekdays at :15 during market hours (9:15–3:15 ET), cron `0,15,30,45 14-20 * * 1-5` (UTC). Stored in `reportJobs`; backend evaluates and triggers.

**Setup:** Automation → Scheduler (Manage Jobs). Create recommended jobs (Daily Options Scanner, Watchlist Snapshot, Deliver Alerts, etc.). Table supports sort, auto-refresh, failed-job highlighting.

**Deployment:** Production is **AWS App Runner** (see `docs/aws-app-runner-migration.md`). With the Kotlin backend, run the backend with `NEXTJS_URL` and `CRON_SECRET` so it triggers all scheduled tasks; the app image can run web only. For external cron, use GitHub Actions to hit `GET /api/cron/unified-options-scanner` (with `CRON_SECRET`) if desired.

**Scheduler API (Next.js)**

| Method | Endpoint       | Body |
|--------|----------------|------|
| GET    | `/api/scheduler` | — |
| POST   | `/api/scheduler` | `{ "action": "setup-defaults" }` |
| POST   | `/api/scheduler` | `{ "action": "run", "jobName": "daily-analysis" }` |
| POST   | `/api/scheduler` | `{ "action": "schedule", "jobName": "...", "schedule": "0 16 * * 1-5" }` or `{ "action": "createRecommendedJobs" }` |
| POST   | `/api/scheduler` | `{ "action": "cancel", "jobName": "..." }` |

## CI build notifications (Slack)

GitHub Actions CI can post pass/fail to Slack. Add repository secret `SLACK_WEBHOOK_URL` (Incoming Webhook URL). See existing workflow and **Notify Slack** job.

## Documentation

- **docs/** — Job types, Smart Grok Chat (`chat.md`), scanners, goal progress, CI, Ghostbranch, security (`security-and-auth.md`).
- **.cursor/rules/** — Page structure, API routes, alerts, Kotlin backend (`kotlin-spring-enterprise.mdc`), scheduler separation.
- **.cursor/skills/** — ci-failure, test-lint, test-commit-push, docker-setup, fix-current-file.

## Version

- **Frontend/app:** `package.json` (root) and `apps/frontend/package.json` — keep in sync; Next.js uses frontend `version` for `NEXT_PUBLIC_APP_VERSION`.
- **Backend:** `apps/backend/build.gradle.kts` (or `gradle.properties`).
