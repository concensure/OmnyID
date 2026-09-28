param(
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$typescriptSdkDir = Join-Path $repoRoot "typescript-sdk"
$solidUiDir = Join-Path $repoRoot "solid-ui"
$solidUiDistDir = Join-Path $solidUiDir "dist"
$solidUiAssetsDir = Join-Path $solidUiDistDir "assets"
$startedAt = [DateTime]::UtcNow.ToString("o")

function Invoke-CheckedCommand {
    param(
        [string]$FailureMessage,
        [scriptblock]$Command
    )

    $global:LASTEXITCODE = 0
    & $Command
    if (-not $?) {
        throw $FailureMessage
    }
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "[frontend-correctness] missing $Label at $Path"
    }
}

function Format-SizeMiB {
    param([long]$Bytes)

    return [Math]::Round(($Bytes / 1MB), 2)
}

function New-BundleBudgetRule {
    param(
        [string]$Name,
        [scriptblock]$Predicate,
        [string]$Severity,
        [string]$Message
    )

    return [pscustomobject]@{
        name = $Name
        predicate = $Predicate
        severity = $Severity
        message = $Message
    }
}

function Get-InitialRouteAssetNames {
    param([string]$DistDir)

    $assetNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $htmlFiles = @(
        Get-ChildItem -LiteralPath $DistDir -Filter *.html -File -ErrorAction SilentlyContinue
    )
    $assetPathPattern = '/workspace/assets/([^"''?#]+)'

    foreach ($htmlFile in $htmlFiles) {
        $content = Get-Content -LiteralPath $htmlFile.FullName -Raw
        $matches = [regex]::Matches($content, $assetPathPattern)
        foreach ($match in $matches) {
            if ($match.Groups.Count -gt 1) {
                [void]$assetNames.Add($match.Groups[1].Value)
            }
        }
    }

    return $assetNames
}

function Get-BundleBudgetFindings {
    param(
        [object[]]$Assets,
        [System.Collections.Generic.HashSet[string]]$InitialRouteAssetNames
    )

    $findings = New-Object System.Collections.Generic.List[object]
    $rules = @(
        (New-BundleBudgetRule -Name "postgres_wasm_gt_8mib" -Severity "warn" -Message "PGlite WebAssembly payload remains large and will materially affect cold start." -Predicate {
            param($asset)
            $asset.file -like "postgres-*.wasm" -and $asset.size_mib -gt 8
        }),
        (New-BundleBudgetRule -Name "postgres_data_gt_5mib" -Severity "warn" -Message "PGlite bootstrap data remains large and will materially affect first sync/bootstrap." -Predicate {
            param($asset)
            $asset.file -like "postgres-*.data" -and $asset.size_mib -gt 5
        }),
        (New-BundleBudgetRule -Name "pdf_worker_gt_1mib" -Severity "warn" -Message "PDF worker is above 1 MiB and should stay lazily used only." -Predicate {
            param($asset)
            $asset.file -like "pdf.worker.min-*.mjs" -and $asset.size_mib -gt 1
        }),
        (New-BundleBudgetRule -Name "crypto_chunk_gt_900kib" -Severity "warn" -Message "Crypto chunk is near 1 MiB and is currently on the initial route." -Predicate {
            param($asset)
            $asset.file -like "crypto-*.js" -and $asset.size_kib -gt 900 -and $asset.initial_route_reachable
        }),
        (New-BundleBudgetRule -Name "crypto_chunk_gt_900kib_lazy" -Severity "note" -Message "Crypto chunk is near 1 MiB but remains off the initial route." -Predicate {
            param($asset)
            $asset.file -like "crypto-*.js" -and $asset.size_kib -gt 900 -and (-not $asset.initial_route_reachable)
        }),
        (New-BundleBudgetRule -Name "main_chunk_gt_450kib" -Severity "warn" -Message "Main app shell chunk exceeds the preferred 450 KiB review threshold." -Predicate {
            param($asset)
            $asset.file -like "main-*.js" -and $asset.size_kib -gt 450
        }),
        (New-BundleBudgetRule -Name "dashboard_surfaces_gt_500kib" -Severity "warn" -Message "Dashboard surfaces chunk exceeds the preferred 500 KiB review threshold." -Predicate {
            param($asset)
            $asset.file -like "dashboard-surfaces-*.js" -and $asset.size_kib -gt 500
        }),
        (New-BundleBudgetRule -Name "workflows_view_gt_300kib" -Severity "warn" -Message "Workflow surface chunk remains large enough to merit continued split-point review." -Predicate {
            param($asset)
            $asset.file -like "WorkflowsView-*.js" -and $asset.size_kib -gt 300
        }),
        (New-BundleBudgetRule -Name "entry_css_gt_180kib" -Severity "note" -Message "Primary CSS bundle is above the preferred 180 KiB review threshold." -Predicate {
            param($asset)
            $asset.file -like "index-*.css" -and $asset.size_kib -gt 180
        })
    )

    foreach ($asset in $Assets) {
        foreach ($rule in $rules) {
            if (& $rule.predicate $asset) {
                $findings.Add([pscustomobject]@{
                    severity = $rule.severity
                    rule = $rule.name
                    file = $asset.file
                    initial_route_reachable = [bool]$asset.initial_route_reachable
                    size_bytes = $asset.size_bytes
                    size_kib = $asset.size_kib
                    size_mib = $asset.size_mib
                    message = $rule.message
                })
            }
        }
    }

    return @($findings.ToArray())
}

function Write-FrontendBundleReport {
    param(
        [string]$OutputDir,
        [string]$AssetsDir
    )

    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        return
    }

    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    $assetFiles = @(Get-ChildItem -LiteralPath $AssetsDir -File | Sort-Object Length -Descending)
    $initialRouteAssetNames = Get-InitialRouteAssetNames -DistDir $solidUiDistDir
    $assets = @(
        $assetFiles | ForEach-Object {
            [pscustomobject]@{
                file = $_.Name
                initial_route_reachable = $initialRouteAssetNames.Contains($_.Name)
                size_bytes = [long]$_.Length
                size_kib = [Math]::Round(($_.Length / 1KB), 2)
                size_mib = Format-SizeMiB -Bytes $_.Length
                extension = $_.Extension
            }
        }
    )
    $topAssets = @($assets | Select-Object -First 15)
    $findings = @(Get-BundleBudgetFindings -Assets $assets -InitialRouteAssetNames $initialRouteAssetNames)
    $warnCount = @($findings | Where-Object { $_.severity -eq "warn" }).Count
    $noteCount = @($findings | Where-Object { $_.severity -eq "note" }).Count
    $totalBytes = ($assetFiles | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $totalBytes) {
        $totalBytes = 0
    }
    $report = [pscustomobject]@{
        generated_at = [DateTime]::UtcNow.ToString("o")
        started_at = $startedAt
        solid_ui_dist_dir = $solidUiDistDir
        solid_ui_assets_dir = $AssetsDir
        initial_route_asset_count = $initialRouteAssetNames.Count
        asset_count = $assets.Count
        total_asset_bytes = [long]$totalBytes
        total_asset_mib = Format-SizeMiB -Bytes ([long]$totalBytes)
        warning_count = $warnCount
        note_count = $noteCount
        findings = @($findings)
        top_assets = @($topAssets)
    }

    $report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutputDir "frontend-bundle-report.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# Frontend Bundle Report")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
    [void]$markdown.AppendLine("- asset_count: $($report.asset_count)")
    [void]$markdown.AppendLine("- initial_route_asset_count: $($report.initial_route_asset_count)")
    [void]$markdown.AppendLine("- total_asset_mib: $($report.total_asset_mib)")
    [void]$markdown.AppendLine("- warning_count: $($report.warning_count)")
    [void]$markdown.AppendLine("- note_count: $($report.note_count)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Top Assets")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| file | MiB | KiB |")
    [void]$markdown.AppendLine("|---|---:|---:|")
    foreach ($asset in $topAssets) {
        [void]$markdown.AppendLine("| $($asset.file) | $($asset.size_mib) | $($asset.size_kib) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Findings")
    [void]$markdown.AppendLine()
    if ($findings.Count -eq 0) {
        [void]$markdown.AppendLine("- none")
    } else {
        foreach ($finding in $findings) {
            [void]$markdown.AppendLine("- [$($finding.severity)] $($finding.file): $($finding.message) ($($finding.size_mib) MiB; initial_route_reachable=$($finding.initial_route_reachable))")
        }
    }
    $markdown.ToString() | Set-Content (Join-Path $OutputDir "frontend-bundle-report.md")
}

Assert-PathExists -Path $typescriptSdkDir -Label "TypeScript SDK workspace"
Assert-PathExists -Path $solidUiDir -Label "Solid UI workspace"
Assert-PathExists -Path (Join-Path $typescriptSdkDir "node_modules") -Label "TypeScript SDK dependencies"
Assert-PathExists -Path (Join-Path $solidUiDir "node_modules") -Label "Solid UI dependencies"

Write-Output "[frontend-correctness] npm run typecheck (typescript-sdk)"
Invoke-CheckedCommand -FailureMessage "[frontend-correctness] typescript-sdk typecheck failed" -Command {
    Push-Location $typescriptSdkDir
    try {
        & npm.cmd run typecheck
    }
    finally {
        Pop-Location
    }
}

Write-Output "[frontend-correctness] npm run build (typescript-sdk)"
Invoke-CheckedCommand -FailureMessage "[frontend-correctness] typescript-sdk build failed" -Command {
    Push-Location $typescriptSdkDir
    try {
        & npm.cmd run build
    }
    finally {
        Pop-Location
    }
}

Write-Output "[frontend-correctness] npm run test:continuity (typescript-sdk)"
Invoke-CheckedCommand -FailureMessage "[frontend-correctness] typescript-sdk continuity tests failed" -Command {
    Push-Location $typescriptSdkDir
    try {
        & npm.cmd run test:continuity
    }
    finally {
        Pop-Location
    }
}

Write-Output "[frontend-correctness] npm run typecheck (solid-ui)"
Invoke-CheckedCommand -FailureMessage "[frontend-correctness] solid-ui typecheck failed" -Command {
    Push-Location $solidUiDir
    try {
        & npm.cmd run typecheck
    }
    finally {
        Pop-Location
    }
}

Write-Output "[frontend-correctness] npm run test:local-router (solid-ui)"
Invoke-CheckedCommand -FailureMessage "[frontend-correctness] solid-ui local-router tests failed" -Command {
    Push-Location $solidUiDir
    try {
        & npm.cmd run test:local-router
    }
    finally {
        Pop-Location
    }
}

Write-Output "[frontend-correctness] npm run build (solid-ui)"
Invoke-CheckedCommand -FailureMessage "[frontend-correctness] solid-ui build failed" -Command {
    Push-Location $solidUiDir
    try {
        & npm.cmd run build
    }
    finally {
        Pop-Location
    }
}

Assert-PathExists -Path $solidUiAssetsDir -Label "Solid UI build assets"
Write-FrontendBundleReport -OutputDir $OutDir -AssetsDir $solidUiAssetsDir
