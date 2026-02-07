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
        "apprunner:StartDeployment",
        "apprunner:DescribeService",
        "apprunner:ListOperations"
      ],
      "Resource": "arn:aws:apprunner:*:YOUR_ACCOUNT_ID:service/*"
    }
  ]
}
```

Replace `YOUR_ACCOUNT_ID` with your AWS account ID (e.g. `205562145226`).
`GetAuthorizationToken` must be `Resource: "*"`.

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
7. **CPU:** 1 vCPU. **Memory:** 2 GB (or more if needed).
8. **Environment variables:** Add the same vars as in `.env.prod`:
   `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET`, `NEXTAUTH_URL`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `XAI_API_KEY`, `WEB_SEARCH_API_KEY`, `CRON_SECRET`, `SLACK_WEBHOOK_URL`.
   (Or reference Secrets Manager if you used `scripts/aws-secrets-from-env.sh`.)
9. **Create service.** Wait until status is **Running**.
10. Copy **Service ARN** and **Service URL** (e.g. `https://xxxxx.us-east-1.awsapprunner.com`).

**CLI (alternative)**

You can create the service with `aws apprunner create-service` (see [AWS docs](https://docs.aws.amazon.com/cli/latest/reference/apprunner/create-service.html)). You must pass the ECR image URI and the same settings (port 3000, env vars, etc.).

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

**If you see `exec format error` in App Runner logs:** the image was built for the wrong CPU (e.g. arm64 on a Mac). App Runner runs **linux/amd64**. CI builds with `--platform linux/amd64`. If you build and push from your laptop, use: `docker build --platform linux/amd64 ...`.

---

## 5. After that

- Push to **main**: CI builds the image, pushes to ECR, runs **App Runner** `start-deployment`, waits for the operation, then health-checks and (optionally) Slack.
- Set **NEXTAUTH_URL** in the App Runner service (and in X callback) to the App Runner **Service URL** (e.g. `https://xxxxx.us-east-1.awsapprunner.com`).

---

## Quick checklist

| Step | What | Done? |
|------|------|--------|
| 1 | IAM: ECR + App Runner permissions on deploy user | ☐ |
| 2 | ECR repo `myinvestments` exists and has at least one image (e.g. `latest`) | ☐ |
| 3 | App Runner service created (ECR source, port 3000, env vars), status Running | ☐ |
| 4 | GitHub: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ENABLE_AWS_DEPLOY=true`, `APP_RUNNER_SERVICE_ARN` | ☐ |
| 5 | Push to main and confirm “Build & Deploy to App Runner” succeeds | ☐ |
