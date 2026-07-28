#!/usr/bin/env bash
set -euo pipefail

EXPECTED_DATABASE_NAME="${EXPECTED_DATABASE_NAME:-tafseel-staging-db}"
TARGET_ENVIRONMENT_NAME="${TARGET_ENVIRONMENT_NAME:-staging}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-src/Tafseel.Infrastructure/Persistence/Migrations}"
MIGRATION_BUNDLE_PATH="${MIGRATION_BUNDLE_PATH:-artifacts/migrations/tafseel-staging-migrate}"
IDEMPOTENT_SQL_PATH="${IDEMPOTENT_SQL_PATH:-artifacts/migrations/tafseel-idempotent.sql}"
HASH_FILE_PATH="${HASH_FILE_PATH:-artifacts/migrations/SHA256SUMS}"
SQLCMD_IMAGE="${SQLCMD_IMAGE:-mcr.microsoft.com/mssql/server:2022-CU26-ubuntu-22.04}"
BUNDLE_TIMEOUT_SECONDS="${BUNDLE_TIMEOUT_SECONDS:-900}"
TRANSIENT_RETRY_COUNT="${TRANSIENT_RETRY_COUNT:-3}"
TRANSIENT_RETRY_DELAY_SECONDS="${TRANSIENT_RETRY_DELAY_SECONDS:-15}"

required_vars=(
  STAGING_SQL_SERVER
  STAGING_SQL_DATABASE
  STAGING_SQL_USERNAME
  STAGING_SQL_PASSWORD
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required."
    exit 1
  fi
done

if [[ "$STAGING_SQL_DATABASE" != "$EXPECTED_DATABASE_NAME" ]]; then
  echo "Refusing to run against database '$STAGING_SQL_DATABASE'. Expected '$EXPECTED_DATABASE_NAME'."
  exit 1
fi

test -x "$MIGRATION_BUNDLE_PATH" || { echo "Migration bundle not found: $MIGRATION_BUNDLE_PATH"; exit 1; }
test -s "$IDEMPOTENT_SQL_PATH" || { echo "Idempotent SQL script not found: $IDEMPOTENT_SQL_PATH"; exit 1; }
test -s "$HASH_FILE_PATH" || { echo "Hash file not found: $HASH_FILE_PATH"; exit 1; }

CONNECTION_STRING="Server=tcp:${STAGING_SQL_SERVER},1433;Initial Catalog=${STAGING_SQL_DATABASE};User ID=${STAGING_SQL_USERNAME};Password=${STAGING_SQL_PASSWORD};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
echo "::add-mask::$STAGING_SQL_PASSWORD"
echo "::add-mask::$CONNECTION_STRING"

latest_expected_migration="$(
  for path in "$MIGRATIONS_DIR"/*.cs; do
    base="$(basename "$path" .cs)"
    if [[ "$base" =~ ^[0-9]{14}_.+ ]] && [[ "$base" != *.Designer ]]; then
      echo "$base"
    fi
  done | sort | tail -n 1
)"

if [[ -z "$latest_expected_migration" ]]; then
  echo "Could not determine the latest migration from $MIGRATIONS_DIR."
  exit 1
fi

latest_migration_file="$MIGRATIONS_DIR/${latest_expected_migration}.cs"
test -f "$latest_migration_file" || { echo "Latest migration file not found: $latest_migration_file"; exit 1; }

run_sqlcmd() {
  local query="$1"
  docker run --rm \
    -e SQLCMDPASSWORD="$STAGING_SQL_PASSWORD" \
    "$SQLCMD_IMAGE" \
    /opt/mssql-tools18/bin/sqlcmd \
    -C -b -W -h -1 -l 30 \
    -S "$STAGING_SQL_SERVER" \
    -d "$STAGING_SQL_DATABASE" \
    -U "$STAGING_SQL_USERNAME" \
    -Q "$query"
}

query_scalar() {
  local query="$1"
  local output
  output="$(run_sqlcmd "$query")"
  printf '%s\n' "$output" | tr -d '\r' | awk 'NF { print; exit }'
}

artifact_hash_output="$(sha256sum "$MIGRATION_BUNDLE_PATH" "$IDEMPOTENT_SQL_PATH")"
printf '%s\n' "$artifact_hash_output"
sha256sum -c "$HASH_FILE_PATH"

echo "Inspecting $TARGET_ENVIRONMENT_NAME database target..."
actual_database_name="$(query_scalar "SET NOCOUNT ON; SELECT DB_NAME();")"
actual_server_name="$(query_scalar "SET NOCOUNT ON; SELECT COALESCE(CAST(SERVERPROPERTY('ServerName') AS nvarchar(256)), @@SERVERNAME);")"
database_identity="$(query_scalar "SET NOCOUNT ON; SELECT CONCAT(COALESCE(ORIGINAL_LOGIN(), ''), '|', COALESCE(SUSER_SNAME(), ''), '|', COALESCE(SYSTEM_USER, ''));")"

if [[ "$actual_database_name" != "$EXPECTED_DATABASE_NAME" ]]; then
  echo "Connected database '$actual_database_name' did not match expected '$EXPECTED_DATABASE_NAME'."
  exit 1
fi

echo "Target server: $actual_server_name"
echo "Target database: $actual_database_name"
echo "Database identity: $database_identity"

current_latest_migration="$(
  query_scalar "SET NOCOUNT ON; IF OBJECT_ID(N'__EFMigrationsHistory', N'U') IS NULL SELECT N'(none)'; ELSE SELECT TOP (1) [MigrationId] FROM [__EFMigrationsHistory] ORDER BY [MigrationId] DESC;"
)"

echo "Current latest migration: $current_latest_migration"
echo "Target latest migration: $latest_expected_migration"

is_transient_failure() {
  local log_file="$1"
  grep -Eq '40613|40197|40501|49918|49919|49920|10928|10929|deadlocked on lock resources|transport-level error|temporarily unavailable|The service has encountered an error processing your request' "$log_file"
}

bundle_log="$(mktemp)"
attempt=1
while true; do
  : > "$bundle_log"
  set +e
  timeout "${BUNDLE_TIMEOUT_SECONDS}s" "$MIGRATION_BUNDLE_PATH" --connection "$CONNECTION_STRING" >"$bundle_log" 2>&1
  exit_code=$?
  set -e

  cat "$bundle_log"

  if [[ $exit_code -eq 0 ]]; then
    break
  fi

  if [[ $exit_code -eq 124 ]]; then
    echo "Migration bundle timed out after ${BUNDLE_TIMEOUT_SECONDS}s."
    exit 1
  fi

  if (( attempt >= TRANSIENT_RETRY_COUNT )) || ! is_transient_failure "$bundle_log"; then
    echo "Migration bundle failed without a retryable transient condition."
    exit "$exit_code"
  fi

  echo "Transient Azure SQL failure detected on attempt $attempt/$TRANSIENT_RETRY_COUNT; retrying after ${TRANSIENT_RETRY_DELAY_SECONDS}s."
  sleep "$TRANSIENT_RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done

latest_after_migration="$(
  query_scalar "SET NOCOUNT ON; SELECT TOP (1) [MigrationId] FROM [__EFMigrationsHistory] ORDER BY [MigrationId] DESC;"
)"
expected_exists="$(
  query_scalar "SET NOCOUNT ON; SELECT COUNT(*) FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'${latest_expected_migration}';"
)"

if [[ "$expected_exists" != "1" ]]; then
  echo "Expected migration '$latest_expected_migration' was not recorded in __EFMigrationsHistory."
  exit 1
fi

if [[ "$latest_after_migration" != "$latest_expected_migration" ]]; then
  echo "Latest applied migration '$latest_after_migration' did not match expected '$latest_expected_migration'."
  exit 1
fi

python3 - "$latest_migration_file" >"$bundle_log" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
lines = []

for match in re.finditer(r'CreateTable\(\s*[\r\n]+\s*name:\s*"([^"]+)"', text, re.MULTILINE):
    lines.append(f"table\t{match.group(1)}")

for match in re.finditer(r'AddColumn<[^>]+>\(\s*[\r\n]+\s*name:\s*"([^"]+)",\s*[\r\n]+\s*table:\s*"([^"]+)"', text, re.MULTILINE):
    column, table = match.group(1), match.group(2)
    lines.append(f"column\t{table}\t{column}")

print("\n".join(lines))
PY

while IFS=$'\t' read -r kind first second; do
  [[ -n "${kind:-}" ]] || continue
  if [[ "$kind" == "table" ]]; then
    exists="$(query_scalar "SET NOCOUNT ON; SELECT CASE WHEN OBJECT_ID(N'dbo.${first}', N'U') IS NULL THEN 0 ELSE 1 END;")"
    if [[ "$exists" != "1" ]]; then
      echo "Expected table dbo.$first was not found after migration."
      exit 1
    fi
    echo "Verified table dbo.$first"
  elif [[ "$kind" == "column" ]]; then
    exists="$(query_scalar "SET NOCOUNT ON; SELECT CASE WHEN COL_LENGTH(N'dbo.${first}', N'${second}') IS NULL THEN 0 ELSE 1 END;")"
    if [[ "$exists" != "1" ]]; then
      echo "Expected column dbo.$first.$second was not found after migration."
      exit 1
    fi
    echo "Verified column dbo.$first.$second"
  fi
done <"$bundle_log"

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Staging database migration"
    echo "- Validated SHA: \`${DEPLOY_SHA:-unknown}\`"
    echo "- Environment: \`${TARGET_ENVIRONMENT_NAME}\`"
    echo "- Target server: \`${actual_server_name}\`"
    echo "- Target database: \`${actual_database_name}\`"
    echo "- Current latest migration before apply: \`${current_latest_migration}\`"
    echo "- Target latest migration: \`${latest_expected_migration}\`"
    echo "- Latest migration after apply: \`${latest_after_migration}\`"
  } >>"$GITHUB_STEP_SUMMARY"
fi

echo "Staging migrations verified successfully."
