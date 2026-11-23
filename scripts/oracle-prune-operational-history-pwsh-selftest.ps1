Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-prune-operational-history-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-prune-operational-history-pwsh-selftest] expected '$Expected' in output: $Actual"
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
echo [remote] operational cleanup complete
echo [omnyid-prune-operational-history] after tenant_action_audit_log=10 daemon_operational_afp=9 tenant_llm_usage_log=8 training_reflection_traces=7 proactive_token_usage=6 user_external_tool_usage_events=5 tenant_workflow_trigger_observations=4 proactive_suggestions=3 trigger_replay_nonces=2 deleted_total=123
echo [omnyid-prune-operational-history] before tenant_action_audit_log=20 daemon_operational_afp=19 tenant_llm_usage_log=18 training_reflection_traces=17 proactive_token_usage=16 user_external_tool_usage_events=15 tenant_workflow_trigger_observations=14 proactive_suggestions=13 trigger_replay_nonces=12
exit /b 0
"@ | Set-Content -Path $fakeSsh -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-prune-operational-history.ps1") `
        -VacuumMode vacuum `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -OutDir $tmpRoot `
        -ScpExe $fakeScp `
        -SshExe $fakeSsh 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-prune-operational-history-pwsh-selftest] expected wrapper script to pass`n$output"
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "uploading omnyid-prune-operational-history.sh to oracle.example"
    Assert-Contains -Actual $text -Expected "uploading prune-operational-history.sql to oracle.example"
    Assert-Contains -Actual $text -Expected "executing remote operational-history cleanup with vacuum_mode=vacuum dry_run=False"
    Assert-Contains -Actual $text -Expected "[remote] operational cleanup complete"
    Assert-Contains -Actual $text -Expected "deleted_total=123"

    $scpText = Get-Content -LiteralPath $scpLog -Raw
    Assert-Contains -Actual $scpText -Expected "omnyid-prune-operational-history.sh"
    Assert-Contains -Actual $scpText -Expected "prune-operational-history.sql"

    $sshText = Get-Content -LiteralPath $sshLog -Raw
    Assert-Contains -Actual $sshText -Expected ".env.oracle"
    Assert-Contains -Actual $sshText -Expected "--vacuum-mode 'vacuum'"

    $reportPath = Join-Path $tmpRoot "oracle-prune-operational-history.json"
    if (-not (Test-Path -LiteralPath $reportPath)) {
        throw "[oracle-prune-operational-history-pwsh-selftest] expected report at $reportPath"
    }
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($report.after.deleted_total -ne 123) {
        throw "[oracle-prune-operational-history-pwsh-selftest] expected deleted_total=123 in report"
    }
    if ($report.before.tenant_action_audit_log -ne 20) {
        throw "[oracle-prune-operational-history-pwsh-selftest] expected before tenant_action_audit_log=20 in report"
    }

    $dryRunOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-prune-operational-history.ps1") `
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
        throw "[oracle-prune-operational-history-pwsh-selftest] expected dry-run wrapper script to pass`n$dryRunOutput"
    }
    $sshTextDryRun = Get-Content -LiteralPath $sshLog -Raw
    Assert-Contains -Actual $sshTextDryRun -Expected "--dry-run"

    Write-Output "[oracle-prune-operational-history-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
