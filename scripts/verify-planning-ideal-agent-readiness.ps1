param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
    [string]$EvidenceDirectory,
    [string]$HumanReviewDirectory,
    [switch]$SkipBrowser,
    [switch]$SkipWedding
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if ([string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
    $EvidenceDirectory = Join-Path $root "target/planning-ideal-agent-readiness"
}
$evidenceRoot = [System.IO.Path]::GetFullPath($EvidenceDirectory)
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
if ([string]::IsNullOrWhiteSpace($env:CARGO_BUILD_JOBS)) {
    $env:CARGO_BUILD_JOBS = "2"
}

function Get-RelativePath {
    param([string]$Path)
    $rootWithSeparator = $root.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $rootUri = [Uri]$rootWithSeparator
    $pathUri = [Uri]([System.IO.Path]::GetFullPath($Path))
    return [Uri]::UnescapeDataString($rootUri.MakeRelativeUri($pathUri).ToString()).Replace("\", "/")
}

function Invoke-ReadinessCheck {
    param([string]$Name, [scriptblock]$Action)
    $slug = $Name.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
    $logPath = Join-Path $evidenceRoot "$slug.log"
    Write-Host "Running $Name"
    try {
        $lines = @(& $Action 2>&1 | ForEach-Object { $_.ToString() })
        [System.IO.File]::WriteAllLines($logPath, $lines)
        if ($LASTEXITCODE -ne 0) { throw "$Name exited with code $LASTEXITCODE" }
        return [ordered]@{
            name = $Name
            status = "passed"
            log = Get-RelativePath $logPath
            detail = $null
        }
    }
    catch {
        [System.IO.File]::WriteAllText($logPath, $_.Exception.ToString())
        return [ordered]@{
            name = $Name
            status = "failed"
            log = Get-RelativePath $logPath
            detail = $_.Exception.Message
        }
    }
}

function Missing-Check {
    param([string]$Name, [string]$Detail)
    return [ordered]@{ name = $Name; status = "missing"; log = $null; detail = $Detail }
}

function Get-ArtifactDigest {
    $pattern = '^(' +
        'config/planning_ideal_agent_evaluation_v1\.json|' +
        'schemas/planning/|' +
        'src/planning_intelligence/|' +
        'src/server/planning_|' +
        'tests/planning_|' +
        'tests/fixtures/planning/|' +
        'solid-ui/src/lib/planning|' +
        'solid-ui/src/components/DecisionCard\.tsx|' +
        'solid-ui/src/components/renderers/A2UIRenderer\.tsx|' +
        'solid-ui/tests/(planning-|wedding-planning-|wedding-preference-conflict)|' +
        'solid-ui/Dockerfile|' +
        'docker-compose\.oracle|' +
        '\.env\.example|' +
        'scripts/verify-planning-ideal-agent-readiness\.ps1' +
        ')'
    $files = @(git -C $root ls-files) |
        Where-Object { $_.Replace("\", "/") -match $pattern } |
        Sort-Object -Unique
    $inputs = foreach ($relative in $files) {
        $absolute = Join-Path $root $relative
        if (Test-Path -LiteralPath $absolute -PathType Leaf) {
            $hash = (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash.ToLowerInvariant()
            "$($relative.Replace('\', '/'))=$hash"
        }
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($inputs -join "`n") + "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
    }
    finally { $sha.Dispose() }
    return [ordered]@{ digest = $digest; inputs = @($inputs) }
}

function Get-TaskStatus {
    param([string]$TaskId)
    $lines = Get-Content -LiteralPath (Join-Path $root ".agent/TASKS.yaml")
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -notmatch "^\s*- id: $([regex]::Escape($TaskId))\s*$") { continue }
        for ($cursor = $index + 1; $cursor -lt [Math]::Min($index + 12, $lines.Count); $cursor++) {
            if ($lines[$cursor] -match '^\s+status:\s+(\S+)\s*$') { return $Matches[1] }
        }
    }
    return "missing"
}

function Read-HumanReview {
    param([string]$Dimension, [string]$Head)
    if ([string]::IsNullOrWhiteSpace($HumanReviewDirectory)) {
        return [ordered]@{ dimension = $Dimension; status = "missing"; evidence = $null; detail = "no human-review directory supplied" }
    }
    $path = Join-Path $HumanReviewDirectory "$Dimension.json"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return [ordered]@{ dimension = $Dimension; status = "missing"; evidence = $path; detail = "review record is absent" }
    }
    try {
        $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        $recordedAt = [DateTimeOffset]::MinValue
        $validTime = [DateTimeOffset]::TryParse([string]$record.recorded_at, [ref]$recordedAt)
        $valid = $record.schema_version -eq "planning.ideal_agent_human_review.v1" -and
            $record.dimension -eq $Dimension -and
            $record.status -eq "verified" -and
            $record.commit_sha -eq $Head -and
            -not [string]::IsNullOrWhiteSpace([string]$record.reviewer) -and
            $validTime -and
            -not [string]::IsNullOrWhiteSpace([string]$record.evidence_reference) -and
            ([string]$record.evidence_sha256) -match '^[0-9a-fA-F]{64}$'
        if (-not $valid) { throw "schema, dimension, status, commit, reviewer, timestamp or evidence binding is invalid" }
        return [ordered]@{
            dimension = $Dimension
            status = "verified"
            evidence = Get-RelativePath (Resolve-Path -LiteralPath $path).Path
            sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
            detail = $null
        }
    }
    catch {
        return [ordered]@{ dimension = $Dimension; status = "invalid"; evidence = $path; detail = $_.Exception.Message }
    }
}

$head = (git -C $root rev-parse HEAD).Trim()
$dirtyPaths = @(git -C $root status --porcelain)
$manifest = Get-Content -LiteralPath (Join-Path $root "config/planning_ideal_agent_evaluation_v1.json") -Raw | ConvertFrom-Json
$checks = @()
$checks += Invoke-ReadinessCheck "evaluation manifest" {
    Push-Location $root
    try { cargo test --test planning_ideal_agent_evaluation -- --nocapture }
    finally { Pop-Location }
}
$checks += Invoke-ReadinessCheck "planning intelligence library" {
    Push-Location $root
    try { cargo test --lib planning_intelligence -- --nocapture }
    finally { Pop-Location }
}
$checks += Invoke-ReadinessCheck "ClamAV parser boundaries" {
    Push-Location $root
    try { cargo test --lib gateway::clamav -- --nocapture }
    finally { Pop-Location }
}
$checks += Invoke-ReadinessCheck "migration catalog" {
    Push-Location $root
    try { cargo test --lib migration_catalog_matches_current_embedded_set -- --nocapture }
    finally { Pop-Location }
}

$databaseUrl = [string]$env:TEST_DATABASE_URL
if ($databaseUrl -match '^postgres(?:ql)?://[^@]+@127\.0\.0\.1:\d+/omnyid_test$') {
    $checks += Invoke-ReadinessCheck "disposable Postgres planning APIs" {
        Push-Location $root
        try {
            cargo test --test planning_constraint_api --test planning_constraint_capture_api `
                --test planning_constraint_evaluation_api --test planning_constraint_intervention_api `
                --test planning_cost_tradeoff_api --test planning_milestone_api `
                --test planning_vendor_change_api -- --nocapture
        }
        finally { Pop-Location }
    }
}
else {
    $checks += Missing-Check "disposable Postgres planning APIs" "TEST_DATABASE_URL must name local 127.0.0.1/omnyid_test"
}

$clamdHost = [string]$env:CLAMD_HOST
if ($clamdHost -match '^127\.0\.0\.1:\d+$') {
    $checks += Invoke-ReadinessCheck "live disposable ClamAV" {
        Push-Location $root
        try { cargo test --test clamav_live -- --nocapture }
        finally { Pop-Location }
    }
}
else {
    $checks += Missing-Check "live disposable ClamAV" "CLAMD_HOST must name a local 127.0.0.1 endpoint"
}

$checks += Invoke-ReadinessCheck "TypeScript SDK" {
    Push-Location (Join-Path $root "typescript-sdk")
    try { npm run typecheck; if ($LASTEXITCODE -eq 0) { npm run build } }
    finally { Pop-Location }
}
$checks += Invoke-ReadinessCheck "Solid typecheck and line budgets" {
    Push-Location (Join-Path $root "solid-ui")
    try { npm run typecheck; if ($LASTEXITCODE -eq 0) { npm run test:line-budget } }
    finally { Pop-Location }
}

if ($SkipWedding) {
    $checks += Missing-Check "full wedding tests" "-SkipWedding supplied"
    $checks += Missing-Check "Solid production build" "-SkipWedding supplied"
}
else {
    $checks += Invoke-ReadinessCheck "full wedding tests" {
        Push-Location (Join-Path $root "solid-ui")
        try { npm run test:wedding:ci }
        finally { Pop-Location }
    }
    $checks += Invoke-ReadinessCheck "Solid production build" {
        Push-Location (Join-Path $root "solid-ui")
        try { npm run build }
        finally { Pop-Location }
    }
}

if ($SkipBrowser) {
    $checks += Missing-Check "focused browser accessibility" "-SkipBrowser supplied"
}
else {
    $checks += Invoke-ReadinessCheck "focused browser accessibility" {
        Push-Location (Join-Path $root "solid-ui")
        try {
            npm run test:wedding:e2e -- tests/e2e/wedding-planning-constraint-capture.spec.ts `
                tests/e2e/quotation-vendor-response.spec.ts
        }
        finally { Pop-Location }
    }
}

$checks += Invoke-ReadinessCheck "Oracle compose structure" {
    foreach ($relative in @(
        "docker-compose.oracle.yml",
        "docker-compose.oracle.minimal.yml",
        "docker-compose.oracle.quic.yml",
        "docker-compose.oracle.staging.yml"
    )) {
        docker compose -f (Join-Path $root $relative) config --no-interpolate -q
        if ($LASTEXITCODE -ne 0) { throw "invalid compose structure: $relative" }
    }
}

$humanReviews = @($manifest.human_review_dimensions | ForEach-Object { Read-HumanReview ([string]$_) $head })
$releaseBlockers = @($manifest.rollout.release_blockers | ForEach-Object {
    [ordered]@{ task = [string]$_; status = Get-TaskStatus ([string]$_) }
})
$artifact = Get-ArtifactDigest
$machinePassed = $dirtyPaths.Count -eq 0 -and @($checks | Where-Object { $_.status -ne "passed" }).Count -eq 0
$humanPassed = @($humanReviews | Where-Object { $_.status -ne "verified" }).Count -eq 0
$releaseTasksPassed = @($releaseBlockers | Where-Object { $_.status -notin @("review", "complete") }).Count -eq 0
$report = [ordered]@{
    schema_version = "planning.ideal_agent_readiness.v1"
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    commit_sha = $head
    worktree_clean = $dirtyPaths.Count -eq 0
    artifact_digest = $artifact.digest
    artifact_inputs = $artifact.inputs
    machine_status = if ($machinePassed) { "verified" } else { "blocked" }
    human_status = if ($humanPassed) { "verified" } else { "blocked" }
    release_status = if ($machinePassed -and $humanPassed -and $releaseTasksPassed) { "eligible_for_explicit_release_review" } else { "blocked" }
    checks = $checks
    human_reviews = $humanReviews
    release_blockers = $releaseBlockers
    flags_changed = $false
    deployment_performed = $false
}
$reportPath = Join-Path $evidenceRoot "readiness.json"
[System.IO.File]::WriteAllText(
    $reportPath,
    ($report | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
)
Write-Host "Readiness report: $reportPath"
Write-Host "Machine: $($report.machine_status); human: $($report.human_status); release: $($report.release_status)"
if (-not $machinePassed) { exit 1 }
