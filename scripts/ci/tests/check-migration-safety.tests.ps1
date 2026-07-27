<#
.SYNOPSIS
  Portable (Pester-free) tests for check-migration-safety.ps1.
  Compatible with Windows PowerShell 5.1+ and PowerShell 7 on Linux runners.
#>
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoCi = Split-Path -Parent $here
$checker = Join-Path $repoCi "check-migration-safety.ps1"
$fixtures = Join-Path $here "fixtures/migration-safety"
$emptyApprovals = Join-Path $repoCi "migration-safety-approvals.json"

if (-not (Test-Path -LiteralPath $checker)) {
  throw "Missing checker: $checker"
}

$failed = 0
$passed = 0

function Invoke-Checker {
  param(
    [string]$ScriptPath,
    [string]$ApprovalsPath
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $checker -Script $ScriptPath -ApprovalsPath $ApprovalsPath 2>&1
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
  }
  catch {
    $output = @($_.Exception.Message)
    $code = 2
  }
  finally {
    $ErrorActionPreference = $prev
  }
  [pscustomobject]@{
    ExitCode = [int]$code
    Output   = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  }
}

function Assert-Exit {
  param(
    [string]$Name,
    [string]$ScriptPath,
    [string]$ApprovalsPath,
    [int]$ExpectedExit
  )
  $result = Invoke-Checker -ScriptPath $ScriptPath -ApprovalsPath $ApprovalsPath
  if ($result.ExitCode -ne $ExpectedExit) {
    Write-Host "FAIL: $Name (exit $($result.ExitCode), expected $ExpectedExit)"
    Write-Host $result.Output
    $script:failed++
  }
  else {
    Write-Host "PASS: $Name"
    $script:passed++
  }
}

# Allowed fixtures
Assert-Exit -Name "Allowed DropIndex recreate" `
  -ScriptPath (Join-Path $fixtures "Allowed_DropIndexRecreate.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 0

Assert-Exit -Name "Allowed required-to-nullable AlterColumn and Down drops" `
  -ScriptPath (Join-Path $fixtures "Allowed_RequiredToNullable.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 0

Assert-Exit -Name "Allowed AddColumn index check and Sql UPDATE" `
  -ScriptPath (Join-Path $fixtures "Allowed_AddColumnAndChecks.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 0

# Blocked fixtures
Assert-Exit -Name "Blocked DropColumn in Up" `
  -ScriptPath (Join-Path $fixtures "Blocked_DropColumn.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 2

Assert-Exit -Name "Blocked DropTable in Up" `
  -ScriptPath (Join-Path $fixtures "Blocked_DropTable.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 2

Assert-Exit -Name "Blocked nullable-to-required without backfill Sql" `
  -ScriptPath (Join-Path $fixtures "Blocked_NullableToRequired.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 2

Assert-Exit -Name "Blocked Sql TRUNCATE" `
  -ScriptPath (Join-Path $fixtures "Blocked_SqlTruncate.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 2

# Approval fixture: blocked without approval, allowed with narrow approval
Assert-Exit -Name "Approval required without marker" `
  -ScriptPath (Join-Path $fixtures "Approval_DropColumn.cs") `
  -ApprovalsPath $emptyApprovals -ExpectedExit 2

Assert-Exit -Name "Approval accepted for exact operation" `
  -ScriptPath (Join-Path $fixtures "Approval_DropColumn.cs") `
  -ApprovalsPath (Join-Path $fixtures "approvals/Approval_DropColumn.json") `
  -ExpectedExit 0

Write-Host ""
Write-Host "Migration safety tests: $passed passed, $failed failed."
if ($failed -gt 0) { exit 1 }
exit 0
