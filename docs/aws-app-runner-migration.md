# AWS App Runner Deployment

App Runner runs the app from a Docker image in ECR. CI builds the image, pushes to ECR, then triggers an App Runner deployment.

---

## What App Runner Needs

### One-time setup (before CI can deploy)

1. **App Runner service** (create once in AWS Console or CLI):
   - **Source:** ECR — same repo/image we push from CI (`myinvestments`, tag `latest` or `github.sha`).
   - **Instance role:** For ECR pull (App Runner provides a default or use custom).
   - **CPU / memory:** e.g. 1 vCPU, 2 GB (adjust as needed).
   - **Port:** 3000 (matches Dockerfile).
   - **Environment variables:** Set in service config (Console → Service → Configuration → Edit → Environment variables). Same keys: `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`, `NEXTAUTH_URL`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `XAI_API_KEY`, `WEB_SEARCH_API_KEY`, `CRON_SECRET`, `SLACK_WEBHOOK_URL`. For a custom domain (e.g. `https://example.com`), set `NEXTAUTH_URL`, `AUTH_URL`, and `NEXT_PUBLIC_APP_URL` to that URL. No script — set once in Console or via CLI when creating/updating the service.
   - **Auto-deploy:** Optional. If you turn off “Deploy new image when available”, CI will trigger deploy via `aws apprunner start-deployment`.

2. **IAM** (for GitHub Actions):
   - ECR push + **App Runner**: `apprunner:StartDeployment`, `apprunner:DescribeService`, `apprunner:DescribeDeployment` (to wait for deployment and get ServiceUrl).

3. **GitHub**:
   - **Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
   - **Variables:** `ENABLE_AWS_DEPLOY=true` (or `ENABLE_APP_RUNNER`), `AWS_REGION`, **`APP_RUNNER_SERVICE_ARN`** (ARN of the App Runner service). Optional: `APP_URL` (for health check; can be derived from `describe-service` → ServiceUrl).

---

## CI workflow

- Checkout, AWS credentials, ECR login, create ECR repo if missing, **build and push Docker image**.
- **Deploy to App Runner:** `aws apprunner start-deployment --service-arn $APP_RUNNER_SERVICE_ARN`
- **Wait for deployment:** Poll `aws apprunner describe-deployment` until Status = `COMPLETED` (or timeout).
- **Get service URL:** `aws apprunner describe-service --service-arn $APP_RUNNER_SERVICE_ARN` → use `ServiceUrl` (or `vars.APP_URL` if set).
- **Health check:** `GET $APP_URL/api/health`, retry a few times.
- **Validate health before Slack:** Fail job if health skipped or not ok.
- **Notify Slack (AWS deploy):** Post success/failure with health and link.

---

## Implementation order

1. **One-time:** Create App Runner service in AWS (ECR source, port 3000, env vars). Note **Service ARN** and **Service URL**. Add GitHub variable `APP_RUNNER_SERVICE_ARN`; set `APP_URL` to Service URL for health check.
2. **CI:** In `ci.yml`, `apprunner-deploy` job: ECR push → `aws apprunner start-deployment` → wait → get ServiceUrl → health check → validate → Slack. Use variable `ENABLE_AWS_DEPLOY` or `ENABLE_APP_RUNNER` to gate the job.
3. **Docs:** See `docs/ci.md` for workflow details. Update readme and any links to point to App Runner URL.
4. **Test:** Push to main, confirm App Runner deploys, health check passes, Slack notification works. Set X callback URL to App Runner URL.

---

## Env vars on App Runner

- Set in **AWS Console:** App Runner → your service → Configuration → Edit → Environment variables.
- Or via **CLI** when creating/updating service: `aws apprunner create-service` / `aws apprunner update-service` with `--instance-configuration "Cpu=1024,Memory=2048"` and environment variables in the source/image configuration or in the service configuration (see AWS docs for exact JSON structure).
- **AWS Secrets Manager:** To create one secret per env var from `.env.prod` (for use in App Runner or elsewhere), run: `./scripts/aws-secrets-from-env.sh [env-file] [secret-prefix] [region]`. Default: `.env.prod`, prefix `myinvestments/prod`, region `us-east-1`. Secret names: `myinvestments/prod/MONGODB_URI`, etc. IAM needs `secretsmanager:CreateSecret`, `PutSecretValue`, `DescribeSecret`.
