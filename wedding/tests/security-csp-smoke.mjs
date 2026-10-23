import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const weddingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(weddingRoot, '..');
const docsRoot = resolve(projectRoot, 'docs');
const caddy = readFileSync(resolve(projectRoot, 'Caddyfile'), 'utf8');
const failures = [];
const pageScriptHashes = new Set();

function htmlFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

function inlineScripts(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(match[1])) scripts.push(match[2].replaceAll('\r\n', '\n'));
  }
  return scripts;
}

if (/script-src[^;\n"]*'unsafe-inline'/i.test(caddy)) {
  failures.push("Caddy script-src must not allow 'unsafe-inline'");
}
if (!caddy.includes('Strict-Transport-Security "max-age=15552000; includeSubDomains"')) {
  failures.push('Caddy must serve the six-month HSTS policy');
}
if (!caddy.includes('import cloudflare_only')) {
  failures.push('public sites must import the Cloudflare-origin allowlist');
}

for (const root of [weddingRoot, docsRoot]) {
  for (const path of htmlFiles(root)) {
    const html = readFileSync(path, 'utf8');
    if (html.includes('cdn.tailwindcss.com')) {
      failures.push(`${path}: Tailwind Play CDN must not run in production`);
    }
    for (const script of inlineScripts(html)) {
      const digest = createHash('sha256').update(script).digest('base64');
      pageScriptHashes.add(digest);
      if (!caddy.includes(`'sha256-${digest}'`)) {
        failures.push(`${path}: inline script sha256-${digest} is missing from the Caddy CSP hash allowlist`);
      }
    }
  }
}

for (const match of caddy.matchAll(/'sha256-([^']+)'/g)) {
  if (!pageScriptHashes.has(match[1])) {
    failures.push(`Caddy contains an obsolete inline-script hash: sha256-${match[1]}`);
  }
}

if (failures.length) {
  console.error('Security/CSP smoke test failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Security/CSP smoke test passed.');
