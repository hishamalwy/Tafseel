param([Parameter(Mandatory)][string]$Script)
$ErrorActionPreference = "Stop"
$patterns = @(
  '(?im)^\s*DROP\s+TABLE\b',
  '(?im)^\s*ALTER\s+TABLE\b.*\bDROP\s+COLUMN\b',
  '(?im)^\s*DROP\s+(CONSTRAINT|INDEX)\b',
  '(?im)^\s*TRUNCATE\s+TABLE\b',
  '(?i)\.\s*Drop(Table|Column|ForeignKey|PrimaryKey|CheckConstraint)\s*\(',
  '(?i)\.\s*AlterColumn\s*<'
)
$hits = foreach ($pattern in $patterns) { Select-String -Path $Script -Pattern $pattern }
if ($hits) {
  $hits | ForEach-Object { Write-Error "Manual migration approval required at line $($_.LineNumber): destructive operation detected." }
  exit 2
}
Write-Output "No destructive migration operation matched the fail-closed policy."
