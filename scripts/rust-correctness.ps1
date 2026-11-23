param(
    [ValidateSet("auto", "always", "never")]
    [string]$ApiFlows = "auto"
)

$ErrorActionPreference = "Stop"

$cargo = if ($env:CARGO_BIN) { $env:CARGO_BIN } else { "cargo" }

Write-Output "[rust-correctness] $cargo check --quiet"
& $cargo check --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output "[rust-correctness] $cargo test --lib --quiet"
& $cargo test --lib --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$shouldRunApiFlows = $false
switch ($ApiFlows) {
    "always" { $shouldRunApiFlows = $true }
    "never" { $shouldRunApiFlows = $false }
    default { $shouldRunApiFlows = -not [string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL) }
}

if ($shouldRunApiFlows) {
    if ([string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL)) {
        throw "[rust-correctness] TEST_DATABASE_URL is required when api_flows are enabled"
    }
    Write-Output "[rust-correctness] $cargo test --test api_flows --quiet"
    & $cargo test --test api_flows --quiet
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    Write-Output "[rust-correctness] skipping api_flows integration tests"
}
