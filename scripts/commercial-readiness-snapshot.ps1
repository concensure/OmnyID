param(
    [string]$OracleProofPath = "",
    [string]$OracleRestoreProofPath = "",
    [string]$OracleInventoryPath = "",
    [string]$OracleCleanupPlanPath = "",
    [string]$OracleCleanupExecutePath = "",
    [string]$OracleRemediationPath = "",
    [string]$ReleaseReadinessPath = "",
    [string]$PersonalOsAuditPath = "",
    [string]$StageManifestPath = "",
    [string]$StorageHygienePath = "",
    [string]$OutDir = "",
    [string]$StatusDocPath = "",
    [string]$ComparisonSnapshotPath = "",
    [int]$OracleRestoreProofMaxAgeHours = 168,
    [int]$MaxFrontendBundleWarnings = 2,
    [switch]$RequireExecutedOracleRemediation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$detachedOracleProofCurrentCommand = "./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current"
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture
[System.Threading.Thread]::CurrentThread.CurrentUICulture = [System.Globalization.CultureInfo]::InvariantCulture

function Get-StageManifestRuntimeIntegrity {
    param([object]$StageManifest)

    if ($null -eq $StageManifest) {
        return [pscustomobject]@{
            manifest_present = $false
            required_runtime_scripts_count = $null
            missing_required_scripts = @()
            integrity_status = "unknown"
            integrity_detail = "local staged runtime manifest not found"
        }
    }

    $copiedPaths = if ($null -ne $StageManifest.PSObject.Properties["copied_paths"]) {
        [string[]]@($StageManifest.copied_paths | ForEach-Object { [string]$_ })
    } else {
        [string[]]@()
    }
    $requiredScripts = if ($null -ne $StageManifest.PSObject.Properties["required_runtime_scripts"]) {
        [string[]]@($StageManifest.required_runtime_scripts | ForEach-Object { [string]$_ })
    } else {
        [string[]]@()
    }
    $missingScripts = [string[]]@($requiredScripts | Where-Object { $_ -notin $copiedPaths })
    $requiredScriptCount = @($requiredScripts).Count
    $missingScriptCount = @($missingScripts).Count
    $integrityStatus = if ($missingScriptCount -eq 0 -and $requiredScriptCount -gt 0) { "pass" } elseif ($requiredScriptCount -eq 0) { "unknown" } else { "fail" }
    $integrityDetail = if ($integrityStatus -eq "pass") {
        "local staged runtime manifest includes all required runtime scripts"
    } elseif ($integrityStatus -eq "fail") {
        "local staged runtime manifest is missing required scripts: $($missingScripts -join ',')"
    } else {
        "local staged runtime manifest does not declare required runtime scripts"
    }

    return [pscustomobject]@{
        manifest_present = $true
        required_runtime_scripts_count = $requiredScriptCount
        missing_required_scripts = @($missingScripts)
        integrity_status = $integrityStatus
        integrity_detail = $integrityDetail
    }
}

function Resolve-ArtifactPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

if ([string]::IsNullOrWhiteSpace($OracleProofPath)) {
    $OracleProofPath = Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current\oracle-production-proof.json"
}
if ([string]::IsNullOrWhiteSpace($OracleRestoreProofPath)) {
    $preferredRestoreProofPath = Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-restored\oracle-production-proof.json"
    if (Test-Path -LiteralPath $preferredRestoreProofPath) {
        $OracleRestoreProofPath = $preferredRestoreProofPath
    } else {
        $OracleRestoreProofPath = $OracleProofPath
    }
}
if ([string]::IsNullOrWhiteSpace($OracleInventoryPath)) {
    $OracleInventoryPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-inventory-current\oracle-runtime-inventory.json"
}
if ([string]::IsNullOrWhiteSpace($OracleCleanupPlanPath)) {
    $OracleCleanupPlanPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-plan-current\oracle-runtime-cleanup-plan.json"
}
if ([string]::IsNullOrWhiteSpace($OracleCleanupExecutePath)) {
    $OracleCleanupExecutePath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-execute-current\oracle-runtime-cleanup-execute.json"
}
if ([string]::IsNullOrWhiteSpace($OracleRemediationPath)) {
    $OracleRemediationPath = Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current\oracle-remediation-sequence.json"
}
if ([string]::IsNullOrWhiteSpace($ReleaseReadinessPath)) {
    $ReleaseReadinessPath = Join-Path $PSScriptRoot "..\artifacts\release-readiness-current\summary.json"
}
if ([string]::IsNullOrWhiteSpace($PersonalOsAuditPath)) {
    $PersonalOsAuditPath = Join-Path $PSScriptRoot "..\artifacts\personalos-readiness-audit-current\personalos-readiness-audit.json"
}
if ([string]::IsNullOrWhiteSpace($StageManifestPath)) {
    $StageManifestPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-stage-current\oracle-runtime-manifest.json"
}
if ([string]::IsNullOrWhiteSpace($StorageHygienePath)) {
    $StorageHygienePath = Join-Path $PSScriptRoot "..\artifacts\storage-hygiene-report-current\storage-hygiene-report.json"
}
if ([string]::IsNullOrWhiteSpace($StatusDocPath)) {
    if ($MaxFrontendBundleWarnings -eq 2 -and -not $RequireExecutedOracleRemediation) {
        $StatusDocPath = Join-Path $PSScriptRoot "..\docs\COMMERCIAL_READINESS_STATUS.md"
    } elseif (-not [string]::IsNullOrWhiteSpace($OutDir)) {
        $StatusDocPath = Join-Path $OutDir "COMMERCIAL_READINESS_STATUS.md"
    } else {
        $StatusDocPath = ""
    }
}

$resolvedOracleProofPath = Resolve-ArtifactPath -Path $OracleProofPath
$resolvedOracleRestoreProofPath = Resolve-ArtifactPath -Path $OracleRestoreProofPath
$resolvedOracleInventoryPath = Resolve-ArtifactPath -Path $OracleInventoryPath
$resolvedOracleCleanupPlanPath = Resolve-ArtifactPath -Path $OracleCleanupPlanPath
$resolvedOracleCleanupExecutePath = Resolve-ArtifactPath -Path $OracleCleanupExecutePath
$resolvedOracleRemediationPath = Resolve-ArtifactPath -Path $OracleRemediationPath
$resolvedReleaseReadinessPath = Resolve-ArtifactPath -Path $ReleaseReadinessPath
$resolvedPersonalOsAuditPath = Resolve-ArtifactPath -Path $PersonalOsAuditPath
$resolvedStageManifestPath = Resolve-ArtifactPath -Path $StageManifestPath
$resolvedStorageHygienePath = Resolve-ArtifactPath -Path $StorageHygienePath

foreach ($path in @(
    $resolvedOracleProofPath,
    $resolvedOracleInventoryPath,
    $resolvedOracleCleanupPlanPath,
    $resolvedPersonalOsAuditPath
)) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        throw "[commercial-readiness-snapshot] required artifact not found"
    }
}

$oracleProof = Get-Content -LiteralPath $resolvedOracleProofPath -Raw | ConvertFrom-Json
$oracleRestoreProof = if (-not [string]::IsNullOrWhiteSpace($resolvedOracleRestoreProofPath)) {
    Get-Content -LiteralPath $resolvedOracleRestoreProofPath -Raw | ConvertFrom-Json
} else {
    $null
}
$oracleInventory = Get-Content -LiteralPath $resolvedOracleInventoryPath -Raw | ConvertFrom-Json
$oracleCleanup = Get-Content -LiteralPath $resolvedOracleCleanupPlanPath -Raw | ConvertFrom-Json
$oracleCleanupExecute = if (-not [string]::IsNullOrWhiteSpace($resolvedOracleCleanupExecutePath)) {
    Get-Content -LiteralPath $resolvedOracleCleanupExecutePath -Raw | ConvertFrom-Json
} else {
    $null
}
$oracleRemediation = if (-not [string]::IsNullOrWhiteSpace($resolvedOracleRemediationPath)) {
    Get-Content -LiteralPath $resolvedOracleRemediationPath -Raw | ConvertFrom-Json
} else {
    $null
}
$releaseReadiness = if (-not [string]::IsNullOrWhiteSpace($resolvedReleaseReadinessPath)) {
    Get-Content -LiteralPath $resolvedReleaseReadinessPath -Raw | ConvertFrom-Json
} else {
    $null
}
$releaseReadinessGeneratedAt =
    if ($null -ne $releaseReadiness) {
        if ($null -ne $releaseReadiness.PSObject.Properties["generated_at"]) {
            [string]$releaseReadiness.generated_at
        } elseif ($null -ne $releaseReadiness.PSObject.Properties["started_at"]) {
            [string]$releaseReadiness.started_at
        } else {
            $null
        }
    } else {
        $null
    }
$personalOs = Get-Content -LiteralPath $resolvedPersonalOsAuditPath -Raw | ConvertFrom-Json
$stageManifest = if (-not [string]::IsNullOrWhiteSpace($resolvedStageManifestPath)) {
    Get-Content -LiteralPath $resolvedStageManifestPath -Raw | ConvertFrom-Json
} else {
    $null
}
$storageHygiene = if (-not [string]::IsNullOrWhiteSpace($resolvedStorageHygienePath)) {
    Get-Content -LiteralPath $resolvedStorageHygienePath -Raw | ConvertFrom-Json
} else {
    $null
}
$resolvedOracleWalSlotRemediationPath =
    if (
        $null -ne $oracleRemediation -and
        $null -ne $oracleRemediation.PSObject.Properties["artifact_paths"] -and
        $null -ne $oracleRemediation.artifact_paths -and
        $null -ne $oracleRemediation.artifact_paths.PSObject.Properties["wal_slot_remediation"] -and
        -not [string]::IsNullOrWhiteSpace([string]$oracleRemediation.artifact_paths.wal_slot_remediation)
    ) {
        Resolve-ArtifactPath -Path ([string]$oracleRemediation.artifact_paths.wal_slot_remediation)
    } else {
        $null
    }
$resolvedOracleSyntheticCleanupPath =
    if (
        $null -ne $oracleRemediation -and
        $null -ne $oracleRemediation.PSObject.Properties["artifact_paths"] -and
        $null -ne $oracleRemediation.artifact_paths -and
        $null -ne $oracleRemediation.artifact_paths.PSObject.Properties["synthetic_cleanup"] -and
        -not [string]::IsNullOrWhiteSpace([string]$oracleRemediation.artifact_paths.synthetic_cleanup)
    ) {
        Resolve-ArtifactPath -Path ([string]$oracleRemediation.artifact_paths.synthetic_cleanup)
    } else {
        $null
    }
$resolvedOracleOperationalHistoryCleanupPath =
    if (
        $null -ne $oracleRemediation -and
        $null -ne $oracleRemediation.PSObject.Properties["artifact_paths"] -and
        $null -ne $oracleRemediation.artifact_paths -and
        $null -ne $oracleRemediation.artifact_paths.PSObject.Properties["operational_history_cleanup"] -and
        -not [string]::IsNullOrWhiteSpace([string]$oracleRemediation.artifact_paths.operational_history_cleanup)
    ) {
        Resolve-ArtifactPath -Path ([string]$oracleRemediation.artifact_paths.operational_history_cleanup)
    } else {
        $null
    }
$stageManifestIntegrity = Get-StageManifestRuntimeIntegrity -StageManifest $stageManifest

function Get-OptionalIntProperty {
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
    return [int]$property.Value
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

function Get-OptionalStringArrayProperty {
    param(
        [object]$Object,
        [string]$PropertyName
    )

    if ($null -eq $Object) {
        return @()
    }

    $property = $Object.PSObject.Properties[$PropertyName]
    if ($null -eq $property -or $null -eq $property.Value) {
        return @()
    }

    return @($property.Value | ForEach-Object {
        if ($null -eq $_) {
            return
        }
        $value = [string]$_
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $value
        }
    })
}

function Test-HasProperty {
    param(
        [object]$Object,
        [string]$PropertyName
    )

    if ($null -eq $Object) {
        return $false
    }
    return $null -ne $Object.PSObject.Properties[$PropertyName]
}

function Get-FirstDiskRowForMount {
    param(
        [object]$Inventory,
        [string]$Mount
    )

    if ($null -eq $Inventory -or $null -eq $Inventory.PSObject.Properties["disk"]) {
        return $null
    }

    return @($Inventory.disk | Where-Object { [string]$_.mount -eq $Mount } | Select-Object -First 1)[0]
}

function Convert-UsePctToInt {
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value) {
        return $null
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    if ($text -match '^(?<number>\d+)\%$') {
        return [int]$matches['number']
    }
    if ($text -match '^\d+$') {
    return [int]$text
    }
    return $null
}

function Get-TopReviewTarget {
    param(
        [object]$OracleCleanup
    )

    if ($null -eq $OracleCleanup -or $null -eq $OracleCleanup.PSObject.Properties["review_targets"]) {
        return $null
    }

    $targets = @($OracleCleanup.review_targets)
    if ($targets.Count -eq 0) {
        return $null
    }

    $topTargetGroup = if ($null -ne $OracleCleanup.PSObject.Properties["review_pressure"]) {
        Get-OptionalStringProperty -Object $OracleCleanup.review_pressure -PropertyName "top_target_group"
    } else {
        $null
    }

    if (-not [string]::IsNullOrWhiteSpace($topTargetGroup)) {
        $matched = @($targets | Where-Object {
            (Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group") -eq $topTargetGroup
        } | Select-Object -First 1)
        if ($matched.Count -gt 0) {
            return $matched[0]
        }
    }

    return $targets[0]
}

function Join-NonEmptyCommands {
    param(
        [string[]]$Commands
    )

    $parts = @($Commands | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($parts.Count -eq 0) {
        return $null
    }
    return ($parts -join " ; ")
}

function Get-OracleCloudDeploymentMatrix {
    param(
        [AllowNull()]
        [object]$StorageHygiene
    )

    if (
        $null -eq $StorageHygiene -or
        $null -eq $StorageHygiene.oracle -or
        $null -eq $StorageHygiene.oracle.PSObject.Properties["group_summary"]
    ) {
        return @()
    }

    return @(
        $StorageHygiene.oracle.group_summary |
            ForEach-Object {
                if ($null -eq $_) {
                    return
                }

                [pscustomobject]@{
                    ownership_group = Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group"
                    deployment_class = Get-OptionalStringProperty -Object $_ -PropertyName "deployment_class"
                    required_on_oracle = [bool]$_.required_on_oracle
                    safe_to_delete_now = [bool]$_.safe_to_delete_now
                    size_gib = if ($null -ne $_.PSObject.Properties["known_size_gib"] -and $null -ne $_.known_size_gib) { [double]$_.known_size_gib } else { $null }
                    delete_precondition = Get-OptionalStringProperty -Object $_ -PropertyName "delete_precondition"
                    recommended_action = Get-OptionalStringProperty -Object $_ -PropertyName "recommended_action"
                }
            }
    )
}

function Format-ReadableAuditDate {
    param(
        [AllowNull()]
        [object]$GeneratedAt
    )

    if ($null -eq $GeneratedAt) {
        return $null
    }

    $text = [string]$GeneratedAt
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    try {
        return ([DateTimeOffset]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)).UtcDateTime.ToString("dddd, MMMM d, yyyy", [System.Globalization.CultureInfo]::InvariantCulture)
    }
    catch {
        return $null
    }
}

function Get-CommercialReadinessLaneLabel {
    param([AllowNull()][object]$Policy)

    if ($null -eq $Policy) {
        return "current"
    }

    $maxWarnings =
        if ($null -ne $Policy.PSObject.Properties["max_frontend_bundle_warnings"] -and $null -ne $Policy.max_frontend_bundle_warnings) {
            [int]$Policy.max_frontend_bundle_warnings
        } else {
            $null
        }
    $requiresExecutedRemediation =
        if ($null -ne $Policy.PSObject.Properties["require_executed_oracle_remediation"]) {
            [bool]$Policy.require_executed_oracle_remediation
        } else {
            $false
        }

    if ($maxWarnings -eq 2 -and -not $requiresExecutedRemediation) {
        return "default"
    }
    if ($maxWarnings -eq 1 -and $requiresExecutedRemediation) {
        return "strict"
    }
    return "current"
}

function Get-GoNoGoStatusFromCommercialStatus {
    param([string]$CommercialStatus)

    if ([string]$CommercialStatus -eq "ready") {
        return "go"
    }
    return "no_go"
}

function Parse-OptionalDateTimeOffset {
    param(
        [AllowNull()]
        [object]$Value
    )

    if ($null -eq $Value) {
        return $null
    }

    $text = [string]$Value
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    try {
        return [DateTimeOffset]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
    }
    catch {
        return $null
    }
}

function Get-ArtifactFreshnessSummary {
    param(
        [string]$Name,
        [string]$Path,
        [AllowNull()]
        [object]$GeneratedAt
    )

    $generatedAtText =
        if ($null -eq $GeneratedAt) {
            $null
        } else {
            [string]$GeneratedAt
        }
    $generatedAtParsed = Parse-OptionalDateTimeOffset -Value $generatedAtText
    $ageHours =
        if ($null -ne $generatedAtParsed) {
            [Math]::Round((([DateTimeOffset]::UtcNow - $generatedAtParsed.ToUniversalTime()).TotalHours), 1)
        } else {
            $null
        }
    $stale =
        if ($null -ne $ageHours) {
            $ageHours -gt 24
        } else {
            $null
        }

    return [pscustomobject]@{
        name = $Name
        path = $Path
        exists = -not [string]::IsNullOrWhiteSpace($Path)
        generated_at = $generatedAtText
        age_hours = $ageHours
        stale = $stale
    }
}

function Test-UsePctMismatchMaterial {
    param(
        [AllowNull()]
        [int]$Left,
        [AllowNull()]
        [int]$Right,
        [int]$Tolerance = 1
    )

    if ($null -eq $Left -or $null -eq $Right) {
        return $false
    }

    return [math]::Abs($Left - $Right) -gt $Tolerance
}

function Get-OptionalAbsMinutesBetween {
    param(
        [AllowNull()]
        [Nullable[DateTimeOffset]]$Left,
        [AllowNull()]
        [Nullable[DateTimeOffset]]$Right
    )

    if ($null -eq $Left -or $null -eq $Right) {
        return $null
    }

    return [math]::Abs(($Left.ToUniversalTime() - $Right.ToUniversalTime()).TotalMinutes)
}

function Get-OracleRepairSignal {
    param(
        [object]$OracleProof,
        [object]$OracleInventory,
        [object]$OracleCleanup
    )

    $cleanupRuntimeRepair = if ($null -ne $OracleCleanup -and $null -ne $OracleCleanup.PSObject.Properties["runtime_repair"]) {
        $OracleCleanup.runtime_repair
    } else {
        $null
    }
    $cleanupOracleRepair = if ($null -ne $OracleCleanup -and $null -ne $OracleCleanup.PSObject.Properties["oracle_repair"]) {
        $OracleCleanup.oracle_repair
    } else {
        $null
    }
    $cleanupDiskPressure = if ($null -ne $OracleCleanup -and $null -ne $OracleCleanup.PSObject.Properties["disk_pressure"]) {
        $OracleCleanup.disk_pressure
    } else {
        $null
    }
    $cleanupReviewPressure = if ($null -ne $OracleCleanup -and $null -ne $OracleCleanup.PSObject.Properties["review_pressure"]) {
        $OracleCleanup.review_pressure
    } else {
        $null
    }

    $repairKind = "none"
    $repairRequired = $false
    $repairReason = $null
    $repairRecommendedAction = $null
    $repairBlocksBackupVerify = $false
    $repairBlocksRestoreDrill = $false

    if ($null -ne $cleanupOracleRepair -and [bool]$cleanupOracleRepair.required) {
        $repairKind = Get-OptionalStringProperty -Object $cleanupOracleRepair -PropertyName "kind"
        if ([string]::IsNullOrWhiteSpace($repairKind)) {
            $repairKind = "redeploy"
        }
        $repairRequired = $true
        $repairReason = Get-OptionalStringProperty -Object $cleanupOracleRepair -PropertyName "reason"
        $repairRecommendedAction = Get-OptionalStringProperty -Object $cleanupOracleRepair -PropertyName "recommended_action"
        $repairBlocksBackupVerify = [bool]$cleanupOracleRepair.blocks_backup_verify
        $repairBlocksRestoreDrill = [bool]$cleanupOracleRepair.blocks_restore_drill
    } elseif ($null -ne $cleanupRuntimeRepair -and [bool]$cleanupRuntimeRepair.required) {
        $repairKind = "redeploy"
        $repairRequired = $true
        $repairReason = Get-OptionalStringProperty -Object $cleanupRuntimeRepair -PropertyName "reason"
        $repairRecommendedAction = Get-OptionalStringProperty -Object $cleanupRuntimeRepair -PropertyName "recommended_action"
        $repairBlocksBackupVerify = [bool]$cleanupRuntimeRepair.blocks_backup_verify
        $repairBlocksRestoreDrill = [bool]$cleanupRuntimeRepair.blocks_restore_drill
    } else {
        $proofRootUsePct = Get-OptionalIntProperty -Object $OracleProof -PropertyName "remote_root_use_pct"
        $proofFailureStep = Get-OptionalStringProperty -Object $OracleProof -PropertyName "failure_step"
        $projectedRootUsePct = if ($null -ne $cleanupDiskPressure) { Get-OptionalIntProperty -Object $cleanupDiskPressure -PropertyName "projected_root_use_pct_after_candidate_cleanup" } else { $null }
        $candidateCleanupItems = if ($null -ne $OracleInventory -and $null -ne $OracleInventory.PSObject.Properties["counts"]) { Get-OptionalIntProperty -Object $OracleInventory.counts -PropertyName "candidate_cleanup_items" } else { $null }
        $cleanupClassificationMode = Get-OptionalStringProperty -Object $OracleCleanup -PropertyName "classification_mode"
        $hasTargetedCleanup = $cleanupClassificationMode -eq "targeted_ownership_cleanup_enabled"
        $cleanupPlanPathForAction = $resolvedOracleCleanupPlanPath

        if (
            $proofFailureStep -eq "disk_capacity" -and
            $null -ne $proofRootUsePct -and $proofRootUsePct -ge 98 -and
            $null -ne $projectedRootUsePct -and $projectedRootUsePct -lt $proofRootUsePct -and
            $null -ne $candidateCleanupItems -and $candidateCleanupItems -gt 0
        ) {
            $repairKind = if ($hasTargetedCleanup) { "targeted_cleanup" } else { "cleanup" }
            $repairRequired = $true
            $repairReason = "remote root filesystem is saturated and the cleanup plan projects root usage down to about $projectedRootUsePct% after candidate cleanup"
            $repairRecommendedAction =
                if ($hasTargetedCleanup) {
                    "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath `"$cleanupPlanPathForAction`" -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; $detachedOracleProofCurrentCommand"
                } else {
                    "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath `"$cleanupPlanPathForAction`" -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; $detachedOracleProofCurrentCommand"
                }
            $repairBlocksBackupVerify = $true
            $repairBlocksRestoreDrill = $true
        } else {
            $topReviewTargetGroup = if ($null -ne $cleanupReviewPressure) { Get-OptionalStringProperty -Object $cleanupReviewPressure -PropertyName "top_target_group" } else { $null }
            $topReviewTargetKnownSizeGiB = if ($null -ne $cleanupReviewPressure) { Get-OptionalDoubleProperty -Object $cleanupReviewPressure -PropertyName "top_target_known_size_gib" } else { $null }
            $topReviewTargetCleanupCommand = if ($null -ne $cleanupReviewPressure) { Get-OptionalStringProperty -Object $cleanupReviewPressure -PropertyName "top_target_cleanup_command" } else { $null }
            if (
                $proofFailureStep -eq "disk_capacity" -and
                $null -ne $proofRootUsePct -and $proofRootUsePct -ge 98 -and
                $null -ne $projectedRootUsePct -and $projectedRootUsePct -ge $proofRootUsePct -and
                -not [string]::IsNullOrWhiteSpace($topReviewTargetCleanupCommand)
            ) {
                $repairKind = "review_target_cleanup"
                $repairRequired = $true
                $repairReason = "remote root filesystem is saturated, candidate cleanup alone does not materially reduce pressure, and the top review target '$topReviewTargetGroup' carries about $topReviewTargetKnownSizeGiB GiB of known reclaimable scope that must be reviewed before proof can pass"
                $repairRecommendedAction = "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath `"$cleanupPlanPathForAction`" -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute ; $detachedOracleProofCurrentCommand"
                $repairBlocksBackupVerify = $true
                $repairBlocksRestoreDrill = $true
            }
        }
    }

    return [pscustomobject]@{
        kind = $repairKind
        required = $repairRequired
        reason = $repairReason
        recommended_action = $repairRecommendedAction
        blocks_backup_verify = $repairBlocksBackupVerify
        blocks_restore_drill = $repairBlocksRestoreDrill
    }
}

$personalOsTotalTasks = Get-OptionalIntProperty -Object $personalOs.counts -PropertyName "total_tasks"
$personalOsImplementedTasks = Get-OptionalIntProperty -Object $personalOs.counts -PropertyName "implemented_tasks"
$personalOsPartialTasks = Get-OptionalIntProperty -Object $personalOs.counts -PropertyName "partial_tasks"
$personalOsNotStartedTasks = Get-OptionalIntProperty -Object $personalOs.counts -PropertyName "not_started_tasks"
$personalOsResidualOpenItems = Get-OptionalIntProperty -Object $personalOs.counts -PropertyName "residual_open_items"
$personalOsOpenTasks = if ($null -ne $personalOs.PSObject.Properties["open_tasks"]) { @($personalOs.open_tasks) } else { @() }
$personalOsOpenItems = if ($null -ne $personalOs.PSObject.Properties["open_items"]) { @($personalOs.open_items) } else { @() }
$personalOsOpenPhaseSummaries = if ($null -ne $personalOs.PSObject.Properties["open_phase_summaries"]) { @($personalOs.open_phase_summaries) } else { @() }
$personalOsResidualItems = @($personalOsOpenItems | Where-Object { [string]$_.item_kind -eq "phase_note" })
$personalOsTaskItems = @($personalOsOpenItems | Where-Object { [string]$_.item_kind -ne "phase_note" })
$personalOsResidualPhaseSummaries = @(
    $personalOsResidualItems |
        Group-Object -Property phase_number |
        Sort-Object { [int]$_.Name } |
        ForEach-Object {
            $first = $_.Group | Select-Object -First 1
            "Phase $($first.phase_number): $($_.Count) residual blocker(s)"
        }
)
$remediationSummary = if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"]) {
    $oracleRemediation.remediation_summary
} else {
    $null
}
$remediationFinalProofPath =
    if ($null -ne $remediationSummary) {
        Get-OptionalStringProperty -Object $remediationSummary -PropertyName "final_proof_path"
    } else {
        $null
    }
$resolvedRemediationFinalProofPath = Resolve-ArtifactPath -Path $remediationFinalProofPath
$remediationFinalProof =
    if (-not [string]::IsNullOrWhiteSpace($resolvedRemediationFinalProofPath)) {
        Get-Content -LiteralPath $resolvedRemediationFinalProofPath -Raw | ConvertFrom-Json
    } else {
        $null
    }
$inventoryRootDisk = Get-FirstDiskRowForMount -Inventory $oracleInventory -Mount "/"
$inventoryRootUsePct = if ($null -ne $inventoryRootDisk) { Convert-UsePctToInt -Value $inventoryRootDisk.use_pct } else { $null }
$cleanupPlanRootUsePct =
    if ($null -ne $oracleCleanup -and $null -ne $oracleCleanup.PSObject.Properties["disk_pressure"]) {
        Get-OptionalIntProperty -Object $oracleCleanup.disk_pressure -PropertyName "root_use_pct_int"
    } else {
        $null
    }
$oracleProofGeneratedAt = Get-OptionalStringProperty -Object $oracleProof -PropertyName "generated_at"
$oracleRestoreProofGeneratedAt = Get-OptionalStringProperty -Object $oracleRestoreProof -PropertyName "generated_at"
$oracleInventoryGeneratedAt = Get-OptionalStringProperty -Object $oracleInventory -PropertyName "generated_at"
$oracleCleanupPlanGeneratedAt = Get-OptionalStringProperty -Object $oracleCleanup -PropertyName "generated_at"
$oracleCleanupExecuteGeneratedAt = if ($null -ne $oracleCleanupExecute) { Get-OptionalStringProperty -Object $oracleCleanupExecute -PropertyName "generated_at" } else { $null }
$oracleRemediationGeneratedAt = Get-OptionalStringProperty -Object $oracleRemediation -PropertyName "generated_at"
$personalOsGeneratedAt = Get-OptionalStringProperty -Object $personalOs -PropertyName "generated_at"
$oracleProofGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $oracleProofGeneratedAt
$oracleRestoreProofGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $oracleRestoreProofGeneratedAt
$oracleInventoryGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $oracleInventoryGeneratedAt
$oracleCleanupPlanGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $oracleCleanupPlanGeneratedAt
$oracleCleanupExecuteGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $oracleCleanupExecuteGeneratedAt
$oracleRemediationGeneratedAtParsed = Parse-OptionalDateTimeOffset -Value $oracleRemediationGeneratedAt
$remediationFinalProofGeneratedAt = if ($null -ne $remediationFinalProof) { Get-OptionalStringProperty -Object $remediationFinalProof -PropertyName "generated_at" } else { $null }
$oracleInventoryOlderThanProof =
    $null -ne $oracleProofGeneratedAtParsed -and
    $null -ne $oracleInventoryGeneratedAtParsed -and
    $oracleInventoryGeneratedAtParsed -lt $oracleProofGeneratedAtParsed
$oracleCleanupPlanOlderThanProof =
    $null -ne $oracleProofGeneratedAtParsed -and
    $null -ne $oracleCleanupPlanGeneratedAtParsed -and
    $oracleCleanupPlanGeneratedAtParsed -lt $oracleProofGeneratedAtParsed
$oracleRemediationOlderThanProof =
    $null -ne $oracleProofGeneratedAtParsed -and
    $null -ne $oracleRemediationGeneratedAtParsed -and
    $oracleRemediationGeneratedAtParsed -lt $oracleProofGeneratedAtParsed
$oracleRemediationOlderThanCleanupPlan =
    $null -ne $oracleCleanupPlanGeneratedAtParsed -and
    $null -ne $oracleRemediationGeneratedAtParsed -and
    $oracleRemediationGeneratedAtParsed -lt $oracleCleanupPlanGeneratedAtParsed
$oracleCleanupExecuteOlderThanCleanupPlan =
    $null -ne $oracleCleanupPlanGeneratedAtParsed -and
    $null -ne $oracleCleanupExecuteGeneratedAtParsed -and
    $oracleCleanupExecuteGeneratedAtParsed -lt $oracleCleanupPlanGeneratedAtParsed
$remediationCleanupInputsStillMatch =
    $null -ne $remediationSummary -and
    $null -ne $oracleCleanup -and
    $null -ne $oracleCleanup.PSObject.Properties["counts"] -and
    (Get-OptionalIntProperty -Object $remediationSummary -PropertyName "planned_candidate_containers") -eq (Get-OptionalIntProperty -Object $oracleCleanup.counts -PropertyName "candidate_containers") -and
    (Get-OptionalIntProperty -Object $remediationSummary -PropertyName "planned_candidate_volumes") -eq (Get-OptionalIntProperty -Object $oracleCleanup.counts -PropertyName "candidate_volumes") -and
    (Get-OptionalIntProperty -Object $remediationSummary -PropertyName "planned_candidate_images") -eq (Get-OptionalIntProperty -Object $oracleCleanup.counts -PropertyName "candidate_images")
$oracleRemediationMateriallyStaleAgainstCleanupPlan =
    $oracleRemediationOlderThanCleanupPlan -and -not $remediationCleanupInputsStillMatch
$remediationFinalProofMatchesCurrentProof =
    $null -ne $remediationSummary -and
    (Get-OptionalStringProperty -Object $remediationSummary -PropertyName "outcome") -eq "proof_passed" -and
    $null -ne $remediationFinalProof -and
    -not [string]::IsNullOrWhiteSpace($remediationFinalProofGeneratedAt) -and
    $remediationFinalProofGeneratedAt -eq $oracleProofGeneratedAt -and
    (Get-OptionalStringProperty -Object $remediationFinalProof -PropertyName "status") -eq (Get-OptionalStringProperty -Object $oracleProof -PropertyName "status") -and
    (Get-OptionalStringProperty -Object $remediationFinalProof -PropertyName "backup_verify_status") -eq (Get-OptionalStringProperty -Object $oracleProof -PropertyName "backup_verify_status") -and
    (Get-OptionalStringProperty -Object $remediationFinalProof -PropertyName "restore_drill_status") -eq (Get-OptionalStringProperty -Object $oracleProof -PropertyName "restore_drill_status") -and
    (Get-OptionalIntProperty -Object $remediationSummary -PropertyName "final_root_use_pct") -eq (Get-OptionalIntProperty -Object $oracleProof -PropertyName "remote_root_use_pct")
$oracleRemediationOlderThanProofEffective = $oracleRemediationOlderThanProof -and -not $remediationFinalProofMatchesCurrentProof
$evidenceConsistencyItems = New-Object System.Collections.Generic.List[string]
if ($null -ne $inventoryRootUsePct -and $inventoryRootUsePct -ne [int]$oracleProof.remote_root_use_pct) {
    if (Test-UsePctMismatchMaterial -Left $inventoryRootUsePct -Right ([int]$oracleProof.remote_root_use_pct) -Tolerance 1) {
    $inventoryAgeNote =
        if ($oracleInventoryOlderThanProof) {
            " (inventory from $oracleInventoryGeneratedAt predates proof from $oracleProofGeneratedAt)"
        } else {
            ""
        }
    $evidenceConsistencyItems.Add("proof root use is $($oracleProof.remote_root_use_pct)% but inventory root use is $inventoryRootUsePct%$inventoryAgeNote")
    }
}
if ($null -ne $cleanupPlanRootUsePct -and $cleanupPlanRootUsePct -ne [int]$oracleProof.remote_root_use_pct) {
    if (Test-UsePctMismatchMaterial -Left $cleanupPlanRootUsePct -Right ([int]$oracleProof.remote_root_use_pct) -Tolerance 1) {
    $cleanupAgeNote =
        if ($oracleCleanupPlanOlderThanProof) {
            " (cleanup plan from $oracleCleanupPlanGeneratedAt predates proof from $oracleProofGeneratedAt)"
        } else {
            ""
        }
    $evidenceConsistencyItems.Add("proof root use is $($oracleProof.remote_root_use_pct)% but cleanup-plan root use is $cleanupPlanRootUsePct%$cleanupAgeNote")
    }
}
if (
    -not [string]::IsNullOrWhiteSpace($oracleProof.failure_step) -and
    $oracleProof.failure_step -ne "disk_capacity" -and
    $oracleProof.failure_step -ne "restore_drill" -and
    $null -ne $inventoryRootUsePct -and
    $inventoryRootUsePct -ge 95
) {
    $inventoryFailureAgeNote =
        if ($oracleInventoryOlderThanProof) {
            " (inventory from $oracleInventoryGeneratedAt predates proof from $oracleProofGeneratedAt)"
        } else {
            ""
        }
    $evidenceConsistencyItems.Add("proof failure step is '$($oracleProof.failure_step)' while inventory still shows root disk pressure at $inventoryRootUsePct%$inventoryFailureAgeNote")
}
if ($oracleRemediationOlderThanProofEffective -or $oracleRemediationMateriallyStaleAgainstCleanupPlan) {
    $remediationAgeNotes = New-Object System.Collections.Generic.List[string]
    if ($oracleRemediationOlderThanProofEffective) {
        $remediationAgeNotes.Add("proof from $oracleProofGeneratedAt")
    }
    if ($oracleRemediationMateriallyStaleAgainstCleanupPlan) {
        $remediationAgeNotes.Add("cleanup plan from $oracleCleanupPlanGeneratedAt")
    }
    $evidenceConsistencyItems.Add("remediation artifact from $oracleRemediationGeneratedAt predates " + ($remediationAgeNotes -join " and ") + " and may be stale")
}
$inventoryProofMinutesApart = Get-OptionalAbsMinutesBetween -Left $oracleInventoryGeneratedAtParsed -Right $oracleProofGeneratedAtParsed
$cleanupProofMinutesApart = Get-OptionalAbsMinutesBetween -Left $oracleCleanupPlanGeneratedAtParsed -Right $oracleProofGeneratedAtParsed
$inventoryRootUseDelta =
    if ($null -ne $inventoryRootUsePct) {
        [math]::Abs($inventoryRootUsePct - [int]$oracleProof.remote_root_use_pct)
    } else {
        $null
    }
$cleanupRootUseDelta =
    if ($null -ne $cleanupPlanRootUsePct) {
        [math]::Abs($cleanupPlanRootUsePct - [int]$oracleProof.remote_root_use_pct)
    } else {
        $null
    }
$maxRootUseDelta = @(
    @($inventoryRootUseDelta, $cleanupRootUseDelta) |
        Where-Object { $null -ne $_ } |
        Measure-Object -Maximum
).Maximum
$hasOnlyRootUseConsistencyWarnings =
    $evidenceConsistencyItems.Count -gt 0 -and
    @($evidenceConsistencyItems | Where-Object { $_ -notmatch '^proof root use is \d+% but (inventory|cleanup-plan) root use is \d+%' }).Count -eq 0
$hasContemporaneousHighPressureRootDrift =
    $hasOnlyRootUseConsistencyWarnings -and
    $oracleProof.failure_step -eq "restore_drill" -and
    $null -ne $maxRootUseDelta -and
    $maxRootUseDelta -le 3 -and
    [int]$oracleProof.remote_root_use_pct -ge 95 -and
    (($null -eq $inventoryRootUsePct) -or $inventoryRootUsePct -ge 95) -and
    (($null -eq $cleanupPlanRootUsePct) -or $cleanupPlanRootUsePct -ge 95) -and
    (($null -eq $inventoryProofMinutesApart) -or $inventoryProofMinutesApart -le 15) -and
    (($null -eq $cleanupProofMinutesApart) -or $cleanupProofMinutesApart -le 15)
$evidenceConsistencyStatus =
    if ($evidenceConsistencyItems.Count -gt 0) {
        "warn"
    } elseif (
        $null -ne $inventoryRootUsePct -or
        $null -ne $cleanupPlanRootUsePct -or
        -not [string]::IsNullOrWhiteSpace($oracleProofGeneratedAt) -or
        -not [string]::IsNullOrWhiteSpace($oracleInventoryGeneratedAt) -or
        -not [string]::IsNullOrWhiteSpace($oracleCleanupPlanGeneratedAt)
    ) {
        "pass"
    } else {
        "unknown"
    }
$evidenceConsistencySummary =
    if ($evidenceConsistencyItems.Count -gt 0) {
        ($evidenceConsistencyItems -join "; ")
    } elseif ($evidenceConsistencyStatus -eq "pass") {
        "Oracle proof, inventory, and cleanup-plan evidence are materially aligned for the fields currently available"
    } else {
        "not enough Oracle evidence was present to compare proof, inventory, and cleanup-plan state"
    }
$remediationSummaryForSnapshot =
    if ($oracleRemediationOlderThanProofEffective -or $oracleRemediationMateriallyStaleAgainstCleanupPlan) {
        $null
    } else {
        $remediationSummary
    }
$remediationCurrentWithInputs = ($null -ne $remediationSummary -and $null -ne $remediationSummaryForSnapshot)
$remediationStaleRelativeToInputs = [bool]($null -ne $remediationSummary -and -not $remediationCurrentWithInputs)

$oracleRepairSignal = Get-OracleRepairSignal -OracleProof $oracleProof -OracleInventory $oracleInventory -OracleCleanup $oracleCleanup
$postgresWalPressure = if ($null -ne $oracleCleanup -and $null -ne $oracleCleanup.PSObject.Properties["postgres_wal_pressure"]) {
    $oracleCleanup.postgres_wal_pressure
} else {
    $null
}
$topReviewTarget = Get-TopReviewTarget -OracleCleanup $oracleCleanup
$topReviewTargetCleanupCommand =
    if ($null -ne $topReviewTarget) {
        Join-NonEmptyCommands -Commands @(
            (Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "stop_and_remove_containers"),
            (Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "remove_volumes"),
            (Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "remove_images")
        )
    } else {
        $null
    }

$restoreGapBytes = Get-OptionalDoubleProperty -Object $oracleProof -PropertyName "restore_drill_gap_bytes"
$restoreGapGiB = if ($null -ne $restoreGapBytes) { [math]::Round(($restoreGapBytes / 1GB), 2) } else { $null }
$topReviewTargetGroup =
    if ($null -ne $topReviewTarget) {
        $groupValue = Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "ownership_group"
        if ([string]::IsNullOrWhiteSpace($groupValue)) {
            Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "group"
        } else {
            $groupValue
        }
    } elseif ($null -ne $oracleCleanup -and $null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) {
        Get-OptionalStringProperty -Object $oracleCleanup.review_pressure -PropertyName "top_target_group"
    } else {
        $null
    }
$topReviewTargetKnownSizeGiB =
    if ($null -ne $topReviewTarget) {
        $knownSize = Get-OptionalDoubleProperty -Object $topReviewTarget -PropertyName "known_size_gib"
        if ($null -eq $knownSize -and $null -ne $oracleCleanup -and $null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) {
            Get-OptionalDoubleProperty -Object $oracleCleanup.review_pressure -PropertyName "top_target_known_size_gib"
        } else {
            $knownSize
        }
    } elseif ($null -ne $oracleCleanup -and $null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) {
        Get-OptionalDoubleProperty -Object $oracleCleanup.review_pressure -PropertyName "top_target_known_size_gib"
    } else {
        $null
    }
$topReviewTargetGapClears =
    if ($null -ne $restoreGapBytes -and $null -ne $topReviewTargetKnownSizeGiB) {
        (($topReviewTargetKnownSizeGiB * 1GB) -ge $restoreGapBytes)
    } else {
        $null
    }
$omnyIdBackupRetentionTarget =
    if ($null -ne $oracleCleanup -and $null -ne $oracleCleanup.PSObject.Properties["review_targets"]) {
        @($oracleCleanup.review_targets | Where-Object { (Get-OptionalStringProperty -Object $_ -PropertyName "ownership_group") -eq "omnyid_backup_retention" } | Select-Object -First 1)
    } else {
        @()
    }
$omnyIdBackupRetentionTarget = @($omnyIdBackupRetentionTarget | Select-Object -First 1)
$omnyIdBackupRetentionKnownSizeGiB =
    if (@($omnyIdBackupRetentionTarget).Count -gt 0) {
        Get-OptionalDoubleProperty -Object $omnyIdBackupRetentionTarget[0] -PropertyName "known_size_gib"
    } else {
        $null
    }
$omnyIdOnlyGapClears =
    if ($null -ne $restoreGapBytes -and $null -ne $omnyIdBackupRetentionKnownSizeGiB) {
        (($omnyIdBackupRetentionKnownSizeGiB * 1GB) -ge $restoreGapBytes)
    } else {
        $null
    }
$combinedRetentionAndTopReviewGiB =
    if ($null -ne $topReviewTargetKnownSizeGiB -or $null -ne $omnyIdBackupRetentionKnownSizeGiB) {
        [math]::Round(((@($topReviewTargetKnownSizeGiB, $omnyIdBackupRetentionKnownSizeGiB) | Where-Object { $null -ne $_ } | Measure-Object -Sum).Sum), 6)
    } else {
        $null
    }
$combinedRetentionAndTopReviewClears =
    if ($null -ne $restoreGapBytes -and $null -ne $combinedRetentionAndTopReviewGiB) {
        (($combinedRetentionAndTopReviewGiB * 1GB) -ge $restoreGapBytes)
    } else {
        $null
    }
$restoreCapacityRecommendation =
    if ($null -eq $restoreGapBytes -or $restoreGapBytes -le 0) {
        $null
    } elseif ($true -eq $omnyIdOnlyGapClears) {
        "review the older OmnyID backup generations first; their known reclaim scope alone is enough to clear the restore-drill disk gap"
    } elseif ($true -eq $topReviewTargetGapClears) {
        "review the top non-runtime target '$topReviewTargetGroup' first; its known reclaim scope alone is enough to clear the restore-drill disk gap"
    } elseif ($true -eq $combinedRetentionAndTopReviewClears) {
        "candidate cleanup plus either older OmnyID backup retention alone or the top review target alone is not enough; the smallest currently known reclaim path is to combine older OmnyID backup retention with the top non-runtime review target"
    } else {
        "current known reclaim scope is still below the measured restore-drill disk gap; additional host cleanup or a larger Oracle volume is required before the drill can pass"
    }

$oracleRestoreProofStatus = Get-OptionalStringProperty -Object $oracleRestoreProof -PropertyName "status"
$oracleRestoreProofDrillStatus = Get-OptionalStringProperty -Object $oracleRestoreProof -PropertyName "restore_drill_status"
$oracleRestoreProofAgeHours =
    if ($null -ne $oracleRestoreProofGeneratedAtParsed) {
        [Math]::Round((([DateTimeOffset]::UtcNow - $oracleRestoreProofGeneratedAtParsed.ToUniversalTime()).TotalHours), 1)
    } else {
        $null
    }
$oracleRestoreProofFreshEnough =
    -not [string]::IsNullOrWhiteSpace($resolvedOracleRestoreProofPath) -and
    $null -ne $oracleRestoreProofAgeHours -and
    $oracleRestoreProofAgeHours -le $OracleRestoreProofMaxAgeHours
$oracleRestoreProofSatisfied =
    $null -ne $oracleRestoreProof -and
    $oracleRestoreProofStatus -eq "pass" -and
    $oracleRestoreProofDrillStatus -eq "pass" -and
    $oracleRestoreProofFreshEnough
$oracleRestoreDrillPolicyStatus =
    if ($oracleProof.restore_drill_status -eq "pass") {
        "current_proof_pass"
    } elseif ($oracleProof.restore_drill_status -eq "skipped" -and $oracleRestoreProofSatisfied) {
        "covered_by_recent_restore_proof"
    } elseif ($oracleProof.restore_drill_status -eq "skipped") {
        "restore_proof_required"
    } else {
        "current_proof_failed"
    }
$oracleRestoreDrillPolicyDetail =
    if ($oracleProof.restore_drill_status -eq "pass") {
        "current Oracle proof includes a successful restore drill"
    } elseif ($oracleProof.restore_drill_status -eq "skipped" -and $oracleRestoreProofSatisfied) {
        "current Oracle proof skipped the live restore drill, but a separate successful restore proof is available within the $OracleRestoreProofMaxAgeHours-hour window"
    } elseif ($oracleProof.restore_drill_status -eq "skipped") {
        "current Oracle proof skipped the live restore drill and no separate successful restore proof was found within the $OracleRestoreProofMaxAgeHours-hour window"
    } else {
        "current Oracle proof includes a failed or blocked restore drill"
    }

$criticalBlockers = New-Object System.Collections.Generic.List[string]
if ($oracleProof.status -ne "pass") {
    $criticalBlockers.Add("Oracle production proof is failing at '$($oracleProof.failure_step)'")
}
if ([int]$oracleProof.remote_root_use_pct -ge 98) {
    $criticalBlockers.Add("Oracle root filesystem is at $($oracleProof.remote_root_use_pct)% use")
}
if ($oracleProof.backup_verify_status -ne "pass") {
    $criticalBlockers.Add("Oracle backup verification is '$($oracleProof.backup_verify_status)'")
}
if (
    $oracleProof.restore_drill_status -ne "pass" -and
    -not ($oracleProof.restore_drill_status -eq "skipped" -and $oracleRestoreProofSatisfied)
) {
    if ($oracleProof.restore_drill_status -eq "skipped") {
        $criticalBlockers.Add("Oracle restore drill is 'skipped' and no recent successful restore proof is available")
    } else {
        $criticalBlockers.Add("Oracle restore drill is '$($oracleProof.restore_drill_status)'")
    }
}
if ((Test-HasProperty -Object $oracleProof -PropertyName "runtime_script_integrity_status") -and $oracleProof.runtime_script_integrity_status -ne "pass") {
    $criticalBlockers.Add("Oracle runtime script integrity is '$($oracleProof.runtime_script_integrity_status)'")
}
if ($oracleRepairSignal.kind -eq "postgres_wal_slot") {
    $criticalBlockers.Add("Oracle WAL slot remediation is required before the host can be treated as stable")
}
$storageOperationalHistoryPressureStatus =
    if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
        Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_pressure_status"
    } else {
        $null
    }
$storageOperationalHistoryPressureTotalRows =
    if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
        Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_pressure_total_rows"
    } else {
        $null
    }
$storageOperationalHistoryCleanupMode =
    if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
        Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_cleanup_mode"
    } else {
        $null
    }
if (
    $RequireExecutedOracleRemediation -and
    $storageOperationalHistoryPressureStatus -eq "operational_history_present" -and
    $null -ne $storageOperationalHistoryPressureTotalRows -and
    $storageOperationalHistoryPressureTotalRows -ge 10000 -and
    $storageOperationalHistoryCleanupMode -ne "executed"
) {
    $effectiveOperationalHistoryCleanupMode =
        if (-not [string]::IsNullOrWhiteSpace($storageOperationalHistoryCleanupMode)) {
            $storageOperationalHistoryCleanupMode
        } else {
            "not_recorded"
        }
    $criticalBlockers.Add("Oracle operational-history cleanup is '$effectiveOperationalHistoryCleanupMode' while $storageOperationalHistoryPressureTotalRows bounded log rows remain under pressure")
}
if ([int]$personalOs.counts.not_started -gt 0) {
    $criticalBlockers.Add("personalOS has $($personalOs.counts.not_started) phases not started")
}
if ([int]$personalOs.counts.partial -gt 0) {
    $criticalBlockers.Add("personalOS has $($personalOs.counts.partial) partial phases")
}
$personalOsOpenTaskCount = $null
if ($null -ne $personalOsTotalTasks -and $personalOsTotalTasks -gt 0) {
    $personalOsOpenTaskCount = $personalOsPartialTasks + $personalOsNotStartedTasks
    if ($personalOsOpenTaskCount -gt 0) {
        $criticalBlockers.Add("personalOS has $personalOsOpenTaskCount open tasks ($personalOsPartialTasks partial, $personalOsNotStartedTasks not started)")
    }
}
if ($null -ne $personalOsResidualOpenItems -and $personalOsResidualOpenItems -gt 0) {
    $criticalBlockers.Add("personalOS has $personalOsResidualOpenItems residual phase-level blockers")
}
if ($evidenceConsistencyStatus -eq "warn" -and -not $hasContemporaneousHighPressureRootDrift) {
    $criticalBlockers.Add("Oracle readiness evidence is inconsistent across proof, inventory, or cleanup-plan artifacts")
}
if ($null -eq $releaseReadiness) {
    $criticalBlockers.Add("release readiness artifact is missing")
} elseif (
    (Test-HasProperty -Object $releaseReadiness -PropertyName "status") -and
    [string]$releaseReadiness.status -ne "pass"
) {
    $criticalBlockers.Add("release readiness is '$([string]$releaseReadiness.status)'")
}
if (
    $null -ne $releaseReadiness -and
    (Test-HasProperty -Object $releaseReadiness -PropertyName "frontend_bundle_warning_count") -and
    $null -ne $releaseReadiness.frontend_bundle_warning_count -and
    [int]$releaseReadiness.frontend_bundle_warning_count -gt $MaxFrontendBundleWarnings
) {
    $criticalBlockers.Add(
        "frontend bundle warning count $([int]$releaseReadiness.frontend_bundle_warning_count) exceeds allowed threshold $MaxFrontendBundleWarnings"
    )
}
if (
    $RequireExecutedOracleRemediation -and
    $null -ne $oracleRemediation -and
    (Test-HasProperty -Object $oracleRemediation -PropertyName "remediation_summary") -and
    $null -ne $oracleRemediation.remediation_summary
) {
    $cleanupMode = Get-OptionalStringProperty -Object $oracleRemediation.remediation_summary -PropertyName "cleanup_mode"
    $remediationOutcome = Get-OptionalStringProperty -Object $oracleRemediation.remediation_summary -PropertyName "outcome"
    if ($cleanupMode -ne "executed") {
        $criticalBlockers.Add("oracle remediation cleanup mode is '$cleanupMode' and does not satisfy executed-remediation policy")
    }
    if ($remediationOutcome -eq "proof_not_rechecked") {
        $criticalBlockers.Add("oracle remediation outcome is 'proof_not_rechecked' and does not satisfy executed-remediation policy")
    }
}

$oracleProofFreshness = Get-ArtifactFreshnessSummary -Name "oracle_proof" -Path $resolvedOracleProofPath -GeneratedAt $oracleProofGeneratedAt
$oracleRestoreProofFreshness = Get-ArtifactFreshnessSummary -Name "oracle_restore_proof" -Path $resolvedOracleRestoreProofPath -GeneratedAt $oracleRestoreProofGeneratedAt
$oracleInventoryFreshness = Get-ArtifactFreshnessSummary -Name "oracle_inventory" -Path $resolvedOracleInventoryPath -GeneratedAt $oracleInventoryGeneratedAt
$oracleCleanupPlanFreshness = Get-ArtifactFreshnessSummary -Name "oracle_cleanup_plan" -Path $resolvedOracleCleanupPlanPath -GeneratedAt $oracleCleanupPlanGeneratedAt
$oracleCleanupExecuteFreshness = Get-ArtifactFreshnessSummary -Name "oracle_cleanup_execute" -Path $resolvedOracleCleanupExecutePath -GeneratedAt $oracleCleanupExecuteGeneratedAt
$oracleRemediationFreshness = Get-ArtifactFreshnessSummary -Name "oracle_remediation" -Path $resolvedOracleRemediationPath -GeneratedAt $oracleRemediationGeneratedAt
$personalOsFreshness = Get-ArtifactFreshnessSummary -Name "personalos_audit" -Path $resolvedPersonalOsAuditPath -GeneratedAt $personalOsGeneratedAt
$staleArtifactNames = @(
    @(
        $oracleProofFreshness,
        $oracleRestoreProofFreshness,
        $oracleInventoryFreshness,
        $oracleCleanupPlanFreshness,
        $oracleCleanupExecuteFreshness,
        $oracleRemediationFreshness,
        $personalOsFreshness
    ) |
        Where-Object { $null -ne $_ -and $null -ne $_.stale -and $_.stale } |
        ForEach-Object { [string]$_.name }
)
foreach ($staleArtifactName in $staleArtifactNames) {
    $criticalBlockers.Add("readiness artifact '$staleArtifactName' is stale")
}
if ($null -ne $oracleCleanupExecute -and $oracleCleanupExecuteOlderThanCleanupPlan) {
    $criticalBlockers.Add("oracle cleanup execution preview predates the current cleanup plan")
}

$status = if ($criticalBlockers.Count -eq 0) { "ready" } else { "not_ready" }
$snapshotGeneratedAt = [DateTime]::UtcNow.ToString("o")
$cleanupExecutePreviewCurrentWithPlan = ($null -ne $oracleCleanupExecute -and -not $oracleCleanupExecuteOlderThanCleanupPlan)
$safeNowCleanupKnownSizeGiB =
    if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["group_summary"]) {
        $safeNowGroups = @($storageHygiene.oracle.group_summary | Where-Object {
            $null -ne $_ -and
            $null -ne $_.PSObject.Properties["safe_to_delete_now"] -and
            [bool]$_.safe_to_delete_now -and
            $null -ne $_.PSObject.Properties["required_on_oracle"] -and
            -not [bool]$_.required_on_oracle
        })
        if ($safeNowGroups.Count -gt 0) {
            [math]::Round((($safeNowGroups | Measure-Object -Property known_size_gib -Sum).Sum), 6)
        } else {
            $null
        }
    } else {
        $null
    }
$safeNowOnlyGapClears =
    if ($null -ne $restoreGapGiB -and $null -ne $safeNowCleanupKnownSizeGiB) {
        [double]$safeNowCleanupKnownSizeGiB -ge [double]$restoreGapGiB
    } else {
        $null
    }
$safeNowRemainingGapGiB =
    if ($null -ne $restoreGapGiB -and $null -ne $safeNowCleanupKnownSizeGiB) {
        [math]::Round([math]::Max(0, ([double]$restoreGapGiB - [double]$safeNowCleanupKnownSizeGiB)), 6)
    } else {
        $null
    }
$walSlotDryRunHint = if ($null -ne $remediationSummaryForSnapshot) { Get-OptionalStringProperty -Object $remediationSummaryForSnapshot -PropertyName "wal_slot_dry_run_hint" } else { $null }
$walSlotExecuteHint = if ($null -ne $remediationSummaryForSnapshot) { Get-OptionalStringProperty -Object $remediationSummaryForSnapshot -PropertyName "wal_slot_execute_hint" } else { $null }
$walSlotPhaseOneCommand =
    if (-not [string]::IsNullOrWhiteSpace($walSlotExecuteHint)) {
        $walSlotExecuteHint
    } else {
        "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediate-electric-slot-current -RestartElectric -ApplyWalLimit -Execute"
    }
$walSlotFollowThroughCommand = "$walSlotPhaseOneCommand ; $detachedOracleProofCurrentCommand ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
$storageOperationalHistoryCleanupCommand =
    if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
        Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_cleanup_command"
    } else {
        $null
    }
$operationalHistoryStrictCleanupRequired =
    $RequireExecutedOracleRemediation -and
    $storageOperationalHistoryPressureStatus -eq "operational_history_present" -and
    $null -ne $storageOperationalHistoryPressureTotalRows -and
    $storageOperationalHistoryPressureTotalRows -ge 10000 -and
    $storageOperationalHistoryCleanupMode -ne "executed"
$operationalHistoryCleanupFollowThroughCommand =
    if ($operationalHistoryStrictCleanupRequired -and -not [string]::IsNullOrWhiteSpace($storageOperationalHistoryCleanupCommand)) {
        "$storageOperationalHistoryCleanupCommand ; $detachedOracleProofCurrentCommand ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    } else {
        $null
    }

$snapshot = [pscustomobject]@{
    generated_at = $snapshotGeneratedAt
    policy = [pscustomobject]@{
        max_frontend_bundle_warnings = $MaxFrontendBundleWarnings
        require_executed_oracle_remediation = [bool]$RequireExecutedOracleRemediation
        accepted_frontend_bundle_warning_count =
            if ($null -ne $releaseReadiness -and (Test-HasProperty -Object $releaseReadiness -PropertyName "frontend_bundle_warning_count") -and $null -ne $releaseReadiness.frontend_bundle_warning_count) {
                [int]$releaseReadiness.frontend_bundle_warning_count
            } else {
                $null
            }
        accepted_frontend_bundle_warning_threshold_met =
            if ($null -ne $releaseReadiness -and (Test-HasProperty -Object $releaseReadiness -PropertyName "frontend_bundle_warning_count") -and $null -ne $releaseReadiness.frontend_bundle_warning_count) {
                ([int]$releaseReadiness.frontend_bundle_warning_count -le $MaxFrontendBundleWarnings)
            } else {
                $false
            }
        oracle_remediation_execution_policy_met =
            if (-not $RequireExecutedOracleRemediation) {
                $true
            } elseif ($null -ne $oracleRemediation -and (Test-HasProperty -Object $oracleRemediation -PropertyName "remediation_summary") -and $null -ne $oracleRemediation.remediation_summary) {
                (
                    (Get-OptionalStringProperty -Object $oracleRemediation.remediation_summary -PropertyName "cleanup_mode") -eq "executed" -and
                    (Get-OptionalStringProperty -Object $oracleRemediation.remediation_summary -PropertyName "outcome") -ne "proof_not_rechecked"
                )
            } else {
                $false
            }
    }
    commercial_readiness = [pscustomobject]@{
        status = $status
        blocker_count = $criticalBlockers.Count
        blockers = $criticalBlockers.ToArray()
    }
    oracle = [pscustomobject]@{
        remote_host = $oracleProof.remote_host
        proof_status = $oracleProof.status
        failure_step = $oracleProof.failure_step
        failure_reason = $oracleProof.failure_reason
        remote_root_use_pct = [int]$oracleProof.remote_root_use_pct
        remote_var_use_pct = [int]$oracleProof.remote_var_use_pct
        proof_generated_at = $oracleProofGeneratedAt
        inventory_generated_at = $oracleInventoryGeneratedAt
        cleanup_plan_generated_at = $oracleCleanupPlanGeneratedAt
        remediation_generated_at = $oracleRemediationGeneratedAt
        latest_archive = Get-OptionalStringProperty -Object $oracleProof -PropertyName "latest_archive"
        latest_archive_age_days = if ($oracleProof.latest_archive_age_days -match '^\d+$') { [int]$oracleProof.latest_archive_age_days } else { $null }
        inventory_root_mount = if ($null -ne $inventoryRootDisk) { [string]$inventoryRootDisk.mount } else { $null }
        inventory_root_size = if ($null -ne $inventoryRootDisk) { [string]$inventoryRootDisk.size } else { $null }
        inventory_root_used = if ($null -ne $inventoryRootDisk) { [string]$inventoryRootDisk.used } else { $null }
        inventory_root_avail = if ($null -ne $inventoryRootDisk) { [string]$inventoryRootDisk.avail } else { $null }
        inventory_root_use_pct = $inventoryRootUsePct
        runtime_script_integrity_status = if (Test-HasProperty -Object $oracleProof -PropertyName "runtime_script_integrity_status") { $oracleProof.runtime_script_integrity_status } else { $null }
        runtime_script_integrity_detail = if (Test-HasProperty -Object $oracleProof -PropertyName "runtime_script_integrity_detail") { Get-OptionalStringProperty -Object $oracleProof -PropertyName "runtime_script_integrity_detail" } else { $null }
        missing_runtime_scripts = [string[]]@(Get-OptionalStringArrayProperty -Object $oracleProof -PropertyName "missing_runtime_scripts")
        backup_verify_status = $oracleProof.backup_verify_status
        backup_verify_detail = Get-OptionalStringProperty -Object $oracleProof -PropertyName "backup_verify_detail"
        restore_drill_status = $oracleProof.restore_drill_status
        restore_drill_detail = Get-OptionalStringProperty -Object $oracleProof -PropertyName "restore_drill_detail"
        restore_drill_policy_status = $oracleRestoreDrillPolicyStatus
        restore_drill_policy_detail = $oracleRestoreDrillPolicyDetail
        restore_drill_proof_path = $resolvedOracleRestoreProofPath
        restore_drill_proof_generated_at = $oracleRestoreProofGeneratedAt
        restore_drill_proof_age_hours = $oracleRestoreProofAgeHours
        restore_drill_proof_stale = if ($null -ne $oracleRestoreProofFreshness) { $oracleRestoreProofFreshness.stale } else { $null }
        restore_drill_proof_status = $oracleRestoreProofStatus
        restore_drill_proof_restore_status = $oracleRestoreProofDrillStatus
        restore_drill_proof_max_age_hours = $OracleRestoreProofMaxAgeHours
        restore_drill_free_root_bytes = Get-OptionalDoubleProperty -Object $oracleProof -PropertyName "restore_drill_free_root_bytes"
        restore_drill_required_bytes = Get-OptionalDoubleProperty -Object $oracleProof -PropertyName "restore_drill_required_bytes"
        restore_drill_source_db_bytes = Get-OptionalDoubleProperty -Object $oracleProof -PropertyName "restore_drill_source_db_bytes"
        restore_drill_gap_bytes = Get-OptionalDoubleProperty -Object $oracleProof -PropertyName "restore_drill_gap_bytes"
        restore_drill_gap_gib = $restoreGapGiB
        candidate_cleanup_items = [int]$oracleInventory.counts.candidate_cleanup_items
        candidate_cleanup_image_gib = [double]$oracleInventory.counts.candidate_cleanup_image_gib
        candidate_cleanup_containers = [int]$oracleCleanup.counts.candidate_containers
        candidate_cleanup_volumes = [int]$oracleCleanup.counts.candidate_volumes
        candidate_cleanup_images = [int]$oracleCleanup.counts.candidate_images
        cleanup_plan_total_candidate_gib = if ($null -ne $oracleCleanup.PSObject.Properties["estimated_reclaim"]) { Get-OptionalDoubleProperty -Object $oracleCleanup.estimated_reclaim -PropertyName "total_candidate_gib" } else { $null }
        cleanup_plan_disk_pressure_status = if ($null -ne $oracleCleanup.PSObject.Properties["disk_pressure"]) { Get-OptionalStringProperty -Object $oracleCleanup.disk_pressure -PropertyName "status" } else { $null }
        cleanup_plan_disk_pressure_summary = if ($null -ne $oracleCleanup.PSObject.Properties["disk_pressure"]) { Get-OptionalStringProperty -Object $oracleCleanup.disk_pressure -PropertyName "summary" } else { $null }
        cleanup_plan_classification_mode = Get-OptionalStringProperty -Object $oracleCleanup -PropertyName "classification_mode"
        cleanup_plan_projected_root_use_pct = if ($null -ne $oracleCleanup.PSObject.Properties["disk_pressure"]) { Get-OptionalIntProperty -Object $oracleCleanup.disk_pressure -PropertyName "projected_root_use_pct_after_candidate_cleanup" } else { $null }
        review_target_group = if ($null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) { Get-OptionalStringProperty -Object $oracleCleanup.review_pressure -PropertyName "top_target_group" } else { $null }
        review_target_known_size_gib = if ($null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) { Get-OptionalDoubleProperty -Object $oracleCleanup.review_pressure -PropertyName "top_target_known_size_gib" } else { $null }
        review_target_review_count = if ($null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) { Get-OptionalIntProperty -Object $oracleCleanup.review_pressure -PropertyName "top_target_review_count" } else { $null }
        review_target_recommended_action = if ($null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) { Get-OptionalStringProperty -Object $oracleCleanup.review_pressure -PropertyName "recommended_action" } else { $null }
        restore_capacity_safe_now_cleanup_gib = $safeNowCleanupKnownSizeGiB
        restore_capacity_safe_now_only_clears_gap = $safeNowOnlyGapClears
        restore_capacity_safe_now_remaining_gap_gib = $safeNowRemainingGapGiB
        restore_capacity_top_review_target_clears_gap = $topReviewTargetGapClears
        restore_capacity_omnyid_backup_retention_gib = $omnyIdBackupRetentionKnownSizeGiB
        restore_capacity_omnyid_only_clears_gap = $omnyIdOnlyGapClears
        restore_capacity_combined_retention_and_top_review_gib = $combinedRetentionAndTopReviewGiB
        restore_capacity_combined_retention_and_top_review_clears_gap = $combinedRetentionAndTopReviewClears
        restore_capacity_recommendation = $restoreCapacityRecommendation
        omnyid_backup_retention_cleanup_command = if ($null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) { Get-OptionalStringProperty -Object $oracleCleanup.review_pressure -PropertyName "omnyid_backup_retention_cleanup_command" } else { $null }
        combined_retention_and_top_target_cleanup_command = if ($null -ne $oracleCleanup.PSObject.Properties["review_pressure"]) { Get-OptionalStringProperty -Object $oracleCleanup.review_pressure -PropertyName "combined_retention_and_top_target_cleanup_command" } else { $null }
        review_target_stop_and_remove_containers = if ($null -ne $topReviewTarget) { Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "stop_and_remove_containers" } else { $null }
        review_target_remove_volumes = if ($null -ne $topReviewTarget) { Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "remove_volumes" } else { $null }
        review_target_remove_images = if ($null -ne $topReviewTarget) { Get-OptionalStringProperty -Object $topReviewTarget -PropertyName "remove_images" } else { $null }
        review_target_cleanup_command = $topReviewTargetCleanupCommand
        postgres_wal_pressure_status = if ($null -ne $postgresWalPressure) { Get-OptionalStringProperty -Object $postgresWalPressure -PropertyName "status" } else { $null }
        postgres_wal_pressure_summary = if ($null -ne $postgresWalPressure) { Get-OptionalStringProperty -Object $postgresWalPressure -PropertyName "summary" } else { $null }
        postgres_wal_pressure_recommended_action = if ($null -ne $postgresWalPressure) { Get-OptionalStringProperty -Object $postgresWalPressure -PropertyName "recommended_action" } else { $null }
        postgres_wal_safe_limit_recommendation_gib = if ($null -ne $postgresWalPressure) { Get-OptionalDoubleProperty -Object $postgresWalPressure -PropertyName "safe_limit_recommendation_gib" } else { $null }
        postgres_wal_gib = if ($null -ne $postgresWalPressure) { Get-OptionalDoubleProperty -Object $postgresWalPressure -PropertyName "pg_wal_gib" } else { $null }
        electric_slot_name = if ($null -ne $postgresWalPressure) { Get-OptionalStringProperty -Object $postgresWalPressure -PropertyName "electric_slot_name" } else { $null }
        electric_slot_active = if ($null -ne $postgresWalPressure -and $null -ne $postgresWalPressure.PSObject.Properties["electric_slot_active"]) { [bool]$postgresWalPressure.electric_slot_active } else { $null }
        electric_slot_retained_wal_gib = if ($null -ne $postgresWalPressure) { Get-OptionalDoubleProperty -Object $postgresWalPressure -PropertyName "electric_slot_retained_wal_gib" } else { $null }
        runtime_repair_kind = $oracleRepairSignal.kind
        runtime_repair_required = $oracleRepairSignal.required
        runtime_repair_reason = $oracleRepairSignal.reason
        runtime_repair_recommended_action = $oracleRepairSignal.recommended_action
        runtime_repair_blocks_backup_verify = $oracleRepairSignal.blocks_backup_verify
        runtime_repair_blocks_restore_drill = $oracleRepairSignal.blocks_restore_drill
        cleanup_execute_available = $null -ne $oracleCleanupExecute
        cleanup_execute_generated_at = $oracleCleanupExecuteGeneratedAt
        cleanup_execute_current_with_plan = $cleanupExecutePreviewCurrentWithPlan
        cleanup_execute_stale_relative_to_plan = $oracleCleanupExecuteOlderThanCleanupPlan
        cleanup_execute_step_count = if ($cleanupExecutePreviewCurrentWithPlan) { @($oracleCleanupExecute.steps).Count } else { $null }
        cleanup_execute_step_names = if ($cleanupExecutePreviewCurrentWithPlan) { @($oracleCleanupExecute.steps | ForEach-Object { if ($null -ne $_.name) { [string]$_.name } }) } else { @() }
        cleanup_execute_preview_commands = if ($cleanupExecutePreviewCurrentWithPlan) { @($oracleCleanupExecute.steps | ForEach-Object { if ($null -ne $_.command) { [string]$_.command } }) } else { @() }
        remediation_current_with_inputs = $remediationCurrentWithInputs
        remediation_stale_relative_to_inputs = $remediationStaleRelativeToInputs
        staged_runtime_path_count = if ($null -ne $stageManifest) { [int]$stageManifest.copied_path_count } else { $null }
        staged_runtime_gib = if ($null -ne $stageManifest) { [double]$stageManifest.total_staged_gib } else { $null }
        staged_runtime_manifest_path = $resolvedStageManifestPath
        local_stage_manifest_present = [bool]$stageManifestIntegrity.manifest_present
        local_stage_required_runtime_scripts_count = $stageManifestIntegrity.required_runtime_scripts_count
        local_stage_missing_required_scripts = @($stageManifestIntegrity.missing_required_scripts | ForEach-Object { [string]$_ })
        local_stage_runtime_script_integrity_status = $stageManifestIntegrity.integrity_status
        local_stage_runtime_script_integrity_detail = $stageManifestIntegrity.integrity_detail
        remediation_stale = $remediationStaleRelativeToInputs
        remediation_outcome = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.outcome } else { $null }
        remediation_cleanup_mode = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.cleanup_mode } else { $null }
        remediation_cleanup_step_count = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.cleanup_step_count } else { $null }
        remediation_planned_candidate_containers = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.planned_candidate_containers } else { $null }
        remediation_planned_candidate_volumes = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.planned_candidate_volumes } else { $null }
        remediation_planned_candidate_images = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.planned_candidate_images } else { $null }
        remediation_baseline_root_use_pct = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.baseline_root_use_pct } else { $null }
        remediation_final_root_use_pct = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.final_root_use_pct } else { $null }
        remediation_root_use_delta_pct = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.root_use_delta_pct } else { $null }
        remediation_baseline_backup_verify_status = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.baseline_backup_verify_status } else { $null }
        remediation_final_backup_verify_status = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.final_backup_verify_status } else { $null }
        remediation_baseline_restore_drill_status = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.baseline_restore_drill_status } else { $null }
        remediation_final_restore_drill_status = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.final_restore_drill_status } else { $null }
        remediation_baseline_blocker = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.baseline_blocker } else { $null }
        remediation_final_blocker = if ($null -ne $remediationSummaryForSnapshot) { $remediationSummaryForSnapshot.final_blocker } else { $null }
        safe_now_cleanup_execute_hint = if ($oracleRepairSignal.kind -eq "postgres_wal_slot") {
            $walSlotPhaseOneCommand
        } else {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute"
        }
        safe_now_cleanup_follow_through_command = if ($oracleRepairSignal.kind -eq "postgres_wal_slot") {
            $walSlotFollowThroughCommand
        } else {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute ; $detachedOracleProofCurrentCommand ; ./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current ; ./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
        }
        phase_two_cleanup_execute_hint = if ($oracleRepairSignal.kind -eq "postgres_wal_slot") {
            $null
        } elseif ($oracleRepairSignal.kind -eq "targeted_cleanup" -or $oracleRepairSignal.kind -eq "review_target_cleanup") {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute"
        } elseif ($null -ne $remediationSummaryForSnapshot -and $remediationSummaryForSnapshot.outcome -eq "combined_review_cleanup_required") {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeCombinedReviewCleanup -Execute"
        } elseif ($null -ne $remediationSummaryForSnapshot -and $remediationSummaryForSnapshot.outcome -eq "backup_retention_cleanup_required") {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeBackupRetentionCleanup -Execute"
        } elseif ($null -ne $remediationSummaryForSnapshot -and $remediationSummaryForSnapshot.outcome -eq "top_review_cleanup_required") {
            "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -IncludeReviewTargetCleanup -Execute"
        } else {
            $null
        }
    }
    oracle_evidence_consistency = [pscustomobject]@{
        status = $evidenceConsistencyStatus
        summary = $evidenceConsistencySummary
        blocks_readiness = ($evidenceConsistencyStatus -eq "warn" -and -not $hasContemporaneousHighPressureRootDrift)
        nonblocking_high_pressure_root_drift = $hasContemporaneousHighPressureRootDrift
        item_count = $evidenceConsistencyItems.Count
        items = @($evidenceConsistencyItems)
    }
    personalos = [pscustomobject]@{
        generated_at = $personalOsGeneratedAt
        total_phases = [int]$personalOs.counts.total_phases
        implemented = [int]$personalOs.counts.implemented
        partial = [int]$personalOs.counts.partial
        not_started = [int]$personalOs.counts.not_started
        total_tasks = $personalOsTotalTasks
        implemented_tasks = $personalOsImplementedTasks
        partial_tasks = $personalOsPartialTasks
        not_started_tasks = $personalOsNotStartedTasks
        residual_open_items = $personalOsResidualOpenItems
        open_phase_titles = @($personalOs.phases | Where-Object { $_.status -ne "implemented" } | ForEach-Object { "Phase $($_.phase_number): $($_.title) [$($_.status)]" })
        prioritized_open_phases = @($personalOsOpenPhaseSummaries | Select-Object -First 8 | ForEach-Object { "Phase $($_.phase_number): $($_.phase_title) ($($_.total_open_item_count) open = $($_.open_task_count) tasks + $($_.residual_open_item_count) residual)" })
        residual_phase_summaries = @($personalOsResidualPhaseSummaries)
        top_open_tasks = if (@($personalOsTaskItems).Count -gt 0) {
            @($personalOsTaskItems | Select-Object -First 12 | ForEach-Object { "Phase $($_.phase_number) / Task $($_.task_number): $($_.text) [$($_.status)]" })
        } elseif (@($personalOsOpenTasks).Count -gt 0) {
            @($personalOsOpenTasks | Select-Object -First 12 | ForEach-Object { "Phase $($_.phase_number) / Task $($_.task_number): $($_.text) [$($_.status)]" })
        } else {
            @()
        }
        top_residual_items = if (@($personalOsResidualItems).Count -gt 0) {
            @($personalOsResidualItems | Select-Object -First 12 | ForEach-Object { "Phase $($_.phase_number) / Residual: $($_.text) [$($_.status)]" })
        } elseif (@($personalOsOpenTasks).Count -gt 0) {
            @()
        } else {
            @()
        }
    }
    storage = [pscustomobject]@{
        artifact_present = ($null -ne $storageHygiene)
        local_safe_delete_count = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.local) { Get-OptionalIntProperty -Object $storageHygiene.local -PropertyName "safe_delete_count" } else { $null }
        local_safe_delete_gib = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.local) { Get-OptionalDoubleProperty -Object $storageHygiene.local -PropertyName "safe_delete_gib" } else { $null }
        top_local_delete_candidates = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.local -and $null -ne $storageHygiene.local.PSObject.Properties["recommended_delete_order"]) {
            @($storageHygiene.local.recommended_delete_order | Select-Object -First 5 | ForEach-Object { [string]$_.relative_path })
        } else {
            @()
        }
        oracle_safe_cleanup_group_count = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["group_summary"]) {
            @($storageHygiene.oracle.group_summary | Where-Object { [bool]$_.safe_to_delete_now }).Count
        } else {
            $null
        }
        oracle_safe_cleanup_gib = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["group_summary"]) {
            $safeOracleCleanupGiB = (
                @($storageHygiene.oracle.group_summary | Where-Object { [bool]$_.safe_to_delete_now } | Measure-Object -Property known_size_gib -Sum).Sum
            )
            if ($null -eq $safeOracleCleanupGiB) { 0 } else { [math]::Round([double]$safeOracleCleanupGiB, 6) }
        } else {
            $null
        }
        oracle_review_required_group_count = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["group_summary"]) {
            @($storageHygiene.oracle.group_summary | Where-Object { -not [bool]$_.required_on_oracle -and -not [bool]$_.safe_to_delete_now }).Count
        } else {
            $null
        }
        oracle_review_required_gib = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["group_summary"]) {
            $reviewRequiredOracleGiB = (
                @($storageHygiene.oracle.group_summary | Where-Object { -not [bool]$_.required_on_oracle -and -not [bool]$_.safe_to_delete_now } | Measure-Object -Property known_size_gib -Sum).Sum
            )
            if ($null -eq $reviewRequiredOracleGiB) { 0 } else { [math]::Round([double]$reviewRequiredOracleGiB, 6) }
        } else {
            $null
        }
        oracle_runtime_required_group_count = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["runtime_required_group_count"]) {
            [int]$storageHygiene.oracle.runtime_required_group_count
        } else {
            $null
        }
        oracle_runtime_required_gib = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["runtime_required_known_gib"]) {
            [double]$storageHygiene.oracle.runtime_required_known_gib
        } else {
            $null
        }
        top_oracle_runtime_required_groups = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["runtime_keep_group_names"]) {
            @($storageHygiene.oracle.runtime_keep_group_names | Select-Object -First 5 | ForEach-Object { [string]$_ })
        } else {
            @()
        }
        top_oracle_delete_priority_groups = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["delete_priority"]) {
            @($storageHygiene.oracle.delete_priority | Select-Object -First 5 | ForEach-Object { [string]$_.ownership_group })
        } else {
            @()
        }
        top_oracle_safe_cleanup_group = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["delete_priority"]) {
            $topSafeOracleCleanup = @($storageHygiene.oracle.delete_priority | Where-Object { [bool]$_.safe_to_delete_now } | Select-Object -First 1)
            if ($topSafeOracleCleanup.Count -gt 0) { [string]$topSafeOracleCleanup[0].ownership_group } else { $null }
        } else {
            $null
        }
        top_oracle_safe_cleanup_gib = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["delete_priority"]) {
            $topSafeOracleCleanup = @($storageHygiene.oracle.delete_priority | Where-Object { [bool]$_.safe_to_delete_now } | Select-Object -First 1)
            if ($topSafeOracleCleanup.Count -gt 0 -and $null -ne $topSafeOracleCleanup[0].known_size_gib) { [double]$topSafeOracleCleanup[0].known_size_gib } else { $null }
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_mode = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_mode"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_status = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_status"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_summary = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_summary"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_total_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_total_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_maintenance_summary_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_maintenance_summary_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_curator_card_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_curator_card_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_curator_backlink_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_curator_backlink_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_pressure_ingestion_topology_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_pressure_ingestion_topology_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_command = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_command"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_deleted_total = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_deleted_total"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_before_total_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_before_total_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_after_total_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_after_total_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_before_maintenance_summary_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_before_maintenance_summary_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_before_curator_card_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_before_curator_card_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_before_curator_backlink_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_before_curator_backlink_dupes"
        } else {
            $null
        }
        oracle_synthetic_message_cleanup_before_ingestion_topology_dupes = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "synthetic_message_cleanup_before_ingestion_topology_dupes"
        } else {
            $null
        }
        oracle_operational_history_pressure_status = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_pressure_status"
        } else {
            $null
        }
        oracle_operational_history_pressure_total_rows = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_pressure_total_rows"
        } else {
            $null
        }
        oracle_operational_history_cleanup_mode = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalStringProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_cleanup_mode"
        } else {
            $null
        }
        oracle_operational_history_cleanup_command = $storageOperationalHistoryCleanupCommand
        oracle_operational_history_cleanup_follow_through_command = $operationalHistoryCleanupFollowThroughCommand
        oracle_operational_history_cleanup_deleted_total = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_cleanup_deleted_total"
        } else {
            $null
        }
        oracle_operational_history_cleanup_before_total_rows = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_cleanup_before_total_rows"
        } else {
            $null
        }
        oracle_operational_history_cleanup_after_total_rows = if ($null -ne $storageHygiene -and $null -ne $storageHygiene.oracle -and $null -ne $storageHygiene.oracle.PSObject.Properties["summary"]) {
            Get-OptionalIntProperty -Object $storageHygiene.oracle.summary -PropertyName "operational_history_cleanup_after_total_rows"
        } else {
            $null
        }
        oracle_cloud_deployment_matrix = @(Get-OracleCloudDeploymentMatrix -StorageHygiene $storageHygiene)
    }
    release_readiness = [pscustomobject]@{
        artifact_present = ($null -ne $releaseReadiness)
        status = if ($null -ne $releaseReadiness) { Get-OptionalStringProperty -Object $releaseReadiness -PropertyName "status" } else { $null }
        generated_at = $releaseReadinessGeneratedAt
        frontend_bundle_warning_count = if ($null -ne $releaseReadiness) { Get-OptionalIntProperty -Object $releaseReadiness -PropertyName "frontend_bundle_warning_count" } else { $null }
        frontend_bundle_note_count = if ($null -ne $releaseReadiness) { Get-OptionalIntProperty -Object $releaseReadiness -PropertyName "frontend_bundle_note_count" } else { $null }
        frontend_bundle_report = if ($null -ne $releaseReadiness -and $null -ne $releaseReadiness.PSObject.Properties["artifact_paths"] -and $null -ne $releaseReadiness.artifact_paths) {
            Get-OptionalStringProperty -Object $releaseReadiness.artifact_paths -PropertyName "frontend_bundle_report"
        } else {
            $null
        }
    }
    artifact_paths = [pscustomobject]@{
        oracle_proof = $resolvedOracleProofPath
        oracle_inventory = $resolvedOracleInventoryPath
        oracle_cleanup_plan = $resolvedOracleCleanupPlanPath
        oracle_cleanup_execute = $resolvedOracleCleanupExecutePath
        oracle_remediation = $resolvedOracleRemediationPath
        oracle_wal_slot_remediation = $resolvedOracleWalSlotRemediationPath
        oracle_synthetic_cleanup = $resolvedOracleSyntheticCleanupPath
        oracle_operational_history_cleanup = $resolvedOracleOperationalHistoryCleanupPath
        release_readiness = $resolvedReleaseReadinessPath
        personalos_audit = $resolvedPersonalOsAuditPath
        stage_manifest = $resolvedStageManifestPath
        storage_hygiene = $resolvedStorageHygienePath
    }
    artifact_freshness = [pscustomobject]@{
        oracle_proof = $oracleProofFreshness
        oracle_restore_proof = $oracleRestoreProofFreshness
        oracle_inventory = $oracleInventoryFreshness
        oracle_cleanup_plan = $oracleCleanupPlanFreshness
        oracle_cleanup_execute = $oracleCleanupExecuteFreshness
        oracle_remediation = $oracleRemediationFreshness
        personalos_audit = $personalOsFreshness
        stale_artifact_names = @($staleArtifactNames)
    }
}

function Build-CommercialReadinessStatusMarkdown {
    param(
        [pscustomobject]$Snapshot,
        [pscustomobject]$OracleProof,
        [string]$GoNoGoStatus,
        [AllowNull()][pscustomobject]$ComparisonSnapshot = $null,
        [string]$ComparisonGoNoGoStatus = ""
    )

    $doc = New-Object System.Text.StringBuilder
    $partialTaskCount = if ($null -ne $Snapshot.personalos.partial_tasks) {
        [int]$Snapshot.personalos.partial_tasks
    } else {
        $null
    }
    $notStartedTaskCount = if ($null -ne $Snapshot.personalos.not_started_tasks) {
        [int]$Snapshot.personalos.not_started_tasks
    } else {
        $null
    }
    $openTaskCount = if ($null -ne $partialTaskCount -and $null -ne $notStartedTaskCount) {
        $partialTaskCount + $notStartedTaskCount
    } elseif ($null -ne $Snapshot.personalos.top_open_tasks) {
        @($Snapshot.personalos.top_open_tasks).Count
    } else {
        $null
    }
    $openTaskCountDisplay = if ($null -ne $openTaskCount) { $openTaskCount } else { "unknown" }
    $partialTaskCountDisplay = if ($null -ne $partialTaskCount) { $partialTaskCount } else { "unknown" }
    $notStartedTaskCountDisplay = if ($null -ne $notStartedTaskCount) { $notStartedTaskCount } else { "unknown" }
    $residualOpenItemCountDisplay = if ($null -ne $Snapshot.personalos.residual_open_items) { $Snapshot.personalos.residual_open_items } else { "unknown" }
    $staleArtifactNames = @($Snapshot.artifact_freshness.stale_artifact_names)
    $primaryLaneLabel = Get-CommercialReadinessLaneLabel -Policy $Snapshot.policy
    $hasComparisonSnapshot = $null -ne $ComparisonSnapshot
    $comparisonLaneLabel = if ($hasComparisonSnapshot) { Get-CommercialReadinessLaneLabel -Policy $ComparisonSnapshot.policy } else { $null }
    $refreshCommandParts = @("./scripts/production-readiness-refresh.ps1", "-OutDir artifacts/production-readiness-refresh")
    $refreshCommandNote = "That refresh now bundles the current Oracle remediation artifact as part of the output set. Add `-RefreshOracleRemediation` only when you want to regenerate the remediation-sequence artifact instead of copying the current audited one."
    $refreshOracleProof = "oracle_proof" -in $staleArtifactNames
    $refreshOracleInventory = "oracle_inventory" -in $staleArtifactNames
    $refreshOracleRemediation = "oracle_remediation" -in $staleArtifactNames
    if ($refreshOracleProof) {
        $refreshCommandParts += "-RefreshOracleProof"
    }
    if ($refreshOracleInventory) {
        $refreshCommandParts += "-RefreshOracleInventory"
    }
    if ($refreshOracleRemediation) {
        $refreshCommandParts += "-RefreshOracleRemediation"
    }
    $refreshCommand = $refreshCommandParts -join " "
    if ($staleArtifactNames.Count -gt 0) {
        $refreshCommandNote = 'Because the current stale readiness set is `' + ($staleArtifactNames -join ", ") + '`, this refresh command is expanded to regenerate the stale Oracle artifacts while always rerunning the local personalOS audit and runtime staging steps.'
    }
    $cleanupPlanPathForOperator = "artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json"
    $cleanupExecuteOutDirForOperator = "artifacts/oracle-runtime-cleanup-execute-current"
    $proofRerunCommand = $detachedOracleProofCurrentCommand
    $snapshotRefreshAfterProofCommand = "./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current"
    $gateRefreshAfterProofCommand = "./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current"
    $previewCleanupCommand = "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath $cleanupPlanPathForOperator -OutDir $cleanupExecuteOutDirForOperator"
    $safeNowCleanupCommand = Get-OptionalStringProperty -Object $Snapshot.oracle -PropertyName "safe_now_cleanup_follow_through_command"
    $walSlotSafeNowCleanupCommand = Get-OptionalStringProperty -Object $Snapshot.oracle -PropertyName "safe_now_cleanup_execute_hint"
    $operationalHistoryCleanupFollowThroughCommand = Get-OptionalStringProperty -Object $Snapshot.storage -PropertyName "oracle_operational_history_cleanup_follow_through_command"
    $previewCleanupCommandNote = $null
    $executeCleanupCommand = $null
    $executeCleanupCommandLabel = $null
    $phaseTwoCleanupCommand = $null
    $phaseTwoCleanupCommandLabel = $null
    $postCleanupFollowThroughCommand = "$proofRerunCommand ; $snapshotRefreshAfterProofCommand ; $gateRefreshAfterProofCommand"
    if ($Snapshot.oracle.runtime_repair_kind -eq "targeted_cleanup" -or $Snapshot.oracle.runtime_repair_kind -eq "review_target_cleanup") {
        $previewCleanupCommand = "$previewCleanupCommand -IncludeReviewTargetCleanup"
        $previewCleanupCommandNote = 'Because the current Oracle repair path is `' + $Snapshot.oracle.runtime_repair_kind + '`, the preview includes `-IncludeReviewTargetCleanup` so the generated command list covers the classified non-runtime review target as well as ordinary runtime cleanup.'
    }
    if ($Snapshot.oracle.runtime_repair_kind -eq "postgres_wal_slot") {
        $executeCleanupCommand = "$walSlotSafeNowCleanupCommand ; $postCleanupFollowThroughCommand"
        $executeCleanupCommandLabel = "Execute the Oracle WAL-slot remediation path, rerun proof, and refresh the gate:"
    } elseif ($Snapshot.oracle.runtime_repair_kind -eq "targeted_cleanup" -or $Snapshot.oracle.runtime_repair_kind -eq "review_target_cleanup") {
        $executeCleanupCommand = "$previewCleanupCommand -Execute ; $postCleanupFollowThroughCommand"
        $executeCleanupCommandLabel = "Execute the current Oracle cleanup path, rerun proof, and refresh the gate:"
    } elseif ($Snapshot.oracle.remediation_outcome -eq "combined_review_cleanup_required") {
        $executeCleanupCommand = "$previewCleanupCommand -IncludeCombinedReviewCleanup -Execute ; $postCleanupFollowThroughCommand"
        $executeCleanupCommandLabel = "Execute the combined cleanup path, rerun proof, and refresh the gate:"
        $phaseTwoCleanupCommand = $executeCleanupCommand
        $phaseTwoCleanupCommandLabel = "If the restore gap remains after the safe-now pass, execute the combined cleanup path, rerun proof, and refresh the gate:"
    } elseif ($Snapshot.oracle.remediation_outcome -eq "backup_retention_cleanup_required") {
        $executeCleanupCommand = "$previewCleanupCommand -IncludeBackupRetentionCleanup -Execute ; $postCleanupFollowThroughCommand"
        $executeCleanupCommandLabel = "Execute the backup-retention cleanup path, rerun proof, and refresh the gate:"
        $phaseTwoCleanupCommand = $executeCleanupCommand
        $phaseTwoCleanupCommandLabel = "If the restore gap remains after the safe-now pass, execute the backup-retention cleanup path, rerun proof, and refresh the gate:"
    } elseif ($Snapshot.oracle.remediation_outcome -eq "top_review_cleanup_required") {
        $executeCleanupCommand = "$previewCleanupCommand -IncludeReviewTargetCleanup -Execute ; $postCleanupFollowThroughCommand"
        $executeCleanupCommandLabel = "Execute the top review-target cleanup path, rerun proof, and refresh the gate:"
        $phaseTwoCleanupCommand = $executeCleanupCommand
        $phaseTwoCleanupCommandLabel = "If the restore gap remains after the safe-now pass, execute the top review-target cleanup path, rerun proof, and refresh the gate:"
    }

    [void]$doc.AppendLine("# OmnyID Commercial Readiness Status")
    [void]$doc.AppendLine()
    $lastAudited = if ([string]::IsNullOrWhiteSpace([string]$Snapshot.generated_at)) {
        ""
    } else {
        ([string]$Snapshot.generated_at).Substring(0, [Math]::Min(10, ([string]$Snapshot.generated_at).Length))
    }
    $auditDateText = Format-ReadableAuditDate -GeneratedAt $Snapshot.generated_at
    [void]$doc.AppendLine("Last audited: $lastAudited")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("## Verdict")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('Current status: `' + $Snapshot.commercial_readiness.status + '`')
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('Current promotion gate: `' + $GoNoGoStatus + '`')
    [void]$doc.AppendLine()
    if ($hasComparisonSnapshot) {
        $comparisonLaneHeading = if ($comparisonLaneLabel -eq "strict") { "Strict" } elseif ($comparisonLaneLabel -eq "default") { "Default" } else { "Comparison" }
        [void]$doc.AppendLine($comparisonLaneHeading + ' commercial gate status: `' + $ComparisonSnapshot.commercial_readiness.status + '`')
        [void]$doc.AppendLine()
        [void]$doc.AppendLine($comparisonLaneHeading + ' promotion gate: `' + $ComparisonGoNoGoStatus + '`')
        [void]$doc.AppendLine()
        if ($primaryLaneLabel -eq "default" -and $comparisonLaneLabel -eq "strict") {
            if (
                [string]$Snapshot.commercial_readiness.status -eq "ready" -and
                [string]$GoNoGoStatus -eq "go" -and
                [string]$ComparisonSnapshot.commercial_readiness.status -eq "ready" -and
                [string]$ComparisonGoNoGoStatus -eq "go"
            ) {
                [void]$doc.AppendLine("As of $auditDateText, both the default and strict audited lanes are commercially ready for promotion.")
            } elseif ([string]$Snapshot.commercial_readiness.status -eq "ready" -and [string]$GoNoGoStatus -eq "go") {
                [void]$doc.AppendLine("As of $auditDateText, the default audited lane is commercially ready for promotion, while the stricter executed-remediation lane still blocks promotion because Oracle cleanup remains ``dry_run`` and the post-cleanup proof has not been rechecked.")
            } elseif ([string]$ComparisonSnapshot.commercial_readiness.status -eq "ready" -and [string]$ComparisonGoNoGoStatus -eq "go") {
                [void]$doc.AppendLine("As of $auditDateText, the strict audited lane is commercially ready for promotion while the default lane still records blocking findings. Recheck the policy inputs because that lane ordering is unusual.")
            } else {
                [void]$doc.AppendLine("As of $auditDateText, both the default and strict audited lanes still record blocking findings. The strict lane remains the tighter posture because it also requires executed Oracle remediation and a rechecked proof.")
            }
            [void]$doc.AppendLine()
            [void]$doc.AppendLine("## Gate Lanes")
            [void]$doc.AppendLine()
            [void]$doc.AppendLine("| lane | commercial_status | promotion_gate | frontend_warning_policy | executed_oracle_remediation_required | blocker_count | interpretation |")
            [void]$doc.AppendLine("| --- | --- | --- | ---: | --- | ---: | --- |")
            [void]$doc.AppendLine('| default | `' + $Snapshot.commercial_readiness.status + '` | `' + $GoNoGoStatus + '` | `' + $Snapshot.policy.max_frontend_bundle_warnings + '` | `' + $Snapshot.policy.require_executed_oracle_remediation + '` | `' + $Snapshot.commercial_readiness.blocker_count + '` | Current audited artifacts support promotion. |')
            $strictInterpretation =
                if ([string]$ComparisonSnapshot.commercial_readiness.status -eq "ready" -and [string]$ComparisonGoNoGoStatus -eq "go") {
                    "Executed-remediation lane is also clear."
                } else {
                    "Promotion stays blocked until Oracle cleanup is executed and proof is rerun."
                }
            [void]$doc.AppendLine('| strict | `' + $ComparisonSnapshot.commercial_readiness.status + '` | `' + $ComparisonGoNoGoStatus + '` | `' + $ComparisonSnapshot.policy.max_frontend_bundle_warnings + '` | `' + $ComparisonSnapshot.policy.require_executed_oracle_remediation + '` | `' + $ComparisonSnapshot.commercial_readiness.blocker_count + '` | ' + $strictInterpretation + ' |')
            [void]$doc.AppendLine()
        }
    }
    if ([string]$Snapshot.commercial_readiness.status -eq "ready" -and [string]$GoNoGoStatus -eq "go") {
        [void]$doc.AppendLine("OmnyID is currently in a commercially ready state based on the latest audited Oracle proof, readiness snapshot, and promotion gate artifacts.")
    } else {
        [void]$doc.AppendLine("OmnyID should not be treated as commercially ready until the Oracle host repair path is executed and the production proof passes again.")
    }
    [void]$doc.AppendLine()
    if (@($Snapshot.commercial_readiness.blockers).Count -eq 0) {
        [void]$doc.AppendLine("## Current State")
    } else {
        [void]$doc.AppendLine("## Current Blockers")
    }
    [void]$doc.AppendLine()
    if (@($Snapshot.commercial_readiness.blockers).Count -eq 0) {
        [void]$doc.AppendLine("- No blocking findings are active in the current audited readiness snapshot.")
    } else {
        $primaryBlockers = @($Snapshot.commercial_readiness.blockers)
        for ($index = 0; $index -lt $primaryBlockers.Count; $index++) {
            [void]$doc.AppendLine('- Blocker ' + ($index + 1) + ': `' + [string]$primaryBlockers[$index] + '`.')
        }
    }
    if ($null -ne $Snapshot.policy) {
        [void]$doc.AppendLine('- Current frontend bundle warning policy threshold: `' + $Snapshot.policy.max_frontend_bundle_warnings + '`.') 
        [void]$doc.AppendLine('- Current frontend bundle warning policy satisfied: `' + $Snapshot.policy.accepted_frontend_bundle_warning_threshold_met + '`.') 
        [void]$doc.AppendLine('- Oracle executed-remediation policy required: `' + $Snapshot.policy.require_executed_oracle_remediation + '`.') 
        [void]$doc.AppendLine('- Oracle executed-remediation policy satisfied: `' + $Snapshot.policy.oracle_remediation_execution_policy_met + '`.') 
    }
    if ($hasComparisonSnapshot -and $null -ne $ComparisonSnapshot.policy) {
        $comparisonLanePrefix = if ($comparisonLaneLabel -eq "strict") { "Strict" } elseif ($comparisonLaneLabel -eq "default") { "Default" } else { "Comparison" }
        [void]$doc.AppendLine('- ' + $comparisonLanePrefix + ' frontend bundle warning policy threshold: `' + $ComparisonSnapshot.policy.max_frontend_bundle_warnings + '`.') 
        [void]$doc.AppendLine('- ' + $comparisonLanePrefix + ' frontend bundle warning policy satisfied: `' + $ComparisonSnapshot.policy.accepted_frontend_bundle_warning_threshold_met + '`.') 
        [void]$doc.AppendLine('- ' + $comparisonLanePrefix + ' Oracle executed-remediation policy required: `' + $ComparisonSnapshot.policy.require_executed_oracle_remediation + '`.') 
        [void]$doc.AppendLine('- ' + $comparisonLanePrefix + ' Oracle executed-remediation policy satisfied: `' + $ComparisonSnapshot.policy.oracle_remediation_execution_policy_met + '`.')
        $comparisonBlockers = @($ComparisonSnapshot.commercial_readiness.blockers)
        if ($comparisonBlockers.Count -gt 0) {
            for ($index = 0; $index -lt $comparisonBlockers.Count; $index++) {
                [void]$doc.AppendLine('- ' + $comparisonLanePrefix + ' blocker ' + ($index + 1) + ': `' + [string]$comparisonBlockers[$index] + '`.')
            }
        }
    }
    if ($Snapshot.release_readiness.artifact_present) {
        [void]$doc.AppendLine('- Release-readiness status is `' + $Snapshot.release_readiness.status + '`.')
        if ($null -ne $Snapshot.release_readiness.frontend_bundle_warning_count) {
            [void]$doc.AppendLine('- Frontend bundle budget warnings in the latest release-readiness artifact: `' + $Snapshot.release_readiness.frontend_bundle_warning_count + '`.')
        }
        if ($null -ne $Snapshot.release_readiness.frontend_bundle_note_count) {
            [void]$doc.AppendLine('- Frontend bundle budget notes in the latest release-readiness artifact: `' + $Snapshot.release_readiness.frontend_bundle_note_count + '`.')
        }
    }
    [void]$doc.AppendLine('- Oracle root filesystem is at `' + $Snapshot.oracle.remote_root_use_pct + '%` use.')
    if ($null -ne $Snapshot.oracle.inventory_root_use_pct) {
        [void]$doc.AppendLine('- The latest Oracle inventory shows `/` at `' + $Snapshot.oracle.inventory_root_use_pct + '%` use with `' + $Snapshot.oracle.inventory_root_avail + '` free.')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.postgres_wal_pressure_status)) {
        [void]$doc.AppendLine('- Postgres WAL pressure status is `' + $Snapshot.oracle.postgres_wal_pressure_status + '`.') 
    }
    if ($null -ne $Snapshot.oracle.postgres_wal_gib) {
        [void]$doc.AppendLine('- Current `pg_wal` footprint is about `' + $Snapshot.oracle.postgres_wal_gib + ' GiB`.') 
    }
    if ($null -ne $Snapshot.oracle.electric_slot_retained_wal_gib) {
        [void]$doc.AppendLine('- Electric slot retained WAL is about `' + $Snapshot.oracle.electric_slot_retained_wal_gib + ' GiB`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.postgres_wal_pressure_summary)) {
        [void]$doc.AppendLine('- Postgres WAL pressure summary: `' + $Snapshot.oracle.postgres_wal_pressure_summary + '`.') 
    }
    if ([string]$Snapshot.oracle.proof_status -eq "pass") {
        [void]$doc.AppendLine('- `scripts/oracle-production-proof.ps1` is currently passing.')
    } elseif (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.failure_step)) {
        [void]$doc.AppendLine('- `scripts/oracle-production-proof.ps1` is currently failing at `' + $Snapshot.oracle.failure_step + '`.')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle_evidence_consistency.status)) {
        [void]$doc.AppendLine('- Oracle evidence consistency is `' + $Snapshot.oracle_evidence_consistency.status + '`: `' + $Snapshot.oracle_evidence_consistency.summary + '`.') 
    }
    if (@($Snapshot.artifact_freshness.stale_artifact_names).Count -gt 0) {
        [void]$doc.AppendLine('- Stale readiness artifacts are still in use: `' + (@($Snapshot.artifact_freshness.stale_artifact_names) -join ', ') + '`.')
    }
    if ($null -ne $Snapshot.oracle.latest_archive_age_days) {
        if (-not [string]::IsNullOrWhiteSpace($auditDateText)) {
            [void]$doc.AppendLine('- The newest Oracle backup under `/var/backups/omnyid` is about `' + $Snapshot.oracle.latest_archive_age_days + '` days old as of ' + $auditDateText + '.')
        } else {
            [void]$doc.AppendLine('- The newest Oracle backup under `/var/backups/omnyid` is about `' + $Snapshot.oracle.latest_archive_age_days + '` days old.')
        }
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.latest_archive)) {
        [void]$doc.AppendLine('- The newest audited backup path is `' + $Snapshot.oracle.latest_archive + '`.')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.runtime_script_integrity_status)) {
        [void]$doc.AppendLine('- Runtime script integrity is `' + $Snapshot.oracle.runtime_script_integrity_status + '`.')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.runtime_script_integrity_detail)) {
        [void]$doc.AppendLine('- Runtime script integrity detail: `' + $Snapshot.oracle.runtime_script_integrity_detail + '`.')
    }
    if (@($Snapshot.oracle.missing_runtime_scripts).Count -gt 0) {
        [void]$doc.AppendLine('- Missing runtime scripts: `' + (@($Snapshot.oracle.missing_runtime_scripts) -join ', ') + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.local_stage_runtime_script_integrity_status)) {
        [void]$doc.AppendLine('- Local staged runtime script integrity is `' + $Snapshot.oracle.local_stage_runtime_script_integrity_status + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.local_stage_runtime_script_integrity_detail)) {
        [void]$doc.AppendLine('- Local staged runtime detail: `' + $Snapshot.oracle.local_stage_runtime_script_integrity_detail + '`.') 
    }
    if (@($Snapshot.oracle.local_stage_missing_required_scripts).Count -gt 0) {
        [void]$doc.AppendLine('- Local staged runtime missing scripts: `' + (@($Snapshot.oracle.local_stage_missing_required_scripts) -join ', ') + '`.') 
    }
    [void]$doc.AppendLine('- Backup verification is `' + $Snapshot.oracle.backup_verify_status + '`.')
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.backup_verify_detail)) {
        [void]$doc.AppendLine('- Backup verification detail: `' + $Snapshot.oracle.backup_verify_detail + '`.')
    }
    [void]$doc.AppendLine('- Restore-drill status is `' + $Snapshot.oracle.restore_drill_status + '`.')
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.restore_drill_policy_status)) {
        [void]$doc.AppendLine('- Restore-drill policy status is `' + $Snapshot.oracle.restore_drill_policy_status + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.restore_drill_policy_detail)) {
        [void]$doc.AppendLine('- Restore-drill policy detail: `' + $Snapshot.oracle.restore_drill_policy_detail + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.restore_drill_detail)) {
        [void]$doc.AppendLine('- Restore-drill detail: `' + $Snapshot.oracle.restore_drill_detail + '`.')
    }
    if ($null -ne $Snapshot.oracle.restore_drill_free_root_bytes -and $null -ne $Snapshot.oracle.restore_drill_required_bytes) {
        [void]$doc.AppendLine('- Restore-drill free-root bytes: `' + $Snapshot.oracle.restore_drill_free_root_bytes + '`.')
        [void]$doc.AppendLine('- Restore-drill required bytes: `' + $Snapshot.oracle.restore_drill_required_bytes + '`.')
    }
    if ($null -ne $Snapshot.oracle.restore_drill_source_db_bytes) {
        [void]$doc.AppendLine('- Restore-drill source DB bytes: `' + $Snapshot.oracle.restore_drill_source_db_bytes + '`.')
    }
    if ($null -ne $Snapshot.oracle.restore_drill_gap_bytes) {
        $gapGiB = [math]::Round(($Snapshot.oracle.restore_drill_gap_bytes / 1GB), 2)
        [void]$doc.AppendLine('- Restore-drill capacity shortfall: `' + $Snapshot.oracle.restore_drill_gap_bytes + '` bytes (about `' + $gapGiB + ' GiB`).')
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_safe_now_cleanup_gib) {
        [void]$doc.AppendLine('- Safe-now Oracle cleanup scope: `' + $Snapshot.oracle.restore_capacity_safe_now_cleanup_gib + ' GiB`.')
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_safe_now_only_clears_gap) {
        [void]$doc.AppendLine('- Safe-now Oracle cleanup alone clears restore gap: `' + $Snapshot.oracle.restore_capacity_safe_now_only_clears_gap + '`.') 
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib) {
        [void]$doc.AppendLine('- Remaining restore gap after the safe-now Oracle cleanup: `' + $Snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib + ' GiB`.') 
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_omnyid_backup_retention_gib) {
        [void]$doc.AppendLine('- Older OmnyID backup-retention review scope: `' + $Snapshot.oracle.restore_capacity_omnyid_backup_retention_gib + ' GiB`.')
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_top_review_target_clears_gap) {
        [void]$doc.AppendLine('- Top review target alone clears restore gap: `' + $Snapshot.oracle.restore_capacity_top_review_target_clears_gap + '`.') 
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_omnyid_only_clears_gap) {
        [void]$doc.AppendLine('- Older OmnyID backup retention alone clears restore gap: `' + $Snapshot.oracle.restore_capacity_omnyid_only_clears_gap + '`.') 
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_combined_retention_and_top_review_gib) {
        [void]$doc.AppendLine('- Combined older OmnyID retention plus top review target scope: `' + $Snapshot.oracle.restore_capacity_combined_retention_and_top_review_gib + ' GiB`.')
    }
    if ($null -ne $Snapshot.oracle.restore_capacity_combined_retention_and_top_review_clears_gap) {
        [void]$doc.AppendLine('- Combined older OmnyID retention plus top review target clears restore gap: `' + $Snapshot.oracle.restore_capacity_combined_retention_and_top_review_clears_gap + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.restore_capacity_recommendation)) {
        [void]$doc.AppendLine('- Restore-gap recommendation: `' + $Snapshot.oracle.restore_capacity_recommendation + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.omnyid_backup_retention_cleanup_command)) {
        [void]$doc.AppendLine('- Older OmnyID backup-retention cleanup command: `' + $Snapshot.oracle.omnyid_backup_retention_cleanup_command + '`.') 
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.combined_retention_and_top_target_cleanup_command)) {
        [void]$doc.AppendLine('- Combined retention plus top review target cleanup command: `' + $Snapshot.oracle.combined_retention_and_top_target_cleanup_command + '`.') 
    }
    if ($Snapshot.oracle.runtime_repair_required) {
        $repairStepLabel =
            if ($Snapshot.oracle.runtime_repair_kind -eq "redeploy") {
                "a redeploy step"
            } elseif ($Snapshot.oracle.runtime_repair_kind -eq "targeted_cleanup") {
                "a targeted cleanup step"
            } elseif ($Snapshot.oracle.runtime_repair_kind -eq "review_target_cleanup") {
                "a review-target cleanup step"
            } elseif ($Snapshot.oracle.runtime_repair_kind -eq "postgres_wal_slot") {
                "a WAL-slot remediation step"
            } else {
                "a cleanup step"
            }
        [void]$doc.AppendLine('- Oracle runtime repair still requires ' + $repairStepLabel + ' because `' + $Snapshot.oracle.runtime_repair_reason + '`.')
    }
    if ($openTaskCountDisplay -eq 0 -and $partialTaskCountDisplay -eq 0 -and $notStartedTaskCountDisplay -eq 0 -and $residualOpenItemCountDisplay -eq 0) {
        [void]$doc.AppendLine('- The `personalOS` implementation plan is complete in the latest audit: `0` partial phases, `0` not-started phases, `0` open tasks, and `0` residual phase-level blockers.')
    } else {
        [void]$doc.AppendLine('- The `personalOS` implementation plan is still open: `' + $Snapshot.personalos.partial + '` partial phases, `' + $Snapshot.personalos.not_started + '` not-started phases, and `' + $openTaskCountDisplay + '` open tasks (`' + $partialTaskCountDisplay + '` partial, `' + $notStartedTaskCountDisplay + '` not started) in the latest audit.')
        if ($residualOpenItemCountDisplay -ne "unknown") {
            [void]$doc.AppendLine('- The same audit also found `' + $residualOpenItemCountDisplay + '` residual phase-level blockers that are not cleanly represented as individual numbered tasks.')
        }
    }
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("## Readiness Artifacts")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("Primary machine-readable artifacts:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('- `artifacts/production-go-no-go-current/production-go-no-go.json`')
    [void]$doc.AppendLine('- `artifacts/commercial-readiness-snapshot-current/commercial-readiness-snapshot.json`')
    [void]$doc.AppendLine('- `artifacts/oracle-production-proof-current/oracle-production-proof.json`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-inventory-current/oracle-runtime-inventory.json`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-cleanup-execute-current/oracle-runtime-cleanup-execute.json`')
    [void]$doc.AppendLine('- `artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json`')
    [void]$doc.AppendLine('- `artifacts/personalos-readiness-audit-current/personalos-readiness-audit.json`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-stage-current/oracle-runtime-manifest.json`')
    [void]$doc.AppendLine('- `artifacts/storage-hygiene-report-current/storage-hygiene-report.json`')
    if (
        -not [string]::IsNullOrWhiteSpace([string]$Snapshot.artifact_paths.oracle_wal_slot_remediation) -or
        -not [string]::IsNullOrWhiteSpace([string]$Snapshot.artifact_paths.oracle_synthetic_cleanup) -or
        -not [string]::IsNullOrWhiteSpace([string]$Snapshot.artifact_paths.oracle_operational_history_cleanup)
    ) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('Oracle remediation sub-artifacts:')
        [void]$doc.AppendLine()
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.artifact_paths.oracle_wal_slot_remediation)) {
            [void]$doc.AppendLine('- `wal_slot_remediation`: `' + [string]$Snapshot.artifact_paths.oracle_wal_slot_remediation + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.artifact_paths.oracle_synthetic_cleanup)) {
            [void]$doc.AppendLine('- `synthetic_cleanup`: `' + [string]$Snapshot.artifact_paths.oracle_synthetic_cleanup + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.artifact_paths.oracle_operational_history_cleanup)) {
            [void]$doc.AppendLine('- `operational_history_cleanup`: `' + [string]$Snapshot.artifact_paths.oracle_operational_history_cleanup + '`')
        }
    }
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("Human-readable companion artifacts:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('- `artifacts/production-go-no-go-current/production-go-no-go.md`')
    [void]$doc.AppendLine('- `artifacts/commercial-readiness-snapshot-current/commercial-readiness-snapshot.md`')
    [void]$doc.AppendLine('- `artifacts/oracle-production-proof-current/oracle-production-proof.md`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-inventory-current/oracle-runtime-inventory.md`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.md`')
    [void]$doc.AppendLine('- `artifacts/oracle-runtime-cleanup-execute-current/oracle-runtime-cleanup-execute.md`')
    [void]$doc.AppendLine('- `artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.md`')
    [void]$doc.AppendLine('- `artifacts/personalos-readiness-audit-current/personalos-readiness-audit.md`')
    [void]$doc.AppendLine('- `artifacts/storage-hygiene-report-current/storage-hygiene-report.md`')
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("## Artifact Freshness")
    [void]$doc.AppendLine()
    if ($Snapshot.release_readiness.artifact_present) {
        [void]$doc.AppendLine('- `release_readiness` generated at `' + $Snapshot.release_readiness.generated_at + '` with status `' + $Snapshot.release_readiness.status + '`.')
    }
    foreach ($artifact in @(
        $Snapshot.artifact_freshness.oracle_proof,
        $Snapshot.artifact_freshness.oracle_inventory,
        $Snapshot.artifact_freshness.oracle_cleanup_plan,
        $Snapshot.artifact_freshness.oracle_cleanup_execute,
        $Snapshot.artifact_freshness.oracle_remediation,
        $Snapshot.artifact_freshness.personalos_audit
    )) {
        if ($null -eq $artifact) {
            continue
        }

        $ageDisplay = if ($null -ne $artifact.age_hours) { "$($artifact.age_hours) hours" } else { "unknown age" }
        $staleDisplay = if ($null -ne $artifact.stale) { [string]$artifact.stale } else { "unknown" }
        $generatedAtDisplay = if (-not [string]::IsNullOrWhiteSpace([string]$artifact.generated_at)) { [string]$artifact.generated_at } else { "unknown" }
        [void]$doc.AppendLine('- `' + $artifact.name + '` generated at `' + $generatedAtDisplay + '` (`' + $ageDisplay + '`, stale=`' + $staleDisplay + '`)')
    }
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("## Current Oracle Cleanup Scope")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("Latest inventory-derived cleanup candidates:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('- `' + $Snapshot.oracle.candidate_cleanup_containers + '` stale containers')
    [void]$doc.AppendLine('- `' + $Snapshot.oracle.candidate_cleanup_volumes + '` stale volumes')
    [void]$doc.AppendLine('- `' + $Snapshot.oracle.candidate_cleanup_images + '` stale images')
    [void]$doc.AppendLine('- about `' + $Snapshot.oracle.candidate_cleanup_image_gib + ' GiB` of candidate cleanup image size')
    if ($null -ne $Snapshot.oracle.cleanup_plan_total_candidate_gib) {
        [void]$doc.AppendLine('- about `' + $Snapshot.oracle.cleanup_plan_total_candidate_gib + ' GiB` total candidate reclaim according to the cleanup plan')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.cleanup_plan_classification_mode)) {
        [void]$doc.AppendLine('- cleanup-plan classification mode: `' + $Snapshot.oracle.cleanup_plan_classification_mode + '`')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.cleanup_plan_disk_pressure_status)) {
        [void]$doc.AppendLine('- cleanup-plan disk pressure status: `' + $Snapshot.oracle.cleanup_plan_disk_pressure_status + '`')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.cleanup_plan_disk_pressure_summary)) {
        [void]$doc.AppendLine('- cleanup-plan disk pressure summary: `' + $Snapshot.oracle.cleanup_plan_disk_pressure_summary + '`')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.review_target_group)) {
        [void]$doc.AppendLine('- top review target group: `' + $Snapshot.oracle.review_target_group + '`')
    }
    if ($null -ne $Snapshot.oracle.review_target_known_size_gib) {
        [void]$doc.AppendLine('- top review target known size: `' + $Snapshot.oracle.review_target_known_size_gib + ' GiB`')
    }
    if ($null -ne $Snapshot.oracle.review_target_review_count) {
        [void]$doc.AppendLine('- top review target review count: `' + $Snapshot.oracle.review_target_review_count + '`')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.review_target_recommended_action)) {
        [void]$doc.AppendLine('- top review target action: `' + $Snapshot.oracle.review_target_recommended_action + '`')
    }
    if ($Snapshot.oracle.local_stage_manifest_present) {
        [void]$doc.AppendLine('- local staged runtime manifest present: `' + $Snapshot.oracle.local_stage_manifest_present + '`')
        [void]$doc.AppendLine('- local staged runtime required script count: `' + $Snapshot.oracle.local_stage_required_runtime_scripts_count + '`')
    }
    if ($Snapshot.oracle.runtime_repair_required) {
        [void]$doc.AppendLine('- runtime repair kind: `' + $Snapshot.oracle.runtime_repair_kind + '`')
        [void]$doc.AppendLine('- runtime repair deploy required: `' + $Snapshot.oracle.runtime_repair_reason + '`')
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.runtime_repair_recommended_action)) {
            [void]$doc.AppendLine('- recommended runtime repair action: `' + $Snapshot.oracle.runtime_repair_recommended_action + '`')
        }
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.postgres_wal_pressure_recommended_action)) {
        [void]$doc.AppendLine('- postgres WAL recommended action: `' + $Snapshot.oracle.postgres_wal_pressure_recommended_action + '`')
    }
    if ($Snapshot.oracle.cleanup_execute_available -and -not $Snapshot.oracle.cleanup_execute_current_with_plan) {
        [void]$doc.AppendLine('- cleanup execution preview exists but predates the current cleanup plan, so its commands are suppressed until the preview is regenerated.')
    }
    if ($Snapshot.oracle.cleanup_execute_available -and $Snapshot.oracle.cleanup_execute_current_with_plan) {
        [void]$doc.AppendLine('- cleanup execution preview is available for `' + $Snapshot.oracle.cleanup_execute_step_count + '` steps: `' + (@($Snapshot.oracle.cleanup_execute_step_names) -join ', ') + '`')
    }
    if ($Snapshot.oracle.remediation_stale_relative_to_inputs) {
        [void]$doc.AppendLine('- remediation artifact exists but predates the current proof or cleanup plan, so remediation outcome fields are suppressed until remediation is regenerated in sequence.')
    }
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("These are plan values, not proof of reclaimed space. Use the cleanup-plan artifact before any live deletion.")
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.review_target_cleanup_command)) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("Exact review-target cleanup command:")
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($Snapshot.oracle.review_target_cleanup_command)
        [void]$doc.AppendLine('```')
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("Rerun proof after cleanup:")
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($proofRerunCommand)
        [void]$doc.AppendLine('```')
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.combined_retention_and_top_target_cleanup_command)) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("Exact combined retention plus top review target cleanup command:")
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($Snapshot.oracle.combined_retention_and_top_target_cleanup_command)
        [void]$doc.AppendLine('```')
        if ($Snapshot.oracle.remediation_outcome -eq "combined_review_cleanup_required" -and -not [string]::IsNullOrWhiteSpace($executeCleanupCommand)) {
            [void]$doc.AppendLine()
            [void]$doc.AppendLine("Exact combined executor follow-through command:")
            [void]$doc.AppendLine()
            [void]$doc.AppendLine('```powershell')
            [void]$doc.AppendLine($executeCleanupCommand)
            [void]$doc.AppendLine('```')
        }
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.oracle.remediation_outcome)) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("Current remediation state:")
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('- remediation outcome: `' + $Snapshot.oracle.remediation_outcome + '`')
        [void]$doc.AppendLine('- cleanup mode: `' + $Snapshot.oracle.remediation_cleanup_mode + '`')
        [void]$doc.AppendLine('- planned cleanup step count: `' + $Snapshot.oracle.remediation_cleanup_step_count + '`')
        [void]$doc.AppendLine('- baseline blocker: `' + $Snapshot.oracle.remediation_baseline_blocker + '`')
        [void]$doc.AppendLine('- final blocker: `' + $Snapshot.oracle.remediation_final_blocker + '`')
    }
    if ($Snapshot.storage.artifact_present) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("## Local Storage Hygiene")
        [void]$doc.AppendLine()
        if ($null -ne $Snapshot.storage.local_safe_delete_gib) {
            [void]$doc.AppendLine('- safe local rebuildable reclaim currently totals about `' + $Snapshot.storage.local_safe_delete_gib + ' GiB`')
        }
        if ($null -ne $Snapshot.storage.local_safe_delete_count) {
            [void]$doc.AppendLine('- safe local delete candidate count: `' + $Snapshot.storage.local_safe_delete_count + '`')
        }
        if (@($Snapshot.storage.top_local_delete_candidates).Count -gt 0) {
            [void]$doc.AppendLine('- top local delete candidates: `' + (@($Snapshot.storage.top_local_delete_candidates) -join ', ') + '`')
        }
        [void]$doc.AppendLine('- storage hygiene artifact: `artifacts/storage-hygiene-report-current/storage-hygiene-report.json`')
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("## Oracle Host Storage Hygiene")
        [void]$doc.AppendLine()
        if ($null -ne $Snapshot.storage.oracle_safe_cleanup_gib) {
            [void]$doc.AppendLine('- safe-now Oracle cleanup currently totals about `' + $Snapshot.storage.oracle_safe_cleanup_gib + ' GiB`')
        }
        if ($null -ne $Snapshot.storage.oracle_runtime_required_gib) {
            [void]$doc.AppendLine('- Oracle runtime-required footprint currently totals about `' + $Snapshot.storage.oracle_runtime_required_gib + ' GiB`')
        }
        if ($null -ne $Snapshot.storage.oracle_runtime_required_group_count) {
            [void]$doc.AppendLine('- Oracle runtime-required group count: `' + $Snapshot.storage.oracle_runtime_required_group_count + '`')
        }
        if (@($Snapshot.storage.top_oracle_runtime_required_groups).Count -gt 0) {
            [void]$doc.AppendLine('- Oracle runtime-required groups to keep on host: `' + (@($Snapshot.storage.top_oracle_runtime_required_groups) -join ', ') + '`')
        }
        if ($null -ne $Snapshot.oracle.restore_capacity_safe_now_only_clears_gap) {
            [void]$doc.AppendLine('- safe-now Oracle cleanup alone clears the current restore gap: `' + $Snapshot.oracle.restore_capacity_safe_now_only_clears_gap + '`')
        }
        if ($null -ne $Snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib) {
            [void]$doc.AppendLine('- remaining restore gap after safe-now cleanup would still be about `' + $Snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib + ' GiB`')
        }
        if ($null -ne $Snapshot.storage.oracle_safe_cleanup_group_count) {
            [void]$doc.AppendLine('- safe-now Oracle cleanup group count: `' + $Snapshot.storage.oracle_safe_cleanup_group_count + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.top_oracle_safe_cleanup_group)) {
            [void]$doc.AppendLine('- top safe-now Oracle cleanup group: `' + $Snapshot.storage.top_oracle_safe_cleanup_group + '`')
        }
        if ($null -ne $Snapshot.storage.top_oracle_safe_cleanup_gib) {
            [void]$doc.AppendLine('- top safe-now Oracle cleanup size: `' + $Snapshot.storage.top_oracle_safe_cleanup_gib + ' GiB`')
        }
        if ($null -ne $Snapshot.storage.oracle_review_required_gib) {
            [void]$doc.AppendLine('- Oracle review-required non-runtime reclaim totals about `' + $Snapshot.storage.oracle_review_required_gib + ' GiB`')
        }
        if ($null -ne $Snapshot.storage.oracle_review_required_group_count) {
            [void]$doc.AppendLine('- Oracle review-required group count: `' + $Snapshot.storage.oracle_review_required_group_count + '`')
        }
        if (@($Snapshot.storage.top_oracle_delete_priority_groups).Count -gt 0) {
            [void]$doc.AppendLine('- Oracle delete priority groups: `' + (@($Snapshot.storage.top_oracle_delete_priority_groups) -join ', ') + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_synthetic_message_cleanup_mode)) {
            [void]$doc.AppendLine('- synthetic message cleanup mode: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_mode + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_synthetic_message_pressure_status)) {
            [void]$doc.AppendLine('- synthetic message pressure status: `' + $Snapshot.storage.oracle_synthetic_message_pressure_status + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_pressure_total_dupes) {
            [void]$doc.AppendLine('- synthetic message duplicate rows currently present: `' + $Snapshot.storage.oracle_synthetic_message_pressure_total_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_pressure_maintenance_summary_dupes) {
            [void]$doc.AppendLine('- maintenance-summary duplicate rows currently present: `' + $Snapshot.storage.oracle_synthetic_message_pressure_maintenance_summary_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_pressure_curator_card_dupes) {
            [void]$doc.AppendLine('- curator-card duplicate rows currently present: `' + $Snapshot.storage.oracle_synthetic_message_pressure_curator_card_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_pressure_curator_backlink_dupes) {
            [void]$doc.AppendLine('- curator-backlink duplicate rows currently present: `' + $Snapshot.storage.oracle_synthetic_message_pressure_curator_backlink_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_pressure_ingestion_topology_dupes) {
            [void]$doc.AppendLine('- ingestion-topology duplicate rows currently present: `' + $Snapshot.storage.oracle_synthetic_message_pressure_ingestion_topology_dupes + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_synthetic_message_pressure_summary)) {
            [void]$doc.AppendLine('- synthetic message pressure summary: `' + $Snapshot.storage.oracle_synthetic_message_pressure_summary + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_deleted_total) {
            [void]$doc.AppendLine('- synthetic message cleanup deleted rows: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_deleted_total + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_before_total_dupes) {
            [void]$doc.AppendLine('- synthetic message duplicate rows before cleanup: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_before_total_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_after_total_dupes) {
            [void]$doc.AppendLine('- synthetic message duplicate rows after cleanup: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_after_total_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_before_maintenance_summary_dupes) {
            [void]$doc.AppendLine('- maintenance-summary duplicate rows before cleanup: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_before_maintenance_summary_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_before_curator_card_dupes) {
            [void]$doc.AppendLine('- curator-card duplicate rows before cleanup: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_before_curator_card_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_before_curator_backlink_dupes) {
            [void]$doc.AppendLine('- curator-backlink duplicate rows before cleanup: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_before_curator_backlink_dupes + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_synthetic_message_cleanup_before_ingestion_topology_dupes) {
            [void]$doc.AppendLine('- ingestion-topology duplicate rows before cleanup: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_before_ingestion_topology_dupes + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_synthetic_message_cleanup_command)) {
            [void]$doc.AppendLine('- synthetic message cleanup command: `' + $Snapshot.storage.oracle_synthetic_message_cleanup_command + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_operational_history_cleanup_mode)) {
            [void]$doc.AppendLine('- operational history cleanup mode: `' + $Snapshot.storage.oracle_operational_history_cleanup_mode + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_operational_history_pressure_status)) {
            [void]$doc.AppendLine('- operational history pressure status: `' + $Snapshot.storage.oracle_operational_history_pressure_status + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_operational_history_pressure_total_rows) {
            [void]$doc.AppendLine('- operational history rows currently present: `' + $Snapshot.storage.oracle_operational_history_pressure_total_rows + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_operational_history_cleanup_deleted_total) {
            [void]$doc.AppendLine('- operational history cleanup deleted rows: `' + $Snapshot.storage.oracle_operational_history_cleanup_deleted_total + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_operational_history_cleanup_before_total_rows) {
            [void]$doc.AppendLine('- operational history rows before cleanup: `' + $Snapshot.storage.oracle_operational_history_cleanup_before_total_rows + '`')
        }
        if ($null -ne $Snapshot.storage.oracle_operational_history_cleanup_after_total_rows) {
            [void]$doc.AppendLine('- operational history rows after cleanup: `' + $Snapshot.storage.oracle_operational_history_cleanup_after_total_rows + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_operational_history_cleanup_command)) {
            [void]$doc.AppendLine('- operational history cleanup command: `' + $Snapshot.storage.oracle_operational_history_cleanup_command + '`')
        }
        if (-not [string]::IsNullOrWhiteSpace([string]$Snapshot.storage.oracle_operational_history_cleanup_follow_through_command)) {
            [void]$doc.AppendLine('- operational history cleanup follow-through command: `' + $Snapshot.storage.oracle_operational_history_cleanup_follow_through_command + '`')
        }
        if (@($Snapshot.storage.oracle_cloud_deployment_matrix).Count -gt 0) {
            [void]$doc.AppendLine()
            [void]$doc.AppendLine("## Oracle Cloud Deployment Matrix")
            [void]$doc.AppendLine()
            [void]$doc.AppendLine("| ownership_group | deployment_class | required_on_oracle | safe_to_delete_now | size_gib | delete_precondition |")
            [void]$doc.AppendLine("| --- | --- | --- | --- | ---: | --- |")
            foreach ($row in @($Snapshot.storage.oracle_cloud_deployment_matrix)) {
                $ownershipGroup = if (-not [string]::IsNullOrWhiteSpace([string]$row.ownership_group)) { [string]$row.ownership_group } else { "unknown" }
                $deploymentClass = if (-not [string]::IsNullOrWhiteSpace([string]$row.deployment_class)) { [string]$row.deployment_class } else { "unknown" }
                $requiredOnOracle = [string][bool]$row.required_on_oracle
                $safeToDeleteNow = [string][bool]$row.safe_to_delete_now
                $sizeGiB = if ($null -ne $row.size_gib) { [string]$row.size_gib } else { "" }
                $deletePrecondition = if (-not [string]::IsNullOrWhiteSpace([string]$row.delete_precondition)) { [string]$row.delete_precondition } else { "" }
                [void]$doc.AppendLine("| $ownershipGroup | $deploymentClass | $requiredOnOracle | $safeToDeleteNow | $sizeGiB | $deletePrecondition |")
            }
        }
    }
    if (@($Snapshot.personalos.open_phase_titles).Count -gt 0) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("## Open personalOS Phases")
        [void]$doc.AppendLine()
        foreach ($phase in @($Snapshot.personalos.open_phase_titles)) {
            [void]$doc.AppendLine('- ' + $phase)
        }
    }
    if (@($Snapshot.personalos.prioritized_open_phases).Count -gt 0) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("Priority phase load:")
        [void]$doc.AppendLine()
        foreach ($phase in @($Snapshot.personalos.prioritized_open_phases)) {
            [void]$doc.AppendLine('- ' + $phase)
        }
    }
    if (@($Snapshot.personalos.top_open_tasks).Count -gt 0) {
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("## Top Open personalOS Tasks")
        [void]$doc.AppendLine()
        foreach ($task in @($Snapshot.personalos.top_open_tasks)) {
            [void]$doc.AppendLine('- ' + $task)
        }
    }
    if (@($Snapshot.personalos.top_residual_items).Count -gt 0) {
        if (@($Snapshot.personalos.residual_phase_summaries).Count -gt 0) {
            [void]$doc.AppendLine()
            [void]$doc.AppendLine("Residual blocker clustering:")
            [void]$doc.AppendLine()
            foreach ($summary in @($Snapshot.personalos.residual_phase_summaries)) {
                [void]$doc.AppendLine('- ' + $summary)
            }
        }
        [void]$doc.AppendLine()
        [void]$doc.AppendLine("## Top Residual personalOS Blockers")
        [void]$doc.AppendLine()
        foreach ($item in @($Snapshot.personalos.top_residual_items)) {
            [void]$doc.AppendLine('- ' + $item)
        }
    }
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("## Operator Sequence")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("Refresh readiness artifacts:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('```powershell')
    [void]$doc.AppendLine($refreshCommand)
    [void]$doc.AppendLine('```')
    [void]$doc.AppendLine()
    [void]$doc.AppendLine($refreshCommandNote + " The same refresh also emits the storage-hygiene artifact so Oracle restore pressure and safe local reclaim are visible in one bundle.")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("Generate the current cleanup plan:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('```powershell')
    [void]$doc.AppendLine("./scripts/oracle-runtime-cleanup-plan.ps1 -OutDir artifacts/oracle-runtime-cleanup-plan-current")
    [void]$doc.AppendLine('```')
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("Preview the exact Oracle cleanup commands without executing them:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('```powershell')
    [void]$doc.AppendLine($previewCleanupCommand)
    [void]$doc.AppendLine('```')
    [void]$doc.AppendLine()
    if (-not [string]::IsNullOrWhiteSpace($previewCleanupCommandNote)) {
        [void]$doc.AppendLine($previewCleanupCommandNote)
        [void]$doc.AppendLine()
    }
    if (
        -not [string]::IsNullOrWhiteSpace($safeNowCleanupCommand) -and
        $null -ne $Snapshot.storage.oracle_safe_cleanup_gib -and
        [double]$Snapshot.storage.oracle_safe_cleanup_gib -gt 0
    ) {
        [void]$doc.AppendLine("Execute the safe-now Oracle cleanup phase first if you want a low-risk remeasurement pass:")
        [void]$doc.AppendLine()
        if ($Snapshot.oracle.restore_capacity_safe_now_only_clears_gap -eq $false -and $null -ne $Snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib) {
            [void]$doc.AppendLine('This safe-now pass does not clear the full restore gap by itself; it is a lower-risk remeasurement step that would still leave about `' + $Snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib + ' GiB` unresolved if the reclaim estimate holds.')
            [void]$doc.AppendLine()
        }
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($safeNowCleanupCommand)
        [void]$doc.AppendLine('```')
        [void]$doc.AppendLine()
    }
    if (-not [string]::IsNullOrWhiteSpace($phaseTwoCleanupCommand)) {
        [void]$doc.AppendLine($phaseTwoCleanupCommandLabel)
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($phaseTwoCleanupCommand)
        [void]$doc.AppendLine('```')
        [void]$doc.AppendLine()
    }
    if (-not [string]::IsNullOrWhiteSpace($operationalHistoryCleanupFollowThroughCommand)) {
        [void]$doc.AppendLine("Execute the bounded operational-history cleanup, rerun proof, and refresh the gate:")
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('This is the strict-lane fix for per-user operational-history growth. The cleanup is bounded, then the proof and promotion gate are refreshed so the lane reflects the new retention state.')
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($operationalHistoryCleanupFollowThroughCommand)
        [void]$doc.AppendLine('```')
        [void]$doc.AppendLine()
    }
    if (-not [string]::IsNullOrWhiteSpace($executeCleanupCommand) -and [string]::IsNullOrWhiteSpace($phaseTwoCleanupCommand)) {
        [void]$doc.AppendLine($executeCleanupCommandLabel)
        [void]$doc.AppendLine()
        [void]$doc.AppendLine('```powershell')
        [void]$doc.AppendLine($executeCleanupCommand)
        [void]$doc.AppendLine('```')
        [void]$doc.AppendLine()
    }
    [void]$doc.AppendLine("Run the top-level commercial gate:")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('```powershell')
    [void]$doc.AppendLine("./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current")
    [void]$doc.AppendLine('```')
    [void]$doc.AppendLine()
    [void]$doc.AppendLine("## Interpretation")
    [void]$doc.AppendLine()
    [void]$doc.AppendLine('- `go` means local release checks and the commercial readiness snapshot are both clear.')
    [void]$doc.AppendLine('- `no_go` means at least one release blocker remains and promotion should stop.')
    [void]$doc.AppendLine('- `not_ready` means the current audited infrastructure or implementation state still fails commercial-readiness expectations even if parts of the product are functional.')
    return $doc.ToString()
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $snapshot | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "commercial-readiness-snapshot.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# Commercial Readiness Snapshot")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- generated_at: $($snapshot.generated_at)")
    [void]$markdown.AppendLine("- status: $($snapshot.commercial_readiness.status)")
    [void]$markdown.AppendLine("- blocker_count: $($snapshot.commercial_readiness.blocker_count)")
    [void]$markdown.AppendLine("- policy_max_frontend_bundle_warnings: $($snapshot.policy.max_frontend_bundle_warnings)")
    [void]$markdown.AppendLine("- policy_accepted_frontend_bundle_warning_count: $($snapshot.policy.accepted_frontend_bundle_warning_count)")
    [void]$markdown.AppendLine("- policy_frontend_bundle_warning_threshold_met: $($snapshot.policy.accepted_frontend_bundle_warning_threshold_met)")
    [void]$markdown.AppendLine("- policy_require_executed_oracle_remediation: $($snapshot.policy.require_executed_oracle_remediation)")
    [void]$markdown.AppendLine("- policy_oracle_remediation_execution_policy_met: $($snapshot.policy.oracle_remediation_execution_policy_met)")
    [void]$markdown.AppendLine("- oracle_remote_host: $($snapshot.oracle.remote_host)")
    [void]$markdown.AppendLine("- oracle_proof_status: $($snapshot.oracle.proof_status)")
    [void]$markdown.AppendLine("- oracle_failure_step: $($snapshot.oracle.failure_step)")
    [void]$markdown.AppendLine("- oracle_root_use_pct: $($snapshot.oracle.remote_root_use_pct)")
    [void]$markdown.AppendLine("- oracle_inventory_root_use_pct: $($snapshot.oracle.inventory_root_use_pct)")
    [void]$markdown.AppendLine("- oracle_inventory_root_avail: $($snapshot.oracle.inventory_root_avail)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_disk_pressure_status: $($snapshot.oracle.cleanup_plan_disk_pressure_status)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_disk_pressure_summary: $($snapshot.oracle.cleanup_plan_disk_pressure_summary)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_total_candidate_gib: $($snapshot.oracle.cleanup_plan_total_candidate_gib)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_classification_mode: $($snapshot.oracle.cleanup_plan_classification_mode)")
    [void]$markdown.AppendLine("- oracle_evidence_consistency_status: $($snapshot.oracle_evidence_consistency.status)")
    [void]$markdown.AppendLine("- oracle_evidence_consistency_summary: $($snapshot.oracle_evidence_consistency.summary)")
    [void]$markdown.AppendLine("- oracle_proof_generated_at: $($snapshot.artifact_freshness.oracle_proof.generated_at)")
    [void]$markdown.AppendLine("- oracle_proof_age_hours: $($snapshot.artifact_freshness.oracle_proof.age_hours)")
    [void]$markdown.AppendLine("- oracle_proof_stale: $($snapshot.artifact_freshness.oracle_proof.stale)")
    [void]$markdown.AppendLine("- oracle_restore_proof_generated_at: $($snapshot.artifact_freshness.oracle_restore_proof.generated_at)")
    [void]$markdown.AppendLine("- oracle_restore_proof_age_hours: $($snapshot.artifact_freshness.oracle_restore_proof.age_hours)")
    [void]$markdown.AppendLine("- oracle_restore_proof_stale: $($snapshot.artifact_freshness.oracle_restore_proof.stale)")
    [void]$markdown.AppendLine("- oracle_inventory_generated_at: $($snapshot.artifact_freshness.oracle_inventory.generated_at)")
    [void]$markdown.AppendLine("- oracle_inventory_age_hours: $($snapshot.artifact_freshness.oracle_inventory.age_hours)")
    [void]$markdown.AppendLine("- oracle_inventory_stale: $($snapshot.artifact_freshness.oracle_inventory.stale)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_generated_at: $($snapshot.artifact_freshness.oracle_cleanup_plan.generated_at)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_age_hours: $($snapshot.artifact_freshness.oracle_cleanup_plan.age_hours)")
    [void]$markdown.AppendLine("- oracle_cleanup_plan_stale: $($snapshot.artifact_freshness.oracle_cleanup_plan.stale)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_generated_at: $($snapshot.artifact_freshness.oracle_cleanup_execute.generated_at)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_age_hours: $($snapshot.artifact_freshness.oracle_cleanup_execute.age_hours)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_stale: $($snapshot.artifact_freshness.oracle_cleanup_execute.stale)")
    [void]$markdown.AppendLine("- oracle_remediation_generated_at: $($snapshot.artifact_freshness.oracle_remediation.generated_at)")
    [void]$markdown.AppendLine("- oracle_remediation_age_hours: $($snapshot.artifact_freshness.oracle_remediation.age_hours)")
    [void]$markdown.AppendLine("- oracle_remediation_stale: $($snapshot.artifact_freshness.oracle_remediation.stale)")
    [void]$markdown.AppendLine("- release_readiness_artifact_present: $($snapshot.release_readiness.artifact_present)")
    [void]$markdown.AppendLine("- release_readiness_status: $($snapshot.release_readiness.status)")
    [void]$markdown.AppendLine("- release_readiness_generated_at: $($snapshot.release_readiness.generated_at)")
    [void]$markdown.AppendLine("- release_readiness_frontend_bundle_warning_count: $($snapshot.release_readiness.frontend_bundle_warning_count)")
    [void]$markdown.AppendLine("- release_readiness_frontend_bundle_note_count: $($snapshot.release_readiness.frontend_bundle_note_count)")
    [void]$markdown.AppendLine("- release_readiness_frontend_bundle_report: $($snapshot.release_readiness.frontend_bundle_report)")
    [void]$markdown.AppendLine("- personalos_audit_generated_at: $($snapshot.artifact_freshness.personalos_audit.generated_at)")
    [void]$markdown.AppendLine("- personalos_audit_age_hours: $($snapshot.artifact_freshness.personalos_audit.age_hours)")
    [void]$markdown.AppendLine("- personalos_audit_stale: $($snapshot.artifact_freshness.personalos_audit.stale)")
    [void]$markdown.AppendLine("- oracle_latest_archive_age_days: $($snapshot.oracle.latest_archive_age_days)")
    [void]$markdown.AppendLine("- oracle_latest_archive: $($snapshot.oracle.latest_archive)")
    [void]$markdown.AppendLine("- oracle_runtime_script_integrity_status: $($snapshot.oracle.runtime_script_integrity_status)")
    [void]$markdown.AppendLine("- oracle_runtime_script_integrity_detail: $($snapshot.oracle.runtime_script_integrity_detail)")
    [void]$markdown.AppendLine("- oracle_missing_runtime_scripts: $(@($snapshot.oracle.missing_runtime_scripts) -join ', ')")
    [void]$markdown.AppendLine("- local_stage_runtime_script_integrity_status: $($snapshot.oracle.local_stage_runtime_script_integrity_status)")
    [void]$markdown.AppendLine("- local_stage_runtime_script_integrity_detail: $($snapshot.oracle.local_stage_runtime_script_integrity_detail)")
    [void]$markdown.AppendLine("- local_stage_missing_runtime_scripts: $(@($snapshot.oracle.local_stage_missing_required_scripts) -join ', ')")
    [void]$markdown.AppendLine("- oracle_backup_verify_status: $($snapshot.oracle.backup_verify_status)")
    [void]$markdown.AppendLine("- oracle_backup_verify_detail: $($snapshot.oracle.backup_verify_detail)")
    [void]$markdown.AppendLine("- oracle_restore_drill_status: $($snapshot.oracle.restore_drill_status)")
    [void]$markdown.AppendLine("- oracle_restore_drill_detail: $($snapshot.oracle.restore_drill_detail)")
    [void]$markdown.AppendLine("- oracle_restore_drill_policy_status: $($snapshot.oracle.restore_drill_policy_status)")
    [void]$markdown.AppendLine("- oracle_restore_drill_policy_detail: $($snapshot.oracle.restore_drill_policy_detail)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_path: $($snapshot.oracle.restore_drill_proof_path)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_status: $($snapshot.oracle.restore_drill_proof_status)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_restore_status: $($snapshot.oracle.restore_drill_proof_restore_status)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_generated_at: $($snapshot.oracle.restore_drill_proof_generated_at)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_age_hours: $($snapshot.oracle.restore_drill_proof_age_hours)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_stale: $($snapshot.oracle.restore_drill_proof_stale)")
    [void]$markdown.AppendLine("- oracle_restore_drill_proof_max_age_hours: $($snapshot.oracle.restore_drill_proof_max_age_hours)")
    [void]$markdown.AppendLine("- oracle_restore_drill_free_root_bytes: $($snapshot.oracle.restore_drill_free_root_bytes)")
    [void]$markdown.AppendLine("- oracle_restore_drill_required_bytes: $($snapshot.oracle.restore_drill_required_bytes)")
    [void]$markdown.AppendLine("- oracle_restore_drill_source_db_bytes: $($snapshot.oracle.restore_drill_source_db_bytes)")
    [void]$markdown.AppendLine("- oracle_restore_drill_gap_bytes: $($snapshot.oracle.restore_drill_gap_bytes)")
    [void]$markdown.AppendLine("- oracle_restore_drill_gap_gib: $($snapshot.oracle.restore_drill_gap_gib)")
    [void]$markdown.AppendLine("- oracle_candidate_cleanup_items: $($snapshot.oracle.candidate_cleanup_items)")
    [void]$markdown.AppendLine("- oracle_candidate_cleanup_image_gib: $($snapshot.oracle.candidate_cleanup_image_gib)")
    [void]$markdown.AppendLine("- oracle_review_target_group: $($snapshot.oracle.review_target_group)")
    [void]$markdown.AppendLine("- oracle_review_target_known_size_gib: $($snapshot.oracle.review_target_known_size_gib)")
    [void]$markdown.AppendLine("- oracle_review_target_review_count: $($snapshot.oracle.review_target_review_count)")
    [void]$markdown.AppendLine("- oracle_review_target_recommended_action: $($snapshot.oracle.review_target_recommended_action)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_safe_now_cleanup_gib: $($snapshot.oracle.restore_capacity_safe_now_cleanup_gib)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_safe_now_only_clears_gap: $($snapshot.oracle.restore_capacity_safe_now_only_clears_gap)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_safe_now_remaining_gap_gib: $($snapshot.oracle.restore_capacity_safe_now_remaining_gap_gib)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_top_review_target_clears_gap: $($snapshot.oracle.restore_capacity_top_review_target_clears_gap)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_omnyid_backup_retention_gib: $($snapshot.oracle.restore_capacity_omnyid_backup_retention_gib)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_omnyid_only_clears_gap: $($snapshot.oracle.restore_capacity_omnyid_only_clears_gap)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_combined_retention_and_top_review_gib: $($snapshot.oracle.restore_capacity_combined_retention_and_top_review_gib)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_combined_retention_and_top_review_clears_gap: $($snapshot.oracle.restore_capacity_combined_retention_and_top_review_clears_gap)")
    [void]$markdown.AppendLine("- oracle_restore_capacity_recommendation: $($snapshot.oracle.restore_capacity_recommendation)")
    [void]$markdown.AppendLine("- oracle_omnyid_backup_retention_cleanup_command: $($snapshot.oracle.omnyid_backup_retention_cleanup_command)")
    [void]$markdown.AppendLine("- oracle_combined_retention_and_top_target_cleanup_command: $($snapshot.oracle.combined_retention_and_top_target_cleanup_command)")
    [void]$markdown.AppendLine("- oracle_review_target_cleanup_command: $($snapshot.oracle.review_target_cleanup_command)")
    [void]$markdown.AppendLine("- oracle_postgres_wal_pressure_status: $($snapshot.oracle.postgres_wal_pressure_status)")
    [void]$markdown.AppendLine("- oracle_postgres_wal_pressure_summary: $($snapshot.oracle.postgres_wal_pressure_summary)")
    [void]$markdown.AppendLine("- oracle_postgres_wal_pressure_recommended_action: $($snapshot.oracle.postgres_wal_pressure_recommended_action)")
    [void]$markdown.AppendLine("- oracle_postgres_wal_safe_limit_recommendation_gib: $($snapshot.oracle.postgres_wal_safe_limit_recommendation_gib)")
    [void]$markdown.AppendLine("- oracle_postgres_wal_gib: $($snapshot.oracle.postgres_wal_gib)")
    [void]$markdown.AppendLine("- oracle_electric_slot_name: $($snapshot.oracle.electric_slot_name)")
    [void]$markdown.AppendLine("- oracle_electric_slot_active: $($snapshot.oracle.electric_slot_active)")
    [void]$markdown.AppendLine("- oracle_electric_slot_retained_wal_gib: $($snapshot.oracle.electric_slot_retained_wal_gib)")
    [void]$markdown.AppendLine("- oracle_runtime_repair_kind: $($snapshot.oracle.runtime_repair_kind)")
    [void]$markdown.AppendLine("- oracle_runtime_repair_required: $($snapshot.oracle.runtime_repair_required)")
    [void]$markdown.AppendLine("- oracle_runtime_repair_reason: $($snapshot.oracle.runtime_repair_reason)")
    [void]$markdown.AppendLine("- oracle_runtime_repair_recommended_action: $($snapshot.oracle.runtime_repair_recommended_action)")
    [void]$markdown.AppendLine("- oracle_runtime_repair_blocks_backup_verify: $($snapshot.oracle.runtime_repair_blocks_backup_verify)")
    [void]$markdown.AppendLine("- oracle_runtime_repair_blocks_restore_drill: $($snapshot.oracle.runtime_repair_blocks_restore_drill)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_available: $($snapshot.oracle.cleanup_execute_available)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_current_with_plan: $($snapshot.oracle.cleanup_execute_current_with_plan)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_stale_relative_to_plan: $($snapshot.oracle.cleanup_execute_stale_relative_to_plan)")
    [void]$markdown.AppendLine("- oracle_remediation_current_with_inputs: $($snapshot.oracle.remediation_current_with_inputs)")
    [void]$markdown.AppendLine("- oracle_remediation_stale_relative_to_inputs: $($snapshot.oracle.remediation_stale_relative_to_inputs)")
    [void]$markdown.AppendLine("- oracle_cleanup_execute_step_count: $($snapshot.oracle.cleanup_execute_step_count)")
    [void]$markdown.AppendLine("- staged_runtime_path_count: $($snapshot.oracle.staged_runtime_path_count)")
    [void]$markdown.AppendLine("- staged_runtime_gib: $($snapshot.oracle.staged_runtime_gib)")
    [void]$markdown.AppendLine("- staged_runtime_manifest_path: $($snapshot.oracle.staged_runtime_manifest_path)")
    [void]$markdown.AppendLine("- local_stage_manifest_present: $($snapshot.oracle.local_stage_manifest_present)")
    [void]$markdown.AppendLine("- local_stage_required_runtime_scripts_count: $($snapshot.oracle.local_stage_required_runtime_scripts_count)")
    [void]$markdown.AppendLine("- oracle_remediation_outcome: $($snapshot.oracle.remediation_outcome)")
    [void]$markdown.AppendLine("- oracle_remediation_cleanup_mode: $($snapshot.oracle.remediation_cleanup_mode)")
    [void]$markdown.AppendLine("- oracle_remediation_cleanup_step_count: $($snapshot.oracle.remediation_cleanup_step_count)")
    [void]$markdown.AppendLine("- oracle_remediation_root_use_delta_pct: $($snapshot.oracle.remediation_root_use_delta_pct)")
    [void]$markdown.AppendLine("- oracle_safe_now_cleanup_execute_hint: $($snapshot.oracle.safe_now_cleanup_execute_hint)")
    [void]$markdown.AppendLine("- oracle_safe_now_cleanup_follow_through_command: $($snapshot.oracle.safe_now_cleanup_follow_through_command)")
    [void]$markdown.AppendLine("- oracle_phase_two_cleanup_execute_hint: $($snapshot.oracle.phase_two_cleanup_execute_hint)")
    [void]$markdown.AppendLine("- artifact_oracle_wal_slot_remediation: $($snapshot.artifact_paths.oracle_wal_slot_remediation)")
    [void]$markdown.AppendLine("- artifact_oracle_synthetic_cleanup: $($snapshot.artifact_paths.oracle_synthetic_cleanup)")
    [void]$markdown.AppendLine("- artifact_oracle_operational_history_cleanup: $($snapshot.artifact_paths.oracle_operational_history_cleanup)")
    [void]$markdown.AppendLine("- personalos_partial: $($snapshot.personalos.partial)")
    [void]$markdown.AppendLine("- personalos_not_started: $($snapshot.personalos.not_started)")
    [void]$markdown.AppendLine("- personalos_total_tasks: $($snapshot.personalos.total_tasks)")
    [void]$markdown.AppendLine("- personalos_partial_tasks: $($snapshot.personalos.partial_tasks)")
    [void]$markdown.AppendLine("- personalos_not_started_tasks: $($snapshot.personalos.not_started_tasks)")
    [void]$markdown.AppendLine("- personalos_residual_open_items: $($snapshot.personalos.residual_open_items)")
    [void]$markdown.AppendLine("- storage_local_safe_delete_count: $($snapshot.storage.local_safe_delete_count)")
    [void]$markdown.AppendLine("- storage_local_safe_delete_gib: $($snapshot.storage.local_safe_delete_gib)")
    [void]$markdown.AppendLine("- storage_oracle_safe_cleanup_group_count: $($snapshot.storage.oracle_safe_cleanup_group_count)")
    [void]$markdown.AppendLine("- storage_oracle_safe_cleanup_gib: $($snapshot.storage.oracle_safe_cleanup_gib)")
    [void]$markdown.AppendLine("- storage_oracle_review_required_group_count: $($snapshot.storage.oracle_review_required_group_count)")
    [void]$markdown.AppendLine("- storage_oracle_review_required_gib: $($snapshot.storage.oracle_review_required_gib)")
    [void]$markdown.AppendLine("- storage_oracle_runtime_required_group_count: $($snapshot.storage.oracle_runtime_required_group_count)")
    [void]$markdown.AppendLine("- storage_oracle_runtime_required_gib: $($snapshot.storage.oracle_runtime_required_gib)")
    [void]$markdown.AppendLine("- storage_top_oracle_runtime_required_groups: $(@($snapshot.storage.top_oracle_runtime_required_groups) -join ', ')")
    [void]$markdown.AppendLine("- storage_top_oracle_safe_cleanup_group: $($snapshot.storage.top_oracle_safe_cleanup_group)")
    [void]$markdown.AppendLine("- storage_top_oracle_safe_cleanup_gib: $($snapshot.storage.top_oracle_safe_cleanup_gib)")
    [void]$markdown.AppendLine("- storage_top_oracle_delete_priority_groups: $(@($snapshot.storage.top_oracle_delete_priority_groups) -join ', ')")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_mode: $($snapshot.storage.oracle_synthetic_message_cleanup_mode)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_status: $($snapshot.storage.oracle_synthetic_message_pressure_status)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_summary: $($snapshot.storage.oracle_synthetic_message_pressure_summary)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_total_dupes: $($snapshot.storage.oracle_synthetic_message_pressure_total_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_maintenance_summary_dupes: $($snapshot.storage.oracle_synthetic_message_pressure_maintenance_summary_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_curator_card_dupes: $($snapshot.storage.oracle_synthetic_message_pressure_curator_card_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_curator_backlink_dupes: $($snapshot.storage.oracle_synthetic_message_pressure_curator_backlink_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_pressure_ingestion_topology_dupes: $($snapshot.storage.oracle_synthetic_message_pressure_ingestion_topology_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_command: $($snapshot.storage.oracle_synthetic_message_cleanup_command)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_deleted_total: $($snapshot.storage.oracle_synthetic_message_cleanup_deleted_total)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_before_total_dupes: $($snapshot.storage.oracle_synthetic_message_cleanup_before_total_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_after_total_dupes: $($snapshot.storage.oracle_synthetic_message_cleanup_after_total_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_before_maintenance_summary_dupes: $($snapshot.storage.oracle_synthetic_message_cleanup_before_maintenance_summary_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_before_curator_card_dupes: $($snapshot.storage.oracle_synthetic_message_cleanup_before_curator_card_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_before_curator_backlink_dupes: $($snapshot.storage.oracle_synthetic_message_cleanup_before_curator_backlink_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_synthetic_message_cleanup_before_ingestion_topology_dupes: $($snapshot.storage.oracle_synthetic_message_cleanup_before_ingestion_topology_dupes)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_pressure_status: $($snapshot.storage.oracle_operational_history_pressure_status)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_pressure_total_rows: $($snapshot.storage.oracle_operational_history_pressure_total_rows)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_mode: $($snapshot.storage.oracle_operational_history_cleanup_mode)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_command: $($snapshot.storage.oracle_operational_history_cleanup_command)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_follow_through_command: $($snapshot.storage.oracle_operational_history_cleanup_follow_through_command)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_deleted_total: $($snapshot.storage.oracle_operational_history_cleanup_deleted_total)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_before_total_rows: $($snapshot.storage.oracle_operational_history_cleanup_before_total_rows)")
    [void]$markdown.AppendLine("- storage_oracle_operational_history_cleanup_after_total_rows: $($snapshot.storage.oracle_operational_history_cleanup_after_total_rows)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Blockers")
    [void]$markdown.AppendLine()
    foreach ($blocker in $snapshot.commercial_readiness.blockers) {
        [void]$markdown.AppendLine("- $blocker")
    }
    if (@($snapshot.oracle_evidence_consistency.items).Count -gt 0) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("## Oracle Evidence Consistency")
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("- status: $($snapshot.oracle_evidence_consistency.status)")
        [void]$markdown.AppendLine("- summary: $($snapshot.oracle_evidence_consistency.summary)")
        foreach ($item in @($snapshot.oracle_evidence_consistency.items)) {
            [void]$markdown.AppendLine("- $item")
        }
    }
    if ($null -ne $remediationSummaryForSnapshot) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("## Oracle Remediation")
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("- outcome: $($remediationSummaryForSnapshot.outcome)")
        [void]$markdown.AppendLine("- cleanup_mode: $($remediationSummaryForSnapshot.cleanup_mode)")
        [void]$markdown.AppendLine("- cleanup_step_count: $($remediationSummaryForSnapshot.cleanup_step_count)")
        [void]$markdown.AppendLine("- baseline_root_use_pct: $($remediationSummaryForSnapshot.baseline_root_use_pct)")
        [void]$markdown.AppendLine("- final_root_use_pct: $($remediationSummaryForSnapshot.final_root_use_pct)")
        [void]$markdown.AppendLine("- root_use_delta_pct: $($remediationSummaryForSnapshot.root_use_delta_pct)")
        [void]$markdown.AppendLine("- baseline_backup_verify_status: $($remediationSummaryForSnapshot.baseline_backup_verify_status)")
        [void]$markdown.AppendLine("- final_backup_verify_status: $($remediationSummaryForSnapshot.final_backup_verify_status)")
        [void]$markdown.AppendLine("- baseline_restore_drill_status: $($remediationSummaryForSnapshot.baseline_restore_drill_status)")
        [void]$markdown.AppendLine("- final_restore_drill_status: $($remediationSummaryForSnapshot.final_restore_drill_status)")
        [void]$markdown.AppendLine("- baseline_blocker: $($remediationSummaryForSnapshot.baseline_blocker)")
        [void]$markdown.AppendLine("- final_blocker: $($remediationSummaryForSnapshot.final_blocker)")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Open personalOS Phases")
    [void]$markdown.AppendLine()
    foreach ($phase in $snapshot.personalos.open_phase_titles) {
        [void]$markdown.AppendLine("- $phase")
    }
    if (@($snapshot.personalos.prioritized_open_phases).Count -gt 0) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("## Priority personalOS Phase Load")
        [void]$markdown.AppendLine()
        foreach ($phase in $snapshot.personalos.prioritized_open_phases) {
            [void]$markdown.AppendLine("- $phase")
        }
    }
    if (@($snapshot.personalos.top_open_tasks).Count -gt 0) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("## Top Open personalOS Tasks")
        [void]$markdown.AppendLine()
        foreach ($task in $snapshot.personalos.top_open_tasks) {
            [void]$markdown.AppendLine("- $task")
        }
    }
    if (@($snapshot.personalos.top_residual_items).Count -gt 0) {
        if (@($snapshot.personalos.residual_phase_summaries).Count -gt 0) {
            [void]$markdown.AppendLine()
            [void]$markdown.AppendLine("## Residual personalOS Phase Clusters")
            [void]$markdown.AppendLine()
            foreach ($summary in @($snapshot.personalos.residual_phase_summaries)) {
                [void]$markdown.AppendLine("- $summary")
            }
        }
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine("## Top Residual personalOS Blockers")
        [void]$markdown.AppendLine()
        foreach ($item in $snapshot.personalos.top_residual_items) {
            [void]$markdown.AppendLine("- $item")
        }
    }
    $markdown.ToString() | Set-Content (Join-Path $OutDir "commercial-readiness-snapshot.md")
}

$goNoGoStatus = if ($status -eq "ready") { "go" } else { "no_go" }
$resolvedStatusDocPath = Resolve-ArtifactPath -Path $StatusDocPath
$resolvedComparisonSnapshotPath = Resolve-ArtifactPath -Path $ComparisonSnapshotPath
if ([string]::IsNullOrWhiteSpace($resolvedComparisonSnapshotPath)) {
    $statusDocTargetPath = if (-not [string]::IsNullOrWhiteSpace($resolvedStatusDocPath)) { $resolvedStatusDocPath } else { $StatusDocPath }
    $defaultStatusDocPath = Resolve-ArtifactPath -Path (Join-Path $PSScriptRoot "..\docs\COMMERCIAL_READINESS_STATUS.md")
    $isPrimaryDefaultLane =
        $null -ne $snapshot.policy -and
        [int]$snapshot.policy.max_frontend_bundle_warnings -eq 2 -and
        -not [bool]$snapshot.policy.require_executed_oracle_remediation
    $isMainStatusDocTarget =
        -not [string]::IsNullOrWhiteSpace($statusDocTargetPath) -and
        (
            $statusDocTargetPath -eq (Join-Path $PSScriptRoot "..\docs\COMMERCIAL_READINESS_STATUS.md") -or
            (
                -not [string]::IsNullOrWhiteSpace($defaultStatusDocPath) -and
                $statusDocTargetPath -eq $defaultStatusDocPath
            )
        )
    if ($isPrimaryDefaultLane -and $isMainStatusDocTarget) {
        $resolvedComparisonSnapshotPath = Resolve-ArtifactPath -Path (Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-strict-current\commercial-readiness-snapshot.json")
    }
}
$comparisonSnapshot = if (-not [string]::IsNullOrWhiteSpace($resolvedComparisonSnapshotPath) -and $resolvedComparisonSnapshotPath -ne $OutDir) {
    Get-Content -LiteralPath $resolvedComparisonSnapshotPath -Raw | ConvertFrom-Json
} else {
    $null
}
$comparisonGoNoGoStatus =
    if ($null -ne $comparisonSnapshot -and $null -ne $comparisonSnapshot.commercial_readiness) {
        Get-GoNoGoStatusFromCommercialStatus -CommercialStatus ([string]$comparisonSnapshot.commercial_readiness.status)
    } else {
        $null
    }
if (-not [string]::IsNullOrWhiteSpace($StatusDocPath)) {
    $statusDocDir = Split-Path -Parent $StatusDocPath
    if (-not [string]::IsNullOrWhiteSpace($statusDocDir)) {
        New-Item -ItemType Directory -Path $statusDocDir -Force | Out-Null
    }
    Build-CommercialReadinessStatusMarkdown -Snapshot $snapshot -OracleProof $oracleProof -GoNoGoStatus $goNoGoStatus -ComparisonSnapshot $comparisonSnapshot -ComparisonGoNoGoStatus $comparisonGoNoGoStatus |
        Set-Content -Path $StatusDocPath
}

Write-Output "[commercial-readiness-snapshot] status=$status blockers=$($criticalBlockers.Count) oracle_candidate_cleanup_items=$($oracleInventory.counts.candidate_cleanup_items) staged_runtime_gib=$($snapshot.oracle.staged_runtime_gib) personalos_partial=$($personalOs.counts.partial) personalos_not_started=$($personalOs.counts.not_started) personalos_open_tasks=$personalOsOpenTaskCount"
