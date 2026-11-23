Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("frontend-correctness-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "[frontend-correctness-pwsh-selftest] $Message"
    }
}

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "[frontend-correctness-pwsh-selftest] $Message (expected=$Expected actual=$Actual)"
    }
}

function Get-FrontendCorrectnessHelperPath {
    param([string]$WorkingRoot)

    $sourcePath = Join-Path $PSScriptRoot "frontend-correctness.ps1"
    $source = Get-Content -LiteralPath $sourcePath -Raw
    $cutLine = 'Assert-PathExists -Path $typescriptSdkDir -Label "TypeScript SDK workspace"'
    $cutIndex = $source.IndexOf($cutLine)
    if ($cutIndex -lt 0) {
        throw "[frontend-correctness-pwsh-selftest] could not isolate helper functions from frontend-correctness.ps1"
    }

    $helperSource = $source.Substring(0, $cutIndex)
    $helperPath = Join-Path $WorkingRoot "frontend-correctness-helper.ps1"
    Set-Content -LiteralPath $helperPath -Value $helperSource -Encoding ASCII
    return $helperPath
}

function New-AssetFile {
    param(
        [string]$Path,
        [int]$SizeBytes
    )

    $bytes = New-Object byte[] $SizeBytes
    [System.IO.File]::WriteAllBytes($Path, $bytes)
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    $helperPath = Get-FrontendCorrectnessHelperPath -WorkingRoot $tmpRoot
    . $helperPath -OutDir ""

    $distDir = Join-Path $tmpRoot "dist"
    $assetsDir = Join-Path $distDir "assets"
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

    $indexHtmlPath = Join-Path $distDir "index.html"
    @'
<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/workspace/assets/index-abc.css" />
  </head>
  <body>
    <script type="module" src="/workspace/assets/main-abc.js"></script>
  </body>
</html>
'@ | Set-Content -LiteralPath $indexHtmlPath -Encoding ASCII

    New-AssetFile -Path (Join-Path $assetsDir "main-abc.js") -SizeBytes 102400
    New-AssetFile -Path (Join-Path $assetsDir "index-abc.css") -SizeBytes 102400
    New-AssetFile -Path (Join-Path $assetsDir "crypto-abc.js") -SizeBytes 972800
    New-AssetFile -Path (Join-Path $assetsDir "postgres-abc.data") -SizeBytes 5452596

    $script:solidUiDistDir = $distDir

    $initialRouteAssetNames = Get-InitialRouteAssetNames -DistDir $distDir
    Assert-Equal -Actual $initialRouteAssetNames.Count -Expected 2 -Message "expected two initial-route assets"
    Assert-True -Condition $initialRouteAssetNames.Contains("main-abc.js") -Message "expected main chunk to be initial-route reachable"
    Assert-True -Condition $initialRouteAssetNames.Contains("index-abc.css") -Message "expected css chunk to be initial-route reachable"
    Assert-True -Condition (-not $initialRouteAssetNames.Contains("crypto-abc.js")) -Message "expected crypto chunk to remain off the initial route"

    $assets = @(
        Get-ChildItem -LiteralPath $assetsDir -File | Sort-Object Name | ForEach-Object {
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

    $lazyFindings = @(Get-BundleBudgetFindings -Assets $assets -InitialRouteAssetNames $initialRouteAssetNames)
    $lazyCryptoNote = @($lazyFindings | Where-Object { $_.rule -eq "crypto_chunk_gt_900kib_lazy" })
    $eagerCryptoWarn = @($lazyFindings | Where-Object { $_.rule -eq "crypto_chunk_gt_900kib" })
    $postgresWarn = @($lazyFindings | Where-Object { $_.rule -eq "postgres_data_gt_5mib" })
    Assert-Equal -Actual $lazyCryptoNote.Count -Expected 1 -Message "expected lazy crypto finding to be a note"
    Assert-Equal -Actual $eagerCryptoWarn.Count -Expected 0 -Message "did not expect eager crypto warning when chunk is lazy"
    Assert-Equal -Actual $postgresWarn.Count -Expected 1 -Message "expected postgres data warning to remain present"

    $reportOutDir = Join-Path $tmpRoot "report"
    Write-FrontendBundleReport -OutputDir $reportOutDir -AssetsDir $assetsDir
    $report = Get-Content -LiteralPath (Join-Path $reportOutDir "frontend-bundle-report.json") -Raw | ConvertFrom-Json
    Assert-Equal -Actual $report.initial_route_asset_count -Expected 2 -Message "expected report to include initial route asset count"
    Assert-Equal -Actual $report.warning_count -Expected 1 -Message "expected one warning in lazy crypto scenario"
    Assert-Equal -Actual $report.note_count -Expected 1 -Message "expected one note in lazy crypto scenario"

    @'
<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/workspace/assets/index-abc.css" />
  </head>
  <body>
    <script type="module" src="/workspace/assets/main-abc.js"></script>
    <script type="module" src="/workspace/assets/crypto-abc.js"></script>
  </body>
</html>
'@ | Set-Content -LiteralPath $indexHtmlPath -Encoding ASCII

    $eagerInitialRouteAssetNames = Get-InitialRouteAssetNames -DistDir $distDir
    $eagerAssets = @(
        Get-ChildItem -LiteralPath $assetsDir -File | Sort-Object Name | ForEach-Object {
            [pscustomobject]@{
                file = $_.Name
                initial_route_reachable = $eagerInitialRouteAssetNames.Contains($_.Name)
                size_bytes = [long]$_.Length
                size_kib = [Math]::Round(($_.Length / 1KB), 2)
                size_mib = Format-SizeMiB -Bytes $_.Length
                extension = $_.Extension
            }
        }
    )

    $eagerFindings = @(Get-BundleBudgetFindings -Assets $eagerAssets -InitialRouteAssetNames $eagerInitialRouteAssetNames)
    Assert-Equal -Actual @($eagerFindings | Where-Object { $_.rule -eq "crypto_chunk_gt_900kib" }).Count -Expected 1 -Message "expected eager crypto warning when chunk is on the initial route"
    Assert-Equal -Actual @($eagerFindings | Where-Object { $_.rule -eq "crypto_chunk_gt_900kib_lazy" }).Count -Expected 0 -Message "did not expect lazy crypto note when chunk is on the initial route"

    Write-Output "[frontend-correctness-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
