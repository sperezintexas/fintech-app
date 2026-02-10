#!/bin/bash
# Build Docker image locally and push to ECR (for AWS App Runner to pull)

set -e

REGION="${AWS_REGION:-us-east-1}"
APP_NAME="myinvestments"

echo "=========================================="
echo "ECR Build & Push"
echo "=========================================="

# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$APP_NAME"

echo "Account: $ACCOUNT_ID"
echo "ECR Repo: $ECR_REPO"
echo ""

# Step 1: Create ECR repository if it doesn't exist
echo "Step 1: Ensuring ECR repository exists..."
aws ecr describe-repositories --repository-names "$APP_NAME" --region "$REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name "$APP_NAME" --region "$REGION"

# Step 2: Login to ECR
echo ""
echo "Step 2: Logging into ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Step 3: Build Docker image locally
echo ""
echo "Step 3: Building Docker image locally..."
docker build \
  --build-arg MONGODB_URI=placeholder \
  --build-arg MONGODB_DB=myinvestments \
  -t "$APP_NAME:latest" \
  -t "$ECR_REPO:latest" \
  .

# Step 4: Push to ECR
echo ""
echo "Step 4: Pushing to ECR..."
docker push "$ECR_REPO:latest"

echo ""
echo "=========================================="
echo "ECR push complete"
echo "=========================================="
echo ""
echo "Image: $ECR_REPO:latest"
echo "App Runner will pull this image on next deployment (CI or aws apprunner start-deployment)."
