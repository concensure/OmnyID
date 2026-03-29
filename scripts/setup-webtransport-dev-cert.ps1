param(
    [string]$OutputDir = "secrets/dev-webtransport",
    [string[]]$Sans = @("example.com", "relay.example.com")
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
    cargo run --bin omnyid_wt_cert -- $OutputDir $Sans
} finally {
    Pop-Location
}
