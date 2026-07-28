<#
.SYNOPSIS
  Portable (Pester-free) tests for Staging deploy gate lists and revision helpers.
#>
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoCi = Split-Path -Parent $here
$gatesFile = Join-Path $repoCi "required-staging-gates.txt"
$verifyScript = Join-Path $repoCi "verify-main-revision.sh"
$waitScript = Join-Path $repoCi "wait-for-required-checks.sh"
$smokeScript = Join-Path $repoCi "staging-smoke.sh"

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

$expectedGates = @(
  "build-and-provider-neutral",
  "sql-server",
  "publish-smoke",
  "dependencies-and-secrets",
  "codeql-csharp",
  "codeql-javascript-typescript",
  "migrations",
  "image"
)

Assert-True "gates file exists" (Test-Path -LiteralPath $gatesFile)
Assert-True "verify-main-revision.sh exists" (Test-Path -LiteralPath $verifyScript)
Assert-True "wait-for-required-checks.sh exists" (Test-Path -LiteralPath $waitScript)
Assert-True "staging-smoke.sh exists" (Test-Path -LiteralPath $smokeScript)

$actualGates = Get-Content -LiteralPath $gatesFile |
  Where-Object { $_ -notmatch '^\s*(#|$)' } |
  ForEach-Object { $_.Trim() }

Assert-True "gate count is $($expectedGates.Count)" ($actualGates.Count -eq $expectedGates.Count) "got $($actualGates.Count)"
Assert-True "gate list matches expected names" (
  (@($actualGates) -join "|") -eq (@($expectedGates) -join "|")
) "got: $($actualGates -join ', ')"

$duplicateCount = @($actualGates | Group-Object | Where-Object Count -gt 1).Count
Assert-True "gate list has no duplicates" ($duplicateCount -eq 0)

function Test-FullSha {
  param([string]$Value)
  return [bool]($Value -match '^[0-9A-Fa-f]{40}$')
}

Assert-True "rejects empty SHA" (-not (Test-FullSha ""))
Assert-True "rejects short SHA" (-not (Test-FullSha "abc123"))
Assert-True "rejects non-hex SHA" (-not (Test-FullSha ("g" * 40)))
Assert-True "accepts lowercase full SHA" (Test-FullSha ("a" * 40))
Assert-True "accepts uppercase full SHA" (Test-FullSha ("A" * 40))
Assert-True "accepts mixed full SHA" (Test-FullSha (("a" * 20) + ("B" * 20)))

$verifyText = Get-Content -LiteralPath $verifyScript -Raw
Assert-True "verify script checks 40-char SHA" ($verifyText -match '\[0-9A-Fa-f\]\{40\}')
Assert-True "verify script checks main ancestry" ($verifyText -match 'merge-base --is-ancestor')

$waitText = Get-Content -LiteralPath $waitScript -Raw
Assert-True "wait script fails on failure conclusions" ($waitText -match 'failure\|cancelled\|timed_out')
Assert-True "wait script has finite timeout default" ($waitText -match 'TIMEOUT_SECONDS="\$\{3:-2700\}"')
Assert-True "wait script polls while pending" ($waitText -match 'Still waiting')
Assert-True "wait script requires success conclusion" ($waitText -match 'conclusion" == "success"')

$smokeText = Get-Content -LiteralPath $smokeScript -Raw
Assert-True "smoke verifies health/live" ($smokeText -match '/health/live')
Assert-True "smoke verifies health/ready" ($smokeText -match '/health/ready')
Assert-True "smoke verifies Landing page" ($smokeText -match 'Tafseel-Landing\.dc\.html')
Assert-True "smoke verifies auth/me 401" ($smokeText -match 'api/v1/auth/me')
Assert-True "smoke fails when ready never succeeds" ($smokeText -match 'Ready probe never succeeded')
Assert-True "smoke mentions manual migration on ready failure" ($smokeText -match 'idempotent SQL')

$deployWorkflow = Join-Path (Split-Path -Parent (Split-Path -Parent $repoCi)) ".github/workflows/deploy-staging.yml"
$gateWorkflow = Join-Path (Split-Path -Parent (Split-Path -Parent $repoCi)) ".github/workflows/staging-gate.yml"
Assert-True "deploy-staging workflow exists" (Test-Path -LiteralPath $deployWorkflow)
Assert-True "staging-gate workflow exists" (Test-Path -LiteralPath $gateWorkflow)

$deployText = Get-Content -LiteralPath $deployWorkflow -Raw
Assert-True "deploy uses workflow_run on Staging Gate" ($deployText -match 'workflows:\s*\[["'']Staging Gate["'']\]')
Assert-True "deploy keeps workflow_dispatch" ($deployText -match 'workflow_dispatch:')
Assert-True "automatic SHA uses workflow_run.head_sha" ($deployText -match 'workflow_run\.head_sha')
Assert-True "deploy does not use github.sha as deploy revision source" (
  $deployText -notmatch 'DEPLOY_SHA:\s*\$\{\{\s*github\.sha\s*\}\}'
)
Assert-True "deploy environment is staging" ($deployText -match 'environment:\s*staging')
Assert-True "deploy requests id-token write" ($deployText -match 'id-token:\s*write')
Assert-True "deploy requests contents read" ($deployText -match 'contents:\s*read')
Assert-True "deploy requests checks read" ($deployText -match 'checks:\s*read')
Assert-True "deploy rejects fork workflow_run heads" (
  $deployText -match 'head_repository\.full_name == github\.repository'
)
Assert-True "deploy defines resolved SHA output" ($deployText -match 'outputs:\s*\n\s+sha:\s*\$\{\{\s*steps\.revision\.outputs\.sha\s*\}\}')
Assert-True "deploy has staging-db-migrate job" ($deployText -match 'name:\s*staging-db-migrate')
Assert-True "deploy runs migrations before staging deploy" (
  $deployText -match 'name:\s*staging-db-migrate' -and
  $deployText -match 'needs:\s*\[resolve,\s*migrate\]'
)
Assert-True "deploy validates fixed staging database target" ($deployText -match 'EXPECTED_DATABASE_NAME:\s*tafseel-staging-db')
Assert-True "deploy keeps production manual elsewhere" ($deployText -notmatch 'environment:\s*production')
Assert-True "deploy concurrency cancels in progress" ($deployText -match 'cancel-in-progress:\s*true')

$gateText = Get-Content -LiteralPath $gateWorkflow -Raw
Assert-True "staging gate listens on main push" ($gateText -match 'branches:\s*\[main\]')
Assert-True "staging gate waits via shared script" ($gateText -match 'wait-for-required-checks\.sh')

Write-Host ""
Write-Host "Passed: $passed  Failed: $failed"
if ($failed -gt 0) { exit 1 }
exit 0
