param(
    [string]$EnvFile = "",
    [switch]$RequireProduction
)

$ErrorActionPreference = "Stop"

$fileEnv = @{}
$envFileRoot = ""

function Get-TrimmedValue {
    param([string]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.Trim()
}

function Remove-MatchingQuotes {
    param([string]$Value)
    $trimmed = Get-TrimmedValue $Value
    if ($trimmed.Length -ge 2) {
        $first = $trimmed.Substring(0, 1)
        $last = $trimmed.Substring($trimmed.Length - 1, 1)
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
            return $trimmed.Substring(1, $trimmed.Length - 2)
        }
    }
    return $trimmed
}

function Import-EnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "[startup-policy] env file not found: $Path"
    }
    $resolvedPath = (Resolve-Path $Path).Path
    $script:envFileRoot = Split-Path -Parent $resolvedPath
    foreach ($line in Get-Content $Path) {
        $trimmed = Get-TrimmedValue $line
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $match = [regex]::Match($trimmed, '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
        if (-not $match.Success) {
            continue
        }
        $key = $match.Groups[1].Value
        $value = Remove-MatchingQuotes $match.Groups[2].Value
        $script:fileEnv[$key] = $value
    }
}

function Get-EnvValue {
    param([string]$Name)
    if ($script:fileEnv.ContainsKey($Name)) {
        return $script:fileEnv[$Name]
    }
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ($null -eq $value) { return "" }
    return $value
}

function Get-SecretEnvValue {
    param([string]$Name)
    $direct = Get-TrimmedValue (Get-EnvValue $Name)
    if (-not [string]::IsNullOrWhiteSpace($direct)) {
        return $direct
    }
    $fileValue = Get-TrimmedValue (Get-EnvValue "${Name}_FILE")
    if ([string]::IsNullOrWhiteSpace($fileValue)) {
        return ""
    }
    $resolvedPath = Resolve-EnvRelativePath $fileValue
    if ([string]::IsNullOrWhiteSpace($resolvedPath) -or -not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        return ""
    }
    try {
        return (Get-TrimmedValue ([System.IO.File]::ReadAllText($resolvedPath)))
    }
    catch {
        return ""
    }
}

function Resolve-EnvRelativePath {
    param([string]$Path)
    $trimmed = Get-TrimmedValue $Path
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return ""
    }
    if ([System.IO.Path]::IsPathRooted($trimmed) -or [string]::IsNullOrWhiteSpace($script:envFileRoot)) {
        return $trimmed
    }
    return [System.IO.Path]::GetFullPath((Join-Path $script:envFileRoot $trimmed))
}

function Get-SecretPresenceViolation {
    param([string]$Name)
    $direct = Get-TrimmedValue (Get-EnvValue $Name)
    if (-not [string]::IsNullOrWhiteSpace($direct)) {
        return $null
    }

    $fileValue = Get-TrimmedValue (Get-EnvValue "${Name}_FILE")
    if ([string]::IsNullOrWhiteSpace($fileValue)) {
        return "$Name or ${Name}_FILE must be configured in production"
    }

    $resolvedPath = Resolve-EnvRelativePath $fileValue
    if ([string]::IsNullOrWhiteSpace($resolvedPath) -or -not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        return "${Name}_FILE points to a missing secret file: $fileValue"
    }

    try {
        $content = [System.IO.File]::ReadAllText($resolvedPath)
    }
    catch {
        return "${Name}_FILE could not be read: $fileValue"
    }

    if ([string]::IsNullOrWhiteSpace($content.Trim())) {
        return "${Name}_FILE points to a blank secret file: $fileValue"
    }

    return $null
}

function Get-SecretMustBeFileBackedViolation {
    param([string]$Name)

    $direct = Get-TrimmedValue (Get-EnvValue $Name)
    if ([string]::IsNullOrWhiteSpace($direct)) {
        return $null
    }

    $fileValue = Get-TrimmedValue (Get-EnvValue "${Name}_FILE")
    if ([string]::IsNullOrWhiteSpace($fileValue)) {
        return "$Name must be supplied via ${Name}_FILE in production; plaintext env values are not allowed"
    }

    $resolvedPath = Resolve-EnvRelativePath $fileValue
    if ([string]::IsNullOrWhiteSpace($resolvedPath) -or -not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        return "${Name}_FILE points to a missing secret file: $fileValue"
    }

    try {
        $content = [System.IO.File]::ReadAllText($resolvedPath)
    }
    catch {
        return "${Name}_FILE could not be read: $fileValue"
    }

    if ([string]::IsNullOrWhiteSpace($content.Trim())) {
        return "${Name}_FILE points to a blank secret file: $fileValue"
    }

    return $null
}

function Test-Truthy {
    param([string]$Value)
    switch ((Get-TrimmedValue $Value).ToLowerInvariant()) {
        "1" { return $true }
        "true" { return $true }
        "yes" { return $true }
        "on" { return $true }
        default { return $false }
    }
}

function Test-Falsy {
    param([string]$Value)
    switch ((Get-TrimmedValue $Value).ToLowerInvariant()) {
        "0" { return $true }
        "false" { return $true }
        "no" { return $true }
        "off" { return $true }
        default { return $false }
    }
}

function Test-BoolLike {
    param([string]$Value)
    $trimmed = Get-TrimmedValue $Value
    if ([string]::IsNullOrWhiteSpace($trimmed)) { return $true }
    return (Test-Truthy $trimmed) -or (Test-Falsy $trimmed)
}

function Get-ComposioLiveVerificationViolation {
    $shouldVerify = Get-TrimmedValue (Get-EnvValue "OMNYID_VERIFY_COMPOSIO_LIVE")
    if (-not (Test-Truthy $shouldVerify)) {
        return $null
    }

    $apiKey = Get-TrimmedValue (Get-SecretEnvValue "COMPOSIO_API_KEY")
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        return "OMNYID_VERIFY_COMPOSIO_LIVE is enabled, but COMPOSIO_API_KEY is not configured"
    }

    $baseUrl = Get-TrimmedValue (Get-EnvValue "OMNYID_COMPOSIO_API_BASE_URL")
    if ([string]::IsNullOrWhiteSpace($baseUrl)) {
        $baseUrl = "https://backend.composio.dev"
    }
    $baseUrl = $baseUrl.TrimEnd('/')

    $timeoutRaw = Get-TrimmedValue (Get-EnvValue "OMNYID_COMPOSIO_VERIFY_TIMEOUT_SECS")
    $timeoutSecs = 15
    if (-not [string]::IsNullOrWhiteSpace($timeoutRaw)) {
        $parsedTimeout = 0
        if ([int]::TryParse($timeoutRaw, [ref]$parsedTimeout) -and $parsedTimeout -gt 0) {
            $timeoutSecs = $parsedTimeout
        }
    }

    $probeUrl = "$baseUrl/api/v3.1/tools?limit=1"
    try {
        $response = Invoke-WebRequest `
            -Uri $probeUrl `
            -Headers @{ "x-api-key" = $apiKey; "accept" = "application/json" } `
            -Method Get `
            -TimeoutSec $timeoutSecs `
            -UseBasicParsing `
            -MaximumRedirection 3
        $statusCode = [int]$response.StatusCode
    }
    catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        else {
            return "Could not reach Composio during startup validation ($probeUrl)"
        }
    }

    if ($statusCode -ge 200 -and $statusCode -lt 400) {
        return $null
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        return "COMPOSIO_API_KEY was rejected by Composio during startup validation (HTTP $statusCode)"
    }
    if ($statusCode -eq 429) {
        return "Composio rate limited startup validation (HTTP 429)"
    }
    if ($statusCode -ge 500) {
        return "Composio upstream error during startup validation (HTTP $statusCode)"
    }
    return "Composio startup validation failed with HTTP $statusCode"
}

function Get-StartupEnvironmentLabel {
    foreach ($name in @("OMNYID_ENV", "APP_ENV", "ENVIRONMENT", "RUST_ENV", "NODE_ENV")) {
        $value = (Get-TrimmedValue (Get-EnvValue $name)).ToLowerInvariant()
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }
    return ""
}

function Test-DevDatabaseUrl {
    param([string]$DatabaseUrl)
    $trimmed = Get-TrimmedValue $DatabaseUrl
    return [string]::IsNullOrWhiteSpace($trimmed) `
        -or $trimmed -eq "postgres://afp:afp@postgres:5432/afp" `
        -or $trimmed -eq "postgres://afp:afp@localhost:5432/afp" `
        -or $trimmed -eq "postgresql://afp:afp@postgres:5432/afp" `
        -or $trimmed -eq "postgresql://afp:afp@localhost:5432/afp"
}

function Test-EnvVarPresent {
    param([string]$Name)
    return -not [string]::IsNullOrWhiteSpace((Get-TrimmedValue (Get-EnvValue $Name)))
}

function Test-SecretPresent {
    param([string]$Name)
    return -not [string]::IsNullOrWhiteSpace((Get-SecretEnvValue $Name))
}

function Test-StripeSecretKey {
    param([string]$Value)
    $trimmed = Get-TrimmedValue $Value
    return (($trimmed.StartsWith("sk_live_") -or $trimmed.StartsWith("sk_test_")) -and $trimmed.Length -gt 8)
}

function Test-StripeWebhookSecret {
    param([string]$Value)
    $trimmed = Get-TrimmedValue $Value
    return ($trimmed.StartsWith("whsec_") -and $trimmed.Length -gt 6)
}

function Test-StripePriceId {
    param([string]$Value)
    $trimmed = Get-TrimmedValue $Value
    return ($trimmed.StartsWith("price_") -and $trimmed.Length -gt 6)
}

function Test-StripeProductionConfigPresent {
    foreach ($name in @(
        "OMNYID_STRIPE_SECRET_KEY",
        "OMNYID_STRIPE_WEBHOOK_SECRET",
        "OMNYID_STRIPE_PRO_PRICE_ID",
        "OMNYID_STRIPE_CHECKOUT_PRICE_ID",
        "OMNYID_STRIPE_TEAM_PRICE_ID",
        "OMNYID_WORKSPACE_BASE_URL",
        "OMNYID_UI_BASE_URL"
    )) {
        if (Test-EnvVarPresent $name) {
            return $true
        }
    }
    return $false
}

function Test-BillingWorkspaceBaseUrlConfigured {
    $workspaceBase = Get-TrimmedValue (Get-EnvValue "OMNYID_WORKSPACE_BASE_URL")
    if (-not [string]::IsNullOrWhiteSpace($workspaceBase)) { return $true }
    $uiBase = Get-TrimmedValue (Get-EnvValue "OMNYID_UI_BASE_URL")
    if (-not [string]::IsNullOrWhiteSpace($uiBase)) { return $true }
    $homeserverUrl = Get-TrimmedValue (Get-EnvValue "OMNYID_HOMESERVER_URL")
    if ([string]::IsNullOrWhiteSpace($homeserverUrl)) { return $false }
    try {
        $uri = [Uri]$homeserverUrl
        return -not [string]::IsNullOrWhiteSpace($uri.Host)
    } catch {
        return $false
    }
}

function Test-AbsoluteLikePath {
    param([string]$Value)
    $trimmed = Get-TrimmedValue $Value
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return $false
    }
    return $trimmed.StartsWith("/") -or [System.IO.Path]::IsPathRooted($trimmed)
}

function Get-DelegationKeyViolation {
    param([string]$DelegationKey)
    $trimmed = Get-TrimmedValue $DelegationKey
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        return "OMNYID_DELEGATION_MASTER_KEY_HEX is not set. Configure a real 32-byte hex key."
    }
    if ($trimmed -eq ("0" * 64)) {
        return "OMNYID_DELEGATION_MASTER_KEY_HEX is set to the all-zeros placeholder. Configure a real 32-byte hex key."
    }
    if ($trimmed -notmatch '^[0-9A-Fa-f]{64}$') {
        return "OMNYID_DELEGATION_MASTER_KEY_HEX must be valid hex encoding for 32 bytes."
    }
    return $null
}

function Add-BooleanSyntaxViolationIfNeeded {
    param(
        [System.Collections.Generic.List[string]]$Violations,
        [string]$Name
    )
    $raw = Get-TrimmedValue (Get-EnvValue $Name)
    if (-not (Test-BoolLike $raw)) {
        $Violations.Add("$Name must be a boolean value (true/false/1/0/yes/no/on/off) when set")
    }
}

function Resolve-BooleanFlag {
    param(
        [string]$GlobalName,
        [string]$ScopedName,
        [bool]$DefaultValue
    )
    $globalRaw = Get-TrimmedValue (Get-EnvValue $GlobalName)
    $value = if ([string]::IsNullOrWhiteSpace($globalRaw)) {
        $DefaultValue
    } else {
        Test-Truthy $globalRaw
    }
    $scopedRaw = Get-TrimmedValue (Get-EnvValue $ScopedName)
    if (-not [string]::IsNullOrWhiteSpace($scopedRaw)) {
        $value = Test-Truthy $scopedRaw
    }
    return $value
}

if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
    Import-EnvFile $EnvFile
}

$environmentLabel = Get-StartupEnvironmentLabel
if ($environmentLabel -ne "production" -and $environmentLabel -ne "prod") {
    $displayEnvironment = if ([string]::IsNullOrWhiteSpace($environmentLabel)) {
        "unset"
    } else {
        $environmentLabel
    }
    if ($RequireProduction) {
        Write-Output "[startup-policy] production startup policy requires OMNYID_ENV=production (or equivalent)"
        Write-Output "[startup-policy] env=$displayEnvironment"
        exit 1
    }
    Write-Output "[startup-policy] production startup policy is disabled for this environment"
    Write-Output "[startup-policy] env=$displayEnvironment"
    exit 0
}

$violations = New-Object System.Collections.Generic.List[string]

if (Test-Truthy (Get-EnvValue "OMNYID_ALLOW_INSECURE_UNSIGNED")) {
    $violations.Add("OMNYID_ALLOW_INSECURE_UNSIGNED must be false in production")
}

if (Test-Truthy (Get-EnvValue "OMNYID_ALLOW_PLAINTEXT_STORAGE")) {
    $violations.Add("OMNYID_ALLOW_PLAINTEXT_STORAGE must be false in production")
}

$databaseUrlViolation = Get-SecretPresenceViolation "DATABASE_URL"
if ($null -ne $databaseUrlViolation) {
    $violations.Add($databaseUrlViolation)
}

if (Test-DevDatabaseUrl (Get-SecretEnvValue "DATABASE_URL")) {
    $violations.Add("DATABASE_URL must be set to a non-default production database")
}

$delegationViolation = Get-DelegationKeyViolation (Get-EnvValue "OMNYID_DELEGATION_MASTER_KEY_HEX")
if ($null -ne $delegationViolation) {
    $violations.Add($delegationViolation)
}

 $sessionSecretViolation = Get-SecretPresenceViolation "OMNYID_SESSION_SECRET"
if ($null -ne $sessionSecretViolation) {
    $violations.Add($sessionSecretViolation)
}

 $postgresPasswordViolation = Get-SecretPresenceViolation "POSTGRES_PASSWORD"
if ($null -ne $postgresPasswordViolation) {
    $violations.Add($postgresPasswordViolation)
}

$backupDir = Get-TrimmedValue (Get-EnvValue "OMNYID_BACKUP_DIR")
if ([string]::IsNullOrWhiteSpace($backupDir)) {
    $violations.Add("OMNYID_BACKUP_DIR must be configured in production for backup verification and restore drills")
}
elseif (-not (Test-AbsoluteLikePath $backupDir)) {
    $violations.Add("OMNYID_BACKUP_DIR must be an absolute path when configured in production")
}

foreach ($fileBackedSecret in @(
    "DATABASE_URL",
    "POSTGRES_PASSWORD",
    "OMNYID_SIGNING_KEY_HEX",
    "OMNYID_ENCRYPTION_KEY_HEX",
    "OMNYID_SESSION_SECRET",
    "OMNYID_GMAIL_CLIENT_SECRET",
    "OMNYID_GMAIL_REFRESH_TOKEN",
    "OMNYID_IMAP_PASSWORD",
    "SMTP_PASS",
    "COMPOSIO_API_KEY",
    "OMNYID_ANTHROPIC_KEY",
    "OMNYID_RUNPOD_API_KEY",
    "OMNYID_OPENAI_API_KEY"
)) {
    $fileBackedViolation = Get-SecretMustBeFileBackedViolation $fileBackedSecret
    if ($null -ne $fileBackedViolation) {
        $violations.Add($fileBackedViolation)
    }
}

if (Test-Truthy (Get-EnvValue "OMNYID_PUBLIC_OPERATIONAL_ENDPOINTS")) {
    $operationalTokenViolation = Get-SecretPresenceViolation "OMNYID_OPERATIONAL_ENDPOINT_TOKEN"
    if ($null -ne $operationalTokenViolation) {
        $violations.Add($operationalTokenViolation)
    }

    $operationalTokenFileBackedViolation = Get-SecretMustBeFileBackedViolation "OMNYID_OPERATIONAL_ENDPOINT_TOKEN"
    if ($null -ne $operationalTokenFileBackedViolation) {
        $violations.Add($operationalTokenFileBackedViolation)
    }
}

foreach ($flag in @(
    "OMNYID_ENABLE_SIMULATOR",
    "OMNYID_ENABLE_SIMULATOR_PROMOTION",
    "OMNYID_ENABLE_SIMULATOR_SAMPLING",
    "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR",
    "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_PROMOTION",
    "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_SAMPLING",
    "OMNYID_ENABLE_WATCHER_SIMULATOR",
    "OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION",
    "OMNYID_ENABLE_WATCHER_SIMULATOR_SAMPLING",
    "OMNYID_VERIFY_COMPOSIO_LIVE"
)) {
    Add-BooleanSyntaxViolationIfNeeded -Violations $violations -Name $flag
}

$synthEnabled = Resolve-BooleanFlag "OMNYID_ENABLE_SIMULATOR" "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR" $true
$synthPromotionEnabled = Resolve-BooleanFlag "OMNYID_ENABLE_SIMULATOR_PROMOTION" "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_PROMOTION" $true
$synthSamplingEnabled = Resolve-BooleanFlag "OMNYID_ENABLE_SIMULATOR_SAMPLING" "OMNYID_ENABLE_SYNTHESIZER_SIMULATOR_SAMPLING" $false
$watcherEnabled = Resolve-BooleanFlag "OMNYID_ENABLE_SIMULATOR" "OMNYID_ENABLE_WATCHER_SIMULATOR" $false
$watcherPromotionEnabled = Resolve-BooleanFlag "OMNYID_ENABLE_SIMULATOR_PROMOTION" "OMNYID_ENABLE_WATCHER_SIMULATOR_PROMOTION" $false
$watcherSamplingEnabled = Resolve-BooleanFlag "OMNYID_ENABLE_SIMULATOR_SAMPLING" "OMNYID_ENABLE_WATCHER_SIMULATOR_SAMPLING" $false

if ($synthPromotionEnabled -and -not $synthEnabled) {
    $violations.Add("Synthesizer simulator promotion cannot be enabled when the synthesizer simulator is disabled")
}

if ($synthSamplingEnabled -and -not $synthEnabled) {
    $violations.Add("Synthesizer simulator sampling cannot be enabled when the synthesizer simulator is disabled")
}

if ($watcherPromotionEnabled -and -not $watcherEnabled) {
    $violations.Add("Watcher simulator promotion cannot be enabled when the watcher simulator is disabled")
}

if ($watcherSamplingEnabled -and -not $watcherEnabled) {
    $violations.Add("Watcher simulator sampling cannot be enabled when the watcher simulator is disabled")
}

if (Test-StripeProductionConfigPresent) {
    if (-not (Test-StripeSecretKey (Get-EnvValue "OMNYID_STRIPE_SECRET_KEY"))) {
        $violations.Add("OMNYID_STRIPE_SECRET_KEY must be set to a valid Stripe secret key when self-serve billing is configured")
    }

    if (-not (Test-StripeWebhookSecret (Get-EnvValue "OMNYID_STRIPE_WEBHOOK_SECRET"))) {
        $violations.Add("OMNYID_STRIPE_WEBHOOK_SECRET must be set to a valid Stripe webhook secret when self-serve billing is configured")
    }

    $proPriceId = Get-EnvValue "OMNYID_STRIPE_PRO_PRICE_ID"
    $fallbackPriceId = Get-EnvValue "OMNYID_STRIPE_CHECKOUT_PRICE_ID"
    if (-not (Test-StripePriceId $proPriceId) -and -not (Test-StripePriceId $fallbackPriceId)) {
        $violations.Add("OMNYID_STRIPE_PRO_PRICE_ID or OMNYID_STRIPE_CHECKOUT_PRICE_ID must be set to a valid Stripe price id when self-serve billing is configured")
    }

    $teamPriceId = Get-TrimmedValue (Get-EnvValue "OMNYID_STRIPE_TEAM_PRICE_ID")
    if (-not [string]::IsNullOrWhiteSpace($teamPriceId) -and -not (Test-StripePriceId $teamPriceId)) {
        $violations.Add("OMNYID_STRIPE_TEAM_PRICE_ID must be a valid Stripe price id when set")
    }

    if (-not (Test-BillingWorkspaceBaseUrlConfigured)) {
        $violations.Add("OMNYID_WORKSPACE_BASE_URL, OMNYID_UI_BASE_URL, or a derivable OMNYID_HOMESERVER_URL must be configured when self-serve billing is enabled")
    }
}

$composioLiveVerificationViolation = Get-ComposioLiveVerificationViolation
if ($null -ne $composioLiveVerificationViolation) {
    $violations.Add($composioLiveVerificationViolation)
}

if ($violations.Count -gt 0) {
    Write-Output "[startup-policy] production env validation failed"
    foreach ($violation in $violations) {
        Write-Output "[startup-policy] - $violation"
    }
    exit 1
}

Write-Output "[startup-policy] production env validation passed"
