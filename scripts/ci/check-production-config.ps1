$ErrorActionPreference = "Stop"
$required = @(
  "ConnectionStrings__Tafseel", "Jwt__SigningKey", "Resend__ApiToken", "Email__From",
  "Email__ConfirmationUrl", "Email__PasswordResetUrl", "Payments__Provider",
  "Payments__WebhookSecret", "LiveSessions__Provider", "FileStorage__Provider",
  "DataProtection__KeysPath", "Cors__AllowedOrigins__0"
)
$missing = $required | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
if ($missing) { throw "Missing required production configuration names: $($missing -join ', ')" }
if ($env:Payments__Provider -eq "Mock" -or $env:LiveSessions__Provider -eq "Mock") {
  throw "Mock critical providers are forbidden."
}
if ($env:Email__From -match '@resend\.dev') { throw "The Resend sandbox sender is forbidden." }
if ($env:Email__ConfirmationUrl -notmatch '^https://' -or $env:Email__PasswordResetUrl -notmatch '^https://') {
  throw "Email frontend URLs must use HTTPS."
}
if ($env:Cors__AllowedOrigins__0 -notmatch '^https://' -or $env:Cors__AllowedOrigins__0 -match '\*') {
  throw "CORS must contain an exact HTTPS origin."
}
if ($env:FileStorage__Provider -eq "Local") { throw "Production requires durable private object storage." }
if ($env:FileStorage__Provider -eq "AzureBlob" -and (
    [string]::IsNullOrWhiteSpace($env:FileStorage__AzureBlob__ConnectionString) -or
    $env:FileStorage__AzureBlob__ConnectionString -like "REPLACE_*")) {
  throw "Production Azure Blob connection string is missing or still a placeholder."
}
if ($env:Payments__Mock__SimulatorEnabled -eq "true" -or $env:Payments__Mock__Enabled -eq "true") {
  throw "Mock payment simulator / Mock.Enabled are forbidden in Production."
}
if (-not [IO.Path]::IsPathRooted($env:DataProtection__KeysPath)) { throw "Production Data Protection keys require a durable absolute path." }
Write-Output "Production configuration names and non-secret policy values passed."
