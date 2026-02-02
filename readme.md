# myInvestments

## Overview
Manages investment portfolios, accounts, and positions (stocks, options, cash). Aggregates portfolio values, supports risk profiles and strategies per account, and integrates real-time data from Yahoo Finance. Built with Next.js, React, TypeScript, and MongoDB.

## Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Database**: MongoDB
- **Market Data**: Yahoo Finance API

## Features
- **Dashboard** — Market snapshot, portfolio summary
- **Accounts** — Manage accounts with risk level, strategy, positions
- **Holdings / Positions** — Stocks, options, cash; real-time values via Yahoo
- **xStrategyBuilder** — Options strategy wizard (Covered Call, CSP, etc.)
- **Setup (Automation)** — Watchlist, alerts, scheduled jobs, report definitions, push notifications
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

## Scheduled Alerts
The watchlist alert system analyzes positions daily and generates HOLD/CLOSE/BTC recommendations. Uses **Agenda.js** (MongoDB-backed) for persistent job scheduling.

**Setup:** Go to **Setup → Scheduled Jobs** → "Setup Default Schedule" to create `daily-analysis` (4 PM Mon–Fri) and `cleanup-alerts` (2 AM Sun).

**Deployment:** Agenda requires a persistent process. Scheduler will not run on Vercel/serverless—use Docker, Railway, Render, Fly.io, or a VPS with `npm run start`.

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
| POST | `/api/scheduler` | `{ "action": "schedule", "jobName": "daily-analysis", "schedule": "0 16 * * 1-5" }` |
| POST | `/api/scheduler` | `{ "action": "cancel", "jobName": "daily-analysis" }` |

**Alert config:** Delivery (Slack, Push, Twitter), templates, thresholds, quiet hours — in Setup → Alert Settings.

## Version
1.0.7
