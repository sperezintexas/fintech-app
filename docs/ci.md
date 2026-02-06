# CI Pipeline — Summary & Debugging

## Overview

- **Workflow:** `.github/workflows/ci.yml` runs on push/PR to `main` and `develop`.
- **Node:** 22 (required for yahoo-finance2).
- **Jobs (order):** Lint → Type Check → Test → Build → Docker Build → [AWS Build & Deploy to EB, on main when AWS secrets set] → Notify Slack.

## Job Summary

| Job | Purpose | Common failures |
|-----|---------|-----------------|
| **Lint** | `npm run lint` | ESLint errors in `src/` — fix reported file/line. |
| **Type Check** | `npx tsc --noEmit` | Type errors — fix types or declarations. |
| **Test** | `npm test` (vitest) | Failing tests — fix test or app code. |
| **Build** | `npm run build` (Next.js) | OOM, Next.js error, or missing `.next` — see below. |
| **Docker Build** | Build image from Dockerfile | Dockerfile or build-args (MONGODB_URI, MONGODB_DB). |
| **Build & Deploy to AWS (EB)** | Build Docker image, push to ECR, deploy to Elastic Beanstalk | Only on push to `main` when AWS secrets are set. ECR/EB permissions, wrong region or env name. |
| **Notify Slack** | Post result + optional Vercel/health | Missing SLACK_WEBHOOK_URL; health check fails if APP_URL wrong or app down. |

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

## AWS Build & Deploy (Elastic Beanstalk)

- **When it runs:** Push to `main` and repository secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set (non-empty). Otherwise the job is skipped.
- **What it does:** Builds the app Docker image, pushes it to Amazon ECR (tagged with `github.sha` and `latest`), updates `Dockerrun.aws.json` with the ECR image, creates `deploy.zip`, and deploys to Elastic Beanstalk via `einaregilsson/beanstalk-deploy`.
- **Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- **Variables (optional):** `AWS_REGION` (default `us-east-1`), `EB_ENV_NAME` (default `myinvestments-prod`).
- **Requirements:** EB application and environment must already exist; IAM user must have ECR and Elastic Beanstalk deploy permissions.

## Secrets & Variables (Notify Slack / Vercel)

- **Secrets:** `SLACK_WEBHOOK_URL` (Slack build status), `VERCEL_TOKEN` (optional, deployment status).
- **Variables:** `APP_URL` (health check URL), `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` (optional).
- See readme "CI build notifications (Slack)" and "Vercel: callback and health check".

## Quick Fixes

- **Lint/type/test:** Fix the file and line from the log; run `npm run lint`, `npx tsc --noEmit`, `npm test` locally.
- **Build:** Run `npm run build` locally with `MONGODB_URI`/`MONGODB_DB` set; if it passes, CI failure may be OOM or env — ensure workflow has `NODE_OPTIONS=--max-old-space-size=4096` and env vars.
- **Upload artifact:** Ensure workflow has the "List build output", "Fail if build did not produce .next", and conditional "Upload build artifacts" steps; then fix the underlying build if `.next` is missing.
