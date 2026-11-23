param(
    [string]$OutDir = "",
    [string]$StatusPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Parse-OptionalDateTimeOffset {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    try {
        return [DateTimeOffset]::Parse($Value, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    catch {
        return $null
    }
}

function Get-OptionalArtifactFreshnessValue {
    param(
        [AllowNull()]
        [object]$FreshnessObject,
        [string]$PropertyName
    )

    if ($null -eq $FreshnessObject) {
        return $null
    }

    $property = $FreshnessObject.PSObject.Properties[$PropertyName]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }

    return $property.Value
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $PSScriptRoot "..\artifacts\production-readiness-refresh-current"
}
if ([string]::IsNullOrWhiteSpace($StatusPath)) {
    $StatusPath = Join-Path $OutDir "production-readiness-refresh-detached.json"
}

if (-not (Test-Path -LiteralPath $StatusPath)) {
    throw "[production-readiness-refresh-status] status file not found: $StatusPath"
}

$status = Get-Content -LiteralPath $StatusPath -Raw | ConvertFrom-Json
$resolvedOutDir =
    if (-not [string]::IsNullOrWhiteSpace($OutDir) -and (Test-Path -LiteralPath $OutDir)) {
        (Resolve-Path -LiteralPath $OutDir).Path
    } elseif ($null -ne $status.PSObject.Properties["out_dir"] -and -not [string]::IsNullOrWhiteSpace([string]$status.out_dir)) {
        [string]$status.out_dir
    } else {
        $OutDir
    }

$reportPath =
    if ($null -ne $status.PSObject.Properties["report_path"] -and -not [string]::IsNullOrWhiteSpace([string]$status.report_path)) {
        [string]$status.report_path
    } else {
        Join-Path $resolvedOutDir "production-readiness-refresh.json"
    }
$stdoutPath =
    if ($null -ne $status.PSObject.Properties["stdout_path"] -and -not [string]::IsNullOrWhiteSpace([string]$status.stdout_path)) {
        [string]$status.stdout_path
    } else {
        Join-Path $resolvedOutDir "production-readiness-refresh-detached.stdout.log"
    }
$stderrPath =
    if ($null -ne $status.PSObject.Properties["stderr_path"] -and -not [string]::IsNullOrWhiteSpace([string]$status.stderr_path)) {
        [string]$status.stderr_path
    } else {
        Join-Path $resolvedOutDir "production-readiness-refresh-detached.stderr.log"
    }

$launcherStatus = if ($null -ne $status.PSObject.Properties["status"]) { [string]$status.status } else { "unknown" }
$childPid = if ($null -ne $status.PSObject.Properties["pid"] -and $null -ne $status.pid) { [int]$status.pid } else { $null }
$childProcess = if ($null -ne $childPid) { Get-Process -Id $childPid -ErrorAction SilentlyContinue } else { $null }
$reportExists = Test-Path -LiteralPath $reportPath
$stderrTail = ""
if (Test-Path -LiteralPath $stderrPath) {
    $stderrTail = ((Get-Content -LiteralPath $stderrPath -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine).Trim()
}

$derivedStatus =
    if ($launcherStatus -eq "completed") {
        "completed"
    } elseif ($launcherStatus -eq "failed") {
        "failed"
    } elseif ($reportExists -and $null -eq $childProcess) {
        "completed"
    } elseif ($null -ne $childProcess) {
        "running"
    } elseif (-not [string]::IsNullOrWhiteSpace($stderrTail)) {
        "failed"
    } else {
        "stale"
    }

$reportGeneratedAt = $null
$reportRefreshOracleRemediation = $null
$reportGeneratedStrictComparisonLane = $null
$reportOracleRemediationPath = $null
$reportOracleRemediationExists = $null
$reportOracleRemediationGeneratedAt = $null
$reportOracleRemediationAgeHours = $null
$reportOracleRemediationStale = $null
$reportOracleCleanupExecutePath = $null
$reportOracleCleanupExecuteExists = $null
$reportOracleCleanupExecuteGeneratedAt = $null
$reportOracleCleanupExecuteAgeHours = $null
$reportOracleCleanupExecuteStale = $null
$reportOracleWalSlotRemediationPath = $null
$reportOracleWalSlotRemediationExists = $null
$reportOracleWalSlotRemediationGeneratedAt = $null
$reportOracleWalSlotRemediationAgeHours = $null
$reportOracleWalSlotRemediationStale = $null
$reportOracleSyntheticCleanupPath = $null
$reportOracleSyntheticCleanupExists = $null
$reportOracleSyntheticCleanupGeneratedAt = $null
$reportOracleSyntheticCleanupAgeHours = $null
$reportOracleSyntheticCleanupStale = $null
$reportOracleOperationalHistoryCleanupPath = $null
$reportOracleOperationalHistoryCleanupExists = $null
$reportOracleOperationalHistoryCleanupGeneratedAt = $null
$reportOracleOperationalHistoryCleanupAgeHours = $null
$reportOracleOperationalHistoryCleanupStale = $null
$reportOracleRemediationOutcome = $null
if ($reportExists) {
    try {
        $reportPayload = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
        if ($null -ne $reportPayload.PSObject.Properties["generated_at"]) {
            $reportGeneratedAt = [string]$reportPayload.generated_at
        }
        if ($null -ne $reportPayload.PSObject.Properties["refresh_oracle_remediation"]) {
            $reportRefreshOracleRemediation = [bool]$reportPayload.refresh_oracle_remediation
        }
        if ($null -ne $reportPayload.PSObject.Properties["generated_strict_comparison_lane"]) {
            $reportGeneratedStrictComparisonLane = [bool]$reportPayload.generated_strict_comparison_lane
        }
        if ($null -ne $reportPayload.PSObject.Properties["artifact_paths"] -and $null -ne $reportPayload.artifact_paths) {
            if ($null -ne $reportPayload.artifact_paths.PSObject.Properties["oracle_remediation"]) {
                $reportOracleRemediationPath = [string]$reportPayload.artifact_paths.oracle_remediation
                if (-not [string]::IsNullOrWhiteSpace($reportOracleRemediationPath)) {
                    $reportOracleRemediationExists = Test-Path -LiteralPath $reportOracleRemediationPath
                }
            }
            if ($null -ne $reportPayload.artifact_paths.PSObject.Properties["oracle_cleanup_execute"]) {
                $reportOracleCleanupExecutePath = [string]$reportPayload.artifact_paths.oracle_cleanup_execute
                if (-not [string]::IsNullOrWhiteSpace($reportOracleCleanupExecutePath)) {
                    $reportOracleCleanupExecuteExists = Test-Path -LiteralPath $reportOracleCleanupExecutePath
                }
            }
            if ($null -ne $reportPayload.artifact_paths.PSObject.Properties["oracle_wal_slot_remediation"]) {
                $reportOracleWalSlotRemediationPath = [string]$reportPayload.artifact_paths.oracle_wal_slot_remediation
                if (-not [string]::IsNullOrWhiteSpace($reportOracleWalSlotRemediationPath)) {
                    $reportOracleWalSlotRemediationExists = Test-Path -LiteralPath $reportOracleWalSlotRemediationPath
                }
            }
            if ($null -ne $reportPayload.artifact_paths.PSObject.Properties["oracle_synthetic_cleanup"]) {
                $reportOracleSyntheticCleanupPath = [string]$reportPayload.artifact_paths.oracle_synthetic_cleanup
                if (-not [string]::IsNullOrWhiteSpace($reportOracleSyntheticCleanupPath)) {
                    $reportOracleSyntheticCleanupExists = Test-Path -LiteralPath $reportOracleSyntheticCleanupPath
                }
            }
            if ($null -ne $reportPayload.artifact_paths.PSObject.Properties["oracle_operational_history_cleanup"]) {
                $reportOracleOperationalHistoryCleanupPath = [string]$reportPayload.artifact_paths.oracle_operational_history_cleanup
                if (-not [string]::IsNullOrWhiteSpace($reportOracleOperationalHistoryCleanupPath)) {
                    $reportOracleOperationalHistoryCleanupExists = Test-Path -LiteralPath $reportOracleOperationalHistoryCleanupPath
                }
            }
        }
        if ($null -ne $reportPayload.PSObject.Properties["reused_artifact_freshness"] -and $null -ne $reportPayload.reused_artifact_freshness) {
            if ($null -ne $reportPayload.reused_artifact_freshness.PSObject.Properties["oracle_remediation"]) {
                $oracleRemediationFreshness = $reportPayload.reused_artifact_freshness.oracle_remediation
                $reportOracleRemediationGeneratedAt = [string](Get-OptionalArtifactFreshnessValue -FreshnessObject $oracleRemediationFreshness -PropertyName "generated_at")
                $reportOracleRemediationAgeHours = Get-OptionalArtifactFreshnessValue -FreshnessObject $oracleRemediationFreshness -PropertyName "age_hours"
                $reportOracleRemediationStale = Get-OptionalArtifactFreshnessValue -FreshnessObject $oracleRemediationFreshness -PropertyName "stale"
            }
            if ($null -ne $reportPayload.reused_artifact_freshness.PSObject.Properties["oracle_cleanup_execute"]) {
                $oracleCleanupExecuteFreshness = $reportPayload.reused_artifact_freshness.oracle_cleanup_execute
                $reportOracleCleanupExecuteGeneratedAt = [string](Get-OptionalArtifactFreshnessValue -FreshnessObject $oracleCleanupExecuteFreshness -PropertyName "generated_at")
                $reportOracleCleanupExecuteAgeHours = Get-OptionalArtifactFreshnessValue -FreshnessObject $oracleCleanupExecuteFreshness -PropertyName "age_hours"
                $reportOracleCleanupExecuteStale = Get-OptionalArtifactFreshnessValue -FreshnessObject $oracleCleanupExecuteFreshness -PropertyName "stale"
            }
            if ($null -ne $reportPayload.reused_artifact_freshness.PSObject.Properties["oracle_wal_slot_remediation"]) {
                $walSlotFreshness = $reportPayload.reused_artifact_freshness.oracle_wal_slot_remediation
                $reportOracleWalSlotRemediationGeneratedAt = [string](Get-OptionalArtifactFreshnessValue -FreshnessObject $walSlotFreshness -PropertyName "generated_at")
                $reportOracleWalSlotRemediationAgeHours = Get-OptionalArtifactFreshnessValue -FreshnessObject $walSlotFreshness -PropertyName "age_hours"
                $reportOracleWalSlotRemediationStale = Get-OptionalArtifactFreshnessValue -FreshnessObject $walSlotFreshness -PropertyName "stale"
            }
            if ($null -ne $reportPayload.reused_artifact_freshness.PSObject.Properties["oracle_synthetic_cleanup"]) {
                $syntheticCleanupFreshness = $reportPayload.reused_artifact_freshness.oracle_synthetic_cleanup
                $reportOracleSyntheticCleanupGeneratedAt = [string](Get-OptionalArtifactFreshnessValue -FreshnessObject $syntheticCleanupFreshness -PropertyName "generated_at")
                $reportOracleSyntheticCleanupAgeHours = Get-OptionalArtifactFreshnessValue -FreshnessObject $syntheticCleanupFreshness -PropertyName "age_hours"
                $reportOracleSyntheticCleanupStale = Get-OptionalArtifactFreshnessValue -FreshnessObject $syntheticCleanupFreshness -PropertyName "stale"
            }
            if ($null -ne $reportPayload.reused_artifact_freshness.PSObject.Properties["oracle_operational_history_cleanup"]) {
                $operationalHistoryCleanupFreshness = $reportPayload.reused_artifact_freshness.oracle_operational_history_cleanup
                $reportOracleOperationalHistoryCleanupGeneratedAt = [string](Get-OptionalArtifactFreshnessValue -FreshnessObject $operationalHistoryCleanupFreshness -PropertyName "generated_at")
                $reportOracleOperationalHistoryCleanupAgeHours = Get-OptionalArtifactFreshnessValue -FreshnessObject $operationalHistoryCleanupFreshness -PropertyName "age_hours"
                $reportOracleOperationalHistoryCleanupStale = Get-OptionalArtifactFreshnessValue -FreshnessObject $operationalHistoryCleanupFreshness -PropertyName "stale"
            }
        }
        if ($null -eq $reportOracleRemediationGeneratedAt -and -not [string]::IsNullOrWhiteSpace($reportOracleRemediationPath) -and $reportOracleRemediationExists) {
            $oracleRemediationItem = Get-Item -LiteralPath $reportOracleRemediationPath -ErrorAction SilentlyContinue
            if ($null -ne $oracleRemediationItem) {
                $reportOracleRemediationGeneratedAt = $oracleRemediationItem.LastWriteTimeUtc.ToString("o")
                $reportOracleRemediationAgeHours = [Math]::Round((([DateTimeOffset]::UtcNow - ([DateTimeOffset]$oracleRemediationItem.LastWriteTimeUtc)).TotalHours), 1)
                $reportOracleRemediationStale = ([double]$reportOracleRemediationAgeHours) -gt 24
            }
        }
        if ($null -eq $reportOracleCleanupExecuteGeneratedAt -and -not [string]::IsNullOrWhiteSpace($reportOracleCleanupExecutePath) -and $reportOracleCleanupExecuteExists) {
            $oracleCleanupExecuteItem = Get-Item -LiteralPath $reportOracleCleanupExecutePath -ErrorAction SilentlyContinue
            if ($null -ne $oracleCleanupExecuteItem) {
                $reportOracleCleanupExecuteGeneratedAt = $oracleCleanupExecuteItem.LastWriteTimeUtc.ToString("o")
                $reportOracleCleanupExecuteAgeHours = [Math]::Round((([DateTimeOffset]::UtcNow - ([DateTimeOffset]$oracleCleanupExecuteItem.LastWriteTimeUtc)).TotalHours), 1)
                $reportOracleCleanupExecuteStale = ([double]$reportOracleCleanupExecuteAgeHours) -gt 24
            }
        }
        if ($null -eq $reportOracleWalSlotRemediationGeneratedAt -and -not [string]::IsNullOrWhiteSpace($reportOracleWalSlotRemediationPath) -and $reportOracleWalSlotRemediationExists) {
            $walSlotItem = Get-Item -LiteralPath $reportOracleWalSlotRemediationPath -ErrorAction SilentlyContinue
            if ($null -ne $walSlotItem) {
                $reportOracleWalSlotRemediationGeneratedAt = $walSlotItem.LastWriteTimeUtc.ToString("o")
                $reportOracleWalSlotRemediationAgeHours = [Math]::Round((([DateTimeOffset]::UtcNow - ([DateTimeOffset]$walSlotItem.LastWriteTimeUtc)).TotalHours), 1)
                $reportOracleWalSlotRemediationStale = ([double]$reportOracleWalSlotRemediationAgeHours) -gt 24
            }
        }
        if ($null -eq $reportOracleSyntheticCleanupGeneratedAt -and -not [string]::IsNullOrWhiteSpace($reportOracleSyntheticCleanupPath) -and $reportOracleSyntheticCleanupExists) {
            $syntheticCleanupItem = Get-Item -LiteralPath $reportOracleSyntheticCleanupPath -ErrorAction SilentlyContinue
            if ($null -ne $syntheticCleanupItem) {
                $reportOracleSyntheticCleanupGeneratedAt = $syntheticCleanupItem.LastWriteTimeUtc.ToString("o")
                $reportOracleSyntheticCleanupAgeHours = [Math]::Round((([DateTimeOffset]::UtcNow - ([DateTimeOffset]$syntheticCleanupItem.LastWriteTimeUtc)).TotalHours), 1)
                $reportOracleSyntheticCleanupStale = ([double]$reportOracleSyntheticCleanupAgeHours) -gt 24
            }
        }
        if ($null -eq $reportOracleOperationalHistoryCleanupGeneratedAt -and -not [string]::IsNullOrWhiteSpace($reportOracleOperationalHistoryCleanupPath) -and $reportOracleOperationalHistoryCleanupExists) {
            $operationalHistoryCleanupItem = Get-Item -LiteralPath $reportOracleOperationalHistoryCleanupPath -ErrorAction SilentlyContinue
            if ($null -ne $operationalHistoryCleanupItem) {
                $reportOracleOperationalHistoryCleanupGeneratedAt = $operationalHistoryCleanupItem.LastWriteTimeUtc.ToString("o")
                $reportOracleOperationalHistoryCleanupAgeHours = [Math]::Round((([DateTimeOffset]::UtcNow - ([DateTimeOffset]$operationalHistoryCleanupItem.LastWriteTimeUtc)).TotalHours), 1)
                $reportOracleOperationalHistoryCleanupStale = ([double]$reportOracleOperationalHistoryCleanupAgeHours) -gt 24
            }
        }
        if (
            $null -ne $reportPayload.PSObject.Properties["artifact_paths"] -and
            $null -ne $reportPayload.artifact_paths -and
            $null -ne $reportPayload.artifact_paths.PSObject.Properties["oracle_remediation"] -and
            -not [string]::IsNullOrWhiteSpace([string]$reportPayload.artifact_paths.oracle_remediation) -and
            (Test-Path -LiteralPath ([string]$reportPayload.artifact_paths.oracle_remediation))
        ) {
            try {
                $oracleRemediationPayload = Get-Content -LiteralPath ([string]$reportPayload.artifact_paths.oracle_remediation) -Raw | ConvertFrom-Json
                if (
                    $null -ne $oracleRemediationPayload.PSObject.Properties["remediation_summary"] -and
                    $null -ne $oracleRemediationPayload.remediation_summary -and
                    $null -ne $oracleRemediationPayload.remediation_summary.PSObject.Properties["outcome"]
                ) {
                    $reportOracleRemediationOutcome = [string]$oracleRemediationPayload.remediation_summary.outcome
                }
            }
            catch {
                $reportOracleRemediationOutcome = $null
            }
        }
    }
    catch {
        $reportGeneratedAt = $null
    }
}

$summary = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    launcher_status = $launcherStatus
    derived_status = $derivedStatus
    pid = $childPid
    process_running = ($null -ne $childProcess)
    current_step = if ($null -ne $status.PSObject.Properties["current_step"]) { [string]$status.current_step } else { $null }
    current_step_status = if ($null -ne $status.PSObject.Properties["current_step_status"]) { [string]$status.current_step_status } else { $null }
    completed_step_count = if ($null -ne $status.PSObject.Properties["completed_step_count"] -and $null -ne $status.completed_step_count) { [int]$status.completed_step_count } else { $null }
    report_path = $reportPath
    report_exists = $reportExists
    report_generated_at = $reportGeneratedAt
    report_refresh_oracle_remediation = $reportRefreshOracleRemediation
    report_generated_strict_comparison_lane = $reportGeneratedStrictComparisonLane
    report_oracle_remediation_path = $reportOracleRemediationPath
    report_oracle_remediation_exists = $reportOracleRemediationExists
    report_oracle_remediation_generated_at = $reportOracleRemediationGeneratedAt
    report_oracle_remediation_age_hours = $reportOracleRemediationAgeHours
    report_oracle_remediation_stale = $reportOracleRemediationStale
    report_oracle_remediation_outcome = $reportOracleRemediationOutcome
    report_oracle_cleanup_execute_path = $reportOracleCleanupExecutePath
    report_oracle_cleanup_execute_exists = $reportOracleCleanupExecuteExists
    report_oracle_cleanup_execute_generated_at = $reportOracleCleanupExecuteGeneratedAt
    report_oracle_cleanup_execute_age_hours = $reportOracleCleanupExecuteAgeHours
    report_oracle_cleanup_execute_stale = $reportOracleCleanupExecuteStale
    report_oracle_wal_slot_remediation_path = $reportOracleWalSlotRemediationPath
    report_oracle_wal_slot_remediation_exists = $reportOracleWalSlotRemediationExists
    report_oracle_wal_slot_remediation_generated_at = $reportOracleWalSlotRemediationGeneratedAt
    report_oracle_wal_slot_remediation_age_hours = $reportOracleWalSlotRemediationAgeHours
    report_oracle_wal_slot_remediation_stale = $reportOracleWalSlotRemediationStale
    report_oracle_synthetic_cleanup_path = $reportOracleSyntheticCleanupPath
    report_oracle_synthetic_cleanup_exists = $reportOracleSyntheticCleanupExists
    report_oracle_synthetic_cleanup_generated_at = $reportOracleSyntheticCleanupGeneratedAt
    report_oracle_synthetic_cleanup_age_hours = $reportOracleSyntheticCleanupAgeHours
    report_oracle_synthetic_cleanup_stale = $reportOracleSyntheticCleanupStale
    report_oracle_operational_history_cleanup_path = $reportOracleOperationalHistoryCleanupPath
    report_oracle_operational_history_cleanup_exists = $reportOracleOperationalHistoryCleanupExists
    report_oracle_operational_history_cleanup_generated_at = $reportOracleOperationalHistoryCleanupGeneratedAt
    report_oracle_operational_history_cleanup_age_hours = $reportOracleOperationalHistoryCleanupAgeHours
    report_oracle_operational_history_cleanup_stale = $reportOracleOperationalHistoryCleanupStale
    stdout_path = $stdoutPath
    stderr_path = $stderrPath
    stderr_tail = $stderrTail
}

$summary | ConvertTo-Json -Depth 6
