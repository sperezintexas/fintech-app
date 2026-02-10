# myInvestments

## Overview
Manages investment portfolios, accounts, and positions (stocks, options, cash). Aggregates portfolio values, supports risk profiles and strategies per account, and integrates real-time data from Yahoo Finance. Built with Next.js, React, TypeScript, and MongoDB.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Database**: MongoDB
- **Market Data**: Yahoo Finance API

## Features
- **Dashboard** — Market snapshot, portfolio summary; **$1M by 2030** probability (updated when risk scanner runs, see `docs/goal-progress.md`)
- **Accounts** — My Portfolios (account list) and My Holdings (aggregate positions) tabs; risk level, strategy, positions
- **Holdings / Positions** — Stocks, options, cash; columns: Symbol·Desc, Symbols (qty), Cost basis, Market value, Day change, Unrealized P/L; real-time values via Yahoo
- **xStrategyBuilder** — Options strategy wizard (Covered Call, CSP, etc.)
- **Setup (Automation)** — Watchlist (sort by column, remove duplicates), alerts, scheduled jobs, report definitions, push notifications
- **Reports** — Portfolio summary, SmartX AI
- **Health** — Service status check

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
│   ├── automation/           # Setup: watchlist, alerts, reports
│   ├── reports/[id]/         # Report viewer
│   ├── health/               # Health check
│   └── api/                  # API routes
├── components/               # Dashboard, AccountForm, PositionForm, etc.
├── lib/                      # mongodb, agenda-client, scheduler (job defs), etc.
└── types/
    └── portfolio.ts
ecosystem.config.js           # pm2: web + scheduler (Docker)
```

## Documentation
- **docs/** — Job types (`job.md`), Smart Grok Chat (`chat.md`), scanners (covered call, protective put, unified options), goal progress (`goal-progress.md`), CI pipeline (`ci.md`), Cursor rules (`cursorrules.md`). **Ghostbranch** (`ghostbranch-feature.md`): feature comparison with [Ghostfolio](https://github.com/ghostfolio/ghostfolio) and plan for activity-based portfolio sync (import trades).
- **.cursor/rules/** — Page structure, API routes, alerts, strategy builders, Grok config, GitHub CI (`github-ci.mdc` for debugging Actions failures)
- **.cursor/skills/** — `ci-failure` (diagnose GitHub Actions failures using workflow + docs/ci.md), test-lint, test-commit-push, docker-setup, fix-current-file

## Architecture
- **Frontend**: Next.js App Router, React Server + Client Components
- **API**: Next.js routes for backend logic, Yahoo integration, MongoDB
- **Data flow**: UI → API → MongoDB; API fetches Yahoo data, computes values/recommendations
- **Scheduler**: Two-process model. The **web** app does not start Agenda; it only enqueues/schedules jobs via `src/lib/agenda-client.ts`. The **smart-scheduler** (`apps/smart-scheduler`) is the only process that runs `agenda.start()` and job handlers. See `apps/smart-scheduler/README.md` and `.cursor/rules/smart-scheduler-separation.mdc`.

## Getting Started

### Prerequisites
- Node.js 22+ (yahoo-finance2 requires Node 22)
- MongoDB (local or Atlas)

### Installation
Package manager: **pnpm** (see `packageManager` in package.json). From repo root:

```bash
pnpm install
# or: npm install (if you don't use pnpm)
```

### Environment Variables
Create `.env.local` (see `.env.example` for full list). Minimum for local dev:
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=myinvestments
```

**Production URL (callback and health check)**
- **Callback (Sign in with X):** Set `NEXTAUTH_URL` to your production URL (e.g. AWS App Runner: `https://xxx.region.awsapprunner.com`). In X Developer Portal, set callback URL to `{NEXTAUTH_URL}/api/auth/callback/twitter`. Also set `AUTH_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`.
- **Health check:** `/api/health` and `/health` are public. Set `MONGODB_URI` so the route can ping MongoDB. For CI health check, set GitHub variable `APP_URL` to your App Runner URL.

**Slack build status (CI):** Build pass/fail is posted to **Slack**, not X. Use GitHub Actions secret `SLACK_WEBHOOK_URL` (see “CI build notifications (Slack)” below). X_CLIENT_* are only for app login (Sign in with X), not for CI notifications.

### Development
**Web (Next.js):**
```bash
pnpm dev
# or: npm run dev
```
Open http://localhost:3000

**Scheduler (Agenda worker, optional for full automation):** In a second terminal, with env set (e.g. same `.env.local`):
```bash
pnpm run start:scheduler
# or: npm run start:scheduler
```

### Build
```bash
npm run build
npm start
```

### CI build notifications (Slack)
GitHub Actions CI (lint, typecheck, test, build, Docker) can post pass/fail to Slack.

1. In Slack: **Apps** → **Incoming Webhooks** → **Add to Slack** → pick channel → copy the webhook URL (`https://hooks.slack.com/services/...`).
2. In GitHub: repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name `SLACK_WEBHOOK_URL`, value = webhook URL.
3. Push to `main` or `develop` (or open a PR); the **Notify Slack** job runs after the pipeline and posts an attachment with branch, author, commit link, and status (green/red/cancelled). If the secret is not set, the job skips posting.

## Scheduled Alerts & Options Scanner
The watchlist alert system and **Unified Options Scanner** (Option, Covered Call, Protective Put, Straddle/Strangle) generate HOLD/CLOSE/BTC recommendations. Uses **Agenda.js** (MongoDB-backed) for persistent job scheduling.

**Architecture:** The **web** app does not run job handlers; it only enqueues/schedules via `src/lib/agenda-client.ts`. The **smart-scheduler** (`apps/smart-scheduler`) is the only process that runs Agenda and executes jobs. In **Docker**, both run in one container via **pm2** (web + scheduler); see `ecosystem.config.js`.

**Default schedule (Unified Options Scanner):** Weekdays at :15 during market hours (9:15–3:15 ET), cron `15 14-20 * * 1-5` (UTC).

**Setup:** Go to **Setup → Automation → Scheduler** → "Create recommended jobs" to create Daily Options Scanner, Watchlist Snapshot, Deliver Alerts, etc.

**Deployment:** Production is **AWS App Runner** (see `docs/aws-app-runner-migration.md`). The Docker image runs **web** and **scheduler** via pm2; no separate worker service needed. For cron triggers from outside, use GitHub Actions (`.github/workflows/cron-unified-scanner.yml`) to hit `GET /api/cron/unified-options-scanner` if desired.

**Docker (single image, two processes):**
```bash


docker run -e MONGODB_URI=... -e MONGODB_DB=myinvestments -p 3000:3000 myinvestments
# Or: docker compose up -d (with .env.local)
```

**Scheduler API:**

| Method | Endpoint | Body |
|--------|----------|------|
| GET | `/api/scheduler` | — |
| POST | `/api/scheduler` | `{ "action": "setup-defaults" }` |
| POST | `/api/scheduler` | `{ "action": "run", "jobName": "daily-analysis" }` |
| POST | `/api/scheduler` | `{ "action": "schedule", "jobName": "daily-analysis", "schedule": "0 16 * * 1-5" }` or `{ "action": "createRecommendedJobs" }` for Unified Options Scanner (`15 14-20 * * 1-5`) |
| POST | `/api/scheduler` | `{ "action": "cancel", "jobName": "daily-analysis" }` |

**Alert config:** Delivery (Slack, Push, X), templates, thresholds, quiet hours — in Setup → Alert Settings.

## Version
See `package.json` for current version.
