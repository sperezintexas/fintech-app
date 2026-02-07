#!/usr/bin/env bash
# Set Elastic Beanstalk environment variables from a .env file (e.g. .env.prod).
# Usage: ./scripts/eb-setenv-from-file.sh [env-file] [eb-environment-name]
#   env-file: default .env.prod (relative to repo root)
#   eb-environment-name: default myinvestments-prod
# Run from repo root. Requires: eb CLI, AWS credentials configured.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$REPO_ROOT/.env.prod}"
EB_ENV_NAME="${2:-myinvestments-prod}"

# Hardcoded list of env var names to push to EB (add/remove as needed)
EB_ENV_KEYS=(
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
  echo "Usage: $0 [env-file] [eb-environment-name]"
  exit 1
fi

echo "Reading from: $ENV_FILE"
echo "EB environment: $EB_ENV_NAME"
echo ""

declare -a SETENV_ARGS

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
  # Strip surrounding single or double quotes (need length >= 2 to avoid substring error)
  if [[ ${#value} -ge 2 ]] && { [[ "$value" =~ ^\'.*\'$ ]] || [[ "$value" =~ ^\".*\"$ ]]; }; then
    value="${value:1:${#value}-2}"
  fi

  for want in "${EB_ENV_KEYS[@]}"; do
    if [[ "$key" == "$want" ]]; then
      # Escape single quotes for safe use in shell: ' -> '\''
      escaped="${value//\'/\'\\\'\'}"
      SETENV_ARGS+=( "$key='$escaped'" )
      break
    fi
  done
done < "$ENV_FILE"

if [[ ${#SETENV_ARGS[@]} -eq 0 ]]; then
  echo "No matching env vars found in $ENV_FILE for keys: ${EB_ENV_KEYS[*]}"
  exit 1
fi

echo "Setting ${#SETENV_ARGS[@]} variables on EB..."
cd "$REPO_ROOT"
eb use "$EB_ENV_NAME"
eb setenv "${SETENV_ARGS[@]}"
echo "Done."
