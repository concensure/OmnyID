Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-remediate-electric-slot-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-remediate-electric-slot-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null

    $planPath = Join-Path $tmpRoot "cleanup-plan.json"
    @'
{
  "remote_host": "oracle.example",
  "postgres_wal_pressure": {
    "postgres_container_name": "supabase-db",
    "electric_container_name": "omnyid-electric-1",
    "electric_slot_name": "electric_slot_default",
    "safe_limit_recommendation_gib": 2
  }
}
'@ | Set-Content -Path $planPath -Encoding ASCII

    $statePath = Join-Path $tmpRoot "fake-state.json"
    @'
{
  "wal_limit": "-1",
  "slot_present": true
}
'@ | Set-Content -Path $statePath -Encoding ASCII

    $fakeSsh = Join-Path $tmpRoot "fake-ssh.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
$remote = $Args[-1]
$statePath = "__STATE_PATH__"
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json

if ($remote -like "docker restart omnyid-electric-1") {
    "omnyid-electric-1"
    exit 0
}
if ($remote -match "ALTER SYSTEM SET max_slot_wal_keep_size" -and $remote -match "2GB") {
    $state.wal_limit = "2GB"
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding ASCII
    "ALTER SYSTEM`n"
    "pg_reload_conf"
    exit 0
}
if ($remote -match "max_slot_wal_keep_size") {
    [string]$state.wal_limit
    exit 0
}
if ($remote -match "FROM pg_replication_slots") {
    if ([bool]$state.slot_present) {
        "electric_slot_default|logical|f|reserved|21474836480|20 GB|0/14B00000|0/14B00000"
    } else {
        ""
    }
    exit 0
}
if ($remote -match "pg_drop_replication_slot" -and $remote -match "electric_slot_default") {
    $state.slot_present = $false
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding ASCII
    "t"
    exit 0
}
if ($remote -match "CHECKPOINT;") {
    "CHECKPOINT"
    exit 0
}
throw "unexpected remote command: $remote"
'@.Replace("__STATE_PATH__", $statePath.Replace('\', '\\')) | Set-Content -Path $fakeSsh -Encoding ASCII

    $dryRunOutDir = Join-Path $tmpRoot "out-dry-run"
    $dryRunOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-remediate-electric-slot.ps1") `
        -CleanupPlanPath $planPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -SshExe $fakeSsh `
        -OutDir $dryRunOutDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediate-electric-slot-pwsh-selftest] expected dry-run remediation to pass`n$dryRunOutput"
    }
    $dryRunText = $dryRunOutput | Out-String
    Assert-Contains -Actual $dryRunText -Expected "execute=False"
    Assert-Contains -Actual $dryRunText -Expected "restart_electric=True"
    Assert-Contains -Actual $dryRunText -Expected "apply_wal_limit=True"
    Assert-Contains -Actual $dryRunText -Expected "steps=2"

    $dryRunMarkdown = Get-Content (Join-Path $dryRunOutDir "oracle-remediate-electric-slot.md") -Raw
    Assert-Contains -Actual $dryRunMarkdown -Expected "- execute: False"
    Assert-Contains -Actual $dryRunMarkdown -Expected "- wal_limit_gib: 2"
    Assert-Contains -Actual $dryRunMarkdown -Expected "Never delete files from pg_wal manually."
    Assert-Contains -Actual $dryRunMarkdown -Expected "| restart_electric | dry_run | docker restart omnyid-electric-1 |  |"
    Assert-Contains -Actual $dryRunMarkdown -Expected "| limit_slot_wal | dry_run | ALTER SYSTEM SET max_slot_wal_keep_size = '2GB'; SELECT pg_reload_conf(); |  |"

    $stateAfterDryRun = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($stateAfterDryRun.wal_limit -ne "-1" -or -not [bool]$stateAfterDryRun.slot_present) {
        throw "[oracle-remediate-electric-slot-pwsh-selftest] expected dry-run mode to avoid mutating remote state"
    }

    $executeOutDir = Join-Path $tmpRoot "out-execute"
    $executeOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-remediate-electric-slot.ps1") `
        -CleanupPlanPath $planPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -SshExe $fakeSsh `
        -OutDir $executeOutDir `
        -DropSlot `
        -ApplyWalLimit `
        -CheckpointAfterDrop `
        -Execute 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-remediate-electric-slot-pwsh-selftest] expected execute remediation to pass`n$executeOutput"
    }
    $executeText = $executeOutput | Out-String
    Assert-Contains -Actual $executeText -Expected "execute=True"
    Assert-Contains -Actual $executeText -Expected "drop_slot=True"
    Assert-Contains -Actual $executeText -Expected "apply_wal_limit=True"
    Assert-Contains -Actual $executeText -Expected "steps=3"

    $executeMarkdown = Get-Content (Join-Path $executeOutDir "oracle-remediate-electric-slot.md") -Raw
    Assert-Contains -Actual $executeMarkdown -Expected "- drop_slot: True"
    Assert-Contains -Actual $executeMarkdown -Expected "- checkpoint_after_drop: True"
    Assert-Contains -Actual $executeMarkdown -Expected "- max_slot_wal_keep_size: -1"
    Assert-Contains -Actual $executeMarkdown -Expected "- max_slot_wal_keep_size: 2GB"
    Assert-Contains -Actual $executeMarkdown -Expected "| drop_slot | executed | SELECT pg_drop_replication_slot('electric_slot_default'); | t |"
    Assert-Contains -Actual $executeMarkdown -Expected "| checkpoint | executed | CHECKPOINT; | CHECKPOINT |"
    Assert-Contains -Actual $executeMarkdown -Expected "| limit_slot_wal | executed | ALTER SYSTEM SET max_slot_wal_keep_size = '2GB'; SELECT pg_reload_conf(); | ALTER SYSTEM  pg_reload_conf |"

    $report = Get-Content (Join-Path $executeOutDir "oracle-remediate-electric-slot.json") -Raw | ConvertFrom-Json
    if ($report.after.max_slot_wal_keep_size -ne "2GB") {
        throw "[oracle-remediate-electric-slot-pwsh-selftest] expected applied WAL limit to be recorded"
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$report.after.slot_state)) {
        throw "[oracle-remediate-electric-slot-pwsh-selftest] expected dropped slot to be absent after execution"
    }

    Write-Output "[oracle-remediate-electric-slot-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
