#!/usr/bin/env bash
# Bounded post-deploy smoke probes for Azure Staging.
# Explicitly fails when /health/ready never becomes healthy.
set -euo pipefail

APP_URL="${1:-${APP_URL:-}}"
READY_ATTEMPTS="${2:-60}"
READY_SLEEP_SECONDS="${3:-5}"
CURL_MAX_TIME="${4:-20}"

if [[ -z "$APP_URL" ]]; then
  echo "APP_URL is required."
  exit 1
fi

APP_URL="${APP_URL%/}"
ready=0

echo "Probing readiness at $APP_URL/health/ready (up to $READY_ATTEMPTS attempts)"
for ((attempt = 1; attempt <= READY_ATTEMPTS; attempt++)); do
  if curl --fail --silent --show-error --max-time "$CURL_MAX_TIME" \
    "$APP_URL/health/ready" >/dev/null; then
    ready=1
    echo "Ready probe succeeded on attempt $attempt."
    break
  fi
  echo "Ready probe attempt $attempt/$READY_ATTEMPTS failed; sleeping ${READY_SLEEP_SECONDS}s."
  sleep "$READY_SLEEP_SECONDS"
done

if [[ "$ready" -ne 1 ]]; then
  cat <<EOF
Ready probe never succeeded after ${READY_ATTEMPTS} attempts.
Staging deploy does not apply EF migrations. If the App Service cannot become ready,
apply the reviewed idempotent SQL artifact to the Staging database manually, then redeploy.
Schema compatibility is not guaranteed until /health/ready succeeds.
EOF
  exit 1
fi

curl --fail --silent --show-error --max-time "$CURL_MAX_TIME" "$APP_URL/health/live" >/dev/null
echo "Live probe succeeded."

curl --fail --silent --show-error --max-time "$CURL_MAX_TIME" "$APP_URL/health/ready" >/dev/null
echo "Ready re-check succeeded."

curl --fail --silent --show-error --max-time "$CURL_MAX_TIME" \
  "$APP_URL/app/Tafseel-Landing.dc.html" >/dev/null
echo "Landing page probe succeeded."

auth_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time "$CURL_MAX_TIME" \
  "$APP_URL/api/v1/auth/me")"
if [[ "$auth_status" != "401" ]]; then
  echo "Expected /api/v1/auth/me to return 401, got $auth_status."
  exit 1
fi
echo "Auth me probe returned 401 as expected."
