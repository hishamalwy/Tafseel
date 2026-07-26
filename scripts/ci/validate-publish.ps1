param([string]$PublishDirectory = "artifacts/publish")
$ErrorActionPreference = "Stop"
$required = @(
  "Tafseel.Api.dll",
  "frontend/Tafseel-Landing.dc.html",
  "frontend/Tafseel-Auth.dc.html",
  "frontend/Tafseel-Teacher-Apply.dc.html",
  "frontend/Tafseel-Chat.dc.html",
  "frontend/js/api.js",
  "frontend/css/tafseel.css"
)
$missing = $required | Where-Object { -not (Test-Path (Join-Path $PublishDirectory $_)) }
if ($missing) { throw "Publish output is missing: $($missing -join ', ')" }
if (Test-Path (Join-Path $PublishDirectory "src")) { throw "Source files leaked into publish output." }
Write-Output "Publish smoke validation passed."
