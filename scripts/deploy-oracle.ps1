param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$ProjectRoot = "C:\Users\ozans\Desktop\projects\Agenton",
    [string]$RemoteDir = "",
    [string]$EnvFile = "",
    [switch]$IncludeQuicProfile,
    [switch]$UseMinimalProfile = $true
)

$ErrorActionPreference = "Stop"

# Load local Oracle config (gitignored) if params were not supplied
$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User)       { $User       = $ORACLE_USER }
if (-not $KeyPath)    { $KeyPath    = $ORACLE_KEY }
if (-not $RemoteDir)  { $RemoteDir  = $ORACLE_DIR }

# Use a short relative temp name to avoid Windows drive-letter path issues with tar.exe
$archiveName = "omnyid-oracle-deploy.tar"
$archivePath = Join-Path $env:TEMP $archiveName

if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force
}

Push-Location $ProjectRoot
try {
    # Pipe to tar via stdout to avoid the C:\ path-as-hostname problem when tar
    # writes to an absolute Windows path that SSH misinterprets as a remote host.
    # We write the archive locally using robocopy-style file redirect instead.
    $excludeArgs = @(
        "--exclude=.git",
        "--exclude=target",
        "--exclude=node_modules",
        "--exclude=python-sdk/.venv",
        "--exclude=.env",
        "--exclude=.env.*",
        "--exclude=secrets",
        "--exclude=*.log"
    )
    # Use -cf with a relative filename inside a temp dir to sidestep the C:\ issue
    $tempDir = $env:TEMP
    Push-Location $tempDir
    try {
        & tar.exe @excludeArgs -cf $archiveName -C $ProjectRoot .
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}

& ssh.exe -i $KeyPath "$User@$RemoteHost" "mkdir -p $RemoteDir /srv/omnyid/runtimes"
& scp.exe -i $KeyPath $archivePath "${User}@${RemoteHost}:$RemoteDir/omnyid.tar"
& ssh.exe -i $KeyPath "$User@$RemoteHost" "cd $RemoteDir && tar -xf omnyid.tar && rm -f omnyid.tar"

if ($EnvFile) {
    & scp.exe -i $KeyPath $EnvFile "${User}@${RemoteHost}:$RemoteDir/.env.oracle"
}

$composeFile = if ($IncludeQuicProfile) {
    "docker-compose.oracle.quic.yml"
} elseif ($UseMinimalProfile) {
    "docker-compose.oracle.minimal.yml"
} else {
    "docker-compose.oracle.yml"
}
$composeCommand = if ($EnvFile) {
    "cd $RemoteDir && docker compose --env-file .env.oracle -f $composeFile up -d --build"
} else {
    "cd $RemoteDir && docker compose -f $composeFile config"
}

& ssh.exe -i $KeyPath "$User@$RemoteHost" $composeCommand

Write-Host "Oracle deployment sync complete."
if (-not $EnvFile) {
    Write-Host "No env file was uploaded, so only a compose config check was run remotely."
}
