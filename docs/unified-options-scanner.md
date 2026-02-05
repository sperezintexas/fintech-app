# Unified Options Scanner — Overview & Design

## Overview

The **Unified Options Scanner** is an orchestrator that runs four option scanners in sequence: **Option Scanner**, **Covered Call Scanner**, **Protective Put Scanner**, and **Straddle/Strangle Scanner**. It stores all recommendations, creates alerts, and returns a combined summary. One job replaces four separate scheduled runs.

**Core purpose:** Run all option analysis in a single job; pass optional per-scanner config overrides; persist recommendations and create alerts for delivery via Slack/X.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     Unified Options Scanner Flow                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                    runUnifiedOptionsScanner(accountId?, config?)         │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                      │                                          │
│         ┌────────────────────────────┼────────────────────────────┐             │
│         ▼                            ▼                            ▼             │
│  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐        │
│  │ Option       │           │ Covered Call │           │ Protective   │        │
│  │ Scanner      │           │ Analyzer     │           │ Put Analyzer  │        │
│  │              │           │              │           │              │        │
│  │ scanOptions  │           │ analyzeCovered│           │ analyzeProtect│        │
│  │ storeOption  │           │ storeCovered │           │ storeProtect  │        │
│  │ Recommend.   │           │ Recommend.   │           │ Recommend.   │        │
│  └──────────────┘           └──────────────┘           └──────────────┘        │
│         │                            │                            │             │
│         └────────────────────────────┼────────────────────────────┘             │
│                                      │                                          │
│                                      ▼                                          │
│                             ┌──────────────┐                                     │
│                             │ Straddle/    │                                     │
│                             │ Strangle     │                                     │
│                             │ Analyzer     │                                     │
│                             │              │                                     │
│                             │ analyzeStrad │                                     │
│                             │ storeStrad   │                                     │
│                             └──────────────┘                                     │
│                                      │                                          │
│                                      ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  Result: { optionScanner, coveredCallScanner, protectivePutScanner,     │   │
│  │            straddleStrangleScanner, totalScanned, totalStored,           │   │
│  │            totalAlertsCreated }                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Main module:** `src/lib/unified-options-scanner.ts`

**Execution:** Config is validated and merged with Zod (`parseUnifiedOptionsScannerConfig`). Unique symbols needing option-chain data are collected from covered-call and protective-put positions; option chains are fetched once per symbol in parallel and passed to scanners via a shared `Map<symbol, chain>`. All four scanners run in parallel (`Promise.all`); then recommendations are persisted and alerts created in parallel via `storeRecommendationsAndCreateAlerts`. Each scanner is wrapped in try/catch with per-scanner timing (`console.time`/`timeEnd`) and error logging; partial results are returned on failure.

---

## Sub-Scanners

| Scanner | Module | Scope | Recommendations | Data Sources |
|---------|--------|-------|-----------------|--------------|
| **Option Scanner** | `option-scanner.ts` | All options positions (calls & puts) | HOLD, BUY_TO_CLOSE | Accounts only |
| **Covered Call** | `covered-call-analyzer.ts` | Pairs, opportunities, standalone calls, watchlist | HOLD, BUY_TO_CLOSE, SELL_NEW_CALL, ROLL, NONE | Accounts + watchlist |
| **Protective Put** | `protective-put-analyzer.ts` | Pairs (stock+put), opportunities | HOLD, SELL_TO_CLOSE, ROLL, BUY_NEW_PUT, NONE | Accounts + watchlist |
| **Straddle/Strangle** | `straddle-strangle-analyzer.ts` | Long straddles & strangles | HOLD, SELL_TO_CLOSE, ROLL, ADD, NONE | Accounts only |

---

## Configuration

### Config validation and merging

Unified config is validated with Zod (`unifiedOptionsScannerConfigSchema` in `src/lib/job-config-schemas.ts`). Use `parseUnifiedOptionsScannerConfig(config)` to validate and merge early; invalid config throws. Defaults are applied per sub-scanner in their respective modules.

### UnifiedOptionsScannerConfig

Optional nested overrides per sub-scanner:

```typescript
type UnifiedOptionsScannerConfig = {
  optionScanner?: OptionScannerConfig;
  coveredCall?: CoveredCallScannerConfig;
  protectivePut?: CspAnalysisConfig;
};
```

**Note:** Straddle/Strangle has no config override in the unified scanner; it uses defaults.

### OptionScannerConfig (optionScanner)

| Field | Type | Description |
|-------|------|-------------|
| `holdDteMin` | number | HOLD if DTE ≥ this. Default 14. |
| `btcDteMax` | number | BTC if DTE < this. Default 7. |
| `btcStopLossPercent` | number | BTC if P/L below this %. Default -50. |
| `holdTimeValuePercentMin` | number | HOLD if time value % above this. Default 20. |
| `highVolatilityPercent` | number | IV threshold for puts. Default 30. |
| `riskProfile` | RiskLevel | conservative = BTC earlier. |
| `grokEnabled` | boolean | Enable Grok for edge candidates. Default true. |
| `grokCandidatesPlPercent` | number | Send to Grok if \|P/L\| > this %. Default 12. |
| `grokCandidatesDteMax` | number | Send to Grok if DTE < this. Default 14. |
| `grokCandidatesIvMin` | number | Send to Grok if IV > this. Default 55. |
| `grokMaxParallel` | number | Max parallel Grok calls. Default 6. |
| `grokSystemPromptOverride` | string | Override Grok system prompt. |

### CoveredCallScannerConfig (coveredCall)

| Field | Type | Description |
|-------|------|-------------|
| `minPremium` | number | Skip positions with premium below this. |
| `maxDelta` | 0–1 | Skip if call delta exceeds. |
| `symbols` | string[] | Filter to these symbols only. |
| `expirationRange` | `{ minDays?, maxDays? }` | DTE filter. |
| `minStockShares` | number | Min shares for stock leg. Default 100. |
| `grokEnabled` | boolean | Enable Grok for edge cases. |
| `grokConfidenceMin` | number | Min confidence for Grok. |
| `grokDteMax` | number | Max DTE for Grok candidates. |
| `grokIvRankMin` | number | Min IV rank for Grok. |
| `grokMaxParallel` | number | Max parallel Grok calls. |
| `grokSystemPromptOverride` | string | Override Grok prompt. |

### CspAnalysisConfig (protectivePut)

| Field | Type | Description |
|-------|------|-------------|
| `minYield` | number | Min yield threshold. |
| `riskTolerance` | "low" \| "medium" \| "high" | Risk tolerance. |
| `watchlistId` | string | Filter to watchlist items. |
| `minStockShares` | number | Min shares for stock leg. Default 100. |

---

## Result Type

```typescript
type UnifiedOptionsScannerResult = {
  optionScanner: { scanned: number; stored: number; alertsCreated: number };
  coveredCallScanner: { analyzed: number; stored: number; alertsCreated: number };
  protectivePutScanner: { analyzed: number; stored: number; alertsCreated: number };
  straddleStrangleScanner: { analyzed: number; stored: number; alertsCreated: number };
  totalScanned: number;
  totalStored: number;
  totalAlertsCreated: number;
};
```

- **scanned/analyzed:** Number of positions or pairs evaluated.
- **stored:** Number of recommendations persisted.
- **alertsCreated:** Number of alerts created (for delivery via deliverAlerts job).

---

## Integration Points

### Scheduler

- **Job type:** `unifiedOptionsScanner`
- **Handler:** `runUnifiedOptionsScanner(accountId?, config?)`
- **Schedule:** `0 16 * * 1-5` (Mon–Fri 4 PM) — default from `createRecommendedJobs`
- **Run portfolio:** `POST /api/scheduler` with `{ action: "runPortfolio" }` runs unifiedOptionsScanner + watchlistreport + deliverAlerts

### Report Types

- **id:** `unifiedOptionsScanner`
- **handlerKey:** `unifiedOptionsScanner`
- **supportsPortfolio:** false
- **supportsAccount:** true

### API

- **Covered Call Scan:** `POST /api/covered-call/scan` uses unifiedOptionsScanner report type for config lookup; runs covered call analysis only (not the full unified scanner).

---

## Storage & Alerts

| Scanner | Recommendations Collection | Alert Types |
|---------|---------------------------|-------------|
| Option | `optionRecommendations` | BUY_TO_CLOSE |
| Covered Call | `coveredCallRecommendations` | BUY_TO_CLOSE, SELL_NEW_CALL, ROLL |
| Protective Put | `protectivePutRecommendations` | SELL_TO_CLOSE, ROLL, BUY_NEW_PUT |
| Straddle/Strangle | `straddleStrangleRecommendations` | SELL_TO_CLOSE, ROLL, ADD |

**Delivery:** Alerts are created with `createAlerts: true`; the `deliverAlerts` job sends them to Slack/X per AlertConfig.

### Automation Setup — Alerts

- **Acknowledge All:** Option to acknowledge all alerts at once (e.g., from the Alerts page or via API).

---

## Usage

### Programmatic

```typescript
import { runUnifiedOptionsScanner } from "@/lib/unified-options-scanner";

// Portfolio-level (all accounts)
const result = await runUnifiedOptionsScanner();

// Account-level with config overrides
const result = await runUnifiedOptionsScanner("accountId123", {
  optionScanner: { holdDteMin: 21, btcDteMax: 5 },
  coveredCall: { minPremium: 2, symbols: ["TSLA", "AAPL"] },
  protectivePut: { minYield: 25, riskTolerance: "medium" },
});
```

### Via Scheduler

1. **Run Now:** Automation page → select job → Run Now.
2. **Run Portfolio:** Dashboard or Automation → "Run Portfolio" → triggers unifiedOptionsScanner + watchlistreport + deliverAlerts.
3. **Scheduled:** Create job with `jobType: "unifiedOptionsScanner"`, `accountId` (or null for portfolio), `scheduleCron`, `config` (optional).

---

## Best practices (implemented)

- **Parallel execution:** Scanners run in parallel with `Promise.all`; only symbol collection and option-chain prefetch run first. Persist step runs in parallel after all scans complete.
- **Shared option-chain cache:** Orchestrator collects unique symbols from covered-call and protective-put positions, fetches `getOptionChainDetailed` once per symbol in parallel, and passes a `Map<symbol, chain>` to covered-call and protective-put analyzers to avoid redundant Yahoo API calls.
- **Config merging & validation:** Zod schema (`unifiedOptionsScannerConfigSchema`) and `parseUnifiedOptionsScannerConfig()` validate and merge config early to prevent invalid runs.
- **Error resilience:** Each scanner is wrapped in try/catch; errors are collected in `result.errors` and logged per scanner (`[unified-options-scanner] <scanner>: <error>`). Partial results are returned.
- **Persistence util:** `storeRecommendationsAndCreateAlerts(recommendations, storeFn)` centralizes persist + createAlerts logic.
- **Performance metrics:** `console.time`/`console.timeEnd` per scanner for debugging slow runs.

## File Reference

| File | Role |
|------|------|
| `src/lib/unified-options-scanner.ts` | Orchestrator; runs all four scanners |
| `src/lib/option-scanner.ts` | Option Scanner (calls & puts) |
| `src/lib/covered-call-analyzer.ts` | Covered Call Scanner |
| `src/lib/protective-put-analyzer.ts` | Protective Put Scanner |
| `src/lib/straddle-strangle-analyzer.ts` | Straddle/Strangle Scanner |
| `src/lib/job-config-schemas.ts` | Config validation (unifiedOptionsScannerConfigSchema) |
| `src/lib/scheduler.ts` | Agenda job definition |
| `src/types/portfolio.ts` | OptionScannerConfig, result types |
| `docs/coveredcallscanner.md` | Detailed Covered Call Scanner docs |
