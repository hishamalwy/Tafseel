#!/usr/bin/env bash
# Reproduces the 2026-09-14 baseline (docs/audits/baseline-2026-09-14/README.md).
#
#   bash scripts/baseline/run-baseline.sh <out-dir-outside-the-repo>
#
# What it touches in the repository: only gitignored build output (frontend-angular/dist,
# frontend-angular/src/generated, bin/obj). Everything that needs a change to compile or
# run is done in a disposable copy under <out-dir>/tree. The last commit is built from
# `git archive` under <out-dir>/head. Nothing is committed, and no lock file is rewritten
# in the repository.
#
# SQL Server suites run when TAFSEEL_SQLSERVER_TEST_CONNECTION is set, or against LocalDB
# (MSSQLLocalDB) when sqllocaldb is on PATH. Each suite creates and drops its own
# TafseelTest*_<guid> database.
set -u

REPO=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${1:?pass an output directory outside the repository}
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
case "$OUT" in "$REPO"*) echo "output directory must be outside $REPO"; exit 2;; esac

export DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1
if [ -z "${TAFSEEL_SQLSERVER_TEST_CONNECTION:-}" ] && command -v sqllocaldb >/dev/null 2>&1; then
  export TAFSEEL_SQLSERVER_TEST_CONNECTION='Server=(localdb)\MSSQLLocalDB;Integrated Security=true;TrustServerCertificate=True'
fi
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }
S="$OUT/summary.txt"; : > "$S"
note() { echo "$*" | tee -a "$S"; }
counts() { grep -hE 'Passed!|Failed!' "$1" 2>/dev/null | sed -E 's/, Duration.*//; s/^[^-]*- //' | head -1; }
PS=$(command -v pwsh || command -v powershell || true)

note "# Tafseel baseline  $(date -Iseconds)"
note "repo HEAD: $(git -C "$REPO" rev-parse --short HEAD) ($(git -C "$REPO" log -1 --format=%ad --date=short))  branch: $(git -C "$REPO" branch --show-current)"
note "uncommitted: $(git -C "$REPO" diff HEAD --shortstat | sed 's/^ //')  untracked paths: $(git -C "$REPO" ls-files --others --exclude-standard | wc -l)"
note "dotnet $(dotnet --version) | node $(node --version) | npm $(npm --version)"
note ""

# ---------------------------------------------------------------- working tree, as-is
note "## Working tree (as found)"
( cd "$REPO" && dotnet restore Tafseel.sln --locked-mode ) > "$OUT/wt-restore-locked.log" 2>&1
note "restore --locked-mode: exit $?  $(grep -c NU1004 "$OUT/wt-restore-locked.log") NU1004"
( cd "$REPO" && dotnet format Tafseel.sln --verify-no-changes --no-restore ) > "$OUT/wt-format.log" 2>&1
note "format --verify-no-changes: exit $?  $(grep -c ': error ' "$OUT/wt-format.log") errors"
( cd "$REPO/frontend-angular" && npm run build ) > "$OUT/ng-build.log" 2>&1
note "angular build (sync:design, check:i18n, check:styles, ng build): exit $?"
( cd "$REPO/frontend-angular" && npx ng test --watch=false ) > "$OUT/ng-test.log" 2>&1
note "angular unit tests: exit $?  $(sed 's/\x1b\[[0-9;]*m//g' "$OUT/ng-test.log" | grep -E '^ +Tests ' | tr -s ' ')"

# ---------------------------------------------------------------- disposable copy
rm -rf "$OUT/tree"; mkdir -p "$OUT/tree"
( cd "$REPO" && tar -cf - --exclude=node_modules --exclude=bin --exclude=obj --exclude=.git --exclude=docs \
    --exclude=design-lab --exclude=tmp --exclude=.godaudits --exclude=.claude --exclude=.codex --exclude=.cursor \
    --exclude=.impeccable --exclude=.hallmark --exclude=.vs --exclude=frontend-angular/.angular \
    --exclude=App_Data --exclude=uploads --exclude=tools --exclude=deploy . ) | tar -xf - -C "$OUT/tree"
T="$OUT/tree"
# A clean checkout has no App_Data (gitignored) but the API project copies App_Data/logs/.keep.
mkdir -p "$T/src/Tafseel.Api/App_Data/logs" && touch "$T/src/Tafseel.Api/App_Data/logs/.keep"
( cd "$T" && dotnet restore Tafseel.sln ) > "$OUT/tree-restore.log" 2>&1
note "copy: unlocked restore exit $?"
for p in Tafseel.ArchitectureTests Tafseel.Application.Tests Tafseel.Domain.Tests Tafseel.IntegrationTests; do
  ( cd "$T" && dotnet build "tests/$p" -c Release --no-restore -p:BuildWebClient=false ) > "$OUT/tree-build-$p.log" 2>&1
  note "copy: build $p as-is: exit $?  $(grep -cE ': error ' "$OUT/tree-build-$p.log") error lines"
done
node "$REPO/scripts/baseline/apply-test-compile-fix.mjs" "$T" "$OUT/tree-build-Tafseel.IntegrationTests.log" >> "$S" 2>&1
cp "$REPO/scripts/baseline/EndpointInventoryProbe.cs" "$T/tests/Tafseel.IntegrationTests/"
( cd "$T" && dotnet build Tafseel.sln -c Release --no-restore -p:BuildWebClient=false ) > "$OUT/tree-build.log" 2>&1
note "copy: solution build after compile fix: exit $?"

mkdir -p "$OUT/inventory"; export BASELINE_OUT; BASELINE_OUT=$(winpath "$OUT/inventory")
( cd "$T" && dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "FullyQualifiedName~BaselineEndpointInventory" ) > "$OUT/tree-inventory.log" 2>&1
note "endpoint inventory probe: exit $?"
for p in Tafseel.ArchitectureTests Tafseel.Domain.Tests Tafseel.Application.Tests; do
  ( cd "$T" && dotnet test "tests/$p" -c Release --no-build --logger "trx;LogFileName=$p.trx" --results-directory "$(winpath "$OUT/trx")" ) > "$OUT/tree-test-$p.log" 2>&1
  note "copy: $p  $(counts "$OUT/tree-test-$p.log")"
done
( cd "$T" && dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category!=SqlServer&FullyQualifiedName!~BaselineEndpointInventory" --logger "trx;LogFileName=integration.trx" --results-directory "$(winpath "$OUT/trx")" ) > "$OUT/tree-test-integration.log" 2>&1
note "copy: integration (provider-neutral)  $(counts "$OUT/tree-test-integration.log")"
if [ -n "${TAFSEEL_SQLSERVER_TEST_CONNECTION:-}" ]; then
  ( cd "$T" && dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category=SqlServer" --logger "trx;LogFileName=sqlserver.trx" --results-directory "$(winpath "$OUT/trx")" ) > "$OUT/tree-test-sqlserver.log" 2>&1
  note "copy: integration (SQL Server)  $(counts "$OUT/tree-test-sqlserver.log")"
else
  note "copy: integration (SQL Server)  SKIPPED - no connection"
fi
grep -hE '^  Failed Tafseel' "$OUT"/tree-test-*.log | sed -E 's/^  Failed //; s/ \[.*//' | sort > "$OUT/failed-tests.txt"
note "copy: failing tests listed in failed-tests.txt ($(wc -l < "$OUT/failed-tests.txt"))"

( cd "$T" && node scripts/ci/check-js.mjs ) > "$OUT/ci-check-js.log" 2>&1
note "ci: check-js.mjs exit $?"
if [ -n "$PS" ]; then
  for t in deploy-gates staging-migration check-migration-safety; do
    ( cd "$T" && "$PS" -NoProfile -File "scripts/ci/tests/$t.tests.ps1" ) > "$OUT/ci-$t.log" 2>&1
    note "ci: $t.tests.ps1 exit $?"
  done
fi
cp -r "$REPO/.config" "$T/" 2>/dev/null
( cd "$T" && dotnet tool restore >/dev/null 2>&1 && Jwt__SigningKey=ci-only-signing-key-with-at-least-32-characters \
    Resend__ApiToken=ci-only-token Payments__WebhookSecret=ci-only-webhook-secret-with-at-least-32-characters \
    dotnet ef migrations has-pending-model-changes --project src/Tafseel.Infrastructure --startup-project src/Tafseel.Api --configuration Release --no-build ) > "$OUT/ci-ef-pending.log" 2>&1
note "ci: ef has-pending-model-changes exit $?  $(grep -hE 'No changes|changes' "$OUT/ci-ef-pending.log" | tail -1)"
( cd "$T" && dotnet publish src/Tafseel.Api/Tafseel.Api.csproj -c Release --no-restore -p:BuildWebClient=false -o artifacts/publish ) > "$OUT/ci-publish.log" 2>&1
note "ci: publish exit $?"
if [ -n "$PS" ]; then
  ( cd "$T" && "$PS" -NoProfile -File scripts/ci/validate-publish.ps1 ) > "$OUT/ci-validate-publish.log" 2>&1
  note "ci: validate-publish.ps1 exit $?"
fi

# ---------------------------------------------------------------- last commit
note ""; note "## Last commit (git archive HEAD)"
rm -rf "$OUT/head"; mkdir -p "$OUT/head"
git -C "$REPO" archive HEAD | tar -xf - -C "$OUT/head"
H="$OUT/head"
( cd "$H" && dotnet restore Tafseel.sln --locked-mode ) > "$OUT/head-restore.log" 2>&1; note "restore --locked-mode: exit $?"
( cd "$H" && dotnet build Tafseel.sln -c Release --no-restore -p:BuildWebClient=false ) > "$OUT/head-build.log" 2>&1; note "build: exit $?"
for p in Tafseel.ArchitectureTests Tafseel.Domain.Tests Tafseel.Application.Tests; do
  ( cd "$H" && dotnet test "tests/$p" -c Release --no-build ) > "$OUT/head-test-$p.log" 2>&1
  note "$p  $(counts "$OUT/head-test-$p.log")"
done
( cd "$H" && dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category!=SqlServer" ) > "$OUT/head-test-integration.log" 2>&1
note "integration (provider-neutral)  $(counts "$OUT/head-test-integration.log")"
if [ -n "${TAFSEEL_SQLSERVER_TEST_CONNECTION:-}" ]; then
  ( cd "$H" && dotnet test tests/Tafseel.IntegrationTests -c Release --no-build --filter "Category=SqlServer" ) > "$OUT/head-test-sqlserver.log" 2>&1
  note "integration (SQL Server)  $(counts "$OUT/head-test-sqlserver.log")"
fi

# ---------------------------------------------------------------- client ↔ server contract
note ""; note "## Contract"
node "$REPO/scripts/baseline/inventory-client.mjs" "$REPO" "$OUT/inventory" >> "$S" 2>&1
node "$REPO/scripts/baseline/match-contract.mjs" "$OUT/inventory" > "$OUT/contract.txt" 2>&1
head -2 "$OUT/contract.txt" | tee -a "$S"
( cd "$REPO" && node scripts/ci/check-api-contract.mjs ) > "$OUT/ci-api-contract.log" 2>&1
note "ci: check-api-contract.mjs exit $?  $(head -1 "$OUT/ci-api-contract.log")"
( cd "$REPO" && node scripts/ci/check-api-contract.mjs --strict ) > /dev/null 2>&1
note "ci: check-api-contract.mjs --strict exit $? (non-zero while known violations remain)"
note ""; note "done. Logs and inventories: $OUT"
