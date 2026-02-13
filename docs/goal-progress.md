# Goal Progress: Goal Probability (e.g. $1M by 2030)

## Overview

The **tracker** (dashboard) shows:

- **Market snapshot** — with market open/closed status pill on the home page (see [Market Calendar](market-calendar.md) for hours and holidays).
- **Portfolio summary** — account values and positions.
- **Goal probability** — probability (0–100%) of reaching the configured goal (e.g. $1M by 2030) after the user greeting.

The goal label, target value, and target year are **configurable** in **Setup → Goals**. The probability is computed when the **risk scanner** runs and stored for display.

## Goals configuration

- **Setup → Goals** — Configure the primary goal: label (e.g. "$1M by 2030"), target value ($), and target year. The tracker uses this for the goal probability card and for the fallback calculation when Grok does not return a value.
- **Storage:** Goal config is stored in the `goalConfig` collection (`_id: "primary"`). API: `GET/PUT /api/goals/config`.

## When the probability updates

- **Risk scanner** runs as part of the **daily-analysis** cron (e.g. `GET /api/cron/daily-analysis` on a schedule via GitHub Actions or external cron).
- **`runRiskScanner`** (used by daily-analysis or manually) computes portfolio risk, calls Grok for analysis, and then **computes and stores** the goal probability using the target value/year from Setup → Goals.

## How it's computed

1. **Grok** (if configured): The risk analysis prompt asks Grok to estimate `goalProbabilityPercent` (0–100) for reaching the configured goal given current portfolio value and risk.
2. **Fallback**: If Grok doesn't return a value, a simple heuristic is used: required annual return to reach the **configured** target value by the **configured** target year vs an assumed 8% expected return with a 20% band → probability 0–100%.

## Storage (progress)

- **Collection:** `goalProgress`
- **Document:** `_id: "1M_by_2030"` with `probabilityPercent`, `totalValue`, `updatedAt`.
- **API:** `GET /api/goal-progress` returns `{ oneMillionBy2030Percent?, goalLabel?, updatedAt? }` (label comes from goal config).

## UI

- **Component:** `GoalProbabilityCard` (client) fetches `/api/goal-progress` and displays the percentage and goal label after the greeting on the home page.
- **Display:** Only shown when a value exists (after at least one risk scanner run). Color band: green (≥70%), amber (40–69%), gray (&lt;40%).

## Files

| File | Role |
|------|------|
| `src/lib/goal-progress.ts` | Fallback computation, `computeAndStoreGoalProgress()` (uses goal config for target value/year) |
| `src/lib/goals-config.ts` | Goal config (target value, year, label); `getEffectiveGoalConfig`, `upsertGoalConfig` |
| `src/lib/risk-scanner.ts` | Calls `computeAndStoreGoalProgress` after analysis |
| `src/app/api/cron/daily-analysis/route.ts` | Risk block calls `computeAndStoreGoalProgress` |
| `src/app/api/goals/config/route.ts` | GET/PUT goal config for Setup → Goals |
| `src/lib/xai-grok.ts` | `analyzeRiskWithGrok` prompt/parsing for `goalProbabilityPercent` |
| `src/app/api/goal-progress/route.ts` | GET endpoint for dashboard (includes goalLabel from config) |
| `src/components/GoalProbabilityCard.tsx` | Dashboard card after greeting |
| `src/components/HomePage.tsx` | Renders `GoalProbabilityCard` after greeting |
| `src/app/automation/goals/page.tsx` | Setup → Goals configuration page |
