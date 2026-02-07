#!/usr/bin/env bash
# Update App Runner service environment variables from an env file (e.g. .env.prod).
# Uses current service image and auth; only RuntimeEnvironmentVariables are replaced.
#
# Usage:
#   export APP_RUNNER_SERVICE_ARN=arn:aws:apprunner:us-east-1:ACCOUNT:service/name/id
#   ./scripts/update-apprunner-env.sh [env-file] [region]
#
# Or:
#   ./scripts/update-apprunner-env.sh .env.prod us-east-1
#
# After update, a new deployment is started automatically. Wait for it to complete.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$REPO_ROOT/.env.prod}"
AWS_REGION="${2:-us-east-1}"

if [[ -z "$APP_RUNNER_SERVICE_ARN" ]]; then
  echo "Error: APP_RUNNER_SERVICE_ARN is not set."
  echo "  export APP_RUNNER_SERVICE_ARN=arn:aws:apprunner:us-east-1:ACCOUNT:service/name/id"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  exit 1
fi

# Build RuntimeEnvironmentVariables JSON from env file (same logic as create-apprunner-service.sh)
ENV_JSON="{}"
while IFS= read -r line; do
  line="${line%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  key="${key%"${key##*[![:space:]]}"}"
  [[ -z "$key" ]] && continue
  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]] && { [[ "$value" =~ ^\'.*\'$ ]] || [[ "$value" =~ ^\".*\"$ ]]; }; then
    value="${value:1:${#value}-2}"
  fi
  ENV_JSON=$(jq -n --argjson prev "$ENV_JSON" --arg k "$key" --arg v "$value" '$prev + {($k): $v}')
done < "$ENV_FILE"

# Get current service source config (ImageIdentifier, AccessRoleArn, etc.)
DESC=$(aws apprunner describe-service --service-arn "$APP_RUNNER_SERVICE_ARN" --region "$AWS_REGION" --output json)
IMAGE_ID=$(jq -r '.Service.SourceConfiguration.ImageRepository.ImageIdentifier' <<< "$DESC")
ACCESS_ROLE=$(jq -r '.Service.SourceConfiguration.AuthenticationConfiguration.AccessRoleArn' <<< "$DESC")

# Build source-configuration JSON with new env vars
SOURCE_CONFIG=$(jq -n \
  --arg image "$IMAGE_ID" \
  --arg role "$ACCESS_ROLE" \
  --argjson env "$ENV_JSON" \
  '{
    AuthenticationConfiguration: {
      AccessRoleArn: $role
    },
    ImageRepository: {
      ImageIdentifier: $image,
      ImageRepositoryType: "ECR",
      ImageConfiguration: {
        Port: "3000",
        RuntimeEnvironmentVariables: $env
      }
    },
    AutoDeploymentsEnabled: false
  }')

echo "Updating service with env vars from $ENV_FILE ..."
aws apprunner update-service \
  --service-arn "$APP_RUNNER_SERVICE_ARN" \
  --region "$AWS_REGION" \
  --source-configuration "$SOURCE_CONFIG" \
  --output json > /dev/null

echo "Update accepted. Starting deployment ..."
OP_ID=$(aws apprunner start-deployment --service-arn "$APP_RUNNER_SERVICE_ARN" --region "$AWS_REGION" --query 'OperationId' --output text)
echo "OperationId: $OP_ID"
echo "Check status: aws apprunner list-operations --service-arn $APP_RUNNER_SERVICE_ARN --region $AWS_REGION"
echo "Or wait in Console until the deployment completes."
