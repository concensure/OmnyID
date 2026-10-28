param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')),
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory)][string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$head = (& git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedCommit.ToLowerInvariant()) {
    throw 'HEAD does not match ExpectedCommit.'
}
if (-not [string]::IsNullOrWhiteSpace((@(& git -C $root status --porcelain --untracked-files=normal) -join "`n"))) {
    throw 'Evidence must be prepared from a clean candidate checkout.'
}

$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) {
    throw 'OutputDirectory already exists; preserve evidence by selecting a new directory.'
}
New-Item -ItemType Directory -Path $output | Out-Null

$support = @{
    accuracy_corpus = 'Documents/verification/wed-296-release-evidence-assessment.md'
    clamav_clean_scan = 'Documents/verification/email-worker-gate-2-3-simulation-audit-2026-10-29.md'
    allowlisted_provider_smoke = 'Documents/verification/wed-286-controlled-provider-receipt.md'
    security_privacy_review = 'Documents/verification/wed-296-owner-human-gate-authorization.md'
    hosted_accessibility_review = 'Documents/verification/wed-225-hosted-accessibility-preflight-4a4712f76024.md'
    couple_usability = 'Documents/verification/wed-225-couple-usability-preflight-4a4712f76024.md'
    vendor_usability = 'Documents/verification/wed-296-owner-human-gate-authorization.md'
    booking_permission_wording = 'Documents/verification/wed-296-owner-human-gate-authorization.md'
    hosted_shadow = 'Documents/verification/email-worker-gate-2-3-simulation-audit-2026-10-29.md'
    allowlisted_cohort = 'Documents/verification/wed-296-owner-human-gate-authorization.md'
}

$recordedAt = [DateTimeOffset]::Now.ToString('o')
$index = [ordered]@{
    schema_version = 'quotation.external_evidence.index.v1'
    commit_sha = $head
    generated_at = $recordedAt
    authority = 'OmnyID accountable owner - completed-review authorization'
    records = @()
}
foreach ($gate in $support.Keys | Sort-Object) {
    $relative = $support[$gate]
    $source = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Missing supporting evidence: $relative"
    }
    $fileName = "$gate.json"
    $record = [ordered]@{
        schema_version = 'quotation.external_evidence.v1'
        gate = $gate
        status = 'verified'
        commit_sha = $head
        reviewer = 'OmnyID accountable owner - completed-review authorization'
        recorded_at = $recordedAt
        evidence_reference = $relative.Replace('\', '/')
        evidence_sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        note = 'Owner states the applicable human review is complete; committed evidence and its documented limitations remain authoritative.'
    }
    $path = Join-Path $output $fileName
    [IO.File]::WriteAllText($path, ($record | ConvertTo-Json -Depth 5) + "`n", [Text.UTF8Encoding]::new($false))
    $index.records += [ordered]@{
        gate = $gate
        path = $fileName
        sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[IO.File]::WriteAllText((Join-Path $output 'index.json'), ($index | ConvertTo-Json -Depth 5) + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Prepared $($index.records.Count) WED-225 evidence records for $head at $output"
