param(
  [string]$SiteRoot = "D:\Sites\site84355\wwwroot",
  [string]$BackupRoot = "D:\Sites\site84355\recovery"
)

$ErrorActionPreference = "Stop"
$site = (Resolve-Path -LiteralPath $SiteRoot).Path.TrimEnd('\')
$data = Join-Path $site 'App_Data'
if ($site.Length -le 3 -or -not (Test-Path -LiteralPath $data)) { throw "A valid Tafseel SiteRoot is required." }
if (-not (Test-Path -LiteralPath $BackupRoot)) { New-Item -ItemType Directory -Path $BackupRoot | Out-Null }
$backupBase = (Resolve-Path -LiteralPath $BackupRoot).Path.TrimEnd('\')
if ($backupBase.StartsWith($site + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "BackupRoot must be outside SiteRoot."
}

$destination = Join-Path $backupBase (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $destination | Out-Null
& robocopy $data (Join-Path $destination 'App_Data') /E /R:2 /W:2 /COPY:DAT /DCOPY:DAT /XD (Join-Path $data 'logs') /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "Recovery snapshot failed with robocopy exit code $LASTEXITCODE." }

$files = Get-ChildItem -LiteralPath (Join-Path $destination 'App_Data') -File -Recurse
@(
  "CreatedUtc=$([DateTimeOffset]::UtcNow.ToString('O'))"
  "Source=$data"
  "FileCount=$($files.Count)"
  "Includes=DataProtection keys and private uploaded files"
  "Excludes=logs and database"
) | Set-Content -LiteralPath (Join-Path $destination 'manifest.txt') -Encoding UTF8
Write-Output "Recovery snapshot created: $destination"
