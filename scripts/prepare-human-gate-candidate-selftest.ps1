$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('omnyid-gate-candidate-' + [guid]::NewGuid().ToString('N'))
$repo = Join-Path $fixture 'repo'
$docs = Join-Path $repo 'Documents/issues/wedding planner'
New-Item -ItemType Directory -Path $docs -Force | Out-Null
foreach ($name in @('email-worker-security-review.html','human-review-form.html','release-gate-control.html','gate-execution.js','gate-execution.css','gate-execution-configs.js')) {
    Set-Content -LiteralPath (Join-Path $docs $name) -Value 'synthetic review fixture' -Encoding utf8
}
git -C $repo init --quiet
git -C $repo add -- .
git -C $repo -c user.name=Fixture -c user.email=fixture@example.test commit --quiet -m fixture
if ($LASTEXITCODE -ne 0) { throw 'Could not create fixture commit.' }
$sha = (git -C $repo rev-parse HEAD).Trim()
$prepare = Join-Path $PSScriptRoot 'prepare-human-gate-candidate.ps1'
function Must-Reject([scriptblock]$Action) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Expected candidate preparation to fail closed.' }
}
Must-Reject { & $prepare -RepositoryRoot $repo -ExpectedCommit ('0' * 40) -OutputDirectory (Join-Path $fixture 'wrong-sha') }
Set-Content -LiteralPath (Join-Path $repo 'untracked.txt') -Value 'uncommitted source'
Must-Reject { & $prepare -RepositoryRoot $repo -ExpectedCommit $sha -OutputDirectory (Join-Path $fixture 'dirty') }
Remove-Item -LiteralPath (Join-Path $repo 'untracked.txt')
$log = Join-Path $fixture 'check.log'
Set-Content -LiteralPath $log -Value 'synthetic evidence; not an actual passed check'
$output = Join-Path $fixture 'bundle'
& $prepare -RepositoryRoot $repo -ExpectedCommit $sha -OutputDirectory $output -EvidenceFiles @($log)
$manifest = Get-Content -LiteralPath (Join-Path $output 'candidate.json') -Raw | ConvertFrom-Json
if ($manifest.source_commit -ne $sha -or $manifest.hosted_runtime_commit -or $manifest.status -ne 'review_candidate_not_release_approval') { throw 'Candidate overstated authority.' }
if ($manifest.supporting_artifacts[0].status -ne 'attached_not_independently_verified') { throw 'Evidence promoted without verification.' }
foreach ($artifact in @($manifest.workbooks) + @($manifest.supporting_artifacts) + @($manifest.source_archive)) {
    $actual = (Get-FileHash -LiteralPath (Join-Path $output $artifact.path) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $artifact.sha256) { throw 'Artifact digest mismatch.' }
}
if ((Get-Content -LiteralPath (Join-Path $output 'START-HERE.html') -Raw) -notmatch "commit=$sha") { throw 'Workbook links are not bound to candidate.' }
Must-Reject { & $prepare -RepositoryRoot $repo -ExpectedCommit $sha -OutputDirectory $output }
Write-Host 'PASS: wrong SHA, dirty source and overwrite refused; archive/workbook/log digests and candidate links verified.'
Write-Host "Disposable fixture retained at $fixture"
