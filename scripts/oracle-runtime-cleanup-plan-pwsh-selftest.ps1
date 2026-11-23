Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-runtime-cleanup-plan-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-runtime-cleanup-plan-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $inventoryPath = Join-Path $tmpRoot "inventory.json"
    $outDir = Join-Path $tmpRoot "out"

    @'
{
  "remote_host": "oracle.example",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "43G",
      "avail": "1.6G",
      "use_pct": "97%"
    }
  ],
  "runtime_scripts": {
    "status": "fail",
    "detail": "remote runtime is missing required scripts: scripts/omnyid-backup-verify.sh,scripts/omnyid-restore-drill.sh",
    "missing_scripts": [
      "scripts/omnyid-backup-verify.sh",
      "scripts/omnyid-restore-drill.sh"
    ]
  },
  "postgres_runtime": {
    "postgres_container_name": "supabase-db",
    "electric_container_name": "omnyid-electric-1",
    "pg_wal_gib": 20,
    "max_slot_wal_keep_size": "-1",
    "wal_keep_size": "0",
    "electric_slot_status": "inactive_unbounded_wal_retention",
    "electric_slot_summary": "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited.",
    "electric_slot_name": "electric_slot_default",
    "electric_slot_active": false,
    "electric_slot_retained_wal_gib": 20,
    "electric_slot_restart_lsn": "0/14B00000",
    "electric_slot_confirmed_flush_lsn": "0/14B00000"
  },
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
  "counts": {
    "docker_image_reclaimable_gib": 15.24,
    "docker_build_cache_reclaimable_gib": 1.633,
    "docker_local_volume_reclaimable_gib": 0.077202
  },
  "ownership_groups": [
    {
      "ownership_group": "shared_host_supabase",
      "item_count": 2,
      "review_count": 1,
      "candidate_cleanup_count": 1,
      "known_size_gib": 2.92
    },
    {
      "ownership_group": "omnyid_backup_retention",
      "item_count": 1,
      "review_count": 1,
      "candidate_cleanup_count": 0,
      "known_size_gib": 1.2
    },
    {
      "ownership_group": "shared_host_coolify",
      "item_count": 1,
      "review_count": 0,
      "candidate_cleanup_count": 1,
      "known_size_gib": 0.077202
    }
  ],
  "items": [
    {
      "item_type": "container",
      "name": "omnyid-homeserver-1",
      "image": "omnyid-homeserver",
      "status": "Up 1 day",
      "size": "",
      "size_gib": null,
      "cleanup_class": "keep_runtime",
      "ownership_group": "omnyid_runtime"
    },
    {
      "item_type": "container",
      "name": "supabase-db",
      "image": "supabase/postgres:15.8.1.085",
      "status": "Up 1 day",
      "size": "",
      "size_gib": null,
      "cleanup_class": "candidate_cleanup",
      "ownership_group": "shared_host_supabase"
    },
    {
      "item_type": "volume",
      "name": "coolify-db",
      "image": "",
      "status": "",
      "size": "82892800",
      "size_gib": 0.077202,
      "cleanup_class": "candidate_cleanup",
      "ownership_group": "shared_host_coolify"
    },
    {
      "item_type": "image",
      "name": "supabase/postgres:15.8.1.085",
      "image": "abc123",
      "status": "",
      "size": "2.92GB",
      "size_gib": 2.92,
      "cleanup_class": "candidate_cleanup",
      "ownership_group": "shared_host_supabase"
    },
    {
      "item_type": "image",
      "name": "postgres:18",
      "image": "def456",
      "status": "",
      "size": "671MB",
      "size_gib": 0.655273,
      "cleanup_class": "review",
      "ownership_group": "other_review"
    },
    {
      "item_type": "host_storage",
      "name": "/var/backups/omnyid (older generations)",
      "image": "",
      "status": "",
      "size": "1288490188",
      "size_gib": 1.2,
      "cleanup_class": "review",
      "ownership_group": "omnyid_backup_retention"
    }
  ]
}
'@ | Set-Content -Path $inventoryPath -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-plan.ps1") `
        -InventoryPath $inventoryPath `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-plan-pwsh-selftest] expected cleanup plan script to pass`n$output"
    }

    $outputText = $output | Out-String
    Assert-Contains -Actual $outputText -Expected "candidate_containers=1"
    Assert-Contains -Actual $outputText -Expected "candidate_images=1"
    Assert-Contains -Actual $outputText -Expected "estimated_candidate_image_gib=2.92"
    Assert-Contains -Actual $outputText -Expected "estimated_total_candidate_gib=4.630202"
    Assert-Contains -Actual $outputText -Expected "pg_wal_gib=20"
    Assert-Contains -Actual $outputText -Expected "postgres_wal_pressure_status=inactive_electric_slot_unbounded"
    Assert-Contains -Actual $outputText -Expected "synthetic_message_total_dupes=563324"
    Assert-Contains -Actual $outputText -Expected "root_use_pct=97"

    $markdown = Get-Content (Join-Path $outDir "oracle-runtime-cleanup-plan.md") -Raw
    Assert-Contains -Actual $markdown -Expected "- estimated_candidate_volume_gib: 0.077202"
    Assert-Contains -Actual $markdown -Expected "- docker_image_reclaimable_gib: 15.24"
    Assert-Contains -Actual $markdown -Expected "- docker_build_cache_reclaimable_gib: 1.633"
    Assert-Contains -Actual $markdown -Expected "- estimated_total_candidate_gib: 4.630202"
    Assert-Contains -Actual $markdown -Expected "- pg_wal_gib: 20"
    Assert-Contains -Actual $markdown -Expected "- max_slot_wal_keep_size: -1"
    Assert-Contains -Actual $markdown -Expected "- electric_slot_name: electric_slot_default"
    Assert-Contains -Actual $markdown -Expected "- electric_slot_retained_wal_gib: 20"
    Assert-Contains -Actual $markdown -Expected "- postgres_wal_pressure_status: inactive_electric_slot_unbounded"
    Assert-Contains -Actual $markdown -Expected "- postgres_wal_pressure_summary: Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited."
    Assert-Contains -Actual $markdown -Expected "- safe_limit_recommendation_gib: 2"
    Assert-Contains -Actual $markdown -Expected "- disk_pressure_status: candidate_cleanup_likely_sufficient_for_retest"
    Assert-Contains -Actual $markdown -Expected "- projected_root_use_pct_after_candidate_cleanup: 86"
    Assert-Contains -Actual $markdown -Expected "- top_review_target_group: shared_host_supabase"
    Assert-Contains -Actual $markdown -Expected "- review_recommended_action: top non-runtime review target is 'shared_host_supabase'"
    Assert-Contains -Actual $markdown -Expected "- top_review_target_cleanup_command: docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
    Assert-Contains -Actual $markdown -Expected "- omnyid_backup_retention_known_size_gib: 1.2"
    Assert-Contains -Actual $markdown -Expected '- omnyid_backup_retention_cleanup_command: sudo bash -lc ''set -euo pipefail; backup_root=/var/backups/omnyid; latest=$(sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort | tail -n 1); if [ -z "$latest" ]; then echo no backup generations found under "$backup_root"; exit 0; fi; sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d ! -name "$latest" -exec rm -rf -- {} +'''
    Assert-Contains -Actual $markdown -Expected '- combined_retention_and_top_target_cleanup_command: sudo bash -lc ''set -euo pipefail; backup_root=/var/backups/omnyid; latest=$(sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort | tail -n 1); if [ -z "$latest" ]; then echo no backup generations found under "$backup_root"; exit 0; fi; sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d ! -name "$latest" -exec rm -rf -- {} +'' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085'
    Assert-Contains -Actual $markdown -Expected "## Review Targets"
    Assert-Contains -Actual $markdown -Expected "| shared_host_supabase | 1 | 2.92 |"
    Assert-Contains -Actual $markdown -Expected "| omnyid_backup_retention | 1 | 1.2 |"
    Assert-Contains -Actual $markdown -Expected "- synthetic_message_status: duplicate_snapshot_rows_detected"
    Assert-Contains -Actual $markdown -Expected "- synthetic_message_total_dupes: 563324"
    Assert-Contains -Actual $markdown -Expected "- synthetic_message_recommended_action: Synthetic snapshot-like duplicate rows are present. Prune historical duplicates, then keep these writers bounded to one current row per selector."
    Assert-Contains -Actual $markdown -Expected "docker rm -f supabase-db"
    Assert-Contains -Actual $markdown -Expected "docker image prune -af"
    Assert-Contains -Actual $markdown -Expected "docker builder prune -af"
    Assert-Contains -Actual $markdown -Expected "docker volume rm coolify-db"
    Assert-Contains -Actual $markdown -Expected "- review_target_cleanup: $ docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
    Assert-Contains -Actual $markdown -Expected '- omnyid_backup_retention_cleanup: $ sudo bash -lc ''set -euo pipefail; backup_root=/var/backups/omnyid; latest=$(sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort | tail -n 1); if [ -z "$latest" ]; then echo no backup generations found under "$backup_root"; exit 0; fi; sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d ! -name "$latest" -exec rm -rf -- {} +'''
    Assert-Contains -Actual $markdown -Expected '- combined_retention_and_top_target_cleanup: $ sudo bash -lc ''set -euo pipefail; backup_root=/var/backups/omnyid; latest=$(sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort | tail -n 1); if [ -z "$latest" ]; then echo no backup generations found under "$backup_root"; exit 0; fi; sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d ! -name "$latest" -exec rm -rf -- {} +'' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085'
    Assert-Contains -Actual $markdown -Expected "postgres:18"
    Assert-Contains -Actual $markdown -Expected "- runtime_repair_required: True"
    Assert-Contains -Actual $markdown -Expected "- runtime_repair_blocks_backup_verify: True"
    Assert-Contains -Actual $markdown -Expected "- runtime_repair_blocks_restore_drill: True"
    Assert-Contains -Actual $markdown -Expected "./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts"
    Assert-Contains -Actual $markdown -Expected "- oracle_repair_kind: redeploy"
    Assert-Contains -Actual $markdown -Expected "- oracle_repair_required: True"
    Assert-Contains -Actual $markdown -Expected "## Postgres WAL"
    Assert-Contains -Actual $markdown -Expected "- status: inactive_electric_slot_unbounded"
    Assert-Contains -Actual $markdown -Expected "- summary: Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited."
    Assert-Contains -Actual $markdown -Expected "## Synthetic Messages"
    Assert-Contains -Actual $markdown -Expected "- status: duplicate_snapshot_rows_detected"
    Assert-Contains -Actual $markdown -Expected "- total_dupes: 563324"
    Assert-Contains -Actual $markdown -Expected "- maintenance_summary_dupes: 563300"
    Assert-Contains -Actual $markdown -Expected "- curator_card_dupes: 12"
    Assert-Contains -Actual $markdown -Expected "- curator_backlink_dupes: 8"
    Assert-Contains -Actual $markdown -Expected "- ingestion_topology_dupes: 4"
    Assert-Contains -Actual $markdown -Expected "- prune_command: ./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
    Assert-Contains -Actual $markdown -Expected "- inspect_replication_slots: $ docker exec supabase-db psql"
    Assert-Contains -Actual $markdown -Expected "- restart_electric: $ docker restart omnyid-electric-1"
    Assert-Contains -Actual $markdown -Expected "- drop_electric_slot: $ docker exec supabase-db psql"
    Assert-Contains -Actual $markdown -Expected "pg_drop_replication_slot('electric_slot_default')"
    Assert-Contains -Actual $markdown -Expected "- limit_slot_wal: $ docker exec supabase-db psql"
    Assert-Contains -Actual $markdown -Expected "ALTER SYSTEM SET max_slot_wal_keep_size = '2GB';"
    Assert-Contains -Actual $markdown -Expected "- remediate_electric_slot_restart_and_limit: $ ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -RestartElectric -ApplyWalLimit -Execute"
    Assert-Contains -Actual $markdown -Expected "- remediate_electric_slot_drop_and_limit: $ ./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -DropSlot -ApplyWalLimit -CheckpointAfterDrop -Execute"

    $targetedInventoryPath = Join-Path $tmpRoot "inventory-targeted.json"
    $targetedOutDir = Join-Path $tmpRoot "out-targeted"
    @'
{
  "remote_host": "oracle.example",
  "classification_mode": "targeted_ownership_cleanup_enabled",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "45G",
      "avail": "520K",
      "use_pct": "100%"
    }
  ],
  "runtime_scripts": {
    "status": "pass",
    "detail": "required runtime scripts are present",
    "missing_scripts": []
  },
  "postgres_runtime": {
    "postgres_container_name": "supabase-db",
    "electric_container_name": "omnyid-electric-1",
    "pg_wal_gib": 12,
    "max_slot_wal_keep_size": "4GB",
    "wal_keep_size": "0",
    "electric_slot_status": "inactive_wal_retention",
    "electric_slot_summary": "Electric slot 'electric_slot_default' is inactive and retaining 12 GB of WAL.",
    "electric_slot_name": "electric_slot_default",
    "electric_slot_active": false,
    "electric_slot_retained_wal_gib": 12,
    "electric_slot_restart_lsn": "0/14B00000",
    "electric_slot_confirmed_flush_lsn": "0/14B00000"
  },
  "counts": {
    "docker_image_reclaimable_gib": 15.24,
    "docker_build_cache_reclaimable_gib": 0,
    "docker_local_volume_reclaimable_gib": 0
  },
  "ownership_groups": [],
  "items": [
    {
      "item_type": "container",
      "name": "supabase-db",
      "image": "supabase/postgres:15.8.1.085",
      "status": "Up 1 day",
      "size": "",
      "size_gib": null,
      "cleanup_class": "candidate_cleanup",
      "ownership_group": "shared_host_supabase"
    },
    {
      "item_type": "image",
      "name": "supabase/postgres:15.8.1.085",
      "image": "abc123",
      "status": "",
      "size": "9.24GB",
      "size_gib": 9.24,
      "cleanup_class": "candidate_cleanup",
      "ownership_group": "shared_host_supabase"
    }
  ]
}
'@ | Set-Content -Path $targetedInventoryPath -Encoding ASCII

    $targetedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-plan.ps1") `
        -InventoryPath $targetedInventoryPath `
        -OutDir $targetedOutDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-plan-pwsh-selftest] expected targeted cleanup plan script to pass`n$targetedOutput"
    }
    $targetedMarkdown = Get-Content (Join-Path $targetedOutDir "oracle-runtime-cleanup-plan.md") -Raw
    Assert-Contains -Actual $targetedMarkdown -Expected "- oracle_repair_kind: targeted_cleanup"
    Assert-Contains -Actual $targetedMarkdown -Expected "- oracle_repair_required: True"
    Assert-Contains -Actual $targetedMarkdown -Expected "- oracle_repair_blocks_backup_verify: True"
    Assert-Contains -Actual $targetedMarkdown -Expected "- oracle_repair_blocks_restore_drill: True"
    Assert-Contains -Actual $targetedMarkdown -Expected "projects root usage down to about 79% after candidate cleanup"
    Assert-Contains -Actual $targetedMarkdown -Expected "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; ./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"

    $reviewTargetInventoryPath = Join-Path $tmpRoot "inventory-review-target.json"
    $reviewTargetOutDir = Join-Path $tmpRoot "out-review-target"
    @'
{
  "remote_host": "oracle.example",
  "classification_mode": "safe_review_default",
  "disk": [
    {
      "mount": "/",
      "size": "45G",
      "used": "45G",
      "avail": "524K",
      "use_pct": "100%"
    }
  ],
  "runtime_scripts": {
    "status": "pass",
    "detail": "required runtime scripts are present",
    "missing_scripts": []
  },
  "postgres_runtime": {
    "postgres_container_name": "supabase-db",
    "electric_container_name": "omnyid-electric-1",
    "pg_wal_gib": 20,
    "max_slot_wal_keep_size": "-1",
    "wal_keep_size": "0",
    "electric_slot_status": "inactive_unbounded_wal_retention",
    "electric_slot_summary": "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited.",
    "electric_slot_name": "electric_slot_default",
    "electric_slot_active": false,
    "electric_slot_retained_wal_gib": 20,
    "electric_slot_restart_lsn": "0/14B00000",
    "electric_slot_confirmed_flush_lsn": "0/14B00000"
  },
  "counts": {
    "docker_image_reclaimable_gib": 0,
    "docker_build_cache_reclaimable_gib": 0,
    "docker_local_volume_reclaimable_gib": 0
  },
  "ownership_groups": [
    {
      "ownership_group": "shared_host_supabase",
      "item_count": 32,
      "review_count": 32,
      "candidate_cleanup_count": 1,
      "known_size_gib": 9.235644
    }
  ],
  "items": [
    {
      "item_type": "volume",
      "name": "anonymous-zero",
      "image": "",
      "status": "",
      "size": "0B",
      "size_gib": 0,
      "cleanup_class": "candidate_cleanup",
      "ownership_group": "shared_host_supabase"
    },
    {
      "item_type": "container",
      "name": "supabase-auth",
      "image": "supabase/gotrue:v2.186.0",
      "status": "Up 1 day",
      "size": "",
      "size_gib": null,
      "cleanup_class": "review",
      "ownership_group": "shared_host_supabase"
    },
    {
      "item_type": "image",
      "name": "supabase/edge-runtime:v1.70.3",
      "image": "sha256:abc",
      "status": "",
      "size": "9.24GB",
      "size_gib": 9.235644,
      "cleanup_class": "review",
      "ownership_group": "shared_host_supabase"
    }
  ]
}
'@ | Set-Content -Path $reviewTargetInventoryPath -Encoding ASCII

    $reviewTargetOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-plan.ps1") `
        -InventoryPath $reviewTargetInventoryPath `
        -OutDir $reviewTargetOutDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-plan-pwsh-selftest] expected review-target cleanup plan script to pass`n$reviewTargetOutput"
    }
    $reviewTargetMarkdown = Get-Content (Join-Path $reviewTargetOutDir "oracle-runtime-cleanup-plan.md") -Raw
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "- estimated_total_candidate_gib: 0"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "- projected_root_use_pct_after_candidate_cleanup: 100"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "- top_review_target_group: shared_host_supabase"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "- top_review_target_known_size_gib: 9.235644"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "- oracle_repair_kind: postgres_wal_slot"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "- oracle_repair_required: True"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited."
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -RestartElectric -ApplyWalLimit -Execute"
    Assert-Contains -Actual $reviewTargetMarkdown -Expected "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -DropSlot -ApplyWalLimit -CheckpointAfterDrop -Execute"

    Write-Output "[oracle-runtime-cleanup-plan-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
