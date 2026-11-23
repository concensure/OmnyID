[CmdletBinding()]
param([switch]$KeepStack, [switch]$SkipBuild)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-FreeLoopbackPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
}

function Wait-Http([string]$Url, [int]$Seconds = 90) {
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($Seconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch {}
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    throw "Timed out waiting for $Url"
}

function Stop-Child($Process) {
    if ($null -eq $Process) { return }
    $rootId = [int]$Process.Id
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $rootId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) { Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $rootId -Force -ErrorAction SilentlyContinue
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$gitTop = (git -C $repo rev-parse --show-toplevel).Trim().Replace("/", "\")
$gitSha = (git -C $repo rev-parse HEAD).Trim()
$repoLeaf = Split-Path -Leaf $repo
if ($repoLeaf -ne "OmnyID-GROWTH-001" -or $gitTop -ne $repo) { throw "Run only from the dedicated Growth worktree" }
if (@(git -C $repo status --short).Count -ne 0) { throw "Refusing to run Growth E2E from a dirty tree" }

$dbPort = Get-FreeLoopbackPort
$apiPort = Get-FreeLoopbackPort
$uiPort = Get-FreeLoopbackPort
$container = "omnyid-e2e-growth-pg-$PID"
$databaseUrl = "postgres://omnyid_test:omnyid_test@127.0.0.1:$dbPort/omnyid_test"
$apiOrigin = "http://127.0.0.1:$apiPort"
$uiOrigin = "http://127.0.0.1:$uiPort"
$password = "OmnyID-Growth-E2E-Synthetic-Only!"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "omnyid-growth-e2e-$PID-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$manifest = Join-Path $tempRoot "seed-manifest.json"
$server = $null
$ui = $null
$containerStarted = $false
$completed = $false
$cargoTarget = "C:\cargo-target"

$serverEnvironment = @{
    DATABASE_URL = $databaseUrl
    OMNYID_ENV = "test"
    OMNYID_DISABLE_DOTENV_AUTOLOAD = "true"
    OMNYID_HTTP_BIND_ADDR = "127.0.0.1:$apiPort"
    OMNYID_BASE_URL = $uiOrigin
    OMNYID_ALLOWED_ORIGINS = $uiOrigin
    OMNYID_ENABLE_INTERNAL_GRPC = "false"
    OMNYID_ENABLE_WEBTRANSPORT = "false"
    OMNYID_COORD_DB_NOTIFY = "false"
    OMNYID_ADMIN_EMAILS = "growth-operator@omnyid.test"
    OMNYID_GROWTH_ANALYTICS_ENABLED = "false"
    OMNYID_WEDDING_MEASUREMENT_ENABLED = "true"
    OMNYID_VENDOR_MAIL_ENABLED = "false"
    OMNYID_VENDOR_MAIL_INGRESS_ENABLED = "false"
    OMNYID_VENDOR_MAIL_OUTBOUND_ENABLED = "false"
    OMNYID_EMAIL_WORKER_ENABLED = "false"
    OMNYID_TRANSACTIONAL_CLOUDFLARE_API_TOKEN = ""
    OMNYID_TRANSACTIONAL_RESEND_API_KEY = ""
    SMTP_HOST = ""
    SMTP_USER = ""
    SMTP_PASS = ""
    OMNYID_SIGNING_KEY_HEX = ("31" * 32)
    OMNYID_ENCRYPTION_KEY_HEX = ("32" * 32)
    RUST_LOG = "warn,omnyid_homeserver=info"
}

try {
    docker info *> $null
    docker run --detach --name $container --publish "127.0.0.1:$dbPort`:5432" `
        --tmpfs "/var/lib/postgresql:rw,nosuid,size=2g" `
        --env POSTGRES_USER=omnyid_test --env POSTGRES_PASSWORD=omnyid_test `
        --env POSTGRES_DB=omnyid_test pgvector/pgvector:pg18 | Out-Null
    $containerStarted = $true
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
    do {
        docker exec $container pg_isready -U omnyid_test -d omnyid_test *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if ($LASTEXITCODE -ne 0) { throw "Disposable Postgres did not become ready" }

    if (-not $SkipBuild) {
        Push-Location $repo
        try {
            $env:CARGO_TARGET_DIR = $cargoTarget
            $env:CARGO_INCREMENTAL = "0"
            cargo build --bin omnyid-homeserver --bin growth_e2e_seed
            if ($LASTEXITCODE -ne 0) { throw "Rust build failed" }
        } finally { Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue; Pop-Location }
        Push-Location (Join-Path $repo "solid-ui")
        try {
            $env:OMNYID_E2E_API_ORIGIN = $apiOrigin
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "Solid UI build failed" }
        } finally { Remove-Item Env:OMNYID_E2E_API_ORIGIN -ErrorAction SilentlyContinue; Pop-Location }
    }

    $server = Start-Process -FilePath (Join-Path $cargoTarget "debug\omnyid-homeserver.exe") `
        -WorkingDirectory $repo -WindowStyle Hidden -PassThru -Environment $serverEnvironment `
        -RedirectStandardOutput (Join-Path $tempRoot "server.out.log") -RedirectStandardError (Join-Path $tempRoot "server.err.log")
    Wait-Http "$apiOrigin/auth/google/config"
    $seedEnvironment = @{
        DATABASE_URL = $databaseUrl
        OMNYID_E2E_API_ORIGIN = $apiOrigin
        OMNYID_E2E_PASSWORD = $password
        OMNYID_E2E_SEED_MANIFEST = $manifest
        OMNYID_DISABLE_DOTENV_AUTOLOAD = "true"
    }
    $seed = Start-Process -FilePath (Join-Path $cargoTarget "debug\growth_e2e_seed.exe") `
        -WorkingDirectory $repo -WindowStyle Hidden -PassThru -Wait -Environment $seedEnvironment `
        -RedirectStandardOutput (Join-Path $tempRoot "seed.out.log") -RedirectStandardError (Join-Path $tempRoot "seed.err.log")
    if ($seed.ExitCode -ne 0) { throw "Growth seeder failed: $(Get-Content (Join-Path $tempRoot 'seed.err.log') -Raw)" }

    $auditBefore = (docker exec $container psql -U omnyid_test -d omnyid_test -tAc "SELECT COUNT(*) FROM growth_admin_audit").Trim()
    $falseDefaultSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $loginBody = @{ email = "growth-operator@omnyid.test"; password = $password } | ConvertTo-Json -Compress
    Invoke-WebRequest -UseBasicParsing -Uri "$apiOrigin/auth/login" -Method Post -ContentType "application/json" `
        -Body $loginBody -WebSession $falseDefaultSession | Out-Null
    $falseDefaultStatus = 0
    try {
        $falseDefaultReply = Invoke-WebRequest -UseBasicParsing -Uri "$apiOrigin/admin/growth/overview" `
            -WebSession $falseDefaultSession
        $falseDefaultStatus = [int]$falseDefaultReply.StatusCode
    } catch {
        $falseDefaultStatus = [int]$_.Exception.Response.StatusCode
    }
    if ($falseDefaultStatus -ne 404) { throw "Growth false-default route returned $falseDefaultStatus instead of 404" }
    $auditAfter = (docker exec $container psql -U omnyid_test -d omnyid_test -tAc "SELECT COUNT(*) FROM growth_admin_audit").Trim()
    if ($auditBefore -ne $auditAfter) { throw "Disabled Growth read wrote an admin-audit row" }

    Stop-Child $server
    $server = $null
    $serverEnvironment.OMNYID_GROWTH_ANALYTICS_ENABLED = "true"
    $server = Start-Process -FilePath (Join-Path $cargoTarget "debug\omnyid-homeserver.exe") `
        -WorkingDirectory $repo -WindowStyle Hidden -PassThru -Environment $serverEnvironment `
        -RedirectStandardOutput (Join-Path $tempRoot "server-enabled.out.log") `
        -RedirectStandardError (Join-Path $tempRoot "server-enabled.err.log")
    Wait-Http "$apiOrigin/auth/google/config"

    $uiEnvironment = @{ OMNYID_E2E_API_ORIGIN = $apiOrigin }
    $ui = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "preview", "--", "--host", "127.0.0.1", "--port", "$uiPort") `
        -WorkingDirectory (Join-Path $repo "solid-ui") -WindowStyle Hidden -PassThru -Environment $uiEnvironment `
        -RedirectStandardOutput (Join-Path $tempRoot "ui.out.log") -RedirectStandardError (Join-Path $tempRoot "ui.err.log")
    Wait-Http "$uiOrigin/workspace/"
    Push-Location (Join-Path $repo "solid-ui")
    try {
        $env:OMNYID_E2E_UI_ORIGIN = $uiOrigin
        $env:OMNYID_E2E_SEED_MANIFEST = $manifest
        $env:OMNYID_E2E_PASSWORD = $password
        npx playwright test --config playwright.growth-full-stack.config.ts
        if ($LASTEXITCODE -ne 0) { throw "Growth full-stack Playwright failed" }
    } finally {
        Remove-Item Env:OMNYID_E2E_UI_ORIGIN, Env:OMNYID_E2E_SEED_MANIFEST, Env:OMNYID_E2E_PASSWORD -ErrorAction SilentlyContinue
        Pop-Location
    }
    $completed = $true
    Write-Host "Growth full-stack harness passed at $gitSha"
} finally {
    if ($KeepStack -and $completed) {
        Write-Host "Stack retained: UI $uiOrigin, API $apiOrigin, database $container"
        Write-Host "Evidence directory: $tempRoot"
    } else {
        Stop-Child $ui
        Stop-Child $server
        if ($containerStarted -and (docker inspect --format '{{.Name}}' $container 2>$null).TrimStart('/') -eq $container) {
            docker stop $container | Out-Null
            docker rm $container | Out-Null
        }
        if ($completed -and (Test-Path $tempRoot)) {
            $resolvedTemp = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $tempRoot).Path)
            $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
            if (-not $resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
                [IO.Path]::GetFileName($resolvedTemp) -notmatch '^omnyid-growth-e2e-') {
                throw "Refusing unsafe Growth E2E cleanup target"
            }
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
        if (-not $completed) { Write-Host "Harness failed; redacted logs retained at $tempRoot" }
    }
}
