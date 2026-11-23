param(
    [string]$EnvFile = "",
    [string]$BackupDir = "",
    [string]$CommercialSnapshotPath = "",
    [string]$OutDir = "",
    [ValidateSet("auto", "always", "never")]
    [string]$ApiFlows = "auto",
    [int]$MaxFrontendBundleWarnings = 2,
    [switch]$RequireExecutedOracleRemediation,
    [switch]$SkipReleaseReadiness,
    [switch]$Enforce
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$detachedOracleProofCurrentCommand = "./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"

if ([string]::IsNullOrWhiteSpace($CommercialSnapshotPath)) {
    $CommercialSnapshotPath = Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-current\commercial-readiness-snapshot.json"
}
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $PSScriptRoot "..\artifacts\production-go-no-go-current"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$releaseOutDir = Join-Path $OutDir "release-readiness"
$steps = New-Object System.Collections.Generic.List[object]

function Add-Step {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )

    $steps.Add([pscustomobject]@{
        name = $Name
        status = $Status
        detail = $Detail
    })
}

function Resolve-ExistingPath {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

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

function Join-CommandSequence {
    param([string[]]$Commands)

    $parts = @($Commands | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($parts.Count -eq 0) {
        return $null
    }
    return ($parts -join " ; ")
}

function Build-OracleFollowThroughCommand {
    param([string]$PrimaryCommand)

    return Join-CommandSequence @(
        $PrimaryCommand
        (
            "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current" +
            " -MaxFrontendBundleWarnings $MaxFrontendBundleWarnings" +
            $(if ($RequireExecutedOracleRemediation) { " -RequireExecutedOracleRemediation" } else { "" })
        )
        (
            "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current" +
            " -MaxFrontendBundleWarnings $MaxFrontendBundleWarnings" +
            $(if ($RequireExecutedOracleRemediation) { " -RequireExecutedOracleRemediation" } else { "" })
        )
    )
}

$releaseSummary = $null
$releaseSummaryPath = $null
if (-not $SkipReleaseReadiness) {
    $releaseOutput = & (Join-Path $PSScriptRoot "release-readiness.ps1") `
        -EnvFile $EnvFile `
        -BackupDir $BackupDir `
        -OutDir $releaseOutDir `
        -ApiFlows $ApiFlows 2>&1
    if (-not $?) {
        throw "[production-go-no-go] release readiness failed`n$releaseOutput"
    }
    $releaseSummaryPath = Join-Path $releaseOutDir "summary.json"
    if (-not (Test-Path -LiteralPath $releaseSummaryPath)) {
        throw "[production-go-no-go] expected release readiness summary at $releaseSummaryPath"
    }
    $releaseSummary = Get-Content -LiteralPath $releaseSummaryPath -Raw | ConvertFrom-Json
    Add-Step -Name "release_readiness" -Status $releaseSummary.status -Detail (($releaseOutput | Out-String).Trim())
} else {
    Add-Step -Name "release_readiness" -Status "skipped" -Detail "release readiness skipped by operator"
}

$resolvedCommercialSnapshotPath = Resolve-ExistingPath -Path $CommercialSnapshotPath
if ([string]::IsNullOrWhiteSpace($resolvedCommercialSnapshotPath)) {
    throw "[production-go-no-go] commercial readiness snapshot not found: $CommercialSnapshotPath"
}
$commercialSnapshot = Get-Content -LiteralPath $resolvedCommercialSnapshotPath -Raw | ConvertFrom-Json
$commercialSnapshotGeneratedAt = if ($null -ne $commercialSnapshot.PSObject.Properties["generated_at"]) { [string]$commercialSnapshot.generated_at } else { $null }
$commercialSnapshotGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $commercialSnapshotGeneratedAt
$commercialSnapshotAge = if ($null -ne $commercialSnapshotGeneratedAtParsed) { ([DateTimeOffset]::UtcNow - $commercialSnapshotGeneratedAtParsed.ToUniversalTime()) } else { $null }
$commercialSnapshotAgeHours = if ($null -ne $commercialSnapshotAge) { [Math]::Round($commercialSnapshotAge.TotalHours, 1) } else { $null }
$commercialSnapshotStale = $null -ne $commercialSnapshotAge -and $commercialSnapshotAge.TotalHours -gt 24
$commercialSnapshotDetailParts = New-Object System.Collections.Generic.List[string]
$commercialSnapshotDetailParts.Add("blockers=" + $commercialSnapshot.commercial_readiness.blocker_count)
if (-not [string]::IsNullOrWhiteSpace($commercialSnapshotGeneratedAt)) {
    $commercialSnapshotDetailParts.Add("generated_at=" + $commercialSnapshotGeneratedAt)
}
if ($null -ne $commercialSnapshotAgeHours) {
    $commercialSnapshotDetailParts.Add("age_hours=" + $commercialSnapshotAgeHours)
}
if ($commercialSnapshotStale) {
    $commercialSnapshotDetailParts.Add("stale=true")
}
Add-Step -Name "commercial_snapshot" -Status $commercialSnapshot.commercial_readiness.status -Detail ($commercialSnapshotDetailParts -join "; ")
$oracleRemediationOutcome = $commercialSnapshot.oracle.remediation_outcome
$commercialSnapshotPolicy = if ($null -ne $commercialSnapshot.PSObject.Properties["policy"]) { $commercialSnapshot.policy } else { $null }
$commercialSnapshotPolicyMaxFrontendBundleWarnings =
    if ($null -ne $commercialSnapshotPolicy -and $null -ne $commercialSnapshotPolicy.PSObject.Properties["max_frontend_bundle_warnings"]) {
        [int]$commercialSnapshotPolicy.max_frontend_bundle_warnings
    } else {
        $null
    }
$commercialSnapshotPolicyAcceptedFrontendBundleWarningCount =
    if ($null -ne $commercialSnapshotPolicy -and $null -ne $commercialSnapshotPolicy.PSObject.Properties["accepted_frontend_bundle_warning_count"] -and $null -ne $commercialSnapshotPolicy.accepted_frontend_bundle_warning_count) {
        [int]$commercialSnapshotPolicy.accepted_frontend_bundle_warning_count
    } else {
        $null
    }
$commercialSnapshotPolicyFrontendBundleThresholdMet =
    if ($null -ne $commercialSnapshotPolicy -and $null -ne $commercialSnapshotPolicy.PSObject.Properties["accepted_frontend_bundle_warning_threshold_met"]) {
        [bool]$commercialSnapshotPolicy.accepted_frontend_bundle_warning_threshold_met
    } else {
        $null
    }
$commercialSnapshotPolicyRequireExecutedOracleRemediation =
    if ($null -ne $commercialSnapshotPolicy -and $null -ne $commercialSnapshotPolicy.PSObject.Properties["require_executed_oracle_remediation"]) {
        [bool]$commercialSnapshotPolicy.require_executed_oracle_remediation
    } else {
        $null
    }
$commercialSnapshotPolicyOracleRemediationExecutionMet =
    if ($null -ne $commercialSnapshotPolicy -and $null -ne $commercialSnapshotPolicy.PSObject.Properties["oracle_remediation_execution_policy_met"]) {
        [bool]$commercialSnapshotPolicy.oracle_remediation_execution_policy_met
    } else {
        $null
    }
$oracleRuntimeRepairRequired = $false
$oracleRuntimeRepairKind = $null
$oracleRuntimeRepairReason = $null
$oracleRuntimeRepairRecommendedAction = $null
$oracleReviewRecommendedAction = $null
$oracleReviewTargetGroup = $null
$oracleReviewTargetKnownSizeGib = $null
$oracleReviewCleanupCommand = $null
$oracleBackupRetentionCleanupCommand = $null
$oracleBackupRetentionGib = $null
$oracleCombinedCleanupCommand = $null
$oracleCandidateCleanupGib = $null
$oraclePostgresWalPressureStatus = $null
$oraclePostgresWalPressureSummary = $null
$oraclePostgresWalPressureRecommendedAction = $null
$oraclePostgresWalSafeLimitRecommendationGib = $null
$oraclePostgresWalGib = $null
$oracleElectricSlotName = $null
$oracleElectricSlotActive = $null
$oracleElectricSlotRetainedWalGib = $null
$oracleRestoreGapGib = $null
$oracleSafeNowCleanupGib = $null
$oracleSafeNowOnlyClearsGap = $null
$oracleSafeNowRemainingGapGib = $null
$oracleCombinedKnownReclaimGib = $null
$oracleFailureStep = $null
$oracleCleanupExecuteAvailable = $false
$oracleCleanupExecuteCurrentWithPlan = $null
$oracleCleanupExecuteStaleRelativeToPlan = $null
$storageOracleSafeCleanupGib = $null
$storageOracleSafeCleanupGroupCount = $null
$storageOracleReviewRequiredGib = $null
$storageOracleReviewRequiredGroupCount = $null
$storageTopOracleSafeCleanupGroup = $null
$storageTopOracleDeletePriorityGroups = @()
$storageOracleSyntheticMessagePressureStatus = $null
$storageOracleSyntheticMessagePressureSummary = $null
$storageOracleSyntheticMessagePressureTotalDupes = $null
$storageOracleSyntheticMessagePressureMaintenanceSummaryDupes = $null
$storageOracleSyntheticMessagePressureCuratorCardDupes = $null
$storageOracleSyntheticMessagePressureCuratorBacklinkDupes = $null
$storageOracleSyntheticMessagePressureIngestionTopologyDupes = $null
$storageOracleSyntheticMessageCleanupMode = $null
$storageOracleSyntheticMessageCleanupCommand = $null
$storageOracleSyntheticMessageCleanupDeletedTotal = $null
$storageOracleSyntheticMessageCleanupBeforeTotalDupes = $null
$storageOracleSyntheticMessageCleanupAfterTotalDupes = $null
$storageOracleOperationalHistoryPressureStatus = $null
$storageOracleOperationalHistoryPressureTotalRows = $null
$storageOracleOperationalHistoryCleanupMode = $null
$storageOracleOperationalHistoryCleanupCommand = $null
$storageOracleOperationalHistoryCleanupFollowThroughCommand = $null
$storageOracleOperationalHistoryCleanupDeletedTotal = $null
$storageOracleOperationalHistoryCleanupBeforeTotalRows = $null
$storageOracleOperationalHistoryCleanupAfterTotalRows = $null
$artifactOracleCleanupExecute = $null
$artifactOracleRemediation = $null
$artifactOracleWalSlotRemediation = $null
$artifactOracleSyntheticCleanup = $null
$artifactOracleOperationalHistoryCleanup = $null
$storageSafeCleanupLead = $null
$oracleSafeNowCleanupCommand = $null
$oraclePhaseTwoCleanupCommand = $null
$staleReadinessArtifacts = New-Object System.Collections.Generic.List[string]
if ($null -ne $commercialSnapshot.oracle) {
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["failure_step"]) {
        $oracleFailureStep = [string]$commercialSnapshot.oracle.failure_step
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["runtime_repair_kind"]) {
        $oracleRuntimeRepairKind = [string]$commercialSnapshot.oracle.runtime_repair_kind
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["runtime_repair_required"]) {
        $oracleRuntimeRepairRequired = [bool]$commercialSnapshot.oracle.runtime_repair_required
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["runtime_repair_reason"]) {
        $oracleRuntimeRepairReason = [string]$commercialSnapshot.oracle.runtime_repair_reason
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["runtime_repair_recommended_action"]) {
        $oracleRuntimeRepairRecommendedAction = [string]$commercialSnapshot.oracle.runtime_repair_recommended_action
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["review_target_recommended_action"]) {
        $oracleReviewRecommendedAction = [string]$commercialSnapshot.oracle.review_target_recommended_action
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["review_target_group"]) {
        $oracleReviewTargetGroup = [string]$commercialSnapshot.oracle.review_target_group
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["review_target_known_size_gib"]) {
        $oracleReviewTargetKnownSizeGib = $commercialSnapshot.oracle.review_target_known_size_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["review_target_cleanup_command"]) {
        $oracleReviewCleanupCommand = [string]$commercialSnapshot.oracle.review_target_cleanup_command
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["restore_capacity_omnyid_backup_retention_gib"]) {
        $oracleBackupRetentionGib = $commercialSnapshot.oracle.restore_capacity_omnyid_backup_retention_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["omnyid_backup_retention_cleanup_command"]) {
        $oracleBackupRetentionCleanupCommand = [string]$commercialSnapshot.oracle.omnyid_backup_retention_cleanup_command
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["combined_retention_and_top_target_cleanup_command"]) {
        $oracleCombinedCleanupCommand = [string]$commercialSnapshot.oracle.combined_retention_and_top_target_cleanup_command
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["cleanup_plan_total_candidate_gib"]) {
        $oracleCandidateCleanupGib = $commercialSnapshot.oracle.cleanup_plan_total_candidate_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_pressure_status"]) {
        $oraclePostgresWalPressureStatus = [string]$commercialSnapshot.oracle.postgres_wal_pressure_status
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_pressure_summary"]) {
        $oraclePostgresWalPressureSummary = [string]$commercialSnapshot.oracle.postgres_wal_pressure_summary
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_pressure_recommended_action"]) {
        $oraclePostgresWalPressureRecommendedAction = [string]$commercialSnapshot.oracle.postgres_wal_pressure_recommended_action
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_safe_limit_recommendation_gib"]) {
        $oraclePostgresWalSafeLimitRecommendationGib = $commercialSnapshot.oracle.postgres_wal_safe_limit_recommendation_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_gib"]) {
        $oraclePostgresWalGib = $commercialSnapshot.oracle.postgres_wal_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["electric_slot_name"]) {
        $oracleElectricSlotName = [string]$commercialSnapshot.oracle.electric_slot_name
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["electric_slot_active"] -and $null -ne $commercialSnapshot.oracle.electric_slot_active) {
        $oracleElectricSlotActive = [bool]$commercialSnapshot.oracle.electric_slot_active
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["electric_slot_retained_wal_gib"]) {
        $oracleElectricSlotRetainedWalGib = $commercialSnapshot.oracle.electric_slot_retained_wal_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["restore_drill_gap_gib"]) {
        $oracleRestoreGapGib = $commercialSnapshot.oracle.restore_drill_gap_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["restore_capacity_safe_now_cleanup_gib"]) {
        $oracleSafeNowCleanupGib = $commercialSnapshot.oracle.restore_capacity_safe_now_cleanup_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["restore_capacity_safe_now_only_clears_gap"]) {
        $oracleSafeNowOnlyClearsGap = [bool]$commercialSnapshot.oracle.restore_capacity_safe_now_only_clears_gap
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["restore_capacity_safe_now_remaining_gap_gib"]) {
        $oracleSafeNowRemainingGapGib = $commercialSnapshot.oracle.restore_capacity_safe_now_remaining_gap_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["restore_capacity_combined_retention_and_top_review_gib"]) {
        $oracleCombinedKnownReclaimGib = $commercialSnapshot.oracle.restore_capacity_combined_retention_and_top_review_gib
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["cleanup_execute_available"]) {
        $oracleCleanupExecuteAvailable = [bool]$commercialSnapshot.oracle.cleanup_execute_available
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["cleanup_execute_current_with_plan"]) {
        $oracleCleanupExecuteCurrentWithPlan = [bool]$commercialSnapshot.oracle.cleanup_execute_current_with_plan
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["cleanup_execute_stale_relative_to_plan"]) {
        $oracleCleanupExecuteStaleRelativeToPlan = [bool]$commercialSnapshot.oracle.cleanup_execute_stale_relative_to_plan
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["safe_now_cleanup_follow_through_command"]) {
        $oracleSafeNowCleanupCommand = [string]$commercialSnapshot.oracle.safe_now_cleanup_follow_through_command
    }
    if ($null -ne $commercialSnapshot.oracle.PSObject.Properties["phase_two_cleanup_execute_hint"]) {
        $oraclePhaseTwoCleanupCommand = [string]$commercialSnapshot.oracle.phase_two_cleanup_execute_hint
    }
}
if ($null -ne $commercialSnapshot.PSObject.Properties["storage"] -and $null -ne $commercialSnapshot.storage) {
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_safe_cleanup_gib"]) {
        $storageOracleSafeCleanupGib = $commercialSnapshot.storage.oracle_safe_cleanup_gib
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_safe_cleanup_group_count"]) {
        $storageOracleSafeCleanupGroupCount = $commercialSnapshot.storage.oracle_safe_cleanup_group_count
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_review_required_gib"]) {
        $storageOracleReviewRequiredGib = $commercialSnapshot.storage.oracle_review_required_gib
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_review_required_group_count"]) {
        $storageOracleReviewRequiredGroupCount = $commercialSnapshot.storage.oracle_review_required_group_count
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["top_oracle_safe_cleanup_group"]) {
        $storageTopOracleSafeCleanupGroup = [string]$commercialSnapshot.storage.top_oracle_safe_cleanup_group
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["top_oracle_delete_priority_groups"]) {
        $storageTopOracleDeletePriorityGroups = @($commercialSnapshot.storage.top_oracle_delete_priority_groups | ForEach-Object { [string]$_ })
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_status"]) {
        $storageOracleSyntheticMessagePressureStatus = [string]$commercialSnapshot.storage.oracle_synthetic_message_pressure_status
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_summary"]) {
        $storageOracleSyntheticMessagePressureSummary = [string]$commercialSnapshot.storage.oracle_synthetic_message_pressure_summary
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_total_dupes"]) {
        $storageOracleSyntheticMessagePressureTotalDupes = $commercialSnapshot.storage.oracle_synthetic_message_pressure_total_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_maintenance_summary_dupes"]) {
        $storageOracleSyntheticMessagePressureMaintenanceSummaryDupes = $commercialSnapshot.storage.oracle_synthetic_message_pressure_maintenance_summary_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_curator_card_dupes"]) {
        $storageOracleSyntheticMessagePressureCuratorCardDupes = $commercialSnapshot.storage.oracle_synthetic_message_pressure_curator_card_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_curator_backlink_dupes"]) {
        $storageOracleSyntheticMessagePressureCuratorBacklinkDupes = $commercialSnapshot.storage.oracle_synthetic_message_pressure_curator_backlink_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_pressure_ingestion_topology_dupes"]) {
        $storageOracleSyntheticMessagePressureIngestionTopologyDupes = $commercialSnapshot.storage.oracle_synthetic_message_pressure_ingestion_topology_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_cleanup_mode"]) {
        $storageOracleSyntheticMessageCleanupMode = [string]$commercialSnapshot.storage.oracle_synthetic_message_cleanup_mode
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_cleanup_command"]) {
        $storageOracleSyntheticMessageCleanupCommand = [string]$commercialSnapshot.storage.oracle_synthetic_message_cleanup_command
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_cleanup_deleted_total"]) {
        $storageOracleSyntheticMessageCleanupDeletedTotal = $commercialSnapshot.storage.oracle_synthetic_message_cleanup_deleted_total
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_cleanup_before_total_dupes"]) {
        $storageOracleSyntheticMessageCleanupBeforeTotalDupes = $commercialSnapshot.storage.oracle_synthetic_message_cleanup_before_total_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_synthetic_message_cleanup_after_total_dupes"]) {
        $storageOracleSyntheticMessageCleanupAfterTotalDupes = $commercialSnapshot.storage.oracle_synthetic_message_cleanup_after_total_dupes
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["operational_history_pressure_status"]) {
        $storageOracleOperationalHistoryPressureStatus = [string]$commercialSnapshot.storage.operational_history_pressure_status
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["operational_history_pressure_total_rows"]) {
        $storageOracleOperationalHistoryPressureTotalRows = $commercialSnapshot.storage.operational_history_pressure_total_rows
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_operational_history_cleanup_mode"]) {
        $storageOracleOperationalHistoryCleanupMode = [string]$commercialSnapshot.storage.oracle_operational_history_cleanup_mode
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_operational_history_cleanup_command"]) {
        $storageOracleOperationalHistoryCleanupCommand = [string]$commercialSnapshot.storage.oracle_operational_history_cleanup_command
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_operational_history_cleanup_follow_through_command"]) {
        $storageOracleOperationalHistoryCleanupFollowThroughCommand = [string]$commercialSnapshot.storage.oracle_operational_history_cleanup_follow_through_command
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_operational_history_cleanup_deleted_total"]) {
        $storageOracleOperationalHistoryCleanupDeletedTotal = $commercialSnapshot.storage.oracle_operational_history_cleanup_deleted_total
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_operational_history_cleanup_before_total_rows"]) {
        $storageOracleOperationalHistoryCleanupBeforeTotalRows = $commercialSnapshot.storage.oracle_operational_history_cleanup_before_total_rows
    }
    if ($null -ne $commercialSnapshot.storage.PSObject.Properties["oracle_operational_history_cleanup_after_total_rows"]) {
        $storageOracleOperationalHistoryCleanupAfterTotalRows = $commercialSnapshot.storage.oracle_operational_history_cleanup_after_total_rows
    }
}
if ($null -ne $commercialSnapshot.PSObject.Properties["artifact_paths"] -and $null -ne $commercialSnapshot.artifact_paths) {
    if ($null -ne $commercialSnapshot.artifact_paths.PSObject.Properties["oracle_cleanup_execute"]) {
        $artifactOracleCleanupExecute = [string]$commercialSnapshot.artifact_paths.oracle_cleanup_execute
    }
    if ($null -ne $commercialSnapshot.artifact_paths.PSObject.Properties["oracle_remediation"]) {
        $artifactOracleRemediation = [string]$commercialSnapshot.artifact_paths.oracle_remediation
    }
    if ($null -ne $commercialSnapshot.artifact_paths.PSObject.Properties["oracle_wal_slot_remediation"]) {
        $artifactOracleWalSlotRemediation = [string]$commercialSnapshot.artifact_paths.oracle_wal_slot_remediation
    }
    if ($null -ne $commercialSnapshot.artifact_paths.PSObject.Properties["oracle_synthetic_cleanup"]) {
        $artifactOracleSyntheticCleanup = [string]$commercialSnapshot.artifact_paths.oracle_synthetic_cleanup
    }
    if ($null -ne $commercialSnapshot.artifact_paths.PSObject.Properties["oracle_operational_history_cleanup"]) {
        $artifactOracleOperationalHistoryCleanup = [string]$commercialSnapshot.artifact_paths.oracle_operational_history_cleanup
    }
}
if (
    -not [string]::IsNullOrWhiteSpace($storageTopOracleSafeCleanupGroup) -and
    $null -ne $storageOracleSafeCleanupGib -and
    [double]$storageOracleSafeCleanupGib -gt 0
) {
    $storageSafeCleanupLead = "safe-now Oracle cleanup ('$storageTopOracleSafeCleanupGroup', about $storageOracleSafeCleanupGib GiB)"
}
$operationalHistoryCleanupRequired =
    $storageOracleOperationalHistoryPressureStatus -eq "operational_history_present" -and
    $null -ne $storageOracleOperationalHistoryPressureTotalRows -and
    [int64]$storageOracleOperationalHistoryPressureTotalRows -ge 10000 -and
    $storageOracleOperationalHistoryCleanupMode -ne "executed"
if (
    $null -ne $commercialSnapshot.PSObject.Properties["artifact_freshness"] -and
    $null -ne $commercialSnapshot.artifact_freshness -and
    $null -ne $commercialSnapshot.artifact_freshness.PSObject.Properties["stale_artifact_names"]
) {
    foreach ($artifactName in @($commercialSnapshot.artifact_freshness.stale_artifact_names)) {
        if ($null -eq $artifactName) {
            continue
        }
        $artifactNameText = [string]$artifactName
        if (-not [string]::IsNullOrWhiteSpace($artifactNameText)) {
            $staleReadinessArtifacts.Add($artifactNameText)
        }
    }
}
if (
    [string]::IsNullOrWhiteSpace($oracleRuntimeRepairKind) -and
    $oracleRuntimeRepairRequired -and
    -not [string]::IsNullOrWhiteSpace($oracleRuntimeRepairRecommendedAction) -and
    $oracleRuntimeRepairRecommendedAction -match 'IncludeReviewTargetCleanup'
) {
    $oracleRuntimeRepairKind = "targeted_cleanup"
}
if (
    [string]::IsNullOrWhiteSpace($oracleRuntimeRepairKind) -and
    $oracleRuntimeRepairRequired -and
    -not [string]::IsNullOrWhiteSpace($oracleRuntimeRepairRecommendedAction) -and
    $oracleRuntimeRepairRecommendedAction -match 'deploy-oracle\.ps1'
) {
    $oracleRuntimeRepairKind = "redeploy"
}
if (-not [string]::IsNullOrWhiteSpace([string]$oracleRemediationOutcome)) {
    Add-Step -Name "oracle_remediation" -Status $oracleRemediationOutcome -Detail (
        "cleanup_mode=" + $commercialSnapshot.oracle.remediation_cleanup_mode +
        "; root_use_delta_pct=" + $commercialSnapshot.oracle.remediation_root_use_delta_pct
    )
}

$blockers = New-Object System.Collections.Generic.List[string]
if ($null -ne $releaseSummary -and $releaseSummary.status -ne "pass") {
    $blockers.Add("release readiness status is '$($releaseSummary.status)'")
}
if ($commercialSnapshotStale) {
    $blockers.Add("commercial readiness snapshot is stale: generated at '$commercialSnapshotGeneratedAt' and about $commercialSnapshotAgeHours hours old")
}
if ($commercialSnapshot.commercial_readiness.status -ne "ready") {
    foreach ($blocker in @($commercialSnapshot.commercial_readiness.blockers)) {
        $blockers.Add([string]$blocker)
        $staleArtifactMatch = [regex]::Match([string]$blocker, "^readiness artifact '([^']+)' is stale$")
        if ($staleArtifactMatch.Success) {
            $artifactNameText = [string]$staleArtifactMatch.Groups[1].Value
            if ($artifactNameText -notin @($staleReadinessArtifacts)) {
                $staleReadinessArtifacts.Add($artifactNameText)
            }
        }
    }
}

$status = if ($blockers.Count -eq 0) { "go" } else { "no_go" }
$nextActionSummary =
    if ($status -eq "go") {
        "Promotion can proceed."
    } elseif ($commercialSnapshotStale) {
        "Refresh readiness artifacts and rerun the commercial gate before acting on older evidence."
    } elseif ($staleReadinessArtifacts.Count -gt 0) {
        "Refresh stale readiness artifacts and rerun the commercial gate before acting on stale Oracle or personalOS evidence."
    } elseif ($oracleCleanupExecuteAvailable -and $oracleCleanupExecuteCurrentWithPlan -eq $false) {
        "Refresh the Oracle cleanup execution preview so its commands match the current cleanup plan before relying on cached preview output."
    } elseif (
        $operationalHistoryCleanupRequired -and
        (
            -not [string]::IsNullOrWhiteSpace($storageOracleOperationalHistoryCleanupFollowThroughCommand) -or
            -not [string]::IsNullOrWhiteSpace($storageOracleOperationalHistoryCleanupCommand)
        )
    ) {
        "Oracle bounded operational-history cleanup and commercial gate refresh are the current gate."
    } elseif ($oracleRuntimeRepairRequired) {
        if ($oracleRuntimeRepairKind -eq "redeploy") {
            "Oracle cleanup, redeploy, and proof recheck are the current gate."
        } elseif ($oracleRuntimeRepairKind -eq "postgres_wal_slot") {
            "Oracle WAL-slot remediation and proof recheck are the current gate."
        } elseif ($oracleRuntimeRepairKind -eq "targeted_cleanup") {
            "Oracle targeted cleanup and proof recheck are the current gate."
        } elseif ($oracleRuntimeRepairKind -eq "review_target_cleanup") {
            "Oracle review-target cleanup and proof recheck are the current gate."
        } else {
            "Oracle cleanup and proof recheck are the current gate."
        }
    } elseif ($oracleRemediationOutcome -eq "combined_review_cleanup_required") {
        if (-not [string]::IsNullOrWhiteSpace($storageSafeCleanupLead)) {
            "Oracle $storageSafeCleanupLead plus combined backup-retention and review-target cleanup is the current gate."
        } else {
            "Oracle combined backup-retention and review-target cleanup is the current gate."
        }
    } elseif ($oracleRemediationOutcome -eq "backup_retention_cleanup_required") {
        "Oracle backup-retention cleanup and proof recheck are the current gate."
    } elseif ($oracleRemediationOutcome -eq "top_review_cleanup_required") {
        "Oracle top review-target cleanup and proof recheck are the current gate."
    } elseif (
        $oracleFailureStep -eq "disk_capacity" -and
        -not [string]::IsNullOrWhiteSpace([string]$oracleReviewRecommendedAction)
    ) {
        if (-not [string]::IsNullOrWhiteSpace($oracleReviewTargetGroup)) {
            "Oracle disk pressure requires review-class cleanup for '$oracleReviewTargetGroup' before promotion."
        } else {
            "Oracle disk pressure requires review-class cleanup before promotion."
        }
    } elseif ($null -ne $releaseSummary -and $releaseSummary.status -ne "pass") {
        "Local release readiness must pass before promotion."
    } else {
        "Resolve the recorded blockers before promotion."
    }
$nextActionCommand =
    if ($commercialSnapshotStale) {
        "./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh-current"
    } elseif ($staleReadinessArtifacts.Count -gt 0) {
        "./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh-current -RefreshOracleProof -RefreshOracleInventory -RefreshOracleRemediation"
    } elseif ($oracleCleanupExecuteAvailable -and $oracleCleanupExecuteCurrentWithPlan -eq $false) {
        Join-CommandSequence @(
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current" +
                $(if ($oracleRemediationOutcome -eq "combined_review_cleanup_required") { " -IncludeCombinedReviewCleanup" } elseif ($oracleRemediationOutcome -eq "backup_retention_cleanup_required") { " -IncludeBackupRetentionCleanup" } elseif ($oracleRuntimeRepairKind -eq "targeted_cleanup" -or $oracleRuntimeRepairKind -eq "review_target_cleanup" -or $oracleRemediationOutcome -eq "top_review_cleanup_required") { " -IncludeReviewTargetCleanup" } else { "" })
            "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current"
            "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
        )
    } elseif (
        $operationalHistoryCleanupRequired -and
        -not [string]::IsNullOrWhiteSpace($storageOracleOperationalHistoryCleanupFollowThroughCommand)
    ) {
        $storageOracleOperationalHistoryCleanupFollowThroughCommand
    } elseif ($operationalHistoryCleanupRequired -and -not [string]::IsNullOrWhiteSpace($storageOracleOperationalHistoryCleanupCommand)) {
        Build-OracleFollowThroughCommand -PrimaryCommand $storageOracleOperationalHistoryCleanupCommand
    } elseif ($oracleRuntimeRepairRequired -and -not [string]::IsNullOrWhiteSpace($oracleRuntimeRepairRecommendedAction)) {
        Build-OracleFollowThroughCommand -PrimaryCommand $oracleRuntimeRepairRecommendedAction
    } elseif (
        $oracleRemediationOutcome -eq "combined_review_cleanup_required" -and
        -not [string]::IsNullOrWhiteSpace($oracleCombinedCleanupCommand)
    ) {
        Build-OracleFollowThroughCommand -PrimaryCommand (Join-CommandSequence @(
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeCombinedReviewCleanup -Execute"
            $detachedOracleProofCurrentCommand
        ))
    } elseif (
        $oracleRemediationOutcome -eq "backup_retention_cleanup_required" -and
        -not [string]::IsNullOrWhiteSpace($oracleBackupRetentionCleanupCommand)
    ) {
        Build-OracleFollowThroughCommand -PrimaryCommand (Join-CommandSequence @(
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeBackupRetentionCleanup -Execute"
            $detachedOracleProofCurrentCommand
        ))
    } elseif (
        $oracleRemediationOutcome -eq "top_review_cleanup_required" -and
        -not [string]::IsNullOrWhiteSpace($oracleReviewCleanupCommand)
    ) {
        Build-OracleFollowThroughCommand -PrimaryCommand (Join-CommandSequence @(
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute"
            $detachedOracleProofCurrentCommand
        ))
    } elseif (
        $oracleFailureStep -eq "disk_capacity" -and
        -not [string]::IsNullOrWhiteSpace([string]$oracleReviewCleanupCommand)
    ) {
        Build-OracleFollowThroughCommand -PrimaryCommand (Join-CommandSequence @(
            $oracleReviewCleanupCommand
            $detachedOracleProofCurrentCommand
        ))
    } elseif (
        $oracleFailureStep -eq "disk_capacity" -and
        -not [string]::IsNullOrWhiteSpace([string]$oracleReviewRecommendedAction)
    ) {
        $oracleReviewRecommendedAction
    } else {
        $null
    }
$safeNowActionSummary =
    if (
        -not [string]::IsNullOrWhiteSpace($oracleSafeNowCleanupCommand) -and
        -not [string]::IsNullOrWhiteSpace($storageSafeCleanupLead) -and
        $oracleSafeNowOnlyClearsGap -eq $false -and
        $null -ne $oracleSafeNowRemainingGapGib
    ) {
        "Run $storageSafeCleanupLead, then rerun proof and refresh the commercial gate; this phase alone still leaves about $oracleSafeNowRemainingGapGib GiB of restore-gap pressure if estimates hold."
    } elseif (-not [string]::IsNullOrWhiteSpace($oracleSafeNowCleanupCommand) -and -not [string]::IsNullOrWhiteSpace($storageSafeCleanupLead)) {
        "Run $storageSafeCleanupLead, then rerun proof and refresh the commercial gate."
    } elseif ($oracleRuntimeRepairKind -eq "postgres_wal_slot" -and -not [string]::IsNullOrWhiteSpace($oracleSafeNowCleanupCommand)) {
        if (-not [string]::IsNullOrWhiteSpace($oracleElectricSlotName) -and $null -ne $oracleElectricSlotRetainedWalGib) {
            "Run the Oracle WAL-slot remediation phase for '$oracleElectricSlotName' (about $oracleElectricSlotRetainedWalGib GiB retained), then rerun proof and refresh the commercial gate."
        } else {
            "Run the Oracle WAL-slot remediation phase, then rerun proof and refresh the commercial gate."
        }
    } elseif (-not [string]::IsNullOrWhiteSpace($oracleSafeNowCleanupCommand)) {
        "Run the safe-now Oracle cleanup phase, then rerun proof and refresh the commercial gate."
    } else {
        $null
    }
$phaseTwoActionSummary =
    if ($oracleRemediationOutcome -eq "combined_review_cleanup_required" -and -not [string]::IsNullOrWhiteSpace($oraclePhaseTwoCleanupCommand)) {
        "If the restore gap remains after the safe-now pass, run the combined backup-retention and review-target cleanup path."
    } elseif ($oracleRemediationOutcome -eq "backup_retention_cleanup_required" -and -not [string]::IsNullOrWhiteSpace($oraclePhaseTwoCleanupCommand)) {
        "If the restore gap remains after the safe-now pass, run the backup-retention cleanup path."
    } elseif ($oracleRemediationOutcome -eq "top_review_cleanup_required" -and -not [string]::IsNullOrWhiteSpace($oraclePhaseTwoCleanupCommand)) {
        "If the restore gap remains after the safe-now pass, run the top review-target cleanup path."
    } else {
        $null
    }

$report = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    status = $status
    blocker_count = $blockers.Count
    blockers = @($blockers)
    env_file = $EnvFile
    backup_dir = $BackupDir
    commercial_snapshot_path = $resolvedCommercialSnapshotPath
    commercial_snapshot_generated_at = $commercialSnapshotGeneratedAt
    commercial_snapshot_age_hours = $commercialSnapshotAgeHours
    commercial_snapshot_stale = $commercialSnapshotStale
    policy_max_frontend_bundle_warnings = $MaxFrontendBundleWarnings
    policy_require_executed_oracle_remediation = [bool]$RequireExecutedOracleRemediation
    commercial_snapshot_policy_max_frontend_bundle_warnings = $commercialSnapshotPolicyMaxFrontendBundleWarnings
    commercial_snapshot_policy_accepted_frontend_bundle_warning_count = $commercialSnapshotPolicyAcceptedFrontendBundleWarningCount
    commercial_snapshot_policy_frontend_bundle_threshold_met = $commercialSnapshotPolicyFrontendBundleThresholdMet
    commercial_snapshot_policy_require_executed_oracle_remediation = $commercialSnapshotPolicyRequireExecutedOracleRemediation
    commercial_snapshot_policy_oracle_remediation_execution_met = $commercialSnapshotPolicyOracleRemediationExecutionMet
    stale_readiness_artifacts = @($staleReadinessArtifacts)
    oracle_remediation_outcome = $oracleRemediationOutcome
    oracle_runtime_repair_kind = $oracleRuntimeRepairKind
    oracle_runtime_repair_required = $oracleRuntimeRepairRequired
    oracle_runtime_repair_reason = $oracleRuntimeRepairReason
    oracle_postgres_wal_pressure_status = $oraclePostgresWalPressureStatus
    oracle_postgres_wal_pressure_summary = $oraclePostgresWalPressureSummary
    oracle_postgres_wal_pressure_recommended_action = $oraclePostgresWalPressureRecommendedAction
    oracle_postgres_wal_safe_limit_recommendation_gib = $oraclePostgresWalSafeLimitRecommendationGib
    oracle_postgres_wal_gib = $oraclePostgresWalGib
    oracle_electric_slot_name = $oracleElectricSlotName
    oracle_electric_slot_active = $oracleElectricSlotActive
    oracle_electric_slot_retained_wal_gib = $oracleElectricSlotRetainedWalGib
    oracle_restore_gap_gib = $oracleRestoreGapGib
    oracle_safe_now_cleanup_gib = $oracleSafeNowCleanupGib
    oracle_safe_now_only_clears_gap = $oracleSafeNowOnlyClearsGap
    oracle_safe_now_remaining_gap_gib = $oracleSafeNowRemainingGapGib
    oracle_candidate_cleanup_gib = $oracleCandidateCleanupGib
    oracle_review_target_group = $oracleReviewTargetGroup
    oracle_review_target_known_size_gib = $oracleReviewTargetKnownSizeGib
    oracle_backup_retention_gib = $oracleBackupRetentionGib
    oracle_combined_known_reclaim_gib = $oracleCombinedKnownReclaimGib
    oracle_cleanup_execute_available = $oracleCleanupExecuteAvailable
    oracle_cleanup_execute_current_with_plan = $oracleCleanupExecuteCurrentWithPlan
    oracle_cleanup_execute_stale_relative_to_plan = $oracleCleanupExecuteStaleRelativeToPlan
    storage_oracle_safe_cleanup_gib = $storageOracleSafeCleanupGib
    storage_oracle_safe_cleanup_group_count = $storageOracleSafeCleanupGroupCount
    storage_oracle_review_required_gib = $storageOracleReviewRequiredGib
    storage_oracle_review_required_group_count = $storageOracleReviewRequiredGroupCount
    storage_top_oracle_safe_cleanup_group = $storageTopOracleSafeCleanupGroup
    storage_top_oracle_delete_priority_groups = @($storageTopOracleDeletePriorityGroups)
    storage_oracle_synthetic_message_pressure_status = $storageOracleSyntheticMessagePressureStatus
    storage_oracle_synthetic_message_pressure_summary = $storageOracleSyntheticMessagePressureSummary
    storage_oracle_synthetic_message_pressure_total_dupes = $storageOracleSyntheticMessagePressureTotalDupes
    storage_oracle_synthetic_message_pressure_maintenance_summary_dupes = $storageOracleSyntheticMessagePressureMaintenanceSummaryDupes
    storage_oracle_synthetic_message_pressure_curator_card_dupes = $storageOracleSyntheticMessagePressureCuratorCardDupes
    storage_oracle_synthetic_message_pressure_curator_backlink_dupes = $storageOracleSyntheticMessagePressureCuratorBacklinkDupes
    storage_oracle_synthetic_message_pressure_ingestion_topology_dupes = $storageOracleSyntheticMessagePressureIngestionTopologyDupes
    storage_oracle_synthetic_message_cleanup_mode = $storageOracleSyntheticMessageCleanupMode
    storage_oracle_synthetic_message_cleanup_command = $storageOracleSyntheticMessageCleanupCommand
    storage_oracle_synthetic_message_cleanup_deleted_total = $storageOracleSyntheticMessageCleanupDeletedTotal
    storage_oracle_synthetic_message_cleanup_before_total_dupes = $storageOracleSyntheticMessageCleanupBeforeTotalDupes
    storage_oracle_synthetic_message_cleanup_after_total_dupes = $storageOracleSyntheticMessageCleanupAfterTotalDupes
    storage_oracle_operational_history_pressure_status = $storageOracleOperationalHistoryPressureStatus
    storage_oracle_operational_history_pressure_total_rows = $storageOracleOperationalHistoryPressureTotalRows
    storage_oracle_operational_history_cleanup_mode = $storageOracleOperationalHistoryCleanupMode
    storage_oracle_operational_history_cleanup_command = $storageOracleOperationalHistoryCleanupCommand
    storage_oracle_operational_history_cleanup_follow_through_command = $storageOracleOperationalHistoryCleanupFollowThroughCommand
    storage_oracle_operational_history_cleanup_deleted_total = $storageOracleOperationalHistoryCleanupDeletedTotal
    storage_oracle_operational_history_cleanup_before_total_rows = $storageOracleOperationalHistoryCleanupBeforeTotalRows
    storage_oracle_operational_history_cleanup_after_total_rows = $storageOracleOperationalHistoryCleanupAfterTotalRows
    artifact_oracle_cleanup_execute = $artifactOracleCleanupExecute
    artifact_oracle_remediation = $artifactOracleRemediation
    artifact_oracle_wal_slot_remediation = $artifactOracleWalSlotRemediation
    artifact_oracle_synthetic_cleanup = $artifactOracleSyntheticCleanup
    artifact_oracle_operational_history_cleanup = $artifactOracleOperationalHistoryCleanup
    storage_safe_cleanup_lead = $storageSafeCleanupLead
    safe_now_action_summary = $safeNowActionSummary
    safe_now_action_command = $oracleSafeNowCleanupCommand
    phase_two_action_summary = $phaseTwoActionSummary
    phase_two_action_command = $oraclePhaseTwoCleanupCommand
    next_action_summary = $nextActionSummary
    next_action_command = $nextActionCommand
    release_readiness_path = if (-not [string]::IsNullOrWhiteSpace($releaseSummaryPath)) { Resolve-ExistingPath -Path $releaseSummaryPath } else { $null }
    steps = @($steps.ToArray())
}

$report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "production-go-no-go.json")

$markdown = New-Object System.Text.StringBuilder
[void]$markdown.AppendLine("# Production Go/No-Go")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
[void]$markdown.AppendLine("- status: $($report.status)")
[void]$markdown.AppendLine("- blocker_count: $($report.blocker_count)")
[void]$markdown.AppendLine("- commercial_snapshot_path: $($report.commercial_snapshot_path)")
[void]$markdown.AppendLine("- commercial_snapshot_generated_at: $($report.commercial_snapshot_generated_at)")
[void]$markdown.AppendLine("- commercial_snapshot_age_hours: $($report.commercial_snapshot_age_hours)")
[void]$markdown.AppendLine("- commercial_snapshot_stale: $($report.commercial_snapshot_stale)")
[void]$markdown.AppendLine("- policy_max_frontend_bundle_warnings: $($report.policy_max_frontend_bundle_warnings)")
[void]$markdown.AppendLine("- policy_require_executed_oracle_remediation: $($report.policy_require_executed_oracle_remediation)")
[void]$markdown.AppendLine("- commercial_snapshot_policy_max_frontend_bundle_warnings: $($report.commercial_snapshot_policy_max_frontend_bundle_warnings)")
[void]$markdown.AppendLine("- commercial_snapshot_policy_accepted_frontend_bundle_warning_count: $($report.commercial_snapshot_policy_accepted_frontend_bundle_warning_count)")
[void]$markdown.AppendLine("- commercial_snapshot_policy_frontend_bundle_threshold_met: $($report.commercial_snapshot_policy_frontend_bundle_threshold_met)")
[void]$markdown.AppendLine("- commercial_snapshot_policy_require_executed_oracle_remediation: $($report.commercial_snapshot_policy_require_executed_oracle_remediation)")
[void]$markdown.AppendLine("- commercial_snapshot_policy_oracle_remediation_execution_met: $($report.commercial_snapshot_policy_oracle_remediation_execution_met)")
[void]$markdown.AppendLine("- stale_readiness_artifacts: $(@($report.stale_readiness_artifacts) -join ', ')")
[void]$markdown.AppendLine("- oracle_remediation_outcome: $($report.oracle_remediation_outcome)")
[void]$markdown.AppendLine("- oracle_runtime_repair_kind: $($report.oracle_runtime_repair_kind)")
[void]$markdown.AppendLine("- oracle_runtime_repair_required: $($report.oracle_runtime_repair_required)")
[void]$markdown.AppendLine("- oracle_runtime_repair_reason: $($report.oracle_runtime_repair_reason)")
[void]$markdown.AppendLine("- oracle_postgres_wal_pressure_status: $($report.oracle_postgres_wal_pressure_status)")
[void]$markdown.AppendLine("- oracle_postgres_wal_pressure_summary: $($report.oracle_postgres_wal_pressure_summary)")
[void]$markdown.AppendLine("- oracle_postgres_wal_pressure_recommended_action: $($report.oracle_postgres_wal_pressure_recommended_action)")
[void]$markdown.AppendLine("- oracle_postgres_wal_safe_limit_recommendation_gib: $($report.oracle_postgres_wal_safe_limit_recommendation_gib)")
[void]$markdown.AppendLine("- oracle_postgres_wal_gib: $($report.oracle_postgres_wal_gib)")
[void]$markdown.AppendLine("- oracle_electric_slot_name: $($report.oracle_electric_slot_name)")
[void]$markdown.AppendLine("- oracle_electric_slot_active: $($report.oracle_electric_slot_active)")
[void]$markdown.AppendLine("- oracle_electric_slot_retained_wal_gib: $($report.oracle_electric_slot_retained_wal_gib)")
[void]$markdown.AppendLine("- oracle_restore_gap_gib: $($report.oracle_restore_gap_gib)")
[void]$markdown.AppendLine("- oracle_safe_now_cleanup_gib: $($report.oracle_safe_now_cleanup_gib)")
[void]$markdown.AppendLine("- oracle_safe_now_only_clears_gap: $($report.oracle_safe_now_only_clears_gap)")
[void]$markdown.AppendLine("- oracle_safe_now_remaining_gap_gib: $($report.oracle_safe_now_remaining_gap_gib)")
[void]$markdown.AppendLine("- oracle_candidate_cleanup_gib: $($report.oracle_candidate_cleanup_gib)")
[void]$markdown.AppendLine("- oracle_review_target_group: $($report.oracle_review_target_group)")
[void]$markdown.AppendLine("- oracle_review_target_known_size_gib: $($report.oracle_review_target_known_size_gib)")
[void]$markdown.AppendLine("- oracle_backup_retention_gib: $($report.oracle_backup_retention_gib)")
[void]$markdown.AppendLine("- oracle_combined_known_reclaim_gib: $($report.oracle_combined_known_reclaim_gib)")
[void]$markdown.AppendLine("- oracle_cleanup_execute_available: $($report.oracle_cleanup_execute_available)")
[void]$markdown.AppendLine("- oracle_cleanup_execute_current_with_plan: $($report.oracle_cleanup_execute_current_with_plan)")
[void]$markdown.AppendLine("- oracle_cleanup_execute_stale_relative_to_plan: $($report.oracle_cleanup_execute_stale_relative_to_plan)")
[void]$markdown.AppendLine("- storage_oracle_safe_cleanup_gib: $($report.storage_oracle_safe_cleanup_gib)")
[void]$markdown.AppendLine("- storage_oracle_safe_cleanup_group_count: $($report.storage_oracle_safe_cleanup_group_count)")
[void]$markdown.AppendLine("- storage_oracle_review_required_gib: $($report.storage_oracle_review_required_gib)")
[void]$markdown.AppendLine("- storage_oracle_review_required_group_count: $($report.storage_oracle_review_required_group_count)")
[void]$markdown.AppendLine("- storage_top_oracle_safe_cleanup_group: $($report.storage_top_oracle_safe_cleanup_group)")
[void]$markdown.AppendLine("- storage_top_oracle_delete_priority_groups: $(@($report.storage_top_oracle_delete_priority_groups) -join ', ')")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_status: $($report.storage_oracle_synthetic_message_pressure_status)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_summary: $($report.storage_oracle_synthetic_message_pressure_summary)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_total_dupes: $($report.storage_oracle_synthetic_message_pressure_total_dupes)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_maintenance_summary_dupes: $($report.storage_oracle_synthetic_message_pressure_maintenance_summary_dupes)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_curator_card_dupes: $($report.storage_oracle_synthetic_message_pressure_curator_card_dupes)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_curator_backlink_dupes: $($report.storage_oracle_synthetic_message_pressure_curator_backlink_dupes)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_ingestion_topology_dupes: $($report.storage_oracle_synthetic_message_pressure_ingestion_topology_dupes)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_mode: $($report.storage_oracle_synthetic_message_cleanup_mode)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_command: $($report.storage_oracle_synthetic_message_cleanup_command)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_deleted_total: $($report.storage_oracle_synthetic_message_cleanup_deleted_total)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_before_total_dupes: $($report.storage_oracle_synthetic_message_cleanup_before_total_dupes)")
[void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_after_total_dupes: $($report.storage_oracle_synthetic_message_cleanup_after_total_dupes)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_pressure_status: $($report.storage_oracle_operational_history_pressure_status)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_pressure_total_rows: $($report.storage_oracle_operational_history_pressure_total_rows)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_mode: $($report.storage_oracle_operational_history_cleanup_mode)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_command: $($report.storage_oracle_operational_history_cleanup_command)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_follow_through_command: $($report.storage_oracle_operational_history_cleanup_follow_through_command)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_deleted_total: $($report.storage_oracle_operational_history_cleanup_deleted_total)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_before_total_rows: $($report.storage_oracle_operational_history_cleanup_before_total_rows)")
[void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_after_total_rows: $($report.storage_oracle_operational_history_cleanup_after_total_rows)")
[void]$markdown.AppendLine("- artifact_oracle_cleanup_execute: $($report.artifact_oracle_cleanup_execute)")
[void]$markdown.AppendLine("- artifact_oracle_remediation: $($report.artifact_oracle_remediation)")
[void]$markdown.AppendLine("- artifact_oracle_wal_slot_remediation: $($report.artifact_oracle_wal_slot_remediation)")
[void]$markdown.AppendLine("- artifact_oracle_synthetic_cleanup: $($report.artifact_oracle_synthetic_cleanup)")
[void]$markdown.AppendLine("- artifact_oracle_operational_history_cleanup: $($report.artifact_oracle_operational_history_cleanup)")
[void]$markdown.AppendLine("- storage_safe_cleanup_lead: $($report.storage_safe_cleanup_lead)")
[void]$markdown.AppendLine("- safe_now_action_summary: $($report.safe_now_action_summary)")
[void]$markdown.AppendLine("- safe_now_action_command: $($report.safe_now_action_command)")
[void]$markdown.AppendLine("- phase_two_action_summary: $($report.phase_two_action_summary)")
[void]$markdown.AppendLine("- phase_two_action_command: $($report.phase_two_action_command)")
[void]$markdown.AppendLine("- next_action_summary: $($report.next_action_summary)")
[void]$markdown.AppendLine("- next_action_command: $($report.next_action_command)")
[void]$markdown.AppendLine("- release_readiness_path: $($report.release_readiness_path)")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Blockers")
[void]$markdown.AppendLine()
foreach ($blocker in $report.blockers) {
    [void]$markdown.AppendLine("- $blocker")
}
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Steps")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("| step | status | detail |")
[void]$markdown.AppendLine("|---|---|---|")
foreach ($step in $report.steps) {
    $detail = ($step.detail -replace '\r?\n', ' ') -replace '\|', '\|'
    [void]$markdown.AppendLine("| $($step.name) | $($step.status) | $detail |")
}
$markdown.ToString() | Set-Content (Join-Path $OutDir "production-go-no-go.md")

Write-Output "[production-go-no-go] status=$status blockers=$($blockers.Count)"

if ($Enforce -and $status -ne "go") {
    exit 1
}
