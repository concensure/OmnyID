Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "oracle-secret-sync.ps1")

$tmpRoot = Join-Path $env:TEMP ("deploy-oracle-pwsh-selftest-" + [guid]::NewGuid().ToString())

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw "[deploy-oracle-pwsh-selftest] $Message"
    }
}

function Assert-Equal {
    param(
        [object]$Actual,
        [object]$Expected,
        [string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "[deploy-oracle-pwsh-selftest] $Message`nexpected: $Expected`nactual:   $Actual"
    }
}

try {
    $envDir = Join-Path $tmpRoot "env"
    $secretsDir = Join-Path $envDir ".secrets"
    New-Item -ItemType Directory -Path $secretsDir -Force | Out-Null

    "session-secret" | Set-Content (Join-Path $secretsDir "session_secret") -NoNewline
    "postgres-password" | Set-Content (Join-Path $secretsDir "postgres_password") -NoNewline
    "postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod" | Set-Content (Join-Path $secretsDir "database_url") -NoNewline
    "ops-token-123" | Set-Content (Join-Path $secretsDir "operational_endpoint_token") -NoNewline
    "composio-secret" | Set-Content (Join-Path $tmpRoot "composio.txt") -NoNewline

    $envPath = Join-Path $envDir "oracle.env"
    @'
DATABASE_URL_FILE=.secrets/database_url
POSTGRES_PASSWORD_FILE=.secrets/postgres_password
OMNYID_SESSION_SECRET_FILE=.secrets/session_secret
OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE=.secrets/operational_endpoint_token
COMPOSIO_API_KEY_FILE=
EXTRA_SECRET_FILE=
'@ | Set-Content $envPath

    $rawLines = Get-Content $envPath
    $rawLines[4] = "COMPOSIO_API_KEY_FILE=$((Join-Path $tmpRoot 'composio.txt'))"
    $rawLines[5] = "EXTRA_SECRET_FILE=$((Join-Path $tmpRoot 'composio.txt'))"
    $rawLines | Set-Content $envPath

    $plan = Get-OracleSecretSyncPlan -EnvFile $envPath
    Assert-Equal $plan.SecretEntries.Count 6 "expected six synced secrets"

    $databaseUrlEntry = $plan.SecretEntries | Where-Object { $_.Key -eq "DATABASE_URL_FILE" } | Select-Object -First 1
    Assert-True ($null -ne $databaseUrlEntry) "expected database url secret entry"
    Assert-Equal $databaseUrlEntry.RemoteHostRelativePath ".secrets/database_url" "unexpected database url remote host path"
    Assert-Equal $databaseUrlEntry.RemoteContainerPath "/run/secrets/database_url" "unexpected database url container path"

    $postgresEntry = $plan.SecretEntries | Where-Object { $_.Key -eq "POSTGRES_PASSWORD_FILE" } | Select-Object -First 1
    Assert-True ($null -ne $postgresEntry) "expected postgres secret entry"
    Assert-Equal $postgresEntry.RemoteHostRelativePath ".secrets/postgres_password" "unexpected postgres remote host path"
    Assert-Equal $postgresEntry.RemoteContainerPath "/run/secrets/postgres_password" "unexpected postgres container path"

    $sessionEntry = $plan.SecretEntries | Where-Object { $_.Key -eq "OMNYID_SESSION_SECRET_FILE" } | Select-Object -First 1
    Assert-True ($null -ne $sessionEntry) "expected session secret entry"
    Assert-Equal $sessionEntry.RemoteHostRelativePath ".secrets/omnyid_session_secret" "unexpected session remote host path"
    Assert-Equal $sessionEntry.RemoteContainerPath "/run/secrets/omnyid_session_secret" "unexpected session container path"

    $opsTokenEntry = $plan.SecretEntries | Where-Object { $_.Key -eq "OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE" } | Select-Object -First 1
    Assert-True ($null -ne $opsTokenEntry) "expected operational endpoint token secret entry"
    Assert-Equal $opsTokenEntry.RemoteHostRelativePath ".secrets/omnyid_operational_endpoint_token" "unexpected operational endpoint token remote host path"
    Assert-Equal $opsTokenEntry.RemoteContainerPath "/run/secrets/omnyid_operational_endpoint_token" "unexpected operational endpoint token container path"

    $composioEntry = $plan.SecretEntries | Where-Object { $_.Key -eq "COMPOSIO_API_KEY_FILE" } | Select-Object -First 1
    Assert-True ($null -ne $composioEntry) "expected composio secret entry"
    Assert-Equal $composioEntry.RemoteHostRelativePath ".secrets/composio_api_key" "unexpected composio remote host path"

    $extraEntry = $plan.SecretEntries | Where-Object { $_.Key -eq "EXTRA_SECRET_FILE" } | Select-Object -First 1
    Assert-True ($null -ne $extraEntry) "expected fallback secret entry"
    Assert-Equal $extraEntry.RemoteHostRelativePath ".secrets/extra_secret" "unexpected fallback remote host path"

    $rewrittenEnvPath = Join-Path $tmpRoot "rewritten.env"
    Write-OracleRewrittenEnvFile -OutputPath $rewrittenEnvPath -Plan $plan
    $rewrittenText = Get-Content $rewrittenEnvPath -Raw
    Assert-True ($rewrittenText.Contains("DATABASE_URL_FILE=/run/secrets/database_url")) "expected rewritten database url env value"
    Assert-True ($rewrittenText.Contains("POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password")) "expected rewritten postgres password env value"
    Assert-True ($rewrittenText.Contains("OMNYID_SESSION_SECRET_FILE=/run/secrets/omnyid_session_secret")) "expected rewritten session secret env value"
    Assert-True ($rewrittenText.Contains("OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE=/run/secrets/omnyid_operational_endpoint_token")) "expected rewritten operational endpoint token env value"
    Assert-True ($rewrittenText.Contains("COMPOSIO_API_KEY_FILE=/run/secrets/composio_api_key")) "expected rewritten composio env value"

    "" | Set-Content (Join-Path $secretsDir "blank_secret")
    $blankEnv = Join-Path $envDir "blank.env"
    @'
OMNYID_SESSION_SECRET_FILE=.secrets/blank_secret
'@ | Set-Content $blankEnv
    try {
        $null = Get-OracleSecretSyncPlan -EnvFile $blankEnv
        throw "[deploy-oracle-pwsh-selftest] expected blank secret file failure"
    }
    catch {
        if (-not $_.Exception.Message.Contains("blank secret file")) {
            throw
        }
    }

    $scriptRoot = Join-Path $tmpRoot "deploy-script"
    New-Item -ItemType Directory -Path $scriptRoot -Force | Out-Null
    $requiredScripts = @(
        "scripts/omnyid-backup-verify.sh",
        "scripts/omnyid-backup.sh",
        "scripts/omnyid-migrations-plan.sh",
        "scripts/omnyid-prune-daemon-heartbeats.sh",
        "scripts/oracle-remediate-electric-slot.ps1",
        "scripts/oracle-production-proof.ps1",
        "scripts/omnyid-restore-drill.sh",
        "scripts/omnyid-restore.sh",
        "scripts/omnyid-upgrade.sh",
        "scripts/oracle-renew-wt-cert.sh",
        "scripts/runtime-env-entrypoint.sh",
        "scripts/startup-policy-check.ps1",
        "scripts/startup-policy-check.sh",
        "scripts/verify-deployment.ps1",
        "scripts/verify-deployment.sh"
    )
    $requiredScriptsLiteral = ($requiredScripts | ForEach-Object { '"{0}"' -f $_ }) -join ",`n        "

    @"
Set-StrictMode -Version Latest
function Get-OracleRequiredRuntimeScriptPaths {
    return @(
        $requiredScriptsLiteral
    )
}
"@ | Set-Content (Join-Path $scriptRoot "oracle-runtime-contract.ps1") -Encoding ASCII

    @"
Set-StrictMode -Version Latest
function Get-OracleSecretSyncPlan {
    param([string]`$EnvFile)
    `$lines = Get-Content -LiteralPath `$EnvFile
    return [pscustomobject]@{
        SecretEntries = @()
        RewrittenLines = `$lines
    }
}
function Write-OracleRewrittenEnvFile {
    param([string]`$OutputPath, `$Plan)
    @(`$Plan.RewrittenLines) | Set-Content -LiteralPath `$OutputPath -Encoding ASCII
}
"@ | Set-Content (Join-Path $scriptRoot "oracle-secret-sync.ps1") -Encoding ASCII

    @"
param(
    [string]`$SourceRoot,
    [string]`$OutputDir,
    [switch]`$IncludeSimulatedData
)
Set-StrictMode -Version Latest
`$requiredScripts = @(
    $requiredScriptsLiteral
)
New-Item -ItemType Directory -Path `$OutputDir -Force | Out-Null
foreach (`$relativePath in `$requiredScripts) {
    `$target = Join-Path `$OutputDir `$relativePath
    `$parent = Split-Path -Parent `$target
    if (`$parent) {
        New-Item -ItemType Directory -Path `$parent -Force | Out-Null
    }
    "stub" | Set-Content -Path `$target -Encoding ASCII
}
@{
    copied_paths = `$requiredScripts
    required_runtime_scripts = `$requiredScripts
    copied_path_count = `$requiredScripts.Count
    total_staged_bytes = 4
    category_totals = @()
} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path `$OutputDir "oracle-runtime-manifest.json") -Encoding ASCII
"@ | Set-Content (Join-Path $scriptRoot "stage-oracle-runtime.ps1") -Encoding ASCII

@"
param([string]`$EnvFile)
"startup policy ok" | Write-Output
"@ | Set-Content (Join-Path $scriptRoot "startup-policy-check.ps1") -Encoding ASCII

    $deployScriptPath = Join-Path $scriptRoot "deploy-oracle.ps1"
    $deployScriptRaw = Get-Content (Join-Path $PSScriptRoot "deploy-oracle.ps1") -Raw
    $deployScriptBody = $deployScriptRaw -replace [regex]::Escape("& ssh.exe"), "Invoke-FakeSsh"
    $deployScriptBody = $deployScriptBody -replace [regex]::Escape("& scp.exe"), "Invoke-FakeScp"
    $deployScriptHelpers = @"
function Invoke-FakeSsh {
    param(
        [string]`$i,
        [Parameter(ValueFromRemainingArguments = `$true)] [object[]]`$Remaining
    )
    `$line = ((@('-i', `$i) + (`$Remaining | ForEach-Object { [string]`$_ })) -join " ")
    Add-Content -Path "$tmpRoot\ssh.log" -Value `$line
    if (`$line -like "*echo present; else echo missing; fi*") {
        "present"
    }
}

function Invoke-FakeScp {
    param(
        [string]`$i,
        [Parameter(ValueFromRemainingArguments = `$true)] [object[]]`$Remaining
    )
    Add-Content -Path "$tmpRoot\scp.log" -Value ((@('-i', `$i) + (`$Remaining | ForEach-Object { [string]`$_ })) -join " ")
}

"@
    $errorActionPreferenceLine = '$ErrorActionPreference = "Stop"'
    $insertAt = $deployScriptBody.IndexOf($errorActionPreferenceLine, [StringComparison]::Ordinal)
    if ($insertAt -lt 0) {
        throw "[deploy-oracle-pwsh-selftest] expected deploy script to set ErrorActionPreference"
    }
    $deployScriptPatched = $deployScriptBody.Substring(0, $insertAt) +
        $errorActionPreferenceLine +
        "`r`n`r`n" +
        $deployScriptHelpers +
        $deployScriptBody.Substring($insertAt + $errorActionPreferenceLine.Length)
    $deployScriptPatched | Set-Content $deployScriptPath -Encoding ASCII

    $deployOutput = & powershell -ExecutionPolicy Bypass -File $deployScriptPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -ProjectRoot $tmpRoot `
        -SkipRemotePreflight `
        -SkipPostDeployProof 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deploy-oracle-pwsh-selftest] expected mocked deploy-oracle run without EnvFile to succeed`n$deployOutput"
    }
    $deployOutputText = $deployOutput | Out-String
    Assert-True ($deployOutputText.Contains("No env file was uploaded, so only a compose config check was run remotely.")) "expected sync-only deploy note"
    $sshLogPath = Join-Path $tmpRoot "ssh.log"
    Assert-True (Test-Path $sshLogPath) "expected ssh log to be created"
    $sshLog = Get-Content $sshLogPath -Raw
    Assert-True (-not $sshLog.Contains(".env.oracle")) "expected no-env deploy path to avoid workspace smoke and env-specific remote commands"

    $envFilePath = Join-Path $tmpRoot "oracle.env"
    @'
OMNYID_DOMAIN=omnyid.example
'@ | Set-Content $envFilePath -Encoding ASCII

    Remove-Item $sshLogPath -Force
    $scpLogPath = Join-Path $tmpRoot "scp.log"
    if (Test-Path $scpLogPath) {
        Remove-Item $scpLogPath -Force
    }

    $deployOutputWithEnv = & $deployScriptPath `
        -RemoteHost "oracle.example" `
        -User "ubuntu" `
        -KeyPath "C:\fake\id_rsa" `
        -RemoteDir "/srv/omnyid" `
        -ProjectRoot $tmpRoot `
        -EnvFile $envFilePath `
        -ComposeServices @("backup", "postgres") `
        -SkipRemotePreflight `
        -SkipPostDeployProof `
        -SkipComposeBuild `
        -SkipCaddyReload `
        -SkipWorkspaceSmoke 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deploy-oracle-pwsh-selftest] expected mocked deploy-oracle run with EnvFile to succeed`n$deployOutputWithEnv"
    }

    $sshLog = Get-Content $sshLogPath -Raw
    Assert-True ($sshLog.Contains("docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml up -d")) "expected env-backed compose up command in ssh log"
    Assert-True ($sshLog.Contains("backup")) "expected service-scoped deploy command to mention backup service"
    Assert-True ($sshLog.Contains("postgres")) "expected service-scoped deploy command to mention postgres service"
    Assert-True (-not $sshLog.Contains("--build")) "expected skip-build deploy path to avoid --build"
    Assert-True (-not $sshLog.Contains("--force-recreate caddy")) "expected skip-caddy-reload to avoid dedicated caddy reload"
    Assert-True (-not $sshLog.Contains("workspace smoke check failed")) "expected skip-workspace-smoke to avoid smoke script"
    $scpLog = Get-Content $scpLogPath -Raw
    Assert-True ($scpLog.Contains(".env.oracle")) "expected env deploy path to upload rewritten env file"

    Write-Output "[deploy-oracle-pwsh-selftest] passed"
}
finally {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
