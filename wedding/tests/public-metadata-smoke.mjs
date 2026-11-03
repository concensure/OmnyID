import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const docsRoot = resolve(repoRoot, 'docs');
const weddingRoot = resolve(repoRoot, 'wedding');
const sitemap = readFileSync(resolve(docsRoot, 'sitemap.xml'), 'utf8');
const urls = Array.from(sitemap.matchAll(/<loc>(https:\/\/omnyid\.com\/[^<]*)<\/loc>/g), (match) => match[1]);
const failures = [];

function sourceFor(url) {
  const pathname = new URL(url).pathname;
  if (pathname === '/') return resolve(docsRoot, 'index.html');
  if (pathname === '/wedding/') return resolve(weddingRoot, 'index.html');
  if (pathname.startsWith('/wedding/')) {
    const relative = pathname.slice('/wedding/'.length);
    return resolve(weddingRoot, relative.endsWith('/') ? relative + 'index.html' : relative);
  }
  return resolve(docsRoot, pathname.slice(1));
}

function schemaNodes(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  const own = value['@type'] ? [value] : [];
  const graph = Array.isArray(value['@graph']) ? value['@graph'].flatMap(schemaNodes) : [];
  return [...own, ...graph];
}

function validate(url, file) {
  if (!existsSync(file)) {
    failures.push(`${url}: sitemap source is missing`);
    return;
  }
  const html = readFileSync(file, 'utf8');
  if (!/<html\s+lang=["']en-AU["']/i.test(html)) failures.push(`${url}: lang must be en-AU`);
  if (!html.includes(`<link rel="canonical" href="${url}">`)) failures.push(`${url}: canonical must self-reference`);
  for (const property of ['og:type', 'og:locale', 'og:url', 'og:title', 'og:description', 'og:image']) {
    if (!html.includes(`property="${property}"`)) failures.push(`${url}: missing ${property}`);
  }
  for (const name of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) {
    if (!html.includes(`name="${name}"`)) failures.push(`${url}: missing ${name}`);
  }

  const nodes = [];
  for (const match of html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi)) {
    try { nodes.push(...schemaNodes(JSON.parse(match[1]))); }
    catch { failures.push(`${url}: JSON-LD is invalid`); }
  }
  const types = new Set(nodes.map((node) => node['@type']));
  if (!types.has('Organization')) failures.push(`${url}: missing Organization schema`);
  if (!types.has('SoftwareApplication')) failures.push(`${url}: missing SoftwareApplication schema`);
  const article = new URL(url).pathname.startsWith('/wedding/blog/');
  if (article) {
    const articleNode = nodes.find((node) => node['@type'] === 'Article');
    if (!articleNode || articleNode.author?.name !== 'Casper Wu' || !articleNode.datePublished) {
      failures.push(`${url}: missing dated Casper Wu Article schema`);
    }
  } else if (!types.has('WebPage')) {
    failures.push(`${url}: missing WebPage schema`);
  }
}

const sitemapSet = new Set(urls);
for (const fileName of readdirSync(docsRoot).filter((name) => name.endsWith('.html'))) {
  const file = resolve(docsRoot, fileName);
  const html = readFileSync(file, 'utf8');
  if (/name=["']robots["'][^>]+noindex/i.test(html)) continue;
  const expected = fileName === 'index.html' ? 'https://omnyid.com/' : `https://omnyid.com/${fileName}`;
  if (!sitemapSet.has(expected)) failures.push(`${fileName}: indexable root page is missing from sitemap`);
}

for (const url of urls) validate(url, sourceFor(url));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Public metadata smoke passed for ${urls.length} sitemap pages.`);
