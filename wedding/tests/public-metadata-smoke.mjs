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

function decodeEntities(value) {
  return value
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replaceAll(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function metaContent(html, attribute, key) {
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${key}["']\\s+content=(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = html.match(pattern);
  return match ? decodeEntities(match[1] ?? match[2]) : '';
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
  const weddingPage = new URL(url).pathname.startsWith('/wedding/');
  if (!/<html\s+lang=["']en-AU["']/i.test(html)) failures.push(`${url}: lang must be en-AU`);
  if (weddingPage) {
    if (!html.includes('type="text/plain" data-omnyid-consent="analytics" src="https://analytics.ahrefs.com/analytics.js"')) {
      failures.push(`${url}: consent-gated Ahrefs declaration is missing`);
    }
    if (!html.includes('src="/wedding/assets/js/privacy-preferences.js"')) {
      failures.push(`${url}: privacy preference controller is missing`);
    }
    if (/<script\s+src=["']https:\/\/analytics\.ahrefs\.com\/analytics\.js/i.test(html)) {
      failures.push(`${url}: Ahrefs must not execute before the optional analytics choice`);
    }
  }
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
  if (!types.has('WebSite')) failures.push(`${url}: missing WebSite schema`);
  if (!types.has('SoftwareApplication')) failures.push(`${url}: missing SoftwareApplication schema`);
  const article = new URL(url).pathname.startsWith('/wedding/blog/');

  const description = metaContent(html, 'name', 'description');
  if (description.length < 50) failures.push(`${url}: meta description is missing or too short to be useful`);
  const main = nodes.find((node) => node['@type'] === (article ? 'Article' : 'WebPage'));
  const socialTitle = metaContent(html, 'property', 'og:title');
  if (main && main.description !== description) failures.push(`${url}: structured description differs from the meta description`);
  if (metaContent(html, 'property', 'og:description') !== description) failures.push(`${url}: og:description differs from the meta description`);
  if (/&(?:#x?[0-9a-f]+|amp|quot|apos);/i.test(socialTitle + description)) failures.push(`${url}: social metadata shows a literal HTML entity`);
  if ((html.match(/<h1[\s>]/gi) ?? []).length !== 1) failures.push(`${url}: the served HTML must contain exactly one h1`);

  const crumbs = nodes.filter((node) => node['@type'] === 'BreadcrumbList');
  const lastCrumb = crumbs[0]?.itemListElement?.at(-1);
  if (new URL(url).pathname === '/') {
    if (crumbs.length !== 0) failures.push(`${url}: the home page must not carry a BreadcrumbList`);
  } else if (crumbs.length !== 1 || lastCrumb?.item !== url) {
    failures.push(`${url}: needs exactly one BreadcrumbList ending at the page`);
  }
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

for (const match of sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) {
  const html = existsSync(sourceFor(match[1])) ? readFileSync(sourceFor(match[1]), 'utf8') : '';
  if (metaContent(html, 'property', 'article:published_time') !== match[2]) {
    failures.push(`${match[1]}: lastmod must equal the article's own published date`);
  }
}

const robots = readFileSync(resolve(docsRoot, 'robots.txt'), 'utf8');
const robotsGroups = robots.split(/\r?\n\s*\r?\n/).map((group) => group.replace(/^#.*$/gm, '').trim()).filter(Boolean);
const groupFor = (agent) => robotsGroups.find((group) => group.split(/\r?\n/).includes(`User-agent: ${agent}`));
for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User']) {
  const group = groupFor(agent);
  if (!group?.split(/\r?\n/).includes('Allow: /')) failures.push(`robots.txt: ${agent} must be allowed`);
  // A crawler with its own group ignores the "*" group, so private paths must be repeated here.
  if (group && !group.includes('Disallow: /workspace/')) failures.push(`robots.txt: ${agent} group must keep private paths disallowed`);
}
for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot']) {
  if (!groupFor(agent)?.split(/\r?\n/).includes('Disallow: /')) failures.push(`robots.txt: ${agent} training crawler must be opted out`);
}

const llms = readFileSync(resolve(docsRoot, 'llms.txt'), 'utf8');
if (!/^# OmnyID\r?\n\r?\n> /.test(llms)) failures.push('llms.txt: must open with an H1 and a blockquote summary');
for (const link of llms.matchAll(/\]\((https:\/\/omnyid\.com\/[^)]*)\)/g)) {
  if (link[1] !== 'https://omnyid.com/sitemap.xml' && !sitemapSet.has(link[1])) failures.push(`llms.txt: ${link[1]} is not a sitemap page`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Public metadata smoke passed for ${urls.length} sitemap pages.`);
