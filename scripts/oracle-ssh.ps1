param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemoteCommand
)

# Load local Oracle config (gitignored) if params were not supplied
$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User)       { $User       = $ORACLE_USER }
if (-not $KeyPath)    { $KeyPath    = $ORACLE_KEY }

$sshArgs = @(
    "-i", $KeyPath,
    "-o", "StrictHostKeyChecking=accept-new",
    "$User@$RemoteHost"
)

if ($RemoteCommand.Count -gt 0) {
    $sshArgs += ($RemoteCommand -join " ")
}

& "$env:SystemRoot\System32\OpenSSH\ssh.exe" @sshArgs
