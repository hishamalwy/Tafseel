<#
.SYNOPSIS
  Portable tests for staging migration automation scripts and workflow wiring.
#>
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoCi = Split-Path -Parent $here
$repoRoot = Split-Path -Parent (Split-Path -Parent $repoCi)

$buildScript = Join-Path $repoCi "build-migration-artifacts.sh"
$runScript = Join-Path $repoCi "run-staging-migrations.sh"
$databaseWorkflow = Join-Path $repoRoot ".github/workflows/database.yml"
$deployWorkflow = Join-Path $repoRoot ".github/workflows/deploy-staging.yml"

$failed = 0
$passed = 0

function Assert-True {
  param([string]$Name, [bool]$Condition, [string]$Detail = "")
  if ($Condition) {
    Write-Host "PASS: $Name"
    $script:passed++
  }
  else {
    Write-Host "FAIL: $Name $(if ($Detail) { "- $Detail" })"
    $script:failed++
  }
}

Assert-True "build script exists" (Test-Path -LiteralPath $buildScript)
Assert-True "run script exists" (Test-Path -LiteralPath $runScript)
Assert-True "database workflow exists" (Test-Path -LiteralPath $databaseWorkflow)
Assert-True "deploy workflow exists" (Test-Path -LiteralPath $deployWorkflow)

$buildText = Get-Content -LiteralPath $buildScript -Raw
Assert-True "build script creates linux-x64 bundle" ($buildText -match '--target-runtime linux-x64')
Assert-True "build script creates migration bundle" ($buildText -match 'dotnet ef migrations bundle')
Assert-True "build script creates idempotent SQL" ($buildText -match 'dotnet ef migrations script --idempotent')
Assert-True "build script writes SHA256SUMS" ($buildText -match 'SHA256SUMS')

$runText = Get-Content -LiteralPath $runScript -Raw
Assert-True "run script locks staging database name" ($runText -match 'EXPECTED_DATABASE_NAME="\$\{EXPECTED_DATABASE_NAME:-tafseel-staging-db\}"')
Assert-True "run script requires staging SQL secrets" (
  $runText -match 'STAGING_SQL_SERVER' -and
  $runText -match 'STAGING_SQL_USERNAME' -and
  $runText -match 'STAGING_SQL_PASSWORD'
)
Assert-True "run script masks connection secrets" (
  $runText -match 'add-mask' -and
  $runText -match 'CONNECTION_STRING'
)
Assert-True "run script uses migration bundle" ($runText -match '--connection "\$CONNECTION_STRING"')
Assert-True "run script validates artifact hashes" ($runText -match 'sha256sum -c')
Assert-True "run script inspects database identity" (
  $runText -match 'ORIGINAL_LOGIN' -and
  $runText -match 'SYSTEM_USER'
)
Assert-True "run script verifies migration history" ($runText -match '__EFMigrationsHistory')
Assert-True "run script verifies schema objects" (
  $runText -match 'OBJECT_ID' -and
  $runText -match 'COL_LENGTH'
)
Assert-True "run script retries bounded transient failures" (
  $runText -match 'TRANSIENT_RETRY_COUNT' -and
  $runText -match 'Transient Azure SQL failure detected'
)
Assert-True "run script rejects wrong database name" ($runText -match "Refusing to run against database")
Assert-True "run script writes step summary" ($runText -match '## Staging database migration')

$databaseText = Get-Content -LiteralPath $databaseWorkflow -Raw
Assert-True "database workflow builds migration artifacts" ($databaseText -match 'build-migration-artifacts\.sh')
Assert-True "database workflow uploads migration artifact directory" ($databaseText -match 'path:\s*artifacts/migrations')

$deployText = Get-Content -LiteralPath $deployWorkflow -Raw
Assert-True "deploy workflow keeps workflow_dispatch" ($deployText -match 'workflow_dispatch:')
Assert-True "deploy workflow still uses workflow_run Staging Gate" ($deployText -match 'workflows:\s*\[["'']Staging Gate["'']\]')
Assert-True "deploy workflow has resolve job" ($deployText -match 'name:\s*resolve-validated-sha')
Assert-True "deploy workflow has staging migration job" ($deployText -match 'name:\s*staging-db-migrate')
Assert-True "deploy workflow deploy job depends on migrate" ($deployText -match 'needs:\s*\[resolve,\s*migrate\]')
Assert-True "deploy workflow uses exact resolved SHA" (
  $deployText -match 'needs\.resolve\.outputs\.sha' -and
  $deployText -match 'workflow_run\.head_sha'
)
Assert-True "deploy workflow uses staging environment for migration job" ($deployText -match 'environment:\s*staging')
Assert-True "deploy workflow wires staging SQL database variable" ($deployText -match 'STAGING_SQL_DATABASE:\s*\$\{\{\s*vars\.STAGING_SQL_DATABASE\s*\}\}')
Assert-True "deploy workflow wires fixed expected staging DB name" ($deployText -match 'EXPECTED_DATABASE_NAME:\s*tafseel-staging-db')
Assert-True "deploy workflow blocks deploy until migration success" (
  $deployText -match 'needs:\s*\[resolve,\s*migrate\]' -and
  $deployText -match 'Database migrations were applied and verified in job'
)
Assert-True "deploy workflow does not trigger production" ($deployText -notmatch 'environment:\s*production')

Write-Host ""
Write-Host "Passed: $passed  Failed: $failed"
if ($failed -gt 0) { exit 1 }
exit 0
