#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="${1:-artifacts/migrations}"
BUNDLE_PATH="$ARTIFACT_DIR/tafseel-staging-migrate"
SQL_PATH="$ARTIFACT_DIR/tafseel-idempotent.sql"
HASH_PATH="$ARTIFACT_DIR/SHA256SUMS"

mkdir -p "$ARTIFACT_DIR"
rm -f "$BUNDLE_PATH" "$SQL_PATH" "$HASH_PATH"

dotnet ef migrations bundle \
  --project src/Tafseel.Infrastructure \
  --startup-project src/Tafseel.Api \
  --configuration Release \
  --self-contained \
  --target-runtime linux-x64 \
  --output "$BUNDLE_PATH"

chmod +x "$BUNDLE_PATH"

dotnet ef migrations script --idempotent \
  --project src/Tafseel.Infrastructure \
  --startup-project src/Tafseel.Api \
  --configuration Release \
  --output "$SQL_PATH"

test -x "$BUNDLE_PATH" || { echo "Migration bundle was not created."; exit 1; }
test -s "$SQL_PATH" || { echo "Idempotent SQL script was not created."; exit 1; }
"$BUNDLE_PATH" --help >/dev/null

sha256sum "$BUNDLE_PATH" "$SQL_PATH" > "$HASH_PATH"
test -s "$HASH_PATH" || { echo "Migration artifact hash file was not created."; exit 1; }

echo "Migration artifacts ready:"
echo "  bundle=$BUNDLE_PATH"
echo "  sql=$SQL_PATH"
echo "  hashes=$HASH_PATH"
