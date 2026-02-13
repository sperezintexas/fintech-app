# Security and Auth Practices

## Implemented (2026)

### 1. Proxy auth response preservation (Critical)
- **File:** `src/proxy.ts`
- **Fix:** Any `Response` returned by the auth middleware (e.g. `Response.redirect()`) is now preserved. Security headers are applied to both `NextResponse` and plain `Response` (e.g. redirects) without replacing the response with `NextResponse.next()`, so unauthenticated users are correctly redirected instead of allowed through.

### 2. Explicit auth in mutating API handlers (High)
- **Helper:** `src/lib/require-session.ts` — `requireSession()` returns the session or a 401 `NextResponse`. Use at the start of any POST/PUT/PATCH/DELETE handler.
- **Protected routes:** Accounts (POST, PUT, DELETE), watchlist (POST), tasks (POST, PUT, DELETE), scheduler (POST), positions (POST, PUT, DELETE, close).
- **Recommendation:** Add `requireSession()` to all remaining state-changing handlers (see list below). Proxy remains a first line of defense; handler-level checks ensure a single point of failure cannot open write access.

### 3. Health endpoint metadata (High)
- **File:** `src/app/api/health/route.ts`
- **Fix:** Unauthenticated callers receive only `{ status: "ok", timestamp }`. Authenticated users receive the full readiness payload (MongoDB latency, connection display, database name, scheduler job counts, etc.). `/api/health/live` remains public for liveness probes.

## Remaining routes to protect with requireSession()

Add `const session = await requireSession(); if (session instanceof NextResponse) return session;` at the start of each mutating handler:

- `watchlist/remove-duplicates` POST
- `watchlist/analyze` POST
- `watchlist/preview-alert` POST
- `watchlist/remove-held` POST
- `watchlist/[id]` PUT, DELETE
- `watchlists` POST
- `watchlists/[id]` PUT, DELETE
- `report-types` POST; `report-types/[id]` PUT, DELETE; `report-types/run` POST
- `alert-configs` POST
- `alert-preferences` POST
- `alerts` POST, DELETE; `alerts/[id]` PUT, DELETE; `alerts/schedule` POST, DELETE
- `profile` PUT
- `app-config` PUT
- `report-templates` PUT
- `alert-templates` PUT
- `strategy-settings` PUT
- `reports/smartxai` POST; `reports/portfoliosummary` POST
- `covered-call/scan` POST; `covered-call/alternatives` POST
- `scan-test` POST

## Regression tests (recommended)

- Unauthenticated request to a protected page route → redirect to `/contact` (or 401 for API).
- Unauthenticated request to `POST /api/accounts` → 401 (after proxy fix, no bypass).
- Unauthenticated `GET /api/health` → 200 with only `{ status, timestamp }` (no `checks`, `connectionDisplay`, `database`, `jobsCount`, etc.).
