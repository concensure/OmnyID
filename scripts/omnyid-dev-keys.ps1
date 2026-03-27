param(
    [ValidateSet("env", "json")]
    [string]$Format = "env"
)

function New-HexSecret {
    param([int]$ByteLength = 32)

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

$payload = [ordered]@{
    OMNYID_SIGNING_KEY_HEX       = New-HexSecret
    OMNYID_ENCRYPTION_KEY_HEX    = New-HexSecret
    OMNYID_ENCRYPT_BY_DEFAULT    = "true"
    OMNYID_REQUIRE_ENCRYPTION    = "true"
    OMNYID_ALLOW_INSECURE_UNSIGNED = "false"
}

if ($Format -eq "json") {
    $payload | ConvertTo-Json
    exit 0
}

$payload.GetEnumerator() | ForEach-Object {
    "$($_.Key)=$($_.Value)"
}
