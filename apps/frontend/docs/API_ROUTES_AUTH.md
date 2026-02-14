# API routes – auth and best practices

## Proxy (middleware) and session

**All `/api/*` requests are excluded from the auth proxy** (`src/proxy.ts` matcher). Route handlers receive the request (and cookies) directly and use `getSessionFromRequest(request)` or `requireSessionFromRequest(request)` for consistent session resolution. The proxy only runs for page requests (e.g. `/`, `/accounts`), not for API routes.

## Auth pattern (App Router Route Handlers)

Use **request-based session** so the session is read from the incoming request cookie (avoids session missing when auth wrapper or `auth()` don’t see the cookie):

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/require-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // use session.user.id, etc.
  return NextResponse.json({ data: "..." });
}
```

Alternative (returns 401 response for you):

```ts
import { requireSessionFromRequest } from "@/lib/require-session";

export async function POST(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  // session is Session
}
```

For **portfolio-scoped** routes, use `getPortfolioOr401Response` from `@/lib/tenant`:

```ts
import { getSessionFromRequest } from "@/lib/require-session";
import { getPortfolioOr401Response } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  // query by portfolio._id
}
```

## Public routes (no auth)

- `GET /api/brokers`, `GET /api/brokers/[id]` – broker list/detail
- `GET /api/health`, `GET /api/health/live`
- `GET /api/weather`
- Auth endpoints under `api/auth/`

## Routes using request-based session

All of these use `getSessionFromRequest(request)` or `requireSessionFromRequest(request)`:

- **Portfolios:** portfolios (GET, POST), portfolios/current, portfolios/switch, portfolios/[id] (GET, PATCH, DELETE)
- **Dashboard & accounts:** dashboard, dashboard/timeline, accounts, accounts/[id]
- **Tasks & scheduler:** tasks (POST), tasks/[id], scheduler (POST)
- **Positions:** positions (POST), positions/[id] (GET, PUT, DELETE), positions/[id]/close
- **Other:** activities, chat, chat/history, login-history, security-alerts, auth-users, access-keys, brokers (POST, PUT, DELETE), goals/config (PUT), watchlist (POST), xtools/console, x-allowed-usernames (GET, POST, DELETE), x-allowed-usernames/seed, import/* (broker, parse-broker, holdings, format, format-merrill, csv, activities)

## See also

- [AUTH_X_BEST_PRACTICES.md](./AUTH_X_BEST_PRACTICES.md) – X (Twitter) OAuth, session cookie, and middleware vs route-level auth.
