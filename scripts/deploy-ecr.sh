#!/bin/bash
# Build Docker image locally and push to ECR, then deploy to EB
# This avoids building on the small t3.micro instance

set -e

REGION="${AWS_REGION:-us-east-1}"
APP_NAME="myinvestments"
ENV_NAME="${1:-myinvestments-prod}"

echo "=========================================="
echo "ECR Build & Deploy"
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

# Step 5: Update Dockerrun.aws.json with ECR image
echo ""
echo "Step 5: Updating Dockerrun.aws.json..."
cat > Dockerrun.aws.json << EOF
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "$ECR_REPO:latest",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": 3000,
      "HostPort": 3000
    }
  ],
  "Logging": "/var/log/nodejs"
}
EOF

# Step 6: Deploy to EB
echo ""
echo "Step 6: Deploying to Elastic Beanstalk..."
eb deploy "$ENV_NAME" --timeout 10

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "ECR Image: $ECR_REPO:latest"
echo ""
eb status
