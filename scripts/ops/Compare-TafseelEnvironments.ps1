<#
.SYNOPSIS
  Proves two environments share the canonical baseline but not their runtime data (docs/ENVIRONMENTS.md).

.DESCRIPTION
  Baseline (must be identical): roles, canonical services with their price policy, teaching languages, subjects,
  topics, qualification topics, education levels. Each is fingerprinted by content (names, codes, prices), never by
  generated ids.

  Runtime (must not leak): every account that is not one of the five demo accounts. An account created in one
  environment must not exist in the other. With -Marker, the named e-mail must exist in the first database only.

  Prints table names, counts and hashes only. Windows authentication by default; for a SQL login pass -UserA/-UserB
  and put the password in SQLCMDPASSWORD (never on the command line).

.EXAMPLE
  ./scripts/ops/Compare-TafseelEnvironments.ps1 -ServerA localhost -DatabaseA Tafseel_Development -ServerB localhost -DatabaseB Tafseel_Staging
#>
param(
  [Parameter(Mandatory)] [string]$ServerA, [Parameter(Mandatory)] [string]$DatabaseA, [string]$UserA = "",
  [Parameter(Mandatory)] [string]$ServerB, [Parameter(Mandatory)] [string]$DatabaseB, [string]$UserB = "",
  [string]$Marker = ""
)
$ErrorActionPreference = "Stop"

$demo = "'admin@gmail.com','student@gmail.com','teacher@gmail.com','quality@gmail.com','finance@gmail.com'"
$baseline = [ordered]@{
  "roles"               = "SELECT Name FROM AspNetRoles ORDER BY Name"
  "services and policy" = "SELECT Code + '|' + CONVERT(varchar(40), MinPrice) + '|' + CONVERT(varchar(40), MaxPrice) + '|' + CONVERT(varchar(40), DefaultPrice) FROM ServiceCatalogItems WHERE Code IN ('recorded_explanation','assignment_guidance','exam_revision','live_session') ORDER BY Code"
  "languages"           = "SELECT Code FROM TeachingLanguages ORDER BY Code"
  "subjects"            = "SELECT Name + '|' + NameAr FROM Subjects ORDER BY Name"
  "topics"              = "SELECT s.Name + '|' + t.Name FROM Topics t JOIN Subjects s ON s.Id = t.SubjectId ORDER BY s.Name, t.Name"
  "qualification topics"= "SELECT s.Name + '|' + q.Name FROM QualificationTopics q JOIN Subjects s ON s.Id = q.SubjectId ORDER BY s.Name, q.Name"
  "education levels"    = "SELECT Name FROM EducationLevels ORDER BY Name"
}

function Invoke-Rows([string]$Server, [string]$Database, [string]$User, [string]$Query) {
  [string[]]$arguments = @("-S", $Server) + $(if ($User) { @("-U", $User) } else { @("-E") }) +
    @("-d", $Database, "-C", "-N", "-b", "-I", "-l", "30", "-h", "-1", "-W", "-Q", "SET NOCOUNT ON; $Query")
  $output = & sqlcmd $arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on [$Database]: $($output -join ' ')" }
  return @($output | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.TrimEnd() })
}

function Hash([string[]]$rows) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
  return ([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($bytes)) -replace '-', '').Substring(0, 16)
}

$failures = 0
Write-Output "Baseline (must match): $DatabaseA vs $DatabaseB"
foreach ($entry in $baseline.GetEnumerator()) {
  $a = Invoke-Rows $ServerA $DatabaseA $UserA $entry.Value
  $b = Invoke-Rows $ServerB $DatabaseB $UserB $entry.Value
  $same = (Hash $a) -eq (Hash $b)
  if (-not $same) { $failures++ }
  Write-Output ("  {0,-22} {1,4} rows  {2}  {3}" -f $entry.Key, $a.Count, (Hash $a), $(if ($same) { "SAME" } else { "DIFFERENT ($($b.Count) rows, $(Hash $b))" }))
}

$people = "SELECT LOWER(Email) FROM AspNetUsers WHERE Email IS NOT NULL AND LOWER(Email) NOT IN ($demo) ORDER BY 1"
$a = Invoke-Rows $ServerA $DatabaseA $UserA $people
$b = Invoke-Rows $ServerB $DatabaseB $UserB $people
$shared = @($a | Where-Object { $b -contains $_ })
Write-Output "Runtime (must not leak): $($a.Count) non-demo accounts in $DatabaseA, $($b.Count) in $DatabaseB, $($shared.Count) in both"
if ($shared.Count -gt 0) { $failures++ }
if ($Marker) {
  $inA = $a -contains $Marker.ToLowerInvariant()
  $inB = $b -contains $Marker.ToLowerInvariant()
  Write-Output "  marker account: in $DatabaseA=$inA, in $DatabaseB=$inB"
  if (-not $inA -or $inB) { $failures++ }
}
Write-Output $(if ($failures -eq 0) { "PASS" } else { "FAIL ($failures)" })
if ($failures -gt 0) { exit 1 }
