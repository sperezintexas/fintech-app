# Ghostbranch: Feature comparison & robust portfolio sync

## Goal

Compare **myInvestments** with [Ghostfolio](https://github.com/ghostfolio/ghostfolio) and adopt a **more robust way to sync your portfolio** so you can move from manual position entry to **activity/transaction-based sync** (import trades, derive positions).

---

## Feature comparison

| Area | myInvestments | Ghostfolio |
|------|---------------|------------|
| **Stack** | Next.js, MongoDB, Yahoo Finance | Angular, NestJS, Prisma, PostgreSQL, Redis |
| **Portfolio model** | **Snapshot positions** per account (stocks, options, cash). Add/edit/delete positions manually. | **Activity-based**: BUY, SELL, DIVIDEND, FEE, etc. Portfolio derived from activity history. |
| **Sync** | Manual: add position (ticker, shares, cost) or option (strike, expiry, contracts, premium). | **Import API**: `POST /api/v1/import` with `activities[]` (symbol, date, quantity, unitPrice, type). Bulk import from CSV/brokers. |
| **Multi-account** | Yes (accounts with positions array). | Yes. |
| **Options** | **Strong**: Option Scanner, Covered Call, Protective Put, Straddle/Strangle; xStrategyBuilder; recommendations & alerts. | Limited (focused on stocks/ETFs/crypto). |
| **Watchlist & alerts** | Watchlist, strategies (CC, CSP, wheel), daily analysis, Unified Options Scanner, Slack/X delivery. | N/A (different product focus). |
| **Charts / performance** | Dashboard, goal progress ($1M by 2030). | ROAI (Today, WTD, MTD, YTD, 1Y, 5Y, Max), various charts. |
| **Import/export** | Watchlist CSV export. No position/trade import. | Import activities (API + likely UI); export. |
| **Data source** | Yahoo Finance (prices, options). | Yahoo, CoinGecko, manual, Ghostfolio Premium. |

**Summary:** Ghostfolio’s main advantage for “robust sync” is **activity-based data + Import API**. You keep manual position entry today; Ghostfolio lets you **import trades** and derive holdings from them. We can get the same benefit inside this repo without running Ghostfolio.

---

## Why activity-based sync is more robust

- **Single source of truth:** Each trade (BUY/SELL) is one record. No guessing “did I update that position?”
- **Audit trail:** Full history of what you bought/sold and when.
- **Bulk import:** Paste or upload a CSV (or call an API) instead of typing each position.
- **Consistency:** Positions are computed from activities, so totals and cost basis stay consistent.

---

## Ghostbranch proposal: activities + import in this repo

Keep your stack (Next.js, MongoDB) and options/scanner features; add **Ghostfolio-style activities and import** so you can sync by importing trades instead of only manual position entry.

### 1. Data model (new)

- **Collection: `activities`** (or `transactions`)
  - `accountId`, `symbol`, `type` (BUY | SELL | DIVIDEND | FEE | OPTION_EXPIRED | etc.)
  - `date` (ISO), `quantity`, `unitPrice`, `fee` (optional)
  - For options: `optionType`, `strike`, `expiration`, or reference to an option symbol.
  - `dataSource`: MANUAL | YAHOO | IMPORT | etc.
  - `createdAt`, `updatedAt`

- **Position derivation**
  - **Option A (recommended for migration):** Compute “current positions” from activities when needed (e.g. in `getPositionsWithMarketValues`): aggregate BUY/SELL per symbol/option to get open position and cost basis. Keep existing `positions` on account for backward compatibility and optionally phase out.
  - **Option B:** Keep writing to `account.positions` as today, but **also** write an activity for each add/edit/close so you have a log. Later you can switch to deriving positions from activities.

### 2. Import API

- **`POST /api/import/activities`** (auth required)
  - Body: `{ accountId, activities: [ { symbol, date, type, quantity, unitPrice, fee?, ... } ] }`
  - Validate and insert into `activities`; optionally update or recompute `account.positions` so the UI stays in sync.
- **`POST /api/import/csv`** (or a dedicated parser)
  - Accept CSV (e.g. broker export: date, symbol, side, qty, price, fees).
  - Map columns to activity shape, then call same logic as above.

Format can align with [Ghostfolio’s Import API](https://github.com/ghostfolio/ghostfolio) (e.g. `type`: BUY | SELL | DIVIDEND | FEE, etc.) so you can reuse docs or scripts.

### 3. UI

- **Setup → Import** (or **Holdings → Import**): file upload or paste CSV; map columns; preview; import. (API available: `POST /api/import/activities`, `POST /api/import/csv`.)
- **Activity history** (per account): table of activities (date, symbol, type, qty, price, fee) on the **Holdings** page under the "Activity history" tab.

### 4. Backward compatibility

- Existing accounts and `positions` array keep working.
- New flow: import activities → derive positions (or dual-write to both). No need to migrate old data immediately; you can run both in parallel and move to “positions from activities” when ready.

---

## Implementation phases

| Phase | Scope |
|------|--------|
| **1** | Add `activities` collection and types; `POST /api/import/activities` (body similar to Ghostfolio); on import, append activities and optionally recompute/update `account.positions` for that account so Holdings view stays correct. |
| **2** | CSV import: parse broker-style CSV → activity list → call same import logic. |
| **3** | ✅ **Done.** Derive positions from activities in `getPositionsWithMarketValues` when account has activities; merge cash from stored positions. Dual-write kept. “Activity history” tab on Holdings (date, symbol, type, qty, price, fee). |
| **4** | (Optional) Sync from Ghostfolio: if you use Ghostfolio, call their API and map their activities to yours (same activity shape). |

---

## References

- [Ghostfolio GitHub](https://github.com/ghostfolio/ghostfolio) — Open source wealth management; activity-based model; Import API.
- Ghostfolio Import API (from their docs): `POST /api/v1/import` with `activities[]`: `symbol`, `date`, `type` (BUY | SELL | DIVIDEND | FEE | etc.), `quantity`, `unitPrice`, `fee`, `dataSource` (YAHOO | MANUAL | etc.), optional `accountId`, `comment`.

---

## Summary

- **Comparison:** Your app leads on options (scanners, xStrategyBuilder, alerts); Ghostfolio leads on **activity-based portfolio and import**.
- **Ghostbranch:** Add **activities + import API**, CSV import, and **derive positions from activities** in this repo so you can **sync by importing trades** instead of only manual position entry, while keeping your stack and all options features. Holdings can show activity-derived positions and an Activity history tab per account.

## Brokers supported

**Merrill** and **Fidelity** only. **Builder workflow** (no intermediate JSON).

### Mapping: accountRef

Broker exports contain multiple accounts (e.g. IRA-Edge `51X-98940`, Roth IRA-Edge `79Z-79494`). Create app accounts with **accountRef** set to the broker account number; import matches by `accountRef` (and by account name). Broker accounts with no matching app account are skipped.

### UI flow (Setup → Broker import)

1. **Select account** — Choose the app account to import into (or create accounts with matching `accountRef` first).
2. **Holdings (optional)** — Upload Holdings CSV (Merrill only), Parse & preview, Import holdings. Positions are set from the CSV.
3. **Activities & sync** — Upload Activities CSV, Parse & preview, optionally **Recompute positions** (off when Holdings were imported so positions stay from Holdings). Import activities into the selected account.

### CLI flow (config-driven)

1. **Config** — `data/merrill-test/import-config.json` (or custom path): `holdings.path`, `activities.path`, broker options. Paths relative to config directory. No `accountId` in config; mapping is from the **accounts** table by `accountRef`.
2. **Preview** — `pnpm run broker-import <config> --preview` parses both files and outputs JSON (no DB).
3. **Import** — `pnpm run broker-import <config>`: loads accounts with `accountRef`, imports Holdings (positions from CSV) then Activities (sync only when Holdings were imported). Exits with summary and `process.exit(0)`.

APIs: `POST /api/import/parse-broker`, `POST /api/import/broker`. Legacy `POST /api/import/format` for `pnpm run merrill-to-activities`.
