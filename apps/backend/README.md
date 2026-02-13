# myinvestments-backend

Kotlin Spring Boot backend for myinvestments. OpenAPI-first, hexagonal layout, Arrow-KT for domain/application. Phased migration from Next.js API; see plan in repo.

## Run

- Requires Java 21 and MongoDB (or set `MONGODB_URI`).

From this directory:

```bash
cd apps/backend
./gradlew bootRun
```

Env: `MONGODB_URI`, `MONGODB_DB` (default `myinvestments`), optional `SERVER_PORT` (default 8080), `APP_VERSION`.

### Scheduler (Spring)

When `NEXTJS_URL` is set, the backend runs the scheduler: it reads active report tasks from MongoDB (`reportJobs`) and triggers Next.js `POST /api/internal/run-task` at cron times. It also triggers `refreshHoldingsPrices` every 15 minutes. Set `NEXTJS_URL` (e.g. `http://localhost:3000` or `http://app:3000` in Docker) and optionally `CRON_SECRET` (must match Next.js if you protect the internal endpoint). See root `DEVELOPMENT.md`.

## Endpoints by phase

- **Phase 0**: `GET/POST /health`, `GET /health/live`, `GET/POST /accounts`, `GET/PUT/DELETE /accounts/{id}`
- **Phase 1**: `GET /market`, `GET /dashboard`, `GET /dashboard/timeline`, `GET /profile`, `GET /app-config`
- **Phase 2**: `GET/POST /positions`, `GET/PUT/DELETE /positions/{id}`, `POST /positions/{id}/close`, `GET/DELETE /activities`, `POST /import/activities`
- **Phase 3**: `GET/POST /watchlists`, `GET /alerts`
- **Phase 4–6**: `GET /tasks`, `GET /reports`, `GET /options`, `GET/POST /chat`, etc. (stub or minimal)

- `GET /v3/api-docs` — OpenAPI JSON
- `GET /swagger-ui.html` — Swagger UI

## Frontend integration

Set `NEXT_PUBLIC_API_URL=http://localhost:8080` (or your backend URL) so the Next.js app can call this API. Proxy or feature flags can route by path during migration.

## OpenAPI spec

See `api-spec/openapi.yaml` in the repo root.
