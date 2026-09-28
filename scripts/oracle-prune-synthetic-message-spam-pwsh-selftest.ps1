Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-prune-synthetic-message-spam-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-prune-synthetic-message-spam-pwsh-selftest] expected '$Expected' in output: $Actual"
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
echo [remote] synthetic cleanup complete
echo [remote] after maintenance_summary_dupes=0 curator_card_dupes=0 curator_backlink_dupes=0 ingestion_topology_dupes=0 total_dupes=0 deleted_total=321
exit /b 0
"@ | Set-Content -Path $fakeSsh -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-prune-synthetic-message-spam.ps1") `
        -VacuumMode vacuum `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -OutDir $tmpRoot `
        -ScpExe $fakeScp `
        -SshExe $fakeSsh 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-prune-synthetic-message-spam-pwsh-selftest] expected wrapper script to pass`n$output"
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "uploading omnyid-prune-synthetic-message-spam.sh to oracle.example"
    Assert-Contains -Actual $text -Expected "uploading prune-curator-artifact-spam.sql to oracle.example"
    Assert-Contains -Actual $text -Expected "uploading prune-ingestion-topology-spam.sql to oracle.example"
    Assert-Contains -Actual $text -Expected "executing remote synthetic-message cleanup with vacuum_mode=vacuum dry_run=False"
    Assert-Contains -Actual $text -Expected "[remote] synthetic cleanup complete"
    Assert-Contains -Actual $text -Expected "deleted_total=321"

    $scpText = Get-Content -LiteralPath $scpLog -Raw
    Assert-Contains -Actual $scpText -Expected "omnyid-prune-synthetic-message-spam.sh"
    Assert-Contains -Actual $scpText -Expected "prune-maintenance-summary-spam.sql"
    Assert-Contains -Actual $scpText -Expected "prune-curator-artifact-spam.sql"
    Assert-Contains -Actual $scpText -Expected "prune-ingestion-topology-spam.sql"

    $sshText = Get-Content -LiteralPath $sshLog -Raw
    Assert-Contains -Actual $sshText -Expected ".env.oracle"
    Assert-Contains -Actual $sshText -Expected "--vacuum-mode 'vacuum'"

    $reportPath = Join-Path $tmpRoot "oracle-prune-synthetic-message-spam.json"
    if (-not (Test-Path -LiteralPath $reportPath)) {
        throw "[oracle-prune-synthetic-message-spam-pwsh-selftest] expected report at $reportPath"
    }
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($report.after.deleted_total -ne 321) {
        throw "[oracle-prune-synthetic-message-spam-pwsh-selftest] expected deleted_total=321 in report"
    }
    if ($report.vacuum_mode -ne "vacuum") {
        throw "[oracle-prune-synthetic-message-spam-pwsh-selftest] expected vacuum_mode=vacuum in report"
    }

    $dryRunOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-prune-synthetic-message-spam.ps1") `
        -VacuumMode analyze `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -OutDir $tmpRoot `
        -ScpExe $fakeScp `
        -SshExe $fakeSsh `
        -DryRun 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-prune-synthetic-message-spam-pwsh-selftest] expected dry-run wrapper script to pass`n$dryRunOutput"
    }
    $sshTextDryRun = Get-Content -LiteralPath $sshLog -Raw
    Assert-Contains -Actual $sshTextDryRun -Expected "--dry-run"

    Write-Output "[oracle-prune-synthetic-message-spam-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
