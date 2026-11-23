[CmdletBinding()]
param(
    [switch]$KeepStack,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-FreeLoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Wait-Http([string]$Url, [int]$Seconds = 60) {
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
    $descendants = [Collections.Generic.List[int]]::new()
    $pending = [Collections.Generic.Queue[int]]::new()
    $pending.Enqueue($rootId)
    while ($pending.Count -gt 0) {
        $parentId = $pending.Dequeue()
        foreach ($child in @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $parentId" -ErrorAction SilentlyContinue)) {
            $childId = [int]$child.ProcessId
            $descendants.Add($childId)
            $pending.Enqueue($childId)
        }
    }
    for ($index = $descendants.Count - 1; $index -ge 0; $index--) {
        Stop-Process -Id $descendants[$index] -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $rootId -Force -ErrorAction SilentlyContinue
    if (-not $Process.HasExited) { $Process.WaitForExit(5000) | Out-Null }
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoLeaf = Split-Path -Leaf $repo
if ($repoLeaf -notmatch '^OmnyID-WED-\d+$') {
    throw "Run this harness only from a dedicated OmnyID-WED task worktree, not the primary checkout"
}

$gitTop = (git -C $repo rev-parse --show-toplevel).Trim().Replace("/", "\")
$gitSha = (git -C $repo rev-parse HEAD).Trim()
$dirty = @(git -C $repo status --short)
Write-Host "worktree=$gitTop"
Write-Host "source_sha=$gitSha"
if ($gitTop -ne $repo) { throw "Git toplevel does not match the selected WED task worktree" }
if ($dirty.Count -ne 0) { throw "Refusing to build or run the full-account harness from a dirty tree" }

$dbPort = Get-FreeLoopbackPort
$apiPort = Get-FreeLoopbackPort
$uiPort = Get-FreeLoopbackPort
$taskSlug = $repoLeaf.ToLowerInvariant()
$container = "omnyid-e2e-$taskSlug-pg-$PID"
if ($container -notmatch '^omnyid-e2e-omnyid-wed-\d+-pg-\d+$') { throw "Unsafe container name" }
$databaseUrl = "postgres://omnyid_test:omnyid_test@127.0.0.1:$dbPort/omnyid_test"
$apiOrigin = "http://127.0.0.1:$apiPort"
$uiOrigin = "http://127.0.0.1:$uiPort"
$password = "OmnyID-Wedding-E2E-Synthetic-Only!"
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase "omnyid-wedding-e2e-$PID-$([Guid]::NewGuid().ToString('N'))"
$tempRoot = [IO.Path]::GetFullPath($tempRoot)
if (-not $tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($tempRoot) -notmatch '^omnyid-wedding-e2e-') {
    throw "Unsafe temporary directory target"
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null
$manifestPath = Join-Path $tempRoot "seed-manifest.json"
$cargoTarget = if ($SkipBuild) { Join-Path $repo "target" } else { Join-Path $tempRoot "cargo-target" }
$serverOut = Join-Path $tempRoot "homeserver.out.log"
$serverErr = Join-Path $tempRoot "homeserver.err.log"
$uiOut = Join-Path $tempRoot "ui.out.log"
$uiErr = Join-Path $tempRoot "ui.err.log"
$seedOut = Join-Path $tempRoot "seed.out.log"
$seedErr = Join-Path $tempRoot "seed.err.log"
$dockerProbeOut = Join-Path $tempRoot "docker.out.log"
$dockerProbeErr = Join-Path $tempRoot "docker.err.log"
$server = $null
$ui = $null
$containerStarted = $false
$completed = $false

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
    OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED = "true"
    OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED = "true"
    OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST = ""
    OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED = "false"
    OMNYID_VENDOR_MAIL_ENABLED = "false"
    OMNYID_VENDOR_MAIL_INGRESS_ENABLED = "false"
    OMNYID_VENDOR_MAIL_OUTBOUND_ENABLED = "false"
    OMNYID_EMAIL_WORKER_ENABLED = "false"
    OMNYID_TRANSACTIONAL_CLOUDFLARE_API_TOKEN = ""
    OMNYID_TRANSACTIONAL_CLOUDFLARE_ACCOUNT_ID = ""
    OMNYID_TRANSACTIONAL_RESEND_API_KEY = ""
    SMTP_HOST = ""
    SMTP_USER = ""
    SMTP_PASS = ""
    OMNYID_ALLOW_INSECURE_UNSIGNED = "false"
    OMNYID_ALLOW_PLAINTEXT_STORAGE = "false"
    OMNYID_SIGNING_KEY_HEX = ("31" * 32)
    OMNYID_ENCRYPTION_KEY_HEX = ("32" * 32)
    RUST_LOG = "warn,omnyid_homeserver=info"
}

try {
    $dockerProbe = Start-Process -FilePath "docker.exe" -ArgumentList @("info") -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $dockerProbeOut -RedirectStandardError $dockerProbeErr
    if (-not $dockerProbe.WaitForExit(15000)) {
        Stop-Child $dockerProbe
        throw "Docker Desktop did not answer within 15 seconds"
    }
    if ($dockerProbe.ExitCode -ne 0) { throw "Docker Desktop is not ready" }
    docker run --detach --name $container --publish "127.0.0.1:$dbPort`:5432" `
        --tmpfs "/var/lib/postgresql:rw,nosuid,size=2g" `
        --env POSTGRES_USER=omnyid_test --env POSTGRES_PASSWORD=omnyid_test `
        --env POSTGRES_DB=omnyid_test `
        pgvector/pgvector:pg18 | Out-Null
    $containerStarted = $true
    $dbDeadline = [DateTimeOffset]::UtcNow.AddSeconds(60)
    do {
        docker exec $container pg_isready -U omnyid_test -d omnyid_test *> $null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Milliseconds 500
    } while ([DateTimeOffset]::UtcNow -lt $dbDeadline)
    if ($LASTEXITCODE -ne 0) { throw "Disposable Postgres did not become ready" }

    if (-not $SkipBuild) {
        Push-Location $repo
        try {
            $env:CARGO_TARGET_DIR = $cargoTarget
            $env:CARGO_INCREMENTAL = "0"
            $env:CARGO_PROFILE_DEV_DEBUG = "0"
            cargo build --bin omnyid-homeserver --bin wedding_e2e_seed
            if ($LASTEXITCODE -ne 0) { throw "Rust build failed" }
        }
        finally {
            Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
            Remove-Item Env:CARGO_INCREMENTAL -ErrorAction SilentlyContinue
            Remove-Item Env:CARGO_PROFILE_DEV_DEBUG -ErrorAction SilentlyContinue
            Pop-Location
        }
        Push-Location (Join-Path $repo "solid-ui")
        try {
            npm ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
        }
        finally { Pop-Location }
        Push-Location (Join-Path $repo "solid-ui")
        try {
            $env:OMNYID_E2E_API_ORIGIN = $apiOrigin
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "Solid UI production build failed" }
        }
        finally { Remove-Item Env:OMNYID_E2E_API_ORIGIN -ErrorAction SilentlyContinue; Pop-Location }
    }

    $serverExe = Join-Path $cargoTarget "debug\omnyid-homeserver.exe"
    $seedExe = Join-Path $cargoTarget "debug\wedding_e2e_seed.exe"
    if (-not (Test-Path $serverExe) -or -not (Test-Path $seedExe)) { throw "Build the selected WED task binaries first" }
    $server = Start-Process -FilePath $serverExe -WorkingDirectory $repo -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -Environment $serverEnvironment
    Wait-Http "$apiOrigin/auth/google/config" 90

    $seedEnvironment = @{
        DATABASE_URL = $databaseUrl
        OMNYID_E2E_API_ORIGIN = $apiOrigin
        OMNYID_E2E_PASSWORD = $password
        OMNYID_E2E_SEED_MANIFEST = $manifestPath
        OMNYID_DISABLE_DOTENV_AUTOLOAD = "true"
    }
    $seed = Start-Process -FilePath $seedExe -WorkingDirectory $repo -WindowStyle Hidden -PassThru -Wait `
        -RedirectStandardOutput $seedOut -RedirectStandardError $seedErr -Environment $seedEnvironment
    if ($seed.ExitCode -ne 0) { throw "Seeder failed: $(Get-Content $seedErr -Raw)" }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $allowlist = @($manifest.delegate_owner_allowlist) -join ","
    if ([string]::IsNullOrWhiteSpace($allowlist)) { throw "Seeder did not produce an owner allowlist" }

    Stop-Child $server
    $server = $null
    $serverEnvironment.OMNYID_WEDDING_BOUNDARY_DELEGATE_OWNER_ALLOWLIST = $allowlist
    $server = Start-Process -FilePath $serverExe -WorkingDirectory $repo -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -Environment $serverEnvironment
    Wait-Http "$apiOrigin/auth/google/config" 90

    $uiEnvironment = @{ OMNYID_E2E_API_ORIGIN = $apiOrigin }
    $ui = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "preview", "--", "--host", "127.0.0.1", "--port", "$uiPort") `
        -WorkingDirectory (Join-Path $repo "solid-ui") -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $uiOut -RedirectStandardError $uiErr -Environment $uiEnvironment
    Wait-Http "$uiOrigin/workspace/" 60

    Push-Location (Join-Path $repo "solid-ui")
    try {
        $env:OMNYID_E2E_UI_ORIGIN = $uiOrigin
        $env:OMNYID_E2E_SEED_MANIFEST = $manifestPath
        $env:OMNYID_E2E_PASSWORD = $password
        npm run test:wedding:full-account
        if ($LASTEXITCODE -ne 0) { throw "Full-account Playwright journey failed" }
    } finally {
        Remove-Item Env:OMNYID_E2E_UI_ORIGIN -ErrorAction SilentlyContinue
        Remove-Item Env:OMNYID_E2E_SEED_MANIFEST -ErrorAction SilentlyContinue
        Remove-Item Env:OMNYID_E2E_PASSWORD -ErrorAction SilentlyContinue
        Pop-Location
    }
    $completed = $true
    Write-Host "Full-account Wedding harness passed at $gitSha"
} finally {
    if ($KeepStack -and $completed) {
        Write-Host "Stack retained for this shell session: UI $uiOrigin, API $apiOrigin, container $container"
        Write-Host "Evidence directory: $tempRoot"
    } else {
        Stop-Child $ui
        Stop-Child $server
        if ($containerStarted) {
            $resolvedContainer = (docker inspect --format '{{.Name}}' $container 2>$null).TrimStart('/')
            if ($resolvedContainer -eq $container) {
                docker stop $container | Out-Null
                docker rm $container | Out-Null
            }
        }
        if (-not $completed) {
            $resolvedCargoTarget = [IO.Path]::GetFullPath($cargoTarget)
            if ($resolvedCargoTarget.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedCargoTarget)) {
                Remove-Item -LiteralPath $resolvedCargoTarget -Recurse -Force
            }
            Write-Host "Harness failed; local redacted logs retained at $tempRoot"
        } elseif (Test-Path -LiteralPath $tempRoot) {
            $resolvedTemp = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $tempRoot).Path)
            if ($resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolvedTemp) -match '^omnyid-wedding-e2e-') {
                Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
            }
        }
    }
}
