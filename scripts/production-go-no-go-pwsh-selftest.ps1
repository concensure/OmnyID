Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("production-go-no-go-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[production-go-no-go-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $scriptCopy = Join-Path $tmpRoot "production-go-no-go.ps1"
    $fakeRelease = Join-Path $tmpRoot "release-readiness.ps1"
    $snapshotPath = Join-Path $tmpRoot "commercial-readiness-snapshot.json"
    $cleanupExecuteArtifactPath = Join-Path $tmpRoot "oracle-runtime-cleanup-execute.json"
    $oracleRemediationArtifactPath = Join-Path $tmpRoot "oracle-remediation-sequence.json"
    $walSlotArtifactPath = Join-Path $tmpRoot "oracle-remediate-electric-slot.json"
    $syntheticCleanupArtifactPath = Join-Path $tmpRoot "oracle-prune-synthetic-message-spam.json"
    $operationalHistoryCleanupArtifactPath = Join-Path $tmpRoot "oracle-prune-operational-history.json"
    $outDir = Join-Path $tmpRoot "out"

    @'
param([string]$OutDir = "")
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  status = "pass"
} | ConvertTo-Json | Set-Content (Join-Path $OutDir "summary.json")
Write-Output "[fake-release-readiness] pass"
'@ | Set-Content -Path $fakeRelease -Encoding ASCII

    '{}' | Set-Content -Path $cleanupExecuteArtifactPath -Encoding ASCII
    '{}' | Set-Content -Path $oracleRemediationArtifactPath -Encoding ASCII
    '{}' | Set-Content -Path $walSlotArtifactPath -Encoding ASCII
    '{}' | Set-Content -Path $syntheticCleanupArtifactPath -Encoding ASCII
    '{}' | Set-Content -Path $operationalHistoryCleanupArtifactPath -Encoding ASCII

    @'
{
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 2,
    "blockers": [
      "Oracle root filesystem is at 100% use",
      "personalOS has 2 phases not started"
    ]
  },
  "oracle": {
    "remediation_outcome": "runtime_repair_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": true,
    "runtime_repair_reason": "remote runtime is missing required scripts and should be redeployed from the staged runtime bundle before backup verification and restore-drill results are treated as authoritative",
    "runtime_repair_recommended_action": "./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts"
  },
    "artifact_paths": {
      "oracle_cleanup_execute": "__CLEANUP_EXECUTE_ARTIFACT__",
      "oracle_remediation": "__ORACLE_REMEDIATION_ARTIFACT__",
      "oracle_wal_slot_remediation": "__WAL_SLOT_ARTIFACT__",
      "oracle_synthetic_cleanup": "__SYNTHETIC_CLEANUP_ARTIFACT__",
      "oracle_operational_history_cleanup": "__OPERATIONAL_HISTORY_CLEANUP_ARTIFACT__"
    },
  "storage": {
    "oracle_synthetic_message_pressure_status": "duplicate_snapshot_rows_detected",
    "oracle_synthetic_message_pressure_summary": "detected duplicate snapshot-like synthetic rows that should be pruned and kept bounded with latest-only semantics",
    "oracle_synthetic_message_pressure_total_dupes": 1692804,
    "oracle_synthetic_message_pressure_maintenance_summary_dupes": 1128537,
    "oracle_synthetic_message_pressure_curator_card_dupes": 281633,
    "oracle_synthetic_message_pressure_curator_backlink_dupes": 141821,
    "oracle_synthetic_message_pressure_ingestion_topology_dupes": 140813,
    "oracle_synthetic_message_cleanup_mode": "executed",
    "oracle_synthetic_message_cleanup_command": "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze",
    "oracle_synthetic_message_cleanup_deleted_total": 1692804,
    "oracle_synthetic_message_cleanup_before_total_dupes": 1692804,
    "oracle_synthetic_message_cleanup_after_total_dupes": 0,
    "operational_history_pressure_status": "operational_history_present",
    "operational_history_pressure_total_rows": 12045,
    "oracle_operational_history_cleanup_mode": "executed",
    "oracle_operational_history_cleanup_command": "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze",
    "oracle_operational_history_cleanup_follow_through_command": "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current",
    "oracle_operational_history_cleanup_deleted_total": 11545,
    "oracle_operational_history_cleanup_before_total_rows": 12045,
    "oracle_operational_history_cleanup_after_total_rows": 500
  }
}
'@.
        Replace("__CLEANUP_EXECUTE_ARTIFACT__", ($cleanupExecuteArtifactPath -replace '\\', '\\')).
        Replace("__ORACLE_REMEDIATION_ARTIFACT__", ($oracleRemediationArtifactPath -replace '\\', '\\')).
        Replace("__WAL_SLOT_ARTIFACT__", ($walSlotArtifactPath -replace '\\', '\\')).
        Replace("__SYNTHETIC_CLEANUP_ARTIFACT__", ($syntheticCleanupArtifactPath -replace '\\', '\\')).
        Replace("__OPERATIONAL_HISTORY_CLEANUP_ARTIFACT__", ($operationalHistoryCleanupArtifactPath -replace '\\', '\\')) |
        Set-Content -Path $snapshotPath -Encoding ASCII

    (Get-Content (Join-Path $PSScriptRoot "production-go-no-go.ps1") -Raw).
        Replace('Join-Path $PSScriptRoot "release-readiness.ps1"', '"' + ($fakeRelease -replace '\\', '\\') + '"') |
        Set-Content -Path $scriptCopy -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected go/no-go script to pass`n$output"
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "status=no_go blockers=2"

    $expectedReleasePath = (Resolve-Path (Join-Path $outDir "release-readiness\\summary.json")).Path
    $markdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $markdown -Expected "- status: no_go"
    Assert-Contains -Actual $markdown -Expected ("- release_readiness_path: " + $expectedReleasePath)
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_outcome: runtime_repair_required"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_repair_required: True"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_status: duplicate_snapshot_rows_detected"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_total_dupes: 1692804"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_maintenance_summary_dupes: 1128537"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_curator_card_dupes: 281633"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_curator_backlink_dupes: 141821"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_ingestion_topology_dupes: 140813"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_mode: executed"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_deleted_total: 1692804"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_after_total_dupes: 0"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_pressure_status: operational_history_present"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_pressure_total_rows: 12045"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_mode: executed"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_deleted_total: 11545"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_after_total_rows: 500"
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_cleanup_execute: " + $cleanupExecuteArtifactPath)
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_remediation: " + $oracleRemediationArtifactPath)
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_wal_slot_remediation: " + $walSlotArtifactPath)
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_synthetic_cleanup: " + $syntheticCleanupArtifactPath)
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_operational_history_cleanup: " + $operationalHistoryCleanupArtifactPath)
    Assert-Contains -Actual $markdown -Expected "- next_action_summary: Oracle cleanup, redeploy, and proof recheck are the current gate."
    Assert-Contains -Actual $markdown -Expected "- next_action_command: ./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts"
    Assert-Contains -Actual $markdown -Expected "Oracle root filesystem is at 100% use"
    Assert-Contains -Actual $markdown -Expected "| commercial_snapshot | not_ready | blockers=2 |"
    Assert-Contains -Actual $markdown -Expected "| oracle_remediation | runtime_repair_required | cleanup_mode=dry_run; root_use_delta_pct= |"

    $report = Get-Content (Join-Path $outDir "production-go-no-go.json") -Raw | ConvertFrom-Json
    if ($report.release_readiness_path -ne $expectedReleasePath) {
        throw "[production-go-no-go-pwsh-selftest] expected release_readiness_path '$expectedReleasePath' but got '$($report.release_readiness_path)'"
    }
    if ($report.storage_oracle_synthetic_message_pressure_status -ne "duplicate_snapshot_rows_detected") {
        throw "[production-go-no-go-pwsh-selftest] expected synthetic message pressure status in report"
    }
    if ([int]$report.storage_oracle_synthetic_message_cleanup_deleted_total -ne 1692804) {
        throw "[production-go-no-go-pwsh-selftest] expected synthetic message cleanup deleted total in report"
    }
    if ([int]$report.storage_oracle_operational_history_cleanup_deleted_total -ne 11545) {
        throw "[production-go-no-go-pwsh-selftest] expected operational-history cleanup deleted total in report"
    }
    if ($report.artifact_oracle_cleanup_execute -ne $cleanupExecuteArtifactPath) {
        throw "[production-go-no-go-pwsh-selftest] expected cleanup execute artifact path in report"
    }
    if ($report.artifact_oracle_remediation -ne $oracleRemediationArtifactPath) {
        throw "[production-go-no-go-pwsh-selftest] expected oracle remediation artifact path in report"
    }
    if ($report.artifact_oracle_wal_slot_remediation -ne $walSlotArtifactPath) {
        throw "[production-go-no-go-pwsh-selftest] expected WAL-slot remediation artifact path in report"
    }
    if ($report.artifact_oracle_synthetic_cleanup -ne $syntheticCleanupArtifactPath) {
        throw "[production-go-no-go-pwsh-selftest] expected synthetic cleanup artifact path in report"
    }
    if ($report.artifact_oracle_operational_history_cleanup -ne $operationalHistoryCleanupArtifactPath) {
        throw "[production-go-no-go-pwsh-selftest] expected operational-history cleanup artifact path in report"
    }

    $skipOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir `
        -SkipReleaseReadiness 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected skip-release-readiness go/no-go script to pass`n$skipOutput"
    }

    $skipMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $skipMarkdown -Expected "- status: no_go"
    Assert-Contains -Actual $skipMarkdown -Expected "- release_readiness_path: "
    Assert-Contains -Actual $skipMarkdown -Expected "| release_readiness | skipped | release readiness skipped by operator |"

    $skipReport = Get-Content (Join-Path $outDir "production-go-no-go.json") -Raw | ConvertFrom-Json
    if ($null -ne $skipReport.release_readiness_path) {
        throw "[production-go-no-go-pwsh-selftest] expected skipped release_readiness_path to be null but got '$($skipReport.release_readiness_path)'"
    }
    if ($skipReport.steps[0].status -ne "skipped") {
        throw "[production-go-no-go-pwsh-selftest] expected first step to be skipped under -SkipReleaseReadiness but got '$($skipReport.steps[0].status)'"
    }

    $enforcedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir `
        -Enforce 2>&1
    if ($LASTEXITCODE -eq 0) {
        throw "[production-go-no-go-pwsh-selftest] expected enforce mode to fail on no_go"
    }
    Assert-Contains -Actual ($enforcedOutput | Out-String) -Expected "status=no_go blockers=2"

    @'
{
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle targeted cleanup is still required"
    ]
  },
  "oracle": {
    "remediation_outcome": "targeted_cleanup_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": true,
    "runtime_repair_reason": "remote root filesystem is saturated and the cleanup plan projects root usage down to about 79% after candidate cleanup",
    "runtime_repair_recommended_action": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath \"artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json\" -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $targetedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected targeted cleanup go/no-go script to pass`n$targetedOutput"
    }

    $targetedMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $targetedMarkdown -Expected "- oracle_remediation_outcome: targeted_cleanup_required"
    Assert-Contains -Actual $targetedMarkdown -Expected "- next_action_summary: Oracle targeted cleanup and proof recheck are the current gate."
    Assert-Contains -Actual $targetedMarkdown -Expected "- next_action_command: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath "
    Assert-Contains -Actual $targetedMarkdown -Expected "-IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
    Assert-Contains -Actual $targetedMarkdown -Expected "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json"
    Assert-Contains -Actual $targetedMarkdown -Expected "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"

    @'
{
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle review-target cleanup is still required"
    ]
  },
  "oracle": {
    "remediation_outcome": "review_target_cleanup_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_kind": "review_target_cleanup",
    "runtime_repair_required": true,
    "runtime_repair_reason": "remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure, and the top review target 'shared_host_supabase' carries about 9.235644 GiB of known reclaimable scope that must be reviewed before proof can pass",
    "runtime_repair_recommended_action": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath \"artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json\" -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $reviewTargetCleanupOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected review-target cleanup go/no-go script to pass`n$reviewTargetCleanupOutput"
    }

    $reviewTargetCleanupMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $reviewTargetCleanupMarkdown -Expected "- oracle_remediation_outcome: review_target_cleanup_required"
    Assert-Contains -Actual $reviewTargetCleanupMarkdown -Expected "- next_action_summary: Oracle review-target cleanup and proof recheck are the current gate."
    Assert-Contains -Actual $reviewTargetCleanupMarkdown -Expected "-IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
    Assert-Contains -Actual $reviewTargetCleanupMarkdown -Expected "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json"
    Assert-Contains -Actual $reviewTargetCleanupMarkdown -Expected "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"

    @'
{
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle combined review cleanup is still required"
    ]
  },
  "oracle": {
    "remediation_outcome": "combined_review_cleanup_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": false,
    "runtime_repair_reason": "",
    "runtime_repair_recommended_action": "",
    "restore_drill_gap_gib": 7.27,
    "restore_capacity_safe_now_cleanup_gib": 1.4,
    "restore_capacity_safe_now_only_clears_gap": false,
    "restore_capacity_safe_now_remaining_gap_gib": 5.87,
    "cleanup_plan_total_candidate_gib": 1.4,
    "review_target_group": "shared_host_supabase",
    "review_target_known_size_gib": 6.923409,
    "restore_capacity_omnyid_backup_retention_gib": 1.201989,
    "restore_capacity_combined_retention_and_top_review_gib": 8.125398,
    "combined_retention_and_top_target_cleanup_command": "bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db",
    "safe_now_cleanup_follow_through_command": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current",
    "phase_two_cleanup_execute_hint": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeCombinedReviewCleanup -Execute"
  },
  "storage": {
    "oracle_safe_cleanup_gib": 1.4,
    "oracle_safe_cleanup_group_count": 1,
    "oracle_review_required_gib": 8.125398,
    "oracle_review_required_group_count": 2,
    "top_oracle_safe_cleanup_group": "host_logs",
    "top_oracle_delete_priority_groups": [
      "host_logs",
      "shared_host_supabase",
      "omnyid_backup_retention"
    ]
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $combinedCleanupOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected combined cleanup go/no-go script to pass`n$combinedCleanupOutput"
    }

    $combinedCleanupMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_remediation_outcome: combined_review_cleanup_required"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_restore_gap_gib: 7.27"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_safe_now_cleanup_gib: 1.4"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_safe_now_only_clears_gap: False"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_safe_now_remaining_gap_gib: 5.87"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_candidate_cleanup_gib: 1.4"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_review_target_group: shared_host_supabase"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_review_target_known_size_gib: 6.923409"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_backup_retention_gib: 1.201989"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- oracle_combined_known_reclaim_gib: 8.125398"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_oracle_safe_cleanup_gib: 1.4"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_oracle_safe_cleanup_group_count: 1"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_oracle_review_required_gib: 8.125398"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_oracle_review_required_group_count: 2"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_top_oracle_safe_cleanup_group: host_logs"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_top_oracle_delete_priority_groups: host_logs, shared_host_supabase, omnyid_backup_retention"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- storage_safe_cleanup_lead: safe-now Oracle cleanup ('host_logs', about 1.4 GiB)"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- safe_now_action_summary: Run safe-now Oracle cleanup ('host_logs', about 1.4 GiB), then rerun proof and refresh the commercial gate; this phase alone still leaves about 5.87 GiB of restore-gap pressure if estimates hold."
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- safe_now_action_command: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json"

    @'
{
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle operational-history cleanup is 'dry_run' while 12045 bounded log rows remain under pressure"
    ]
  },
  "oracle": {
    "remediation_outcome": "proof_passed",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": false,
    "runtime_repair_reason": "",
    "runtime_repair_recommended_action": ""
  },
  "storage": {
    "operational_history_pressure_status": "operational_history_present",
    "operational_history_pressure_total_rows": 12045,
    "oracle_operational_history_cleanup_mode": "dry_run",
    "oracle_operational_history_cleanup_command": "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze",
    "oracle_operational_history_cleanup_follow_through_command": "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current",
    "oracle_operational_history_cleanup_deleted_total": 0,
    "oracle_operational_history_cleanup_before_total_rows": 12045,
    "oracle_operational_history_cleanup_after_total_rows": 12045
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $operationalHistoryOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected operational-history cleanup go/no-go script to pass`n$operationalHistoryOutput"
    }

    $operationalHistoryMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $operationalHistoryMarkdown -Expected "- storage_oracle_operational_history_pressure_status: operational_history_present"
    Assert-Contains -Actual $operationalHistoryMarkdown -Expected "- storage_oracle_operational_history_cleanup_mode: dry_run"
    Assert-Contains -Actual $operationalHistoryMarkdown -Expected "- storage_oracle_operational_history_cleanup_follow_through_command: ./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    Assert-Contains -Actual $operationalHistoryMarkdown -Expected "- next_action_summary: Oracle bounded operational-history cleanup and commercial gate refresh are the current gate."
    Assert-Contains -Actual $operationalHistoryMarkdown -Expected "- next_action_command: ./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- phase_two_action_summary: If the restore gap remains after the safe-now pass, run the combined backup-retention and review-target cleanup path."
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- phase_two_action_command: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeCombinedReviewCleanup -Execute"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- next_action_summary: Oracle safe-now Oracle cleanup ('host_logs', about 1.4 GiB) plus combined backup-retention and review-target cleanup is the current gate."
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "- next_action_command: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeCombinedReviewCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json"
    Assert-Contains -Actual $combinedCleanupMarkdown -Expected "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"

    @'
{
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle backup retention cleanup is still required"
    ]
  },
  "oracle": {
    "remediation_outcome": "backup_retention_cleanup_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": false,
    "runtime_repair_reason": "",
    "runtime_repair_recommended_action": "",
    "omnyid_backup_retention_cleanup_command": "bash -lc 'cleanup-old-backups'"
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $backupRetentionOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected backup-retention go/no-go script to pass`n$backupRetentionOutput"
    }

    $backupRetentionMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $backupRetentionMarkdown -Expected "- oracle_remediation_outcome: backup_retention_cleanup_required"
    Assert-Contains -Actual $backupRetentionMarkdown -Expected "- next_action_summary: Oracle backup-retention cleanup and proof recheck are the current gate."
    Assert-Contains -Actual $backupRetentionMarkdown -Expected "- next_action_command: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeBackupRetentionCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
    Assert-Contains -Actual $backupRetentionMarkdown -Expected "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json"
    Assert-Contains -Actual $backupRetentionMarkdown -Expected "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"

    $walSlotSnapshotGeneratedAt = (Get-Date).ToUniversalTime().AddMinutes(-10).ToString("yyyy-MM-ddTHH:mm:ssZ")

    @'
{
  "generated_at": "__WAL_SLOT_SNAPSHOT_GENERATED_AT__",
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle WAL slot remediation is required before the host can be treated as stable"
    ]
  },
  "oracle": {
    "remediation_outcome": "wal_slot_remediation_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_kind": "postgres_wal_slot",
    "runtime_repair_required": true,
    "runtime_repair_reason": "Electric slot 'electric_slot_default' is inactive and retaining 20 GiB of WAL while max_slot_wal_keep_size is unlimited.",
    "runtime_repair_recommended_action": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current",
    "postgres_wal_pressure_status": "inactive_electric_slot_unbounded",
    "postgres_wal_pressure_summary": "Electric slot 'electric_slot_default' is inactive, retaining about 20 GiB of WAL, and the current max_slot_wal_keep_size setting is unlimited.",
    "postgres_wal_pressure_recommended_action": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit",
    "postgres_wal_safe_limit_recommendation_gib": 2,
    "postgres_wal_gib": 20,
    "electric_slot_name": "electric_slot_default",
    "electric_slot_active": false,
    "electric_slot_retained_wal_gib": 20,
    "safe_now_cleanup_follow_through_command": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current",
    "phase_two_cleanup_execute_hint": null
  }
}
'@.Replace("__WAL_SLOT_SNAPSHOT_GENERATED_AT__", $walSlotSnapshotGeneratedAt) | Set-Content -Path $snapshotPath -Encoding ASCII

    $walSlotOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected WAL-slot go/no-go script to pass`n$walSlotOutput"
    }

    $walSlotMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_remediation_outcome: wal_slot_remediation_required"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_runtime_repair_kind: postgres_wal_slot"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_postgres_wal_pressure_status: inactive_electric_slot_unbounded"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_postgres_wal_gib: 20"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_electric_slot_name: electric_slot_default"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_electric_slot_active: False"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- oracle_electric_slot_retained_wal_gib: 20"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- safe_now_action_summary: Run the Oracle WAL-slot remediation phase for 'electric_slot_default' (about 20 GiB retained), then rerun proof and refresh the commercial gate."
    Assert-Contains -Actual $walSlotMarkdown -Expected "- safe_now_action_command: ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    Assert-Contains -Actual $walSlotMarkdown -Expected "- next_action_summary: Oracle WAL-slot remediation and proof recheck are the current gate."
    Assert-Contains -Actual $walSlotMarkdown -Expected "- next_action_command: ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
    Assert-Contains -Actual $walSlotMarkdown -Expected "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json"
    Assert-Contains -Actual $walSlotMarkdown -Expected "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"

    Write-Output "[production-go-no-go-pwsh-selftest] passed"

    @'
{
  "generated_at": "2026-08-18T10:20:22Z",
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 1,
    "blockers": [
      "Oracle proof is from an earlier audit"
    ]
  },
  "oracle": {
    "remediation_outcome": "proof_not_rechecked",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": false,
    "runtime_repair_reason": "",
    "runtime_repair_recommended_action": ""
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $staleOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected stale snapshot go/no-go script to pass`n$staleOutput"
    }

    $staleMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $staleMarkdown -Expected "- commercial_snapshot_generated_at: 2026-08-18T10:20:22Z"
    Assert-Contains -Actual $staleMarkdown -Expected "- commercial_snapshot_stale: True"
    Assert-Contains -Actual $staleMarkdown -Expected "- next_action_summary: Refresh readiness artifacts and rerun the commercial gate before acting on older evidence."
    Assert-Contains -Actual $staleMarkdown -Expected "- next_action_command: ./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh-current"
    Assert-Contains -Actual $staleMarkdown -Expected "commercial readiness snapshot is stale: generated at '2026-08-18T10:20:22Z'"
    Assert-Contains -Actual $staleMarkdown -Expected "| commercial_snapshot | not_ready | blockers=1; generated_at=2026-08-18T10:20:22Z;"

    @'
{
  "generated_at": "2026-08-21T13:55:00Z",
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 3,
    "blockers": [
      "Oracle production proof is failing at 'disk_capacity'",
      "readiness artifact 'oracle_proof' is stale",
      "readiness artifact 'personalos_audit' is stale"
    ]
  },
  "artifact_freshness": {
    "stale_artifact_names": [
      "oracle_proof",
      "personalos_audit"
    ]
  },
  "oracle": {
    "failure_step": "disk_capacity",
    "review_target_group": "shared_host_supabase",
    "review_target_recommended_action": "review whether shared_host_supabase is still required",
    "review_target_cleanup_command": "docker rm -f shared-host-supabase",
    "remediation_outcome": "proof_not_rechecked",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": false,
    "runtime_repair_reason": "",
    "runtime_repair_recommended_action": ""
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $staleEvidenceOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected stale evidence go/no-go script to pass`n$staleEvidenceOutput"
    }

    $staleEvidenceMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $staleEvidenceMarkdown -Expected "- stale_readiness_artifacts: oracle_proof, personalos_audit"
    Assert-Contains -Actual $staleEvidenceMarkdown -Expected "- next_action_summary: Refresh readiness artifacts and rerun the commercial gate before acting on older evidence."
    Assert-Contains -Actual $staleEvidenceMarkdown -Expected "- next_action_command: ./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh-current"

    @'
{
  "generated_at": "2026-08-22T03:45:00Z",
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 3,
    "blockers": [
      "Oracle production proof is failing at 'restore_drill'",
      "Oracle restore drill is 'fail'",
      "oracle cleanup execution preview predates the current cleanup plan"
    ]
  },
  "oracle": {
    "remediation_outcome": "combined_review_cleanup_required",
    "remediation_cleanup_mode": "dry_run",
    "remediation_root_use_delta_pct": null,
    "runtime_repair_required": false,
    "runtime_repair_reason": "",
    "runtime_repair_recommended_action": "",
    "cleanup_execute_available": true,
    "cleanup_execute_current_with_plan": false,
    "cleanup_execute_stale_relative_to_plan": true
  }
}
'@ | Set-Content -Path $snapshotPath -Encoding ASCII

    $staleCleanupPreviewOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CommercialSnapshotPath $snapshotPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[production-go-no-go-pwsh-selftest] expected stale cleanup preview go/no-go script to pass`n$staleCleanupPreviewOutput"
    }

    $staleCleanupPreviewMarkdown = Get-Content (Join-Path $outDir "production-go-no-go.md") -Raw
    Assert-Contains -Actual $staleCleanupPreviewMarkdown -Expected "- oracle_cleanup_execute_available: True"
    Assert-Contains -Actual $staleCleanupPreviewMarkdown -Expected "- oracle_cleanup_execute_current_with_plan: False"
    Assert-Contains -Actual $staleCleanupPreviewMarkdown -Expected "- oracle_cleanup_execute_stale_relative_to_plan: True"
    Assert-Contains -Actual $staleCleanupPreviewMarkdown -Expected "- next_action_summary: Refresh readiness artifacts and rerun the commercial gate before acting on older evidence."
    Assert-Contains -Actual $staleCleanupPreviewMarkdown -Expected "- next_action_command: ./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh-current"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
