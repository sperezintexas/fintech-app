# myInvestments

Portfolio and options management: accounts, holdings, real-time market data, and scanner-driven alerts. Built with Next.js, React, TypeScript, and MongoDB.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Database:** MongoDB
- **Market data:** Yahoo Finance API

## Features

- **Dashboard** — Market snapshot (with **market open/closed** status pill on the home page), portfolio summary, **$1M by 2030** probability (see `docs/goal-progress.md`). Market hours and holidays: `docs/market-calendar.md`.
- **Accounts** — My Portfolios and My Holdings tabs; risk level, strategy, account ref for import mapping; positions per account.
- **Holdings** — Stocks, options, cash with symbol, qty, cost basis, market value, day change, unrealized P/L; real-time values via Yahoo. Activity history tab for imported broker data.
- **Import from broker** — Merrill and Fidelity only. **UI:** Setup → Broker import: select account, upload Holdings (optional) then Activities CSV, parse & preview, import; mapping by **accountRef** in the accounts table. **CLI:** `pnpm run broker-import <config.json>` with `data/merrill-test/import-config.json` (holdings + activities paths); `--preview` outputs JSON. See `docs/ghostbranch-feature.md` and `data/merrill-test/README.md`. To run the app against a remote DB (e.g. prod): use `MONGODB_URI` and `MONGODB_DB` from `.env.prod` (e.g. `cp .env.prod .env.local` or run `next dev` with env loaded). Export local accounts to CSV: `pnpm run export-accounts-csv` (writes `data/accounts-export.csv`); use `ENV_FILE=.env.prod pnpm run export-accounts-csv` to export from remote.
- **xStrategyBuilder** — Options strategy wizard (Covered Call, CSP, etc.) with expiration and strike selection.
- **Setup** — Auth Users (X sign-in), Alert Settings (Slack, X, Push), Strategy (option chain filters), Scheduled Jobs, Import From Broker.
- **Reports** — Portfolio summary, SmartX AI.
- **Alerts** — Daily analysis and Unified Options Scanner (HOLD/CLOSE/BTC, roll, etc.); delivery to Slack, X, or push.
- **Health** — Service status at `/api/health` and `/health`.

For setup, build, CI, and architecture, see **[DEVELOPMENT.md](DEVELOPMENT.md)**. For job types, scanners, and Cursor rules, see **docs/** and **.cursor/rules/**.
