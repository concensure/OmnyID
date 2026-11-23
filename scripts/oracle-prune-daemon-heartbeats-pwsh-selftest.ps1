Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-prune-daemon-heartbeats-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-prune-daemon-heartbeats-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    $fakeScp = Join-Path $tmpRoot "fake-scp.cmd"
    $fakeSsh = Join-Path $tmpRoot "fake-ssh.cmd"
    $scpLog = Join-Path $tmpRoot "scp.log"
    $sshLog = Join-Path $tmpRoot "ssh.log"

    @"
@echo off
setlocal DisableDelayedExpansion
echo %*>>"$scpLog"
exit /b 0
"@ | Set-Content -Path $fakeScp -Encoding ASCII

    @"
@echo off
setlocal DisableDelayedExpansion
echo %*>>"$sshLog"
echo [remote] prune complete
echo [remote] after_total_rows=210000 after_stale_rows=0 deleted_total=13900000
exit /b 0
"@ | Set-Content -Path $fakeSsh -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-prune-daemon-heartbeats.ps1") `
        -RetentionHours 48 `
        -BatchSize 5000 `
        -VacuumMode vacuum_full `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -ScpExe $fakeScp `
        -SshExe $fakeSsh 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-prune-daemon-heartbeats-pwsh-selftest] expected wrapper script to pass`n$output"
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "uploading prune script to oracle.example"
    Assert-Contains -Actual $text -Expected "executing remote prune with retention_hours=48 batch_size=5000 vacuum_mode=vacuum_full dry_run=False"
    Assert-Contains -Actual $text -Expected "[remote] prune complete"
    Assert-Contains -Actual $text -Expected "after_total_rows=210000 after_stale_rows=0 deleted_total=13900000"

    $scpText = Get-Content -LiteralPath $scpLog -Raw
    Assert-Contains -Actual $scpText -Expected "omnyid-prune-daemon-heartbeats.sh"
    Assert-Contains -Actual $scpText -Expected "ubuntu@oracle.example:/srv/omnyid/scripts/omnyid-prune-daemon-heartbeats.sh"

    $sshText = Get-Content -LiteralPath $sshLog -Raw
    Assert-Contains -Actual $sshText -Expected ".env.oracle"
    Assert-Contains -Actual $sshText -Expected "--retention-hours '48'"
    Assert-Contains -Actual $sshText -Expected "--batch-size '5000'"
    Assert-Contains -Actual $sshText -Expected "--vacuum-mode 'vacuum_full'"

    $dryRunOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-prune-daemon-heartbeats.ps1") `
        -RetentionHours 48 `
        -BatchSize 1000 `
        -VacuumMode analyze `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -ScpExe $fakeScp `
        -SshExe $fakeSsh `
        -DryRun 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-prune-daemon-heartbeats-pwsh-selftest] expected dry-run wrapper script to pass`n$dryRunOutput"
    }
    $sshTextDryRun = Get-Content -LiteralPath $sshLog -Raw
    Assert-Contains -Actual $sshTextDryRun -Expected "--dry-run"

    Write-Output "[oracle-prune-daemon-heartbeats-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
