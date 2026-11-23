Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tmpRoot = Join-Path $env:TEMP ("rust-hygiene-pwsh-selftest-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpRoot | Out-Null

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[rust-hygiene-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    $selftestOutput = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "rust-hygiene.ps1") -Mode selftest 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[rust-hygiene-pwsh-selftest] wrapper selftest failed with exit code $LASTEXITCODE`n$selftestOutput"
    }

    $artifactDir = Join-Path $tmpRoot "fixture"
    New-Item -ItemType Directory -Path $artifactDir | Out-Null

    @'
STATUS=advisory_failures
CARGO_BIN=fake
BASELINE=scripts/rust-hygiene-baseline.env
FMT_FILES=439
CLIPPY_ERRORS=291
CLIPPY_WARNINGS=1
FMT_DELTA=0
CLIPPY_ERRORS_DELTA=0
CLIPPY_WARNINGS_DELTA=0
REGRESSION_DETECTED=0
'@ | Set-Content (Join-Path $artifactDir "summary.env")

    @'
VERDICT=pass
REASON=no\ regression\ detected\ relative\ to\ baseline
'@ | Set-Content (Join-Path $artifactDir "no-regression-verdict.env")

    $statusOutput = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "rust-hygiene.ps1") -Mode status -OutDir $artifactDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[rust-hygiene-pwsh-selftest] wrapper status failed with exit code $LASTEXITCODE`n$statusOutput"
    }

    $statusText = ($statusOutput | Out-String)
    Assert-Contains -Actual $statusText -Expected "Rust hygiene status"
    Assert-Contains -Actual $statusText -Expected "status: advisory_failures"
    Assert-Contains -Actual $statusText -Expected "fmt files: 439 (delta 0)"
    Assert-Contains -Actual $statusText -Expected "clippy errors: 291 (delta 0)"
    Assert-Contains -Actual $statusText -Expected "no-regression verdict: pass"

    Write-Output "[rust-hygiene-pwsh-selftest] passed"
}
finally {
    Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
