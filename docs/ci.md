# CI Pipeline — Summary & Debugging

## Overview

- **Workflow:** `.github/workflows/ci.yml` runs on push/PR to `main` and `develop`.
- **Node:** 22 (required for yahoo-finance2).
- **Jobs (order):** Lint → Type Check → Test → Build → Docker Build → [Build & Deploy to App Runner, on main when ENABLE_AWS_DEPLOY=true] → Notify Slack.

## Job Summary

| Job | Purpose | Common failures |
|-----|---------|-----------------|
| **Lint** | `npm run lint` | ESLint errors in `src/` — fix reported file/line. |
| **Type Check** | `npx tsc --noEmit` | Type errors — fix types or declarations. |
| **Test** | `npm test` (vitest) | Failing tests — fix test or app code. |
| **Build** | `npm run build` (Next.js) | OOM, Next.js error, or missing `.next` — see below. |
| **Docker Build** | Build image from Dockerfile | Dockerfile or build-args (MONGODB_URI, MONGODB_DB). |
| **Build & Deploy to App Runner** | Build Docker image, push to ECR, deploy to AWS App Runner | Only on push to `main` when `ENABLE_AWS_DEPLOY=true`. ECR/App Runner permissions, missing APP_RUNNER_SERVICE_ARN. |
| **Notify Slack** | Post build result + health check (when APP_URL set) | Missing SLACK_WEBHOOK_URL; health check fails if APP_URL wrong or app down. |

## Build Job Details

- **Command:** `npm run build` (Next.js with `output: "standalone"` in `next.config.ts`).
- **Env:** `MONGODB_URI`, `MONGODB_DB`, `NODE_OPTIONS=--max-old-space-size=4096`.
- **Output:** `.next/` (and `.next/standalone/` for standalone). If `.next` is missing after build, the job fails at "Fail if build did not produce .next".
- **Upload:** "Upload build artifacts" runs only when `.next` exists; no "No files were found" from upload when the workflow is up to date.

### If Build Fails or .next Is Missing

1. Open the **Build** job in GitHub Actions and check the **"Build application"** step logs (not only "Upload build artifacts").
2. **OOM:** We set `NODE_OPTIONS=--max-old-space-size=4096`. If it still OOMs, consider increasing or splitting the build.
3. **Next.js error:** Fix the reported error (e.g. missing env, bad import, incompatible dependency).
4. **"No files were found with the provided path: .next":** Either the build step failed earlier (see step 1) or the workflow is an old version. Update `.github/workflows/ci.yml` to the current version (List build output with `id: list`, "Fail if build did not produce .next", conditional upload with `if: steps.list.outputs.has_next == 'true'`).

## AWS Build & Deploy (App Runner)

- **When it runs:** Push to `main` and repository variable `ENABLE_AWS_DEPLOY` is set to `true` (and secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` are configured). Otherwise the job is skipped. *Note: `secrets` cannot be used in workflow `if` conditions; use the variable to enable the job.*
- **What it does:** Builds the app Docker image, pushes it to Amazon ECR (tagged with `github.sha` and `latest`), triggers App Runner deployment (`aws apprunner start-deployment`), waits for the deployment operation to succeed, then:
  - **Get service URL:** From `vars.APP_URL` or `aws apprunner describe-service` → ServiceUrl.
  - **Health check:** Calls `/api/health` up to 6 times (10s apart). Job fails if health never returns 200 with status `ok`/`healthy`/`degraded`/`success`.
  - **Validate health before Slack:** Fails the job if health check was skipped or did not pass.
  - **Slack:** If `SLACK_WEBHOOK_URL` is set, posts deploy result (success/failure), health status, app version, commit, and workflow link (`if: always()` so failure is also reported).
- **Variables (required for deploy):** `ENABLE_AWS_DEPLOY` = `true`, **`APP_RUNNER_SERVICE_ARN`** (ARN of the App Runner service; set in Settings → Actions → Variables).
- **Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Optional: `SLACK_WEBHOOK_URL` (for deploy notification).
- **Variables (optional):** `AWS_REGION` (default `us-east-1`), `APP_URL` (App Runner URL for health check; if unset, URL is derived from describe-service).
- **Requirements:** App Runner service must already exist (ECR source, port 3000, env vars set in service config). IAM user must have ECR push and App Runner (`StartDeployment`, `DescribeService`, `ListOperations`) permissions.

## Secrets & Variables (Notify Slack / Health)

- **Deployment:** AWS App Runner (push to `main` when `ENABLE_AWS_DEPLOY=true`). See "AWS Build & Deploy (App Runner)" above.
- **Secrets:** `SLACK_WEBHOOK_URL` (Slack build status).
- **Variables:** `APP_URL` (App Runner service URL for health check on main/develop, e.g. `https://xxx.region.awsapprunner.com`). No trailing slash.
- See readme "CI build notifications (Slack)" and deployment section.

## Quick Fixes

- **Lint/type/test:** Fix the file and line from the log; run `npm run lint`, `npx tsc --noEmit`, `npm test` locally.
- **Build:** Run `npm run build` locally with `MONGODB_URI`/`MONGODB_DB` set; if it passes, CI failure may be OOM or env — ensure workflow has `NODE_OPTIONS=--max-old-space-size=4096` and env vars.
- **Upload artifact:** Ensure workflow has the "List build output", "Fail if build did not produce .next", and conditional "Upload build artifacts" steps; then fix the underlying build if `.next` is missing.
