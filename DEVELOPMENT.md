# Development

Setup, build, CI, and architecture for myInvestments.

## Prerequisites

- Node.js 22+ (yahoo-finance2 requires Node 22)
- MongoDB (local or Atlas)

## Installation

Package manager: **pnpm** (see `packageManager` in package.json). From repo root:

```bash
pnpm install
# or: npm install
```

## Environment Variables

Create `.env.local` (see `.env.example` for full list). Minimum for local dev:

```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=myinvestments
```

**Production (Sign in with X):** Set `NEXTAUTH_URL` to your production URL. In X Developer Portal, set callback URL to `{NEXTAUTH_URL}/api/auth/callback/twitter`. Also set `AUTH_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`.

**Health check:** `/api/health` and `/health` are public. Set `MONGODB_URI` so the route can ping MongoDB. For CI, set GitHub variable `APP_URL` to your deployed URL if needed.

**Slack (CI notifications):** Use GitHub Actions secret `SLACK_WEBHOOK_URL` for build pass/fail posts to Slack (see [CI build notifications (Slack)](#ci-build-notifications-slack) below). X_CLIENT_* are for app login only, not CI.

## Development

**Web (Next.js):**

```bash
pnpm dev
# or: npm run dev
```

Open http://localhost:3000

**Scheduler (Agenda worker, optional):** In a second terminal, with env set (e.g. same `.env.local`):

```bash
pnpm run start:scheduler
# or: npm run start:scheduler
```

## Build

```bash
npm run build
npm start
```

## CI Build Notifications (Slack)

GitHub Actions CI (lint, typecheck, test, build, Docker) can post pass/fail to Slack.

1. In Slack: **Apps** → **Incoming Webhooks** → **Add to Slack** → pick channel → copy the webhook URL.
2. In GitHub: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name `SLACK_WEBHOOK_URL`, value = webhook URL.
3. Push to `main` or `develop` (or open a PR); the **Notify Slack** job runs after the pipeline. If the secret is not set, the job skips posting.

## Project Structure

```
apps/
└── smart-scheduler/          # Standalone Agenda worker (see apps/smart-scheduler/README.md)
    └── src/index.ts
src/
├── app/                      # Next.js App Router
│   ├── page.tsx              # Dashboard
│   ├── accounts/             # Account management
│   ├── holdings/             # Holdings view
│   ├── positions/            # Position management
│   ├── xstrategybuilder/     # xStrategyBuilder options wizard
│   ├── automation/           # Setup: Auth Users, Alert Settings, Strategy, Scheduled Jobs, Import From Broker
│   ├── reports/[id]/         # Report viewer
│   ├── health/               # Health check
│   └── api/                  # API routes
├── components/               # Dashboard, AccountForm, PositionForm, ImportFromCsvPanel, etc.
├── lib/                      # mongodb, agenda-client, scheduler, activities, csv-import, etc.
└── types/
    └── portfolio.ts
ecosystem.config.js           # pm2: web + scheduler (Docker)
```

## Architecture

- **Frontend:** Next.js App Router, React Server + Client Components
- **API:** Next.js routes for backend logic, Yahoo integration, MongoDB
- **Data flow:** UI → API → MongoDB; API fetches Yahoo data, computes values/recommendations
- **Scheduler:** Two-process model. The **web** app does not start Agenda; it only enqueues/schedules jobs via `src/lib/agenda-client.ts`. The **smart-scheduler** (`apps/smart-scheduler`) is the only process that runs `agenda.start()` and job handlers. See `apps/smart-scheduler/README.md` and `.cursor/rules/smart-scheduler-separation.mdc`.

## Scheduled Alerts & Options Scanner

The watchlist alert system and **Unified Options Scanner** (Option, Covered Call, Protective Put, Straddle/Strangle) generate HOLD/CLOSE/BTC recommendations. Uses **Agenda.js** (MongoDB-backed) for persistent job scheduling.

**Default schedule (Unified Options Scanner):** Weekdays at :15 during market hours (9:15–3:15 ET), cron `15 14-20 * * 1-5` (UTC).

**Setup:** Go to **Setup → Scheduled Jobs** → create recommended jobs (Daily Options Scanner, Watchlist Snapshot, Deliver Alerts, etc.).

**Deployment:** Production is **AWS App Runner** (see `docs/aws-app-runner-migration.md`). The Docker image runs **web** and **scheduler** via pm2; no separate worker service. For external cron, use GitHub Actions (`.github/workflows/cron-unified-scanner.yml`) to hit `GET /api/cron/unified-options-scanner` if desired.

**Docker (single image, two processes):**

```bash
docker run -e MONGODB_URI=... -e MONGODB_DB=myinvestments -p 3000:3000 myinvestments
# Or: docker compose up -d (with .env.local)
```

**Scheduler API**

| Method | Endpoint       | Body |
|--------|----------------|------|
| GET    | `/api/scheduler` | — |
| POST   | `/api/scheduler` | `{ "action": "setup-defaults" }` |
| POST   | `/api/scheduler` | `{ "action": "run", "jobName": "daily-analysis" }` |
| POST   | `/api/scheduler` | `{ "action": "schedule", "jobName": "daily-analysis", "schedule": "0 16 * * 1-5" }` or `{ "action": "createRecommendedJobs" }` |
| POST   | `/api/scheduler` | `{ "action": "cancel", "jobName": "daily-analysis" }` |

**Alert config:** Delivery (Slack, Push, X), templates, thresholds, quiet hours — in Setup → Alert Settings.

## Documentation

- **docs/** — Job types (`job.md`), Smart Grok Chat (`chat.md`), scanners, goal progress (`goal-progress.md`), CI pipeline (`ci.md`), Ghostbranch (`ghostbranch-feature.md`), Cursor rules (`cursorrules.md`).
- **.cursor/rules/** — Page structure, API routes, alerts, strategy builders, Grok config, GitHub CI (`github-ci.mdc`).
- **.cursor/skills/** — ci-failure, test-lint, test-commit-push, docker-setup, fix-current-file.

## Version

See `package.json` for current version.
