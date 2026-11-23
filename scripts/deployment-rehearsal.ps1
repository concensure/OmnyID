param(
    [string]$EnvFile = "",
    [ValidateSet("auto", "always", "never")]
    [string]$ApiFlows = "auto",
    [string]$OutDir = "",
    [string]$BackupDir = "",
    [string]$BaseUrl = "",
    [string]$WorkspaceUrl = "",
    [string]$ExpectedCspFragment = "https://static.cloudflareinsights.com",
    [string]$OperationalEndpointToken = "",
    [string]$OperationalEndpointTokenFile = "",
    [string]$BearerToken = ""
)

$ErrorActionPreference = "Stop"
$startedAt = [DateTime]::UtcNow.ToString("o")
$stepReleaseReadiness = "pending"
$stepLiveVerify = "pending"

function Get-EnvFileAssignedValue {
    param(
        [string]$Path,
        [string]$Name
    )
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path $Path)) {
        return ""
    }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $match = [regex]::Match($trimmed, '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
        if (-not $match.Success -or $match.Groups[1].Value -ne $Name) {
            continue
        }
        $value = $match.Groups[2].Value.Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        return $value.Trim()
    }
    return ""
}

function Get-WorkspaceBaseUrl {
    $workspaceBase = if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_WORKSPACE_BASE_URL"
    } else {
        ""
    }
    if ([string]::IsNullOrWhiteSpace($workspaceBase)) {
        $workspaceBase = [Environment]::GetEnvironmentVariable("OMNYID_WORKSPACE_BASE_URL")
    }
    if (-not [string]::IsNullOrWhiteSpace($workspaceBase)) {
        return $workspaceBase.Trim().TrimEnd('/')
    }
    $uiBase = if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_UI_BASE_URL"
    } else {
        ""
    }
    if ([string]::IsNullOrWhiteSpace($uiBase)) {
        $uiBase = [Environment]::GetEnvironmentVariable("OMNYID_UI_BASE_URL")
    }
    if (-not [string]::IsNullOrWhiteSpace($uiBase)) {
        return $uiBase.Trim().TrimEnd('/')
    }
    $homeserver = if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
        Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_HOMESERVER_URL"
    } else {
        ""
    }
    if ([string]::IsNullOrWhiteSpace($homeserver)) {
        $homeserver = [Environment]::GetEnvironmentVariable("OMNYID_HOMESERVER_URL")
    }
    if ([string]::IsNullOrWhiteSpace($homeserver)) {
        return ""
    }
    try {
        $parsed = [Uri]$homeserver.Trim()
        if ([string]::IsNullOrWhiteSpace($parsed.Host)) {
            return ""
        }
        $builder = [UriBuilder]::new($parsed)
        if ($builder.Host.StartsWith("api.")) {
            $builder.Host = $builder.Host.Substring(4)
        }
        $builder.Path = ""
        $builder.Query = ""
        $builder.Fragment = ""
        return $builder.Uri.ToString().TrimEnd('/')
    }
    catch {
        return ""
    }
}

function Invoke-CheckedCommand {
    param(
        [scriptblock]$Command,
        [string]$FailureMessage
    )

    $global:LASTEXITCODE = 0
    & $Command
    if (-not $?) {
        throw $FailureMessage
    }
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Write-BackupDirHint {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }
    if (Test-Path -LiteralPath $Path) {
        return
    }

    $isWindows = $PSVersionTable.PSVersion -and $env:OS -eq "Windows_NT"
    $looksUnixAbsolute = $Path -match '^/'
    if ($isWindows -and $looksUnixAbsolute) {
        Write-Warning "[deployment-rehearsal] backup path '$Path' looks like a Linux/Oracle target path but does not exist on this Windows host. Validate this env file on the Oracle runtime, or override -BackupDir with a real local snapshot root for workstation rehearsal."
        return
    }

    Write-Warning "[deployment-rehearsal] backup path '$Path' does not exist on this host. Provision a real backup archive root or point OMNYID_BACKUP_DIR/-BackupDir at an existing snapshot directory before running a production-labeled deployment rehearsal."
}

function Write-DeploymentRehearsalSummary {
    param([string]$Status)

    if ([string]::IsNullOrWhiteSpace($OutDir)) {
        return
    }

    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

    @"
STATUS=$Status
STARTED_AT=$startedAt
ENV_FILE=$EnvFile
BACKUP_DIR=$BackupDir
BASE_URL=$BaseUrl
WORKSPACE_URL=$WorkspaceUrl
STEP_RELEASE_READINESS=$stepReleaseReadiness
STEP_LIVE_VERIFY=$stepLiveVerify
"@ | Set-Content (Join-Path $OutDir "deployment-rehearsal-summary.env")

    @"
# Deployment Rehearsal Summary

- status: $Status
- started_at: $startedAt
- env_file: $(if ([string]::IsNullOrWhiteSpace($EnvFile)) { "none" } else { $EnvFile })
- backup_dir: $(if ([string]::IsNullOrWhiteSpace($BackupDir)) { "none" } else { $BackupDir })
- base_url: $(if ([string]::IsNullOrWhiteSpace($BaseUrl)) { "none" } else { $BaseUrl })
- workspace_url: $(if ([string]::IsNullOrWhiteSpace($WorkspaceUrl)) { "none" } else { $WorkspaceUrl })
- release_readiness: $stepReleaseReadiness
- live_verify: $stepLiveVerify
"@ | Set-Content (Join-Path $OutDir "deployment-rehearsal-summary.md")

    @{
        status = $Status
        started_at = $startedAt
        env_file = $EnvFile
        backup_dir = $BackupDir
        base_url = $BaseUrl
        workspace_url = $WorkspaceUrl
        steps = @{
            release_readiness = $stepReleaseReadiness
            live_verify = $stepLiveVerify
        }
    } | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "deployment-rehearsal-summary.json")
}

try {
    Write-Output "[deployment-rehearsal] starting deployment rehearsal"

    if ([string]::IsNullOrWhiteSpace($BackupDir) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $BackupDir = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_BACKUP_DIR"
    }
    if ([string]::IsNullOrWhiteSpace($BackupDir) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_BACKUP_DIR)) {
        $BackupDir = $env:OMNYID_BACKUP_DIR
    }
    Write-BackupDirHint -Path $BackupDir
    if ([string]::IsNullOrWhiteSpace($BaseUrl) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $BaseUrl = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_BASE_URL"
    }
    if ([string]::IsNullOrWhiteSpace($BaseUrl) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_BASE_URL)) {
        $BaseUrl = $env:OMNYID_BASE_URL
    }
    if ([string]::IsNullOrWhiteSpace($BaseUrl) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $BaseUrl = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_HOMESERVER_URL"
    }
    if ([string]::IsNullOrWhiteSpace($BaseUrl) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_HOMESERVER_URL)) {
        $BaseUrl = $env:OMNYID_HOMESERVER_URL
    }
    if ([string]::IsNullOrWhiteSpace($WorkspaceUrl) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $WorkspaceUrl = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_WORKSPACE_URL"
    }
    if ([string]::IsNullOrWhiteSpace($WorkspaceUrl) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_WORKSPACE_URL)) {
        $WorkspaceUrl = $env:OMNYID_WORKSPACE_URL
    }
    if ([string]::IsNullOrWhiteSpace($OperationalEndpointToken) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $OperationalEndpointToken = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_OPERATIONAL_ENDPOINT_TOKEN"
    }
    if ([string]::IsNullOrWhiteSpace($OperationalEndpointToken) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN)) {
        $OperationalEndpointToken = $env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN
    }
    if ([string]::IsNullOrWhiteSpace($OperationalEndpointTokenFile) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $OperationalEndpointTokenFile = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE"
    }
    if ([string]::IsNullOrWhiteSpace($OperationalEndpointTokenFile) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE)) {
        $OperationalEndpointTokenFile = $env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE
    }
    if ([string]::IsNullOrWhiteSpace($BearerToken) -and -not [string]::IsNullOrWhiteSpace($EnvFile)) {
        $BearerToken = Get-EnvFileAssignedValue -Path $EnvFile -Name "OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN"
    }
    if ([string]::IsNullOrWhiteSpace($BearerToken) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN)) {
        $BearerToken = $env:OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN
    }
    if ([string]::IsNullOrWhiteSpace($WorkspaceUrl)) {
        $workspaceBaseUrl = Get-WorkspaceBaseUrl
        if (-not [string]::IsNullOrWhiteSpace($workspaceBaseUrl)) {
            $WorkspaceUrl = "$($workspaceBaseUrl.TrimEnd('/'))/workspace/"
        }
    }

    Write-Output "[deployment-rehearsal] step 1/2: release readiness"
    Invoke-CheckedCommand -FailureMessage "[deployment-rehearsal] release readiness failed" -Command {
        & (Join-Path $PSScriptRoot "release-readiness.ps1") -EnvFile $EnvFile -ApiFlows $ApiFlows -OutDir $OutDir -BackupDir $BackupDir
    }
    $stepReleaseReadiness = "pass"

    if (-not [string]::IsNullOrWhiteSpace($EnvFile) -and [string]::IsNullOrWhiteSpace($BaseUrl)) {
        throw "[deployment-rehearsal] production deployment rehearsal requires -BaseUrl or OMNYID_BASE_URL"
    }

    if (-not [string]::IsNullOrWhiteSpace($BaseUrl)) {
        Write-Output "[deployment-rehearsal] step 2/2: live deployment verification ($BaseUrl)"
        Invoke-CheckedCommand -FailureMessage "[deployment-rehearsal] live deployment verification failed" -Command {
            if (-not [string]::IsNullOrWhiteSpace($OperationalEndpointTokenFile)) {
                $env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE = $OperationalEndpointTokenFile
            }
            & (Join-Path $PSScriptRoot "verify-deployment.ps1") -BaseUrl $BaseUrl -WorkspaceUrl $WorkspaceUrl -ExpectedCspFragment $ExpectedCspFragment -OperationalEndpointToken $OperationalEndpointToken -BearerToken $BearerToken
        }
        $stepLiveVerify = "pass"
    }
    else {
        Write-Output "[deployment-rehearsal] step 2/2: live deployment verification skipped (no base url supplied)"
        $stepLiveVerify = "skipped"
    }

    Write-Output "[deployment-rehearsal] deployment rehearsal passed"
    Write-DeploymentRehearsalSummary -Status "pass"
}
catch {
    Write-DeploymentRehearsalSummary -Status "fail"
    throw
}
