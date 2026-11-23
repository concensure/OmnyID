Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-production-proof-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-production-proof-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $fakeSshCmd = Join-Path $tmpRoot "fake-ssh.cmd"
    $fakeSshSkipCmd = Join-Path $tmpRoot "fake-ssh-skip.cmd"
    $fakeSshFailCmd = Join-Path $tmpRoot "fake-ssh-fail.cmd"
    @'
@echo off
echo STATUS=pass
echo REMOTE_DIR=/srv/omnyid
echo ENV_FILE=.env.oracle
echo COMPOSE_FILE=docker-compose.oracle.minimal.yml
echo BACKUP_DIR=/var/backups/omnyid
echo BACKUP_DIR_SOURCE=env
echo BACKUP_SERVICE_RUNNING=true
echo HOMESERVER_RUNNING=true
echo LATEST_ARCHIVE=/var/backups/omnyid/20260816T120000Z
echo LATEST_ARCHIVE_AGE_DAYS=0
echo MANIFEST_VERIFICATION_STATUS=passed
echo MANIFEST_VERIFIED_AT=2026-08-16T12:05:00Z
echo RUNTIME_SCRIPT_INTEGRITY_STATUS=pass
echo RUNTIME_SCRIPT_INTEGRITY_DETAIL=required runtime scripts are present
echo MISSING_RUNTIME_SCRIPTS=
echo BACKUP_VERIFY_STATUS=pass
echo BACKUP_VERIFY_DETAIL=archive verified
echo RESTORE_DRILL_STATUS=pass
echo RESTORE_DRILL_DETAIL=restore replay succeeded
echo POSTGRES_WAL_GIB=1.25
echo MAX_SLOT_WAL_KEEP_SIZE=2GB
echo WAL_KEEP_SIZE=512MB
echo ELECTRIC_SLOT_STATUS=healthy
echo ELECTRIC_SLOT_SUMMARY=Electric slot 'electric_slot_default' is active or bounded.
echo ELECTRIC_SLOT_NAME=electric_slot_default
echo ELECTRIC_SLOT_ACTIVE=true
echo ELECTRIC_SLOT_RETAINED_WAL_GIB=0.125
echo ELECTRIC_SLOT_RESTART_LSN=0/5000000
echo ELECTRIC_SLOT_CONFIRMED_FLUSH_LSN=0/5000100
echo REMOTE_ROOT_USE_PCT=72
echo REMOTE_VAR_USE_PCT=72
echo FAILURE_STEP=none
echo FAILURE_REASON=none
'@ | Set-Content $fakeSshCmd
    @'
@echo off
echo STATUS=pass
echo REMOTE_DIR=/srv/omnyid
echo ENV_FILE=.env.oracle
echo COMPOSE_FILE=docker-compose.oracle.minimal.yml
echo BACKUP_DIR=/var/backups/omnyid
echo BACKUP_DIR_SOURCE=env
echo BACKUP_SERVICE_RUNNING=true
echo HOMESERVER_RUNNING=true
echo LATEST_ARCHIVE=/var/backups/omnyid/20260816T120000Z
echo LATEST_ARCHIVE_AGE_DAYS=0
echo MANIFEST_VERIFICATION_STATUS=passed
echo MANIFEST_VERIFIED_AT=2026-08-16T12:05:00Z
echo RUNTIME_SCRIPT_INTEGRITY_STATUS=pass
echo RUNTIME_SCRIPT_INTEGRITY_DETAIL=required runtime scripts are present
echo MISSING_RUNTIME_SCRIPTS=
echo BACKUP_VERIFY_STATUS=pass
echo BACKUP_VERIFY_DETAIL=archive verified
echo RESTORE_DRILL_STATUS=skipped
echo RESTORE_DRILL_DETAIL=skipped by operator request
echo POSTGRES_WAL_GIB=1.25
echo MAX_SLOT_WAL_KEEP_SIZE=2GB
echo WAL_KEEP_SIZE=512MB
echo ELECTRIC_SLOT_STATUS=healthy
echo ELECTRIC_SLOT_SUMMARY=Electric slot 'electric_slot_default' is active or bounded.
echo ELECTRIC_SLOT_NAME=electric_slot_default
echo ELECTRIC_SLOT_ACTIVE=true
echo ELECTRIC_SLOT_RETAINED_WAL_GIB=0.125
echo ELECTRIC_SLOT_RESTART_LSN=0/5000000
echo ELECTRIC_SLOT_CONFIRMED_FLUSH_LSN=0/5000100
echo REMOTE_ROOT_USE_PCT=72
echo REMOTE_VAR_USE_PCT=72
echo FAILURE_STEP=none
echo FAILURE_REASON=none
'@ | Set-Content $fakeSshSkipCmd
    @'
@echo off
echo STATUS=fail
echo REMOTE_DIR=/srv/omnyid
echo ENV_FILE=.env.oracle
echo COMPOSE_FILE=docker-compose.oracle.minimal.yml
echo BACKUP_DIR=/var/backups/omnyid
echo BACKUP_DIR_SOURCE=env
echo BACKUP_SERVICE_RUNNING=true
echo HOMESERVER_RUNNING=true
echo LATEST_ARCHIVE=/var/backups/omnyid/20260816T120000Z
echo LATEST_ARCHIVE_AGE_DAYS=12
echo MANIFEST_VERIFICATION_STATUS=passed
echo MANIFEST_VERIFIED_AT=2026-08-16T12:05:00Z
echo RUNTIME_SCRIPT_INTEGRITY_STATUS=fail
echo RUNTIME_SCRIPT_INTEGRITY_DETAIL=remote runtime is missing required scripts: scripts/omnyid-backup-verify.sh
echo MISSING_RUNTIME_SCRIPTS=scripts/omnyid-backup-verify.sh
echo BACKUP_VERIFY_STATUS=fail
echo BACKUP_VERIFY_DETAIL=simulated backup verification failure
echo RESTORE_DRILL_STATUS=blocked
echo RESTORE_DRILL_DETAIL=blocked by backup verification failure
echo POSTGRES_WAL_GIB=20
echo MAX_SLOT_WAL_KEEP_SIZE=-1
echo WAL_KEEP_SIZE=512MB
echo ELECTRIC_SLOT_STATUS=inactive_electric_slot_unbounded
echo ELECTRIC_SLOT_SUMMARY=Electric slot 'electric_slot_default' is inactive and retaining 20 GiB of WAL while max_slot_wal_keep_size is unlimited.
echo ELECTRIC_SLOT_NAME=electric_slot_default
echo ELECTRIC_SLOT_ACTIVE=false
echo ELECTRIC_SLOT_RETAINED_WAL_GIB=20
echo ELECTRIC_SLOT_RESTART_LSN=0/5000000
echo ELECTRIC_SLOT_CONFIRMED_FLUSH_LSN=0/5000000
echo REMOTE_ROOT_USE_PCT=100
echo REMOTE_VAR_USE_PCT=100
echo FAILURE_STEP=postgres_wal
echo FAILURE_REASON=inactive Electric slot is retaining WAL with no safety limit
'@ | Set-Content $fakeSshFailCmd

    $outDirFull = Join-Path $tmpRoot "out-full"
    $outputFull = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-production-proof.ps1") `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -RemoteDir "/srv/omnyid" `
        -OutDir $outDirFull `
        -SshExe $fakeSshCmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-production-proof-pwsh-selftest] expected full proof run to pass`n$outputFull"
    }
    Assert-Contains -Actual (($outputFull | Out-String)) -Expected "[oracle-production-proof] Oracle production proof passed"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "GENERATED_AT="
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "RESTORE_DRILL_STATUS=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "BACKUP_VERIFY_DETAIL=archive verified"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "RESTORE_DRILL_DETAIL=restore replay succeeded"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "RUNTIME_SCRIPT_INTEGRITY_STATUS=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "ELECTRIC_SLOT_STATUS=healthy"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFull "oracle-production-proof.env") -Raw) -Expected "POSTGRES_WAL_GIB=1.25"

    $fullJson = Get-Content (Join-Path $outDirFull "oracle-production-proof.json") -Raw | ConvertFrom-Json
    if ($fullJson.electric_slot_status -ne "healthy") {
        throw "[oracle-production-proof-pwsh-selftest] expected healthy electric slot status in full proof json"
    }
    if ([double]$fullJson.postgres_wal_gib -ne 1.25) {
        throw "[oracle-production-proof-pwsh-selftest] expected postgres_wal_gib in full proof json"
    }

    $outDirSkip = Join-Path $tmpRoot "out-skip"
    $outputSkip = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-production-proof.ps1") `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -RemoteDir "/srv/omnyid" `
        -OutDir $outDirSkip `
        -SkipRestoreDrill `
        -SshExe $fakeSshSkipCmd 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-production-proof-pwsh-selftest] expected skip-drill proof run to pass`n$outputSkip"
    }
    Assert-Contains -Actual (Get-Content (Join-Path $outDirSkip "oracle-production-proof.env") -Raw) -Expected "RESTORE_DRILL_STATUS=skipped"

    $failedText = ""
    $outDirFail = Join-Path $tmpRoot "out-fail"
    try {
        $failedOutput = & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-production-proof.ps1") `
            -RemoteHost "oracle.example" `
            -User "ubuntu" `
            -RemoteDir "/srv/omnyid" `
            -OutDir $outDirFail `
            -SshExe $fakeSshFailCmd 2>&1
        if ($LASTEXITCODE -eq 0) {
            throw "[oracle-production-proof-pwsh-selftest] expected failing proof run to return non-zero"
        }
        $failedText = ($failedOutput | Out-String)
    }
    catch {
        $failedText = $_ | Out-String
    }
    Assert-Contains -Actual $failedText -Expected "postgres_wal: inactive Electric slot is retaining WAL with no safety limit"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFail "oracle-production-proof.env") -Raw) -Expected "RUNTIME_SCRIPT_INTEGRITY_STATUS=fail"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFail "oracle-production-proof.env") -Raw) -Expected "MISSING_RUNTIME_SCRIPTS=scripts/omnyid-backup-verify.sh"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFail "oracle-production-proof.env") -Raw) -Expected "BACKUP_VERIFY_DETAIL=simulated backup verification failure"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFail "oracle-production-proof.env") -Raw) -Expected "RESTORE_DRILL_DETAIL=blocked by backup verification failure"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFail "oracle-production-proof.env") -Raw) -Expected "ELECTRIC_SLOT_STATUS=inactive_electric_slot_unbounded"
    Assert-Contains -Actual (Get-Content (Join-Path $outDirFail "oracle-production-proof.env") -Raw) -Expected "ELECTRIC_SLOT_RETAINED_WAL_GIB=20"

    Write-Output "[oracle-production-proof-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
