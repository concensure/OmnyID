param(
    [Parameter(Mandatory = $true)]
    [string]$ApiTokenFile,
    [Parameter(Mandatory = $true)]
    [string]$ZoneId,
    [Parameter(Mandatory = $true)]
    [string]$AccountId,
    [Parameter(Mandatory = $true)]
    [string]$OutDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ApiTokenFile)) {
    throw "Cloudflare API token file was not found. Provide a file with the Email Routing read permission."
}

$token = (Get-Content -LiteralPath $ApiTokenFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Cloudflare API token file is empty."
}

$headers = @{ Authorization = "Bearer $token" }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

function Save-CloudflareResponse {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    $response = Invoke-RestMethod -Method Get -Headers $headers -Uri "https://api.cloudflare.com/client/v4/$Path"
    if (-not $response.success) {
        throw "Cloudflare GET /$Path did not succeed."
    }
    [System.IO.File]::WriteAllText(
        $OutputPath,
        ($response | ConvertTo-Json -Depth 100),
        [System.Text.UTF8Encoding]::new($false)
    )
    return $response
}

$rules = Save-CloudflareResponse -Path "zones/$ZoneId/email/routing/rules" -OutputPath (Join-Path $OutDir "routing-rules.json")
$catchAll = Save-CloudflareResponse -Path "zones/$ZoneId/email/routing/rules/catch_all" -OutputPath (Join-Path $OutDir "catch-all.json")
$routing = Save-CloudflareResponse -Path "zones/$ZoneId/email/routing" -OutputPath (Join-Path $OutDir "routing-status.json")
$addresses = Save-CloudflareResponse -Path "accounts/$AccountId/email/routing/addresses" -OutputPath (Join-Path $OutDir "destination-addresses.json")

$dnsExport = Invoke-WebRequest -Method Get -Headers $headers -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records/export"
[System.IO.File]::WriteAllText((Join-Path $OutDir "dns-records.bind"), $dnsExport.Content, [System.Text.UTF8Encoding]::new($false))

$rollback = [ordered]@{
    captured_at_utc = [DateTime]::UtcNow.ToString("o")
    zone_id = $ZoneId
    endpoint = "/zones/$ZoneId/email/routing/rules/catch_all"
    method = "PUT"
    body = $catchAll.result
}
[System.IO.File]::WriteAllText(
    (Join-Path $OutDir "catch-all-rollback.json"),
    ($rollback | ConvertTo-Json -Depth 100),
    [System.Text.UTF8Encoding]::new($false)
)

[pscustomobject]@{
    out_dir = (Resolve-Path -LiteralPath $OutDir).Path
    routing_rule_count = @($rules.result).Count
    catch_all_enabled = $catchAll.result.enabled
    destination_address_count = @($addresses.result).Count
    routing_status = $routing.result.status
    rollback = (Join-Path (Resolve-Path -LiteralPath $OutDir).Path "catch-all-rollback.json")
} | ConvertTo-Json -Compress
