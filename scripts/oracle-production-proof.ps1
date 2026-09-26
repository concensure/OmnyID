param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$RemoteDir = "",
    [string]$EnvFileName = ".env.oracle",
    [string]$ComposeFile = "docker-compose.oracle.minimal.yml",
    [string]$OutDir = "",
    [switch]$SkipRestoreDrill,
    [int]$RestoreDrillTimeoutSeconds = 900,
    [switch]$UseDetachedRemoteAudit,
    [int]$RemoteAuditPollSeconds = 15,
    [int]$RemoteAuditMaxWaitSeconds = 5400,
    [string]$SshExe = "ssh.exe",
    [string[]]$SshPrefixArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "oracle-runtime-contract.ps1")

$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User)       { $User       = $ORACLE_USER }
if (-not $KeyPath)    { $KeyPath    = $ORACLE_KEY }
if (-not $RemoteDir)  { $RemoteDir  = $ORACLE_DIR }

function Convert-ToShellSingleQuotedLiteral {
    param([string]$Value)

    return "'" + ($Value -replace "'", "'`"'" ) + "'"
}

function New-SshArgumentList {
    param([string]$RemoteCommand)

    $sshArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
        $sshArgs += @("-i", $KeyPath)
    }
    $sshArgs += @("$User@$RemoteHost")
    if (-not [string]::IsNullOrWhiteSpace($RemoteCommand)) {
        $sshArgs += $RemoteCommand
    }
    return ,$sshArgs
}

function Invoke-RemoteSshCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RemoteCommand,
        [string]$InputText = ""
    )

    $sshArgs = New-SshArgumentList -RemoteCommand $RemoteCommand
    # $? goes false whenever the remote command prints anything to stderr, even on a
    # genuine success (e.g. PowerShell 5.1 wraps stderr lines from a native call into
    # NativeCommandError records under $ErrorActionPreference = "Stop"), so this checks
    # the actual process exit code instead. The local ErrorActionPreference override
    # additionally prevents that stderr from being escalated into a terminating error
    # before $LASTEXITCODE is even readable.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ([string]::IsNullOrEmpty($InputText)) {
            $output = (& $SshExe @SshPrefixArgs @sshArgs 2>&1 | Out-String).Trim()
        } else {
            $output = ($InputText | & $SshExe @SshPrefixArgs @sshArgs 2>&1 | Out-String).Trim()
        }
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousEap
    }
    if ($exitCode -ne 0) {
        throw "[oracle-production-proof] ssh command failed with exit code $exitCode`: $output"
    }
    return $output
}

function Invoke-DetachedRemoteAudit {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptText
    )

    $jobId = "omnyid-oracle-proof-" + [guid]::NewGuid().ToString("N")
    $jobDir = "/tmp/$jobId"
    $scriptPath = "$jobDir/audit.sh"
    $runnerPath = "$jobDir/run.sh"
    $stdoutPath = "$jobDir/stdout.log"
    $stderrPath = "$jobDir/stderr.log"
    $exitCodePath = "$jobDir/exit_code"
    $pidPath = "$jobDir/pid"

    $jobDirLiteral = Convert-ToShellSingleQuotedLiteral $jobDir
    $scriptPathLiteral = Convert-ToShellSingleQuotedLiteral $scriptPath
    $runnerPathLiteral = Convert-ToShellSingleQuotedLiteral $runnerPath
    $stdoutPathLiteral = Convert-ToShellSingleQuotedLiteral $stdoutPath
    $stderrPathLiteral = Convert-ToShellSingleQuotedLiteral $stderrPath
    $exitCodePathLiteral = Convert-ToShellSingleQuotedLiteral $exitCodePath
    $pidPathLiteral = Convert-ToShellSingleQuotedLiteral $pidPath

    $normalizedScriptText = ($ScriptText -replace "`r`n", "`n").TrimEnd("`n")
    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "mkdir -p $jobDirLiteral"))
    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat > $scriptPathLiteral")) -InputText ("#!/usr/bin/env bash`n" + $normalizedScriptText + "`n")
    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "chmod 700 $scriptPathLiteral"))

    $runnerScript = @"
#!/usr/bin/env bash
set +e
bash $scriptPathLiteral > $stdoutPathLiteral 2> $stderrPathLiteral
exit_code=`$?
printf '%s' "`$exit_code" > $exitCodePathLiteral
exit "`$exit_code"
"@
    $normalizedRunnerScript = ($runnerScript -replace "`r`n", "`n").TrimEnd("`n")
    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat > $runnerPathLiteral")) -InputText ($normalizedRunnerScript + "`n")
    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "chmod 700 $runnerPathLiteral"))
    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "nohup bash $runnerPathLiteral >/dev/null 2>&1 & printf '%s' \$! > $pidPathLiteral"))

    $deadline = [DateTime]::UtcNow.AddSeconds([Math]::Max($RemoteAuditMaxWaitSeconds, 30))
    $pollSeconds = [Math]::Max($RemoteAuditPollSeconds, 5)
    $pollScript = @'
if [ -f __EXIT_CODE_PATH__ ]; then
  printf 'STATE=complete\n'
  printf 'EXIT_CODE='
  cat __EXIT_CODE_PATH__
  printf '\n'
elif [ -f __PID_PATH__ ] && kill -0 "$(cat __PID_PATH__)" >/dev/null 2>&1; then
  printf 'STATE=running\n'
  printf 'PID='
  cat __PID_PATH__
  printf '\n'
else
  printf 'STATE=unknown\n'
fi
'@
    $pollScript = $pollScript.Replace("__EXIT_CODE_PATH__", $exitCodePathLiteral)
    $pollScript = $pollScript.Replace("__PID_PATH__", $pidPathLiteral)
    $pollCommand = "bash -lc " + (Convert-ToShellSingleQuotedLiteral $pollScript)

    while ([DateTime]::UtcNow -lt $deadline) {
        $pollText = $null
        $sshFailed = $false
        try {
            $pollText = Invoke-RemoteSshCommand -RemoteCommand $pollCommand
        }
        catch {
            $sshFailed = $true
        }

        if (-not $sshFailed -and -not [string]::IsNullOrWhiteSpace($pollText)) {
            $state = $null
            $exitCode = $null
            foreach ($line in ($pollText -split "`r?`n")) {
                if ($line -match '^STATE=(.*)$') {
                    $state = $matches[1].Trim()
                } elseif ($line -match '^EXIT_CODE=(.*)$') {
                    $exitCode = $matches[1].Trim()
                }
            }

            if ($state -eq "complete") {
                $stdout = Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat $stdoutPathLiteral"))
                $stderr = Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat $stderrPathLiteral 2>/dev/null || true"))
                Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "rm -rf $jobDirLiteral")) | Out-Null
                if (-not [string]::IsNullOrWhiteSpace($stderr)) {
                    Write-Output "[oracle-production-proof] detached remote audit stderr: $stderr"
                }
                return $stdout
            }

            if ($state -eq "unknown") {
                $stdout = Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat $stdoutPathLiteral 2>/dev/null || true"))
                if ($stdout -match '(^|\n)STATUS=') {
                    $stderr = Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat $stderrPathLiteral 2>/dev/null || true"))
                    Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "rm -rf $jobDirLiteral")) | Out-Null
                    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
                        Write-Output "[oracle-production-proof] detached remote audit stderr: $stderr"
                    }
                    return $stdout
                }
            }
        }

        Start-Sleep -Seconds $pollSeconds
    }

    $partialStdout = ""
    $partialStderr = ""
    try {
        $partialStdout = Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "cat $stdoutPathLiteral 2>/dev/null || true"))
        $partialStderr = Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "tail -n 40 $stderrPathLiteral 2>/dev/null || true"))
    }
    catch {
    }

    if ($partialStdout -match '(^|\n)STATUS=') {
        try {
            Invoke-RemoteSshCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral "rm -rf $jobDirLiteral")) | Out-Null
        }
        catch {
        }
        if (-not [string]::IsNullOrWhiteSpace($partialStderr)) {
            Write-Output "[oracle-production-proof] detached remote audit stderr: $partialStderr"
        }
        return $partialStdout
    }

    throw "[oracle-production-proof] detached remote audit exceeded ${RemoteAuditMaxWaitSeconds}s wait window. stdout='$partialStdout' stderr='$partialStderr'"
}

function New-OracleProofReport {
    param(
        [hashtable]$Fields,
        [string]$ResolvedRemoteHost
    )

    $restoreDrillDetail = $Fields["RESTORE_DRILL_DETAIL"]
    $restoreFreeRootBytes = $null
    $restoreRequiredBytes = $null
    $restoreSourceDbBytes = $null
    $restoreGapBytes = $null
    if (-not [string]::IsNullOrWhiteSpace($restoreDrillDetail)) {
        if ($restoreDrillDetail -match 'free_root_bytes=(?<free>\d+)') {
            $restoreFreeRootBytes = [double]$matches['free']
        }
        if ($restoreDrillDetail -match 'required_bytes=(?<required>\d+)') {
            $restoreRequiredBytes = [double]$matches['required']
        }
        if ($restoreDrillDetail -match 'source_db_bytes=(?<source>\d+)') {
            $restoreSourceDbBytes = [double]$matches['source']
        }
    }
    if ($null -ne $restoreFreeRootBytes -and $null -ne $restoreRequiredBytes) {
        $restoreGapBytes = [math]::Max(($restoreRequiredBytes - $restoreFreeRootBytes), 0)
    }
    $failureReason = $Fields["FAILURE_REASON"]
    if (
        [string]$Fields["FAILURE_STEP"] -eq "restore_drill" -and
        $null -ne $restoreGapBytes -and
        $restoreGapBytes -gt 0 -and
        (
            [string]::IsNullOrWhiteSpace($failureReason) -or
            $failureReason -eq "restore drill failed"
        )
    ) {
        $gapGiB = [math]::Round(($restoreGapBytes / 1GB), 2)
        $failureReason = "restore drill requires about $gapGiB GiB more free disk on the Oracle host"
    }

    return [pscustomobject]@{
        generated_at = [DateTime]::UtcNow.ToString("o")
        status = $Fields["STATUS"]
        remote_host = $ResolvedRemoteHost
        remote_dir = $Fields["REMOTE_DIR"]
        env_file = $Fields["ENV_FILE"]
        compose_file = $Fields["COMPOSE_FILE"]
        backup_dir = $Fields["BACKUP_DIR"]
        backup_dir_source = $Fields["BACKUP_DIR_SOURCE"]
        backup_service_running = $Fields["BACKUP_SERVICE_RUNNING"]
        homeserver_running = $Fields["HOMESERVER_RUNNING"]
        latest_archive = $Fields["LATEST_ARCHIVE"]
        latest_archive_age_days = $Fields["LATEST_ARCHIVE_AGE_DAYS"]
        manifest_verification_status = $Fields["MANIFEST_VERIFICATION_STATUS"]
        manifest_verified_at = $Fields["MANIFEST_VERIFIED_AT"]
        runtime_script_integrity_status = $Fields["RUNTIME_SCRIPT_INTEGRITY_STATUS"]
        runtime_script_integrity_detail = $Fields["RUNTIME_SCRIPT_INTEGRITY_DETAIL"]
        missing_runtime_scripts =
            if ([string]::IsNullOrWhiteSpace($Fields["MISSING_RUNTIME_SCRIPTS"])) {
                [string[]]@()
            } else {
                [string[]]@($Fields["MISSING_RUNTIME_SCRIPTS"] -split ',')
            }
        backup_verify_status = $Fields["BACKUP_VERIFY_STATUS"]
        backup_verify_detail = $Fields["BACKUP_VERIFY_DETAIL"]
        restore_drill_status = $Fields["RESTORE_DRILL_STATUS"]
        restore_drill_detail = $restoreDrillDetail
        restore_drill_free_root_bytes = $restoreFreeRootBytes
        restore_drill_required_bytes = $restoreRequiredBytes
        restore_drill_source_db_bytes = $restoreSourceDbBytes
        restore_drill_gap_bytes = $restoreGapBytes
        postgres_wal_gib =
            if ($Fields.ContainsKey("POSTGRES_WAL_GIB") -and -not [string]::IsNullOrWhiteSpace($Fields["POSTGRES_WAL_GIB"])) {
                [double]$Fields["POSTGRES_WAL_GIB"]
            } else {
                $null
            }
        max_slot_wal_keep_size = $Fields["MAX_SLOT_WAL_KEEP_SIZE"]
        wal_keep_size = $Fields["WAL_KEEP_SIZE"]
        electric_slot_status = $Fields["ELECTRIC_SLOT_STATUS"]
        electric_slot_summary = $Fields["ELECTRIC_SLOT_SUMMARY"]
        electric_slot_name = $Fields["ELECTRIC_SLOT_NAME"]
        electric_slot_active =
            if ($Fields.ContainsKey("ELECTRIC_SLOT_ACTIVE") -and -not [string]::IsNullOrWhiteSpace($Fields["ELECTRIC_SLOT_ACTIVE"])) {
                [string]$Fields["ELECTRIC_SLOT_ACTIVE"] -eq "true"
            } else {
                $null
            }
        electric_slot_retained_wal_gib =
            if ($Fields.ContainsKey("ELECTRIC_SLOT_RETAINED_WAL_GIB") -and -not [string]::IsNullOrWhiteSpace($Fields["ELECTRIC_SLOT_RETAINED_WAL_GIB"])) {
                [double]$Fields["ELECTRIC_SLOT_RETAINED_WAL_GIB"]
            } else {
                $null
            }
        electric_slot_restart_lsn = $Fields["ELECTRIC_SLOT_RESTART_LSN"]
        electric_slot_confirmed_flush_lsn = $Fields["ELECTRIC_SLOT_CONFIRMED_FLUSH_LSN"]
        remote_root_use_pct = $Fields["REMOTE_ROOT_USE_PCT"]
        remote_var_use_pct = $Fields["REMOTE_VAR_USE_PCT"]
        failure_step = $Fields["FAILURE_STEP"]
        failure_reason = $failureReason
    }
}

function Write-OracleProductionProofSummary {
    param(
        [pscustomobject]$Report,
        [string]$Destination
    )

    if ([string]::IsNullOrWhiteSpace($Destination)) {
        return
    }

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null

    @"
STATUS=$($Report.status)
REMOTE_HOST=$($Report.remote_host)
GENERATED_AT=$($Report.generated_at)
REMOTE_DIR=$($Report.remote_dir)
ENV_FILE=$($Report.env_file)
COMPOSE_FILE=$($Report.compose_file)
BACKUP_DIR=$($Report.backup_dir)
BACKUP_DIR_SOURCE=$($Report.backup_dir_source)
BACKUP_SERVICE_RUNNING=$($Report.backup_service_running)
HOMESERVER_RUNNING=$($Report.homeserver_running)
LATEST_ARCHIVE=$($Report.latest_archive)
LATEST_ARCHIVE_AGE_DAYS=$($Report.latest_archive_age_days)
MANIFEST_VERIFICATION_STATUS=$($Report.manifest_verification_status)
MANIFEST_VERIFIED_AT=$($Report.manifest_verified_at)
RUNTIME_SCRIPT_INTEGRITY_STATUS=$($Report.runtime_script_integrity_status)
RUNTIME_SCRIPT_INTEGRITY_DETAIL=$($Report.runtime_script_integrity_detail)
MISSING_RUNTIME_SCRIPTS=$(@($Report.missing_runtime_scripts) -join ',')
BACKUP_VERIFY_STATUS=$($Report.backup_verify_status)
BACKUP_VERIFY_DETAIL=$($Report.backup_verify_detail)
RESTORE_DRILL_STATUS=$($Report.restore_drill_status)
RESTORE_DRILL_DETAIL=$($Report.restore_drill_detail)
RESTORE_DRILL_FREE_ROOT_BYTES=$($Report.restore_drill_free_root_bytes)
RESTORE_DRILL_REQUIRED_BYTES=$($Report.restore_drill_required_bytes)
RESTORE_DRILL_SOURCE_DB_BYTES=$($Report.restore_drill_source_db_bytes)
RESTORE_DRILL_GAP_BYTES=$($Report.restore_drill_gap_bytes)
POSTGRES_WAL_GIB=$($Report.postgres_wal_gib)
MAX_SLOT_WAL_KEEP_SIZE=$($Report.max_slot_wal_keep_size)
WAL_KEEP_SIZE=$($Report.wal_keep_size)
ELECTRIC_SLOT_STATUS=$($Report.electric_slot_status)
ELECTRIC_SLOT_SUMMARY=$($Report.electric_slot_summary)
ELECTRIC_SLOT_NAME=$($Report.electric_slot_name)
ELECTRIC_SLOT_ACTIVE=$($Report.electric_slot_active)
ELECTRIC_SLOT_RETAINED_WAL_GIB=$($Report.electric_slot_retained_wal_gib)
ELECTRIC_SLOT_RESTART_LSN=$($Report.electric_slot_restart_lsn)
ELECTRIC_SLOT_CONFIRMED_FLUSH_LSN=$($Report.electric_slot_confirmed_flush_lsn)
REMOTE_ROOT_USE_PCT=$($Report.remote_root_use_pct)
REMOTE_VAR_USE_PCT=$($Report.remote_var_use_pct)
FAILURE_STEP=$($Report.failure_step)
FAILURE_REASON=$($Report.failure_reason)
"@ | Set-Content (Join-Path $Destination "oracle-production-proof.env")

    @"
# Oracle Production Proof

- status: $($Report.status)
- remote_host: $($Report.remote_host)
- generated_at: $($Report.generated_at)
- remote_dir: $($Report.remote_dir)
- env_file: $($Report.env_file)
- compose_file: $($Report.compose_file)
- backup_dir: $($Report.backup_dir)
- backup_dir_source: $($Report.backup_dir_source)
- backup_service_running: $($Report.backup_service_running)
- homeserver_running: $($Report.homeserver_running)
- latest_archive: $($Report.latest_archive)
- latest_archive_age_days: $($Report.latest_archive_age_days)
- manifest_verification_status: $($Report.manifest_verification_status)
- manifest_verified_at: $($Report.manifest_verified_at)
- runtime_script_integrity_status: $($Report.runtime_script_integrity_status)
- runtime_script_integrity_detail: $($Report.runtime_script_integrity_detail)
- missing_runtime_scripts: $(@($Report.missing_runtime_scripts) -join ', ')
- backup_verify_status: $($Report.backup_verify_status)
- backup_verify_detail: $($Report.backup_verify_detail)
- restore_drill_status: $($Report.restore_drill_status)
- restore_drill_detail: $($Report.restore_drill_detail)
- restore_drill_free_root_bytes: $($Report.restore_drill_free_root_bytes)
- restore_drill_required_bytes: $($Report.restore_drill_required_bytes)
- restore_drill_source_db_bytes: $($Report.restore_drill_source_db_bytes)
- restore_drill_gap_bytes: $($Report.restore_drill_gap_bytes)
- postgres_wal_gib: $($Report.postgres_wal_gib)
- max_slot_wal_keep_size: $($Report.max_slot_wal_keep_size)
- wal_keep_size: $($Report.wal_keep_size)
- electric_slot_status: $($Report.electric_slot_status)
- electric_slot_summary: $($Report.electric_slot_summary)
- electric_slot_name: $($Report.electric_slot_name)
- electric_slot_active: $($Report.electric_slot_active)
- electric_slot_retained_wal_gib: $($Report.electric_slot_retained_wal_gib)
- electric_slot_restart_lsn: $($Report.electric_slot_restart_lsn)
- electric_slot_confirmed_flush_lsn: $($Report.electric_slot_confirmed_flush_lsn)
- remote_root_use_pct: $($Report.remote_root_use_pct)
- remote_var_use_pct: $($Report.remote_var_use_pct)
- failure_step: $($Report.failure_step)
- failure_reason: $($Report.failure_reason)
"@ | Set-Content (Join-Path $Destination "oracle-production-proof.md")

    $jsonReport = [pscustomobject]@{
        generated_at = $Report.generated_at
        status = $Report.status
        remote_host = $Report.remote_host
        remote_dir = $Report.remote_dir
        env_file = $Report.env_file
        compose_file = $Report.compose_file
        backup_dir = $Report.backup_dir
        backup_dir_source = $Report.backup_dir_source
        backup_service_running = $Report.backup_service_running
        homeserver_running = $Report.homeserver_running
        latest_archive = $Report.latest_archive
        latest_archive_age_days = $Report.latest_archive_age_days
        manifest_verification_status = $Report.manifest_verification_status
        manifest_verified_at = $Report.manifest_verified_at
        runtime_script_integrity_status = $Report.runtime_script_integrity_status
        runtime_script_integrity_detail = $Report.runtime_script_integrity_detail
        missing_runtime_scripts = [string[]]@($Report.missing_runtime_scripts)
        backup_verify_status = $Report.backup_verify_status
        backup_verify_detail = $Report.backup_verify_detail
        restore_drill_status = $Report.restore_drill_status
        restore_drill_detail = $Report.restore_drill_detail
        restore_drill_free_root_bytes = $Report.restore_drill_free_root_bytes
        restore_drill_required_bytes = $Report.restore_drill_required_bytes
        restore_drill_source_db_bytes = $Report.restore_drill_source_db_bytes
        restore_drill_gap_bytes = $Report.restore_drill_gap_bytes
        postgres_wal_gib = $Report.postgres_wal_gib
        max_slot_wal_keep_size = $Report.max_slot_wal_keep_size
        wal_keep_size = $Report.wal_keep_size
        electric_slot_status = $Report.electric_slot_status
        electric_slot_summary = $Report.electric_slot_summary
        electric_slot_name = $Report.electric_slot_name
        electric_slot_active = $Report.electric_slot_active
        electric_slot_retained_wal_gib = $Report.electric_slot_retained_wal_gib
        electric_slot_restart_lsn = $Report.electric_slot_restart_lsn
        electric_slot_confirmed_flush_lsn = $Report.electric_slot_confirmed_flush_lsn
        remote_root_use_pct = $Report.remote_root_use_pct
        remote_var_use_pct = $Report.remote_var_use_pct
        failure_step = $Report.failure_step
        failure_reason = $Report.failure_reason
    }
    $jsonReport | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Destination "oracle-production-proof.json")
}

if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    throw "[oracle-production-proof] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-production-proof] User is required"
}
if ([string]::IsNullOrWhiteSpace($RemoteDir)) {
    throw "[oracle-production-proof] RemoteDir is required"
}

$skipRestoreDrillValue = if ($SkipRestoreDrill) { "1" } else { "0" }
$restoreDrillTimeoutSecondsValue = if ($RestoreDrillTimeoutSeconds -gt 0) { [string]$RestoreDrillTimeoutSeconds } else { "0" }
$requiredRuntimeScriptsLiteral = ((Get-OracleRequiredRuntimeScriptPaths) -join ' ')
$remoteAuditScript = @'
set -euo pipefail

remote_dir=__REMOTE_DIR__
env_file_name=__ENV_FILE_NAME__
compose_file_name=__COMPOSE_FILE_NAME__
skip_restore_drill=__SKIP_RESTORE_DRILL__
restore_drill_timeout_seconds=__RESTORE_DRILL_TIMEOUT_SECONDS__

trim_quotes() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [ ${#value} -ge 2 ]; then
    local first="${value:0:1}"
    local last="${value: -1}"
    local pair="${first}${last}"
    case "$pair" in
      '""'|"''")
        value="${value:1:${#value}-2}"
        ;;
    esac
  fi
  printf '%s' "$value"
}

env_value() {
  local key="$1"
  local path="$2"
  [[ -f "$path" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    local trimmed="$line"
    trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"
    [[ -z "$trimmed" || "${trimmed:0:1}" == "#" ]] && continue
    [[ "$trimmed" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    local current_key="${trimmed%%=*}"
    [[ "$current_key" == "$key" ]] || continue
    trim_quotes "${trimmed#*=}"
    return 0
  done < "$path"
  return 1
}

sanitize() {
  printf '%s' "$1" | tr '\r\n' ' ' | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//'
}

print_field() {
  printf '%s=%s\n' "$1" "$(sanitize "$2")"
}

mark_fail() {
  local step="$1"
  local reason="$2"
  if [[ "$status" == "pass" ]]; then
    status="fail"
    failure_step="$step"
    failure_reason="$reason"
  fi
}

status="pass"
failure_step="none"
failure_reason="none"
backup_dir="none"
backup_dir_source="none"
backup_service_running="false"
homeserver_running="false"
latest_archive="none"
latest_archive_age_days="none"
manifest_verification_status="none"
manifest_verified_at="none"
runtime_script_integrity_status="pending"
runtime_script_integrity_detail="none"
missing_runtime_scripts=""
backup_verify_status="pending"
backup_verify_detail="none"
restore_drill_status="pending"
restore_drill_detail="none"
source_db_bytes="0"
remote_root_use_pct="unknown"
remote_var_use_pct="unknown"
postgres_wal_gib="none"
max_slot_wal_keep_size="none"
wal_keep_size="none"
electric_slot_status="unknown"
electric_slot_summary="WAL slot audit did not run."
electric_slot_name="none"
electric_slot_active="none"
electric_slot_retained_wal_gib="none"
electric_slot_restart_lsn="none"
electric_slot_confirmed_flush_lsn="none"
required_runtime_scripts=__REQUIRED_RUNTIME_SCRIPTS__

env_path="$remote_dir/$env_file_name"
compose_path="$remote_dir/$compose_file_name"

if [[ ! -d "$remote_dir" ]]; then
  mark_fail "remote_dir" "remote_dir missing"
elif [[ ! -f "$env_path" ]]; then
  mark_fail "env_file" "env file missing"
elif [[ ! -f "$compose_path" ]]; then
  mark_fail "compose_file" "compose file missing"
fi

if [[ -f "$env_path" ]]; then
  parsed_backup_dir="$(env_value OMNYID_BACKUP_DIR "$env_path" || true)"
  if [[ -n "${parsed_backup_dir//[[:space:]]/}" ]]; then
    backup_dir="$parsed_backup_dir"
    backup_dir_source="env"
  else
    backup_dir="/var/backups/omnyid"
    backup_dir_source="compose_default"
  fi
fi

pg_user="$(env_value OMNYID_PG_USER "$env_path" || true)"
if [[ -z "${pg_user//[[:space:]]/}" ]]; then
  pg_user="afp"
fi
pg_db="$(env_value OMNYID_PG_DB "$env_path" || true)"
if [[ -z "${pg_db//[[:space:]]/}" ]]; then
  pg_db="afp"
fi

postgres_container_name=""
if docker ps --format '{{.Names}}' | grep -Fx 'omnyid-postgres-1' >/dev/null 2>&1; then
  postgres_container_name="omnyid-postgres-1"
fi

if [[ -n "${postgres_container_name//[[:space:]]/}" ]]; then
  postgres_wal_bytes_candidate="$(docker exec "$postgres_container_name" bash -lc 'wal_dir="${PGDATA:-/var/lib/postgresql/data}/pg_wal"; if [[ -d "$wal_dir" ]]; then du -sb "$wal_dir" 2>/dev/null | cut -f1; fi' 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ -n "${postgres_wal_bytes_candidate//[[:space:]]/}" && "$postgres_wal_bytes_candidate" =~ ^[0-9]+$ ]]; then
    postgres_wal_gib="$(python3 - "$postgres_wal_bytes_candidate" <<'PY'
import sys
value = int(sys.argv[1])
print(round(value / (1024 ** 3), 6))
PY
)"
  fi

  wal_settings_row="$(docker exec "$postgres_container_name" psql -U "$pg_user" -d "$pg_db" -Atqc "SELECT current_setting('max_slot_wal_keep_size'), current_setting('wal_keep_size');" 2>/dev/null | head -n 1 || true)"
  if [[ -n "${wal_settings_row//[[:space:]]/}" ]]; then
    max_slot_wal_keep_size="${wal_settings_row%%|*}"
    wal_keep_size="${wal_settings_row#*|}"
  fi

  electric_slot_row="$(docker exec "$postgres_container_name" psql -U "$pg_user" -d "$pg_db" -Atqc "SELECT slot_name, active::text, COALESCE(wal_status, ''), COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::bigint, 0), COALESCE(restart_lsn::text, ''), COALESCE(confirmed_flush_lsn::text, '') FROM pg_replication_slots WHERE slot_name LIKE 'electric_slot%' ORDER BY slot_name LIMIT 1;" 2>/dev/null | head -n 1 || true)"
  if [[ -n "${electric_slot_row//[[:space:]]/}" ]]; then
    IFS='|' read -r electric_slot_name electric_slot_active electric_slot_wal_status electric_slot_retained_wal_bytes electric_slot_restart_lsn electric_slot_confirmed_flush_lsn <<< "$electric_slot_row"
    if [[ -n "${electric_slot_retained_wal_bytes//[[:space:]]/}" && "$electric_slot_retained_wal_bytes" =~ ^[0-9]+$ ]]; then
      electric_slot_retained_wal_gib="$(python3 - "$electric_slot_retained_wal_bytes" <<'PY'
import sys
value = int(sys.argv[1])
print(round(value / (1024 ** 3), 6))
PY
)"
    fi
    electric_slot_status="healthy"
    electric_slot_summary="Electric slot '$electric_slot_name' is active or bounded."
    if [[ "$electric_slot_active" != "true" && "$max_slot_wal_keep_size" == "-1" ]]; then
      electric_slot_status="inactive_electric_slot_unbounded"
      electric_slot_summary="Electric slot '$electric_slot_name' is inactive and retaining ${electric_slot_retained_wal_gib} GiB of WAL while max_slot_wal_keep_size is unlimited."
      if [[ "$status" == "pass" ]]; then
        mark_fail "postgres_wal" "inactive Electric slot is retaining WAL with no safety limit"
      fi
    elif [[ "$electric_slot_active" != "true" && "$electric_slot_retained_wal_bytes" =~ ^[0-9]+$ && "$electric_slot_retained_wal_bytes" -gt 0 ]]; then
      electric_slot_status="inactive_electric_slot_retaining_wal"
      electric_slot_summary="Electric slot '$electric_slot_name' is inactive and retaining ${electric_slot_retained_wal_gib} GiB of WAL."
    fi
  else
    electric_slot_status="no_electric_slot"
    electric_slot_summary="No Electric replication slot was found in Postgres."
  fi
else
  electric_slot_status="postgres_container_not_found"
  electric_slot_summary="Postgres container was not found, so WAL slot state could not be inspected."
fi

root_use="$(df -P / | awk 'END {print $5}' | tr -d '%' || true)"
if [[ -n "${root_use//[[:space:]]/}" ]]; then
  remote_root_use_pct="$root_use"
  if [[ "$root_use" =~ ^[0-9]+$ ]] && (( root_use >= 98 )); then
    mark_fail "disk_capacity" "remote root filesystem is at ${root_use}% use"
  fi
fi

var_use="$(df -P /var | awk 'END {print $5}' | tr -d '%' || true)"
if [[ -n "${var_use//[[:space:]]/}" ]]; then
  remote_var_use_pct="$var_use"
fi

if [[ -f "$env_path" && -f "$compose_path" ]]; then
  running_services="$(cd "$remote_dir" && docker compose --env-file "$env_file_name" -f "$compose_file_name" ps --services --status running 2>/dev/null || true)"
  if printf '%s\n' "$running_services" | grep -Fx backup >/dev/null 2>&1; then
    backup_service_running="true"
  else
    mark_fail "backup_service" "backup service not running"
  fi
  if printf '%s\n' "$running_services" | grep -Fx homeserver >/dev/null 2>&1; then
    homeserver_running="true"
  else
    mark_fail "homeserver" "homeserver not running"
  fi
fi

missing_runtime_script_list=""
for required_script in $required_runtime_scripts; do
  if [[ ! -f "$remote_dir/$required_script" ]]; then
    if [[ -n "$missing_runtime_script_list" ]]; then
      missing_runtime_script_list="${missing_runtime_script_list},"
    fi
    missing_runtime_script_list="${missing_runtime_script_list}${required_script}"
  fi
done
missing_runtime_scripts="$missing_runtime_script_list"
if [[ -n "$missing_runtime_script_list" ]]; then
  runtime_script_integrity_status="fail"
  runtime_script_integrity_detail="remote runtime is missing required scripts: ${missing_runtime_script_list}"
  mark_fail "runtime_scripts" "remote runtime is missing required scripts"
else
  runtime_script_integrity_status="pass"
  runtime_script_integrity_detail="required runtime scripts are present"
fi

if [[ "$backup_dir" != "none" ]]; then
  if [[ ! -d "$backup_dir" ]]; then
    mark_fail "backup_dir" "backup directory missing on host"
  else
    latest_candidate="$(find "$backup_dir" -maxdepth 1 -mindepth 1 -type d -name '20*Z' | sort | tail -n 1)"
    if [[ -z "$latest_candidate" ]]; then
      mark_fail "backup_archive" "no timestamped backup archive found"
    else
      latest_archive="$latest_candidate"
      latest_archive_age_days="$(python3 - "$latest_candidate" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import sys

name = Path(sys.argv[1]).name
try:
    stamp = datetime.strptime(name, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
except ValueError:
    print("unknown")
    raise SystemExit(0)

delta = datetime.now(timezone.utc) - stamp
print(max(delta.days, 0))
PY
)"
      if [[ "$latest_archive_age_days" =~ ^[0-9]+$ ]] && (( latest_archive_age_days > 2 )); then
        mark_fail "stale_backup" "latest backup archive is ${latest_archive_age_days} days old"
      fi
      manifest_path="$latest_archive/manifest.json"
      if [[ ! -f "$manifest_path" ]]; then
        mark_fail "manifest" "latest backup archive is missing manifest.json"
      else
        manifest_verification_status="$(python3 - "$manifest_path" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    manifest = json.load(handle)
verification = manifest.get('verification') or {}
print((verification.get('status') or 'none').strip())
PY
)"
        manifest_verified_at="$(python3 - "$manifest_path" <<'PY'
import json
import sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    manifest = json.load(handle)
verification = manifest.get('verification') or {}
print((verification.get('verified_at') or 'none').strip())
PY
)"
      fi
    fi
  fi
fi

if [[ "$latest_archive" != "none" && -f "$remote_dir/scripts/omnyid-backup-verify.sh" ]]; then
  backup_verify_log="$(mktemp)"
  if bash "$remote_dir/scripts/omnyid-backup-verify.sh" "$latest_archive" >"$backup_verify_log" 2>&1; then
    backup_verify_status="pass"
    backup_verify_detail="$(tail -n 1 "$backup_verify_log" || true)"
  else
    backup_verify_status="fail"
    backup_verify_detail="$(tail -n 5 "$backup_verify_log" | tr '\n' ' ' || true)"
    mark_fail "backup_verify" "backup verification failed"
  fi
  rm -f "$backup_verify_log"
elif [[ "$latest_archive" != "none" ]]; then
  backup_verify_status="fail"
  backup_verify_detail="backup verify script missing from runtime"
  mark_fail "backup_verify" "backup verify script missing from runtime"
fi

cleanup_stale_restore_drill_containers() {
  stale_restore_drill_containers="$(docker ps -a --format '{{.Names}}' | grep '^omnyid-restore-drill-' || true)"
  if [[ -z "${stale_restore_drill_containers//[[:space:]]/}" ]]; then
    return 0
  fi

  while IFS= read -r stale_restore_drill_container; do
    if [[ -n "${stale_restore_drill_container//[[:space:]]/}" ]]; then
      docker rm -f -v "$stale_restore_drill_container" >/dev/null 2>&1 || true
    fi
  done <<< "$stale_restore_drill_containers"
}

if [[ "$skip_restore_drill" == "1" ]]; then
  restore_drill_status="skipped"
  restore_drill_detail="skipped by operator request"
elif [[ "$latest_archive" != "none" && -f "$remote_dir/scripts/omnyid-restore-drill.sh" && "$backup_verify_status" == "pass" ]]; then
  cleanup_stale_restore_drill_containers
  if docker ps --format '{{.Names}}' | grep -Fx 'omnyid-postgres-1' >/dev/null 2>&1; then
    source_db_bytes_candidate="$(docker exec omnyid-postgres-1 psql -U "$pg_user" -d "$pg_db" -Atqc "select pg_database_size(current_database());" 2>/dev/null | tr -d '[:space:]' || true)"
    if [[ -n "${source_db_bytes_candidate//[[:space:]]/}" && "$source_db_bytes_candidate" =~ ^[0-9]+$ ]]; then
      source_db_bytes="$source_db_bytes_candidate"
    fi
  fi
  restore_drill_log="$(mktemp)"
  restore_drill_exit_code=0
  if command -v timeout >/dev/null 2>&1 && [[ "$restore_drill_timeout_seconds" =~ ^[0-9]+$ ]] && (( restore_drill_timeout_seconds > 0 )); then
    if OMNYID_RESTORE_DRILL_SOURCE_DB_BYTES="$source_db_bytes" timeout "$restore_drill_timeout_seconds" bash "$remote_dir/scripts/omnyid-restore-drill.sh" "$latest_archive" >"$restore_drill_log" 2>&1; then
      restore_drill_exit_code=0
    else
      restore_drill_exit_code=$?
    fi
  else
    if OMNYID_RESTORE_DRILL_SOURCE_DB_BYTES="$source_db_bytes" bash "$remote_dir/scripts/omnyid-restore-drill.sh" "$latest_archive" >"$restore_drill_log" 2>&1; then
      restore_drill_exit_code=0
    else
      restore_drill_exit_code=$?
    fi
  fi

  cleanup_stale_restore_drill_containers
  if (( restore_drill_exit_code == 0 )); then
    restore_drill_status="pass"
    restore_drill_detail="$(tail -n 1 "$restore_drill_log" || true)"
  elif (( restore_drill_exit_code == 124 )); then
    restore_drill_status="fail"
    restore_drill_detail="restore drill exceeded ${restore_drill_timeout_seconds}s timeout $(tail -n 5 "$restore_drill_log" | tr '\n' ' ' || true)"
    mark_fail "restore_drill" "restore drill timed out"
  else
    restore_drill_status="fail"
    restore_drill_detail="$(tail -n 5 "$restore_drill_log" | tr '\n' ' ' || true)"
    mark_fail "restore_drill" "restore drill failed"
  fi
  rm -f "$restore_drill_log"
elif [[ "$latest_archive" != "none" && "$backup_verify_status" != "pass" ]]; then
  restore_drill_status="blocked"
  restore_drill_detail="blocked by backup verification failure"
fi

print_field STATUS "$status"
print_field REMOTE_DIR "$remote_dir"
print_field ENV_FILE "$env_file_name"
print_field COMPOSE_FILE "$compose_file_name"
print_field BACKUP_DIR "$backup_dir"
print_field BACKUP_DIR_SOURCE "$backup_dir_source"
print_field BACKUP_SERVICE_RUNNING "$backup_service_running"
print_field HOMESERVER_RUNNING "$homeserver_running"
print_field LATEST_ARCHIVE "$latest_archive"
print_field LATEST_ARCHIVE_AGE_DAYS "$latest_archive_age_days"
print_field MANIFEST_VERIFICATION_STATUS "$manifest_verification_status"
print_field MANIFEST_VERIFIED_AT "$manifest_verified_at"
print_field RUNTIME_SCRIPT_INTEGRITY_STATUS "$runtime_script_integrity_status"
print_field RUNTIME_SCRIPT_INTEGRITY_DETAIL "$runtime_script_integrity_detail"
print_field MISSING_RUNTIME_SCRIPTS "$missing_runtime_scripts"
print_field BACKUP_VERIFY_STATUS "$backup_verify_status"
print_field BACKUP_VERIFY_DETAIL "$backup_verify_detail"
print_field RESTORE_DRILL_STATUS "$restore_drill_status"
print_field RESTORE_DRILL_DETAIL "$restore_drill_detail"
print_field REMOTE_ROOT_USE_PCT "$remote_root_use_pct"
print_field REMOTE_VAR_USE_PCT "$remote_var_use_pct"
print_field FAILURE_STEP "$failure_step"
print_field FAILURE_REASON "$failure_reason"
'@
$remoteAuditScript = $remoteAuditScript.Replace("__REMOTE_DIR__", (Convert-ToShellSingleQuotedLiteral $RemoteDir))
$remoteAuditScript = $remoteAuditScript.Replace("__ENV_FILE_NAME__", (Convert-ToShellSingleQuotedLiteral $EnvFileName))
$remoteAuditScript = $remoteAuditScript.Replace("__COMPOSE_FILE_NAME__", (Convert-ToShellSingleQuotedLiteral $ComposeFile))
$remoteAuditScript = $remoteAuditScript.Replace("__SKIP_RESTORE_DRILL__", $skipRestoreDrillValue)
$remoteAuditScript = $remoteAuditScript.Replace("__RESTORE_DRILL_TIMEOUT_SECONDS__", $restoreDrillTimeoutSecondsValue)
$remoteAuditScript = $remoteAuditScript.Replace("__REQUIRED_RUNTIME_SCRIPTS__", (Convert-ToShellSingleQuotedLiteral $requiredRuntimeScriptsLiteral))

Write-Output "[oracle-production-proof] auditing Oracle runtime on ${RemoteHost}:$RemoteDir"
$reportText =
    if ($UseDetachedRemoteAudit) {
        Invoke-DetachedRemoteAudit -ScriptText $remoteAuditScript
    } else {
        # Something in the local ssh.exe/console stack unconditionally prepends a UTF-8 BOM
        # and converts the trailing newline to CRLF when text is piped to ssh's stdin here,
        # regardless of PowerShell encoding settings — verified even when bypassing
        # PowerShell's pipeline via a raw StreamWriter. Strip both on the remote side instead
        # of fighting the client-side cause.
        Invoke-RemoteSshCommand -RemoteCommand "bash -s" -InputText $remoteAuditScript
    }
$reportText = $reportText.Trim()

$fields = @{}
foreach ($line in ($reportText -split "`r?`n")) {
    if ($line -match '^([A-Z_]+)=(.*)$') {
        $fields[$matches[1]] = $matches[2].Trim()
    }
}

foreach ($requiredKey in @(
    "STATUS",
    "REMOTE_DIR",
    "ENV_FILE",
    "COMPOSE_FILE",
    "BACKUP_DIR",
    "BACKUP_DIR_SOURCE",
    "BACKUP_SERVICE_RUNNING",
    "HOMESERVER_RUNNING",
    "LATEST_ARCHIVE",
    "LATEST_ARCHIVE_AGE_DAYS",
    "MANIFEST_VERIFICATION_STATUS",
    "MANIFEST_VERIFIED_AT",
    "RUNTIME_SCRIPT_INTEGRITY_STATUS",
    "RUNTIME_SCRIPT_INTEGRITY_DETAIL",
    "MISSING_RUNTIME_SCRIPTS",
    "BACKUP_VERIFY_STATUS",
    "RESTORE_DRILL_STATUS",
    "REMOTE_ROOT_USE_PCT",
    "REMOTE_VAR_USE_PCT",
    "FAILURE_STEP",
    "FAILURE_REASON"
)) {
    if (-not $fields.ContainsKey($requiredKey)) {
        throw "[oracle-production-proof] remote proof output missing field: $requiredKey"
    }
}

$report = New-OracleProofReport -Fields $fields -ResolvedRemoteHost $RemoteHost
Write-OracleProductionProofSummary -Report $report -Destination $OutDir

Write-Output "[oracle-production-proof] backup_service_running=$($report.backup_service_running) homeserver_running=$($report.homeserver_running)"
Write-Output "[oracle-production-proof] backup_verify_status=$($report.backup_verify_status) restore_drill_status=$($report.restore_drill_status)"

if ($report.status -ne "pass") {
    throw "[oracle-production-proof] $($report.failure_step): $($report.failure_reason)"
}

Write-Output "[oracle-production-proof] Oracle production proof passed"
