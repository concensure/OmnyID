param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$RemoteDir = "",
    [string]$OutDir = "",
    [switch]$AllowSharedHostCandidateCleanup,
    [string[]]$CandidateOwnershipGroups = @(),
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

$requiredRuntimeScripts = Get-OracleRequiredRuntimeScriptPaths
$normalizedCandidateOwnershipGroups = @(
    $CandidateOwnershipGroups |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_.Trim().ToLowerInvariant() } |
        Select-Object -Unique
)

function Invoke-OracleInventoryCommand {
    param([string]$RemoteCommand)

    $sshArgs = @()
    if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
        $sshArgs += @("-i", $KeyPath)
    }
    $sshArgs += @("$User@$RemoteHost", $RemoteCommand)
    $result = (& $SshExe @SshPrefixArgs @sshArgs | Out-String).Trim()
    if (-not $?) {
        throw "[oracle-runtime-inventory] remote command failed: $RemoteCommand"
    }
    return $result
}

function Convert-ToShellSingleQuotedLiteral {
    param([string]$Value)

    if ($null -eq $Value) {
        $Value = ""
    }

    return "'" + ($Value -replace "'", "'\''") + "'"
}

function Get-CleanupClass {
    param(
        [string]$ItemType = "",
        [string]$Name,
        [string]$Image = "",
        [string]$OwnershipGroup = "",
        [int]$ReferenceCount = -1,
        [bool]$AllowSharedHostCleanup = $false,
        [string[]]$CandidateOwnershipGroups = @()
    )

    $value = ("$Name|$Image").ToLowerInvariant()
    $isRuntime = $value -match '(^|[|_-])omnyid' -or $value -match 'electricsql/electric' -or $value -match 'pgvector/pgvector' -or $value -match 'chrislusf/seaweedfs' -or $value -match '^caddy[:|]'
    $isSharedHost = $value -match 'supabase' -or $value -match 'coolify' -or $value -match '^n8n' -or $value -match 'conway'
    $isTargetedOwnershipCandidate = -not [string]::IsNullOrWhiteSpace($OwnershipGroup) -and $OwnershipGroup.ToLowerInvariant() -in $CandidateOwnershipGroups

    if ($ItemType -eq "image" -and $ReferenceCount -eq 0) {
        if ($isTargetedOwnershipCandidate -and -not $isRuntime) {
            return "candidate_cleanup"
        }
        return "candidate_cleanup"
    }

    if ($ItemType -eq "volume" -and $ReferenceCount -eq 0) {
        if ($isRuntime) {
            return "review"
        }
        if ($isTargetedOwnershipCandidate) {
            return "candidate_cleanup"
        }
        if ($isSharedHost) {
            if ($AllowSharedHostCleanup) {
                return "candidate_cleanup"
            }
            return "review"
        }
        return "candidate_cleanup"
    }

    if ($value -match '(^|[|_-])omnyid' -or $value -match 'electricsql/electric' -or $value -match 'pgvector/pgvector' -or $value -match 'chrislusf/seaweedfs' -or $value -match '^caddy[:|]') {
        return "keep_runtime"
    }
    if ($isTargetedOwnershipCandidate) {
        return "candidate_cleanup"
    }
    if ($value -match 'supabase' -or $value -match 'coolify' -or $value -match '^n8n' -or $value -match 'conway') {
        if ($AllowSharedHostCleanup) {
            return "candidate_cleanup"
        }
        return "review"
    }
    return "review"
}

function Get-OwnershipGroup {
    param(
        [string]$Name = "",
        [string]$Image = ""
    )

    $value = ("$Name|$Image").ToLowerInvariant()
    if ($value -match '(^|[|_-])omnyid' -or $value -match 'electricsql/electric' -or $value -match 'pgvector/pgvector' -or $value -match 'chrislusf/seaweedfs' -or $value -match '^caddy[:|]') {
        return "omnyid_runtime"
    }
    if ($value -match 'supabase' -or $value -match 'conway') {
        return "shared_host_supabase"
    }
    if ($value -match 'coolify') {
        return "shared_host_coolify"
    }
    if ($value -match '^n8n') {
        return "shared_host_n8n"
    }
    return "other_review"
}

function Convert-SizeToGiB {
    param([string]$Size)

    if ([string]::IsNullOrWhiteSpace($Size)) {
        return $null
    }

    $trimmed = $Size.Trim()
    $match = [regex]::Match($trimmed, '^(?<value>[0-9]+(?:\.[0-9]+)?)\s*(?<unit>[KMGTP]?B)$')
    if (-not $match.Success) {
        return $null
    }

    $value = [double]$match.Groups["value"].Value
    switch ($match.Groups["unit"].Value.ToUpperInvariant()) {
        "KB" { return [math]::Round($value / 1MB, 6) }
        "MB" { return [math]::Round($value / 1KB, 6) }
        "GB" { return [math]::Round($value, 6) }
        "TB" { return [math]::Round($value * 1024, 6) }
        default { return 0 }
    }
}

function Parse-Lines {
    param(
        [string]$Text,
        [string[]]$Columns
    )

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($line in ($Text -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        $parts = $line.Split('|')
        $row = [ordered]@{}
        for ($index = 0; $index -lt $Columns.Count; $index++) {
            $row[$Columns[$index]] = if ($index -lt $parts.Length) { $parts[$index].Trim() } else { "" }
        }
        $rows.Add([pscustomobject]$row)
    }
    return $rows
}

function Parse-WhitespaceTable {
    param(
        [string]$Text,
        [string[]]$Columns
    )

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($line in ($Text -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }

        if ($trimmed -match '^(Mounted\s+on|Filesystem)\b') {
            continue
        }

        $parts = @($trimmed -split '\s+')
        if ($parts.Count -lt $Columns.Count) {
            continue
        }

        $row = [ordered]@{}
        $firstColumnCount = $parts.Count - ($Columns.Count - 1)
        $row[$Columns[0]] = (($parts[0..($firstColumnCount - 1)]) -join ' ').Trim()
        for ($index = 1; $index -lt $Columns.Count; $index++) {
            $row[$Columns[$index]] = $parts[$firstColumnCount + $index - 1]
        }
        $rows.Add([pscustomobject]$row)
    }
    return $rows
}

function Parse-DockerSystemDfSummary {
    param([string]$Text)

    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($line in ($Text -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }

        if ($trimmed -match '^(TYPE|Type)\b') {
            continue
        }

        $match = [regex]::Match($trimmed, '^(?<type>.+?)\s{2,}(?<total>\S+)\s+(?<active>\S+)\s+(?<size>\S+)\s+(?<reclaimable>\S+)(?:\s+\((?<pct>\d+%)\))?$')
        if (-not $match.Success) {
            continue
        }
        $rows.Add([pscustomobject]@{
            type = $match.Groups["type"].Value.Trim()
            total = $match.Groups["total"].Value
            active = $match.Groups["active"].Value
            size = $match.Groups["size"].Value
            reclaimable = $match.Groups["reclaimable"].Value
            reclaimable_pct = $match.Groups["pct"].Value
            size_gib = Convert-SizeToGiB -Size $match.Groups["size"].Value
            reclaimable_gib = Convert-SizeToGiB -Size $match.Groups["reclaimable"].Value
        })
    }
    return @($rows.ToArray())
}

function Get-RuntimeScriptInventory {
    param(
        [string]$RuntimeDir,
        [string[]]$RequiredScripts
    )

    if ([string]::IsNullOrWhiteSpace($RuntimeDir)) {
        return [pscustomobject]@{
            status = "unknown"
            detail = "remote runtime directory is not configured"
            missing_scripts = @()
        }
    }

    $missingScripts = New-Object System.Collections.Generic.List[string]
    foreach ($requiredScript in $RequiredScripts) {
        $fullPath = ($RuntimeDir.TrimEnd('/') + '/' + $requiredScript.TrimStart('/')).Replace("'", "'\''")
        $raw = Invoke-OracleInventoryCommand -RemoteCommand "if [ -f '$fullPath' ]; then echo 'present'; else echo 'missing'; fi"
        if (($raw | Out-String).Trim() -ne "present") {
            $missingScripts.Add($requiredScript)
        }
    }

    $missingScriptsArray = @($missingScripts.ToArray())
    $status = if ($missingScriptsArray.Count -gt 0) { "fail" } else { "pass" }
    $detail = if ($missingScriptsArray.Count -gt 0) {
        "remote runtime is missing required scripts: " + ($missingScriptsArray -join ',')
    } else {
        "required runtime scripts are present"
    }

    return [pscustomobject]@{
        status = $status
        detail = $detail
        missing_scripts = $missingScriptsArray
    }
}

function Get-DockerReferenceCount {
    param(
        [ValidateSet("volume", "ancestor")]
        [string]$FilterType,
        [string]$FilterValue
    )

    $quotedValue = $FilterValue.Replace("'", "'\''")
    $raw = Invoke-OracleInventoryCommand -RemoteCommand "docker ps -a --filter $FilterType='$quotedValue' -q | wc -l"
    $trimmed = ($raw | Out-String).Trim()
    if ($trimmed -match '^\d+$') {
        return [int]$trimmed
    }
    return 0
}

function Get-RemoteDirectorySizeBytes {
    param([string]$Path)

    $quotedPath = $Path.Replace("'", "'\''")
    $raw = Invoke-OracleInventoryCommand -RemoteCommand "if [ -d '$quotedPath' ]; then du -sb '$quotedPath' 2>/dev/null | cut -f1; else echo ''; fi"
    $trimmed = ($raw | Out-String).Trim()
    if ($trimmed -match '^\d+$') {
        return [int64]$trimmed
    }
    return $null
}

function Get-DockerVolumeMountpoint {
    param([string]$VolumeName)

    $quotedVolumeName = $VolumeName.Replace("'", "'\''")
    try {
        $mountpoint = Invoke-OracleInventoryCommand -RemoteCommand ("docker volume inspect '{0}' --format '{{{{.Mountpoint}}}}'" -f $quotedVolumeName)
        return ($mountpoint | Out-String).Trim()
    }
    catch {
        $message = ($_ | Out-String)
        if ($message -match '(?i)no such volume') {
            return $null
        }
        throw
    }
}

function Convert-BytesToGiB {
    param(
        [AllowNull()]
        [double]$Bytes
    )

    if ($null -eq $Bytes) {
        return $null
    }

    return [math]::Round(($Bytes / 1GB), 6)
}

function Get-JournalDiskUsageBytes {
    $raw = Invoke-OracleInventoryCommand -RemoteCommand "journalctl --disk-usage 2>/dev/null"
    $text = ($raw | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }

    $match = [regex]::Match($text, '(?<value>\d+(?:\.\d+)?)\s*(?<unit>[KMGTP])')
    if (-not $match.Success) {
        return $null
    }

    $value = [double]$match.Groups["value"].Value
    switch ($match.Groups["unit"].Value.ToUpperInvariant()) {
        "K" { return [double]($value * 1KB) }
        "M" { return [double]($value * 1MB) }
        "G" { return [double]($value * 1GB) }
        "T" { return [double]($value * 1TB) }
        "P" { return [double]($value * 1PB) }
        default { return $null }
    }
}

function Get-FirstMatchingContainerName {
    param(
        [object[]]$Containers,
        [string]$NamePattern = "",
        [string]$ImagePattern = ""
    )

    $matches = @(
        $Containers |
            Where-Object {
                $name = [string]$_.name
                $image = [string]$_.image
                (
                    [string]::IsNullOrWhiteSpace($NamePattern) -or
                    $name -match $NamePattern
                ) -or (
                    [string]::IsNullOrWhiteSpace($ImagePattern) -or
                    $image -match $ImagePattern
                )
            } |
            Select-Object -First 1
    )

    if ($matches.Count -gt 0) {
        return [string]$matches[0].name
    }

    return $null
}

function Invoke-PostgresSqlCommand {
    param(
        [string]$ContainerName,
        [string]$Sql
    )

    if ([string]::IsNullOrWhiteSpace($ContainerName)) {
        return ""
    }

    $innerCommand =
        'psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-afp}" -d "${POSTGRES_DB:-afp}" -At -F "|" -c ' +
        (Convert-ToShellSingleQuotedLiteral $Sql)
    $remoteCommand =
        "docker exec " +
        (Convert-ToShellSingleQuotedLiteral $ContainerName) +
        " sh -lc " +
        (Convert-ToShellSingleQuotedLiteral $innerCommand)
    return Invoke-OracleInventoryCommand -RemoteCommand $remoteCommand
}

function Get-RemotePgWalBytes {
    param([string]$ContainerName)

    if ([string]::IsNullOrWhiteSpace($ContainerName)) {
        return $null
    }

    $innerCommand = 'wal_dir="${PGDATA:-/var/lib/postgresql/data}/pg_wal"; if [ -d "$wal_dir" ]; then du -sb "$wal_dir" 2>/dev/null | cut -f1; else echo ""; fi'
    $remoteCommand =
        "docker exec " +
        (Convert-ToShellSingleQuotedLiteral $ContainerName) +
        " sh -lc " +
        (Convert-ToShellSingleQuotedLiteral $innerCommand)
    $raw = Invoke-OracleInventoryCommand -RemoteCommand $remoteCommand
    $trimmed = ($raw | Out-String).Trim()
    if ($trimmed -match '^\d+$') {
        return [int64]$trimmed
    }
    return $null
}

function Get-PostgresReplicationState {
    param(
        [string]$PostgresContainerName,
        [string]$ElectricContainerName
    )

    if ([string]::IsNullOrWhiteSpace($PostgresContainerName)) {
        return [pscustomobject]@{
            postgres_container_name = $null
            electric_container_name = $ElectricContainerName
            pg_wal_bytes = $null
            pg_wal_gib = $null
            max_slot_wal_keep_size = $null
            wal_keep_size = $null
            inactive_slot_count = 0
            replication_slots = @()
            electric_slot_status = "postgres_container_not_found"
            electric_slot_summary = "Postgres container was not found, so WAL slot state could not be inspected."
            electric_slot_name = $null
            electric_slot_active = $null
            electric_slot_retained_wal_bytes = $null
            electric_slot_retained_wal_gib = $null
            electric_slot_restart_lsn = $null
            electric_slot_confirmed_flush_lsn = $null
        }
    }

    $settingRow = Invoke-PostgresSqlCommand -ContainerName $PostgresContainerName -Sql "SELECT current_setting('max_slot_wal_keep_size'), current_setting('wal_keep_size');"
    $settingParts = @(($settingRow | Out-String).Trim().Split('|'))
    $maxSlotWalKeepSize = if ($settingParts.Count -gt 0) { $settingParts[0].Trim() } else { $null }
    $walKeepSize = if ($settingParts.Count -gt 1) { $settingParts[1].Trim() } else { $null }

    $slotSql = @"
SELECT
    slot_name,
    slot_type,
    active,
    COALESCE(wal_status, ''),
    COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::bigint, 0),
    COALESCE(pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)), '0 bytes'),
    COALESCE(restart_lsn::text, ''),
    COALESCE(confirmed_flush_lsn::text, ''),
    COALESCE(safe_wal_size::bigint, 0),
    COALESCE(pg_size_pretty(safe_wal_size), ''),
    COALESCE(to_char(inactive_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')
FROM pg_replication_slots
ORDER BY slot_name;
"@
    $slotRows = @(
        Parse-Lines -Text (Invoke-PostgresSqlCommand -ContainerName $PostgresContainerName -Sql $slotSql) -Columns @(
            "slot_name",
            "slot_type",
            "active",
            "wal_status",
            "retained_wal_bytes",
            "retained_wal_pretty",
            "restart_lsn",
            "confirmed_flush_lsn",
            "safe_wal_size_bytes",
            "safe_wal_size_pretty",
            "inactive_since"
        ) |
            ForEach-Object {
                [pscustomobject]@{
                    slot_name = [string]$_.slot_name
                    slot_type = [string]$_.slot_type
                    active = ([string]$_.active).ToLowerInvariant() -eq "t"
                    wal_status = [string]$_.wal_status
                    retained_wal_bytes = if ([string]$_.retained_wal_bytes -match '^-?\d+$') { [int64]$_.retained_wal_bytes } else { 0 }
                    retained_wal_pretty = [string]$_.retained_wal_pretty
                    retained_wal_gib = if ([string]$_.retained_wal_bytes -match '^-?\d+$') { Convert-BytesToGiB -Bytes ([double][int64]$_.retained_wal_bytes) } else { $null }
                    restart_lsn = [string]$_.restart_lsn
                    confirmed_flush_lsn = [string]$_.confirmed_flush_lsn
                    safe_wal_size_bytes = if ([string]$_.safe_wal_size_bytes -match '^-?\d+$') { [int64]$_.safe_wal_size_bytes } else { 0 }
                    safe_wal_size_pretty = [string]$_.safe_wal_size_pretty
                    inactive_since = [string]$_.inactive_since
                }
            }
    )

    $pgWalBytes = Get-RemotePgWalBytes -ContainerName $PostgresContainerName
    $electricSlot = @($slotRows | Where-Object { $_.slot_name -like "electric_slot*" } | Select-Object -First 1)
    $electricSlotStatus = "not_present"
    $electricSlotSummary = "No Electric replication slot was found in Postgres."
    if ($electricSlot.Count -gt 0) {
        $slot = $electricSlot[0]
        $limitUnset = [string]::IsNullOrWhiteSpace($maxSlotWalKeepSize) -or $maxSlotWalKeepSize -eq "-1"
        if (-not $slot.active -and $slot.retained_wal_bytes -gt 0) {
            if ($limitUnset) {
                $electricSlotStatus = "inactive_unbounded_wal_retention"
                $electricSlotSummary = "Electric slot '$($slot.slot_name)' is inactive and retaining $($slot.retained_wal_pretty) of WAL while max_slot_wal_keep_size is unlimited."
            } else {
                $electricSlotStatus = "inactive_wal_retention"
                $electricSlotSummary = "Electric slot '$($slot.slot_name)' is inactive and retaining $($slot.retained_wal_pretty) of WAL."
            }
        } elseif ($slot.active) {
            $electricSlotStatus = "active"
            $electricSlotSummary = "Electric slot '$($slot.slot_name)' is active and currently retaining $($slot.retained_wal_pretty) of WAL."
        } else {
            $electricSlotStatus = "inactive_no_retention"
            $electricSlotSummary = "Electric slot '$($slot.slot_name)' is inactive but not currently retaining measurable WAL."
        }
    }

    return [pscustomobject]@{
        postgres_container_name = $PostgresContainerName
        electric_container_name = $ElectricContainerName
        pg_wal_bytes = $pgWalBytes
        pg_wal_gib = Convert-BytesToGiB -Bytes $pgWalBytes
        max_slot_wal_keep_size = $maxSlotWalKeepSize
        wal_keep_size = $walKeepSize
        inactive_slot_count = @($slotRows | Where-Object { -not $_.active }).Count
        replication_slots = $slotRows
        electric_slot_status = $electricSlotStatus
        electric_slot_summary = $electricSlotSummary
        electric_slot_name = if ($electricSlot.Count -gt 0) { [string]$electricSlot[0].slot_name } else { $null }
        electric_slot_active = if ($electricSlot.Count -gt 0) { [bool]$electricSlot[0].active } else { $null }
        electric_slot_retained_wal_bytes = if ($electricSlot.Count -gt 0) { [int64]$electricSlot[0].retained_wal_bytes } else { $null }
        electric_slot_retained_wal_gib = if ($electricSlot.Count -gt 0) { $electricSlot[0].retained_wal_gib } else { $null }
        electric_slot_restart_lsn = if ($electricSlot.Count -gt 0) { [string]$electricSlot[0].restart_lsn } else { $null }
        electric_slot_confirmed_flush_lsn = if ($electricSlot.Count -gt 0) { [string]$electricSlot[0].confirmed_flush_lsn } else { $null }
    }
}

function Get-OlderOmnyIdBackupSummary {
    $command = 'if [ -d /var/backups/omnyid ]; then latest=$(find /var/backups/omnyid -mindepth 1 -maxdepth 1 -type d -printf ''%f\n'' | sort | tail -n 1); older_count=$(find /var/backups/omnyid -mindepth 1 -maxdepth 1 -type d ! -name "$latest" | wc -l); older_bytes=$(find /var/backups/omnyid -mindepth 1 -maxdepth 1 -type d ! -name "$latest" -exec du -sb {} + 2>/dev/null | awk ''{s+=$1} END {print s+0}''); total_count=$(find /var/backups/omnyid -mindepth 1 -maxdepth 1 -type d | wc -l); printf ''%s|%s|%s|%s\n'' "$latest" "$older_count" "$older_bytes" "$total_count"; else printf ''%s\n'' ''|||0''; fi'
    $raw = Invoke-OracleInventoryCommand -RemoteCommand $command
    $parts = @(($raw | Out-String).Trim().Split('|'))
    if ($parts.Count -lt 4) {
        return $null
    }

    $latest = $parts[0]
    $olderCount = if ($parts[1] -match '^\d+$') { [int]$parts[1] } else { 0 }
    $olderBytes = if ($parts[2] -match '^\d+$') { [double]$parts[2] } else { 0 }
    $totalCount = if ($parts[3] -match '^\d+$') { [int]$parts[3] } else { 0 }

    return [pscustomobject]@{
        latest_generation = $latest
        older_generation_count = $olderCount
        older_generation_bytes = $olderBytes
        total_generation_count = $totalCount
    }
}

function Get-SyntheticMessageDuplicateState {
    param(
        [string]$PostgresContainerName
    )

    if ([string]::IsNullOrWhiteSpace($PostgresContainerName)) {
        return [pscustomobject]@{
            status = "unavailable"
            summary = "Synthetic message duplicate state could not be inspected because the Postgres container was not detected."
            maintenance_summary_dupes = 0
            curator_card_dupes = 0
            curator_backlink_dupes = 0
            ingestion_topology_dupes = 0
            total_dupes = 0
            prune_command = "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
        }
    }

    $sql = @'
CREATE TEMP TABLE _omnyid_synthetic_dupe_counts (
    maintenance_summary_dupes bigint,
    curator_card_dupes bigint,
    curator_backlink_dupes bigint,
    ingestion_topology_dupes bigint
) ON COMMIT DROP;
DO $$
DECLARE
    schema_name text;
BEGIN
    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        EXECUTE format(
            $fmt$
            INSERT INTO _omnyid_synthetic_dupe_counts
            SELECT
                GREATEST(COUNT(*) FILTER (
                    WHERE type = 'insight'
                      AND subtype = 'maintenance_summary'
                      AND from_agent = 'omnyid://daemon/health-maintenance'
                ) - 1, 0),
                GREATEST(COUNT(*) FILTER (
                    WHERE type = 'knowledge_card'
                      AND from_agent = 'omnyid://daemon/knowledge-curator'
                ) - 1, 0),
                GREATEST(COUNT(*) FILTER (
                    WHERE type = 'knowledge_link'
                      AND from_agent = 'omnyid://daemon/knowledge-curator'
                ) - 1, 0),
                GREATEST(COUNT(*) FILTER (
                    WHERE type = 'relation_link'
                      AND from_agent = 'omnyid://daemon/ledger-ingestion'
                ) - 1, 0)
            FROM %I.messages
            $fmt$,
            schema_name
        );
    END LOOP;
END $$;
SELECT
    COALESCE(SUM(maintenance_summary_dupes), 0)::text || '|' ||
    COALESCE(SUM(curator_card_dupes), 0)::text || '|' ||
    COALESCE(SUM(curator_backlink_dupes), 0)::text || '|' ||
    COALESCE(SUM(ingestion_topology_dupes), 0)::text || '|' ||
    (
        COALESCE(SUM(maintenance_summary_dupes), 0) +
        COALESCE(SUM(curator_card_dupes), 0) +
        COALESCE(SUM(curator_backlink_dupes), 0) +
        COALESCE(SUM(ingestion_topology_dupes), 0)
    )::text
FROM _omnyid_synthetic_dupe_counts;
'@

    $bashBody = @"
set -euo pipefail
cd $(Convert-ToShellSingleQuotedLiteral -Value $RemoteDir)
if [ ! -f ./.env.oracle ]; then
  echo '0|0|0|0|0'
  exit 0
fi
set -a
. ./.env.oracle
set +a
docker exec $PostgresContainerName psql -At -v ON_ERROR_STOP=1 -U `"`${POSTGRES_USER}`" -d `"`${POSTGRES_DB}`" <<'SQL'
$sql
SQL
"@
    $raw = Invoke-OracleInventoryCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral -Value $bashBody))
    $parts = @(($raw | Out-String).Trim().Split('|'))
    if ($parts.Count -lt 5) {
        return [pscustomobject]@{
            status = "unavailable"
            summary = "Synthetic message duplicate state query returned an unexpected shape."
            maintenance_summary_dupes = 0
            curator_card_dupes = 0
            curator_backlink_dupes = 0
            ingestion_topology_dupes = 0
            total_dupes = 0
            prune_command = "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
        }
    }

    $maintenanceSummaryDupes = if ($parts[0] -match '^\d+$') { [int64]$parts[0] } else { 0 }
    $curatorCardDupes = if ($parts[1] -match '^\d+$') { [int64]$parts[1] } else { 0 }
    $curatorBacklinkDupes = if ($parts[2] -match '^\d+$') { [int64]$parts[2] } else { 0 }
    $ingestionTopologyDupes = if ($parts[3] -match '^\d+$') { [int64]$parts[3] } else { 0 }
    $totalDupes = if ($parts[4] -match '^\d+$') { [int64]$parts[4] } else { 0 }
    $status = if ($totalDupes -gt 0) { "duplicate_snapshot_rows_detected" } else { "bounded" }
    $summary =
        if ($totalDupes -gt 0) {
            "Synthetic snapshot-like messages have accumulated duplicate rows across tenant schemas (maintenance_summary=$maintenanceSummaryDupes, curator_card=$curatorCardDupes, curator_backlink=$curatorBacklinkDupes, ingestion_topology=$ingestionTopologyDupes; total=$totalDupes). Prune historical duplicates and keep these writers bounded to one current row per selector."
        } else {
            "Synthetic snapshot-like messages appear bounded to one current row per selector."
        }

    return [pscustomobject]@{
        status = $status
        summary = $summary
        maintenance_summary_dupes = $maintenanceSummaryDupes
        curator_card_dupes = $curatorCardDupes
        curator_backlink_dupes = $curatorBacklinkDupes
        ingestion_topology_dupes = $ingestionTopologyDupes
        total_dupes = $totalDupes
        prune_command = "./scripts/oracle-prune-synthetic-message-spam.ps1 -VacuumMode analyze"
    }
}

function Get-OperationalHistoryState {
    param(
        [string]$PostgresContainerName
    )

    $defaultPruneCommand = "./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze"
    if ([string]::IsNullOrWhiteSpace($PostgresContainerName)) {
        return [pscustomobject]@{
            status = "unavailable"
            summary = "Operational history state could not be inspected because the Postgres container was not detected."
            daemon_operational_afp = 0
            training_reflection_traces = 0
            proactive_token_usage = 0
            user_external_tool_usage_events = 0
            tenant_action_audit_log = 0
            tenant_llm_usage_log = 0
            tenant_workflow_trigger_observations = 0
            proactive_suggestions = 0
            trigger_replay_nonces = 0
            total_rows = 0
            prune_command = $defaultPruneCommand
        }
    }

    $sql = @'
CREATE TEMP TABLE _omnyid_operational_history_counts (
    tenant_action_audit_log bigint,
    tenant_llm_usage_log bigint,
    tenant_workflow_trigger_observations bigint
) ON COMMIT DROP;
DO $$
DECLARE
    schema_name text;
BEGIN
    FOR schema_name IN
        SELECT nspname
        FROM pg_namespace
        WHERE nspname LIKE 'user\_%' ESCAPE '\'
    LOOP
        EXECUTE format(
            $fmt$
            INSERT INTO _omnyid_operational_history_counts
            SELECT
                COALESCE((SELECT COUNT(*) FROM %I.action_audit_log), 0),
                COALESCE((SELECT COUNT(*) FROM %I.llm_usage_log), 0),
                COALESCE((SELECT COUNT(*) FROM %I.workflow_trigger_observations), 0)
            $fmt$,
            schema_name,
            schema_name,
            schema_name
        );
    END LOOP;
END $$;
WITH daemon_counts AS (
    SELECT
        COUNT(*) FILTER (
            WHERE type IN (
                'watcher_resolution_event',
                'synthesis_invalidation_event',
                'reflection_trace',
                'minimal_context_packet',
                'proactive_trigger',
                'token_budget_log'
            )
        ) AS daemon_operational_afp,
        COUNT(*) FILTER (WHERE type = 'trigger_replay_nonce') AS trigger_replay_nonces
    FROM public.afp_messages
),
tenant_counts AS (
    SELECT
        COALESCE(SUM(tenant_action_audit_log), 0) AS tenant_action_audit_log,
        COALESCE(SUM(tenant_llm_usage_log), 0) AS tenant_llm_usage_log,
        COALESCE(SUM(tenant_workflow_trigger_observations), 0) AS tenant_workflow_trigger_observations
    FROM _omnyid_operational_history_counts
)
SELECT
    daemon_counts.daemon_operational_afp::text || '|' ||
    COALESCE((SELECT COUNT(*) FROM public.training_reflection_traces), 0)::text || '|' ||
    COALESCE((SELECT COUNT(*) FROM public.proactive_token_usage), 0)::text || '|' ||
    COALESCE((SELECT COUNT(*) FROM public.user_external_tool_usage_events), 0)::text || '|' ||
    tenant_counts.tenant_action_audit_log::text || '|' ||
    tenant_counts.tenant_llm_usage_log::text || '|' ||
    tenant_counts.tenant_workflow_trigger_observations::text || '|' ||
    COALESCE((SELECT COUNT(*) FROM public.proactive_suggestions), 0)::text || '|' ||
    COALESCE((SELECT COUNT(*) FROM public.trigger_replay_nonces), 0)::text || '|' ||
    (
        daemon_counts.daemon_operational_afp +
        COALESCE((SELECT COUNT(*) FROM public.training_reflection_traces), 0) +
        COALESCE((SELECT COUNT(*) FROM public.proactive_token_usage), 0) +
        COALESCE((SELECT COUNT(*) FROM public.user_external_tool_usage_events), 0) +
        tenant_counts.tenant_action_audit_log +
        tenant_counts.tenant_llm_usage_log +
        tenant_counts.tenant_workflow_trigger_observations +
        COALESCE((SELECT COUNT(*) FROM public.proactive_suggestions), 0) +
        COALESCE((SELECT COUNT(*) FROM public.trigger_replay_nonces), 0)
    )::text
FROM daemon_counts
CROSS JOIN tenant_counts;
'@

    $bashBody = @"
set -euo pipefail
cd $(Convert-ToShellSingleQuotedLiteral -Value $RemoteDir)
if [ ! -f ./.env.oracle ]; then
  echo '0|0|0|0|0|0|0|0|0|0'
  exit 0
fi
set -a
. ./.env.oracle
set +a
docker exec $PostgresContainerName psql -At -v ON_ERROR_STOP=1 -U `"`${POSTGRES_USER}`" -d `"`${POSTGRES_DB}`" <<'SQL'
$sql
SQL
"@
    $raw = Invoke-OracleInventoryCommand -RemoteCommand ("bash -lc " + (Convert-ToShellSingleQuotedLiteral -Value $bashBody))
    $parts = @(($raw | Out-String).Trim().Split('|'))
    if ($parts.Count -lt 10) {
        return [pscustomobject]@{
            status = "unavailable"
            summary = "Operational history state query returned an unexpected shape."
            daemon_operational_afp = 0
            training_reflection_traces = 0
            proactive_token_usage = 0
            user_external_tool_usage_events = 0
            tenant_action_audit_log = 0
            tenant_llm_usage_log = 0
            tenant_workflow_trigger_observations = 0
            proactive_suggestions = 0
            trigger_replay_nonces = 0
            total_rows = 0
            prune_command = $defaultPruneCommand
        }
    }

    $daemonOperationalAfp = if ($parts[0] -match '^\d+$') { [int64]$parts[0] } else { 0 }
    $trainingReflectionTraces = if ($parts[1] -match '^\d+$') { [int64]$parts[1] } else { 0 }
    $proactiveTokenUsage = if ($parts[2] -match '^\d+$') { [int64]$parts[2] } else { 0 }
    $userExternalToolUsageEvents = if ($parts[3] -match '^\d+$') { [int64]$parts[3] } else { 0 }
    $tenantActionAuditLog = if ($parts[4] -match '^\d+$') { [int64]$parts[4] } else { 0 }
    $tenantLlmUsageLog = if ($parts[5] -match '^\d+$') { [int64]$parts[5] } else { 0 }
    $tenantWorkflowTriggerObservations = if ($parts[6] -match '^\d+$') { [int64]$parts[6] } else { 0 }
    $proactiveSuggestions = if ($parts[7] -match '^\d+$') { [int64]$parts[7] } else { 0 }
    $triggerReplayNonces = if ($parts[8] -match '^\d+$') { [int64]$parts[8] } else { 0 }
    $totalRows = if ($parts[9] -match '^\d+$') { [int64]$parts[9] } else { 0 }
    $status = if ($totalRows -gt 0) { "operational_history_present" } else { "bounded" }
    $summary =
        if ($totalRows -gt 0) {
            "Bounded operational-history tables currently hold $totalRows rows across daemon AFP audit entries, reflection traces, token usage, external tool usage, tenant audit logs, workflow observations, proactive suggestions, and replay nonces. These are machine-generated rolling histories and should be pruned periodically instead of growing without bound."
        } else {
            "Operational history tables are currently empty or already fully bounded."
        }

    return [pscustomobject]@{
        status = $status
        summary = $summary
        daemon_operational_afp = $daemonOperationalAfp
        training_reflection_traces = $trainingReflectionTraces
        proactive_token_usage = $proactiveTokenUsage
        user_external_tool_usage_events = $userExternalToolUsageEvents
        tenant_action_audit_log = $tenantActionAuditLog
        tenant_llm_usage_log = $tenantLlmUsageLog
        tenant_workflow_trigger_observations = $tenantWorkflowTriggerObservations
        proactive_suggestions = $proactiveSuggestions
        trigger_replay_nonces = $triggerReplayNonces
        total_rows = $totalRows
        prune_command = $defaultPruneCommand
    }
}

if ([string]::IsNullOrWhiteSpace($RemoteHost)) {
    throw "[oracle-runtime-inventory] RemoteHost is required"
}
if ([string]::IsNullOrWhiteSpace($User)) {
    throw "[oracle-runtime-inventory] User is required"
}

$containersRaw = Invoke-OracleInventoryCommand "docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}'"
$volumesRaw = Invoke-OracleInventoryCommand "docker volume ls --format '{{.Name}}'"
$imagesRaw = Invoke-OracleInventoryCommand "docker images --format '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}'"
$diskRaw = Invoke-OracleInventoryCommand "df -h --output=target,size,used,avail,pcent / /var"
$dockerSystemDfRaw = Invoke-OracleInventoryCommand "docker system df"
$runtimeScripts = Get-RuntimeScriptInventory -RuntimeDir $RemoteDir -RequiredScripts $requiredRuntimeScripts

$containers = Parse-Lines -Text $containersRaw -Columns @("name", "image", "status")
$volumes = Parse-Lines -Text $volumesRaw -Columns @("name")
$images = Parse-Lines -Text $imagesRaw -Columns @("repository", "tag", "image_id", "size")
$postgresContainerName = Get-FirstMatchingContainerName -Containers $containers -NamePattern 'postgres' -ImagePattern 'pgvector/pgvector|postgres:'
$electricContainerName = Get-FirstMatchingContainerName -Containers $containers -NamePattern 'electric' -ImagePattern 'electricsql/electric'
$disk = @(
    Parse-WhitespaceTable -Text $diskRaw -Columns @("mount", "size", "used", "avail", "use_pct") |
        Group-Object -Property mount |
        ForEach-Object { $_.Group[0] }
)
$dockerSystemDf = @(Parse-DockerSystemDfSummary -Text $dockerSystemDfRaw)
$journalBytes = Get-JournalDiskUsageBytes
$olderBackupSummary = Get-OlderOmnyIdBackupSummary
$supabaseCheckoutBytes = Get-RemoteDirectorySizeBytes -Path "/home/ubuntu/supabase"
$postgresRuntime = Get-PostgresReplicationState -PostgresContainerName $postgresContainerName -ElectricContainerName $electricContainerName
$syntheticMessageState = Get-SyntheticMessageDuplicateState -PostgresContainerName $postgresContainerName
$operationalHistoryState = Get-OperationalHistoryState -PostgresContainerName $postgresContainerName

$containerRows = foreach ($container in $containers) {
    $ownershipGroup = Get-OwnershipGroup -Name $container.name -Image $container.image
    [pscustomobject]@{
        item_type = "container"
        name = $container.name
        image = $container.image
        status = $container.status
        size = ""
        size_gib = $null
        refs_count = $null
        cleanup_class = Get-CleanupClass -ItemType "container" -Name $container.name -Image $container.image -OwnershipGroup $ownershipGroup -AllowSharedHostCleanup:$AllowSharedHostCandidateCleanup -CandidateOwnershipGroups $normalizedCandidateOwnershipGroups
        ownership_group = $ownershipGroup
    }
}

$volumeRows = foreach ($volume in $volumes) {
    $refsCount = Get-DockerReferenceCount -FilterType "volume" -FilterValue $volume.name
    $mountpointTrimmed = Get-DockerVolumeMountpoint -VolumeName $volume.name
    $sizeBytes = if ([string]::IsNullOrWhiteSpace($mountpointTrimmed)) { $null } else { Get-RemoteDirectorySizeBytes -Path $mountpointTrimmed }
    $ownershipGroup = Get-OwnershipGroup -Name $volume.name
    $cleanupClass =
        if ([string]::IsNullOrWhiteSpace($mountpointTrimmed)) {
            "review"
        } else {
            Get-CleanupClass -ItemType "volume" -Name $volume.name -OwnershipGroup $ownershipGroup -ReferenceCount $refsCount -AllowSharedHostCleanup:$AllowSharedHostCandidateCleanup -CandidateOwnershipGroups $normalizedCandidateOwnershipGroups
        }
    [pscustomobject]@{
        item_type = "volume"
        name = $volume.name
        image = ""
        status = ""
        size = if ($null -ne $sizeBytes) { [string]$sizeBytes } else { "" }
        size_gib = if ($null -ne $sizeBytes) { [math]::Round(([double]$sizeBytes / 1GB), 6) } else { $null }
        refs_count = $refsCount
        cleanup_class = $cleanupClass
        ownership_group = $ownershipGroup
    }
}

$imageRows = foreach ($image in $images) {
    $fullName = if ([string]::IsNullOrWhiteSpace($image.repository)) { $image.tag } else { "$($image.repository):$($image.tag)" }
    $refsCount = Get-DockerReferenceCount -FilterType "ancestor" -FilterValue $fullName
    $ownershipGroup = Get-OwnershipGroup -Name $image.repository -Image $fullName
    [pscustomobject]@{
        item_type = "image"
        name = $fullName
        image = $image.image_id
        status = ""
        size = $image.size
        size_gib = Convert-SizeToGiB -Size $image.size
        refs_count = $refsCount
        cleanup_class = Get-CleanupClass -ItemType "image" -Name $image.repository -Image $fullName -OwnershipGroup $ownershipGroup -ReferenceCount $refsCount -AllowSharedHostCleanup:$AllowSharedHostCandidateCleanup -CandidateOwnershipGroups $normalizedCandidateOwnershipGroups
        ownership_group = $ownershipGroup
    }
}

$hostRows = New-Object System.Collections.Generic.List[object]
if ($null -ne $journalBytes -and $journalBytes -gt 0) {
    $hostRows.Add([pscustomobject]@{
        item_type = "host_maintenance"
        name = "system_journal"
        image = ""
        status = "journalctl --disk-usage"
        size = [string][int64]$journalBytes
        size_gib = Convert-BytesToGiB -Bytes $journalBytes
        refs_count = $null
        cleanup_class = "candidate_cleanup"
        ownership_group = "host_logs"
    })
}
if ($null -ne $olderBackupSummary -and $olderBackupSummary.older_generation_count -gt 0 -and $olderBackupSummary.older_generation_bytes -gt 0) {
    $hostRows.Add([pscustomobject]@{
        item_type = "host_path"
        name = "/var/backups/omnyid (older generations)"
        image = ""
        status = "retain_latest=$($olderBackupSummary.latest_generation); older_generations=$($olderBackupSummary.older_generation_count)"
        size = [string][int64]$olderBackupSummary.older_generation_bytes
        size_gib = Convert-BytesToGiB -Bytes $olderBackupSummary.older_generation_bytes
        refs_count = $null
        cleanup_class = "review"
        ownership_group = "omnyid_backup_retention"
    })
}
if ($null -ne $supabaseCheckoutBytes -and $supabaseCheckoutBytes -gt 0) {
    $hostRows.Add([pscustomobject]@{
        item_type = "host_path"
        name = "/home/ubuntu/supabase"
        image = ""
        status = "non-runtime source checkout"
        size = [string][int64]$supabaseCheckoutBytes
        size_gib = Convert-BytesToGiB -Bytes $supabaseCheckoutBytes
        refs_count = $null
        cleanup_class = "review"
        ownership_group = "shared_host_supabase"
    })
}

$allRows = @(@($containerRows) + @($volumeRows) + @($imageRows) + @($hostRows.ToArray()))
$candidateRows = @($allRows | Where-Object { $_.cleanup_class -eq "candidate_cleanup" })
$reviewRows = @($allRows | Where-Object { $_.cleanup_class -eq "review" })
$candidateImageMeasurement = @($candidateRows | Where-Object { $_.item_type -eq "image" -and $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
$candidateVolumeMeasurement = @($candidateRows | Where-Object { $_.item_type -eq "volume" -and $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
$candidateImageSum = if ($candidateImageMeasurement.Count -gt 0 -and $null -ne $candidateImageMeasurement[0].Sum) {
    [double]$candidateImageMeasurement[0].Sum
} else {
    0
}
$candidateVolumeSum = if ($candidateVolumeMeasurement.Count -gt 0 -and $null -ne $candidateVolumeMeasurement[0].Sum) {
    [double]$candidateVolumeMeasurement[0].Sum
} else {
    0
}
$candidateImageGiB = [math]::Round($candidateImageSum, 6)
$candidateVolumeGiB = [math]::Round($candidateVolumeSum, 6)
$candidateHostMeasurement = @($candidateRows | Where-Object { $_.item_type -notin @("image", "volume", "container") -and $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
$candidateHostSum = if ($candidateHostMeasurement.Count -gt 0 -and $null -ne $candidateHostMeasurement[0].Sum) {
    [double]$candidateHostMeasurement[0].Sum
} else {
    0
}
$candidateHostGiB = [math]::Round($candidateHostSum, 6)
$dockerImagesSummary = @($dockerSystemDf | Where-Object { $_.type -eq "Images" } | Select-Object -First 1)
$dockerBuildCacheSummary = @($dockerSystemDf | Where-Object { $_.type -eq "Build Cache" } | Select-Object -First 1)
$dockerLocalVolumesSummary = @($dockerSystemDf | Where-Object { $_.type -eq "Local Volumes" } | Select-Object -First 1)
$dockerImageReclaimableGiB =
    if ($dockerImagesSummary.Count -gt 0 -and $null -ne $dockerImagesSummary[0].reclaimable_gib) {
        [double]$dockerImagesSummary[0].reclaimable_gib
    } else {
        $null
    }
$dockerBuildCacheReclaimableGiB =
    if ($dockerBuildCacheSummary.Count -gt 0 -and $null -ne $dockerBuildCacheSummary[0].reclaimable_gib) {
        [double]$dockerBuildCacheSummary[0].reclaimable_gib
    } else {
        $null
    }
$dockerLocalVolumeReclaimableGiB =
    if ($dockerLocalVolumesSummary.Count -gt 0 -and $null -ne $dockerLocalVolumesSummary[0].reclaimable_gib) {
        [double]$dockerLocalVolumesSummary[0].reclaimable_gib
    } else {
        $null
    }
$ownershipSummaries = @(
    $allRows |
        Group-Object -Property ownership_group |
        Sort-Object -Property Name |
        ForEach-Object {
            $groupRows = @($_.Group)
            $knownSizeMeasurement = @($groupRows | Where-Object { $null -ne $_.size_gib } | Measure-Object -Property size_gib -Sum)
            $knownSizeGiB =
                if ($knownSizeMeasurement.Count -gt 0 -and $null -ne $knownSizeMeasurement[0].Sum) {
                    [math]::Round([double]$knownSizeMeasurement[0].Sum, 6)
                } else {
                    0
                }
            $reviewCount = @($groupRows | Where-Object { $_.cleanup_class -eq "review" }).Count
            $candidateCount = @($groupRows | Where-Object { $_.cleanup_class -eq "candidate_cleanup" }).Count
            [pscustomobject]@{
                ownership_group = [string]$_.Name
                item_count = $groupRows.Count
                review_count = $reviewCount
                candidate_cleanup_count = $candidateCount
                known_size_gib = $knownSizeGiB
                container_count = @($groupRows | Where-Object { $_.item_type -eq "container" }).Count
                volume_count = @($groupRows | Where-Object { $_.item_type -eq "volume" }).Count
                image_count = @($groupRows | Where-Object { $_.item_type -eq "image" }).Count
            }
        }
)

$report = [pscustomobject]@{
    remote_host = $RemoteHost
    remote_dir = $RemoteDir
    generated_at = [DateTime]::UtcNow.ToString("o")
    classification_mode =
        if ($normalizedCandidateOwnershipGroups.Count -gt 0) {
            "targeted_ownership_cleanup_enabled"
        } elseif ($AllowSharedHostCandidateCleanup) {
            "shared_host_cleanup_enabled"
        } else {
            "safe_review_default"
        }
    candidate_ownership_groups = $normalizedCandidateOwnershipGroups
    disk = $disk
    docker_system_df = [pscustomobject]@{
        raw = $dockerSystemDfRaw
        summary = $dockerSystemDf
    }
    postgres_runtime = $postgresRuntime
    synthetic_messages = $syntheticMessageState
    operational_history = $operationalHistoryState
    runtime_scripts = $runtimeScripts
    counts = [pscustomobject]@{
        containers = @($containerRows).Count
        volumes = @($volumeRows).Count
        images = @($imageRows).Count
        candidate_cleanup_items = @($candidateRows).Count
        candidate_cleanup_image_gib = $candidateImageGiB
        candidate_cleanup_volume_gib = $candidateVolumeGiB
        candidate_cleanup_host_gib = $candidateHostGiB
        review_items = @($reviewRows).Count
        docker_image_reclaimable_gib = $dockerImageReclaimableGiB
        docker_build_cache_reclaimable_gib = $dockerBuildCacheReclaimableGiB
        docker_local_volume_reclaimable_gib = $dockerLocalVolumeReclaimableGiB
        pg_wal_gib = $postgresRuntime.pg_wal_gib
        inactive_replication_slots = $postgresRuntime.inactive_slot_count
        synthetic_message_duplicate_rows = $syntheticMessageState.total_dupes
        operational_history_rows = $operationalHistoryState.total_rows
        missing_runtime_scripts = @($runtimeScripts.missing_scripts).Count
    }
    ownership_groups = $ownershipSummaries
    items = $allRows
}

if (-not [string]::IsNullOrWhiteSpace($OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    $report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $OutDir "oracle-runtime-inventory.json")

    $markdown = New-Object System.Text.StringBuilder
    [void]$markdown.AppendLine("# Oracle Runtime Inventory")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- remote_host: $RemoteHost")
    [void]$markdown.AppendLine("- remote_dir: $RemoteDir")
    [void]$markdown.AppendLine("- generated_at: $($report.generated_at)")
    [void]$markdown.AppendLine("- classification_mode: $($report.classification_mode)")
    [void]$markdown.AppendLine("- candidate_ownership_groups: $(@($report.candidate_ownership_groups) -join ', ')")
    [void]$markdown.AppendLine("- containers: $($report.counts.containers)")
    [void]$markdown.AppendLine("- volumes: $($report.counts.volumes)")
    [void]$markdown.AppendLine("- images: $($report.counts.images)")
    [void]$markdown.AppendLine("- candidate_cleanup_items: $($report.counts.candidate_cleanup_items)")
    [void]$markdown.AppendLine("- candidate_cleanup_image_gib: $($report.counts.candidate_cleanup_image_gib)")
    [void]$markdown.AppendLine("- candidate_cleanup_volume_gib: $($report.counts.candidate_cleanup_volume_gib)")
    [void]$markdown.AppendLine("- candidate_cleanup_host_gib: $($report.counts.candidate_cleanup_host_gib)")
    [void]$markdown.AppendLine("- review_items: $($report.counts.review_items)")
    [void]$markdown.AppendLine("- docker_image_reclaimable_gib: $($report.counts.docker_image_reclaimable_gib)")
    [void]$markdown.AppendLine("- docker_build_cache_reclaimable_gib: $($report.counts.docker_build_cache_reclaimable_gib)")
    [void]$markdown.AppendLine("- docker_local_volume_reclaimable_gib: $($report.counts.docker_local_volume_reclaimable_gib)")
    [void]$markdown.AppendLine("- pg_wal_gib: $($report.counts.pg_wal_gib)")
    [void]$markdown.AppendLine("- inactive_replication_slots: $($report.counts.inactive_replication_slots)")
    [void]$markdown.AppendLine("- synthetic_message_duplicate_rows: $($report.counts.synthetic_message_duplicate_rows)")
    [void]$markdown.AppendLine("- operational_history_rows: $($report.counts.operational_history_rows)")
    [void]$markdown.AppendLine("- runtime_script_integrity_status: $($report.runtime_scripts.status)")
    [void]$markdown.AppendLine("- runtime_script_integrity_detail: $($report.runtime_scripts.detail)")
    [void]$markdown.AppendLine("- missing_runtime_scripts: $(@($report.runtime_scripts.missing_scripts) -join ', ')")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Disk")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| mount | size | used | avail | use_pct |")
    [void]$markdown.AppendLine("|---|---:|---:|---:|---:|")
    foreach ($row in $disk) {
        [void]$markdown.AppendLine("| $($row.mount) | $($row.size) | $($row.used) | $($row.avail) | $($row.use_pct) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Docker System DF")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| type | total | active | size | reclaimable | size_gib | reclaimable_gib |")
    [void]$markdown.AppendLine("|---|---:|---:|---:|---:|---:|---:|")
    foreach ($row in $dockerSystemDf) {
        [void]$markdown.AppendLine("| $($row.type) | $($row.total) | $($row.active) | $($row.size) | $($row.reclaimable) | $($row.size_gib) | $($row.reclaimable_gib) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Runtime Scripts")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| status | detail | missing_scripts |")
    [void]$markdown.AppendLine("|---|---|---|")
    [void]$markdown.AppendLine("| $($report.runtime_scripts.status) | $($report.runtime_scripts.detail) | $(@($report.runtime_scripts.missing_scripts) -join ', ') |")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Postgres WAL")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| postgres_container | electric_container | pg_wal_gib | max_slot_wal_keep_size | wal_keep_size | electric_slot_status | electric_slot_name | electric_slot_active | electric_slot_retained_wal_gib |")
    [void]$markdown.AppendLine("|---|---|---:|---:|---:|---|---|---|---:|")
    [void]$markdown.AppendLine("| $($report.postgres_runtime.postgres_container_name) | $($report.postgres_runtime.electric_container_name) | $($report.postgres_runtime.pg_wal_gib) | $($report.postgres_runtime.max_slot_wal_keep_size) | $($report.postgres_runtime.wal_keep_size) | $($report.postgres_runtime.electric_slot_status) | $($report.postgres_runtime.electric_slot_name) | $($report.postgres_runtime.electric_slot_active) | $($report.postgres_runtime.electric_slot_retained_wal_gib) |")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- electric_slot_summary: $($report.postgres_runtime.electric_slot_summary)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Synthetic Messages")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| status | maintenance_summary_dupes | curator_card_dupes | curator_backlink_dupes | ingestion_topology_dupes | total_dupes |")
    [void]$markdown.AppendLine("|---|---:|---:|---:|---:|---:|")
    [void]$markdown.AppendLine("| $($report.synthetic_messages.status) | $($report.synthetic_messages.maintenance_summary_dupes) | $($report.synthetic_messages.curator_card_dupes) | $($report.synthetic_messages.curator_backlink_dupes) | $($report.synthetic_messages.ingestion_topology_dupes) | $($report.synthetic_messages.total_dupes) |")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- synthetic_message_summary: $($report.synthetic_messages.summary)")
    [void]$markdown.AppendLine("- synthetic_message_prune_command: $($report.synthetic_messages.prune_command)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Operational History")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| status | daemon_operational_afp | training_reflection_traces | proactive_token_usage | user_external_tool_usage_events | tenant_action_audit_log | tenant_llm_usage_log | tenant_workflow_trigger_observations | proactive_suggestions | trigger_replay_nonces | total_rows |")
    [void]$markdown.AppendLine("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    [void]$markdown.AppendLine("| $($report.operational_history.status) | $($report.operational_history.daemon_operational_afp) | $($report.operational_history.training_reflection_traces) | $($report.operational_history.proactive_token_usage) | $($report.operational_history.user_external_tool_usage_events) | $($report.operational_history.tenant_action_audit_log) | $($report.operational_history.tenant_llm_usage_log) | $($report.operational_history.tenant_workflow_trigger_observations) | $($report.operational_history.proactive_suggestions) | $($report.operational_history.trigger_replay_nonces) | $($report.operational_history.total_rows) |")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("- operational_history_summary: $($report.operational_history.summary)")
    [void]$markdown.AppendLine("- operational_history_prune_command: $($report.operational_history.prune_command)")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Replication Slots")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| slot_name | slot_type | active | wal_status | retained_wal_pretty | retained_wal_gib | restart_lsn | confirmed_flush_lsn | inactive_since |")
    [void]$markdown.AppendLine("|---|---|---|---|---:|---:|---|---|---|")
    foreach ($row in @($report.postgres_runtime.replication_slots)) {
        [void]$markdown.AppendLine("| $($row.slot_name) | $($row.slot_type) | $($row.active) | $($row.wal_status) | $($row.retained_wal_pretty) | $($row.retained_wal_gib) | $($row.restart_lsn) | $($row.confirmed_flush_lsn) | $($row.inactive_since) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Ownership Groups")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| ownership_group | item_count | review_count | candidate_cleanup_count | container_count | volume_count | image_count | known_size_gib |")
    [void]$markdown.AppendLine("|---|---:|---:|---:|---:|---:|---:|---:|")
    foreach ($row in $ownershipSummaries) {
        [void]$markdown.AppendLine("| $($row.ownership_group) | $($row.item_count) | $($row.review_count) | $($row.candidate_cleanup_count) | $($row.container_count) | $($row.volume_count) | $($row.image_count) | $($row.known_size_gib) |")
    }
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("## Candidate Cleanup")
    [void]$markdown.AppendLine()
    [void]$markdown.AppendLine("| item_type | name | image | status | refs_count | size | size_gib |")
    [void]$markdown.AppendLine("|---|---|---|---|---:|---:|---:|")
    foreach ($row in ($candidateRows | Sort-Object item_type, name)) {
        [void]$markdown.AppendLine("| $($row.item_type) | $($row.name) | $($row.image) | $($row.status) | $($row.refs_count) | $($row.size) | $($row.size_gib) |")
    }
    $markdown.ToString() | Set-Content (Join-Path $OutDir "oracle-runtime-inventory.md")
}

Write-Output "[oracle-runtime-inventory] host=$RemoteHost containers=$($report.counts.containers) volumes=$($report.counts.volumes) images=$($report.counts.images) candidate_cleanup_items=$($report.counts.candidate_cleanup_items) candidate_cleanup_image_gib=$candidateImageGiB candidate_cleanup_volume_gib=$candidateVolumeGiB docker_image_reclaimable_gib=$dockerImageReclaimableGiB docker_build_cache_reclaimable_gib=$dockerBuildCacheReclaimableGiB pg_wal_gib=$($report.counts.pg_wal_gib) electric_slot_status=$($report.postgres_runtime.electric_slot_status) synthetic_message_duplicate_rows=$($report.counts.synthetic_message_duplicate_rows) operational_history_rows=$($report.counts.operational_history_rows) runtime_script_integrity_status=$($report.runtime_scripts.status) missing_runtime_scripts=$($report.counts.missing_runtime_scripts)"
