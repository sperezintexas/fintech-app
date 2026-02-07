# Migration: Elastic Beanstalk → AWS App Runner

Plan to remove EB deployment and use AWS App Runner instead. App Runner runs containers from ECR (same image we already build), with simpler config and no `Dockerrun.aws.json` / `.ebextensions`.

---

## What App Runner Needs

### One-time setup (before CI can deploy)

1. **App Runner service** (create once in AWS Console or CLI):
   - **Source:** ECR — same repo/image we push from CI (`myinvestments`, tag `latest` or `github.sha`).
   - **Instance role:** For ECR pull (App Runner provides a default or use custom).
   - **CPU / memory:** e.g. 1 vCPU, 2 GB (adjust as needed).
   - **Port:** 3000 (matches Dockerfile).
   - **Environment variables:** Set in service config (Console → Service → Configuration → Edit → Environment variables). Same keys as today: `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`, `NEXTAUTH_URL`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `XAI_API_KEY`, `WEB_SEARCH_API_KEY`, `CRON_SECRET`, `SLACK_WEBHOOK_URL`. No script like `eb setenv` — set once in Console or via CLI when creating/updating the service.
   - **Auto-deploy:** Optional. If you turn off “Deploy new image when available”, CI will trigger deploy via `aws apprunner start-deployment`.

2. **IAM** (for GitHub Actions):
   - Same as today: ECR push + one more — **App Runner**: `apprunner:StartDeployment`, `apprunner:DescribeService`, `apprunner:DescribeDeployment` (so we can wait for deployment and get ServiceUrl).

3. **GitHub**:
   - **Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (unchanged).
   - **Variables:** `ENABLE_AWS_DEPLOY=true` (or rename to `ENABLE_APP_RUNNER`), `AWS_REGION`, **`APP_RUNNER_SERVICE_ARN`** (required — ARN of the App Runner service). Optional: `APP_URL` (for health check; can also be derived from `describe-service` → ServiceUrl).

---

## CI workflow change

- **Keep:** Checkout, AWS credentials, ECR login, create ECR repo if missing, **build and push Docker image** (unchanged).
- **Remove:** Update Dockerrun.aws.json, Create deployment package (zip), Deploy to Elastic Beanstalk, Get deployment URL (EB CNAME), and any EB-specific steps.
- **Add:**
  1. **Deploy to App Runner:** `aws apprunner start-deployment --service-arn $APP_RUNNER_SERVICE_ARN`
  2. **Wait for deployment:** Poll `aws apprunner describe-deployment` until Status = `COMPLETED` (or timeout).
  3. **Get service URL:** `aws apprunner describe-service --service-arn $APP_RUNNER_SERVICE_ARN` → use `ServiceUrl` (or use `vars.APP_URL` if set).
  4. **Health check:** Same as today — `GET $APP_URL/api/health`, retry a few times.
  5. **Validate health before Slack:** Same as today — fail job if health skipped or not ok.
  6. **Notify Slack (AWS deploy):** Same as today — post success/failure with health and link.

---

## What to remove (EB-only)

| Item | Action |
|------|--------|
| **.github/workflows/ci.yml** | Replace `aws-deploy` job with `apprunner-deploy` job (ECR + App Runner + health + Slack). |
| **.github/workflows/eb-deploy.yml** | Remove (or keep for reference until migration is done, then delete). |
| **.github/workflows/eb-deploy-ecr.yml** | Remove (or keep for reference, then delete). |
| **Dockerrun.aws.json** | Remove. |
| **.ebextensions/** | Remove entire directory. |
| **.ebignore** | Remove. |
| **.platform/** | Remove (EB-specific hooks). |
| **scripts/eb-deploy.sh** | Remove. |
| **scripts/eb-setenv-from-file.sh** | Remove (App Runner env vars are set in Console/CLI, not via a script that calls EB). |
| **scripts/deploy-ecr.sh** | Update: remove Dockerrun.aws.json and EB deploy steps; optionally add App Runner `start-deployment` for local/manual deploy. |
| **scripts/aws-setup.sh** | Update or remove: drop EB creation; optionally add App Runner service creation hints. |
| **scripts/fix-vpc.sh** | Remove or archive (EB VPC). |
| **scripts/get-vpc-info.sh** | Remove or archive (EB VPC). |
| **docs/aws-setup-guide.md** | Replace with App Runner setup (create service, IAM, env vars, GitHub vars). |
| **docs/aws-elastic-beanstalk.md** | Remove or replace with `docs/aws-app-runner.md`. |
| **docs/ci.md** | Update: EB → App Runner (job name, variables like `APP_RUNNER_SERVICE_ARN`, health URL from ServiceUrl). |
| **readme.md** | Replace EB URLs with App Runner URL; deployment section → App Runner. |
| **.dockerignore** | Remove `.elasticbeanstalk/*` if present (no impact if kept). |
| **.gitleaks.toml** | Remove allowlist entry for `docs/aws-elastic-beanstalk.md` if we delete that file. |

---

## What to add

| Item | Action |
|------|--------|
| **.github/workflows/ci.yml** | New job `apprunner-deploy`: ECR push → `aws apprunner start-deployment` → wait → get ServiceUrl → health check → validate → Slack. |
| **docs/aws-app-runner.md** | New doc: create App Runner service (ECR source, port 3000, env vars), IAM for CI, GitHub vars (`APP_RUNNER_SERVICE_ARN`, `APP_URL`), NEXTAUTH_URL = App Runner URL. |
| **docs/aws-app-runner-setup-guide.md** (or merge into one) | Step-by-step: create service in Console, set env vars, note Service ARN and URL, add GitHub vars. |
| **scripts/apprunner-set-env.sh** (optional) | If we want to sync env from a file to App Runner: use `aws apprunner update-service` with environment variables (AWS CLI supports `--source-configuration "ImageRepository={...}"` and service config; env vars are in service update). Only if we want file-based env sync; otherwise set once in Console. |

---

## App Runner vs EB (quick comparison)

| | Elastic Beanstalk | App Runner |
|--|-------------------|------------|
| **Config** | Dockerrun.aws.json, .ebextensions, zip | Service config (ECR + port + env vars) |
| **Deploy** | Upload zip + beanstalk-deploy | Push image to ECR + start-deployment |
| **Env vars** | `eb setenv` or Console | Console or CLI when creating/updating service |
| **URL** | CNAME (e.g. env.region.elasticbeanstalk.com) | ServiceUrl (e.g. xxx.region.awsapprunner.com) |
| **Scaling** | EC2-based, more control | Managed, request-based |
| **Cron / Agenda** | Long-running process (Agenda runs in container) | Same — container runs until scaled down; use GitHub Actions cron to hit `/api/cron/*` if needed (same as today). |

---

## Implementation order

1. **One-time:** Create App Runner service in AWS (ECR source, port 3000, env vars). Note **Service ARN** and **Service URL**. Add GitHub variable `APP_RUNNER_SERVICE_ARN`; set `APP_URL` to Service URL for health check.
2. **CI:** In `ci.yml`, replace the `aws-deploy` job with `apprunner-deploy` (ECR push + App Runner start-deployment + wait + health + Slack). Use variable `ENABLE_AWS_DEPLOY` or new `ENABLE_APP_RUNNER` to gate the job.
3. **Docs:** Add `docs/aws-app-runner.md` (and optionally setup guide). Update `docs/ci.md`, readme, and any links that point to EB.
4. **Remove EB:** Delete or archive EB-only files and workflows; update scripts that reference EB; update gitleaks allowlist if needed.
5. **Test:** Push to main, confirm App Runner deploys, health check passes, Slack notification works. Update X (Twitter) callback URL to App Runner URL if it was pointing to EB.

---

## Env vars on App Runner

- Set in **AWS Console:** App Runner → your service → Configuration → Edit → Environment variables.
- Or via **CLI** when creating/updating service: `aws apprunner create-service` / `aws apprunner update-service` with `--instance-configuration "Cpu=1024,Memory=2048"` and environment variables in the source/image configuration or in the service configuration (see AWS docs for exact JSON structure).
- **AWS Secrets Manager:** To create one secret per env var from `.env.prod` (for use in App Runner or elsewhere), run: `./scripts/aws-secrets-from-env.sh [env-file] [secret-prefix] [region]`. Default: `.env.prod`, prefix `myinvestments/prod`, region `us-east-1`. Secret names: `myinvestments/prod/MONGODB_URI`, etc. IAM needs `secretsmanager:CreateSecret`, `PutSecretValue`, `DescribeSecret`.
