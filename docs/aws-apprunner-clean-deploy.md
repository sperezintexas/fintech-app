# App Runner: clean deploy from zero

Follow in order. Replace `205562145226` with your AWS account ID (`aws sts get-caller-identity --query Account --output text`) and `us-east-1` with your region if different.

---

## Step 1 — Deploy user IAM (CLI)

Uses an IAM user that can call `iam:PutUserPolicy` (e.g. root or admin). From repo root:

```bash
cd /Users/samperez/workspace/fintech-app
# Default: user myinvestments-deploy, account from AWS CLI
./scripts/iam-deploy-user-apprunner.sh

# Or specify user and account:
# ./scripts/iam-deploy-user-apprunner.sh myinvestments-deploy 205562145226
```

The script attaches an inline policy (ECR + App Runner) to the user. If the user doesn’t exist yet, create it first: `aws iam create-user --user-name myinvestments-deploy`, then create access keys and run the script.

---

## Step 2 — ECR access role (CLI)

Uses credentials that can call `iam:CreateRole`, `iam:AttachRolePolicy`. From repo root:

```bash
cd /Users/samperez/workspace/fintech-app
# Creates role AppRunnerECRAccess with trust build.apprunner.amazonaws.com + AWSAppRunnerServicePolicyForECRAccess
./scripts/iam-apprunner-ecr-role.sh

# Or custom role name:
# ./scripts/iam-apprunner-ecr-role.sh MyAppRunnerECRRole
```

Script prints the role ARN. Use it in Step 4: `export APP_RUNNER_ECR_ACCESS_ROLE=arn:aws:iam::ACCOUNT:role/AppRunnerECRAccess`.

---

## Step 3 — ECR repo and first image

From repo root, with AWS CLI using the deploy user:

```bash
cd /Users/samperez/workspace/fintech-app
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=205562145226   # or: aws sts get-caller-identity --query Account --output text

# Create repo if it doesn’t exist
aws ecr create-repository --repository-name myinvestments --region $AWS_REGION 2>/dev/null || true

# Login and build for linux/amd64 (required by App Runner)
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker build --platform linux/amd64 -t myinvestments:latest .
docker tag myinvestments:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/myinvestments:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/myinvestments:latest
```

---

## Step 4 — Create App Runner service from .env.prod

1. In **.env.prod**: set `NEXTAUTH_URL` to a placeholder (e.g. `https://placeholder.awsapprunner.com`). After the service is created you’ll set it to the real Service URL.

2. From repo root:

```bash
cd /Users/samperez/workspace/fintech-app
export APP_RUNNER_ECR_ACCESS_ROLE=arn:aws:iam::205562145226:role/AppRunnerECRAccess
./scripts/create-apprunner-service.sh .env.prod us-east-1
```

3. Run the printed command:

```bash
aws apprunner create-service --cli-input-json file:///Users/samperez/workspace/fintech-app/apprunner-create-input.json --region us-east-1
```

4. Wait until the service is **Running** (App Runner console, or poll with `aws apprunner describe-service --service-arn <ARN> --region us-east-1 --query 'Service.Status' --output text`).

5. Get **Service ARN** and **Service URL** from the create output or:

```bash
aws apprunner list-services --region us-east-1 --query 'ServiceSummaryList[*].[ServiceArn,ServiceUrl]' --output table
```

6. Update **.env.prod**: set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to the **Service URL** (e.g. `https://xxxxx.us-east-1.awsapprunner.com`). Then push the new config to the service:

```bash
export APP_RUNNER_SERVICE_ARN=arn:aws:apprunner:us-east-1:205562145226:service/myinvestments-apprunner/<SERVICE_ID>
./scripts/update-apprunner-env.sh .env.prod us-east-1
```

Wait for the deployment to complete (service stays RUNNING). If `start-deployment` fails with “service isn’t in RUNNING state”, wait until status is RUNNING and run only:

```bash
aws apprunner start-deployment --service-arn $APP_RUNNER_SERVICE_ARN --region us-east-1
```

---

## Step 5 — (Optional) GitHub CI

- **Secrets:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- **Variables:** `ENABLE_AWS_DEPLOY=true`, `APP_RUNNER_SERVICE_ARN=<your service ARN>`

Push to `main` to build, push to ECR, and trigger App Runner deployment.

---

## If deployment fails (health check)

- **TCP health check:** If the app is slow to start or `/api/health/live` fails, switch to TCP so App Runner only checks port 3000:

```bash
aws apprunner update-service --service-arn $APP_RUNNER_SERVICE_ARN --region us-east-1 \
  --health-check-configuration '{"Protocol":"TCP","Interval":10,"Timeout":5,"HealthyThreshold":1,"UnhealthyThreshold":5}'
aws apprunner start-deployment --service-arn $APP_RUNNER_SERVICE_ARN --region us-east-1
```

- Check **Application logs** in the App Runner console for startup errors (e.g. missing env, DB connection).

---

## Quick checklist

| # | Step |
|---|------|
| 1 | Deploy user: ECR + App Runner inline policy |
| 2 | Role **AppRunnerECRAccess**: trust `build.apprunner.amazonaws.com` + **AWSAppRunnerServicePolicyForECRAccess** |
| 3 | ECR repo `myinvestments` + push **linux/amd64** image as `latest` |
| 4 | Run `create-apprunner-service.sh` → `aws apprunner create-service` → wait RUNNING → set NEXTAUTH_URL → `update-apprunner-env.sh` |
| 5 | (Optional) GitHub: secrets + APP_RUNNER_SERVICE_ARN, ENABLE_AWS_DEPLOY |
