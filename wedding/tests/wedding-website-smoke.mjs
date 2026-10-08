import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(root, '..');
const docsIndex = resolve(projectRoot, 'docs', 'index.html');
const docsApp = resolve(projectRoot, 'docs', 'app.js');
const docsHtml = readFileSync(docsIndex, 'utf8');
const docsJs = readFileSync(docsApp, 'utf8');
const weddingJs = readFileSync(resolve(root, 'assets', 'js', 'main.js'), 'utf8');
const expectedPages = [
  'blog.html',
  'index.html',
  'pricing.html',
  'privacy.html',
  'user-guide.html',
  'blog/australian-legal-checklist.html',
  'blog/budgeting-without-losing-the-joy.html',
  'blog/the-first-five-decisions.html',
  'blog/why-ai-wedding-planners-fall-short.html',
  'blog/wedding-favours-guests-actually-keep.html',
  'blog/personalised-wedding-favour-ideas.html',
];

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(fullPath);
    return entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function attrs(html, attr) {
  const pattern = new RegExp(`${attr}=["']([^"']+)["']`, 'gi');
  return Array.from(html.matchAll(pattern), (match) => match[1].replaceAll('&amp;', '&'));
}

function ids(html) {
  return new Set([
    ...Array.from(html.matchAll(/\sid=["']([^"']+)["']/gi), (match) => match[1]),
    ...Array.from(html.matchAll(/\sname=["']([^"']+)["']/gi), (match) => match[1]),
  ]);
}

function duplicateIds(html) {
  const seen = new Set();
  const duplicates = new Set();
  for (const match of html.matchAll(/\sid=["']([^"']+)["']/gi)) {
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }
  return [...duplicates];
}

function tagAttrs(attrsText) {
  return Object.fromEntries(
    Array.from(attrsText.matchAll(/([\w:-]+)(?:=["']([^"']*)["'])?/g), (match) => [
      match[1].toLowerCase(),
      match[2] ?? '',
    ]),
  );
}

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExternal(url) {
  return /^(https?:|mailto:|tel:|data:|javascript:)/i.test(url);
}

// The solid-ui SPA workspace is a runtime-only path (served from a Docker
// volume, not a file in this repo), so sign-in/register links that deep-link
// into it (e.g. ../workspace/?auth=signin&source=wedding) have no local file
// to resolve against.
function isWorkspaceAppLink(url) {
  return /^(\.\.\/)+workspace\/(\?.*)?$/.test(url.split('#')[0]);
}

function targetPath(fromFile, rawUrl) {
  const clean = rawUrl.split('#')[0].split('?')[0];
  if (!clean) return fromFile;
  try {
    return resolve(dirname(fromFile), decodeURIComponent(clean));
  } catch {
    return resolve(dirname(fromFile), clean);
  }
}

function fragment(rawUrl) {
  const hashIndex = rawUrl.indexOf('#');
  return hashIndex === -1 ? '' : rawUrl.slice(hashIndex + 1);
}

function knownVirtualFragment(target, hash) {
  return normalize(target) === normalize(docsIndex) && (hash === 'login' || hash === 'auth');
}

const failures = [];
const htmlByPath = new Map([[normalize(docsIndex), docsHtml]]);
const pages = htmlFiles(root);

for (const file of pages) {
  htmlByPath.set(normalize(file), readFileSync(file, 'utf8'));
}

const discoveredPages = new Set(pages.map((file) => relative(root, file).replaceAll('\\', '/')));
for (const expectedPage of expectedPages) {
  if (!discoveredPages.has(expectedPage)) {
    failures.push(`missing expected wedding page ${expectedPage}`);
  }
}

for (const file of pages) {
  const html = htmlByPath.get(normalize(file));
  const pageIds = ids(html);
  const name = relative(root, file).replaceAll('\\', '/');
  const dupes = duplicateIds(html);

  if (dupes.length) {
    failures.push(`${name}: duplicate id values ${dupes.join(', ')}`);
  }
  if (!/<meta\s+name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i.test(html)) {
    failures.push(`${name}: missing responsive viewport meta tag`);
  }

  if (!html.includes('id="navToggle"') || !html.includes('id="navLinks"')) {
    failures.push(`${name}: missing mobile menu toggle/nav pair`);
  }
  if (!html.includes('id="signinModal"')) {
    failures.push(`${name}: missing sign-in/register bridge modal`);
  }
  if (!/class=["']signin-panel["'][^>]*role=["']dialog["'][^>]*aria-modal=["']true["'][^>]*aria-labelledby=["']signinTitle["']/.test(html)) {
    failures.push(`${name}: sign-in modal panel is not an accessible labelled dialog`);
  }
  if (!html.includes('id="signinTitle"')) {
    failures.push(`${name}: sign-in modal title target is missing`);
  }
  if (!/class=["']signin-overlay["'][^>]*data-close-signin/.test(html)) {
    failures.push(`${name}: sign-in modal overlay is not wired to close`);
  }
  if (!html.includes('data-close-signin')) {
    failures.push(`${name}: sign-in modal has no close control`);
  }
  if (!html.includes('assets/js/main.js') && !html.includes('../assets/js/main.js')) {
    failures.push(`${name}: missing wedding interaction script`);
  }
  if (/href="#"/.test(html)) {
    failures.push(`${name}: contains dead href="#" link`);
  }
  if (/<button\b[^>]*\sdisabled(?:\s|>|=)/i.test(html)) {
    failures.push(`${name}: contains disabled button in static UI`);
  }
  if (/Sign in<\/a>/.test(html) && !/auth=signin[^"']*/.test(html)) {
    failures.push(`${name}: sign-in link does not deep-link to auth`);
  }
  if (/Start planning free/.test(html) && !/auth=register[^"']*/.test(html)) {
    failures.push(`${name}: start-planning CTA does not deep-link to registration`);
  }
  if (/Create free account/.test(html) && !/auth=register[^"']*/.test(html)) {
    failures.push(`${name}: modal register link does not deep-link to auth`);
  }
  if (/use your Agent ID/.test(html) && !/auth=agent-id[^"']*/.test(html)) {
    failures.push(`${name}: Agent ID fallback link is missing`);
  }
  if (!/data-open-signin/.test(html)) {
    failures.push(`${name}: no account CTA opens the sign-in bridge`);
  }

  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const buttonAttrs = tagAttrs(match[1]);
    if (buttonAttrs.hidden !== undefined) continue;
    if (!buttonAttrs['aria-label'] && !plainText(match[2])) {
      failures.push(`${name}: button missing accessible name`);
    }
  }

  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const imageAttrs = tagAttrs(match[1]);
    if (imageAttrs.alt === undefined || imageAttrs.alt.trim() === '') {
      failures.push(`${name}: image missing alt text`);
    }
  }

  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const anchorAttrs = tagAttrs(match[1]);
    if (anchorAttrs.target === '_blank' && !/\bnoopener\b/.test(anchorAttrs.rel ?? '')) {
      failures.push(`${name}: target=_blank link missing rel=noopener`);
    }
  }

  const tabTargets = new Set(attrs(html, 'data-tab'));
  const paneTargets = new Set(attrs(html, 'data-pane'));
  for (const tabTarget of tabTargets) {
    if (!paneTargets.has(tabTarget)) {
      failures.push(`${name}: data-tab="${tabTarget}" has no matching data-pane`);
    }
  }

  const filterTargets = new Set(attrs(html, 'data-filter').filter((target) => target !== 'all'));
  const cardCategories = new Set(attrs(html, 'data-category'));
  for (const filterTarget of filterTargets) {
    if (!cardCategories.has(filterTarget)) {
      failures.push(`${name}: data-filter="${filterTarget}" has no matching data-category`);
    }
  }

  for (const rawUrl of [...attrs(html, 'href'), ...attrs(html, 'src')]) {
    if (isExternal(rawUrl) || isWorkspaceAppLink(rawUrl)) continue;
    const hash = fragment(rawUrl);
    const resolved = targetPath(file, rawUrl);
    const display = `${name}: ${rawUrl}`;

    if (!existsSync(resolved)) {
      failures.push(`${display} points to missing local file ${relative(projectRoot, resolved)}`);
      continue;
    }
    if (statSync(resolved).isDirectory()) {
      failures.push(`${display} points to a directory, not a file`);
      continue;
    }
    if (!hash) continue;

    const targetHtml = htmlByPath.get(normalize(resolved)) ?? readFileSync(resolved, 'utf8');
    const targetIds = normalize(resolved) === normalize(file) ? pageIds : ids(targetHtml);
    if (!targetIds.has(hash) && !knownVirtualFragment(resolved, hash)) {
      failures.push(`${display} points to missing fragment #${hash}`);
    }
  }
}

if (!docsHtml.includes('id="login"') || !docsHtml.includes('id="auth-modal"')) {
  failures.push('docs/index.html: auth deep-link target or modal is missing');
}
if (!docsJs.includes('openAuthModalFromUrl')) {
  failures.push('docs/app.js: auth URL handler is missing');
}
if (!weddingJs.includes('focusableSigninEls') || !weddingJs.includes("e.key !== 'Tab'")) {
  failures.push('wedding/assets/js/main.js: sign-in bridge does not trap keyboard focus');
}
const weddingHome = htmlByPath.get(normalize(resolve(root, 'index.html')));
if (!/Built for couples planning across\s*<\/p>\s*<div class="logo-strip-items">\s*<span>Sydney<\/span>\s*<\/div>/m.test(weddingHome)) {
  failures.push('index.html: planning strip must list Sydney only');
}
if ((weddingHome.match(/Sydney planning scenario/g) ?? []).length !== 2) {
  failures.push('index.html: Byron Bay and Melbourne testimonial captions must use the Sydney planning scenario copy');
}
if (weddingHome.includes('Byron Bay planning scenario') || weddingHome.includes('Melbourne planning scenario')) {
  failures.push('index.html: retired testimonial city captions remain');
}
const vendorDirectory = htmlByPath.get(normalize(resolve(root, 'vendors.html')));
if (!vendorDirectory || !vendorDirectory.includes('assets/js/directory.js')) {
  failures.push('vendors.html: vendor directory page or its data loader is missing');
}
if (!weddingJs.includes('source=vendor_claim') || !weddingJs.includes('data-vendor-login')) {
  failures.push('main.js: Vendor Login does not route separately to the vendor-claim flow');
}

if (failures.length) {
  console.error('Wedding website smoke test failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Wedding website smoke test passed.');
