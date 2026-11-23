Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("release-readiness-pwsh-selftest-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpRoot | Out-Null

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[release-readiness-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    Copy-Item (Join-Path $PSScriptRoot "release-readiness.ps1") (Join-Path $tmpRoot "release-readiness.ps1")

    @'
param([ValidateSet("auto", "always", "never")][string]$ApiFlows = "auto")
Write-Output "[fake-rust-correctness] api_flows=$ApiFlows"
'@ | Set-Content (Join-Path $tmpRoot "rust-correctness.ps1")

    @'
param([string]$OutDir = "")
if ($OutDir) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    '{"warning_count":2,"note_count":1}' | Set-Content (Join-Path $OutDir "frontend-bundle-report.json")
}
Write-Output "[fake-frontend-correctness] ok"
'@ | Set-Content (Join-Path $tmpRoot "frontend-correctness.ps1")

    @'
param([string]$EnvFile = "", [switch]$RequireProduction)
Write-Output "[fake-startup-policy] $EnvFile require_production=$RequireProduction"
'@ | Set-Content (Join-Path $tmpRoot "startup-policy-check.ps1")

    @'
Write-Output "[fake-deployment-ops] ok"
'@ | Set-Content (Join-Path $tmpRoot "deployment-ops-pwsh-selftest.ps1")

    @'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-restore-drill] $1"
'@ | Set-Content (Join-Path $tmpRoot "omnyid-restore-drill.sh")

    @'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-backup-verify] $1"
'@ | Set-Content (Join-Path $tmpRoot "omnyid-backup-verify.sh")

    $envFile = Join-Path $tmpRoot ".env.production"
    Set-Content $envFile "OMNYID_ENV=production"
    $outDir = Join-Path $tmpRoot "out"
    $backupDir = Join-Path $tmpRoot "backup"
    New-Item -ItemType Directory -Path $backupDir | Out-Null

    $outputWithEnv = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "release-readiness.ps1") -EnvFile $envFile -ApiFlows never -OutDir $outDir -BackupDir $backupDir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[release-readiness-pwsh-selftest] wrapper with env failed`n$outputWithEnv"
    }
    $withEnvText = $outputWithEnv | Out-String
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] step 1/6: rust correctness"
    Assert-Contains -Actual $withEnvText -Expected "[fake-rust-correctness] api_flows=never"
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] step 2/6: frontend correctness"
    Assert-Contains -Actual $withEnvText -Expected "[fake-frontend-correctness] ok"
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] step 3/6: production startup policy ($envFile)"
    Assert-Contains -Actual $withEnvText -Expected "[fake-startup-policy] $envFile require_production=True"
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] step 4/6: deployment ops self-test"
    Assert-Contains -Actual $withEnvText -Expected "[fake-deployment-ops] ok"
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] step 5/6: backup verification ($backupDir)"
    Assert-Contains -Actual $withEnvText -Expected "[fake-backup-verify]"
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] step 6/6: restore drill ($backupDir)"
    Assert-Contains -Actual $withEnvText -Expected "[fake-restore-drill]"
    Assert-Contains -Actual $withEnvText -Expected "[release-readiness] local release readiness passed"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.env") -Raw) -Expected "STATUS=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.env") -Raw) -Expected "STEP_FRONTEND_CORRECTNESS=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.env") -Raw) -Expected "STEP_DEPLOYMENT_OPS=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.env") -Raw) -Expected "STEP_BACKUP_VERIFY=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.env") -Raw) -Expected "STEP_RESTORE_DRILL=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- frontend_correctness: pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- frontend_bundle_warning_count: 2"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- frontend_bundle_note_count: 1"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- startup_policy: pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- backup_verify: pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- restore_drill: pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- failure_step: none"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.md") -Raw) -Expected "- failure_reason: none"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.json") -Raw) -Expected '"status":  "pass"'
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.json") -Raw) -Expected '"frontend_bundle_warning_count":  2'
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.json") -Raw) -Expected '"frontend_bundle_note_count":  1'
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "summary.json") -Raw) -Expected '"restore_drill":  "pass"'

    $outputWithoutEnv = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "release-readiness.ps1") 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[release-readiness-pwsh-selftest] wrapper without env failed`n$outputWithoutEnv"
    }
    $withoutEnvText = $outputWithoutEnv | Out-String
    Assert-Contains -Actual $withoutEnvText -Expected "production startup policy skipped (no env file supplied)"
    Assert-Contains -Actual $withoutEnvText -Expected "backup verification skipped (no backup dir supplied)"
    Assert-Contains -Actual $withoutEnvText -Expected "restore drill skipped (no backup dir supplied)"

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $outputMissingBackup = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "release-readiness.ps1") -EnvFile $envFile 2>&1
    $missingBackupExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($missingBackupExitCode -eq 0) {
        throw "[release-readiness-pwsh-selftest] expected production backup-dir enforcement to fail"
    }
    $missingBackupText = $outputMissingBackup | Out-String
    Assert-Contains -Actual $missingBackupText -Expected "production release readiness requires -BackupDir or OMNYID_BACKUP_DIR"

    @'
#!/usr/bin/env bash
set -euo pipefail
echo "[fake-backup-verify] failing $1" >&2
exit 1
'@ | Set-Content (Join-Path $tmpRoot "omnyid-backup-verify.sh")

    $failOutDir = Join-Path $tmpRoot "out-fail"
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $outputBackupFail = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "release-readiness.ps1") -EnvFile $envFile -ApiFlows never -OutDir $failOutDir -BackupDir $backupDir 2>&1
    $backupFailExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($backupFailExitCode -eq 0) {
        throw "[release-readiness-pwsh-selftest] expected backup verify failure to fail"
    }
    $backupFailText = $outputBackupFail | Out-String
    Assert-Contains -Actual $backupFailText -Expected "[fake-backup-verify] failing"
    Assert-Contains -Actual (Get-Content (Join-Path $failOutDir "summary.env") -Raw) -Expected "STATUS=fail"
    Assert-Contains -Actual (Get-Content (Join-Path $failOutDir "summary.env") -Raw) -Expected "STEP_BACKUP_VERIFY=fail"
    Assert-Contains -Actual (Get-Content (Join-Path $failOutDir "summary.env") -Raw) -Expected "STEP_RESTORE_DRILL=blocked"
    Assert-Contains -Actual (Get-Content (Join-Path $failOutDir "summary.env") -Raw) -Expected "FAILURE_STEP=backup_verify"
    Assert-Contains -Actual (Get-Content (Join-Path $failOutDir "summary.env") -Raw) -Expected "FAILURE_REASON=backup verification failed"

    Write-Output "[release-readiness-pwsh-selftest] passed"
}
finally {
    Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
