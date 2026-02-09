# Smart Scheduler

Standalone Agenda.js worker. The **only** process that starts Agenda and runs job handlers. The Next.js web app does **not** start Agenda; it only enqueues/schedules jobs via `src/lib/agenda-client.ts`. See `.cursor/rules/smart-scheduler-separation.mdc` and root `README.md` (Architecture).

## Run from repo root

Env must be set (e.g. `MONGODB_URI`, `MONGODB_DB`). Use `.env.local` or `node --env-file=.env.local` when invoking the script.

```bash
pnpm run start:scheduler
# or: npm run start:scheduler
```

## Dev (watch mode)

From repo root (path resolution uses root tsconfig):

```bash
pnpm run start:scheduler
```

To run with auto-restart on file changes, use `ts-node-dev` from `apps/smart-scheduler` with `TS_NODE_PROJECT=apps/smart-scheduler/tsconfig.json` (see `package.json` in this app).

## Deployment

- **Docker:** One image runs both web and scheduler via **pm2** (`ecosystem.config.js`). No separate container needed.
- **Two services:** Alternatively run **web** (Next.js) and **smart-scheduler** as two processes (e.g. EC2 with systemd or two containers). Same MongoDB and collection (`scheduledJobs`); both need `MONGODB_URI` and `MONGODB_DB`.
- Scheduler does not expose a port; optional health endpoint (e.g. 3001) can be added if needed.
