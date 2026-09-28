Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("production-readiness-refresh-status-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "[production-readiness-refresh-status-pwsh-selftest] $Message. Expected '$Expected' but got '$Actual'"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $outDir = Join-Path $tmpRoot "out"
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null

    $statusPath = Join-Path $outDir "production-readiness-refresh-detached.json"
    $reportPath = Join-Path $outDir "production-readiness-refresh.json"
    $oracleRemediationPath = Join-Path $outDir "oracle-remediation-sequence.json"
    $oracleCleanupExecutePath = Join-Path $outDir "oracle-runtime-cleanup-execute.json"
    $walSlotPath = Join-Path $outDir "wal-slot-remediation\\oracle-remediate-electric-slot.json"
    $syntheticCleanupPath = Join-Path $outDir "synthetic-cleanup\\oracle-prune-synthetic-message-spam.json"
    $operationalHistoryCleanupPath = Join-Path $outDir "operational-history-cleanup\\oracle-prune-operational-history.json"
    $stdoutPath = Join-Path $outDir "production-readiness-refresh-detached.stdout.log"
    $stderrPath = Join-Path $outDir "production-readiness-refresh-detached.stderr.log"
    New-Item -ItemType Directory -Path (Split-Path -Parent $walSlotPath) -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path -Parent $syntheticCleanupPath) -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path -Parent $operationalHistoryCleanupPath) -Force | Out-Null

    @'
{
  "remediation_summary": {
    "outcome": "wal_slot_remediation_required"
  }
}
'@ | Set-Content -Path $oracleRemediationPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T08:29:59Z",
  "mode": "executed"
}
'@ | Set-Content -Path $oracleCleanupExecutePath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T08:30:00Z",
  "status": "dry_run",
  "slot_name": "electric_slot_default"
}
'@ | Set-Content -Path $walSlotPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T08:30:01Z",
  "before": {
    "total_dupes": 1692804
  },
  "after": {
    "total_dupes": 0,
    "deleted_total": 1692804
  }
}
'@ | Set-Content -Path $syntheticCleanupPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T08:30:02Z",
  "before": {
    "total_rows": 12045
  },
  "after": {
    "total_rows": 500,
    "deleted_total": 11545
  }
}
'@ | Set-Content -Path $operationalHistoryCleanupPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T08:31:00Z",
  "refresh_oracle_remediation": true,
  "generated_strict_comparison_lane": false,
  "artifact_paths": {
    "oracle_remediation": "__ORACLE_REMEDIATION_PATH__",
    "oracle_cleanup_execute": "__ORACLE_CLEANUP_EXECUTE_PATH__",
    "oracle_wal_slot_remediation": "__WAL_SLOT_PATH__",
    "oracle_synthetic_cleanup": "__SYNTHETIC_CLEANUP_PATH__",
    "oracle_operational_history_cleanup": "__OPERATIONAL_HISTORY_CLEANUP_PATH__"
  },
  "reused_artifact_freshness": {
    "oracle_remediation": {
      "generated_at": "2026-08-27T08:29:58Z",
      "age_hours": 1.0,
      "stale": false
    },
    "oracle_cleanup_execute": {
      "generated_at": "2026-08-27T08:29:59Z",
      "age_hours": 1.0,
      "stale": false
    },
    "oracle_wal_slot_remediation": {
      "generated_at": "2026-08-27T08:30:00Z",
      "age_hours": 1.0,
      "stale": false
    },
    "oracle_synthetic_cleanup": {
      "generated_at": "2026-08-27T08:30:01Z",
      "age_hours": 1.0,
      "stale": false
    },
    "oracle_operational_history_cleanup": {
      "generated_at": "2026-08-27T08:30:02Z",
      "age_hours": 1.0,
      "stale": false
    }
  }
}
'@.
        Replace("__ORACLE_REMEDIATION_PATH__", ($oracleRemediationPath -replace '\\', '\\')).
        Replace("__ORACLE_CLEANUP_EXECUTE_PATH__", ($oracleCleanupExecutePath -replace '\\', '\\')).
        Replace("__WAL_SLOT_PATH__", ($walSlotPath -replace '\\', '\\')).
        Replace("__SYNTHETIC_CLEANUP_PATH__", ($syntheticCleanupPath -replace '\\', '\\')).
        Replace("__OPERATIONAL_HISTORY_CLEANUP_PATH__", ($operationalHistoryCleanupPath -replace '\\', '\\')) |
        Set-Content -Path $reportPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T08:31:05Z",
  "status": "completed",
  "pid": 999999,
  "out_dir": "__OUT_DIR__",
  "current_step": "done",
  "current_step_status": "completed",
  "completed_step_count": 12,
  "report_path": "__REPORT_PATH__",
  "stdout_path": "__STDOUT_PATH__",
  "stderr_path": "__STDERR_PATH__"
}
'@.
        Replace("__OUT_DIR__", ($outDir -replace '\\', '\\')).
        Replace("__REPORT_PATH__", ($reportPath -replace '\\', '\\')).
        Replace("__STDOUT_PATH__", ($stdoutPath -replace '\\', '\\')).
        Replace("__STDERR_PATH__", ($stderrPath -replace '\\', '\\')) |
        Set-Content -Path $statusPath -Encoding ASCII

    "" | Set-Content -Path $stdoutPath -Encoding ASCII
    "" | Set-Content -Path $stderrPath -Encoding ASCII

    $completedSummary = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "production-readiness-refresh-status.ps1") `
        -OutDir $outDir `
        -StatusPath $statusPath
    if ($LASTEXITCODE -ne 0) {
        throw "[production-readiness-refresh-status-pwsh-selftest] expected completed status run to pass"
    }
    $completed = $completedSummary | ConvertFrom-Json
    Assert-Equal -Actual $completed.launcher_status -Expected "completed" -Message "launcher status should be completed"
    Assert-Equal -Actual $completed.derived_status -Expected "completed" -Message "derived status should be completed"
    Assert-Equal -Actual $completed.report_exists -Expected $true -Message "report should exist"
    Assert-Equal -Actual $completed.report_generated_at -Expected "2026-08-27T08:31:00Z" -Message "report generated_at should be surfaced"
    Assert-Equal -Actual $completed.report_refresh_oracle_remediation -Expected $true -Message "refresh_oracle_remediation should be surfaced"
    Assert-Equal -Actual $completed.report_generated_strict_comparison_lane -Expected $false -Message "strict comparison lane flag should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_remediation_path -Expected $oracleRemediationPath -Message "oracle remediation path should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_remediation_exists -Expected $true -Message "oracle remediation artifact should be detected"
    Assert-Equal -Actual $completed.report_oracle_remediation_generated_at -Expected "2026-08-27T08:29:58Z" -Message "oracle remediation freshness generated_at should be surfaced"
    Assert-Equal -Actual ([double]$completed.report_oracle_remediation_age_hours) -Expected 1.0 -Message "oracle remediation freshness age should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_remediation_stale -Expected $false -Message "oracle remediation freshness staleness should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_remediation_outcome -Expected "wal_slot_remediation_required" -Message "oracle remediation outcome should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_cleanup_execute_path -Expected $oracleCleanupExecutePath -Message "oracle cleanup execute path should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_cleanup_execute_exists -Expected $true -Message "oracle cleanup execute artifact should be detected"
    Assert-Equal -Actual $completed.report_oracle_cleanup_execute_generated_at -Expected "2026-08-27T08:29:59Z" -Message "oracle cleanup execute freshness generated_at should be surfaced"
    Assert-Equal -Actual ([double]$completed.report_oracle_cleanup_execute_age_hours) -Expected 1.0 -Message "oracle cleanup execute freshness age should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_cleanup_execute_stale -Expected $false -Message "oracle cleanup execute freshness staleness should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_wal_slot_remediation_exists -Expected $true -Message "wal-slot remediation artifact should be detected"
    Assert-Equal -Actual $completed.report_oracle_wal_slot_remediation_path -Expected $walSlotPath -Message "wal-slot remediation path should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_wal_slot_remediation_generated_at -Expected "2026-08-27T08:30:00Z" -Message "wal-slot remediation freshness generated_at should be surfaced"
    Assert-Equal -Actual ([double]$completed.report_oracle_wal_slot_remediation_age_hours) -Expected 1.0 -Message "wal-slot remediation freshness age should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_wal_slot_remediation_stale -Expected $false -Message "wal-slot remediation freshness staleness should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_synthetic_cleanup_exists -Expected $true -Message "synthetic cleanup artifact should be detected"
    Assert-Equal -Actual $completed.report_oracle_synthetic_cleanup_path -Expected $syntheticCleanupPath -Message "synthetic cleanup path should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_synthetic_cleanup_generated_at -Expected "2026-08-27T08:30:01Z" -Message "synthetic cleanup freshness generated_at should be surfaced"
    Assert-Equal -Actual ([double]$completed.report_oracle_synthetic_cleanup_age_hours) -Expected 1.0 -Message "synthetic cleanup freshness age should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_synthetic_cleanup_stale -Expected $false -Message "synthetic cleanup freshness staleness should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_operational_history_cleanup_exists -Expected $true -Message "operational-history cleanup artifact should be detected"
    Assert-Equal -Actual $completed.report_oracle_operational_history_cleanup_path -Expected $operationalHistoryCleanupPath -Message "operational-history cleanup path should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_operational_history_cleanup_generated_at -Expected "2026-08-27T08:30:02Z" -Message "operational-history cleanup freshness generated_at should be surfaced"
    Assert-Equal -Actual ([double]$completed.report_oracle_operational_history_cleanup_age_hours) -Expected 1.0 -Message "operational-history cleanup freshness age should be surfaced"
    Assert-Equal -Actual $completed.report_oracle_operational_history_cleanup_stale -Expected $false -Message "operational-history cleanup freshness staleness should be surfaced"

    @'
{
  "generated_at": "2026-08-27T08:40:00Z",
  "status": "running",
  "pid": 999998,
  "out_dir": "__OUT_DIR__",
  "current_step": "oracle_remediation",
  "current_step_status": "in_progress",
  "completed_step_count": 7,
  "report_path": "__MISSING_REPORT_PATH__",
  "stdout_path": "__STDOUT_PATH__",
  "stderr_path": "__STDERR_PATH__"
}
'@.
        Replace("__OUT_DIR__", ($outDir -replace '\\', '\\')).
        Replace("__MISSING_REPORT_PATH__", ((Join-Path $outDir "missing-report.json") -replace '\\', '\\')).
        Replace("__STDOUT_PATH__", ($stdoutPath -replace '\\', '\\')).
        Replace("__STDERR_PATH__", ($stderrPath -replace '\\', '\\')) |
        Set-Content -Path $statusPath -Encoding ASCII
    "oracle remediation failed on remote host" | Set-Content -Path $stderrPath -Encoding ASCII

    $failedSummary = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "production-readiness-refresh-status.ps1") `
        -OutDir $outDir `
        -StatusPath $statusPath
    if ($LASTEXITCODE -ne 0) {
        throw "[production-readiness-refresh-status-pwsh-selftest] expected failed fallback status run to pass"
    }
    $failed = $failedSummary | ConvertFrom-Json
    Assert-Equal -Actual $failed.launcher_status -Expected "running" -Message "launcher status should preserve running state"
    Assert-Equal -Actual $failed.derived_status -Expected "failed" -Message "stderr-backed run should derive failed"
    Assert-Equal -Actual $failed.report_exists -Expected $false -Message "missing report should be surfaced"
    Assert-Equal -Actual $failed.current_step -Expected "oracle_remediation" -Message "current step should be surfaced"
    Assert-Equal -Actual $failed.current_step_status -Expected "in_progress" -Message "current step status should be surfaced"
    if (-not ([string]$failed.stderr_tail).Contains("oracle remediation failed on remote host")) {
        throw "[production-readiness-refresh-status-pwsh-selftest] expected stderr tail to include failure text"
    }

    Write-Output "[production-readiness-refresh-status-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
