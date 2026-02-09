# AWS Elastic Beanstalk Deployment

Deploy myInvestments to AWS Elastic Beanstalk for a cost-effective, scalable solution with native support for long-running cron jobs via Agenda.

## Why Elastic Beanstalk?

- **Cost-effective**: t3.micro instance (~$8/month) vs Vercel Pro ($20/month)
- **Native cron support**: Agenda scheduler runs continuously (no workarounds needed)
- **Simple deployment**: Git-based or CLI deployment
- **Auto-scaling ready**: Scale up when needed
- **Full control**: SSH access, custom configs, CloudWatch logs

## Cost Breakdown (Cheapest Tier)

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.micro (750 hrs free tier, then ~$8) | $0-8 |
| Application Load Balancer | ~$16 |
| CloudWatch Logs (7 days retention) | ~$0.50 |
| **Total** | **~$17-25/month** |

**Cost Optimization Tips**:
- Use `--single` instance mode (no load balancer) for dev: ~$8/month
- Use Spot instances for 60-90% savings
- Consider t3.nano ($3/month) if memory permits

## Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured:
   ```bash
   pip install awscli
   aws configure
   ```
3. **EB CLI** installed:
   ```bash
   pip install awsebcli
   ```
4. **MongoDB Atlas** database (or self-hosted on EC2)

## Quick Start

### Option 1: Automated Deploy Script

```bash
# Deploy to production
./scripts/eb-deploy.sh myinvestments-prod

# Deploy to staging
./scripts/eb-deploy.sh myinvestments-staging
```

### Option 2: Manual Deployment

```bash
# 1. Initialize EB project
eb init myinvestments --region us-east-1 --platform "Docker running on 64bit Amazon Linux 2023"

# 2. Create environment (single instance, cheapest)
eb create myinvestments-prod --single --instance-type t3.micro

# 3. Set environment variables (use your real values from Vercel or .env; do not commit)
eb setenv \
  MONGODB_URI='<your-mongodb-uri>' \
  MONGODB_DB='myinvestments' \
  AUTH_SECRET='<your-auth-secret>' \
  XAI_API_KEY='<your-xai-api-key>' \
  NEXTAUTH_URL='http://myinvestments-prod.us-east-1.elasticbeanstalk.com' \
  X_CLIENT_ID='<your-x-client-id>' \
  X_CLIENT_SECRET='<your-x-client-secret>' \
  WEB_SEARCH_API_KEY='<your-web-search-api-key>' \
  CRON_SECRET='<your-cron-secret>'

# 4. Deploy
eb deploy
```

## Environment Variables

Set these via `eb setenv` or in the AWS Console (Elastic Beanstalk > Environment > Configuration > Software):

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `MONGODB_DB` | Yes | Database name (default: myinvestments) |
| `AUTH_SECRET` | Yes | NextAuth secret (generate: `npx auth secret`) |
| `NEXTAUTH_URL` | Yes | Your EB URL (http://env.region.elasticbeanstalk.com) |
| `X_CLIENT_ID` | Yes | X OAuth client ID |
| `X_CLIENT_SECRET` | Yes | X OAuth client secret |
| `XAI_API_KEY` | No | xAI Grok API key for Smart Chat |
| `WEB_SEARCH_API_KEY` | No | SerpAPI key for web search |
| `CRON_SECRET` | No | Secret for external cron calls |
| `SLACK_WEBHOOK_URL` | No | Slack webhook for alerts |

## Cron Jobs & Scheduled Tasks

Unlike Vercel, Elastic Beanstalk runs continuously, so **Agenda scheduler works natively**:

### How It Works

1. App starts → Agenda initializes with MongoDB
2. Agenda connects to `scheduledJobs` collection
3. Jobs run on schedule automatically

### Default Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Unified Options Scanner | Every hour (market hours) | Scan for options opportunities |
| Daily Analysis | 4:30 PM ET | End-of-day portfolio analysis |
| Risk Scanner | 5:00 PM ET | Scan for risk alerts |
| Alert Delivery | 4:30 PM ET | Deliver pending alerts |
| Data Cleanup | 3:00 AM | Purge old data to save storage |

### Initialize Jobs (First Deploy)

After deployment, call the scheduler setup endpoint:

```bash
# GET request initializes recommended jobs
curl https://your-eb-url.elasticbeanstalk.com/api/scheduler
```

Or visit the Automation page in the UI to configure jobs.

## Monitoring & Logs

### View Logs

```bash
# Recent logs
eb logs

# Stream logs in real-time
eb logs --stream

# Download all logs
eb logs --zip
```

### CloudWatch Logs

Logs are automatically streamed to CloudWatch:
- Log group: `/aws/elasticbeanstalk/[environment]/var/log/eb-docker/containers/eb-current-app`
- Retention: 7 days (configurable in `.ebextensions/01-environment.config`)

### Health Check

```bash
# Check environment health
eb health

# Or via API
curl https://your-eb-url.elasticbeanstalk.com/api/health
```

## HTTPS Setup

### Option 1: AWS Certificate Manager (Recommended)

1. Request certificate in ACM for your domain
2. In EB Console > Configuration > Load Balancer:
   - Add HTTPS listener on port 443
   - Select ACM certificate
   - Redirect HTTP to HTTPS

### Option 2: Let's Encrypt (Single Instance)

For single-instance mode without load balancer:

```bash
# SSH into instance
eb ssh

# Install certbot
sudo yum install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com
```

## Troubleshooting

### Build Fails

```bash
# Check recent events
eb events

# View deployment logs
eb logs --all
```

### Out of Memory

Upgrade instance type in `.ebextensions/01-environment.config`:
```yaml
aws:autoscaling:launchconfiguration:
  InstanceType: t3.small  # 2GB RAM
```

### Agenda Jobs Not Running

1. Check MongoDB connection: `curl /api/health`
2. Verify scheduler status: `curl /api/scheduler`
3. Check CloudWatch logs for errors

### Environment Variables Not Set

```bash
# List current env vars
eb printenv

# Set missing vars
eb setenv KEY=value
```

## Comparison: Vercel vs Elastic Beanstalk

| Feature | Vercel | Elastic Beanstalk |
|---------|--------|-------------------|
| Monthly cost | $20 (Pro) | ~$17-25 |
| Cron jobs | Limited (workarounds needed) | Native Agenda support |
| Cold starts | Yes | No (always running) |
| Auto-scaling | Yes | Yes (configurable) |
| Custom domains | Yes | Yes (Route53/ACM) |
| SSH access | No | Yes |
| Docker support | Limited | Full |
| Setup complexity | Simple | Moderate |

## Useful Commands

```bash
# View environment status
eb status

# Open in browser
eb open

# SSH into instance
eb ssh

# Scale instances
eb scale 2

# Terminate environment
eb terminate myinvestments-prod

# Update config
eb config
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Elastic Beanstalk                  │
│  ┌───────────────────────────────────────────────┐  │
│  │              Application Load Balancer         │  │
│  │                    (Port 80/443)               │  │
│  └───────────────────────────────────────────────┘  │
│                         │                           │
│  ┌───────────────────────────────────────────────┐  │
│  │              EC2 Instance (t3.micro)          │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │           Docker Container              │  │  │
│  │  │  ┌───────────────────────────────────┐  │  │  │
│  │  │  │      Next.js App (Port 3000)      │  │  │  │
│  │  │  │  ┌─────────────────────────────┐  │  │  │  │
│  │  │  │  │    Agenda Scheduler         │  │  │  │  │
│  │  │  │  │    (Cron Jobs)              │  │  │  │  │
│  │  │  │  └─────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  MongoDB Atlas                       │
│              (or self-hosted on EC2)                 │
└─────────────────────────────────────────────────────┘
```
