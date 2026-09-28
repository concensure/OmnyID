param(
    [ValidateSet("advisory", "no-regression", "refresh-baseline", "selftest", "status", "local")]
    [string]$Mode = "advisory",
    [string]$OutDir = "artifacts/rust-hygiene",
    [string]$BaselineFile = "",
    [switch]$AllowRegressionBaseline
)

$ErrorActionPreference = "Stop"

function Get-BashCommand {
    $bash = Get-Command bash -ErrorAction SilentlyContinue
    if (-not $bash) {
        throw "bash is required to run the Rust hygiene helpers."
    }
    return $bash.Source
}

function Convert-ToBashPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $Path
    }

    $fullPath = $Path
    if (-not [System.IO.Path]::IsPathRooted($fullPath)) {
        $fullPath = Join-Path (Get-Location) $fullPath
    }

    $resolved = [System.IO.Path]::GetFullPath($fullPath)
    $normalized = $resolved -replace '\\', '/'
    if ($normalized -match '^([A-Za-z]):/(.*)$') {
        $drive = $matches[1].ToLowerInvariant()
        $rest = $matches[2]
        return "/mnt/$drive/$rest"
    }

    return $normalized
}

function Invoke-BashScript {
    param(
        [string]$ScriptPath,
        [string[]]$Arguments = @(),
        [hashtable]$Environment = @{}
    )

    $bash = Get-BashCommand
    $previous = @{}

    try {
        foreach ($key in $Environment.Keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key)
            [Environment]::SetEnvironmentVariable($key, $Environment[$key])
        }

        $bashScriptPath = Convert-ToBashPath $ScriptPath
        $bashArguments = @()
        foreach ($argument in $Arguments) {
            if ([string]::IsNullOrWhiteSpace($argument)) {
                $bashArguments += $argument
            }
            elseif ($argument -match '^[A-Za-z]:\\' -or $argument -match '^[A-Za-z]:/' -or -not [System.IO.Path]::IsPathRooted($argument)) {
                $bashArguments += (Convert-ToBashPath $argument)
            }
            else {
                $bashArguments += $argument
            }
        }

        & $bash $bashScriptPath @bashArguments
        return $LASTEXITCODE
    }
    finally {
        foreach ($key in $Environment.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key])
        }
    }
}

function Read-KeyValueFile {
    param([string]$Path)

    $values = @{}
    foreach ($line in Get-Content $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#")) {
            continue
        }

        $parts = $line -split '=', 2
        if ($parts.Length -ne 2) {
            continue
        }

        $values[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $values
}

function Show-Status {
    param([string]$Directory)

    $summaryEnv = Join-Path $Directory "summary.env"
    if (-not (Test-Path $summaryEnv)) {
        throw "Missing summary file: $summaryEnv"
    }

    $summary = Read-KeyValueFile $summaryEnv
    $verdictEnv = Join-Path $Directory "no-regression-verdict.env"
    $verdict = if (Test-Path $verdictEnv) { Read-KeyValueFile $verdictEnv } else { @{} }

    Write-Output "Rust hygiene status"
    Write-Output "  status: $($summary["STATUS"])"
    Write-Output "  baseline: $($summary["BASELINE"])"
    Write-Output "  fmt files: $($summary["FMT_FILES"]) (delta $($summary["FMT_DELTA"]))"
    Write-Output "  clippy errors: $($summary["CLIPPY_ERRORS"]) (delta $($summary["CLIPPY_ERRORS_DELTA"]))"
    Write-Output "  clippy warnings: $($summary["CLIPPY_WARNINGS"]) (delta $($summary["CLIPPY_WARNINGS_DELTA"]))"
    Write-Output "  regression detected: $($summary["REGRESSION_DETECTED"])"
    if ($verdict.ContainsKey("VERDICT")) {
        Write-Output "  no-regression verdict: $($verdict["VERDICT"])"
    }
}

function Invoke-WrapperMode {
    param(
        [string]$SelectedMode,
        [string]$Directory,
        [hashtable]$Environment
    )

    if ($SelectedMode -eq "status") {
        Show-Status -Directory $Directory
        return 0
    }

    $scriptName = switch ($SelectedMode) {
        "advisory" { "rust-hygiene.sh" }
        "no-regression" { "rust-hygiene-no-regression.sh" }
        "refresh-baseline" { "rust-hygiene-refresh-baseline.sh" }
        "selftest" { "rust-hygiene-selftest.sh" }
        default { throw "Unsupported mode: $SelectedMode" }
    }

    $scriptPath = Join-Path $scriptRoot $scriptName
    $arguments = if ($SelectedMode -eq "selftest") { @() } else { @($Directory) }
    return (Invoke-BashScript -ScriptPath $scriptPath -Arguments $arguments -Environment $Environment)
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envOverrides = @{}
if ($BaselineFile) {
    $envOverrides["RUST_HYGIENE_BASELINE"] = Convert-ToBashPath $BaselineFile
}
if ($AllowRegressionBaseline) {
    $envOverrides["ALLOW_RUST_HYGIENE_REGRESSION_BASELINE"] = "1"
}

$scriptName = switch ($Mode) {
    "advisory" { "rust-hygiene.sh" }
    "no-regression" { "rust-hygiene-no-regression.sh" }
    "refresh-baseline" { "rust-hygiene-refresh-baseline.sh" }
    "selftest" { "rust-hygiene-selftest.sh" }
    "status" { "" }
}

if ($Mode -eq "local") {
    $advisoryExit = Invoke-WrapperMode -SelectedMode "advisory" -Directory $OutDir -Environment $envOverrides
    $noRegressionExit = Invoke-WrapperMode -SelectedMode "no-regression" -Directory $OutDir -Environment $envOverrides
    Invoke-WrapperMode -SelectedMode "status" -Directory $OutDir -Environment $envOverrides | Out-Host

    if ($noRegressionExit -ne 0) {
        exit $noRegressionExit
    }
    exit $advisoryExit
}

$exitCode = Invoke-WrapperMode -SelectedMode $Mode -Directory $OutDir -Environment $envOverrides
exit $exitCode
