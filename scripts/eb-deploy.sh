#!/bin/bash
# AWS Elastic Beanstalk Deployment Script
# Usage: ./scripts/eb-deploy.sh [environment-name]

set -e

ENV_NAME="${1:-myinvestments-prod}"
APP_NAME="myinvestments"
REGION="${AWS_REGION:-us-east-1}"

echo "=========================================="
echo "AWS Elastic Beanstalk Deployment"
echo "=========================================="
echo "App: $APP_NAME"
echo "Environment: $ENV_NAME"
echo "Region: $REGION"
echo ""

# Check for AWS CLI
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed. Install it first:"
    echo "  brew install awscli  # macOS"
    echo "  pip install awscli   # pip"
    exit 1
fi

# Check for EB CLI
if ! command -v eb &> /dev/null; then
    echo "Error: EB CLI is not installed. Install it first:"
    echo "  pip install awsebcli"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS credentials not configured. Run: aws configure"
    exit 1
fi

echo "Step 1: Checking if application exists..."
if ! aws elasticbeanstalk describe-applications --application-names "$APP_NAME" --region "$REGION" &> /dev/null; then
    echo "Creating application: $APP_NAME"
    aws elasticbeanstalk create-application \
        --application-name "$APP_NAME" \
        --description "Investment portfolio manager with options scanner" \
        --region "$REGION"
fi

echo ""
echo "Step 2: Initializing EB environment..."
if [ ! -d ".elasticbeanstalk" ]; then
    eb init "$APP_NAME" --region "$REGION" --platform "Docker running on 64bit Amazon Linux 2023"
fi

echo ""
echo "Step 3: Checking environment status..."
ENV_STATUS=$(aws elasticbeanstalk describe-environments \
    --application-name "$APP_NAME" \
    --environment-names "$ENV_NAME" \
    --region "$REGION" \
    --query 'Environments[0].Status' \
    --output text 2>/dev/null || echo "NotFound")

if [ "$ENV_STATUS" == "None" ] || [ "$ENV_STATUS" == "NotFound" ]; then
    echo "Creating new environment: $ENV_NAME"
    eb create "$ENV_NAME" \
        --single \
        --instance-type t3.micro \
        --region "$REGION" \
        --timeout 20
else
    echo "Environment exists (Status: $ENV_STATUS)"
    echo "Deploying to existing environment..."
    eb deploy "$ENV_NAME" --timeout 20
fi

echo ""
echo "Step 4: Setting environment variables..."
echo "IMPORTANT: Set these in the EB console or run:"
echo ""
echo "  eb setenv \\"
echo "    MONGODB_URI='your-mongodb-uri' \\"
echo "    MONGODB_DB='myinvestments' \\"
echo "    AUTH_SECRET='your-auth-secret' \\"
echo "    XAI_API_KEY='your-xai-api-key' \\"
echo "    NEXTAUTH_URL='https://your-eb-url.elasticbeanstalk.com' \\"
echo "    X_CLIENT_ID='your-x-client-id' \\"
echo "    X_CLIENT_SECRET='your-x-client-secret'"
echo ""

echo "Step 5: Getting environment URL..."
ENV_URL=$(aws elasticbeanstalk describe-environments \
    --application-name "$APP_NAME" \
    --environment-names "$ENV_NAME" \
    --region "$REGION" \
    --query 'Environments[0].CNAME' \
    --output text)

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "URL: http://$ENV_URL"
echo "Health: http://$ENV_URL/api/health"
echo ""
echo "Next steps:"
echo "1. Set environment variables (see above)"
echo "2. Configure HTTPS via ACM/Route53 (optional)"
echo "3. Check logs: eb logs"
echo "=========================================="
