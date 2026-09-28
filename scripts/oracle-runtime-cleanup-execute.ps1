param(
    [string]$CleanupPlanPath = "",
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$OutDir = "",
    [switch]$Execute,
    [switch]$IncludeReviewTargetCleanup,
    [switch]$IncludeBackupRetentionCleanup,
    [switch]$IncludeCombinedReviewCleanup,
    [switch]$SkipContainers,
    [switch]$SkipImages,
    [switch]$SkipVolumes,
    [switch]$SkipHostCleanup,
    [switch]$SkipPrune,
    [string]$SshExe = "ssh.exe",
    [string[]]$SshPrefixArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$destructiveReviewModeCount = @(
    [bool]$IncludeReviewTargetCleanup,
    [bool]$IncludeBackupRetentionCleanup,
    [bool]$IncludeCombinedReviewCleanup
) | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count

if ($destructiveReviewModeCount -gt 1) {
    throw "[oracle-runtime-cleanup-execute] only one of -IncludeReviewTargetCleanup, -IncludeBackupRetentionCleanup, or -IncludeCombinedReviewCleanup may be set"
}

function Invoke-RemoteSshCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $sshArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
        $sshArgs += @("-i", $KeyPath)
    }
    $sshArgs += @("$User@$RemoteHost", $Command)
    $output = (& $SshExe @SshPrefixArgs @sshArgs 2>&1 | Out-String).Trim()
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $detail = if ([string]::IsNullOrWhiteSpace($output)) { "remote command returned no output" } else { $output }
        throw "[oracle-runtime-cleanup-execute] remote command failed (exit=$exitCode): $Command`n$detail"
    }
    return $output
}

function Test-IsIgnorableDockerAbsenceFailure {
    param(
        [string]$StepName,
        [string]$ErrorMessage
    )

    if ([string]::IsNullOrWhiteSpace($ErrorMessage)) {
        return $false
    }

    switch ($StepName) {
        "images" {
            return $ErrorMessage -match "No such image:"
        }
        "containers" {
            return $ErrorMessage -match "No such container:"
        }
        "volumes" {
            return $ErrorMessage -match "No such volume:"
        }
        default {
            return $false
        }
    }
}

function Get-OptionalPropertyValue {
    param(
        [AllowNull()]
        [object]$Object,
        [Parameter(Mandatory = $true)]
        [string]$PropertyName
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$PropertyName]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User)       { $User       = $ORACLE_USER }
if (-not $KeyPath)    { $KeyPath    = $ORACLE_KEY }
if ([string]::IsNullOrWhiteSpace($CleanupPlanPath)) {
    $CleanupPlanPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-plan-current\oracle-runtime-cleanup-plan.json"
}

if (-not (Test-Path -LiteralPath $CleanupPlanPath)) {
    throw "[oracle-runtime-cleanup-execute] cleanup plan not found: $CleanupPlanPath"
}
if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    throw "[oracle-runtime-cleanup-execute] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-runtime-cleanup-execute] User is required"
}

$plan = Get-Content -LiteralPath $CleanupPlanPath -Raw | ConvertFrom-Json
$steps = New-Object System.Collections.Generic.List[object]
$planCounts = $plan.PSObject.Properties["counts"]
$planEstimatedReclaim = $plan.PSObject.Properties["estimated_reclaim"]
$planCommands = $plan.PSObject.Properties["commands"]

if (-not $SkipContainers -and -not [string]::IsNullOrWhiteSpace($plan.commands.stop_and_remove_containers)) {
    $steps.Add([pscustomobject]@{ name = "containers"; command = $plan.commands.stop_and_remove_containers })
}
if (-not $SkipImages -and -not [string]::IsNullOrWhiteSpace($plan.commands.remove_images)) {
    $steps.Add([pscustomobject]@{ name = "images"; command = $plan.commands.remove_images })
}
if (-not $SkipImages -and -not [string]::IsNullOrWhiteSpace((Get-OptionalPropertyValue -Object $plan.commands -PropertyName "prune_images"))) {
    $steps.Add([pscustomobject]@{ name = "image_prune"; command = $plan.commands.prune_images })
}
if (-not $SkipImages -and -not [string]::IsNullOrWhiteSpace((Get-OptionalPropertyValue -Object $plan.commands -PropertyName "prune_builder_cache"))) {
    $steps.Add([pscustomobject]@{ name = "builder_prune"; command = $plan.commands.prune_builder_cache })
}
if (-not $SkipVolumes -and -not [string]::IsNullOrWhiteSpace($plan.commands.remove_volumes)) {
    $steps.Add([pscustomobject]@{ name = "volumes"; command = $plan.commands.remove_volumes })
}
if (-not $SkipHostCleanup -and -not [string]::IsNullOrWhiteSpace((Get-OptionalPropertyValue -Object $plan.commands -PropertyName "host_cleanup"))) {
    $steps.Add([pscustomobject]@{ name = "host_cleanup"; command = $plan.commands.host_cleanup })
}
if (-not $SkipPrune -and -not [string]::IsNullOrWhiteSpace($plan.commands.prune_unused)) {
    $steps.Add([pscustomobject]@{ name = "prune"; command = $plan.commands.prune_unused })
}
if (
    $IncludeReviewTargetCleanup -and
    -not [string]::IsNullOrWhiteSpace((Get-OptionalPropertyValue -Object $plan.commands -PropertyName "review_target_cleanup"))
) {
    $steps.Add([pscustomobject]@{ name = "review_target_cleanup"; command = $plan.commands.review_target_cleanup })
}
if (
    $IncludeBackupRetentionCleanup -and
    -not [string]::IsNullOrWhiteSpace((Get-OptionalPropertyValue -Object $plan.commands -PropertyName "omnyid_backup_retention_cleanup"))
) {
    $steps.Add([pscustomobject]@{ name = "omnyid_backup_retention_cleanup"; command = $plan.commands.omnyid_backup_retention_cleanup })
}
if (
    $IncludeCombinedReviewCleanup -and
    -not [string]::IsNullOrWhiteSpace((Get-OptionalPropertyValue -Object $plan.commands -PropertyName "combined_retention_and_top_target_cleanup"))
) {
    $steps.Add([pscustomobject]@{ name = "combined_retention_and_top_target_cleanup"; command = $plan.commands.combined_retention_and_top_target_cleanup })
}

$stepResults = New-Object System.Collections.Generic.List[object]
$measurementCommands = [pscustomobject]@{
    disk = "df -h --output=target,size,used,avail,pcent / /var"
    docker = "docker system df"
}
$measurements = [ordered]@{
    commands = $measurementCommands
    before = $null
    after = $null
}

if (-not $Execute) {
    $measurements.before = [pscustomobject]@{
        status = "dry_run"
        detail = "remote disk and docker usage measurements are only collected when -Execute is supplied"
    }
    $measurements.after = [pscustomobject]@{
        status = "dry_run"
        detail = "remote disk and docker usage measurements are only collected when -Execute is supplied"
    }
} else {
    Write-Output "[oracle-runtime-cleanup-execute] collecting pre-cleanup disk and docker usage on $RemoteHost"
    $measurements.before = [pscustomobject]@{
        status = "captured"
        disk = Invoke-RemoteSshCommand -Command $measurementCommands.disk
        docker = Invoke-RemoteSshCommand -Command $measurementCommands.docker
    }
}

foreach ($step in $steps) {
    if (-not $Execute) {
        Write-Output "[oracle-runtime-cleanup-execute] dry-run $($step.name): $($step.command)"
        $stepResults.Add([pscustomobject]@{
            name = $step.name
            command = $step.command
            status = "dry_run"
            output = ""
        })
        continue
    }

    Write-Output "[oracle-runtime-cleanup-execute] executing $($step.name) on $RemoteHost"
    try {
        $output = Invoke-RemoteSshCommand -Command $step.command
        $stepResults.Add([pscustomobject]@{
            name = $step.name
            command = $step.command
            status = "executed"
            output = $output
        })
        if (-not [string]::IsNullOrWhiteSpace($output)) {
            Write-Output $output
        }
    }
    catch {
        $errorMessage = $_.Exception.Message
        if (Test-IsIgnorableDockerAbsenceFailure -StepName $step.name -ErrorMessage $errorMessage) {
            $stepResults.Add([pscustomobject]@{
                name = $step.name
                command = $step.command
                status = "already_absent"
                output = $errorMessage
            })
            Write-Output "[oracle-runtime-cleanup-execute] $($step.name) already absent on $RemoteHost"
            continue
        }
        $stepResults.Add([pscustomobject]@{
            name = $step.name
            command = $step.command
            status = "failed"
            output = $errorMessage
        })
        throw "[oracle-runtime-cleanup-execute] remote step failed: $($step.name)"
    }
}

if ($Execute) {
    Write-Output "[oracle-runtime-cleanup-execute] collecting post-cleanup disk and docker usage on $RemoteHost"
    $measurements.after = [pscustomobject]@{
        status = "captured"
        disk = Invoke-RemoteSshCommand -Command $measurementCommands.disk
        docker = Invoke-RemoteSshCommand -Command $measurementCommands.docker
    }
}

$report = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    cleanup_plan_path = (Resolve-Path -LiteralPath $CleanupPlanPath).Path
    remote_host = $RemoteHost
    execute = [bool]$Execute
    include_review_target_cleanup = [bool]$IncludeReviewTargetCleanup
    include_backup_retention_cleanup = [bool]$IncludeBackupRetentionCleanup
    include_combined_review_cleanup = [bool]$IncludeCombinedReviewCleanup
    skip_host_cleanup = [bool]$SkipHostCleanup
    planned_counts = if ($null -ne $planCounts -and $null -ne $planCounts.Value) {
        [pscustomobject]@{
            candidate_containers = $planCounts.Value.candidate_containers
            candidate_volumes = $planCounts.Value.candidate_volumes
            candidate_images = $planCounts.Value.candidate_images
            candidate_host_items = Get-OptionalPropertyValue -Object $planCounts.Value -PropertyName "candidate_host_items"
        }
    } else {
        $null
    }
    estimated_reclaim = if ($null -ne $planEstimatedReclaim) { $planEstimatedReclaim.Value } else { $null }
    measurements = [pscustomobject]$measurements
    steps = @($stepResults.ToArray())
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-execute.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# Oracle Runtime Cleanup Execution")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
    [void]$markdown.AppendLine("- cleanup_plan_path: $($report.cleanup_plan_path)")
    [void]$markdown.AppendLine("- remote_host: $($report.remote_host)")
    [void]$markdown.AppendLine("- execute: $($report.execute)")
    [void]$markdown.AppendLine("- include_review_target_cleanup: $($report.include_review_target_cleanup)")
    [void]$markdown.AppendLine("- include_backup_retention_cleanup: $($report.include_backup_retention_cleanup)")
    [void]$markdown.AppendLine("- include_combined_review_cleanup: $($report.include_combined_review_cleanup)")
    [void]$markdown.AppendLine("- skip_host_cleanup: $($report.skip_host_cleanup)")
    [void]$markdown.AppendLine("- step_count: $(@($report.steps).Count)")
    if ($null -ne $report.planned_counts) {
        [void]$markdown.AppendLine("- planned_candidate_containers: $($report.planned_counts.candidate_containers)")
        [void]$markdown.AppendLine("- planned_candidate_volumes: $($report.planned_counts.candidate_volumes)")
        [void]$markdown.AppendLine("- planned_candidate_images: $($report.planned_counts.candidate_images)")
        [void]$markdown.AppendLine("- planned_candidate_host_items: $($report.planned_counts.candidate_host_items)")
    }
    if ($null -ne $report.estimated_reclaim) {
        [void]$markdown.AppendLine("- estimated_candidate_image_gib: $($report.estimated_reclaim.candidate_image_gib)")
        [void]$markdown.AppendLine("- estimated_candidate_host_gib: $(Get-OptionalPropertyValue -Object $report.estimated_reclaim -PropertyName "candidate_host_gib")")
        [void]$markdown.AppendLine("- estimated_total_candidate_gib: $($report.estimated_reclaim.total_candidate_gib)")
    }
    if ($null -ne $planCommands -and $null -ne $planCommands.Value) {
        $reviewTargetCleanup = Get-OptionalPropertyValue -Object $planCommands.Value -PropertyName "review_target_cleanup"
        if (-not [string]::IsNullOrWhiteSpace([string]$reviewTargetCleanup)) {
            [void]$markdown.AppendLine("- review_target_cleanup: $reviewTargetCleanup")
        }
        $backupRetentionCleanup = Get-OptionalPropertyValue -Object $planCommands.Value -PropertyName "omnyid_backup_retention_cleanup"
        if (-not [string]::IsNullOrWhiteSpace([string]$backupRetentionCleanup)) {
            [void]$markdown.AppendLine("- omnyid_backup_retention_cleanup: $backupRetentionCleanup")
        }
        $combinedReviewCleanup = Get-OptionalPropertyValue -Object $planCommands.Value -PropertyName "combined_retention_and_top_target_cleanup"
        if (-not [string]::IsNullOrWhiteSpace([string]$combinedReviewCleanup)) {
            [void]$markdown.AppendLine("- combined_retention_and_top_target_cleanup: $combinedReviewCleanup")
        }
    }
    [void]$markdown.AppendLine("- measurement_commands_disk: `$ $($report.measurements.commands.disk)")
    [void]$markdown.AppendLine("- measurement_commands_docker: `$ $($report.measurements.commands.docker)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Measurements")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("### Before")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- status: $($report.measurements.before.status)")
    $beforeDisk = Get-OptionalPropertyValue -Object $report.measurements.before -PropertyName "disk"
    $beforeDocker = Get-OptionalPropertyValue -Object $report.measurements.before -PropertyName "docker"
    $afterDisk = Get-OptionalPropertyValue -Object $report.measurements.after -PropertyName "disk"
    $afterDocker = Get-OptionalPropertyValue -Object $report.measurements.after -PropertyName "docker"
    $beforeDetail = Get-OptionalPropertyValue -Object $report.measurements.before -PropertyName "detail"
    $afterDetail = Get-OptionalPropertyValue -Object $report.measurements.after -PropertyName "detail"
    if ($null -ne $beforeDetail) {
        [void]$markdown.AppendLine("- detail: $beforeDetail")
    }
    if ($null -ne $beforeDisk) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine('```text')
        [void]$markdown.AppendLine($beforeDisk)
        [void]$markdown.AppendLine('```')
    }
    if ($null -ne $beforeDocker) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine('```text')
        [void]$markdown.AppendLine($beforeDocker)
        [void]$markdown.AppendLine('```')
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("### After")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- status: $($report.measurements.after.status)")
    if ($null -ne $afterDetail) {
        [void]$markdown.AppendLine("- detail: $afterDetail")
    }
    if ($null -ne $afterDisk) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine('```text')
        [void]$markdown.AppendLine($afterDisk)
        [void]$markdown.AppendLine('```')
    }
    if ($null -ne $afterDocker) {
        [void]$markdown.AppendLine()
        [void]$markdown.AppendLine('```text')
        [void]$markdown.AppendLine($afterDocker)
        [void]$markdown.AppendLine('```')
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| step | status | command | output |")
    [void]$markdown.AppendLine("|---|---|---|---|")
    foreach ($step in $report.steps) {
        $output = (($step.output -replace '\r?\n', ' ') -replace '\|', '\|').Trim()
        [void]$markdown.AppendLine("| $($step.name) | $($step.status) | $($step.command) | $output |")
    }
    $markdown.ToString() | Set-Content (Join-Path $OutDir "oracle-runtime-cleanup-execute.md")
}

Write-Output "[oracle-runtime-cleanup-execute] complete execute=$([bool]$Execute) steps=$($steps.Count)"
