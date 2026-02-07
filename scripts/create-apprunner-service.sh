#!/usr/bin/env bash
# Generate aws apprunner create-service input from .env.prod and run (or print) the command.
# All env vars from the file become RuntimeEnvironmentVariables (no manual typing in console).
#
# Prerequisites:
#   - App Runner ECR Access IAM role (create in Console when adding ECR source, or use existing).
#   - ECR repo "myinvestments" with at least one image (e.g. latest).
#
# Usage:
#   ./scripts/create-apprunner-service.sh [env-file] [region]
#   env-file: default .env.prod (relative to repo root)
#   region:   default us-east-1
#
# Optional env vars:
#   AWS_ACCOUNT_ID              default: from sts get-caller-identity
#   APP_RUNNER_ECR_ACCESS_ROLE  IAM role ARN for App Runner to pull ECR (required for create-service)
#   APP_RUNNER_SERVICE_NAME     default myinvestments-apprunner
#   ECR_IMAGE_TAG              default latest
#
# Example (after creating an ECR access role in IAM):
#   export APP_RUNNER_ECR_ACCESS_ROLE=arn:aws:iam::205562145226:role/AppRunnerECRAccessRole
#   ./scripts/create-apprunner-service.sh
#   # Then run the printed aws apprunner create-service command (or the script can run it if you add --execute).

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$REPO_ROOT/.env.prod}"
AWS_REGION="${2:-us-east-1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  exit 1
fi

# Optional overrides
SERVICE_NAME="${APP_RUNNER_SERVICE_NAME:-myinvestments-apprunner}"
ECR_TAG="${ECR_IMAGE_TAG:-latest}"

if [[ -z "$APP_RUNNER_ECR_ACCESS_ROLE" ]]; then
  echo "Error: APP_RUNNER_ECR_ACCESS_ROLE is not set. Create an IAM role that allows App Runner to pull from ECR, then:"
  echo "  export APP_RUNNER_ECR_ACCESS_ROLE=arn:aws:iam::ACCOUNT_ID:role/YourAppRunnerECRRole"
  echo "See: https://docs.aws.amazon.com/apprunner/latest/dg/security-iam.html#security-iam-roles"
  exit 1
fi

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)
  if [[ -z "$AWS_ACCOUNT_ID" ]]; then
    echo "Error: Could not get AWS_ACCOUNT_ID. Set AWS_ACCOUNT_ID or configure AWS CLI."
    exit 1
  fi
fi

IMAGE_ID="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/myinvestments:${ECR_TAG}"

# Build RuntimeEnvironmentVariables as JSON from .env file
# (strip comments, empty lines, surrounding quotes on values; jq --arg escapes special chars)
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

# Build full create-service input JSON
INPUT_JSON=$(jq -n \
  --arg name "$SERVICE_NAME" \
  --arg image "$IMAGE_ID" \
  --arg role "$APP_RUNNER_ECR_ACCESS_ROLE" \
  --argjson env "$ENV_JSON" \
  '{
    ServiceName: $name,
    SourceConfiguration: {
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
    },
    InstanceConfiguration: {
      Cpu: "1 vCPU",
      Memory: "2 GB"
    },
    HealthCheckConfiguration: {
      Protocol: "HTTP",
      Path: "/api/health/live",
      Interval: 10,
      Timeout: 5,
      HealthyThreshold: 1,
      UnhealthyThreshold: 5
    }
  }')

OUTPUT_FILE="$REPO_ROOT/apprunner-create-input.json"
echo "$INPUT_JSON" > "$OUTPUT_FILE"
echo "Wrote: $OUTPUT_FILE"
echo ""
echo "Run this to create the App Runner service (all env vars from $ENV_FILE are included):"
echo ""
echo "  aws apprunner create-service --cli-input-json file://$OUTPUT_FILE --region $AWS_REGION"
echo ""
echo "Then set GitHub variable APP_RUNNER_SERVICE_ARN to the new service ARN (from the command output)."
