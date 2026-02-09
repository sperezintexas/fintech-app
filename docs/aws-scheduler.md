# AWS: Scheduler (Agenda) Setup for App Runner and EC2

The app uses a **two-process scheduler model**: the Next.js **web** app does **not** start Agenda; it only enqueues/schedules jobs via `src/lib/agenda-client.ts`. The **smart-scheduler** process is the only one that runs `agenda.start()` and job handlers.

## Requirements

1. **MongoDB reachable**
   Set `MONGODB_URI` (and optionally `MONGODB_DB`) in the environment. App Runner and EC2 must have network access to your MongoDB (e.g. Atlas, DocumentDB, or EC2-hosted Mongo).

2. **Long-lived scheduler process**
   - **Docker (recommended)**: The image runs **pm2** with two apps — **web** (Next.js) and **scheduler** (smart-scheduler). One container runs both; no extra AWS setup.
   - **EC2 without Docker**: Run the web with `pnpm start` (or `npm start`) and the scheduler in a second process: `pnpm run start:scheduler` (e.g. via systemd or pm2). Both need the same `MONGODB_URI` and `MONGODB_DB`.

3. **Single instance for scheduling (recommended)**
   If you run multiple instances, each would run its own scheduler; Agenda uses MongoDB locks so a given job runs on one instance at a time, but you may see duplicate polling. For predictable scheduling, use one instance or a single container that runs the scheduler.

## No extra AWS services needed

- No EventBridge, Lambda, or separate worker service is required.
- The smart-scheduler process polls MongoDB every minute (`processEvery: "1 minute"`). In Docker, pm2 keeps both web and scheduler running.

## App Runner

- Set **Runtime environment variables** (or secrets): at least `MONGODB_URI`, plus any other env the app needs (e.g. `NEXTAUTH_SECRET`, Slack webhook).
- Ensure the App Runner VPC/security group can reach MongoDB.
- The Docker image uses **pm2-runtime** to run **web** and **scheduler** in one container. After deploy, you should see logs from both (e.g. `[smart-scheduler] Started`).

## EC2 (without Docker)

- Build the app, then run two processes (e.g. with pm2 or systemd):
  - Web: `pnpm start` (or `npm start`)
  - Scheduler: `pnpm run start:scheduler` (or `npm run start:scheduler`)
- Set env vars (e.g. in `.env`, systemd, or shell) including `MONGODB_URI` and `MONGODB_DB` for both.

## If scheduler doesn’t start

- **Docker**: Check logs for the `scheduler` pm2 app; look for `[smart-scheduler] Fatal:` or MongoDB connection errors.
- **EC2**: Ensure the scheduler process is running and `MONGODB_URI` is set. The web app can run without the scheduler (APIs that enqueue jobs will write to MongoDB; jobs run when the scheduler process is up).
