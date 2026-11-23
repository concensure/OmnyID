Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$tmpRoot = Join-Path $env:TEMP ("deployment-ops-pwsh-selftest-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpRoot | Out-Null

function Assert-Contains {
    param(
        [string]$Actual,
        [string]$Expected
    )

    if (-not $Actual.Contains($Expected)) {
        throw "[deployment-ops-pwsh-selftest] expected '$Expected' in output: $Actual"
    }
}

function Assert-ExitCode {
    param(
        [int]$Expected,
        [int]$Actual
    )

    if ($Expected -ne $Actual) {
        throw "[deployment-ops-pwsh-selftest] expected exit code $Expected, got $Actual"
    }
}

function Invoke-RequiredSelftest {
    param(
        [string]$ScriptName,
        [string]$Label,
        [string]$ExpectedTag
    )

    $output = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $ScriptName) 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] $Label self-test failed`n$output"
    }
    Assert-Contains -Actual ($output | Out-String) -Expected $ExpectedTag
}

function Convert-ToBashPath {
    param([string]$Path)

    if ($Path -match '^([A-Za-z]):\\(.*)$') {
        $drive = $matches[1].ToLowerInvariant()
        $rest = $matches[2] -replace '\\', '/'
        return "/mnt/$drive/$rest"
    }
    return ($Path -replace '\\', '/')
}

$listenerJob = $null
$shellCommand = Get-Command pwsh, powershell.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$powershellExe = if ($null -ne $shellCommand) { $shellCommand.Source } else { throw "[deployment-ops-pwsh-selftest] no PowerShell executable found" }
$pythonCommand = Get-Command py.exe, python.exe, python3.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$serverScript = $null

try {
    $secretDir = Join-Path $tmpRoot "secrets"
    New-Item -ItemType Directory -Path $secretDir | Out-Null
    "runtime-session-secret" | Set-Content (Join-Path $secretDir "session_secret")
    "postgres-password" | Set-Content (Join-Path $secretDir "postgres_password")
    "postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod" | Set-Content (Join-Path $secretDir "database_url")
    "postgres://afp:afp@postgres:5432/afp" | Set-Content (Join-Path $secretDir "database_url_default")

    $goodEnv = Join-Path $tmpRoot "good.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $goodEnv

    $badEnv = Join-Path $tmpRoot "bad.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url_default
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_ALLOW_INSECURE_UNSIGNED=true
OMNYID_ALLOW_PLAINTEXT_STORAGE=1
OMNYID_DELEGATION_MASTER_KEY_HEX=0000000000000000000000000000000000000000000000000000000000000000
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $badEnv

    $startupGoodOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $goodEnv 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] startup-policy good case failed`n$startupGoodOutput"
    }
    Assert-Contains -Actual ($startupGoodOutput | Out-String) -Expected "production env validation passed"

    "ops-token-123" | Set-Content (Join-Path $secretDir "ops_token")
    $opsTokenGoodEnv = Join-Path $tmpRoot "ops-token-good.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS=true
OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE=secrets/ops_token
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $opsTokenGoodEnv
    $opsTokenGoodOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $opsTokenGoodEnv 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] ops-token good case failed`n$opsTokenGoodOutput"
    }
    Assert-Contains -Actual ($opsTokenGoodOutput | Out-String) -Expected "production env validation passed"

    $opsTokenPlaintextEnv = Join-Path $tmpRoot "ops-token-plaintext.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS=true
OMNYID_OPERATIONAL_ENDPOINT_TOKEN=ops-token-123
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $opsTokenPlaintextEnv
    $opsTokenPlaintextOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $opsTokenPlaintextEnv 2>&1
    $opsTokenPlaintextExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $opsTokenPlaintextExit
    Assert-Contains -Actual ($opsTokenPlaintextOutput | Out-String) -Expected "OMNYID_OPERATIONAL_ENDPOINT_TOKEN must be supplied via OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE in production"

    $startupBadOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $badEnv 2>&1
    $startupBadExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $startupBadExit
    $startupBadText = $startupBadOutput | Out-String
    Assert-Contains -Actual $startupBadText -Expected "OMNYID_ALLOW_INSECURE_UNSIGNED must be false in production"
    Assert-Contains -Actual $startupBadText -Expected "DATABASE_URL must be set to a non-default production database"

    $stripeBadEnv = Join-Path $tmpRoot "stripe-bad.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_STRIPE_SECRET_KEY=sk_live_123
OMNYID_STRIPE_PRO_PRICE_ID=price_123
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $stripeBadEnv

    $stripeBadOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $stripeBadEnv 2>&1
    $stripeBadExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $stripeBadExit
    $stripeBadText = $stripeBadOutput | Out-String
    Assert-Contains -Actual $stripeBadText -Expected "OMNYID_STRIPE_WEBHOOK_SECRET must be set to a valid Stripe webhook secret"
    Assert-Contains -Actual $stripeBadText -Expected "OMNYID_WORKSPACE_BASE_URL, OMNYID_UI_BASE_URL, or a derivable OMNYID_HOMESERVER_URL must be configured"

    $stripeGoodEnv = Join-Path $tmpRoot "stripe-good.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_STRIPE_SECRET_KEY=sk_live_123
OMNYID_STRIPE_WEBHOOK_SECRET=whsec_123
OMNYID_STRIPE_PRO_PRICE_ID=price_123
OMNYID_WORKSPACE_BASE_URL=https://app.omnyid.com
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $stripeGoodEnv

    $stripeGoodOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $stripeGoodEnv 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] stripe startup-policy good case failed`n$stripeGoodOutput"
    }
    Assert-Contains -Actual ($stripeGoodOutput | Out-String) -Expected "production env validation passed"

    $simulatorBadEnv = Join-Path $tmpRoot "simulator-bad.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_ENABLE_WATCHER_SIMULATOR=false
OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION=true
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $simulatorBadEnv

    $simulatorBadOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $simulatorBadEnv 2>&1
    $simulatorBadExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $simulatorBadExit
    Assert-Contains -Actual ($simulatorBadOutput | Out-String) -Expected "Watcher simulator promotion cannot be enabled when the watcher simulator is disabled"

    $fileSecretGoodEnv = Join-Path $tmpRoot "file-secret-good.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $fileSecretGoodEnv

    $fileSecretGoodOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $fileSecretGoodEnv 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] file-backed secret good case failed`n$fileSecretGoodOutput"
    }
    Assert-Contains -Actual ($fileSecretGoodOutput | Out-String) -Expected "production env validation passed"

    $fileSecretMissingEnv = Join-Path $tmpRoot "file-secret-missing.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/missing_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $fileSecretMissingEnv

    $fileSecretMissingOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $fileSecretMissingEnv 2>&1
    $fileSecretMissingExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $fileSecretMissingExit
    Assert-Contains -Actual ($fileSecretMissingOutput | Out-String) -Expected "OMNYID_SESSION_SECRET_FILE points to a missing secret file"

    "" | Set-Content (Join-Path $secretDir "blank_secret")
    $fileSecretBlankEnv = Join-Path $tmpRoot "file-secret-blank.env"
    @'
OMNYID_ENV=production
DATABASE_URL=postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/blank_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $fileSecretBlankEnv

    $fileSecretBlankOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $fileSecretBlankEnv 2>&1
    $fileSecretBlankExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $fileSecretBlankExit
    Assert-Contains -Actual ($fileSecretBlankOutput | Out-String) -Expected "OMNYID_SESSION_SECRET_FILE points to a blank secret file"

    $plaintextSecretEnv = Join-Path $tmpRoot "plaintext-secret.env"
    @'
OMNYID_ENV=production
DATABASE_URL=postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET=plaintext-session-secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $plaintextSecretEnv

    $plaintextSecretOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $plaintextSecretEnv 2>&1
    $plaintextSecretExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $plaintextSecretExit
    Assert-Contains -Actual ($plaintextSecretOutput | Out-String) -Expected "OMNYID_SESSION_SECRET must be supplied via OMNYID_SESSION_SECRET_FILE in production"

    $plaintextPostgresEnv = Join-Path $tmpRoot "plaintext-postgres.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD=plaintext-postgres-password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $plaintextPostgresEnv

    $plaintextPostgresOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $plaintextPostgresEnv 2>&1
    $plaintextPostgresExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $plaintextPostgresExit
    Assert-Contains -Actual ($plaintextPostgresOutput | Out-String) -Expected "POSTGRES_PASSWORD must be supplied via POSTGRES_PASSWORD_FILE in production"

    $plaintextDatabaseUrlEnv = Join-Path $tmpRoot "plaintext-database-url.env"
    @'
OMNYID_ENV=production
DATABASE_URL=postgres://omnyid_prod:secret@db.internal:5432/omnyid_prod
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
OMNYID_BACKUP_DIR=/var/backups/omnyid
'@ | Set-Content $plaintextDatabaseUrlEnv

    $plaintextDatabaseUrlOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $plaintextDatabaseUrlEnv 2>&1
    $plaintextDatabaseUrlExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $plaintextDatabaseUrlExit
    Assert-Contains -Actual ($plaintextDatabaseUrlOutput | Out-String) -Expected "DATABASE_URL must be supplied via DATABASE_URL_FILE in production"

    $backupDirMissingEnv = Join-Path $tmpRoot "backup-dir-missing.env"
    @'
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
'@ | Set-Content $backupDirMissingEnv

    $backupDirMissingOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $backupDirMissingEnv 2>&1
    $backupDirMissingExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $backupDirMissingExit
    Assert-Contains -Actual ($backupDirMissingOutput | Out-String) -Expected "OMNYID_BACKUP_DIR must be configured in production"

    Invoke-RequiredSelftest -ScriptName "stage-oracle-runtime-pwsh-selftest.ps1" -Label "stage-oracle-runtime" -ExpectedTag "[stage-oracle-runtime-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "deploy-oracle-pwsh-selftest.ps1" -Label "deploy-oracle" -ExpectedTag "[deploy-oracle-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-runtime-inventory-pwsh-selftest.ps1" -Label "oracle-runtime-inventory" -ExpectedTag "[oracle-runtime-inventory-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-runtime-cleanup-plan-pwsh-selftest.ps1" -Label "oracle-runtime-cleanup-plan" -ExpectedTag "[oracle-runtime-cleanup-plan-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-runtime-cleanup-execute-pwsh-selftest.ps1" -Label "oracle-runtime-cleanup-execute" -ExpectedTag "[oracle-runtime-cleanup-execute-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-prune-daemon-heartbeats-pwsh-selftest.ps1" -Label "oracle-prune-daemon-heartbeats" -ExpectedTag "[oracle-prune-daemon-heartbeats-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-prune-synthetic-message-spam-pwsh-selftest.ps1" -Label "oracle-prune-synthetic-message-spam" -ExpectedTag "[oracle-prune-synthetic-message-spam-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-prune-operational-history-pwsh-selftest.ps1" -Label "oracle-prune-operational-history" -ExpectedTag "[oracle-prune-operational-history-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-remediate-electric-slot-pwsh-selftest.ps1" -Label "oracle-remediate-electric-slot" -ExpectedTag "[oracle-remediate-electric-slot-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-remediation-sequence-pwsh-selftest.ps1" -Label "oracle-remediation-sequence" -ExpectedTag "[oracle-remediation-sequence-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "oracle-production-proof-pwsh-selftest.ps1" -Label "oracle-production-proof" -ExpectedTag "[oracle-production-proof-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "storage-hygiene-report-pwsh-selftest.ps1" -Label "storage-hygiene-report" -ExpectedTag "[storage-hygiene-report-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "commercial-readiness-snapshot-pwsh-selftest.ps1" -Label "commercial-readiness-snapshot" -ExpectedTag "[commercial-readiness-snapshot-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "production-go-no-go-pwsh-selftest.ps1" -Label "production-go-no-go" -ExpectedTag "[production-go-no-go-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "production-readiness-refresh-pwsh-selftest.ps1" -Label "production-readiness-refresh" -ExpectedTag "[production-readiness-refresh-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "production-readiness-refresh-status-pwsh-selftest.ps1" -Label "production-readiness-refresh-status" -ExpectedTag "[production-readiness-refresh-status-pwsh-selftest] passed"
    Invoke-RequiredSelftest -ScriptName "personalos-readiness-audit-pwsh-selftest.ps1" -Label "personalos-readiness-audit" -ExpectedTag "[personalos-readiness-audit-pwsh-selftest] passed"

    $restoreDrillScriptDir = Convert-ToBashPath $PSScriptRoot
    $restoreDrillSelftestOutput = bash -lc ("cd " + ('"{0}"' -f $restoreDrillScriptDir) + " && bash ./omnyid-restore-drill-selftest.sh") 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] restore-drill self-test failed`n$restoreDrillSelftestOutput"
    }
    Assert-Contains -Actual ($restoreDrillSelftestOutput | Out-String) -Expected "[omnyid-restore-drill-selftest] passed"

    if ($null -eq $pythonCommand) {
        throw "[deployment-ops-pwsh-selftest] no Python launcher available for mock server"
    }

    $port = 18766
    $serverScript = Join-Path $tmpRoot "mock_server.py"
    @"
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        ops_token = self.headers.get("x-omnyid-ops-token", "")
        auth_header = self.headers.get("Authorization", "")
        if self.path in ("/healthz", "/readyz") and ops_token != "ops-token-123" and auth_header != "Bearer ops-token-123":
            self._json({"error": "missing_ops_token"}, status=401)
        elif self.path == "/healthz":
            self._json({"status": "ok", "service": "omnyid-homeserver"})
        elif self.path == "/readyz":
            self._json({"status": "ready", "dependencies": {"database": "ok"}})
        elif self.path == "/api/v3.1/tools?limit=1":
            api_key = self.headers.get("x-api-key", "")
            if api_key == "valid-composio-key":
                self._json({"items": []})
            elif api_key == "rate-limited-composio-key":
                self._json({"error": "rate_limited"}, status=429)
            else:
                self._json({"error": "unauthorized"}, status=401)
        else:
            self.send_error(404)

    def do_HEAD(self):
        if self.path == "/workspace/":
            self.send_response(200)
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com")
            self.end_headers()
        else:
            self.send_error(404)

    def log_message(self, *_args):
        pass

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


HTTPServer(("127.0.0.1", $port), Handler).serve_forever()
"@ | Set-Content $serverScript

    $listenerJob = Start-Process -FilePath $pythonCommand.Source -ArgumentList $serverScript -PassThru -WindowStyle Hidden

    $serverReady = $false
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $null = Invoke-RestMethod -Uri "http://127.0.0.1:$port/healthz" -TimeoutSec 2 -Headers @{ "x-omnyid-ops-token" = "ops-token-123" }
            $serverReady = $true
            break
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }
    if (-not $serverReady) {
        throw "[deployment-ops-pwsh-selftest] mock server did not start"
    }

    "valid-composio-key" | Set-Content (Join-Path $secretDir "composio_api_key")
    $composioLiveGoodEnv = Join-Path $tmpRoot "composio-live-good.env"
    @"
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
COMPOSIO_API_KEY_FILE=secrets/composio_api_key
OMNYID_VERIFY_COMPOSIO_LIVE=true
OMNYID_COMPOSIO_API_BASE_URL=http://127.0.0.1:$port
OMNYID_BACKUP_DIR=/var/backups/omnyid
"@ | Set-Content $composioLiveGoodEnv
    $composioLiveGoodOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $composioLiveGoodEnv 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] composio live startup-policy good case failed`n$composioLiveGoodOutput"
    }
    Assert-Contains -Actual ($composioLiveGoodOutput | Out-String) -Expected "production env validation passed"

    "invalid-composio-key" | Set-Content (Join-Path $secretDir "composio_api_key_bad")
    $composioLiveBadEnv = Join-Path $tmpRoot "composio-live-bad.env"
    @"
OMNYID_ENV=production
DATABASE_URL_FILE=secrets/database_url
POSTGRES_PASSWORD_FILE=secrets/postgres_password
OMNYID_DELEGATION_MASTER_KEY_HEX=1111111111111111111111111111111111111111111111111111111111111111
OMNYID_SESSION_SECRET_FILE=secrets/session_secret
COMPOSIO_API_KEY_FILE=secrets/composio_api_key_bad
OMNYID_VERIFY_COMPOSIO_LIVE=true
OMNYID_COMPOSIO_API_BASE_URL=http://127.0.0.1:$port
OMNYID_BACKUP_DIR=/var/backups/omnyid
"@ | Set-Content $composioLiveBadEnv
    $composioLiveBadOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "startup-policy-check.ps1") -EnvFile $composioLiveBadEnv 2>&1
    $composioLiveBadExit = $LASTEXITCODE
    Assert-ExitCode -Expected 1 -Actual $composioLiveBadExit
    Assert-Contains -Actual ($composioLiveBadOutput | Out-String) -Expected "COMPOSIO_API_KEY was rejected by Composio during startup validation (HTTP 401)"

    $verifyOutput = & $powershellExe -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-deployment.ps1") -BaseUrl "http://127.0.0.1:$port" -WorkspaceUrl "http://127.0.0.1:$port/workspace/" -OperationalEndpointToken "ops-token-123" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "[deployment-ops-pwsh-selftest] verify-deployment failed`n$verifyOutput"
    }
    Assert-Contains -Actual ($verifyOutput | Out-String) -Expected "deployment verification passed"

    Write-Output "[deployment-ops-pwsh-selftest] passed"
}
finally {
    if ($null -ne $listenerJob) {
        Stop-Process -Id $listenerJob.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
