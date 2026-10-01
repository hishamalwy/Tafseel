$ErrorActionPreference = "Stop"
# Validates the GitHub `production` environment before a deploy. The host must be configured from the same
# values (docs/operations/PRODUCTION_SECRETS_CHECKLIST.md); the application re-checks them at startup
# (ProductionConfigurationGuard and the options validators) and refuses to serve if any is wrong.
# Never print a value: only names.
$required = @(
  "ConnectionStrings__Tafseel", "Jwt__SigningKey", "Resend__ApiToken", "Email__From",
  "Email__ConfirmationUrl", "Email__PasswordResetUrl", "Email__AppBaseUrl", "AllowedHosts",
  "Payments__Provider", "Payments__WebhookSecret", "LiveSessions__Provider", "FileStorage__Provider",
  "DataProtection__KeysPath", "MalwareScanning__Mode", "MalwareScanning__ClamAv__Host",
  "PayoutDestinations__ActiveKeyId", "ASPNETCORE_FORWARDEDHEADERS_ENABLED"
)
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing) { throw "Missing required production configuration names: $($missing -join ', ')" }

$problems = [Collections.Generic.List[string]]::new()
function Test-Placeholder([string]$value) {
  return $value -match '(?i)(localhost|127\.0\.0\.1|example\.(com|org|net)|\.example\b|\.invalid\b|\.test\b|REPLACE_)'
}

if ($env:Payments__Provider -eq "Mock" -or $env:LiveSessions__Provider -eq "Mock") { $problems.Add("Mock critical providers are forbidden.") }
if ($env:Payments__Mock__SimulatorEnabled -eq "true" -or $env:Payments__Mock__Enabled -eq "true") { $problems.Add("Payments__Mock__* must not be enabled.") }
if ($env:Payments__WebhookSecret.Length -lt 32) { $problems.Add("Payments__WebhookSecret must be at least 32 characters.") }
if (-not $env:Resend__ApiToken.StartsWith("re_")) { $problems.Add("Resend__ApiToken must be a Resend API key.") }
if ($env:Email__From -match '@resend\.dev' -or (Test-Placeholder $env:Email__From)) { $problems.Add("Email__From must be on the verified sending domain.") }
foreach ($name in "Email__ConfirmationUrl", "Email__PasswordResetUrl", "Email__AppBaseUrl") {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ($value -notmatch '^https://' -or (Test-Placeholder $value)) { $problems.Add("$name must be an HTTPS address on the production domain.") }
}
if ($env:AllowedHosts -eq "*" -or (Test-Placeholder $env:AllowedHosts)) { $problems.Add("AllowedHosts must list the production host names.") }
$origins = Get-ChildItem Env: | Where-Object { $_.Name -like "Cors__AllowedOrigins__*" }
foreach ($origin in $origins) {
  if ($origin.Value -notmatch '^https://[^/*]+$' -or (Test-Placeholder $origin.Value)) { $problems.Add("$($origin.Name) must be an exact HTTPS origin.") }
}
if ($env:ConnectionStrings__Tafseel -match '(?i)\(localdb\)|REPLACE_') { $problems.Add("ConnectionStrings__Tafseel must point at the production SQL Server.") }
if ($env:FileStorage__Provider -ne "AzureBlob") { $problems.Add("FileStorage__Provider must be AzureBlob (private durable object storage).") }
elseif ([string]::IsNullOrWhiteSpace($env:FileStorage__AzureBlob__ConnectionString) -or $env:FileStorage__AzureBlob__ConnectionString -like "REPLACE_*") {
  $problems.Add("FileStorage__AzureBlob__ConnectionString is missing or a placeholder.")
}
if (-not [IO.Path]::IsPathRooted($env:DataProtection__KeysPath)) { $problems.Add("DataProtection__KeysPath must be an absolute path on durable storage.") }
if ($env:MalwareScanning__Mode -ne "ClamAv" -or $env:MalwareScanning__ClamAv__Host -like "REPLACE_*") { $problems.Add("MalwareScanning must be ClamAv with a real host.") }
$payoutKey = [Environment]::GetEnvironmentVariable("PayoutDestinations__Keys__$($env:PayoutDestinations__ActiveKeyId)")
if ([string]::IsNullOrWhiteSpace($payoutKey)) { $problems.Add("PayoutDestinations__Keys__<ActiveKeyId> is missing.") }
if ($env:LiveSessions__Provider -eq "JaaS") {
  foreach ($name in "JaaS__AppId", "JaaS__KeyId", "JaaS__PrivateKeyPem") {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { $problems.Add("$name is required for JaaS.") }
  }
  if (-not [string]::IsNullOrWhiteSpace($env:JaaS__StaticJwt)) { $problems.Add("JaaS__StaticJwt is sandbox-only and forbidden in Production.") }
  if ($env:JaaS__KeyId -match 'SAMPLE_APP') { $problems.Add("JaaS__KeyId is the sample key, not the account's key.") }
}
if ($env:ASPNETCORE_FORWARDEDHEADERS_ENABLED -ne "true") { $problems.Add("ASPNETCORE_FORWARDEDHEADERS_ENABLED must be true: the image serves HTTP behind a TLS-terminating proxy.") }
if ($env:SeedUsers__Enabled -eq "true" -or $env:SeedDemoData__Enabled -eq "true") { $problems.Add("Demo seeding is forbidden in Production.") }

if ($problems.Count -gt 0) { throw "Production configuration is not ready:`n- $($problems -join "`n- ")" }
Write-Output "Production configuration names and non-secret policy values passed."
