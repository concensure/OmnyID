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
    throw "[oracle-prune-synthetic-message-spam] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-prune-synthetic-message-spam] User is required"
}
if ([string]::IsNullOrWhiteSpace($RemoteDir)) {
    throw "[oracle-prune-synthetic-message-spam] RemoteDir is required"
}

function Invoke-ExternalChecked {
    param(
        [string]$Exe,
        [string[]]$ArgumentList,
        [string]$Action
    )

    $output = (& $Exe @ArgumentList | Out-String).Trim()
    if (-not $?) {
        throw "[oracle-prune-synthetic-message-spam] failed while $Action"
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
    "omnyid-prune-synthetic-message-spam.sh",
    "prune-maintenance-summary-spam.sql",
    "prune-curator-artifact-spam.sql",
    "prune-ingestion-topology-spam.sql"
) | ForEach-Object { Join-Path $PSScriptRoot $_ }

foreach ($path in $localFiles) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "[oracle-prune-synthetic-message-spam] required local file not found: $path"
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
    Write-Output "[oracle-prune-synthetic-message-spam] uploading $fileName to $RemoteHost"
    Invoke-ExternalChecked -Exe $ScpExe -ArgumentList ($sshBaseArgs + @($path, $remoteTarget)) -Action "uploading $fileName" | Out-Null
}

$remoteDirLiteral = Convert-ToShellSingleQuotedLiteral -Value $RemoteDir
$remoteScriptDirLiteral = Convert-ToShellSingleQuotedLiteral -Value $remoteScriptDir
$remoteScriptPathLiteral = Convert-ToShellSingleQuotedLiteral -Value "$remoteScriptDir/omnyid-prune-synthetic-message-spam.sh"
$vacuumLiteral = Convert-ToShellSingleQuotedLiteral -Value $VacuumMode
$dryRunArgument = if ($DryRun) { " --dry-run" } else { "" }
$remoteCommandParts = @(
    "set -euo pipefail",
    "mkdir -p $remoteScriptDirLiteral",
    "chmod 755 $remoteScriptDirLiteral || true",
    "cd $remoteDirLiteral",
    "if [ ! -f ./.env.oracle ]; then echo '[oracle-prune-synthetic-message-spam] ERROR: .env.oracle not found in remote runtime directory' >&2; exit 1; fi",
    "set -a",
    ". ./.env.oracle",
    "set +a",
    "chmod +x $remoteScriptPathLiteral",
    "$remoteScriptPathLiteral --vacuum-mode $vacuumLiteral$dryRunArgument"
)
$remoteCommand = $remoteCommandParts -join "; "

Write-Output "[oracle-prune-synthetic-message-spam] executing remote synthetic-message cleanup with vacuum_mode=$VacuumMode dry_run=$([bool]$DryRun)"
$remoteOutput = Invoke-ExternalChecked -Exe $SshExe -ArgumentList ($sshBaseArgs + @("${User}@${RemoteHost}", $remoteCommand)) -Action "executing remote synthetic-message cleanup"

if (-not [string]::IsNullOrWhiteSpace($remoteOutput)) {
    Write-Output $remoteOutput
}

$beforeGroups = Get-FirstRegexMatchGroups -Text $remoteOutput -Pattern 'before maintenance_summary_dupes=(\d+) curator_card_dupes=(\d+) curator_backlink_dupes=(\d+) ingestion_topology_dupes=(\d+) total_dupes=(\d+)'
$afterGroups = Get-FirstRegexMatchGroups -Text $remoteOutput -Pattern 'after maintenance_summary_dupes=(\d+) curator_card_dupes=(\d+) curator_backlink_dupes=(\d+) ingestion_topology_dupes=(\d+) total_dupes=(\d+) deleted_total=(\d+)'

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
            maintenance_summary_dupes = [int]$beforeGroups[1].Value
            curator_card_dupes = [int]$beforeGroups[2].Value
            curator_backlink_dupes = [int]$beforeGroups[3].Value
            ingestion_topology_dupes = [int]$beforeGroups[4].Value
            total_dupes = [int]$beforeGroups[5].Value
        }
    } else {
        $null
    }
    after = if ($null -ne $afterGroups) {
        [pscustomobject]@{
            maintenance_summary_dupes = [int]$afterGroups[1].Value
            curator_card_dupes = [int]$afterGroups[2].Value
            curator_backlink_dupes = [int]$afterGroups[3].Value
            ingestion_topology_dupes = [int]$afterGroups[4].Value
            total_dupes = [int]$afterGroups[5].Value
            deleted_total = [int]$afterGroups[6].Value
        }
    } else {
        $null
    }
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "oracle-prune-synthetic-message-spam.json")
}
