#!/usr/bin/env bash
# Attach an inline policy to an IAM user for ECR + App Runner (deploy user).
# Requires credentials that can call iam:PutUserPolicy (e.g. root or admin).
#
# Usage:
#   ./scripts/iam-deploy-user-apprunner.sh [iam-username] [account-id]
#   Defaults: myinvestments-deploy, account from sts get-caller-identity
#
# Example:
#   ./scripts/iam-deploy-user-apprunner.sh myinvestments-deploy 205562145226

set -e

USER_NAME="${1:-myinvestments-deploy}"
AWS_ACCOUNT_ID="${2:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null)}"

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  echo "Error: Could not get AWS_ACCOUNT_ID. Pass it as second argument or configure AWS CLI."
  exit 1
fi

POLICY_NAME="AppRunnerECRDeploy"

POLICY_JSON=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECR",
      "Effect": "Allow",
      "Action": ["ecr:GetAuthorizationToken"],
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
      "Resource": "arn:aws:ecr:*:${AWS_ACCOUNT_ID}:repository/myinvestments"
    },
    {
      "Sid": "AppRunner",
      "Effect": "Allow",
      "Action": [
        "apprunner:ListServices",
        "apprunner:DescribeService",
        "apprunner:UpdateService",
        "apprunner:StartDeployment",
        "apprunner:ListOperations"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)

echo "Attaching inline policy '$POLICY_NAME' to user '$USER_NAME' (account $AWS_ACCOUNT_ID) ..."
aws iam put-user-policy \
  --user-name "$USER_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$POLICY_JSON"
echo "Done."
echo "User $USER_NAME can now push to ECR (myinvestments) and manage App Runner."
