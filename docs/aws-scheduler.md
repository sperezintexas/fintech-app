# AWS: Scheduler (Agenda) Setup for App Runner and EC2

The app starts the Agenda job scheduler **at Node process startup** via `src/instrumentation.ts`, so no extra AWS setup is required beyond running the app with a valid MongoDB connection.

## Requirements

1. **MongoDB reachable**
   Set `MONGODB_URI` (and optionally `MONGODB_DB`) in the environment. App Runner and EC2 must have network access to your MongoDB (e.g. Atlas, DocumentDB, or EC2-hosted Mongo).

2. **Long-lived process**
   - **App Runner**: One container per service; the process is long-lived. Agenda starts when the container starts and keeps running.
   - **EC2**: Same: run `npm start` (or your process manager); Agenda starts with the app.

3. **Single instance for scheduling (recommended)**
   If you run multiple instances (e.g. multiple App Runner instances or several EC2 nodes), each will have its own Agenda. Agenda uses MongoDB locks so a given job type only runs on one instance at a time, but you may see duplicate polling. For predictable scheduling, use one instance or a single dedicated worker that runs the same app and connects to the same MongoDB.

## No extra AWS services needed

- No EventBridge, Lambda, or separate worker service is required.
- The Next.js server process runs Agenda in-process and polls MongoDB every minute (`processEvery: "1 minute"`).

## App Runner

- Set **Runtime environment variables** (or secrets) in the App Runner service: at least `MONGODB_URI`, plus any other env the app needs (e.g. `NEXTAUTH_SECRET`, Slack webhook, etc.).
- Ensure the App Runner VPC/security group can reach MongoDB (e.g. allow outbound to Atlas or your DB subnet).
- After deploy, the container starts, Next.js runs `register()` in `instrumentation.ts`, and Agenda starts. You should see in logs: `[instrumentation] Agenda scheduler started at process startup` or, if MongoDB was temporarily down, a warning and retry on first use.

## EC2

- Install Node, build the app, run `npm start` (or use PM2/systemd).
- Set env vars (e.g. in `.env`, systemd unit, or shell) including `MONGODB_URI`.
- Ensure the EC2 security group allows outbound access to MongoDB.
- Same as App Runner: Agenda starts at process startup via instrumentation.

## If scheduler doesn’t start

- Check logs for `[instrumentation] Agenda scheduler failed to start` or `Agenda jobs unavailable`.
- Verify `MONGODB_URI` is set and reachable from the running environment.
- The first API call that uses Agenda (e.g. `/api/jobs`, `/api/health`) will call `getAgenda()` again; if MongoDB is available by then, the scheduler will start at that point.
