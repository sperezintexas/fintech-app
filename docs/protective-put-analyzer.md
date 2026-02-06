# Protective Put Analyzer — Approach & Design

## Overview

The **Protective Put Analyzer** is a rule-based service that identifies protective put positions (long stock + long put hedge) and stock-without-put opportunities. It evaluates hedge effectiveness and produces conservative, capital-preservation-focused recommendations: HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT, NONE.

**Core purpose:** Detect protective put structures in accounts; assess whether the current hedge remains appropriate using stock price vs strike, DTE, extrinsic value, put delta, IV rank, and risk profile; persist recommendations and create alerts for delivery via Slack/X. Part of the unified options scanning suite (runs in parallel with Option Scanner, Covered Call, Straddle/Strangle).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Protective Put Analyzer Flow                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌─────────────────────────┐    ┌─────────────────┐  │
│  │ Accounts DB  │───▶│ getProtectivePutPositions│───▶│ analyzeProtective│  │
│  │ (positions)  │    │ (pairs + opportunities)  │    │ Puts            │  │
│  └──────────────┘    └─────────────────────────┘    │ applyProtective │  │
│         │                          │                 │ PutRules        │  │
│         │                          │                 └────────┬────────┘  │
│         │                          ▼                          │          │
│         │                 ┌──────────────────┐                ▼          │
│         │                 │ Yahoo Finance     │    ┌─────────────────────┐ │
│         │                 │ getOptionMetrics  │    │ storeProtectivePut  │ │
│         │                 │ getOptionChain   │    │ Recommendations    │ │
│         │                 │ Detailed (cache) │    │ + createAlerts      │ │
│         │                 │ getIVRank        │    └─────────────────────┘ │
│         │                 └──────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Main module:** `src/lib/protective-put-analyzer.ts`

**Unified scanner:** When run via `runUnifiedOptionsScanner`, the orchestrator prefetches option chains once per symbol and passes an `optionChainCache` so opportunities (stock without put) reuse chain data without redundant Yahoo calls. Standalone runs call `getOptionChainDetailed` per opportunity when no cache is provided.

---

## Data Sources & Inputs

| Source | Collection | What it provides |
|--------|------------|------------------|
| **Accounts** | `accounts` | Positions (stock + option legs) per account |
| **Yahoo Finance** | External API | Option metrics (bid, ask, IV, delta when available), IV rank, option chain for opportunities |

**Position matching:** Stock + put are linked by same `accountId` and underlying symbol. Option ticker format: OCC (e.g. `TSLA250117P250`) or underlying symbol; `getUnderlyingFromTicker()` extracts the symbol.

**Cash & 100-share blocks:** Total cash is computed across scanned account(s) (`account.balance` + `positions` with `type === "cash"`). BUY_NEW_PUT recommendations include in the reason: **100-share block** cost (~100 × stock price) and **total cash** so the user can see affordability. When `includeWatchlist` is true, watchlist stock symbols are evaluated; only symbols where 100 × price ≤ total cash are suggested (targeting affordable 100-share blocks).

---

## Position Types

### 1. Protective Put Pairs (`ProtectivePutPair`)

Long stock (≥100 shares by default) + long put on the same symbol in the same account.

- `stockPositionId`, `stockShares`, `stockPurchasePrice`, `stockCurrentPrice`, `stockUnrealizedPlPercent`
- `putPositionId`, `putStrike`, `putExpiration`, `putContracts`, `putPremiumPaid`

### 2. Stock Without Put (`StockWithoutPut`)

Long stock (≥100 shares) with **no** matching long put. If average put IV is high enough (e.g. ≥35%), recommendation: `BUY_NEW_PUT` (opportunity to add downside protection). The reason text includes 100-share block cost and total cash. When `includeWatchlist` is true, watchlist stocks (type `stock` or `long-stock`) are also considered; only symbols where 100 × price ≤ total cash are suggested.

---

## Recommendation Rules (`applyProtectivePutRules`)

Pure function, unit-testable. Inputs: `stockPrice`, `strike`, `dte`, `putBid`, `putAsk`, `premiumPaid`, `extrinsicPercentOfPremium`, `stockUnrealizedPlPercent`, `moneyness`, `putDelta`, `ivRank`, `riskLevel`, `stockAboveBreakeven`.

| Condition | Recommendation | Confidence | Rationale |
|-----------|----------------|------------|-----------|
| Stock ≥ put strike + 12% | SELL_TO_CLOSE | HIGH | Protection no longer cost-effective |
| Extrinsic < 10% of premium paid | SELL_TO_CLOSE | HIGH | Most time value decayed; hedge expensive vs remaining protection |
| DTE ≤ 10 & put OTM | SELL_TO_CLOSE | HIGH | Little protection left; avoid paying for near-worthless insurance |
| Stock down >10% & put ITM | HOLD | HIGH | Hedge is working — keep protection |
| IV rank > 50 | HOLD | MEDIUM | Put value elevated — good time to keep hedge |
| Risk = high & stock above breakeven | SELL_TO_CLOSE | MEDIUM | Aggressive account; remove hedge to free capital |
| Put delta ≥ -0.25 & put OTM | SELL_TO_CLOSE | MEDIUM | Far OTM; protection ineffective relative to cost |
| Stock ≥ strike + 10% | SELL_TO_CLOSE | MEDIUM | Approaching STC zone; consider closing hedge |
| Put ITM or (DTE > 10 & ATM) | HOLD | MEDIUM | Protection active; monitor |
| Default | HOLD | LOW | Position neutral; monitor |

**Put moneyness:** `ITM` when strike > stock + 2%, `OTM` when strike < stock - 2%, else `ATM`.

---

## Configuration

**Job config schema** (`cspAnalysisConfigSchema` in `job-config-schemas.ts`):

| Field | Type | Description |
|-------|------|-------------|
| `minYield` | number | Min yield threshold (reserved for future use) |
| `riskTolerance` | "low" \| "medium" \| "high" | Risk tolerance |
| `watchlistId` | string | Filter to watchlist (not yet implemented) |
| `minStockShares` | number | Min shares for stock leg (default 100) |
| `symbol` | string | Single-symbol mode: analyze only this symbol |
| `includeWatchlist` | boolean | Include watchlist when supported (default true; watchlist not yet wired) |

**Unified scanner:** Config is passed as `config?.protectivePut`; validated and merged via `parseUnifiedOptionsScannerConfig` in the orchestrator.

---

## Integration Points

### Scheduler

- **Job type:** `unifiedOptionsScanner` (runs all four scanners including protective put); no standalone `protectivePutScanner` job type in scheduler (protective put runs as part of unified).
- **Handler:** `analyzeProtectivePuts(accountId?, config?, optionChainCache?)` → `storeProtectivePutRecommendations(recs, { createAlerts: true })`
- **Schedule:** Same as unified scanner (e.g. `0 16 * * 1-5` Mon–Fri 4 PM)

### API

- **Report type:** Unified Options Scanner; no dedicated protective-put-only report type.
- **Alerts:** `type: "protective-put"` in alerts collection for SELL_TO_CLOSE, ROLL, BUY_NEW_PUT
- **Scan test:** `POST /api/scan-test` with `scannerType: "protectivePut"` runs protective put only (for testing).

### UI

- **Automation page:** Unified Options Scanner job; optional `protectivePut` config overrides (minYield, riskTolerance, minStockShares, symbol, etc.)
- **Alerts page:** Filter by type "protective-put"

---

## Storage & Alerts

- **Collection:** `protectivePutRecommendations` — each recommendation stored with `storedAt`
- **Alerts:** Created when `recommendation` is `SELL_TO_CLOSE`, `ROLL`, or `BUY_NEW_PUT`; `type: "protective-put"`, `severity: "warning"`
- **Delivery:** Via `deliverAlerts` job → Slack/X per `AlertConfig`

---

## Metrics in Recommendations

Each `ProtectivePutRecommendation` includes:

- `stockPrice`, `putBid`, `putAsk`, `dte`
- `netProtectionCost`, `effectiveFloor`, `putDelta` (from Yahoo when available)
- `iv`, `ivRank`, `extrinsicValue`, `extrinsicPercentOfPremium`
- `stockUnrealizedPl`, `stockUnrealizedPlPercent`, `protectionCostPercent`
- `moneyness` (ITM/ATM/OTM)

Optional for ROLL/BUY_NEW_PUT: `suggestedStrike`, `suggestedExpiration` (types support them; population is a possible future enhancement).

---

## Best Practices (aligned with unified scanner)

- **Option-chain cache:** When invoked from `runUnifiedOptionsScanner`, the orchestrator passes a shared `Map<symbol, OptionChainDetailedData>` so opportunities do not trigger duplicate `getOptionChainDetailed` calls.
- **Put delta:** `getOptionMetrics` (Yahoo) now returns optional `delta`; protective put analyzer passes it into rules (e.g. put delta ≥ -0.25 & OTM → SELL_TO_CLOSE).
- **Error resilience:** Per-position try/catch in analyzer; errors logged, partial results returned. Orchestrator wraps each scanner in try/catch and collects errors.
- **Config:** Use Zod-validated config via unified scanner; merge defaults early.

---

## Comparison: Protective Put vs Covered Call vs Option Scanner

| Aspect | Protective Put | Covered Call | Option Scanner |
|--------|----------------|--------------|----------------|
| **Scope** | Pairs (stock+put), opportunities (stock alone) | Pairs, opportunities, standalone calls, watchlist | All options positions (calls & puts) |
| **Data sources** | Accounts + Yahoo (option chain cache from orchestrator) | Accounts + watchlist + Yahoo | Accounts + Yahoo |
| **Recommendations** | HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT, NONE | HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, NONE | HOLD, BUY_TO_CLOSE |
| **Rule focus** | Strike vs stock, extrinsic %, DTE, put delta, IV rank, risk | Moneyness, extrinsic %, unrealized gain, IV rank | DTE, P/L %, time value %, stop loss |
| **Config** | minYield, riskTolerance, minStockShares, symbol | minPremium, maxDelta, symbols, expirationRange | holdDteMin, btcDteMax, grok* |
| **Storage** | `protectivePutRecommendations` | `coveredCallRecommendations` | `optionRecommendations` |
| **Alerts** | SELL_TO_CLOSE, ROLL, BUY_NEW_PUT | BUY_TO_CLOSE, SELL_NEW_CALL, ROLL | BUY_TO_CLOSE |
| **Module** | `protective-put-analyzer.ts` | `covered-call-analyzer.ts` | `option-scanner.ts` |

---

## File Reference

| File | Role |
|------|------|
| `src/lib/protective-put-analyzer.ts` | Core logic, rules, analysis, store + alerts |
| `src/lib/job-config-schemas.ts` | Config validation (`cspAnalysisConfigSchema`) |
| `src/lib/unified-options-scanner.ts` | Orchestrator; prefetches option chain cache, runs protective put in parallel |
| `src/lib/yahoo.ts` | `getOptionMetrics` (incl. optional delta), `getOptionChainDetailed`, `getIVRankOrPercentile` |
| `src/types/portfolio.ts` | `ProtectivePutRecommendation`, `ProtectivePutRecommendationAction`, `ProtectivePutRecommendationMetrics` |
| `src/app/api/scan-test/route.ts` | Scan-test API (protectivePut scanner type) |
