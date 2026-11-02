Set-StrictMode -Version Latest

$script:OracleRemoteSecretFileNames = @{
    "DATABASE_URL_FILE"              = "database_url"
    "POSTGRES_PASSWORD_FILE"         = "postgres_password"
    "OMNYID_SIGNING_KEY_HEX_FILE"    = "omnyid_signing_key_hex"
    "OMNYID_ENCRYPTION_KEY_HEX_FILE" = "omnyid_encryption_key_hex"
    "OMNYID_SESSION_SECRET_FILE"     = "omnyid_session_secret"
    "OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE" = "omnyid_operational_endpoint_token"
    "COMPOSIO_API_KEY_FILE"          = "composio_api_key"
    "OMNYID_GMAIL_CLIENT_SECRET_FILE" = "omnyid_gmail_client_secret"
    "OMNYID_GMAIL_REFRESH_TOKEN_FILE" = "omnyid_gmail_refresh_token"
    "OMNYID_IMAP_PASSWORD_FILE"       = "omnyid_imap_password"
    "SMTP_PASS_FILE"                  = "omnyid_smtp_pass"
    "OMNYID_TRANSACTIONAL_CLOUDFLARE_API_TOKEN_FILE" = "omnyid_transactional_cloudflare_api_token"
    "OMNYID_TRANSACTIONAL_RESEND_API_KEY_FILE" = "omnyid_transactional_resend_api_key"
    "OMNYID_VENDOR_MAIL_CLOUDFLARE_API_TOKEN_FILE" = "omnyid_vendor_mail_cloudflare_api_token"
    "OMNYID_VENDOR_MAIL_RESEND_API_KEY_FILE" = "omnyid_vendor_mail_resend_api_key"
    "OMNYID_VENDOR_MAIL_WORKER_SHARED_SECRET_FILE" = "omnyid_vendor_mail_worker_shared_secret"
    "OMNYID_VENDOR_MAIL_INGRESS_ENCRYPTION_KEY_FILE" = "omnyid_vendor_mail_ingress_encryption_key"
    "OMNYID_VENDOR_MAIL_RESEND_WEBHOOK_SECRET_FILE" = "omnyid_vendor_mail_resend_webhook_secret"
    "OMNYID_CEREBRAS_API_KEY_FILE"       = "omnyid_cerebras_api_key"
    "OMNYID_MISTRAL_API_KEY_FILE"        = "omnyid_mistral_api_key"
    "OMNYID_ANTHROPIC_KEY_FILE"       = "omnyid_anthropic_api_key"
    "OMNYID_NVIDIA_API_KEY_FILE"      = "omnyid_nvidia_api_key"
    "OMNYID_RUNPOD_API_KEY_FILE"      = "omnyid_runpod_api_key"
    "OMNYID_OPENAI_API_KEY_FILE"      = "omnyid_openai_api_key"
    "OPENROUTER_API_KEY_FILE"         = "openrouter_api_key"
    "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY_FILE" = "omnyid_brave_search_api_key"
    "OMNYID_BRAVE_SEARCH_API_KEY_FILE"       = "omnyid_brave_search_api_key"
    "BRAVE_SEARCH_API_KEY_FILE"              = "omnyid_brave_search_api_key"
    "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY_FILE" = "omnyid_google_places_api_key"
    "OMNYID_GOOGLE_PLACES_API_KEY_FILE"       = "omnyid_google_places_api_key"
    "GOOGLE_PLACES_API_KEY_FILE"              = "omnyid_google_places_api_key"
    "GOOGLE_MAPS_API_KEY_FILE"                = "omnyid_google_places_api_key"
    "OMNYID_ADMIN_GOOGLE_MAPS_KEY_FILE"       = "omnyid_google_maps_key"
    "OMNYID_GOOGLE_MAPS_KEY_FILE"             = "omnyid_google_maps_key"
    "OMNYID_ADMIN_WEATHERAPI_KEY_FILE"        = "omnyid_weatherapi_key"
    "OMNYID_WEATHERAPI_KEY_FILE"              = "omnyid_weatherapi_key"
    "WEATHERAPI_KEY_FILE"                     = "omnyid_weatherapi_key"
}

function Remove-OracleEnvMatchingQuotes {
    param([string]$Value)

    $trimmed = $Value.Trim()
    if ($trimmed.Length -ge 2) {
        $first = $trimmed.Substring(0, 1)
        $last = $trimmed.Substring($trimmed.Length - 1, 1)
        if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
            return $trimmed.Substring(1, $trimmed.Length - 2)
        }
    }
    return $trimmed
}

function Get-OracleRemoteSecretFileName {
    param([string]$EnvKey)

    if ($script:OracleRemoteSecretFileNames.ContainsKey($EnvKey)) {
        return $script:OracleRemoteSecretFileNames[$EnvKey]
    }
    $base = ($EnvKey -replace '_FILE$', '').ToLowerInvariant()
    $sanitized = ($base -replace '[^a-z0-9._-]', '_').Trim('_')
    if ([string]::IsNullOrWhiteSpace($sanitized)) {
        throw "[oracle-secret-sync] could not derive remote secret filename for $EnvKey"
    }
    return $sanitized
}

function Resolve-OracleSecretSourcePath {
    param(
        [string]$EnvFilePath,
        [string]$SecretPath
    )

    $trimmed = Remove-OracleEnvMatchingQuotes $SecretPath
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
        throw "[oracle-secret-sync] secret path is blank"
    }
    if ([System.IO.Path]::IsPathRooted($trimmed)) {
        return [System.IO.Path]::GetFullPath($trimmed)
    }
    $envDir = Split-Path -Parent (Resolve-Path -LiteralPath $EnvFilePath).Path
    return [System.IO.Path]::GetFullPath((Join-Path $envDir $trimmed))
}

function Get-OracleSecretSyncPlan {
    param([string]$EnvFile)

    if (-not (Test-Path -LiteralPath $EnvFile)) {
        throw "[oracle-secret-sync] env file not found: $EnvFile"
    }

    $rewrittenLines = [System.Collections.Generic.List[string]]::new()
    $secretEntries = [System.Collections.Generic.List[object]]::new()
    $remoteTargets = @{}

    foreach ($line in Get-Content -LiteralPath $EnvFile) {
        $match = [regex]::Match($line, '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$')
        if (-not $match.Success) {
            $rewrittenLines.Add($line)
            continue
        }

        $key = $match.Groups[1].Value
        $rawValue = $match.Groups[2].Value
        if (-not $key.EndsWith("_FILE")) {
            $rewrittenLines.Add($line)
            continue
        }

        $trimmedValue = Remove-OracleEnvMatchingQuotes $rawValue
        if ([string]::IsNullOrWhiteSpace($trimmedValue)) {
            $rewrittenLines.Add($line)
            continue
        }

        $sourcePath = Resolve-OracleSecretSourcePath -EnvFilePath $EnvFile -SecretPath $trimmedValue
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "[oracle-secret-sync] missing secret file for ${key}: $trimmedValue"
        }

        $content = [System.IO.File]::ReadAllText($sourcePath)
        if ([string]::IsNullOrWhiteSpace($content.Trim())) {
            throw "[oracle-secret-sync] blank secret file for ${key}: $trimmedValue"
        }

        $remoteFileName = Get-OracleRemoteSecretFileName -EnvKey $key
        $remoteHostRelativePath = ".secrets/$remoteFileName"
        $remoteContainerPath = "/run/secrets/$remoteFileName"

        if ($remoteTargets.ContainsKey($remoteHostRelativePath)) {
            $existing = $remoteTargets[$remoteHostRelativePath]
            if ($existing.SourcePath -ne $sourcePath) {
                throw "[oracle-secret-sync] remote secret path collision for $key at $remoteHostRelativePath"
            }
        }
        else {
            $entry = [pscustomobject]@{
                Key                    = $key
                SourcePath             = $sourcePath
                RemoteHostRelativePath = $remoteHostRelativePath
                RemoteContainerPath    = $remoteContainerPath
            }
            $remoteTargets[$remoteHostRelativePath] = $entry
            $secretEntries.Add($entry)
        }

        $rewrittenLines.Add("$key=$remoteContainerPath")
    }

    return [pscustomobject]@{
        EnvFilePath     = (Resolve-Path -LiteralPath $EnvFile).Path
        RewrittenLines  = $rewrittenLines
        SecretEntries   = $secretEntries
    }
}

function Write-OracleRewrittenEnvFile {
    param(
        [string]$OutputPath,
        [object]$Plan
    )

    $parent = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    # Force LF-only line endings: this file is consumed by Linux shell tools on
    # the remote host (grep/cut, docker compose --env-file), and Set-Content's
    # native CRLF corrupts values read back with `cut`/`grep` (trailing \r).
    $content = ($Plan.RewrittenLines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($OutputPath, $content)
}
