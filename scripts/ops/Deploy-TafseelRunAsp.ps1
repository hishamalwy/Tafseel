param(
  [Parameter(Mandatory = $true)][string]$PublishDirectory,
  [string]$SiteRoot = "D:\Sites\site84355\wwwroot",
  [string]$BackupRoot = "D:\Sites\site84355\releases",
  [string]$HealthUrl = "http://tafseel.runasp.net/health/ready"
)

$ErrorActionPreference = "Stop"

function Resolve-Directory([string]$Path, [switch]$Create) {
  if ($Create -and -not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
  (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\')
}

function Copy-Tree([string]$Source, [string]$Destination, [string[]]$ExtraArgs) {
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  & robocopy $Source $Destination /E /R:2 /W:2 /COPY:DAT /DCOPY:DAT /NFL /NDL /NJH /NJS @ExtraArgs
  if ($LASTEXITCODE -gt 7) { throw "Robocopy failed with exit code $LASTEXITCODE." }
}

$publish = Resolve-Directory $PublishDirectory
$site = Resolve-Directory $SiteRoot
$backupBase = Resolve-Directory $BackupRoot -Create

if ($site.Length -le 3 -or $site -eq [IO.Path]::GetPathRoot($site)) { throw "SiteRoot is too broad." }
if ($backupBase.StartsWith($site + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "BackupRoot must be outside SiteRoot."
}
foreach ($required in @('Tafseel.Api.dll', 'web.config', 'webclient\ar\index.csr.html', 'webclient\en\index.csr.html')) {
  if (-not (Test-Path -LiteralPath (Join-Path $publish $required))) { throw "Publish output is missing $required." }
}
if (-not (Test-Path -LiteralPath (Join-Path $site 'appsettings.Staging.Host.json'))) {
  throw "The server-owned appsettings.Staging.Host.json is missing; deployment stopped."
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $backupBase "app-$stamp"
$offline = Join-Path $site 'app_offline.htm'
$copyExclusions = @('/XD', (Join-Path $site 'App_Data'), '/XF', 'appsettings.*.Host.json', 'app_offline.htm')

Copy-Tree $site $backup $copyExclusions
Set-Content -LiteralPath $offline -Encoding UTF8 -Value '<!doctype html><title>Tafseel maintenance</title><h1>Maintenance in progress</h1>'

try {
  Copy-Tree $publish $site @('/XD', (Join-Path $publish 'App_Data'), '/XF', 'appsettings.*.Host.json', 'app_offline.htm')
  Remove-Item -LiteralPath $offline -Force

  $healthy = $false
  foreach ($attempt in 1..12) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 10
      if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 5 }
  }
  if (-not $healthy) { throw "Readiness probe failed after deployment." }
  Write-Output "Deployment healthy. Rollback snapshot: $backup"
} catch {
  Set-Content -LiteralPath $offline -Encoding UTF8 -Value '<!doctype html><title>Tafseel maintenance</title><h1>Rolling back</h1>'
  Copy-Tree $backup $site @('/XD', (Join-Path $backup 'App_Data'), '/XF', 'appsettings.*.Host.json', 'app_offline.htm')
  Remove-Item -LiteralPath $offline -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item -LiteralPath $offline -Force -ErrorAction SilentlyContinue
}
