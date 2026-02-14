# Multi-Tenant Implementation Plan

## Summary

Introduce a **Portfolio** as the tenant boundary: each portfolio has a list of authorized users; all tenant-scoped data is keyed by `portfolioId`. New users get an empty portfolio by default; onboarding flow: create test user → register new portfolio → import broker data. All collections are associated to a portfolio so the app supports many tenants.

---

## 1. Current State

### 1.1 Auth

- **NextAuth** (JWT): X/Twitter OAuth (`user.id` = X id, `user.username`) or Credentials (access key → `id: "key"`, or email/password → `id: email`).
- **Stable user identifier**: Use `session.user.id` (and optionally `session.user.email`) as the canonical user id for portfolio membership. For X users this is the X id; for email/password it’s the email.
- **authUsers** collection: email, salt, hash (no `portfolioId`; auth is global).

### 1.2 “Portfolio” Today

- **Not a stored entity.** The dashboard builds a `Portfolio` view from **all** accounts + live prices (`apps/frontend/src/app/api/dashboard/route.ts` uses `db.collection("accounts").find({})`). There is no `portfolios` collection and no tenant filter.

### 1.3 Collections (Frontend / Next.js API)

| Collection | Current usage | Tenant-scoped? |
|------------|----------------|----------------|
| **accounts** | Dashboard, accounts CRUD, positions, watchlist, reports, alerts, scheduler | **Yes** |
| **brokers** | Brokers CRUD, logo, account broker refs | **Yes** |
| **watchlists** | Watchlist CRUD, default watchlist | **Yes** |
| **watchlist** | Watchlist items, alerts, cron daily-analysis | **Yes** |
| **alerts** | Alerts CRUD, risk scanner, option scanners, scheduler | **Yes** |
| **scheduledAlerts** | Alert scheduling | **Yes** |
| **alertPreferences** | Per-account alert prefs | **Yes** |
| **alertConfigs** | Alert config | **Yes** |
| **reportJobs** | Tasks/scheduler, report runs | **Yes** |
| **reportTypes** | Report type definitions (shared templates) | **Global** (no portfolioId) |
| **smartXAIReports** | SmartX AI report blobs | **Yes** |
| **portfolioSummaryReports** | Portfolio summary report blobs | **Yes** |
| **pushSubscriptions** | Push subscription per endpoint | **Yes** |
| **coveredCallRecommendations** | Recommendations | **Yes** |
| **protectivePutRecommendations** | Recommendations | **Yes** |
| **optionRecommendations** | Recommendations | **Yes** |
| **straddleStrangleRecommendations** | Recommendations | **Yes** |
| **authUsers** | Email/password auth | **Global** |
| **x-allowed-usernames** / allowlist | X sign-in allowlist | **Global** |
| **access-keys** (if stored) | Access key validation | **Global** (or per-portfolio later) |
| **login_successes / login_failures / security_alerts** | Audit | Can stay global or scope by user id |
| **Chat history** | Keyed by `userId` in code | Could stay user-scoped or move to portfolio-scoped |

**Backend (Kotlin):** Reads/writes MongoDB (e.g. report tasks from `reportJobs`). Scheduler hits Next.js internal endpoints. Once Next.js APIs are portfolio-scoped, backend must pass `portfolioId` (e.g. header) when calling Next.js; and any direct MongoDB access in backend must filter by `portfolioId`.

---

## 2. Model and Schema

### 2.1 New collection: `portfolios`

```ts
// types/portfolio.ts (extend or new types/tenant.ts)
type PortfolioDoc = {
  _id: ObjectId;
  name: string;                    // e.g. "My Portfolio"
  authorizedUserIds: string[];     // session.user.id (X id or email)
  createdAt: Date;
  updatedAt: Date;
};
```

- **authorizedUserIds**: list of user ids that can access this portfolio (session.user.id). First user in the list can be treated as “owner” if needed for delete/transfer.

### 2.2 Add `portfolioId` to tenant-scoped collections

- **Type:** `portfolioId: string` (ObjectId as string) or `portfolioId: ObjectId` consistently. Prefer **string** (ObjectId hex) for APIs and session.
- **Collections to add `portfolioId`:**
  accounts, brokers, watchlists, watchlist, alerts, scheduledAlerts, alertPreferences, alertConfigs, reportJobs, smartXAIReports, portfolioSummaryReports, pushSubscriptions, coveredCallRecommendations, protectivePutRecommendations, optionRecommendations, straddleStrangleRecommendations.
- **Index:** Create compound or single index `{ portfolioId: 1 }` (and compound where needed, e.g. `{ portfolioId: 1, accountId: 1 }`) for all tenant-scoped collections.

### 2.3 Global (no portfolioId)

- reportTypes, authUsers, x-allowed-usernames, access-keys, login/security audit collections (unless we decide to scope audit by portfolio later).

---

## 3. Auth and Session

### 3.1 Stable user id

- Use `session.user.id` everywhere for “current user” (X id or email from Credentials).
- Ensure NextAuth profile/callbacks persist `id` and, if useful, `email` in session.

### 3.2 Current portfolio in session

- Add to JWT/session: `portfolioId: string | null` (current active portfolio).
- **Resolve current portfolio:**
  - If `session.portfolioId` is set and user is in that portfolio’s `authorizedUserIds`, use it.
  - Else: load portfolios where `authorizedUserIds` includes `session.user.id`; pick first or “default” (e.g. most recent) and set in session.
  - Else: **new user** → no portfolio; redirect to “Create or join portfolio” and create one portfolio, add user to `authorizedUserIds`, set as `session.portfolioId`.

### 3.3 New user default flow

1. User signs in (X or email/password).
2. Look up portfolios where `authorizedUserIds` contains `session.user.id`.
3. If none: show onboarding → “Create your portfolio” → create one `PortfolioDoc` with `authorizedUserIds = [session.user.id]`, set `session.portfolioId`, then continue to dashboard (empty) or “Import broker data”.

---

## 4. API Changes (Frontend / Next.js)

### 4.1 Helpers

- **requireSession()** (existing): keep; use for “must be logged in”.
- **requirePortfolio(session)**: returns `{ portfolioId }` or 403 if user has no portfolio. Resolve current portfolio from DB using session.user.id and optionally session.portfolioId; update session if needed (e.g. refresh JWT with portfolioId).
- **getDb()** (existing): unchanged.

### 4.2 Pattern for tenant-scoped routes

- Call `requireSession()` then `requirePortfolio(session)`.
- All reads: `find({ portfolioId })` (or `findOne({ _id, portfolioId })`).
- All inserts: include `portfolioId` in document.
- All updates/deletes: include `portfolioId` in filter to avoid cross-tenant writes.

### 4.3 Routes to update (non-exhaustive)

- **Dashboard:** `GET /api/dashboard` – resolve portfolio, then `accounts.find({ portfolioId })`, aggregate portfolio view.
- **Accounts:** `GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/[id]` – filter/insert by portfolioId.
- **Brokers:** same.
- **Watchlists / watchlist:** same; default watchlist is per portfolio.
- **Positions:** via account (account already has portfolioId); ensure any direct position collection or reads are portfolio-scoped.
- **Alerts, scheduledAlerts, alertPreferences, alertConfigs:** by portfolioId.
- **Report jobs/types:** reportJobs by portfolioId; reportTypes global (read-only for tenant).
- **Reports (smartXAI, portfolioSummary):** by portfolioId.
- **Push subscribe:** store portfolioId with subscription.
- **Scheduler / cron:** when loading report jobs or running daily analysis, either run per portfolio (loop portfolios and pass portfolioId to run-task) or have run-task accept portfolioId and validate it.
- **Internal/run-task:** accept portfolioId (body or header), validate, then run in context of that portfolio.

### 4.4 New endpoints

- **GET /api/portfolios** – list portfolios where `authorizedUserIds` includes current user. Return `{ id, name }[]`.
- **POST /api/portfolios** – create portfolio (name in body), set `authorizedUserIds = [session.user.id]`, return id; optionally set as current in session.
- **POST /api/portfolios/switch** or **PATCH /api/me** – set current `portfolioId` in session (body: `portfolioId`). Validate user is in `authorizedUserIds`.
- **GET /api/portfolios/[id]/members** (optional) – list authorized users (for owner).
- **POST /api/portfolios/[id]/members** (optional) – add authorized user (for owner).

---

## 5. Default Flow: Create Test User → Register Portfolio → Import Broker Data

### 5.1 Create test user

- **Option A (existing):** Use Credentials with email/password; ensure `POST /api/auth-users` (or equivalent) creates an auth user. Then sign in with that email/password so `session.user.id` = email.
- **Option B:** Use seed script or dev-only endpoint that creates an auth user (e.g. `scripts/seed-local-db.ts` or a `/api/dev/create-test-user` that creates authUsers entry and optionally a portfolio). Align with existing seed: script currently seeds `auth_users` with username; app uses `authUsers` with email/password. Unify or document both (e.g. seed `authUsers` with a test email/password for local dev).

Recommendation: add to seed script (or dev route) creation of one **authUsers** user (e.g. `test@example.com` / password) so “create test user” is scriptable; then login with that user.

### 5.2 Register new portfolio

- After login, if user has no portfolio, show “Create your portfolio” (or auto-create one with name “My Portfolio”).
- **POST /api/portfolios** with `{ name: "My Portfolio" }` → create `PortfolioDoc`, set session.portfolioId, return 201.

### 5.3 Import broker data

- Import flow (existing) creates/updates **accounts** (and possibly positions/brokers). Ensure this flow:
  - Uses `requirePortfolio(session)` and receives `portfolioId`.
  - Inserts accounts (and any related docs) with `portfolioId`.
  - Creates brokers in that portfolio if needed.

So the default flow is: **create test user (seed or sign up) → login → register new portfolio (or auto-create) → import broker data**. All created data gets the current user’s `portfolioId`.

### 5.4 Verification (testing)

- Create test user, register portfolio, import broker data.
- Assert: every document in tenant-scoped collections has `portfolioId` equal to the created portfolio’s id.
- Create second user, second portfolio, import different data; assert no cross-tenant reads (each user only sees their portfolio’s data when switching or when defaulting to their only portfolio).

---

## 6. Backend (Kotlin)

- Scheduler today: loads active tasks from MongoDB and calls Next.js (e.g. run-task). Once report jobs are portfolio-scoped:
  - Either: backend loads `reportJobs` with a filter (e.g. all portfolios or by list of portfolioIds) and sends `portfolioId` in each request to Next.js; Next.js run-task validates and runs in that portfolio context.
  - Or: Next.js cron remains the only runner and loads report jobs per portfolio and runs them (backend does not read reportJobs). Prefer this if all job definitions live in Next.js.
- If backend has its own MongoDB access (e.g. AccountRepository.findAll()), add `portfolioId` to all tenant-scoped repositories and pass portfolio context from HTTP (e.g. header `X-Portfolio-Id`) set by frontend or by Next.js when calling backend. Ensure backend never returns data from another portfolio.

---

## 7. Migration (Existing Data)

- If DB already has data without `portfolioId`:
  - Create one “default” portfolio (e.g. name “Default”) and set `authorizedUserIds` to a list of known admin/test user ids (or leave empty and backfill later).
  - Backfill: for each tenant-scoped collection, set `portfolioId` to that default portfolio’s id for all documents that don’t have it.
  - After backfill, make `portfolioId` required in app code and add indexes.

---

## 8. Implementation Order

1. **Types and DB**
   - Add `PortfolioDoc` and `portfolioId` to tenant-scoped types; create `portfolios` collection and add `portfolioId` to tenant-scoped collections (schema + index plan).
2. **Auth/session**
   - Add `portfolioId` to session; implement `requirePortfolio(session)` and “resolve or create default portfolio” for new users.
3. **Portfolio API**
   - Implement GET/POST /api/portfolios and switch/set current portfolio.
4. **Scoped APIs**
   - Update dashboard, accounts, brokers, watchlists, watchlist, alerts, report jobs, reports, push, scheduler/cron, and internal run-task to use portfolioId.
5. **Onboarding**
   - After login, if no portfolio → create one and set as current; optionally redirect to “Import broker data”.
6. **Seed and test**
   - Seed script: create test user (authUsers) and optionally one portfolio; document “create test user → register portfolio → import broker data” and add tests that verify portfolioId on all created data and no cross-tenant leakage.
7. **Backend**
   - Add portfolio context to any backend calls and MongoDB reads/writes that are tenant-scoped.

This plan keeps the existing “portfolio” as an aggregate view of accounts but ties every underlying document to a stored **Portfolio** tenant and ensures each portfolio has a list of authorized users, with new users getting an empty portfolio and the default flow supporting many tenants end-to-end.
