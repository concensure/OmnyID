param(
    [string]$PythonExe = "$env:LOCALAPPDATA\Programs\Python\Python314\python.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PythonExe)) {
    throw "Python executable not found at $PythonExe"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = Join-Path $repoRoot "python-sdk"
$venvPath = Join-Path $sdkRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

& $PythonExe -m venv $venvPath
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -e $sdkRoot
& $venvPython -m compileall (Join-Path $sdkRoot "afp") (Join-Path $sdkRoot "example.py") (Join-Path $sdkRoot "example_phase2.py") (Join-Path $sdkRoot "example_discovery.py")

Write-Host "Omnyid Python SDK environment is ready at $venvPath"
