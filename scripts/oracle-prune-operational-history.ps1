param(
    [ValidateSet("none", "analyze", "vacuum", "vacuum_full")]
    [string]$VacuumMode = "analyze",
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$RemoteDir = "",
    [string]$OutDir = "",
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

if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    throw "[oracle-prune-operational-history] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-prune-operational-history] User is required"
}
if ([string]::IsNullOrWhiteSpace($RemoteDir)) {
    throw "[oracle-prune-operational-history] RemoteDir is required"
}

function Invoke-ExternalChecked {
    param(
        [string]$Exe,
        [string[]]$ArgumentList,
        [string]$Action
    )

    $output = (& $Exe @ArgumentList | Out-String).Trim()
    if (-not $?) {
        throw "[oracle-prune-operational-history] failed while $Action"
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

function Get-FirstRegexMatchGroups {
    param(
        [string]$Text,
        [string]$Pattern
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return $null
    }

    $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
    if (-not $match.Success) {
        return $null
    }

    return $match.Groups
}

$localFiles = @(
    "omnyid-prune-operational-history.sh",
    "prune-operational-history.sql"
) | ForEach-Object { Join-Path $PSScriptRoot $_ }

foreach ($path in $localFiles) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "[oracle-prune-operational-history] required local file not found: $path"
    }
}

$remoteScriptDir = "$RemoteDir/scripts"
$sshBaseArgs = @()
if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
    $sshBaseArgs += @("-i", $KeyPath)
}

foreach ($path in $localFiles) {
    $fileName = Split-Path -Leaf $path
    $remoteTarget = "{0}@{1}:{2}" -f $User, $RemoteHost, "$remoteScriptDir/$fileName"
    Write-Output "[oracle-prune-operational-history] uploading $fileName to $RemoteHost"
    Invoke-ExternalChecked -Exe $ScpExe -ArgumentList ($sshBaseArgs + @($path, $remoteTarget)) -Action "uploading $fileName" | Out-Null
}

$remoteDirLiteral = Convert-ToShellSingleQuotedLiteral -Value $RemoteDir
$remoteScriptDirLiteral = Convert-ToShellSingleQuotedLiteral -Value $remoteScriptDir
$remoteScriptPathLiteral = Convert-ToShellSingleQuotedLiteral -Value "$remoteScriptDir/omnyid-prune-operational-history.sh"
$vacuumLiteral = Convert-ToShellSingleQuotedLiteral -Value $VacuumMode
$dryRunArgument = if ($DryRun) { " --dry-run" } else { "" }
$remoteCommandParts = @(
    "set -euo pipefail",
    "mkdir -p $remoteScriptDirLiteral",
    "chmod 755 $remoteScriptDirLiteral || true",
    "cd $remoteDirLiteral",
    "if [ ! -f ./.env.oracle ]; then echo '[oracle-prune-operational-history] ERROR: .env.oracle not found in remote runtime directory' >&2; exit 1; fi",
    "set -a",
    ". ./.env.oracle",
    "set +a",
    "chmod +x $remoteScriptPathLiteral",
    "$remoteScriptPathLiteral --vacuum-mode $vacuumLiteral$dryRunArgument"
)
$remoteCommand = $remoteCommandParts -join "; "

Write-Output "[oracle-prune-operational-history] executing remote operational-history cleanup with vacuum_mode=$VacuumMode dry_run=$([bool]$DryRun)"
$remoteOutput = Invoke-ExternalChecked -Exe $SshExe -ArgumentList ($sshBaseArgs + @("${User}@${RemoteHost}", $remoteCommand)) -Action "executing remote operational-history cleanup"

if (-not [string]::IsNullOrWhiteSpace($remoteOutput)) {
    Write-Output $remoteOutput
}

$beforeGroups = Get-FirstRegexMatchGroups -Text $remoteOutput -Pattern 'before tenant_action_audit_log=(\d+) daemon_operational_afp=(\d+) tenant_llm_usage_log=(\d+) training_reflection_traces=(\d+) proactive_token_usage=(\d+) user_external_tool_usage_events=(\d+) tenant_workflow_trigger_observations=(\d+) proactive_suggestions=(\d+) trigger_replay_nonces=(\d+)'
$afterGroups = Get-FirstRegexMatchGroups -Text $remoteOutput -Pattern 'after tenant_action_audit_log=(\d+) daemon_operational_afp=(\d+) tenant_llm_usage_log=(\d+) training_reflection_traces=(\d+) proactive_token_usage=(\d+) user_external_tool_usage_events=(\d+) tenant_workflow_trigger_observations=(\d+) proactive_suggestions=(\d+) trigger_replay_nonces=(\d+) deleted_total=(\d+)'

$report = [pscustomobject]@{
    generated_at = [DateTime]::UtcNow.ToString("o")
    remote_host = $RemoteHost
    remote_dir = $RemoteDir
    vacuum_mode = $VacuumMode
    dry_run = [bool]$DryRun
    uploaded_files = @($localFiles | ForEach-Object { Split-Path -Leaf $_ })
    remote_output = $remoteOutput
    before = if ($null -ne $beforeGroups) {
        [pscustomobject]@{
            tenant_action_audit_log = [int]$beforeGroups[1].Value
            daemon_operational_afp = [int]$beforeGroups[2].Value
            tenant_llm_usage_log = [int]$beforeGroups[3].Value
            training_reflection_traces = [int]$beforeGroups[4].Value
            proactive_token_usage = [int]$beforeGroups[5].Value
            user_external_tool_usage_events = [int]$beforeGroups[6].Value
            tenant_workflow_trigger_observations = [int]$beforeGroups[7].Value
            proactive_suggestions = [int]$beforeGroups[8].Value
            trigger_replay_nonces = [int]$beforeGroups[9].Value
        }
    } else {
        $null
    }
    after = if ($null -ne $afterGroups) {
        [pscustomobject]@{
            tenant_action_audit_log = [int]$afterGroups[1].Value
            daemon_operational_afp = [int]$afterGroups[2].Value
            tenant_llm_usage_log = [int]$afterGroups[3].Value
            training_reflection_traces = [int]$afterGroups[4].Value
            proactive_token_usage = [int]$afterGroups[5].Value
            user_external_tool_usage_events = [int]$afterGroups[6].Value
            tenant_workflow_trigger_observations = [int]$afterGroups[7].Value
            proactive_suggestions = [int]$afterGroups[8].Value
            trigger_replay_nonces = [int]$afterGroups[9].Value
            deleted_total = [int]$afterGroups[10].Value
        }
    } else {
        $null
    }
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-prune-operational-history.json")
}
