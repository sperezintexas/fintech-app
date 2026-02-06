# AWS Setup Guide for myInvestments

Complete guide to set up AWS IAM user and deploy myInvestments to Elastic Beanstalk.

## Step 1: Create AWS Account (if needed)

If you don't have an AWS account:
1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow signup (requires credit card, but free tier available)

## Step 2: Create IAM User for Deployment

### Option A: Via AWS Console (Recommended)

1. **Sign in** to AWS Console: https://console.aws.amazon.com/

2. **Go to IAM**: Search "IAM" in the top search bar

3. **Create User**:
   - Click "Users" → "Create user"
   - User name: `myinvestments-deploy`
   - Click "Next"

4. **Attach Permissions**:
   - Select "Attach policies directly"
   - Search and check these policies:
     - `AWSElasticBeanstalkFullAccess`
     - `AmazonEC2FullAccess`
     - `AmazonS3FullAccess`
     - `CloudWatchLogsFullAccess`
   - Click "Next" → "Create user"

5. **Create Access Keys**:
   - Click on the new user `myinvestments-deploy`
   - Go to "Security credentials" tab
   - Click "Create access key"
   - Select "Command Line Interface (CLI)"
   - Check "I understand..." → "Next" → "Create access key"
   - **SAVE BOTH KEYS** (you won't see the secret again!):
     - Access key ID: (copy from console)
     - Secret access key: (copy from console)

### Option B: Via AWS CLI (if you have admin access)

```bash
# Create user
aws iam create-user --user-name myinvestments-deploy

# Attach policies
aws iam attach-user-policy --user-name myinvestments-deploy \
  --policy-arn arn:aws:iam::aws:policy/AWSElasticBeanstalkFullAccess
aws iam attach-user-policy --user-name myinvestments-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess
aws iam attach-user-policy --user-name myinvestments-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
aws iam attach-user-policy --user-name myinvestments-deploy \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess

# Create access keys
aws iam create-access-key --user-name myinvestments-deploy
```

## Step 3: Install AWS & EB CLI

### macOS
```bash
# AWS CLI
brew install awscli

# EB CLI
pip install awsebcli --upgrade
```

### Linux/WSL
```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# EB CLI
pip install awsebcli --upgrade
```

### Windows
```powershell
# AWS CLI - download installer from:
# https://awscli.amazonaws.com/AWSCLIV2.msi

# EB CLI
pip install awsebcli --upgrade
```

## Step 4: Configure AWS Credentials

```bash
aws configure
```

Enter when prompted:
- **AWS Access Key ID:** (from Step 2)
- **AWS Secret Access Key:** (from Step 2)
- **Default region name:** `us-east-1`
- **Default output format:** `json`

Verify it works:
```bash
aws sts get-caller-identity
```

Should show your account ID and user.

## Step 5: Deploy to Elastic Beanstalk

### First-Time Setup

```bash
# Navigate to project
cd /path/to/myinvestments

# Initialize EB (choose Docker platform)
eb init myinvestments --region us-east-1 --platform "Docker running on 64bit Amazon Linux 2023"

# Create environment (single instance = cheapest, ~$8/month)
eb create myinvestments-prod --single --instance-type t3.micro
```

This takes 5-10 minutes. You'll see progress in the terminal.

### Set Environment Variables

**IMPORTANT**: Use your SAME values from Vercel (Settings → Environment Variables). Do not commit real values.

```bash
eb setenv \
  MONGODB_URI='<your-mongodb-uri>' \
  MONGODB_DB='myinvestments' \
  AUTH_SECRET='<your-auth-secret>' \
  NEXTAUTH_URL='http://myinvestments-prod.us-east-1.elasticbeanstalk.com' \
  X_CLIENT_ID='<your-x-client-id>' \
  X_CLIENT_SECRET='<your-x-client-secret>' \
  XAI_API_KEY='<your-xai-api-key>' \
  WEB_SEARCH_API_KEY='<your-web-search-api-key>' \
  CRON_SECRET='<your-cron-secret>' \
  SLACK_WEBHOOK_URL='<your-slack-webhook-url>'
```

**To get your current Vercel env vars:**
1. Go to Vercel Dashboard → your project → Settings → Environment Variables
2. Copy each value

### Get Your App URL

```bash
eb status
```

Look for `CNAME: myinvestments-prod.us-east-1.elasticbeanstalk.com`

### Update X (Twitter) OAuth Callback

In X Developer Portal (https://developer.x.com/):
1. Go to your app → Settings → User authentication settings
2. Add callback URL: `http://myinvestments-prod.us-east-1.elasticbeanstalk.com/api/auth/callback/twitter`

## Step 6: Verify Deployment

```bash
# Open in browser
eb open

# Check health
curl http://YOUR-EB-URL.elasticbeanstalk.com/api/health

# View logs
eb logs
```

## Step 7: Initialize Scheduled Jobs

Visit: `http://YOUR-EB-URL.elasticbeanstalk.com/automation`

Or call the API to set up recommended jobs:
```bash
curl -X POST http://YOUR-EB-URL.elasticbeanstalk.com/api/scheduler \
  -H "Content-Type: application/json" \
  -d '{"action": "setup"}'
```

## Step 8: (Optional) Set Up Custom Domain & HTTPS

### Add Custom Domain via Route53

1. Go to Route53 in AWS Console
2. Create hosted zone for your domain
3. Add CNAME record pointing to your EB URL

### Add HTTPS via ACM

1. Go to AWS Certificate Manager
2. Request public certificate for your domain
3. Validate via DNS (add CNAME to Route53)
4. In EB Console → Configuration → Load Balancer:
   - Add HTTPS listener (port 443)
   - Select ACM certificate

## Step 9: Disable Vercel (After Testing)

Once AWS is working:

1. **Test thoroughly** - verify all features work
2. **Update DNS** - point your domain to AWS instead of Vercel
3. **Disable Vercel deployments**:
   - Go to Vercel Dashboard → Project → Settings → General
   - Scroll to "Delete Project" or just disconnect Git

## Useful Commands

```bash
# Deploy updates
eb deploy

# View environment status
eb status

# SSH into instance
eb ssh

# View real-time logs
eb logs --stream

# Scale up (if needed)
eb scale 2

# Terminate (delete everything)
eb terminate myinvestments-prod
```

## Cost Summary

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.micro (single instance mode) | ~$8 |
| No load balancer in single mode | $0 |
| CloudWatch Logs | ~$0.50 |
| **Total** | **~$8.50/month** |

With load balancer (for HTTPS/custom domain): ~$25/month

## Troubleshooting

### "Access Denied" errors
- Check IAM policies are attached correctly
- Run `aws sts get-caller-identity` to verify credentials

### Build fails
```bash
eb logs --all
```
Check for Docker build errors or missing env vars.

### App starts but crashes
- Verify MONGODB_URI is correct
- Check CloudWatch logs in AWS Console

### Can't sign in with X
- Update callback URL in X Developer Portal
- Ensure NEXTAUTH_URL matches your EB URL exactly
