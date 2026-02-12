# Task Types Reference

Task types define the kinds of scheduled or on-demand work the system can run (formerly "job types"). Each task type has a **handler key** (backend implementation), **purpose**, and optional **configuration**. Tasks are created in **Automation → Scheduler** and types are managed in **Automation → Task types**.

---

## Overview

| Handler Key | Name | Supports Account | Supports Portfolio | Configurable |
|-------------|------|------------------|--------------------|--------------|
| smartxai | SmartXAI Report | ✓ | ✗ | No |
| portfoliosummary | Portfolio Summary | ✓ | ✓ | Yes (includeAiInsights) |
| watchlistreport | Watchlist Report | ✓ | ✓ | No |
| cleanup | Data Cleanup | ✓ | ✓ | No |
| unifiedOptionsScanner | Unified Options Scanner | ✓ | ✓ | Yes |
| deliverAlerts | Deliver Alerts | ✓ | ✓ | No |
| riskScanner | Risk Scanner | ✓ | ✓ | No |
| grok | Grok (custom prompt) | ✓ | ✓ | Yes (prompt) |

---

## Report & Analysis Task Types

### smartxai

**Purpose:** AI-powered position analysis and sentiment for a single account. Uses Grok to analyze holdings and produce bullish/neutral/bearish recommendations with reasoning.

**Scope:** Account-level only.

**Configuration:** None. Uses account positions and market data.

**Output:** Report with summary (total positions, value, P/L, sentiment counts) and per-position recommendations. Delivered to Slack/X with link to full report.

---

### portfoliosummary

**Purpose:** Multi-account portfolio overview. Aggregates all accounts with risk levels, strategies, total value, daily/weekly change, market snapshot (SPY, QQQ, VIX, TSLA), and goal progress. Optionally includes AI sentiment (SmartXAI) when `includeAiInsights` is true.

**Scope:** Account or portfolio (all accounts).

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| includeAiInsights | boolean | When true, appends AI sentiment summary (bullish/neutral/bearish counts) from SmartXAI |

**Output:** Formatted report with account summaries, key drivers, market snapshot, goal progress, risk reminder, and optional AI insights.

---

### watchlistreport

**Purpose:** Market snapshot + rationale per item. Formats watchlist positions (stocks + options) for Slack/X. Fetches prices and RSI, applies sentiment labels (Oversold, Bearish, Bullish, Overbought), and uses configurable message templates. **Consolidated with daily-analysis:** runs watchlist analysis and creates alerts before building the report.

**Scope:** Account or portfolio (one post per watchlist).

**Configuration:**
- **templateId** (task-level): `concise` | `detailed` | `actionable` | `risk-aware`
- **customSlackTemplate** / **customXTemplate**: Override templates. Placeholders: `{date}`, `{reportName}`, `{account}`, `{stocks}`, `{options}`

**Output:** Message body with stocks and options blocks per template. When alerts are created, appends "Alerts created: X (analyzed Y items)".

---

## Scanner Task Types

Option Scanner, Covered Call Scanner, and Protective Put Scanner are sub-handlers used inside **unifiedOptionsScanner** (see below). You configure them via the unified task type's nested config.

### OptionScanner (via unifiedOptionsScanner)

**Purpose:** Evaluates option positions (calls and puts) in account holdings. Produces HOLD or BUY_TO_CLOSE recommendations using rule-based logic plus optional Grok for edge cases.

**Scope:** Account or portfolio (when run via unifiedOptionsScanner).

**Configuration (defaultConfig or task config, under `optionScanner`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| holdDteMin | number | 14 | Recommend HOLD if DTE above this |
| btcDteMax | number | 7 | Recommend BTC if DTE below this |
| btcStopLossPercent | number | -50 | Recommend BTC (stop loss) if P/L below this % |
| holdTimeValuePercentMin | number | 20 | HOLD if time value % of premium above this |
| highVolatilityPercent | number | 30 | Lean BTC for puts if IV above this |
| grokEnabled | boolean | true | Enable Grok for hybrid decisions |
| grokCandidatesPlPercent | number | 12 | Send to Grok if \|P/L\| > this % |
| grokCandidatesDteMax | number | 14 | Send to Grok if DTE < this |
| grokCandidatesIvMin | number | 55 | Send to Grok if IV > this |
| grokMaxParallel | number | 6 | Max parallel Grok API calls |
| grokSystemPromptOverride | string | — | Override Grok system prompt for HOLD/BTC |

**Output:** Scanned count, stored recommendations, alerts created. Recommendations stored in `optionRecommendations` collection.

---

### coveredCallScanner

**Purpose:** Evaluates covered call positions (long stock + short call) and opportunities (long stock without call). Recommends HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, or NONE. Uses rule-based logic plus optional Grok.

**Scope:** Account-level only.

**Configuration (defaultConfig or task config, under `coveredCall`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| minPremium | number | — | Minimum premium threshold ($) |
| maxDelta | number | — | Max delta for options (0–1) |
| symbols | string[] | — | Symbols to scan (comma-separated) |
| expirationRange.minDays | number | — | Min DTE for expirations |
| expirationRange.maxDays | number | — | Max DTE for expirations |
| minStockShares | number | 100 | Min shares to consider for CC |
| grokEnabled | boolean | — | Enable Grok for edge candidates |
| grokConfidenceMin | number | — | Min confidence (0–100) for Grok |
| grokDteMax | number | — | Max DTE for Grok candidates |
| grokIvRankMin | number | — | Min IV rank for Grok |
| grokMaxParallel | number | — | Max parallel Grok calls |
| grokSystemPromptOverride | string | — | Override Grok prompt for HOLD/BTC/SELL_NEW_CALL/ROLL |
| earlyProfitBtcThresholdPercent | number (0–100) | 70 | BTC when current contract price (buy-back cost) is below this % of premium received; take profits early, then roll |

**Output:** Analyzed count, stored recommendations, alerts created. Per-symbol recommendations (HOLD, BTC, SELL_NEW_CALL, ROLL, NONE).

---

### protectivePutScanner (via unifiedOptionsScanner)

**Purpose:** Evaluates protective put positions (long stock + long put) and opportunities (long stock without put). Recommends HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT, or NONE.

**Scope:** Account or portfolio when run via unifiedOptionsScanner.

**Configuration (defaultConfig or task config, under `protectivePut`):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| minYield | number | — | Minimum annualized yield (%) |
| riskTolerance | "low" \| "medium" \| "high" | — | Adjusts strike selection |
| watchlistId | string | — | Watchlist for symbols |
| minStockShares | number | 100 | Min shares to consider |

**Output:** Analyzed count, stored recommendations, alerts created.

---

### unifiedOptionsScanner

**Purpose:** Runs OptionScanner, CoveredCallScanner, ProtectivePutScanner, and straddle/strangle analysis in one task. One daily run instead of four separate tasks.

**Scope:** Account or portfolio (supports portfolio when accountId is null).

**Configuration (optional nested overrides):**

| Field | Type | Description |
|-------|------|-------------|
| optionScanner | object | OptionScanner config (holdDteMin, btcDteMax, etc.) |
| coveredCall | object | CoveredCallScanner config |
| protectivePut | object | ProtectivePutScanner config |
| deliverAlertsAfter | boolean | When true (default), run processAlertDelivery after the scan |

**Output:** Slack message uses **Block Kit** (per `.cursor/rules/slack-template.mdc`). `formatUnifiedOptionsScannerReport()` and `buildUnifiedOptionsScannerBlocks()` in `src/lib/slack-templates.ts` build: header, stats (scanned/stored/alerts/duration), breakdown by strategy, 🔥 Key Recommendations, delivery (Sent/Failed/Skipped), 🔴 Scanner errors when present, View Dashboard button (when `NEXT_PUBLIC_APP_URL` set), and context. Plain-text fallback is used for notifications and X/UI.

---

### grok

**Purpose:** Run a custom prompt through Grok and deliver the response to Slack/X. Uses web search so Grok can pull current news, weather, earnings dates, etc. Ideal for custom newsletters, daily briefs, or one-off research tasks.

**Scope:** Account or portfolio.

**Configuration:**

| Field | Type | Description |
|-------|------|-------------|
| prompt | string (required for task type) | Instructions sent to Grok. Stored in task type `defaultConfig.prompt`; individual tasks can override via `config.prompt`. Max 16,000 chars. |

**Output:** Grok's reply (plain text) is sent to the task's delivery channels (Slack/X). No report link.

**Creating a Grok task type:** In **Automation → Task types**, create a new type with **Handler Key** `grok`, unique **ID** (e.g. `custom-newsletter`), and the **Grok prompt** in the form. Then create scheduled tasks that use this type; optionally set a per-task prompt override in the scheduler.

---

## Utility Task Types

### deliverAlerts

**Purpose:** Sends pending alerts to Slack/X per AlertConfig. Processes alerts from Option Scanner, Unified Options Scanner, Covered Call Scanner, Protective Put Scanner, Straddle/Strangle Scanner, and Daily Analysis / Watchlist Report.

**Scope:** Account or portfolio.

**Configuration:** None. Uses AlertConfig per job type and account.

**Output:** Processed, delivered, failed, skipped counts.

---

### refreshHoldingsPrices

**Purpose:** Refreshes stock and option prices for all held symbols and writes to `priceCache` and `optionPriceCache`. Used by `getPositionsWithMarketValues()` (holdings page, dashboard, positions API) so they can read from cache when fresh instead of calling Yahoo on every request.

**Scope:** Portfolio (all accounts). No config.

**Schedule:** Agenda repeat every 15 minutes. Throttle: outside market hours (9:30–16:00 ET weekdays), the job skips unless the last run was more than 1 hour ago.

**Collections:** `priceCache` (symbol, price, change, changePercent, updatedAt); `optionPriceCache` (symbol, expiration, strike, optionType, price, updatedAt).

**Output:** `result.stock`: symbolsRequested, symbolsUpdated; `result.options`: optionsRequested, optionsUpdated. Run now: `POST /api/scheduler` with `{ "action": "run", "jobName": "refreshHoldingsPrices" }`.

---

### cleanup

**Purpose:** Deletes old reports and alerts (30+ days) when storage nears limit (75% of configured limit) or on a scheduled interval. Uses `appUtil` cleanup config (storageLimitMB, purgeThreshold, purgeIntervalDays).

**Scope:** Account or portfolio (typically portfolio-level).

**Configuration:** None. Config in `appUtil` collection.

**Output:** Skipped (with reason) or completed with deleted counts (SmartXAI, Portfolio Summary, Alerts, Scheduled Alerts) and storage before/after.

---

## Task Type Metadata (Task Types Page)

Each task type has:

- **id**: Unique identifier (e.g. `smartxai`, `custom-newsletter`). Used when creating tasks.
- **handlerKey**: Backend handler. Must match `REPORT_HANDLER_KEYS`.
- **name**: Display name.
- **description**: Brief description.
- **supportsPortfolio**: Can run at portfolio (all accounts) level.
- **supportsAccount**: Can run at single-account level.
- **order**: Sort order in UI.
- **enabled**: If false, tasks using this type cannot run.
- **defaultConfig**: Type-specific defaults (merged when creating new tasks; required for `grok`).
- **defaultDeliveryChannels**: Default Slack/X for new tasks.
- **defaultTemplateId**: Default report template for watchlist/smartxai/portfoliosummary.

---

## Creating Custom Task Types

You can create task types with custom IDs (e.g. `smartxai-weekly`, `coveredCallScanner-aggressive`, `custom-newsletter`) that reuse an existing handler. The `handlerKey` determines the backend; the `id` is what tasks reference.

Example: Create `coveredCallScanner-aggressive` with `handlerKey: coveredCallScanner` and `defaultConfig: { minPremium: 2, maxDelta: 0.3 }`. Tasks using this type inherit those defaults. For Grok, create a type with `handlerKey: grok` and set **Grok prompt** in defaultConfig.

---

## Data Flow

1. **Task types** (`reportTypes` collection): Define available types and defaults.
2. **Tasks** (`reportJobs` collection): Reference a task type by `jobType` (id), include `accountId` or null for portfolio, `config` (overrides), `scheduleCron`, `channels`.
3. **Scheduler** (Agenda): Runs `scheduled-report`; `executeTask` resolves handler from task type and runs the appropriate logic.
4. **Delivery**: Results sent to Slack/X per task `channels` and `alertPreferences`.

---

## Recommended Setup

**Creating the daily tasks:** In **Automation → Scheduler**, use **Create recommended jobs** to seed the default set (Weekly Portfolio, Daily Options Scanner, Watchlist Snapshot, Risk Scanner, Deliver Alerts, Data Cleanup). All are created as portfolio-level so they appear in the list. If you don’t see **Daily Options Scanner**, run Create recommended jobs once.

| Task | Type | Schedule (cron) | Purpose |
|-----|------|-----------------|---------|
| Weekly Portfolio | portfoliosummary | `0 18 * * 0` (Sun 6 PM) | Multi-account overview; enable "Include AI insights" for SmartXAI sentiment |
| Daily Options | unifiedOptionsScanner | `15 14-20 * * 1-5` (weekdays at :15, 9:15–3:15 ET) | All option recommendations in one run; :15 avoids :00 (e.g. 9am) clashes. Use GitHub Actions cron workflow (`.github/workflows/cron-unified-scanner.yml`) or external cron to call `GET /api/cron/unified-options-scanner`. |
| Watchlist Snapshot | watchlistreport | `0 9,16 * * 1-5` (9 AM & 4 PM) | Market snapshot + rationale per item; also runs daily analysis and creates alerts |
| Deliver Alerts | deliverAlerts | `30 16 * * 1-5` (4:30 PM) | **Optional** if using inline delivery (see below). Sends pending alerts to Slack/X. |
| Refresh Holdings Prices | refreshHoldingsPrices | `15 minutes` (Agenda repeat) | Populates `priceCache` (stocks) and `optionPriceCache` (option premiums). During market hours runs every 15 min; outside market runs at most every 1 hr. Holdings/dashboard use cache when fresh (20 min / 2 hr TTL). Scheduled automatically on first GET /api/scheduler. |
| Purge | cleanup | (existing) | Storage cleanup when nearing limit or on schedule |

---

## deliverAlerts and simplification

**Is deliverAlerts required?** Yes, as the component that actually sends alert documents (from the `alerts` collection) to Slack/X per `AlertConfig`. Scanners only create alert documents; they do not post to channels.

**Simplification: inline delivery after unified options scanner**

When a task runs **unifiedOptionsScanner**, `executeTask` now calls **processAlertDelivery(accountId)** right after the scan (unless `config.deliverAlertsAfter === false`). So:

- **Unified Options Scanner can run hourly** and post to alerts each run: scan → store recommendations + create alerts → deliver those alerts to Slack/X.
- You can **drop the separate "Deliver Alerts" cron** (e.g. 4:30 PM) if you only need delivery right after the options scan.
- Keep a **standalone Deliver Alerts task** if you want to (a) deliver only (e.g. retry failed sends), or (b) run delivery after other tasks (e.g. risk-scanner at 5 PM) without re-running the options scanner.

**Flow**

1. Scanners (unifiedOptionsScanner, riskScanner, watchlistreport) write recommendations and, when `createAlerts: true`, insert documents into `alerts`.
2. **processAlertDelivery(accountId)** (used by the deliverAlerts task and now inline after unifiedOptionsScanner) reads undelivered alerts (last 24h, up to 50 per type), applies `AlertConfig` (channels, quiet hours, thresholds), and sends to Slack/X; it updates each alert’s `deliveryStatus` so they are not sent again.
