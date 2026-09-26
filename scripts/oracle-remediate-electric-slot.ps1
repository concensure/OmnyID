param(
    [string]$CleanupPlanPath = "",
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$OutDir = "",
    [string]$PostgresContainerName = "",
    [string]$ElectricContainerName = "",
    [string]$SlotName = "",
    [int]$WalLimitGiB = 0,
    [switch]$RestartElectric,
    [switch]$DropSlot,
    [switch]$ApplyWalLimit,
    [switch]$CheckpointAfterDrop,
    [switch]$Execute,
    [string]$SshExe = "ssh.exe",
    [string[]]$SshPrefixArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
        throw "[oracle-remediate-electric-slot] remote command failed (exit=$exitCode): $Command`n$detail"
    }
    return $output
}

function Convert-ToShellSingleQuotedLiteral {
    param([string]$Value)

    if ($null -eq $Value) {
        $Value = ""
    }

    return "'" + ($Value -replace "'", "'\''") + "'"
}

function Invoke-RemotePostgresSqlCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ContainerName,
        [Parameter(Mandatory = $true)]
        [string]$Sql
    )

    $innerCommand =
        'psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}" -At -F "|" -c ' +
        (Convert-ToShellSingleQuotedLiteral $Sql)
    $remoteCommand =
        "docker exec " +
        (Convert-ToShellSingleQuotedLiteral $ContainerName) +
        " sh -lc " +
        (Convert-ToShellSingleQuotedLiteral $innerCommand)
    return Invoke-RemoteSshCommand -Command $remoteCommand
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

if ([string]::IsNullOrWhiteSpace($CleanupPlanPath)) {
    $CleanupPlanPath = Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-plan-current\oracle-runtime-cleanup-plan.json"
}

$plan = $null
if (Test-Path -LiteralPath $CleanupPlanPath) {
    $plan = Get-Content -LiteralPath $CleanupPlanPath -Raw | ConvertFrom-Json
}

if ($null -ne $plan) {
    if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
        $RemoteHost = [string](Get-OptionalPropertyValue -Object $plan -PropertyName "remote_host")
    }
    $postgresWalPressure = Get-OptionalPropertyValue -Object $plan -PropertyName "postgres_wal_pressure"
    if (-not [string]::IsNullOrWhiteSpace([string](Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "postgres_container_name")) -and [string]::IsNullOrWhiteSpace($PostgresContainerName)) {
        $PostgresContainerName = [string](Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "postgres_container_name")
    }
    if (-not [string]::IsNullOrWhiteSpace([string](Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "electric_container_name")) -and [string]::IsNullOrWhiteSpace($ElectricContainerName)) {
        $ElectricContainerName = [string](Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "electric_container_name")
    }
    if (-not [string]::IsNullOrWhiteSpace([string](Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "electric_slot_name")) -and [string]::IsNullOrWhiteSpace($SlotName)) {
        $SlotName = [string](Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "electric_slot_name")
    }
    if ($WalLimitGiB -le 0) {
        $recommendedWalLimit = Get-OptionalPropertyValue -Object $postgresWalPressure -PropertyName "safe_limit_recommendation_gib"
        if ($null -ne $recommendedWalLimit -and -not [string]::IsNullOrWhiteSpace([string]$recommendedWalLimit)) {
            $WalLimitGiB = [int][double]$recommendedWalLimit
        }
    }
}

$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost -and $null -ne (Get-Variable -Name ORACLE_HOST -ErrorAction SilentlyContinue)) { $RemoteHost = $ORACLE_HOST }
if (-not $User -and $null -ne (Get-Variable -Name ORACLE_USER -ErrorAction SilentlyContinue)) { $User = $ORACLE_USER }
if (-not $KeyPath -and $null -ne (Get-Variable -Name ORACLE_KEY -ErrorAction SilentlyContinue)) { $KeyPath = $ORACLE_KEY }

if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    throw "[oracle-remediate-electric-slot] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-remediate-electric-slot] User is required"
}
if ([string]::IsNullOrWhiteSpace($PostgresContainerName)) {
    throw "[oracle-remediate-electric-slot] PostgresContainerName is required"
}

$shouldDoSomething = [bool]$RestartElectric -or [bool]$DropSlot -or [bool]$ApplyWalLimit
if (-not $shouldDoSomething) {
    $RestartElectric = $true
    $ApplyWalLimit = $true
}
if ($ApplyWalLimit -and $WalLimitGiB -le 0) {
    throw "[oracle-remediate-electric-slot] WalLimitGiB must be greater than zero when -ApplyWalLimit is used"
}
if ($DropSlot -and [string]::IsNullOrWhiteSpace($SlotName)) {
    throw "[oracle-remediate-electric-slot] SlotName is required when -DropSlot is used"
}
if ($RestartElectric -and [string]::IsNullOrWhiteSpace($ElectricContainerName)) {
    throw "[oracle-remediate-electric-slot] ElectricContainerName is required when -RestartElectric is used"
}

$slotInspectionSql = @"
SELECT
    slot_name,
    slot_type,
    active,
    COALESCE(wal_status, ''),
    COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::bigint, 0),
    COALESCE(pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)), '0 bytes'),
    COALESCE(restart_lsn::text, ''),
    COALESCE(confirmed_flush_lsn::text, '')
FROM pg_replication_slots
WHERE slot_name = '$SlotName';
"@

$beforeSlotState =
    if (-not [string]::IsNullOrWhiteSpace($SlotName)) {
        (Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql $slotInspectionSql | Out-String).Trim()
    } else {
        ""
    }
$beforeSettingState =
    if ($ApplyWalLimit) {
        (Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql "SELECT current_setting('max_slot_wal_keep_size');" | Out-String).Trim()
    } else {
        ""
    }

$steps = New-Object System.Collections.Generic.List[object]

if ($RestartElectric) {
    $command = "docker restart $ElectricContainerName"
    if (-not $Execute) {
        $steps.Add([pscustomobject]@{
            name = "restart_electric"
            status = "dry_run"
            command = $command
            output = ""
        })
    } else {
        $output = Invoke-RemoteSshCommand -Command $command
        $steps.Add([pscustomobject]@{
            name = "restart_electric"
            status = "executed"
            command = $command
            output = $output
        })
    }
}

if ($DropSlot) {
    if ($beforeSlotState -match '\|t\|') {
        throw "[oracle-remediate-electric-slot] refusing to drop active slot '$SlotName'"
    }

    $command = "SELECT pg_drop_replication_slot('$SlotName');"
    if (-not $Execute) {
        $steps.Add([pscustomobject]@{
            name = "drop_slot"
            status = "dry_run"
            command = $command
            output = ""
        })
    } else {
        $output = Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql $command
        $steps.Add([pscustomobject]@{
            name = "drop_slot"
            status = "executed"
            command = $command
            output = $output
        })
    }

    if ($CheckpointAfterDrop) {
        $checkpointCommand = "CHECKPOINT;"
        if (-not $Execute) {
            $steps.Add([pscustomobject]@{
                name = "checkpoint"
                status = "dry_run"
                command = $checkpointCommand
                output = ""
            })
        } else {
            $output = Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql $checkpointCommand
            $steps.Add([pscustomobject]@{
                name = "checkpoint"
                status = "executed"
                command = $checkpointCommand
                output = $output
            })
        }
    }
}

if ($ApplyWalLimit) {
    $command = "ALTER SYSTEM SET max_slot_wal_keep_size = '$($WalLimitGiB)GB'; SELECT pg_reload_conf();"
    if (-not $Execute) {
        $steps.Add([pscustomobject]@{
            name = "limit_slot_wal"
            status = "dry_run"
            command = $command
            output = ""
        })
    } else {
        $output = Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql $command
        $steps.Add([pscustomobject]@{
            name = "limit_slot_wal"
            status = "executed"
            command = $command
            output = $output
        })
    }
}

$afterSlotState =
    if (-not [string]::IsNullOrWhiteSpace($SlotName)) {
        (Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql $slotInspectionSql | Out-String).Trim()
    } else {
        ""
    }
$afterSettingState =
    if ($ApplyWalLimit) {
        (Invoke-RemotePostgresSqlCommand -ContainerName $PostgresContainerName -Sql "SELECT current_setting('max_slot_wal_keep_size');" | Out-String).Trim()
    } else {
        ""
    }

$report = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    cleanup_plan_path = if (Test-Path -LiteralPath $CleanupPlanPath) { (Resolve-Path -LiteralPath $CleanupPlanPath).Path } else { $CleanupPlanPath }
    remote_host = $RemoteHost
    execute = [bool]$Execute
    postgres_container_name = $PostgresContainerName
    electric_container_name = $ElectricContainerName
    slot_name = $SlotName
    restart_electric = [bool]$RestartElectric
    drop_slot = [bool]$DropSlot
    apply_wal_limit = [bool]$ApplyWalLimit
    checkpoint_after_drop = [bool]$CheckpointAfterDrop
    wal_limit_gib = if ($ApplyWalLimit) { $WalLimitGiB } else { $null }
    safety_notes = @(
        "Never delete files from pg_wal manually.",
        "Dropping an inactive abandoned slot allows Postgres to recycle retained WAL.",
        "A finite max_slot_wal_keep_size bounds future growth but may invalidate lagging slots and require Electric resync."
    )
    before = [pscustomobject]@{
        slot_state = $beforeSlotState
        max_slot_wal_keep_size = $beforeSettingState
    }
    after = [pscustomobject]@{
        slot_state = $afterSlotState
        max_slot_wal_keep_size = $afterSettingState
    }
    steps = @($steps.ToArray())
}

if ($OutDir) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-remediate-electric-slot.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# Oracle Electric Slot Remediation")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
    [void]$markdown.AppendLine("- cleanup_plan_path: $($report.cleanup_plan_path)")
    [void]$markdown.AppendLine("- remote_host: $($report.remote_host)")
    [void]$markdown.AppendLine("- execute: $($report.execute)")
    [void]$markdown.AppendLine("- postgres_container_name: $($report.postgres_container_name)")
    [void]$markdown.AppendLine("- electric_container_name: $($report.electric_container_name)")
    [void]$markdown.AppendLine("- slot_name: $($report.slot_name)")
    [void]$markdown.AppendLine("- restart_electric: $($report.restart_electric)")
    [void]$markdown.AppendLine("- drop_slot: $($report.drop_slot)")
    [void]$markdown.AppendLine("- apply_wal_limit: $($report.apply_wal_limit)")
    [void]$markdown.AppendLine("- checkpoint_after_drop: $($report.checkpoint_after_drop)")
    [void]$markdown.AppendLine("- wal_limit_gib: $($report.wal_limit_gib)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Safety Notes")
    [void]$markdown.AppendLine()
    foreach ($note in @($report.safety_notes)) {
        [void]$markdown.AppendLine("- $note")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Before")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- max_slot_wal_keep_size: $($report.before.max_slot_wal_keep_size)")
    [void]$markdown.AppendLine("- slot_state: $($report.before.slot_state)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## After")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- max_slot_wal_keep_size: $($report.after.max_slot_wal_keep_size)")
    [void]$markdown.AppendLine("- slot_state: $($report.after.slot_state)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| step | status | command | output |")
    [void]$markdown.AppendLine("|---|---|---|---|")
    foreach ($step in @($report.steps)) {
        $output = (($step.output -replace '\r?\n', ' ') -replace '\|', '\|').Trim()
        [void]$markdown.AppendLine("| $($step.name) | $($step.status) | $($step.command) | $output |")
    }
    $markdown.ToString() | Set-Content (Join-Path $OutDir "oracle-remediate-electric-slot.md")
}

Write-Output "[oracle-remediate-electric-slot] execute=$([bool]$Execute) restart_electric=$([bool]$RestartElectric) drop_slot=$([bool]$DropSlot) apply_wal_limit=$([bool]$ApplyWalLimit) wal_limit_gib=$WalLimitGiB steps=$(@($report.steps).Count)"
