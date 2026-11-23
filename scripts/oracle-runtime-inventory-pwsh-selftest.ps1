Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "oracle-runtime-contract.ps1")

$tmpRoot = Join-Path $env:TEMP ("oracle-runtime-inventory-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $fakeSsh = Join-Path $tmpRoot "fake-ssh.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
$remote = $Args[-1]
if ($remote -match '^if \[ -d /var/backups/omnyid \]') {
    "2026-08-24T020000Z|2|12884901888|3"
    exit 0
}
switch ($remote) {
    "docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}'" {
        @"
omnyid-homeserver-1|omnyid-homeserver|Up 6 weeks
supabase-db|supabase/postgres:15.8.1.085|Up 2 weeks (unhealthy)
"@
        exit 0
    }
    "docker volume ls --format '{{.Name}}'" {
        @"
omnyid_postgres-data
coolify-db
"@
        exit 0
    }
    "docker images --format '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}'" {
        @"
omnyid-homeserver|latest|abc123|867MB
supabase/postgres|15.8.1.085|def456|2.92GB
"@
        exit 0
    }
    "docker ps -a --filter volume='omnyid_postgres-data' -q | wc -l" {
        "0"
        exit 0
    }
    "docker ps -a --filter volume='coolify-db' -q | wc -l" {
        "0"
        exit 0
    }
    "docker volume inspect 'omnyid_postgres-data' --format '{{.Mountpoint}}'" {
        "/var/lib/docker/volumes/omnyid_postgres-data/_data"
        exit 0
    }
    "docker volume inspect 'coolify-db' --format '{{.Mountpoint}}'" {
        "/var/lib/docker/volumes/coolify-db/_data"
        exit 0
    }
    "if [ -d '/var/lib/docker/volumes/omnyid_postgres-data/_data' ]; then du -sb '/var/lib/docker/volumes/omnyid_postgres-data/_data' 2>/dev/null | cut -f1; else echo ''; fi" {
        "20238602240"
        exit 0
    }
    "if [ -d '/var/lib/docker/volumes/coolify-db/_data' ]; then du -sb '/var/lib/docker/volumes/coolify-db/_data' 2>/dev/null | cut -f1; else echo ''; fi" {
        "82892800"
        exit 0
    }
    "docker ps -a --filter ancestor='omnyid-homeserver:latest' -q | wc -l" {
        "1"
        exit 0
    }
    "docker ps -a --filter ancestor='supabase/postgres:15.8.1.085' -q | wc -l" {
        "0"
        exit 0
    }
    "df -h --output=target,size,used,avail,pcent / /var" {
        @"
Mounted on     Size Used Avail Use%
/              45G  45G  0     100%
/var           45G  45G  0     100%
"@
        exit 0
    }
    "docker system df" {
        @"
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          2         1         3.79GB    2.92GB (77%)
Containers      2         2         10MB      0B (0%)
Local Volumes   2         0         20.32GB   20.32GB (100%)
Build Cache     0         0         0B        0B
"@
        exit 0
    }
    "journalctl --disk-usage 2>/dev/null" {
        "Archived and active journals take up 512.0M in the file system."
        exit 0
    }
    "if [ -d '/home/ubuntu/supabase' ]; then du -sb '/home/ubuntu/supabase' 2>/dev/null | cut -f1; else echo ''; fi" {
        "2147483648"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-backup.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-backup-verify.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "missing"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-restore.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-restore-drill.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-upgrade.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-migrations-plan.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-prune-daemon-heartbeats.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/oracle-remediate-electric-slot.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/oracle-production-proof.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/oracle-renew-wt-cert.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/runtime-env-entrypoint.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/startup-policy-check.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/startup-policy-check.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/verify-deployment.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/verify-deployment.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "missing"
        exit 0
    }
    default {
        if ($remote -match '_omnyid_synthetic_dupe_counts' -or $remote -match 'maintenance_summary_dupes') {
            "563300|12|8|4|563324"
            exit 0
        }
        if ($remote -match '_omnyid_operational_history_counts' -or $remote -match 'tenant_workflow_trigger_observations') {
            "120|40|80|60|25|35|15|10|5|390"
            exit 0
        }
        if ($remote -match "max_slot_wal_keep_size" -and $remote -match "wal_keep_size") {
            "-1|0"
            exit 0
        }
        if ($remote -match "FROM pg_replication_slots") {
            @"
electric_slot_default|logical|f|reserved|21474836480|20 GB|0/14B00000|0/14B00000|0||2026-08-17T00:00:00Z
"@
            exit 0
        }
        if ($remote -match 'pg_wal') {
            "21474836480"
            exit 0
        }
        throw "unexpected remote command: $remote"
    }
}
'@ | Set-Content -Path $fakeSsh -Encoding ASCII

    $outDir = Join-Path $tmpRoot "out"
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-inventory.ps1") `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -RemoteDir "/home/ubuntu/omnyid" `
        -SshExe $fakeSsh `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected inventory script to pass`n$output"
    }

    $outputText = $output | Out-String
    Assert-Contains -Actual $outputText -Expected "runtime_script_integrity_status=fail"
    Assert-Contains -Actual $outputText -Expected "missing_runtime_scripts=2"
    Assert-Contains -Actual $outputText -Expected "pg_wal_gib=20"
    Assert-Contains -Actual $outputText -Expected "electric_slot_status=inactive_unbounded_wal_retention"
    Assert-Contains -Actual $outputText -Expected "synthetic_message_duplicate_rows=563324"
    Assert-Contains -Actual $outputText -Expected "operational_history_rows=390"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "| /var | 45G | 45G | 0 | 100% |"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "supabase/postgres:15.8.1.085"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "refs_count"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "- runtime_script_integrity_status: fail"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "- pg_wal_gib: 20"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "- synthetic_message_duplicate_rows: 563324"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "## Postgres WAL"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "inactive_unbounded_wal_retention"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "Electric slot 'electric_slot_default' is inactive and retaining 20 GB of WAL while max_slot_wal_keep_size is unlimited."
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "## Synthetic Messages"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "duplicate_snapshot_rows_detected"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "563300"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "563324"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "## Operational History"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "operational_history_rows: 390"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "operational_history_present"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "## Replication Slots"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "electric_slot_default"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "## Ownership Groups"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "shared_host_coolify"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "oracle-runtime-inventory.md") -Raw) -Expected "scripts/verify-deployment.sh"
    $inventory = Get-Content (Join-Path $outDir "oracle-runtime-inventory.json") -Raw | ConvertFrom-Json
    if (@($inventory.runtime_scripts.missing_scripts).Count -ne 2) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected exactly 2 missing runtime scripts"
    }
    $requiredRuntimeScripts = @(Get-OracleRequiredRuntimeScriptPaths)
    if (@($inventory.runtime_scripts.missing_scripts | Where-Object { $_ -notin $requiredRuntimeScripts }).Count -ne 0) {
        throw "[oracle-runtime-inventory-pwsh-selftest] inventory reported a missing script outside the shared runtime contract"
    }
    if ([int]$inventory.counts.candidate_cleanup_items -lt 2) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected at least two cleanup candidates in the baseline inventory"
    }
    if ([double]$inventory.counts.pg_wal_gib -ne 20) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected pg_wal_gib to be recorded"
    }
    if ([int64]$inventory.counts.synthetic_message_duplicate_rows -ne 563324) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected synthetic message duplicate rows to be recorded"
    }
    if ([int64]$inventory.counts.operational_history_rows -ne 390) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected operational history rows to be recorded"
    }
    if ($inventory.postgres_runtime.electric_slot_status -ne "inactive_unbounded_wal_retention") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected inactive unbounded Electric slot status"
    }
    if ($inventory.synthetic_messages.status -ne "duplicate_snapshot_rows_detected") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected duplicate synthetic message status"
    }
    if ([int64]$inventory.synthetic_messages.maintenance_summary_dupes -ne 563300) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected maintenance summary duplicates"
    }
    if ([int64]$inventory.synthetic_messages.total_dupes -ne 563324) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected total synthetic duplicates"
    }
    if ($inventory.operational_history.status -ne "operational_history_present") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected operational history pressure status"
    }
    if ([int64]$inventory.operational_history.total_rows -ne 390) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected total operational history rows"
    }
    if ([double]$inventory.postgres_runtime.electric_slot_retained_wal_gib -ne 20) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected retained Electric slot WAL size"
    }
    $orphanRuntimeVolume = @($inventory.items | Where-Object { $_.item_type -eq "volume" -and $_.name -eq "omnyid_postgres-data" })
    if ($orphanRuntimeVolume.Count -ne 1 -or $orphanRuntimeVolume[0].cleanup_class -ne "review") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected omnyid_postgres-data to remain review-only when unreferenced"
    }
    $supabaseImageCandidate = @($inventory.items | Where-Object { $_.item_type -eq "image" -and $_.name -eq "supabase/postgres:15.8.1.085" -and $_.cleanup_class -eq "candidate_cleanup" })
    if ($supabaseImageCandidate.Count -ne 1) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected the unreferenced Supabase image to remain a cleanup candidate"
    }
    $coolifyOwnership = @($inventory.ownership_groups | Where-Object { $_.ownership_group -eq "shared_host_coolify" })
    if ($coolifyOwnership.Count -ne 1 -or $coolifyOwnership[0].review_count -lt 1) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected shared_host_coolify ownership summary to be present"
    }

    $targetedOutDir = Join-Path $tmpRoot "out-targeted"
    $targetedOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-inventory.ps1") `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -RemoteDir "/home/ubuntu/omnyid" `
        -SshExe $fakeSsh `
        -CandidateOwnershipGroups "shared_host_coolify" `
        -OutDir $targetedOutDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected targeted ownership inventory script to pass`n$targetedOutput"
    }
    $targetedInventory = Get-Content (Join-Path $targetedOutDir "oracle-runtime-inventory.json") -Raw | ConvertFrom-Json
    if ($targetedInventory.classification_mode -ne "targeted_ownership_cleanup_enabled") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected targeted classification mode"
    }
    if (@($targetedInventory.candidate_ownership_groups).Count -ne 1 -or $targetedInventory.candidate_ownership_groups[0] -ne "shared_host_coolify") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected targeted ownership groups to be persisted"
    }
    $coolifyItems = @($targetedInventory.items | Where-Object { $_.ownership_group -eq "shared_host_coolify" })
    if (@($coolifyItems | Where-Object { $_.cleanup_class -eq "candidate_cleanup" }).Count -ne $coolifyItems.Count) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected all targeted coolify items to become cleanup candidates"
    }
    if ([int]$targetedInventory.counts.candidate_cleanup_items -lt $coolifyItems.Count) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected targeted cleanup candidate count to cover every targeted Coolify item"
    }
    $supabaseItems = @($targetedInventory.items | Where-Object { $_.ownership_group -eq "shared_host_supabase" })
    if (@($supabaseItems | Where-Object { $_.cleanup_class -eq "candidate_cleanup" }).Count -ne 1) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected only the unreferenced Supabase image to remain a cleanup candidate"
    }

    $raceSsh = Join-Path $tmpRoot "fake-ssh-volume-race.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
$remote = $Args[-1]
if ($remote -match '^if \[ -d /var/backups/omnyid \]') {
    "|||0"
    exit 0
}
switch ($remote) {
    "docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}'" {
        "omnyid-homeserver-1|omnyid-homeserver|Up 6 weeks"
        exit 0
    }
    "docker volume ls --format '{{.Name}}'" {
        @"
omnyid_postgres-data
orphaned-volume
"@
        exit 0
    }
    "docker images --format '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}'" {
        "omnyid-homeserver|latest|abc123|867MB"
        exit 0
    }
    "docker ps -a --filter volume='omnyid_postgres-data' -q | wc -l" {
        "1"
        exit 0
    }
    "docker ps -a --filter volume='orphaned-volume' -q | wc -l" {
        "0"
        exit 0
    }
    "docker volume inspect 'omnyid_postgres-data' --format '{{.Mountpoint}}'" {
        "/var/lib/docker/volumes/omnyid_postgres-data/_data"
        exit 0
    }
    "docker volume inspect 'orphaned-volume' --format '{{.Mountpoint}}'" {
        Write-Error "Error response from daemon: get deadbeef: no such volume"
        exit 1
    }
    "if [ -d '/var/lib/docker/volumes/omnyid_postgres-data/_data' ]; then du -sb '/var/lib/docker/volumes/omnyid_postgres-data/_data' 2>/dev/null | cut -f1; else echo ''; fi" {
        "20238602240"
        exit 0
    }
    "docker ps -a --filter ancestor='omnyid-homeserver:latest' -q | wc -l" {
        "1"
        exit 0
    }
    "df -h --output=target,size,used,avail,pcent / /var" {
        @"
Mounted on     Size Used Avail Use%
/              45G  40G  5G    89%
/var           45G  40G  5G    89%
"@
        exit 0
    }
    "docker system df" {
        @"
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          1         1         867MB     0B (0%)
Containers      1         1         10MB      0B (0%)
Local Volumes   2         1         18.85GB   0B (0%)
Build Cache     0         0         0B        0B
"@
        exit 0
    }
    "journalctl --disk-usage 2>/dev/null" {
        ""
        exit 0
    }
    "if [ -d '/home/ubuntu/supabase' ]; then du -sb '/home/ubuntu/supabase' 2>/dev/null | cut -f1; else echo ''; fi" {
        ""
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-backup.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-backup-verify.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-restore.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-restore-drill.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-upgrade.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-migrations-plan.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/omnyid-prune-daemon-heartbeats.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/oracle-remediate-electric-slot.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/oracle-production-proof.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/oracle-renew-wt-cert.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/runtime-env-entrypoint.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/startup-policy-check.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/startup-policy-check.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/verify-deployment.ps1' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    "if [ -f '/home/ubuntu/omnyid/scripts/verify-deployment.sh' ]; then echo 'present'; else echo 'missing'; fi" {
        "present"
        exit 0
    }
    default {
        throw "unexpected remote command: $remote"
    }
}
'@ | Set-Content -Path $raceSsh -Encoding ASCII

    $raceOutDir = Join-Path $tmpRoot "out-volume-race"
    $raceOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-inventory.ps1") `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -RemoteDir "/home/ubuntu/omnyid" `
        -SshExe $raceSsh `
        -OutDir $raceOutDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected disappearing-volume inventory script to pass`n$raceOutput"
    }
    $raceInventory = Get-Content (Join-Path $raceOutDir "oracle-runtime-inventory.json") -Raw | ConvertFrom-Json
    $orphanedVolume = @($raceInventory.items | Where-Object { $_.item_type -eq "volume" -and $_.name -eq "orphaned-volume" })
    if ($orphanedVolume.Count -ne 1) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected orphaned-volume row in race inventory"
    }
    if ($orphanedVolume[0].cleanup_class -ne "review") {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected disappearing volume to degrade to review classification"
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$orphanedVolume[0].size)) {
        throw "[oracle-runtime-inventory-pwsh-selftest] expected disappearing volume to have no size measurement"
    }

    Write-Output "[oracle-runtime-inventory-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
