param([string]$PublishDirectory = "artifacts/publish")
$ErrorActionPreference = "Stop"
# The site is the Angular client, published per locale under webclient/ (G-15). The host has
# no Node, so the SSR server half must not ship and the prerendered pages must be real files.
$policies = @("terms", "privacy", "refunds", "integrity", "teacher", "disputes")
$required = @("Tafseel.Api.dll", "web.config")
foreach ($locale in @("ar", "en")) {
  $required += "webclient/$locale/index.csr.html"
  $required += "webclient/$locale/about/index.html"
  $required += "webclient/$locale/assets/brand/tafseel-mark-dark.png"
  $required += "webclient/$locale/assets/brand/favicon.ico"
  $required += "webclient/$locale/assets/fonts/thmanyah-sans/thmanyah-sans-regular.woff2"
  $required += "webclient/$locale/locale/ar.json"
  $required += "webclient/$locale/locale/en.json"
  foreach ($policy in $policies) { $required += "webclient/$locale/policies/$policy/index.html" }
}
$missing = $required | Where-Object { -not (Test-Path (Join-Path $PublishDirectory $_)) }
if ($missing) { throw "Publish output is missing: $($missing -join ', ')" }

foreach ($locale in @("ar", "en")) {
  $root = Join-Path $PublishDirectory "webclient/$locale"
  $shell = Get-Content (Join-Path $root "index.csr.html") -Raw
  if ($shell -notmatch [regex]::Escape("<base href=""/$locale/""")) {
    throw "Published $locale shell does not carry <base href=""/$locale/"">."
  }
  foreach ($bundle in @("main-", "polyfills-", "styles-")) {
    $match = [regex]::Match($shell, "(?:src|href)=""($bundle[A-Za-z0-9_-]+.(?:js|css))""")
    if (-not $match.Success) { throw "Published $locale shell does not load its $bundle* bundle." }
    if (-not (Test-Path (Join-Path $root $match.Groups[1].Value))) {
      throw "Published $locale shell references $($match.Groups[1].Value), which is not in the output."
    }
  }
}
if (Test-Path (Join-Path $PublishDirectory "webclient/server")) { throw "The Node SSR server leaked into publish output." }
if (Get-ChildItem (Join-Path $PublishDirectory "webclient") -Recurse -Filter "*.mjs" -File) {
  throw "Server-side .mjs bundles leaked into publish output."
}

# R-05: the retired .dc.html runtime must not be published again.
if (Test-Path (Join-Path $PublishDirectory "frontend")) { throw "The retired frontend/ directory is in publish output." }
if (Get-ChildItem $PublishDirectory -Recurse -Include "*.dc.html", "support.js", "babel.min.js" -File) {
  throw "Retired .dc.html runtime files are in publish output."
}
if (Test-Path (Join-Path $PublishDirectory "src")) { throw "Source files leaked into publish output." }
$hostFiles = Get-ChildItem $PublishDirectory -Filter "appsettings.*.Host.json" -File -ErrorAction SilentlyContinue
if ($hostFiles) { throw "Server-owned Host configuration leaked into publish output." }

$webConfigPath = Join-Path $PublishDirectory "web.config"
[xml]$webConfig = Get-Content $webConfigPath -Raw
$server = $webConfig.configuration.location.'system.webServer'
if ($server.aspNetCore.stdoutLogEnabled -ne "false") {
  throw "Published IIS config must keep unbounded ANCM stdout logging disabled."
}
if ($server.security.requestFiltering.removeServerHeader -ne "true") {
  throw "Published IIS config must remove the Server response header."
}
if (-not ($server.httpProtocol.customHeaders.remove | Where-Object name -eq "X-Powered-By")) {
  throw "Published IIS config must remove X-Powered-By."
}
Write-Output "Publish smoke validation passed."
