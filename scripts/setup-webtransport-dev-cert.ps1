param(
    [string]$OutputDir = "secrets/dev-webtransport",
    [string[]]$Sans = @("localhost", "127.0.0.1", "::1", "wt.omnyid.local")
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
    cargo run --bin omnyid_wt_cert -- $OutputDir $Sans
} finally {
    Pop-Location
}
