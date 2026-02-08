# Covered Call Scanner — Approach & Design

## Overview

The **Covered Call Scanner** is a **hybrid** service: Stage 1 applies rule-based logic; Stage 2 uses Grok (xAI) to refine borderline/edge cases. It evaluates covered call positions and opportunities across account holdings and the watchlist. It produces actionable recommendations (HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL) with confidence levels and reasoning.

**Core purpose:** Identify covered call positions (long stock + short call), standalone calls, and watchlist call targets; apply evaluation rules; optionally enhance with Grok for edge cases; persist recommendations and create alerts for delivery via Slack/X.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Covered Call Scanner Flow                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌─────────────────────┐    ┌──────────────────┐   │
│  │ Accounts DB  │    │ getCoveredCallPositions  │    │ analyzeCoveredCalls │   │
│  │ (positions)  │───▶│ getWatchlistCallItems    │───▶│ applyCoveredCallRules│   │
│  └──────────────┘    └─────────────────────┘    └────────┬─────────┘   │
│         │                          │                       │           │
│         │                          │                       ▼           │
│  ┌──────┴──────┐           ┌────────┴────────┐    ┌──────────────────┐   │
│  │ Watchlist   │           │ Yahoo Finance   │    │ storeCoveredCall  │   │
│  │ (call items)│           │ getOptionMetrics │    │ Recommendations   │   │
│  └─────────────┘           │ getIVRank       │    │ + createAlerts    │   │
│                            │ getOptionMarket │    └──────────────────┘   │
│                            │ Conditions     │                            │
│                            └────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Main module:** `src/lib/covered-call-analyzer.ts`

**Hybrid flow:** After `applyCoveredCallRules`, candidates meeting Grok criteria (low confidence, low DTE, high IV rank, or ATM) are sent to Grok for refined recommendation. If Grok fails, the rule-based result is kept. Grok-influenced recs are flagged with `grokEvaluated: true` and `grokReasoning`.

---

## Data Sources & Inputs

| Source | Collection | What it provides |
|--------|------------|------------------|
| **Accounts** | `accounts` | Positions (stock + option legs) per account |
| **Watchlist** | `watchlist` | Call/covered-call items (`type: "call"` or `"covered-call"`) |
| **Yahoo Finance** | External API | Option metrics (bid, ask, IV), IV rank, market conditions |

**Position matching:** Stock + call are linked by same `accountId` and underlying symbol. Option ticker format: OCC (e.g. `TSLA250117C250`) or underlying symbol; `getUnderlyingFromTicker()` extracts the symbol.

---

## Position Types

The scanner handles four categories:

### 1. Covered Call Pairs (`CoveredCallPair`)

Long stock (≥100 shares) + short call on the same symbol in the same account.

- `stockPositionId`, `stockShares`, `stockPurchasePrice`
- `callPositionId`, `callStrike`, `callExpiration`, `callContracts`, `callPremiumReceived`

### 2. Stock Opportunities (`StockOpportunity`)

Long stock (≥100 shares) with **no** matching short call. Recommendation: `SELL_NEW_CALL`.

### 3. Standalone Calls (`StandaloneCallPosition`)

Short call in the account with **no** matching long stock. Evaluated for BTC/ROLL.

### 4. Watchlist Calls

Watchlist items with `type: "call"` or `type: "covered-call"`. Use `underlyingSymbol` or `symbol`, `strikePrice`, `expirationDate`, `entryPremium`.

---

## Recommendation Rules (`applyCoveredCallRules`)

Pure function, unit-testable. Inputs: `stockPrice`, `strike`, `dte`, `callBid`, `callAsk`, `premiumReceived`, `extrinsicPercentOfPremium`, `unrealizedStockGainPercent`, `moneyness`, `ivRank`, `symbolChangePercent`, `riskLevel`.

| Condition | Recommendation | Confidence | Rationale |
|-----------|----------------|------------|-----------|
| Stock ≥ strike + 5% & DTE ≤ 7 | BUY_TO_CLOSE | HIGH | Deep ITM, little time value; protect gains |
| DTE ≤ 3 & call OTM | BUY_TO_CLOSE | HIGH | Avoid assignment on near-worthless expiration |
| Extrinsic < 5% of premium received | BUY_TO_CLOSE | HIGH | Time decay mostly gone; free capital or roll |
| Contract price (buy-back) &lt; early-profit threshold % of premium (default 70%) | BUY_TO_CLOSE | HIGH | Take profits early, then roll (config: `earlyProfitBtcThresholdPercent`) |
| Account risk = low & DTE < 14 | BUY_TO_CLOSE | MEDIUM | Conservative account; reduce exposure sooner |
| Unrealized stock gain > 15% & call near ATM/ITM | BUY_TO_CLOSE | HIGH | Lock gains; avoid capping upside |
| IV rank > 50 & stock near/below strike | HOLD | HIGH | High premium; keep collecting or roll out |
| ITM & stock rising fast (proxy for delta ≥ 0.85) | ROLL | MEDIUM | High assignment risk; roll up/out |
| DTE ≥ 14 & call OTM | HOLD | HIGH | Adequate DTE; time decay working |
| Default | HOLD | MEDIUM | Position neutral; monitor |

**Moneyness:** `ITM` (>2% above strike), `OTM` (<-2% below), `ATM` (between).

---

## Configuration

**Job config schema** (`coveredCallScannerConfigSchema` in `job-config-schemas.ts`):

| Field | Type | Description |
|-------|------|-------------|
| `minPremium` | number | Skip positions with premium received below this |
| `maxDelta` | 0–1 | Skip if call delta exceeds (Yahoo may not provide delta) |
| `symbols` | string[] | Filter to these symbols only |
| `expirationRange` | `{ minDays?, maxDays? }` | DTE filter |
| `minStockShares` | number | Min shares for stock leg (default 100) |
| `earlyProfitBtcThresholdPercent` | number (0–100) | BTC when current contract price (buy-back cost) is below this % of premium received (default 70). Take profits early, then roll. |

**Strategy settings** (account-level, `strategy-settings` API):

- `excludeWatchlist` (default **true**): when true, the Covered Call Scanner does **not** evaluate watchlist items during the daily job, to save time. Set to false in Setup → Strategy settings to include watchlist call/covered-call items in the scan.
- `covered-call.minOpenInterest` (default 500)
- `covered-call.minVolume` (default 0)
- `covered-call.maxAssignmentProbability` (default 100)

---

## Integration Points

### Scheduler

- **Job type:** `coveredCallScanner`
- **Handler:** `analyzeCoveredCalls(accountId?, config)` → `storeCoveredCallRecommendations(recs, { createAlerts: true })`
- **Schedule:** Same as unified scanner: default `15 14-20 * * 1-5` (weekdays at :15 during market hrs, 9:15–3:15 ET)
- **Report-types run:** Same logic; results formatted for Slack/X delivery

### API

- **Report type:** `coveredCallScanner` (id, handlerKey, name, description)
- **Alerts:** `type: "covered-call"` in alerts collection — **only for recommendations from holdings**; recommendations with `source: "watchlist"` are stored but do not create alerts (they appear on the watchlist page only).
- **Scan API:** `POST /api/covered-call/scan` — single-option scan (e.g. from xStrategyBuilder Review Order)

### UI

- **Automation page:** Job config for `coveredCallScanner` (minPremium, maxDelta, symbols, etc.)
- **Job Types page:** Covered Call Scanner as report type
- **xStrategyBuilder:** Uses Covered Call Scanner for Review Order flow

---

## Storage & Alerts

- **Collection:** `coveredCallRecommendations` — each recommendation stored with `storedAt`
- **Alerts:** Created when `recommendation` is `BUY_TO_CLOSE`, `SELL_NEW_CALL`, or `ROLL` and the recommendation is from **holdings** (not `source: "watchlist"`). Watchlist recommendations are stored but do not create alerts.
- **Delivery:** Via `deliverAlerts` job → Slack/X per `AlertConfig`

---

## Metrics in Recommendations

Each `CoveredCallRecommendation` includes:

- `stockPrice`, `callBid`, `callAsk`, `dte`
- `netPremium`, `unrealizedPl`, `breakeven`
- `extrinsicValue`, `extrinsicPercentOfPremium`
- `moneyness`, `iv`, `ivRank`
- `annualizedReturn` (when applicable)

---

## Comparison: Covered Call Scanner vs Option Scanner

| Aspect | Covered Call Scanner | Option Scanner |
|--------|----------------------|----------------|
| **Scope** | Covered call–specific: pairs (stock+call), opportunities (stock alone), standalone calls, watchlist calls | All options positions (calls and puts) from account holdings only |
| **Data sources** | Accounts + watchlist | Accounts only |
| **Recommendations** | HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, NONE | HOLD, BUY_TO_CLOSE |
| **Architecture** | Pure rule-based | Hybrid: Stage 1 rules → Stage 2 Grok API for edge candidates |
| **Grok integration** | Optional (hybrid); edge candidates get refined via `callCoveredCallDecision` | Optional; candidates filtered by P/L magnitude > 12%, DTE < 14, IV > 55 |
| **Position types** | Pairs, opportunities, standalone calls, watchlist | Single option positions |
| **Rule focus** | Moneyness, extrinsic %, unrealized stock gain, IV rank, assignment risk | DTE, P/L %, time value %, stop loss, IV (puts) |
| **Config** | minPremium, maxDelta, symbols, expirationRange, minStockShares | holdDteMin, btcDteMax, btcStopLossPercent, holdTimeValuePercentMin, highVolatilityPercent, grok* |
| **Storage** | `coveredCallRecommendations` | `optionRecommendations` |
| **Alerts** | BUY_TO_CLOSE, SELL_NEW_CALL, ROLL | BUY_TO_CLOSE only |
| **Module** | `covered-call-analyzer.ts` | `option-scanner.ts` |

**When to use which:**

- **Covered Call Scanner:** Focused on covered call strategy — pairing stock with calls, finding opportunities to sell calls, and managing existing covered call positions (including roll decisions).
- **Option Scanner:** General options evaluation — any call or put position in the account. Uses Grok for borderline cases (high P/L, low DTE, high IV).

---

## File Reference

| File | Role |
|------|------|
| `src/lib/covered-call-analyzer.ts` | Core logic, rules, analysis |
| `src/lib/job-config-schemas.ts` | Config validation |
| `src/lib/scheduler.ts` | Job definition, report-types run |
| `src/types/portfolio.ts` | `CoveredCallRecommendation`, `CoveredCallRecommendationAction`, etc. |
| `src/app/api/report-types/route.ts` | Report type registration |
| `src/app/api/covered-call/scan/route.ts` | Single-option scan (xStrategyBuilder) |
