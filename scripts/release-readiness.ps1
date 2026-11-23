param(
    [string]$EnvFile = "",
    [ValidateSet("auto", "always", "never")]
    [string]$ApiFlows = "auto",
    [string]$OutDir = "",
    [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"
$startedAt = [DateTime]::UtcNow.ToString("o")
$stepRustCorrectness = "pending"
$stepFrontendCorrectness = "pending"
$stepStartupPolicy = "pending"
$stepDeploymentOps = "pending"
$stepBackupVerify = "pending"
$stepRestoreDrill = "pending"
$failureStep = ""
$failureReason = ""
$frontendBundleReportPath = ""
$frontendBundleWarningCount = 0
$frontendBundleNoteCount = 0

function Set-StepFailed {
    param([string]$StepName)

    switch ($StepName) {
        "rust_correctness" { $script:stepRustCorrectness = "fail" }
        "frontend_correctness" { $script:stepFrontendCorrectness = "fail" }
        "startup_policy" { $script:stepStartupPolicy = "fail" }
        "deployment_ops" { $script:stepDeploymentOps = "fail" }
        "backup_verify" { $script:stepBackupVerify = "fail" }
        "restore_drill" { $script:stepRestoreDrill = "fail" }
    }
}

function Set-StepBlocked {
    param([string]$StepName)

    switch ($StepName) {
        "restore_drill" { $script:stepRestoreDrill = "blocked" }
    }
}

function Convert-ToBashPath {
    param([string]$Path)
    $normalized = $Path -replace '\\', '/'
    if ($normalized -match '^([A-Za-z]):/(.+)$') {
        return "/mnt/$($matches[1].ToLowerInvariant())/$($matches[2])"
    }
    return $normalized
}

function Get-EnvFileAssignedValue {
    param(
        [string]$Path,
        [string]$Name
    )
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path $Path)) {
        return ""
    }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $match = [regex]::Match($trimmed, '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
        if (-not $match.Success -or $match.Groups[1].Value -ne $Name) {
            continue
        }
        $value = $match.Groups[2].Value.Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        return $value.Trim()
    }
    return ""
}

function Invoke-CheckedCommand {
    param(
        [scriptblock]$Command,
        [string]$FailureMessage
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

function Write-BackupDirHint {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }
    if (Test-Path -LiteralPath $Path) {
        return
    }

    $isWindows = $PSVersionTable.PSVersion -and $env:OS -eq "Windows_NT"
    $looksUnixAbsolute = $Path -match '^/'
    if ($isWindows -and $looksUnixAbsolute) {
        Write-Warning "[release-readiness] backup path '$Path' looks like a Linux/Oracle target path but does not exist on this Windows host. Validate this env file on the Oracle runtime, or override -BackupDir with a real local snapshot root for workstation rehearsal."
        return
    }

    Write-Warning "[release-readiness] backup path '$Path' does not exist on this host. Provision a real backup archive root or point OMNYID_BACKUP_DIR/-BackupDir at an existing snapshot directory before running a production-labeled release gate."
}

function Write-ReleaseReadinessSummary {
    param([string]$Status)

    if ([string]::IsNullOrWhiteSpace($OutDir)) {
        return
    }

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

    @"
STATUS=$Status
STARTED_AT=$startedAt
ENV_FILE=$EnvFile
BACKUP_DIR=$BackupDir
STEP_RUST_CORRECTNESS=$stepRustCorrectness
STEP_FRONTEND_CORRECTNESS=$stepFrontendCorrectness
STEP_STARTUP_POLICY=$stepStartupPolicy
STEP_DEPLOYMENT_OPS=$stepDeploymentOps
STEP_BACKUP_VERIFY=$stepBackupVerify
STEP_RESTORE_DRILL=$stepRestoreDrill
FAILURE_STEP=$failureStep
FAILURE_REASON=$failureReason
"@ | Set-Content (Join-Path $OutDir "summary.env")

    @"
# Release Readiness Summary

- status: $Status
- started_at: $startedAt
- env_file: $(if ([string]::IsNullOrWhiteSpace($EnvFile)) { "none" } else { $EnvFile })
- backup_dir: $(if ([string]::IsNullOrWhiteSpace($BackupDir)) { "none" } else { $BackupDir })
- rust_correctness: $stepRustCorrectness
- frontend_correctness: $stepFrontendCorrectness
- startup_policy: $stepStartupPolicy
- deployment_ops: $stepDeploymentOps
- backup_verify: $stepBackupVerify
- restore_drill: $stepRestoreDrill
- frontend_bundle_report_path: $(if ([string]::IsNullOrWhiteSpace($frontendBundleReportPath)) { "none" } else { $frontendBundleReportPath })
- frontend_bundle_warning_count: $frontendBundleWarningCount
- frontend_bundle_note_count: $frontendBundleNoteCount
- failure_step: $(if ([string]::IsNullOrWhiteSpace($failureStep)) { "none" } else { $failureStep })
- failure_reason: $(if ([string]::IsNullOrWhiteSpace($failureReason)) { "none" } else { $failureReason })
"@ | Set-Content (Join-Path $OutDir "summary.md")

    @{
        status = $Status
        started_at = $startedAt
        env_file = $EnvFile
        backup_dir = $BackupDir
        failure_step = $failureStep
        failure_reason = $failureReason
        artifact_paths = @{
            frontend_bundle_report = $frontendBundleReportPath
        }
        frontend_bundle_warning_count = $frontendBundleWarningCount
        frontend_bundle_note_count = $frontendBundleNoteCount
        steps = @{
            rust_correctness = $stepRustCorrectness
            frontend_correctness = $stepFrontendCorrectness
            startup_policy = $stepStartupPolicy
            deployment_ops = $stepDeploymentOps
            backup_verify = $stepBackupVerify
            restore_drill = $stepRestoreDrill
        }
    } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "summary.json")
}

try {
    Write-Output "[release-readiness] starting local release readiness check"

    if ([string]::IsNullOrWhiteSpace($BackupDir) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $BackupDir = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_BACKUP_DIR"
    }
    if ([string]::IsNullOrWhiteSpace($BackupDir) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_BACKUP_DIR)) {
        $BackupDir = $env:OMNYID_BACKUP_DIR
    }
    Write-BackupDirHint -Path $BackupDir

    Write-Output "[release-readiness] step 1/6: rust correctness"
    try {
        Invoke-CheckedCommand -FailureMessage "[release-readiness] rust correctness failed" -Command {
            & (Join-Path $PSScriptRoot "rust-correctness.ps1") -ApiFlows $ApiFlows
        }
    }
    catch {
        Set-StepFailed "rust_correctness"
        $failureStep = "rust_correctness"
        throw
    }
    $stepRustCorrectness = "pass"

    Write-Output "[release-readiness] step 2/6: frontend correctness"
    try {
        $frontendCorrectnessOutDir =
            if ([string]::IsNullOrWhiteSpace($OutDir)) {
                ""
            } else {
                Join-Path $OutDir "frontend-correctness"
            }
        Invoke-CheckedCommand -FailureMessage "[release-readiness] frontend correctness failed" -Command {
            & (Join-Path $PSScriptRoot "frontend-correctness.ps1") -OutDir $frontendCorrectnessOutDir
        }
        if (-not [string]::IsNullOrWhiteSpace($frontendCorrectnessOutDir)) {
            $candidateFrontendBundleReport = Join-Path $frontendCorrectnessOutDir "frontend-bundle-report.json"
            if (Test-Path -LiteralPath $candidateFrontendBundleReport) {
                $frontendBundleReportPath = (Resolve-Path -LiteralPath $candidateFrontendBundleReport).Path
                $frontendBundleReport = Get-Content -LiteralPath $candidateFrontendBundleReport -Raw | ConvertFrom-Json
                if ($null -ne $frontendBundleReport.PSObject.Properties["warning_count"]) {
                    $frontendBundleWarningCount = [int]$frontendBundleReport.warning_count
                }
                if ($null -ne $frontendBundleReport.PSObject.Properties["note_count"]) {
                    $frontendBundleNoteCount = [int]$frontendBundleReport.note_count
                }
            }
        }
    }
    catch {
        Set-StepFailed "frontend_correctness"
        $failureStep = "frontend_correctness"
        throw
    }
    $stepFrontendCorrectness = "pass"

    if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        Write-Output "[release-readiness] step 3/6: production startup policy ($EnvFile)"
        try {
            Invoke-CheckedCommand -FailureMessage "[release-readiness] production startup policy failed" -Command {
                & (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $EnvFile -RequireProduction
            }
        }
        catch {
            Set-StepFailed "startup_policy"
            $failureStep = "startup_policy"
            throw
        }
        $stepStartupPolicy = "pass"
    }
    else {
        Write-Output "[release-readiness] step 3/6: production startup policy skipped (no env file supplied)"
        $stepStartupPolicy = "skipped"
    }

    if (-not [string]::IsNullOrWhiteSpace($EnvFile) -and [string]::IsNullOrWhiteSpace($BackupDir)) {
        $failureStep = "backup_verify"
        $failureReason = "production release readiness requires -BackupDir or OMNYID_BACKUP_DIR"
        throw "[release-readiness] production release readiness requires -BackupDir or OMNYID_BACKUP_DIR"
    }

    Write-Output "[release-readiness] step 4/6: deployment ops self-test"
    try {
        Invoke-CheckedCommand -FailureMessage "[release-readiness] deployment ops self-test failed" -Command {
            & (Join-Path $PSScriptRoot "deployment-ops-pwsh-selftest.ps1")
        }
    }
    catch {
        Set-StepFailed "deployment_ops"
        $failureStep = "deployment_ops"
        $failureReason = "deployment ops self-test failed"
        throw
    }
    $stepDeploymentOps = "pass"

    if (-not [string]::IsNullOrWhiteSpace($BackupDir)) {
        Write-Output "[release-readiness] step 5/6: backup verification ($BackupDir)"
        $backupScript = Convert-ToBashPath (Join-Path $PSScriptRoot "omnyid-backup-verify.sh")
        $bashBackupDir = Convert-ToBashPath $BackupDir
        try {
            Invoke-CheckedCommand -FailureMessage "[release-readiness] backup verification failed" -Command {
                & bash $backupScript $bashBackupDir
            }
        }
        catch {
            Set-StepFailed "backup_verify"
            Set-StepBlocked "restore_drill"
            $failureStep = "backup_verify"
            $failureReason = "backup verification failed"
            throw
        }
        $stepBackupVerify = "pass"

        Write-Output "[release-readiness] step 6/6: restore drill ($BackupDir)"
        $restoreDrillScript = Convert-ToBashPath (Join-Path $PSScriptRoot "omnyid-restore-drill.sh")
        try {
            Invoke-CheckedCommand -FailureMessage "[release-readiness] restore drill failed" -Command {
                & bash $restoreDrillScript $bashBackupDir
            }
        }
        catch {
            Set-StepFailed "restore_drill"
            $failureStep = "restore_drill"
            $failureReason = "restore drill failed"
            throw
        }
        $stepRestoreDrill = "pass"
    }
    else {
        Write-Output "[release-readiness] step 5/6: backup verification skipped (no backup dir supplied)"
        $stepBackupVerify = "skipped"
        Write-Output "[release-readiness] step 6/6: restore drill skipped (no backup dir supplied)"
        $stepRestoreDrill = "skipped"
    }

    Write-Output "[release-readiness] local release readiness passed"
    $failureStep = ""
    $failureReason = ""
    Write-ReleaseReadinessSummary -Status "pass"
}
catch {
    Write-ReleaseReadinessSummary -Status "fail"
    throw
}
