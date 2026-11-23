Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("commercial-readiness-snapshot-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    $oracleProofPath = Join-Path $tmpRoot "oracle-production-proof.json"
    $oracleInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory.json"
    $oracleCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan.json"
    $oracleCleanupExecutePath = Join-Path $tmpRoot "oracle-runtime-cleanup-execute.json"
    $oracleRemediationPath = Join-Path $tmpRoot "oracle-remediation-sequence.json"
    $oracleWalSlotRemediationPath = Join-Path $tmpRoot "oracle-remediate-electric-slot.json"
    $oracleSyntheticCleanupPath = Join-Path $tmpRoot "oracle-prune-synthetic-message-spam.json"
    $oracleOperationalHistoryCleanupPath = Join-Path $tmpRoot "oracle-prune-operational-history.json"
    $releaseReadinessPath = Join-Path $tmpRoot "release-readiness-summary.json"
    $personalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit.json"
    $stageManifestPath = Join-Path $tmpRoot "oracle-runtime-manifest.json"
    $storageHygienePath = Join-Path $tmpRoot "storage-hygiene-report.json"
    $outDir = Join-Path $tmpRoot "out"
    $statusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS.md"

    @'
{
  "status": "fail",
  "remote_host": "oracle.example",
  "failure_step": "disk_capacity",
  "failure_reason": "remote root filesystem is at 100% use",
  "remote_root_use_pct": "100",
  "remote_var_use_pct": "100",
  "latest_archive": "/var/backups/omnyid/20260706T000000Z",
  "latest_archive_age_days": "42",
  "runtime_script_integrity_status": "fail",
  "runtime_script_integrity_detail": "remote runtime is missing required scripts: scripts/omnyid-backup-verify.sh",
  "missing_runtime_scripts": ["scripts/omnyid-backup-verify.sh"],
  "backup_verify_status": "fail",
  "backup_verify_detail": "backup verify script missing from runtime",
  "restore_drill_status": "blocked",
  "restore_drill_detail": "blocked by backup verification failure",
  "restore_drill_free_root_bytes": 3965435904,
  "restore_drill_required_bytes": 11771254636,
  "restore_drill_source_db_bytes": 9724593855,
  "restore_drill_gap_bytes": 7805818732
}
'@ | Set-Content -Path $oracleProofPath -Encoding ASCII

    @'
{
  "counts": {
    "candidate_cleanup_items": 3,
    "candidate_cleanup_image_gib": 2.92
  },
  "generated_at": "2026-08-18T02:00:00Z",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "43G",
      "avail": "1.6G",
      "use_pct": "97%"
    }
  ]
}
'@ | Set-Content -Path $oracleInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:05:00Z",
  "counts": {
    "candidate_containers": 1,
    "candidate_volumes": 1,
    "candidate_images": 1
  },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 9.235644,
    "top_target_review_count": 32,
    "recommended_action": "review and remove the shared_host_supabase group in one maintenance window because root disk pressure remains saturated"
  },
  "review_targets": [
    {
      "group": "shared_host_supabase",
      "stop_and_remove_containers": "docker rm -f supabase-auth",
      "remove_volumes": "docker volume rm supabase_db-config",
      "remove_images": "docker image rm supabase/edge-runtime:v1.70.3"
    },
    {
      "ownership_group": "omnyid_backup_retention",
      "known_size_gib": 1.201989,
      "review_count": 1,
      "recommended_action": "review this non-runtime group before cleanup"
    }
  ],
  "runtime_repair": {
    "required": true,
    "reason": "remote runtime is missing required scripts and should be redeployed from the staged runtime bundle before backup verification and restore-drill results are treated as authoritative",
    "recommended_action": "./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts",
    "blocks_backup_verify": true,
    "blocks_restore_drill": true
  },
  "estimated_reclaim": {
    "total_candidate_gib": 3.12
  },
  "disk_pressure": {
    "root_use_pct_int": 97,
    "status": "candidate_cleanup_unlikely_to_clear_pressure",
    "summary": "root filesystem is at 97% use with 1.6G free; candidate cleanup may reclaim 3.12 GiB and still needs remeasurement"
  }
}
'@ | Set-Content -Path $oracleCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:09:30Z",
  "status": "dry_run"
}
'@ | Set-Content -Path $oracleWalSlotRemediationPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:09:31Z",
  "before": {
    "total_dupes": 1692804
  },
  "after": {
    "total_dupes": 0,
    "deleted_total": 1692804
  }
}
'@ | Set-Content -Path $oracleSyntheticCleanupPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:09:32Z",
  "before": {
    "tenant_action_audit_log": 4200,
    "daemon_operational_afp": 5100,
    "tenant_llm_usage_log": 3800,
    "training_reflection_traces": 1400,
    "proactive_token_usage": 600,
    "user_external_tool_usage_events": 2100,
    "tenant_workflow_trigger_observations": 1800,
    "proactive_suggestions": 500,
    "trigger_replay_nonces": 300
  },
  "after": {
    "tenant_action_audit_log": 4200,
    "daemon_operational_afp": 5100,
    "tenant_llm_usage_log": 3800,
    "training_reflection_traces": 1400,
    "proactive_token_usage": 600,
    "user_external_tool_usage_events": 2100,
    "tenant_workflow_trigger_observations": 1800,
    "proactive_suggestions": 500,
    "trigger_replay_nonces": 300,
    "deleted_total": 0
  }
}
'@ | Set-Content -Path $oracleOperationalHistoryCleanupPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:10:00Z",
  "artifact_paths": {
    "wal_slot_remediation": "__WAL_SLOT_PATH__",
    "synthetic_cleanup": "__SYNTHETIC_CLEANUP_PATH__",
    "operational_history_cleanup": "__OP_HISTORY_CLEANUP_PATH__"
  },
  "remediation_summary": {
    "outcome": "proof_not_rechecked",
    "cleanup_mode": "dry_run",
    "cleanup_step_count": 4,
    "planned_candidate_containers": 1,
    "planned_candidate_volumes": 1,
    "planned_candidate_images": 1,
    "baseline_root_use_pct": 100,
    "final_root_use_pct": null,
    "root_use_delta_pct": null,
    "baseline_backup_verify_status": "fail",
    "final_backup_verify_status": "unknown",
    "baseline_restore_drill_status": "blocked",
    "final_restore_drill_status": "unknown",
    "baseline_blocker": "disk_capacity: remote root filesystem is at 100% use",
    "final_blocker": "unknown",
    "operational_history_cleanup_mode": "executed",
    "operational_history_cleanup_deleted_total": 0,
    "operational_history_cleanup_before_total_rows": 19800,
    "operational_history_cleanup_after_total_rows": 19800
  }
}
'@.
        Replace("__WAL_SLOT_PATH__", ($oracleWalSlotRemediationPath -replace '\\', '\\')).
        Replace("__SYNTHETIC_CLEANUP_PATH__", ($oracleSyntheticCleanupPath -replace '\\', '\\')).
        Replace("__OP_HISTORY_CLEANUP_PATH__", ($oracleOperationalHistoryCleanupPath -replace '\\', '\\')) |
        Set-Content -Path $oracleRemediationPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:12:00Z",
  "status": "pass",
  "frontend_bundle_warning_count": 6,
  "frontend_bundle_note_count": 0,
  "artifact_paths": {
    "frontend_bundle_report": "C:\\artifacts\\release-readiness-current\\frontend-correctness\\frontend-bundle-report.json"
  }
}
'@ | Set-Content -Path $releaseReadinessPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T02:15:00Z",
  "counts": {
    "total_phases": 13,
    "implemented": 4,
    "partial": 2,
    "not_started": 1,
    "total_tasks": 12,
    "implemented_tasks": 9,
    "partial_tasks": 2,
    "not_started_tasks": 1,
    "residual_open_items": 1
  },
  "phases": [
    { "phase_number": 0, "title": "Terminology", "status": "not_started" },
    { "phase_number": 1, "title": "Autonomy", "status": "partial" },
    { "phase_number": 6, "title": "Approvals", "status": "implemented" }
  ],
  "open_tasks": [
    { "phase_number": 0, "task_number": 1, "text": "Define terminology.", "status": "not_started" },
    { "phase_number": 1, "task_number": 5, "text": "Normalize mapping.", "status": "partial" },
    { "phase_number": 1, "task_number": 6, "text": "Add deterministic helpers.", "status": "partial" }
  ],
  "open_items": [
    { "item_kind": "task", "phase_number": 0, "task_number": 1, "text": "Define terminology.", "status": "not_started" },
    { "item_kind": "task", "phase_number": 1, "task_number": 5, "text": "Normalize mapping.", "status": "partial" },
    { "item_kind": "task", "phase_number": 1, "task_number": 6, "text": "Add deterministic helpers.", "status": "partial" },
    { "item_kind": "phase_note", "phase_number": 1, "task_number": null, "text": "remaining work is compact renderer cleanup", "status": "partial" }
  ],
  "open_phase_summaries": [
    { "phase_number": 1, "phase_title": "Autonomy", "status": "partial", "open_task_count": 2, "residual_open_item_count": 1, "total_open_item_count": 3 },
    { "phase_number": 0, "phase_title": "Terminology", "status": "not_started", "open_task_count": 1, "residual_open_item_count": 0, "total_open_item_count": 1 }
  ]
}
'@ | Set-Content -Path $personalOsAuditPath -Encoding ASCII

    @'
{
  "copied_path_count": 42,
  "total_staged_bytes": 123456789,
  "total_staged_gib": 0.114978
}
'@ | Set-Content -Path $stageManifestPath -Encoding ASCII

    @'
{
  "local": {
    "safe_delete_count": 20,
    "safe_delete_gib": 15.992113,
    "recommended_delete_order": [
      { "relative_path": "target" },
      { "relative_path": "solid-ui\\node_modules" },
      { "relative_path": "python-sdk\\.venv" }
    ]
  },
  "oracle": {
    "summary": {
      "synthetic_message_pressure_status": "duplicate_snapshot_rows_detected",
      "synthetic_message_pressure_summary": "detected duplicate snapshot-like synthetic rows that should be pruned and kept bounded with latest-only semantics",
      "synthetic_message_pressure_total_dupes": 1692804,
      "synthetic_message_pressure_maintenance_summary_dupes": 1128537,
      "synthetic_message_pressure_curator_card_dupes": 281633,
      "synthetic_message_pressure_curator_backlink_dupes": 141821,
      "synthetic_message_pressure_ingestion_topology_dupes": 140813,
      "synthetic_message_cleanup_mode": "executed",
      "synthetic_message_cleanup_command": "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze",
      "synthetic_message_cleanup_deleted_total": 1692804,
      "synthetic_message_cleanup_before_total_dupes": 1692804,
      "synthetic_message_cleanup_after_total_dupes": 0,
      "synthetic_message_cleanup_before_maintenance_summary_dupes": 1128537,
      "synthetic_message_cleanup_before_curator_card_dupes": 281633,
      "synthetic_message_cleanup_before_curator_backlink_dupes": 141821,
      "synthetic_message_cleanup_before_ingestion_topology_dupes": 140813,
      "operational_history_pressure_status": "operational_history_present",
      "operational_history_pressure_total_rows": 19800,
      "operational_history_cleanup_mode": "executed",
      "operational_history_cleanup_command": "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze",
      "operational_history_cleanup_deleted_total": 0,
      "operational_history_cleanup_before_total_rows": 19800,
      "operational_history_cleanup_after_total_rows": 19800
    },
    "runtime_required_group_count": 1,
    "runtime_required_known_gib": 3.026622,
    "non_runtime_group_count": 3,
    "non_runtime_known_gib": 11.837633,
    "safe_now_group_count": 1,
    "safe_now_known_gib": 1.4,
    "review_required_group_count": 2,
    "review_required_known_gib": 10.437633,
    "runtime_keep_group_names": [
      "omnyid_runtime"
    ],
    "cloud_omit_priority_group_names": [
      "host_logs",
      "shared_host_supabase",
      "omnyid_backup_retention"
    ],
    "group_summary": [
      {
        "ownership_group": "host_logs",
        "deployment_class": "safe_cleanup_candidate",
        "required_on_oracle": false,
        "safe_to_delete_now": true,
        "delete_precondition": "safe_cleanup_candidate",
        "known_size_gib": 1.4
      },
      {
        "ownership_group": "shared_host_supabase",
        "deployment_class": "non_omnyid_review",
        "required_on_oracle": false,
        "safe_to_delete_now": false,
        "delete_precondition": "remove_only_if_supabase_is_not_required",
        "known_size_gib": 9.235644
      },
      {
        "ownership_group": "omnyid_backup_retention",
        "deployment_class": "backup_only_review",
        "required_on_oracle": false,
        "safe_to_delete_now": false,
        "delete_precondition": "trim_after_backup_retention_review",
        "known_size_gib": 1.201989
      },
      {
        "ownership_group": "omnyid_runtime",
        "deployment_class": "runtime_required",
        "required_on_oracle": true,
        "safe_to_delete_now": false,
        "delete_precondition": "keep_on_host",
        "known_size_gib": 3.026622
      }
    ],
    "delete_priority": [
      {
        "ownership_group": "host_logs",
        "safe_to_delete_now": true,
        "known_size_gib": 1.4
      },
      {
        "ownership_group": "shared_host_supabase",
        "safe_to_delete_now": false,
        "known_size_gib": 9.235644
      },
      {
        "ownership_group": "omnyid_backup_retention",
        "safe_to_delete_now": false,
        "known_size_gib": 1.201989
      }
    ]
  }
}
'@ | Set-Content -Path $storageHygienePath -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $oracleProofPath `
        -OracleInventoryPath $oracleInventoryPath `
        -OracleCleanupPlanPath $oracleCleanupPlanPath `
        -OracleCleanupExecutePath $oracleCleanupExecutePath `
        -OracleRemediationPath $oracleRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $personalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -StorageHygienePath $storageHygienePath `
        -OutDir $outDir `
        -StatusDocPath $statusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected snapshot script to pass`n$output"
    }

    $outputText = $output | Out-String
    Assert-Contains -Actual $outputText -Expected "status=not_ready"
    Assert-Contains -Actual $outputText -Expected "blockers=16"

    $markdown = Get-Content (Join-Path $outDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $markdown -Expected "- oracle_inventory_root_use_pct: 97"
    Assert-Contains -Actual $markdown -Expected "- oracle_cleanup_plan_disk_pressure_status: candidate_cleanup_unlikely_to_clear_pressure"
    Assert-Contains -Actual $markdown -Expected "- oracle_evidence_consistency_status: warn"
    Assert-Contains -Actual $markdown -Expected "- oracle_proof_generated_at: "
    Assert-Contains -Actual $markdown -Expected "- oracle_inventory_generated_at: 2026-08-18T02:00:00Z"
    Assert-Contains -Actual $markdown -Expected "- oracle_cleanup_plan_generated_at: 2026-08-18T02:05:00Z"
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_generated_at: 2026-08-18T02:10:00Z"
    Assert-Contains -Actual $markdown -Expected "- personalos_audit_generated_at: 2026-08-18T02:15:00Z"
    Assert-Contains -Actual $markdown -Expected "- oracle_candidate_cleanup_items: 3"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_target_group: shared_host_supabase"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_target_known_size_gib: 9.235644"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_target_review_count: 32"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_target_recommended_action: review and remove the shared_host_supabase group in one maintenance window because root disk pressure remains saturated"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_drill_gap_gib: 7.27"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_safe_now_cleanup_gib: 1.4"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_safe_now_only_clears_gap: False"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_safe_now_remaining_gap_gib: 6"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_top_review_target_clears_gap: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_omnyid_backup_retention_gib: 1.201989"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_omnyid_only_clears_gap: False"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_combined_retention_and_top_review_gib: 10.437633"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_combined_retention_and_top_review_clears_gap: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_restore_capacity_recommendation: review the top non-runtime target 'shared_host_supabase' first; its known reclaim scope alone is enough to clear the restore-drill disk gap"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_target_cleanup_command: docker rm -f supabase-auth ; docker volume rm supabase_db-config ; docker image rm supabase/edge-runtime:v1.70.3"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_repair_required: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_repair_kind: redeploy"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_repair_blocks_backup_verify: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_repair_blocks_restore_drill: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_script_integrity_status: fail"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_script_integrity_detail: remote runtime is missing required scripts: scripts/omnyid-backup-verify.sh"
    Assert-Contains -Actual $markdown -Expected "- oracle_missing_runtime_scripts: scripts/omnyid-backup-verify.sh"
    Assert-Contains -Actual $markdown -Expected "- local_stage_runtime_script_integrity_status: unknown"
    Assert-Contains -Actual $markdown -Expected "- local_stage_runtime_script_integrity_detail: local staged runtime manifest does not declare required runtime scripts"
    Assert-Contains -Actual $markdown -Expected "- oracle_backup_verify_detail: backup verify script missing from runtime"
    Assert-Contains -Actual $markdown -Expected "- oracle_cleanup_execute_available: False"
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_current_with_inputs: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_stale_relative_to_inputs: False"
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_outcome: proof_not_rechecked"
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_cleanup_step_count: 4"
    Assert-Contains -Actual $markdown -Expected "- release_readiness_artifact_present: True"
    Assert-Contains -Actual $markdown -Expected "- release_readiness_status: pass"
    Assert-Contains -Actual $markdown -Expected "- release_readiness_generated_at: 2026-08-18T02:12:00Z"
    Assert-Contains -Actual $markdown -Expected "- release_readiness_frontend_bundle_warning_count: 6"
    Assert-Contains -Actual $markdown -Expected "- release_readiness_frontend_bundle_note_count: 0"
    Assert-Contains -Actual $markdown -Expected "- release_readiness_frontend_bundle_report: C:\artifacts\release-readiness-current\frontend-correctness\frontend-bundle-report.json"
    Assert-Contains -Actual $markdown -Expected "- policy_max_frontend_bundle_warnings: 2"
    Assert-Contains -Actual $markdown -Expected "- policy_accepted_frontend_bundle_warning_count: 6"
    Assert-Contains -Actual $markdown -Expected "- policy_frontend_bundle_warning_threshold_met: False"
    Assert-Contains -Actual $markdown -Expected "- policy_require_executed_oracle_remediation: False"
    Assert-Contains -Actual $markdown -Expected "- policy_oracle_remediation_execution_policy_met: True"
    Assert-Contains -Actual $markdown -Expected "- oracle_safe_now_cleanup_execute_hint: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute"
    Assert-Contains -Actual $markdown -Expected "- oracle_safe_now_cleanup_follow_through_command: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    Assert-Contains -Actual $markdown -Expected "- oracle_phase_two_cleanup_execute_hint: "
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_wal_slot_remediation: " + $oracleWalSlotRemediationPath)
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_synthetic_cleanup: " + $oracleSyntheticCleanupPath)
    Assert-Contains -Actual $markdown -Expected ("- artifact_oracle_operational_history_cleanup: " + $oracleOperationalHistoryCleanupPath)
    Assert-Contains -Actual $markdown -Expected "- staged_runtime_gib: 0.114978"
    Assert-Contains -Actual $markdown -Expected "- local_stage_manifest_present: True"
    Assert-Contains -Actual $markdown -Expected "- local_stage_required_runtime_scripts_count: 0"

    $proofPassedRoot = Join-Path $tmpRoot "proof-passed-current"
    New-Item -ItemType Directory -Path $proofPassedRoot -Force | Out-Null
    $proofPassedCurrentPath = Join-Path $proofPassedRoot "oracle-production-proof.json"
    $proofPassedRemediationPath = Join-Path $tmpRoot "oracle-remediation-sequence-proof-passed.json"
    $proofPassedInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-proof-passed.json"
    $proofPassedCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-proof-passed.json"
    $proofPassedOutDir = Join-Path $tmpRoot "out-proof-passed"
    $proofPassedStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_PROOF_PASSED.md"

    @'
{
  "generated_at": "2026-08-25T14:19:11.8329030Z",
  "status": "pass",
  "remote_host": "oracle.example",
  "failure_step": "none",
  "failure_reason": "none",
  "remote_root_use_pct": "77",
  "remote_var_use_pct": "77",
  "latest_archive": "/var/backups/omnyid/20260825T050754Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "backup verified",
  "restore_drill_status": "pass",
  "restore_drill_detail": "restore drill passed"
}
'@ | Set-Content -Path $proofPassedCurrentPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T14:00:00Z",
  "counts": {
    "candidate_cleanup_items": 0,
    "candidate_cleanup_image_gib": 0
  },
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "34G",
      "avail": "11G",
      "use_pct": "77%"
    }
  ]
}
'@ | Set-Content -Path $proofPassedInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T14:05:00Z",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 0
  },
  "estimated_reclaim": {
    "total_candidate_gib": 0
  },
  "disk_pressure": {
    "root_use_pct_int": 77,
    "status": "candidate_cleanup_likely_sufficient_for_retest",
    "summary": "root filesystem is at 77% use with 11G free"
  },
  "review_pressure": {
    "top_target_group": "omnyid_backup_retention",
    "top_target_known_size_gib": 0.593506,
    "top_target_review_count": 1,
    "recommended_action": "review this non-runtime group before cleanup"
  }
}
'@ | Set-Content -Path $proofPassedCleanupPlanPath -Encoding ASCII

    @"
{
  "generated_at": "2026-08-25T12:48:48.9196255Z",
  "remediation_summary": {
    "outcome": "proof_passed",
    "cleanup_mode": "executed",
    "cleanup_step_count": 4,
    "planned_candidate_containers": 0,
    "planned_candidate_volumes": 0,
    "planned_candidate_images": 0,
    "baseline_root_use_pct": 77,
    "final_root_use_pct": 77,
    "root_use_delta_pct": 0,
    "baseline_backup_verify_status": "pass",
    "final_backup_verify_status": "pass",
    "baseline_restore_drill_status": "skipped",
    "final_restore_drill_status": "pass",
    "baseline_blocker": "none: none",
    "final_blocker": "none: none",
    "final_proof_path": "$($proofPassedCurrentPath -replace '\\', '\\')"
  }
}
"@ | Set-Content -Path $proofPassedRemediationPath -Encoding ASCII

    $proofPassedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $proofPassedCurrentPath `
        -OracleInventoryPath $proofPassedInventoryPath `
        -OracleCleanupPlanPath $proofPassedCleanupPlanPath `
        -OracleCleanupExecutePath $oracleCleanupExecutePath `
        -OracleRemediationPath $proofPassedRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $personalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -StorageHygienePath $storageHygienePath `
        -OutDir $proofPassedOutDir `
        -StatusDocPath $proofPassedStatusDocPath `
        -MaxFrontendBundleWarnings 6 `
        -RequireExecutedOracleRemediation 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected proof-passed snapshot script to pass`n$proofPassedOutput"
    }

    $proofPassedSnapshot = Get-Content (Join-Path $proofPassedOutDir "commercial-readiness-snapshot.json") -Raw | ConvertFrom-Json
    if ([string]$proofPassedSnapshot.oracle_evidence_consistency.status -ne "pass") {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected proof-passed remediation alignment to clear consistency blockers"
    }
    Assert-Contains -Actual $markdown -Expected "- personalos_residual_open_items: 1"
    Assert-Contains -Actual $markdown -Expected "- storage_local_safe_delete_gib: 15.992113"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_safe_cleanup_group_count: 1"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_safe_cleanup_gib: 1.4"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_review_required_group_count: 2"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_review_required_gib: 10.437633"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_runtime_required_group_count: 1"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_runtime_required_gib: 3.026622"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_status: duplicate_snapshot_rows_detected"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_summary: detected duplicate snapshot-like synthetic rows that should be pruned and kept bounded with latest-only semantics"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_total_dupes: 1692804"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_maintenance_summary_dupes: 1128537"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_curator_card_dupes: 281633"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_curator_backlink_dupes: 141821"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_pressure_ingestion_topology_dupes: 140813"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_mode: executed"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_command: ./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_deleted_total: 1692804"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_before_total_dupes: 1692804"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_after_total_dupes: 0"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_before_maintenance_summary_dupes: 1128537"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_before_curator_card_dupes: 281633"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_before_curator_backlink_dupes: 141821"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_synthetic_message_cleanup_before_ingestion_topology_dupes: 140813"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_pressure_status: operational_history_present"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_pressure_total_rows: 19800"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_mode: executed"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_command: ./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_deleted_total: 0"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_before_total_rows: 19800"
    Assert-Contains -Actual $markdown -Expected "- storage_oracle_operational_history_cleanup_after_total_rows: 19800"

    $snapshotJson = Get-Content (Join-Path $outDir "commercial-readiness-snapshot.json") -Raw | ConvertFrom-Json
    if ($snapshotJson.storage.oracle_synthetic_message_pressure_status -ne "duplicate_snapshot_rows_detected") {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected synthetic message pressure status in snapshot storage block"
    }
    if ([int]$snapshotJson.storage.oracle_synthetic_message_pressure_total_dupes -ne 1692804) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected synthetic message pressure total dupes in snapshot storage block"
    }
    if ($snapshotJson.storage.oracle_synthetic_message_cleanup_mode -ne "executed") {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected synthetic message cleanup mode in snapshot storage block"
    }
    if ([int]$snapshotJson.storage.oracle_synthetic_message_cleanup_deleted_total -ne 1692804) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected synthetic message deleted total in snapshot storage block"
    }
    if ([int]$snapshotJson.storage.oracle_synthetic_message_cleanup_after_total_dupes -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected synthetic message after-total dupes in snapshot storage block"
    }
    if ($snapshotJson.storage.oracle_operational_history_pressure_status -ne "operational_history_present") {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected operational history pressure status in snapshot storage block"
    }
    if ([int]$snapshotJson.storage.oracle_operational_history_pressure_total_rows -ne 19800) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected operational history total rows in snapshot storage block"
    }
    if ($snapshotJson.storage.oracle_operational_history_cleanup_mode -ne "executed") {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected operational history cleanup mode in snapshot storage block"
    }
    if ($snapshotJson.artifact_paths.oracle_wal_slot_remediation -ne $oracleWalSlotRemediationPath) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected WAL-slot remediation artifact path in snapshot artifact block"
    }
    if ($snapshotJson.artifact_paths.oracle_synthetic_cleanup -ne $oracleSyntheticCleanupPath) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected synthetic cleanup artifact path in snapshot artifact block"
    }
    if ($snapshotJson.artifact_paths.oracle_operational_history_cleanup -ne $oracleOperationalHistoryCleanupPath) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected operational history cleanup artifact path in snapshot artifact block"
    }
    Assert-Contains -Actual $markdown -Expected "- storage_top_oracle_safe_cleanup_group: host_logs"
    Assert-Contains -Actual $markdown -Expected "- storage_top_oracle_safe_cleanup_gib: 1.4"
    Assert-Contains -Actual $markdown -Expected "- storage_top_oracle_delete_priority_groups: host_logs, shared_host_supabase, omnyid_backup_retention"
    Assert-Contains -Actual $markdown -Expected "- storage_top_oracle_runtime_required_groups: omnyid_runtime"
    Assert-Contains -Actual $markdown -Expected "Phase 0: Terminology [not_started]"
    Assert-Contains -Actual $markdown -Expected "## Priority personalOS Phase Load"
    Assert-Contains -Actual $markdown -Expected "Phase 1: Autonomy (3 open = 2 tasks + 1 residual)"
    Assert-Contains -Actual $markdown -Expected "## Top Open personalOS Tasks"
    Assert-Contains -Actual $markdown -Expected "## Residual personalOS Phase Clusters"
    Assert-Contains -Actual $markdown -Expected "Phase 1: 1 residual blocker(s)"
    Assert-Contains -Actual $markdown -Expected "## Top Residual personalOS Blockers"
    Assert-Contains -Actual $markdown -Expected "Phase 1 / Residual: remaining work is compact renderer cleanup [partial]"
    Assert-Contains -Actual $markdown -Expected "## Oracle Evidence Consistency"
    Assert-Contains -Actual $markdown -Expected "proof root use is 100% but inventory root use is 97%"
    Assert-Contains -Actual $markdown -Expected "readiness artifact 'oracle_inventory' is stale"
    Assert-Contains -Actual $markdown -Expected "readiness artifact 'oracle_cleanup_plan' is stale"
    Assert-Contains -Actual $markdown -Expected "readiness artifact 'oracle_remediation' is stale"
    Assert-Contains -Actual $markdown -Expected "readiness artifact 'personalos_audit' is stale"

    $statusDoc = Get-Content $statusDocPath -Raw
    Assert-Contains -Actual $statusDoc -Expected "Current status: ``not_ready``"
    Assert-Contains -Actual $statusDoc -Expected "Current promotion gate: ``no_go``"
    Assert-Contains -Actual $statusDoc -Expected "Current frontend bundle warning policy threshold: ``2``"
    Assert-Contains -Actual $statusDoc -Expected "Current frontend bundle warning policy satisfied: ``False``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle executed-remediation policy required: ``False``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle executed-remediation policy satisfied: ``True``"
    Assert-Contains -Actual $statusDoc -Expected "Release-readiness status is ``pass``"
    Assert-Contains -Actual $statusDoc -Expected "Frontend bundle budget warnings in the latest release-readiness artifact: ``6``"
    Assert-Contains -Actual $statusDoc -Expected "Frontend bundle budget notes in the latest release-readiness artifact: ``0``"
    Assert-Contains -Actual $statusDoc -Expected 'The newest Oracle backup under `/var/backups/omnyid` is about `42` days old as of '
    Assert-Contains -Actual $statusDoc -Expected 'The latest Oracle inventory shows `/` at `97%` use with `1.6G` free.'
    Assert-Contains -Actual $statusDoc -Expected 'Oracle evidence consistency is `warn`: `proof root use is 100% but inventory root use is 97%; proof root use is 100% but cleanup-plan root use is 97%`'
    Assert-Contains -Actual $statusDoc -Expected 'Stale readiness artifacts are still in use: `oracle_restore_proof, oracle_inventory, oracle_cleanup_plan, oracle_remediation, personalos_audit`.'
    Assert-Contains -Actual $statusDoc -Expected "Runtime script integrity detail: ``remote runtime is missing required scripts: scripts/omnyid-backup-verify.sh``"
    Assert-Contains -Actual $statusDoc -Expected "Missing runtime scripts: ``scripts/omnyid-backup-verify.sh``"
    Assert-Contains -Actual $statusDoc -Expected "Local staged runtime script integrity is ``unknown``"
    Assert-Contains -Actual $statusDoc -Expected "Local staged runtime detail: ``local staged runtime manifest does not declare required runtime scripts``"
    Assert-Contains -Actual $statusDoc -Expected "Backup verification detail: ``backup verify script missing from runtime``"
    Assert-Contains -Actual $statusDoc -Expected "Restore-drill detail: ``blocked by backup verification failure``"
    Assert-Contains -Actual $statusDoc -Expected "Restore-drill capacity shortfall: ``7805818732`` bytes (about ``7.27 GiB``)"
    Assert-Contains -Actual $statusDoc -Expected "Safe-now Oracle cleanup scope: ``1.4 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Safe-now Oracle cleanup alone clears restore gap: ``False``"
    Assert-Contains -Actual $statusDoc -Expected "Remaining restore gap after the safe-now Oracle cleanup: ``6 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Older OmnyID backup-retention review scope: ``1.201989 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Top review target alone clears restore gap: ``True``"
    Assert-Contains -Actual $statusDoc -Expected "Older OmnyID backup retention alone clears restore gap: ``False``"
    Assert-Contains -Actual $statusDoc -Expected "Combined older OmnyID retention plus top review target scope: ``10.437633 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Combined older OmnyID retention plus top review target clears restore gap: ``True``"
    Assert-Contains -Actual $statusDoc -Expected "Restore-gap recommendation: ``review the top non-runtime target 'shared_host_supabase' first; its known reclaim scope alone is enough to clear the restore-drill disk gap``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle runtime repair still requires a redeploy step because ``remote runtime is missing required scripts and should be redeployed from the staged runtime bundle before backup verification and restore-drill results are treated as authoritative``"
    Assert-Contains -Actual $statusDoc -Expected "runtime repair deploy required: ``remote runtime is missing required scripts and should be redeployed from the staged runtime bundle before backup verification and restore-drill results are treated as authoritative``"
    Assert-Contains -Actual $statusDoc -Expected "recommended runtime repair action: ``./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts``"
    Assert-Contains -Actual $statusDoc -Expected "local staged runtime manifest present: ``True``"
    Assert-Contains -Actual $statusDoc -Expected "local staged runtime required script count: ``0``"
    Assert-Contains -Actual $statusDoc -Expected 'about `3.12 GiB` total candidate reclaim according to the cleanup plan'
    Assert-Contains -Actual $statusDoc -Expected 'cleanup-plan disk pressure status: `candidate_cleanup_unlikely_to_clear_pressure`'
    Assert-Contains -Actual $statusDoc -Expected 'top review target group: `shared_host_supabase`'
    Assert-Contains -Actual $statusDoc -Expected 'top review target known size: `9.235644 GiB`'
    Assert-Contains -Actual $statusDoc -Expected 'top review target review count: `32`'
    Assert-Contains -Actual $statusDoc -Expected 'top review target action: `review and remove the shared_host_supabase group in one maintenance window because root disk pressure remains saturated`'
    Assert-Contains -Actual $statusDoc -Expected 'Exact review-target cleanup command:'
    Assert-Contains -Actual $statusDoc -Expected 'docker rm -f supabase-auth ; docker volume rm supabase_db-config ; docker image rm supabase/edge-runtime:v1.70.3'
    Assert-Contains -Actual $statusDoc -Expected '- `artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json`'
    Assert-Contains -Actual $statusDoc -Expected 'Oracle remediation sub-artifacts:'
    Assert-Contains -Actual $statusDoc -Expected ('- `wal_slot_remediation`: `' + $oracleWalSlotRemediationPath + '`')
    Assert-Contains -Actual $statusDoc -Expected ('- `synthetic_cleanup`: `' + $oracleSyntheticCleanupPath + '`')
    Assert-Contains -Actual $statusDoc -Expected '- `artifacts/storage-hygiene-report-current/storage-hygiene-report.json`'
    Assert-Contains -Actual $statusDoc -Expected '- `artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.md`'
    Assert-Contains -Actual $statusDoc -Expected '- `artifacts/storage-hygiene-report-current/storage-hygiene-report.md`'
    Assert-Contains -Actual $statusDoc -Expected './scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current'
    Assert-Contains -Actual $statusDoc -Expected "remediation outcome: ``proof_not_rechecked``"
    Assert-Contains -Actual $statusDoc -Expected "## Local Storage Hygiene"
    Assert-Contains -Actual $statusDoc -Expected "safe local rebuildable reclaim currently totals about ``15.992113 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "safe local delete candidate count: ``20``"
    Assert-Contains -Actual $statusDoc -Expected 'top local delete candidates: `target, solid-ui\node_modules, python-sdk\.venv`'
    Assert-Contains -Actual $statusDoc -Expected 'storage hygiene artifact: `artifacts/storage-hygiene-report-current/storage-hygiene-report.json`'
    Assert-Contains -Actual $statusDoc -Expected "## Oracle Host Storage Hygiene"
    Assert-Contains -Actual $statusDoc -Expected "safe-now Oracle cleanup currently totals about ``1.4 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "safe-now Oracle cleanup alone clears the current restore gap: ``False``"
    Assert-Contains -Actual $statusDoc -Expected "remaining restore gap after safe-now cleanup would still be about ``6 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "safe-now Oracle cleanup group count: ``1``"
    Assert-Contains -Actual $statusDoc -Expected "top safe-now Oracle cleanup group: ``host_logs``"
    Assert-Contains -Actual $statusDoc -Expected "top safe-now Oracle cleanup size: ``1.4 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle runtime-required footprint currently totals about ``3.026622 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle runtime-required group count: ``1``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle runtime-required groups to keep on host: ``omnyid_runtime``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle review-required non-runtime reclaim totals about ``10.437633 GiB``"
    Assert-Contains -Actual $statusDoc -Expected "Oracle review-required group count: ``2``"
    Assert-Contains -Actual $statusDoc -Expected 'Oracle delete priority groups: `host_logs, shared_host_supabase, omnyid_backup_retention`'
    Assert-Contains -Actual $statusDoc -Expected "synthetic message pressure status: ``duplicate_snapshot_rows_detected``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message pressure summary: ``detected duplicate snapshot-like synthetic rows that should be pruned and kept bounded with latest-only semantics``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message duplicate rows currently present: ``1692804``"
    Assert-Contains -Actual $statusDoc -Expected "maintenance-summary duplicate rows currently present: ``1128537``"
    Assert-Contains -Actual $statusDoc -Expected "curator-card duplicate rows currently present: ``281633``"
    Assert-Contains -Actual $statusDoc -Expected "curator-backlink duplicate rows currently present: ``141821``"
    Assert-Contains -Actual $statusDoc -Expected "ingestion-topology duplicate rows currently present: ``140813``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message cleanup mode: ``executed``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message cleanup deleted rows: ``1692804``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message duplicate rows before cleanup: ``1692804``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message duplicate rows after cleanup: ``0``"
    Assert-Contains -Actual $statusDoc -Expected "maintenance-summary duplicate rows before cleanup: ``1128537``"
    Assert-Contains -Actual $statusDoc -Expected "curator-card duplicate rows before cleanup: ``281633``"
    Assert-Contains -Actual $statusDoc -Expected "curator-backlink duplicate rows before cleanup: ``141821``"
    Assert-Contains -Actual $statusDoc -Expected "ingestion-topology duplicate rows before cleanup: ``140813``"
    Assert-Contains -Actual $statusDoc -Expected "synthetic message cleanup command: ``./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze``"
    Assert-Contains -Actual $statusDoc -Expected "## Oracle Cloud Deployment Matrix"
    Assert-Contains -Actual $statusDoc -Expected "| ownership_group | deployment_class | required_on_oracle | safe_to_delete_now | size_gib | delete_precondition |"
    Assert-Contains -Actual $statusDoc -Expected "| host_logs | safe_cleanup_candidate | False | True | 1.4 | safe_cleanup_candidate |"
    Assert-Contains -Actual $statusDoc -Expected "| omnyid_runtime | runtime_required | True | False | 3.026622 | keep_on_host |"
    Assert-Contains -Actual $statusDoc -Expected "Execute the safe-now Oracle cleanup phase first if you want a low-risk remeasurement pass:"
    Assert-Contains -Actual $statusDoc -Expected "This safe-now pass does not clear the full restore gap by itself; it is a lower-risk remeasurement step that would still leave about ``6 GiB`` unresolved if the reclaim estimate holds."
    Assert-Contains -Actual $statusDoc -Expected "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    Assert-Contains -Actual $statusDoc -Expected '(`2` partial, `1` not started)'
    Assert-Contains -Actual $statusDoc -Expected "The same audit also found ``1`` residual phase-level blockers"
    Assert-Contains -Actual $statusDoc -Expected "Residual blocker clustering:"
    Assert-Contains -Actual $statusDoc -Expected "Priority phase load:"
    Assert-Contains -Actual $statusDoc -Expected "Phase 1: Autonomy (3 open = 2 tasks + 1 residual)"
    Assert-Contains -Actual $statusDoc -Expected "Phase 1: 1 residual blocker(s)"
    Assert-Contains -Actual $statusDoc -Expected "## Artifact Freshness"
    Assert-Contains -Actual $statusDoc -Expected '- `release_readiness` generated at `2026-08-18T02:12:00Z` with status `pass`.'
    Assert-Contains -Actual $statusDoc -Expected '- `oracle_inventory` generated at `2026-08-18T02:00:00Z`'
    Assert-Contains -Actual $statusDoc -Expected '- `oracle_cleanup_plan` generated at `2026-08-18T02:05:00Z`'
    Assert-Contains -Actual $statusDoc -Expected '- `oracle_remediation` generated at `2026-08-18T02:10:00Z`'
    Assert-Contains -Actual $statusDoc -Expected '- `personalos_audit` generated at `2026-08-18T02:15:00Z`'
    Assert-Contains -Actual $statusDoc -Expected './scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh -RefreshOracleInventory -RefreshOracleRemediation'
    Assert-Contains -Actual $statusDoc -Expected 'Because the current stale readiness set is `oracle_restore_proof, oracle_inventory, oracle_cleanup_plan, oracle_remediation, personalos_audit`, this refresh command is expanded to regenerate the stale Oracle artifacts while always rerunning the local personalOS audit and runtime staging steps.'
    Assert-Contains -Actual $statusDoc -Expected 'The same refresh also emits the storage-hygiene artifact so Oracle restore pressure and safe local reclaim are visible in one bundle.'
    Assert-Contains -Actual $statusDoc -Expected "## Open personalOS Phases"
    Assert-Contains -Actual $statusDoc -Expected "## Top Open personalOS Tasks"
    Assert-Contains -Actual $statusDoc -Expected "## Top Residual personalOS Blockers"
    Assert-Contains -Actual $statusDoc -Expected "Phase 1 / Residual: remaining work is compact renderer cleanup [partial]"

    $comparisonSnapshotPath = Join-Path $tmpRoot "commercial-readiness-snapshot-strict.json"
    $comparisonStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_COMPARISON.md"
    @'
{
  "generated_at": "2026-08-24T01:25:25.2485741Z",
  "policy": {
    "max_frontend_bundle_warnings": 1,
    "require_executed_oracle_remediation": true,
    "accepted_frontend_bundle_warning_count": 1,
    "accepted_frontend_bundle_warning_threshold_met": true,
    "oracle_remediation_execution_policy_met": false
  },
  "commercial_readiness": {
    "status": "not_ready",
    "blocker_count": 2,
    "blockers": [
      "oracle remediation cleanup mode is 'dry_run' and does not satisfy executed-remediation policy",
      "oracle remediation outcome is 'proof_not_rechecked' and does not satisfy executed-remediation policy"
    ]
  }
}
'@ | Set-Content -Path $comparisonSnapshotPath -Encoding ASCII

    $comparisonOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $oracleProofPath `
        -OracleInventoryPath $oracleInventoryPath `
        -OracleCleanupPlanPath $oracleCleanupPlanPath `
        -OracleCleanupExecutePath $oracleCleanupExecutePath `
        -OracleRemediationPath $oracleRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $personalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -StorageHygienePath $storageHygienePath `
        -OutDir $outDir `
        -StatusDocPath $comparisonStatusDocPath `
        -ComparisonSnapshotPath $comparisonSnapshotPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected comparison snapshot script to pass`n$comparisonOutput"
    }

    $comparisonStatusDoc = Get-Content $comparisonStatusDocPath -Raw
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Current status: ``not_ready``"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Strict commercial gate status: ``not_ready``"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Strict promotion gate: ``no_go``"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "both the default and strict audited lanes still record blocking findings"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "## Gate Lanes"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "| default | ``not_ready`` | ``no_go`` | ``2`` | ``False`` | ``16`` |"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "| strict | ``not_ready`` | ``no_go`` | ``1`` | ``True`` | ``2`` |"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Strict frontend bundle warning policy threshold: ``1``"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Strict Oracle executed-remediation policy required: ``True``"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Strict blocker 1: ``oracle remediation cleanup mode is 'dry_run' and does not satisfy executed-remediation policy``"
    Assert-Contains -Actual $comparisonStatusDoc -Expected "Strict blocker 2: ``oracle remediation outcome is 'proof_not_rechecked' and does not satisfy executed-remediation policy``"

    $comparisonReadySnapshotPath = Join-Path $tmpRoot "commercial-readiness-snapshot-strict-ready.json"
    $comparisonReadyStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_COMPARISON_READY.md"
    $readyOracleProofPath = Join-Path $tmpRoot "oracle-production-proof-ready.json"
    $readyOracleInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-ready.json"
    $readyOracleCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-ready.json"
    $readyOracleCleanupExecutePath = Join-Path $tmpRoot "oracle-runtime-cleanup-execute-ready.json"
    $readyOracleRemediationPath = Join-Path $tmpRoot "oracle-remediation-sequence-ready.json"
    $readyReleaseReadinessPath = Join-Path $tmpRoot "release-readiness-summary-ready.json"
    $readyPersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-ready.json"
    $readyStageManifestPath = Join-Path $tmpRoot "oracle-runtime-manifest-ready.json"
    @'
{
  "generated_at": "2026-08-25T13:25:45.9563805Z",
  "policy": {
    "max_frontend_bundle_warnings": 1,
    "require_executed_oracle_remediation": true,
    "accepted_frontend_bundle_warning_count": 1,
    "accepted_frontend_bundle_warning_threshold_met": true,
    "oracle_remediation_execution_policy_met": true
  },
  "commercial_readiness": {
    "status": "ready",
    "blocker_count": 0,
    "blockers": []
  }
}
'@ | Set-Content -Path $comparisonReadySnapshotPath -Encoding ASCII

    @'
{
  "status": "pass",
  "generated_at": "2026-08-25T13:20:55.9818973Z",
  "remote_host": "oracle.example",
  "failure_step": "none",
  "failure_reason": "none",
  "remote_root_use_pct": "77",
  "remote_var_use_pct": "77",
  "latest_archive": "/var/backups/omnyid/20260825T050754Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "[omnyid-backup-verify] OK",
  "restore_drill_status": "pass",
  "restore_drill_detail": "restore drill completed"
}
'@ | Set-Content -Path $readyOracleProofPath -Encoding ASCII

    @'
{
  "counts": {
    "candidate_cleanup_items": 1,
    "candidate_cleanup_image_gib": 0
  },
  "generated_at": "2026-08-25T13:24:40.1683391Z",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "34G",
      "avail": "11G",
      "use_pct": "77%"
    }
  ]
}
'@ | Set-Content -Path $readyOracleInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T13:24:41.0142580Z",
  "classification_mode": "safe_review_default",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 0
  },
  "review_pressure": {
    "top_target_group": "omnyid_backup_retention",
    "top_target_known_size_gib": 0.593506,
    "top_target_review_count": 1,
    "recommended_action": "review this non-runtime group before cleanup"
  },
  "review_targets": [
    {
      "ownership_group": "omnyid_backup_retention",
      "known_size_gib": 0.593506,
      "review_count": 1,
      "recommended_action": "review this non-runtime group before cleanup"
    }
  ],
  "runtime_repair": {
    "required": false,
    "reason": null,
    "recommended_action": null,
    "blocks_backup_verify": false,
    "blocks_restore_drill": false
  },
  "estimated_reclaim": {
    "total_candidate_gib": 1
  },
  "disk_pressure": {
    "root_use_pct_int": 77,
    "status": "candidate_cleanup_likely_sufficient_for_retest",
    "summary": "root filesystem is at 77% use with 11G free; candidate cleanup may reclaim 1 GiB and project root usage to about 73%",
    "projected_root_use_pct_after_candidate_cleanup": 73
  }
}
'@ | Set-Content -Path $readyOracleCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T13:24:48.2483554Z",
  "steps": [
    { "name": "image_prune", "command": "docker image prune -af" },
    { "name": "builder_prune", "command": "docker builder prune -af" },
    { "name": "prune", "command": "docker system prune -f" }
  ]
}
'@ | Set-Content -Path $readyOracleCleanupExecutePath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T13:24:50.2626117Z",
  "remediation_summary": {
    "outcome": "proof_passed",
    "cleanup_mode": "executed",
    "cleanup_step_count": 3,
    "planned_candidate_containers": 0,
    "planned_candidate_volumes": 0,
    "planned_candidate_images": 0,
    "baseline_root_use_pct": 77,
    "final_root_use_pct": 77,
    "root_use_delta_pct": 0,
    "baseline_backup_verify_status": "pass",
    "final_backup_verify_status": "pass",
    "baseline_restore_drill_status": "pass",
    "final_restore_drill_status": "pass",
    "baseline_blocker": "none: none",
    "final_blocker": "none: none"
  }
}
'@ | Set-Content -Path $readyOracleRemediationPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T13:10:02.7608295Z",
  "status": "pass",
  "frontend_bundle_warning_count": 1,
  "frontend_bundle_note_count": 1,
  "artifact_paths": {
    "frontend_bundle_report": "C:\\artifacts\\release-readiness-current\\frontend-correctness\\frontend-bundle-report.json"
  }
}
'@ | Set-Content -Path $readyReleaseReadinessPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-25T12:34:49.3837639Z",
  "counts": {
    "total_phases": 13,
    "implemented": 13,
    "partial": 0,
    "not_started": 0,
    "total_tasks": 54,
    "implemented_tasks": 54,
    "partial_tasks": 0,
    "not_started_tasks": 0,
    "residual_open_items": 0
  },
  "phases": [
    { "phase_number": 0, "title": "Terminology", "status": "implemented" },
    { "phase_number": 1, "title": "Autonomy", "status": "implemented" }
  ],
  "open_tasks": [],
  "open_items": [],
  "open_phase_summaries": []
}
'@ | Set-Content -Path $readyPersonalOsAuditPath -Encoding ASCII

    @'
{
  "copied_path_count": 48,
  "copied_paths": [
    "scripts/omnyid-backup-verify.sh",
    "scripts/omnyid-backup.sh"
  ],
  "required_runtime_scripts": [
    "scripts/omnyid-backup-verify.sh",
    "scripts/omnyid-backup.sh"
  ],
  "total_staged_bytes": 123456789,
  "total_staged_gib": 0.022258
}
'@ | Set-Content -Path $readyStageManifestPath -Encoding ASCII

    $comparisonReadyOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $readyOracleProofPath `
        -OracleInventoryPath $readyOracleInventoryPath `
        -OracleCleanupPlanPath $readyOracleCleanupPlanPath `
        -OracleCleanupExecutePath $readyOracleCleanupExecutePath `
        -OracleRemediationPath $readyOracleRemediationPath `
        -ReleaseReadinessPath $readyReleaseReadinessPath `
        -PersonalOsAuditPath $readyPersonalOsAuditPath `
        -StageManifestPath $readyStageManifestPath `
        -StorageHygienePath $storageHygienePath `
        -OutDir $outDir `
        -StatusDocPath $comparisonReadyStatusDocPath `
        -ComparisonSnapshotPath $comparisonReadySnapshotPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected ready comparison snapshot script to pass`n$comparisonReadyOutput"
    }

    $comparisonReadyStatusDoc = Get-Content $comparisonReadyStatusDocPath -Raw
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "Current status: ``not_ready``"
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "Current promotion gate: ``no_go``"
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "Strict commercial gate status: ``ready``"
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "Strict promotion gate: ``go``"
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "the strict audited lane is commercially ready for promotion while the default lane still records blocking findings"
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "| default | ``not_ready`` | ``no_go`` | ``2`` | ``False`` | ``7`` | Current audited artifacts support promotion. |"
    Assert-Contains -Actual $comparisonReadyStatusDoc -Expected "| strict | ``ready`` | ``go`` | ``1`` | ``True`` | ``0`` | Executed-remediation lane is also clear. |"

    $strictLaneOutDir = Join-Path $tmpRoot "out-strict-lane"
    $strictLaneOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $oracleProofPath `
        -OracleInventoryPath $oracleInventoryPath `
        -OracleCleanupPlanPath $oracleCleanupPlanPath `
        -OracleCleanupExecutePath $oracleCleanupExecutePath `
        -OracleRemediationPath $oracleRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $personalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -StorageHygienePath $storageHygienePath `
        -OutDir $strictLaneOutDir `
        -MaxFrontendBundleWarnings 1 `
        -RequireExecutedOracleRemediation 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected strict lane snapshot script to pass without explicit status doc path`n$strictLaneOutput"
    }
    $strictLaneStatusDocPath = Join-Path $strictLaneOutDir "COMMERCIAL_READINESS_STATUS.md"
    if (-not (Test-Path -LiteralPath $strictLaneStatusDocPath)) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected strict lane status doc at $strictLaneStatusDocPath"
    }
    $strictLaneStatusDoc = Get-Content $strictLaneStatusDocPath -Raw
    Assert-Contains -Actual $strictLaneStatusDoc -Expected "Current status: ``not_ready``"
    Assert-Contains -Actual $strictLaneStatusDoc -Expected "Current promotion gate: ``no_go``"

    $operationalHistoryPendingStorageHygienePath = Join-Path $tmpRoot "storage-hygiene-report-operational-history-pending.json"
    $operationalHistoryPendingOutDir = Join-Path $tmpRoot "out-operational-history-pending"
    $operationalHistoryPendingStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_OPERATIONAL_HISTORY_PENDING.md"
    (Get-Content -Path $storageHygienePath -Raw).Replace('"operational_history_cleanup_mode": "executed"', '"operational_history_cleanup_mode": "dry_run"') |
        Set-Content -Path $operationalHistoryPendingStorageHygienePath -Encoding ASCII

    $operationalHistoryPendingOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $oracleProofPath `
        -OracleInventoryPath $oracleInventoryPath `
        -OracleCleanupPlanPath $oracleCleanupPlanPath `
        -OracleCleanupExecutePath $oracleCleanupExecutePath `
        -OracleRemediationPath $oracleRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $personalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -StorageHygienePath $operationalHistoryPendingStorageHygienePath `
        -OutDir $operationalHistoryPendingOutDir `
        -StatusDocPath $operationalHistoryPendingStatusDocPath `
        -MaxFrontendBundleWarnings 1 `
        -RequireExecutedOracleRemediation 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected pending operational-history strict-lane snapshot script to pass`n$operationalHistoryPendingOutput"
    }
    $operationalHistoryPendingMarkdown = Get-Content (Join-Path $operationalHistoryPendingOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $operationalHistoryPendingMarkdown -Expected "- storage_oracle_operational_history_cleanup_mode: dry_run"
    Assert-Contains -Actual $operationalHistoryPendingMarkdown -Expected "- storage_oracle_operational_history_cleanup_follow_through_command: ./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    $operationalHistoryPendingStatusDoc = Get-Content $operationalHistoryPendingStatusDocPath -Raw
    Assert-Contains -Actual $operationalHistoryPendingStatusDoc -Expected "Oracle operational-history cleanup is 'dry_run' while 19800 bounded log rows remain under pressure"
    Assert-Contains -Actual $operationalHistoryPendingStatusDoc -Expected 'operational history cleanup follow-through command: `./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current`'
    Assert-Contains -Actual $operationalHistoryPendingStatusDoc -Expected 'Execute the bounded operational-history cleanup, rerun proof, and refresh the gate:'
    Assert-Contains -Actual $operationalHistoryPendingStatusDoc -Expected 'This is the strict-lane fix for per-user operational-history growth.'
    Assert-Contains -Actual $operationalHistoryPendingStatusDoc -Expected './scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current'

    $cleanupOnlyProofPath = Join-Path $tmpRoot "oracle-production-proof-cleanup.json"
    $cleanupOnlyInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-cleanup.json"
    $cleanupOnlyCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-cleanup.json"
    $cleanupOnlyPersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-cleanup.json"
    $cleanupOnlyOutDir = Join-Path $tmpRoot "out-cleanup"
    $cleanupOnlyStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_CLEANUP.md"

    @'
{
  "status": "fail",
  "remote_host": "oracle.example",
  "failure_step": "disk_capacity",
  "failure_reason": "remote root filesystem is at 100% use",
  "remote_root_use_pct": "100",
  "remote_var_use_pct": "100",
  "latest_archive": "/var/backups/omnyid/20260818T000000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "fail",
  "backup_verify_detail": "disk full before backup verification could complete",
  "restore_drill_status": "blocked",
  "restore_drill_detail": "blocked by backup verification failure"
}
'@ | Set-Content -Path $cleanupOnlyProofPath -Encoding ASCII

    @'
{
  "counts": {
    "candidate_cleanup_items": 33,
    "candidate_cleanup_image_gib": 9.235644
  },
  "generated_at": "2026-08-18T09:29:46Z",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "45G",
      "avail": "520K",
      "use_pct": "100%"
    }
  ]
}
'@ | Set-Content -Path $cleanupOnlyInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-18T09:30:06Z",
  "classification_mode": "targeted_ownership_cleanup_enabled",
  "counts": {
    "candidate_containers": 19,
    "candidate_volumes": 5,
    "candidate_images": 9
  },
  "runtime_repair": {
    "required": false,
    "reason": "",
    "recommended_action": "",
    "blocks_backup_verify": false,
    "blocks_restore_drill": false
  },
  "estimated_reclaim": {
    "total_candidate_gib": 9.235644
  },
  "disk_pressure": {
    "root_use_pct_int": 100,
    "projected_root_use_pct_after_candidate_cleanup": 79,
    "status": "critical",
    "summary": "root filesystem is at 100% use with 520K free; candidate cleanup may reclaim 9.235644 GiB and project root usage to about 79%"
  }
}
'@ | Set-Content -Path $cleanupOnlyCleanupPlanPath -Encoding ASCII

    Copy-Item -LiteralPath $personalOsAuditPath -Destination $cleanupOnlyPersonalOsAuditPath -Force

    $cleanupOnlyOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $cleanupOnlyProofPath `
        -OracleInventoryPath $cleanupOnlyInventoryPath `
        -OracleCleanupPlanPath $cleanupOnlyCleanupPlanPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $cleanupOnlyPersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $cleanupOnlyOutDir `
        -StatusDocPath $cleanupOnlyStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected cleanup-only snapshot script to pass`n$cleanupOnlyOutput"
    }
    $cleanupOnlyMarkdown = Get-Content (Join-Path $cleanupOnlyOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "- oracle_runtime_repair_kind: targeted_cleanup"
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "- oracle_runtime_repair_required: True"
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "- oracle_cleanup_plan_classification_mode: targeted_ownership_cleanup_enabled"
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "- oracle_runtime_repair_blocks_backup_verify: True"
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "- oracle_runtime_repair_blocks_restore_drill: True"
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "- oracle_runtime_repair_recommended_action: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath"
    Assert-Contains -Actual $cleanupOnlyMarkdown -Expected "-IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
    $cleanupOnlyStatusDoc = Get-Content $cleanupOnlyStatusDocPath -Raw
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected "Oracle runtime repair still requires a targeted cleanup step because ``remote root filesystem is saturated and the cleanup plan projects root usage down to about 79% after candidate cleanup``"
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected 'cleanup-plan classification mode: `targeted_ownership_cleanup_enabled`'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected 'runtime repair kind: `targeted_cleanup`'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected 'recommended runtime repair action: `./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected '-IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current`'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected './scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected 'Because the current Oracle repair path is `targeted_cleanup`, the preview includes `-IncludeReviewTargetCleanup`'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected './scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh -RefreshOracleInventory'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected 'Execute the current Oracle cleanup path, rerun proof, and refresh the gate:'
    Assert-Contains -Actual $cleanupOnlyStatusDoc -Expected './scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current'

    $reviewTargetOnlyCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-review-target.json"
    $reviewTargetOnlyOutDir = Join-Path $tmpRoot "out-review-target"
    $reviewTargetOnlyStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_REVIEW_TARGET.md"

    @'
{
  "generated_at": "2026-08-18T09:30:06Z",
  "classification_mode": "safe_review_default",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 1,
    "candidate_images": 0
  },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 9.235644,
    "top_target_review_count": 32,
    "recommended_action": "review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill",
    "top_target_cleanup_command": "docker rm -f supabase-auth ; docker volume rm supabase_db-config ; docker image rm supabase/edge-runtime:v1.70.3"
  },
  "oracle_repair": {
    "kind": "review_target_cleanup",
    "required": true,
    "reason": "remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure, and the top review target 'shared_host_supabase' carries about 9.235644 GiB of known reclaimable scope that must be reviewed before proof can pass",
    "recommended_action": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current",
    "blocks_backup_verify": true,
    "blocks_restore_drill": true
  },
  "runtime_repair": {
    "required": false,
    "reason": "",
    "recommended_action": "",
    "blocks_backup_verify": false,
    "blocks_restore_drill": false
  },
  "estimated_reclaim": {
    "total_candidate_gib": 0
  },
  "disk_pressure": {
    "root_use_pct_int": 100,
    "projected_root_use_pct_after_candidate_cleanup": 100,
    "status": "critical",
    "summary": "root filesystem is at 100% use with 524K free; candidate cleanup may reclaim 0 GiB and project root usage to about 100%"
  }
}
'@ | Set-Content -Path $reviewTargetOnlyCleanupPlanPath -Encoding ASCII

    $reviewTargetOnlyOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $cleanupOnlyProofPath `
        -OracleInventoryPath $cleanupOnlyInventoryPath `
        -OracleCleanupPlanPath $reviewTargetOnlyCleanupPlanPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $cleanupOnlyPersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $reviewTargetOnlyOutDir `
        -StatusDocPath $reviewTargetOnlyStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected review-target snapshot script to pass`n$reviewTargetOnlyOutput"
    }
    $reviewTargetOnlyMarkdown = Get-Content (Join-Path $reviewTargetOnlyOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $reviewTargetOnlyMarkdown -Expected "- oracle_runtime_repair_kind: review_target_cleanup"
    Assert-Contains -Actual $reviewTargetOnlyMarkdown -Expected "- oracle_runtime_repair_required: True"
    Assert-Contains -Actual $reviewTargetOnlyMarkdown -Expected "candidate cleanup alone does not materially reduce pressure"
    $reviewTargetOnlyStatusDoc = Get-Content $reviewTargetOnlyStatusDocPath -Raw
    Assert-Contains -Actual $reviewTargetOnlyStatusDoc -Expected "Oracle runtime repair still requires a review-target cleanup step because ``remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure"
    Assert-Contains -Actual $reviewTargetOnlyStatusDoc -Expected 'runtime repair kind: `review_target_cleanup`'
    Assert-Contains -Actual $reviewTargetOnlyStatusDoc -Expected 'Because the current Oracle repair path is `review_target_cleanup`, the preview includes `-IncludeReviewTargetCleanup`'

    $walPressureProofPath = Join-Path $tmpRoot "oracle-production-proof-wal-pressure.json"
    $walPressureInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-wal-pressure.json"
    $walPressureCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-wal-pressure.json"
    $walPressureRemediationPath = Join-Path $tmpRoot "oracle-remediation-sequence-wal-pressure.json"
    $walPressurePersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-wal-pressure.json"
    $walPressureOutDir = Join-Path $tmpRoot "out-wal-pressure"
    $walPressureStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_WAL_PRESSURE.md"

    @'
{
  "generated_at": "2026-08-27T07:30:00Z",
  "status": "fail",
  "remote_host": "oracle.example",
  "failure_step": "disk_capacity",
  "failure_reason": "pg_wal retention is filling the root filesystem",
  "remote_root_use_pct": "96",
  "remote_var_use_pct": "96",
  "latest_archive": "/var/backups/omnyid/20260827T060000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "fail",
  "backup_verify_detail": "logical replication slot retention prevents stable backup verification",
  "restore_drill_status": "blocked",
  "restore_drill_detail": "blocked by WAL retention pressure"
}
'@ | Set-Content -Path $walPressureProofPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T07:31:00Z",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "43G",
      "avail": "1.8G",
      "use_pct": "96%"
    }
  ],
  "counts": {
    "candidate_cleanup_items": 2,
    "candidate_cleanup_image_gib": 0.12
  },
  "postgres": {
    "pg_wal_gib": 20,
    "replication_slots": [
      {
        "slot_name": "electric_slot_default",
        "active": false,
        "restart_lsn": "0/5000000",
        "retained_wal_gib": 20
      }
    ]
  }
}
'@ | Set-Content -Path $walPressureInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T07:31:10Z",
  "classification_mode": "safe_review_default",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 2
  },
  "oracle_repair": {
    "kind": "postgres_wal_slot",
    "required": true,
    "reason": "Electric slot 'electric_slot_default' is inactive and retaining 20 GiB of WAL while max_slot_wal_keep_size is unlimited.",
    "recommended_action": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current",
    "blocks_backup_verify": true,
    "blocks_restore_drill": true
  },
  "runtime_repair": {
    "required": false,
    "reason": "",
    "recommended_action": "",
    "blocks_backup_verify": false,
    "blocks_restore_drill": false
  },
  "estimated_reclaim": {
    "total_candidate_gib": 0.12
  },
  "disk_pressure": {
    "root_use_pct_int": 96,
    "projected_root_use_pct_after_candidate_cleanup": 96,
    "status": "critical",
    "summary": "root filesystem is at 96% use with 1.8G free; ordinary candidate cleanup is negligible compared with retained WAL pressure"
  },
  "postgres_wal_pressure": {
    "status": "inactive_electric_slot_unbounded",
    "summary": "Electric slot 'electric_slot_default' is inactive, retaining about 20 GiB of WAL, and the current max_slot_wal_keep_size setting is unlimited.",
    "recommended_action": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit",
    "safe_limit_recommendation_gib": 2,
    "pg_wal_gib": 20,
    "electric_slot_name": "electric_slot_default",
    "electric_slot_active": false,
    "electric_slot_retained_wal_gib": 20
  }
}
'@ | Set-Content -Path $walPressureCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-27T07:31:20Z",
  "steps": [],
  "remediation_summary": {
    "outcome": "wal_slot_remediation_required",
    "cleanup_mode": "dry_run",
    "cleanup_step_count": 0,
    "runtime_repair_kind": "postgres_wal_slot",
    "runtime_repair_required": true,
    "runtime_repair_reason": "Electric slot 'electric_slot_default' is inactive and retaining 20 GiB of WAL while max_slot_wal_keep_size is unlimited.",
    "runtime_repair_recommended_action": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current",
    "planned_candidate_containers": 0,
    "planned_candidate_volumes": 0,
    "planned_candidate_images": 2,
    "baseline_root_use_pct": 96,
    "final_root_use_pct": null,
    "root_use_delta_pct": null,
    "baseline_backup_verify_status": "fail",
    "final_backup_verify_status": "unknown",
    "baseline_restore_drill_status": "blocked",
    "final_restore_drill_status": "unknown",
    "baseline_blocker": "disk_capacity: pg_wal retention is filling the root filesystem",
    "final_blocker": "unknown",
    "wal_slot_recommended": true,
    "wal_slot_status": "inactive_electric_slot_unbounded",
    "wal_slot_summary": "Electric slot 'electric_slot_default' is inactive, retaining about 20 GiB of WAL, and the current max_slot_wal_keep_size setting is unlimited.",
    "wal_slot_mode": "dry_run",
    "wal_slot_limit_gib": 2,
    "wal_slot_dry_run_hint": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit",
    "wal_slot_execute_hint": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute"
  }
}
'@ | Set-Content -Path $walPressureRemediationPath -Encoding ASCII

    Copy-Item -LiteralPath $personalOsAuditPath -Destination $walPressurePersonalOsAuditPath -Force

    $walPressureOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $walPressureProofPath `
        -OracleInventoryPath $walPressureInventoryPath `
        -OracleCleanupPlanPath $walPressureCleanupPlanPath `
        -OracleRemediationPath $walPressureRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $walPressurePersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $walPressureOutDir `
        -StatusDocPath $walPressureStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected WAL-pressure snapshot script to pass`n$walPressureOutput"
    }
    $walPressureMarkdown = Get-Content (Join-Path $walPressureOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_postgres_wal_pressure_status: inactive_electric_slot_unbounded"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_postgres_wal_gib: 20"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_electric_slot_name: electric_slot_default"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_electric_slot_active: False"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_electric_slot_retained_wal_gib: 20"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_runtime_repair_kind: postgres_wal_slot"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_safe_now_cleanup_execute_hint: ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_safe_now_cleanup_follow_through_command: ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    Assert-Contains -Actual $walPressureMarkdown -Expected "- oracle_phase_two_cleanup_execute_hint: "
    $walPressureStatusDoc = Get-Content $walPressureStatusDocPath -Raw
    Assert-Contains -Actual $walPressureStatusDoc -Expected "Postgres WAL pressure status is ``inactive_electric_slot_unbounded``."
    Assert-Contains -Actual $walPressureStatusDoc -Expected "Current ``pg_wal`` footprint is about ``20 GiB``."
    Assert-Contains -Actual $walPressureStatusDoc -Expected "Electric slot retained WAL is about ``20 GiB``."
    Assert-Contains -Actual $walPressureStatusDoc -Expected "Oracle runtime repair still requires a WAL-slot remediation step because ``Electric slot 'electric_slot_default' is inactive and retaining 20 GiB of WAL while max_slot_wal_keep_size is unlimited.``"
    Assert-Contains -Actual $walPressureStatusDoc -Expected 'runtime repair kind: `postgres_wal_slot`'
    Assert-Contains -Actual $walPressureStatusDoc -Expected 'postgres WAL recommended action: `./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit`'
    Assert-Contains -Actual $walPressureStatusDoc -Expected 'Execute the Oracle WAL-slot remediation path, rerun proof, and refresh the gate:'
    Assert-Contains -Actual $walPressureStatusDoc -Expected './scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current'

    $driftProofPath = Join-Path $tmpRoot "oracle-production-proof-drift.json"
    $driftInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-drift.json"
    $driftCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-drift.json"
    $driftRemediationPath = Join-Path $tmpRoot "oracle-remediation-drift.json"
    $driftPersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-drift.json"
    $driftOutDir = Join-Path $tmpRoot "out-drift"
    $driftStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_DRIFT.md"

    @'
{
  "generated_at": "2026-08-21T14:49:24Z",
  "status": "fail",
  "remote_host": "oracle.example",
  "remote_dir": "/srv/omnyid",
  "env_file": ".env.oracle",
  "compose_file": "docker-compose.oracle.minimal.yml",
  "backup_dir": "/var/backups/omnyid",
  "backup_dir_source": "env",
  "backup_service_running": "true",
  "homeserver_running": "true",
  "latest_archive": "/var/backups/omnyid/20260821T120000Z",
  "latest_archive_age_days": "0",
  "manifest_verification_status": "passed",
  "manifest_verified_at": "2026-08-21T12:30:00Z",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "verification passed",
  "restore_drill_status": "fail",
  "restore_drill_detail": "restore drill failed",
  "remote_root_use_pct": "97",
  "remote_var_use_pct": "97",
  "failure_step": "restore_drill",
  "failure_reason": "restore drill failed"
}
'@ | Set-Content -Path $driftProofPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T14:50:11Z",
  "disk": [
    { "mount": "/", "size": "40G", "used": "39G", "avail": "1.1G", "use_pct": "100%" }
  ],
  "counts": {
    "candidate_cleanup_items": 3,
    "candidate_cleanup_image_gib": 0
  }
}
'@ | Set-Content -Path $driftInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T14:50:12Z",
  "classification_mode": "safe_review_default",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 3,
    "candidate_images": 0
  },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 5.665644,
    "top_target_review_count": 18,
    "recommended_action": "review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill",
    "top_target_cleanup_command": "docker rm -f supabase-auth"
  },
  "oracle_repair": {
    "kind": "review_target_cleanup",
    "required": true,
    "reason": "remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure, and the top review target 'shared_host_supabase' carries about 5.665644 GiB of known reclaimable scope that must be reviewed before proof can pass",
    "recommended_action": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current",
    "blocks_backup_verify": true,
    "blocks_restore_drill": true
  },
  "runtime_repair": {
    "required": false,
    "reason": "",
    "recommended_action": "",
    "blocks_backup_verify": false,
    "blocks_restore_drill": false
  },
  "estimated_reclaim": {
    "total_candidate_gib": 0
  },
  "disk_pressure": {
    "root_use_pct_int": 100,
    "projected_root_use_pct_after_candidate_cleanup": 100,
    "status": "critical",
    "summary": "root filesystem is at 100% use with 1.1G free; candidate cleanup may reclaim 0 GiB and project root usage to about 100%"
  }
}
'@ | Set-Content -Path $driftCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T14:50:12Z",
  "steps": [],
  "remediation_summary": {
    "outcome": "review_target_cleanup_required",
    "cleanup_mode": "dry_run",
    "cleanup_step_count": 5,
    "runtime_repair_kind": "review_target_cleanup",
    "runtime_repair_required": true,
    "runtime_repair_reason": "remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure, and the top review target 'shared_host_supabase' carries about 5.665644 GiB of known reclaimable scope that must be reviewed before proof can pass",
    "runtime_repair_recommended_action": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current",
    "planned_candidate_containers": 0,
    "planned_candidate_volumes": 3,
    "planned_candidate_images": 0,
    "baseline_root_use_pct": 100,
    "final_root_use_pct": null,
    "root_use_delta_pct": null,
    "baseline_backup_verify_status": "fail",
    "final_backup_verify_status": "unknown",
    "baseline_restore_drill_status": "blocked",
    "final_restore_drill_status": "unknown",
    "baseline_blocker": "disk_capacity: remote root filesystem is at 100% use",
    "final_blocker": "unknown"
  }
}
'@ | Set-Content -Path $driftRemediationPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T14:48:16Z",
  "counts": {
    "total_phases": 3,
    "implemented": 0,
    "partial": 2,
    "not_started": 1,
    "total_tasks": 12,
    "implemented_tasks": 9,
    "partial_tasks": 2,
    "not_started_tasks": 1,
    "residual_open_items": 1
  },
  "phases": [
    { "phase_number": 0, "title": "Terminology", "status": "not_started" },
    { "phase_number": 1, "title": "Autonomy", "status": "partial" }
  ],
  "open_tasks": [
    { "phase_number": 0, "task_number": 1, "text": "Define terminology.", "status": "not_started" },
    { "phase_number": 1, "task_number": 5, "text": "Normalize mapping.", "status": "partial" },
    { "phase_number": 1, "task_number": 6, "text": "Add deterministic helpers.", "status": "partial" }
  ],
  "open_items": [
    { "item_kind": "task", "phase_number": 0, "task_number": 1, "text": "Define terminology.", "status": "not_started" },
    { "item_kind": "task", "phase_number": 1, "task_number": 5, "text": "Normalize mapping.", "status": "partial" },
    { "item_kind": "task", "phase_number": 1, "task_number": 6, "text": "Add deterministic helpers.", "status": "partial" },
    { "item_kind": "phase_note", "phase_number": 1, "task_number": null, "text": "remaining work is compact renderer cleanup", "status": "partial" }
  ],
  "open_phase_summaries": [
    { "phase_number": 1, "phase_title": "Autonomy", "status": "partial", "open_task_count": 2, "residual_open_item_count": 1, "total_open_item_count": 3 },
    { "phase_number": 0, "phase_title": "Terminology", "status": "not_started", "open_task_count": 1, "residual_open_item_count": 0, "total_open_item_count": 1 }
  ]
}
'@ | Set-Content -Path $driftPersonalOsAuditPath -Encoding ASCII

    $driftOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $driftProofPath `
        -OracleInventoryPath $driftInventoryPath `
        -OracleCleanupPlanPath $driftCleanupPlanPath `
        -OracleRemediationPath $driftRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $driftPersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $driftOutDir `
        -StatusDocPath $driftStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected drift snapshot script to pass`n$driftOutput"
    }

    $driftMarkdown = Get-Content (Join-Path $driftOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $driftMarkdown -Expected "- status: not_ready"
    Assert-Contains -Actual $driftMarkdown -Expected "- oracle_evidence_consistency_status: warn"
    Assert-Contains -Actual $driftMarkdown -Expected "- oracle_remediation_current_with_inputs: True"
    Assert-Contains -Actual $driftMarkdown -Expected "- oracle_remediation_stale_relative_to_inputs: False"
    Assert-Contains -Actual $driftMarkdown -Expected "- oracle_evidence_consistency_summary: proof root use is 97% but inventory root use is 100%; proof root use is 97% but cleanup-plan root use is 100%"
    Assert-Contains -Actual $driftMarkdown -Expected "proof root use is 97% but inventory root use is 100%"
    if ($driftMarkdown.Contains("Oracle readiness evidence is inconsistent across proof, inventory, or cleanup-plan artifacts")) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] contemporaneous root drift should not become a blocker"
    }

    $driftJson = Get-Content (Join-Path $driftOutDir "commercial-readiness-snapshot.json") -Raw | ConvertFrom-Json
    if (-not $driftJson.oracle_evidence_consistency.nonblocking_high_pressure_root_drift) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected nonblocking_high_pressure_root_drift to be true"
    }
    if ($driftJson.oracle_evidence_consistency.blocks_readiness) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected contemporaneous root drift not to block readiness"
    }

    $staleCleanupExecuteProofPath = Join-Path $tmpRoot "oracle-production-proof-cleanup-execute-stale.json"
    $staleCleanupExecuteInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-cleanup-execute-stale.json"
    $staleCleanupExecuteCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-cleanup-execute-stale.json"
    $staleCleanupExecuteExecutePath = Join-Path $tmpRoot "oracle-runtime-cleanup-execute-cleanup-execute-stale.json"
    $staleCleanupExecuteRemediationPath = Join-Path $tmpRoot "oracle-remediation-cleanup-execute-stale.json"
    $staleCleanupExecutePersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-cleanup-execute-stale.json"
    $staleCleanupExecuteOutDir = Join-Path $tmpRoot "out-cleanup-execute-stale"
    $staleCleanupExecuteStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_CLEANUP_EXECUTE_STALE.md"

    @'
{
  "generated_at": "2026-08-21T15:10:00Z",
  "status": "fail",
  "remote_host": "oracle.example",
  "failure_step": "restore_drill",
  "failure_reason": "restore drill failed",
  "remote_root_use_pct": "92",
  "remote_var_use_pct": "92",
  "latest_archive": "/var/backups/omnyid/20260821T120000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "verification passed",
  "restore_drill_status": "fail",
  "restore_drill_detail": "restore drill failed",
  "restore_drill_gap_bytes": 7808465567
}
'@ | Set-Content -Path $staleCleanupExecuteProofPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:11:00Z",
  "disk": [
    { "mount": "/", "size": "45G", "used": "41G", "avail": "3.7G", "use_pct": "92%" }
  ],
  "counts": {
    "candidate_cleanup_items": 1,
    "candidate_cleanup_image_gib": 0
  }
}
'@ | Set-Content -Path $staleCleanupExecuteInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:12:00Z",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 0
  },
  "estimated_reclaim": {
    "total_candidate_gib": 1.4
  },
  "disk_pressure": {
    "root_use_pct_int": 92,
    "status": "candidate_cleanup_likely_sufficient_for_retest",
    "summary": "root filesystem is at 92% use with 3.7G free; candidate cleanup may reclaim 1.4 GiB and project root usage to about 89%"
  }
}
'@ | Set-Content -Path $staleCleanupExecuteCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:11:30Z",
  "steps": [
    { "name": "host_cleanup", "status": "dry_run", "detail": "sudo journalctl --vacuum-time=7d" }
  ]
}
'@ | Set-Content -Path $staleCleanupExecuteExecutePath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:12:30Z",
  "remediation_summary": {
    "outcome": "combined_review_cleanup_required",
    "cleanup_mode": "dry_run",
    "cleanup_step_count": 4,
    "planned_candidate_containers": 0,
    "planned_candidate_volumes": 0,
    "planned_candidate_images": 0,
    "baseline_root_use_pct": 92,
    "final_root_use_pct": null,
    "root_use_delta_pct": null,
    "baseline_backup_verify_status": "pass",
    "final_backup_verify_status": "unknown",
    "baseline_restore_drill_status": "fail",
    "final_restore_drill_status": "unknown",
    "baseline_blocker": "restore_drill: restore drill failed",
    "final_blocker": "unknown"
  }
}
'@ | Set-Content -Path $staleCleanupExecuteRemediationPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:13:00Z",
  "counts": {
    "total_phases": 13,
    "implemented": 13,
    "partial": 0,
    "not_started": 0,
    "total_tasks": 54,
    "implemented_tasks": 54,
    "partial_tasks": 0,
    "not_started_tasks": 0,
    "residual_open_items": 0
  },
  "phases": [],
  "open_tasks": [],
  "open_items": [],
  "open_phase_summaries": []
}
'@ | Set-Content -Path $staleCleanupExecutePersonalOsAuditPath -Encoding ASCII

    $staleCleanupExecuteOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $staleCleanupExecuteProofPath `
        -OracleInventoryPath $staleCleanupExecuteInventoryPath `
        -OracleCleanupPlanPath $staleCleanupExecuteCleanupPlanPath `
        -OracleCleanupExecutePath $staleCleanupExecuteExecutePath `
        -OracleRemediationPath $staleCleanupExecuteRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $staleCleanupExecutePersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $staleCleanupExecuteOutDir `
        -StatusDocPath $staleCleanupExecuteStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected stale cleanup execute snapshot script to pass`n$staleCleanupExecuteOutput"
    }

    $staleCleanupExecuteMarkdown = Get-Content (Join-Path $staleCleanupExecuteOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $staleCleanupExecuteMarkdown -Expected "- status: not_ready"
    Assert-Contains -Actual $staleCleanupExecuteMarkdown -Expected "- oracle_cleanup_execute_available: True"
    Assert-Contains -Actual $staleCleanupExecuteMarkdown -Expected "- oracle_cleanup_execute_current_with_plan: False"
    Assert-Contains -Actual $staleCleanupExecuteMarkdown -Expected "- oracle_cleanup_execute_stale_relative_to_plan: True"
    Assert-Contains -Actual $staleCleanupExecuteMarkdown -Expected "oracle cleanup execution preview predates the current cleanup plan"

    $staleRemediationProofPath = Join-Path $tmpRoot "oracle-production-proof-remediation-stale.json"
    $staleRemediationInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-remediation-stale.json"
    $staleRemediationCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-remediation-stale.json"
    $staleRemediationPath = Join-Path $tmpRoot "oracle-remediation-remediation-stale.json"
    $staleRemediationPersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-remediation-stale.json"
    $staleRemediationOutDir = Join-Path $tmpRoot "out-remediation-stale"
    $staleRemediationStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_REMEDIATION_STALE.md"

    @'
{
  "generated_at": "2026-08-21T15:10:00Z",
  "status": "fail",
  "remote_host": "oracle.example",
  "failure_step": "restore_drill",
  "failure_reason": "restore drill failed",
  "remote_root_use_pct": "92",
  "remote_var_use_pct": "92",
  "latest_archive": "/var/backups/omnyid/20260821T120000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "verification passed",
  "restore_drill_status": "fail",
  "restore_drill_detail": "restore drill failed",
  "restore_drill_gap_bytes": 7808465567
}
'@ | Set-Content -Path $staleRemediationProofPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:11:00Z",
  "disk": [
    { "mount": "/", "size": "45G", "used": "41G", "avail": "3.7G", "use_pct": "92%" }
  ],
  "counts": {
    "candidate_cleanup_items": 1,
    "candidate_cleanup_image_gib": 0
  }
}
'@ | Set-Content -Path $staleRemediationInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:12:00Z",
  "classification_mode": "safe_review_default",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 0
  },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 6.923409,
    "top_target_review_count": 19,
    "top_target_cleanup_command": "docker rm -f supabase-auth",
    "recommended_action": "review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill"
  },
  "review_targets": [
    {
      "ownership_group": "omnyid_backup_retention",
      "known_size_gib": 1.201989
    }
  ],
  "estimated_reclaim": {
    "total_candidate_gib": 1.4
  },
  "disk_pressure": {
    "root_use_pct_int": 92,
    "status": "candidate_cleanup_likely_sufficient_for_retest",
    "summary": "root filesystem is at 92% use with 3.7G free; candidate cleanup may reclaim 1.4 GiB and project root usage to about 89%"
  }
}
'@ | Set-Content -Path $staleRemediationCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:05:00Z",
  "remediation_summary": {
    "outcome": "combined_review_cleanup_required",
    "cleanup_mode": "dry_run",
    "cleanup_step_count": 4
  }
}
'@ | Set-Content -Path $staleRemediationPath -Encoding ASCII

    Copy-Item -LiteralPath $personalOsAuditPath -Destination $staleRemediationPersonalOsAuditPath -Force

    $staleRemediationOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $staleRemediationProofPath `
        -OracleInventoryPath $staleRemediationInventoryPath `
        -OracleCleanupPlanPath $staleRemediationCleanupPlanPath `
        -OracleRemediationPath $staleRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $staleRemediationPersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $staleRemediationOutDir `
        -StatusDocPath $staleRemediationStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected remediation-stale snapshot script to pass`n$staleRemediationOutput"
    }

    $staleRemediationMarkdown = Get-Content (Join-Path $staleRemediationOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $staleRemediationMarkdown -Expected "- oracle_remediation_current_with_inputs: False"
    Assert-Contains -Actual $staleRemediationMarkdown -Expected "- oracle_remediation_stale_relative_to_inputs: True"
    $staleRemediationStatusDoc = Get-Content $staleRemediationStatusDocPath -Raw
    Assert-Contains -Actual $staleRemediationStatusDoc -Expected "remediation artifact exists but predates the current proof or cleanup plan, so remediation outcome fields are suppressed until remediation is regenerated in sequence."

    $combinedGateProofPath = Join-Path $tmpRoot "oracle-production-proof-combined-gate.json"
    $combinedGateInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory-combined-gate.json"
    $combinedGateCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan-combined-gate.json"
    $combinedGateCleanupExecutePath = Join-Path $tmpRoot "oracle-runtime-cleanup-execute-combined-gate.json"
    $combinedGateRemediationPath = Join-Path $tmpRoot "oracle-remediation-combined-gate.json"
    $combinedGatePersonalOsAuditPath = Join-Path $tmpRoot "personalos-readiness-audit-combined-gate.json"
    $combinedGateOutDir = Join-Path $tmpRoot "out-combined-gate"
    $combinedGateStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS_COMBINED_GATE.md"

    @'
{
  "generated_at": "2026-08-21T15:10:00Z",
  "status": "fail",
  "remote_host": "oracle.example",
  "failure_step": "restore_drill",
  "failure_reason": "restore drill requires about 7.27 GiB more free disk on the Oracle host",
  "remote_root_use_pct": "92",
  "remote_var_use_pct": "92",
  "latest_archive": "/var/backups/omnyid/20260821T120000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "verification passed",
  "restore_drill_status": "fail",
  "restore_drill_detail": "restore drill failed",
  "restore_drill_gap_bytes": 7808465567,
  "restore_drill_free_root_bytes": 3963248640,
  "restore_drill_required_bytes": 11771714207,
  "restore_drill_source_db_bytes": 9725429439
}
'@ | Set-Content -Path $combinedGateProofPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:11:00Z",
  "disk": [
    { "mount": "/", "size": "45G", "used": "41G", "avail": "3.7G", "use_pct": "92%" }
  ],
  "counts": {
    "candidate_cleanup_items": 1,
    "candidate_cleanup_image_gib": 0
  }
}
'@ | Set-Content -Path $combinedGateInventoryPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:12:00Z",
  "classification_mode": "safe_review_default",
  "counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 0
  },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 6.923409,
    "top_target_review_count": 19,
    "top_target_cleanup_command": "docker rm -f supabase-edge-functions",
    "omnyid_backup_retention_cleanup_command": "bash -lc 'cleanup-old-backups'",
    "combined_retention_and_top_target_cleanup_command": "bash -lc 'cleanup-old-backups' ; docker rm -f supabase-edge-functions",
    "recommended_action": "review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill"
  },
  "review_targets": [
    {
      "ownership_group": "omnyid_backup_retention",
      "known_size_gib": 1.201989
    }
  ],
  "estimated_reclaim": {
    "total_candidate_gib": 1.4
  },
  "disk_pressure": {
    "root_use_pct_int": 92,
    "status": "candidate_cleanup_likely_sufficient_for_retest",
    "summary": "root filesystem is at 92% use with 3.7G free; candidate cleanup may reclaim 1.4 GiB and project root usage to about 89%"
  }
}
'@ | Set-Content -Path $combinedGateCleanupPlanPath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:13:00Z",
  "include_review_target_cleanup": false,
  "include_backup_retention_cleanup": false,
  "include_combined_review_cleanup": false,
  "planned_counts": {
    "candidate_containers": 0,
    "candidate_volumes": 0,
    "candidate_images": 0
  },
  "steps": [
    { "name": "image_prune", "command": "docker image prune -af", "status": "dry_run" }
  ]
}
'@ | Set-Content -Path $combinedGateCleanupExecutePath -Encoding ASCII

    @'
{
  "generated_at": "2026-08-21T15:14:00Z",
  "remediation_summary": {
    "outcome": "combined_review_cleanup_required",
    "cleanup_mode": "dry_run",
    "cleanup_step_count": 4,
    "planned_candidate_containers": 0,
    "planned_candidate_volumes": 0,
    "planned_candidate_images": 0,
    "baseline_root_use_pct": 92,
    "final_root_use_pct": null,
    "root_use_delta_pct": null,
    "baseline_backup_verify_status": "pass",
    "final_backup_verify_status": "unknown",
    "baseline_restore_drill_status": "skipped",
    "final_restore_drill_status": "unknown",
    "baseline_blocker": "none: none",
    "final_blocker": "unknown"
  }
}
'@ | Set-Content -Path $combinedGateRemediationPath -Encoding ASCII

    Copy-Item -LiteralPath $personalOsAuditPath -Destination $combinedGatePersonalOsAuditPath -Force

    $combinedGateOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $combinedGateProofPath `
        -OracleInventoryPath $combinedGateInventoryPath `
        -OracleCleanupPlanPath $combinedGateCleanupPlanPath `
        -OracleCleanupExecutePath $combinedGateCleanupExecutePath `
        -OracleRemediationPath $combinedGateRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $combinedGatePersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $combinedGateOutDir `
        -StatusDocPath $combinedGateStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected combined-gate snapshot script to pass`n$combinedGateOutput"
    }

    $combinedGateStatusDoc = Get-Content $combinedGateStatusDocPath -Raw
    Assert-Contains -Actual $combinedGateStatusDoc -Expected "Exact combined executor follow-through command:"
    Assert-Contains -Actual $combinedGateStatusDoc -Expected "If the restore gap remains after the safe-now pass, execute the combined cleanup path, rerun proof, and refresh the gate:"
    Assert-Contains -Actual $combinedGateStatusDoc -Expected "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeCombinedReviewCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"

    $fastProofPath = Join-Path $tmpRoot "oracle-production-proof-fast.json"
    $restoreProofPath = Join-Path $tmpRoot "oracle-production-proof-restored.json"
    $fastRestoreWindowOutDir = Join-Path $tmpRoot "out-fast-restore-window"
    $fastRestoreWindowStatusDocPath = Join-Path $tmpRoot "COMMERCIAL_READINESS_STATUS-fast-restore-window.md"
    $fastProofGeneratedAt = (Get-Date).ToUniversalTime().AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $restoreProofGeneratedAt = (Get-Date).ToUniversalTime().AddHours(-4).ToString("yyyy-MM-ddTHH:mm:ssZ")

    @'
{
  "generated_at": "__FAST_PROOF_GENERATED_AT__",
  "status": "pass",
  "remote_host": "oracle.example",
  "failure_step": "none",
  "failure_reason": "none",
  "remote_root_use_pct": "74",
  "remote_var_use_pct": "74",
  "latest_archive": "/var/backups/omnyid/20260825T000000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "archive verified",
  "restore_drill_status": "skipped",
  "restore_drill_detail": "skipped by operator request"
}
'@.Replace("__FAST_PROOF_GENERATED_AT__", $fastProofGeneratedAt) | Set-Content -Path $fastProofPath -Encoding ASCII

    @'
{
  "generated_at": "__RESTORE_PROOF_GENERATED_AT__",
  "status": "pass",
  "remote_host": "oracle.example",
  "failure_step": "none",
  "failure_reason": "none",
  "remote_root_use_pct": "76",
  "remote_var_use_pct": "76",
  "latest_archive": "/var/backups/omnyid/20260824T200000Z",
  "latest_archive_age_days": "0",
  "runtime_script_integrity_status": "pass",
  "runtime_script_integrity_detail": "required runtime scripts are present",
  "missing_runtime_scripts": [],
  "backup_verify_status": "pass",
  "backup_verify_detail": "archive verified",
  "restore_drill_status": "pass",
  "restore_drill_detail": "restore replay succeeded"
}
'@.Replace("__RESTORE_PROOF_GENERATED_AT__", $restoreProofGeneratedAt) | Set-Content -Path $restoreProofPath -Encoding ASCII

    $fastRestoreWindowOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
        -OracleProofPath $fastProofPath `
        -OracleRestoreProofPath $restoreProofPath `
        -OracleInventoryPath $combinedGateInventoryPath `
        -OracleCleanupPlanPath $combinedGateCleanupPlanPath `
        -OracleCleanupExecutePath $combinedGateCleanupExecutePath `
        -OracleRemediationPath $combinedGateRemediationPath `
        -ReleaseReadinessPath $releaseReadinessPath `
        -PersonalOsAuditPath $combinedGatePersonalOsAuditPath `
        -StageManifestPath $stageManifestPath `
        -OutDir $fastRestoreWindowOutDir `
        -StatusDocPath $fastRestoreWindowStatusDocPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected fast-proof snapshot with recent restore proof to pass`n$fastRestoreWindowOutput"
    }

    $fastRestoreWindowMarkdown = Get-Content (Join-Path $fastRestoreWindowOutDir "commercial-readiness-snapshot.md") -Raw
    Assert-Contains -Actual $fastRestoreWindowMarkdown -Expected "- oracle_restore_drill_status: skipped"
    Assert-Contains -Actual $fastRestoreWindowMarkdown -Expected "- oracle_restore_drill_policy_status: covered_by_recent_restore_proof"
    Assert-Contains -Actual $fastRestoreWindowMarkdown -Expected "- oracle_restore_drill_proof_status: pass"
    Assert-Contains -Actual $fastRestoreWindowMarkdown -Expected "- oracle_restore_drill_proof_restore_status: pass"
    Assert-Contains -Actual $fastRestoreWindowMarkdown -Expected "- oracle_restore_drill_proof_max_age_hours: 168"
    $fastRestoreWindowReport = Get-Content (Join-Path $fastRestoreWindowOutDir "commercial-readiness-snapshot.json") -Raw | ConvertFrom-Json
    if (@($fastRestoreWindowReport.commercial_readiness.blockers | Where-Object { $_ -like "Oracle restore drill*" }).Count -ne 0) {
        throw "[commercial-readiness-snapshot-pwsh-selftest] expected recent restore proof to satisfy the restore-drill gate"
    }

    Write-Output "[commercial-readiness-snapshot-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
