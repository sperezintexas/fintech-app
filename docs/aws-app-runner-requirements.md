# App Runner deploy requirements (you have AWS creds — what’s next)

You have an IAM user with access keys. Follow this order.

---

## 1. IAM permissions for the deploy user

Attach a policy that allows **ECR** (build/push) and **App Runner** (deploy + describe).

**Option A — inline policy (recommended)**

IAM → Users → **myinvestments-deploy** (or your user) → Add permissions → Create inline policy → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECR",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECRRepo",
      "Effect": "Allow",
      "Action": [
        "ecr:CreateRepository",
        "ecr:DescribeRepositories",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "arn:aws:ecr:*:YOUR_ACCOUNT_ID:repository/myinvestments"
    },
    {
      "Sid": "AppRunner",
      "Effect": "Allow",
      "Action": [
        "apprunner:ListServices",
        "apprunner:DescribeService",
        "apprunner:StartDeployment",
        "apprunner:ListOperations"
      ],
      "Resource": "*"
    }
  ]
}
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID (e.g. `205562145226`).
`GetAuthorizationToken` must be `Resource: "*"`. The App Runner block uses `Resource: "*"` because `ListServices` does not support resource-level permissions. If you get **AccessDeniedException** on other App Runner actions, ensure the statement includes all required actions (e.g. `UpdateService`, `PauseService`, `ResumeService` if you use them).

**Option B — managed policies**

Attach:

- **AmazonEC2ContainerRegistryPowerUser** (or **AmazonEC2ContainerRegistryFullAccess**)
- **AWSAppRunnerFullAccess** (or a custom policy with the three App Runner actions above)

---

## 2. One-time: get an image into ECR

App Runner needs at least one image in ECR before you can create the service.

**Option A — push from your machine**

```bash
# From repo root
aws ecr create-repository --repository-name myinvestments --region us-east-1
# Replace 205562145226 with your AWS account ID (see IAM console or: aws sts get-caller-identity --query Account --output text)
export AWS_ACCOUNT_ID=205562145226
export AWS_REGION=us-east-1
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker build -t myinvestments:latest --build-arg MONGODB_URI=placeholder --build-arg MONGODB_DB=myinvestments .
docker tag myinvestments:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/myinvestments:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/myinvestments:latest
```

Use your own account ID if different (run `aws sts get-caller-identity --query Account --output text`).

**Option B — let CI push (without deploying)**

1. In GitHub: set **Secrets** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Do **not** set `ENABLE_AWS_DEPLOY` or `APP_RUNNER_SERVICE_ARN` yet.
2. Temporarily add a workflow that only builds and pushes to ECR (no App Runner step), run it once, then remove it — **or** use Option A.

After this, the repo `myinvestments` in ECR must have the `latest` (or a specific) tag.

---

## 3. Create the App Runner service (one-time)

**Console**

1. **App Runner** → **Create service**.
2. **Source:** Container registry → **Amazon ECR**.
3. **Connect to ECR:** use the same account/region. Pick repository **myinvestments**, image tag **latest**.
4. **Deployment trigger:** “Manual” (CI will run `start-deployment`).
5. **Service name:** e.g. `myinvestments-prod`.
6. **Port:** `3000`.
7. **Health check:** Set **path** to `/api/health/live` (returns 200 immediately; use `/api/health` only if you want full DB/scheduler checks and can afford a longer timeout).
8. **CPU:** 1 vCPU. **Memory:** 2 GB (or more if needed).
9. **Environment variables:** Add the same vars as in `.env.prod`:
   `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`, `NEXTAUTH_URL`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `XAI_API_KEY`, `WEB_SEARCH_API_KEY`, `CRON_SECRET`, `SLACK_WEBHOOK_URL`.
   (Or reference Secrets Manager if you used `scripts/aws-secrets-from-env.sh`.)
10. **Create service.** Wait until status is **Running**.
11. Copy **Service ARN** and **Service URL** (e.g. `https://xxxxx.us-east-1.awsapprunner.com`).

**If the app logs show "Ready" but the deployment still fails:** Use the liveness path so the check doesn’t wait on MongoDB. Try **TCP health check** so App Runner only checks port 3000 is open: run `aws apprunner update-service --service-arn YOUR_ARN --region us-east-1 --health-check-configuration "Protocol=TCP,Interval=10,Timeout=5,HealthyThreshold=1,UnhealthyThreshold=5"`, then start a new deployment. Once Running, you can switch back to HTTP path `/api/health/live` in Configure → Health check if desired.

**CLI (alternative) — one command with all env vars from `.env.prod`**

1. **Create an IAM role** for App Runner to pull from ECR (one-time). In IAM → Roles → Create role → AWS service → App Runner → Next → Attach **AWSAppRunnerServicePolicyForECRAccess** (or a custom policy that allows `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:BatchCheckLayerAvailability` on your ECR repo) → Create role. Note the role ARN.
2. From repo root:
   ```bash
   export APP_RUNNER_ECR_ACCESS_ROLE=arn:aws:iam::YOUR_ACCOUNT_ID:role/YourAppRunnerECRRole
   ./scripts/create-apprunner-service.sh
   ```
   The script reads `.env.prod` and writes `apprunner-create-input.json` with all vars as `RuntimeEnvironmentVariables`, then prints the `aws apprunner create-service` command.
3. Run the printed command (e.g. `aws apprunner create-service --cli-input-json file:///path/to/apprunner-create-input.json --region us-east-1`).
4. Set GitHub variable **APP_RUNNER_SERVICE_ARN** to the new service ARN from the output.

The generated JSON is in `.gitignore` (it contains secrets). You can re-run the script anytime to regenerate it after changing `.env.prod`.

**Push config (env vars) to App Runner from the command line:**

1. **Get your service ARN** (if you don’t have it):
   ```bash
   aws apprunner list-services --region us-east-1 --query 'ServiceSummaryList[*].ServiceArn' --output text
   ```
   Or use the ARN from the App Runner console (e.g. `arn:aws:apprunner:us-east-1:205562145226:service/myinvestments-prod/xxxx`).

2. **From repo root**, push `.env.prod` to App Runner (SKIP_AUTH is never pushed; prod always uses real auth):
   ```bash
   export APP_RUNNER_SERVICE_ARN=arn:aws:apprunner:us-east-1:205562145226:service/YOUR_SERVICE_NAME/YOUR_ID
   ./scripts/update-apprunner-env.sh .env.prod us-east-1
   ```

3. **Wait for the deployment** to complete. In the Console, the service status will go to "Operation in progress" then back to "Running". If the deployment fails (e.g. health check), App Runner rolls back and the previous config (including any SKIP_AUTH from the Console) returns. Fix the cause (health path, image) and run the script again.

**Update env vars from CLI (e.g. after rotating X keys):** Edit `.env.prod`, then run the same two steps above.

---

## 4. GitHub Actions setup

**Secrets** (Settings → Secrets and variables → Actions → Secrets):

- `AWS_ACCESS_KEY_ID` — access key of the IAM user above.
- `AWS_SECRET_ACCESS_KEY` — secret key.
- (Optional) `SLACK_WEBHOOK_URL` — for deploy notifications.

**Variables** (Settings → Secrets and variables → Actions → Variables):

- `ENABLE_AWS_DEPLOY` = `true`.
- `APP_RUNNER_SERVICE_ARN` = the **Service ARN** from step 3 (e.g. `arn:aws:apprunner:us-east-1:205562145226:service/myinvestments-prod/xxxx`).
- (Optional) `APP_URL` = the **Service URL** from step 3 (e.g. `https://xxxxx.us-east-1.awsapprunner.com`). If unset, CI gets it from `describe-service`.
- (Optional) `AWS_REGION` (e.g. `us-east-1`; default in workflow is `us-east-1`).

**If you see "Invalid Access Role in AuthenticationConfiguration" or "Failed to copy the image from ECR":** App Runner uses an IAM role to pull from ECR. That role must exist, have the correct **trust policy** (allow `apprunner.amazonaws.com` to assume it), and have ECR pull permissions. See [Fix ECR access role](#fix-ecr-access-role) below.

**If you see `exec format error` in App Runner logs:** App Runner only runs **linux/amd64**. That error means the image in ECR was built for another arch (e.g. arm64 on a Mac).

- **Fix 1 (recommended):** Push to **main** so CI runs. The workflow builds with `platforms: linux/amd64` and the Dockerfile uses `FROM --platform=linux/amd64`; it pushes to ECR and starts an App Runner deployment. After that run, the service will pull the new amd64 image.
- **Fix 2:** If you already pushed from this repo and still see the error, the **current** image in ECR may be an old arm64 one. In ECR → `myinvestments` → delete the `latest` (and any other) tag(s) for the bad image, then push to main again so CI builds and pushes a fresh amd64 image and deploys.
- **Local build/push:** Always use `docker build --platform linux/amd64 ...` and push that image to ECR.

---

## 5. After that

- Push to **main**: CI builds the image, pushes to ECR, runs **App Runner** `start-deployment`, waits for the operation, then health-checks and (optionally) Slack.
- Set **NEXTAUTH_URL** in the App Runner service (and in X callback) to the App Runner **Service URL** (e.g. `https://xxxxx.us-east-1.awsapprunner.com`).

### Auth: avoid `[auth][warn][env-url-basepath-mismatch]`

Auth.js compares `AUTH_URL` / `NEXTAUTH_URL` with `basePath` (`/api/auth`). To avoid the warning:

- Set **NEXTAUTH_URL** (and optionally **AUTH_URL**) to the **app root only**: `https://<your-app-runner-domain>` — no path, or path `/`.
  Example: `https://fzece27dg2.us-east-1.awsapprunner.com`
- Or set it to the full base path: `https://<domain>/api/auth`
- Do **not** set a different path (e.g. `https://domain/auth`) or the warning will appear.
  The app normalizes a wrong path to the origin at runtime, but it’s better to set the correct URL in App Runner env and in your X app callback URL.

---

## Fix ECR access role

When deployments fail with **Invalid Access Role in AuthenticationConfiguration** or **Failed to copy the image from ECR**, the IAM role that App Runner uses to pull from ECR is missing or misconfigured.

1. **See which role the service uses**
   ```bash
   aws apprunner describe-service --service-arn YOUR_SERVICE_ARN --region us-east-1 \
     --query 'Service.SourceConfiguration.AuthenticationConfiguration.AccessRoleArn' --output text
   ```
   Example: `arn:aws:iam::205562145226:role/AppRunnerECRAccess`

2. **Create or fix the role in IAM**
   - IAM → Roles → look for that role name (e.g. `AppRunnerECRAccess`). If it’s missing, create it; if it exists, open it to fix trust + permissions.
   - **Trust relationship:** Must allow App Runner to assume the role. Replace the role’s trust policy with:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Principal": { "Service": "build.apprunner.amazonaws.com" },
           "Action": "sts:AssumeRole"
         }
         ]
     }
     ```
     (App Runner’s ECR pull uses the **build** service principal.)
   - **Permissions:** Attach the managed policy **AWSAppRunnerServicePolicyForECRAccess**, or an inline policy that allows:
     - `ecr:GetDownloadUrlForLayer`
     - `ecr:BatchGetImage`
     - `ecr:BatchCheckLayerAvailability`
     on resource `arn:aws:ecr:us-east-1:YOUR_ACCOUNT_ID:repository/myinvestments` (and `*` for `GetAuthorizationToken` if you use a custom policy; ECR pull typically uses the repo ARN).

3. **Redeploy**
   After saving the role, start a new deployment (no service update needed if the role ARN is unchanged):
   ```bash
   aws apprunner start-deployment --service-arn YOUR_SERVICE_ARN --region us-east-1
   ```

---

## Quick checklist

| Step | What | Done? |
|------|------|--------|
| 1 | IAM: ECR + App Runner permissions on deploy user | ☐ |
| 2 | ECR repo `myinvestments` exists and has at least one image (e.g. `latest`) | ☐ |
| 3 | App Runner service created (ECR source, port 3000, env vars), status Running | ☐ |
| 4 | GitHub: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ENABLE_AWS_DEPLOY=true`, `APP_RUNNER_SERVICE_ARN` | ☐ |
| 5 | Push to main and confirm “Build & Deploy to App Runner” succeeds | ☐ |
