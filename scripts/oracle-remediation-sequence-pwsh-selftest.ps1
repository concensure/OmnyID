Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-remediation-sequence-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    $fakeCleanup = Join-Path $tmpRoot "oracle-runtime-cleanup-execute.ps1"
    $fakeProof = Join-Path $tmpRoot "oracle-production-proof.ps1"
    $fakeWalSlot = Join-Path $tmpRoot "oracle-remediate-electric-slot.ps1"
    $fakeSyntheticCleanup = Join-Path $tmpRoot "oracle-prune-synthetic-message-spam.ps1"
    $fakeOperationalHistoryCleanup = Join-Path $tmpRoot "oracle-prune-operational-history.ps1"
    $cleanupPlan = Join-Path $tmpRoot "plan.json"
    $outDir = Join-Path $tmpRoot "out"

    @'
{
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 9.24,
    "top_target_review_count": 32,
    "top_target_cleanup_command": "docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085",
    "recommended_action": "top non-runtime review target is 'shared_host_supabase' with about 9.24 GiB of known size across 32 review-class items; review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill"
  },
  "runtime_repair": {
    "required": true,
    "reason": "remote runtime is missing required scripts and should be redeployed from the staged runtime bundle before backup verification and restore-drill results are treated as authoritative",
    "missing_scripts": ["scripts/omnyid-backup-verify.sh", "scripts/omnyid-restore-drill.sh"],
    "recommended_action": "./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts"
  },
  "postgres_wal_pressure": {
    "status": "inactive_electric_slot_unbounded",
    "summary": "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited.",
    "recommended_action": "Do not delete files from pg_wal manually. Restart Electric or drop the abandoned slot, then apply a WAL cap.",
    "safe_limit_recommendation_gib": 2
  },
  "review_targets": [
    {
      "ownership_group": "omnyid_backup_retention",
      "known_size_gib": 1.2
    }
  ]
}
'@ | Set-Content -Path $cleanupPlan -Encoding ASCII
    @'
param(
  [string]$OutDir,
  [switch]$Execute,
  [switch]$IncludeReviewTargetCleanup,
  [switch]$IncludeBackupRetentionCleanup,
  [switch]$IncludeCombinedReviewCleanup,
  [switch]$SkipHostCleanup
)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  include_review_target_cleanup = [bool]$IncludeReviewTargetCleanup
  include_backup_retention_cleanup = [bool]$IncludeBackupRetentionCleanup
  include_combined_review_cleanup = [bool]$IncludeCombinedReviewCleanup
  skip_host_cleanup = [bool]$SkipHostCleanup
  planned_counts = @{ candidate_containers = 2; candidate_volumes = 1; candidate_images = 3 }
  steps = @(
    @{ name = "containers"; status = "dry_run"; command = "docker rm -f stale" }
  )
} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-execute.json")
'@ | Set-Content -Path $fakeCleanup -Encoding ASCII
    @'
param(
  [string]$OutDir,
  [switch]$Execute,
  [switch]$RestartElectric,
  [switch]$DropSlot,
  [switch]$CheckpointAfterDrop,
  [switch]$ApplyWalLimit,
  [int]$WalLimitGiB = 0
)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  execute = [bool]$Execute
  restart_electric = [bool]$RestartElectric
  drop_slot = [bool]$DropSlot
  checkpoint_after_drop = [bool]$CheckpointAfterDrop
  apply_wal_limit = [bool]$ApplyWalLimit
  wal_limit_gib = $WalLimitGiB
  steps = @(
    @{ name = "wal_slot"; status = $(if ($Execute) { "executed" } else { "dry_run" }) }
  )
} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-remediate-electric-slot.json")
Write-Output "[fake-wal-slot] execute=$([bool]$Execute) restart=$([bool]$RestartElectric) drop=$([bool]$DropSlot) checkpoint=$([bool]$CheckpointAfterDrop) limit=$WalLimitGiB"
'@ | Set-Content -Path $fakeWalSlot -Encoding ASCII
    @'
param([string]$OutDir, [switch]$DryRun)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  before = @{
    total_dupes = 100
    maintenance_summary_dupes = 50
    curator_card_dupes = 25
    curator_backlink_dupes = 15
    ingestion_topology_dupes = 10
  }
  after = @{
    deleted_total = $(if ($DryRun) { 0 } else { 100 })
    total_dupes = $(if ($DryRun) { 100 } else { 0 })
  }
} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-prune-synthetic-message-spam.json")
Write-Output "[fake-synthetic-cleanup] dry_run=$([bool]$DryRun)"
'@ | Set-Content -Path $fakeSyntheticCleanup -Encoding ASCII
    @'
param([string]$OutDir, [switch]$DryRun)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  before = @{
    tenant_action_audit_log = 10
    daemon_operational_afp = 20
    tenant_llm_usage_log = 30
    training_reflection_traces = 40
    proactive_token_usage = 50
    user_external_tool_usage_events = 60
    tenant_workflow_trigger_observations = 70
    proactive_suggestions = 80
    trigger_replay_nonces = 90
  }
  after = @{
    tenant_action_audit_log = $(if ($DryRun) { 10 } else { 0 })
    daemon_operational_afp = $(if ($DryRun) { 20 } else { 0 })
    tenant_llm_usage_log = $(if ($DryRun) { 30 } else { 0 })
    training_reflection_traces = $(if ($DryRun) { 40 } else { 0 })
    proactive_token_usage = $(if ($DryRun) { 50 } else { 0 })
    user_external_tool_usage_events = $(if ($DryRun) { 60 } else { 0 })
    tenant_workflow_trigger_observations = $(if ($DryRun) { 70 } else { 0 })
    proactive_suggestions = $(if ($DryRun) { 80 } else { 0 })
    trigger_replay_nonces = $(if ($DryRun) { 90 } else { 0 })
    deleted_total = $(if ($DryRun) { 0 } else { 450 })
  }
} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-prune-operational-history.json")
Write-Output "[fake-operational-history-cleanup] dry_run=$([bool]$DryRun)"
'@ | Set-Content -Path $fakeOperationalHistoryCleanup -Encoding ASCII
    @'
param([string]$OutDir, [switch]$SkipRestoreDrill)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  status = "fail"
  remote_root_use_pct = "100"
  backup_verify_status = "fail"
  restore_drill_status = "blocked"
  restore_drill_gap_bytes = 7800000000
  runtime_script_integrity_status = "fail"
  failure_step = "disk_capacity"
  failure_reason = "remote root filesystem is at 100% use"
} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-production-proof.json")
'@ | Set-Content -Path $fakeProof -Encoding ASCII

    $scriptCopy = Join-Path $tmpRoot "oracle-remediation-sequence.ps1"
    (Get-Content (Join-Path $PSScriptRoot "oracle-remediation-sequence.ps1") -Raw).
        Replace('Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1"', '"' + ($fakeCleanup -replace '\\', '\\') + '"').
        Replace('Join-Path $PSScriptRoot "deploy-oracle.ps1"', '"' + ((Join-Path $tmpRoot "deploy-oracle.ps1") -replace '\\', '\\') + '"').
        Replace('Join-Path $PSScriptRoot "oracle-remediate-electric-slot.ps1"', '"' + ($fakeWalSlot -replace '\\', '\\') + '"').
        Replace('Join-Path $PSScriptRoot "oracle-prune-synthetic-message-spam.ps1"', '"' + ($fakeSyntheticCleanup -replace '\\', '\\') + '"').
        Replace('Join-Path $PSScriptRoot "oracle-prune-operational-history.ps1"', '"' + ($fakeOperationalHistoryCleanup -replace '\\', '\\') + '"').
        Replace('Join-Path $PSScriptRoot "oracle-production-proof.ps1"', '"' + ($fakeProof -replace '\\', '\\') + '"') |
        Set-Content -Path $scriptCopy -Encoding ASCII

    @'
param()
Write-Output "[fake-deploy] skipped"
'@ | Set-Content -Path (Join-Path $tmpRoot "deploy-oracle.ps1") -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $cleanupPlan `
        -OutDir $outDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected remediation sequence to pass`n$output"
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "cleanup=False deploy=False skip_proof=True"
    $markdown = Get-Content (Join-Path $outDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $markdown -Expected "| initial_proof | executed |"
    Assert-Contains -Actual $markdown -Expected "| cleanup | dry_run |"
    Assert-Contains -Actual $markdown -Expected "| wal_slot_remediation | dry_run |"
    Assert-Contains -Actual $markdown -Expected "| deploy | required_skipped |"
    Assert-Contains -Actual $markdown -Expected "| proof | skipped |"
    Assert-Contains -Actual $markdown -Expected "- remediation_outcome: wal_slot_remediation_required"
    Assert-Contains -Actual $markdown -Expected "- runtime_repair_kind: redeploy"
    Assert-Contains -Actual $markdown -Expected "- planned_candidate_images: 3"
    Assert-Contains -Actual $markdown -Expected "- cleanup_artifact: "
    Assert-Contains -Actual $markdown -Expected "- wal_slot_remediation_artifact: "
    Assert-Contains -Actual $markdown -Expected "- synthetic_cleanup_artifact: "
    Assert-Contains -Actual $markdown -Expected "- operational_history_cleanup_artifact: "
    Assert-Contains -Actual $markdown -Expected "- baseline_proof_artifact: "
    Assert-Contains -Actual $markdown -Expected "- final_proof_artifact: "
    Assert-Contains -Actual $markdown -Expected "- runtime_repair_required: True"
    Assert-Contains -Actual $markdown -Expected "- runtime_repair_missing_scripts: scripts/omnyid-backup-verify.sh, scripts/omnyid-restore-drill.sh"
    Assert-Contains -Actual $markdown -Expected "- top_review_target_group: shared_host_supabase"
    Assert-Contains -Actual $markdown -Expected "- top_review_target_known_size_gib: 9.24"
    Assert-Contains -Actual $markdown -Expected "- top_review_target_review_count: 32"
    Assert-Contains -Actual $markdown -Expected "- omnyid_backup_retention_known_size_gib: 1.2"
    Assert-Contains -Actual $markdown -Expected "- restore_drill_gap_bytes: 7800000000"
    Assert-Contains -Actual $markdown -Expected "- restore_drill_gap_gib: 7.26"
    Assert-Contains -Actual $markdown -Expected "- restore_capacity_top_review_target_clears_gap: True"
    Assert-Contains -Actual $markdown -Expected "- restore_capacity_omnyid_only_clears_gap: False"
    Assert-Contains -Actual $markdown -Expected "- restore_capacity_combined_retention_and_top_review_gib: 10.44"
    Assert-Contains -Actual $markdown -Expected "- restore_capacity_combined_retention_and_top_review_clears_gap: True"
    Assert-Contains -Actual $markdown -Expected "- restore_capacity_recommendation: review the top non-runtime target 'shared_host_supabase' first because its known reclaim scope alone is enough to clear the restore-drill gap"
    Assert-Contains -Actual $markdown -Expected "- review_target_cleanup_command: docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
    Assert-Contains -Actual $markdown -Expected "- safe_now_cleanup_execute_hint: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath "
    Assert-Contains -Actual $markdown -Expected "- review_recommended_action: top non-runtime review target is 'shared_host_supabase'"
    Assert-Contains -Actual $markdown -Expected "- cleanup_include_review_target: False"
    Assert-Contains -Actual $markdown -Expected "- cleanup_include_backup_retention: False"
    Assert-Contains -Actual $markdown -Expected "- cleanup_include_combined_review: False"
    Assert-Contains -Actual $markdown -Expected "- cleanup_skip_host_cleanup: False"
    Assert-Contains -Actual $markdown -Expected "- operational_history_cleanup_mode: dry_run"
    Assert-Contains -Actual $markdown -Expected "- operational_history_cleanup_deleted_total: 0"
    Assert-Contains -Actual $markdown -Expected "- operational_history_cleanup_before_total_rows: 450"
    Assert-Contains -Actual $markdown -Expected "- operational_history_cleanup_after_total_rows: 450"
    Assert-Contains -Actual $markdown -Expected "- wal_slot_recommended: True"
    Assert-Contains -Actual $markdown -Expected "- wal_slot_status: inactive_electric_slot_unbounded"
    Assert-Contains -Actual $markdown -Expected "- wal_slot_mode: dry_run"
    Assert-Contains -Actual $markdown -Expected "- wal_slot_limit_gib: 2"
    Assert-Contains -Actual $markdown -Expected "- wal_slot_dry_run_hint: ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath "
    Assert-Contains -Actual $markdown -Expected "- wal_slot_execute_hint: ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath "
    Assert-Contains -Actual $markdown -Expected "- baseline_runtime_script_integrity_status: fail"
    Assert-Contains -Actual $markdown -Expected "- final_runtime_script_integrity_status: unknown"

    $report = Get-Content (Join-Path $outDir "oracle-remediation-sequence.json") -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.cleanup)) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected cleanup artifact path in remediation report"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.wal_slot_remediation)) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected WAL-slot remediation artifact path in remediation report"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.synthetic_cleanup)) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected synthetic cleanup artifact path in remediation report"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.operational_history_cleanup)) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected operational history cleanup artifact path in remediation report"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.baseline_proof)) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected baseline proof artifact path in remediation report"
    }
    if ($null -ne $report.artifact_paths.final_proof) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected final proof artifact path to stay null when -SkipProof is set"
    }

    $targetedCleanupPlan = Join-Path $tmpRoot "plan-targeted.json"
    $targetedOutDir = Join-Path $tmpRoot "out-targeted"
    @'
{
  "oracle_repair": {
    "kind": "targeted_cleanup",
    "required": true,
    "reason": "remote root filesystem is saturated and the cleanup plan projects root usage down to about 79% after candidate cleanup",
    "blocks_backup_verify": true,
    "blocks_restore_drill": true,
    "recommended_action": "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
  },
  "postgres_wal_pressure": {
    "status": "inactive_electric_slot_unbounded",
    "summary": "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited.",
    "recommended_action": "Do not delete files from pg_wal manually. Restart Electric or drop the abandoned slot, then apply a WAL cap.",
    "safe_limit_recommendation_gib": 2
  },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 9.24,
    "top_target_review_count": 32,
    "top_target_cleanup_command": "docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085",
    "omnyid_backup_retention_cleanup_command": "bash -lc 'cleanup-old-backups'",
    "combined_retention_and_top_target_cleanup_command": "bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085",
    "recommended_action": "top non-runtime review target is 'shared_host_supabase' with about 9.24 GiB of known size across 32 review-class items; review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill"
  }
}
'@ | Set-Content -Path $targetedCleanupPlan -Encoding ASCII

    $targetedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $targetedCleanupPlan `
        -OutDir $targetedOutDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected targeted remediation sequence to pass`n$targetedOutput"
    }
    $targetedMarkdown = Get-Content (Join-Path $targetedOutDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $targetedMarkdown -Expected "- remediation_outcome: wal_slot_remediation_required"
    Assert-Contains -Actual $targetedMarkdown -Expected "- runtime_repair_kind: targeted_cleanup"
    Assert-Contains -Actual $targetedMarkdown -Expected "- runtime_repair_required: True"
    Assert-Contains -Actual $targetedMarkdown -Expected "- cleanup_include_review_target: False"
    Assert-Contains -Actual $targetedMarkdown -Expected "- recommended_cleanup_include_review_target: True"
    Assert-Contains -Actual $targetedMarkdown -Expected "- review_target_cleanup_command: docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
    Assert-Contains -Actual $targetedMarkdown -Expected "- safe_now_cleanup_execute_hint: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath "
    Assert-Contains -Actual $targetedMarkdown -Expected "- review_target_cleanup_execute_hint: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath"
    Assert-Contains -Actual $targetedMarkdown -Expected "- wal_slot_mode: dry_run"
    Assert-Contains -Actual $targetedMarkdown -Expected "repair_kind=targeted_cleanup"
    Assert-Contains -Actual $targetedMarkdown -Expected "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json>"

    $targetedExecuteOutDir = Join-Path $tmpRoot "out-targeted-execute"
    $targetedExecuteOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $targetedCleanupPlan `
        -OutDir $targetedExecuteOutDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -ExecuteCleanup `
        -IncludeReviewTargetCleanup `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected targeted execute remediation sequence to pass`n$targetedExecuteOutput"
    }
    $targetedExecuteMarkdown = Get-Content (Join-Path $targetedExecuteOutDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $targetedExecuteMarkdown -Expected "- cleanup_include_review_target: True"
    Assert-Contains -Actual $targetedExecuteMarkdown -Expected "- cleanup_include_backup_retention: False"
    Assert-Contains -Actual $targetedExecuteMarkdown -Expected "- cleanup_include_combined_review: False"

    $combinedCleanupPlan = Join-Path $tmpRoot "plan-combined.json"
    $combinedOutDir = Join-Path $tmpRoot "out-combined"
    @'
{
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 6.92,
    "top_target_review_count": 19,
    "top_target_cleanup_command": "docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085",
    "omnyid_backup_retention_cleanup_command": "bash -lc 'cleanup-old-backups'",
    "combined_retention_and_top_target_cleanup_command": "bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085",
    "recommended_action": "top non-runtime review target is 'shared_host_supabase' with about 6.92 GiB of known size across 19 review-class items; review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill"
  },
  "postgres_wal_pressure": {
    "status": "inactive_electric_slot_unbounded",
    "summary": "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited.",
    "recommended_action": "Do not delete files from pg_wal manually. Restart Electric or drop the abandoned slot, then apply a WAL cap.",
    "safe_limit_recommendation_gib": 2
  },
  "review_targets": [
    {
      "ownership_group": "omnyid_backup_retention",
      "known_size_gib": 1.21
    }
  ]
}
'@ | Set-Content -Path $combinedCleanupPlan -Encoding ASCII

    $combinedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $combinedCleanupPlan `
        -OutDir $combinedOutDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected combined remediation sequence to pass`n$combinedOutput"
    }
    $combinedMarkdown = Get-Content (Join-Path $combinedOutDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $combinedMarkdown -Expected "- remediation_outcome: wal_slot_remediation_required"
    Assert-Contains -Actual $combinedMarkdown -Expected "- restore_capacity_combined_retention_and_top_review_clears_gap: True"
    Assert-Contains -Actual $combinedMarkdown -Expected "- cleanup_include_review_target: False"
    Assert-Contains -Actual $combinedMarkdown -Expected "- cleanup_include_backup_retention: False"
    Assert-Contains -Actual $combinedMarkdown -Expected "- cleanup_include_combined_review: False"
    Assert-Contains -Actual $combinedMarkdown -Expected "- cleanup_skip_host_cleanup: False"
    Assert-Contains -Actual $combinedMarkdown -Expected "- recommended_cleanup_include_combined_review: True"
    Assert-Contains -Actual $combinedMarkdown -Expected "- wal_slot_mode: dry_run"
    Assert-Contains -Actual $combinedMarkdown -Expected "- safe_now_cleanup_execute_hint: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath "
    Assert-Contains -Actual $combinedMarkdown -Expected "- omnyid_backup_retention_cleanup_command: bash -lc 'cleanup-old-backups'"
    Assert-Contains -Actual $combinedMarkdown -Expected "- combined_retention_and_top_target_cleanup_command: bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"

    $combinedExecuteOutDir = Join-Path $tmpRoot "out-combined-execute"
    $combinedExecuteOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $combinedCleanupPlan `
        -OutDir $combinedExecuteOutDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -ExecuteCleanup `
        -IncludeCombinedReviewCleanup `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected combined execute remediation sequence to pass`n$combinedExecuteOutput"
    }
    $combinedExecuteMarkdown = Get-Content (Join-Path $combinedExecuteOutDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $combinedExecuteMarkdown -Expected "- cleanup_include_review_target: False"
    Assert-Contains -Actual $combinedExecuteMarkdown -Expected "- cleanup_include_backup_retention: False"
    Assert-Contains -Actual $combinedExecuteMarkdown -Expected "- cleanup_include_combined_review: True"

    $skipHostOutDir = Join-Path $tmpRoot "out-skip-host"
    $skipHostOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $combinedCleanupPlan `
        -OutDir $skipHostOutDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -ExecuteCleanup `
        -SkipHostCleanup `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected skip-host remediation sequence to pass`n$skipHostOutput"
    }
    $skipHostMarkdown = Get-Content (Join-Path $skipHostOutDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $skipHostMarkdown -Expected "- cleanup_skip_host_cleanup: True"

    $walExecuteOutDir = Join-Path $tmpRoot "out-wal-execute"
    $walExecuteOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy `
        -CleanupPlanPath $combinedCleanupPlan `
        -OutDir $walExecuteOutDir `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -ExecuteWalSlotRemediation `
        -WalSlotDropSlot `
        -WalSlotCheckpointAfterDrop `
        -SkipProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediation-sequence-pwsh-selftest] expected wal execute remediation sequence to pass`n$walExecuteOutput"
    }
    $walExecuteMarkdown = Get-Content (Join-Path $walExecuteOutDir "oracle-remediation-sequence.md") -Raw
    Assert-Contains -Actual $walExecuteMarkdown -Expected "| wal_slot_remediation | executed |"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- remediation_outcome: combined_review_cleanup_required"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- wal_slot_mode: executed"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- operational_history_cleanup_mode: dry_run"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- wal_slot_drop_slot: True"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- wal_slot_checkpoint_after_drop: True"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- wal_slot_limit_gib: 2"
    Assert-Contains -Actual $walExecuteMarkdown -Expected "- combined_review_cleanup_execute_hint: ./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath "

    Write-Output "[oracle-remediation-sequence-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
