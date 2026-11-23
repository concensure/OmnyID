param(
    [string]$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$OracleProofPath = (Join-Path $PSScriptRoot "..\artifacts\oracle-production-proof-current\oracle-production-proof.json"),
    [string]$OracleInventoryPath = (Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-inventory-current\oracle-runtime-inventory.json"),
    [string]$OracleCleanupPlanPath = (Join-Path $PSScriptRoot "..\artifacts\oracle-runtime-cleanup-plan-current\oracle-runtime-cleanup-plan.json"),
    [string]$OracleRemediationPath = (Join-Path $PSScriptRoot "..\artifacts\oracle-remediation-sequence-current\oracle-remediation-sequence.json"),
    [string]$CommercialSnapshotPath = (Join-Path $PSScriptRoot "..\artifacts\commercial-readiness-snapshot-current\commercial-readiness-snapshot.json"),
    [string]$OutDir = (Join-Path $PSScriptRoot "..\artifacts\storage-hygiene-report-current")
)

$ErrorActionPreference = "Stop"

function New-WorkspaceInventory {
    param([string]$Root)

    $allItems = @(
        Get-ChildItem -LiteralPath $Root -Recurse -Force -ErrorAction SilentlyContinue
    )

    $itemsByName = @{}
    $itemsByPath = @{}
    foreach ($item in $allItems) {
        $name = [string]$item.Name
        $fullName = [string]$item.FullName

        if (-not $itemsByName.ContainsKey($name)) {
            $itemsByName[$name] = New-Object System.Collections.Generic.List[object]
        }
        [void]$itemsByName[$name].Add($item)
        $itemsByPath[$fullName] = $item
    }

    return [pscustomobject]@{
        root = $Root
        all_items = $allItems
        items_by_name = $itemsByName
        items_by_path = $itemsByPath
    }
}

function Get-PathSizeBytes {
    param(
        [string]$Path,
        [object]$Inventory
    )

    if (-not $Inventory.items_by_path.ContainsKey($Path)) {
        if (-not (Test-Path -LiteralPath $Path)) {
            return 0
        }

        $item = Get-Item -LiteralPath $Path -Force
        if (-not $item.PSIsContainer) {
            return [int64]$item.Length
        }

        $prefix = $item.FullName.TrimEnd('\') + '\'
        $sum = 0L
        foreach ($candidate in $Inventory.all_items) {
            if (-not $candidate.PSIsContainer -and ([string]$candidate.FullName).StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                $sum += [int64]$candidate.Length
            }
        }
        return $sum
    }

    $indexedItem = $Inventory.items_by_path[$Path]
    if (-not $indexedItem.PSIsContainer) {
        return [int64]$indexedItem.Length
    }

    $directoryPrefix = ([string]$indexedItem.FullName).TrimEnd('\') + '\'
    $directoryBytes = 0L
    foreach ($candidate in $Inventory.all_items) {
        if (-not $candidate.PSIsContainer -and ([string]$candidate.FullName).StartsWith($directoryPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            $directoryBytes += [int64]$candidate.Length
        }
    }
    return $directoryBytes
}

function Convert-ToGiB {
    param([double]$Bytes)
    return [math]::Round(($Bytes / 1GB), 6)
}

function Convert-ToPercent {
    param(
        [double]$Part,
        [double]$Whole
    )

    if ($Whole -le 0) {
        return 0
    }

    return [math]::Round((($Part / $Whole) * 100), 2)
}

function Get-RelativePathCompat {
    param(
        [string]$BasePath,
        [string]$TargetPath
    )

    $baseUri = New-Object System.Uri(($BasePath.TrimEnd('\') + '\'))
    $targetUri = New-Object System.Uri($TargetPath)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '\')
}

function New-LocalFinding {
    param(
        [string]$AbsolutePath,
        [object]$Inventory,
        [string]$Category,
        [string]$Reason,
        [string]$Action,
        [bool]$SafeToDelete
    )

    $item = if ($Inventory.items_by_path.ContainsKey($AbsolutePath)) { $Inventory.items_by_path[$AbsolutePath] } else { Get-Item -LiteralPath $AbsolutePath -Force }
    $sizeBytes = Get-PathSizeBytes -Path $AbsolutePath -Inventory $Inventory
    return [pscustomobject]@{
        path = $AbsolutePath
        relative_path = Get-RelativePathCompat -BasePath $WorkspaceRoot -TargetPath $AbsolutePath
        item_type = if ($item.PSIsContainer) { "directory" } else { "file" }
        size_bytes = $sizeBytes
        size_gib = Convert-ToGiB -Bytes $sizeBytes
        category = $Category
        safe_to_delete = $SafeToDelete
        action = $Action
        reason = $Reason
    }
}

function Get-ExistingMatches {
    param(
        [object]$Inventory,
        [string[]]$Patterns,
        [string]$Category
    )

    $pathMatches = @()
    foreach ($pattern in $Patterns) {
        $items = @()
        if ($Inventory.items_by_name.ContainsKey($pattern)) {
            $items = foreach ($matchedItem in $Inventory.items_by_name[$pattern]) { $matchedItem }
        }
        foreach ($item in $items) {
            if ($Category -eq "frontend_build" -and $item.FullName -match '[\\/]node_modules[\\/]') {
                continue
            }
            $parentPath = Split-Path -Path ([string]$item.FullName) -Parent
            if ($Category -eq "node_dependencies" -and $parentPath -match '[\\/]node_modules([\\/]|$)') {
                continue
            }
            $fullName = [string]$item.FullName
            if ($fullName -notin $pathMatches) {
                $pathMatches += $fullName
            }
        }
    }
    return @($pathMatches)
}

function Get-OracleGroupClassification {
    param(
        [string]$OwnershipGroup,
        [string]$CleanupClass
    )

    switch ($OwnershipGroup) {
        "omnyid_runtime" {
            return [pscustomobject]@{
                deployment_class = "runtime_required"
                required_on_oracle = $true
                safe_to_delete = $false
                delete_precondition = "keep_on_host"
                rationale = "Active OmnyID runtime resources are required for Oracle production operation."
            }
        }
        "omnyid_backup_retention" {
            return [pscustomobject]@{
                deployment_class = "backup_only_review"
                required_on_oracle = $false
                safe_to_delete = $false
                delete_precondition = "trim_after_backup_retention_review"
                rationale = "Older backup generations are not runtime-critical, but should only be trimmed within retention policy."
            }
        }
        "shared_host_supabase" {
            return [pscustomobject]@{
                deployment_class = "non_omnyid_review"
                required_on_oracle = $false
                safe_to_delete = $false
                delete_precondition = "remove_only_if_supabase_is_not_required"
                rationale = "Supabase resources are not part of the OmnyID runtime and should be reviewed for host removal."
            }
        }
        "shared_host_coolify" {
            return [pscustomobject]@{
                deployment_class = "non_omnyid_review"
                required_on_oracle = $false
                safe_to_delete = $false
                delete_precondition = "remove_only_if_coolify_state_is_externalized"
                rationale = "Coolify state is unrelated to OmnyID runtime and should only remain if the host still serves that workload."
            }
        }
        "shared_host_n8n" {
            return [pscustomobject]@{
                deployment_class = "non_omnyid_review"
                required_on_oracle = $false
                safe_to_delete = $false
                delete_precondition = "remove_only_if_n8n_data_is_archived_or_relocated"
                rationale = "n8n data is not part of OmnyID runtime and should only stay if the host still serves that workload."
            }
        }
        default {
            if ($CleanupClass -eq "candidate_cleanup") {
                return [pscustomobject]@{
                    deployment_class = "safe_cleanup_candidate"
                    required_on_oracle = $false
                    safe_to_delete = $true
                    delete_precondition = "safe_cleanup_candidate"
                    rationale = "This inventory item is already classified as direct cleanup candidate rather than runtime state."
                }
            }

            return [pscustomobject]@{
                deployment_class = "review_required"
                required_on_oracle = $false
                safe_to_delete = $false
                delete_precondition = "review_before_delete"
                rationale = "This item is not marked as runtime-required but still needs operator review before deletion."
            }
        }
    }
}

if (-not (Test-Path -LiteralPath $WorkspaceRoot)) {
    throw "[storage-hygiene-report] workspace root not found: $WorkspaceRoot"
}

$workspaceRoot = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
$workspaceInventory = New-WorkspaceInventory -Root $workspaceRoot

$knownLocalTargets = @(
    [pscustomobject]@{ patterns = @("target"); category = "rust_build"; action = "delete"; reason = "Cargo build output is rebuildable and should not be deployed to Oracle." ; safe = $true },
    [pscustomobject]@{ patterns = @("dist"); category = "frontend_build"; action = "delete_or_rebuild"; reason = "Bundled frontend output is generated from source and can be rebuilt locally or during release." ; safe = $true },
    [pscustomobject]@{ patterns = @("node_modules"); category = "node_dependencies"; action = "delete_and_reinstall"; reason = "Dependency install trees are rebuildable from lockfiles and should not be copied to Oracle runtime." ; safe = $true },
    [pscustomobject]@{ patterns = @(".venv"); category = "python_virtualenv"; action = "delete_and_recreate"; reason = "Local virtualenvs are rebuildable developer environments and are not Oracle runtime assets." ; safe = $true },
    [pscustomobject]@{ patterns = @("__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"); category = "python_cache"; action = "delete"; reason = "Python cache directories are ephemeral local developer state." ; safe = $true },
    [pscustomobject]@{ patterns = @(".tmp-debug-bash-selftest"); category = "temp_debug"; action = "delete"; reason = "Temporary self-test workspace is not runtime data." ; safe = $true },
    [pscustomobject]@{ patterns = @("artifacts"); category = "generated_artifacts"; action = "review_then_delete"; reason = "Artifacts are regenerable from scripts, but may be worth retaining for recent audits." ; safe = $true }
)

$localFindings = New-Object System.Collections.Generic.List[object]
foreach ($target in $knownLocalTargets) {
    $paths = Get-ExistingMatches -Inventory $workspaceInventory -Patterns $target.patterns -Category $target.category
    foreach ($path in $paths) {
        [void]$localFindings.Add((New-LocalFinding -AbsolutePath $path -Inventory $workspaceInventory -Category $target.category -Reason $target.reason -Action $target.action -SafeToDelete $target.safe))
    }
}

$extraRootFiles = @(
    "tmp_backup_raw.txt",
    "tmp_restore_raw.txt",
    "temp_release_snippet.txt"
)
foreach ($rootFile in $extraRootFiles) {
    $candidate = Join-Path $workspaceRoot $rootFile
    if (Test-Path -LiteralPath $candidate) {
        [void]$localFindings.Add((New-LocalFinding -AbsolutePath $candidate -Inventory $workspaceInventory -Category "temp_output" -Reason "Temporary operator/debug output is not runtime state." -Action "delete" -SafeToDelete $true))
    }
}

$localFindingsArray = @($localFindings | Sort-Object -Property size_bytes -Descending)
$collapsedLocalFindings = New-Object System.Collections.Generic.List[object]
foreach ($finding in $localFindingsArray) {
    $normalizedPath = ([string]$finding.path).TrimEnd('\') + '\'
    $hasCoveredAncestor = $false
    foreach ($kept in $collapsedLocalFindings) {
        $keptPath = ([string]$kept.path).TrimEnd('\') + '\'
        if ($normalizedPath.StartsWith($keptPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            $hasCoveredAncestor = $true
            break
        }
    }
    if (-not $hasCoveredAncestor) {
        [void]$collapsedLocalFindings.Add($finding)
    }
}
$safeLocalFindings = @($collapsedLocalFindings | Where-Object { $_.safe_to_delete })
$safeLocalBytes = ($safeLocalFindings | Measure-Object -Property size_bytes -Sum).Sum
if ($null -eq $safeLocalBytes) { $safeLocalBytes = 0 }
$localCategorySummary = @(
    $safeLocalFindings |
        Group-Object -Property category |
        ForEach-Object {
            $categoryBytes = ($_.Group | Measure-Object -Property size_bytes -Sum).Sum
            if ($null -eq $categoryBytes) { $categoryBytes = 0 }
            [pscustomobject]@{
                category = [string]$_.Name
                item_count = @($_.Group).Count
                size_bytes = [int64]$categoryBytes
                size_gib = Convert-ToGiB -Bytes ([double]$categoryBytes)
            }
        } |
        Sort-Object -Property size_bytes -Descending
)
$localRecommendedOrder = @($safeLocalFindings | Sort-Object -Property size_bytes -Descending | Select-Object -First 8)

$oracleInventory = $null
if (Test-Path -LiteralPath $OracleInventoryPath) {
    $oracleInventory = Get-Content -LiteralPath $OracleInventoryPath -Raw | ConvertFrom-Json
}

$oracleProof = $null
if (Test-Path -LiteralPath $OracleProofPath) {
    $oracleProof = Get-Content -LiteralPath $OracleProofPath -Raw | ConvertFrom-Json
}

$oracleCleanupPlan = $null
if (Test-Path -LiteralPath $OracleCleanupPlanPath) {
    $oracleCleanupPlan = Get-Content -LiteralPath $OracleCleanupPlanPath -Raw | ConvertFrom-Json
}

$commercialSnapshot = $null
if (Test-Path -LiteralPath $CommercialSnapshotPath) {
    $commercialSnapshot = Get-Content -LiteralPath $CommercialSnapshotPath -Raw | ConvertFrom-Json
}

$oracleRemediation = $null
if (Test-Path -LiteralPath $OracleRemediationPath) {
    $oracleRemediation = Get-Content -LiteralPath $OracleRemediationPath -Raw | ConvertFrom-Json
}

$oracleSummary = [pscustomobject]@{
    remote_host = if ($null -ne $oracleInventory) { [string]$oracleInventory.remote_host } else { "" }
    root_use_pct = if ($null -ne $oracleInventory -and $oracleInventory.disk.Count -gt 0) { [string]$oracleInventory.disk[0].use_pct } else { "" }
    root_avail = if ($null -ne $oracleInventory -and $oracleInventory.disk.Count -gt 0) { [string]$oracleInventory.disk[0].avail } else { "" }
    candidate_cleanup_gib = if ($null -ne $oracleCleanupPlan) { [double]$oracleCleanupPlan.estimated_reclaim.total_candidate_gib } else { 0 }
    review_target_group = if ($null -ne $oracleCleanupPlan) { [string]$oracleCleanupPlan.review_pressure.top_target_group } else { "" }
    review_target_gib = if ($null -ne $oracleCleanupPlan) { [double]$oracleCleanupPlan.review_pressure.top_target_known_size_gib } else { 0 }
    backup_retention_gib = if ($null -ne $oracleCleanupPlan) { [double]$oracleCleanupPlan.review_pressure.omnyid_backup_retention_known_size_gib } else { 0 }
    remediation_outcome =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary) {
            [string]$oracleRemediation.remediation_summary.outcome
        } elseif ($null -ne $commercialSnapshot) {
            [string]$commercialSnapshot.oracle.remediation_outcome
        } else {
            ""
        }
    restore_gap_gib =
        if ($null -ne $oracleProof -and $null -ne $oracleProof.PSObject.Properties["restore_drill_gap_bytes"] -and $null -ne $oracleProof.restore_drill_gap_bytes) {
            [math]::Round(([double]$oracleProof.restore_drill_gap_bytes / 1GB), 2)
        } elseif ($null -ne $commercialSnapshot) {
            [double]$commercialSnapshot.oracle.restore_drill_gap_gib
        } else {
            0
        }
    postgres_wal_pressure_status =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure) {
            [string]$oracleCleanupPlan.postgres_wal_pressure.status
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_pressure_status"]) {
            [string]$commercialSnapshot.oracle.postgres_wal_pressure_status
        } else {
            ""
        }
    postgres_wal_pressure_summary =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure) {
            [string]$oracleCleanupPlan.postgres_wal_pressure.summary
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_pressure_summary"]) {
            [string]$commercialSnapshot.oracle.postgres_wal_pressure_summary
        } else {
            ""
        }
    postgres_wal_pressure_recommended_action =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure) {
            [string]$oracleCleanupPlan.postgres_wal_pressure.recommended_action
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_pressure_recommended_action"]) {
            [string]$commercialSnapshot.oracle.postgres_wal_pressure_recommended_action
        } else {
            ""
        }
    postgres_wal_safe_limit_recommendation_gib =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure -and $null -ne $oracleCleanupPlan.postgres_wal_pressure.PSObject.Properties["safe_limit_recommendation_gib"]) {
            [double]$oracleCleanupPlan.postgres_wal_pressure.safe_limit_recommendation_gib
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_safe_limit_recommendation_gib"] -and $null -ne $commercialSnapshot.oracle.postgres_wal_safe_limit_recommendation_gib) {
            [double]$commercialSnapshot.oracle.postgres_wal_safe_limit_recommendation_gib
        } else {
            0
        }
    postgres_wal_gib =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure -and $null -ne $oracleCleanupPlan.postgres_wal_pressure.PSObject.Properties["pg_wal_gib"]) {
            [double]$oracleCleanupPlan.postgres_wal_pressure.pg_wal_gib
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["postgres_wal_gib"] -and $null -ne $commercialSnapshot.oracle.postgres_wal_gib) {
            [double]$commercialSnapshot.oracle.postgres_wal_gib
        } else {
            0
        }
    electric_slot_name =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure) {
            [string]$oracleCleanupPlan.postgres_wal_pressure.electric_slot_name
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["electric_slot_name"]) {
            [string]$commercialSnapshot.oracle.electric_slot_name
        } else {
            ""
        }
    electric_slot_active =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure -and $null -ne $oracleCleanupPlan.postgres_wal_pressure.PSObject.Properties["electric_slot_active"]) {
            [bool]$oracleCleanupPlan.postgres_wal_pressure.electric_slot_active
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["electric_slot_active"] -and $null -ne $commercialSnapshot.oracle.electric_slot_active) {
            [bool]$commercialSnapshot.oracle.electric_slot_active
        } else {
            $false
        }
    electric_slot_retained_wal_gib =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["postgres_wal_pressure"] -and $null -ne $oracleCleanupPlan.postgres_wal_pressure -and $null -ne $oracleCleanupPlan.postgres_wal_pressure.PSObject.Properties["electric_slot_retained_wal_gib"]) {
            [double]$oracleCleanupPlan.postgres_wal_pressure.electric_slot_retained_wal_gib
        } elseif ($null -ne $commercialSnapshot -and $null -ne $commercialSnapshot.oracle -and $null -ne $commercialSnapshot.oracle.PSObject.Properties["electric_slot_retained_wal_gib"] -and $null -ne $commercialSnapshot.oracle.electric_slot_retained_wal_gib) {
            [double]$commercialSnapshot.oracle.electric_slot_retained_wal_gib
        } else {
            0
        }
    wal_slot_mode =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["wal_slot_mode"]) {
            [string]$oracleRemediation.remediation_summary.wal_slot_mode
        } else {
            ""
        }
    synthetic_message_cleanup_mode =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_mode"]) {
            [string]$oracleRemediation.remediation_summary.synthetic_message_cleanup_mode
        } else {
            ""
        }
    synthetic_message_pressure_status =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure) {
            [string]$oracleCleanupPlan.synthetic_message_pressure.status
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages) {
            [string]$oracleInventory.synthetic_messages.status
        } else {
            ""
        }
    synthetic_message_pressure_summary =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure) {
            [string]$oracleCleanupPlan.synthetic_message_pressure.summary
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages) {
            [string]$oracleInventory.synthetic_messages.summary
        } else {
            ""
        }
    synthetic_message_pressure_total_dupes =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure -and $null -ne $oracleCleanupPlan.synthetic_message_pressure.PSObject.Properties["total_dupes"]) {
            [int64]$oracleCleanupPlan.synthetic_message_pressure.total_dupes
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages -and $null -ne $oracleInventory.synthetic_messages.PSObject.Properties["total_dupes"]) {
            [int64]$oracleInventory.synthetic_messages.total_dupes
        } else {
            0
        }
    synthetic_message_pressure_maintenance_summary_dupes =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure -and $null -ne $oracleCleanupPlan.synthetic_message_pressure.PSObject.Properties["maintenance_summary_dupes"]) {
            [int64]$oracleCleanupPlan.synthetic_message_pressure.maintenance_summary_dupes
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages -and $null -ne $oracleInventory.synthetic_messages.PSObject.Properties["maintenance_summary_dupes"]) {
            [int64]$oracleInventory.synthetic_messages.maintenance_summary_dupes
        } else {
            0
        }
    synthetic_message_pressure_curator_card_dupes =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure -and $null -ne $oracleCleanupPlan.synthetic_message_pressure.PSObject.Properties["curator_card_dupes"]) {
            [int64]$oracleCleanupPlan.synthetic_message_pressure.curator_card_dupes
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages -and $null -ne $oracleInventory.synthetic_messages.PSObject.Properties["curator_card_dupes"]) {
            [int64]$oracleInventory.synthetic_messages.curator_card_dupes
        } else {
            0
        }
    synthetic_message_pressure_curator_backlink_dupes =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure -and $null -ne $oracleCleanupPlan.synthetic_message_pressure.PSObject.Properties["curator_backlink_dupes"]) {
            [int64]$oracleCleanupPlan.synthetic_message_pressure.curator_backlink_dupes
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages -and $null -ne $oracleInventory.synthetic_messages.PSObject.Properties["curator_backlink_dupes"]) {
            [int64]$oracleInventory.synthetic_messages.curator_backlink_dupes
        } else {
            0
        }
    synthetic_message_pressure_ingestion_topology_dupes =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["synthetic_message_pressure"] -and $null -ne $oracleCleanupPlan.synthetic_message_pressure -and $null -ne $oracleCleanupPlan.synthetic_message_pressure.PSObject.Properties["ingestion_topology_dupes"]) {
            [int64]$oracleCleanupPlan.synthetic_message_pressure.ingestion_topology_dupes
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["synthetic_messages"] -and $null -ne $oracleInventory.synthetic_messages -and $null -ne $oracleInventory.synthetic_messages.PSObject.Properties["ingestion_topology_dupes"]) {
            [int64]$oracleInventory.synthetic_messages.ingestion_topology_dupes
        } else {
            0
        }
    synthetic_message_cleanup_command =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["commands"] -and $null -ne $oracleCleanupPlan.commands.PSObject.Properties["prune_synthetic_messages"]) {
            [string]$oracleCleanupPlan.commands.prune_synthetic_messages
        } else {
            ""
        }
    synthetic_message_cleanup_deleted_total =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_deleted_total"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_deleted_total
        } else {
            0
        }
    synthetic_message_cleanup_before_total_dupes =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_before_total_dupes"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_before_total_dupes
        } else {
            0
        }
    synthetic_message_cleanup_after_total_dupes =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_after_total_dupes"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_after_total_dupes
        } else {
            0
        }
    synthetic_message_cleanup_before_maintenance_summary_dupes =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_before_maintenance_summary_dupes"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_before_maintenance_summary_dupes
        } else {
            0
        }
    synthetic_message_cleanup_before_curator_card_dupes =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_before_curator_card_dupes"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_before_curator_card_dupes
        } else {
            0
        }
    synthetic_message_cleanup_before_curator_backlink_dupes =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_before_curator_backlink_dupes"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_before_curator_backlink_dupes
        } else {
            0
        }
    synthetic_message_cleanup_before_ingestion_topology_dupes =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["synthetic_message_cleanup_before_ingestion_topology_dupes"]) {
            [int64]$oracleRemediation.remediation_summary.synthetic_message_cleanup_before_ingestion_topology_dupes
        } else {
            0
        }
    operational_history_pressure_status =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["operational_history_pressure"] -and $null -ne $oracleCleanupPlan.operational_history_pressure) {
            [string]$oracleCleanupPlan.operational_history_pressure.status
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["operational_history"] -and $null -ne $oracleInventory.operational_history) {
            [string]$oracleInventory.operational_history.status
        } else {
            ""
        }
    operational_history_pressure_total_rows =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["operational_history_pressure"] -and $null -ne $oracleCleanupPlan.operational_history_pressure -and $null -ne $oracleCleanupPlan.operational_history_pressure.PSObject.Properties["total_rows"]) {
            [int64]$oracleCleanupPlan.operational_history_pressure.total_rows
        } elseif ($null -ne $oracleInventory -and $null -ne $oracleInventory.PSObject.Properties["operational_history"] -and $null -ne $oracleInventory.operational_history -and $null -ne $oracleInventory.operational_history.PSObject.Properties["total_rows"]) {
            [int64]$oracleInventory.operational_history.total_rows
        } else {
            0
        }
    operational_history_cleanup_command =
        if ($null -ne $oracleCleanupPlan -and $null -ne $oracleCleanupPlan.PSObject.Properties["commands"] -and $null -ne $oracleCleanupPlan.commands.PSObject.Properties["prune_operational_history"]) {
            [string]$oracleCleanupPlan.commands.prune_operational_history
        } else {
            ""
        }
    operational_history_cleanup_mode =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["operational_history_cleanup_mode"]) {
            [string]$oracleRemediation.remediation_summary.operational_history_cleanup_mode
        } else {
            ""
        }
    operational_history_cleanup_deleted_total =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["operational_history_cleanup_deleted_total"]) {
            [int64]$oracleRemediation.remediation_summary.operational_history_cleanup_deleted_total
        } else {
            0
        }
    operational_history_cleanup_before_total_rows =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["operational_history_cleanup_before_total_rows"]) {
            [int64]$oracleRemediation.remediation_summary.operational_history_cleanup_before_total_rows
        } else {
            0
        }
    operational_history_cleanup_after_total_rows =
        if ($null -ne $oracleRemediation -and $null -ne $oracleRemediation.PSObject.Properties["remediation_summary"] -and $null -ne $oracleRemediation.remediation_summary -and $null -ne $oracleRemediation.remediation_summary.PSObject.Properties["operational_history_cleanup_after_total_rows"]) {
            [int64]$oracleRemediation.remediation_summary.operational_history_cleanup_after_total_rows
        } else {
            0
        }
}

$oracleRuntimeKeep = @()
$oracleReviewDelete = @()
$oracleCandidateDelete = @()
$oracleGroupSummary = @()
$oracleDeletePriority = @()

if ($null -ne $oracleInventory) {
    $oracleRuntimeKeep = @($oracleInventory.items | Where-Object { $_.cleanup_class -eq "keep_runtime" } | Sort-Object ownership_group, item_type, name)
    $oracleReviewDelete = @($oracleInventory.items | Where-Object { $_.cleanup_class -eq "review" } | Sort-Object ownership_group, item_type, name)
    $oracleCandidateDelete = @($oracleInventory.items | Where-Object { $_.cleanup_class -eq "candidate_cleanup" } | Sort-Object ownership_group, item_type, name)
}

$reviewTargetByGroup = @{}
if ($null -ne $oracleCleanupPlan) {
    foreach ($target in @($oracleCleanupPlan.review_targets)) {
        $reviewTargetByGroup[[string]$target.ownership_group] = $target
    }
}

$oracleGroups = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($item in @($oracleRuntimeKeep + $oracleReviewDelete + $oracleCandidateDelete)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$item.ownership_group)) {
        [void]$oracleGroups.Add([string]$item.ownership_group)
    }
}
foreach ($target in @($oracleCleanupPlan.review_targets)) {
    if (-not [string]::IsNullOrWhiteSpace([string]$target.ownership_group)) {
        [void]$oracleGroups.Add([string]$target.ownership_group)
    }
}

$candidateCleanupGiB = if ($null -ne $oracleCleanupPlan) { [double]$oracleCleanupPlan.estimated_reclaim.total_candidate_gib } else { 0 }
$reviewTargetKnownGiBTotal = 0.0
foreach ($target in @($oracleCleanupPlan.review_targets)) {
    $reviewTargetKnownGiBTotal += [double]$target.known_size_gib
}
$oracleKnownNonRuntimeGiB = $candidateCleanupGiB + $reviewTargetKnownGiBTotal

$oracleGroupSummaryList = New-Object System.Collections.Generic.List[object]
foreach ($groupName in ($oracleGroups | Sort-Object)) {
    $groupItems = @($oracleInventory.items | Where-Object { $_.ownership_group -eq $groupName })
    $cleanupClass = if ($groupItems.Count -gt 0) { [string]$groupItems[0].cleanup_class } else { "review" }
    $classification = Get-OracleGroupClassification -OwnershipGroup $groupName -CleanupClass $cleanupClass
    $reviewTarget = $null
    if ($reviewTargetByGroup.ContainsKey($groupName)) {
        $reviewTarget = $reviewTargetByGroup[$groupName]
    }

    $knownSizeGiB = 0.0
    if ($null -ne $reviewTarget) {
        $knownSizeGiB = [double]$reviewTarget.known_size_gib
    } else {
        foreach ($item in $groupItems) {
            if ($null -ne $item.size_gib) {
                $knownSizeGiB += [double]$item.size_gib
            }
        }
    }

    $summaryRow = [pscustomobject]@{
        ownership_group = $groupName
        cleanup_class = $cleanupClass
        deployment_class = $classification.deployment_class
        required_on_oracle = [bool]$classification.required_on_oracle
        safe_to_delete_now = [bool]$classification.safe_to_delete
        delete_precondition = [string]$classification.delete_precondition
        known_size_gib = [math]::Round($knownSizeGiB, 6)
        share_of_known_non_runtime_pct = if ($classification.required_on_oracle) { 0 } else { Convert-ToPercent -Part $knownSizeGiB -Whole $oracleKnownNonRuntimeGiB }
        item_count = $groupItems.Count
        recommended_action = if ($null -ne $reviewTarget) { [string]$reviewTarget.recommended_action } elseif ($classification.safe_to_delete) { "delete direct cleanup candidate set" } else { "review before delete" }
        rationale = [string]$classification.rationale
    }
    [void]$oracleGroupSummaryList.Add($summaryRow)
}

$oracleGroupSummary = @($oracleGroupSummaryList | Sort-Object @{ Expression = "required_on_oracle"; Descending = $false }, @{ Expression = "known_size_gib"; Descending = $true }, ownership_group)
$oracleDeletePriority = @(
    $oracleGroupSummary |
        Where-Object { -not $_.required_on_oracle } |
        Sort-Object @{ Expression = "safe_to_delete_now"; Descending = $true }, @{ Expression = "known_size_gib"; Descending = $true }, ownership_group
)
$oracleRuntimeRequiredGroups = @($oracleGroupSummary | Where-Object { $_.required_on_oracle })
$oracleRuntimeRequiredKnownGiB = @($oracleRuntimeRequiredGroups | Measure-Object -Property known_size_gib -Sum).Sum
if ($null -eq $oracleRuntimeRequiredKnownGiB) { $oracleRuntimeRequiredKnownGiB = 0 }
$oracleNonRuntimeGroups = @($oracleGroupSummary | Where-Object { -not $_.required_on_oracle })
$oracleNonRuntimeKnownGiB = @($oracleNonRuntimeGroups | Measure-Object -Property known_size_gib -Sum).Sum
if ($null -eq $oracleNonRuntimeKnownGiB) { $oracleNonRuntimeKnownGiB = 0 }
$oracleSafeNowGroups = @($oracleGroupSummary | Where-Object { -not $_.required_on_oracle -and $_.safe_to_delete_now })
$oracleSafeNowKnownGiB = @($oracleSafeNowGroups | Measure-Object -Property known_size_gib -Sum).Sum
if ($null -eq $oracleSafeNowKnownGiB) { $oracleSafeNowKnownGiB = 0 }
$oracleReviewRequiredGroups = @($oracleGroupSummary | Where-Object { -not $_.required_on_oracle -and -not $_.safe_to_delete_now })
$oracleReviewRequiredKnownGiB = @($oracleReviewRequiredGroups | Measure-Object -Property known_size_gib -Sum).Sum
if ($null -eq $oracleReviewRequiredKnownGiB) { $oracleReviewRequiredKnownGiB = 0 }
$oracleRuntimeKeepGroupNames = @($oracleRuntimeRequiredGroups | Sort-Object -Property known_size_gib -Descending | ForEach-Object { [string]$_.ownership_group })
$oracleCloudOmitPriorityGroupNames = @($oracleDeletePriority | ForEach-Object { [string]$_.ownership_group })

$report = [pscustomobject]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    workspace_root = $workspaceRoot
    local = [pscustomobject]@{
        safe_delete_count = $safeLocalFindings.Count
        safe_delete_bytes = [int64]$safeLocalBytes
        safe_delete_gib = Convert-ToGiB -Bytes ([double]$safeLocalBytes)
        category_summary = $localCategorySummary
        recommended_delete_order = $localRecommendedOrder
        findings = $safeLocalFindings
    }
    oracle = [pscustomobject]@{
        summary = $oracleSummary
        runtime_required_group_count = @($oracleRuntimeRequiredGroups).Count
        runtime_required_known_gib = [math]::Round([double]$oracleRuntimeRequiredKnownGiB, 6)
        non_runtime_group_count = @($oracleNonRuntimeGroups).Count
        non_runtime_known_gib = [math]::Round([double]$oracleNonRuntimeKnownGiB, 6)
        safe_now_group_count = @($oracleSafeNowGroups).Count
        safe_now_known_gib = [math]::Round([double]$oracleSafeNowKnownGiB, 6)
        review_required_group_count = @($oracleReviewRequiredGroups).Count
        review_required_known_gib = [math]::Round([double]$oracleReviewRequiredKnownGiB, 6)
        runtime_keep_group_names = $oracleRuntimeKeepGroupNames
        cloud_omit_priority_group_names = $oracleCloudOmitPriorityGroupNames
        candidate_cleanup_items = $oracleCandidateDelete
        review_items = $oracleReviewDelete
        keep_runtime_items = $oracleRuntimeKeep
        group_summary = $oracleGroupSummary
        delete_priority = $oracleDeletePriority
        review_targets = if ($null -ne $oracleCleanupPlan) { @($oracleCleanupPlan.review_targets) } else { @() }
    }
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$jsonPath = Join-Path $OutDir "storage-hygiene-report.json"
$mdPath = Join-Path $OutDir "storage-hygiene-report.md"
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine("# Storage Hygiene Report")
[void]$md.AppendLine()
[void]$md.AppendLine("- generated_at: $($report.generated_at)")
[void]$md.AppendLine("- workspace_root: $($report.workspace_root)")
[void]$md.AppendLine("- local_safe_delete_count: $($report.local.safe_delete_count)")
[void]$md.AppendLine("- local_safe_delete_gib: $($report.local.safe_delete_gib)")
[void]$md.AppendLine("- oracle_remote_host: $($report.oracle.summary.remote_host)")
[void]$md.AppendLine("- oracle_root_use_pct: $($report.oracle.summary.root_use_pct)")
[void]$md.AppendLine("- oracle_root_avail: $($report.oracle.summary.root_avail)")
[void]$md.AppendLine("- oracle_candidate_cleanup_gib: $($report.oracle.summary.candidate_cleanup_gib)")
[void]$md.AppendLine("- oracle_review_target_group: $($report.oracle.summary.review_target_group)")
[void]$md.AppendLine("- oracle_review_target_gib: $($report.oracle.summary.review_target_gib)")
[void]$md.AppendLine("- oracle_backup_retention_gib: $($report.oracle.summary.backup_retention_gib)")
[void]$md.AppendLine("- oracle_restore_gap_gib: $($report.oracle.summary.restore_gap_gib)")
[void]$md.AppendLine("- oracle_remediation_outcome: $($report.oracle.summary.remediation_outcome)")
[void]$md.AppendLine("- oracle_postgres_wal_pressure_status: $($report.oracle.summary.postgres_wal_pressure_status)")
[void]$md.AppendLine("- oracle_postgres_wal_pressure_summary: $($report.oracle.summary.postgres_wal_pressure_summary)")
[void]$md.AppendLine("- oracle_postgres_wal_pressure_recommended_action: $($report.oracle.summary.postgres_wal_pressure_recommended_action)")
[void]$md.AppendLine("- oracle_postgres_wal_safe_limit_recommendation_gib: $($report.oracle.summary.postgres_wal_safe_limit_recommendation_gib)")
[void]$md.AppendLine("- oracle_postgres_wal_gib: $($report.oracle.summary.postgres_wal_gib)")
[void]$md.AppendLine("- oracle_electric_slot_name: $($report.oracle.summary.electric_slot_name)")
[void]$md.AppendLine("- oracle_electric_slot_active: $($report.oracle.summary.electric_slot_active)")
[void]$md.AppendLine("- oracle_electric_slot_retained_wal_gib: $($report.oracle.summary.electric_slot_retained_wal_gib)")
[void]$md.AppendLine("- oracle_wal_slot_mode: $($report.oracle.summary.wal_slot_mode)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_status: $($report.oracle.summary.synthetic_message_pressure_status)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_summary: $($report.oracle.summary.synthetic_message_pressure_summary)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_total_dupes: $($report.oracle.summary.synthetic_message_pressure_total_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_maintenance_summary_dupes: $($report.oracle.summary.synthetic_message_pressure_maintenance_summary_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_curator_card_dupes: $($report.oracle.summary.synthetic_message_pressure_curator_card_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_curator_backlink_dupes: $($report.oracle.summary.synthetic_message_pressure_curator_backlink_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_pressure_ingestion_topology_dupes: $($report.oracle.summary.synthetic_message_pressure_ingestion_topology_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_mode: $($report.oracle.summary.synthetic_message_cleanup_mode)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_command: $($report.oracle.summary.synthetic_message_cleanup_command)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_deleted_total: $($report.oracle.summary.synthetic_message_cleanup_deleted_total)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_before_total_dupes: $($report.oracle.summary.synthetic_message_cleanup_before_total_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_after_total_dupes: $($report.oracle.summary.synthetic_message_cleanup_after_total_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_before_maintenance_summary_dupes: $($report.oracle.summary.synthetic_message_cleanup_before_maintenance_summary_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_before_curator_card_dupes: $($report.oracle.summary.synthetic_message_cleanup_before_curator_card_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_before_curator_backlink_dupes: $($report.oracle.summary.synthetic_message_cleanup_before_curator_backlink_dupes)")
[void]$md.AppendLine("- oracle_synthetic_message_cleanup_before_ingestion_topology_dupes: $($report.oracle.summary.synthetic_message_cleanup_before_ingestion_topology_dupes)")
[void]$md.AppendLine("- oracle_operational_history_pressure_status: $($report.oracle.summary.operational_history_pressure_status)")
[void]$md.AppendLine("- oracle_operational_history_pressure_total_rows: $($report.oracle.summary.operational_history_pressure_total_rows)")
[void]$md.AppendLine("- oracle_operational_history_cleanup_mode: $($report.oracle.summary.operational_history_cleanup_mode)")
[void]$md.AppendLine("- oracle_operational_history_cleanup_command: $($report.oracle.summary.operational_history_cleanup_command)")
[void]$md.AppendLine("- oracle_operational_history_cleanup_deleted_total: $($report.oracle.summary.operational_history_cleanup_deleted_total)")
[void]$md.AppendLine("- oracle_operational_history_cleanup_before_total_rows: $($report.oracle.summary.operational_history_cleanup_before_total_rows)")
[void]$md.AppendLine("- oracle_operational_history_cleanup_after_total_rows: $($report.oracle.summary.operational_history_cleanup_after_total_rows)")
[void]$md.AppendLine("- oracle_runtime_required_group_count: $($report.oracle.runtime_required_group_count)")
[void]$md.AppendLine("- oracle_runtime_required_known_gib: $($report.oracle.runtime_required_known_gib)")
[void]$md.AppendLine("- oracle_non_runtime_group_count: $($report.oracle.non_runtime_group_count)")
[void]$md.AppendLine("- oracle_non_runtime_known_gib: $($report.oracle.non_runtime_known_gib)")
[void]$md.AppendLine("- oracle_safe_now_group_count: $($report.oracle.safe_now_group_count)")
[void]$md.AppendLine("- oracle_safe_now_known_gib: $($report.oracle.safe_now_known_gib)")
[void]$md.AppendLine("- oracle_review_required_group_count: $($report.oracle.review_required_group_count)")
[void]$md.AppendLine("- oracle_review_required_known_gib: $($report.oracle.review_required_known_gib)")
[void]$md.AppendLine("- oracle_runtime_keep_group_names: $(@($report.oracle.runtime_keep_group_names) -join ', ')")
[void]$md.AppendLine("- oracle_cloud_omit_priority_group_names: $(@($report.oracle.cloud_omit_priority_group_names) -join ', ')")
[void]$md.AppendLine()
[void]$md.AppendLine("## Local Reclaim By Category")
[void]$md.AppendLine()
foreach ($category in @($report.local.category_summary)) {
    [void]$md.AppendLine(('- `{0}` | {1} item(s) | {2} GiB' -f $category.category, $category.item_count, $category.size_gib))
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Recommended Local Delete Order")
[void]$md.AppendLine()
foreach ($finding in @($report.local.recommended_delete_order)) {
    [void]$md.AppendLine(('- `{0}` | {1} GiB | {2}' -f $finding.relative_path, $finding.size_gib, $finding.action))
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Local Safe Delete Candidates")
[void]$md.AppendLine()
foreach ($finding in $safeLocalFindings) {
    [void]$md.AppendLine(('- `{0}` | {1} GiB | {2} | {3} | {4}' -f $finding.relative_path, $finding.size_gib, $finding.category, $finding.action, $finding.reason))
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Oracle Runtime Keep Set")
[void]$md.AppendLine()
[void]$md.AppendLine("- runtime-required group count: $($report.oracle.runtime_required_group_count)")
[void]$md.AppendLine("- runtime-required known size: $($report.oracle.runtime_required_known_gib) GiB")
[void]$md.AppendLine("- runtime-required groups: $(@($report.oracle.runtime_keep_group_names) -join ', ')")
[void]$md.AppendLine()
foreach ($item in $oracleRuntimeKeep) {
    [void]$md.AppendLine("- [$($item.item_type)] $($item.name) | group=$($item.ownership_group)")
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Oracle Group Decision Table")
[void]$md.AppendLine()
[void]$md.AppendLine("| ownership_group | deployment_class | required_on_oracle | safe_to_delete_now | size_gib | known_non_runtime_share_pct | delete_precondition |")
[void]$md.AppendLine("| --- | --- | --- | --- | ---: | ---: | --- |")
foreach ($group in @($report.oracle.group_summary)) {
    [void]$md.AppendLine(("| {0} | {1} | {2} | {3} | {4} | {5} | {6} |" -f $group.ownership_group, $group.deployment_class, $group.required_on_oracle, $group.safe_to_delete_now, $group.known_size_gib, $group.share_of_known_non_runtime_pct, $group.delete_precondition))
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Oracle Delete Priority")
[void]$md.AppendLine()
[void]$md.AppendLine("- non-runtime group count: $($report.oracle.non_runtime_group_count)")
[void]$md.AppendLine("- non-runtime known size: $($report.oracle.non_runtime_known_gib) GiB")
[void]$md.AppendLine("- safe-now group count: $($report.oracle.safe_now_group_count)")
[void]$md.AppendLine("- safe-now known size: $($report.oracle.safe_now_known_gib) GiB")
[void]$md.AppendLine("- review-required group count: $($report.oracle.review_required_group_count)")
[void]$md.AppendLine("- review-required known size: $($report.oracle.review_required_known_gib) GiB")
[void]$md.AppendLine("- cloud-omit priority groups: $(@($report.oracle.cloud_omit_priority_group_names) -join ', ')")
[void]$md.AppendLine()
foreach ($group in @($report.oracle.delete_priority)) {
    [void]$md.AppendLine(('- `{0}` | {1} GiB | required_on_oracle={2} | safe_now={3} | {4}' -f $group.ownership_group, $group.known_size_gib, $group.required_on_oracle, $group.safe_to_delete_now, $group.recommended_action))
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Oracle Candidate Cleanup")
[void]$md.AppendLine()
foreach ($item in $oracleCandidateDelete) {
    [void]$md.AppendLine("- [$($item.item_type)] $($item.name) | $($item.size_gib) GiB | group=$($item.ownership_group)")
}
[void]$md.AppendLine()
[void]$md.AppendLine("## Oracle Review Cleanup Scope")
[void]$md.AppendLine()
foreach ($target in @($report.oracle.review_targets)) {
    [void]$md.AppendLine(('- `{0}` | {1} GiB | {2}' -f $target.ownership_group, $target.known_size_gib, $target.recommended_action))
}

$md.ToString() | Set-Content -LiteralPath $mdPath
Write-Output "[storage-hygiene-report] local_safe_delete_gib=$($report.local.safe_delete_gib) oracle_review_target=$($report.oracle.summary.review_target_group) oracle_restore_gap_gib=$($report.oracle.summary.restore_gap_gib)"
