param([string]$PublishDirectory = "artifacts/publish")
$ErrorActionPreference = "Stop"
$required = @(
  "Tafseel.Api.dll",
  "frontend/Tafseel-Landing.dc.html",
  "frontend/Tafseel-Auth.dc.html",
  "frontend/Tafseel-Teacher-Apply.dc.html",
  "frontend/Tafseel-Chat.dc.html",
  "frontend/Tafseel-Browse-Teachers.dc.html",
  "frontend/Tafseel-Teacher-Profile.dc.html",
  "frontend/Tafseel-Request.dc.html",
  "frontend/Tafseel-Book-Session.dc.html",
  "frontend/Tafseel-Payment.dc.html",
  "frontend/Tafseel-Student-Dashboard.dc.html",
  "frontend/Tafseel-Teacher-Dashboard.dc.html",
  "frontend/Tafseel-Quality-Dashboard.dc.html",
  "frontend/Tafseel-Admin-Dashboard.dc.html",
  "frontend/js/locales.js",
  "frontend/js/api.js",
  "frontend/js/vendor/react.production.min.js",
  "frontend/js/vendor/react-dom.production.min.js",
  "frontend/js/vendor/babel.min.js",
  "frontend/js/vendor/signalr.min.js",
  "frontend/css/tafseel.css",
  "frontend/assets/fonts/thmanyah-sans/thmanyah-sans-light.woff2",
  "frontend/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2",
  "frontend/assets/fonts/thmanyah-sans/thmanyah-sans-medium.woff2",
  "frontend/assets/fonts/thmanyah-sans/thmanyah-sans-bold.woff2",
  "frontend/assets/fonts/thmanyah-sans/thmanyah-sans-black.woff2",
  "frontend/assets/fonts/inter/inter-regular.woff2",
  "frontend/assets/fonts/inter/inter-medium.woff2",
  "frontend/assets/fonts/inter/inter-semibold.woff2",
  "frontend/assets/fonts/inter/inter-bold.woff2",
  "frontend/assets/brand/tafseel-mark.png",
  "frontend/assets/brand/tafseel-mark-dark.png"
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
