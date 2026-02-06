#!/bin/bash
# AWS Setup Helper Script for myInvestments
# Run this after creating IAM user and configuring AWS CLI

set -e

echo "=========================================="
echo "myInvestments AWS Setup Helper"
echo "=========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Install it first:"
    echo "   macOS: brew install awscli"
    echo "   Linux: pip install awscli"
    exit 1
fi
echo "✓ AWS CLI installed"

if ! command -v eb &> /dev/null; then
    echo "❌ EB CLI not found. Install it:"
    echo "   pip install awsebcli"
    exit 1
fi
echo "✓ EB CLI installed"

# Check AWS credentials
echo ""
echo "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured."
    echo "   Run: aws configure"
    echo "   Enter your Access Key ID and Secret Access Key"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
USER_ARN=$(aws sts get-caller-identity --query Arn --output text)
echo "✓ Authenticated as: $USER_ARN"
echo "  Account ID: $ACCOUNT_ID"

# Configuration
echo ""
echo "=========================================="
echo "Configuration"
echo "=========================================="

read -p "Region [us-east-1]: " REGION
REGION=${REGION:-us-east-1}

read -p "Environment name [myinvestments-prod]: " ENV_NAME
ENV_NAME=${ENV_NAME:-myinvestments-prod}

read -p "Instance type [t3.micro]: " INSTANCE_TYPE
INSTANCE_TYPE=${INSTANCE_TYPE:-t3.micro}

APP_NAME="myinvestments"

echo ""
echo "Configuration:"
echo "  App Name: $APP_NAME"
echo "  Environment: $ENV_NAME"
echo "  Region: $REGION"
echo "  Instance: $INSTANCE_TYPE"
echo ""

read -p "Continue with deployment? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 0
fi

# Initialize EB
echo ""
echo "=========================================="
echo "Initializing Elastic Beanstalk..."
echo "=========================================="

if [ ! -d ".elasticbeanstalk" ]; then
    eb init "$APP_NAME" --region "$REGION" --platform "Docker running on 64bit Amazon Linux 2023"
else
    echo "EB already initialized, skipping..."
fi

# Check if environment exists
echo ""
echo "Checking if environment exists..."
ENV_STATUS=$(aws elasticbeanstalk describe-environments \
    --application-name "$APP_NAME" \
    --environment-names "$ENV_NAME" \
    --region "$REGION" \
    --query 'Environments[0].Status' \
    --output text 2>/dev/null || echo "None")

if [ "$ENV_STATUS" == "None" ]; then
    echo ""
    echo "=========================================="
    echo "Creating new environment: $ENV_NAME"
    echo "This takes 5-10 minutes..."
    echo "=========================================="
    eb create "$ENV_NAME" --single --instance-type "$INSTANCE_TYPE" --region "$REGION" --timeout 20
else
    echo "Environment exists (Status: $ENV_STATUS)"
    echo ""
    read -p "Deploy to existing environment? (y/n): " DEPLOY_CONFIRM
    if [ "$DEPLOY_CONFIRM" == "y" ]; then
        eb deploy "$ENV_NAME" --timeout 20
    fi
fi

# Get URL
echo ""
echo "=========================================="
echo "Getting environment URL..."
echo "=========================================="

ENV_URL=$(aws elasticbeanstalk describe-environments \
    --application-name "$APP_NAME" \
    --environment-names "$ENV_NAME" \
    --region "$REGION" \
    --query 'Environments[0].CNAME' \
    --output text)

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "Your app URL: http://$ENV_URL"
echo ""
echo "=========================================="
echo "NEXT STEP: Set Environment Variables"
echo "=========================================="
echo ""
echo "Run this command with YOUR values from Vercel:"
echo ""
echo "eb setenv \\"
echo "  MONGODB_URI='YOUR_MONGODB_URI' \\"
echo "  MONGODB_DB='myinvestments' \\"
echo "  AUTH_SECRET='YOUR_AUTH_SECRET' \\"
echo "  NEXTAUTH_URL='http://$ENV_URL' \\"
echo "  X_CLIENT_ID='YOUR_X_CLIENT_ID' \\"
echo "  X_CLIENT_SECRET='YOUR_X_CLIENT_SECRET' \\"
echo "  XAI_API_KEY='YOUR_XAI_KEY' \\"
echo "  WEB_SEARCH_API_KEY='YOUR_SERPAPI_KEY' \\"
echo "  CRON_SECRET='YOUR_CRON_SECRET' \\"
echo "  SLACK_WEBHOOK_URL='YOUR_SLACK_WEBHOOK'"
echo ""
echo "=========================================="
echo "IMPORTANT: Update X OAuth Callback"
echo "=========================================="
echo ""
echo "In X Developer Portal, add this callback URL:"
echo "  http://$ENV_URL/api/auth/callback/twitter"
echo ""
echo "=========================================="
