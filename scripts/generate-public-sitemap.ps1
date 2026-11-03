param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$base = 'https://omnyid.com'
$locations = [System.Collections.Generic.List[string]]::new()
$locations.Add('/')

foreach ($name in @('privacy.html', 'data-rights.html', 'security.html', 'terms.html', 'vendors.html')) {
    if (Test-Path -LiteralPath (Join-Path $ProjectRoot "docs/$name")) { $locations.Add("/$name") }
}

$weddingRoot = Join-Path $ProjectRoot 'wedding'
Get-ChildItem -LiteralPath $weddingRoot -File -Filter '*.html' |
    Where-Object { $_.Name -notin @('newsletter-unsubscribe.html') } |
    ForEach-Object {
        $path = if ($_.Name -eq 'index.html') { '/wedding/' } else { "/wedding/$($_.Name)" }
        $locations.Add($path)
    }

Get-ChildItem -LiteralPath (Join-Path $weddingRoot 'blog') -File -Filter '*.html' |
    Sort-Object Name |
    ForEach-Object { $locations.Add("/wedding/blog/$($_.Name)") }

Get-ChildItem -LiteralPath $weddingRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'index.html') } |
    Sort-Object Name |
    ForEach-Object { $locations.Add("/wedding/$($_.Name)/") }

$body = $locations | Sort-Object -Unique | ForEach-Object {
    $escaped = [System.Security.SecurityElement]::Escape("$base$_")
    "  <url><loc>$escaped</loc></url>"
}
$xml = @('<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') + $body + @('</urlset>', '')
Set-Content -LiteralPath (Join-Path $ProjectRoot 'docs/sitemap.xml') -Value $xml -Encoding utf8NoBOM
