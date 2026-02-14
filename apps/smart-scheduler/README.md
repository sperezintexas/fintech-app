# Smart Scheduler (master job runner) — **Deprecated**

**Preferred:** Use the Kotlin backend scheduler. Set `NEXTJS_URL` and `CRON_SECRET` on the backend; it reads `reportJobs` from MongoDB and triggers Next.js `/api/internal/run-task`. See root `DEVELOPMENT.md` and `apps/backend/README.md`.

This app is a standalone Agenda.js worker. **Local/Next.js node is a slave** (schedules only via UI/API); **this process is the master** and is the only one that runs job handlers. The web app uses `src/lib/agenda-client.ts` to enqueue/schedule; it never starts Agenda.

- **Slave (local):** Next.js or any node without `AGENDA_MASTER=true` — no job execution.
- **Master (remote):** Run this app with `AGENDA_MASTER=true` so it starts Agenda and runs jobs.

See `.cursor/rules/smart-scheduler-separation.mdc` and root `README.md` (Architecture).

## Run from repo root

Env must be set (e.g. `MONGODB_URI`, `MONGODB_DB`). **Set `AGENDA_MASTER=true`** when this process is the designated job runner. Use `.env.local` or `node --env-file=.env.local` when invoking.

```bash
pnpm run start:scheduler
# or: npm run start:scheduler
```

## Dev (watch mode)

From repo root. To actually run jobs locally, set `AGENDA_MASTER=true`:

```bash
AGENDA_MASTER=true pnpm run start:scheduler
```

To run with auto-restart on file changes, use `ts-node-dev` from `apps/smart-scheduler` with `TS_NODE_PROJECT=apps/smart-scheduler/tsconfig.json` (see `package.json` in this app).

## Deployment

- **Docker:** One image runs both web and scheduler via **pm2** (`ecosystem.config.js`). No separate container needed.
- **Two services:** Alternatively run **web** (Next.js) and **smart-scheduler** as two processes (e.g. EC2 with systemd or two containers). Same MongoDB and collection (`scheduledJobs`); both need `MONGODB_URI` and `MONGODB_DB`.
- Scheduler does not expose a port; optional health endpoint (e.g. 3001) can be added if needed.

## Troubleshooting

- **MongoServerSelectionError / TLS "internal error" / ReplicaSetNoPrimary:** If the scheduler can’t connect to MongoDB, **check Atlas Network Access first**: add the deployment’s outbound IP (or `0.0.0.0/0` for testing) to the cluster’s IP Access List. A new DB or new environment often needs this before the app can connect.
