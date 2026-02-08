#!/usr/bin/env bash
# Create IAM role for App Runner to pull images from ECR (trust build.apprunner.amazonaws.com + ECR policy).
# Requires credentials that can call iam:CreateRole, iam:AttachRolePolicy (e.g. root or admin).
#
# Usage:
#   ./scripts/iam-apprunner-ecr-role.sh [role-name]
#   Default role name: AppRunnerECRAccess
#
# Example:
#   ./scripts/iam-apprunner-ecr-role.sh AppRunnerECRAccess

set -e

ROLE_NAME="${1:-AppRunnerECRAccess}"
TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "build.apprunner.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}'
MANAGED_POLICY_ARN="arn:aws:iam::aws:policy/AWSAppRunnerServicePolicyForECRAccess"

echo "Creating role '$ROLE_NAME' with trust policy for build.apprunner.amazonaws.com ..."
aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --description "Allows App Runner to pull images from ECR" \
  --output json > /dev/null
echo "Attaching managed policy AWSAppRunnerServicePolicyForECRAccess ..."
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "$MANAGED_POLICY_ARN"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Done. Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "Use: export APP_RUNNER_ECR_ACCESS_ROLE=arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
