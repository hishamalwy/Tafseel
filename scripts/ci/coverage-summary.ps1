param([string]$ResultsDirectory = "TestResults")
$ErrorActionPreference = "Stop"
$lines = @{}
Get-ChildItem $ResultsDirectory -Recurse -Filter coverage.cobertura.xml | ForEach-Object {
  [xml]$coverage = Get-Content -Raw $_.FullName
  foreach ($class in $coverage.coverage.packages.package.classes.class) {
    $group = if ($class.filename -match 'Tafseel\.Domain') { "Domain" }
      elseif ($class.filename -match 'Tafseel\.Application') { "Application" }
      elseif ($class.filename -match 'Tafseel\.Infrastructure') { "Infrastructure/Auth/Finance" }
      elseif ($class.filename -match 'Tafseel\.Api') { "API/Authorization" }
      else { "Other" }
    foreach ($line in $class.lines.line) {
      $key = "$group|$($class.filename)|$($line.number)"
      $previous = if ($lines.ContainsKey($key)) { [int]$lines[$key] } else { 0 }
      $lines[$key] = [Math]::Max($previous, [int]$line.hits)
    }
  }
}
if ($lines.Count -eq 0) { throw "No Cobertura coverage files found." }
$rows = $lines.Keys | Group-Object { ($_ -split '\|', 2)[0] } | ForEach-Object {
  $covered = @($_.Group | Where-Object { $lines[$_] -gt 0 }).Count
  [pscustomobject]@{ Area = $_.Name; Covered = $covered; Total = $_.Count; Percent = [Math]::Round(100 * $covered / $_.Count, 2) }
}
$markdown = @("# Coverage summary", "", "| Area | Covered lines | Total lines | Coverage |", "|---|---:|---:|---:|")
$markdown += $rows | Sort-Object Area | ForEach-Object { "| $($_.Area) | $($_.Covered) | $($_.Total) | $($_.Percent)% |" }
$markdown -join "`n" | Set-Content (Join-Path $ResultsDirectory "coverage-summary.md")
if ($env:GITHUB_STEP_SUMMARY) { $markdown -join "`n" | Add-Content $env:GITHUB_STEP_SUMMARY }
$rows | Sort-Object Area | Format-Table -AutoSize
