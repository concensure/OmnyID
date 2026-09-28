$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("storage-hygiene-report-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[storage-hygiene-report-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $workspace = Join-Path $tmpRoot "workspace"
    $outDir = Join-Path $tmpRoot "out"
    New-Item -ItemType Directory -Path $workspace -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $workspace "target") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $workspace "solid-ui\\dist") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $workspace "solid-ui\\node_modules") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $workspace "artifacts") -Force | Out-Null
    "abc" | Set-Content -Path (Join-Path $workspace "target\\build.bin") -Encoding ASCII
    "abc" | Set-Content -Path (Join-Path $workspace "solid-ui\\dist\\bundle.js") -Encoding ASCII
    "abc" | Set-Content -Path (Join-Path $workspace "solid-ui\\node_modules\\pkg.txt") -Encoding ASCII
    "abc" | Set-Content -Path (Join-Path $workspace "tmp_backup_raw.txt") -Encoding ASCII

    $oracleProofPath = Join-Path $tmpRoot "oracle-production-proof.json"
    $oracleInventoryPath = Join-Path $tmpRoot "oracle-runtime-inventory.json"
    $oracleCleanupPlanPath = Join-Path $tmpRoot "oracle-runtime-cleanup-plan.json"
    $commercialSnapshotPath = Join-Path $tmpRoot "commercial-readiness-snapshot.json"
    $oracleRemediationPath = Join-Path $tmpRoot "oracle-remediation-sequence.json"

    @'
{
  "restore_drill_gap_bytes": 7806108139
}
'@ | Set-Content -Path $oracleProofPath -Encoding ASCII

    @'
{
  "remote_host": "oracle.example",
  "disk": [
    { "mount": "/", "size": "45G", "used": "41G", "avail": "3.7G", "use_pct": "92%" }
  ],
  "synthetic_messages": {
    "status": "duplicate_snapshot_rows_detected",
    "summary": "Synthetic snapshot-like messages have accumulated duplicate rows across tenant schemas (maintenance_summary=563300, curator_card=12, curator_backlink=8, ingestion_topology=4; total=563324). Prune historical duplicates and keep these writers bounded to one current row per selector.",
    "maintenance_summary_dupes": 563300,
    "curator_card_dupes": 12,
    "curator_backlink_dupes": 8,
    "ingestion_topology_dupes": 4,
    "total_dupes": 563324,
    "prune_command": "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
  },
  "items": [
    { "item_type": "container", "name": "omnyid-homeserver-1", "cleanup_class": "keep_runtime", "ownership_group": "omnyid_runtime" },
    { "item_type": "host_maintenance", "name": "system_journal", "cleanup_class": "candidate_cleanup", "ownership_group": "host_logs", "size_gib": 1.4 },
    { "item_type": "container", "name": "supabase-auth", "cleanup_class": "review", "ownership_group": "shared_host_supabase" }
  ]
}
'@ | Set-Content -Path $oracleInventoryPath -Encoding ASCII

    @'
{
  "estimated_reclaim": { "total_candidate_gib": 1.4 },
  "review_pressure": {
    "top_target_group": "shared_host_supabase",
    "top_target_known_size_gib": 6.923409,
    "omnyid_backup_retention_known_size_gib": 1.201989
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
  },
  "synthetic_message_pressure": {
    "status": "duplicate_snapshot_rows_detected",
    "summary": "Synthetic snapshot-like messages have accumulated duplicate rows across tenant schemas (maintenance_summary=563300, curator_card=12, curator_backlink=8, ingestion_topology=4; total=563324). Prune historical duplicates and keep these writers bounded to one current row per selector.",
    "maintenance_summary_dupes": 563300,
    "curator_card_dupes": 12,
    "curator_backlink_dupes": 8,
    "ingestion_topology_dupes": 4,
    "total_dupes": 563324,
    "prune_command": "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
  },
  "review_targets": [
    {
      "ownership_group": "shared_host_supabase",
      "known_size_gib": 6.923409,
      "recommended_action": "review and remove Supabase if no longer required"
    }
  ]
}
'@ | Set-Content -Path $oracleCleanupPlanPath -Encoding ASCII

    @'
{
  "oracle": {
    "remediation_outcome": "wal_slot_remediation_required",
    "restore_drill_gap_gib": 7.27,
    "postgres_wal_pressure_status": "inactive_electric_slot_unbounded",
    "postgres_wal_pressure_summary": "Electric slot 'electric_slot_default' is inactive, retaining about 20 GiB of WAL, and the current max_slot_wal_keep_size setting is unlimited.",
    "postgres_wal_pressure_recommended_action": "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit",
    "postgres_wal_safe_limit_recommendation_gib": 2,
    "postgres_wal_gib": 20,
    "electric_slot_name": "electric_slot_default",
    "electric_slot_active": false,
    "electric_slot_retained_wal_gib": 20
  }
}
'@ | Set-Content -Path $commercialSnapshotPath -Encoding ASCII

    @'
{
  "remediation_summary": {
    "outcome": "wal_slot_remediation_required",
    "wal_slot_mode": "dry_run",
    "operational_history_cleanup_mode": "dry_run",
    "operational_history_cleanup_deleted_total": 0,
    "operational_history_cleanup_before_total_rows": 12045,
    "operational_history_cleanup_after_total_rows": 12045
  }
}
'@ | Set-Content -Path $oracleRemediationPath -Encoding ASCII

    $output = & (Join-Path $PSScriptRoot "storage-hygiene-report.ps1") `
        -WorkspaceRoot $workspace `
        -OracleProofPath $oracleProofPath `
        -OracleInventoryPath $oracleInventoryPath `
        -OracleCleanupPlanPath $oracleCleanupPlanPath `
        -OracleRemediationPath $oracleRemediationPath `
        -CommercialSnapshotPath $commercialSnapshotPath `
        -OutDir $outDir 2>&1
    if ($? -eq $false) {
        throw "[storage-hygiene-report-pwsh-selftest] expected report script to pass`n$output"
    }

    $outputText = $output | Out-String
    Assert-Contains -Actual $outputText -Expected "local_safe_delete_gib="
    Assert-Contains -Actual $outputText -Expected "oracle_review_target=shared_host_supabase"

    $reportJson = Get-Content (Join-Path $outDir "storage-hygiene-report.json") -Raw | ConvertFrom-Json
    if ($reportJson.local.safe_delete_count -lt 4) {
        throw "[storage-hygiene-report-pwsh-selftest] expected at least 4 local safe-delete findings"
    }
    if ($reportJson.local.category_summary.Count -lt 3) {
        throw "[storage-hygiene-report-pwsh-selftest] expected grouped local category summary"
    }
    if ($reportJson.local.recommended_delete_order.Count -lt 3) {
        throw "[storage-hygiene-report-pwsh-selftest] expected recommended delete order"
    }
    if ($reportJson.oracle.summary.review_target_group -ne "shared_host_supabase") {
        throw "[storage-hygiene-report-pwsh-selftest] expected shared_host_supabase review target"
    }
    if ($reportJson.oracle.summary.postgres_wal_pressure_status -ne "inactive_electric_slot_unbounded") {
        throw "[storage-hygiene-report-pwsh-selftest] expected postgres WAL pressure status"
    }
    if ([double]$reportJson.oracle.summary.postgres_wal_gib -ne 20) {
        throw "[storage-hygiene-report-pwsh-selftest] expected postgres WAL GiB summary"
    }
    if ($reportJson.oracle.summary.electric_slot_name -ne "electric_slot_default") {
        throw "[storage-hygiene-report-pwsh-selftest] expected electric slot name"
    }
    if ([bool]$reportJson.oracle.summary.electric_slot_active) {
        throw "[storage-hygiene-report-pwsh-selftest] expected electric slot to be inactive"
    }
    if ([double]$reportJson.oracle.summary.electric_slot_retained_wal_gib -ne 20) {
        throw "[storage-hygiene-report-pwsh-selftest] expected retained WAL GiB summary"
    }
    if ($reportJson.oracle.summary.synthetic_message_pressure_status -ne "duplicate_snapshot_rows_detected") {
        throw "[storage-hygiene-report-pwsh-selftest] expected synthetic message pressure status"
    }
    if ([int64]$reportJson.oracle.summary.synthetic_message_pressure_total_dupes -ne 563324) {
        throw "[storage-hygiene-report-pwsh-selftest] expected synthetic message duplicate total"
    }
    if ([int64]$reportJson.oracle.summary.synthetic_message_pressure_maintenance_summary_dupes -ne 563300) {
        throw "[storage-hygiene-report-pwsh-selftest] expected maintenance summary duplicate total"
    }
    if ($reportJson.oracle.summary.operational_history_pressure_status -ne "") {
        throw "[storage-hygiene-report-pwsh-selftest] expected operational history pressure status to remain unset without fixture data"
    }
    if ([int64]$reportJson.oracle.summary.operational_history_cleanup_before_total_rows -ne 12045) {
        throw "[storage-hygiene-report-pwsh-selftest] expected operational history cleanup before-row total"
    }
    if ([int64]$reportJson.oracle.summary.operational_history_cleanup_after_total_rows -ne 12045) {
        throw "[storage-hygiene-report-pwsh-selftest] expected operational history cleanup after-row total"
    }
    if ($reportJson.oracle.summary.wal_slot_mode -ne "dry_run") {
        throw "[storage-hygiene-report-pwsh-selftest] expected WAL-slot remediation mode"
    }
    if ($reportJson.oracle.keep_runtime_items.Count -ne 1) {
        throw "[storage-hygiene-report-pwsh-selftest] expected one keep-runtime Oracle item"
    }
    if ($reportJson.oracle.group_summary.Count -lt 2) {
        throw "[storage-hygiene-report-pwsh-selftest] expected Oracle group summary rows"
    }
    if ($reportJson.oracle.runtime_required_group_count -ne 1) {
        throw "[storage-hygiene-report-pwsh-selftest] expected one runtime-required Oracle group"
    }
    if ([double]$reportJson.oracle.runtime_required_known_gib -ne 0) {
        throw "[storage-hygiene-report-pwsh-selftest] expected zero known GiB for runtime-required group fixture"
    }
    if ($reportJson.oracle.non_runtime_group_count -ne 2) {
        throw "[storage-hygiene-report-pwsh-selftest] expected two non-runtime Oracle groups in fixture"
    }
    if ($reportJson.oracle.safe_now_group_count -ne 1) {
        throw "[storage-hygiene-report-pwsh-selftest] expected one safe-now Oracle group"
    }
    if ($reportJson.oracle.review_required_group_count -ne 1) {
        throw "[storage-hygiene-report-pwsh-selftest] expected one review-required Oracle group in fixture"
    }
    if (@($reportJson.oracle.runtime_keep_group_names).Count -ne 1 -or [string]$reportJson.oracle.runtime_keep_group_names[0] -ne "omnyid_runtime") {
        throw "[storage-hygiene-report-pwsh-selftest] expected omnyid_runtime keep-group summary"
    }
    if (@($reportJson.oracle.cloud_omit_priority_group_names).Count -lt 2) {
        throw "[storage-hygiene-report-pwsh-selftest] expected cloud-omit priority group names"
    }
    $supabaseGroup = @($reportJson.oracle.group_summary | Where-Object { $_.ownership_group -eq "shared_host_supabase" }) | Select-Object -First 1
    if ($null -eq $supabaseGroup) {
        throw "[storage-hygiene-report-pwsh-selftest] expected shared_host_supabase group summary row"
    }
    if ($supabaseGroup.deployment_class -ne "non_omnyid_review") {
        throw "[storage-hygiene-report-pwsh-selftest] expected shared_host_supabase deployment class to be non_omnyid_review"
    }
    if ([bool]$supabaseGroup.required_on_oracle) {
        throw "[storage-hygiene-report-pwsh-selftest] expected shared_host_supabase to be non-runtime on Oracle"
    }
    if ($reportJson.oracle.delete_priority.Count -lt 1) {
        throw "[storage-hygiene-report-pwsh-selftest] expected Oracle delete priority rows"
    }

    $markdown = Get-Content (Join-Path $outDir "storage-hygiene-report.md") -Raw
    Assert-Contains -Actual $markdown -Expected "## Local Reclaim By Category"
    Assert-Contains -Actual $markdown -Expected '`rust_build`'
    Assert-Contains -Actual $markdown -Expected "## Recommended Local Delete Order"
    Assert-Contains -Actual $markdown -Expected "## Local Safe Delete Candidates"
    Assert-Contains -Actual $markdown -Expected '`target`'
    Assert-Contains -Actual $markdown -Expected '`solid-ui\dist`'
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_outcome: wal_slot_remediation_required"
    Assert-Contains -Actual $markdown -Expected "- oracle_postgres_wal_pressure_status: inactive_electric_slot_unbounded"
    Assert-Contains -Actual $markdown -Expected "- oracle_postgres_wal_gib: 20"
    Assert-Contains -Actual $markdown -Expected "- oracle_electric_slot_name: electric_slot_default"
    Assert-Contains -Actual $markdown -Expected "- oracle_electric_slot_active: False"
    Assert-Contains -Actual $markdown -Expected "- oracle_electric_slot_retained_wal_gib: 20"
    Assert-Contains -Actual $markdown -Expected "- oracle_wal_slot_mode: dry_run"
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_message_pressure_status: duplicate_snapshot_rows_detected"
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_message_pressure_total_dupes: 563324"
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_message_pressure_maintenance_summary_dupes: 563300"
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_message_pressure_curator_card_dupes: 12"
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_message_pressure_curator_backlink_dupes: 8"
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_message_pressure_ingestion_topology_dupes: 4"
    Assert-Contains -Actual $markdown -Expected "- oracle_operational_history_cleanup_mode: dry_run"
    Assert-Contains -Actual $markdown -Expected "- oracle_operational_history_cleanup_deleted_total: 0"
    Assert-Contains -Actual $markdown -Expected "- oracle_operational_history_cleanup_before_total_rows: 12045"
    Assert-Contains -Actual $markdown -Expected "- oracle_operational_history_cleanup_after_total_rows: 12045"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_required_group_count: 1"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_required_known_gib: 0"
    Assert-Contains -Actual $markdown -Expected "- oracle_non_runtime_group_count: 2"
    Assert-Contains -Actual $markdown -Expected "- oracle_non_runtime_known_gib: 8.323409"
    Assert-Contains -Actual $markdown -Expected "- oracle_safe_now_group_count: 1"
    Assert-Contains -Actual $markdown -Expected "- oracle_safe_now_known_gib: 1.4"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_required_group_count: 1"
    Assert-Contains -Actual $markdown -Expected "- oracle_review_required_known_gib: 6.923409"
    Assert-Contains -Actual $markdown -Expected "- oracle_runtime_keep_group_names: omnyid_runtime"
    Assert-Contains -Actual $markdown -Expected "- oracle_cloud_omit_priority_group_names: host_logs, shared_host_supabase"
    Assert-Contains -Actual $markdown -Expected "## Oracle Runtime Keep Set"
    Assert-Contains -Actual $markdown -Expected "- runtime-required group count: 1"
    Assert-Contains -Actual $markdown -Expected "- runtime-required known size: 0 GiB"
    Assert-Contains -Actual $markdown -Expected "- runtime-required groups: omnyid_runtime"
    Assert-Contains -Actual $markdown -Expected "omnyid-homeserver-1"
    Assert-Contains -Actual $markdown -Expected "## Oracle Group Decision Table"
    Assert-Contains -Actual $markdown -Expected "| shared_host_supabase | non_omnyid_review | False | False | 6.923409 |"
    Assert-Contains -Actual $markdown -Expected "## Oracle Delete Priority"
    Assert-Contains -Actual $markdown -Expected "- non-runtime group count: 2"
    Assert-Contains -Actual $markdown -Expected "- non-runtime known size: 8.323409 GiB"
    Assert-Contains -Actual $markdown -Expected "- safe-now group count: 1"
    Assert-Contains -Actual $markdown -Expected "- safe-now known size: 1.4 GiB"
    Assert-Contains -Actual $markdown -Expected "- review-required group count: 1"
    Assert-Contains -Actual $markdown -Expected "- review-required known size: 6.923409 GiB"
    Assert-Contains -Actual $markdown -Expected "- cloud-omit priority groups: host_logs, shared_host_supabase"
    Assert-Contains -Actual $markdown -Expected "## Oracle Review Cleanup Scope"
    Assert-Contains -Actual $markdown -Expected "shared_host_supabase"

    Write-Output "[storage-hygiene-report-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
