# Optimization Plan: Scanners, Scheduling, UI, Database, Auth/Env

Plan covers five areas with **test/validation after each feature**. Implement in order so dependencies (e.g. env validation) are in place before features that rely on them.

---

## 1. Auth/Env: Runtime env validation (crash early)

**Goal:** Validate required env vars at startup so the app fails fast with a clear message instead of failing later with a cryptic error.

**Current state:** [src/lib/mongodb.ts](src/lib/mongodb.ts) reads `MONGODB_URI` / `MONGODB_URI_B64` / `MONGODB_DB` with no validation; [auth](src/auth.ts) and other code read `NEXTAUTH_SECRET`, etc. ad hoc.

**Work:**

- Add dependency: `envsafe` (or `zod` + small wrapper) for server-side env.
- Create [src/lib/env.ts](src/lib/env.ts):
  - Validate `MONGODB_URI` (or `MONGODB_URI_B64`), `MONGODB_DB` (optional, default), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` (optional in dev).
  - Export a single object (e.g. `env`) that throws on first access if any required var is missing.
- Call validation from [src/instrumentation.ts](src/instrumentation.ts) (Node runtime) so any request triggers crash early if env is invalid; alternatively validate inside `getDb()` / `getMongoUri()` on first use.
- Keep optional vars (e.g. Slack webhook, X API keys) as optional so dev/local doesn’t require them.

**Test/validation:**

- Unit test: with mocked `process.env`, assert valid env returns object; missing required var throws with message containing the var name.
- Manual: run app with `MONGODB_URI` unset, expect process to exit with clear error (no silent undefined later).

---

## 2. Scanners: Parallelization and Yahoo cache

**Goal:** Keep scanner runs fast and reduce Yahoo API load; avoid duplicate calls within a run.

**Current state:**

- [src/lib/unified-options-scanner.ts](src/lib/unified-options-scanner.ts) already runs the four scanners in parallel via `Promise.all([runOptionScanner(), runCoveredCallScanner(), ...])` (lines 281–286). **No change needed for parallelization.**
- [src/lib/option-scanner.ts](src/lib/option-scanner.ts) uses in-memory `getCachedOrFetch` (30 min TTL) for `getOptionMetrics` and market conditions.
- [src/lib/unified-options-scanner.ts](src/lib/unified-options-scanner.ts) pre-fetches option chains with `fetchOptionChainCache(symbols)` and passes `optionChainMap` to CC and PP analyzers; no Redis.

**Test/validation:**

- Existing scanner tests (option, covered-call, protective-put, unified) still pass with no Redis.
- **Done:** Unit test in `option-scanner.test.ts`: two consecutive `scanOptions()` calls with same position use in-memory cache; `getOptionMetrics` and `getOptionMarketConditions` are each called once (second run does not hit Yahoo).
- Run unified scanner once locally and confirm no regression in behavior or logs.

---

## 3. Scheduling: Retry and concurrency

**Goal:** Retry Agenda jobs on transient failures (e.g. Yahoo timeout/5xx); avoid overwhelming Yahoo with too many concurrent jobs.

**Current state:**

- [src/lib/scheduler.ts](src/lib/scheduler.ts): Agenda created with `maxConcurrency: 1` (global). Job handlers do not retry; they throw on error.
- No explicit rate limiting for Yahoo inside jobs.

**Work:**

- **Retry logic:** In each Agenda job handler (e.g. `unifiedOptionsScanner`, `deliverAlerts`, `scheduled-report`), wrap the main logic in a retry loop (e.g. max 3 attempts with exponential backoff: 1 min, 2 min, 4 min). Classify errors as “transient” (network, 5xx, timeout) vs “permanent” (4xx validation, auth); only retry transient. On permanent or after max retries, save `lastError` and do not reschedule.
- **Concurrency:** Kept `maxConcurrency: 1` so only one job runs at a time. Scaling to multiple instances: each would run its own Agenda poller; MongoDB job locking prevents duplicate execution of the same job type.
- **Rate limiting (optional):** If Yahoo rate limits are hit, add a simple in-process throttle (e.g. delay between symbol fetches in unified scanner) or rely on the new Redis/in-memory cache to reduce call volume.

**Test/validation:**

- **Done:** Unit tests in `src/lib/__tests__/scheduler-retry.test.ts`: `isTransientError` (timeout/5xx → true, 4xx/auth → false), `withRetry` (succeeds on first attempt; retries transient and succeeds on third attempt; no retry on permanent; throws after max attempts when all transient).
- Manual: temporarily make a job throw a transient error, run the job, and confirm it retries and then fails or succeeds; check `lastError` / logs.

---

## 4. UI: Server components and preload

**Goal:** Use server components where possible; use `'use client'` only for interactive parts; preload critical data in layouts to improve TTI and reduce client fetches.

**Current state (after implementation):**

- **Holdings:** [src/app/holdings/page.tsx](src/app/holdings/page.tsx) is an async server component that calls `getAccountsServer()` and passes `initialAccounts` + `urlAccountId` to [HoldingsClient](src/app/holdings/HoldingsClient.tsx) (client). Client handles filters, modals, mutations, polling; positions still fetched client-side via API for first selected account.
- **Alerts:** [src/app/alerts/page.tsx](src/app/alerts/page.tsx) is an async server component that calls `getAccountsServer()` and `getAlertsServer({ unacknowledged: true, limit: 100 })` and passes to [AlertsClient](src/app/alerts/AlertsClient.tsx) (client). Client handles filters/actions and refetches when filters change.
- **Automation:** Still full client ([src/app/automation/page.tsx](src/app/automation/page.tsx)); not split (complex tabs and forms).
- **Preload:** No root-layout preload (SessionProvider is client); each server page fetches its own data (holdings/alerts).
- **Server data layer:** [src/lib/data-server.ts](src/lib/data-server.ts) provides `getAccountsServer()` and `getAlertsServer(filter)` for RSC.

**Audit: `'use client'` files**

| File | Role |
|------|------|
| `app/holdings/HoldingsClient.tsx` | Interactive only (filters, modals, mutations, polling) |
| `app/alerts/AlertsClient.tsx` | Interactive only (filters, acknowledge, export) |
| `app/automation/page.tsx` | Full page client (tabs, forms) — could be server + client island later |
| `app/accounts/page.tsx` | Full page client — could be server + client island |
| `app/watchlist/page.tsx` | Full page client |
| `components/SessionProvider.tsx` | Required client (auth context) |
| `components/AppHeader.tsx`, `Footer.tsx` | Interactive (nav, session) |
| `components/PositionForm.tsx`, `PositionList.tsx`, `BuyToCloseModal.tsx` | Interactive only |
| `components/Dashboard.tsx`, `HomePage.tsx`, `GoalProbabilityCard.tsx` | Interactive / data-dependent |
| Other components (ChatInterface, MarketConditions, etc.) | Interactive only |

**Test/validation:**

- **Done:** `npm run build` passes; holdings and alerts page tests updated and passing.
- Manually: open holdings, alerts, automation; confirm data loads and actions (add position, run test alert, etc.) still work.
- Optional: run existing Playwright e2e (if any) for these routes.

---

## 5. Database: Schema validation for recommendations and alerts

**Goal:** Enforce a minimal schema on MongoDB collections so bad data is rejected at insert time.

**Done:**

- **Script:** [scripts/mongo-validators.ts](../scripts/mongo-validators.ts) applies `$jsonSchema` validators with `validationLevel: "strict"` via `collMod` (existing collections) or `createCollection` (if missing). Collections: `alerts`, `optionRecommendations`, `coveredCallRecommendations`, `protectivePutRecommendations`, `straddleStrangleRecommendations`.
- **Schema doc and run:** [docs/database-schema.md](database-schema.md); run `npx tsx scripts/mongo-validators.ts` (set MONGODB_URI, MONGODB_DB). Ensure existing documents satisfy the schema before running.

**Test/validation:**

- Unit tests that insert into these collections use mocked DB and still pass. After applying validators on a real DB, run the app (or scanner jobs) and confirm inserts succeed.
- Manual: insert a document missing a required field; MongoDB should reject it with a validation error.

---

## Implementation order and checklist

| Order | Feature              | Deliverable                                      | Validation step                          |
|-------|----------------------|--------------------------------------------------|------------------------------------------|
| 1     | Auth/Env             | `src/lib/env.ts` + instrumentation or getDb     | Unit test; run with missing var → crash  |
| 2     | Scanners (Yahoo cache) | In-memory cache + pre-fetch; cache-dedup test   | Scanner tests pass; cache test (no 2nd Yahoo call) |
| 3     | Scheduling           | Retry in deliverAlerts, unifiedOptionsScanner, scheduled-report; withRetry + isTransientError | Unit test scheduler-retry; manual fail/retry |
| 4     | UI                   | Holdings + Alerts server/client split; data-server; audit | Build + page tests + manual flows       |
| 5     | Database             | scripts/mongo-validators.ts + docs/database-schema.md | Unit tests pass (mocked DB); manual invalid insert fails |

After each feature: run `npm test`, `npm run lint`, `npx tsc --noEmit`, and the feature-specific validation above before moving to the next.
