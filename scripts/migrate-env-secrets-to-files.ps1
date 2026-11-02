param(
    [string[]]$EnvFiles = @(".env", "oracle-cloud.local.env"),
    [string]$SecretDir = ".secrets",
    # Restrict a run to named plaintext environment keys when migrating one
    # newly supplied credential without rewriting unrelated local secrets.
    [string[]]$Keys = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$mappings = @(
    @{ Key = "DATABASE_URL"; FileKey = "DATABASE_URL_FILE"; FileName = "database_url" },
    @{ Key = "POSTGRES_PASSWORD"; FileKey = "POSTGRES_PASSWORD_FILE"; FileName = "postgres_password" },
    @{ Key = "OMNYID_SIGNING_KEY_HEX"; FileKey = "OMNYID_SIGNING_KEY_HEX_FILE"; FileName = "omnyid_signing_key_hex" },
    @{ Key = "OMNYID_ENCRYPTION_KEY_HEX"; FileKey = "OMNYID_ENCRYPTION_KEY_HEX_FILE"; FileName = "omnyid_encryption_key_hex" },
    @{ Key = "OMNYID_SESSION_SECRET"; FileKey = "OMNYID_SESSION_SECRET_FILE"; FileName = "omnyid_session_secret" },
    @{ Key = "OMNYID_OPERATIONAL_ENDPOINT_TOKEN"; FileKey = "OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE"; FileName = "omnyid_operational_endpoint_token" },
    @{ Key = "COMPOSIO_API_KEY"; FileKey = "COMPOSIO_API_KEY_FILE"; FileName = "composio_api_key" },
    @{ Key = "OMNYID_GMAIL_CLIENT_SECRET"; FileKey = "OMNYID_GMAIL_CLIENT_SECRET_FILE"; FileName = "omnyid_gmail_client_secret" },
    @{ Key = "OMNYID_GMAIL_REFRESH_TOKEN"; FileKey = "OMNYID_GMAIL_REFRESH_TOKEN_FILE"; FileName = "omnyid_gmail_refresh_token" },
    @{ Key = "OMNYID_IMAP_PASSWORD"; FileKey = "OMNYID_IMAP_PASSWORD_FILE"; FileName = "omnyid_imap_password" },
    @{ Key = "SMTP_PASS"; FileKey = "SMTP_PASS_FILE"; FileName = "omnyid_smtp_pass" },
    @{ Key = "OMNYID_CEREBRAS_API_KEY"; FileKey = "OMNYID_CEREBRAS_API_KEY_FILE"; FileName = "omnyid_cerebras_api_key" },
    @{ Key = "CEREBRAS_API_KEY"; FileKey = "OMNYID_CEREBRAS_API_KEY_FILE"; FileName = "omnyid_cerebras_api_key" },
    @{ Key = "OMNYID_MISTRAL_API_KEY"; FileKey = "OMNYID_MISTRAL_API_KEY_FILE"; FileName = "omnyid_mistral_api_key" },
    @{ Key = "MISTRAL_API_KEY"; FileKey = "OMNYID_MISTRAL_API_KEY_FILE"; FileName = "omnyid_mistral_api_key" },
    @{ Key = "OMNYID_ANTHROPIC_KEY"; FileKey = "OMNYID_ANTHROPIC_KEY_FILE"; FileName = "omnyid_anthropic_api_key" },
    @{ Key = "ANTHROPIC_API_KEY"; FileKey = "OMNYID_ANTHROPIC_KEY_FILE"; FileName = "omnyid_anthropic_api_key" },
    @{ Key = "OMNYID_RUNPOD_API_KEY"; FileKey = "OMNYID_RUNPOD_API_KEY_FILE"; FileName = "omnyid_runpod_api_key" },
    @{ Key = "OMNYID_OPENAI_API_KEY"; FileKey = "OMNYID_OPENAI_API_KEY_FILE"; FileName = "omnyid_openai_api_key" },
    @{ Key = "OPENAI_API_KEY"; FileKey = "OMNYID_OPENAI_API_KEY_FILE"; FileName = "omnyid_openai_api_key" },
    @{ Key = "OPENROUTER_API_KEY"; FileKey = "OPENROUTER_API_KEY_FILE"; FileName = "openrouter_api_key" },
    @{ Key = "OMNYID_OPENROUTER_API_KEY"; FileKey = "OPENROUTER_API_KEY_FILE"; FileName = "openrouter_api_key" }
)

if ($Keys.Count -gt 0) {
    $wanted = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($key in $Keys) { [void]$wanted.Add($key) }
    $mappings = @($mappings | Where-Object { $wanted.Contains($_.Key) })
    if ($mappings.Count -eq 0) {
        throw "[migrate-env-secrets-to-files] none of the requested keys have a secret-file mapping"
    }
}

function Parse-EnvFile {
    param([string]$Path)
    $entries = [ordered]@{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -match '^\s*#' -or $line -match '^\s*$') {
            continue
        }
        if ($line -match '^\s*([^=]+?)\s*=(.*)$') {
            $entries[$matches[1].Trim()] = $matches[2]
        }
    }
    return $entries
}

function Upsert-EnvLine {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Key,
        [string]$Value
    )

    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match "^\s*$([regex]::Escape($Key))\s*=") {
            $Lines[$i] = "$Key=$Value"
            return
        }
    }

    $Lines.Add("$Key=$Value")
}

New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null

foreach ($envFile in $EnvFiles) {
    if (-not (Test-Path -LiteralPath $envFile)) {
        continue
    }

    $rawLines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in Get-Content -LiteralPath $envFile) {
        $rawLines.Add($line)
    }
    $parsed = Parse-EnvFile -Path $envFile
    $migrated = @()

    foreach ($mapping in $mappings) {
        if (-not $parsed.Contains($mapping.Key)) {
            continue
        }

        $value = [string]$parsed[$mapping.Key]
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }

        $secretPath = Join-Path $SecretDir $mapping.FileName
        Set-Content -LiteralPath $secretPath -Value $value -NoNewline
        Upsert-EnvLine -Lines $rawLines -Key $mapping.FileKey -Value $secretPath
        Upsert-EnvLine -Lines $rawLines -Key $mapping.Key -Value ""
        $migrated += $mapping.Key
    }

    if ($migrated.Count -gt 0) {
        Set-Content -LiteralPath $envFile -Value $rawLines
        Write-Output ("Updated {0}: migrated {1}" -f $envFile, ($migrated -join ", "))
    }
}
