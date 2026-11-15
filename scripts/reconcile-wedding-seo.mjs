import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const weddingRoot = resolve(repoRoot, 'wedding');
const docsRoot = resolve(repoRoot, 'docs');
const origin = 'https://omnyid.com';
const requestedPaths = new Set(process.argv.slice(2).map((value) => resolve(repoRoot, value)));
const markerPattern = /\s*<!-- omnyid-seo:start -->[\s\S]*?<!-- omnyid-seo:end -->\s*/gi;
const months = new Map([
  ['January', '01'], ['February', '02'], ['March', '03'], ['April', '04'],
  ['May', '05'], ['June', '06'], ['July', '07'], ['August', '08'],
  ['September', '09'], ['October', '10'], ['November', '11'], ['December', '12'],
]);

function htmlFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return entry.name === 'email' ? [] : htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll(/<[^>]+>/g, '')
    .trim();
}

function attr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function first(html, pattern, fallback = '') {
  const match = html.match(pattern);
  return match ? decodeHtml(match[1]) : fallback;
}

function pageUrl(path) {
  if (path.startsWith(`${docsRoot}${sep}`)) {
    const rel = relative(docsRoot, path).split(sep).join('/');
    return rel === 'index.html' ? `${origin}/` : `${origin}/${rel}`;
  }
  const rel = relative(weddingRoot, path).split(sep).join('/');
  if (rel === 'index.html') return `${origin}/wedding/`;
  if (rel.endsWith('/index.html')) return `${origin}/wedding/${rel.slice(0, -10)}`;
  return `${origin}/wedding/${rel}`;
}

function absoluteImage(path, source, canonical) {
  if (!source) {
    return path.startsWith(`${docsRoot}${sep}`)
      ? `${origin}/logo/omnyid-logo.png`
      : `${origin}/wedding/assets/images/vendor-reply-flow.png`;
  }
  try {
    const pageBase = canonical.endsWith('/') ? canonical : new URL('.', canonical).href;
    return new URL(source, pageBase).href;
  } catch {
    return `${origin}/wedding/assets/images/vendor-reply-flow.png`;
  }
}

function isoDate(html) {
  const match = html.match(/(?:Published|Updated)\s+(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (!match) return '';
  const monthName = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
  return `${match[3]}-${months.get(monthName)}-${match[1].padStart(2, '0')}`;
}

function removeGeneratedMeta(html) {
  return html
    .replace(markerPattern, '\n')
    // The generated graph is the single Article authority. Retaining an older
    // standalone Article block makes crawlers and validators select conflicting
    // authors or dates; keep unrelated FAQ/Breadcrumb schemas intact.
    .replace(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi, (match, json) =>
      /["']?@type["']?\s*:\s*["']Article["']/i.test(json) ? '\n' : match)
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+|article:published_time|article:author)["'][^>]*>\s*/gi, '\n');
}

function schemaGraph({ canonical, title, description, image, article, published, wedding }) {
  const organisation = {
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: 'OmnyID Pty Ltd',
    url: origin,
    logo: `${origin}/wedding/assets/logo/omnyid-logo.png`,
  };
  const application = {
    '@type': 'SoftwareApplication',
    '@id': wedding ? `${origin}/wedding/#application` : `${origin}/#application`,
    name: wedding ? 'OmnyID Wedding' : 'OmnyID',
    applicationCategory: wedding ? 'LifestyleApplication' : 'ProductivityApplication',
    operatingSystem: 'Web',
    url: wedding ? `${origin}/wedding/` : origin,
    description: wedding
      ? 'A connected wedding planning workspace for Australian couples.'
      : 'A local-first workspace that turns scattered information into reviewable decisions.',
    publisher: { '@id': `${origin}/#organization` },
  };
  const page = article
    ? {
        '@type': 'Article',
        '@id': `${canonical}#article`,
        headline: title,
        description,
        image,
        datePublished: published,
        dateModified: published,
        author: { '@type': 'Person', name: 'Casper Wu' },
        publisher: { '@id': `${origin}/#organization` },
        mainEntityOfPage: canonical,
        inLanguage: 'en-AU',
      }
    : {
        '@type': 'WebPage',
        '@id': `${canonical}#webpage`,
        name: title,
        description,
        url: canonical,
        inLanguage: 'en-AU',
        isPartOf: { '@id': wedding ? `${origin}/wedding/#application` : `${origin}/#application` },
      };
  return { '@context': 'https://schema.org', '@graph': [organisation, application, page] };
}

function rootIndexableFiles() {
  const sitemap = readFileSync(resolve(docsRoot, 'sitemap.xml'), 'utf8');
  return Array.from(sitemap.matchAll(/<loc>(https:\/\/omnyid\.com\/[^<]*)<\/loc>/g), (match) => match[1])
    .filter((url) => !url.startsWith(`${origin}/wedding/`))
    .map((url) => {
      const pathname = new URL(url).pathname;
      return pathname === '/' ? resolve(docsRoot, 'index.html') : resolve(docsRoot, pathname.slice(1));
    });
}

let updated = 0;
for (const path of [...htmlFiles(weddingRoot), ...rootIndexableFiles()]) {
  if (requestedPaths.size > 0 && !requestedPaths.has(path)) continue;
  let html = readFileSync(path, 'utf8');
  const canonical = pageUrl(path);
  const wedding = path.startsWith(`${weddingRoot}${sep}`);
  const article = wedding && relative(weddingRoot, path).split(sep)[0] === 'blog';
  const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i, wedding ? 'OmnyID Wedding' : 'OmnyID');
  const description = first(
    html,
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i,
    wedding ? 'Wedding planning guidance from OmnyID Wedding.' : 'Privacy-first decision support from OmnyID.',
  );
  const imageSource = article
    ? first(html, /<div\s+class=["']article-cover["'][^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*>/i, '')
    : first(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/i, '');
  const image = absoluteImage(path, imageSource, canonical);
  const published = article ? isoDate(html) : '';
  if (article && !published) throw new Error(`${relative(repoRoot, path)} has no visible Published or Updated date`);

  html = removeGeneratedMeta(html).replace(/<html\s+lang=["'][^"']+["']/i, '<html lang="en-AU"');
  if (article) {
    html = html.replaceAll('The OmnyID Weddings Team', 'Casper Wu, OmnyID Weddings');
    if (!html.includes('Casper Wu')) {
      html = html.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/i, '$1\n      <p class="article-byline">By Casper Wu</p>');
    }
  }
  const graph = JSON.stringify(schemaGraph({ canonical, title, description, image, article, published, wedding })).replaceAll('<', '\\u003c');
  const block = [
    '<!-- omnyid-seo:start -->',
    `<link rel="canonical" href="${attr(canonical)}">`,
    `<meta property="og:type" content="${article ? 'article' : 'website'}">`,
    '<meta property="og:locale" content="en_AU">',
    `<meta property="og:url" content="${attr(canonical)}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:image" content="${attr(image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(title)}">`,
    `<meta name="twitter:description" content="${attr(description)}">`,
    `<meta name="twitter:image" content="${attr(image)}">`,
    ...(article ? [`<meta property="article:published_time" content="${published}">`, '<meta property="article:author" content="Casper Wu">'] : []),
    `<script type="application/ld+json">${graph}</script>`,
    '<!-- omnyid-seo:end -->',
  ].join('\n');
  html = html.replace('</head>', `${block}\n</head>`);
  writeFileSync(path, html, 'utf8');
  updated += 1;
}

console.log(`Reconciled canonical, social and structured metadata for ${updated} public pages.`);
