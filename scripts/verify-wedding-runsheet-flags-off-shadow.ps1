param(
    [string]$BaseUrl = "",
    [string]$RuntimeContainer = "",
    [string]$PostgresContainer = "",
    [string]$EvidencePath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$flagName = "OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED"

function Require-Match([string]$Path, [string]$Pattern, [string]$Label) {
    $content = Get-Content -LiteralPath $Path -Raw
    if ($content -notmatch $Pattern) { throw "$Label is not false-default." }
}

function Require-Text([string]$Path, [string]$Needle, [string]$Label) {
    $content = Get-Content -LiteralPath $Path -Raw
    if (-not $content.Contains($Needle)) { throw "$Label is not false-default." }
}

function Container-Environment([string]$Name) {
    $container = (docker inspect $Name | ConvertFrom-Json)[0]
    $values = @{}
    foreach ($entry in $container.Config.Env) {
        $parts = $entry -split "=", 2
        if ($parts.Length -eq 2) { $values[$parts[0]] = $parts[1] }
    }
    return $values
}

function Share-Counts([string]$Name) {
    $values = Container-Environment $Name
    $dbUser = if ($values["POSTGRES_USER"]) { $values["POSTGRES_USER"] } else { "postgres" }
    $dbName = if ($values["POSTGRES_DB"]) { $values["POSTGRES_DB"] } else { $dbUser }
    $sql = "SELECT (SELECT count(*) FROM wedding_runsheet_share_grants)::text || ',' || (SELECT count(*) FROM wedding_runsheet_share_acknowledgements)::text"
    $result = (& docker exec $Name psql -U $dbUser -d $dbName -tAc $sql).Trim() -split ",", 2
    if ($result.Length -ne 2) { throw "Could not read content-free run-sheet share counts." }
    return @{ grants = [long]$result[0]; acknowledgements = [long]$result[1] }
}

Require-Text (Join-Path $repoRoot ".env.example") "$flagName=false" ".env.example"
Require-Text (Join-Path $repoRoot "docker-compose.yml") "$flagName`: `"false`"" "local Compose"
Require-Text (Join-Path $repoRoot "docker-compose.oracle.yml") ('{0}: ${{{0}:-false}}' -f $flagName) "Oracle Compose"
Require-Match (Join-Path $repoRoot "src/server/wedding_runsheet_share_routes.rs") "as_deref\(\)\s*==\s*Some\(`"true`"\)" "server gate"

$runtimeFlag = "not-inspected"
if ($RuntimeContainer) {
    $runtime = Container-Environment $RuntimeContainer
    $runtimeFlag = [string]$runtime[$flagName]
    if ($runtimeFlag -ne "false") { throw "$flagName must be explicitly false in $RuntimeContainer." }
}

$before = if ($PostgresContainer) { Share-Counts $PostgresContainer } else { $null }
$http = @()
if ($BaseUrl) {
    $root = $BaseUrl.TrimEnd("/")
    foreach ($attempt in @(
        @{ path = "/database/wedding-runsheet/shares/open"; body = '{"token":"flags-off-shadow"}' },
        @{ path = "/database/wedding-runsheet/shares/acknowledge"; body = '{"token":"flags-off-shadow","status":"acknowledged","actor_label":"Shadow","idempotency_key":"flags-off-shadow"}' }
    )) {
        try {
            $response = Invoke-WebRequest -Uri "$root$($attempt.path)" -Method Post -ContentType "application/json" -Body $attempt.body -SkipHttpErrorCheck
            $http += @{ path = $attempt.path; status = [int]$response.StatusCode }
            if ([int]$response.StatusCode -ne 404) { throw "$($attempt.path) returned $($response.StatusCode), expected 404." }
        } catch {
            if ($_.Exception.Message -match "expected 404") { throw }
            throw "Flags-off request failed before a status was observed: $($_.Exception.Message)"
        }
    }
}
$after = if ($PostgresContainer) { Share-Counts $PostgresContainer } else { $null }
if ($before -and ($before.grants -ne $after.grants -or $before.acknowledgements -ne $after.acknowledgements)) {
    throw "Flags-off shadow changed a grant or acknowledgement count."
}

$result = [ordered]@{
    checked_at = (Get-Date).ToUniversalTime().ToString("o")
    source_commit = (git -C $repoRoot rev-parse HEAD).Trim()
    source_false_defaults = $true
    runtime_container = $RuntimeContainer
    runtime_flag = $runtimeFlag
    requests = $http
    before = $before
    after = $after
    external_delivery_attempted = $false
    passed = $true
}
$json = $result | ConvertTo-Json -Depth 5
if ($EvidencePath) {
    $parent = Split-Path -Parent $EvidencePath
    if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Set-Content -LiteralPath $EvidencePath -Value $json -Encoding utf8
}
$json
