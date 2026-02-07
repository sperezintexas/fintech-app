#!/usr/bin/env bash
# Create or update AWS Secrets Manager secrets from a .env file (e.g. .env.prod).
# Each KEY=value becomes one secret: ${PREFIX}/${KEY}.
# Usage: ./scripts/aws-secrets-from-env.sh [env-file] [secret-prefix] [region]
#   env-file:       default .env.prod (relative to repo root)
#   secret-prefix:  default myinvestments/prod (secret names: myinvestments/prod/MONGODB_URI, ...)
#   region:         default us-east-1
# Run from repo root. Requires: AWS CLI, credentials with secretsmanager:CreateSecret, PutSecretValue.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$REPO_ROOT/.env.prod}"
SECRET_PREFIX="${2:-myinvestments/prod}"
AWS_REGION="${3:-us-east-1}"

# Hardcoded list of env var names to create as secrets (add/remove as needed)
ENV_KEYS=(
  MONGODB_URI
  MONGODB_URI_B64
  MONGODB_DB
  AUTH_SECRET
  NEXTAUTH_URL
  X_CLIENT_ID
  X_CLIENT_SECRET
  XAI_API_KEY
  WEB_SEARCH_API_KEY
  CRON_SECRET
  SLACK_WEBHOOK_URL
)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  echo "Usage: $0 [env-file] [secret-prefix] [region]"
  exit 1
fi

echo "Reading from: $ENV_FILE"
echo "Secret prefix: $SECRET_PREFIX"
echo "Region: $AWS_REGION"
echo ""

created=0
updated=0
skipped=0

while IFS= read -r line; do
  line="${line%%#*}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" ]] && continue

  key="${line%%=*}"
  key="${key%"${key##*[![:space:]]}"}"
  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]] && { [[ "$value" =~ ^\'.*\'$ ]] || [[ "$value" =~ ^\".*\"$ ]]; }; then
    value="${value:1:${#value}-2}"
  fi

  matched=false
  for want in "${ENV_KEYS[@]}"; do
    if [[ "$key" == "$want" ]]; then
      matched=true
      break
    fi
  done
  [[ "$matched" != true ]] && continue

  secret_name="${SECRET_PREFIX}/${key}"
  tmpfile=$(mktemp)
  printf '%s' "$value" > "$tmpfile"

  if aws secretsmanager describe-secret --secret-id "$secret_name" --region "$AWS_REGION" &>/dev/null; then
    aws secretsmanager put-secret-value \
      --secret-id "$secret_name" \
      --secret-string "file://$tmpfile" \
      --region "$AWS_REGION" >/dev/null
    echo "Updated: $secret_name"
    ((updated++)) || true
  else
    aws secretsmanager create-secret \
      --name "$secret_name" \
      --secret-string "file://$tmpfile" \
      --region "$AWS_REGION" >/dev/null
    echo "Created: $secret_name"
    ((created++)) || true
  fi
  rm -f "$tmpfile"
done < "$ENV_FILE"

echo ""
echo "Done. Created: $created, Updated: $updated"
