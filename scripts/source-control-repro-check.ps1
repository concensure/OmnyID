param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoPath {
    param([string]$Path)

    $resolvedPath = if (Test-Path -LiteralPath $Path) {
        (Resolve-Path -LiteralPath $Path).Path
    } else {
        [System.IO.Path]::GetFullPath($Path)
    }
    $rootPrefix = $RepoRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $resolvedPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "[source-control-repro-check] path is outside repo root: $Path"
    }
    $relative = $resolvedPath.Substring($rootPrefix.Length)
    return ($relative -replace '\\', '/')
}

function Get-RustChildModuleBaseDir {
    param([string]$RootPath)

    $parent = Split-Path -Parent $RootPath
    $leaf = Split-Path -Leaf $RootPath
    if ($leaf -in @("lib.rs", "main.rs", "mod.rs")) {
        return $parent
    }

    $stem = [System.IO.Path]::GetFileNameWithoutExtension($leaf)
    return (Join-Path $parent $stem)
}

function Test-GitTracked {
    param([string]$RepoPath)

    $tracked = & git -C $RepoRoot ls-files -- $RepoPath
    return -not [string]::IsNullOrWhiteSpace(($tracked | Select-Object -First 1))
}

function Get-LineCount {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return 0
    }
    return (Get-Content -LiteralPath $Path | Measure-Object -Line).Lines
}

function Resolve-ModuleCandidate {
    param(
        [string]$BaseDir,
        [string]$ModuleName,
        [string]$PathOverride,
        [string]$PathOverrideBaseDir
    )

    if (-not [string]::IsNullOrWhiteSpace($PathOverride)) {
        return @((Join-Path $PathOverrideBaseDir $PathOverride))
    }

    return @(
        (Join-Path $BaseDir "$ModuleName.rs"),
        (Join-Path (Join-Path $BaseDir $ModuleName) "mod.rs")
    )
}

function Get-RustModuleReferences {
    param([string]$RootPath)

    $baseDir = Get-RustChildModuleBaseDir -RootPath $RootPath
    $pathOverrideBaseDir = Split-Path -Parent $RootPath
    $pendingPath = ""
    foreach ($line in Get-Content -LiteralPath $RootPath) {
        if ($line -match '^\s*#\[\s*path\s*=\s*"([^"]+)"\s*\]') {
            $pendingPath = $Matches[1]
            continue
        }

        if ($line -match '^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;') {
            $moduleName = $Matches[1]
            $candidates = Resolve-ModuleCandidate -BaseDir $baseDir -ModuleName $moduleName -PathOverride $pendingPath -PathOverrideBaseDir $pathOverrideBaseDir
            $pendingPath = ""
            [pscustomobject]@{
                Root = Get-RepoPath -Path $RootPath
                Module = $moduleName
                Candidates = $candidates
            }
            continue
        }

        if ($line.Trim() -ne "" -and $line -notmatch '^\s*#') {
            $pendingPath = ""
        }
    }
}

$rootFiles = @(
    "src/lib.rs",
    "src/db.rs",
    "src/gateway/mod.rs",
    "src/server/mod.rs"
)

$missing = foreach ($rootFile in $rootFiles) {
    $absoluteRoot = Join-Path $RepoRoot $rootFile
    if (-not (Test-Path -LiteralPath $absoluteRoot -PathType Leaf)) {
        [pscustomobject]@{
            Root = $rootFile
            Module = "(root)"
            Path = $rootFile
            Exists = $false
            Lines = 0
            Problem = "root file missing"
        }
        continue
    }

    foreach ($ref in Get-RustModuleReferences -RootPath $absoluteRoot) {
        $resolved = $null
        foreach ($candidate in $ref.Candidates) {
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $resolved = $candidate
                break
            }
        }

        if ($null -eq $resolved) {
            $candidateRepoPath = Get-RepoPath -Path $ref.Candidates[0]
            [pscustomobject]@{
                Root = $ref.Root
                Module = $ref.Module
                Path = $candidateRepoPath
                Exists = $false
                Lines = 0
                Problem = "module file missing"
            }
            continue
        }

        $repoPath = Get-RepoPath -Path $resolved
        if (-not (Test-GitTracked -RepoPath $repoPath)) {
            [pscustomobject]@{
                Root = $ref.Root
                Module = $ref.Module
                Path = $repoPath
                Exists = $true
                Lines = Get-LineCount -Path $resolved
                Problem = "module file is not tracked"
            }
        }
    }
}

$missing = @($missing)
if ($missing.Count -gt 0) {
    $missing | Sort-Object Root, Path | Format-Table -AutoSize | Out-String | Write-Output
    throw "[source-control-repro-check] tracked Rust roots reference $($missing.Count) module files that are missing from git"
}

Write-Output "[source-control-repro-check] tracked Rust module graph is reproducible from git"
