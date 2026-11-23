Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("oracle-runtime-cleanup-execute-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    New-Item -ItemType Directory -Path $tmpRoot -Force | Out-Null
    $cleanupPlanPath = Join-Path $tmpRoot "plan.json"
    $outDir = Join-Path $tmpRoot "out"

    @'
{
  "counts": {
    "candidate_containers": 1,
    "candidate_volumes": 1,
    "candidate_images": 1
  },
  "estimated_reclaim": {
    "candidate_image_gib": 0.12,
    "total_candidate_gib": 0.12
  },
  "commands": {
    "stop_and_remove_containers": "docker rm -f supabase-db",
    "remove_images": "docker image rm supabase/postgres:15.8.1.085",
    "prune_images": "docker image prune -af",
    "prune_builder_cache": "docker builder prune -af",
    "remove_volumes": "docker volume rm coolify-db",
    "prune_unused": "docker system prune -f",
    "review_target_cleanup": "docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085",
    "omnyid_backup_retention_cleanup": "bash -lc 'cleanup-old-backups'",
    "combined_retention_and_top_target_cleanup": "bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
  }
}
'@ | Set-Content -Path $cleanupPlanPath -Encoding ASCII

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -OutDir $outDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected executor script to pass`n$output"
    }

    $text = $output | Out-String
    Assert-Contains -Actual $text -Expected "dry-run containers: docker rm -f supabase-db"
    Assert-Contains -Actual $text -Expected "dry-run images: docker image rm supabase/postgres:15.8.1.085"
    Assert-Contains -Actual $text -Expected "dry-run image_prune: docker image prune -af"
    Assert-Contains -Actual $text -Expected "dry-run builder_prune: docker builder prune -af"
    Assert-Contains -Actual $text -Expected "complete execute=False steps=6"
    $markdown = Get-Content (Join-Path $outDir "oracle-runtime-cleanup-execute.md") -Raw
    Assert-Contains -Actual $markdown -Expected "- include_review_target_cleanup: False"
    Assert-Contains -Actual $markdown -Expected "- skip_host_cleanup: False"
    Assert-Contains -Actual $markdown -Expected "| containers | dry_run | docker rm -f supabase-db |"
    Assert-Contains -Actual $markdown -Expected "| image_prune | dry_run | docker image prune -af |"
    Assert-Contains -Actual $markdown -Expected "| builder_prune | dry_run | docker builder prune -af |"
    Assert-Contains -Actual $markdown -Expected "- planned_candidate_containers:"
    Assert-Contains -Actual $markdown -Expected "- measurement_commands_disk: $ df -h --output=target,size,used,avail,pcent / /var"
    Assert-Contains -Actual $markdown -Expected "- status: dry_run"
    Assert-Contains -Actual $markdown -Expected "docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"

    $outDirReview = Join-Path $tmpRoot "out-review"
    $outputReview = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -OutDir $outDirReview `
        -IncludeReviewTargetCleanup 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected review-target dry-run to pass`n$outputReview"
    }
    $reviewText = $outputReview | Out-String
    Assert-Contains -Actual $reviewText -Expected "dry-run review_target_cleanup: docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
    Assert-Contains -Actual $reviewText -Expected "complete execute=False steps=7"
    $reviewMarkdown = Get-Content (Join-Path $outDirReview "oracle-runtime-cleanup-execute.md") -Raw
    Assert-Contains -Actual $reviewMarkdown -Expected "- include_review_target_cleanup: True"
    Assert-Contains -Actual $reviewMarkdown -Expected "| review_target_cleanup | dry_run | docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085 |"

    $outDirRetention = Join-Path $tmpRoot "out-retention"
    $outputRetention = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -OutDir $outDirRetention `
        -IncludeBackupRetentionCleanup 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected backup-retention dry-run to pass`n$outputRetention"
    }
    $retentionText = $outputRetention | Out-String
    Assert-Contains -Actual $retentionText -Expected "dry-run omnyid_backup_retention_cleanup: bash -lc 'cleanup-old-backups'"
    $retentionMarkdown = Get-Content (Join-Path $outDirRetention "oracle-runtime-cleanup-execute.md") -Raw
    Assert-Contains -Actual $retentionMarkdown -Expected "- include_backup_retention_cleanup: True"
    Assert-Contains -Actual $retentionMarkdown -Expected "| omnyid_backup_retention_cleanup | dry_run | bash -lc 'cleanup-old-backups' |"

    $outDirCombined = Join-Path $tmpRoot "out-combined"
    $outputCombined = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -OutDir $outDirCombined `
        -IncludeCombinedReviewCleanup 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected combined-review dry-run to pass`n$outputCombined"
    }
    $combinedText = $outputCombined | Out-String
    Assert-Contains -Actual $combinedText -Expected "dry-run combined_retention_and_top_target_cleanup: bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085"
    $combinedMarkdown = Get-Content (Join-Path $outDirCombined "oracle-runtime-cleanup-execute.md") -Raw
    Assert-Contains -Actual $combinedMarkdown -Expected "- include_combined_review_cleanup: True"
    Assert-Contains -Actual $combinedMarkdown -Expected "| combined_retention_and_top_target_cleanup | dry_run | bash -lc 'cleanup-old-backups' ; docker rm -f supabase-db ; docker image rm supabase/postgres:15.8.1.085 |"

    $outDirSkipHost = Join-Path $tmpRoot "out-skip-host"
    $outputSkipHost = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -OutDir $outDirSkipHost `
        -SkipHostCleanup 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected skip-host-cleanup dry-run to pass`n$outputSkipHost"
    }
    $skipHostText = $outputSkipHost | Out-String
    Assert-Contains -Actual $skipHostText -Expected "complete execute=False steps=6"
    $skipHostMarkdown = Get-Content (Join-Path $outDirSkipHost "oracle-runtime-cleanup-execute.md") -Raw
    Assert-Contains -Actual $skipHostMarkdown -Expected "- skip_host_cleanup: True"

    $fakeSsh = Join-Path $tmpRoot "fake-ssh.cmd"
    @'
@echo off
setlocal EnableDelayedExpansion
set "args=%*"
echo(!args! | findstr /C:"docker image rm" >nul
if not errorlevel 1 (
  echo Error response from daemon: No such image: supabase/postgres:15.8.1.085
  exit /b 1
)
echo(!args! | findstr /C:"df -h --output=target,size,used,avail,pcent / /var" >nul
if not errorlevel 1 (
  echo Mounted on Size Used Avail Use%%
  echo / 45G 35G 9.7G 79%%
  echo /var 45G 35G 9.7G 79%%
  exit /b 0
)
echo(!args! | findstr /C:"docker system df" >nul
if not errorlevel 1 (
  echo TYPE TOTAL ACTIVE SIZE RECLAIMABLE
  exit /b 0
)
echo ok
exit /b 0
'@ | Set-Content -Path $fakeSsh -Encoding ASCII

    $executeOutDir = Join-Path $tmpRoot "out-execute-missing"
    $outputExecute = & (Join-Path $PSScriptRoot "oracle-runtime-cleanup-execute.ps1") `
        -CleanupPlanPath $cleanupPlanPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -OutDir $executeOutDir `
        -Execute `
        -SshExe $fakeSsh 2>&1
    if ($? -eq $false) {
        throw "[oracle-runtime-cleanup-execute-pwsh-selftest] expected execute mode with missing image to pass`n$outputExecute"
    }
    $executeText = $outputExecute | Out-String
    Assert-Contains -Actual $executeText -Expected "images already absent on oracle.example"
    $executeMarkdown = Get-Content (Join-Path $executeOutDir "oracle-runtime-cleanup-execute.md") -Raw
    Assert-Contains -Actual $executeMarkdown -Expected "| images | already_absent | docker image rm supabase/postgres:15.8.1.085 |"

    Write-Output "[oracle-runtime-cleanup-execute-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
