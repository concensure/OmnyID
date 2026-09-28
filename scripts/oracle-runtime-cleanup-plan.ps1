param(
    [string]$InventoryPath = "",
    [string]$OutDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$detachedOracleProofCurrentCommand = "./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"

function Convert-SizeStringToGiB {
    param(
        [AllowNull()]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $trimmed = $Value.Trim()
    if ($trimmed -match '^\d+(?:\.\d+)?$') {
        return [double]$trimmed
    }
    if ($trimmed -notmatch '^(?<number>\d+(?:\.\d+)?)\s*(?<unit>[KMGT]B?|B)$') {
        return $null
    }

    $number = [double]$Matches["number"]
    $unit = $Matches["unit"].ToUpperInvariant()
    switch ($unit) {
        "B" { return [math]::Round($number / 1GB, 6) }
        "K" { return [math]::Round($number / 1MB, 6) }
        "KB" { return [math]::Round($number / 1MB, 6) }
        "M" { return [math]::Round($number / 1KB, 6) }
        "MB" { return [math]::Round($number / 1KB, 6) }
        "G" { return [math]::Round($number, 6) }
        "GB" { return [math]::Round($number, 6) }
        "T" { return [math]::Round($number * 1024, 6) }
        "TB" { return [math]::Round($number * 1024, 6) }
        default { return $null }
    }
}

function Convert-PercentStringToInt {
    param(
        [AllowNull()]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $trimmed = $Value.Trim()
    if ($trimmed -notmatch '^(?<number>\d+)\%$') {
        return $null
    }

    return [int]$Matches["number"]
}

function Get-OptionalStringProperty {
    param(
        [object]$Object,
        [string]$PropertyName
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$PropertyName]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $null
    }

    $value = [string]$property.Value
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $null
    }

    return $value
}

function Get-OptionalDoubleProperty {
    param(
        [object]$Object,
        [string]$PropertyName
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$PropertyName]
    if ($null -eq $property -or $null -eq $property.Value -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
        return $null
    }

    return [double]$property.Value
}

function Join-NonEmptyCommands {
    param(
        [AllowEmptyCollection()]
        [string[]]$Commands
    )

    $parts = @($Commands | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if (@($parts).Count -eq 0) {
        return ""
    }

    return ($parts -join " ; ")
}

if ([string]::IsNullOrWhiteSpace($InventoryPath)) {
    $InventoryPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-inventory-current\oracle-runtime-inventory.json"
}

if (-not (Test-Path -LiteralPath $InventoryPath)) {
    throw "[oracle-runtime-cleanup-plan] inventory file not found: $InventoryPath"
}

$inventory = Get-Content -LiteralPath $InventoryPath -Raw | ConvertFrom-Json
$items = @($inventory.items)
$candidateItems = @($items | Where-Object { $_.cleanup_class -eq "candidate_cleanup" })
$candidateContainers = @($candidateItems | Where-Object { $_.item_type -eq "container" } | Sort-Object -Property name)
$candidateVolumes = @($candidateItems | Where-Object { $_.item_type -eq "volume" } | Sort-Object -Property name)
$candidateImages = @($candidateItems | Where-Object { $_.item_type -eq "image" } | Sort-Object -Property name)
$reviewItems = @($items | Where-Object { $_.cleanup_class -eq "review" } | Sort-Object -Property item_type, name)
$inventoryOwnershipGroups =
    if ($null -ne $inventory.PSObject.Properties["ownership_groups"]) {
        @($inventory.ownership_groups)
    } else {
        @()
    }
$runtimeScripts = $inventory.PSObject.Properties["runtime_scripts"]
$runtimeScriptStatus = if ($null -ne $runtimeScripts -and $null -ne $runtimeScripts.Value) { [string]$runtimeScripts.Value.status } else { "" }
$runtimeScriptDetail = if ($null -ne $runtimeScripts -and $null -ne $runtimeScripts.Value) { [string]$runtimeScripts.Value.detail } else { "" }
$missingRuntimeScripts =
    if ($null -ne $runtimeScripts -and $null -ne $runtimeScripts.Value) {
        [string[]]@($runtimeScripts.Value.missing_scripts | ForEach-Object { [string]$_ })
    } else {
        [string[]]@()
    }
$runtimeRepairRequired = @($missingRuntimeScripts).Count -gt 0
$runtimeRepairBlocksBackupVerify = @($missingRuntimeScripts | Where-Object { $_ -eq "scripts/omnyid-backup-verify.sh" }).Count -gt 0
$runtimeRepairBlocksRestoreDrill =
    $runtimeRepairBlocksBackupVerify -or
    (@($missingRuntimeScripts | Where-Object { $_ -eq "scripts/omnyid-restore-drill.sh" }).Count -gt 0)
$runtimeRepairReason =
    if ($runtimeRepairRequired) {
        "remote runtime is missing required scripts and should be redeployed from the staged runtime bundle before backup verification and restore-drill results are treated as authoritative"
    } else {
        ""
    }
$runtimeRepairRecommendedAction =
    if ($runtimeRepairRequired) {
        "./scripts/deploy-oracle.ps1 -EnvFile <path-to-.env.oracle> after cleanup to restage the required runtime scripts"
    } else {
        ""
    }
$classificationModeProperty = $inventory.PSObject.Properties["classification_mode"]
$classificationMode = if ($null -ne $classificationModeProperty -and $null -ne $classificationModeProperty.Value) {
    [string]$classificationModeProperty.Value
} else {
    ""
}
$diskRows = @($inventory.disk)
$rootDisk = @($diskRows | Where-Object { $_.mount -eq "/" } | Select-Object -First 1)
$rootDiskSizeGiB = if ($rootDisk.Count -gt 0) { Convert-SizeStringToGiB -Value ([string]$rootDisk[0].size) } else { $null }
$rootDiskAvailGiB = if ($rootDisk.Count -gt 0) { Convert-SizeStringToGiB -Value ([string]$rootDisk[0].avail) } else { $null }
$rootDiskUsePct = if ($rootDisk.Count -gt 0) { Convert-PercentStringToInt -Value ([string]$rootDisk[0].use_pct) } else { $null }
$dockerImageReclaimableGiBProperty = $inventory.counts.PSObject.Properties["docker_image_reclaimable_gib"]
$dockerBuildCacheReclaimableGiBProperty = $inventory.counts.PSObject.Properties["docker_build_cache_reclaimable_gib"]
$dockerLocalVolumeReclaimableGiBProperty = $inventory.counts.PSObject.Properties["docker_local_volume_reclaimable_gib"]
$dockerImageReclaimableGiB = if ($null -ne $dockerImageReclaimableGiBProperty) { [double]$dockerImageReclaimableGiBProperty.Value } else { $null }
$dockerBuildCacheReclaimableGiB = if ($null -ne $dockerBuildCacheReclaimableGiBProperty) { [double]$dockerBuildCacheReclaimableGiBProperty.Value } else { $null }
$dockerLocalVolumeReclaimableGiB = if ($null -ne $dockerLocalVolumeReclaimableGiBProperty) { [double]$dockerLocalVolumeReclaimableGiBProperty.Value } else { $null }
$postgresRuntimeProperty = $inventory.PSObject.Properties["postgres_runtime"]
$postgresRuntime = if ($null -ne $postgresRuntimeProperty -and $null -ne $postgresRuntimeProperty.Value) { $postgresRuntimeProperty.Value } else { $null }
$syntheticMessagesProperty = $inventory.PSObject.Properties["synthetic_messages"]
$syntheticMessages = if ($null -ne $syntheticMessagesProperty -and $null -ne $syntheticMessagesProperty.Value) { $syntheticMessagesProperty.Value } else { $null }
$postgresContainerName = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "postgres_container_name"
$electricContainerName = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "electric_container_name"
$pgWalGiB = Get-OptionalDoubleProperty -Object $postgresRuntime -PropertyName "pg_wal_gib"
$maxSlotWalKeepSize = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "max_slot_wal_keep_size"
$walKeepSize = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "wal_keep_size"
$electricSlotStatus = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "electric_slot_status"
$electricSlotSummary = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "electric_slot_summary"
$electricSlotName = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "electric_slot_name"
$electricSlotRestartLsn = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "electric_slot_restart_lsn"
$electricSlotConfirmedFlushLsn = Get-OptionalStringProperty -Object $postgresRuntime -PropertyName "electric_slot_confirmed_flush_lsn"
$electricSlotRetainedWalGiB = Get-OptionalDoubleProperty -Object $postgresRuntime -PropertyName "electric_slot_retained_wal_gib"
$electricSlotActive =
    if ($null -ne $postgresRuntime -and $null -ne $postgresRuntime.PSObject.Properties["electric_slot_active"]) {
        [bool]$postgresRuntime.electric_slot_active
    } else {
        $null
    }
$syntheticMessageStatus = Get-OptionalStringProperty -Object $syntheticMessages -PropertyName "status"
$syntheticMessageSummary = Get-OptionalStringProperty -Object $syntheticMessages -PropertyName "summary"
$syntheticMessageMaintenanceSummaryDupes = Get-OptionalDoubleProperty -Object $syntheticMessages -PropertyName "maintenance_summary_dupes"
$syntheticMessageCuratorCardDupes = Get-OptionalDoubleProperty -Object $syntheticMessages -PropertyName "curator_card_dupes"
$syntheticMessageCuratorBacklinkDupes = Get-OptionalDoubleProperty -Object $syntheticMessages -PropertyName "curator_backlink_dupes"
$syntheticMessageIngestionTopologyDupes = Get-OptionalDoubleProperty -Object $syntheticMessages -PropertyName "ingestion_topology_dupes"
$syntheticMessageTotalDupes = Get-OptionalDoubleProperty -Object $syntheticMessages -PropertyName "total_dupes"
$syntheticMessagePruneCommand = Get-OptionalStringProperty -Object $syntheticMessages -PropertyName "prune_command"
$operationalHistory = if ($null -ne $inventory -and $null -ne $inventory.PSObject.Properties["operational_history"]) { $inventory.operational_history } else { $null }
$operationalHistoryStatus = Get-OptionalStringProperty -Object $operationalHistory -PropertyName "status"
$operationalHistorySummary = Get-OptionalStringProperty -Object $operationalHistory -PropertyName "summary"
$operationalHistoryTotalRows = Get-OptionalDoubleProperty -Object $operationalHistory -PropertyName "total_rows"
$operationalHistoryPruneCommand = Get-OptionalStringProperty -Object $operationalHistory -PropertyName "prune_command"
$walCapRecommendationGiB =
    if ($null -ne $rootDiskAvailGiB) {
        [math]::Max(2, [math]::Min(8, [math]::Floor($rootDiskAvailGiB / 2)))
    } else {
        4
    }
$slotInspectCommand =
    if (-not [string]::IsNullOrWhiteSpace($postgresContainerName)) {
        "docker exec $postgresContainerName psql -v ON_ERROR_STOP=1 -U `"`${POSTGRES_USER}`" -d `"`${POSTGRES_DB}`" -c `"SELECT slot_name, active, wal_status, restart_lsn, confirmed_flush_lsn, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal FROM pg_replication_slots ORDER BY slot_name;`""
    } else {
        ""
    }
$slotDropCommand =
    if (-not [string]::IsNullOrWhiteSpace($postgresContainerName) -and -not [string]::IsNullOrWhiteSpace($electricSlotName)) {
        "docker exec $postgresContainerName psql -v ON_ERROR_STOP=1 -U `"`${POSTGRES_USER}`" -d `"`${POSTGRES_DB}`" -c `"SELECT pg_drop_replication_slot('$electricSlotName');`""
    } else {
        ""
    }
$slotLimitCommand =
    if (-not [string]::IsNullOrWhiteSpace($postgresContainerName)) {
        "docker exec $postgresContainerName psql -v ON_ERROR_STOP=1 -U `"`${POSTGRES_USER}`" -d `"`${POSTGRES_DB}`" -c `"ALTER SYSTEM SET max_slot_wal_keep_size = '$walCapRecommendationGiB" + "GB'; SELECT pg_reload_conf();`""
    } else {
        ""
    }
$electricRestartCommand =
    if (-not [string]::IsNullOrWhiteSpace($electricContainerName)) {
        "docker restart $electricContainerName"
    } else {
        ""
    }
$walRemediationRestartAndLimitCommand = "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -RestartElectric -ApplyWalLimit -Execute"
$walRemediationDropAndLimitCommand = "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath <cleanup-plan.json> -DropSlot -ApplyWalLimit -CheckpointAfterDrop -Execute"
$postgresWalPressureStatus = "none"
$postgresWalPressureSummary = ""
$postgresWalPressureRecommendedAction = ""
if (-not [string]::IsNullOrWhiteSpace($electricSlotStatus)) {
    switch ($electricSlotStatus) {
        "inactive_unbounded_wal_retention" {
            $postgresWalPressureStatus = "inactive_electric_slot_unbounded"
            $postgresWalPressureSummary =
                if (-not [string]::IsNullOrWhiteSpace($electricSlotSummary)) {
                    $electricSlotSummary
                } else {
                    "Electric replication slot '$electricSlotName' is inactive and retaining WAL without a configured cap."
                }
            $postgresWalPressureRecommendedAction = "Do not delete files from pg_wal manually. If Electric should still be consuming, restart '$electricContainerName' and verify the slot advances after a real write. If the slot is abandoned, drop '$electricSlotName'. In either case, set max_slot_wal_keep_size to about $walCapRecommendationGiB GB so slot-retained WAL cannot grow without bound."
        }
        "inactive_wal_retention" {
            $postgresWalPressureStatus = "inactive_electric_slot_retaining_wal"
            $postgresWalPressureSummary =
                if (-not [string]::IsNullOrWhiteSpace($electricSlotSummary)) {
                    $electricSlotSummary
                } else {
                    "Electric replication slot '$electricSlotName' is inactive and retaining WAL."
                }
            $postgresWalPressureRecommendedAction = "Do not delete files from pg_wal manually. Restore the intended Electric consumer or drop the abandoned slot, and keep max_slot_wal_keep_size bounded."
        }
        "active" {
            $postgresWalPressureStatus = "healthy"
            $postgresWalPressureSummary =
                if (-not [string]::IsNullOrWhiteSpace($electricSlotSummary)) {
                    $electricSlotSummary
                } else {
                    "Electric replication slot '$electricSlotName' is active."
                }
        }
        default {
            $postgresWalPressureStatus = $electricSlotStatus
            $postgresWalPressureSummary = $electricSlotSummary
        }
    }
}

$candidateImageMeasurement = @($candidateImages | Where-Object { $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
$candidateVolumeMeasurement = @($candidateVolumes | Where-Object { $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
$candidateHostItems = @($candidateItems | Where-Object { $_.item_type -notin @("container", "volume", "image") } | Sort-Object -Property name)
$candidateHostMeasurement = @($candidateHostItems | Where-Object { $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
$candidateImageSum = if ($candidateImageMeasurement.Count -gt 0 -and $null -ne $candidateImageMeasurement[0].Sum) {
    [double]$candidateImageMeasurement[0].Sum
} else {
    0
}
$candidateVolumeSum = if ($candidateVolumeMeasurement.Count -gt 0 -and $null -ne $candidateVolumeMeasurement[0].Sum) {
    [double]$candidateVolumeMeasurement[0].Sum
} else {
    0
}
$candidateHostSum = if ($candidateHostMeasurement.Count -gt 0 -and $null -ne $candidateHostMeasurement[0].Sum) {
    [double]$candidateHostMeasurement[0].Sum
} else {
    0
}
$imageGiB = [math]::Round($candidateImageSum, 6)
$volumeGiB = [math]::Round($candidateVolumeSum, 6)
$hostGiB = [math]::Round($candidateHostSum, 6)
$safeImageReclaimGiB = $candidateImageSum
$safeVolumeReclaimGiB =
    if ($null -ne $dockerLocalVolumeReclaimableGiB) {
        [math]::Min($candidateVolumeSum, $dockerLocalVolumeReclaimableGiB)
    } else {
        $candidateVolumeSum
    }
$safeHostReclaimGiB = $candidateHostSum
$safeBuildCacheReclaimGiB = if ($null -ne $dockerBuildCacheReclaimableGiB) { $dockerBuildCacheReclaimableGiB } else { 0 }
$totalEstimatedReclaimGiB = [math]::Round(($safeImageReclaimGiB + $safeVolumeReclaimGiB + $safeHostReclaimGiB + $safeBuildCacheReclaimGiB), 6)
$projectedRootAvailGiB =
    if ($null -ne $rootDiskAvailGiB) {
        [math]::Round(($rootDiskAvailGiB + $totalEstimatedReclaimGiB), 6)
    } else {
        $null
    }
$projectedRootUsePct =
    if ($null -ne $rootDiskSizeGiB -and $rootDiskSizeGiB -gt 0 -and $null -ne $projectedRootAvailGiB) {
        [int][math]::Round((($rootDiskSizeGiB - $projectedRootAvailGiB) / $rootDiskSizeGiB) * 100, 0)
    } else {
        $null
    }
$pressureStatus =
    if ($null -eq $rootDiskUsePct) {
        "unknown"
    } elseif ($rootDiskUsePct -ge 98) {
        "critical"
    } elseif ($rootDiskUsePct -ge 95 -and ($null -eq $projectedRootUsePct -or $projectedRootUsePct -ge 95)) {
        "candidate_cleanup_unlikely_to_clear_pressure"
    } elseif ($null -ne $projectedRootUsePct -and $projectedRootUsePct -le 92) {
        "candidate_cleanup_likely_sufficient_for_retest"
    } elseif ($null -ne $projectedRootUsePct -and $projectedRootUsePct -le 95) {
        "candidate_cleanup_may_help_but_needs_remeasurement"
    } else {
        "disk_pressure_present"
    }
$pressureSummary =
    if ($null -eq $rootDiskUsePct) {
        "inventory does not contain a parseable root disk snapshot"
    } elseif ($null -eq $projectedRootUsePct) {
        "root filesystem is at $rootDiskUsePct% use; candidate cleanup may reclaim $totalEstimatedReclaimGiB GiB but projected usage could not be estimated from the inventory size fields"
    } else {
        "root filesystem is at $rootDiskUsePct% use with $($rootDisk[0].avail) free; candidate cleanup may reclaim $totalEstimatedReclaimGiB GiB and project root usage to about $projectedRootUsePct%"
    }
$pressureRecommendedAction =
    if ($pressureStatus -eq "candidate_cleanup_unlikely_to_clear_pressure") {
        "execute the candidate cleanup, then review the remaining review-class Supabase and legacy resources because the current reclaim estimate is probably insufficient"
    } elseif ($pressureStatus -eq "critical") {
        "do not redeploy until cleanup is executed and disk is remeasured"
    } elseif ($pressureStatus -eq "candidate_cleanup_likely_sufficient_for_retest" -or $pressureStatus -eq "candidate_cleanup_may_help_but_needs_remeasurement") {
        "execute the candidate cleanup and rerun inventory and production proof before any deployment decision"
    } else {
        ""
    }
$oracleRepairKind = "none"
$oracleRepairRequired = $false
$oracleRepairReason = ""
$oracleRepairRecommendedAction = ""
$oracleRepairBlocksBackupVerify = $false
$oracleRepairBlocksRestoreDrill = $false
if ($runtimeRepairRequired) {
    $oracleRepairKind = "redeploy"
    $oracleRepairRequired = $true
    $oracleRepairReason = $runtimeRepairReason
    $oracleRepairRecommendedAction = $runtimeRepairRecommendedAction
    $oracleRepairBlocksBackupVerify = $runtimeRepairBlocksBackupVerify
    $oracleRepairBlocksRestoreDrill = $runtimeRepairBlocksRestoreDrill
}
$reviewTargetSummaries = @(
    $inventoryOwnershipGroups |
        Where-Object {
            $reviewCount = Get-OptionalDoubleProperty -Object $_ -PropertyName "review_count"
            $ownershipGroup = Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group"
            $null -ne $reviewCount -and $reviewCount -gt 0 -and $ownershipGroup -ne "omnyid_runtime"
        } |
        Sort-Object -Property @{ Expression = { Get-OptionalDoubleProperty -Object $_ -PropertyName "known_size_gib" }; Descending = $true }, @{ Expression = { Get-OptionalDoubleProperty -Object $_ -PropertyName "review_count" }; Descending = $true } |
        ForEach-Object {
            $ownershipGroup = Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group"
            $groupOwnedItems = @(
                $items | Where-Object {
                    (Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group") -eq $ownershipGroup -and
                    (Get-OptionalStringProperty -Object $_ -PropertyName "cleanup_class") -ne "keep_runtime"
                }
            )
            $groupReviewItems = @($reviewItems | Where-Object { (Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group") -eq $ownershipGroup })
            $containerNames = @($groupOwnedItems | Where-Object { $_.item_type -eq "container" } | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            $volumeNames = @($groupOwnedItems | Where-Object { $_.item_type -eq "volume" } | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            $imageNames = @($groupOwnedItems | Where-Object { $_.item_type -eq "image" } | ForEach-Object { [string]$_.name } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            $topNames = @($groupOwnedItems | Select-Object -First 5 | ForEach-Object { [string]$_.name })
            $reviewCount = [int](Get-OptionalDoubleProperty -Object $_ -PropertyName "review_count")
            $knownSizeGiB = Get-OptionalDoubleProperty -Object $_ -PropertyName "known_size_gib"
            $groupAction =
                switch ($ownershipGroup) {
                    "shared_host_supabase" { "review whether the Supabase stack is still required on this Oracle host; if not, stop and remove its containers and volumes before retrying restore drill" }
                    "shared_host_coolify" { "review whether Coolify state should remain on this Oracle host; if not, remove the idle review-class volumes after external confirmation" }
                    "shared_host_n8n" { "review whether n8n data should remain on this Oracle host; if not, archive or relocate it before deletion" }
                    "other_review" { "review miscellaneous non-OmnyID resources individually before cleanup" }
                    default { "review this non-runtime group before cleanup" }
                }
            [pscustomobject]@{
                ownership_group = $ownershipGroup
                review_count = $reviewCount
                known_size_gib = $knownSizeGiB
                top_item_names = $topNames
                stop_and_remove_containers = if ($containerNames.Count -gt 0) { "docker rm -f " + ($containerNames -join " ") } else { "" }
                remove_volumes = if ($volumeNames.Count -gt 0) { "docker volume rm " + ($volumeNames -join " ") } else { "" }
                remove_images = if ($imageNames.Count -gt 0) { "docker image rm " + ($imageNames -join " ") } else { "" }
                recommended_action = $groupAction
            }
        }
)
$topReviewTarget = @($reviewTargetSummaries | Select-Object -First 1)
$reviewRecommendedAction =
    if ($topReviewTarget.Count -gt 0) {
        "top non-runtime review target is '$($topReviewTarget[0].ownership_group)' with about $($topReviewTarget[0].known_size_gib) GiB of known size across $($topReviewTarget[0].review_count) review-class items; $($topReviewTarget[0].recommended_action)"
    } else {
        ""
    }
$topReviewTargetCleanupCommands =
    if ($topReviewTarget.Count -gt 0) {
        @(
            @(
                $topReviewTarget[0].stop_and_remove_containers,
                $topReviewTarget[0].remove_volumes,
                $topReviewTarget[0].remove_images
            ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        )
    } else {
        @()
    }
$topReviewTargetCleanupCommand =
    if (@($topReviewTargetCleanupCommands).Count -gt 0) {
        $topReviewTargetCleanupCommands -join " ; "
    } else {
        ""
    }
$omnyIdBackupRetentionTarget = @($reviewTargetSummaries | Where-Object { $_.ownership_group -eq "omnyid_backup_retention" } | Select-Object -First 1)
$omnyIdBackupRetentionCleanupCommand =
    if ($omnyIdBackupRetentionTarget.Count -gt 0) {
        'sudo bash -lc ''set -euo pipefail; backup_root=/var/backups/omnyid; latest=$(sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort | tail -n 1); if [ -z "$latest" ]; then echo no backup generations found under "$backup_root"; exit 0; fi; sudo find "$backup_root" -mindepth 1 -maxdepth 1 -type d ! -name "$latest" -exec rm -rf -- {} +'''
    } else {
        ""
    }
$hostCleanupCommands = @(
    $candidateHostItems |
        ForEach-Object {
            switch ([string]$_.name) {
                "system_journal" { "sudo journalctl --vacuum-time=7d" }
                default { $null }
            }
        } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        Select-Object -Unique
)
$hostCleanupCommand =
    if (@($hostCleanupCommands).Count -gt 0) {
        $hostCleanupCommands -join " ; "
    } else {
        ""
    }
$combinedReviewRetentionAndTopTargetCleanupCommand =
    Join-NonEmptyCommands -Commands @(
        $omnyIdBackupRetentionCleanupCommand,
        $topReviewTargetCleanupCommand
    )
if (
    -not $runtimeRepairRequired -and
    $postgresWalPressureStatus -eq "inactive_electric_slot_unbounded"
) {
    $oracleRepairKind = "postgres_wal_slot"
    $oracleRepairRequired = $true
    $oracleRepairReason = $postgresWalPressureSummary
    $oracleRepairRecommendedAction = "$walRemediationRestartAndLimitCommand ; if the slot remains inactive and restart_lsn does not advance after a real write, run $walRemediationDropAndLimitCommand ; rerun the detached proof afterward."
    $oracleRepairBlocksBackupVerify = $true
    $oracleRepairBlocksRestoreDrill = $true
} elseif (
    -not $runtimeRepairRequired -and
    $null -ne $rootDiskUsePct -and $rootDiskUsePct -ge 98 -and
    $null -ne $projectedRootUsePct -and $projectedRootUsePct -lt $rootDiskUsePct -and
    $candidateItems.Count -gt 0
) {
    $oracleRepairKind = if ($classificationMode -eq "targeted_ownership_cleanup_enabled") { "targeted_cleanup" } else { "cleanup" }
    $oracleRepairRequired = $true
    $oracleRepairReason = "remote root filesystem is saturated and the cleanup plan projects root usage down to about $projectedRootUsePct% after candidate cleanup"
    $oracleRepairRecommendedAction =
        if ($oracleRepairKind -eq "targeted_cleanup") {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; $detachedOracleProofCurrentCommand"
        } else {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; $detachedOracleProofCurrentCommand"
        }
    $oracleRepairBlocksBackupVerify = $true
    $oracleRepairBlocksRestoreDrill = $true
} elseif (
    -not $runtimeRepairRequired -and
    $null -ne $rootDiskUsePct -and $rootDiskUsePct -ge 98 -and
    $null -ne $projectedRootUsePct -and $projectedRootUsePct -ge $rootDiskUsePct -and
    -not [string]::IsNullOrWhiteSpace($topReviewTargetCleanupCommand) -and
    $topReviewTarget.Count -gt 0
) {
    $oracleRepairKind = "review_target_cleanup"
    $oracleRepairRequired = $true
    $oracleRepairReason = "remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure, and the top review target '$($topReviewTarget[0].ownership_group)' carries about $($topReviewTarget[0].known_size_gib) GiB of known reclaimable scope that must be reviewed before proof can pass"
    $oracleRepairRecommendedAction = "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath <cleanup-plan.json> -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; $detachedOracleProofCurrentCommand"
    $oracleRepairBlocksBackupVerify = $true
    $oracleRepairBlocksRestoreDrill = $true
}

$plan = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    inventory_path = (Resolve-Path $InventoryPath).Path
    remote_host = $inventory.remote_host
    classification_mode = $classificationMode
    counts = [pscustomobject]@{
        candidate_containers = $candidateContainers.Count
        candidate_volumes = $candidateVolumes.Count
        candidate_images = $candidateImages.Count
        candidate_host_items = $candidateHostItems.Count
        review_items = $reviewItems.Count
    }
    estimated_reclaim = [pscustomobject]@{
        candidate_image_gib = $imageGiB
        candidate_volume_gib = $volumeGiB
        candidate_host_gib = $hostGiB
        docker_image_reclaimable_gib = $dockerImageReclaimableGiB
        docker_build_cache_reclaimable_gib = $dockerBuildCacheReclaimableGiB
        docker_local_volume_reclaimable_gib = $dockerLocalVolumeReclaimableGiB
        total_candidate_gib = $totalEstimatedReclaimGiB
        note = "Total candidate reclaim includes safe classified Docker cleanup items, safe host maintenance cleanup items, and build cache. Docker system df image reclaimable is recorded separately because it may include shared layers behind active images."
    }
    postgres_wal_pressure = [pscustomobject]@{
        postgres_container_name = $postgresContainerName
        electric_container_name = $electricContainerName
        pg_wal_gib = $pgWalGiB
        max_slot_wal_keep_size = $maxSlotWalKeepSize
        wal_keep_size = $walKeepSize
        electric_slot_name = $electricSlotName
        electric_slot_active = $electricSlotActive
        electric_slot_retained_wal_gib = $electricSlotRetainedWalGiB
        electric_slot_restart_lsn = $electricSlotRestartLsn
        electric_slot_confirmed_flush_lsn = $electricSlotConfirmedFlushLsn
        status = $postgresWalPressureStatus
        summary = $postgresWalPressureSummary
        recommended_action = $postgresWalPressureRecommendedAction
        safe_limit_recommendation_gib = $walCapRecommendationGiB
        slot_inspect_command = $slotInspectCommand
        electric_restart_command = $electricRestartCommand
        slot_drop_command = $slotDropCommand
        slot_limit_command = $slotLimitCommand
        remediation_restart_and_limit_command = $walRemediationRestartAndLimitCommand
        remediation_drop_and_limit_command = $walRemediationDropAndLimitCommand
    }
    disk_pressure = [pscustomobject]@{
        root_mount = if ($rootDisk.Count -gt 0) { [string]$rootDisk[0].mount } else { "" }
        root_size = if ($rootDisk.Count -gt 0) { [string]$rootDisk[0].size } else { "" }
        root_used = if ($rootDisk.Count -gt 0) { [string]$rootDisk[0].used } else { "" }
        root_avail = if ($rootDisk.Count -gt 0) { [string]$rootDisk[0].avail } else { "" }
        root_use_pct = if ($rootDisk.Count -gt 0) { [string]$rootDisk[0].use_pct } else { "" }
        root_size_gib = $rootDiskSizeGiB
        root_avail_gib = $rootDiskAvailGiB
        root_use_pct_int = $rootDiskUsePct
        projected_root_avail_gib_after_candidate_cleanup = $projectedRootAvailGiB
        projected_root_use_pct_after_candidate_cleanup = $projectedRootUsePct
        status = $pressureStatus
        summary = $pressureSummary
        recommended_action = $pressureRecommendedAction
    }
    review_pressure = [pscustomobject]@{
        total_review_items = $reviewItems.Count
        review_target_count = @($reviewTargetSummaries).Count
        top_target_group = if ($topReviewTarget.Count -gt 0) { $topReviewTarget[0].ownership_group } else { "" }
        top_target_known_size_gib = if ($topReviewTarget.Count -gt 0) { $topReviewTarget[0].known_size_gib } else { $null }
        top_target_review_count = if ($topReviewTarget.Count -gt 0) { $topReviewTarget[0].review_count } else { $null }
        omnyid_backup_retention_known_size_gib = if ($omnyIdBackupRetentionTarget.Count -gt 0) { $omnyIdBackupRetentionTarget[0].known_size_gib } else { $null }
        recommended_action = $reviewRecommendedAction
        top_target_cleanup_command = $topReviewTargetCleanupCommand
        omnyid_backup_retention_cleanup_command = $omnyIdBackupRetentionCleanupCommand
        combined_retention_and_top_target_cleanup_command = $combinedReviewRetentionAndTopTargetCleanupCommand
    }
    synthetic_message_pressure = [pscustomobject]@{
        status = $syntheticMessageStatus
        summary = $syntheticMessageSummary
        maintenance_summary_dupes = $syntheticMessageMaintenanceSummaryDupes
        curator_card_dupes = $syntheticMessageCuratorCardDupes
        curator_backlink_dupes = $syntheticMessageCuratorBacklinkDupes
        ingestion_topology_dupes = $syntheticMessageIngestionTopologyDupes
        total_dupes = $syntheticMessageTotalDupes
        prune_command = if (-not [string]::IsNullOrWhiteSpace($syntheticMessagePruneCommand)) { $syntheticMessagePruneCommand } else { "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze" }
        recommended_action =
            if ($null -ne $syntheticMessageTotalDupes -and $syntheticMessageTotalDupes -gt 0) {
                "Synthetic snapshot-like duplicate rows are present. Prune historical duplicates, then keep these writers bounded to one current row per selector."
            } elseif (-not [string]::IsNullOrWhiteSpace($syntheticMessageStatus)) {
                "Synthetic snapshot-like messages appear bounded."
            } else {
                ""
            }
    }
    operational_history_pressure = [pscustomobject]@{
        status = $operationalHistoryStatus
        summary = $operationalHistorySummary
        total_rows = $operationalHistoryTotalRows
        prune_command = if (-not [string]::IsNullOrWhiteSpace($operationalHistoryPruneCommand)) { $operationalHistoryPruneCommand } else { "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze" }
        recommended_action =
            if ($null -ne $operationalHistoryTotalRows -and $operationalHistoryTotalRows -gt 0) {
                "Bounded machine-generated operational histories are present. Prune historical rows on a rolling basis so these tables behave like capped logs instead of unbounded archives."
            } elseif (-not [string]::IsNullOrWhiteSpace($operationalHistoryStatus)) {
                "Operational history looks bounded."
            } else {
                ""
            }
    }
    runtime_scripts = [pscustomobject]@{
        status = $runtimeScriptStatus
        detail = $runtimeScriptDetail
        missing_scripts = [string[]]@($missingRuntimeScripts)
    }
    runtime_repair = [pscustomobject]@{
        required = $runtimeRepairRequired
        reason = $runtimeRepairReason
        missing_scripts = [string[]]@($missingRuntimeScripts)
        blocks_backup_verify = $runtimeRepairBlocksBackupVerify
        blocks_restore_drill = $runtimeRepairBlocksRestoreDrill
        recommended_action = $runtimeRepairRecommendedAction
    }
    oracle_repair = [pscustomobject]@{
        kind = $oracleRepairKind
        required = $oracleRepairRequired
        reason = $oracleRepairReason
        blocks_backup_verify = $oracleRepairBlocksBackupVerify
        blocks_restore_drill = $oracleRepairBlocksRestoreDrill
        recommended_action = $oracleRepairRecommendedAction
    }
    commands = [pscustomobject]@{
        stop_and_remove_containers = if ($candidateContainers.Count -gt 0) {
            "docker rm -f " + (($candidateContainers | ForEach-Object { $_.name }) -join " ")
        } else { "" }
        remove_images = if ($candidateImages.Count -gt 0) {
            "docker image rm " + (($candidateImages | ForEach-Object { $_.name }) -join " ")
        } else { "" }
        prune_images = "docker image prune -af"
        prune_builder_cache = "docker builder prune -af"
        remove_volumes = if ($candidateVolumes.Count -gt 0) {
            "docker volume rm " + (($candidateVolumes | ForEach-Object { $_.name }) -join " ")
        } else { "" }
        host_cleanup = $hostCleanupCommand
        prune_unused = "docker system prune -f"
        review_target_cleanup = $topReviewTargetCleanupCommand
        omnyid_backup_retention_cleanup = $omnyIdBackupRetentionCleanupCommand
        combined_retention_and_top_target_cleanup = $combinedReviewRetentionAndTopTargetCleanupCommand
        prune_synthetic_messages = if (-not [string]::IsNullOrWhiteSpace($syntheticMessagePruneCommand)) { $syntheticMessagePruneCommand } else { "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze" }
        prune_operational_history = if (-not [string]::IsNullOrWhiteSpace($operationalHistoryPruneCommand)) { $operationalHistoryPruneCommand } else { "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze" }
        inspect_replication_slots = $slotInspectCommand
        restart_electric = $electricRestartCommand
        drop_electric_slot = $slotDropCommand
        limit_slot_wal = $slotLimitCommand
        remediate_electric_slot_restart_and_limit = $walRemediationRestartAndLimitCommand
        remediate_electric_slot_drop_and_limit = $walRemediationDropAndLimitCommand
    }
    candidate_items = $candidateItems
    review_targets = $reviewTargetSummaries
    review_items = $reviewItems
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $plan | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-plan.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# Oracle Runtime Cleanup Plan")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- generated_at: $($plan.generated_at)")
    [void]$markdown.AppendLine("- inventory_path: $($plan.inventory_path)")
    [void]$markdown.AppendLine("- remote_host: $($plan.remote_host)")
    [void]$markdown.AppendLine("- classification_mode: $($plan.classification_mode)")
    [void]$markdown.AppendLine("- candidate_containers: $($plan.counts.candidate_containers)")
    [void]$markdown.AppendLine("- candidate_volumes: $($plan.counts.candidate_volumes)")
    [void]$markdown.AppendLine("- candidate_images: $($plan.counts.candidate_images)")
    [void]$markdown.AppendLine("- candidate_host_items: $($plan.counts.candidate_host_items)")
    [void]$markdown.AppendLine("- review_items: $($plan.counts.review_items)")
    [void]$markdown.AppendLine("- estimated_candidate_image_gib: $($plan.estimated_reclaim.candidate_image_gib)")
    [void]$markdown.AppendLine("- estimated_candidate_volume_gib: $($plan.estimated_reclaim.candidate_volume_gib)")
    [void]$markdown.AppendLine("- estimated_candidate_host_gib: $($plan.estimated_reclaim.candidate_host_gib)")
    [void]$markdown.AppendLine("- docker_image_reclaimable_gib: $($plan.estimated_reclaim.docker_image_reclaimable_gib)")
    [void]$markdown.AppendLine("- docker_build_cache_reclaimable_gib: $($plan.estimated_reclaim.docker_build_cache_reclaimable_gib)")
    [void]$markdown.AppendLine("- docker_local_volume_reclaimable_gib: $($plan.estimated_reclaim.docker_local_volume_reclaimable_gib)")
    [void]$markdown.AppendLine("- estimated_total_candidate_gib: $($plan.estimated_reclaim.total_candidate_gib)")
    [void]$markdown.AppendLine("- pg_wal_gib: $($plan.postgres_wal_pressure.pg_wal_gib)")
    [void]$markdown.AppendLine("- max_slot_wal_keep_size: $($plan.postgres_wal_pressure.max_slot_wal_keep_size)")
    [void]$markdown.AppendLine("- wal_keep_size: $($plan.postgres_wal_pressure.wal_keep_size)")
    [void]$markdown.AppendLine("- electric_slot_name: $($plan.postgres_wal_pressure.electric_slot_name)")
    [void]$markdown.AppendLine("- electric_slot_active: $($plan.postgres_wal_pressure.electric_slot_active)")
    [void]$markdown.AppendLine("- electric_slot_retained_wal_gib: $($plan.postgres_wal_pressure.electric_slot_retained_wal_gib)")
    [void]$markdown.AppendLine("- electric_slot_restart_lsn: $($plan.postgres_wal_pressure.electric_slot_restart_lsn)")
    [void]$markdown.AppendLine("- electric_slot_confirmed_flush_lsn: $($plan.postgres_wal_pressure.electric_slot_confirmed_flush_lsn)")
    [void]$markdown.AppendLine("- postgres_wal_pressure_status: $($plan.postgres_wal_pressure.status)")
    [void]$markdown.AppendLine("- postgres_wal_pressure_summary: $($plan.postgres_wal_pressure.summary)")
    [void]$markdown.AppendLine("- postgres_wal_pressure_recommended_action: $($plan.postgres_wal_pressure.recommended_action)")
    [void]$markdown.AppendLine("- safe_limit_recommendation_gib: $($plan.postgres_wal_pressure.safe_limit_recommendation_gib)")
    [void]$markdown.AppendLine("- root_use_pct: $($plan.disk_pressure.root_use_pct)")
    [void]$markdown.AppendLine("- root_avail: $($plan.disk_pressure.root_avail)")
    [void]$markdown.AppendLine("- projected_root_use_pct_after_candidate_cleanup: $($plan.disk_pressure.projected_root_use_pct_after_candidate_cleanup)")
    [void]$markdown.AppendLine("- projected_root_avail_gib_after_candidate_cleanup: $($plan.disk_pressure.projected_root_avail_gib_after_candidate_cleanup)")
    [void]$markdown.AppendLine("- disk_pressure_status: $($plan.disk_pressure.status)")
    [void]$markdown.AppendLine("- disk_pressure_summary: $($plan.disk_pressure.summary)")
    [void]$markdown.AppendLine("- disk_pressure_recommended_action: $($plan.disk_pressure.recommended_action)")
    [void]$markdown.AppendLine("- review_target_count: $($plan.review_pressure.review_target_count)")
    [void]$markdown.AppendLine("- top_review_target_group: $($plan.review_pressure.top_target_group)")
    [void]$markdown.AppendLine("- top_review_target_known_size_gib: $($plan.review_pressure.top_target_known_size_gib)")
    [void]$markdown.AppendLine("- top_review_target_review_count: $($plan.review_pressure.top_target_review_count)")
    [void]$markdown.AppendLine("- omnyid_backup_retention_known_size_gib: $($plan.review_pressure.omnyid_backup_retention_known_size_gib)")
    [void]$markdown.AppendLine("- review_recommended_action: $($plan.review_pressure.recommended_action)")
    [void]$markdown.AppendLine("- top_review_target_cleanup_command: $($plan.review_pressure.top_target_cleanup_command)")
    [void]$markdown.AppendLine("- omnyid_backup_retention_cleanup_command: $($plan.review_pressure.omnyid_backup_retention_cleanup_command)")
    [void]$markdown.AppendLine("- combined_retention_and_top_target_cleanup_command: $($plan.review_pressure.combined_retention_and_top_target_cleanup_command)")
    [void]$markdown.AppendLine("- synthetic_message_cleanup_command: $($plan.commands.prune_synthetic_messages)")
    [void]$markdown.AppendLine("- synthetic_message_status: $($plan.synthetic_message_pressure.status)")
    [void]$markdown.AppendLine("- synthetic_message_total_dupes: $($plan.synthetic_message_pressure.total_dupes)")
    [void]$markdown.AppendLine("- synthetic_message_recommended_action: $($plan.synthetic_message_pressure.recommended_action)")
    [void]$markdown.AppendLine("- operational_history_cleanup_command: $($plan.commands.prune_operational_history)")
    [void]$markdown.AppendLine("- operational_history_status: $($plan.operational_history_pressure.status)")
    [void]$markdown.AppendLine("- operational_history_total_rows: $($plan.operational_history_pressure.total_rows)")
    [void]$markdown.AppendLine("- operational_history_recommended_action: $($plan.operational_history_pressure.recommended_action)")
    [void]$markdown.AppendLine("- runtime_script_integrity_status: $($plan.runtime_scripts.status)")
    [void]$markdown.AppendLine("- runtime_script_integrity_detail: $($plan.runtime_scripts.detail)")
    [void]$markdown.AppendLine("- missing_runtime_scripts: $(@($plan.runtime_scripts.missing_scripts) -join ', ')")
    [void]$markdown.AppendLine("- runtime_repair_required: $($plan.runtime_repair.required)")
    [void]$markdown.AppendLine("- runtime_repair_reason: $($plan.runtime_repair.reason)")
    [void]$markdown.AppendLine("- runtime_repair_blocks_backup_verify: $($plan.runtime_repair.blocks_backup_verify)")
    [void]$markdown.AppendLine("- runtime_repair_blocks_restore_drill: $($plan.runtime_repair.blocks_restore_drill)")
    [void]$markdown.AppendLine("- runtime_repair_recommended_action: $($plan.runtime_repair.recommended_action)")
    [void]$markdown.AppendLine("- oracle_repair_kind: $($plan.oracle_repair.kind)")
    [void]$markdown.AppendLine("- oracle_repair_required: $($plan.oracle_repair.required)")
    [void]$markdown.AppendLine("- oracle_repair_reason: $($plan.oracle_repair.reason)")
    [void]$markdown.AppendLine("- oracle_repair_blocks_backup_verify: $($plan.oracle_repair.blocks_backup_verify)")
    [void]$markdown.AppendLine("- oracle_repair_blocks_restore_drill: $($plan.oracle_repair.blocks_restore_drill)")
    [void]$markdown.AppendLine("- oracle_repair_recommended_action: $($plan.oracle_repair.recommended_action)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Postgres WAL")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- postgres_container_name: $($plan.postgres_wal_pressure.postgres_container_name)")
    [void]$markdown.AppendLine("- electric_container_name: $($plan.postgres_wal_pressure.electric_container_name)")
    [void]$markdown.AppendLine("- status: $($plan.postgres_wal_pressure.status)")
    [void]$markdown.AppendLine("- summary: $($plan.postgres_wal_pressure.summary)")
    [void]$markdown.AppendLine("- recommended_action: $($plan.postgres_wal_pressure.recommended_action)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Synthetic Messages")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- status: $($plan.synthetic_message_pressure.status)")
    [void]$markdown.AppendLine("- total_dupes: $($plan.synthetic_message_pressure.total_dupes)")
    [void]$markdown.AppendLine("- maintenance_summary_dupes: $($plan.synthetic_message_pressure.maintenance_summary_dupes)")
    [void]$markdown.AppendLine("- curator_card_dupes: $($plan.synthetic_message_pressure.curator_card_dupes)")
    [void]$markdown.AppendLine("- curator_backlink_dupes: $($plan.synthetic_message_pressure.curator_backlink_dupes)")
    [void]$markdown.AppendLine("- ingestion_topology_dupes: $($plan.synthetic_message_pressure.ingestion_topology_dupes)")
    [void]$markdown.AppendLine("- summary: $($plan.synthetic_message_pressure.summary)")
    [void]$markdown.AppendLine("- recommended_action: $($plan.synthetic_message_pressure.recommended_action)")
    [void]$markdown.AppendLine("- prune_command: $($plan.synthetic_message_pressure.prune_command)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Operational History")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- status: $($plan.operational_history_pressure.status)")
    [void]$markdown.AppendLine("- total_rows: $($plan.operational_history_pressure.total_rows)")
    [void]$markdown.AppendLine("- summary: $($plan.operational_history_pressure.summary)")
    [void]$markdown.AppendLine("- recommended_action: $($plan.operational_history_pressure.recommended_action)")
    [void]$markdown.AppendLine("- prune_command: $($plan.operational_history_pressure.prune_command)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Review Targets")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| ownership_group | review_count | known_size_gib | recommended_action |")
    [void]$markdown.AppendLine("|---|---:|---:|---|")
    foreach ($row in $reviewTargetSummaries) {
        [void]$markdown.AppendLine("| $($row.ownership_group) | $($row.review_count) | $($row.known_size_gib) | $($row.recommended_action) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Commands")
    [void]$markdown.AppendLine()
    foreach ($entry in @(
        @{ name = "stop_and_remove_containers"; value = $plan.commands.stop_and_remove_containers },
        @{ name = "remove_images"; value = $plan.commands.remove_images },
        @{ name = "prune_images"; value = $plan.commands.prune_images },
        @{ name = "prune_builder_cache"; value = $plan.commands.prune_builder_cache },
        @{ name = "remove_volumes"; value = $plan.commands.remove_volumes },
        @{ name = "host_cleanup"; value = $plan.commands.host_cleanup },
        @{ name = "prune_unused"; value = $plan.commands.prune_unused },
        @{ name = "review_target_cleanup"; value = $plan.commands.review_target_cleanup },
        @{ name = "omnyid_backup_retention_cleanup"; value = $plan.commands.omnyid_backup_retention_cleanup },
        @{ name = "combined_retention_and_top_target_cleanup"; value = $plan.commands.combined_retention_and_top_target_cleanup },
        @{ name = "prune_synthetic_messages"; value = $plan.commands.prune_synthetic_messages },
        @{ name = "prune_operational_history"; value = $plan.commands.prune_operational_history },
        @{ name = "inspect_replication_slots"; value = $plan.commands.inspect_replication_slots },
        @{ name = "restart_electric"; value = $plan.commands.restart_electric },
        @{ name = "drop_electric_slot"; value = $plan.commands.drop_electric_slot },
        @{ name = "limit_slot_wal"; value = $plan.commands.limit_slot_wal },
        @{ name = "remediate_electric_slot_restart_and_limit"; value = $plan.commands.remediate_electric_slot_restart_and_limit },
        @{ name = "remediate_electric_slot_drop_and_limit"; value = $plan.commands.remediate_electric_slot_drop_and_limit }
    )) {
        [void]$markdown.AppendLine("- $($entry.name): `$ $($entry.value)")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Candidate Cleanup")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| item_type | name | image | status | size | size_gib |")
    [void]$markdown.AppendLine("|---|---|---|---|---:|---:|")
    foreach ($row in $candidateItems) {
        [void]$markdown.AppendLine("| $($row.item_type) | $($row.name) | $($row.image) | $($row.status) | $($row.size) | $($row.size_gib) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Review Items")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| item_type | name | image | status | size | size_gib |")
    [void]$markdown.AppendLine("|---|---|---|---|---:|---:|")
    foreach ($row in $reviewItems) {
        [void]$markdown.AppendLine("| $($row.item_type) | $($row.name) | $($row.image) | $($row.status) | $($row.size) | $($row.size_gib) |")
    }
    $markdown.ToString() | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-plan.md")
}

Write-Output "[oracle-runtime-cleanup-plan] candidate_containers=$($candidateContainers.Count) candidate_volumes=$($candidateVolumes.Count) candidate_images=$($candidateImages.Count) estimated_candidate_image_gib=$imageGiB estimated_total_candidate_gib=$totalEstimatedReclaimGiB pg_wal_gib=$pgWalGiB postgres_wal_pressure_status=$postgresWalPressureStatus synthetic_message_total_dupes=$($plan.synthetic_message_pressure.total_dupes) root_use_pct=$rootDiskUsePct projected_root_use_pct=$projectedRootUsePct review_items=$($reviewItems.Count)"
