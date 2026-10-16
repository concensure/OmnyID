param(
    [string]$SourceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$OutputDir = "",
    [switch]$IncludeSimulatedData = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "oracle-runtime-contract.ps1")

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $env:TEMP "omnyid-oracle-runtime-stage"
}

$runtimeFiles = @(
    ".dockerignore",
    "Caddyfile",
    "Cargo.lock",
    "Cargo.toml",
    "build.rs",
    "Dockerfile",
    "Dockerfile.backup",
    "docker-compose.oracle.minimal.yml",
    "docker-compose.oracle.quic.yml",
    "docker-compose.oracle.yml"
)

$runtimeDirectories = @(
    "docs",
    "postgres",
    "proto",
    "runtime-templates",
    "schemas",
    "service-adapter-templates",
    "src",
    "wedding"
)

$runtimeScriptFiles = Get-OracleRequiredRuntimeScriptPaths

$solidUiFiles = @(
    "solid-ui/.dockerignore",
    "solid-ui/Dockerfile",
    "solid-ui/dashboard.html",
    "solid-ui/index.html",
    "solid-ui/vendor.html",
    "solid-ui/package-lock.json",
    "solid-ui/package.json",
    "solid-ui/postcss.config.cjs",
    "solid-ui/render-genesis-mark.cjs",
    "solid-ui/tailwind.config.cjs",
    "solid-ui/tsconfig.json",
    "solid-ui/vite.config.mjs",
    "solid-ui/vite.config.ts"
)

$solidUiDirectories = @(
    "solid-ui/public",
    "solid-ui/src"
)

$typescriptSdkFiles = @(
    "typescript-sdk/package-lock.json",
    "typescript-sdk/package.json",
    "typescript-sdk/tsconfig.build.json"
)

$typescriptSdkDirectories = @(
    "typescript-sdk/scripts",
    "typescript-sdk/src"
)

$simulatedDataFiles = @(
    "benchmarks/sample.jsonl"
)

$notableExcludedPaths = @(
    @{
        path = "target"
        rationale = "Cargo build output is local build state and should never be staged to Oracle."
    },
    @{
        path = "artifacts"
        rationale = "Artifacts are generated audit and operator outputs, not Oracle runtime inputs."
    },
    @{
        path = "training_data"
        rationale = "Training corpora are not required for Oracle runtime deployment."
    },
    @{
        path = ".git"
        rationale = "Git metadata is repository history and should not be copied to Oracle runtime."
    },
    @{
        path = "solid-ui/node_modules"
        rationale = "Frontend dependency install trees are rebuildable and should not be copied to Oracle runtime."
    },
    @{
        path = "typescript-sdk/node_modules"
        rationale = "SDK dependency install trees are rebuildable and should not be copied to Oracle runtime."
    },
    @{
        path = ".kilo/node_modules"
        rationale = "Tooling dependency install trees are rebuildable and should not be copied to Oracle runtime."
    },
    @{
        path = "python-sdk/.venv"
        rationale = "Local Python virtualenvs are developer state and are not Oracle runtime assets."
    }
)

$pathCategories = @(
    @{
        name = "runtime_root_files"
        paths = $runtimeFiles
    },
    @{
        name = "runtime_directories"
        paths = $runtimeDirectories
    },
    @{
        name = "runtime_scripts"
        paths = $runtimeScriptFiles
    },
    @{
        name = "frontend_files"
        paths = $solidUiFiles
    },
    @{
        name = "frontend_directories"
        paths = $solidUiDirectories
    },
    @{
        name = "typescript_sdk_files"
        paths = $typescriptSdkFiles
    },
    @{
        name = "typescript_sdk_directories"
        paths = $typescriptSdkDirectories
    },
    @{
        name = "simulated_data"
        paths = $simulatedDataFiles
    }
)

function New-CleanDirectory {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
}

function Copy-RelativePath {
    param(
        [string]$RelativePath,
        [bool]$Required = $true
    )

    $sourcePath = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        if ($Required) {
            throw "[stage-oracle-runtime] missing required path: $RelativePath"
        }
        return $null
    }

    $destinationPath = Join-Path $OutputDir $RelativePath
    $parentDir = Split-Path -Parent $destinationPath
    if (-not [string]::IsNullOrWhiteSpace($parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
    return $RelativePath
}

function Get-StagedPathSizeBytes {
    param([string]$RelativePath)

    $path = Join-Path $OutputDir $RelativePath
    if (-not (Test-Path -LiteralPath $path)) {
        return [int64]0
    }

    $item = Get-Item -LiteralPath $path -Force
    if ($item.PSIsContainer) {
        $files = @(Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue)
        if ($files.Count -eq 0) {
            return [int64]0
        }
        $measurement = $files | Measure-Object -Property Length -Sum
        if ($null -eq $measurement -or $null -eq $measurement.Sum) {
            return [int64]0
        }
        return [int64]$measurement.Sum
    }

    return [int64]$item.Length
}

function Get-SourcePathSizeBytes {
    param([string]$RelativePath)

    $path = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path)) {
        return [int64]0
    }

    $item = Get-Item -LiteralPath $path -Force
    if ($item.PSIsContainer) {
        $files = @(Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue)
        if ($files.Count -eq 0) {
            return [int64]0
        }
        $measurement = $files | Measure-Object -Property Length -Sum
        if ($null -eq $measurement -or $null -eq $measurement.Sum) {
            return [int64]0
        }
        return [int64]$measurement.Sum
    }

    return [int64]$item.Length
}

New-CleanDirectory -Path $OutputDir

$copied = New-Object System.Collections.Generic.List[string]

foreach ($path in $runtimeFiles + $runtimeDirectories + $runtimeScriptFiles + $solidUiFiles + $solidUiDirectories + $typescriptSdkFiles + $typescriptSdkDirectories) {
    $copiedPath = Copy-RelativePath -RelativePath $path -Required $true
    if ($null -ne $copiedPath) {
        $copied.Add($copiedPath)
    }
}

if ($IncludeSimulatedData) {
    foreach ($path in $simulatedDataFiles) {
        $copiedPath = Copy-RelativePath -RelativePath $path -Required $false
        if ($null -ne $copiedPath) {
            $copied.Add($copiedPath)
        }
    }
}

$sizeEntries = foreach ($relativePath in $copied) {
    [pscustomobject]@{
        path = $relativePath
        bytes = Get-StagedPathSizeBytes -RelativePath $relativePath
    }
}

$totalBytes = [int64](($sizeEntries | Measure-Object -Property bytes -Sum).Sum)
$categoryTotals = foreach ($category in $pathCategories) {
    $matchingEntries = @($sizeEntries | Where-Object { $_.path -in $category.paths })
    $categoryBytes = [int64]0
    if ($matchingEntries.Count -gt 0) {
        $categoryMeasurement = $matchingEntries | Measure-Object -Property bytes -Sum
        if ($null -ne $categoryMeasurement -and $null -ne $categoryMeasurement.Sum) {
            $categoryBytes = [int64]$categoryMeasurement.Sum
        }
    }
    [pscustomobject]@{
        name = $category.name
        path_count = $matchingEntries.Count
        bytes = $categoryBytes
        gib = [math]::Round(([double]$categoryBytes / 1GB), 6)
    }
}
$largestPaths = @(
    $sizeEntries |
        Sort-Object -Property @{ Expression = "bytes"; Descending = $true }, @{ Expression = "path"; Descending = $false } |
        Select-Object -First 10
)
$excludedEntries = @(
    $notableExcludedPaths |
        ForEach-Object {
            $relativePath = [string]$_.path
            $sourcePath = Join-Path $SourceRoot $relativePath
            if (-not (Test-Path -LiteralPath $sourcePath)) {
                return
            }

            $bytes = Get-SourcePathSizeBytes -RelativePath $relativePath
            [pscustomobject]@{
                path = $relativePath
                bytes = $bytes
                gib = [math]::Round(([double]$bytes / 1GB), 6)
                rationale = [string]$_.rationale
            }
        }
)
$excludedBytes = [int64](($excludedEntries | Measure-Object -Property bytes -Sum).Sum)

$manifest = [pscustomobject]@{
    source_root = $SourceRoot
    output_dir = $OutputDir
    include_simulated_data = [bool]$IncludeSimulatedData
    required_runtime_scripts = $runtimeScriptFiles
    copied_paths = $copied.ToArray()
    copied_path_count = $copied.Count
    total_staged_bytes = $totalBytes
    total_staged_gib = [math]::Round(([double]$totalBytes / 1GB), 6)
    category_totals = $categoryTotals
    largest_paths = $largestPaths
    notable_excluded_paths = @($notableExcludedPaths | ForEach-Object { [string]$_.path })
    excluded_existing_paths = @($excludedEntries | ForEach-Object { [string]$_.path })
    excluded_existing_path_count = @($excludedEntries).Count
    excluded_existing_bytes = $excludedBytes
    excluded_existing_gib = [math]::Round(([double]$excludedBytes / 1GB), 6)
    excluded_entries = $excludedEntries
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDir "oracle-runtime-manifest.json")
Write-Output "[stage-oracle-runtime] staged $($copied.Count) paths into $OutputDir ($totalBytes bytes)"
