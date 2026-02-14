# myInvestments

Portfolio and options management: accounts, holdings, real-time market data, and scanner-driven alerts using xAI to maximize profits to solve the money problem.  Support for Merrill and Fidelity brokers.

## What you can do

- **Dashboard** — Market snapshot (open/closed status), portfolio summary, and progress toward your goals (e.g. $10M by 2030).
- **Accounts & holdings** — View positions by account with cost basis, market value, and day change. Import from **Merrill** or **Fidelity** via CSV (holdings and activities).
- **Options** — Strategy wizard (covered calls, CSP, etc.), expiration and strike selection. Alerts and recommendations (HOLD / close / roll) from the Unified Options Scanner.
- **Alerts** — Daily analysis and options scanner results delivered to **Slack**, **X**, or push. Configure in Setup → Alert Settings.
- **Reports** — Portfolio summary and SmartX AI reports.
- **Setup** — Auth (e.g. sign in with X), broker import, scheduled jobs, alert channels, strategy filters.

Health and status: `/api/health` and `/health`.

## Getting started

- **Run locally:** You need Node.js 22+, pnpm (or npm), and MongoDB. See **[DEVELOPMENT.md](./DEVELOPMENT.md)** for install, environment variables, and one-time setup (including wiping and seeding a fresh DB).
- **Run with Docker:** `docker compose up -d` for MongoDB + app (see DEVELOPMENT.md for details).
- **Production:** The app is built for deployment on **AWS App Runner**; see `docs/aws-app-runner-migration.md` and `docs/aws-apprunner-clean-deploy.md`.

## For developers

Setup, tech stack, env vars, Docker, CI, and architecture are in **[DEVELOPMENT.md](./DEVELOPMENT.md)**. Additional docs: **docs/** (jobs, Smart Grok Chat, scanners, security).
