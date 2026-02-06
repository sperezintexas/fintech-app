# myInvestments

## Overview
Manages investment portfolios, accounts, and positions (stocks, options, cash). Aggregates portfolio values, supports risk profiles and strategies per account, and integrates real-time data from Yahoo Finance. Built with Next.js, React, TypeScript, and MongoDB.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Database**: MongoDB
- **Market Data**: Yahoo Finance API

## Features
- **Dashboard** — Market snapshot, portfolio summary
- **Accounts** — My Portfolios (account list) and My Holdings (aggregate positions) tabs; risk level, strategy, positions
- **Holdings / Positions** — Stocks, options, cash; columns: Symbol·Desc, Symbols (qty), Cost basis, Market value, Day change, Unrealized P/L; real-time values via Yahoo
- **xStrategyBuilder** — Options strategy wizard (Covered Call, CSP, etc.)
- **Setup (Automation)** — Watchlist (sort by column, remove duplicates), alerts, scheduled jobs, report definitions, push notifications
- **Reports** — Portfolio summary, SmartX AI
- **Health** — Service status check

## Project Structure
```
src/
├── app/
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
├── lib/                      # mongodb, push-client, scheduler, etc.
└── types/
    └── portfolio.ts
```

## Documentation
- **docs/** — Job types (`job.md`), Smart Grok Chat (`chat.md`), scanners (covered call, protective put, unified options), Cursor rules (`cursorrules.md`)
- **.cursor/rules/** — Page structure, API routes, alerts, strategy builders, Grok config

## Architecture
- **Frontend**: Next.js App Router, React Server + Client Components
- **API**: Next.js routes for backend logic, Yahoo integration, MongoDB
- **Data flow**: UI → API → MongoDB; API fetches Yahoo data, computes values/recommendations

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Installation
```bash
npm install
```

### Environment Variables
Create `.env.local`:
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=myinvestments
```

### Development
```bash
npm run dev
```
Open http://localhost:3000

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
The watchlist alert system and **Unified Options Scanner** (Option, Covered Call, Protective Put, Straddle/Strangle) generate HOLD/CLOSE/BTC recommendations. Uses **Agenda.js** (MongoDB-backed) for persistent job scheduling on long-running hosts.

**Default schedule (Unified Options Scanner):** Weekdays at :15 during market hours (9:15–3:15 ET), cron `15 14-20 * * 1-5` (UTC), to avoid :00 clashes with other jobs.

**Setup:** Go to **Setup → Automation → Scheduler** → "Create recommended jobs" to create Daily Options Scanner, Watchlist Snapshot, Deliver Alerts, etc.

**Deployment:** Agenda requires a persistent process. On **Vercel** (serverless), Agenda does not run—use **Vercel Cron** with `GET /api/cron/unified-options-scanner` (schedule in `vercel.json`: `15 14-20 * * 1-5`). On Docker, Railway, Render, Fly.io, or a VPS use `npm run start` for Agenda.

**Docker:**
```bash
docker compose up -d
# Or with .env.local: docker compose --env-file .env.local up -d
```

**Scheduler API:**

| Method | Endpoint | Body |
|--------|----------|------|
| GET | `/api/scheduler` | — |
| POST | `/api/scheduler` | `{ "action": "setup-defaults" }` |
| POST | `/api/scheduler` | `{ "action": "run", "jobName": "daily-analysis" }` |
| POST | `/api/scheduler` | `{ "action": "schedule", "jobName": "daily-analysis", "schedule": "0 16 * * 1-5" }` or `{ "action": "createRecommendedJobs" }` for Unified Options Scanner (`15 14-20 * * 1-5`) |
| POST | `/api/scheduler` | `{ "action": "cancel", "jobName": "daily-analysis" }` |

**Alert config:** Delivery (Slack, Push, Twitter), templates, thresholds, quiet hours — in Setup → Alert Settings.

## Version
See `package.json` for current version.
