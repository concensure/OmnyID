param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$EditorialRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'Documents\marketing\wedding planning\posts\blog')
)

$ErrorActionPreference = 'Stop'
$blogRoot = Join-Path $RepoRoot 'wedding\blog'
$blogIndexPath = Join-Path $RepoRoot 'wedding\blog.html'
$taxonomyPath = Join-Path $RepoRoot 'wedding\blog-taxonomy.json'
$cataloguePath = Join-Path $EditorialRoot 'blog-publication-catalogue.csv'

New-Item -ItemType Directory -Force $blogRoot, $EditorialRoot | Out-Null
Get-ChildItem $EditorialRoot -Filter '*.html' -File | Copy-Item -Destination $blogRoot -Force

$taxonomy = Get-Content $taxonomyPath -Raw | ConvertFrom-Json -AsHashtable
$articleFiles = @(Get-ChildItem $blogRoot -Filter '*.html' -File | Sort-Object BaseName)
$articleSlugs = @($articleFiles | ForEach-Object BaseName)
$missingTaxonomy = @($articleSlugs | Where-Object { -not $taxonomy.ContainsKey($_) })
$missingArticles = @($taxonomy.Keys | Where-Object { $_ -notin $articleSlugs })
if ($missingTaxonomy.Count -or $missingArticles.Count) {
    throw "Blog taxonomy mismatch. Missing taxonomy: $($missingTaxonomy -join ', '); missing articles: $($missingArticles -join ', ')"
}

function Decode-Html([string]$value) {
    [System.Net.WebUtility]::HtmlDecode($value).Trim()
}

function Encode-Html([string]$value) {
    [System.Net.WebUtility]::HtmlEncode($value)
}

function First-Match([string]$content, [string]$pattern, [string]$fallback = '') {
    $matched = [regex]::Match($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($matched.Success) { return (Decode-Html $matched.Groups[1].Value) }
    $fallback
}

function Category-Key([string]$featured) {
    switch -Regex ($featured.ToLowerInvariant()) {
        'budget|ring|contract' { return 'budget' }
        'legal|admin' { return 'legal' }
        'ai' { return 'ai-trust' }
        'ceremony|reception|music' { return 'ceremony' }
        'vendor|venue' { return 'vendors' }
        'etiquette|guest|favour' { return 'etiquette' }
        default { return 'planning' }
    }
}

function Article-Metadata([System.IO.FileInfo]$file, [hashtable]$taxon) {
    $content = Get-Content $file.FullName -Raw
    $title = First-Match $content '<h1[^>]*>(.*?)</h1>' $file.BaseName
    $summary = First-Match $content '<meta\s+name="description"\s+content="([^"]*)"' 'Read this OmnyID Weddings guide.'
    $featured = First-Match $content '<span\s+class="cat">(.*?)</span>' 'Planning'
    $readTime = First-Match $content '<span>(\d+\s+min\s+read)</span>' 'Wedding guide'
    $published = First-Match $content '"datePublished"\s*:\s*"([^"]+)"' ''
    if (-not $published) { $published = First-Match $content '(?:Updated|Published)\s+([^<]+)</span>' '' }
    $image = First-Match $content '<div\s+class="article-cover"[^>]*>\s*<img\s+src="([^"]+)"' ''
    $imageAlt = First-Match $content '<div\s+class="article-cover"[^>]*>\s*<img[^>]+alt="([^"]*)"' ''
    $allTags = @($taxon.stakeholders) + @($taxon.stage) + @($taxon.locations) + @($taxon.emotions)
    [ordered]@{
        slug = $file.BaseName; title = $title; summary = $summary; featured = $featured
        category = Category-Key $featured; read_time = $readTime; published = $published
        image = $image; image_alt = $imageAlt; tags = @($allTags | Select-Object -Unique)
        stakeholders = @($taxon.stakeholders); stage = $taxon.stage
        locations = @($taxon.locations); emotions = @($taxon.emotions); content = $content
    }
}

function Taxonomy-Markup($meta) {
    $chips = @()
    foreach ($stakeholder in $meta.stakeholders) { $chips += '<span class="article-topic article-topic-stakeholder">' + (Encode-Html $stakeholder) + '</span>' }
    $chips += '<span class="article-topic article-topic-stage">Stage: ' + (Encode-Html $meta.stage) + '</span>'
    foreach ($location in $meta.locations) { $chips += '<span class="article-topic article-topic-location">' + (Encode-Html $location) + '</span>' }
    foreach ($emotion in $meta.emotions) { $chips += '<span class="article-topic article-topic-emotion">' + (Encode-Html $emotion) + '</span>' }
    @"
      <!-- omnyid-taxonomy:start -->
      <section class="article-taxonomy" aria-label="Topics in this guide">
        <p>Topics in this guide</p>
        <div>$($chips -join '')</div>
      </section>
      <!-- omnyid-taxonomy:end -->
"@
}

$catalogue = @()
$metadata = @{}
foreach ($file in $articleFiles) {
    $taxon = $taxonomy[$file.BaseName]
    $meta = Article-Metadata $file $taxon
    $content = [regex]::Replace($meta.content, '\s*<!-- omnyid-taxonomy:start -->.*?<!-- omnyid-taxonomy:end -->\s*', "`r`n", 'Singleline')
    $content = [regex]::Replace($content, '\s*<meta\s+name="wedding:search-tags"[^>]*>\s*', "`r`n", 'IgnoreCase')
    $content = $content.Replace('../../workspace/?auth=signin&amp;source=vendor_claim', '../../workspace/vendor.html?source=vendor_claim')
    $searchTags = ($meta.tags -join ', ')
    $tagMeta = '<meta name="wedding:search-tags" content="' + (Encode-Html $searchTags) + '">'
    $content = $content -replace '</head>', ($tagMeta + "`r`n</head>")
    $markup = Taxonomy-Markup $meta
    $content = [regex]::Replace($content, '(<div\s+class="article-body"[^>]*>)', ('$1' + "`r`n" + $markup), 1)
    $content = $content.TrimEnd() + "`r`n"
    Set-Content -Path $file.FullName -Value $content -Encoding utf8 -NoNewline
    $meta.content = $content
    $metadata[$file.BaseName] = $meta
    $hash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $catalogue += [pscustomobject][ordered]@{
        slug = $file.BaseName; title = $meta.title; publication_status = 'published'
        published_url = "https://omnyid.com/wedding/blog/$($file.Name)"; featured_tag = $meta.featured
        stakeholder_tags = $meta.stakeholders -join '|'; stage_tag = $meta.stage
        location_tags = $meta.locations -join '|'; emotion_tags = $meta.emotions -join '|'
        searchable_tags = $meta.tags -join '|'; content_sha256 = $hash
        last_verified = (Get-Date -Format 'yyyy-MM-dd')
    }
}

$index = Get-Content $blogIndexPath -Raw
$index = [regex]::Replace($index, '\s*<!-- omnyid-catalogue:start -->.*?<!-- omnyid-catalogue:end -->\s*', "`r`n", 'Singleline')
$existingSlugs = @([regex]::Matches($index, 'href="blog/([^"]+)\.html"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

foreach ($slug in $articleSlugs) {
    if ($slug -notin $existingSlugs) { continue }
    $meta = $metadata[$slug]
    $openingPattern = '<a\s+class="blog-card"[^>]*href="blog/' + [regex]::Escape($slug) + '\.html"[^>]*>'
    $index = [regex]::Replace($index, $openingPattern, {
        param($match)
        $opening = [regex]::Replace($match.Value, '\s+data-keywords="[^"]*"', '')
        $keywords = Encode-Html (($meta.tags + @($meta.title, $meta.summary)) -join ' ')
        $opening -replace '>', (' data-keywords="' + $keywords + '">')
    }, 1)
}

$newCards = @()
foreach ($slug in ($articleSlugs | Where-Object { $_ -notin $existingSlugs })) {
    $meta = $metadata[$slug]
    $image = $meta.image
    if ($image.StartsWith('../')) { $image = $image.Substring(3) }
    $keywords = Encode-Html (($meta.tags + @($meta.title, $meta.summary)) -join ' ')
    $publishedLabel = try {
        ([datetime]::Parse($meta.published, [Globalization.CultureInfo]::InvariantCulture)).ToString('d MMM yyyy', [Globalization.CultureInfo]::GetCultureInfo('en-AU'))
    } catch { $meta.published }
    $newCards += @"
        <a class="blog-card" data-category="$($meta.category)" data-keywords="$keywords" href="blog/$slug.html">
          <div class="thumb"><img src="$(Encode-Html $image)" alt="$(Encode-Html $meta.image_alt)" loading="lazy"><span class="cat">$(Encode-Html $meta.featured)</span></div>
          <div class="content"><span class="meta">$(Encode-Html $meta.read_time) · Updated $(Encode-Html $publishedLabel)</span><h3>$(Encode-Html $meta.title)</h3><p>$(Encode-Html $meta.summary)</p><span class="read-more">Read the guide →</span></div>
        </a>
"@
}
$generatedBlock = "`r`n        <!-- omnyid-catalogue:start -->`r`n" + ($newCards -join "`r`n") + "`r`n        <!-- omnyid-catalogue:end -->`r`n"
$index = $index -replace '(<div class="blog-grid reveal-stagger" data-blog-grid>)', ('$1' + $generatedBlock)
Set-Content -Path $blogIndexPath -Value $index -Encoding utf8 -NoNewline

node (Join-Path $RepoRoot 'scripts\reconcile-wedding-seo.mjs')

# SEO reconciliation changes the article bytes, so catalogue hashes must be
# calculated from the final publishable files rather than the pre-SEO draft.
foreach ($row in $catalogue) {
    $articlePath = Join-Path $blogRoot ($row.slug + '.html')
    $row.content_sha256 = (Get-FileHash $articlePath -Algorithm SHA256).Hash.ToLowerInvariant()
}

$catalogue | Export-Csv -Path $cataloguePath -NoTypeInformation -Encoding utf8
Get-ChildItem $blogRoot -Filter '*.html' -File | Copy-Item -Destination $EditorialRoot -Force
Write-Output "Reconciled $($articleFiles.Count) published Wedding articles and $($newCards.Count) new index cards."
Write-Output "Catalogue: $cataloguePath"
