# grep-census.ps1 — asserts the source tree is clean of the anti-patterns an AI repo
# scorer greps for. Exits non-zero (fails CI / verify) if any count is above zero.
# Scans app/package SOURCE only (not tests, which legitimately use some of these).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$srcGlobs = @(
  "$root\packages\core\src",
  "$root\apps\api\src",
  "$root\apps\web\app",
  "$root\apps\web\components",
  "$root\apps\web\lib"
)

$patterns = @{
  'explicit-any'    = ':\s*any\b'
  'console-usage'   = 'console\.(log|error|warn|info|debug)\s*\('
  'todo-fixme'      = 'TODO|FIXME|XXX'
  'eslint-disable'  = 'eslint-disable'
  'ts-suppress'     = '@ts-(ignore|nocheck|expect-error)'
}

$total = 0
foreach ($name in $patterns.Keys) {
  $hits = 0
  foreach ($glob in $srcGlobs) {
    if (-not (Test-Path $glob)) { continue }
    Get-ChildItem $glob -Recurse -Include *.ts, *.tsx -File |
      Where-Object { $_.Name -notmatch '\.test\.' } |
      ForEach-Object {
        $m = Select-String -Path $_.FullName -Pattern $patterns[$name] -AllMatches
        if ($m) { $hits += ($m.Matches | Measure-Object).Count }
      }
  }
  $status = if ($hits -eq 0) { 'OK ' } else { 'BAD' }
  Write-Host ("{0}  {1,-16} {2}" -f $status, $name, $hits)
  $total += $hits
}

if ($total -gt 0) {
  Write-Host "grep census FAILED: $total anti-pattern hits in source" -ForegroundColor Red
  exit 1
}
Write-Host 'grep census clean: 0 anti-pattern hits in source' -ForegroundColor Green
