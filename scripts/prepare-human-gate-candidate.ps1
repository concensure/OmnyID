param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')),
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedCommit,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string[]]$EvidenceFiles = @()
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
function Git-Read([string[]]$Arguments) {
    $result = & git -C $root @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Git candidate read failed.' }
    return $result
}
$head = (Git-Read @('rev-parse', 'HEAD')).Trim()
if ($head -ne $ExpectedCommit.ToLowerInvariant()) { throw 'HEAD does not match ExpectedCommit.' }
if (-not [string]::IsNullOrWhiteSpace((@(Git-Read @('status', '--porcelain', '--untracked-files=normal')) -join "`n"))) {
    throw 'Candidate checkout must be clean. Commit changes and preserve unrelated work in its own checkout.'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Output directory already exists; choose a new directory to preserve prior evidence.' }
$reports = @()
$names = @{}
foreach ($file in $EvidenceFiles) {
    $resolved = (Resolve-Path -LiteralPath $file).Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw 'Evidence must be an existing file.' }
    $name = [IO.Path]::GetFileName($resolved)
    if ($names.ContainsKey($name)) { throw 'Evidence filenames must be unique.' }
    $names[$name] = $true
    $reports += @{ source = $resolved; filename = $name; sha256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash.ToLowerInvariant() }
}
New-Item -ItemType Directory -Path $output | Out-Null
$workbookDir = New-Item -ItemType Directory -Path (Join-Path $output 'workbooks')
$evidenceDir = New-Item -ItemType Directory -Path (Join-Path $output 'evidence')
$archive = Join-Path $output 'source.zip'
Git-Read @('archive', '--format=zip', "--output=$archive", $head) | Out-Null
$pages = @('email-worker-security-review.html', 'human-review-form.html', 'release-gate-control.html')
$assets = @('gate-execution.js', 'gate-execution.css', 'gate-execution-configs.js')
$workbooks = @()
foreach ($name in @($pages + $assets)) {
    $relative = "Documents/issues/wedding planner/$name"
    $target = Join-Path $workbookDir $name
    $content = @(Git-Read @('show', "${head}:$relative")) -join "`n"
    [IO.File]::WriteAllText($target, "$content`n", [Text.UTF8Encoding]::new($false))
    $workbooks += @{ path = "workbooks/$name"; sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
}
foreach ($report in $reports) { Copy-Item -LiteralPath $report.source -Destination (Join-Path $evidenceDir $report.filename) }
$manifest = [ordered]@{
    schema_version = 'omnyid.human_gate_candidate.v1'
    source_commit = $head
    source_tree = (Git-Read @('rev-parse', 'HEAD^{tree}')).Trim()
    created_at = [DateTimeOffset]::UtcNow.ToString('o')
    status = 'review_candidate_not_release_approval'
    hosted_runtime_commit = $null
    source_archive = @{ path = 'source.zip'; sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() }
    workbooks = $workbooks
    supporting_artifacts = @($reports | ForEach-Object { @{ path = "evidence/$($_.filename)"; sha256 = $_.sha256; status = 'attached_not_independently_verified' } })
    limits = @('No deployment or hosted identity verification is performed.', 'Attached logs are hashed, not promoted to passes or human approvals.', 'Workbook autonomous blockers remain in force.', 'Worker and gateway versions, runtime flags and external configuration require separate evidence.')
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'candidate.json') -Encoding utf8
$links = ($pages | ForEach-Object { '<li><a href="workbooks/' + $_ + '?commit=' + $head + '">' + $_ + '</a></li>' }) -join "`n"
$index = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frozen review candidate</title><h1>Frozen review candidate</h1><p>Source commit: <code>' + $head + '</code></p><p>Confirm the hosted runtime independently before testing. This package does not approve or deploy the release. Existing automation blockers remain open.</p><ul>' + $links + '</ul><p>Use candidate.json for archive, workbook and supporting-artifact digests. Do not put credentials, raw mail or secure links in evidence.</p></html>'
[IO.File]::WriteAllText((Join-Path $output 'START-HERE.html'), $index, [Text.UTF8Encoding]::new($false))
Write-Host "Prepared candidate $head at $output"
