param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
    [string]$EvidenceDirectory,
    [switch]$SkipBrowser,
    [switch]$SkipWedding,
    [string]$AccuracyEvidencePath,
    [string]$ClamAvEvidencePath,
    [string]$ProviderEvidencePath,
    [string]$SecurityPrivacyReviewPath,
    [string]$AccessibilityReviewPath,
    [string]$CoupleUsabilityEvidencePath,
    [string]$VendorUsabilityEvidencePath,
    [string]$WordingReviewPath,
    [string]$HostedShadowEvidencePath,
    [string]$CohortEvidencePath
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$baselineCommit = "a5bb2d9"
if ([string]::IsNullOrWhiteSpace($env:CARGO_BUILD_JOBS)) {
    $env:CARGO_BUILD_JOBS = "2"
}
if ([string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
    $EvidenceDirectory = Join-Path $root "target/quotation-vendor-portal-readiness"
}
$evidenceRoot = [System.IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function Invoke-ReadinessCheck {
    param([string]$Name, [scriptblock]$Action)
    Write-Host "Running $Name"
    try {
        & $Action | Out-Host
        return [ordered]@{ name = $Name; status = "passed"; detail = $null }
    }
    catch {
        return [ordered]@{ name = $Name; status = "failed"; detail = $_.Exception.Message }
    }
}

function Get-RelativePath {
    param([string]$Path)
    return [System.IO.Path]::GetRelativePath($root, $Path).Replace("\", "/")
}

function Get-ArtifactDigest {
    $tracked = @(git -C $root ls-files)
    $untracked = @(git -C $root ls-files --others --exclude-standard)
    $pattern = '^(src/quotation/|src/server/quotation|src/db/quotation|src/db/migration_catalog\.rs$|tests/quotation|tests/fixtures/quotation/|solid-ui/src/.*quotation|solid-ui/src/components/vendor-response/|solid-ui/tests/.*quotation|solid-ui/tests/e2e/quotation|typescript-sdk/src/.*quotation|typescript-sdk/tests/quotation|scripts/verify-quotation|Documents/design/wedding planner/wedding-quotation|Documents/verification/quotation|Documents/security/quotation)'
    $files = @($tracked + $untracked) |
        Where-Object { $_ -match $pattern } |
        Sort-Object -Unique
    $lines = foreach ($relative in $files) {
        $absolute = Join-Path $root $relative
        if (Test-Path -LiteralPath $absolute -PathType Leaf) {
            $hash = (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant()
            "$($relative.Replace('\', '/'))=$hash"
        }
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n") + "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
    return [ordered]@{ digest = $digest; inputs = @($lines) }
}

function Test-Wed225LineBudget {
    $generatedDependencyLockfiles = @("Cargo.lock", "package-lock.json")
    $binaryEvidenceExtensions = @(".png", ".jpg", ".jpeg", ".gif", ".webp")
    $changed = @(git -C $root diff --name-status $baselineCommit --)
    $changed += @(git -C $root ls-files --others --exclude-standard | ForEach-Object { "A`t$_" })
    foreach ($line in $changed) {
        $parts = $line -split "`t"
        if ($parts.Count -lt 2) { continue }
        $status = $parts[0]
        $relative = $parts[-1]
        if ($relative.Replace("\", "/").StartsWith(".agent/")) { continue }
        if ($generatedDependencyLockfiles -contains [System.IO.Path]::GetFileName($relative)) { continue }
        if ($binaryEvidenceExtensions -contains [System.IO.Path]::GetExtension($relative).ToLowerInvariant()) { continue }
        $absolute = Join-Path $root $relative
        if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) { continue }
        $current = [System.IO.File]::ReadAllLines($absolute).Count
        if ($status -eq "A" -and $current -gt 999) {
            throw "$relative is new after $baselineCommit and exceeds 999 lines ($current)"
        }
        if ($status -eq "M") {
            $priorText = git -C $root show "${baselineCommit}:$relative" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $prior = @($priorText).Count
                if ($prior -gt 999 -and $current -gt $prior) {
                    throw "$relative was already oversized and grew from $prior to $current lines"
                }
            }
        }
    }
}

function Read-SignoffGate {
    param([string]$Gate, [string]$Path, [string]$Head)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return [ordered]@{ gate = $Gate; status = "missing"; evidence = $null; detail = "no evidence path supplied" }
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ gate = $Gate; status = "missing"; evidence = $Path; detail = "evidence file does not exist" }
    }
    try {
        $record = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
        $recordedAt = [DateTimeOffset]::MinValue
        $timestampValid = [DateTimeOffset]::TryParse([string]$record.recorded_at, [ref]$recordedAt)
        $valid = $record.schema_version -eq "quotation.external_evidence.v1" -and
            $record.gate -eq $Gate -and $record.status -eq "verified" -and
            $record.commit_sha -eq $Head -and
            -not [string]::IsNullOrWhiteSpace([string]$record.reviewer) -and
            $timestampValid -and
            -not [string]::IsNullOrWhiteSpace([string]$record.evidence_reference) -and
            ([string]$record.evidence_sha256) -match '^[0-9a-fA-F]{64}$'
        if (-not $valid) { throw "schema, gate, status, commit, reviewer, timestamp, or supporting evidence binding is invalid" }
        return [ordered]@{
            gate = $Gate
            status = "verified"
            evidence = (Get-RelativePath (Resolve-Path -LiteralPath $Path).Path)
            sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
            supporting_evidence = [string]$record.evidence_reference
            supporting_evidence_sha256 = ([string]$record.evidence_sha256).ToLowerInvariant()
            detail = $null
        }
    }
    catch {
        return [ordered]@{ gate = $Gate; status = "invalid"; evidence = $Path; detail = $_.Exception.Message }
    }
}

$head = (git -C $root rev-parse HEAD).Trim()
$localChecks = @()
$localChecks += Invoke-ReadinessCheck "quotation verifier" {
    if ($SkipBrowser) {
        & (Join-Path $root "scripts/verify-quotation-readiness.ps1") -RepositoryRoot $root
    }
    else {
        & (Join-Path $root "scripts/verify-quotation-readiness.ps1") -RepositoryRoot $root -IncludeBrowser
    }
    if ($LASTEXITCODE -ne 0) { throw "quotation verifier exited with code $LASTEXITCODE" }
}
$localChecks += Invoke-ReadinessCheck "migration catalog" {
    Push-Location $root
    try {
        cargo test --lib migration_catalog_matches_current_embedded_set
        if ($LASTEXITCODE -ne 0) { throw "migration catalog exited with code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}
if ($SkipWedding) {
    $localChecks += [ordered]@{ name = "full wedding tests"; status = "skipped"; detail = "-SkipWedding supplied" }
    $localChecks += [ordered]@{ name = "Solid production build"; status = "skipped"; detail = "-SkipWedding supplied" }
}
else {
    $localChecks += Invoke-ReadinessCheck "full wedding tests" {
        Push-Location (Join-Path $root "solid-ui")
        try {
            npm run test:wedding
            if ($LASTEXITCODE -ne 0) { throw "full wedding tests exited with code $LASTEXITCODE" }
        }
        finally { Pop-Location }
    }
    $localChecks += Invoke-ReadinessCheck "Solid production build" {
        Push-Location (Join-Path $root "solid-ui")
        try {
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "Solid production build exited with code $LASTEXITCODE" }
        }
        finally { Pop-Location }
    }
}
$localChecks += Invoke-ReadinessCheck "WED-225 line budget" { Test-Wed225LineBudget }

$postgresStatus = if ([string]::IsNullOrWhiteSpace($env:TEST_DATABASE_URL)) { "missing" } else { "verified" }
$externalGates = @(
    [ordered]@{
        gate = "disposable_postgres"
        status = $postgresStatus
        evidence = if ($postgresStatus -eq "verified") { "TEST_DATABASE_URL-backed API tests in this run" } else { $null }
        detail = if ($postgresStatus -eq "missing") { "TEST_DATABASE_URL was not set; conditional HTTP tests did not exercise Postgres" } else { $null }
    },
    (Read-SignoffGate "accuracy_corpus" $AccuracyEvidencePath $head),
    (Read-SignoffGate "clamav_clean_scan" $ClamAvEvidencePath $head),
    (Read-SignoffGate "allowlisted_provider_smoke" $ProviderEvidencePath $head),
    (Read-SignoffGate "security_privacy_review" $SecurityPrivacyReviewPath $head),
    (Read-SignoffGate "hosted_accessibility_review" $AccessibilityReviewPath $head),
    (Read-SignoffGate "couple_usability" $CoupleUsabilityEvidencePath $head),
    (Read-SignoffGate "vendor_usability" $VendorUsabilityEvidencePath $head),
    (Read-SignoffGate "booking_permission_wording" $WordingReviewPath $head),
    (Read-SignoffGate "hosted_shadow" $HostedShadowEvidencePath $head),
    (Read-SignoffGate "allowlisted_cohort" $CohortEvidencePath $head)
)
if ($SkipBrowser) {
    $externalGates += [ordered]@{ gate = "local_browser_accessibility"; status = "missing"; evidence = $null; detail = "-SkipBrowser supplied" }
}

$artifact = Get-ArtifactDigest
$localFailure = @($localChecks | Where-Object { $_.status -eq "failed" }).Count -gt 0
$localMissing = @($localChecks | Where-Object { $_.status -eq "skipped" }).Count -gt 0
$externalMissing = @($externalGates | Where-Object { $_.status -ne "verified" }).Count -gt 0
$readiness = if ($localFailure) { "failed" } elseif ($localMissing -or $externalMissing) { "blocked" } else { "verified" }
$manifest = [ordered]@{
    schema_version = "quotation.vendor_portal.readiness.v1"
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    head = $head
    baseline_commit = $baselineCommit
    readiness_status = $readiness
    artifact_digest_sha256 = $artifact.digest
    release_flags_changed = $false
    live_provider_called = $false
    local_checks = $localChecks
    external_gates = $externalGates
    artifact_inputs = $artifact.inputs
}
$manifestPath = Join-Path $evidenceRoot "quotation-vendor-portal-readiness.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8
Write-Host "Readiness: $readiness"
Write-Host "Artifact digest: $($artifact.digest)"
Write-Host "Evidence manifest: $manifestPath"
if ($localFailure) { exit 1 }
