param([string]$PublishDirectory = "artifacts/publish")
$ErrorActionPreference = "Stop"
$required = @(
  "Tafseel.Api.dll",
  "frontend/Tafseel-Landing.dc.html",
  "frontend/Tafseel-Auth.dc.html",
  "frontend/Tafseel-Teacher-Apply.dc.html",
  "frontend/Tafseel-Chat.dc.html",
  "frontend/js/api.js",
  "frontend/js/vendor/react.production.min.js",
  "frontend/js/vendor/react-dom.production.min.js",
  "frontend/js/vendor/babel.min.js",
  "frontend/css/tafseel.css"
)
$missing = $required | Where-Object { -not (Test-Path (Join-Path $PublishDirectory $_)) }
if ($missing) { throw "Publish output is missing: $($missing -join ', ')" }
$support = Get-Content (Join-Path $PublishDirectory "frontend/support.js") -Raw
if ($support -match "unpkg\.com") { throw "Published support.js must not reference unpkg.com." }
@("react.production.min.js", "react-dom.production.min.js", "babel.min.js") | ForEach-Object {
  if ($support -notmatch [regex]::Escape("./js/vendor/$_")) {
    throw "Published support.js does not reference local vendor script: $_"
  }
}
if (Test-Path (Join-Path $PublishDirectory "src")) { throw "Source files leaked into publish output." }
Write-Output "Publish smoke validation passed."
