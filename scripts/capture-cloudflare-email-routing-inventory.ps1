param(
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

$token = if (-not [string]::IsNullOrWhiteSpace($ApiTokenFile)) {
    if (-not (Test-Path -LiteralPath $ApiTokenFile)) {
        throw "Cloudflare API token file was not found."
    }
    (Get-Content -LiteralPath $ApiTokenFile -Raw).Trim()
} else {
    [string]$env:CLOUDFLARE_API_TOKEN
}
if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Provide -ApiTokenFile or set CLOUDFLARE_API_TOKEN with Email Routing read permission."
}

$headers = @{ Authorization = "Bearer $token" }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$captureFailures = [System.Collections.Generic.List[string]]::new()

function Save-CloudflareResponse {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    try {
        $response = Invoke-RestMethod -Method Get -Headers $headers -Uri "https://api.cloudflare.com/client/v4/$Path"
        if (-not $response.success) {
            throw "Cloudflare returned an unsuccessful API envelope."
        }
        [System.IO.File]::WriteAllText(
            $OutputPath,
            ($response | ConvertTo-Json -Depth 100),
            [System.Text.UTF8Encoding]::new($false)
        )
        return $response
    } catch {
        $body = $_.ErrorDetails.Message
        $codes = @()
        $messages = @()
        try {
            $payload = $body | ConvertFrom-Json
            $codes = @($payload.errors | ForEach-Object { $_.code })
            $messages = @($payload.errors | ForEach-Object { $_.message })
        } catch {
            $messages = @("request failed")
        }
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
        $errorRecord = [ordered]@{
            endpoint = "/$Path"
            status_code = $statusCode
            error_codes = $codes
            error_messages = $messages
            captured_at_utc = [DateTime]::UtcNow.ToString("o")
        }
        [System.IO.File]::WriteAllText(
            "$OutputPath.error.json",
            ($errorRecord | ConvertTo-Json -Depth 10),
            [System.Text.UTF8Encoding]::new($false)
        )
        $script:captureFailures.Add("/$Path (HTTP $statusCode; codes: $($codes -join ','))")
        return $null
    }
}

$rules = Save-CloudflareResponse -Path "zones/$ZoneId/email/routing/rules" -OutputPath (Join-Path $OutDir "routing-rules.json")
$catchAll = Save-CloudflareResponse -Path "zones/$ZoneId/email/routing/rules/catch_all" -OutputPath (Join-Path $OutDir "catch-all.json")
$routing = Save-CloudflareResponse -Path "zones/$ZoneId/email/routing" -OutputPath (Join-Path $OutDir "routing-status.json")
$addresses = Save-CloudflareResponse -Path "accounts/$AccountId/email/routing/addresses" -OutputPath (Join-Path $OutDir "destination-addresses.json")

try {
    $dnsExport = Invoke-WebRequest -Method Get -Headers $headers -Uri "https://api.cloudflare.com/client/v4/zones/$ZoneId/dns_records/export"
    [System.IO.File]::WriteAllText((Join-Path $OutDir "dns-records.bind"), $dnsExport.Content, [System.Text.UTF8Encoding]::new($false))
} catch {
    $body = $_.ErrorDetails.Message
    $codes = @()
    $messages = @()
    try {
        $payload = $body | ConvertFrom-Json
        $codes = @($payload.errors | ForEach-Object { $_.code })
        $messages = @($payload.errors | ForEach-Object { $_.message })
    } catch {
        $messages = @("request failed")
    }
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { $null }
    [System.IO.File]::WriteAllText(
        (Join-Path $OutDir "dns-records.bind.error.json"),
        ([ordered]@{
            endpoint = "/zones/$ZoneId/dns_records/export"
            status_code = $statusCode
            error_codes = $codes
            error_messages = $messages
            captured_at_utc = [DateTime]::UtcNow.ToString("o")
        } | ConvertTo-Json -Depth 10),
        [System.Text.UTF8Encoding]::new($false)
    )
    $captureFailures.Add("/zones/$ZoneId/dns_records/export (HTTP $statusCode; codes: $($codes -join ','))")
}

if ($catchAll) {
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
}

[pscustomobject]@{
    out_dir = (Resolve-Path -LiteralPath $OutDir).Path
    routing_rule_count = if ($rules) { @($rules.result).Count } else { $null }
    catch_all_enabled = if ($catchAll) { $catchAll.result.enabled } else { $null }
    destination_address_count = if ($addresses) { @($addresses.result).Count } else { $null }
    routing_status = if ($routing) { $routing.result.status } else { $null }
    rollback = if ($catchAll) { Join-Path (Resolve-Path -LiteralPath $OutDir).Path "catch-all-rollback.json" } else { $null }
    failures = @($captureFailures)
} | ConvertTo-Json -Compress

if ($captureFailures.Count -gt 0) {
    throw "Cloudflare inventory is incomplete. Saved successful responses and endpoint error records to $OutDir. Failures: $($captureFailures -join '; ')"
}
