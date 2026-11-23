param(
  [string]$SemanticRepo = "..\\semantic",
  [string]$ApiBaseUrl = "http://127.0.0.1:4317"
)

$ErrorActionPreference = "Stop"

$omnyIdRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$semanticRoot = (Resolve-Path (Join-Path $omnyIdRoot $SemanticRepo)).Path
$tmp = Join-Path $semanticRoot ".tmp"
New-Item -ItemType Directory -Force $tmp | Out-Null

$apiOut = Join-Path $tmp "omnyid-api.out.log"
$apiErr = Join-Path $tmp "omnyid-api.err.log"

Start-Process `
  -FilePath cargo `
  -ArgumentList "run -p api -- `"$omnyIdRoot`"" `
  -WorkingDirectory $semanticRoot `
  -RedirectStandardOutput $apiOut `
  -RedirectStandardError $apiErr `
  -PassThru | Out-Null

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health" -TimeoutSec 1
    if ($health.status -eq "ok") {
      Write-Host "Semantic API ready for OmnyID at $ApiBaseUrl"
      Write-Host "Logs: $apiOut ; $apiErr"
      exit 0
    }
  } catch {}
}

Write-Error "Semantic API did not become healthy within 30 seconds. Check $apiErr"
