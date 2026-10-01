<#
.SYNOPSIS
  Backup-and-restore drill for a Tafseel SQL Server database (REL-01, DATA-01).

.DESCRIPTION
  1. Fingerprints every user table in the source (row count + CHECKSUM_AGG(BINARY_CHECKSUM(*))) and the
     migration history.
  2. Takes a COPY_ONLY full backup WITH CHECKSUM, so it never disturbs the platform's own backup chain.
  3. RESTORE VERIFYONLY, then restores into a NEW database (never over the source).
  4. DBCC CHECKDB on the restored copy.
  5. Compares every fingerprint and the migration history; prints timings; drops the copy unless -KeepRestored.

  Runs against any SQL Server that allows BACKUP TO DISK (self-managed, VM, container, Azure SQL Managed Instance
  to a local path). Azure SQL Database has no BACKUP TO DISK: there, restore a point in time to a new database from
  the portal/CLI and run this script with -SkipBackup -RestoredDatabase <that database> to do steps 1, 4 and 5.

  Reads nothing sensitive into its output: table names, counts and checksums only. Authentication: Windows
  (default) or -SqlUser with the password in the SQLCMDPASSWORD environment variable.

.EXAMPLE
  ./scripts/ops/Test-TafseelBackupRestore.ps1 -Server localhost -Database TafseelStaging -BackupDirectory D:\drill
#>
param(
  [Parameter(Mandatory)] [string]$Server,
  [Parameter(Mandatory)] [string]$Database,
  [string]$BackupDirectory,
  [string]$RestoredDatabase = "",
  [string]$SqlUser = "",
  [string]$ReportPath = "",
  [switch]$SkipBackup,
  [switch]$KeepRestored
)
$ErrorActionPreference = "Stop"
if (-not $RestoredDatabase) { $RestoredDatabase = "${Database}_RestoreDrill_$(Get-Date -Format yyyyMMddHHmmss)" }
if ($RestoredDatabase -eq $Database) { throw "The restored database must be a new database, never the source." }
if (-not $SkipBackup -and -not $BackupDirectory) { throw "-BackupDirectory is required unless -SkipBackup." }

function Invoke-Sql([string]$Query, [string]$On = "master", [int]$Timeout = 0) {
  # An array, not splatting: a one-element if/else result unrolls to a plain string.
  [string[]]$arguments = @("-S", $Server) + $(if ($SqlUser) { @("-U", $SqlUser) } else { @("-E") }) +
    @("-C", "-b", "-I", "-d", $On, "-h", "-1", "-W", "-s", "|", "-t", "$Timeout", "-Q", "SET NOCOUNT ON; $Query")
  $output = & sqlcmd $arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on [$On]: $($output -join ' ')" }
  return @($output | Where-Object { $_ -and $_.Trim() })
}
function Quote([string]$name) { return "[" + $name.Replace("]", "]]") + "]" }
function Literal([string]$value) { return "N'" + $value.Replace("'", "''") + "'" }

function Get-Fingerprint([string]$On) {
  $tables = Invoke-Sql "SELECT s.name + '.' + t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE t.is_ms_shipped = 0 ORDER BY 1" $On
  $result = [ordered]@{}
  foreach ($table in $tables) {
    $schema, $name = $table.Split('.', 2)
    $row = @(Invoke-Sql "SELECT COUNT_BIG(*), ISNULL(CHECKSUM_AGG(BINARY_CHECKSUM(*)), 0) FROM $(Quote $schema).$(Quote $name)" $On)
    $result[$table] = $row[0]
  }
  return $result
}

$timings = [ordered]@{}
$clock = [Diagnostics.Stopwatch]::StartNew()
if (@(Invoke-Sql "SELECT COUNT(*) FROM sys.databases WHERE name = $(Literal $RestoredDatabase)")[0] -ne "0" -and -not $SkipBackup) {
  throw "Database '$RestoredDatabase' already exists; choose another -RestoredDatabase."
}

Write-Output "Fingerprinting [$Database]..."
$source = Get-Fingerprint $Database
$sourceHistory = (Invoke-Sql "SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId" $Database) -join ","
$timings["fingerprint source"] = $clock.Elapsed.TotalSeconds

$backupFile = $null
if (-not $SkipBackup) {
  New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
  $backupFile = Join-Path (Resolve-Path $BackupDirectory) "$Database-$(Get-Date -Format yyyyMMddHHmmss).bak"
  $start = $clock.Elapsed.TotalSeconds
  Invoke-Sql "BACKUP DATABASE $(Quote $Database) TO DISK = $(Literal $backupFile) WITH COPY_ONLY, CHECKSUM, INIT, STATS = 50" | Out-Null
  $timings["backup"] = $clock.Elapsed.TotalSeconds - $start

  $start = $clock.Elapsed.TotalSeconds
  Invoke-Sql "RESTORE VERIFYONLY FROM DISK = $(Literal $backupFile) WITH CHECKSUM" | Out-Null
  $timings["verify backup"] = $clock.Elapsed.TotalSeconds - $start

  $dataPath = @(Invoke-Sql "SELECT CAST(SERVERPROPERTY('InstanceDefaultDataPath') AS nvarchar(400))")[0]
  $logPath = @(Invoke-Sql "SELECT CAST(SERVERPROPERTY('InstanceDefaultLogPath') AS nvarchar(400))")[0]
  $files = Invoke-Sql "RESTORE FILELISTONLY FROM DISK = $(Literal $backupFile)"
  $moves = foreach ($line in $files) {
    $parts = $line.Split('|')
    $logical, $type = $parts[0], $parts[2]
    $folder = if ($type -eq "L") { $logPath } else { $dataPath }
    $extension = if ($type -eq "L") { "ldf" } else { "mdf" }
    "MOVE $(Literal $logical) TO $(Literal (Join-Path $folder "$RestoredDatabase-$logical.$extension"))"
  }
  $start = $clock.Elapsed.TotalSeconds
  Invoke-Sql "RESTORE DATABASE $(Quote $RestoredDatabase) FROM DISK = $(Literal $backupFile) WITH $($moves -join ', '), CHECKSUM, RECOVERY, STATS = 50" | Out-Null
  $timings["restore"] = $clock.Elapsed.TotalSeconds - $start
}

$start = $clock.Elapsed.TotalSeconds
Invoke-Sql "DBCC CHECKDB ($(Quote $RestoredDatabase)) WITH NO_INFOMSGS, ALL_ERRORMSGS" | Out-Null
$timings["DBCC CHECKDB"] = $clock.Elapsed.TotalSeconds - $start

$start = $clock.Elapsed.TotalSeconds
$restored = Get-Fingerprint $RestoredDatabase
$restoredHistory = (Invoke-Sql "SELECT MigrationId FROM __EFMigrationsHistory ORDER BY MigrationId" $RestoredDatabase) -join ","
$timings["fingerprint restored"] = $clock.Elapsed.TotalSeconds - $start

$differences = @()
foreach ($table in ($source.Keys + $restored.Keys | Sort-Object -Unique)) {
  if ($source[$table] -ne $restored[$table]) { $differences += "$table source=$($source[$table]) restored=$($restored[$table])" }
}
if ($sourceHistory -ne $restoredHistory) { $differences += "__EFMigrationsHistory differs" }
# The backup folder usually belongs to the SQL Server service account, so its size comes from msdb.
$backupMb = if ($backupFile) { @(Invoke-Sql "SELECT TOP 1 CAST(backup_size / 1048576.0 AS decimal(12,1)) FROM msdb.dbo.backupset WHERE database_name = $(Literal $Database) ORDER BY backup_finish_date DESC")[0] } else { $null }
$rows = ($source.Values | ForEach-Object { [long]($_.Split('|')[0]) } | Measure-Object -Sum).Sum

$report = @(
  "# Tafseel backup/restore drill"
  ""
  "- When (UTC): $([DateTimeOffset]::UtcNow.ToString('u'))"
  "- Server: $Server; source: $Database; restored: $RestoredDatabase"
  "- Backup: $(if ($backupFile) { "$backupFile ($backupMb MB, COPY_ONLY, CHECKSUM)" } else { 'skipped (platform restore)' })"
  "- Tables compared: $($source.Count); rows: $rows; migrations: $(($sourceHistory -split ',').Count)"
  "- DBCC CHECKDB: clean"
  "- Result: $(if ($differences.Count -eq 0) { 'PASS - every table count and checksum and the migration history match' } else { 'FAIL' })"
  ""
  "| Step | Seconds |"
  "|---|---:|"
) + ($timings.GetEnumerator() | ForEach-Object { "| $($_.Key) | $([math]::Round($_.Value, 1)) |" }) + $(if ($differences) { @("", "Differences:") + $differences } else { @() })
$report | ForEach-Object { Write-Output $_ }
if ($ReportPath) { $report | Set-Content -Path $ReportPath -Encoding UTF8 }

if (-not $KeepRestored -and -not $SkipBackup) {
  Invoke-Sql "ALTER DATABASE $(Quote $RestoredDatabase) SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE $(Quote $RestoredDatabase);" | Out-Null
  Write-Output "Dropped the restored copy [$RestoredDatabase]."
}
if ($differences.Count -gt 0) { exit 1 }
