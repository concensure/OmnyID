import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(root, '..');
const docsIndex = resolve(projectRoot, 'docs', 'index.html');
const docsApp = resolve(projectRoot, 'docs', 'app.js');
const robotsPath = resolve(projectRoot, 'docs', 'robots.txt');
const sitemapPath = resolve(projectRoot, 'docs', 'sitemap.xml');
const vendorAcquisitionPage = resolve(projectRoot, 'docs', 'vendors.html');
const vendorAcquisitionCss = resolve(projectRoot, 'docs', 'vendors.css');
const homeserverDockerfile = readFileSync(resolve(projectRoot, 'Dockerfile'), 'utf8');
const docsHtml = readFileSync(docsIndex, 'utf8');
const docsJs = readFileSync(docsApp, 'utf8');
const robots = readFileSync(robotsPath, 'utf8');
const sitemap = readFileSync(sitemapPath, 'utf8');
const vendorAcquisitionHtml = readFileSync(vendorAcquisitionPage, 'utf8');
const weddingJs = readFileSync(resolve(root, 'assets', 'js', 'main.js'), 'utf8');
const quoteDecoderJs = readFileSync(resolve(root, 'assets', 'js', 'quote-decoder.js'), 'utf8');
const quoteStudyJs = readFileSync(resolve(root, 'assets', 'js', 'quote-study.js'), 'utf8');
const quoteDecoderEngine = readFileSync(resolve(root, 'assets', 'js', 'quote-decoder-engine.js'), 'utf8');
const landingConfig = readFileSync(resolve(root, 'assets', 'js', 'landing-config.js'), 'utf8');
const landingContext = readFileSync(resolve(root, 'assets', 'js', 'landing-context.js'), 'utf8');
const privacyPreferences = readFileSync(resolve(root, 'assets', 'js', 'privacy-preferences.js'), 'utf8');
const caddyfile = readFileSync(resolve(projectRoot, 'Caddyfile'), 'utf8');
const expectedPages = [
  'blog.html',
  'disclosures.html',
  'index.html',
  'pricing.html',
  'privacy.html',
  'user-guide.html',
  'animal-quiz.html',
  'compare-wedding-venue-quotes.html',
  'wedding-cost-calculator.html',
  'wedding-planning-checklist-australia.html',
  'get-wedding-vendors-to-reply/index.html',
  'wedding-planning-relationship-stress/index.html',
  'wedding-planning-without-decision-overload/index.html',
  'blog/australian-legal-checklist.html',
  'blog/budgeting-without-losing-the-joy.html',
  'blog/the-first-five-decisions.html',
  'blog/why-ai-wedding-planners-fall-short.html',
  'blog/wedding-favours-guests-actually-keep.html',
  'blog/personalised-wedding-favour-ideas.html',
  'blog/fake-wedding-exit-is-it-worth-it.html',
  'blog/fake-wedding-exit-what-can-go-wrong.html',
  'blog/couples-barely-know-each-other.html',
  'blog/australian-wedding-trends-2027.html',
  'blog/venue-tour-questions-australian-couples.html',
  'blog/do-you-need-a-wedding-planner-australia.html',
  'blog/caterer-questions-beyond-the-menu.html',
  'blog/photographer-and-videographer-questions-australia.html',
  'blog/florist-and-dj-questions-wedding.html',
  'blog/wedding-songs-australia-ceremony-to-last-dance.html',
  'blog/how-to-make-a-wedding-newspaper.html',
  'blog/buying-a-wedding-dress-online-australia.html',
  'blog/wedding-vendor-contract-checklist-australia.html',
  'blog/open-bar-cash-bar-or-tab-australia.html',
  'blog/wedding-budget-2027-tipping-hidden-costs.html',
  'blog/wedding-website-and-childfree-invitation-wording.html',
  'blog/small-ceremony-big-reception-australia.html',
  'blog/wedding-party-without-the-stress.html',
  'blog/what-couples-forget-final-three-months.html',
];

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Transactional email templates are not public, navigable site pages.
      if (entry.name === 'email') return [];
      return htmlFiles(fullPath);
    }
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
  return /^(\.\.\/)+workspace\/(?:vendor\.html)?(\?.*)?$/.test(url.split('#')[0]);
}

function targetPath(fromFile, rawUrl) {
  const clean = rawUrl.split('#')[0].split('?')[0];
  if (!clean) return fromFile;
  if (clean.startsWith('/wedding/')) {
    return resolve(root, clean.slice('/wedding/'.length));
  }
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

// Pages that deliberately omit the site shell (no nav, sign-in modal or main.js).
const listiclePages = [
  'get-wedding-vendors-to-reply/index.html',
  'wedding-planning-relationship-stress/index.html',
  'wedding-planning-without-decision-overload/index.html',
];
const standalonePages = new Set(['newsletter-unsubscribe.html', ...listiclePages]);
const failures = [];
if (!privacyPreferences.includes('omnyid.public.privacy.v1') || !privacyPreferences.includes('data-omnyid-consent="analytics"')) {
  failures.push('privacy-preferences.js: versioned optional analytics control is missing');
}
if (!privacyPreferences.includes('globalPrivacyControl') || !privacyPreferences.includes('doNotTrack')) {
  failures.push('privacy-preferences.js: browser privacy signals are not honoured');
}
if (!caddyfile.includes('handle /wedding/wedding/compare-wedding-venue-quotes.html') || !caddyfile.includes('redir * /wedding/compare-wedding-venue-quotes.html 308')) {
  failures.push('Caddyfile: doubled quote-decoder URL must redirect to its canonical page');
}
const htmlByPath = new Map([[normalize(docsIndex), docsHtml]]);
const pages = htmlFiles(root);

for (const file of pages) {
  htmlByPath.set(normalize(file), readFileSync(file, 'utf8'));
}

function expectedCanonical(name) {
  if (name === 'index.html') return 'https://omnyid.com/wedding/';
  if (name.endsWith('/index.html')) return `https://omnyid.com/wedding/${name.slice(0, -10)}`;
  return `https://omnyid.com/wedding/${name}`;
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
  const canonical = expectedCanonical(name);
  if (!html.includes('<html lang="en-AU">')) failures.push(`${name}: language must be en-AU`);
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) failures.push(`${name}: self-referencing canonical is missing`);
  for (const requiredMeta of ['og:type', 'og:locale', 'og:url', 'og:title', 'og:description', 'og:image']) {
    if (!html.includes(`property="${requiredMeta}"`)) failures.push(`${name}: ${requiredMeta} is missing`);
  }
  const schemas = Array.from(html.matchAll(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi));
  if (!schemas.length) failures.push(`${name}: structured data is missing`);
  const schemaValues = [];
  for (const schema of schemas) {
    try { schemaValues.push(JSON.parse(schema[1])); }
    catch { failures.push(`${name}: structured data is not valid JSON`); }
  }
  const schemaText = JSON.stringify(schemaValues);
  if (!schemaText.includes('OmnyID Pty Ltd') || !schemaText.includes('SoftwareApplication')) {
    failures.push(`${name}: Organization or SoftwareApplication schema is missing`);
  }
  if (name.startsWith('blog/')) {
    if (!schemaText.includes('"Article"') || !schemaText.includes('Casper Wu') || !schemaText.includes('datePublished')) {
      failures.push(`${name}: dated Article schema with Casper Wu is missing`);
    }
    if (!html.includes('Casper Wu')) failures.push(`${name}: visible Casper Wu byline is missing`);
  }

  if (!standalonePages.has(name)) {
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
  if (!standalonePages.has(name) && !/data-open-signin/.test(html)) {
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
    const decorativeLogo = imageAttrs.alt === '' && /\blogo-img\b/.test(imageAttrs.class ?? '');
    if (imageAttrs.alt === undefined || (imageAttrs.alt.trim() === '' && !decorativeLogo)) {
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
const blogHome = htmlByPath.get(normalize(resolve(root, 'blog.html'))) ?? '';
for (const required of [
  'data-blog-search',
  'fake-wedding-exit-is-it-worth-it.html',
  'fake-wedding-exit-what-can-go-wrong.html',
]) {
  if (!blogHome.includes(required)) failures.push(`blog.html: missing ${required}`);
}
if (!weddingJs.includes('filterCards') || !weddingJs.includes('data-blog-search')) {
  failures.push('main.js: blog search is not wired to the guide cards');
}
if (!/Vendor coverage is NSW-first and expanding\s*<\/p>\s*<div class="logo-strip-items">[\s\S]*?<span>Sydney<\/span>[\s\S]*?<span>Regional NSW<\/span>[\s\S]*?<span>Australia-wide planning tools<\/span>/m.test(weddingHome)) {
  failures.push('index.html: planning strip must state truthful NSW-first coverage and Australia-wide planning tools');
}
for (const unsupported of [
  'Planning hours organized per month',
  'Hidden costs surfaced before booking',
  'Target deadline coverage once calendar sync is enabled',
  'Venue booked · caterer next',
  '$18,400 of $30,000 planned',
  'NOIM &amp; vendor timing, handled',
  'A full picture arrives at once',
  'testi-wrap',
  'images.unsplash.com',
]) {
  if (weddingHome.includes(unsupported)) {
    failures.push(`index.html: unsupported landing claim or remote asset returned: ${unsupported}`);
  }
}
for (const context of ['starting', 'vendors', 'guests', 'final']) {
  if (!weddingHome.includes(`data-context="${context}"`) || !landingConfig.includes(`${context}: {`)) {
    failures.push(`landing context is missing from markup or typed config: ${context}`);
  }
}
if (!weddingHome.includes('a good starting point for a spicy discussion') || weddingHome.includes('never a compatibility score')) {
  failures.push('index.html: animal-quiz discussion copy has not replaced the compatibility-score wording');
}
if (weddingHome.includes('Available now. The binder does not depend on planning-tip consent.')) {
  failures.push('index.html: retired binder availability sentence is still visible');
}
if (!weddingHome.includes('data-context-detail') || !landingContext.includes('detailTitle.textContent')) {
  failures.push('landing context selection does not update an adjacent visible detail panel');
}
for (const intent of ['planning', 'quotes', 'suppliers', 'guests', 'dayof']) {
  if (!landingConfig.includes(`${intent}:`)) failures.push(`landing intent is missing: ${intent}`);
}
if (!landingContext.includes('window.sessionStorage') || landingContext.includes('window.localStorage')) {
  failures.push('landing context selection must be visit-scoped in sessionStorage only');
}
if (!landingContext.includes("['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']")) {
  failures.push('landing campaign propagation must use the reviewed parameter-name allowlist');
}
const vendorDirectory = htmlByPath.get(normalize(resolve(root, 'vendors.html')));
if (!vendorDirectory || !vendorDirectory.includes('assets/js/directory.js')) {
  failures.push('vendors.html: vendor directory page or its data loader is missing');
}
if (!vendorDirectory?.includes('omnyid-server-vendors:start') || vendorDirectory?.includes('<div class="vendor-grid" id="vendorGrid" aria-live="polite"></div>')) {
  failures.push('vendors.html: crawlable server-render fallback marker is missing');
}
const photoLicence = htmlByPath.get(normalize(resolve(root, 'vendor-image-licence.html')));
if (!photoLicence || !photoLicence.includes('Vendor Image Licence Agreement')) {
  failures.push('vendor-image-licence.html: current vendor photo licence document is missing');
}
if (!photoLicence.includes('I confirm that I have read and agree to the Vendor Image Licence Agreement')) {
  failures.push('vendor-image-licence.html: required vendor photo consent wording is missing');
}

for (const file of pages) {
  const name = relative(root, file).replaceAll('\\', '/');
  if (standalonePages.has(name)) continue;
  const html = htmlByPath.get(normalize(file));
  const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
  for (const banned of ['Privacy', 'How it works', 'For vendors', 'Vendor login', 'Vendor sign in', 'Start planning']) {
    if (header.includes(banned)) failures.push(`${name}: header must not contain "${banned}"`);
  }
  if (!/<a [^>]*class="btn btn-primary"[^>]*data-signin-mode="signin">Sign in<\/a>/.test(header)) {
    failures.push(`${name}: header Sign in must use the primary button style`);
  }
  if (!/href="(?:\.\.\/)+workspace\/vendor\.html\?source=vendor_claim"[^>]*data-vendor-login>Vendor login<\/a>/.test(footer)) {
    failures.push(`${name}: footer must link Vendor login to the vendor-claim flow`);
  }
  if (!/assets\/logo\/omnyid-logo\.png/.test(header) || /class="mark"/.test(html)) {
    failures.push(`${name}: header must use the supplied OmnyID logo, not the retired heart mark`);
  }
}
for (const asset of ['omnyid-logo.png', 'omnyid-mark.png']) {
  if (!existsSync(resolve(root, 'assets', 'logo', asset))) failures.push(`assets/logo/${asset} is missing`);
}
if (/vendor entry point|For vendors/.test(weddingJs)) {
  failures.push('main.js: header vendor-login injection must stay removed');
}

const disclosures = htmlByPath.get(normalize(resolve(root, 'disclosures.html'))) ?? '';
for (const required of ['Vendor commission', 'Advertisement', 'Sponsored', 'best fit']) {
  if (!disclosures.includes(required)) failures.push(`disclosures.html: missing required disclosure wording "${required}"`);
}
for (const retired of ['Revenue is your subscription', 'No vendor commissions', 'No advertising, no sponsored placement']) {
  if (disclosures.includes(retired)) failures.push(`disclosures.html: retired claim remains: "${retired}"`);
}
const pricing = htmlByPath.get(normalize(resolve(root, 'pricing.html'))) ?? '';
if (!pricing.includes('$39 <small>AUD / one-off</small>')) failures.push('pricing.html: Couple\'s Plan must be $39 AUD / one-off');
if (pricing.includes('Full Autonomy') || pricing.includes('$69')) failures.push('pricing.html: Full Autonomy plan must be removed');
if (pricing.includes('Up to 3 saved vendor comparisons')) failures.push('pricing.html: free plan must not cap vendor comparisons');
if (!pricing.includes('Email drafting &amp; approval')) failures.push('pricing.html: free plan must include email drafting and approval');
if (pricing.includes('monthly limit')) failures.push('pricing.html: must not advertise an undefined monthly email limit');
if (pricing.includes('Most couples choose this')) failures.push('pricing.html: must not publish an unsubstantiated popularity badge');
if (/AUD \/ month<\/small><\/div>\s*<a[^>]*>Start your plan/.test(pricing)) failures.push('pricing.html: Couple\'s Plan must not be monthly');

if (!weddingHome.includes('<p>Subscribe to our newsletter</p>') || !/<button class="btn btn-primary" type="submit">Subscribe<\/button>/.test(weddingHome)) {
  failures.push('index.html: newsletter prompt and Subscribe button are required');
}
if (/waitlist/i.test(weddingHome)) failures.push('index.html: waitlist wording must be removed');
if (!weddingHome.includes('<ol class="steps process-stepper') || (weddingHome.match(/<li class="step-card">/g) || []).length !== 4) {
  failures.push('index.html: How it works must use the four-step vertical process stepper');
}
if (!weddingHome.includes('Are wedding tasks and the next-decision card the same thing?')) {
  failures.push('index.html: task-versus-decision architecture FAQ is missing');
}
const howIdx = weddingHome.indexOf('id="how-it-works"');
const changeIdx = weddingHome.indexOf('id="change-planning"');
const flowIdx = weddingHome.indexOf('id="vendor-flow"');
const previewIdx = weddingHome.indexOf('id="preview"');
if (!(howIdx > -1 && changeIdx > howIdx && flowIdx > changeIdx && previewIdx > flowIdx)) {
  failures.push('index.html: qualified change example and vendor response flow must sit between How it works and Inside your workspace');
}
if (!weddingHome.includes('Illustrative scenario, not a customer story.') || !weddingHome.includes('Renee and Kai are fictional')) failures.push('index.html: change example must be visibly identified as fictional');
if (!weddingHome.includes('data-pane="guests"') || !weddingHome.includes('Guest replies and seating stay connected')) failures.push('index.html: guest and seating capability must be visible in the public preview');
if (!existsSync(resolve(root, 'assets', 'images', 'vendor-reply-flow.png'))) failures.push('assets/images/vendor-reply-flow.png is missing');
if (!weddingJs.includes('/wedding/newsletter')) failures.push('main.js: newsletter form is not wired to the subscribe endpoint');
if (!weddingHome.includes('<html lang="en-AU">') || !weddingHome.includes('<meta property="og:locale" content="en_AU">')) failures.push('index.html: Australian language and Open Graph locale metadata are missing');
if (!weddingHome.includes('<link rel="canonical" href="https://omnyid.com/wedding/">')) failures.push('index.html: canonical Wedding URL is missing');
if (/\bAFP\b/.test(weddingHome) || weddingHome.includes('Binder email delivery is being checked')) failures.push('index.html: internal AFP or retired Binder readiness copy is public');
for (const guide of ['before-you-accept-that-wedding-quote.html', 'sydney-wedding-venue-cost-per-head.html', 'venue-tour-questions-australian-couples.html']) {
  if (!weddingHome.includes(`blog/${guide}`)) failures.push(`index.html: missing direct guide link ${guide}`);
}
if (!docsHtml.includes('id="wedding-couples"') || !docsHtml.includes('href="/wedding/"')) failures.push('docs/index.html: Wedding couple use case is missing');
const calculator = htmlByPath.get(normalize(resolve(root, 'wedding-cost-calculator.html'))) ?? '';
for (const methodCopy of ['How the budget method works', 'Target total', '100%', 'Adjustment band', 'Model version:']) {
  if (!calculator.includes(methodCopy)) failures.push(`wedding-cost-calculator.html: published method is missing "${methodCopy}"`);
}
const quoteDecoder = htmlByPath.get(normalize(resolve(root, 'compare-wedding-venue-quotes.html'))) ?? '';
for (const required of ['manual comparison stays on this device', 'Not stated', 'Compare stated terms', 'assets/js/quote-decoder-engine.js', 'assets/js/quote-decoder.js', 'Analyse quote', 'application/pdf', 'Selectable-text PDF']) {
  if (!quoteDecoder.includes(required)) failures.push(`compare-wedding-venue-quotes.html: missing ${required}`);
}
if (!quoteDecoderJs.includes('/wedding/quote-extract') || !quoteDecoderJs.includes('No new model request was made') || !quoteDecoderJs.includes('Not stated in quote') || !quoteDecoderJs.includes('pdfjs/pdf.min.mjs')) {
  failures.push('quote-decoder.js: explicit contextual extraction, local cache, three-state evidence, or local PDF reader is missing');
}
for (const asset of ['pdf.min.mjs', 'pdf.worker.min.mjs', 'LICENSE']) {
  if (!existsSync(resolve(root, 'assets', 'vendor', 'pdfjs', asset))) failures.push(`assets/vendor/pdfjs/${asset} is missing`);
}
if (!quoteDecoderEngine.includes('Estimated total') && !quoteDecoderEngine.includes('estimatedTotal')) {
  failures.push('quote-decoder-engine.js: deterministic total calculation is missing');
}
if (!caddyfile.includes('handle /wedding/quote-extract') || !caddyfile.includes('handle /wedding/quote-share')) {
  failures.push('Caddyfile: contextual quote extraction and PDF sharing routes must precede the static Wedding handler');
}
if (!quoteDecoder.includes('does not retain the proposal text') || !quoteDecoder.includes('Manual entry remains available')) {
  failures.push('compare-wedding-venue-quotes.html: model-processing disclosure or manual fallback is missing');
}
const quoteArticle = htmlByPath.get(normalize(resolve(root, 'blog/before-you-accept-that-wedding-quote.html'))) ?? '';
for (const required of ['Analyse quote', 'does not retain the proposal text', 'compare-wedding-venue-quotes.html', 'assets/js/quote-study.js']) {
  if (!quoteArticle.includes(required)) failures.push(`before-you-accept-that-wedding-quote.html: missing ${required}`);
}
if (!quoteStudyJs.includes('/wedding/quote-extract') || quoteStudyJs.includes('/wedding/quote-study/notice') || quoteStudyJs.includes('not accepting quotes yet')) {
  failures.push('quote-study.js: article analysis must reuse canonical Quote Intelligence without the disabled research-preview gate');
}
for (const context of ['starting', 'vendors', 'guests', 'final']) {
  if (!new RegExp(`${context}:[\\s\\S]*?retrieval:[\\s\\S]*?question:[\\s\\S]*?directAnswer:[\\s\\S]*?destinationPath:`).test(landingConfig)) failures.push(`landing-config.js: ${context} context lacks non-visible retrieval metadata`);
}
if (!robots.includes('User-agent: OAI-SearchBot') || !robots.includes('User-agent: GPTBot') || !robots.includes('Sitemap: https://omnyid.com/sitemap.xml')) failures.push('docs/robots.txt: search/training policy or sitemap link is missing');
for (const location of ['https://omnyid.com/wedding/', 'https://omnyid.com/wedding/blog.html', 'https://omnyid.com/wedding/pricing.html']) {
  if (!sitemap.includes(`<loc>${location}</loc>`)) failures.push(`docs/sitemap.xml: missing ${location}`);
}
if (!docsHtml.includes('Q4 2026') || !docsHtml.includes('In progress')) failures.push('docs/index.html: roadmap does not identify Q4 2026 as current');
if (!docsHtml.includes('Real Email Gateway') || !docsHtml.includes('Tester only')) failures.push('docs/index.html: Real Email Gateway is missing its tester-only boundary');
if (!docsHtml.includes('id="trial-chat-submit"') || !docsJs.includes('AbortController') || !docsJs.includes('Building preview')) {
  failures.push('docs trial runner is missing visible busy state and bounded request handling');
}

const listicleExpectations = {
  'wedding-planning-without-decision-overload/index.html': { items: 7, cta: 'Get my calm plan in 3 minutes' },
  'wedding-planning-relationship-stress/index.html': { items: 5, cta: 'Start planning together in 3 minutes' },
  'get-wedding-vendors-to-reply/index.html': { items: 6, cta: 'Get my vendor-response plan in 3 minutes' },
};
for (const [name, expected] of Object.entries(listicleExpectations)) {
  const html = htmlByPath.get(normalize(resolve(root, name))) ?? '';
  const itemCount = (html.match(/class="listicle-item"/g) ?? []).length;
  const ctaCount = (html.match(new RegExp(expected.cta, 'g')) ?? []).length;
  if (itemCount !== expected.items) failures.push(`${name}: expected ${expected.items} listicle items, found ${itemCount}`);
  if (ctaCount < 3) failures.push(`${name}: primary CTA must appear at least three times`);
  if (!html.includes(`<link rel="canonical" href="${expectedCanonical(name)}">`)) failures.push(`${name}: canonical must be self-referencing`);
  if (!html.includes('name="description"')) failures.push(`${name}: meta description is missing`);
  if (!html.includes('../assets/logo/omnyid-logo.png')) failures.push(`${name}: shared Wedding logo is missing`);
  if (!html.includes('Privacy') || !html.includes('private')) failures.push(`${name}: privacy reassurance is missing`);
}

for (const required of ['19%', '16%', '53%', '51%', '80%', 'Easy Weddings', 'Marketing Mag', 'Join the vendor pilot']) {
  if (!vendorAcquisitionHtml.includes(required)) failures.push(`docs/vendors.html: missing vendor acquisition proof or CTA "${required}"`);
}
if (!existsSync(vendorAcquisitionCss)) failures.push('docs/vendors.css: vendor acquisition stylesheet is missing');
if (!vendorAcquisitionHtml.includes('/wedding/assets/logo/omnyid-logo.png')) failures.push('docs/vendors.html: shared Wedding logo is missing');
if (/href=["']https?:\/\/(?:content\.easyweddings|www\.marketingmag)/i.test(vendorAcquisitionHtml)) failures.push('docs/vendors.html: publication source must be named without a backlink');
if (!/calculation methodology/i.test(vendorAcquisitionHtml) || !/no booking, price or promise/i.test(vendorAcquisitionHtml)) failures.push('docs/vendors.html: private pricing and approval boundaries are missing');

const quizHtml = htmlByPath.get(normalize(resolve(root, 'animal-quiz.html'))) ?? '';
const quizUi = readFileSync(resolve(root, 'assets', 'js', 'quiz.js'), 'utf8');
const quizEngine = readFileSync(resolve(root, 'assets', 'js', 'quiz-engine.js'), 'utf8');
if (!quizHtml.includes('name="referrer" content="no-referrer"')) failures.push('animal-quiz.html: strict referrer policy is missing');
if (!quizUi.includes('Create account with this result') || !quizUi.includes('Create an account without importing it')) failures.push('quiz.js: explicit import and no-import account choices are required');
if (!quizUi.includes('omnyid.wedding.animal_quiz.handoff.v1') || !(quizUi + quizEngine).includes('expires_at')) failures.push('animal quiz: bounded expiring workspace handoff is missing');
if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource/.test(quizUi + quizEngine)) failures.push('animal quiz: unexpected backend or streaming transport is present');
if (/api[_-]?key|client[_-]?secret|bearer\s+[a-z0-9._-]{12,}|password\s*[:=]/i.test(quizUi + quizEngine)) failures.push('animal quiz: secret-like material is present');
if (/encodeURIComponent\(cleanName\(|names\s*=\s*encodeURIComponent|members\.slice/.test(quizEngine)) failures.push('quiz-engine.js: names remain in public share hashes');
if (!weddingHome.includes('Illustrative example') && !htmlByPath.get(normalize(resolve(root, 'get-wedding-vendors-to-reply/index.html')))?.includes('Illustrative example')) {
  failures.push('campaign mock vendor card is not labelled as illustrative');
}
if (!homeserverDockerfile.includes('COPY wedding/vendors.html ./wedding/vendors.html')) {
  failures.push('Dockerfile: crawlable vendor directory template is missing from the homeserver build context');
}

if (failures.length) {
  console.error('Wedding website smoke test failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Wedding website smoke test passed.');
