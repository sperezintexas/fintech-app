# myInvestments

An Portfolio and options management: accounts, holdings, real-time market data, and scanner-driven alerts using xAI to maximize profits to solve the money problem.

## Features

- **Dashboard** — Market snapshot (with **market open/closed** status pill on the home page), portfolio summary, **$1M by 2030** probability (see `docs/goal-progress.md`). Market hours and holidays: `docs/market-calendar.md`.
- **Accounts** — My Portfolios and My Holdings tabs; risk level, strategy, account ref for import mapping; positions per account.
- **Holdings** — Stocks, options, cash with symbol, qty, cost basis, market value, day change, unrealized P/L; real-time values via Yahoo. Activity history tab for imported broker data.
- **Import from broker** — Merrill and Fidelity only. **UI:** Setup → Broker import: select account, upload Holdings (optional) then Activities CSV, parse & preview, import; mapping by **accountRef** in the accounts table.

- **xStrategyBuilder** — Options strategy wizard (Covered Call, CSP, etc.) with expiration and strike selection.
- **Setup** — Auth Users (X sign-in), Alert Settings (Slack, X, Push), Strategy (option chain filters), Scheduled Jobs, Import From Broker.
- **Reports** — Portfolio summary, SmartX AI.
- **Alerts** — Daily analysis and Unified Options Scanner (HOLD/CLOSE/BTC, roll, etc.); delivery to Slack, X, or push.
- **Health** — Service status at `/api/health` and `/health`.
