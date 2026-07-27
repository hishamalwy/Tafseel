<#
.SYNOPSIS
  Fail-closed migration safety gate with context-aware Up()/Down() analysis.

.DESCRIPTION
  Scans EF Core C# migration sources (or raw SQL scripts). Operations inside Down()
  are classified as rollback-only and do not block forward deployment.

  Manual approval is narrow: scripts/ci/migration-safety-approvals.json must name the
  exact migration id and exact operation key. There is no global approve-all.

.PARAMETER Script
  Path to a Migration *.cs file or generated SQL script.

.PARAMETER ApprovalsPath
  Optional path to the approvals JSON document.
#>
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [string]$ApprovalsPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $Script)) {
  throw "Migration script not found: $Script"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ApprovalsPath)) {
  $ApprovalsPath = Join-Path $scriptRoot "migration-safety-approvals.json"
}

function Get-ApprovedOperations {
  param([string]$Path, [string]$MigrationId)
  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }
  $raw = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @()
  }
  $doc = $raw | ConvertFrom-Json
  if ($null -eq $doc.approvals) {
    return @()
  }
  $ops = @()
  foreach ($entry in @($doc.approvals)) {
    if ($entry.migration -eq $MigrationId) {
      foreach ($op in @($entry.operations)) {
        if (-not [string]::IsNullOrWhiteSpace([string]$op)) {
          $ops += [string]$op
        }
      }
    }
  }
  return $ops
}

function Get-MigrationId {
  param([string]$Path, [string]$Content)
  $leaf = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  if ($leaf -match '^(?<id>\d{14}_[A-Za-z0-9_]+)$') {
    return $Matches['id']
  }
  if ($Content -match '\[Migration\("(?<id>[^"]+)"\)\]') {
    return $Matches['id']
  }
  return $leaf
}

function Get-MethodBody {
  param([string]$Content, [string]$MethodName)
  $pattern = "(?s)protected\s+override\s+void\s+$MethodName\s*\(\s*MigrationBuilder\s+migrationBuilder\s*\)\s*\{"
  $match = [regex]::Match($Content, $pattern)
  if (-not $match.Success) {
    return $null
  }
  $start = $match.Index + $match.Length
  $depth = 1
  for ($i = $start; $i -lt $Content.Length; $i++) {
    $ch = $Content[$i]
    if ($ch -eq '{') { $depth++ }
    elseif ($ch -eq '}') {
      $depth--
      if ($depth -eq 0) {
        return $Content.Substring($start, $i - $start)
      }
    }
  }
  return $null
}

function New-Finding {
  param(
    [string]$Classification,
    [string]$Severity,
    [string]$OperationKey,
    [int]$LineNumber,
    [string]$Detail,
    [string]$Phase
  )
  [pscustomobject]@{
    Classification = $Classification
    Severity       = $Severity
    OperationKey   = $OperationKey
    LineNumber     = $LineNumber
    Detail         = $Detail
    Phase          = $Phase
  }
}

function Get-LineNumber {
  param([string]$FullContent, [string]$Snippet)
  if ([string]::IsNullOrWhiteSpace($Snippet)) { return 1 }
  $idx = $FullContent.IndexOf($Snippet)
  if ($idx -lt 0) { return 1 }
  return ($FullContent.Substring(0, $idx) -split "`n").Count
}

function Get-NameArgument {
  param([string]$Block)
  if ($Block -match '(?m)^\s*name:\s*"(?<n>[^"]+)"') {
    return $Matches['n']
  }
  if ($Block -match '\(\s*name:\s*"(?<n>[^"]+)"') {
    return $Matches['n']
  }
  return "unknown"
}

function Get-TableArgument {
  param([string]$Block)
  if ($Block -match '(?m)^\s*table:\s*"(?<t>[^"]+)"') {
    return $Matches['t']
  }
  return "unknown"
}

function Get-CallBlocks {
  param([string]$Body, [string]$Method)
  $pattern = "(?s)\bmigrationBuilder\.$Method\s*(?:<[^>]+>)?\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*;"
  return [regex]::Matches($Body, $pattern)
}

function Test-PrecedingSql {
  param([string]$Body, [int]$Offset)
  $before = $Body.Substring(0, [Math]::Max(0, $Offset))
  return $before -match 'migrationBuilder\.Sql\s*\('
}

function Analyze-CsharpUp {
  param([string]$UpBody, [string]$FullContent)

  $findings = @()
  if ([string]::IsNullOrWhiteSpace($UpBody)) {
    return $findings
  }

  $droppedIndexes = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $createdIndexes = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $droppedFks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $addedFks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $droppedChecks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $addedChecks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $droppedPks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $addedPks = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DropIndex')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$droppedIndexes.Add($name)
    $findings += New-Finding -Classification 'Safe Index Maintenance' -Severity 'Allow' `
      -OperationKey ("DropIndex:{0}" -f $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "DropIndex '$name' in Up (paired recreation evaluated later)." -Phase 'Up'
  }
  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'CreateIndex')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$createdIndexes.Add($name)
    $findings += New-Finding -Classification 'Safe Additive Change' -Severity 'Allow' `
      -OperationKey ("CreateIndex:{0}" -f $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "CreateIndex '$name'." -Phase 'Up'
  }
  foreach ($name in $droppedIndexes) {
    if (-not $createdIndexes.Contains($name)) {
      $findings += New-Finding -Classification 'Schema Lock/Risk' -Severity 'Warn' `
        -OperationKey ("DropIndexUnpaired:{0}" -f $name) -LineNumber 0 `
        -Detail "DropIndex '$name' without CreateIndex of the same name in Up (availability/plan change, not data loss)." -Phase 'Up'
    }
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DropForeignKey')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$droppedFks.Add($name)
  }
  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'AddForeignKey')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$addedFks.Add($name)
    $findings += New-Finding -Classification 'Safe Constraint Maintenance' -Severity 'Allow' `
      -OperationKey ("AddForeignKey:{0}" -f $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "AddForeignKey '$name'." -Phase 'Up'
  }
  foreach ($name in $droppedFks) {
    if ($addedFks.Contains($name)) {
      $findings += New-Finding -Classification 'Safe Constraint Maintenance' -Severity 'Allow' `
        -OperationKey ("DropForeignKey:{0}" -f $name) -LineNumber 0 `
        -Detail "DropForeignKey '$name' paired with AddForeignKey in Up." -Phase 'Up'
    }
    else {
      $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
        -OperationKey ("DropForeignKey:{0}" -f $name) -LineNumber 0 `
        -Detail "DropForeignKey '$name' without recreation in Up can orphan or invalidate references." -Phase 'Up'
    }
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DropCheckConstraint')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$droppedChecks.Add($name)
  }
  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'AddCheckConstraint')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$addedChecks.Add($name)
    $findings += New-Finding -Classification 'Safe Constraint Maintenance' -Severity 'Allow' `
      -OperationKey ("AddCheckConstraint:{0}" -f $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "AddCheckConstraint '$name'." -Phase 'Up'
  }
  foreach ($name in $droppedChecks) {
    if ($addedChecks.Contains($name)) {
      $findings += New-Finding -Classification 'Safe Constraint Maintenance' -Severity 'Allow' `
        -OperationKey ("DropCheckConstraint:{0}" -f $name) -LineNumber 0 `
        -Detail "DropCheckConstraint '$name' paired with AddCheckConstraint in Up." -Phase 'Up'
    }
    else {
      $findings += New-Finding -Classification 'Safe Constraint Maintenance' -Severity 'Warn' `
        -OperationKey ("DropCheckConstraint:{0}" -f $name) -LineNumber 0 `
        -Detail "DropCheckConstraint '$name' without replacement (constraint removal, not row deletion)." -Phase 'Up'
    }
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DropPrimaryKey')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$droppedPks.Add($name)
  }
  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'AddPrimaryKey')) {
    $name = Get-NameArgument -Block $m.Value
    [void]$addedPks.Add($name)
  }
  foreach ($name in $droppedPks) {
    if ($addedPks.Contains($name) -or $addedPks.Count -gt 0) {
      $findings += New-Finding -Classification 'Schema Lock/Risk' -Severity 'Warn' `
        -OperationKey ("DropPrimaryKey:{0}" -f $name) -LineNumber 0 `
        -Detail "DropPrimaryKey '$name' with recreation in Up (lock/availability risk)." -Phase 'Up'
    }
    else {
      $findings += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
        -OperationKey ("DropPrimaryKey:{0}" -f $name) -LineNumber 0 `
        -Detail "DropPrimaryKey '$name' without recreation in Up." -Phase 'Up'
    }
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DropTable')) {
    $name = Get-NameArgument -Block $m.Value
    $findings += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey ("DropTable:{0}" -f $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "DropTable '$name' removes table data." -Phase 'Up'
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DropColumn')) {
    $name = Get-NameArgument -Block $m.Value
    $table = Get-TableArgument -Block $m.Value
    $findings += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey ("DropColumn:{0}.{1}" -f $table, $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "DropColumn '$table.$name' permanently discards column data." -Phase 'Up'
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'RenameColumn')) {
    $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
      -OperationKey ("RenameColumn:{0}" -f (Get-NameArgument -Block $m.Value)) `
      -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "RenameColumn without proven compatibility requires explicit approval." -Phase 'Up'
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'RenameTable')) {
    $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
      -OperationKey ("RenameTable:{0}" -f (Get-NameArgument -Block $m.Value)) `
      -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "RenameTable requires explicit approval." -Phase 'Up'
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'DeleteData')) {
    $table = Get-TableArgument -Block $m.Value
    $findings += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey ("DeleteData:{0}" -f $table) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "DeleteData on '$table' removes rows." -Phase 'Up'
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'AlterColumn')) {
    $block = $m.Value
    $name = Get-NameArgument -Block $block
    $table = Get-TableArgument -Block $block
    $line = Get-LineNumber $FullContent $block
    $keyBase = "AlterColumn:{0}.{1}" -f $table, $name

    $nullableTrue = $block -match '(?m)^\s*nullable:\s*true\b'
    $nullableFalse = $block -match '(?m)^\s*nullable:\s*false\b'
    $oldNullableTrue = $block -match '(?m)^\s*oldNullable:\s*true\b'
    $oldNullableFalse = $block -match '(?m)^\s*oldNullable:\s*false\b'

    $maxLength = $null
    $oldMaxLength = $null
    if ($block -match '(?m)^\s*maxLength:\s*(?<v>\d+)') { $maxLength = [int]$Matches['v'] }
    if ($block -match '(?m)^\s*oldMaxLength:\s*(?<v>\d+)') { $oldMaxLength = [int]$Matches['v'] }

    $type = $null
    $oldType = $null
    if ($block -match '(?m)^\s*type:\s*"(?<v>[^"]+)"') { $type = $Matches['v'] }
    if ($block -match '(?m)^\s*oldType:\s*"(?<v>[^"]+)"') { $oldType = $Matches['v'] }

    $precision = $null
    $oldPrecision = $null
    $scale = $null
    $oldScale = $null
    if ($block -match '(?m)^\s*precision:\s*(?<v>\d+)') { $precision = [int]$Matches['v'] }
    if ($block -match '(?m)^\s*oldPrecision:\s*(?<v>\d+)') { $oldPrecision = [int]$Matches['v'] }
    if ($block -match '(?m)^\s*scale:\s*(?<v>\d+)') { $scale = [int]$Matches['v'] }
    if ($block -match '(?m)^\s*oldScale:\s*(?<v>\d+)') { $oldScale = [int]$Matches['v'] }

    $blocked = $false

    if ($nullableFalse -and $oldNullableTrue) {
      $hasSql = Test-PrecedingSql -Body $UpBody -Offset $m.Index
      if ($hasSql) {
        $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Warn' `
          -OperationKey ("${keyBase}:nullable-to-required") -LineNumber $line `
          -Detail "AlterColumn $table.$name nullable-to-required with preceding Sql(); verify backfill/validation before deploy." -Phase 'Up'
      }
      else {
        $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
          -OperationKey ("${keyBase}:nullable-to-required") -LineNumber $line `
          -Detail "AlterColumn $table.$name nullable-to-required without preceding Sql backfill/validation." -Phase 'Up'
        $blocked = $true
      }
    }
    elseif ($nullableTrue -and (-not $oldNullableTrue)) {
      # required -> nullable (or unspecified old nullability with nullable:true): widening, safe
      $findings += New-Finding -Classification 'Safe Additive Change' -Severity 'Allow' `
        -OperationKey ("${keyBase}:required-to-nullable") -LineNumber $line `
        -Detail "AlterColumn $table.$name required-to-nullable (widening)." -Phase 'Up'
    }

    if ($null -ne $maxLength -and $null -ne $oldMaxLength -and $maxLength -lt $oldMaxLength) {
      $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
        -OperationKey ("${keyBase}:length-narrowing") -LineNumber $line `
        -Detail "AlterColumn $table.$name shortens maxLength from $oldMaxLength to $maxLength." -Phase 'Up'
      $blocked = $true
    }

    if ($null -ne $precision -and $null -ne $oldPrecision -and $precision -lt $oldPrecision) {
      $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
        -OperationKey ("${keyBase}:precision-narrowing") -LineNumber $line `
        -Detail "AlterColumn $table.$name reduces precision." -Phase 'Up'
      $blocked = $true
    }
    if ($null -ne $scale -and $null -ne $oldScale -and $scale -lt $oldScale) {
      $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
        -OperationKey ("${keyBase}:scale-narrowing") -LineNumber $line `
        -Detail "AlterColumn $table.$name reduces scale." -Phase 'Up'
      $blocked = $true
    }

    if ($null -ne $type -and $null -ne $oldType -and -not [string]::Equals($type, $oldType, [StringComparison]::OrdinalIgnoreCase)) {
      $findings += New-Finding -Classification 'Potentially Data Destructive' -Severity 'Block' `
        -OperationKey ("${keyBase}:type-change") -LineNumber $line `
        -Detail "AlterColumn $table.$name changes type from '$oldType' to '$type'." -Phase 'Up'
      $blocked = $true
    }

    if (-not $blocked -and -not ($nullableTrue -and (-not $oldNullableTrue)) -and -not ($nullableFalse -and $oldNullableTrue)) {
      $findings += New-Finding -Classification 'Safe Additive Change' -Severity 'Allow' `
        -OperationKey $keyBase -LineNumber $line `
        -Detail "AlterColumn $table.$name (non-destructive shape)." -Phase 'Up'
    }

    # Silence unused variable warnings under StrictMode for optional flags
    $null = $oldNullableFalse
  }

  foreach ($m in (Get-CallBlocks -Body $UpBody -Method 'AddColumn')) {
    $name = Get-NameArgument -Block $m.Value
    $table = Get-TableArgument -Block $m.Value
    $findings += New-Finding -Classification 'Safe Additive Change' -Severity 'Allow' `
      -OperationKey ("AddColumn:{0}.{1}" -f $table, $name) -LineNumber (Get-LineNumber $FullContent $m.Value) `
      -Detail "AddColumn $table.$name." -Phase 'Up'
  }

  # Raw SQL inside Up
  foreach ($m in [regex]::Matches($UpBody, '(?is)migrationBuilder\.Sql\s*\(\s*(?:@"(?<sql>.*?)"|(?<q>"+)(?<sql>.*?)\k<q>|"""(?<sql>.*?)""")\s*\)')) {
    $sql = $m.Groups['sql'].Value
    $line = Get-LineNumber $FullContent $m.Value
    Analyze-SqlText -Sql $sql -LineNumber $line -Phase 'Up' -Findings ([ref]$findings)
  }

  return $findings
}

function Analyze-CsharpDown {
  param([string]$DownBody, [string]$FullContent)
  $findings = @()
  if ([string]::IsNullOrWhiteSpace($DownBody)) {
    return $findings
  }
  $ops = @('DropTable', 'DropColumn', 'DropForeignKey', 'DropPrimaryKey', 'DropCheckConstraint', 'DropIndex', 'AlterColumn', 'DeleteData')
  foreach ($op in $ops) {
    foreach ($m in (Get-CallBlocks -Body $DownBody -Method $op)) {
      $findings += New-Finding -Classification 'Rollback-Only Destructive Operation' -Severity 'Allow' `
        -OperationKey ("Down:{0}" -f $op) -LineNumber (Get-LineNumber $FullContent $m.Value) `
        -Detail "Down() $op does not block forward deployment." -Phase 'Down'
    }
  }
  return $findings
}

function Analyze-SqlText {
  param(
    [string]$Sql,
    [int]$LineNumber,
    [string]$Phase,
    [ref]$Findings
  )
  if ([string]::IsNullOrWhiteSpace($Sql)) { return }

  if ($Sql -match '(?im)^\s*DROP\s+TABLE\b' -or $Sql -match '(?im)\bDROP\s+TABLE\b') {
    $Findings.Value += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey 'SqlDropTable' -LineNumber $LineNumber `
      -Detail 'Raw SQL DROP TABLE detected.' -Phase $Phase
  }
  if ($Sql -match '(?im)ALTER\s+TABLE\b[\s\S]{0,200}\bDROP\s+COLUMN\b') {
    $Findings.Value += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey 'SqlDropColumn' -LineNumber $LineNumber `
      -Detail 'Raw SQL DROP COLUMN detected.' -Phase $Phase
  }
  if ($Sql -match '(?im)^\s*TRUNCATE\s+TABLE\b' -or $Sql -match '(?im)\bTRUNCATE\s+TABLE\b') {
    $Findings.Value += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey 'SqlTruncate' -LineNumber $LineNumber `
      -Detail 'Raw SQL TRUNCATE TABLE detected.' -Phase $Phase
  }
  if ($Sql -match '(?im)^\s*DELETE\s+FROM\b' -or $Sql -match '(?im)\bDELETE\s+FROM\b') {
    $Findings.Value += New-Finding -Classification 'Data Destructive' -Severity 'Block' `
      -OperationKey 'SqlDelete' -LineNumber $LineNumber `
      -Detail 'Raw SQL DELETE detected (requires explicit approval).' -Phase $Phase
  }
  if ($Sql -match '(?im)^\s*DROP\s+INDEX\b') {
    $Findings.Value += New-Finding -Classification 'Safe Index Maintenance' -Severity 'Allow' `
      -OperationKey 'SqlDropIndex' -LineNumber $LineNumber `
      -Detail 'Raw SQL DROP INDEX (not data loss).' -Phase $Phase
  }
  if ($Sql -match '(?im)^\s*DROP\s+CONSTRAINT\b') {
    $Findings.Value += New-Finding -Classification 'Safe Constraint Maintenance' -Severity 'Allow' `
      -OperationKey 'SqlDropConstraint' -LineNumber $LineNumber `
      -Detail 'Raw SQL DROP CONSTRAINT (not row deletion).' -Phase $Phase
  }
  if ($Sql -match '(?im)\bUPDATE\b') {
    $Findings.Value += New-Finding -Classification 'Safe Additive Change' -Severity 'Allow' `
      -OperationKey 'SqlUpdate' -LineNumber $LineNumber `
      -Detail 'Raw SQL UPDATE (backfill/maintenance).' -Phase $Phase
  }
}

function Analyze-SqlFile {
  param([string]$Content)
  $findings = @()
  Analyze-SqlText -Sql $Content -LineNumber 1 -Phase 'Sql' -Findings ([ref]$findings)
  # Idempotent EF scripts emit DROP COLUMN/TABLE for Down paths inside conditional blocks.
  # Treat DROP INDEX as allow; DROP TABLE/COLUMN/TRUNCATE/DELETE remain block unless approved.
  return $findings
}

# --- main ---
$content = Get-Content -LiteralPath $Script -Raw
$migrationId = Get-MigrationId -Path $Script -Content $content
$approved = @(Get-ApprovedOperations -Path $ApprovalsPath -MigrationId $migrationId)

$findings = @()
$isCsharp = $Script -match '\.cs$'
if ($isCsharp) {
  $up = Get-MethodBody -Content $content -MethodName 'Up'
  $down = Get-MethodBody -Content $content -MethodName 'Down'
  if ($null -eq $up -and $null -eq $down) {
    # Designer or unexpected shape: fall back to whole-file scan excluding Down if possible
    $findings += Analyze-CsharpUp -UpBody $content -FullContent $content
  }
  else {
    if ($null -ne $up) {
      $findings += Analyze-CsharpUp -UpBody $up -FullContent $content
    }
    if ($null -ne $down) {
      $findings += Analyze-CsharpDown -DownBody $down -FullContent $content
    }
  }
}
else {
  $findings += Analyze-SqlFile -Content $content
}

$blocked = @()
$warned = @()
$allowed = @()
$approvedUsed = @()

foreach ($f in $findings) {
  if ($f.Severity -eq 'Block') {
    if ($approved -contains $f.OperationKey) {
      $approvedUsed += $f
      Write-Output ("APPROVED [{0}] {1} (line {2}): {3}" -f $f.Classification, $f.OperationKey, $f.LineNumber, $f.Detail)
    }
    else {
      $blocked += $f
    }
  }
  elseif ($f.Severity -eq 'Warn') {
    $warned += $f
    Write-Warning ("[{0}] {1}: {2}" -f $f.Classification, $f.OperationKey, $f.Detail)
  }
  else {
    $allowed += $f
  }
}

if ($approvedUsed.Count -gt 0) {
  Write-Output ("Recorded manual approvals for migration '{0}': {1}" -f $migrationId, (($approvedUsed | ForEach-Object OperationKey) -join ', '))
}

if ($blocked.Count -gt 0) {
  foreach ($f in $blocked) {
    $msg = "Manual migration approval required for '{0}' at line {1}: {2} [{3}] - add operation '{4}' under migration '{0}' in migration-safety-approvals.json" -f `
      $migrationId, $f.LineNumber, $f.Detail, $f.Classification, $f.OperationKey
    Write-Host $msg
  }
  exit 2
}

$summary = "Migration safety OK for '{0}': {1} allowed, {2} warnings, {3} approved exceptions." -f `
  $migrationId, $allowed.Count, $warned.Count, $approvedUsed.Count
Write-Output $summary
exit 0
