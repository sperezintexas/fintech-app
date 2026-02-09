# Docker Optimization Plan (Production-Ready)

Based on `.cursor/rules/docker-optimization.mdc`. Current state vs goals and a phased implementation plan.

---

## Current State

| Area | Current | Rule goal |
|------|--------|-----------|
| Base image | `node:22-alpine` (linux/amd64) | node:20-alpine (rule); we keep 22 for Node 22 requirement |
| Package manager | npm (`npm ci`) | pnpm |
| Build output | Next.js **standalone** (server.js + .next/static + public) | Rule shows full node_modules + src (for non-standalone) |
| Process model | **Single process**: `node server.js` runs Next.js + Agenda (Agenda starts in `instrumentation.ts`) | Rule suggests pm2 with web + scheduler as two processes |
| Root | Runs as **root** | Non-root user (nextjs) |
| Final stage | Copies only standalone artifacts | — |
| .dockerignore | Present (node_modules, .next, .git, coverage, etc.) | Same + ensure no bloat |

**Important:** This app runs Agenda **inside** the same Node process as Next.js (via `instrumentation.ts`). So one process does both web and scheduler. The rule’s pm2 + separate “scheduler” process is for setups where the scheduler is a separate script. We do **not** need two processes unless we split the scheduler into its own entry point later.

---

## Goals (from rule)

- Small final image (<300 MB)
- Fast rebuilds (layer caching)
- Secure: non-root user
- Reliable: current single-process model is fine; optional pm2 later if we split
- Compatible: AWS App Runner, Railway, Fly.io, Render (keep platform linux/amd64 for App Runner)

---

## Phase 1: Security + Small Tweaks (recommended)

1. **Add non-root user in Dockerfile**
   - In final stage: `RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs`
   - Copy all artifacts with `--chown=nextjs:nodejs`
   - Add `USER nextjs` before `CMD`
   - Ensure standalone `server.js` and files are readable by `nextjs` (no special permissions needed for default standalone layout).

2. **Set env in final stage**
   - `ENV NODE_ENV=production`
   - `ENV NEXT_TELEMETRY_DISABLED=1`
   - Keep `ENV HOSTNAME=0.0.0.0` and `PORT=3000` for App Runner.

3. **Keep single CMD**
   - Keep `CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]` (or equivalent with `node server.js`).
   - No pm2 or ecosystem.config.js required while Agenda runs in-process.

4. **.dockerignore**
   - Already excludes node_modules, .next, .git, coverage, *.md. No change required unless you add more bloat (e.g. docs, scripts).

5. **Verify image size**
   - After building: `docker build ... && docker images` to confirm <300 MB. Standalone is typically 200–400 MB with Alpine.

**Outcome:** Same behavior, non-root, smaller attack surface, same single-process web+scheduler.

---

## Phase 2: Optional – Migrate to pnpm

- Add `pnpm-lock.yaml` (run `pnpm import` or `pnpm install` and commit).
- In Dockerfile builder: use `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`; no `pnpm prune --prod` if you stay with standalone (standalone doesn’t copy full node_modules to final stage).
- In CI (e.g. `.github/workflows/ci.yml`): install with pnpm, run `pnpm test`, `pnpm run lint`, `pn run build`.
- **Trade-off:** Slightly faster installs and smaller install footprint vs. one-time migration and CI/team switch to pnpm.

---

## Phase 3: Optional – Multi-process (only if scheduler is split)

Only if we later introduce a **separate** scheduler entry (e.g. a script that only runs Agenda, no Next.js):

- Add `ecosystem.config.js` with pm2: `web` (Next.js) + `scheduler` (e.g. `node run-scheduler.js`).
- In Dockerfile final stage: install pm2 (`npm install -g pm2@5`), copy `ecosystem.config.js`, `CMD ["pm2-runtime", "start", "ecosystem.config.js"]`.
- Then we’d need to copy `src` (and possibly a built scheduler bundle) into the image for the scheduler process.

**Not needed** while Agenda starts in the same process as Next.js via instrumentation.

---

## Implementation Checklist (Phase 1)

- [x] Dockerfile: add `nodejs` group and `nextjs` user (gid/uid 1001).
- [x] Dockerfile: all `COPY` in final stage use `--chown=nextjs:nodejs`.
- [x] Dockerfile: add `USER nextjs` before `CMD`.
- [x] Dockerfile: set `ENV NEXT_TELEMETRY_DISABLED=1` in final stage.
- [ ] Build and run locally: `docker build -t myinvestments . && docker run -p 3000:3000 -e MONGODB_URI=... myinvestments`.
- [ ] Confirm app and Agenda start (check logs for “[instrumentation] Agenda scheduler started”).
- [ ] Confirm health: `curl http://localhost:3000/api/health/live`.
- [ ] Check image size: `docker images myinvestments`.

---

## App Runner / Health

- Port: 3000 (already in Dockerfile).
- Health check: use `/api/health/live` or `/api/health` (configure in App Runner console).
- CPU/Memory: 1 vCPU, 2 GB is a good starting point (already common for Next.js + Agenda).

---

## Summary

- **Do now (Phase 1):** Non-root user, `NEXT_TELEMETRY_DISABLED=1`, keep standalone and single-process.
- **Consider later:** pnpm (Phase 2), multi-process with pm2 (Phase 3) only if we split the scheduler into a separate process.
