param(
    [string]$OutDir = "",
    [switch]$StartDetached,
    [switch]$DetachedChild,
    [switch]$RefreshOracleProof,
    [switch]$RefreshOracleInventory,
    [switch]$RefreshOracleRemediation,
    [switch]$UseDetachedOracleProof = $true,
    [switch]$RunReleaseReadiness,
    [string]$EnvFile = "",
    [string]$BackupDir = "",
    [ValidateSet("auto", "always", "never")]
    [string]$ApiFlows = "auto",
    [int]$MaxFrontendBundleWarnings = 2,
    [switch]$RequireExecutedOracleRemediation,
    [switch]$SkipGoNoGo,
    [switch]$SkipCommercialSnapshot,
    [switch]$IncludeSimulatedData = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $PSScriptRoot "..\artifacts\production-readiness-refresh-current"
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Format-SwitchArgument {
    param(
        [string]$Name,
        [bool]$Value
    )

    return ("-{0}:{1}" -f $Name, $(if ($Value) { '$true' } else { '$false' }))
}

function Convert-ToPowerShellSingleQuotedLiteral {
    param([string]$Value)

    return "'" + ($Value -replace "'", "''") + "'"
}

$detachedStatusPath = Join-Path $OutDir "production-readiness-refresh-detached.json"

if ($StartDetached -and -not $DetachedChild) {
    $stdoutPath = Join-Path $OutDir "production-readiness-refresh-detached.stdout.log"
    $stderrPath = Join-Path $OutDir "production-readiness-refresh-detached.stderr.log"
    $scriptPath = $MyInvocation.MyCommand.Path
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        throw "[production-readiness-refresh] unable to determine script path for detached launch"
    }

    foreach ($path in @($stdoutPath, $stderrPath)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
        }
    }

    $childCommand = @(
        "& " + (Convert-ToPowerShellSingleQuotedLiteral $scriptPath)
        "-OutDir " + (Convert-ToPowerShellSingleQuotedLiteral $OutDir)
        "-DetachedChild"
        "-RefreshOracleProof:`$" + $(if ($RefreshOracleProof) { "true" } else { "false" })
        "-RefreshOracleInventory:`$" + $(if ($RefreshOracleInventory) { "true" } else { "false" })
        "-RefreshOracleRemediation:`$" + $(if ($RefreshOracleRemediation) { "true" } else { "false" })
        "-UseDetachedOracleProof:`$" + $(if ($UseDetachedOracleProof) { "true" } else { "false" })
        "-RunReleaseReadiness:`$" + $(if ($RunReleaseReadiness) { "true" } else { "false" })
        "-RequireExecutedOracleRemediation:`$" + $(if ($RequireExecutedOracleRemediation) { "true" } else { "false" })
        "-SkipGoNoGo:`$" + $(if ($SkipGoNoGo) { "true" } else { "false" })
        "-SkipCommercialSnapshot:`$" + $(if ($SkipCommercialSnapshot) { "true" } else { "false" })
        "-IncludeSimulatedData:`$" + $(if ($IncludeSimulatedData) { "true" } else { "false" })
        "-ApiFlows " + (Convert-ToPowerShellSingleQuotedLiteral $ApiFlows)
        "-MaxFrontendBundleWarnings " + [string]$MaxFrontendBundleWarnings
        $(if (-not [string]::IsNullOrWhiteSpace($EnvFile)) { "-EnvFile " + (Convert-ToPowerShellSingleQuotedLiteral $EnvFile) })
        $(if (-not [string]::IsNullOrWhiteSpace($BackupDir)) { "-BackupDir " + (Convert-ToPowerShellSingleQuotedLiteral $BackupDir) })
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $childCommandText = $childCommand -join " "
    $childArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command", $childCommandText
    )

    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $childArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    [pscustomobject]@{
        generated_at = [DateTime]::UtcNow.ToString("o")
        status = "started"
        pid = $process.Id
        out_dir = (Resolve-Path -LiteralPath $OutDir).Path
        stdout_path = $stdoutPath
        stderr_path = $stderrPath
        command = "powershell.exe"
        arguments = @($childArgs)
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $detachedStatusPath

    Write-Output "[production-readiness-refresh] detached_pid=$($process.Id) status_file=$detachedStatusPath"
    return
}

try {
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$stageOutDir = Join-Path $OutDir "oracle-runtime-stage"
$personalOsOutDir = Join-Path $OutDir "personalos-readiness-audit"
$proofOutDir = Join-Path $OutDir "oracle-production-proof"
$inventoryOutDir = Join-Path $OutDir "oracle-runtime-inventory"
$cleanupPlanOutDir = Join-Path $OutDir "oracle-runtime-cleanup-plan"
$cleanupExecuteOutDir = Join-Path $OutDir "oracle-runtime-cleanup-execute"
$remediationOutDir = Join-Path $OutDir "oracle-remediation-sequence"
$commercialSnapshotOutDir = Join-Path $OutDir "commercial-readiness-snapshot"
$strictCommercialSnapshotOutDir = Join-Path $OutDir "commercial-readiness-snapshot-strict"
$storageHygieneOutDir = Join-Path $OutDir "storage-hygiene-report"
$goNoGoOutDir = Join-Path $OutDir "production-go-no-go"
$strictGoNoGoOutDir = Join-Path $OutDir "production-go-no-go-strict"
$releaseReadinessOutDir = Join-Path $OutDir "release-readiness"
$releaseReadinessSummaryPath = if ($RunReleaseReadiness) {
    Join-Path $releaseReadinessOutDir "summary.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\release-readiness-current\summary.json"
}

$steps = New-Object System.Collections.Generic.List[object]

function Update-DetachedRefreshStatus {
    param(
        [string]$Status,
        [string]$CurrentStep = "",
        [string]$CurrentStepStatus = "",
        [AllowNull()][object[]]$StepSnapshot = $null,
        [string]$ErrorMessage = "",
        [string]$ReportPath = ""
    )

    if (-not $DetachedChild) {
        return
    }

    [pscustomobject]@{
        generated_at = [DateTime]::UtcNow.ToString("o")
        status = $Status
        pid = $PID
        out_dir = (Resolve-Path -LiteralPath $OutDir).Path
        current_step = $CurrentStep
        current_step_status = $CurrentStepStatus
        completed_step_count = @($steps.ToArray()).Count
        steps = if ($null -ne $StepSnapshot) { @($StepSnapshot) } else { @($steps.ToArray()) }
        error = $(if (-not [string]::IsNullOrWhiteSpace($ErrorMessage)) { $ErrorMessage } else { $null })
        report_path = $(if (-not [string]::IsNullOrWhiteSpace($ReportPath)) { $ReportPath } else { Join-Path $OutDir "production-readiness-refresh.json" })
        stdout_path = Join-Path $OutDir "production-readiness-refresh-detached.stdout.log"
        stderr_path = Join-Path $OutDir "production-readiness-refresh-detached.stderr.log"
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $detachedStatusPath
}

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
    Update-DetachedRefreshStatus -Status "running" -CurrentStep $Name -CurrentStepStatus $Status
}

function Resolve-ExistingPath {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Sync-DirectoryContents {
    param(
        [string]$SourceDir,
        [string]$DestinationDir
    )

    $resolvedSourceDir = Resolve-ExistingPath -Path $SourceDir
    if ([string]::IsNullOrWhiteSpace($resolvedSourceDir)) {
        throw "[production-readiness-refresh] publish source directory not found: $SourceDir"
    }

    $resolvedDestinationDir = Resolve-ExistingPath -Path $DestinationDir
    if (
        -not [string]::IsNullOrWhiteSpace($resolvedDestinationDir) -and
        $resolvedDestinationDir.TrimEnd('\') -eq $resolvedSourceDir.TrimEnd('\')
    ) {
        return
    }

    if (Test-Path -LiteralPath $DestinationDir) {
        Remove-Item -LiteralPath $DestinationDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    $sourceItems = @(Get-ChildItem -LiteralPath $resolvedSourceDir -Force -ErrorAction SilentlyContinue)
    foreach ($sourceItem in $sourceItems) {
        Copy-Item -LiteralPath $sourceItem.FullName -Destination $DestinationDir -Recurse -Force
    }
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

function Get-ArtifactFreshness {
    param([string]$Path)

    $resolvedPath = Resolve-ExistingPath -Path $Path
    if ([string]::IsNullOrWhiteSpace($resolvedPath)) {
        return [pscustomobject]@{
            path = $Path
            exists = $false
            generated_at = $null
            age_hours = $null
            stale = $null
        }
    }

    $generatedAt = $null
    try {
        $payload = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
        if ($null -ne $payload -and $null -ne $payload.PSObject.Properties["generated_at"]) {
            $generatedAt = [string]$payload.generated_at
        } elseif ($null -ne $payload -and $null -ne $payload.PSObject.Properties["started_at"]) {
            $generatedAt = [string]$payload.started_at
        }
    }
    catch {
        $generatedAt = $null
    }

    $generatedAtParsed = Parse-OptionalDateTimeOffset -Value $generatedAt
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
        path = $resolvedPath
        exists = $true
        generated_at = $generatedAt
        age_hours = $ageHours
        stale = $stale
    }
}

function Get-OptionalIntProperty {
    param(
        [AllowNull()]
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
        [AllowNull()]
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

function Get-OptionalStringArrayProperty {
    param(
        [AllowNull()]
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

function Assert-RemediationCurrentWithCleanupPlan {
    param(
        [string]$RemediationPath,
        [string]$CleanupPlanPath
    )

    $remediationFreshness = Get-ArtifactFreshness -Path $RemediationPath
    $cleanupPlanFreshness = Get-ArtifactFreshness -Path $CleanupPlanPath
    if (-not $remediationFreshness.exists -or -not $cleanupPlanFreshness.exists) {
        throw "[production-readiness-refresh] remediation validation failed because one or more artifacts are missing"
    }

    $remediationGeneratedAt = Parse-OptionalDateTimeOffset -Value $remediationFreshness.generated_at
    $cleanupPlanGeneratedAt = Parse-OptionalDateTimeOffset -Value $cleanupPlanFreshness.generated_at
    if ($null -eq $remediationGeneratedAt -or $null -eq $cleanupPlanGeneratedAt) {
        throw "[production-readiness-refresh] remediation validation failed because generated_at metadata is missing"
    }

    if ($remediationGeneratedAt -lt $cleanupPlanGeneratedAt) {
        throw "[production-readiness-refresh] remediation artifact predates refreshed cleanup plan"
    }
}

function Invoke-RefreshStep {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Update-DetachedRefreshStatus -Status "running" -CurrentStep $Name -CurrentStepStatus "in_progress"
    $global:LASTEXITCODE = 0
    $output = & $Command 2>&1
    $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
    $hasFailingExitCode = $null -ne $exitCodeVariable -and $null -ne $exitCodeVariable.Value -and [int]$exitCodeVariable.Value -ne 0
    if ((-not $?) -or $hasFailingExitCode) {
        throw "[production-readiness-refresh] step '$Name' failed`n$output"
    }
    Add-Step -Name $Name -Status "pass" -Detail (($output | Out-String).Trim())
}

function Invoke-RefreshStepAllowingArtifactFailure {
    param(
        [string]$Name,
        [scriptblock]$Command,
        [string]$ArtifactPath,
        [string]$ArtifactDescription
    )

    Update-DetachedRefreshStatus -Status "running" -CurrentStep $Name -CurrentStepStatus "in_progress"
    $output = $null
    $failed = $false
    try {
        $global:LASTEXITCODE = 0
        $output = & $Command 2>&1
        $exitCodeVariable = Get-Variable -Name LASTEXITCODE -ErrorAction SilentlyContinue
        $hasFailingExitCode = $null -ne $exitCodeVariable -and $null -ne $exitCodeVariable.Value -and [int]$exitCodeVariable.Value -ne 0
        if ((-not $?) -or $hasFailingExitCode) {
            $failed = $true
        }
    }
    catch {
        $output = $_
        $failed = $true
    }

    if (-not $failed) {
        Add-Step -Name $Name -Status "pass" -Detail (($output | Out-String).Trim())
        return
    }

    $artifactFreshness = Get-ArtifactFreshness -Path $ArtifactPath
    if ($artifactFreshness.exists) {
        $freshnessDetailParts = New-Object System.Collections.Generic.List[string]
        if (-not [string]::IsNullOrWhiteSpace($artifactFreshness.generated_at)) {
            $freshnessDetailParts.Add("generated_at=$($artifactFreshness.generated_at)")
        }
        if ($null -ne $artifactFreshness.age_hours) {
            $freshnessDetailParts.Add("age_hours=$($artifactFreshness.age_hours)")
        }
        if ($null -ne $artifactFreshness.stale) {
            $freshnessDetailParts.Add("stale=$($artifactFreshness.stale)")
        }
        $freshnessDetail = if ($freshnessDetailParts.Count -gt 0) { "; " + ($freshnessDetailParts -join "; ") } else { "" }
        Add-Step -Name $Name -Status "fresh_fail" -Detail ((($output | Out-String).Trim()) + " [$ArtifactDescription artifact captured$freshnessDetail]")
        return
    }

    throw "[production-readiness-refresh] step '$Name' failed`n$output"
}

Invoke-RefreshStep -Name "stage_runtime" -Command {
    & (Join-Path $PSScriptRoot "stage-oracle-runtime.ps1") -OutputDir $stageOutDir -IncludeSimulatedData:$IncludeSimulatedData
}

Invoke-RefreshStep -Name "personalos_audit" -Command {
    & (Join-Path $PSScriptRoot "personalos-readiness-audit.ps1") -OutDir $personalOsOutDir
}

if ($RunReleaseReadiness) {
    Invoke-RefreshStep -Name "release_readiness" -Command {
        & (Join-Path $PSScriptRoot "release-readiness.ps1") `
            -EnvFile $EnvFile `
            -BackupDir $BackupDir `
            -OutDir $releaseReadinessOutDir `
            -ApiFlows $ApiFlows
    }
}

if ($RefreshOracleProof) {
    Invoke-RefreshStepAllowingArtifactFailure -Name "oracle_proof" -ArtifactPath (Join-Path $proofOutDir "oracle-production-proof.json") -ArtifactDescription "oracle proof" -Command {
        & (Join-Path $PSScriptRoot "oracle-production-proof.ps1") -OutDir $proofOutDir -UseDetachedRemoteAudit:$UseDetachedOracleProof
    }
} else {
    $oracleProofFreshness = Get-ArtifactFreshness -Path (Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current\oracle-production-proof.json")
    if ($oracleProofFreshness.exists) {
        $proofAgeDetail =
            if ($null -ne $oracleProofFreshness.age_hours) {
                "generated_at=$($oracleProofFreshness.generated_at); age_hours=$($oracleProofFreshness.age_hours); stale=$($oracleProofFreshness.stale)"
            } elseif (-not [string]::IsNullOrWhiteSpace($oracleProofFreshness.generated_at)) {
                "generated_at=$($oracleProofFreshness.generated_at)"
            } else {
                "generated_at=unknown"
            }
        Add-Step -Name "oracle_proof" -Status "skipped" -Detail "oracle proof refresh skipped by operator; reused current artifact ($proofAgeDetail)"
    } else {
        Add-Step -Name "oracle_proof" -Status "skipped" -Detail "oracle proof refresh skipped by operator and no current artifact was available"
    }
}

if ($RefreshOracleInventory) {
    Invoke-RefreshStep -Name "oracle_inventory" -Command {
        & (Join-Path $PSScriptRoot "oracle-runtime-inventory.ps1") -OutDir $inventoryOutDir
    }
} else {
    $oracleInventoryFreshness = Get-ArtifactFreshness -Path (Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-inventory-current\oracle-runtime-inventory.json")
    if ($oracleInventoryFreshness.exists) {
        $inventoryAgeDetail =
            if ($null -ne $oracleInventoryFreshness.age_hours) {
                "generated_at=$($oracleInventoryFreshness.generated_at); age_hours=$($oracleInventoryFreshness.age_hours); stale=$($oracleInventoryFreshness.stale)"
            } elseif (-not [string]::IsNullOrWhiteSpace($oracleInventoryFreshness.generated_at)) {
                "generated_at=$($oracleInventoryFreshness.generated_at)"
            } else {
                "generated_at=unknown"
            }
        Add-Step -Name "oracle_inventory" -Status "skipped" -Detail "oracle inventory refresh skipped by operator; reused current artifact ($inventoryAgeDetail)"
    } else {
        Add-Step -Name "oracle_inventory" -Status "skipped" -Detail "oracle inventory refresh skipped by operator and no current artifact was available"
    }
}

$oracleProofPath = if ($RefreshOracleProof) {
    Join-Path $proofOutDir "oracle-production-proof.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current\oracle-production-proof.json"
}
$oracleInventoryPath = if ($RefreshOracleInventory) {
    Join-Path $inventoryOutDir "oracle-runtime-inventory.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-inventory-current\oracle-runtime-inventory.json"
}
$effectiveRefreshOracleRemediation = [bool]$RefreshOracleRemediation
$oracleRemediationPath = if ($effectiveRefreshOracleRemediation) {
    Join-Path $remediationOutDir "oracle-remediation-sequence.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current\oracle-remediation-sequence.json"
}
$oracleWalSlotRemediationPath = if ($effectiveRefreshOracleRemediation) {
    Join-Path $remediationOutDir "wal-slot-remediation\oracle-remediate-electric-slot.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current\wal-slot-remediation\oracle-remediate-electric-slot.json"
}
$oracleSyntheticCleanupPath = if ($effectiveRefreshOracleRemediation) {
    Join-Path $remediationOutDir "synthetic-cleanup\oracle-prune-synthetic-message-spam.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current\synthetic-cleanup\oracle-prune-synthetic-message-spam.json"
}
$oracleOperationalHistoryCleanupPath = if ($effectiveRefreshOracleRemediation) {
    Join-Path $remediationOutDir "operational-history-cleanup\oracle-prune-operational-history.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current\operational-history-cleanup\oracle-prune-operational-history.json"
}

Invoke-RefreshStep -Name "oracle_cleanup_plan" -Command {
    & (Join-Path $PSScriptRoot "oracle-runtime-cleanup-plan.ps1") -InventoryPath $oracleInventoryPath -OutDir $cleanupPlanOutDir
}

$cleanupPlanPath = Join-Path $cleanupPlanOutDir "oracle-runtime-cleanup-plan.json"
Invoke-RefreshStep -Name "oracle_cleanup_execute" -Command {
    & (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -OutDir $cleanupExecuteOutDir `
        -IncludeCombinedReviewCleanup
}

$cleanupExecutePath = Join-Path $cleanupExecuteOutDir "oracle-runtime-cleanup-execute.json"
$stageManifestPath = Join-Path $stageOutDir "oracle-runtime-manifest.json"
$personalOsAuditPath = Join-Path $personalOsOutDir "personalos-readiness-audit.json"
$commercialSnapshotPath = if (-not $SkipCommercialSnapshot) {
    Join-Path $commercialSnapshotOutDir "commercial-readiness-snapshot.json"
} else {
    Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-current\commercial-readiness-snapshot.json"
}
$generateStrictComparisonLane =
    -not $SkipCommercialSnapshot -and
    $MaxFrontendBundleWarnings -eq 2 -and
    -not $RequireExecutedOracleRemediation
$strictCommercialSnapshotPath = if ($generateStrictComparisonLane) {
    Join-Path $strictCommercialSnapshotOutDir "commercial-readiness-snapshot.json"
} else {
    $null
}
$strictGoNoGoPath = if ($generateStrictComparisonLane -and -not $SkipGoNoGo) {
    Join-Path $strictGoNoGoOutDir "production-go-no-go.json"
} else {
    $null
}

if ($effectiveRefreshOracleRemediation) {
    Invoke-RefreshStep -Name "oracle_remediation" -Command {
        & (Join-Path $PSScriptRoot "oracle-remediation-sequence.ps1") `
            -CleanupPlanPath $cleanupPlanPath `
            -OutDir $remediationOutDir `
            -SkipProof `
            -IncludeSimulatedData:$IncludeSimulatedData
    }
    Assert-RemediationCurrentWithCleanupPlan -RemediationPath $oracleRemediationPath -CleanupPlanPath $cleanupPlanPath
} else {
    if (Test-Path -LiteralPath $oracleRemediationPath) {
        New-Item -ItemType Directory -Path $remediationOutDir -Force | Out-Null
        Copy-Item -LiteralPath $oracleRemediationPath -Destination (Join-Path $remediationOutDir "oracle-remediation-sequence.json") -Force
        $remediationMarkdownPath = [System.IO.Path]::ChangeExtension($oracleRemediationPath, ".md")
        if (Test-Path -LiteralPath $remediationMarkdownPath) {
            Copy-Item -LiteralPath $remediationMarkdownPath -Destination (Join-Path $remediationOutDir "oracle-remediation-sequence.md") -Force
        }
        $currentWalSlotRemediationDir = Split-Path -Parent $oracleWalSlotRemediationPath
        if (Test-Path -LiteralPath $currentWalSlotRemediationDir) {
            Copy-Item -LiteralPath $currentWalSlotRemediationDir -Destination (Join-Path $remediationOutDir "wal-slot-remediation") -Recurse -Force
        }
        $currentSyntheticCleanupDir = Split-Path -Parent $oracleSyntheticCleanupPath
        if (Test-Path -LiteralPath $currentSyntheticCleanupDir) {
            Copy-Item -LiteralPath $currentSyntheticCleanupDir -Destination (Join-Path $remediationOutDir "synthetic-cleanup") -Recurse -Force
        }
        $currentOperationalHistoryCleanupDir = Split-Path -Parent $oracleOperationalHistoryCleanupPath
        if (Test-Path -LiteralPath $currentOperationalHistoryCleanupDir) {
            Copy-Item -LiteralPath $currentOperationalHistoryCleanupDir -Destination (Join-Path $remediationOutDir "operational-history-cleanup") -Recurse -Force
        }
        $oracleRemediationPath = Join-Path $remediationOutDir "oracle-remediation-sequence.json"
        $oracleWalSlotRemediationPath = Join-Path $remediationOutDir "wal-slot-remediation\oracle-remediate-electric-slot.json"
        $oracleSyntheticCleanupPath = Join-Path $remediationOutDir "synthetic-cleanup\oracle-prune-synthetic-message-spam.json"
        $oracleOperationalHistoryCleanupPath = Join-Path $remediationOutDir "operational-history-cleanup\oracle-prune-operational-history.json"
        $oracleRemediationFreshness = Get-ArtifactFreshness -Path $oracleRemediationPath
        $remediationAgeDetail =
            if ($null -ne $oracleRemediationFreshness.age_hours) {
                "generated_at=$($oracleRemediationFreshness.generated_at); age_hours=$($oracleRemediationFreshness.age_hours); stale=$($oracleRemediationFreshness.stale)"
            } elseif (-not [string]::IsNullOrWhiteSpace($oracleRemediationFreshness.generated_at)) {
                "generated_at=$($oracleRemediationFreshness.generated_at)"
            } else {
                "generated_at=unknown"
            }
        Add-Step -Name "oracle_remediation" -Status "copied_current" -Detail "oracle remediation artifact copied from current audited artifact ($remediationAgeDetail)"
    } else {
        Add-Step -Name "oracle_remediation" -Status "skipped" -Detail "oracle remediation refresh skipped by operator and no current artifact was available"
    }
}

Invoke-RefreshStep -Name "storage_hygiene" -Command {
    & (Join-Path $PSScriptRoot "storage-hygiene-report.ps1") `
        -WorkspaceRoot (Join-Path $PSScriptRoot "..") `
        -OracleProofPath $oracleProofPath `
        -OracleInventoryPath $oracleInventoryPath `
        -OracleCleanupPlanPath $cleanupPlanPath `
        -OracleRemediationPath $oracleRemediationPath `
        -CommercialSnapshotPath (Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-current\commercial-readiness-snapshot.json") `
        -OutDir $storageHygieneOutDir
}

if (-not $SkipCommercialSnapshot) {
    Invoke-RefreshStep -Name "commercial_snapshot" -Command {
        & (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
            -OracleProofPath $oracleProofPath `
            -OracleInventoryPath $oracleInventoryPath `
            -OracleCleanupPlanPath $cleanupPlanPath `
            -OracleCleanupExecutePath $cleanupExecutePath `
            -OracleRemediationPath $oracleRemediationPath `
            -ReleaseReadinessPath $releaseReadinessSummaryPath `
            -PersonalOsAuditPath $personalOsAuditPath `
            -StageManifestPath $stageManifestPath `
            -StorageHygienePath (Join-Path $storageHygieneOutDir "storage-hygiene-report.json") `
            -MaxFrontendBundleWarnings $MaxFrontendBundleWarnings `
            -RequireExecutedOracleRemediation:$RequireExecutedOracleRemediation `
            -OutDir $commercialSnapshotOutDir
    }
    if ($generateStrictComparisonLane) {
        Invoke-RefreshStep -Name "commercial_snapshot_strict" -Command {
            & (Join-Path $PSScriptRoot "commercial-readiness-snapshot.ps1") `
                -OracleProofPath $oracleProofPath `
                -OracleInventoryPath $oracleInventoryPath `
                -OracleCleanupPlanPath $cleanupPlanPath `
                -OracleCleanupExecutePath $cleanupExecutePath `
                -OracleRemediationPath $oracleRemediationPath `
                -ReleaseReadinessPath $releaseReadinessSummaryPath `
                -PersonalOsAuditPath $personalOsAuditPath `
                -StageManifestPath $stageManifestPath `
                -StorageHygienePath (Join-Path $storageHygieneOutDir "storage-hygiene-report.json") `
                -MaxFrontendBundleWarnings 1 `
                -RequireExecutedOracleRemediation `
                -OutDir $strictCommercialSnapshotOutDir
        }
    }
} else {
    Add-Step -Name "commercial_snapshot" -Status "skipped" -Detail "commercial snapshot skipped by operator"
}

if (-not $SkipGoNoGo) {
    Invoke-RefreshStep -Name "go_no_go" -Command {
        if ($RunReleaseReadiness) {
            & (Join-Path $PSScriptRoot "production-go-no-go.ps1") `
                -CommercialSnapshotPath $commercialSnapshotPath `
                -OutDir $goNoGoOutDir `
                -EnvFile $EnvFile `
                -BackupDir $BackupDir `
                -ApiFlows $ApiFlows `
                -MaxFrontendBundleWarnings $MaxFrontendBundleWarnings `
                -RequireExecutedOracleRemediation:$RequireExecutedOracleRemediation
        } else {
            & (Join-Path $PSScriptRoot "production-go-no-go.ps1") `
                -CommercialSnapshotPath $commercialSnapshotPath `
                -OutDir $goNoGoOutDir `
                -MaxFrontendBundleWarnings $MaxFrontendBundleWarnings `
                -RequireExecutedOracleRemediation:$RequireExecutedOracleRemediation `
                -SkipReleaseReadiness
        }
    }
    if ($generateStrictComparisonLane) {
        Invoke-RefreshStep -Name "go_no_go_strict" -Command {
            & (Join-Path $PSScriptRoot "production-go-no-go.ps1") `
                -CommercialSnapshotPath $strictCommercialSnapshotPath `
                -OutDir $strictGoNoGoOutDir `
                -MaxFrontendBundleWarnings 1 `
                -RequireExecutedOracleRemediation `
                -SkipReleaseReadiness
        }
    }
} else {
    Add-Step -Name "go_no_go" -Status "skipped" -Detail "go/no-go refresh skipped by operator"
}

$publishTargets = @(
    @{
        enabled = $true
        source = $stageOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-stage-current"
    },
    @{
        enabled = $true
        source = $personalOsOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\personalos-readiness-audit-current"
    },
    @{
        enabled = $RunReleaseReadiness
        source = $releaseReadinessOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\release-readiness-current"
    },
    @{
        enabled = $RefreshOracleProof
        source = $proofOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current"
    },
    @{
        enabled = $RefreshOracleInventory
        source = $inventoryOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-inventory-current"
    },
    @{
        enabled = $true
        source = $cleanupPlanOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-plan-current"
    },
    @{
        enabled = $true
        source = $cleanupExecuteOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-execute-current"
    },
    @{
        enabled = $effectiveRefreshOracleRemediation
        source = $remediationOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current"
    },
    @{
        enabled = $true
        source = $storageHygieneOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\storage-hygiene-report-current"
    },
    @{
        enabled = -not $SkipCommercialSnapshot
        source = $commercialSnapshotOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-current"
    },
    @{
        enabled = $generateStrictComparisonLane
        source = $strictCommercialSnapshotOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-strict-current"
    },
    @{
        enabled = -not $SkipGoNoGo
        source = $goNoGoOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\production-go-no-go-current"
    },
    @{
        enabled = $generateStrictComparisonLane -and -not $SkipGoNoGo
        source = $strictGoNoGoOutDir
        destination = Join-Path $PSScriptRoot "..\artifacts\production-go-no-go-strict-current"
    }
)

foreach ($publishTarget in $publishTargets) {
    if (-not $publishTarget.enabled) {
        continue
    }
    Sync-DirectoryContents -SourceDir $publishTarget.source -DestinationDir $publishTarget.destination
}

$releaseReadinessSummary = if (-not [string]::IsNullOrWhiteSpace($releaseReadinessSummaryPath) -and (Test-Path -LiteralPath $releaseReadinessSummaryPath)) {
    Get-Content -LiteralPath $releaseReadinessSummaryPath -Raw | ConvertFrom-Json
} else {
    $null
}
$releaseReadinessFrontendBundleReport =
    if ($null -ne $releaseReadinessSummary -and $null -ne $releaseReadinessSummary.PSObject.Properties["artifact_paths"] -and $null -ne $releaseReadinessSummary.artifact_paths) {
        $releaseReadinessSummary.artifact_paths.frontend_bundle_report
    } else {
        $null
    }
$releaseReadinessGeneratedAt =
    if ($null -ne $releaseReadinessSummary) {
        if ($null -ne $releaseReadinessSummary.PSObject.Properties["generated_at"]) {
            [string]$releaseReadinessSummary.generated_at
        } elseif ($null -ne $releaseReadinessSummary.PSObject.Properties["started_at"]) {
            [string]$releaseReadinessSummary.started_at
        } else {
            $null
        }
    } else {
        $null
    }

$report = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    out_dir = (Resolve-Path -LiteralPath $OutDir).Path
    refresh_oracle_proof = [bool]$RefreshOracleProof
    refresh_oracle_inventory = [bool]$RefreshOracleInventory
    refresh_oracle_remediation = $effectiveRefreshOracleRemediation
    refresh_oracle_remediation_explicit = [bool]$RefreshOracleRemediation
    run_release_readiness = [bool]$RunReleaseReadiness
    release_readiness_env_file = $EnvFile
    release_readiness_backup_dir = $BackupDir
    release_readiness_api_flows = $ApiFlows
    policy_max_frontend_bundle_warnings = $MaxFrontendBundleWarnings
    policy_require_executed_oracle_remediation = [bool]$RequireExecutedOracleRemediation
    generated_strict_comparison_lane = [bool]$generateStrictComparisonLane
    release_readiness_status = if ($null -ne $releaseReadinessSummary -and $null -ne $releaseReadinessSummary.PSObject.Properties["status"]) { [string]$releaseReadinessSummary.status } else { $null }
    release_readiness_generated_at = $releaseReadinessGeneratedAt
    release_readiness_frontend_bundle_warning_count = if ($null -ne $releaseReadinessSummary -and $null -ne $releaseReadinessSummary.PSObject.Properties["frontend_bundle_warning_count"]) { [int]$releaseReadinessSummary.frontend_bundle_warning_count } else { $null }
    release_readiness_frontend_bundle_note_count = if ($null -ne $releaseReadinessSummary -and $null -ne $releaseReadinessSummary.PSObject.Properties["frontend_bundle_note_count"]) { [int]$releaseReadinessSummary.frontend_bundle_note_count } else { $null }
    skip_commercial_snapshot = [bool]$SkipCommercialSnapshot
    skip_go_no_go = [bool]$SkipGoNoGo
    artifact_paths = [pscustomobject]@{
        stage_manifest = $stageManifestPath
        personalos_audit = $personalOsAuditPath
        release_readiness = $releaseReadinessSummaryPath
        release_readiness_frontend_bundle_report = $releaseReadinessFrontendBundleReport
        oracle_proof = $oracleProofPath
        oracle_inventory = $oracleInventoryPath
        oracle_cleanup_plan = $cleanupPlanPath
        oracle_cleanup_execute = $cleanupExecutePath
        oracle_remediation = $oracleRemediationPath
        oracle_wal_slot_remediation = if (Test-Path -LiteralPath $oracleWalSlotRemediationPath) { $oracleWalSlotRemediationPath } else { $null }
        oracle_synthetic_cleanup = if (Test-Path -LiteralPath $oracleSyntheticCleanupPath) { $oracleSyntheticCleanupPath } else { $null }
        oracle_operational_history_cleanup = if (Test-Path -LiteralPath $oracleOperationalHistoryCleanupPath) { $oracleOperationalHistoryCleanupPath } else { $null }
        commercial_snapshot = $commercialSnapshotPath
        commercial_snapshot_strict = $strictCommercialSnapshotPath
        storage_hygiene = Join-Path $storageHygieneOutDir "storage-hygiene-report.json"
        go_no_go = if (-not $SkipGoNoGo) { Join-Path $goNoGoOutDir "production-go-no-go.json" } else { $null }
        go_no_go_strict = $strictGoNoGoPath
    }
    reused_artifact_freshness = [pscustomobject]@{
        oracle_proof = if (-not $RefreshOracleProof) { Get-ArtifactFreshness -Path $oracleProofPath } else { $null }
        oracle_inventory = if (-not $RefreshOracleInventory) { Get-ArtifactFreshness -Path $oracleInventoryPath } else { $null }
        release_readiness = if (-not $RunReleaseReadiness) { Get-ArtifactFreshness -Path $releaseReadinessSummaryPath } else { $null }
        oracle_cleanup_execute = $null
        oracle_remediation = if (-not $effectiveRefreshOracleRemediation) { Get-ArtifactFreshness -Path $oracleRemediationPath } else { $null }
        oracle_wal_slot_remediation = if (-not $effectiveRefreshOracleRemediation) { Get-ArtifactFreshness -Path $oracleWalSlotRemediationPath } else { $null }
        oracle_synthetic_cleanup = if (-not $effectiveRefreshOracleRemediation) { Get-ArtifactFreshness -Path $oracleSyntheticCleanupPath } else { $null }
        oracle_operational_history_cleanup = if (-not $effectiveRefreshOracleRemediation) { Get-ArtifactFreshness -Path $oracleOperationalHistoryCleanupPath } else { $null }
        commercial_snapshot = if ($SkipCommercialSnapshot) { Get-ArtifactFreshness -Path $commercialSnapshotPath } else { $null }
        go_no_go = if ($SkipGoNoGo) { Get-ArtifactFreshness -Path (Join-Path $PSScriptRoot "..\artifacts\production-go-no-go-current\production-go-no-go.json") } else { $null }
    }
    stage_manifest_summary = if (Test-Path -LiteralPath $stageManifestPath) {
        $stageManifest = Get-Content -LiteralPath $stageManifestPath -Raw | ConvertFrom-Json
        [pscustomobject]@{
            include_simulated_data = [bool]$stageManifest.include_simulated_data
            copied_path_count = Get-OptionalIntProperty -Object $stageManifest -PropertyName "copied_path_count"
            total_staged_gib = Get-OptionalDoubleProperty -Object $stageManifest -PropertyName "total_staged_gib"
            excluded_existing_path_count = Get-OptionalIntProperty -Object $stageManifest -PropertyName "excluded_existing_path_count"
            excluded_existing_gib = Get-OptionalDoubleProperty -Object $stageManifest -PropertyName "excluded_existing_gib"
            top_excluded_paths = @(Get-OptionalStringArrayProperty -Object $stageManifest -PropertyName "excluded_existing_paths" | Select-Object -First 5)
        }
    } else {
        $null
    }
    steps = @($steps.ToArray())
}

$reusedOracleProof = $report.reused_artifact_freshness.oracle_proof
$reusedOracleInventory = $report.reused_artifact_freshness.oracle_inventory
$reusedReleaseReadiness = $report.reused_artifact_freshness.release_readiness
$reusedOracleRemediation = $report.reused_artifact_freshness.oracle_remediation
$reusedOracleWalSlotRemediation = $report.reused_artifact_freshness.oracle_wal_slot_remediation
$reusedOracleSyntheticCleanup = $report.reused_artifact_freshness.oracle_synthetic_cleanup
$reusedOracleOperationalHistoryCleanup = $report.reused_artifact_freshness.oracle_operational_history_cleanup

$report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "production-readiness-refresh.json")
Update-DetachedRefreshStatus -Status "running" -CurrentStep "report_write" -CurrentStepStatus "completed" -ReportPath (Join-Path $OutDir "production-readiness-refresh.json")

$markdown = New-Object System.Text.StringBuilder
[void]$markdown.AppendLine("# Production Readiness Refresh")
[void]$markdown.AppendLine()
[void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
[void]$markdown.AppendLine("- out_dir: $($report.out_dir)")
[void]$markdown.AppendLine("- refresh_oracle_proof: $($report.refresh_oracle_proof)")
[void]$markdown.AppendLine("- refresh_oracle_inventory: $($report.refresh_oracle_inventory)")
[void]$markdown.AppendLine("- refresh_oracle_remediation: $($report.refresh_oracle_remediation)")
[void]$markdown.AppendLine("- refresh_oracle_remediation_explicit: $($report.refresh_oracle_remediation_explicit)")
[void]$markdown.AppendLine("- run_release_readiness: $($report.run_release_readiness)")
[void]$markdown.AppendLine("- release_readiness_env_file: $($report.release_readiness_env_file)")
[void]$markdown.AppendLine("- release_readiness_backup_dir: $($report.release_readiness_backup_dir)")
[void]$markdown.AppendLine("- release_readiness_api_flows: $($report.release_readiness_api_flows)")
[void]$markdown.AppendLine("- policy_max_frontend_bundle_warnings: $($report.policy_max_frontend_bundle_warnings)")
[void]$markdown.AppendLine("- policy_require_executed_oracle_remediation: $($report.policy_require_executed_oracle_remediation)")
[void]$markdown.AppendLine("- generated_strict_comparison_lane: $($report.generated_strict_comparison_lane)")
[void]$markdown.AppendLine("- release_readiness_status: $($report.release_readiness_status)")
[void]$markdown.AppendLine("- release_readiness_generated_at: $($report.release_readiness_generated_at)")
[void]$markdown.AppendLine("- release_readiness_frontend_bundle_warning_count: $($report.release_readiness_frontend_bundle_warning_count)")
[void]$markdown.AppendLine("- release_readiness_frontend_bundle_note_count: $($report.release_readiness_frontend_bundle_note_count)")
[void]$markdown.AppendLine("- release_readiness_frontend_bundle_report: $($report.artifact_paths.release_readiness_frontend_bundle_report)")
[void]$markdown.AppendLine("- oracle_cleanup_execute_artifact: $($report.artifact_paths.oracle_cleanup_execute)")
[void]$markdown.AppendLine("- oracle_remediation_artifact: $($report.artifact_paths.oracle_remediation)")
[void]$markdown.AppendLine("- oracle_wal_slot_remediation_artifact: $($report.artifact_paths.oracle_wal_slot_remediation)")
[void]$markdown.AppendLine("- oracle_synthetic_cleanup_artifact: $($report.artifact_paths.oracle_synthetic_cleanup)")
[void]$markdown.AppendLine("- oracle_operational_history_cleanup_artifact: $($report.artifact_paths.oracle_operational_history_cleanup)")
[void]$markdown.AppendLine("- skip_commercial_snapshot: $($report.skip_commercial_snapshot)")
[void]$markdown.AppendLine("- skip_go_no_go: $($report.skip_go_no_go)")
[void]$markdown.AppendLine("- reused_oracle_proof_generated_at: $(if ($null -ne $reusedOracleProof) { $reusedOracleProof.generated_at })")
[void]$markdown.AppendLine("- reused_oracle_proof_age_hours: $(if ($null -ne $reusedOracleProof) { $reusedOracleProof.age_hours })")
[void]$markdown.AppendLine("- reused_oracle_proof_stale: $(if ($null -ne $reusedOracleProof) { $reusedOracleProof.stale })")
[void]$markdown.AppendLine("- reused_oracle_inventory_generated_at: $(if ($null -ne $reusedOracleInventory) { $reusedOracleInventory.generated_at })")
[void]$markdown.AppendLine("- reused_oracle_inventory_age_hours: $(if ($null -ne $reusedOracleInventory) { $reusedOracleInventory.age_hours })")
[void]$markdown.AppendLine("- reused_oracle_inventory_stale: $(if ($null -ne $reusedOracleInventory) { $reusedOracleInventory.stale })")
[void]$markdown.AppendLine("- reused_release_readiness_generated_at: $(if ($null -ne $reusedReleaseReadiness) { $reusedReleaseReadiness.generated_at })")
[void]$markdown.AppendLine("- reused_release_readiness_age_hours: $(if ($null -ne $reusedReleaseReadiness) { $reusedReleaseReadiness.age_hours })")
[void]$markdown.AppendLine("- reused_release_readiness_stale: $(if ($null -ne $reusedReleaseReadiness) { $reusedReleaseReadiness.stale })")
[void]$markdown.AppendLine("- reused_oracle_remediation_generated_at: $(if ($null -ne $reusedOracleRemediation) { $reusedOracleRemediation.generated_at })")
[void]$markdown.AppendLine("- reused_oracle_remediation_age_hours: $(if ($null -ne $reusedOracleRemediation) { $reusedOracleRemediation.age_hours })")
[void]$markdown.AppendLine("- reused_oracle_remediation_stale: $(if ($null -ne $reusedOracleRemediation) { $reusedOracleRemediation.stale })")
[void]$markdown.AppendLine("- reused_oracle_wal_slot_remediation_generated_at: $(if ($null -ne $reusedOracleWalSlotRemediation) { $reusedOracleWalSlotRemediation.generated_at })")
[void]$markdown.AppendLine("- reused_oracle_wal_slot_remediation_age_hours: $(if ($null -ne $reusedOracleWalSlotRemediation) { $reusedOracleWalSlotRemediation.age_hours })")
[void]$markdown.AppendLine("- reused_oracle_wal_slot_remediation_stale: $(if ($null -ne $reusedOracleWalSlotRemediation) { $reusedOracleWalSlotRemediation.stale })")
[void]$markdown.AppendLine("- reused_oracle_synthetic_cleanup_generated_at: $(if ($null -ne $reusedOracleSyntheticCleanup) { $reusedOracleSyntheticCleanup.generated_at })")
[void]$markdown.AppendLine("- reused_oracle_synthetic_cleanup_age_hours: $(if ($null -ne $reusedOracleSyntheticCleanup) { $reusedOracleSyntheticCleanup.age_hours })")
[void]$markdown.AppendLine("- reused_oracle_synthetic_cleanup_stale: $(if ($null -ne $reusedOracleSyntheticCleanup) { $reusedOracleSyntheticCleanup.stale })")
[void]$markdown.AppendLine("- reused_oracle_operational_history_cleanup_generated_at: $(if ($null -ne $reusedOracleOperationalHistoryCleanup) { $reusedOracleOperationalHistoryCleanup.generated_at })")
[void]$markdown.AppendLine("- reused_oracle_operational_history_cleanup_age_hours: $(if ($null -ne $reusedOracleOperationalHistoryCleanup) { $reusedOracleOperationalHistoryCleanup.age_hours })")
[void]$markdown.AppendLine("- reused_oracle_operational_history_cleanup_stale: $(if ($null -ne $reusedOracleOperationalHistoryCleanup) { $reusedOracleOperationalHistoryCleanup.stale })")
[void]$markdown.AppendLine("- storage_hygiene_artifact: $(Join-Path $storageHygieneOutDir "storage-hygiene-report.json")")
if ($null -ne $report.stage_manifest_summary) {
    [void]$markdown.AppendLine("- stage_manifest_include_simulated_data: $($report.stage_manifest_summary.include_simulated_data)")
    [void]$markdown.AppendLine("- stage_manifest_copied_path_count: $($report.stage_manifest_summary.copied_path_count)")
    [void]$markdown.AppendLine("- stage_manifest_total_staged_gib: $($report.stage_manifest_summary.total_staged_gib)")
    [void]$markdown.AppendLine("- stage_manifest_excluded_existing_path_count: $($report.stage_manifest_summary.excluded_existing_path_count)")
    [void]$markdown.AppendLine("- stage_manifest_excluded_existing_gib: $($report.stage_manifest_summary.excluded_existing_gib)")
    [void]$markdown.AppendLine("- stage_manifest_top_excluded_paths: $(@($report.stage_manifest_summary.top_excluded_paths) -join ', ')")
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
$markdown.ToString() | Set-Content (Join-Path $OutDir "production-readiness-refresh.md")

Write-Output "[production-readiness-refresh] proof=$([bool]$RefreshOracleProof) inventory=$([bool]$RefreshOracleInventory) steps=$($report.steps.Count)"
if ($DetachedChild) {
    Update-DetachedRefreshStatus -Status "completed" -CurrentStep "done" -CurrentStepStatus "completed" -ReportPath (Join-Path $OutDir "production-readiness-refresh.json")
}
}
catch {
    if ($DetachedChild) {
        Update-DetachedRefreshStatus -Status "failed" -CurrentStep "failed" -CurrentStepStatus "failed" -ErrorMessage $_.Exception.Message -ReportPath (Join-Path $OutDir "production-readiness-refresh.json")
    }
    throw
}
