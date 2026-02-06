# Goal Progress: $1M by 2030 Probability

## Overview

The dashboard shows a **probability of reaching $1M by 2030** (0–100%) after the user greeting. This value is computed when the **risk scanner** runs and stored for display.

## When It Updates

- **Risk scanner** runs as part of the **daily-analysis** cron (e.g. `GET /api/cron/daily-analysis` on the schedule in `vercel.json`).
- **`runRiskScanner`** (used by daily-analysis or manually) computes portfolio risk, calls Grok for analysis, and then **computes and stores** the goal probability.

## How It's Computed

1. **Grok** (if configured): The risk analysis prompt asks Grok to estimate `goalProbabilityPercent` (0–100) for reaching $1M by 2030 given current portfolio value and risk.
2. **Fallback**: If Grok doesn’t return a value, a simple heuristic is used: required annual return to reach $1M by 2030 vs an assumed 8% expected return with a 20% band → probability 0–100%.

## Storage

- **Collection:** `goalProgress`
- **Document:** `_id: "1M_by_2030"` with `probabilityPercent`, `totalValue`, `updatedAt`.
- **API:** `GET /api/goal-progress` returns `{ oneMillionBy2030Percent?, updatedAt? }`.

## UI

- **Component:** `GoalProbabilityCard` (client) fetches `/api/goal-progress` and displays the percentage after the greeting on the home page.
- **Display:** Only shown when a value exists (after at least one risk scanner run). Color band: green (≥70%), amber (40–69%), gray (&lt;40%).

## Files

| File | Role |
|------|------|
| `src/lib/goal-progress.ts` | Fallback computation, `computeAndStoreGoalProgress()` |
| `src/lib/risk-scanner.ts` | Calls `computeAndStoreGoalProgress` after analysis |
| `src/app/api/cron/daily-analysis/route.ts` | Risk block calls `computeAndStoreGoalProgress` |
| `src/lib/xai-grok.ts` | `analyzeRiskWithGrok` prompt/parsing for `goalProbabilityPercent` |
| `src/app/api/goal-progress/route.ts` | GET endpoint for dashboard |
| `src/components/GoalProbabilityCard.tsx` | Dashboard card after greeting |
| `src/components/HomePage.tsx` | Renders `GoalProbabilityCard` after greeting |
