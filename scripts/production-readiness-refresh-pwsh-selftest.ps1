Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("production-readiness-refresh-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    $scriptCopy = Join-Path $tmpRoot "production-readiness-refresh.ps1"
    $outDir = Join-Path $tmpRoot "out"

    @'
param([string]$OutputDir = "")
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
@{
  copied_path_count = 1
  total_staged_gib = 0.1
  include_simulated_data = $true
  excluded_existing_path_count = 2
  excluded_existing_gib = 15.6
  excluded_existing_paths = @("target", "artifacts")
} | ConvertTo-Json | Set-Content (Join-Path $OutputDir "oracle-runtime-manifest.json")
Write-Output "[fake-stage-runtime] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "stage-oracle-runtime.ps1") -Encoding ASCII

    @'
param([string]$OutDir = "")
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  counts = @{
    total_phases = 13
    implemented = 4
    partial = 2
    not_started = 1
    total_tasks = 12
    implemented_tasks = 9
    partial_tasks = 2
    not_started_tasks = 1
    residual_open_items = 1
  }
  phases = @(@{ phase_number = 0; title = "Terminology"; status = "not_started" })
  open_tasks = @(@{ phase_number = 0; task_number = 1; text = "Define terminology."; status = "not_started" })
  open_items = @(
    @{ item_kind = "task"; phase_number = 0; task_number = 1; text = "Define terminology."; status = "not_started" }
    @{ item_kind = "phase_note"; phase_number = 1; task_number = $null; text = "remaining work is compact renderer cleanup"; status = "partial" }
  )
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "personalos-readiness-audit.json")
Write-Output "[fake-personalos-audit] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "personalos-readiness-audit.ps1") -Encoding ASCII

@'
param([string]$InventoryPath = "", [string]$OutDir = "")
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  generated_at = "2026-08-21T10:00:00Z"
  counts = @{ candidate_containers = 1; candidate_volumes = 1; candidate_images = 1 }
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-plan.json")
Write-Output "[fake-cleanup-plan] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "oracle-runtime-cleanup-plan.ps1") -Encoding ASCII

    @'
param([string]$EnvFile = "", [string]$BackupDir = "", [string]$OutDir = "", [string]$ApiFlows = "")
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  generated_at = "2026-08-21T10:00:02Z"
  status = "pass"
  frontend_bundle_warning_count = 3
  frontend_bundle_note_count = 1
  artifact_paths = @{
    frontend_bundle_report = (Join-Path $OutDir "frontend-bundle-report.json")
  }
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "summary.json")
@{
  warning_count = 3
  note_count = 1
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "frontend-bundle-report.json")
Write-Output "[fake-release-readiness] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "release-readiness.ps1") -Encoding ASCII

    @'
param([string]$CleanupPlanPath = "", [string]$OutDir = "", [switch]$IncludeCombinedReviewCleanup)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  generated_at = "2026-08-21T10:00:00Z"
  steps = @(
    @{ name = "combined_retention_and_top_target_cleanup"; status = "dry_run"; command = "cleanup" }
  )
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-execute.json")
Write-Output "[fake-cleanup-execute] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "oracle-runtime-cleanup-execute.ps1") -Encoding ASCII

@'
param([string]$OracleProofPath = "", [string]$OracleInventoryPath = "", [string]$OracleCleanupPlanPath = "", [string]$OracleCleanupExecutePath = "", [string]$OracleRemediationPath = "", [string]$ReleaseReadinessPath = "", [string]$PersonalOsAuditPath = "", [string]$StageManifestPath = "", [string]$StorageHygienePath = "", [string]$OutDir = "", [int]$MaxFrontendBundleWarnings = 2, [switch]$RequireExecutedOracleRemediation)
if (-not (Test-Path -LiteralPath $StorageHygienePath)) {
  throw "storage hygiene artifact missing before commercial snapshot"
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  policy = @{
    max_frontend_bundle_warnings = $MaxFrontendBundleWarnings
    require_executed_oracle_remediation = [bool]$RequireExecutedOracleRemediation
  }
  commercial_readiness = @{ status = "not_ready"; blocker_count = 2; blockers = @("b1", "b2") }
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "commercial-readiness-snapshot.json")
Write-Output "[fake-commercial-snapshot] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "commercial-readiness-snapshot.ps1") -Encoding ASCII

    @'
param([string]$CleanupPlanPath = "", [string]$OutDir = "", [switch]$SkipProof)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutDir "wal-slot-remediation") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutDir "synthetic-cleanup") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutDir "operational-history-cleanup") -Force | Out-Null
@{ generated_at = "2026-08-21T10:00:01Z"; remediation_summary = @{ outcome = "proof_not_rechecked"; cleanup_mode = "dry_run" } } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-remediation-sequence.json")
@{ generated_at = "2026-08-21T10:00:01Z"; status = "dry_run"; slot_name = "electric_slot_default" } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "wal-slot-remediation\\oracle-remediate-electric-slot.json")
@{ generated_at = "2026-08-21T10:00:01Z"; before = @{ total_dupes = 1692804 }; after = @{ total_dupes = 0; deleted_total = 1692804 } } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "synthetic-cleanup\\oracle-prune-synthetic-message-spam.json")
@{ generated_at = "2026-08-21T10:00:01Z"; before = @{ total_rows = 12045 }; after = @{ total_rows = 500; deleted_total = 11545 } } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "operational-history-cleanup\\oracle-prune-operational-history.json")
Write-Output "[fake-oracle-remediation] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "oracle-remediation-sequence.ps1") -Encoding ASCII

    @'
param([string]$CommercialSnapshotPath = "", [string]$OutDir = "", [switch]$SkipReleaseReadiness)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{ status = "no_go" } | ConvertTo-Json | Set-Content (Join-Path $OutDir "production-go-no-go.json")
Write-Output "[fake-go-no-go] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "production-go-no-go.ps1") -Encoding ASCII

    @'
param([string]$WorkspaceRoot = "", [string]$OracleInventoryPath = "", [string]$OracleCleanupPlanPath = "", [string]$CommercialSnapshotPath = "", [string]$OutDir = "")
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  local = @{
    safe_delete_gib = 15.99
    safe_delete_count = 20
  }
  oracle = @{
    summary = @{
      review_target_group = "shared_host_supabase"
      restore_gap_gib = 7.27
    }
  }
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "storage-hygiene-report.json")
Write-Output "[fake-storage-hygiene] ok"
'@ | Set-Content -Path (Join-Path $tmpRoot "storage-hygiene-report.ps1") -Encoding ASCII

    @'
param([string]$OutDir = "", [switch]$UseDetachedRemoteAudit)
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
@{
  generated_at = "2026-08-21T10:00:00Z"
  status = "fail"
  failure_step = "restore_drill"
  failure_reason = "restore drill failed"
} | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-production-proof.json")
Write-Output "[fake-oracle-proof] refresh failed after capturing proof artifact"
exit 1
'@ | Set-Content -Path (Join-Path $tmpRoot "oracle-production-proof.ps1") -Encoding ASCII

    @'
@{ counts = @{ candidate_cleanup_items = 3; candidate_cleanup_image_gib = 2.92 } } | ConvertTo-Json -Depth 8 | Set-Content $args[0]
'@ | Set-Content -Path (Join-Path $tmpRoot "oracle-runtime-inventory.ps1") -Encoding ASCII

    $source = Get-Content (Join-Path $PSScriptRoot "production-readiness-refresh.ps1") -Raw
    foreach ($name in @(
        "stage-oracle-runtime.ps1",
        "personalos-readiness-audit.ps1",
        "oracle-production-proof.ps1",
        "oracle-runtime-inventory.ps1",
        "oracle-runtime-cleanup-plan.ps1",
        "release-readiness.ps1",
        "oracle-runtime-cleanup-execute.ps1",
        "oracle-remediation-sequence.ps1",
        "commercial-readiness-snapshot.ps1",
        "storage-hygiene-report.ps1",
        "production-go-no-go.ps1"
    )) {
        $source = $source.Replace('Join-Path $PSScriptRoot "' + $name + '"', '"' + ((Join-Path $tmpRoot $name) -replace '\\', '\\') + '"')
    }
    $source | Set-Content -Path $scriptCopy -Encoding ASCII

    $artifactRoot = Join-Path (Split-Path -Parent $tmpRoot) "artifacts"
    $proofCurrentDir = Join-Path $artifactRoot "oracle-production-proof-current"
    $inventoryCurrentDir = Join-Path $artifactRoot "oracle-runtime-inventory-current"
    $remediationCurrentDir = Join-Path $artifactRoot "oracle-remediation-sequence-current"
    $releaseReadinessCurrentDir = Join-Path $artifactRoot "release-readiness-current"
    New-Item -ItemType Directory -Path $proofCurrentDir -Force | Out-Null
    New-Item -ItemType Directory -Path $inventoryCurrentDir -Force | Out-Null
    New-Item -ItemType Directory -Path $remediationCurrentDir -Force | Out-Null
    New-Item -ItemType Directory -Path $releaseReadinessCurrentDir -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $remediationCurrentDir "wal-slot-remediation") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $remediationCurrentDir "synthetic-cleanup") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $remediationCurrentDir "operational-history-cleanup") -Force | Out-Null
    '{"generated_at":"2026-08-18T09:30:22Z","status":"fail","failure_step":"disk_capacity","remote_root_use_pct":"100","backup_verify_status":"fail","restore_drill_status":"blocked","remote_host":"oracle.example","remote_var_use_pct":"100","latest_archive_age_days":"5","failure_reason":"disk"}' | Set-Content (Join-Path $proofCurrentDir "oracle-production-proof.json") -Encoding ASCII
    '{"generated_at":"2026-08-18T09:29:46Z","counts":{"candidate_cleanup_items":3,"candidate_cleanup_image_gib":2.92}}' | Set-Content (Join-Path $inventoryCurrentDir "oracle-runtime-inventory.json") -Encoding ASCII
    '{"generated_at":"2026-08-18T09:31:30Z","remediation_summary":{"outcome":"proof_passed","cleanup_mode":"executed","cleanup_step_count":3}}' | Set-Content (Join-Path $remediationCurrentDir "oracle-remediation-sequence.json") -Encoding ASCII
    '{"generated_at":"2026-08-18T09:31:31Z","status":"executed","slot_name":"electric_slot_default"}' | Set-Content (Join-Path $remediationCurrentDir "wal-slot-remediation\\oracle-remediate-electric-slot.json") -Encoding ASCII
    '{"generated_at":"2026-08-18T09:31:32Z","before":{"total_dupes":1692804},"after":{"total_dupes":0,"deleted_total":1692804}}' | Set-Content (Join-Path $remediationCurrentDir "synthetic-cleanup\\oracle-prune-synthetic-message-spam.json") -Encoding ASCII
    '{"generated_at":"2026-08-18T09:31:33Z","before":{"total_rows":12045},"after":{"total_rows":500,"deleted_total":11545}}' | Set-Content (Join-Path $remediationCurrentDir "operational-history-cleanup\\oracle-prune-operational-history.json") -Encoding ASCII
    '{"started_at":"2026-08-18T09:32:10Z","status":"pass","frontend_bundle_warning_count":2,"frontend_bundle_note_count":1,"artifact_paths":{"frontend_bundle_report":"C:\\artifacts\\release-readiness-current\\frontend-correctness\\frontend-bundle-report.json"}}' | Set-Content (Join-Path $releaseReadinessCurrentDir "summary.json") -Encoding ASCII

    Push-Location $tmpRoot
    try {
        $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy -OutDir $outDir 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "[production-readiness-refresh-pwsh-selftest] expected refresh script to pass`n$output"
        }
    }
    finally {
        Pop-Location
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "proof=False inventory=False"
    Assert-Contains -Actual $text -Expected "steps=12"

    $markdown = Get-Content (Join-Path $outDir "production-readiness-refresh.md") -Raw
    Assert-Contains -Actual $markdown -Expected "| stage_runtime | pass | [fake-stage-runtime] ok |"
    Assert-Contains -Actual $markdown -Expected "| oracle_proof | skipped | oracle proof refresh skipped by operator; reused current artifact (generated_at=2026-08-18T09:30:22Z;"
    Assert-Contains -Actual $markdown -Expected "| oracle_inventory | skipped | oracle inventory refresh skipped by operator; reused current artifact (generated_at=2026-08-18T09:29:46Z;"
    Assert-Contains -Actual $markdown -Expected "| oracle_cleanup_execute | pass | [fake-cleanup-execute] ok |"
    Assert-Contains -Actual $markdown -Expected "| oracle_remediation | copied_current | oracle remediation artifact copied from current audited artifact (generated_at=2026-08-18T09:31:30Z;"
    Assert-Contains -Actual $markdown -Expected "| storage_hygiene | pass | [fake-storage-hygiene] ok |"
    Assert-Contains -Actual $markdown -Expected "| commercial_snapshot_strict | pass | [fake-commercial-snapshot] ok |"
    Assert-Contains -Actual $markdown -Expected "| go_no_go | pass | [fake-go-no-go] ok |"
    Assert-Contains -Actual $markdown -Expected "| go_no_go_strict | pass | [fake-go-no-go] ok |"
    Assert-Contains -Actual $markdown -Expected "- generated_strict_comparison_lane: True"
    Assert-Contains -Actual $markdown -Expected "- reused_oracle_proof_generated_at: 2026-08-18T09:30:22Z"
    Assert-Contains -Actual $markdown -Expected "- reused_oracle_inventory_generated_at: 2026-08-18T09:29:46Z"
    Assert-Contains -Actual $markdown -Expected "- reused_release_readiness_generated_at: 2026-08-18T09:32:10Z"
    Assert-Contains -Actual $markdown -Expected "- oracle_cleanup_execute_artifact: "
    Assert-Contains -Actual $markdown -Expected "- oracle_remediation_artifact: "
    Assert-Contains -Actual $markdown -Expected "- oracle_wal_slot_remediation_artifact: "
    Assert-Contains -Actual $markdown -Expected "- oracle_synthetic_cleanup_artifact: "
    Assert-Contains -Actual $markdown -Expected "- oracle_operational_history_cleanup_artifact: "
    Assert-Contains -Actual $markdown -Expected "- storage_hygiene_artifact: "
    Assert-Contains -Actual $markdown -Expected "- stage_manifest_include_simulated_data: True"
    Assert-Contains -Actual $markdown -Expected "- stage_manifest_excluded_existing_path_count: 2"
    Assert-Contains -Actual $markdown -Expected "- stage_manifest_excluded_existing_gib: 15.6"
    Assert-Contains -Actual $markdown -Expected "- stage_manifest_top_excluded_paths: target, artifacts"

    $report = Get-Content (Join-Path $outDir "production-readiness-refresh.json") -Raw | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.oracle_remediation)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected oracle remediation artifact path to be populated"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.oracle_wal_slot_remediation)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected oracle WAL-slot remediation artifact path to be populated"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.oracle_synthetic_cleanup)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected oracle synthetic cleanup artifact path to be populated"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.oracle_operational_history_cleanup)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected oracle operational-history cleanup artifact path to be populated"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.commercial_snapshot_strict)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict commercial snapshot artifact path to be populated"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.go_no_go_strict)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict go/no-go artifact path to be populated"
    }
    if ([string]::IsNullOrWhiteSpace($report.artifact_paths.storage_hygiene)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected storage hygiene artifact path to be populated"
    }
    if ($report.generated_strict_comparison_lane -ne $true) {
        throw "[production-readiness-refresh-pwsh-selftest] expected default refresh run to generate the strict comparison lane"
    }
    if ($report.reused_artifact_freshness.oracle_proof.generated_at -ne "2026-08-18T09:30:22Z") {
        throw "[production-readiness-refresh-pwsh-selftest] expected reused proof generated_at metadata"
    }
    if ($report.reused_artifact_freshness.release_readiness.generated_at -ne "2026-08-18T09:32:10Z") {
        throw "[production-readiness-refresh-pwsh-selftest] expected reused release readiness generated_at metadata"
    }
    if ($report.reused_artifact_freshness.oracle_remediation.generated_at -ne "2026-08-18T09:31:30Z") {
        throw "[production-readiness-refresh-pwsh-selftest] expected reused remediation generated_at metadata"
    }
    if ($report.reused_artifact_freshness.oracle_wal_slot_remediation.generated_at -ne "2026-08-18T09:31:31Z") {
        throw "[production-readiness-refresh-pwsh-selftest] expected reused WAL-slot remediation generated_at metadata"
    }
    if ($report.reused_artifact_freshness.oracle_operational_history_cleanup.generated_at -ne "2026-08-18T09:31:33Z") {
        throw "[production-readiness-refresh-pwsh-selftest] expected reused operational-history cleanup generated_at metadata"
    }
    if ($report.reused_artifact_freshness.oracle_synthetic_cleanup.generated_at -ne "2026-08-18T09:31:32Z") {
        throw "[production-readiness-refresh-pwsh-selftest] expected reused synthetic cleanup generated_at metadata"
    }
    if ($report.stage_manifest_summary.excluded_existing_path_count -ne 2) {
        throw "[production-readiness-refresh-pwsh-selftest] expected stage manifest excluded path count"
    }
    if ($report.stage_manifest_summary.top_excluded_paths[0] -ne "target") {
        throw "[production-readiness-refresh-pwsh-selftest] expected stage manifest excluded path summary"
    }
    $publishedCommercialSnapshotPath = Join-Path $artifactRoot "commercial-readiness-snapshot-current\commercial-readiness-snapshot.json"
    if (-not (Test-Path -LiteralPath $publishedCommercialSnapshotPath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected commercial snapshot to be published into the canonical current artifact path"
    }
    $publishedCommercialSnapshot = Get-Content -LiteralPath $publishedCommercialSnapshotPath -Raw | ConvertFrom-Json
    if ($publishedCommercialSnapshot.commercial_readiness.blocker_count -ne 2) {
        throw "[production-readiness-refresh-pwsh-selftest] expected published commercial snapshot blocker count to match refreshed output"
    }
    $publishedGoNoGoPath = Join-Path $artifactRoot "production-go-no-go-current\production-go-no-go.json"
    if (-not (Test-Path -LiteralPath $publishedGoNoGoPath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected go/no-go artifact to be published into the canonical current artifact path"
    }
    $publishedStrictCommercialSnapshotPath = Join-Path $artifactRoot "commercial-readiness-snapshot-strict-current\commercial-readiness-snapshot.json"
    if (-not (Test-Path -LiteralPath $publishedStrictCommercialSnapshotPath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict commercial snapshot to be published into the canonical strict artifact path"
    }
    $publishedStrictGoNoGoPath = Join-Path $artifactRoot "production-go-no-go-strict-current\production-go-no-go.json"
    if (-not (Test-Path -LiteralPath $publishedStrictGoNoGoPath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict go/no-go artifact to be published into the canonical strict artifact path"
    }
    $publishedCleanupExecutePath = Join-Path $artifactRoot "oracle-runtime-cleanup-execute-current\oracle-runtime-cleanup-execute.json"
    if (-not (Test-Path -LiteralPath $publishedCleanupExecutePath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected cleanup execute preview to be published into the canonical current artifact path"
    }
    $publishedWalSlotRemediationPath = Join-Path $artifactRoot "oracle-remediation-sequence-current\wal-slot-remediation\oracle-remediate-electric-slot.json"
    if (-not (Test-Path -LiteralPath $publishedWalSlotRemediationPath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected WAL-slot remediation artifact to be published into the canonical current artifact path"
    }
    $publishedSyntheticCleanupPath = Join-Path $artifactRoot "oracle-remediation-sequence-current\synthetic-cleanup\oracle-prune-synthetic-message-spam.json"
    if (-not (Test-Path -LiteralPath $publishedSyntheticCleanupPath)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected synthetic cleanup artifact to be published into the canonical current artifact path"
    }

    Push-Location $tmpRoot
    try {
        $proofRefreshOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy -OutDir $outDir -RefreshOracleProof 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "[production-readiness-refresh-pwsh-selftest] expected refresh script to tolerate proof failure when artifact is captured`n$proofRefreshOutput"
        }
    }
    finally {
        Pop-Location
    }

    $proofRefreshText = $proofRefreshOutput | Out-String
    Assert-Contains -Actual $proofRefreshText -Expected "proof=True inventory=False"

    $proofRefreshMarkdown = Get-Content (Join-Path $outDir "production-readiness-refresh.md") -Raw
    Assert-Contains -Actual $proofRefreshMarkdown -Expected "| oracle_proof | fresh_fail | [fake-oracle-proof] refresh failed after capturing proof artifact"
    Assert-Contains -Actual $proofRefreshMarkdown -Expected "oracle proof artifact captured; generated_at=2026-08-21T10:00:00Z"

    Push-Location $tmpRoot
    try {
        $releaseReadinessOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy -OutDir $outDir -RunReleaseReadiness 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "[production-readiness-refresh-pwsh-selftest] expected refresh script with release readiness to pass`n$releaseReadinessOutput"
        }
    }
    finally {
        Pop-Location
    }

    $releaseReadinessMarkdown = Get-Content (Join-Path $outDir "production-readiness-refresh.md") -Raw
    Assert-Contains -Actual $releaseReadinessMarkdown -Expected "| release_readiness | pass | [fake-release-readiness] ok |"
    Assert-Contains -Actual $releaseReadinessMarkdown -Expected "- release_readiness_status: pass"
    Assert-Contains -Actual $releaseReadinessMarkdown -Expected "- release_readiness_generated_at: 2026-08-21T10:00:02Z"
    Assert-Contains -Actual $releaseReadinessMarkdown -Expected "- release_readiness_frontend_bundle_warning_count: 3"
    Assert-Contains -Actual $releaseReadinessMarkdown -Expected "- release_readiness_frontend_bundle_note_count: 1"
    Assert-Contains -Actual $releaseReadinessMarkdown -Expected "- release_readiness_frontend_bundle_report: "

    $releaseReadinessReport = Get-Content (Join-Path $outDir "production-readiness-refresh.json") -Raw | ConvertFrom-Json
    if ($releaseReadinessReport.release_readiness_frontend_bundle_warning_count -ne 3) {
        throw "[production-readiness-refresh-pwsh-selftest] expected release readiness frontend bundle warning count"
    }
    if ($releaseReadinessReport.release_readiness_frontend_bundle_note_count -ne 1) {
        throw "[production-readiness-refresh-pwsh-selftest] expected release readiness frontend bundle note count"
    }
    if ([string]::IsNullOrWhiteSpace($releaseReadinessReport.artifact_paths.release_readiness_frontend_bundle_report)) {
        throw "[production-readiness-refresh-pwsh-selftest] expected release readiness frontend bundle report path"
    }
    if ($releaseReadinessReport.policy_max_frontend_bundle_warnings -ne 2) {
        throw "[production-readiness-refresh-pwsh-selftest] expected default frontend bundle warning policy to be reported"
    }
    if ($releaseReadinessReport.policy_require_executed_oracle_remediation -ne $false) {
        throw "[production-readiness-refresh-pwsh-selftest] expected default executed-remediation policy to be reported"
    }

    Push-Location $tmpRoot
    try {
        $strictPolicyOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy -OutDir $outDir -RunReleaseReadiness -MaxFrontendBundleWarnings 1 -RequireExecutedOracleRemediation 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "[production-readiness-refresh-pwsh-selftest] expected refresh script with strict policy flags to pass`n$strictPolicyOutput"
        }
    }
    finally {
        Pop-Location
    }

    $strictPolicyMarkdown = Get-Content (Join-Path $outDir "production-readiness-refresh.md") -Raw
    Assert-Contains -Actual $strictPolicyMarkdown -Expected "- policy_max_frontend_bundle_warnings: 1"
    Assert-Contains -Actual $strictPolicyMarkdown -Expected "- policy_require_executed_oracle_remediation: True"
    Assert-Contains -Actual $strictPolicyMarkdown -Expected "- generated_strict_comparison_lane: False"

    $strictPolicyReport = Get-Content (Join-Path $outDir "production-readiness-refresh.json") -Raw | ConvertFrom-Json
    if ($strictPolicyReport.policy_max_frontend_bundle_warnings -ne 1) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict frontend bundle warning policy to be reported"
    }
    if ($strictPolicyReport.policy_require_executed_oracle_remediation -ne $true) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict executed-remediation policy to be reported"
    }
    if ($strictPolicyReport.generated_strict_comparison_lane -ne $false) {
        throw "[production-readiness-refresh-pwsh-selftest] expected strict policy run not to generate an additional strict comparison lane"
    }
    if ($strictPolicyReport.artifact_paths.commercial_snapshot -notmatch 'commercial-readiness-snapshot.json$') {
        throw "[production-readiness-refresh-pwsh-selftest] expected refreshed commercial snapshot artifact path under strict policy run"
    }
    if ($strictPolicyReport.artifact_paths.oracle_wal_slot_remediation -notmatch 'oracle-remediate-electric-slot.json$') {
        throw "[production-readiness-refresh-pwsh-selftest] expected refreshed WAL-slot remediation artifact path under strict policy run"
    }
    if ($strictPolicyReport.artifact_paths.oracle_synthetic_cleanup -notmatch 'oracle-prune-synthetic-message-spam.json$') {
        throw "[production-readiness-refresh-pwsh-selftest] expected refreshed synthetic cleanup artifact path under strict policy run"
    }

    Push-Location $tmpRoot
    try {
        $detachedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptCopy -OutDir $outDir -StartDetached 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "[production-readiness-refresh-pwsh-selftest] expected detached refresh launch to pass`n$detachedOutput"
        }
    }
    finally {
        Pop-Location
    }

    $detachedOutputText = $detachedOutput | Out-String
    Assert-Contains -Actual $detachedOutputText -Expected "detached_pid="
    Assert-Contains -Actual $detachedOutputText -Expected "status_file="

    $detachedStatusPath = Join-Path $outDir "production-readiness-refresh-detached.json"
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    $detachedStatus = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $detachedStatusPath) {
            $detachedStatus = Get-Content -LiteralPath $detachedStatusPath -Raw | ConvertFrom-Json
            if ($detachedStatus.status -ne "started" -and (Test-Path -LiteralPath (Join-Path $outDir "production-readiness-refresh.json"))) {
                break
            }
        }
        Start-Sleep -Milliseconds 500
    }
    if ($null -eq $detachedStatus) {
        throw "[production-readiness-refresh-pwsh-selftest] expected detached status manifest at $detachedStatusPath"
    }
    if ($detachedStatus.status -ne "completed") {
        throw "[production-readiness-refresh-pwsh-selftest] expected detached refresh to complete, got status '$($detachedStatus.status)'"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $outDir "production-readiness-refresh.json"))) {
        throw "[production-readiness-refresh-pwsh-selftest] expected detached refresh to write the main report"
    }

    Write-Output "[production-readiness-refresh-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
