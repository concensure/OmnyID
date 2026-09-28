param(
    [int]$RetentionHours = 48,
    [int]$BatchSize = 10000,
    [ValidateSet("none", "analyze", "vacuum", "vacuum_full")]
    [string]$VacuumMode = "analyze",
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$RemoteDir = "",
    [string]$SshExe = "ssh.exe",
    [string]$ScpExe = "scp.exe",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User)       { $User       = $ORACLE_USER }
if (-not $KeyPath)    { $KeyPath    = $ORACLE_KEY }
if (-not $RemoteDir)  { $RemoteDir  = $ORACLE_DIR }

if ($RetentionHours -le 0) {
    throw "[oracle-prune-daemon-heartbeats] RetentionHours must be positive"
}
if ($BatchSize -le 0) {
    throw "[oracle-prune-daemon-heartbeats] BatchSize must be positive"
}
if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    throw "[oracle-prune-daemon-heartbeats] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-prune-daemon-heartbeats] User is required"
}
if ([string]::IsNullOrWhiteSpace($RemoteDir)) {
    throw "[oracle-prune-daemon-heartbeats] RemoteDir is required"
}

function Invoke-ExternalChecked {
    param(
        [string]$Exe,
        [string[]]$ArgumentList,
        [string]$Action
    )

    $output = (& $Exe @ArgumentList | Out-String).Trim()
    if (-not $?) {
        throw "[oracle-prune-daemon-heartbeats] failed while $Action"
    }
    return $output
}

function Convert-ToShellSingleQuotedLiteral {
    param([string]$Value)
    if ($null -eq $Value) {
        return "''"
    }
    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

$localScriptPath = Join-Path $PSScriptRoot "omnyid-prune-daemon-heartbeats.sh"
if (-not (Test-Path -LiteralPath $localScriptPath)) {
    throw "[oracle-prune-daemon-heartbeats] local prune script not found: $localScriptPath"
}

$remoteScriptDir = "$RemoteDir/scripts"
$remoteScriptPath = "$remoteScriptDir/omnyid-prune-daemon-heartbeats.sh"
$remoteScpTarget = "{0}@{1}:{2}" -f $User, $RemoteHost, $remoteScriptPath

$sshBaseArgs = @()
if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
    $sshBaseArgs += @("-i", $KeyPath)
}

$remoteDirLiteral = Convert-ToShellSingleQuotedLiteral -Value $RemoteDir
$remoteScriptDirLiteral = Convert-ToShellSingleQuotedLiteral -Value $remoteScriptDir
$remoteScriptPathLiteral = Convert-ToShellSingleQuotedLiteral -Value $remoteScriptPath
$retentionLiteral = Convert-ToShellSingleQuotedLiteral -Value ([string]$RetentionHours)
$batchLiteral = Convert-ToShellSingleQuotedLiteral -Value ([string]$BatchSize)
$vacuumLiteral = Convert-ToShellSingleQuotedLiteral -Value $VacuumMode
$dryRunArgument = if ($DryRun) { " --dry-run" } else { "" }
$remoteCommandParts = @(
    "set -euo pipefail",
    "mkdir -p $remoteScriptDirLiteral",
    "chmod 755 $remoteScriptDirLiteral || true",
    "cd $remoteDirLiteral",
    "if [ ! -f ./.env.oracle ]; then echo '[oracle-prune-daemon-heartbeats] ERROR: .env.oracle not found in remote runtime directory' >&2; exit 1; fi",
    "set -a",
    ". ./.env.oracle",
    "set +a",
    "chmod +x $remoteScriptPathLiteral",
    "$remoteScriptPathLiteral --retention-hours $retentionLiteral --batch-size $batchLiteral --vacuum-mode $vacuumLiteral$dryRunArgument"
)
$remoteCommand = $remoteCommandParts -join "; "

Write-Output "[oracle-prune-daemon-heartbeats] uploading prune script to $RemoteHost"
Invoke-ExternalChecked -Exe $ScpExe -ArgumentList ($sshBaseArgs + @($localScriptPath, $remoteScpTarget)) -Action "uploading prune script" | Out-Null

Write-Output "[oracle-prune-daemon-heartbeats] executing remote prune with retention_hours=$RetentionHours batch_size=$BatchSize vacuum_mode=$VacuumMode dry_run=$([bool]$DryRun)"
$remoteOutput = Invoke-ExternalChecked -Exe $SshExe -ArgumentList ($sshBaseArgs + @("${User}@${RemoteHost}", $remoteCommand)) -Action "executing remote prune"

if (-not [string]::IsNullOrWhiteSpace($remoteOutput)) {
    Write-Output $remoteOutput
}
