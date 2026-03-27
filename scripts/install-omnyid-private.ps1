param(
    [ValidateSet("local", "oracle", "upcloud", "ovhcloud", "byoc")]
    [string]$Mode = "local",
    [string]$WorkspaceName = "",
    [string]$OwnerEmail = "",
    [string]$Region = "",
    [string]$OutputRoot = "",
    [switch]$LaunchLocal
)

$ErrorActionPreference = "Stop"

$estimatedTransferMb = switch ($Mode) {
    "local" { 2200 }
    "oracle" { 900 }
    "upcloud" { 900 }
    "ovhcloud" { 900 }
    "byoc" { 900 }
    default { 1200 }
}

function Read-Value {
    param(
        [string]$Prompt,
        [string]$Default = ""
    )

    $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
    $value = Read-Host $label
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
    }
    return $value.Trim()
}

function New-HexSecret {
    param([int]$ByteLength = 18)

    $bytes = New-Object byte[] $ByteLength
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

function Convert-ToSlug {
    param([string]$Value)

    $lower = $Value.ToLowerInvariant()
    $ascii = [regex]::Replace($lower, "[^a-z0-9]+", "-")
    $ascii = $ascii.Trim("-")
    if ([string]::IsNullOrWhiteSpace($ascii)) {
        return "omnyid-user"
    }
    return $ascii
}

function Write-Lines {
    param(
        [string]$Path,
        [string[]]$Lines
    )

    $content = ($Lines -join [Environment]::NewLine) + [Environment]::NewLine
    Set-Content -Path $Path -Value $content -Encoding UTF8
}

function Test-CommandAvailable {
    param([string]$Name)

    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-RoughBandwidthMbps {
    $tempPath = Join-Path $env:TEMP ("omnyid-bandwidth-" + [guid]::NewGuid().ToString() + ".bin")
    $url = "https://speed.cloudflare.com/__down?bytes=5000000"
    try {
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        Invoke-WebRequest -Uri $url -OutFile $tempPath -UseBasicParsing | Out-Null
        $watch.Stop()
        $bytes = (Get-Item $tempPath).Length
        if ($watch.Elapsed.TotalSeconds -le 0 -or $bytes -le 0) {
            return $null
        }
        $mbps = (($bytes * 8) / 1MB) / $watch.Elapsed.TotalSeconds
        return [math]::Round($mbps, 1)
    }
    catch {
        return $null
    }
    finally {
        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-InstallEstimate {
    param(
        [string]$InstallMode,
        [double]$BandwidthMbps,
        [bool]$HasDocker
    )

    $provisionMinutes = switch ($InstallMode) {
        "local" { if ($HasDocker) { 4 } else { 15 } }
        "oracle" { 10 }
        "upcloud" { 10 }
        "ovhcloud" { 10 }
        "byoc" { 12 }
        default { 8 }
    }

    if ($BandwidthMbps -gt 0) {
        $downloadMinutes = [math]::Ceiling((($estimatedTransferMb * 8) / $BandwidthMbps) / 60)
    } else {
        $downloadMinutes = switch ($InstallMode) {
            "local" { if ($HasDocker) { 8 } else { 18 } }
            default { 6 }
        }
    }

    $total = $provisionMinutes + $downloadMinutes
    return [ordered]@{
        approximate_transfer_mb = $estimatedTransferMb
        estimated_download_minutes = $downloadMinutes
        estimated_total_minutes = $total
        summary = switch ($InstallMode) {
            "local" { "Local private install usually takes about $total minutes depending on Docker readiness and bandwidth." }
            default { "Private cloud preparation usually takes about $total minutes once credentials and provisioning are ready." }
        }
    }
}

function Get-PreflightReport {
    param([string]$InstallMode)

    $computer = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $dockerAvailable = Test-CommandAvailable "docker"
    $cargoAvailable = Test-CommandAvailable "cargo"
    $bandwidthMbps = Get-RoughBandwidthMbps
    $bandwidthForEstimate = if ($null -ne $bandwidthMbps) { [double]$bandwidthMbps } else { 0 }
    $estimate = Get-InstallEstimate -InstallMode $InstallMode -BandwidthMbps $bandwidthForEstimate -HasDocker $dockerAvailable
    $recommendations = @()
    if (-not $dockerAvailable) {
        $recommendations += "Install Docker Desktop before local launch."
    }
    if (-not $cargoAvailable) {
        $recommendations += "Install Rust 1.94.0 or run the installer from an OmnyID bundle host that already has cargo."
    }
    if ($computer.TotalPhysicalMemory / 1GB -lt 8) {
        $recommendations += "8 GB RAM or more is recommended for local OpenClaw and CrewAI development."
    }
    if ($disk -and $disk.FreeSpace / 1GB -lt 20) {
        $recommendations += "Free at least 20 GB of disk for Docker layers, runtime logs, and local workspace data."
    }

    return [ordered]@{
        installer_platform = "windows"
        deployment_mode = $InstallMode
        os_caption = $os.Caption
        cpu_logical_cores = [int]$computer.NumberOfLogicalProcessors
        memory_gb = [math]::Round($computer.TotalPhysicalMemory / 1GB, 1)
        free_disk_gb = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 1) } else { $null }
        docker_available = $dockerAvailable
        cargo_available = $cargoAvailable
        rough_bandwidth_mbps = $bandwidthMbps
        estimate = $estimate
        recommendations = $recommendations
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($WorkspaceName)) {
    $WorkspaceName = Read-Value -Prompt "Workspace name" -Default "My Private Assistant"
}
if ([string]::IsNullOrWhiteSpace($OwnerEmail)) {
    $OwnerEmail = Read-Value -Prompt "Owner email" -Default "you@example.com"
}
if ([string]::IsNullOrWhiteSpace($Region)) {
    $defaultRegion = switch ($Mode) {
        "oracle" { "ap-sydney-1" }
        "upcloud" { "au-syd1" }
        "ovhcloud" { "syd" }
        "byoc" { "customer-choice" }
        default { "local-device" }
    }
    $Region = Read-Value -Prompt "Preferred region" -Default $defaultRegion
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
    $OutputRoot = Join-Path $env:USERPROFILE "Documents\OmnyID"
}

$slug = Convert-ToSlug $WorkspaceName
$domain = switch ($Mode) {
    "local" { "$slug.local.omnyid" }
    "oracle" { "$slug.cloud.omnyid.com" }
    "upcloud" { "$slug.upcloud.omnyid.com" }
    "ovhcloud" { "$slug.ovh.omnyid.com" }
    default { "$slug.private.omnyid.com" }
}
$agentId = "agent:$slug@$domain"
$gatewayAgentId = "agent:gateway-$slug@$domain"
$bundlePath = Join-Path $OutputRoot $slug
New-Item -ItemType Directory -Force -Path $bundlePath | Out-Null
$preflight = Get-PreflightReport -InstallMode $Mode
$preflight | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $bundlePath "preflight.json") -Encoding UTF8

$keyPayloadJson = & cargo run --quiet --bin omnyid_keys -- --format json
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($keyPayloadJson)) {
    throw "Unable to generate OmnyID keys. Install Rust 1.94.0 and rerun this installer."
}
$keys = $keyPayloadJson | ConvertFrom-Json

$homeserverUrl = switch ($Mode) {
    "local" { "http://127.0.0.1:8080" }
    "oracle" { "https://api.omnyid.com" }
    default { "https://api.omnyid.com" }
}
$delegation = switch ($Mode) {
    "local" { "127.0.0.1:8080" }
    default { "api.omnyid.com:443" }
}
$minioPassword = New-HexSecret
$tenantKeyRef = "omnyid/$slug/data-key"
$privacyMode = if ($Mode -eq "local") {
    "local_private"
} elseif ($Mode -eq "byoc") {
    "private_hosted"
} else {
    "managed_private"
}
$runtimeRoot = if ($Mode -eq "local") {
    Join-Path $bundlePath "runtime-data"
} else {
    "/srv/omnyid/$slug"
}

$envLines = @(
    "# OmnyID private install bundle",
    "OMNYID_WORKSPACE_NAME=$WorkspaceName",
    "OMNYID_PRIVACY_MODE=$privacyMode",
    "OMNYID_DEPLOYMENT_MODE=$Mode",
    "OMNYID_REGION=$Region",
    "OMNYID_DOMAIN=$domain",
    "OMNYID_HOMESERVER_URL=$homeserverUrl",
    "OMNYID_AFP_DELEGATION=$delegation",
    "OMNYID_AGENT_ID=$agentId",
    "OMNYID_GATEWAY_AGENT_ID=$gatewayAgentId",
    "OMNYID_EMAIL_ADDRESS=$OwnerEmail",
    "FROM_ADDRESS=$OwnerEmail",
    "OMNYID_PUBLIC_KEY_HEX=$($keys.OMNYID_PUBLIC_KEY_HEX)",
    "OMNYID_SIGNING_KEY_HEX=$($keys.OMNYID_SIGNING_KEY_HEX)",
    "OMNYID_ENCRYPTION_KEY_HEX=$($keys.OMNYID_ENCRYPTION_KEY_HEX)",
    "OMNYID_ENCRYPT_BY_DEFAULT=true",
    "OMNYID_REQUIRE_ENCRYPTION=true",
    "OMNYID_ALLOW_INSECURE_UNSIGNED=false",
    "OMNYID_ALLOW_PLAINTEXT_STORAGE=false",
    "OMNYID_ENABLE_INTERNAL_GRPC=false",
    "OMNYID_ENABLE_SERVER_SUMMARIZATION=false",
    "OMNYID_RUNTIME_ROOT=$runtimeRoot",
    "OMNYID_TENANT_KEY_REF=$tenantKeyRef",
    "OMNYID_SUPPORT_ACCESS=disabled_by_default",
    "MINIO_ROOT_USER=omnyid_$slug",
    "MINIO_ROOT_PASSWORD=$minioPassword",
    "OMNYID_MAIL_PROVIDER=optional_human_inbox_bridge",
    "OMNYID_GMAIL_CLIENT_ID=__OPTIONAL__",
    "OMNYID_GMAIL_CLIENT_SECRET=__OPTIONAL__",
    "OMNYID_GMAIL_REFRESH_TOKEN=__OPTIONAL__",
    "SMTP_HOST=__OPTIONAL__",
    "SMTP_USER=__OPTIONAL__",
    "SMTP_PASS=__OPTIONAL__",
    "OMNYID_WEBTRANSPORT_CERT_PATH=__SET_IF_HOSTED__",
    "OMNYID_WEBTRANSPORT_KEY_PATH=__SET_IF_HOSTED__"
)
Write-Lines -Path (Join-Path $bundlePath ".env.private") -Lines $envLines

$tenantManifest = [ordered]@{
    workspace_name = $WorkspaceName
    owner_email = $OwnerEmail
    deployment_mode = $Mode
    privacy_mode = $privacyMode
    region = $Region
    agent_id = $agentId
    gateway_agent_id = $gatewayAgentId
    homeserver_url = $homeserverUrl
    afp_delegation = $delegation
    tenant_key_reference = $tenantKeyRef
    isolation = [ordered]@{
        runtime = "one customer, one isolated runtime"
        storage = "one customer, one isolated storage volume"
        secrets = "one customer, one isolated secret set"
        auth = "one customer, one isolated auth boundary"
    }
    support_access = [ordered]@{
        default = "disabled"
        break_glass = "time-limited and consent-based"
    }
    provider_notes = switch ($Mode) {
        "oracle" { "Use Oracle Cloud VM APIs or Terraform/OpenTofu later to provision a dedicated tenant host or microVM." }
        "upcloud" { "Use UpCloud API/Terraform to provision a dedicated tenant VM with encrypted volume." }
        "ovhcloud" { "Use OVHcloud APIs/Terraform to provision a dedicated tenant VM with encrypted volume." }
        "byoc" { "Best privacy path: provision inside the customer's own cloud account so OmnyID stays a control plane." }
        default { "Strongest privacy story for non-technical users who want to keep data on their own machine." }
    }
}
$tenantManifest | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $bundlePath "tenant.json") -Encoding UTF8

$cloudInit = @(
    "#cloud-config",
    "package_update: true",
    "packages:",
    "  - docker.io",
    "  - docker-compose-v2",
    "  - cryptsetup",
    "  - jq",
    "runcmd:",
    "  - mkdir -p /srv/omnyid/$slug",
    "  - mkdir -p /srv/omnyid/$slug/runtime",
    "  - mkdir -p /srv/omnyid/$slug/secrets",
    "  - echo 'Mount an encrypted tenant volume here before placing runtime data.' > /srv/omnyid/$slug/README_PRIVACY.txt",
    "  - echo 'Customer-managed keys or KMS-backed envelope encryption should be wired before production launch.' >> /srv/omnyid/$slug/README_PRIVACY.txt"
)
Write-Lines -Path (Join-Path $bundlePath "cloud-init.yaml") -Lines $cloudInit

$readmeLines = @(
    "# OmnyID Private Install Bundle",
    "",
    "This bundle is designed to keep the website as a control plane and the user runtime as a separate private data plane.",
    "",
    "## What was prepared",
    "- One Agent ID: $agentId",
    "- One isolated gateway ID: $gatewayAgentId",
    "- One private env file: .env.private",
    "- One tenant manifest: tenant.json",
    "- One cloud-init bootstrap template: cloud-init.yaml",
    "- One environment preflight report: preflight.json",
    "",
    "## Recommended privacy ladder",
    "1. Local Private",
    "   Best privacy for individuals. OmnyID helps install locally and the data stays on the user's machine.",
    "2. BYOC Private Cloud",
    "   Best hosted privacy balance. OmnyID provisions into the customer's own Oracle, UpCloud, or OVHcloud account.",
    "3. Managed Private",
    "   Easiest for non-technical users, but OmnyID still hosts the compute. Use only with explicit privacy disclosures.",
    "",
    "## What to promise users",
    "- Dedicated isolated runtime",
    "- Dedicated isolated storage",
    "- Dedicated isolated secrets",
    "- Support access disabled by default",
    "",
    "## What not to promise yet",
    "- That operators can never access data under any circumstance",
    "- That hosted mode is equal to local/private-cloud ownership",
    "",
    "## Next steps for this bundle",
    "- Local mode: run Docker Desktop, then start the stack with the command below.",
    "- Hosted mode: create a dedicated VM or microVM and attach an encrypted tenant volume before runtime data is written.",
    "- Vault or KMS: bind the tenant key reference $tenantKeyRef before storing customer secrets.",
    "- Estimated install time: $($preflight.estimate.summary)",
    "",
    "## Local start command",
    "docker compose --env-file `"$bundlePath\\.env.private`" -f `"$projectRoot\\docker-compose.yml`" up -d --build",
    "",
    "## Hosted bootstrap reminder",
    "Do not place multiple untrusted customers in the same shared OpenClaw or Crew runtime.",
    "One customer must map to one isolated runtime, one storage boundary, and one secret boundary."
)
Write-Lines -Path (Join-Path $bundlePath "README.md") -Lines $readmeLines

if ($LaunchLocal -and $Mode -eq "local") {
    $dockerVersion = & docker compose version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose was not found. Install Docker Desktop first, then rerun with -LaunchLocal."
    }

    Write-Host "Starting OmnyID locally with the private env bundle..."
    & docker compose --env-file (Join-Path $bundlePath ".env.private") -f (Join-Path $projectRoot "docker-compose.yml") up -d --build
}

Write-Host ""
Write-Host "OmnyID private install bundle created:"
Write-Host "  $bundlePath"
Write-Host ""
Write-Host "Preflight summary:"
Write-Host "  $($preflight.estimate.summary)"
if ($preflight.rough_bandwidth_mbps) {
    Write-Host "  Rough bandwidth: $($preflight.rough_bandwidth_mbps) Mbps"
}
if ($preflight.recommendations.Count -gt 0) {
    Write-Host "  Recommendations:"
    foreach ($item in $preflight.recommendations) {
        Write-Host "    - $item"
    }
}
Write-Host ""
Write-Host "Core privacy recommendation:"
Write-Host "  Lead with Local Private and BYOC Private Cloud."
Write-Host "  Treat hosted OmnyID as a control plane, not as a shared customer runtime."
