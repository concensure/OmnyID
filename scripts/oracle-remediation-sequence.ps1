param(
    [string]$CleanupPlanPath = "",
    [string]$EnvFile = "",
    [string]$OutDir = "",
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$RemoteDir = "",
    [switch]$UseDetachedOracleProof = $true,
    [switch]$ExecuteCleanup,
    [switch]$Deploy,
    [switch]$SkipProof,
    [switch]$SkipRestoreDrillProof,
    [switch]$IncludeSimulatedData = $true,
    [switch]$IncludeReviewTargetCleanup,
    [switch]$IncludeBackupRetentionCleanup,
    [switch]$IncludeCombinedReviewCleanup,
    [switch]$SkipHostCleanup,
    [switch]$ExecuteSyntheticMessageCleanup,
    [switch]$ExecuteOperationalHistoryCleanup,
    [switch]$ExecuteWalSlotRemediation,
    [switch]$WalSlotDropSlot,
    [switch]$WalSlotCheckpointAfterDrop,
    [int]$WalSlotLimitGiB = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$destructiveReviewModeCount = @(
    [bool]$IncludeReviewTargetCleanup,
    [bool]$IncludeBackupRetentionCleanup,
    [bool]$IncludeCombinedReviewCleanup
) | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count

if ($destructiveReviewModeCount -gt 1) {
    throw "[oracle-remediation-sequence] only one of -IncludeReviewTargetCleanup, -IncludeBackupRetentionCleanup, or -IncludeCombinedReviewCleanup may be set"
}

function Get-OptionalConfigValue {
    param([string]$Name)

    $variable = Get-Variable -Name $Name -ErrorAction SilentlyContinue
    if ($null -eq $variable) {
        return $null
    }
    return $variable.Value
}

function Assert-LastExitCodeZero {
    param([string]$FailureMessage)

    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    if ($null -ne $exitCodeVariable -and $exitCodeVariable.Value -ne 0) {
        throw $FailureMessage
    }
}

function Get-LastExitCodeValue {
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    if ($null -eq $exitCodeVariable) {
        return $null
    }
    return $exitCodeVariable.Value
}

$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = Get-OptionalConfigValue -Name "ORACLE_HOST" }
if (-not $User)       { $User       = Get-OptionalConfigValue -Name "ORACLE_USER" }
if (-not $KeyPath)    { $KeyPath    = Get-OptionalConfigValue -Name "ORACLE_KEY" }
if (-not $RemoteDir)  { $RemoteDir  = Get-OptionalConfigValue -Name "ORACLE_DIR" }

if ([string]::IsNullOrWhiteSpace($CleanupPlanPath)) {
    $CleanupPlanPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-plan-current\oracle-runtime-cleanup-plan.json"
}
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$cleanupOutDir = Join-Path $OutDir "cleanup"
$walSlotOutDir = Join-Path $OutDir "wal-slot-remediation"
$syntheticCleanupOutDir = Join-Path $OutDir "synthetic-cleanup"
$operationalHistoryCleanupOutDir = Join-Path $OutDir "operational-history-cleanup"
$initialProofOutDir = Join-Path $OutDir "initial-proof"
$deployProofOutDir = Join-Path $OutDir "deploy-proof"
$finalProofOutDir = Join-Path $OutDir "final-proof"

$summary = [ordered]@{
    generated_at = $null
    remote_host = $RemoteHost
    remote_dir = $RemoteDir
    cleanup_plan_path = if (Test-Path -LiteralPath $CleanupPlanPath) { (Resolve-Path -LiteralPath $CleanupPlanPath).Path } else { $CleanupPlanPath }
    execute_cleanup = [bool]$ExecuteCleanup
    deploy = [bool]$Deploy
    skip_proof = [bool]$SkipProof
    skip_restore_drill_proof = [bool]$SkipRestoreDrillProof
    operator_include_review_target_cleanup = [bool]$IncludeReviewTargetCleanup
    operator_include_backup_retention_cleanup = [bool]$IncludeBackupRetentionCleanup
    operator_include_combined_review_cleanup = [bool]$IncludeCombinedReviewCleanup
    operator_skip_host_cleanup = [bool]$SkipHostCleanup
    operator_execute_synthetic_message_cleanup = [bool]$ExecuteSyntheticMessageCleanup
    operator_execute_operational_history_cleanup = [bool]$ExecuteOperationalHistoryCleanup
    operator_execute_wal_slot_remediation = [bool]$ExecuteWalSlotRemediation
    operator_wal_slot_drop_slot = [bool]$WalSlotDropSlot
    operator_wal_slot_checkpoint_after_drop = [bool]$WalSlotCheckpointAfterDrop
    operator_wal_slot_limit_gib = if ($WalSlotLimitGiB -gt 0) { $WalSlotLimitGiB } else { $null }
    steps = New-Object System.Collections.Generic.List[object]
}

$cleanupExecuteCommandBase = "./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath `"$CleanupPlanPath`" -OutDir artifacts/oracle-runtime-cleanup-execute-current"
$walSlotRemediationCommandBase = "./scripts/oracle-remediate-electric-slot.ps1 -CleanupPlanPath `"$CleanupPlanPath`" -OutDir artifacts/oracle-remediate-electric-slot-current"

function Add-Step {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )

    $summary.steps.Add([pscustomobject]@{
        name = $Name
        status = $Status
        detail = $Detail
    })
}

function Read-JsonFile {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
}

function Get-OptionalInt {
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

function Get-OptionalDouble {
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

function Test-OptionalBooleanProperty {
    param(
        [object]$Object,
        [string]$PropertyName
    )

    if ($null -eq $Object) {
        return $false
    }
    $property = $Object.PSObject.Properties[$PropertyName]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $false
    }
    return [bool]$property.Value
}

function Get-OperationalHistoryTotalRows {
    param([object]$Object)

    if ($null -eq $Object) {
        return $null
    }

    $fields = @(
        "tenant_action_audit_log",
        "daemon_operational_afp",
        "tenant_llm_usage_log",
        "training_reflection_traces",
        "proactive_token_usage",
        "user_external_tool_usage_events",
        "tenant_workflow_trigger_observations",
        "proactive_suggestions",
        "trigger_replay_nonces"
    )
    $sum = [int64]0
    $found = $false
    foreach ($field in $fields) {
        $property = $Object.PSObject.Properties[$field]
        if ($null -ne $property -and $null -ne $property.Value -and -not [string]::IsNullOrWhiteSpace([string]$property.Value)) {
            $sum += [int64]$property.Value
            $found = $true
        }
    }

    if (-not $found) {
        return $null
    }
    return $sum
}

$cleanupPlan = Read-JsonFile -Path $CleanupPlanPath
$preCleanupOracleRepairPlan =
    if ($null -ne $cleanupPlan -and $null -ne $cleanupPlan.PSObject.Properties["oracle_repair"]) {
        $cleanupPlan.oracle_repair
    } else {
        $null
    }
$preCleanupOracleRepairKind =
    if ($null -ne $preCleanupOracleRepairPlan -and $null -ne $preCleanupOracleRepairPlan.PSObject.Properties["kind"]) {
        [string]$preCleanupOracleRepairPlan.kind
    } else {
        "none"
    }
$reviewPressurePlan = if ($null -ne $cleanupPlan -and $null -ne $cleanupPlan.PSObject.Properties["review_pressure"]) {
    $cleanupPlan.review_pressure
} else {
    $null
}
$reviewTargetGroup =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["top_target_group"]) {
        [string]$reviewPressurePlan.top_target_group
    } else {
        ""
    }
$reviewTargetKnownSizeGiB =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["top_target_known_size_gib"] -and -not [string]::IsNullOrWhiteSpace([string]$reviewPressurePlan.top_target_known_size_gib)) {
        [double]$reviewPressurePlan.top_target_known_size_gib
    } else {
        $null
    }
$reviewTargetCount =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["top_target_review_count"] -and -not [string]::IsNullOrWhiteSpace([string]$reviewPressurePlan.top_target_review_count)) {
        [int]$reviewPressurePlan.top_target_review_count
    } else {
        $null
    }
$reviewTargetCleanupCommand =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["top_target_cleanup_command"]) {
        [string]$reviewPressurePlan.top_target_cleanup_command
    } else {
        ""
    }
$omnyIdBackupRetentionCleanupCommand =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["omnyid_backup_retention_cleanup_command"]) {
        [string]$reviewPressurePlan.omnyid_backup_retention_cleanup_command
    } else {
        ""
    }
$combinedRetentionAndTopTargetCleanupCommand =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["combined_retention_and_top_target_cleanup_command"]) {
        [string]$reviewPressurePlan.combined_retention_and_top_target_cleanup_command
    } else {
        ""
    }
$postgresWalPressurePlan = if ($null -ne $cleanupPlan -and $null -ne $cleanupPlan.PSObject.Properties["postgres_wal_pressure"]) {
    $cleanupPlan.postgres_wal_pressure
} else {
    $null
}
$postgresWalPressureStatus =
    if ($null -ne $postgresWalPressurePlan -and $null -ne $postgresWalPressurePlan.PSObject.Properties["status"]) {
        [string]$postgresWalPressurePlan.status
    } else {
        ""
    }
$postgresWalPressureSummary =
    if ($null -ne $postgresWalPressurePlan -and $null -ne $postgresWalPressurePlan.PSObject.Properties["summary"]) {
        [string]$postgresWalPressurePlan.summary
    } else {
        ""
    }
$postgresWalPressureRecommendedAction =
    if ($null -ne $postgresWalPressurePlan -and $null -ne $postgresWalPressurePlan.PSObject.Properties["recommended_action"]) {
        [string]$postgresWalPressurePlan.recommended_action
    } else {
        ""
    }
$postgresWalSafeLimitGiB =
    if ($null -ne $postgresWalPressurePlan -and $null -ne $postgresWalPressurePlan.PSObject.Properties["safe_limit_recommendation_gib"] -and -not [string]::IsNullOrWhiteSpace([string]$postgresWalPressurePlan.safe_limit_recommendation_gib)) {
        [int][double]$postgresWalPressurePlan.safe_limit_recommendation_gib
    } else {
        $null
    }
$walSlotLimitValue = if ($WalSlotLimitGiB -gt 0) { $WalSlotLimitGiB } elseif ($null -ne $postgresWalSafeLimitGiB) { $postgresWalSafeLimitGiB } else { $null }
$walSlotRecommended = @("inactive_electric_slot_unbounded", "inactive_electric_slot_retaining_wal") -contains $postgresWalPressureStatus
$walSlotRemediationSteps = @()
if ($walSlotRecommended) {
    $walSlotRemediationSteps += "-RestartElectric"
    if ($WalSlotDropSlot) {
        $walSlotRemediationSteps = @("-DropSlot")
        if ($WalSlotCheckpointAfterDrop) {
            $walSlotRemediationSteps += "-CheckpointAfterDrop"
        }
    }
    $walSlotRemediationSteps += "-ApplyWalLimit"
    if ($null -ne $walSlotLimitValue -and $walSlotLimitValue -gt 0) {
        $walSlotRemediationSteps += "-WalLimitGiB $walSlotLimitValue"
    }
}
$reviewTargets = if ($null -ne $cleanupPlan -and $null -ne $cleanupPlan.PSObject.Properties["review_targets"]) { @($cleanupPlan.review_targets) } else { @() }
$omnyIdBackupRetentionTarget = @($reviewTargets | Where-Object {
    $null -ne $_ -and $null -ne $_.PSObject.Properties["ownership_group"] -and [string]$_.ownership_group -eq "omnyid_backup_retention"
} | Select-Object -First 1)
$omnyIdBackupRetentionKnownSizeGiB =
    if (@($omnyIdBackupRetentionTarget).Count -gt 0) {
        Get-OptionalDouble -Object $omnyIdBackupRetentionTarget[0] -PropertyName "known_size_gib"
    } else {
        $null
    }
$reviewRecommendedAction =
    if ($null -ne $reviewPressurePlan -and $null -ne $reviewPressurePlan.PSObject.Properties["recommended_action"]) {
        [string]$reviewPressurePlan.recommended_action
    } else {
        ""
    }

$baselineProofPath = Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current\oracle-production-proof.json"
$initialProofOutput = $null
$initialProofFailed = $false
try {
    $initialProofOutput = & (Join-Path $PSScriptRoot "oracle-production-proof.ps1") `
        -RemoteHost $RemoteHost `
        -User $User `
        -KeyPath $KeyPath `
        -RemoteDir $RemoteDir `
        -OutDir $initialProofOutDir `
        -SkipRestoreDrill 2>&1
    $initialProofExitCode = Get-LastExitCodeValue
    if ($null -ne $initialProofExitCode -and $initialProofExitCode -ne 0) {
        $initialProofFailed = $true
    }
} catch {
    $initialProofFailed = $true
    $initialProofOutput = $_
}
if (-not $initialProofFailed) {
    Add-Step -Name "initial_proof" -Status "executed" -Detail (($initialProofOutput | Out-String).Trim())
    $baselineProofPath = Join-Path $initialProofOutDir "oracle-production-proof.json"
} else {
    Add-Step -Name "initial_proof" -Status "failed_nonblocking" -Detail (($initialProofOutput | Out-String).Trim())
}

$baselineProof = Read-JsonFile -Path $baselineProofPath
$currentFullProof = Read-JsonFile -Path (Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current\oracle-production-proof.json")
$capacityReferenceProof =
    if ($null -ne $baselineProof -and $null -ne $baselineProof.PSObject.Properties["restore_drill_gap_bytes"] -and -not [string]::IsNullOrWhiteSpace([string]$baselineProof.restore_drill_gap_bytes)) {
        $baselineProof
    } elseif ($null -ne $currentFullProof -and $null -ne $currentFullProof.PSObject.Properties["restore_drill_gap_bytes"] -and -not [string]::IsNullOrWhiteSpace([string]$currentFullProof.restore_drill_gap_bytes)) {
        $currentFullProof
    } else {
        $baselineProof
    }
$restoreDrillGapBytes = Get-OptionalDouble -Object $capacityReferenceProof -PropertyName "restore_drill_gap_bytes"
$restoreDrillGapGiB = if ($null -ne $restoreDrillGapBytes) { [math]::Round(($restoreDrillGapBytes / 1GB), 2) } else { $null }
$topReviewTargetClearsGap =
    if ($null -ne $restoreDrillGapBytes -and $null -ne $reviewTargetKnownSizeGiB) {
        (($reviewTargetKnownSizeGiB * 1GB) -ge $restoreDrillGapBytes)
    } else {
        $null
    }
$omnyIdOnlyClearsGap =
    if ($null -ne $restoreDrillGapBytes -and $null -ne $omnyIdBackupRetentionKnownSizeGiB) {
        (($omnyIdBackupRetentionKnownSizeGiB * 1GB) -ge $restoreDrillGapBytes)
    } else {
        $null
    }
$combinedRetentionAndTopReviewGiB =
    if ($null -ne $reviewTargetKnownSizeGiB -or $null -ne $omnyIdBackupRetentionKnownSizeGiB) {
        [math]::Round(((@($reviewTargetKnownSizeGiB, $omnyIdBackupRetentionKnownSizeGiB) | Where-Object { $null -ne $_ } | Measure-Object -Sum).Sum), 6)
    } else {
        $null
    }
$combinedRetentionAndTopReviewClearsGap =
    if ($null -ne $restoreDrillGapBytes -and $null -ne $combinedRetentionAndTopReviewGiB) {
        (($combinedRetentionAndTopReviewGiB * 1GB) -ge $restoreDrillGapBytes)
    } else {
        $null
    }
$recommendedCleanupIncludeReviewTarget =
    @("targeted_cleanup", "review_target_cleanup") -contains $preCleanupOracleRepairKind
if (-not $recommendedCleanupIncludeReviewTarget -and $null -ne $restoreDrillGapBytes -and $restoreDrillGapBytes -gt 0) {
    if ($true -eq $topReviewTargetClearsGap -and -not [string]::IsNullOrWhiteSpace($reviewTargetCleanupCommand)) {
        $recommendedCleanupIncludeReviewTarget = $true
    }
}
$recommendedCleanupIncludeBackupRetention =
    -not $recommendedCleanupIncludeReviewTarget -and
    $null -ne $restoreDrillGapBytes -and
    $restoreDrillGapBytes -gt 0 -and
    $true -eq $omnyIdOnlyClearsGap -and
    -not [string]::IsNullOrWhiteSpace($omnyIdBackupRetentionCleanupCommand)
$recommendedCleanupIncludeCombinedReview =
    -not $recommendedCleanupIncludeReviewTarget -and
    -not $recommendedCleanupIncludeBackupRetention -and
    $null -ne $restoreDrillGapBytes -and
    $restoreDrillGapBytes -gt 0 -and
    $true -eq $combinedRetentionAndTopReviewClearsGap -and
    -not [string]::IsNullOrWhiteSpace($combinedRetentionAndTopTargetCleanupCommand)

$cleanupIncludeReviewTarget = [bool]$IncludeReviewTargetCleanup
$cleanupIncludeBackupRetention = [bool]$IncludeBackupRetentionCleanup
$cleanupIncludeCombinedReview = [bool]$IncludeCombinedReviewCleanup

$cleanupOutput = & (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
    -CleanupPlanPath $CleanupPlanPath `
    -RemoteHost $RemoteHost `
    -User $User `
    -KeyPath $KeyPath `
    -OutDir $cleanupOutDir `
    -IncludeReviewTargetCleanup:$cleanupIncludeReviewTarget `
    -IncludeBackupRetentionCleanup:$cleanupIncludeBackupRetention `
    -IncludeCombinedReviewCleanup:$cleanupIncludeCombinedReview `
    -SkipHostCleanup:$SkipHostCleanup `
    -Execute:$ExecuteCleanup 2>&1
Assert-LastExitCodeZero -FailureMessage ("[oracle-remediation-sequence] cleanup step failed`n" + ($cleanupOutput | Out-String))
if (-not $?) {
    throw "[oracle-remediation-sequence] cleanup step failed`n$cleanupOutput"
}
$cleanupStatus = if ($ExecuteCleanup) { "executed" } else { "dry_run" }
Add-Step -Name "cleanup" -Status $cleanupStatus -Detail (($cleanupOutput | Out-String).Trim())

$walSlotOutput = $null
$walSlotStatus = if ($ExecuteWalSlotRemediation) { "executed" } else { "dry_run" }
if ($walSlotRecommended) {
    $walSlotScriptArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $PSScriptRoot "oracle-remediate-electric-slot.ps1"),
        "-CleanupPlanPath", $CleanupPlanPath,
        "-RemoteHost", $RemoteHost,
        "-User", $User,
        "-OutDir", $walSlotOutDir
    )
    if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
        $walSlotScriptArgs += @("-KeyPath", $KeyPath)
    }
    if ($WalSlotDropSlot) {
        $walSlotScriptArgs += "-DropSlot"
        if ($WalSlotCheckpointAfterDrop) {
            $walSlotScriptArgs += "-CheckpointAfterDrop"
        }
    } else {
        $walSlotScriptArgs += "-RestartElectric"
    }
    $walSlotScriptArgs += "-ApplyWalLimit"
    if ($null -ne $walSlotLimitValue -and $walSlotLimitValue -gt 0) {
        $walSlotScriptArgs += @("-WalLimitGiB", [string]$walSlotLimitValue)
    }
    if ($ExecuteWalSlotRemediation) {
        $walSlotScriptArgs += "-Execute"
    }

    $walSlotOutput = & powershell.exe @walSlotScriptArgs 2>&1
    Assert-LastExitCodeZero -FailureMessage ("[oracle-remediation-sequence] wal slot remediation step failed`n" + ($walSlotOutput | Out-String))
    if (-not $?) {
        throw "[oracle-remediation-sequence] wal slot remediation step failed`n$walSlotOutput"
    }
    Add-Step -Name "wal_slot_remediation" -Status $walSlotStatus -Detail (($walSlotOutput | Out-String).Trim())
} else {
    Add-Step -Name "wal_slot_remediation" -Status "not_required" -Detail "postgres WAL slot remediation not required by current cleanup plan"
}

$syntheticCleanupOutput = & (Join-Path $PSScriptRoot "oracle-prune-synthetic-message-spam.ps1") `
    -RemoteHost $RemoteHost `
    -User $User `
    -KeyPath $KeyPath `
    -RemoteDir $RemoteDir `
    -OutDir $syntheticCleanupOutDir `
    -VacuumMode analyze `
    -DryRun:(-not $ExecuteSyntheticMessageCleanup) 2>&1
Assert-LastExitCodeZero -FailureMessage ("[oracle-remediation-sequence] synthetic cleanup step failed`n" + ($syntheticCleanupOutput | Out-String))
if (-not $?) {
    throw "[oracle-remediation-sequence] synthetic cleanup step failed`n$syntheticCleanupOutput"
}
$syntheticCleanupStatus = if ($ExecuteSyntheticMessageCleanup) { "executed" } else { "dry_run" }
Add-Step -Name "synthetic_message_cleanup" -Status $syntheticCleanupStatus -Detail (($syntheticCleanupOutput | Out-String).Trim())

$operationalHistoryCleanupOutput = & (Join-Path $PSScriptRoot "oracle-prune-operational-history.ps1") `
    -RemoteHost $RemoteHost `
    -User $User `
    -KeyPath $KeyPath `
    -RemoteDir $RemoteDir `
    -OutDir $operationalHistoryCleanupOutDir `
    -VacuumMode analyze `
    -DryRun:(-not $ExecuteOperationalHistoryCleanup) 2>&1
Assert-LastExitCodeZero -FailureMessage ("[oracle-remediation-sequence] operational history cleanup step failed`n" + ($operationalHistoryCleanupOutput | Out-String))
if (-not $?) {
    throw "[oracle-remediation-sequence] operational history cleanup step failed`n$operationalHistoryCleanupOutput"
}
$operationalHistoryCleanupStatus = if ($ExecuteOperationalHistoryCleanup) { "executed" } else { "dry_run" }
Add-Step -Name "operational_history_cleanup" -Status $operationalHistoryCleanupStatus -Detail (($operationalHistoryCleanupOutput | Out-String).Trim())

$runtimeRepairPlan = if ($null -ne $cleanupPlan -and $null -ne $cleanupPlan.PSObject.Properties["runtime_repair"]) {
    $cleanupPlan.runtime_repair
} else {
    $null
}
$oracleRepairPlan = if ($null -ne $cleanupPlan -and $null -ne $cleanupPlan.PSObject.Properties["oracle_repair"]) {
    $cleanupPlan.oracle_repair
} else {
    $null
}
$oracleRepairKind =
    if ($null -ne $oracleRepairPlan -and $null -ne $oracleRepairPlan.PSObject.Properties["kind"]) {
        [string]$oracleRepairPlan.kind
    } elseif ($null -ne $runtimeRepairPlan -and [bool]$runtimeRepairPlan.required) {
        "redeploy"
    } else {
        "none"
    }
$oracleRepairRequired =
    if ($null -ne $oracleRepairPlan) {
        [bool]$oracleRepairPlan.required
    } else {
        $null -ne $runtimeRepairPlan -and [bool]$runtimeRepairPlan.required
    }
$oracleRepairReason =
    if ($oracleRepairRequired -and $null -ne $oracleRepairPlan -and $null -ne $oracleRepairPlan.PSObject.Properties["reason"]) {
        [string]$oracleRepairPlan.reason
    } elseif ($oracleRepairRequired -and $null -ne $runtimeRepairPlan -and $null -ne $runtimeRepairPlan.PSObject.Properties["reason"]) {
        [string]$runtimeRepairPlan.reason
    } else {
        ""
    }
$oracleRepairRecommendedAction =
    if ($oracleRepairRequired -and $null -ne $oracleRepairPlan -and $null -ne $oracleRepairPlan.PSObject.Properties["recommended_action"]) {
        [string]$oracleRepairPlan.recommended_action
    } elseif ($oracleRepairRequired -and $null -ne $runtimeRepairPlan -and $null -ne $runtimeRepairPlan.PSObject.Properties["recommended_action"]) {
        [string]$runtimeRepairPlan.recommended_action
    } else {
        ""
    }
$runtimeRepairMissingScripts =
    if ($null -ne $runtimeRepairPlan -and [bool]$runtimeRepairPlan.required -and $null -ne $runtimeRepairPlan.PSObject.Properties["missing_scripts"]) {
        @($runtimeRepairPlan.missing_scripts)
    } else {
        @()
    }

if ($Deploy) {
    if ([string]::IsNullOrWhiteSpace($EnvFile)) {
        throw "[oracle-remediation-sequence] EnvFile is required when -Deploy is used"
    }

    $deployOutput = & (Join-Path $PSScriptRoot "deploy-oracle.ps1") `
        -RemoteHost $RemoteHost `
        -User $User `
        -KeyPath $KeyPath `
        -RemoteDir $RemoteDir `
        -EnvFile $EnvFile `
        -ProofOutDir $deployProofOutDir `
        -UseDetachedOracleProof:$UseDetachedOracleProof `
        -IncludeSimulatedData:$IncludeSimulatedData 2>&1
    Assert-LastExitCodeZero -FailureMessage ("[oracle-remediation-sequence] deploy step failed`n" + ($deployOutput | Out-String))
    if (-not $?) {
        throw "[oracle-remediation-sequence] deploy step failed`n$deployOutput"
    }
    Add-Step -Name "deploy" -Status "executed" -Detail (($deployOutput | Out-String).Trim())
} else {
    $deployDetail =
        if ($oracleRepairRequired) {
            @(
                "repair step is required because $oracleRepairReason"
                "repair_kind=$oracleRepairKind"
                "missing_scripts=$(@($runtimeRepairMissingScripts) -join ',')"
                $oracleRepairRecommendedAction
            ) -join "; "
        } else {
            "deploy step skipped by operator"
        }
    Add-Step -Name "deploy" -Status $(if ($oracleRepairRequired) { "required_skipped" } else { "skipped" }) -Detail $deployDetail
}

if (-not $SkipProof) {
    $proofOutput = & (Join-Path $PSScriptRoot "oracle-production-proof.ps1") `
        -RemoteHost $RemoteHost `
        -User $User `
        -KeyPath $KeyPath `
        -RemoteDir $RemoteDir `
        -OutDir $finalProofOutDir `
        -SkipRestoreDrill:$SkipRestoreDrillProof `
        -UseDetachedRemoteAudit:$UseDetachedOracleProof 2>&1
    Assert-LastExitCodeZero -FailureMessage ("[oracle-remediation-sequence] proof step failed`n" + ($proofOutput | Out-String))
    if (-not $?) {
        throw "[oracle-remediation-sequence] proof step failed`n$proofOutput"
    }
    Add-Step -Name "proof" -Status "executed" -Detail (($proofOutput | Out-String).Trim())
} else {
    Add-Step -Name "proof" -Status "skipped" -Detail "proof step skipped by operator"
}

$finalProofPath = if (-not $SkipProof) { Join-Path $finalProofOutDir "oracle-production-proof.json" } else { $null }
$finalProof = Read-JsonFile -Path $finalProofPath
$cleanupReport = Read-JsonFile -Path (Join-Path $cleanupOutDir "oracle-runtime-cleanup-execute.json")
$walSlotReport = Read-JsonFile -Path (Join-Path $walSlotOutDir "oracle-remediate-electric-slot.json")
$syntheticCleanupReport = Read-JsonFile -Path (Join-Path $syntheticCleanupOutDir "oracle-prune-synthetic-message-spam.json")
$syntheticCleanupWasExecuted = [bool]$ExecuteSyntheticMessageCleanup
$syntheticCleanupExecuteHint = "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
$operationalHistoryCleanupReport = Read-JsonFile -Path (Join-Path $operationalHistoryCleanupOutDir "oracle-prune-operational-history.json")
$operationalHistoryCleanupWasExecuted = [bool]$ExecuteOperationalHistoryCleanup
$operationalHistoryCleanupExecuteHint = "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze"
$operationalHistoryCleanupBeforeObject =
    if ($null -ne $operationalHistoryCleanupReport) {
        $operationalHistoryCleanupReport.before
    } else {
        $null
    }
$operationalHistoryCleanupAfterObject =
    if ($null -ne $operationalHistoryCleanupReport) {
        $operationalHistoryCleanupReport.after
    } else {
        $null
    }
$operationalHistoryCleanupBeforeTotalRows = Get-OperationalHistoryTotalRows -Object $operationalHistoryCleanupBeforeObject
$operationalHistoryCleanupAfterTotalRows = Get-OperationalHistoryTotalRows -Object $operationalHistoryCleanupAfterObject
$baselineRootUsePct = Get-OptionalInt -Object $baselineProof -PropertyName "remote_root_use_pct"
$finalRootUsePct = Get-OptionalInt -Object $finalProof -PropertyName "remote_root_use_pct"
$restoreCapacityRecommendation =
    if ($null -eq $restoreDrillGapBytes -or $restoreDrillGapBytes -le 0) {
        ""
    } elseif ($true -eq $omnyIdOnlyClearsGap) {
        "review older OmnyID backup generations first because their known reclaim scope alone is enough to clear the restore-drill gap"
    } elseif ($true -eq $topReviewTargetClearsGap) {
        "review the top non-runtime target '$reviewTargetGroup' first because its known reclaim scope alone is enough to clear the restore-drill gap"
    } elseif ($true -eq $combinedRetentionAndTopReviewClearsGap) {
        "combine older OmnyID backup retention with the top non-runtime review target '$reviewTargetGroup' because neither scope alone clears the restore-drill gap"
    } else {
        "current known reclaim scope is still below the measured restore-drill gap; additional host cleanup or a larger Oracle volume is required"
    }
$rootUseDeltaPct = if ($null -ne $baselineRootUsePct -and $null -ne $finalRootUsePct) { $finalRootUsePct - $baselineRootUsePct } else { $null }
$baselineBlocker = if ($null -ne $baselineProof) { "$($baselineProof.failure_step): $($baselineProof.failure_reason)" } else { "unknown" }
$finalBlocker = if ($null -ne $finalProof) { "$($finalProof.failure_step): $($finalProof.failure_reason)" } else { "unknown" }
$cleanupMode = if ($ExecuteCleanup) { "executed" } else { "dry_run" }
$remediationOutcome =
    if ($null -ne $finalProof -and $finalProof.status -eq "pass") { "proof_passed" }
    elseif ($walSlotRecommended -and -not $ExecuteWalSlotRemediation) { "wal_slot_remediation_required" }
    elseif ($oracleRepairRequired -and $oracleRepairKind -eq "targeted_cleanup" -and -not $ExecuteCleanup) { "targeted_cleanup_required" }
    elseif ($oracleRepairRequired -and $oracleRepairKind -eq "review_target_cleanup" -and -not $ExecuteCleanup) { "review_target_cleanup_required" }
    elseif ($oracleRepairRequired -and -not $Deploy) { "runtime_repair_required" }
    elseif (
        -not $ExecuteCleanup -and
        $null -ne $restoreDrillGapBytes -and
        $restoreDrillGapBytes -gt 0 -and
        $true -eq $combinedRetentionAndTopReviewClearsGap -and
        -not [string]::IsNullOrWhiteSpace($combinedRetentionAndTopTargetCleanupCommand)
    ) { "combined_review_cleanup_required" }
    elseif (
        -not $ExecuteCleanup -and
        $null -ne $restoreDrillGapBytes -and
        $restoreDrillGapBytes -gt 0 -and
        $true -eq $omnyIdOnlyClearsGap -and
        -not [string]::IsNullOrWhiteSpace($omnyIdBackupRetentionCleanupCommand)
    ) { "backup_retention_cleanup_required" }
    elseif (
        -not $ExecuteCleanup -and
        $null -ne $restoreDrillGapBytes -and
        $restoreDrillGapBytes -gt 0 -and
        $true -eq $topReviewTargetClearsGap -and
        -not [string]::IsNullOrWhiteSpace($reviewTargetCleanupCommand)
    ) { "top_review_cleanup_required" }
    elseif ($null -ne $rootUseDeltaPct -and $rootUseDeltaPct -lt 0) { "disk_pressure_improved_but_blockers_remain" }
    elseif (-not $SkipProof -and $null -ne $finalProof) { "blockers_remain" }
    else { "proof_not_rechecked" }

$summary["remediation_summary"] = [pscustomobject]@{
    cleanup_mode = $cleanupMode
    cleanup_step_count = if ($null -ne $cleanupReport) { @($cleanupReport.steps).Count } else { $null }
    planned_candidate_containers = if ($null -ne $cleanupReport -and $null -ne $cleanupReport.planned_counts) { $cleanupReport.planned_counts.candidate_containers } else { $null }
    planned_candidate_volumes = if ($null -ne $cleanupReport -and $null -ne $cleanupReport.planned_counts) { $cleanupReport.planned_counts.candidate_volumes } else { $null }
    planned_candidate_images = if ($null -ne $cleanupReport -and $null -ne $cleanupReport.planned_counts) { $cleanupReport.planned_counts.candidate_images } else { $null }
    cleanup_include_review_target = if ($null -ne $cleanupReport) { Test-OptionalBooleanProperty -Object $cleanupReport -PropertyName "include_review_target_cleanup" } else { $cleanupIncludeReviewTarget }
    cleanup_include_backup_retention = if ($null -ne $cleanupReport) { Test-OptionalBooleanProperty -Object $cleanupReport -PropertyName "include_backup_retention_cleanup" } else { $cleanupIncludeBackupRetention }
    cleanup_include_combined_review = if ($null -ne $cleanupReport) { Test-OptionalBooleanProperty -Object $cleanupReport -PropertyName "include_combined_review_cleanup" } else { $cleanupIncludeCombinedReview }
    cleanup_skip_host_cleanup = if ($null -ne $cleanupReport) { Test-OptionalBooleanProperty -Object $cleanupReport -PropertyName "skip_host_cleanup" } else { [bool]$SkipHostCleanup }
    synthetic_message_cleanup_mode = if ($syntheticCleanupWasExecuted) { "executed" } else { "dry_run" }
    synthetic_message_cleanup_execute_hint = $syntheticCleanupExecuteHint
    synthetic_message_cleanup_deleted_total = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.after) { $syntheticCleanupReport.after.deleted_total } else { $null }
    synthetic_message_cleanup_before_total_dupes = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.before) { $syntheticCleanupReport.before.total_dupes } else { $null }
    synthetic_message_cleanup_after_total_dupes = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.after) { $syntheticCleanupReport.after.total_dupes } else { $null }
    synthetic_message_cleanup_before_maintenance_summary_dupes = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.before) { $syntheticCleanupReport.before.maintenance_summary_dupes } else { $null }
    synthetic_message_cleanup_before_curator_card_dupes = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.before) { $syntheticCleanupReport.before.curator_card_dupes } else { $null }
    synthetic_message_cleanup_before_curator_backlink_dupes = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.before) { $syntheticCleanupReport.before.curator_backlink_dupes } else { $null }
    synthetic_message_cleanup_before_ingestion_topology_dupes = if ($null -ne $syntheticCleanupReport -and $null -ne $syntheticCleanupReport.before) { $syntheticCleanupReport.before.ingestion_topology_dupes } else { $null }
    operational_history_cleanup_mode = if ($operationalHistoryCleanupWasExecuted) { "executed" } else { "dry_run" }
    operational_history_cleanup_execute_hint = $operationalHistoryCleanupExecuteHint
    operational_history_cleanup_deleted_total = if ($null -ne $operationalHistoryCleanupReport -and $null -ne $operationalHistoryCleanupReport.after) { $operationalHistoryCleanupReport.after.deleted_total } else { $null }
    operational_history_cleanup_before_total_rows = $operationalHistoryCleanupBeforeTotalRows
    operational_history_cleanup_after_total_rows = $operationalHistoryCleanupAfterTotalRows
    wal_slot_recommended = $walSlotRecommended
    wal_slot_status = $postgresWalPressureStatus
    wal_slot_summary = $postgresWalPressureSummary
    wal_slot_recommended_action = $postgresWalPressureRecommendedAction
    wal_slot_mode = if ($walSlotRecommended) { $walSlotStatus } else { "not_required" }
    wal_slot_drop_slot = [bool]$WalSlotDropSlot
    wal_slot_checkpoint_after_drop = [bool]$WalSlotCheckpointAfterDrop
    wal_slot_limit_gib = $walSlotLimitValue
    wal_slot_step_count = if ($null -ne $walSlotReport) { @($walSlotReport.steps).Count } else { $null }
    wal_slot_execute_hint =
        if ($walSlotRecommended) {
            ($walSlotRemediationCommandBase + " " + ($walSlotRemediationSteps -join " ") + " -Execute").Trim()
        } else {
            ""
        }
    wal_slot_dry_run_hint =
        if ($walSlotRecommended) {
            ($walSlotRemediationCommandBase + " " + ($walSlotRemediationSteps -join " ")).Trim()
        } else {
            ""
        }
    recommended_cleanup_include_review_target = $recommendedCleanupIncludeReviewTarget
    recommended_cleanup_include_backup_retention = $recommendedCleanupIncludeBackupRetention
    recommended_cleanup_include_combined_review = $recommendedCleanupIncludeCombinedReview
    runtime_repair_kind = $oracleRepairKind
    runtime_repair_required = $oracleRepairRequired
    runtime_repair_reason = $oracleRepairReason
    runtime_repair_recommended_action = $oracleRepairRecommendedAction
    runtime_repair_missing_scripts = $runtimeRepairMissingScripts
    top_review_target_group = $reviewTargetGroup
    top_review_target_known_size_gib = $reviewTargetKnownSizeGiB
    top_review_target_review_count = $reviewTargetCount
    omnyid_backup_retention_known_size_gib = $omnyIdBackupRetentionKnownSizeGiB
    omnyid_backup_retention_cleanup_command = $omnyIdBackupRetentionCleanupCommand
    restore_drill_gap_bytes = $restoreDrillGapBytes
    restore_drill_gap_gib = $restoreDrillGapGiB
    restore_capacity_top_review_target_clears_gap = $topReviewTargetClearsGap
    restore_capacity_omnyid_only_clears_gap = $omnyIdOnlyClearsGap
    restore_capacity_combined_retention_and_top_review_gib = $combinedRetentionAndTopReviewGiB
    restore_capacity_combined_retention_and_top_review_clears_gap = $combinedRetentionAndTopReviewClearsGap
    restore_capacity_recommendation = $restoreCapacityRecommendation
    review_target_cleanup_command = $reviewTargetCleanupCommand
    combined_retention_and_top_target_cleanup_command = $combinedRetentionAndTopTargetCleanupCommand
    safe_now_cleanup_execute_hint = "$cleanupExecuteCommandBase -Execute"
    review_target_cleanup_execute_hint = "$cleanupExecuteCommandBase -IncludeReviewTargetCleanup -Execute"
    backup_retention_cleanup_execute_hint = "$cleanupExecuteCommandBase -IncludeBackupRetentionCleanup -Execute"
    combined_review_cleanup_execute_hint = "$cleanupExecuteCommandBase -IncludeCombinedReviewCleanup -Execute"
    review_recommended_action = $reviewRecommendedAction
    baseline_proof_path = if (Test-Path -LiteralPath $baselineProofPath) { (Resolve-Path -LiteralPath $baselineProofPath).Path } else { $baselineProofPath }
    final_proof_path = if ($null -ne $finalProofPath -and (Test-Path -LiteralPath $finalProofPath)) { (Resolve-Path -LiteralPath $finalProofPath).Path } else { $finalProofPath }
    baseline_status = if ($null -ne $baselineProof) { $baselineProof.status } else { "unknown" }
    final_status = if ($null -ne $finalProof) { $finalProof.status } else { "unknown" }
    baseline_root_use_pct = $baselineRootUsePct
    final_root_use_pct = $finalRootUsePct
    root_use_delta_pct = $rootUseDeltaPct
    baseline_backup_verify_status = if ($null -ne $baselineProof) { $baselineProof.backup_verify_status } else { "unknown" }
    final_backup_verify_status = if ($null -ne $finalProof) { $finalProof.backup_verify_status } else { "unknown" }
    baseline_restore_drill_status = if ($null -ne $baselineProof) { $baselineProof.restore_drill_status } else { "unknown" }
    final_restore_drill_status = if ($null -ne $finalProof) { $finalProof.restore_drill_status } else { "unknown" }
    baseline_runtime_script_integrity_status = if ($null -ne $baselineProof -and $null -ne $baselineProof.PSObject.Properties["runtime_script_integrity_status"]) { $baselineProof.runtime_script_integrity_status } else { "unknown" }
    final_runtime_script_integrity_status = if ($null -ne $finalProof -and $null -ne $finalProof.PSObject.Properties["runtime_script_integrity_status"]) { $finalProof.runtime_script_integrity_status } else { "unknown" }
    baseline_blocker = $baselineBlocker
    final_blocker = $finalBlocker
    outcome = $remediationOutcome
}

$summary["artifact_paths"] = [pscustomobject]@{
    cleanup = if (Test-Path -LiteralPath (Join-Path $cleanupOutDir "oracle-runtime-cleanup-execute.json")) { (Resolve-Path -LiteralPath (Join-Path $cleanupOutDir "oracle-runtime-cleanup-execute.json")).Path } else { $null }
    wal_slot_remediation = if (Test-Path -LiteralPath (Join-Path $walSlotOutDir "oracle-remediate-electric-slot.json")) { (Resolve-Path -LiteralPath (Join-Path $walSlotOutDir "oracle-remediate-electric-slot.json")).Path } else { $null }
    synthetic_cleanup = if (Test-Path -LiteralPath (Join-Path $syntheticCleanupOutDir "oracle-prune-synthetic-message-spam.json")) { (Resolve-Path -LiteralPath (Join-Path $syntheticCleanupOutDir "oracle-prune-synthetic-message-spam.json")).Path } else { $null }
    operational_history_cleanup = if (Test-Path -LiteralPath (Join-Path $operationalHistoryCleanupOutDir "oracle-prune-operational-history.json")) { (Resolve-Path -LiteralPath (Join-Path $operationalHistoryCleanupOutDir "oracle-prune-operational-history.json")).Path } else { $null }
    baseline_proof = if ($null -ne $baselineProofPath -and (Test-Path -LiteralPath $baselineProofPath)) { (Resolve-Path -LiteralPath $baselineProofPath).Path } else { $null }
    final_proof = if ($null -ne $finalProofPath -and (Test-Path -LiteralPath $finalProofPath)) { (Resolve-Path -LiteralPath $finalProofPath).Path } else { $null }
}

$summary.steps = @($summary.steps.ToArray())
$summary["generated_at"] = [DateTime]::UtcNow.ToString("o")
$report = [pscustomobject]$summary
$report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-remediation-sequence.json")

$markdown = New-Object System.Text.StringBuilder
[void]$markdown.AppendLine("# Oracle Remediation Sequence")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
[void]$markdown.AppendLine("- remote_host: $($report.remote_host)")
[void]$markdown.AppendLine("- remote_dir: $($report.remote_dir)")
[void]$markdown.AppendLine("- cleanup_plan_path: $($report.cleanup_plan_path)")
[void]$markdown.AppendLine("- execute_cleanup: $($report.execute_cleanup)")
[void]$markdown.AppendLine("- deploy: $($report.deploy)")
[void]$markdown.AppendLine("- skip_proof: $($report.skip_proof)")
[void]$markdown.AppendLine("- skip_restore_drill_proof: $($report.skip_restore_drill_proof)")
[void]$markdown.AppendLine("- remediation_outcome: $($report.remediation_summary.outcome)")
[void]$markdown.AppendLine("- baseline_root_use_pct: $($report.remediation_summary.baseline_root_use_pct)")
[void]$markdown.AppendLine("- final_root_use_pct: $($report.remediation_summary.final_root_use_pct)")
[void]$markdown.AppendLine("- root_use_delta_pct: $($report.remediation_summary.root_use_delta_pct)")
[void]$markdown.AppendLine("- baseline_status: $($report.remediation_summary.baseline_status)")
[void]$markdown.AppendLine("- final_status: $($report.remediation_summary.final_status)")
[void]$markdown.AppendLine("- cleanup_artifact: $($report.artifact_paths.cleanup)")
[void]$markdown.AppendLine("- wal_slot_remediation_artifact: $($report.artifact_paths.wal_slot_remediation)")
[void]$markdown.AppendLine("- synthetic_cleanup_artifact: $($report.artifact_paths.synthetic_cleanup)")
[void]$markdown.AppendLine("- operational_history_cleanup_artifact: $($report.artifact_paths.operational_history_cleanup)")
[void]$markdown.AppendLine("- baseline_proof_artifact: $($report.artifact_paths.baseline_proof)")
[void]$markdown.AppendLine("- final_proof_artifact: $($report.artifact_paths.final_proof)")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("## Remediation Summary")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("- cleanup_mode: $($report.remediation_summary.cleanup_mode)")
[void]$markdown.AppendLine("- cleanup_step_count: $($report.remediation_summary.cleanup_step_count)")
[void]$markdown.AppendLine("- planned_candidate_containers: $($report.remediation_summary.planned_candidate_containers)")
[void]$markdown.AppendLine("- planned_candidate_volumes: $($report.remediation_summary.planned_candidate_volumes)")
[void]$markdown.AppendLine("- planned_candidate_images: $($report.remediation_summary.planned_candidate_images)")
[void]$markdown.AppendLine("- cleanup_include_review_target: $($report.remediation_summary.cleanup_include_review_target)")
[void]$markdown.AppendLine("- cleanup_include_backup_retention: $($report.remediation_summary.cleanup_include_backup_retention)")
[void]$markdown.AppendLine("- cleanup_include_combined_review: $($report.remediation_summary.cleanup_include_combined_review)")
[void]$markdown.AppendLine("- cleanup_skip_host_cleanup: $($report.remediation_summary.cleanup_skip_host_cleanup)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_mode: $($report.remediation_summary.synthetic_message_cleanup_mode)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_execute_hint: $($report.remediation_summary.synthetic_message_cleanup_execute_hint)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_deleted_total: $($report.remediation_summary.synthetic_message_cleanup_deleted_total)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_before_total_dupes: $($report.remediation_summary.synthetic_message_cleanup_before_total_dupes)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_after_total_dupes: $($report.remediation_summary.synthetic_message_cleanup_after_total_dupes)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_before_maintenance_summary_dupes: $($report.remediation_summary.synthetic_message_cleanup_before_maintenance_summary_dupes)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_before_curator_card_dupes: $($report.remediation_summary.synthetic_message_cleanup_before_curator_card_dupes)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_before_curator_backlink_dupes: $($report.remediation_summary.synthetic_message_cleanup_before_curator_backlink_dupes)")
[void]$markdown.AppendLine("- synthetic_message_cleanup_before_ingestion_topology_dupes: $($report.remediation_summary.synthetic_message_cleanup_before_ingestion_topology_dupes)")
[void]$markdown.AppendLine("- operational_history_cleanup_mode: $($report.remediation_summary.operational_history_cleanup_mode)")
[void]$markdown.AppendLine("- operational_history_cleanup_execute_hint: $($report.remediation_summary.operational_history_cleanup_execute_hint)")
[void]$markdown.AppendLine("- operational_history_cleanup_deleted_total: $($report.remediation_summary.operational_history_cleanup_deleted_total)")
[void]$markdown.AppendLine("- operational_history_cleanup_before_total_rows: $($report.remediation_summary.operational_history_cleanup_before_total_rows)")
[void]$markdown.AppendLine("- operational_history_cleanup_after_total_rows: $($report.remediation_summary.operational_history_cleanup_after_total_rows)")
[void]$markdown.AppendLine("- wal_slot_recommended: $($report.remediation_summary.wal_slot_recommended)")
[void]$markdown.AppendLine("- wal_slot_status: $($report.remediation_summary.wal_slot_status)")
[void]$markdown.AppendLine("- wal_slot_summary: $($report.remediation_summary.wal_slot_summary)")
[void]$markdown.AppendLine("- wal_slot_recommended_action: $($report.remediation_summary.wal_slot_recommended_action)")
[void]$markdown.AppendLine("- wal_slot_mode: $($report.remediation_summary.wal_slot_mode)")
[void]$markdown.AppendLine("- wal_slot_drop_slot: $($report.remediation_summary.wal_slot_drop_slot)")
[void]$markdown.AppendLine("- wal_slot_checkpoint_after_drop: $($report.remediation_summary.wal_slot_checkpoint_after_drop)")
[void]$markdown.AppendLine("- wal_slot_limit_gib: $($report.remediation_summary.wal_slot_limit_gib)")
[void]$markdown.AppendLine("- wal_slot_step_count: $($report.remediation_summary.wal_slot_step_count)")
[void]$markdown.AppendLine("- wal_slot_dry_run_hint: $($report.remediation_summary.wal_slot_dry_run_hint)")
[void]$markdown.AppendLine("- wal_slot_execute_hint: $($report.remediation_summary.wal_slot_execute_hint)")
[void]$markdown.AppendLine("- recommended_cleanup_include_review_target: $($report.remediation_summary.recommended_cleanup_include_review_target)")
[void]$markdown.AppendLine("- recommended_cleanup_include_backup_retention: $($report.remediation_summary.recommended_cleanup_include_backup_retention)")
[void]$markdown.AppendLine("- recommended_cleanup_include_combined_review: $($report.remediation_summary.recommended_cleanup_include_combined_review)")
[void]$markdown.AppendLine("- runtime_repair_kind: $($report.remediation_summary.runtime_repair_kind)")
[void]$markdown.AppendLine("- runtime_repair_required: $($report.remediation_summary.runtime_repair_required)")
[void]$markdown.AppendLine("- runtime_repair_reason: $($report.remediation_summary.runtime_repair_reason)")
[void]$markdown.AppendLine("- runtime_repair_missing_scripts: $(@($report.remediation_summary.runtime_repair_missing_scripts) -join ', ')")
[void]$markdown.AppendLine("- runtime_repair_recommended_action: $($report.remediation_summary.runtime_repair_recommended_action)")
[void]$markdown.AppendLine("- top_review_target_group: $($report.remediation_summary.top_review_target_group)")
[void]$markdown.AppendLine("- top_review_target_known_size_gib: $($report.remediation_summary.top_review_target_known_size_gib)")
[void]$markdown.AppendLine("- top_review_target_review_count: $($report.remediation_summary.top_review_target_review_count)")
[void]$markdown.AppendLine("- omnyid_backup_retention_known_size_gib: $($report.remediation_summary.omnyid_backup_retention_known_size_gib)")
[void]$markdown.AppendLine("- omnyid_backup_retention_cleanup_command: $($report.remediation_summary.omnyid_backup_retention_cleanup_command)")
[void]$markdown.AppendLine("- restore_drill_gap_bytes: $($report.remediation_summary.restore_drill_gap_bytes)")
[void]$markdown.AppendLine("- restore_drill_gap_gib: $($report.remediation_summary.restore_drill_gap_gib)")
[void]$markdown.AppendLine("- restore_capacity_top_review_target_clears_gap: $($report.remediation_summary.restore_capacity_top_review_target_clears_gap)")
[void]$markdown.AppendLine("- restore_capacity_omnyid_only_clears_gap: $($report.remediation_summary.restore_capacity_omnyid_only_clears_gap)")
[void]$markdown.AppendLine("- restore_capacity_combined_retention_and_top_review_gib: $($report.remediation_summary.restore_capacity_combined_retention_and_top_review_gib)")
[void]$markdown.AppendLine("- restore_capacity_combined_retention_and_top_review_clears_gap: $($report.remediation_summary.restore_capacity_combined_retention_and_top_review_clears_gap)")
[void]$markdown.AppendLine("- restore_capacity_recommendation: $($report.remediation_summary.restore_capacity_recommendation)")
[void]$markdown.AppendLine("- review_target_cleanup_command: $($report.remediation_summary.review_target_cleanup_command)")
[void]$markdown.AppendLine("- combined_retention_and_top_target_cleanup_command: $($report.remediation_summary.combined_retention_and_top_target_cleanup_command)")
[void]$markdown.AppendLine("- safe_now_cleanup_execute_hint: $($report.remediation_summary.safe_now_cleanup_execute_hint)")
if (@("targeted_cleanup", "review_target_cleanup") -contains $report.remediation_summary.runtime_repair_kind) {
    [void]$markdown.AppendLine("- review_target_cleanup_execute_hint: $($report.remediation_summary.review_target_cleanup_execute_hint)")
}
if ($report.remediation_summary.outcome -eq "backup_retention_cleanup_required") {
    [void]$markdown.AppendLine("- backup_retention_cleanup_execute_hint: $($report.remediation_summary.backup_retention_cleanup_execute_hint)")
}
if ($report.remediation_summary.outcome -eq "combined_review_cleanup_required") {
    [void]$markdown.AppendLine("- combined_review_cleanup_execute_hint: $($report.remediation_summary.combined_review_cleanup_execute_hint)")
}
[void]$markdown.AppendLine("- review_recommended_action: $($report.remediation_summary.review_recommended_action)")
[void]$markdown.AppendLine("- baseline_runtime_script_integrity_status: $($report.remediation_summary.baseline_runtime_script_integrity_status)")
[void]$markdown.AppendLine("- final_runtime_script_integrity_status: $($report.remediation_summary.final_runtime_script_integrity_status)")
[void]$markdown.AppendLine("- baseline_blocker: $($report.remediation_summary.baseline_blocker)")
[void]$markdown.AppendLine("- final_blocker: $($report.remediation_summary.final_blocker)")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("| step | status | detail |")
[void]$markdown.AppendLine("|---|---|---|")
foreach ($step in $report.steps) {
    $detail = ($step.detail -replace '\r?\n', ' ') -replace '\|', '\|'
    [void]$markdown.AppendLine("| $($step.name) | $($step.status) | $detail |")
}
$markdown.ToString() | Set-Content (Join-Path $OutDir "oracle-remediation-sequence.md")

Write-Output "[oracle-remediation-sequence] cleanup=$([bool]$ExecuteCleanup) deploy=$([bool]$Deploy) skip_proof=$([bool]$SkipProof) steps=$($report.steps.Count)"
