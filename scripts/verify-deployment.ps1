param(
    [string]$BaseUrl = "",
    [string]$WorkspaceUrl = "",
    [string]$ExpectedCspFragment = "https://static.cloudflareinsights.com",
    [string]$OperationalEndpointToken = "",
    [string]$BearerToken = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    if (-not [string]::IsNullOrWhiteSpace($env:OMNYID_BASE_URL)) {
        $BaseUrl = $env:OMNYID_BASE_URL
    } else {
        $BaseUrl = "http://127.0.0.1:8080"
    }
}

if ([string]::IsNullOrWhiteSpace($WorkspaceUrl) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_WORKSPACE_URL)) {
    $WorkspaceUrl = $env:OMNYID_WORKSPACE_URL
}

if ([string]::IsNullOrWhiteSpace($OperationalEndpointToken)) {
    if (-not [string]::IsNullOrWhiteSpace($env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE) -and (Test-Path -LiteralPath $env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE -PathType Leaf)) {
        $OperationalEndpointToken = [System.IO.File]::ReadAllText($env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE).Trim()
    } elseif (-not [string]::IsNullOrWhiteSpace($env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN)) {
        $OperationalEndpointToken = $env:OMNYID_OPERATIONAL_ENDPOINT_TOKEN
    } elseif (-not [string]::IsNullOrWhiteSpace($env:OMNYID_VERIFY_DEPLOYMENT_OPS_TOKEN)) {
        $OperationalEndpointToken = $env:OMNYID_VERIFY_DEPLOYMENT_OPS_TOKEN
    }
}

if ([string]::IsNullOrWhiteSpace($BearerToken) -and -not [string]::IsNullOrWhiteSpace($env:OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN)) {
    $BearerToken = $env:OMNYID_VERIFY_DEPLOYMENT_BEARER_TOKEN
}

function Get-OperationalHeaders {
    $headers = @{}
    if (-not [string]::IsNullOrWhiteSpace($OperationalEndpointToken)) {
        $headers["x-omnyid-ops-token"] = $OperationalEndpointToken
    }
    if (-not [string]::IsNullOrWhiteSpace($BearerToken)) {
        $headers["Authorization"] = "Bearer $BearerToken"
    }
    return $headers
}

function Get-JsonPayload {
    param([string]$Url)
    $headers = Get-OperationalHeaders
    if ($headers.Count -gt 0) {
        return Invoke-RestMethod -Uri $Url -TimeoutSec 15 -Headers $headers
    }
    return Invoke-RestMethod -Uri $Url -TimeoutSec 15
}

function Get-HeaderText {
    param([string]$Url)
    $curlExe = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($null -ne $curlExe) {
        return (& $curlExe.Source -sSI --max-time 15 $Url | Out-String).Trim()
    }

    $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 15
    $statusLine = "HTTP/1.1 $([int]$response.StatusCode)"
    if (-not [string]::IsNullOrWhiteSpace($response.StatusDescription)) {
        $statusLine += " $($response.StatusDescription)"
    }
    $lines = @($statusLine)
    foreach ($name in $response.Headers.Keys) {
        $lines += ("{0}: {1}" -f $name, ($response.Headers[$name] -join ", "))
    }
    return ($lines -join "`n")
}

$healthPayload = Get-JsonPayload "$($BaseUrl.TrimEnd('/'))/healthz"
$readyPayload = Get-JsonPayload "$($BaseUrl.TrimEnd('/'))/readyz"

$healthJson = $healthPayload | ConvertTo-Json -Compress -Depth 16
$readyJson = $readyPayload | ConvertTo-Json -Compress -Depth 16

Write-Output "[verify-deployment] healthz payload: $healthJson"
Write-Output "[verify-deployment] readyz payload: $readyJson"

if ($healthPayload.status -ne "ok") {
    throw "[verify-deployment] healthz did not report status=ok"
}

if ($readyPayload.status -ne "ready") {
    throw "[verify-deployment] readyz did not report status=ready"
}

if (-not [string]::IsNullOrWhiteSpace($WorkspaceUrl)) {
    $workspaceHeaders = Get-HeaderText $WorkspaceUrl
    Write-Output "[verify-deployment] workspace headers:"
    Write-Output $workspaceHeaders

    if ($workspaceHeaders -match "(?im)^www-authenticate:\s*basic") {
        throw "[verify-deployment] workspace route is still behind Basic auth"
    }

    if (-not [string]::IsNullOrWhiteSpace($ExpectedCspFragment) -and $workspaceHeaders -notmatch [regex]::Escape($ExpectedCspFragment)) {
        throw "[verify-deployment] workspace CSP is missing expected fragment: $ExpectedCspFragment"
    }
}

Write-Output "[verify-deployment] deployment verification passed"
