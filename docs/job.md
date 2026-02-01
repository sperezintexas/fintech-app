# Job Types Reference

Job types define the kinds of scheduled or on-demand work the system can run. Each job type has a **handler key** (backend implementation), **purpose**, and optional **configuration**. Jobs are created in **Automation** and configured in **Job Types**.

---

## Overview

| Handler Key | Name | Supports Account | Supports Portfolio | Configurable |
|-------------|------|------------------|--------------------|--------------|
| smartxai | SmartXAI Report | ✓ | ✗ | No |
| portfoliosummary | Portfolio Summary | ✓ | ✓ | Yes (includeAiInsights) |
| watchlistreport | Watchlist Report | ✓ | ✗ | No |
| cleanup | Data Cleanup | ✓ | ✓ | No |
| daily-analysis | Daily Analysis | ✓ | ✓ | No |
| OptionScanner | Option Scanner | ✓ | ✗ | Yes |
| coveredCallScanner | Covered Call Scanner | ✓ | ✗ | Yes |
| protectivePutScanner | Protective Put Scanner | ✓ | ✗ | Yes |
| straddleStrangleScanner | Straddle/Strangle Scanner | ✓ | ✗ | No |
| unifiedOptionsScanner | Unified Options Scanner | ✓ | ✗ | Yes |
| deliverAlerts | Deliver Alerts | ✓ | ✓ | No |

---

## Report & Analysis Job Types

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

**Scope:** Account-level only.

**Configuration:**
- **templateId** (job-level): `concise` | `detailed` | `actionable` | `risk-aware`
- **customSlackTemplate** / **customXTemplate**: Override templates. Placeholders: `{date}`, `{reportName}`, `{account}`, `{stocks}`, `{options}`

**Output:** Message body with stocks and options blocks per template. When alerts are created, appends "Alerts created: X (analyzed Y items)".

---

### daily-analysis

**Purpose:** Watchlist analysis only (creates alerts). Runs `analyzeWatchlistItem` for each watchlist item, creates alerts for actionable items. **Prefer Watchlist Report** which now includes this functionality.

**Scope:** Account or portfolio.

**Configuration:** None.

**Output:** Summary: analyzed count, alerts created, errors.

---

## Scanner Job Types

### OptionScanner

**Purpose:** Evaluates option positions (calls and puts) in account holdings. Produces HOLD or BUY_TO_CLOSE recommendations using rule-based logic plus optional Grok for edge cases.

**Scope:** Account-level only.

**Configuration (defaultConfig or job config):**

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

**Configuration (defaultConfig or job config):**

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

**Output:** Analyzed count, stored recommendations, alerts created. Per-symbol recommendations (HOLD, BTC, SELL_NEW_CALL, ROLL, NONE).

---

### protectivePutScanner

**Purpose:** Evaluates protective put positions (long stock + long put) and opportunities (long stock without put). Recommends HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT, or NONE.

**Scope:** Account-level only.

**Configuration (defaultConfig or job config):**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| minYield | number | — | Minimum annualized yield (%) |
| riskTolerance | "low" \| "medium" \| "high" | — | Adjusts strike selection |
| watchlistId | string | — | Watchlist for symbols |
| minStockShares | number | 100 | Min shares to consider |

**Output:** Analyzed count, stored recommendations, alerts created.

---

### straddleStrangleScanner

**Purpose:** Evaluates long straddle (ATM call + ATM put) and long strangle (OTM call + OTM put) positions. Recommends HOLD, SELL_TO_CLOSE, ROLL, ADD, or NONE.

**Scope:** Account-level only.

**Configuration:** None.

**Output:** Analyzed count, stored recommendations, alerts created.

---

### unifiedOptionsScanner

**Purpose:** Runs OptionScanner, CoveredCallScanner, ProtectivePutScanner, and StraddleStrangleScanner in one job. One daily job instead of four.

**Scope:** Account-level only.

**Configuration (optional nested overrides):**

| Field | Type | Description |
|-------|------|-------------|
| optionScanner | object | OptionScanner config (holdDteMin, btcDteMax, etc.) |
| coveredCall | object | CoveredCallScanner config |
| protectivePut | object | ProtectivePutScanner config |

**Output:** Combined summary: total scanned, stored, alerts created; per-scanner breakdown.

---

## Utility Job Types

### deliverAlerts

**Purpose:** Sends pending alerts to Slack/X per AlertConfig. Processes alerts from Option Scanner, Unified Options Scanner, Covered Call Scanner, Protective Put Scanner, Straddle/Strangle Scanner, and Daily Analysis / Watchlist Report.

**Scope:** Account or portfolio.

**Configuration:** None. Uses AlertConfig per job type and account.

**Output:** Processed, delivered, failed, skipped counts.

---

### cleanup

**Purpose:** Deletes old reports and alerts (30+ days) when storage nears limit (75% of configured limit) or on a scheduled interval. Uses `appUtil` cleanup config (storageLimitMB, purgeThreshold, purgeIntervalDays).

**Scope:** Account or portfolio (typically portfolio-level).

**Configuration:** None. Config in `appUtil` collection.

**Output:** Skipped (with reason) or completed with deleted counts (SmartXAI, Portfolio Summary, Alerts, Scheduled Alerts) and storage before/after.

---

## Job Type Metadata (Job Types Page)

Each job type has:

- **id**: Unique identifier (e.g. `smartxai`, `coveredCallScanner-weekly`). Used when creating jobs.
- **handlerKey**: Backend handler. Must match `REPORT_HANDLER_KEYS`.
- **name**: Display name.
- **description**: Brief description.
- **supportsPortfolio**: Can run at portfolio (all accounts) level.
- **supportsAccount**: Can run at single-account level.
- **order**: Sort order in UI.
- **enabled**: If false, jobs using this type cannot run.
- **defaultConfig**: Type-specific defaults (merged when creating new jobs).
- **defaultDeliveryChannels**: Default Slack/X for new jobs.
- **defaultTemplateId**: Default report template for watchlist/smartxai/portfoliosummary.

---

## Creating Custom Job Types

You can create job types with custom IDs (e.g. `smartxai-weekly`, `coveredCallScanner-aggressive`) that reuse an existing handler. The `handlerKey` determines the backend; the `id` is what jobs reference.

Example: Create `coveredCallScanner-aggressive` with `handlerKey: coveredCallScanner` and `defaultConfig: { minPremium: 2, maxDelta: 0.3 }`. Jobs using this type inherit those defaults.

---

## Data Flow

1. **Job Types** (`reportTypes` collection): Define available types and defaults.
2. **Jobs** (`reportJobs` collection): Reference a job type by `jobType` (id), include `accountId` or null for portfolio, `config` (overrides), `scheduleCron`, `channels`.
3. **Scheduler** (Agenda): Runs `scheduled-report` jobs; `executeJob` resolves handler from job type and runs the appropriate logic.
4. **Delivery**: Results sent to Slack/X per job `channels` and `alertPreferences`.

---

## Recommended Setup

| Job | Type | Schedule (cron) | Purpose |
|-----|------|-----------------|---------|
| Weekly Portfolio | portfoliosummary | `0 18 * * 0` (Sun 6 PM) | Multi-account overview; enable "Include AI insights" for SmartXAI sentiment |
| Daily Options | unifiedOptionsScanner | `0 16 * * 1-5` (Mon–Fri 4 PM) | All option recommendations (Option, Covered Call, Protective Put, Straddle/Strangle) in one run |
| Watchlist Snapshot | watchlistreport | `0 9,16 * * 1-5` (9 AM & 4 PM) | Market snapshot + rationale per item; also runs daily analysis and creates alerts |
| Deliver Alerts | deliverAlerts | `30 16 * * 1-5` (4:30 PM) | Sends pending alerts to Slack/X (run after scanners) |
| Purge | cleanup | (existing) | Storage cleanup when nearing limit or on schedule |
