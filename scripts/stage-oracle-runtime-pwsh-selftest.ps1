Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "oracle-runtime-contract.ps1")

$tmpRoot = Join-Path $env:TEMP ("stage-oracle-runtime-pwsh-selftest-" + [guid]::NewGuid().ToString())
$sourceRoot = Join-Path $tmpRoot "source"
$stageWithData = Join-Path $tmpRoot "stage-with-data"
$stageWithoutData = Join-Path $tmpRoot "stage-without-data"

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "[stage-oracle-runtime-pwsh-selftest] $Message"
    }
}

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "[stage-oracle-runtime-pwsh-selftest] $Message`nexpected: $Expected`nactual:   $Actual"
    }
}

function New-TestFile {
    param(
        [string]$RelativePath,
        [string]$Contents = "test"
    )

    $path = Join-Path $sourceRoot $RelativePath
    $parent = Split-Path -Parent $path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Set-Content -LiteralPath $path -Value $Contents
}

try {
    New-Item -ItemType Directory -Path $sourceRoot -Force | Out-Null

    foreach ($file in @(
        ".dockerignore",
        "Caddyfile",
        "Cargo.lock",
        "Cargo.toml",
        "build.rs",
        "Dockerfile",
        "Dockerfile.backup",
        "docker-compose.oracle.minimal.yml",
        "docker-compose.oracle.quic.yml",
        "docker-compose.oracle.yml",
        "postgres/init.sql",
        "scripts/omnyid-backup-verify.sh",
        "scripts/omnyid-backup.sh",
        "scripts/omnyid-migrations-plan.sh",
        "scripts/omnyid-prune-daemon-heartbeats.sh",
        "scripts/oracle-remediate-electric-slot.ps1",
        "scripts/oracle-production-proof.ps1",
        "scripts/omnyid-restore-drill.sh",
        "scripts/omnyid-restore.sh",
        "scripts/omnyid-upgrade.sh",
        "scripts/oracle-renew-wt-cert.sh",
        "scripts/runtime-env-entrypoint.sh",
        "scripts/startup-policy-check.ps1",
        "scripts/startup-policy-check.sh",
        "scripts/verify-deployment.ps1",
        "scripts/verify-deployment.sh",
        "solid-ui/.dockerignore",
        "solid-ui/Dockerfile",
        "solid-ui/dashboard.html",
        "solid-ui/index.html",
        "solid-ui/practice.html",
        "solid-ui/quotation-response.html",
        "solid-ui/rsvp.html",
        "solid-ui/runsheet-share.html",
        "solid-ui/vendor.html",
        "solid-ui/package-lock.json",
        "solid-ui/package.json",
        "solid-ui/postcss.config.cjs",
        "solid-ui/render-genesis-mark.cjs",
        "solid-ui/tailwind.config.cjs",
        "solid-ui/tsconfig.json",
        "solid-ui/vite.config.mjs",
        "solid-ui/vite.config.ts",
        "typescript-sdk/package-lock.json",
        "typescript-sdk/package.json",
        "typescript-sdk/tsconfig.build.json",
        "benchmarks/sample.jsonl"
    )) {
        New-TestFile -RelativePath $file
    }

    foreach ($dir in @(
        "docs",
        "postgres/migrations",
        "postgres/data",
        "proto",
        "runtime-templates",
        "schemas",
        "service-adapter-templates",
        "src",
        "wedding",
        "solid-ui/public",
        "solid-ui/src",
        "typescript-sdk/scripts",
        "typescript-sdk/src",
        "target",
        "training_data",
        "artifacts",
        ".git"
    )) {
        New-Item -ItemType Directory -Path (Join-Path $sourceRoot $dir) -Force | Out-Null
    }

    New-TestFile -RelativePath "docs/index.html"
    New-TestFile -RelativePath "postgres/migrations/0001_init.sql"
    New-TestFile -RelativePath "postgres/data/vendor-source.sql"
    New-TestFile -RelativePath "src/main.rs"
    New-TestFile -RelativePath "schemas/quotation/generic.v1.json" -Contents "{}"
    New-TestFile -RelativePath "wedding/index.html"
    New-TestFile -RelativePath "solid-ui/src/main.tsx"
    New-TestFile -RelativePath "typescript-sdk/scripts/build-clean.mjs"
    New-TestFile -RelativePath "typescript-sdk/src/index.ts"
    New-TestFile -RelativePath "target/should-not-copy.txt"
    New-TestFile -RelativePath "training_data/should-not-copy.txt"
    New-TestFile -RelativePath "artifacts/should-not-copy.txt"
    New-TestFile -RelativePath ".git/config"

    & (Join-Path $PSScriptRoot "stage-oracle-runtime.ps1") -SourceRoot $sourceRoot -OutputDir $stageWithData -IncludeSimulatedData
    & (Join-Path $PSScriptRoot "stage-oracle-runtime.ps1") -SourceRoot $sourceRoot -OutputDir $stageWithoutData -IncludeSimulatedData:$false

    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "src/main.rs")) "expected runtime source file in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "schemas/quotation/generic.v1.json")) "expected compile-time quotation schema in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "solid-ui/src/main.tsx")) "expected Solid UI source in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "solid-ui/postcss.config.cjs")) "expected Solid UI PostCSS config in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithoutData "solid-ui/practice.html")) "expected practice build entry even without simulated data"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "solid-ui/quotation-response.html")) "expected quotation response entry in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithoutData "solid-ui/rsvp.html")) "expected RSVP build entry even without simulated data"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithoutData "solid-ui/runsheet-share.html")) "expected run-sheet share build entry even without simulated data"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "solid-ui/tailwind.config.cjs")) "expected Solid UI Tailwind config in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "typescript-sdk/scripts/build-clean.mjs")) "expected TypeScript SDK build script in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "typescript-sdk/src/index.ts")) "expected TypeScript SDK source in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "benchmarks/sample.jsonl")) "expected simulated sample data when IncludeSimulatedData is enabled"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stageWithData "target"))) "did not expect target in staged output"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stageWithData "training_data"))) "did not expect training_data in staged output"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stageWithData "artifacts"))) "did not expect artifacts in staged output"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stageWithData "postgres/data"))) "did not expect reviewed source data in staged output"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stageWithData ".git"))) "did not expect .git in staged output"
    Assert-True (Test-Path -LiteralPath (Join-Path $stageWithData "oracle-runtime-manifest.json")) "expected oracle runtime manifest"
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $stageWithoutData "benchmarks/sample.jsonl"))) "did not expect simulated sample data when IncludeSimulatedData is disabled"

    $manifestWithData = Get-Content (Join-Path $stageWithData "oracle-runtime-manifest.json") -Raw | ConvertFrom-Json
    $manifestWithoutData = Get-Content (Join-Path $stageWithoutData "oracle-runtime-manifest.json") -Raw | ConvertFrom-Json

    Assert-Equal $manifestWithData.copied_path_count 59 "expected copied path count with simulated data"
    Assert-Equal $manifestWithoutData.copied_path_count 58 "expected copied path count without simulated data"
    Assert-True ($manifestWithData.total_staged_bytes -gt $manifestWithoutData.total_staged_bytes) "expected simulated-data stage to be larger"
    Assert-True ($manifestWithData.largest_paths.Count -gt 0) "expected largest paths list in manifest"
    Assert-Equal $manifestWithData.include_simulated_data $true "expected manifest to record simulated-data inclusion"
    Assert-Equal $manifestWithoutData.include_simulated_data $false "expected manifest to record simulated-data exclusion"
    Assert-True ($manifestWithData.total_staged_gib -ge 0) "expected total_staged_gib in manifest"
    Assert-True (@($manifestWithData.category_totals).Count -ge 1) "expected category totals in manifest"
    Assert-Equal (@($manifestWithData.required_runtime_scripts).Count) (@(Get-OracleRequiredRuntimeScriptPaths).Count) "expected required runtime script count in manifest"
    Assert-True (@($manifestWithData.notable_excluded_paths).Count -ge 4) "expected notable excluded path list in manifest"
    Assert-True ("target" -in @($manifestWithData.excluded_existing_paths)) "expected target to be recorded as intentionally excluded"
    Assert-True ("artifacts" -in @($manifestWithData.excluded_existing_paths)) "expected artifacts to be recorded as intentionally excluded"
    Assert-True ("postgres/data" -in @($manifestWithData.excluded_existing_paths)) "expected reviewed source data to be recorded as intentionally excluded"
    Assert-True ($manifestWithData.excluded_existing_path_count -ge 4) "expected excluded existing path count in manifest"
    Assert-True ($manifestWithData.excluded_existing_bytes -gt 0) "expected excluded existing bytes in manifest"
    Assert-True ($manifestWithData.excluded_existing_gib -ge 0) "expected excluded existing gib in manifest"
    $excludedTarget = @($manifestWithData.excluded_entries | Where-Object { $_.path -eq "target" } | Select-Object -First 1)
    Assert-True ($excludedTarget.Count -eq 1) "expected target excluded entry in manifest"
    Assert-True ($excludedTarget[0].bytes -gt 0) "expected target excluded entry to report bytes"
    foreach ($requiredScript in @(Get-OracleRequiredRuntimeScriptPaths)) {
        Assert-True ($requiredScript -in @($manifestWithData.required_runtime_scripts)) "expected required runtime script '$requiredScript' in manifest"
    }
    $simulatedCategory = @($manifestWithData.category_totals | Where-Object { $_.name -eq "simulated_data" }) | Select-Object -First 1
    Assert-True ($null -ne $simulatedCategory) "expected simulated_data category in manifest"
    Assert-True ($simulatedCategory.bytes -gt 0) "expected simulated_data category to report bytes when included"
    $simulatedCategoryWithoutData = @($manifestWithoutData.category_totals | Where-Object { $_.name -eq "simulated_data" }) | Select-Object -First 1
    Assert-True ($null -ne $simulatedCategoryWithoutData) "expected simulated_data category even when excluded"
    Assert-Equal $simulatedCategoryWithoutData.bytes 0 "expected simulated_data category bytes to be zero when excluded"

    Write-Output "[stage-oracle-runtime-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
