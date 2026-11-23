Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("deployment-rehearsal-pwsh-selftest-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpRoot | Out-Null

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[deployment-rehearsal-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

try {
    Copy-Item (Join-Path $PSScriptRoot "deployment-rehearsal.ps1") (Join-Path $tmpRoot "deployment-rehearsal.ps1")

    @'
param(
    [string]$EnvFile = "",
    [ValidateSet("auto", "always", "never")]
    [string]$ApiFlows = "auto",
    [string]$OutDir = "",
    [string]$BackupDir = ""
)
Write-Output "[fake-release-readiness] env=$EnvFile out=$OutDir backup=$BackupDir api_flows=$ApiFlows"
'@ | Set-Content (Join-Path $tmpRoot "release-readiness.ps1")

    @'
param(
    [string]$BaseUrl = "",
    [string]$WorkspaceUrl = "",
    [string]$ExpectedCspFragment = "",
    [string]$OperationalEndpointToken = "",
    [string]$BearerToken = ""
)
Write-Output "[fake-verify-deployment] base=$BaseUrl workspace=$WorkspaceUrl csp=$ExpectedCspFragment ops=$OperationalEndpointToken bearer=$BearerToken"
'@ | Set-Content (Join-Path $tmpRoot "verify-deployment.ps1")

    $envFile = Join-Path $tmpRoot ".env.production"
    "ops-from-env-file" | Set-Content (Join-Path $tmpRoot "ops-token.txt")
    @'
OMNYID_ENV=production
OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE=ops-token.txt
OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN=bearer-from-env-file
'@ | Set-Content $envFile
    $outDir = Join-Path $tmpRoot "out"
    $backupDir = Join-Path $tmpRoot "backup"
    New-Item -ItemType Directory -Path $backupDir | Out-Null

    $outputWithLive = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "deployment-rehearsal.ps1") -EnvFile $envFile -ApiFlows never -OutDir $outDir -BackupDir $backupDir -BaseUrl "https://api.omnyid.example" -WorkspaceUrl "https://app.omnyid.example/workspace/" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-rehearsal-pwsh-selftest] wrapper with live verify failed`n$outputWithLive"
    }
    $withLiveText = $outputWithLive | Out-String
    Assert-Contains -Actual $withLiveText -Expected "[deployment-rehearsal] step 1/2: release readiness"
    Assert-Contains -Actual $withLiveText -Expected "[fake-release-readiness] env=$envFile out=$outDir backup=$backupDir api_flows=never"
    Assert-Contains -Actual $withLiveText -Expected "[deployment-rehearsal] step 2/2: live deployment verification (https://api.omnyid.example)"
    Assert-Contains -Actual $withLiveText -Expected "[fake-verify-deployment] base=https://api.omnyid.example workspace=https://app.omnyid.example/workspace/ csp=https://static.cloudflareinsights.com ops= bearer=bearer-from-env-file"
    Assert-Contains -Actual $withLiveText -Expected "[deployment-rehearsal] deployment rehearsal passed"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "deployment-rehearsal-summary.env") -Raw) -Expected "STEP_RELEASE_READINESS=pass"
    Assert-Contains -Actual (Get-Content (Join-Path $outDir "deployment-rehearsal-summary.env") -Raw) -Expected "STEP_LIVE_VERIFY=pass"

    $outputWithoutLive = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "deployment-rehearsal.ps1") 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-rehearsal-pwsh-selftest] wrapper without live verify failed`n$outputWithoutLive"
    }
    $withoutLiveText = $outputWithoutLive | Out-String
    Assert-Contains -Actual $withoutLiveText -Expected "live deployment verification skipped (no base url supplied)"

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $outputMissingBaseUrl = & powershell -ExecutionPolicy Bypass -File (Join-Path $tmpRoot "deployment-rehearsal.ps1") -EnvFile $envFile -BackupDir $backupDir 2>&1
    $missingBaseUrlExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
    if ($missingBaseUrlExitCode -eq 0) {
        throw "[deployment-rehearsal-pwsh-selftest] expected production base-url enforcement to fail"
    }
    $missingBaseUrlText = $outputMissingBaseUrl | Out-String
    Assert-Contains -Actual $missingBaseUrlText -Expected "production deployment rehearsal requires -BaseUrl or OMNYID_BASE_URL"

    Write-Output "[deployment-rehearsal-pwsh-selftest] passed"
}
finally {
    Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
