param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$RemoteDir = "",
    [string]$EnvFile = "",
    [string]$ProofOutDir = "",
    [string[]]$ComposeServices = @(),
    [switch]$IncludeQuicProfile,
    [switch]$UseMinimalProfile = $true,
    [switch]$IncludeSimulatedData = $true,
    [switch]$SkipRemotePreflight,
    [switch]$SkipPostDeployProof,
    [switch]$UseDetachedOracleProof = $true,
    [switch]$SkipComposeBuild,
    [switch]$SkipCaddyReload,
    [switch]$SkipWorkspaceSmoke,
    [switch]$SkipRemoteSourcePrune
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "oracle-secret-sync.ps1")
. (Join-Path $PSScriptRoot "oracle-runtime-contract.ps1")

# Load local Oracle config (gitignored) if params were not supplied
$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User)       { $User       = $ORACLE_USER }
if (-not $KeyPath)    { $KeyPath    = $ORACLE_KEY }
if (-not $RemoteDir)  { $RemoteDir  = $ORACLE_DIR }
if ([string]::IsNullOrWhiteSpace($ProofOutDir)) {
    $ProofOutDir = Join-Path $ProjectRoot "artifacts\oracle-production-proof-deploy"
}

function Invoke-OracleProductionProofSummary {
    param(
        [string]$Destination,
        [switch]$SkipRestoreDrill
    )

    $proofFailed = $false
    try {
        $proofOutput = & (Join-Path $PSScriptRoot "oracle-production-proof.ps1") `
            -RemoteHost $RemoteHost `
            -User $User `
            -KeyPath $KeyPath `
            -RemoteDir $RemoteDir `
            -OutDir $Destination `
            -UseDetachedRemoteAudit:([bool]($UseDetachedOracleProof -and -not $SkipRestoreDrill)) `
            -SkipRestoreDrill:$SkipRestoreDrill 2>&1
    } catch {
        $proofFailed = $true
        $proofOutput = $_ | Out-String
    }
    $proofJsonPath = Join-Path $Destination "oracle-production-proof.json"
    if (-not (Test-Path -LiteralPath $proofJsonPath)) {
        if ($proofFailed -or $LASTEXITCODE -ne 0) {
            throw "[deploy-oracle] oracle production proof failed without producing json`n$proofOutput"
        }
        throw "[deploy-oracle] expected oracle production proof json at $proofJsonPath"
    }

    $proofReport = Get-Content -LiteralPath $proofJsonPath -Raw | ConvertFrom-Json
    if (($proofFailed -or $LASTEXITCODE -ne 0) -and $proofReport.failure_step -eq "disk_capacity") {
        throw "[deploy-oracle] oracle production proof failed`n$proofOutput"
    }

    return $proofReport
}

function Convert-ToShellSingleQuotedLiteral {
    param([string]$Value)

    return "'" + ($Value -replace "'", "'`"'" ) + "'"
}

function Join-ShellArguments {
    param([string[]]$Values)

    if ($null -eq $Values -or $Values.Count -eq 0) {
        return ""
    }

    return (($Values | ForEach-Object { Convert-ToShellSingleQuotedLiteral $_ }) -join " ")
}

function Assert-ExternalSuccess {
    param([string]$Context)

    if ($LASTEXITCODE -ne 0) {
        throw "[deploy-oracle] $Context failed with exit code $LASTEXITCODE"
    }
}

function Invoke-CheckedRemoteCommand {
    param(
        [string]$Context,
        [string]$Command,
        [switch]$ScanDockerBuildOutput
    )

    # A local ErrorActionPreference override (not just 2>&1 capture) is required: under
    # $ErrorActionPreference = "Stop", PowerShell 5.1 escalates ANY stderr line from a
    # native call into a terminating NativeCommandError even when the process exits 0 and
    # the output is captured into a variable — and a remote `docker compose ... --build`
    # (cargo + npm) is virtually guaranteed to print something to stderr. $exitCode below
    # still catches genuine failures.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & ssh.exe -i $KeyPath "$User@$RemoteHost" $Command 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousEap
    }
    if ($output) {
        $output | ForEach-Object { Write-Host $_ }
    }
    if ($exitCode -ne 0) {
        throw "[deploy-oracle] $Context failed with exit code $exitCode"
    }

    if ($ScanDockerBuildOutput) {
        $outputText = ($output | Out-String)
        $failurePattern = "(?im)(failed to solve|could not compile|did not complete successfully|target [^`r`n]+ failed to solve)"
        if ($outputText -match $failurePattern) {
            throw "[deploy-oracle] $Context printed Docker build failure output even though ssh exited successfully"
        }
    }
}

function Assert-StagedOracleRuntimeManifest {
    param([string]$ManifestPath)

    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "[deploy-oracle] expected oracle runtime manifest at $ManifestPath"
    }

    $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    $copiedPaths = @($manifest.copied_paths)
    $requiredScripts = @($manifest.required_runtime_scripts)
    if ($requiredScripts.Count -eq 0) {
        $requiredScripts = @(Get-OracleRequiredRuntimeScriptPaths)
    }

    $missingScripts = @($requiredScripts | Where-Object { $_ -notin $copiedPaths })
    if ($missingScripts.Count -gt 0) {
        throw "[deploy-oracle] staged runtime manifest is missing required scripts: $($missingScripts -join ',')"
    }

    return $manifest
}

function Assert-RemoteOracleRuntimeScripts {
    param(
        [string]$RemoteHostValue,
        [string]$UserValue,
        [string]$KeyPathValue,
        [string]$RemoteDirValue
    )

    $requiredScripts = @(Get-OracleRequiredRuntimeScriptPaths)
    $missingScripts = New-Object System.Collections.Generic.List[string]

    foreach ($requiredScript in $requiredScripts) {
        $fullPath = ($RemoteDirValue.TrimEnd('/') + '/' + $requiredScript.TrimStart('/')).Replace("'", "'\''")
        $existsResult = & ssh.exe -i $KeyPathValue "$UserValue@$RemoteHostValue" "if [ -f '$fullPath' ]; then echo present; else echo missing; fi" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "[deploy-oracle] remote runtime script verification failed for $requiredScript"
        }
        if ((($existsResult | Out-String).Trim()) -ne "present") {
            $missingScripts.Add($requiredScript)
            continue
        }

        if ($requiredScript.EndsWith(".sh")) {
            $normalizeResult = & ssh.exe -i $KeyPathValue "$UserValue@$RemoteHostValue" "sed -i 's/\r$//' '$fullPath' && chmod +x '$fullPath'" 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "[deploy-oracle] remote runtime script normalization failed for $requiredScript"
            }
        }
    }

    if ($missingScripts.Count -gt 0) {
        throw "[deploy-oracle] remote runtime is missing required scripts after extraction: $($missingScripts -join ',')"
    }
}

function Sync-OracleSecrets {
    param(
        [string]$RemoteHostValue,
        [string]$UserValue,
        [string]$KeyPathValue,
        [string]$RemoteDirValue,
        [object[]]$SecretEntries
    )

    if ($null -eq $SecretEntries -or $SecretEntries.Count -eq 0) {
        return
    }

    $remoteDirLiteral = Convert-ToShellSingleQuotedLiteral $RemoteDirValue
    $remoteSecretsRoot = ($RemoteDirValue.TrimEnd('/') + '/.secrets').Replace("//", "/")
    $remoteSecretsRootLiteral = Convert-ToShellSingleQuotedLiteral $remoteSecretsRoot
    $stagingDirName = ".secrets-upload-" + [guid]::NewGuid().ToString("N")
    $stagingDir = ($RemoteDirValue.TrimEnd('/') + '/' + $stagingDirName).Replace("//", "/")
    $stagingDirLiteral = Convert-ToShellSingleQuotedLiteral $stagingDir

    $mkdirSecretsOutput = & ssh.exe -i $KeyPathValue "$UserValue@$RemoteHostValue" "mkdir -p $remoteDirLiteral $stagingDirLiteral" 2>&1
    if ($mkdirSecretsOutput) { $mkdirSecretsOutput | ForEach-Object { Write-Host $_ } }
    if ($LASTEXITCODE -ne 0) {
        throw "[deploy-oracle] failed to create remote secret staging directory"
    }

    try {
        foreach ($entry in $SecretEntries) {
            $remoteRelativeDir = Split-Path -Path $entry.RemoteHostRelativePath -Parent
            $remoteFileName = Split-Path -Path $entry.RemoteHostRelativePath -Leaf
            if ([string]::IsNullOrWhiteSpace($remoteFileName)) {
                throw "[deploy-oracle] invalid remote secret target for $($entry.Key)"
            }

            $stageTarget = ($stagingDir.TrimEnd('/') + '/' + $remoteFileName).Replace("//", "/")
            $scpSecretOutput = & scp.exe -i $KeyPathValue $entry.SourcePath "${UserValue}@${RemoteHostValue}:$stageTarget" 2>&1
            if ($scpSecretOutput) { $scpSecretOutput | ForEach-Object { Write-Host $_ } }
            if ($LASTEXITCODE -ne 0) {
                throw "[deploy-oracle] failed to upload secret payload for $($entry.Key)"
            }

            $remoteSecretsDir = if ([string]::IsNullOrWhiteSpace($remoteRelativeDir)) {
                $RemoteDirValue
            } else {
                ($RemoteDirValue.TrimEnd('/') + '/' + ($remoteRelativeDir -replace '\\', '/').TrimStart('/')).Replace("//", "/")
            }
            $remoteSecretsDirLiteral = Convert-ToShellSingleQuotedLiteral $remoteSecretsDir
            $stageTargetLiteral = Convert-ToShellSingleQuotedLiteral $stageTarget
            $remoteTarget = ($RemoteDirValue.TrimEnd('/') + '/' + ($entry.RemoteHostRelativePath -replace '\\', '/').TrimStart('/')).Replace("//", "/")
            $remoteTargetLiteral = Convert-ToShellSingleQuotedLiteral $remoteTarget

            $promoteCommand = "sudo mkdir -p $remoteSecretsDirLiteral && sudo install -m 600 $stageTargetLiteral $remoteTargetLiteral"
            $promoteOutput = & ssh.exe -i $KeyPathValue "$UserValue@$RemoteHostValue" $promoteCommand 2>&1
            if ($promoteOutput) { $promoteOutput | ForEach-Object { Write-Host $_ } }
            if ($LASTEXITCODE -ne 0) {
                throw "[deploy-oracle] failed to promote secret payload for $($entry.Key)"
            }
        }

        $normalizeCommand = "sudo sh -lc 'chmod 700 $remoteSecretsRootLiteral && chmod 600 $remoteSecretsRootLiteral/*'"
        $normalizeOutput = & ssh.exe -i $KeyPathValue "$UserValue@$RemoteHostValue" $normalizeCommand 2>&1
        if ($normalizeOutput) { $normalizeOutput | ForEach-Object { Write-Host $_ } }
        if ($LASTEXITCODE -ne 0) {
            throw "[deploy-oracle] failed to normalize remote secret permissions"
        }
    } finally {
        & ssh.exe -i $KeyPathValue "$UserValue@$RemoteHostValue" "rm -rf $stagingDirLiteral" 2>$null | Out-Null
    }
}

# Use a short relative temp name to avoid Windows drive-letter path issues with tar.exe
$archiveName = "omnyid-oracle-deploy-$([guid]::NewGuid().ToString('N')).tar"
$archivePath = Join-Path $env:TEMP $archiveName
$stageDir = Join-Path $env:TEMP "omnyid-oracle-runtime-stage"
$envStageDir = Join-Path $env:TEMP "omnyid-oracle-env-stage"

if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $stageDir) {
    Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $envStageDir) {
    Remove-Item -LiteralPath $envStageDir -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $SkipRemotePreflight) {
    $preflightOutDir = Join-Path $ProofOutDir "preflight"
    $preflightReport = Invoke-OracleProductionProofSummary -Destination $preflightOutDir -SkipRestoreDrill
    if ($preflightReport.failure_step -eq "disk_capacity") {
        throw "[deploy-oracle] refusing to deploy while Oracle disk is full ($($preflightReport.remote_root_use_pct)% root, $($preflightReport.remote_var_use_pct)% /var). See $preflightOutDir"
    }
    if ($preflightReport.status -ne "pass") {
        Write-Warning ("[deploy-oracle] Oracle preflight is not fully healthy (status={0}, failure_step={1}, reason={2}). Proceeding because the failure is not disk-capacity-related. See {3}" -f $preflightReport.status, $preflightReport.failure_step, $preflightReport.failure_reason, $preflightOutDir)
    } else {
        Write-Host ("[deploy-oracle] Oracle preflight passed. Artifact: {0}" -f $preflightOutDir)
    }
}

& (Join-Path $PSScriptRoot "stage-oracle-runtime.ps1") `
    -SourceRoot $ProjectRoot `
    -OutputDir $stageDir `
    -IncludeSimulatedData:$IncludeSimulatedData

$stageManifestPath = Join-Path $stageDir "oracle-runtime-manifest.json"
if (Test-Path -LiteralPath $stageManifestPath) {
    $stageManifest = Assert-StagedOracleRuntimeManifest -ManifestPath $stageManifestPath
    $sizeMiB = [math]::Round(([double]$stageManifest.total_staged_bytes / 1MB), 2)
    Write-Host ("[deploy-oracle] staged runtime bundle: {0} paths, {1} MiB" -f $stageManifest.copied_path_count, $sizeMiB)
    foreach ($category in @($stageManifest.category_totals | Where-Object { $_.bytes -gt 0 } | Sort-Object -Property bytes -Descending | Select-Object -First 5)) {
        $categoryMiB = [math]::Round(([double]$category.bytes / 1MB), 2)
        Write-Host ("[deploy-oracle]   {0}: {1} MiB across {2} paths" -f $category.name, $categoryMiB, $category.path_count)
    }
}

Push-Location $stageDir
try {
    $tempDir = $env:TEMP
    Push-Location $tempDir
    try {
        $tarCreateOutput = & tar.exe -cf $archiveName -C $stageDir . 2>&1
        if ($tarCreateOutput) { $tarCreateOutput | ForEach-Object { Write-Host $_ } }
        Assert-ExternalSuccess "creating runtime archive"
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}

# Under $ErrorActionPreference = "Stop", PowerShell 5.1 escalates ANY stderr line from a
# native call into a terminating NativeCommandError even when the process exits 0 and
# merely capturing the output (2>&1 into a variable) does not prevent that escalation —
# e.g. GNU tar's harmless "Ignoring unknown extended header keyword 'SCHILY.fflags'"
# warning (a benign cross-platform artifact of Windows' bsdtar writing PAX headers GNU
# tar doesn't know) was aborting otherwise-successful deploys. Only a local
# ErrorActionPreference override actually suppresses that escalation; Assert-ExternalSuccess
# below still catches genuine failures via $LASTEXITCODE regardless.
$previousEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    $mkdirOutput = & ssh.exe -i $KeyPath "$User@$RemoteHost" "mkdir -p $RemoteDir /srv/omnyid/runtimes" 2>&1
    if ($mkdirOutput) { $mkdirOutput | ForEach-Object { Write-Host $_ } }
    $mkdirExit = $LASTEXITCODE

    $remotePruneExit = 0
    if (-not $SkipRemoteSourcePrune) {
        # Do not prune live bind-mounted static roots such as docs/ or wedding/:
        # deleting and recreating those directories can leave Caddy mounted to a
        # removed inode until restart. The archive still overwrites them in place.
        $remotePrunePaths = @(
            "postgres",
            "proto",
            "runtime-templates",
            "service-adapter-templates",
            "solid-ui/public",
            "solid-ui/src",
            "src",
            "typescript-sdk/scripts",
            "typescript-sdk/src"
        )
        $remoteDirLiteralForPrune = Convert-ToShellSingleQuotedLiteral $RemoteDir
        $remotePrunePathArguments = Join-ShellArguments -Values $remotePrunePaths
        $remotePruneCommand = "cd $remoteDirLiteralForPrune && rm -rf -- $remotePrunePathArguments"
        $remotePruneOutput = & ssh.exe -i $KeyPath "$User@$RemoteHost" $remotePruneCommand 2>&1
        if ($remotePruneOutput) { $remotePruneOutput | ForEach-Object { Write-Host $_ } }
        $remotePruneExit = $LASTEXITCODE
    }

    $scpOutput = & scp.exe -i $KeyPath $archivePath "${User}@${RemoteHost}:$RemoteDir/omnyid.tar" 2>&1
    if ($scpOutput) { $scpOutput | ForEach-Object { Write-Host $_ } }
    $scpExit = $LASTEXITCODE
    $extractOutput = & ssh.exe -i $KeyPath "$User@$RemoteHost" "cd $RemoteDir && tar -xf omnyid.tar && rm -f omnyid.tar" 2>&1
    if ($extractOutput) { $extractOutput | ForEach-Object { Write-Host $_ } }
    $extractExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousEap
}
$LASTEXITCODE = $mkdirExit
Assert-ExternalSuccess "creating remote runtime directories"
$LASTEXITCODE = $remotePruneExit
Assert-ExternalSuccess "pruning stale remote runtime source directories"
$LASTEXITCODE = $scpExit
Assert-ExternalSuccess "uploading runtime archive"
$LASTEXITCODE = $extractExit
Assert-ExternalSuccess "extracting runtime archive"
Assert-RemoteOracleRuntimeScripts -RemoteHostValue $RemoteHost -UserValue $User -KeyPathValue $KeyPath -RemoteDirValue $RemoteDir

if ($EnvFile) {
    & (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $EnvFile
    New-Item -ItemType Directory -Path $envStageDir -Force | Out-Null
    $secretPlan = Get-OracleSecretSyncPlan -EnvFile $EnvFile
    $rewrittenEnvFile = Join-Path $envStageDir ".env.oracle"
    Write-OracleRewrittenEnvFile -OutputPath $rewrittenEnvFile -Plan $secretPlan
    $envUploadOutput = & scp.exe -i $KeyPath $rewrittenEnvFile "${User}@${RemoteHost}:$RemoteDir/.env.oracle" 2>&1
    if ($envUploadOutput) { $envUploadOutput | ForEach-Object { Write-Host $_ } }
    Assert-ExternalSuccess "uploading rewritten env file"
    if ($secretPlan.SecretEntries.Count -gt 0) {
        Sync-OracleSecrets `
            -RemoteHostValue $RemoteHost `
            -UserValue $User `
            -KeyPathValue $KeyPath `
            -RemoteDirValue $RemoteDir `
            -SecretEntries @($secretPlan.SecretEntries)
    }
}

$composeFile = if ($IncludeQuicProfile) {
    "docker-compose.oracle.quic.yml"
} elseif ($UseMinimalProfile) {
    "docker-compose.oracle.minimal.yml"
} else {
    "docker-compose.oracle.yml"
}
$remoteDirLiteral = Convert-ToShellSingleQuotedLiteral $RemoteDir
$serviceArgumentString = Join-ShellArguments -Values @($ComposeServices | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
$composeCommand = if ($EnvFile) {
    $buildArgument = if ($SkipComposeBuild) { "" } else { " --build" }
    $serviceArguments = if ([string]::IsNullOrWhiteSpace($serviceArgumentString)) { "" } else { " $serviceArgumentString" }
    "cd $remoteDirLiteral && docker compose --env-file .env.oracle -f $composeFile up -d$buildArgument$serviceArguments"
} else {
    "cd $remoteDirLiteral && docker compose -f $composeFile config"
}

Invoke-CheckedRemoteCommand `
    -Context "running remote docker compose command" `
    -Command $composeCommand `
    -ScanDockerBuildOutput

if ($EnvFile -and -not $SkipCaddyReload) {
    $reloadCommand = "cd $remoteDirLiteral && docker compose --env-file .env.oracle -f $composeFile up -d --force-recreate caddy"
    Invoke-CheckedRemoteCommand -Context "reloading caddy" -Command $reloadCommand
}

if ($EnvFile -and -not $SkipWorkspaceSmoke) {
    $workspaceSmokeScript = @"
set -eu
cd $remoteDirLiteral
domain=`$(grep '^OMNYID_DOMAIN=' .env.oracle | head -n 1 | cut -d= -f2- | tr -d '\r')
[ -n "`$domain" ] || {
  echo 'workspace smoke check failed: OMNYID_DOMAIN missing from .env.oracle' >&2
  exit 1
}
grep -q 'handle /wedding/\*' Caddyfile || {
  echo 'workspace smoke check failed: staged Caddyfile is missing the /wedding/* route' >&2
  exit 1
}
grep -q './wedding:/srv/wedding:ro' $composeFile || {
  echo 'workspace smoke check failed: compose file is missing the /srv/wedding mount' >&2
  exit 1
}
[ -f wedding/index.html ] || {
  echo 'workspace smoke check failed: staged wedding/index.html is missing' >&2
  exit 1
}
docker exec omnyid-caddy-1 test -f /srv/wedding/index.html || {
  echo 'workspace smoke check failed: running Caddy container cannot see /srv/wedding/index.html' >&2
  exit 1
}
docker exec omnyid-caddy-1 caddy validate --config /etc/caddy/Caddyfile >/dev/null || {
  echo 'workspace smoke check failed: running Caddy config does not validate' >&2
  exit 1
}
docker exec omnyid-caddy-1 grep -q 'handle /wedding/\*' /etc/caddy/Caddyfile || {
  echo 'workspace smoke check failed: running Caddyfile is missing the /wedding/* route' >&2
  exit 1
}
workspace_headers=`$(curl --http1.1 -sSI --resolve "`$domain:443:127.0.0.1" -k "https://`$domain/workspace/" | tr -d '\r')
printf '%s\n' "`$workspace_headers"
printf '%s' "`$workspace_headers" | grep -qi '^www-authenticate: basic' && {
  preview_hash=`$(grep '^OMNYID_PREVIEW_PASSWORD_HASH=' .env.oracle | head -n 1 | cut -d= -f2- | tr -d '\r')
  if [ -n "`$preview_hash" ]; then
    echo 'workspace header-only checks skipped: /workspace/ is protected by configured preview Basic auth'
    exit 0
  fi
  echo 'workspace smoke check failed: /workspace/ is still behind Basic auth and no preview auth hash is configured' >&2
  exit 1
}
printf '%s' "`$workspace_headers" | grep -qi '^content-security-policy:' || {
  echo 'workspace smoke check failed: workspace CSP header is missing' >&2
  exit 1
}
printf '%s' "`$workspace_headers" | grep -qi 'https://static.cloudflareinsights.com' || {
  echo 'workspace smoke check failed: workspace CSP is missing Cloudflare Insights allowance' >&2
  exit 1
}
"@

    Invoke-CheckedRemoteCommand -Context "running workspace smoke check" -Command $workspaceSmokeScript
}

if (-not $EnvFile -and -not $SkipWorkspaceSmoke) {
    $publicRouteSmokeScript = @"
set -eu
domain=`$(docker exec omnyid-caddy-1 printenv OMNYID_DOMAIN 2>/dev/null || true)
[ -n "`$domain" ] || {
  echo 'public route smoke check skipped: OMNYID_DOMAIN missing from running caddy container' >&2
  exit 0
}
check_public_routes() {
  curl -fsSI --resolve "`$domain:443:127.0.0.1" -k "https://`$domain/" >/dev/null
  curl -fsSI --resolve "`$domain:443:127.0.0.1" -k "https://`$domain/wedding/" >/dev/null
  curl -fsSI --resolve "`$domain:443:127.0.0.1" -k "https://`$domain/workspace/" >/dev/null
}
if ! check_public_routes; then
  echo 'public route smoke check failed after sync; restarting caddy once and retrying' >&2
  docker restart omnyid-caddy-1 >/dev/null
  sleep 2
  check_public_routes
fi
"@

    Invoke-CheckedRemoteCommand -Context "running sync-only public route smoke check" -Command $publicRouteSmokeScript
}

if ($EnvFile -and -not $SkipPostDeployProof) {
    $postDeployOutDir = Join-Path $ProofOutDir "postdeploy"
    $postDeployReport = Invoke-OracleProductionProofSummary -Destination $postDeployOutDir
    if ($postDeployReport.status -ne "pass") {
        Write-Warning ("[deploy-oracle] post-deploy proof is failing (failure_step={0}, reason={1}). See {2}" -f $postDeployReport.failure_step, $postDeployReport.failure_reason, $postDeployOutDir)
    } else {
        Write-Host ("[deploy-oracle] post-deploy proof passed. Artifact: {0}" -f $postDeployOutDir)
    }
}

Write-Host "Oracle deployment sync complete."
if (-not $EnvFile) {
    Write-Host "No env file was uploaded, so only a compose config check was run remotely."
}
